import Link from "next/link";
import { CONTATO } from "./Juridico";

/* ----------------------------------------------------------------------------
 * <RodapeLegal> — a tira de privacidade, termos e contato, em toda página de LP.
 *
 * ── POR QUE ELA EXISTE ──
 *
 * Porque até 18/08/2026 as LPs de barbearia (`/barbeiros` e `/barbeiro`) não tinham
 * NENHUM link para a política de privacidade. A LP estática de terapeutas tem (uma linha
 * no rodapé do `lp/terapeutas/index.html`); as de barbearia terminam na <Planos> e acabou.
 *
 * Isso é uma exigência EXTERNA, e é a mais barata de errar do projeto todo:
 *
 *   • O Google confere que a homepage do app LINKA a política de privacidade ao verificar
 *     um app que pede escopo sensível — e `calendar.events` é sensível. Página pública do
 *     produto sem link para a política é motivo de reprovação, e a fila leva semanas.
 *   • A LGPD pede canal de contato e informação de tratamento acessíveis a quem visita.
 *
 * ── POR QUE NÃO É O <Footer> QUE JÁ EXISTE ──
 *
 * Porque o `Footer.tsx` é um rodapé de MARCA: navy inteiro, tagline, mapa de funil, CTA de
 * WhatsApp e ponte para o outro ICP. Ativá-lo nas LPs de barbearia mudaria o fim da página
 * — e o fim da página é onde a <Planos> converte. Isso é decisão de design de LP, do
 * Bruno, não consequência de uma exigência do Google. Esta tira faz só o que a exigência
 * pede, e cabe embaixo do rodapé de marca no dia em que ele entrar.
 *
 * ── A LINHA DA AGENDA NÃO É PROPAGANDA, É DIVULGAÇÃO ──
 *
 * Ela existe porque o revisor do Google precisa ver, no material público, que o app se
 * conecta ao Google Agenda e que o que ele acessa está escrito em algum lugar. O texto
 * afirma o fato e aponta para a política, onde os escopos estão nomeados um a um. Vender a
 * integração — colocá-la na dobra, no comparativo, no quadro de planos — continua sendo
 * escolha de posicionamento, e não está aqui.
 *
 * ── UM E-MAIL SÓ ──
 *
 * `CONTATO` vem do `Juridico.tsx`, o mesmo que a política e os termos mostram. É o único
 * e-mail do site: o `icp.ts` tinha um `contato@maisa.app` de placeholder e a LP de terapeutas
 * um `oi@maisa.com.br`, e os dois saíram em 28/09/2026. O Google e o provedor de pagamento
 * cruzam o canal de contato do site com o da política, e endereço divergente entre os dois
 * é ruído no pior momento possível.
 *
 * Cores saem dos tokens `--mk-footer-*`, que o <World> já tem em escopo pela classe do
 * mundo: a tira fica quase-preta no mundo barbeiros e navy no terapeutas, sem uma linha
 * de condicional. Sem opacidade reduzida em nada, pela regra das LPs.
 * -------------------------------------------------------------------------- */

const ANO_INICIAL = 2026;

export function RodapeLegal() {
  /* `getFullYear` num Server Component é avaliado no build para página estática — o que
   * significa que este número congela no dia da publicação. É aceitável para um aviso de
   * copyright e não é aceitável para mais nada: nenhuma decisão desta página depende dele. */
  const ano = Math.max(ANO_INICIAL, new Date().getFullYear());

  return (
    <footer
      className="mk-rodape-legal"
      style={{
        background: "var(--mk-footer-bg)",
        color: "var(--mk-footer-ink)",
        borderTop: "1px solid var(--mk-footer-line)",
      }}
    >
      <div className="mk-rodape-legal-caixa">
        <p className="mk-rodape-legal-agenda">
          A MAISA se conecta ao <strong>Google Agenda</strong> para marcar, remarcar e
          cancelar os horários que ela combina no WhatsApp.{" "}
          <Link href="/privacidade" className="mk-footlink mk-focus mk-rodape-legal-forte">
            Veja exatamente o que ela acessa
          </Link>
          .
        </p>

        <nav className="mk-rodape-legal-links" aria-label="Informações legais">
          <Link href="/privacidade" className="mk-footlink mk-tap mk-focus">
            Privacidade
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/termos" className="mk-footlink mk-tap mk-focus">
            Termos
          </Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTATO}`} className="mk-footlink mk-tap mk-focus">
            {CONTATO}
          </a>
        </nav>

        <p className="mk-rodape-legal-marca">© {ano} MAISA</p>
      </div>
    </footer>
  );
}
