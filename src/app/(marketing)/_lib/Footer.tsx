import type { CSSProperties } from "react";
import { ICPS, type ICP } from "./icp";
import { CONTATO } from "./Juridico";
import { Wordmark } from "./Wordmark";
import { Button } from "./primitives";

/* ----------------------------------------------------------------------------
 * Footer — fecho de marca, uma variação por ICP. Rodapé navy (âncora): quase
 * preto no mundo barbeiros, navy calmo no terapeutas. Traz o mapa do funil, o
 * CTA de WhatsApp e a ponte para o OUTRO mundo (barbeiros <-> terapeutas).
 * Server Component (sem estado); renderiza os botões/wordmark como ilhas client.
 * -------------------------------------------------------------------------- */

const TAGLINE: Record<ICP, string> = {
  barbeiros:
    "A agenda enche sozinha enquanto você fica de tesoura na mão. A MAISA confirma, lembra e recupera cliente pelo WhatsApp — no automático.",
  terapeutas:
    "As notas fiscais em um clique e a agenda dos pacientes em ordem. A MAISA cuida do operacional para você cuidar de quem atende.",
};

const CROSS: Record<ICP, { outro: ICP; chamada: string; texto: string }> = {
  barbeiros: { outro: "terapeutas", chamada: "É terapeuta?", texto: "Conheça a MAISA para consultórios." },
  terapeutas: { outro: "barbeiros", chamada: "Tem barbearia ou salão?", texto: "Conheça a MAISA para barbearias." },
};

export function Footer({ icp }: { icp: ICP }) {
  const cfg = ICPS[icp];
  const cross = CROSS[icp];
  const outro = ICPS[cross.outro];
  const ano = new Date().getFullYear();

  const mapa = [
    { label: "Início", href: cfg.rotas.topo },
    { label: "Como funciona", href: cfg.rotas.meio },
    { label: "Planos e preços", href: cfg.rotas.base },
  ];

  const colTitulo: CSSProperties = {
    fontFamily: "var(--mk-font-body)",
    fontSize: "0.76rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--mk-footer-accent)",
    marginBottom: "0.9rem",
  };
  const link: CSSProperties = {
    fontFamily: "var(--mk-font-body)",
    fontSize: "0.98rem",
    lineHeight: 2,
  };

  return (
    <footer
      className={`${cfg.mundoClass} mk-footer`}
      style={{ background: "var(--mk-footer-bg)", color: "var(--mk-footer-ink)" }}
    >
      <div
        style={{
          maxWidth: "var(--mk-maxw)",
          marginInline: "auto",
          paddingInline: "var(--mk-gutter)",
          paddingBlock: "clamp(3rem, 6vw, 4.5rem)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))",
            gap: "clamp(2rem, 4vw, 3.5rem)",
            alignItems: "start",
          }}
        >
          {/* bloco de marca */}
          <div style={{ maxWidth: "34ch" }}>
            <div style={{ color: "var(--mk-footer-ink)" }}>
              <Wordmark href={cfg.home} size={1.55} accent="var(--mk-footer-accent)" />
            </div>
            <p style={{ marginTop: "1.1rem", fontFamily: "var(--mk-font-body)", fontSize: "0.98rem", lineHeight: 1.65, color: "var(--mk-footer-muted)" }}>
              {TAGLINE[icp]}
            </p>
            <div style={{ marginTop: "1.5rem" }}>
              <Button href={cfg.ctaUrl} external variant="whatsapp" size="md" icon="whatsapp">
                {cfg.ctaLabel}
              </Button>
            </div>
            <p style={{ marginTop: "0.95rem", fontFamily: "var(--mk-font-body)", fontSize: "0.9rem", lineHeight: 1.6, color: "var(--mk-footer-muted)" }}>
              Prefere e-mail?{" "}
              <a href={`mailto:${CONTATO}`} className="mk-footlink mk-focus" style={{ color: "var(--mk-footer-ink)", fontWeight: 600 }}>
                {CONTATO}
              </a>
            </p>
          </div>

          {/* mapa do funil */}
          <nav aria-label="Mapa do site">
            <div style={colTitulo}>Navegar</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {mapa.map((m) => (
                <li key={m.href}>
                  <a href={m.href} className="mk-footlink mk-tap mk-focus" style={link}>
                    {m.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* ponte para o outro mundo */}
          <div>
            <div style={colTitulo}>Outro público</div>
            <p style={{ fontFamily: "var(--mk-font-body)", fontSize: "0.98rem", lineHeight: 1.6, color: "var(--mk-footer-muted)", marginBottom: "0.5rem" }}>
              {cross.chamada}
            </p>
            <a href={outro.home} className="mk-footlink mk-tap mk-focus" style={{ ...link, fontWeight: 600, color: "var(--mk-footer-ink)" }}>
              {cross.texto}
            </a>
          </div>
        </div>

        {/* barra inferior */}
        <div
          style={{
            marginTop: "clamp(2.5rem, 5vw, 3.5rem)",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--mk-footer-line)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.5rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontFamily: "var(--mk-font-body)", fontSize: "0.86rem", color: "var(--mk-footer-muted)" }}>
            © {ano} MAISA · Sua assistente de IA no WhatsApp
          </span>
          <span style={{ fontFamily: "var(--mk-font-body)", fontSize: "0.86rem", color: "var(--mk-footer-muted)" }}>
            Feito para quem atende com as próprias mãos.
          </span>
        </div>
      </div>
    </footer>
  );
}
