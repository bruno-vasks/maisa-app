/* ─────────────────────────────────────────────────────────────────────────────
 * O WHATSAPP DE QUEM TEM CONTA — sem ele, ninguém entra no app (30/10/2026).
 *
 * Pedido do Bruno, no dia em que uma conta nasceu às 16:36 e ele quis falar com a pessoa na
 * hora: o cadastro direto (`/cadastro`) pedia só e-mail e senha, e o botão do Google não pede
 * nada. A conta tinha e-mail e mais nada — nenhum jeito de chamar no WhatsApp para ajudar a
 * configurar. "Tem que colocar o número para entrar na plataforma."
 *
 * ── ⚠️ NÃO É O WHATSAPP QUE A MAISA ATENDE ──
 *
 * É o contato da pessoa com a equipe da MAISA, o mesmo `telefone` que o `/assinar` grava no
 * `user_metadata` desde o começo do funil. O número que a MAISA atende é conectado pelo QR do
 * `/comecar` e mora em `integracoes_whatsapp`; os dois não se misturam.
 *
 * ── POR QUE 10 DÍGITOS, E NÃO OS 8 DE `TELEFONE_MIN_DIGITOS` ──
 *
 * Os 8 são o piso da coluna `clientes.telefone`, que guarda o número como a pessoa anota na
 * agenda. Aqui o número serve para alguém chamar, e sem DDD não se chama ninguém: 10 é DDD +
 * fixo, 11 é DDD + celular, 12 e 13 são os mesmos com o 55 na frente. Conta que veio do
 * `/assinar` com 8 ou 9 dígitos é pedida de novo, e é isso mesmo que se quer.
 *
 * Quem barra é o middleware (`saida/supabase/sessao.ts`), lendo o `user_metadata` que o
 * `getUser()` dele já busca. Quem pede é a tela `/whatsapp`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { soDigitos } from "./clientes";

export const WHATSAPP_DA_CONTA_MIN = 10;
export const WHATSAPP_DA_CONTA_MAX = 13;

/** A tela que pede o número. Fica atrás do login e fora de `PUBLIC_PREFIXES`. */
export const ROTA_DO_WHATSAPP = "/whatsapp";

/** Só os dígitos, se for um número que dá para chamar; `null` se não for. */
export function whatsappDaConta(bruto: unknown): string | null {
  if (typeof bruto !== "string" && typeof bruto !== "number") return null;
  const d = soDigitos(String(bruto));
  return d.length >= WHATSAPP_DA_CONTA_MIN && d.length <= WHATSAPP_DA_CONTA_MAX ? d : null;
}

/** O `user_metadata` da conta já tem um WhatsApp que dá para chamar? */
export function contaTemWhatsapp(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return whatsappDaConta((metadata as { telefone?: unknown }).telefone) !== null;
}
