import type { ReactNode } from "react";
import { ICPS, type ICP } from "./icp";
import { StickyMobileCta } from "./StickyMobileCta";
import { EntrarNoApp } from "./EntrarNoApp";
import { RodapeLegal } from "./RodapeLegal";

/* ----------------------------------------------------------------------------
 * <World> — wrapper que cada page.tsx usa em volta de TODO o conteúdo (nav +
 * main + footer). Aplica a classe do mundo (que liga os tokens OKLCH escopados)
 * e a superfície `.mkt-world` (bg + fonte de corpo). Assim, Container/Section e
 * qualquer componente interno herdam o clima certo por variáveis CSS.
 * Server Component (sem estado) — pode envolver Server e Client Components.
 *
 * Também provê, de graça em todas as páginas:
 *   • o skip-link "Pular para o conteúdo" (1º foco tabulável) → #conteudo;
 *     as páginas devem marcar seu <main id="conteudo" tabIndex={-1}>.
 *   • a barra de CTA fixa do mobile (StickyMobileCta), ao alcance do polegar.
 *   • o link "Entrar" no canto (EntrarNoApp), para quem já é cliente.
 *   • a tira legal do rodapé (RodapeLegal) — privacidade, termos e contato. Ela está
 *     aqui pelo mesmo motivo das outras duas, e por um a mais: é EXIGÊNCIA EXTERNA (o
 *     Google confere que a página pública do app linka a política antes de verificar o
 *     escopo `calendar.events`). Pendurada no <World>, uma LP nova não pode nascer sem
 *     ela — e foi exatamente assim que `/barbeiros` e `/barbeiro` passaram meses sem.
 *
 * ⚠️ O "de graça" acima é o motivo de o "Entrar" morar AQUI e não numa nav: nem a
 * <MarketingNav> nem o <Footer> são renderizados por página nenhuma de barbearia —
 * existem no `_lib` e ninguém os importa. Pendurar o link em qualquer um dos dois
 * seria escrever código que nunca roda.
 * -------------------------------------------------------------------------- */
export function World({
  icp,
  children,
  className,
}: {
  icp: ICP;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[ICPS[icp].mundoClass, "mkt-world", className].filter(Boolean).join(" ")}>
      <a href="#conteudo" className="mk-skip">
        Pular para o conteúdo
      </a>
      <EntrarNoApp />
      {children}
      <RodapeLegal />
      <StickyMobileCta icp={icp} />
    </div>
  );
}
