import Link from "next/link";
import { CONTATO } from "./Juridico";

/* ----------------------------------------------------------------------------
 * <LinhaLegal> — privacidade, termos e contato nas páginas PÚBLICAS DO APP.
 *
 * ── POR QUE NÃO O <RodapeLegal> ──
 *
 * Porque ele tira as cores de `--mk-footer-*`, tokens que existem no escopo da classe do
 * mundo montada pelo <World>. Fora dele — `/login`, `/cadastro`, `/esqueci`, `/assinar` —
 * aqueles tokens não existem, e a tira sairia sem cor nenhuma. Esta versão usa os tokens
 * do app, que valem em qualquer lugar.
 *
 * ── POR QUE ELA EXISTE (21/09/2026) ──
 *
 * Porque `/login`, `/cadastro` e `/esqueci` estavam públicos **sem um link para a política
 * de privacidade**, e ninguém tinha notado: o `juridico.test.ts` varria só `(marketing)`,
 * e essas três páginas moram em `src/app`. O buraco apareceu quando `/assinar` nasceu com
 * o mesmo defeito e o teste foi reescrito para partir de `PUBLIC_PREFIXES` em vez de uma
 * pasta — aí caíram as quatro de uma vez.
 *
 * O custo não é teórico:
 *   • o Google confere que a página pública do app linka a política antes de verificar um
 *     app que pede escopo sensível, e `calendar.events` é sensível;
 *   • o Stripe pede termos e política acessíveis no fluxo de checkout;
 *   • e `/cadastro` é onde a pessoa entrega e-mail e senha. Pedir dado pessoal sem dizer
 *     o que se faz com ele é o problema antes de ser o requisito de alguém.
 *
 * ⚠️ O CONTATO VEM DO `Juridico.tsx`, o mesmo que a política e os termos mostram, e é o único
 * e-mail do site desde 28/09/2026: endereço divergente entre a tira e a política é ruído no
 * pior momento possível, e há teste cruzando os dois.
 * -------------------------------------------------------------------------- */

export function LinhaLegal() {
  return (
    <nav
      aria-label="Informações legais"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: "var(--t-label)",
        color: "var(--muted)",
      }}
    >
      <Link href="/privacidade" className="m-focus" style={{ color: "var(--muted)" }}>
        Privacidade
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/termos" className="m-focus" style={{ color: "var(--muted)" }}>
        Termos
      </Link>
      <span aria-hidden="true">·</span>
      <a href={`mailto:${CONTATO}`} className="m-focus" style={{ color: "var(--muted)" }}>
        {CONTATO}
      </a>
    </nav>
  );
}
