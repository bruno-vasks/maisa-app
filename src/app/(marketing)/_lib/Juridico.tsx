/* ─────────────────────────────────────────────────────────────────────────────
 * A CASCA DAS PÁGINAS JURÍDICAS — política de privacidade e termos.
 *
 * ── POR QUE ELAS EXISTEM, E POR QUE AGORA ──
 *
 * Porque o Google as EXIGE para verificar um app que pede escopo sensível, e
 * `calendar.events` é sensível. Sem verificação, a tela de consentimento mostra o aviso de
 * "app não verificado" e trava em 100 usuários — o que na prática significa que nenhum
 * cliente da MAISA consegue ligar a agenda dele. Até 25/09/2026 isso travava dois dos seis
 * passos do onboarding (`agenda_conectada` e `primeira_conversa`); desde o 1B.15 a agenda do
 * Google saiu dos passos (a MAISA marca sem ela, ADR-0009) e virou oferta, mas quem quer ligar
 * continua esbarrando no mesmo aviso.
 *
 * ⚠️ O REVISOR ABRE A URL. Até 17/08/2026 a única menção a "privacidade" no material
 * público era um `<span>` morto no rodapé da LP — texto sem link. Política que não abre é
 * reprovação imediata, e a fila do Google leva semanas: errar aqui custa um ciclo inteiro.
 *
 * ── POR QUE SÃO PÁGINAS DO APP, E NÃO UM PDF OU NOTION ──
 *
 * Porque o Google confere que a política mora no MESMO DOMÍNIO do app e da redirect_uri.
 * Um link para fora é o segundo motivo mais comum de reprovação depois de escopo demais.
 *
 * ⚠️ Estas rotas precisam estar em `PUBLIC_PREFIXES` (`saida/supabase/sessao.ts`). A
 * checagem é por SEGMENTO — `/privacidade` não herda de nada. Esquecer põe a página atrás
 * do login, e o revisor do Google vê um formulário de senha onde deveria estar a política.
 * Há teste.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import Link from "next/link";

/** Uma data só, usada nas duas páginas e no rodapé. Google confere se está datada. */
export const VIGENCIA = "17 de agosto de 2026";

/** Onde o titular fala com a gente. Google exige canal de contato na política. */
export const CONTATO = "bruno.vaskevicius@polijunior.com.br";

export function PaginaJuridica(
  { titulo, resumo, children }: { titulo: string; resumo: string; children: ReactNode },
) {
  return (
    <main className="lp-juridico">
      <div className="lp-juridico-topo">
        <Link href="/" className="lp-juridico-marca">maisa</Link>
        <nav className="lp-juridico-nav">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </div>

      <header className="lp-juridico-cabecalho">
        <h1>{titulo}</h1>
        {/* Resumo em linguagem de gente ANTES do texto formal. Não é enfeite: quem lê isto
            é um dono de barbearia decidindo se entrega a agenda dele, e um documento que
            só fala com advogado não informa ninguém. */}
        <p className="lp-juridico-resumo">{resumo}</p>
        <p className="lp-juridico-data">Em vigor desde {VIGENCIA}</p>
      </header>

      <article className="lp-juridico-corpo">{children}</article>

      <footer className="lp-juridico-rodape">
        <p>
          Dúvidas ou pedidos sobre seus dados: <a href={`mailto:${CONTATO}`}>{CONTATO}</a>
        </p>
        <p>MAISA · assistente de atendimento por WhatsApp</p>
      </footer>
    </main>
  );
}
