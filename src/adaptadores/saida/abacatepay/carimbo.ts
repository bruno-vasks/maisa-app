/* ─────────────────────────────────────────────────────────────────────────────
 * O CARIMBO — o `externalId` que viaja no checkout avulso e volta no webhook (29/09/2026).
 *
 *   maisa:<tenantId>:<plano>:<YYYY-MM-DD>[:<n>]
 *
 * ── ★ POR QUE ELE TEM DATA, E NÃO SÓ O INQUILINO ──
 *
 * Porque na AbacatePay **o `externalId` do checkout é chave de idempotência.** Medido em
 * produção em 29/09/2026: dois `POST /checkouts/create` com o mesmo `externalId` devolveram O
 * MESMO checkout (`bill_abbx2…`), e não dois. É ótimo contra clique duplo, e é uma armadilha
 * com um carimbo fixo: o checkout do mês seguinte devolveria o do mês passado, já PAGO, e a
 * pessoa cairia numa página de "pagamento concluído" sem conseguir pagar.
 *
 * Com a data, dois cliques no mesmo dia dão no mesmo Pix (bom: ninguém paga duas vezes sem
 * querer), e o mês seguinte nasce limpo. O plano entra também, para trocar de plano no mesmo
 * dia não devolver o checkout do plano anterior. O sufixo `:<n>` é para o caso raro de o
 * checkout do dia já ter sido pago ou expirado — ver `cobranca-avulsa.ts`.
 *
 * ── ⚠️ O INQUILINO VEM DAQUI, E ISSO SÓ É SEGURO POR CAUSA DA RELEITURA ──
 *
 * O webhook NÃO lê o carimbo do corpo do POST. Lê do checkout relido na API com a nossa chave
 * (`GET /checkouts/get`), que só devolve checkout da nossa loja, e que nós mesmos criamos com
 * este carimbo. Um POST forjado não tem como pôr outro inquilino ali.
 * ────────────────────────────────────────────────────────────────────────────── */

import { ehChaveDePlano, type ChaveDePlano } from "@/nucleo/dominio/assinatura";

const PREFIXO = "maisa";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function carimbo(tenantId: string, plano: ChaveDePlano, dia: string, n = 1): string {
  const base = `${PREFIXO}:${tenantId}:${plano}:${dia}`;
  return n > 1 ? `${base}:${n}` : base;
}

/**
 * O carimbo de volta. `null` para qualquer coisa que não seja um carimbo nosso — pagamento de
 * outro produto da mesma conta, link de pagamento criado no painel, checkout de assinatura.
 */
export function lerCarimbo(externalId: unknown): { tenantId: string; plano: ChaveDePlano } | null {
  if (typeof externalId !== "string") return null;
  const [prefixo, tenantId, plano] = externalId.split(":");
  if (prefixo !== PREFIXO || !UUID.test(tenantId ?? "") || !ehChaveDePlano(plano)) return null;
  return { tenantId, plano };
}
