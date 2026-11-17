/* O relógio do ensaio: começa no instante do cenário e anda `fator` vezes mais devagar.
 *
 * Mais devagar porque a MAISA aqui responde pelo Claude Code (`claude -p`), que leva de 8 a 20 s
 * por chamada, e o turno tem orçamento de 50 s medido pelo `Date` (`ORCAMENTO_DO_TURNO_MS`). Com o
 * relógio real, um turno de duas ferramentas estourava o orçamento e a resposta saía pela metade:
 * o ensaio mediria a lentidão da linha de comando, não a conversa. Mesmo truque do ensaio da
 * conta oficial de 09/11/2026. Os `setTimeout` continuam no tempo real (a espera da rajada é 4 s). */

export function viverDevagar(instanteISO: string, fator = 5): void {
  const Real = Date;
  const inicioReal = Real.now();
  const inicio = Real.parse(instanteISO);
  if (Number.isNaN(inicio)) throw new Error(`relógio inválido: ${instanteISO}`);
  const agora = () => inicio + (Real.now() - inicioReal) / fator;

  class DataDoEnsaio extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(agora());
      else super(...(args as [string | number | Date]));
    }
    static now() {
      return agora();
    }
  }
  globalThis.Date = DataDoEnsaio as DateConstructor;
}
