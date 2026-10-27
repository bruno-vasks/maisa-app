/* O Pix copia e cola: o exemplo do Manual de Padrões para Iniciação do Pix tem que sair igual,
 * byte a byte, e os casos do `teste_pix.sql` do Smiller também. */

import { describe, expect, it } from "vitest";

import {
  chavePix, cnpjValido, crc16, identificadorDoPix, pixCopiaECola, textoDoPix, tipoProvavel,
} from "./pix";

describe("o BR Code", () => {
  it("o exemplo do manual do Banco Central sai exato, com CRC 1D3D", () => {
    expect(pixCopiaECola({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA" })).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("com valor, nome sem acento, cidade e identificador", () => {
    const c = pixCopiaECola({ chave: "fin@sorriso.com.br", nome: "Clínica Sorriso", cidade: "Salvador", valor: 250, identificador: "SMP123" });
    expect(c).toMatch(/5406250\.005802BR5915Clinica Sorriso6008Salvador62100506SMP1236304[0-9A-F]{4}$/);
  });

  it("o CRC confere no código com valor quebrado", () => {
    const c = pixCopiaECola({ chave: "fin@sorriso.com.br", nome: "Clínica Sorriso", cidade: "Salvador", valor: 1234.5, identificador: "SMP7" });
    expect(c).toContain("54071234.50");
    expect(c.slice(-4)).toBe(crc16(c.slice(0, -4)));
  });

  it("sem nome e sem cidade, os padrões; sem valor, quem paga digita", () => {
    const c = pixCopiaECola({ chave: "+5571999990000", nome: "", cidade: null, valor: 0 });
    expect(c).toContain("5909RECEBEDOR6006BRASIL");
    expect(c).not.toContain("5406");
  });
});

describe("o texto e o identificador", () => {
  it("nome sem acento e no teto de 25", () => {
    expect(textoDoPix("Clínica São José Odontologia Avançada", 25)).toBe("Clinica Sao Jose Odontolo");
  });

  it("corta sem deixar espaço sobrando no fim", () => {
    expect(textoDoPix("Barbearia do João Paulo", 16)).toBe("Barbearia do Joa");
    expect(textoDoPix("Ana  Maria   Souza", 9)).toBe("Ana Maria");
  });

  it("identificador só com letras e números", () => {
    expect(identificadorDoPix("MAISA-12ab_cd")).toBe("MAISA12abcd");
    expect(identificadorDoPix(null)).toBe("***");
  });
});

describe("a chave, dentro do tipo que o dono escolheu", () => {
  it("normaliza como o Pix conhece", () => {
    expect(chavePix("telefone", "(71) 99999-0000")).toBe("+5571999990000");
    expect(chavePix("telefone", "+55 55 99999-1234")).toBe("+5555999991234");
    expect(chavePix("telefone", "55999991234")).toBe("+5555999991234");
    expect(chavePix("cpf", "123.456.789-09")).toBe("12345678909");
    expect(chavePix("email", "Financeiro@Clinica.com.br")).toBe("financeiro@clinica.com.br");
    expect(chavePix("cnpj", "11.222.333/0001-81")).toBe("11222333000181");
    expect(chavePix("aleatoria", "123E4567-E12B-12D1-A456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
  });

  it("recusa o que não é chave daquele tipo", () => {
    expect(chavePix("cpf", "123.456.789-00")).toBeNull();
    expect(chavePix("cnpj", "11.222.333/0001-82")).toBeNull();
    expect(chavePix("telefone", "9999-0000")).toBeNull();
    expect(chavePix("email", "sem-arroba")).toBeNull();
    expect(chavePix("aleatoria", "123")).toBeNull();
  });

  it("sugere o tipo ao colar, e não chuta quando onze dígitos podem ser as duas coisas", () => {
    expect(tipoProvavel("ana@x.com")).toBe("email");
    expect(tipoProvavel("123e4567-e12b-12d1-a456-426655440000")).toBe("aleatoria");
    expect(tipoProvavel("+55 71 99999-0000")).toBe("telefone");
    expect(tipoProvavel("11.222.333/0001-81")).toBe("cnpj");
    expect(tipoProvavel("123.456.789-09")).toBe("cpf");
    expect(tipoProvavel("(71) 99999-0000")).toBe("telefone");
    expect(tipoProvavel("")).toBeNull();
  });

  it("CNPJ pelo dígito verificador", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
});
