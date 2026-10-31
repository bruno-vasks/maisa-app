"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O INTERRUPTOR DA LISTA DE SERVIÇOS DO `/comecar` (31/10/2026).
 *
 * Bruno: "o switch de desligar / ligar em atendimentos também deve ser animado". O `Toggle` do
 * painel (`ui/primitivos.tsx`) já desliza com mola, mas em 240ms e sem mais nada, e ele mora em
 * toda tela do app: mexer nele mudaria o painel inteiro por causa do onboarding. Este é só do
 * wizard, sob a emenda 7 do `maisa-design`: a cor enche a trilha da esquerda para a direita e a
 * bolinha estica quando é apertada e desliza com a mola. O desenho de repouso é o mesmo do
 * `Toggle`, para não parecer outro controle. O check dentro da bolinha e o risco no nome do
 * serviço desligado entraram e saíram no mesmo dia: o Bruno gostou do resto e disse que os dois
 * não precisavam.
 *
 * O movimento mora em `globals.css` (`.m-chave*`) e segue o `aria-checked`, sem estado aqui.
 * ────────────────────────────────────────────────────────────────────────────── */

export function InterruptorVivo({ on, onChange, rotulo }: { on: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={rotulo} onClick={() => onChange(!on)} className="m-chave m-focus">
      <span className="m-chave-trilho">
        <span className="m-chave-cheio" />
        <span className="m-chave-bola" />
      </span>
    </button>
  );
}
