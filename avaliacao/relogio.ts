/* ─────────────────────────────────────────────────────────────────────────────
 * O RELÓGIO DA CONVERSA — o processo passa a viver no instante do cenário.
 *
 * "Amanhã de manhã" só tem resposta certa se "hoje" for fixo, e a comparação entre
 * duas rodadas só é justa se as duas virem a mesma agenda. Então `Date` é trocado por
 * um que começa no instante pedido e anda no ritmo real (o agente mede timeout com ele).
 * Tem que rodar ANTES de importar o app: por isso `conversa.ts` importa o resto depois.
 * ────────────────────────────────────────────────────────────────────────────── */

export function viverEm(instanteISO: string): void {
  const Real = Date;
  const delta = Real.parse(instanteISO) - Real.now();
  if (Number.isNaN(delta)) throw new Error(`relógio inválido: ${instanteISO}`);

  class DataDoCenario extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(Real.now() + delta);
      else super(...(args as [string | number | Date]));
    }
    static now() {
      return Real.now() + delta;
    }
  }
  globalThis.Date = DataDoCenario as DateConstructor;
}

/** Hora decimal do instante ISO, no fuso dele: "2026-10-27T22:40:00-03:00" → 22,67. */
export function horaDecimal(instanteISO: string): number {
  const m = instanteISO.match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
}
