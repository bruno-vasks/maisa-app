import { describe, expect, it } from "vitest";
import { valorDigitado } from "./PagouAdiantado";

describe("o valor pago, como se digita no Brasil", () => {
  it("vírgula é decimal e ponto com três casas é milhar", () => {
    expect(valorDigitado("1.000,00")).toBe(1000);
    expect(valorDigitado("1000,5")).toBe(1000.5);
    expect(valorDigitado("1.000")).toBe(1000);
    expect(valorDigitado("250")).toBe(250);
    expect(valorDigitado("R$ 1.250,00")).toBe(1250);
  });
  it("vazio ou texto não vira zero calado", () => {
    expect(valorDigitado("")).toBeNaN();
    expect(valorDigitado("abc")).toBeNaN();
  });
});
