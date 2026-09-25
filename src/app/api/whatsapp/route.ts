import { NextResponse } from "next/server";
import { agenteConfigurado, agenteWhatsapp } from "@/composicao";
import { contextoDaMensagem, normalizar, numeroPermitido, SEGREDO } from "@/adaptadores/entrada/whatsapp/contexto";

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK DO WHATSAPP — a porta por onde o cliente fala com a MAISA.
//
// GET  → verificação do webhook (a Meta exige devolver o `hub.challenge`)
// POST → mensagem recebida
//
// FINA, igual às outras: normaliza o envelope, resolve o inquilino e chama o agente.
// Nenhuma regra mora aqui. Se um `if` de comportamento aparecer nesta rota, ele está
// no lugar errado — vai para `whatsapp/agente.ts` ou para o núcleo.
//
// A diferença desta rota para as outras é que ela é PÚBLICA: não há cookie de sessão
// para barrar ninguém. Toda a proteção é o segredo compartilhado + a resolução do
// inquilino pelo número de destino (ver `whatsapp/contexto.ts`).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ⚠️ TETO DE TEMPO — medido, não estimado.
 *
 * Uma conversa real ponta a ponta deu **8,4s**: inferência do modelo + a pausa entre as
 * bolhas (que roda dentro da Evolution, via `delay`) + os envios. O teto padrão de função
 * na Vercel é 10s, e três bolhas passam disso.
 *
 * Estourar aqui não é só "deu erro": para o provedor, webhook sem 200 a tempo significa
 * REENTREGAR. E como a deduplicação por `provedor_id` ainda não existe, a reentrega roda a
 * conversa de novo — o cliente recebe a resposta duplicada e paga-se o modelo duas vezes.
 * Por isso o teto é explícito em vez de herdado.
 */
export const maxDuration = 60;

/**
 * Verificação do webhook da Cloud API. A Meta chama uma vez, com o token que você
 * cadastrou, e espera o `challenge` de volta em TEXTO PURO — devolver JSON aqui faz a
 * validação falhar com uma mensagem que não explica nada.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;

  if (q.get("hub.mode") === "subscribe" && SEGREDO && q.get("hub.verify_token") === SEGREDO) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  /* ── 1. o segredo ──
   * Falha FECHADA: sem `WHATSAPP_WEBHOOK_SECRET` no ambiente, a rota não atende. Um
   * webhook público que aceita qualquer POST deixa qualquer pessoa marcar horário na
   * agenda real do dono e gastar token da conta — e como cada chamada parece uma
   * conversa legítima, ninguém nota até a fatura.
   *
   * Aceita o segredo em dois lugares porque os provedores discordam: a Evolution manda
   * `apikey`, e um cliente de teste manda `Authorization: Bearer`. */
  if (!SEGREDO) {
    console.error("[api/whatsapp] WHATSAPP_WEBHOOK_SECRET não configurado — recusando tudo.");
    return NextResponse.json({ ok: false, erro: "webhook_nao_configurado" }, { status: 503 });
  }

  const enviado = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (enviado !== SEGREDO) {
    return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  }

  if (!agenteConfigurado()) {
    return NextResponse.json({ ok: false, erro: "falta ANTHROPIC_API_KEY" }, { status: 503 });
  }

  const corpo = await request.json().catch(() => null);

  /* ── 2. normalizar ──
   * `null` cobre o caso mais comum em produção e o mais fácil de confundir com bug:
   * o webhook recebe MUITO mais que mensagem de texto — recibo de entrega, "digitando",
   * eco da própria mensagem enviada, áudio, figurinha. Nada disso é conversa.
   *
   * 200 e não 4xx: para o provedor, resposta de erro significa "tente de novo", e ele
   * reentrega o mesmo evento em loop. Aceitar e ignorar é o contrato certo. */
  const envelope = normalizar(corpo);
  if (!envelope || !envelope.texto.trim()) {
    /* O tipo de mídia entra no log de propósito. "Ignorado" sem qualificação é o
     * relatório que esconde o problema: o cliente mandou áudio (o que mais acontece no
     * Brasil), ficou esperando, e do nosso lado não há nem sinal de que ele falou.
     * Enquanto a MAISA não trata áudio, que ao menos apareça que ela recebeu um. */
    if (envelope?.midia) {
      console.warn(`[api/whatsapp] ${envelope.midia} de ${envelope.de} sem legenda — a MAISA não responde a isso hoje.`);
      return NextResponse.json({ ok: true, ignorado: true, motivo: envelope.midia });
    }
    return NextResponse.json({ ok: true, ignorado: true });
  }

  /* ── 3. de quem é essa conversa ──
   * A partir do DESTINO da mensagem (instância ou número), nunca de um campo que quem
   * escreveu a mensagem controla. Ver `contexto.ts`. */
  const resolucao = await contextoDaMensagem(envelope);
  if (!resolucao.ok) {
    console.warn(`[api/whatsapp] mensagem descartada: ${resolucao.motivo}`);
    return NextResponse.json({ ok: true, ignorado: true, motivo: resolucao.motivo });
  }

  /* ── 4. essa pessoa está liberada? ──
   * ANTES do agente, e é por isso que este bloco não fica dentro dele: a checagem só vale
   * se acontecer antes do primeiro token. Depois da chamada ao modelo, ela economizaria
   * exatamente nada — que é o principal motivo de a lista existir em fase de teste.
   *
   * SILÊNCIO, não recusa. Responder "você não está autorizado" seria a MAISA falando com
   * um estranho, e entregaria que aquele número é um robô. Quem não está na lista fica
   * sem resposta, como se ninguém tivesse lido. */
  /* ⚠️ PASSA O INQUILINO, e é isso que impede a lista de calar cliente alheio. Até
   * 17/08/2026 esta chamada não recebia tenant e a lista valia para todo mundo: no dia em
   * que a primeira barbearia pareasse, todo cliente dela morreria neste `return` — HTTP
   * 200, nada gravado, nada respondido, e o dono vendo a tela de Conversas vazia. Ver o
   * bloco da lista em `contexto.ts`. */
  if (!numeroPermitido(envelope.de, resolucao.tenant.tenantId)) {
    console.warn(`[api/whatsapp] ${envelope.de} não está em MAISA_WHATSAPP_PERMITIDOS — ignorado sem gastar token.`);
    return NextResponse.json({ ok: true, ignorado: true, motivo: "numero_nao_liberado" });
  }

  try {
    const resposta = await agenteWhatsapp()(resolucao.tenant, { de: envelope.de, texto: envelope.texto, jid: envelope.jid });

    /* As bolhas voltam no corpo. Em produção quem entrega é o `CanalDeMensagens` (o
     * agente já chamou); aqui elas servem para conversar com a MAISA por `curl` e
     * afinar o tom sem número de WhatsApp — é o que torna essa parte iterável. */
    return NextResponse.json({ ok: true, bolhas: resposta.bolhas, escalou: resposta.escalou, motivo: resposta.motivo });
  } catch (e) {
    /* Não vaza detalhe para fora e não pede reentrega. Uma falha nossa reentregue em
     * loop pelo provedor viraria a mesma falha N vezes, cobrando token a cada volta. */
    console.error("[api/whatsapp] falha ao responder", e);
    return NextResponse.json({ ok: false, erro: "falha_interna" }, { status: 200 });
  }
}
