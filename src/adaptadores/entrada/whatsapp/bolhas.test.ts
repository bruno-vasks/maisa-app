import { describe, expect, it } from "vitest";

import { bolhas, comoSeFala } from "./bolhas";

describe("comoSeFala", () => {
  it("hora de sistema vira hora falada", () => {
    expect(comoSeFala("Tenho às 09:00 ou às 14:30")).toBe("Tenho às 9h ou às 14h30");
    expect(comoSeFala("abre das 08:00–20:00")).toBe("abre das 8h–20h");
  });

  it("não duplica o h de quem já escreveu 10:30h", () => {
    expect(comoSeFala("às 10:30h, pode ser?")).toBe("às 10h30, pode ser?");
  });

  it("preço com ponto e centavos vira o jeito brasileiro", () => {
    expect(comoSeFala("O corte é R$ 50.00")).toBe("O corte é R$ 50");
    expect(comoSeFala("R$ 52.50 a sessão")).toBe("R$ 52,50 a sessão");
  });

  it("não mexe em milhar nem em texto sem hora", () => {
    expect(comoSeFala("R$ 1.200 o pacote")).toBe("R$ 1.200 o pacote");
    expect(comoSeFala("Pronto, Lucas!")).toBe("Pronto, Lucas!");
  });
});

describe("bolhas", () => {
  it("linha em branco separa mensagens, e a hora sai falada", () => {
    expect(bolhas("Bom dia!\n\nTenho amanhã às 10:30.")).toEqual(["Bom dia!", "Tenho amanhã às 10h30."]);
  });

  it("estourou o teto: junta o excedente na última, sem perder a pergunta", () => {
    expect(bolhas("a\n\nb\n\nc\n\nqual prefere?")).toEqual(["a", "b", "c qual prefere?"]);
  });
});
