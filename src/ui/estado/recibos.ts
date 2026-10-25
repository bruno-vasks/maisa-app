/* ─────────────────────────────────────────────────────────────────────────────
 * QUANTOS RECIBOS FALTAM EMITIR, PARA O SELO DO FISCAL NO RAIL (24/10/2026).
 *
 * O selo do Fiscal deixou de contar nota para quem emite recibo (a nota nunca existe nesse
 * caminho, e o selo lia "14" ao lado de "Nada a emitir"). Sem a nota, a terapeuta do Receita
 * Saúde com recibos a emitir ficou sem selo nenhum. Esta é a conta que o devolve.
 *
 * ⚠️ É A MESMA CONTA DO "A EMITIR" DA TELA (`EmitirRecibos`), não uma regra nova: só quem tem CPF
 * entra (a Receita recusa o beneficiário sem ele; os sem CPF são outra linha da tela), e as
 * sessões viram RECIBOS pela escolha da ficha de cada pessoa (`recibosPorMes`, `juntarEmRecibos`).
 * Contar sessões diria "5" onde o botão diz "Emitir 2". A diferença para a tela é uma só: aqui
 * ninguém desmarcou ninguém, porque marcar é uma escolha de quem está na tela e o selo conta o que
 * existe. O teste ao lado confere a igualdade com `agrupar`, para as duas não se separarem.
 *
 * Funções puras, fora do store, para ter teste: o store só lê a rota e guarda a lista.
 * ────────────────────────────────────────────────────────────────────────────── */

import { juntarEmRecibos } from "@/nucleo/dominio/recibos-do-mes";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";

/**
 * A lista de `GET /api/recibos`, ou `null` se a resposta não é uma lista de verdade.
 *
 * `null` e não `[]`: resposta que falhou nunca vira "nada a emitir" (a mesma regra de
 * `estado/leitura.ts`). Zero é uma resposta; falha é outra, e o selo só some com a primeira.
 */
export function pagamentosDaResposta(resposta: unknown): PagamentoPendente[] | null {
  const r = resposta as { ok?: boolean; pagamentos?: unknown } | null;
  if (!r || r.ok === false || !Array.isArray(r.pagamentos)) return null;
  return r.pagamentos as PagamentoPendente[];
}

/**
 * Quantos recibos saem se a pessoa clicar em "Emitir" sem desmarcar ninguém.
 *
 * `porMesDe(clienteId)` é o `recibosPorMes` da ficha (`0` quando não há ficha ou não há a 033: um
 * por sessão, como `EmitirRecibos` faz).
 */
export function recibosAEmitir(pagamentos: PagamentoPendente[], porMesDe: (clienteId: string) => number): number {
  return juntarEmRecibos(pagamentos.filter((p) => !!p.cpf), porMesDe).length;
}

/**
 * O número que o store entrega ao selo: `null` quando ele não deve aparecer.
 *
 *   · fora do caminho do recibo (nota fiscal, ou ainda não sabemos qual): o selo é das notas;
 *   · sem a lista lida (carregando, ou a leitura falhou): não há número para dizer;
 *   · sem as fichas lidas: antes de `/api/cadastro` responder, as fichas de primeira pintura não
 *     têm `recibosPorMes`, e a conta dava um recibo por sessão. É o mesmo motivo de o botão da
 *     tela ficar travado em "Lendo as fichas…" (medido: 5 no primeiro segundo, 2 depois).
 */
export function recibosParaOSelo(e: {
  noCaminhoDoRecibo: boolean;
  fichasLidas: boolean;
  pagamentos: PagamentoPendente[] | null;
  porMesDe: (clienteId: string) => number;
}): number | null {
  if (!e.noCaminhoDoRecibo || !e.fichasLidas || !e.pagamentos) return null;
  return recibosAEmitir(e.pagamentos, e.porMesDe);
}
