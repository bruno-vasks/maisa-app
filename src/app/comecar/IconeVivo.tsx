"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * OS ÍCONES QUE FAZEM O QUE SÃO — os cartões de escolha do `/comecar` (31/10/2026).
 *
 * Bruno, sobre a primeira versão, que inclinava qualquer ícone no hover: "não gosto desse tilt pro
 * lado como animação, seja mais criativo e ousado, use animações específicas do elemento (tesoura
 * cortando, por exemplo)". Cada desenho aqui se mexe do jeito do objeto: a tesoura corta, o
 * estetoscópio bate, a loja abre a porta, a conversa digita, o sino toca, o recibo se escreve.
 *
 * ⚠️ POR QUE NÃO O `Icon`: o registro `ICONS` de `ui/primitivos.tsx` desenha cada ícone num `path`
 * só, e animar uma lâmina sem a outra pede as peças separadas. Os traços seguem o desenho do
 * resto do app (contorno, ponta redonda) e os da Lucide, de onde vêm o estetoscópio e a loja.
 *
 * ⚠️ A ANIMAÇÃO TOCA DE NOVO PELA `key`. Quem usa passa `toque`, um número que sobe no hover e no
 * toque; a `key` do `svg` muda, ele remonta e a animação do CSS recomeça. Só CSS não dá: trocar a
 * animação no `:hover` faz ela tocar de novo também na SAÍDA do mouse. No primeiro desenho
 * (`toque` 0) vale o `atraso`, para entrar depois da cascata da tela.
 *
 * O movimento mora em `globals.css` (`.m-iv-*`), sob a emenda 7 do `maisa-design`, e o
 * `prefers-reduced-motion` de lá zera tudo.
 * ────────────────────────────────────────────────────────────────────────────── */

import type React from "react";

export type Desenho = "tesoura" | "estetoscopio" | "loja" | "conversa" | "sino" | "recibo";

const PECAS: Record<Desenho, React.ReactNode> = {
  tesoura: (
    <>
      <g className="m-iv-lamina-a"><circle cx="5" cy="7.5" r="2.5" /><path d="M7.1 8.85 20.4 17.4" /></g>
      <g className="m-iv-lamina-b"><circle cx="5" cy="16.5" r="2.5" /><path d="M7.1 15.15 20.4 6.6" /></g>
      <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  estetoscopio: (
    <>
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6a6 6 0 0 0 6-6v-4" />
      <circle className="m-iv-onda" cx="20" cy="10" r="2" />
      <circle className="m-iv-batida" cx="20" cy="10" r="2" />
    </>
  ),
  loja: (
    <>
      <g className="m-iv-toldo">
        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
        <path d="M2 7h20" />
        <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
      </g>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path className="m-iv-porta" d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
    </>
  ),
  conversa: (
    <>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <circle className="m-iv-ponto" cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle className="m-iv-ponto" cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle className="m-iv-ponto" cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sino: (
    <>
      <path className="m-iv-som" d="M4 2C2.8 3.7 2 5.7 2 8" />
      <path className="m-iv-som" d="M22 8c0-2.3-.8-4.3-2-6" />
      <path className="m-iv-corpo" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path className="m-iv-badalo" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  recibo: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path className="m-iv-linha" pathLength={1} d="M8 12h8" />
      <path className="m-iv-linha" pathLength={1} d="M8 16h4" />
      <path className="m-iv-selo" pathLength={1} d="m14 17.5 1.6 1.6 3.2-3.2" />
    </>
  ),
};

export function IconeVivo({
  desenho, tamanho, cor, toque, atraso = 0,
}: {
  desenho: Desenho;
  tamanho: number;
  cor: string;
  /** Sobe a cada hover ou toque no cartão: a `key` muda e a animação toca de novo. */
  toque: number;
  /** Só no primeiro desenho, em ms: para tocar depois que a tela terminou de entrar. */
  atraso?: number;
}) {
  return (
    <svg
      key={toque}
      className={`m-iv m-iv-${desenho}`}
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor}
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ color: cor, flexShrink: 0, ["--iv-atraso" as string]: `${toque === 0 ? atraso : 0}ms` }}
    >
      {PECAS[desenho]}
    </svg>
  );
}

/** Do nome do ícone no registro (o que `VERTICAIS` e `MODOS` guardam) para o desenho animado. */
export const DESENHO_DO_ICONE: Record<string, Desenho> = {
  scissors: "tesoura",
  stethoscope: "estetoscopio",
  negocio: "loja",
  chat: "conversa",
  bell: "sino",
  receipt: "recibo",
};
