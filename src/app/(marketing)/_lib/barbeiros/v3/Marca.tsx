import React from "react";
import { Bricolage_Grotesque } from "next/font/google";

/* Wordmark do topo das LPs de barbeiro: o mesmo de /lp/terapeutas ("maisa" + ponto).
   Só a assinatura da dobra usa; o `Maisa` inline das frases não mudou. */
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: "700", display: "swap" });

export function Marca() {
  return (
    <span
      className={`lp3-marca ${bricolage.className}`}
      style={{ fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1, color: "var(--mk-ink)" }}
    >
      maisa<span aria-hidden="true" style={{ color: "var(--mk-brand)" }}>.</span>
    </span>
  );
}
