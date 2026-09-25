"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE A TELA DESENHA ANTES DE SABER. Carregando e erro, iguais em todas as telas.
 *
 * Par de `estado/leitura.ts`: lá a tela decide em que fase está; aqui ela desenha as duas
 * fases que não são dela. A fase `ok` é da tela (vazio ou cheio), e este componente não a
 * desenha.
 *
 *   `Esqueleto` ... linhas cinzas NA FORMA do que vem (quantas e de que altura, quem chama
 *                   diz). Só aparece depois de 300ms: leitura rápida não pisca cinza, e antes
 *                   disso a tela fica em branco, que não afirma nada.
 *   `FalhaDeLeitura` a frase e "Tentar de novo". Nunca esqueleto: carregando vira tela num
 *                   instante, erro não vira nada nunca, e cinza para sempre sem uma palavra é
 *                   o beco do Fiscal de 26/08/2026 (`vocabulario().falhou`).
 * ────────────────────────────────────────────────────────────────────────────── */

import React from "react";
import { s, Btn } from "@/ui/primitivos";

/** Espera antes de pintar o esqueleto. Abaixo disso o cinza só pisca. */
export const ESPERA_DO_ESQUELETO_MS = 300;

export function Esqueleto({ linhas = 3, altura = 56, gap = 10, rotulo = "Carregando" }: {
  linhas?: number; altura?: number; gap?: number; rotulo?: string;
}) {
  const [visivel, setVisivel] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setVisivel(true), ESPERA_DO_ESQUELETO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div aria-busy="true" aria-label={rotulo} style={s(`display:flex;flex-direction:column;gap:${gap}px`)}>
      {visivel && Array.from({ length: linhas }, (_, i) => (
        <span key={i} style={s(`display:block;height:${altura}px;border-radius:12px;background:var(--line)`)} />
      ))}
    </div>
  );
}

/** A sessão acabou: tentar de novo não resolve, entrar resolve. `window.location` e não
 *  `router.push` pela mesma razão do desvio de `sem_negocio` no store: o painel meio carregado
 *  não deve sobreviver à saída. */
export const ENTRAR = { rotulo: "Entrar", fazer: () => { window.location.assign("/login"); } };

export function FalhaDeLeitura({ frase, detalhe, tentar, acao, compacta, embutida }: {
  frase: string;
  /** O motivo que o servidor mandou, quando mandou. Vai embaixo, menor. */
  detalhe?: string;
  tentar: () => void;
  /** No lugar de "Tentar de novo", quando repetir não resolve (sessão expirada: `ENTRAR`). */
  acao?: { rotulo: string; fazer: () => void };
  /** Dentro de uma coluna estreita (a fila do Fluxo): alinhado à esquerda, sem respiro de tela cheia. */
  compacta?: boolean;
  /** Dentro de um cartão que já tem o próprio respiro (o "De quem é esse número"): sem padding. */
  embutida?: boolean;
}) {
  return (
    <div
      role="status"
      style={s(`display:flex;flex-direction:column;gap:10px;${embutida ? "align-items:flex-start;padding:0" : compacta ? "align-items:flex-start;padding:16px" : "align-items:center;text-align:center;padding:48px 24px"}`)}
    >
      <span style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);max-width:40ch")}>{frase}</span>
      {detalhe && <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-ui);max-width:52ch")}>{detalhe}</span>}
      {acao
        ? <Btn variant="secondary" onClick={acao.fazer}>{acao.rotulo}</Btn>
        : <Btn variant="secondary" onClick={tentar}>Tentar de novo</Btn>}
    </div>
  );
}
