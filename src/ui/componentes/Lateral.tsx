"use client";

import React, { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { s } from "@/ui/primitivos";

/* ─────────────────────────────────────────────────────────────────────────────
 * <Lateral>: A COLUNA DA DIREITA, DE ALTURA INTEIRA.
 *
 * ── POR QUE ELA SAI DA TELA E VAI PARA A CASCA (28/09/2026) ──
 *
 * O Bruno mandou juntar a sidebar e a tela, e o primeiro desenho foi um L navy: o rail e a
 * topbar escuros, a topbar cruzando a janela inteira. Ficou "desencaixado": o "Precisa de
 * você" do Fluxo começava em x=1111, embaixo da topbar, e os botões dela iam de 1158 a 1416.
 * Nenhuma borda batia com nenhuma, porque a topbar é uma FAIXA e a lateral é uma COLUNA.
 *
 * O desenho que resolve é o de Mail, Slack e Linear: colunas de altura inteira, cada uma com
 * o próprio cabeçalho de 56px e a mesma linha fina embaixo. A topbar fica só em cima da coluna
 * principal; a lateral sobe até o topo. Uma linha vertical vai de cima a baixo sem quebra, e
 * os cabeçalhos terminam na mesma altura. As bordas batem por construção.
 *
 * A tela continua dona do conteúdo (estado, leitura, cliques): ela só DECLARA a coluna, e a
 * casca a desenha no lugar certo por portal. O portal leva o contexto do React junto, então
 * `useStore` funciona lá dentro como antes.
 *
 * ⚠️ SÓ NO DESKTOP. No celular não há coluna: a tela já escolhe outro layout (`mobile`) e não
 * monta <Lateral>. Se montar, ou se a casca não tiver o encaixe, ela desenha no lugar, inline.
 * ────────────────────────────────────────────────────────────────────────────── */

export const LATERAL_LARGURA = 340;

/** O encaixe que a casca oferece: o nó onde a coluna é desenhada, ou `null` sem casca. */
export const EncaixeDaLateral = createContext<HTMLElement | null>(null);

export function Lateral({ rotulo, largura = LATERAL_LARGURA, children }: {
  /** Nome da região para leitor de tela ("Precisa de você", "Quem vem"). */
  rotulo: string;
  largura?: number;
  children: React.ReactNode;
}) {
  const encaixe = useContext(EncaixeDaLateral);
  const coluna = (
    <aside
      aria-label={rotulo}
      style={s(`width:${largura}px;flex-shrink:0;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--surface);border-left:1px solid var(--line)`)}
    >
      {children}
    </aside>
  );
  return encaixe ? createPortal(coluna, encaixe) : coluna;
}

/** O cabeçalho da coluna: 56px e a linha fina, iguais aos da topbar, para os dois terminarem juntos. */
export function CabecalhoDaLateral({ children }: { children: React.ReactNode }) {
  return (
    <div style={s("height:56px;flex-shrink:0;display:flex;align-items:center;gap:9px;padding:0 20px;border-bottom:1px solid var(--line)")}>
      {children}
    </div>
  );
}
