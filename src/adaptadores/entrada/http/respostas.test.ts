import { describe, expect, it } from "vitest";
import { fraseParaATela } from "./respostas";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";

describe("o que a tela lê de um erro inesperado", () => {
  it("frase de banco não chega ao toast", () => {
    const e = new FalhaDoProvedor(`Não foi possível ler o cliente: null value in column "telefone" of relation "clientes" violates not-null constraint`);
    expect(fraseParaATela(e)).toBe("Algo falhou do nosso lado. Tente de novo em alguns instantes.");
  });

  /* 01/10/2026: a coluna que falta (banco sem a 030) vem do PostgREST com aspas simples, e
   * passava pelo filtro em inglês até a tela. */
  it("coluna que o banco não conhece também não chega", () => {
    const e = new FalhaDoProvedor("Não foi possível ler o cliente: Could not find the 'valor_sessao' column of 'clientes' in the schema cache");
    expect(fraseParaATela(e)).toBe("Algo falhou do nosso lado. Tente de novo em alguns instantes.");
  });

  it("frase escrita para o usuário passa — é a pista do que consertar", () => {
    const e = new FalhaDoProvedor("A Focus recusou o certificado: senha incorreta");
    expect(fraseParaATela(e)).toBe("A Focus recusou o certificado: senha incorreta");
  });
});
