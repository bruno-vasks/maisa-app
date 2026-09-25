"use client";
/* MAISA — o cartão curto e o hero de tela.
 *
 * O cartão é a unidade de todas as telas de listagem. Ele mostra o mínimo para
 * decidir: quem, uma linha de contexto, e um estado. O resumo aparece no hover
 * (CSS, classe .m-exp) e o detalhe editável vive na Gaveta.
 *
 * Tudo aqui é <span>: o cartão é um <button>, e só conteúdo de frase é válido
 * dentro dele. O layout vem de display:flex/block nos spans. */

import React from "react";
import { s, Icon, Monogram } from "@/ui/primitivos";

export type TomTag = "success" | "warn" | "primary" | "neutral" | "danger";

const TAG: Record<TomTag, [string, string]> = {
  success: ["var(--success-soft)", "var(--success)"],
  warn: ["var(--warn-soft)", "var(--warn)"],
  primary: ["var(--primary-soft)", "var(--primary-dark)"],
  danger: ["var(--danger-soft)", "var(--danger)"],
  neutral: ["var(--line)", "var(--muted)"],
};

/* Cor do pontinho quando o cartão não tem avatar.
   O ponto é o estado inteiro quando não há tag, então precisa dos 3:1 da WCAG 1.4.11.
   - warn era --warm: 1.66:1 sobre --surface (invisível) e ainda divergia do TAG.warn, que já
     usava --warn. Mesmo estado com duas cores no mesmo cartão. Âmbar tem dois empregos (marca e
     ação primária) e estado não é um deles → --warn, igual à tag.
   - neutral era --border (1.31:1, aresta de cartão fazendo papel de tinta) → --muted, que passa. */
export const DOT: Record<TomTag, string> = {
  success: "var(--success)",
  warn: "var(--warn)",
  primary: "var(--primary)",
  danger: "var(--danger)",
  neutral: "var(--muted)",
};

export type CartaoProps = {
  titulo: string;
  sub: string;
  onClick: () => void;
  /** Semente do monograma. Sem ela, use `dot`. */
  seed?: string;
  dot?: TomTag;
  /** Número/valor à direita — dado, com numerais tabulares (.n). */
  meta?: string;
  tag?: { label: string; tom: TomTag };
  /** Linha extra que aparece no hover. */
  resumo?: string;
  chips?: string[];
  /** Item pausado/inativo — muda a SUPERFÍCIE do cartão, não a opacidade do texto. */
  atenuado?: boolean;
};

// `atenuado` era opacity:.66 no cartão inteiro. Composto sobre o fundo, título e sub caíam para
// 2.1-3.0:1 e reprovavam AA — e era semanticamente invertido: o registro pausado é exatamente o
// que pede ação, e a translucidez o marcava como "ignore". Agora o estado é a superfície
// (--surface-2) + a tag em contraste cheio; o texto tem a mesma cor dos ativos.
export function Cartao({ titulo, sub, onClick, seed, dot, meta, tag, resumo, chips, atenuado }: CartaoProps) {
  const temResumo = !!(resumo || chips?.length);
  return (
    <button
      onClick={onClick}
      // Nome acessível explícito: o conteúdo é uma pilha de spans (monograma,
      // título, sub, meta, tag) e o nome calculado sai como uma tripa confusa.
      aria-label={[titulo, sub, meta, tag?.label].filter(Boolean).join(", ")}
      className="m-exp m-focus"
      style={s(`text-align:left;background:${atenuado ? "var(--surface-2)" : "var(--surface)"};border:1px solid var(--border);border-radius:var(--radius-card);padding:18px;display:block;width:100%;align-self:flex-start;cursor:pointer;box-shadow:var(--shadow-card)`)}
    >
      <span style={s("display:flex;align-items:center;gap:14px;width:100%")}>
        {seed && <Monogram name={titulo} id={seed} size={46} radius={14} />}
        {!seed && dot && <span style={s(`width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${DOT[dot]}`)} />}
        <span style={s("flex:1;min-width:0;display:block")}>
          {/* título do cartão: --w-title (600). O letter-spacing de -.01em saiu — a 16px é
              invisível e só atrapalha o hinting; negativo só a partir de 18px. */}
          <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{titulo}</span>
          <span style={s("display:block;font-size:var(--t-sm);color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{sub}</span>
        </span>
        {(meta || tag) && (
          <span style={s("flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:7px")}>
            {/* meta é dado (valor, hora, contagem) → --w-data + .n. Sem mono: os dígitos da Plex
                Sans já têm avanço igual, e mono aqui leria como terminal, não como dinheiro. */}
            {meta && <span className="n" style={s("font-size:var(--t-body);font-weight:var(--w-data)")}>{meta}</span>}
            {tag && (
              <span style={s(`font-size:var(--t-micro);font-weight:var(--w-title);padding:3px 9px;border-radius:999px;white-space:nowrap;background:${TAG[tag.tom][0]};color:${TAG[tag.tom][1]}`)}>
                {tag.label}
              </span>
            )}
          </span>
        )}
      </span>

      {/* Sem style inline no .m-exp-body de propósito: estilo inline vence media
          query, e é a media query (hover:none) que remove o resumo no toque. */}
      {temResumo && (
        <span className="m-exp-body">
          <span style={s("display:block")}>
            <span style={s("display:block;padding-top:14px;border-top:1px solid var(--line)")}>
              {resumo && <span style={s("display:block;font-size:var(--t-sm);line-height:var(--lh-prose);color:var(--muted)")}>{resumo}</span>}
              {!!chips?.length && (
                <span style={s("display:flex;flex-wrap:wrap;gap:6px;margin-top:11px")}>
                  {chips.map((c) => (
                    // mesmo peso do <Chip> de ui.tsx (--w-data): o chip carrega dado, não prosa
                    <span key={c} style={s("display:inline-flex;align-items:center;padding:5px 11px;border-radius:999px;font-size:var(--t-label);font-weight:var(--w-data);white-space:nowrap;background:var(--bg);color:var(--muted);border:1px solid var(--line)")}>{c}</span>
                  ))}
                </span>
              )}
              <span style={s("display:flex;justify-content:flex-end;margin-top:12px")}>
                <span style={s("display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:var(--t-label);font-weight:var(--w-title);background:var(--primary-soft);color:var(--primary-dark)")}>
                  abrir e editar
                  <Icon name="arrow-right" size={13} sw={2.2} />
                </span>
              </span>
            </span>
          </span>
        </span>
      )}
    </button>
  );
}

/** Grade de cartões — auto-fill, então vira coluna única sem media query. */
export function GradeCartoes({ children }: { children: React.ReactNode }) {
  return (
    <div style={s("display:grid;gap:16px;align-items:start;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))")}>
      {children}
    </div>
  );
}

/* ───────────────────────────── hero de tela ─────────────────────────────
 * Uma linha só de "onde o mês está" + a ação que resolve o que falta. */

export type Marco = { n: number | string; label: string; tom: TomTag };

export function Hero({
  rotulo, valor, sub, marcos, acao, pronto,
}: {
  rotulo: string;
  valor: string;
  sub: string;
  marcos: Marco[];
  /** `desabilitada` desenha o botão desligado de verdade; `motivo` vai escrito ao lado (e ligado
   *  por `aria-describedby`), com ou sem botão ligado. */
  acao?: { label: string; icon?: string; onClick: () => void; desabilitada?: boolean; motivo?: string };
  pronto?: string;
}) {
  const idMotivo = React.useId();
  return (
    <div style={s("display:flex;align-items:center;gap:26px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:20px 22px;box-shadow:var(--shadow-card)")}>
      <div style={s("min-width:0")}>
        {/* eyebrow em caixa-alta: tracking unificado em --ls-caps (era .13em) e tamanho em
            --t-label — ele aparece nas 5 telas de grade e era o maior desvio de tracking do app. */}
        <div style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>{rotulo}</div>
        <div style={s("display:flex;align-items:baseline;gap:10px;margin-top:7px;flex-wrap:wrap")}>
          {/* numeral herói: o ÚNICO --w-emph (700) deste arquivo — é o número que a tela existe
              para mostrar. Sem mono, com .n: dinheiro em mono lê como terminal. */}
          <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:1")}>{valor}</span>
          <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{sub}</span>
        </div>
      </div>
      <div style={s("display:flex;align-items:center;gap:20px;flex-wrap:wrap")}>
        {marcos.map((m) => (
          <div key={m.label} style={s("display:flex;align-items:center;gap:9px")}>
            <span style={s(`width:9px;height:9px;border-radius:50%;background:${DOT[m.tom]}`)} />
            <span style={s("font-size:var(--t-sm);color:var(--muted)")}>
              {/* contagem do marco = dado → --w-data + .n, sem mono */}
              <span className="n" style={s("font-weight:var(--w-data);color:var(--ink)")}>{m.n}</span> {m.label}
            </span>
          </div>
        ))}
      </div>
      {acao && (
        <span style={s("margin-left:auto;display:inline-flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end")}>
          {acao.motivo && (
            <span id={idMotivo} style={s(`font-size:var(--t-sm);font-weight:var(--w-data);color:${acao.desabilitada ? "var(--warn)" : "var(--ink)"}`)}>{acao.motivo}</span>
          )}
          <button
            type="button"
            onClick={acao.desabilitada ? undefined : acao.onClick}
            disabled={acao.desabilitada}
            aria-describedby={acao.motivo ? idMotivo : undefined}
            className={acao.desabilitada ? "m-focus" : "m-hov-bright m-press m-focus"}
            style={s(`height:48px;padding:0 22px;border:none;border-radius:14px;font-size:var(--t-body);font-weight:var(--w-title);display:inline-flex;align-items:center;gap:10px;white-space:nowrap;${acao.desabilitada ? "background:var(--line);color:var(--muted);cursor:not-allowed" : "background:var(--warm);color:var(--warm-ink);cursor:pointer"}`)}
          >
            {acao.icon && <Icon name={acao.icon} size={18} sw={2.1} />}
            {acao.label}
          </button>
        </span>
      )}
      {!acao && pronto && (
        <span style={s("margin-left:auto;display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 20px;border-radius:14px;background:var(--success-soft);color:var(--success);font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap")}>
          <Icon name="check" size={18} sw={2.3} />
          {pronto}
        </span>
      )}
    </div>
  );
}

/* Envelope padrão das telas de grade: hero + filtros + cartões.
   É ele o contêiner de rolagem — o shell só dá a caixa; cada tela decide o que
   rola. Sem isso, telas de altura fixa (Agenda, Conversas) ganhariam duas
   barras de rolagem aninhadas. */
/**
 * A moldura de uma tela de grade: rola, respira, e empilha os blocos.
 *
 * ── ★ `preencher` — A EXCEÇÃO, COM LIMITE (26/08/2026) ──
 *
 * Bruno, sobre a tela Fiscal: *"o vazio fica melhor dentro dos cards do que na tela em si"*. Com
 * poucos clientes na lista, o cartão terminava no meio da tela e sobrava um bloco branco enorme
 * do lado de fora — página inacabada, não respiro.
 *
 * `preencher` diz "esta tela administra a própria altura": o filho estica até o fim da faixa e a
 * folga passa a morar dentro dos cartões. O respiro de baixo cai de 32px para os 24px das
 * laterais, para o cartão não parecer flutuando acima do fim do rail.
 *
 * ⚠️ O QUE ELE **NÃO** FAZ: não tira a rolagem. Se o conteúdo passar da faixa (janela baixa, painel
 * grande), a tela rola como sempre. Trocar por `overflow:hidden` cortaria o CTA — e CTA cortado é
 * pior que rolagem.
 *
 * ⚠️ E ele só serve para tela cujo filho sabe encolher (`flex:1;min-height:0` na cadeia inteira,
 * com a lista rolando por dentro). Numa tela de blocos empilhados, esticar não significa nada.
 */
export function TelaGrade({ children, preencher }: { children: React.ReactNode; preencher?: boolean }) {
  return (
    <div className="m-enter" style={s(`flex:1;min-height:0;overflow-y:auto;padding:22px 24px ${preencher ? 24 : 32}px;display:flex;flex-direction:column;gap:18px`)}>
      {children}
    </div>
  );
}
