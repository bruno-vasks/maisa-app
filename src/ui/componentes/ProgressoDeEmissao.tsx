"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * PROGRESSO DE EMISSÃO — o cartão do canto que conta os recibos saindo.
 *
 * ★ POR QUE NÃO É MAIS UM MODAL (Bruno, 26/08/2026): *"a emissão dos recibos é algo que demora,
 * queria não ter que ficar olhando para uma telinha enquanto isso acontece"*.
 *
 * Um lote de 50 recibos é uma chamada por recibo, em série, e cada uma leva segundos. O modal
 * fazia disso uma sala de espera: nada mais na tela era clicável, e o dono ficava olhando uma
 * barra. Agora o placar mora aqui, fixo no canto de baixo à direita, e o app continua inteiro.
 *
 * ⚠️ ELE É MONTADO NO `AppShell`, NÃO NA TELA DE EMISSÃO — e é isso que faz a coisa funcionar. O
 * estado vive no store (ver `EmissaoDeRecibos`); montado dentro da tela, sair da tela desmontaria
 * o cartão e o dono perderia o placar de uma emissão que continua correndo.
 *
 * ── ⚠️ O QUE ESTE CARTÃO NÃO TEM ──
 *
 * Não tem "cancelar". Cada passo é um documento fiscal que já saiu no CPF de alguém: parar no meio
 * só evitaria os próximos, e desfazer os anteriores é cancelar um por um, em até dez dias (art. 7º
 * da IN RFB 2.240/2024). Um botão de cancelar prometeria voltar atrás.
 *
 * Não tem barra falsa. A largura é `feitos/total` — cada avanço é uma resposta do servidor.
 * ────────────────────────────────────────────────────────────────────────────── */

import React from "react";
import { s, Icon } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { useIsMobile } from "@/ui/useIsMobile";

export function ProgressoDeEmissao() {
  const st = useStore();
  const mobile = useIsMobile();
  const e = st.emissao;

  if (!e) return null;

  const andando = e.estado === "andando";
  const resolvidos = e.feitos + e.falhas.length;
  const pct = e.total === 0 ? 0 : Math.round((resolvidos / e.total) * 100);
  const tudoCerto = !andando && e.falhas.length === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      /* `fixed` e não `sticky`: ele acompanha o dono por qualquer tela. No celular sobe acima da
         barra de abas, que também é fixa — senão o cartão cobre a navegação. */
      style={{ ...s(`position:fixed;right:${mobile ? 12 : 20}px;bottom:${mobile ? 78 : 20}px;z-index:60;width:${mobile ? "calc(100% - 24px)" : "330px"};background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-pop);padding:15px 16px;display:flex;flex-direction:column;gap:11px`), animation: "mrise .22s var(--ease-out)" }}
    >
      <div style={s("display:flex;align-items:center;gap:10px")}>
        <span
          aria-hidden
          style={s(`width:28px;height:28px;flex:none;border-radius:var(--r-controle);display:grid;place-items:center;background:${tudoCerto ? "var(--success-soft)" : andando ? "var(--primary-soft)" : "var(--warn-soft)"};color:${tudoCerto ? "var(--success)" : andando ? "var(--primary)" : "var(--warn)"}`)}
        >
          {andando
            ? (
              /* `mspin` é o keyframe da casa (`globals.css`); não existe classe utilitária para
                 ele, por isso a animação vai inline. */
              <span style={{ ...s("display:grid;place-items:center"), animation: "mspin 1.1s linear infinite" }}>
                <Icon name="refresh" size={15} />
              </span>
            )
            : <Icon name={tudoCerto ? "check" : "alert"} size={15} sw={2.4} />}
        </span>

        <span style={s("min-width:0;flex:1")}>
          <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
            {andando ? "Emitindo recibos" : tudoCerto ? "Recibos emitidos" : "Emissão terminada"}
          </span>
          {/* ★ O NOME DE QUEM ESTÁ SAINDO. É o que transforma uma barra numa fila de pessoas — e é
              o que o Bruno pediu: "emitindo o recibo da/do…, aí uma animação de check e troca para
              a próxima pessoa". */}
          <span style={s("display:block;font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>
            {andando
              ? `Recibo de ${e.atual ?? "…"}`
              : `${e.feitos} de ${e.total} ${e.total === 1 ? "recibo" : "recibos"}`}
          </span>
        </span>

        <span className="n" style={s(`font-size:var(--t-sm);font-weight:var(--w-emph);color:var(--ink);flex:none`)}>
          {resolvidos}/{e.total}
        </span>
      </div>

      <span aria-hidden style={s("height:7px;border-radius:20px;background:var(--surface-2);overflow:hidden")}>
        <span style={s(`display:block;height:100%;border-radius:20px;background:${tudoCerto ? "var(--success)" : andando ? "var(--primary)" : "var(--warn)"};width:${pct}%;transition:width var(--dur-base) var(--ease-out)`)} />
      </span>

      {/* O último que saiu, com o check — a confirmação de que a fila anda de gente em gente. */}
      {andando && e.ultimo && (
        <span style={s("display:flex;align-items:center;gap:7px;font-size:var(--t-label);color:var(--success)")}>
          <Icon name="check" size={13} sw={2.6} />
          <span style={s("white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{e.ultimo}</span>
        </span>
      )}

      {/* ⚠️ FALHA É LISTADA POR NOME. "2 não saíram" obriga a conferir a lista inteira à mão. */}
      {!andando && e.falhas.length > 0 && (
        <div style={s("display:flex;flex-direction:column;gap:5px;max-height:132px;overflow:auto")}>
          {e.falhas.map((f, i) => (
            <span key={`${f.nome}-${i}`} style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
              <strong style={s("color:var(--ink);font-weight:var(--w-title)")}>{f.nome}</strong> — {f.erro}
            </span>
          ))}
        </div>
      )}

      {!andando && (
        <button
          onClick={st.fecharEmissao}
          className="m-focus m-hov-bg"
          style={s("align-self:flex-start;border:1px solid var(--border);background:var(--surface);border-radius:var(--r-controle);padding:7px 13px;font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);color:var(--ink);cursor:pointer")}
        >
          Fechar
        </button>
      )}
    </div>
  );
}
