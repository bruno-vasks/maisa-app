import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

// ─────────────────────────────────────────────────────────────────────────────
// O LOTE DO RECEITA SAÚDE — o arquivo que a profissional importa no e-CAC.
//
// POST /api/recibos/lote           → gera o CSV e prende as sessões
// PATCH /api/recibos/lote          → { loteId, situacao: "importado" | "descartado", avisar? }
//
// `avisar: true` no PATCH de `importado` manda a NOTÍCIA do recibo para cada paciente no
// WhatsApp — nunca o documento, que a Receita não devolve em lote. Ver `avisoDeRecibo`.
//
// ── ★ ESTA ROTA NÃO EMITE NADA, E O NOME DIZ ISSO DE PROPÓSITO ──
//
// Não é `/api/recibos/emitir`. Quem atende como pessoa física emite o Recibo Eletrônico de
// Serviços de Saúde dentro do e-CAC, com o gov.br dela — não existe API. O que sai daqui é um
// CSV para ela importar no Carnê-Leão e assinar. Chamar a rota de "emitir" faria a tela
// prometer, em um verbo, o que o produto não faz.
//
// ⚠️ `exigirSessao`, como o `/api/faturamento` e diferente dos `/api/nf/*`. O corpo da
// resposta é uma lista de CPFs de pacientes e valores de sessão de psicoterapia — o dado mais
// sensível que este app produz. Inquilino de demonstração não responde isso.
//
// ── ⚠️ O CSV VAI NO JSON, E NÃO COMO `text/csv` ──
//
// Porque a tela precisa mostrar os AVISOS junto (quem ficou de fora e por quê) antes de o dono
// baixar. Um download direto entregaria o arquivo e engoliria a única informação que evita ele
// assinar achando que fechou o mês. Quem monta o `.csv` é o navegador, com o nome que vem em
// `arquivo`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Fechar o mês com "avisar pacientes" põe os avisos na fila de envios, e a fila começa a sair
 * logo depois desta resposta, em segundo plano (ver o fim do PATCH). 300 s é o teto do Hobby
 * com Fluid compute (`vercel.json`); a drenagem para aos 240 s e o resto sai pela rotina. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    /* Corpo opcional: sem `ate`, o caso de uso usa hoje. Body vazio não é erro — o clique
     * normal é "gerar o do mês", sem parâmetro nenhum. */
    const corpo = await req.json().catch(() => ({}));
    const lote = await app.gerarLoteDeRecibos(porteiro.tenant, { ate: corpo?.ate });
    return NextResponse.json({ ok: true, status: "ok", ...lote });
  } catch (e) {
    return falha("recibos/lote", e);
  }
}

/**
 * Os avisos foram para a fila de envios: começam a sair agora, depois da resposta, um de cada
 * vez. A tela não espera (`naFila` diz a ela que estão saindo).
 *
 * ⚠️ NUNCA LANÇA. O lote já está fechado quando isto roda; um erro aqui faria a tela dizer que
 * o fechamento falhou, e o clique de novo não avisaria ninguém (`confirmarLote` já virou).
 */
function drenarDepois(t: ContextoTenant): void {
  try {
    waitUntil(app.drenarFilaDoNegocio(t).catch((e) => console.error("[recibos/lote] drenar a fila", e)));
  } catch (e) {
    console.error("[recibos/lote] drenar a fila", e);
  }
}

export async function PATCH(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const corpo = await req.json().catch(() => ({}));
    /* Só dois valores, e o default é o INOFENSIVO. `descartado` solta as sessões de volta;
     * `importado` as mantém presas. Um corpo torto caindo em "descartado" faria o mês
     * seguinte gerar recibo em dobro para sessões já assinadas no e-CAC. */
    const situacao = corpo?.situacao === "descartado" ? "descartado" : "importado";
    /* ⚠️ `=== true` E NÃO `Boolean(...)`. O disparo é para o WhatsApp de pacientes, pelo número
     * pessoal de quem usa a MAISA: `"false"`, `1` ou um campo que chegou torto NÃO podem virar
     * trinta mensagens. Só o booleano verdadeiro conta, e a ausência é silêncio. */
    const avisar = corpo?.avisar === true;
    const r = await app.fecharLoteDeRecibos(porteiro.tenant, {
      loteId: String(corpo?.loteId ?? ""),
      situacao,
      avisar,
    });
    if (r.naFila) drenarDepois(porteiro.tenant);
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("recibos/lote", e);
  }
}
