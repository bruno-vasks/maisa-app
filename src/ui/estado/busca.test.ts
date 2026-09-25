import { describe, expect, it } from "vitest";
import { casaBusca, semAcento } from "./busca";

const mariana = { nome: "Mariana Silva", numeros: ["(11) 98123-4567", "312.456.789-01"] };
const joao = { nome: "João Souza", numeros: ["", ""] };

describe("casaBusca · Clientes e Meus contatos (1C.8)", () => {
  it("telefone sem a máscara acha o formatado", () => {
    expect(casaBusca(mariana, "981234567")).toBe(true);
    expect(casaBusca(mariana, "(11) 9812")).toBe(true);
  });
  it("pedaço do CPF com pontuação acha", () => {
    expect(casaBusca(mariana, "312.456")).toBe(true);
  });
  it("nome sem acento e sem caixa", () => {
    expect(casaBusca(mariana, "Silva")).toBe(true);
    expect(casaBusca(mariana, "sílva")).toBe(true);
    expect(casaBusca(joao, "joao")).toBe(true);
  });
  it("não acha quem não é", () => {
    expect(casaBusca(joao, "981234567")).toBe(false);
    expect(casaBusca(mariana, "souza")).toBe(false);
  });
  it("menos de três dígitos não casa por número; vazio acha todos", () => {
    expect(casaBusca(mariana, "11")).toBe(false);
    expect(casaBusca(joao, "  ")).toBe(true);
  });
  it("semAcento", () => { expect(semAcento("Fábio Ção")).toBe("fabio cao"); });
});
