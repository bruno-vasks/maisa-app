/* ─────────────────────────────────────────────────────────────────────────────
 * AJUSTAR O EXPEDIENTE — o que a ficha do profissional manda gravar (24/10/2026).
 *
 * O expediente decide o que a Agenda deixa marcar e o que a MAISA oferece no WhatsApp. O que
 * se testa é o que, errado, fecha ou abre a agenda de alguém sem erro nenhum: nenhum dia,
 * domingo, faixa invertida, profissional de outro negócio, e a frase da tabela de Equipe
 * regravada junto do número.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it, vi } from "vitest";
import { criarAjustarExpediente } from "./expediente";
import { SEM_DIA_DE_ATENDIMENTO } from "../dominio/expediente";
import { DadoInvalido, NaoEncontrado } from "../dominio/erros";
import type { ContextoTenant } from "../dominio/tenant";
import type { Profissional } from "../dominio/catalogo";
import type { RascunhoDeExpediente, RepositorioNegocio } from "../portas/saida/repositorio-negocio";

const T: ContextoTenant = { tenantId: "t-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };
const OUTRO: ContextoTenant = { tenantId: "t-2", usuarioId: "u-2", ator: { tipo: "usuario", id: "u-2" } };

const profissional = (id: string): Profissional => ({
  id, nome: "Ana", papel: "Psicóloga", atendimentosMes: 0, avaliacao: 0, comissao: 0, desde: "ago/2026",
  servicoIds: [], ativo: true, horario: "Seg–Sex 09–19", folga: "sábado e domingo",
  expediente: { folga: [5, 6], de: 9, ate: 19 },
});

/** Um banco em memória com DOIS negócios: o que importa é a fronteira entre eles. */
function banco() {
  const linhas = new Map<string, Profissional>([["t-1:pr-1", profissional("pr-1")], ["t-2:pr-9", profissional("pr-9")]]);
  const salvarExpediente = vi.fn(async (t: ContextoTenant, r: RascunhoDeExpediente) => {
    const chave = `${t.tenantId}:${r.id}`;
    const atual = linhas.get(chave);
    if (!atual) throw new NaoEncontrado("Profissional deste negócio");
    const novo = { ...atual, expediente: r.expediente, horario: r.horario, folga: r.folga };
    linhas.set(chave, novo);
    return novo;
  });
  const repo = {
    profissional: vi.fn(async (t: ContextoTenant, id: string) => linhas.get(`${t.tenantId}:${id}`) ?? null),
    salvarExpediente,
  } as unknown as RepositorioNegocio;
  return { repo, linhas, salvarExpediente };
}

const pedido = { profissionalId: "pr-1", dias: [0, 1, 2, 3, 4, 5], de: 9, ate: 19 };

describe("gravar o expediente", () => {
  it("grava a folga como o que sobra, o horário, e regrava as duas frases junto", async () => {
    const { repo, salvarExpediente } = banco();
    const salvo = await criarAjustarExpediente({ negocio: repo })(T, { ...pedido, dias: [0, 1, 2, 3, 4], de: 10, ate: 20 });

    expect(salvarExpediente).toHaveBeenCalledWith(T, {
      id: "pr-1",
      expediente: { folga: [5, 6], de: 10, ate: 20 },
      /* A frase da tabela de Equipe. Sem regravá-la, a leitura (`l.horario ?? frase`) seguiria
       * mostrando "Seg–Sex 09–19" depois de a agenda mudar para 10–20. */
      horario: "Seg–Sex 10–20",
      folga: "sábado e domingo",
    });
    expect(salvo.expediente).toEqual({ folga: [5, 6], de: 10, ate: 20 });
    expect(salvo.horario).toBe("Seg–Sex 10–20");
  });

  it("devolve o profissional como ficou gravado, e não o que foi mandado", async () => {
    const { repo } = banco();
    const salvo = await criarAjustarExpediente({ negocio: repo })(T, pedido);
    expect(salvo.id).toBe("pr-1");
    expect(salvo.horario).toBe("Seg–Sáb 09–19");
    expect(salvo.folga).toBe("domingo");
  });

  it("aceita os horários de quem atende à noite e de meia em meia hora", async () => {
    const { repo, salvarExpediente } = banco();
    await criarAjustarExpediente({ negocio: repo })(T, { ...pedido, de: 13.5, ate: 21 });
    expect(salvarExpediente).toHaveBeenCalledWith(T, expect.objectContaining({
      expediente: { folga: [6], de: 13.5, ate: 21 }, horario: "Seg–Sáb 13:30–21",
    }));
  });

  it("dia repetido é o mesmo dia, e a ordem não importa", async () => {
    const { repo, salvarExpediente } = banco();
    await criarAjustarExpediente({ negocio: repo })(T, { ...pedido, dias: [4, 2, 2, 0] });
    expect(salvarExpediente).toHaveBeenCalledWith(T, expect.objectContaining({
      expediente: { folga: [1, 3, 5, 6], de: 9, ate: 19 }, horario: "Seg, Qua, Sex 09–19",
    }));
  });

  it("nunca grava domingo como dia de atendimento, em nenhuma combinação válida", async () => {
    const { repo, salvarExpediente } = banco();
    const ajustar = criarAjustarExpediente({ negocio: repo });
    for (let mascara = 1; mascara < 64; mascara++) {
      const dias = [0, 1, 2, 3, 4, 5].filter((_, i) => mascara & (1 << i));
      await ajustar(T, { ...pedido, dias });
    }
    expect(salvarExpediente).toHaveBeenCalledTimes(63);
    for (const [, r] of salvarExpediente.mock.calls) expect(r.expediente.folga).toContain(6);
  });
});

describe("o que ele recusa", () => {
  it("recusa nenhum dia, e a mensagem manda para o Pausado", async () => {
    const { repo, salvarExpediente } = banco();
    await expect(criarAjustarExpediente({ negocio: repo })(T, { ...pedido, dias: [] })).rejects.toMatchObject({
      campo: "dias", motivo: SEM_DIA_DE_ATENDIMENTO,
    });
    expect(SEM_DIA_DE_ATENDIMENTO).toMatch(/Pausado/);
    expect(salvarExpediente).not.toHaveBeenCalled();
  });

  it("recusa domingo, sozinho ou junto dos outros", async () => {
    const { repo, salvarExpediente } = banco();
    const ajustar = criarAjustarExpediente({ negocio: repo });
    await expect(ajustar(T, { ...pedido, dias: [6] })).rejects.toThrow(/Domingo/);
    await expect(ajustar(T, { ...pedido, dias: [0, 1, 2, 3, 4, 5, 6] })).rejects.toThrow(DadoInvalido);
    expect(salvarExpediente).not.toHaveBeenCalled();
  });

  it.each([
    ["não é lista", "segunda"],
    ["dia fracionário", [1.5]],
    ["dia negativo", [-1]],
    ["dia depois do domingo", [7]],
    ["texto no lugar do dia", ["1"]],
    ["ausente", undefined],
  ])("recusa dias que %s", async (_rotulo, dias) => {
    const { repo, salvarExpediente } = banco();
    await expect(
      criarAjustarExpediente({ negocio: repo })(T, { ...pedido, dias: dias as never }),
    ).rejects.toMatchObject({ campo: "dias" });
    expect(salvarExpediente).not.toHaveBeenCalled();
  });

  it.each([
    ["até igual ao das", 12, 12],
    ["até antes do das", 15, 10],
  ])("recusa %s", async (_rotulo, de, ate) => {
    const { repo, salvarExpediente } = banco();
    await expect(criarAjustarExpediente({ negocio: repo })(T, { ...pedido, de, ate })).rejects.toMatchObject({
      campo: "ate", motivo: expect.stringMatching(/depois do começo/),
    });
    expect(salvarExpediente).not.toHaveBeenCalled();
  });

  it.each([
    ["das fora do passo de meia hora", { de: 9.25 }, "de"],
    ["até fora do passo de meia hora", { ate: 18.75 }, "ate"],
    ["das antes da janela da Agenda", { de: 6 }, "de"],
    ["até depois da janela da Agenda", { ate: 23 }, "ate"],
    ["das como texto", { de: "9" }, "de"],
    ["das vazio, que Number() faria virar 0", { de: "" }, "de"],
    ["até ausente", { ate: undefined }, "ate"],
    ["das que não é número", { de: Number.NaN }, "de"],
  ])("recusa %s", async (_rotulo, troca, campo) => {
    const { repo, salvarExpediente } = banco();
    await expect(
      criarAjustarExpediente({ negocio: repo })(T, { ...pedido, ...troca } as never),
    ).rejects.toMatchObject({ campo });
    expect(salvarExpediente).not.toHaveBeenCalled();
  });

  it("recusa pedido sem profissional", async () => {
    const { repo, salvarExpediente } = banco();
    const ajustar = criarAjustarExpediente({ negocio: repo });
    await expect(ajustar(T, { ...pedido, profissionalId: "  " })).rejects.toMatchObject({ campo: "profissionalId" });
    await expect(ajustar(T, undefined as never)).rejects.toThrow(DadoInvalido);
    expect(salvarExpediente).not.toHaveBeenCalled();
  });
});

describe("a fronteira entre negócios", () => {
  it("recusa o profissional de outro negócio e não grava nada", async () => {
    const { repo, linhas, salvarExpediente } = banco();
    const antes = linhas.get("t-2:pr-9");

    /* `pr-9` existe, mas é do negócio t-2. Quem pede é o t-1: a leitura pela porta, que
     * filtra por negócio, não o acha. */
    await expect(
      criarAjustarExpediente({ negocio: repo })(T, { ...pedido, profissionalId: "pr-9" }),
    ).rejects.toThrow(NaoEncontrado);

    expect(salvarExpediente).not.toHaveBeenCalled();
    expect(linhas.get("t-2:pr-9")).toBe(antes);
  });

  it("o negócio vem do contexto: o mesmo id dá resultados diferentes para cada sessão", async () => {
    const { repo } = banco();
    const ajustar = criarAjustarExpediente({ negocio: repo });
    await expect(ajustar(T, { ...pedido, profissionalId: "pr-1" })).resolves.toMatchObject({ id: "pr-1" });
    await expect(ajustar(OUTRO, { ...pedido, profissionalId: "pr-1" })).rejects.toThrow(NaoEncontrado);
  });

  it("profissional que não existe em lugar nenhum é recusado", async () => {
    const { repo, salvarExpediente } = banco();
    await expect(
      criarAjustarExpediente({ negocio: repo })(T, { ...pedido, profissionalId: "pr-404" }),
    ).rejects.toThrow(NaoEncontrado);
    expect(salvarExpediente).not.toHaveBeenCalled();
  });
});
