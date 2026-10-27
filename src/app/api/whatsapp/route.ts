import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { agenteConfigurado, agenteWhatsapp, app, marcarComoLida, ouvirAudio } from "@/composicao";
import { hojeISO } from "@/nucleo/dominio/tempo";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { contextoDaMensagem, normalizar, numeroPermitido, SEGREDO } from "@/adaptadores/entrada/whatsapp/contexto";
import { ESPERA_DA_RAJADA_MS } from "@/adaptadores/entrada/whatsapp/agente";

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
 * ⚠️ TETO DE TEMPO. O turno inteiro cabe nele: a espera da rajada (4 s), o modelo (até
 * `ORCAMENTO_DO_TURNO_MS`, 50 s, em `whatsapp/agente.ts`) e o "digitando…" de cada bolha (até
 * 18 s por resposta desde 27/10/2026). Uns 75 s no pior caso comum; 120 dá folga para a
 * chamada ao modelo que começa no fim do orçamento. Acima de 60 s só vale com Fluid compute
 * (padrão em projeto novo desde 23/04/2025, e ligado também no `vercel.json`, `"fluid": true`):
 * sem ele o Hobby para em 60 s e o deploy recusa este número.
 *
 * A Evolution NÃO espera esse tempo todo, e é por isso que o turno roda depois da resposta
 * (ver o fim do POST). Conferido no código da 2.3.7: o webhook dela desiste em 30 s e
 * REENTREGA o mesmo evento até 10 vezes. Antes de 27/10/2026 cada reentrega rodava a
 * conversa de novo: resposta em dobro para o cliente e o modelo pago duas vezes. Com o
 * "digitando…", quase todo turno passaria de 30 s. Hoje são duas travas: o 200 na hora, e a
 * mensagem gravada uma vez só por id (`provedorId`, passo 1b de `agente.ts`), para a
 * reentrega que vier por outro motivo.
 */
export const maxDuration = 120;

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
  /* Áudio sem texto SEGUE: vai para o agente, que decide se transcreve (ver `ouvir` abaixo). */
  const ehAudio = envelope?.midia === "audio" && !envelope.texto.trim();
  if (!envelope || (!envelope.texto.trim() && !ehAudio)) {
    /* O tipo de mídia entra no log de propósito. "Ignorado" sem qualificação é o
     * relatório que esconde o problema: o cliente mandou uma figurinha ou uma foto sem
     * legenda, ficou esperando, e do nosso lado não há nem sinal de que ele escreveu. */
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

  /* ── 5. o negócio está em dia? (29/09/2026) ──
   * ★ É AQUI QUE O PRÉ-PAGO CORTA. Venceu o mês pago (ou o teste), a MAISA para de responder
   * os clientes daquele negócio até o próximo Pix entrar — e volta sozinha quando entra,
   * porque a pergunta é refeita a cada mensagem. Antes do agente pelo mesmo motivo da lista
   * acima: depois do primeiro token, a checagem não economiza nada.
   *
   * SILÊNCIO, como a lista, e pelo mesmo motivo: a MAISA dizer "meu dono não pagou" para o
   * cliente dele seria a pior mensagem possível. O dono recebe o aviso por e-mail, e o cliente
   * vê o WhatsApp como se o dono ainda não tivesse lido — que, sem a MAISA, é a verdade. */
  if (!(await emDia(resolucao.tenant))) {
    console.warn(`[api/whatsapp] ${resolucao.tenant.tenantId}: assinatura vencida — a MAISA não responde.`);
    return NextResponse.json({ ok: true, ignorado: true, motivo: "assinatura_vencida" });
  }

  /* A espera da rajada é coisa do canal: no WhatsApp a pessoa manda três mensagens
   * seguidas, e cada uma chega aqui num webhook próprio. Ver `ESPERA_DA_RAJADA_MS`.
   *
   * O áudio vai como `ouvir`, e não transcrito aqui: o agente só transcreve depois de
   * saber que atende essa pessoa (passo 1a de `agente.ts`). A transcrição entra na
   * conversa marcada "[áudio]"; ver `ouvirAudio`, que nunca lança. O tique azul vai do
   * mesmo jeito, como função que o agente chama só se for atender (passo 1g).
   *
   * O `catch` não vaza detalhe e não pede reentrega: uma falha nossa reentregue em loop
   * pelo provedor viraria a mesma falha N vezes, cobrando token a cada volta. */
  const turno = agenteWhatsapp()(
    resolucao.tenant,
    {
      de: envelope.de,
      texto: envelope.texto,
      jid: envelope.jid,
      enviadaEm: envelope.enviadaEm,
      provedorId: envelope.conversaId,
      marcarComoLida: () => marcarComoLida(envelope),
      ...(ehAudio ? { ouvir: () => ouvirAudio(envelope) } : {}),
    },
    { esperaDaRajadaMs: ESPERA_DA_RAJADA_MS },
  ).catch((e) => {
    console.error("[api/whatsapp] falha ao responder", e);
    return null;
  });

  /* O formato de teste espera: as bolhas voltam no corpo, para conversar com a MAISA por
   * `curl` e afinar o tom sem número de WhatsApp. Em produção quem entrega é o
   * `CanalDeMensagens` (o agente já chamou). */
  if (envelope.origem === "teste") {
    const resposta = await turno;
    return resposta
      ? NextResponse.json({ ok: true, bolhas: resposta.bolhas, escalou: resposta.escalou, motivo: resposta.motivo })
      : NextResponse.json({ ok: false, erro: "falha_interna" }, { status: 200 });
  }

  /* O provedor recebe o 200 AGORA e o turno segue depois da resposta, no mesmo
   * `maxDuration`. Ver o ⚠️ do `maxDuration`: esperar aqui era a Evolution desistir em 30 s
   * e reentregar a mesma mensagem. Fora da Vercel, `waitUntil` não faz nada e o processo
   * segue rodando o turno do mesmo jeito. */
  waitUntil(turno);
  return NextResponse.json({ ok: true, recebido: true });
}

/**
 * O negócio pode usar a MAISA hoje?
 *
 * ⚠️ FALHA ABERTA, e é o contrário do resto desta rota de propósito. Se a leitura da
 * assinatura falhar (banco fora, service role faltando), a MAISA RESPONDE. Calar o cliente de
 * quem pagou por um defeito nosso custa o cliente; responder um dia a mais para quem venceu
 * custa um dia de MAISA. O erro vai para o log, que é onde se descobre o defeito.
 */
async function emDia(t: ContextoTenant): Promise<boolean> {
  try {
    return (await app.acessoDoNegocio(t, hojeISO())).liberado;
  } catch (e) {
    console.error(`[api/whatsapp] não consegui ler a assinatura de ${t.tenantId} — respondendo mesmo assim`, e);
    return true;
  }
}
