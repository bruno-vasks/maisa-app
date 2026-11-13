import { describe, expect, it } from "vitest";

/** O espaço do "R$" é o que não quebra (`reais`); aqui os testes escrevem com espaço comum. */
const sp = (t: string) => t.replace(/\u00a0/g, " ");
import {
  diasFalados, duracaoFalada, falaDoHorario, falaDoNegocio, falaDosServicos, horaFalada, precoDigitado,
} from "./previa";

describe("prévia da conversa do onboarding", () => {
  it("apresenta o negócio e quem atende, e fica em branco sem nada escrito", () => {
    expect(falaDoNegocio("", "")).toBe("");
    expect(falaDoNegocio("Studio Bruna Lima", "")).toBe("Oi! Aqui é a maisa, do Studio Bruna Lima.");
    expect(falaDoNegocio("Studio Bruna Lima", "Bruna")).toBe("Oi! Aqui é a maisa, do Studio Bruna Lima. Quer marcar um horário com Bruna?");
  });

  it("fala um serviço com preço e duração, e vários numa lista de até três", () => {
    expect(falaDosServicos([{ nome: "  ", duracao: 60, preco: 90 }])).toBe("");
    expect(sp(falaDosServicos([{ nome: "Corte feminino", duracao: 60, preco: 90 }]))).toBe("Corte feminino sai por R$ 90 e leva 1 hora.");
    expect(falaDosServicos([{ nome: "Escova", duracao: 45, preco: null }])).toBe("Escova leva 45 minutos.");
    expect(falaDosServicos([{ nome: "Avaliação", duracao: 30, preco: 0 }])).toBe("Avaliação leva 30 minutos.");
    expect(sp(falaDosServicos([
      { nome: "Corte", duracao: 60, preco: 90 },
      { nome: "Escova", duracao: 45, preco: 59.9 },
      { nome: "Coloração", duracao: 120, preco: 220 },
      { nome: "Hidratação", duracao: 30, preco: 50 },
    ]))).toBe("Temos corte (R$ 90), escova (R$ 59,90) e coloração (R$ 220), entre outros.");
  });

  it("diz os dias como se fala", () => {
    expect(diasFalados([0, 1, 2, 3, 4])).toBe("de segunda a sexta");
    expect(diasFalados([5])).toBe("aos sábados");
    expect(diasFalados([1])).toBe("às terças");
    expect(diasFalados([0, 2, 4])).toBe("segunda, quarta e sexta");
    expect(diasFalados([4, 5])).toBe("sexta e sábado");
    expect(diasFalados([])).toBe("");
  });

  it("fala o horário, e nada quando ele não fecha", () => {
    expect(falaDoHorario("Bruna", [0, 1, 2, 3, 4, 5], 9, 19.5)).toBe("Bruna atende de segunda a sábado, das 9h às 19h30. Qual dia fica melhor?");
    expect(falaDoHorario("", [0], 9, 18)).toBe("Atendemos às segundas, das 9h às 18h. Qual dia fica melhor?");
    expect(falaDoHorario("Bruna", [0], 18, 9)).toBe("");
    expect(falaDoHorario("Bruna", [], 9, 18)).toBe("");
  });

  it("converte o preço digitado do jeito brasileiro", () => {
    expect(precoDigitado("90")).toBe(90);
    expect(precoDigitado("59,90")).toBe(59.9);
    expect(precoDigitado("1.200,50")).toBe(1200.5);
    expect(precoDigitado("59.90")).toBe(59.9);
    expect(precoDigitado("1.200")).toBe(1200);
    expect(precoDigitado("")).toBeNull();
    expect(precoDigitado("0")).toBe(0);
    expect(precoDigitado("abc")).toBeNull();
    expect(duracaoFalada(90)).toBe("1h30");
    expect(duracaoFalada(120)).toBe("2 horas");
    expect(horaFalada(9.5)).toBe("9h30");
  });
});
