import { describe, expect, it } from "vitest";

import { memoriaNova } from "@/nucleo/dominio/memoria";
import type { Servico } from "@/nucleo/dominio/catalogo";

import { doOuDa, nomeNaConversa, parteDoCliente } from "./persona";

describe("doOuDa", () => {
  it("o artigo vem da primeira palavra do nome do negócio", () => {
    expect(doOuDa("Barbearia do Zé")).toBe("da");
    expect(doOuDa("Clínica Sorriso")).toBe("da");
    expect(doOuDa("Espaço Acolher Psicologia")).toBe("do");
    expect(doOuDa("Studio K")).toBe("do");
  });
});

describe("nomeNaConversa", () => {
  it("a sigla padrão vira nome; nome escolhido pelo dono passa como veio", () => {
    expect(nomeNaConversa("MAISA")).toBe("maisa");
    expect(nomeNaConversa("Bia")).toBe("Bia");
  });
});

describe("parteDoCliente", () => {
  const servicos = [{ id: "sv-corte", nome: "Corte" }] as Servico[];
  const perfil = (historico: { data: string; inicio: number }[]) => ({
    telefone: "11990000001",
    clienteId: null,
    nome: "Lucas",
    memoria: {
      ...memoriaNova("11990000001", "2026-10-27T10:00:00-03:00"),
      nome: "Lucas",
      historico: historico.map((h) => ({ ...h, profissionalId: "pr-ze", servicoId: "sv-corte" })),
    },
  });

  it("diz a hora e o período do dia", () => {
    const texto = parteDoCliente({ perfil: perfil([]), hojeISO: "2026-10-27", agoraISO: "2026-10-28T01:40:00.000Z" });
    expect(texto).toContain("22h40 (noite)");
  });

  it("o que a MAISA já marcou aparece como marcado, não como 'última vez'", () => {
    const texto = parteDoCliente({
      perfil: perfil([{ data: "2026-09-29", inicio: 15 }, { data: "2026-10-28", inicio: 10.5 }]),
      hojeISO: "2026-10-27",
      servicos,
    });
    expect(texto).toContain("Já marcado: Corte, quarta, 28 de outubro às 10h30");
    expect(texto).toContain("Última vez: terça, 29 de setembro às 15h");
  });
});
