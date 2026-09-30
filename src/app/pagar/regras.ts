/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE A TELA `/pagar` DECIDE, SEM REACT — para dar para testar.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * O caminho de volta, só se for DESTE app.
 *
 * ⚠️ `volta` vem da query string, e query string qualquer um escreve. Aceitar
 * `https://outrosite` ou `//outrosite` faria desta página um redirecionamento aberto — com a
 * pessoa recém-cobrada, logada, e o link saindo do nosso domínio. Só caminho relativo que
 * começa com UMA barra; o resto cai no plano, dentro do app.
 */
export function voltaSegura(volta: string | null | undefined): string {
  const v = (volta ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/?tela=mais";
  return v;
}

/** Quem veio do funil volta para o onboarding; quem veio de dentro, para o plano. */
export function destinoDaVolta(volta: string): "onboarding" | "painel" {
  return volta.startsWith("/comecar") ? "onboarding" : "painel";
}

/** "21:34", no fuso de São Paulo, ou `null`. É até quando o QR Code vale. */
export function horaQueVence(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const hoje = new Date();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const mesmoDia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    === hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (mesmoDia) return `hoje, ${hora}`;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia}, ${hora}`;
}
