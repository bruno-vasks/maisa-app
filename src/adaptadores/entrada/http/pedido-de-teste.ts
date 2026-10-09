/* ─────────────────────────────────────────────────────────────────────────────
 * O PEDIDO DE TESTE — o link que vai na mensagem do WhatsApp (09/10/2026).
 *
 * Quem largou o Pix na `/pagar` e quer testar antes manda uma mensagem pronta para a equipe, e a
 * mensagem leva um link `/liberar/<pedido>`. Quem é da equipe abre o link e libera o teste
 * daquele negócio. Ver "O TESTE NA CONVERSA" em `dominio/assinatura.ts`.
 *
 * ── ⚠️ O PEDIDO É ASSINADO, E É ISSO QUE MANTÉM A REGRA DO INQUILINO DE PÉ ──
 *
 * A regra deste repositório é que o inquilino nunca vem do request (ver `contexto.ts` e a guarda
 * em `arquitetura.test.ts`). Um `/liberar/<tenantId>` cru a quebraria: bastaria trocar o id para
 * liberar outro negócio. O pedido só nasce de `POST /api/teste/pedido`, a partir da SESSÃO de
 * quem pede, e leva um HMAC do servidor. Ninguém escreve um pedido válido para um negócio que não
 * é o seu, do mesmo jeito que ninguém escreve um carimbo válido no Pix.
 *
 * E mesmo o pedido válido não basta: o clique tem de ser de alguém da equipe (`exigirEquipe`).
 *
 * ── A CHAVE ──
 *
 * Derivada da `SUPABASE_SERVICE_ROLE_KEY` com um rótulo próprio, para não pedir uma variável a
 * mais na Vercel. O rótulo separa o uso: este HMAC não serve para nada além de pedido de teste.
 * Trocar a service role invalida os pedidos em aberto, e o custo é a pessoa pedir de novo.
 *
 * Formato: `<tenantId>.<expira em segundos, base 36>.<hmac base64url>`. Só caracteres que cabem
 * num segmento de caminho sem escape. Vai no CAMINHO e não na query porque o middleware, ao mandar
 * para o login quem não está logado, guarda só o caminho no `next`, e a query se perderia.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Trinta dias: a conversa no WhatsApp pode demorar, e o link não pode morrer antes dela. */
const VALIDADE_MS = 30 * 86_400_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chave(): Buffer | null {
  const base = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!base) return null;
  return createHmac("sha256", base).update("maisa:pedido-de-teste:v1").digest();
}

const assinar = (k: Buffer, corpo: string) => createHmac("sha256", k).update(corpo).digest("base64url");

/** O pedido deste negócio, ou `null` sem a chave no ambiente. */
export function assinarPedido(tenantId: string, agora = Date.now()): string | null {
  const k = chave();
  if (!k || !UUID.test(tenantId)) return null;
  const corpo = `${tenantId}.${Math.floor((agora + VALIDADE_MS) / 1000).toString(36)}`;
  return `${corpo}.${assinar(k, corpo)}`;
}

/** O negócio do pedido, se a assinatura confere e o prazo não passou. Qualquer outra coisa é `null`. */
export function lerPedido(pedido: string | null | undefined, agora = Date.now()): string | null {
  const k = chave();
  if (!k || !pedido) return null;

  const partes = pedido.split(".");
  if (partes.length !== 3) return null;
  const [tenantId, expira, hmac] = partes;
  if (!UUID.test(tenantId)) return null;

  const esperado = Buffer.from(assinar(k, `${tenantId}.${expira}`));
  const recebido = Buffer.from(hmac);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  const ate = parseInt(expira, 36) * 1000;
  if (!Number.isFinite(ate) || ate < agora) return null;
  return tenantId;
}
