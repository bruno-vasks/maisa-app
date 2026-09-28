/* O atendimento marcado pelo preço, sem serviço (Bruno, 28/09/2026): o nome do serviço que nasce
 * é a chave de reuso, e a duração é a que o negócio mais usa. */

import { describe, expect, it } from "vitest";
import { duracaoPadrao, nomeDoServicoAvulso } from "./agenda";

describe("nomeDoServicoAvulso", () => {
  it("é o nome da pessoa e o valor em reais, com duas casas", () => {
    expect(nomeDoServicoAvulso("Ana", 150)).toBe("Ana · R$ 150,00");
    expect(nomeDoServicoAvulso("Ana Souza", 180.5)).toBe("Ana Souza · R$ 180,50");
  });

  it("usa ponto de milhar, como o resto do app", () => {
    expect(nomeDoServicoAvulso("Ana", 1250)).toBe("Ana · R$ 1.250,00");
  });

  it("a mesma pessoa pelo mesmo preço dá o mesmo nome, mesmo com espaço sobrando", () => {
    expect(nomeDoServicoAvulso("  Ana ", 150)).toBe(nomeDoServicoAvulso("Ana", 150));
  });
});

describe("duracaoPadrao", () => {
  it("sem serviço nenhum é a sessão de terapia, 50 minutos", () => {
    expect(duracaoPadrao([])).toBe(50);
  });

  it("é a duração que mais se repete nos serviços ativos", () => {
    expect(duracaoPadrao([{ duracao: 30 }, { duracao: 40 }, { duracao: 40 }, { duracao: 60 }])).toBe(40);
  });

  it("ignora o serviço desligado", () => {
    expect(duracaoPadrao([{ duracao: 30 }, { duracao: 90, ativo: false }, { duracao: 90, ativo: false }])).toBe(30);
  });

  it("no empate fica a menor, para não ocupar a agenda a mais", () => {
    expect(duracaoPadrao([{ duracao: 60 }, { duracao: 30 }])).toBe(30);
  });

  it("ignora duração fora do razoável", () => {
    expect(duracaoPadrao([{ duracao: 0 }, { duracao: 0 }, { duracao: 45 }])).toBe(45);
  });
});
