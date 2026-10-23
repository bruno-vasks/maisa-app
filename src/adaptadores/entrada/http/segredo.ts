/* ─────────────────────────────────────────────────────────────────────────────
 * O PORTEIRO DAS ROTAS CHAMADAS POR MÁQUINA — segredo no header, comparado em tempo constante.
 *
 * Nasceu com `/api/interno/novo-cadastro` (22/10/2026). As rotinas (`/api/rotinas/*`) e o
 * callback de recibos conferem o segredo com `===`, que para no primeiro caractere diferente:
 * em tese, medir o tempo da resposta vaza o prefixo certo. Na prática a latência da rede engole a
 * diferença, mas comparar direito custa duas linhas, e a rota nova já nasce assim. Trocar as
 * antigas por esta função é mudança à parte (elas funcionam e têm teste).
 *
 * ── COMO ──
 *
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual`. Ele exige buffers do mesmo
 * tamanho e lança quando não são — conferir o tamanho antes e devolver `false` vazaria o
 * tamanho do segredo pelo tempo. Com o hash, os dois têm sempre 32 bytes.
 *
 * O header é o mesmo das rotinas: `apikey: <segredo>` (é o que o `pg_net` manda, ver a `011`) ou
 * `Authorization: Bearer <segredo>`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHash, timingSafeEqual } from "node:crypto";

const hash = (v: string) => createHash("sha256").update(v, "utf8").digest();

/** `a === b`, sem vazar pelo tempo onde eles diferem. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(hash(a), hash(b));
}

/** O segredo que o pedido trouxe: `apikey`, ou `Authorization: Bearer …`. Vazio se nenhum. */
export function segredoDoPedido(request: Request): string {
  return (
    request.headers.get("apikey")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  ).trim();
}

/**
 * O pedido traz um dos segredos aceitos?
 *
 * ⚠️ FALHA FECHADA: lista vazia (nenhum segredo configurado no ambiente) é sempre `false`, e
 * segredo vazio no pedido também — senão um ambiente sem variável aceitaria um header vazio.
 * Confere TODOS os aceitos, sem parar no primeiro que casa, pelo mesmo motivo do tempo constante.
 */
export function segredoConfere(request: Request, aceitos: readonly string[]): boolean {
  const enviado = segredoDoPedido(request);
  const validos = aceitos.map((s) => s.trim()).filter(Boolean);
  if (!enviado || !validos.length) return false;
  let ok = false;
  for (const s of validos) ok = iguaisEmTempoConstante(enviado, s) || ok;
  return ok;
}
