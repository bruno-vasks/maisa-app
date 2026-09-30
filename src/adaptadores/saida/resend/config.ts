/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE O CORREIO LÊ DO AMBIENTE. ⚠️ SÓ SERVIDOR — nada de `NEXT_PUBLIC_`.
 *
 * A MESMA conta da Resend que o Supabase usa como SMTP desde 22/09/2026 (ver
 * `02 Integrações/(C) Resend — e-mail transacional`). O domínio `maisasecretary.com.br` já está
 * verificado lá, com SPF e DKIM, e é isso que deixa o remetente abaixo passar.
 * ────────────────────────────────────────────────────────────────────────────── */

/** A Vercel guarda o valor cru: colar com aspas ou espaço é comum, e quebra silencioso. */
const limpa = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");

export const CHAVE = limpa(process.env.RESEND_API_KEY);

/**
 * ⚠️ O DOMÍNIO DO REMETENTE TEM DE SER O VERIFICADO NA RESEND. Outro domínio aqui é recusado
 * pela API com 403, e o aviso de vencimento deixa de sair sem que ninguém perceba até o dono
 * reclamar que a MAISA "parou do nada".
 */
export const REMETENTE =
  limpa(process.env.MAISA_EMAIL_REMETENTE) || "MAISA <nao-responda@maisasecretary.com.br>";

export const estaConfigurado = Boolean(CHAVE);

export function faltando(): string[] {
  return CHAVE ? [] : ["RESEND_API_KEY"];
}
