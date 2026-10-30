/* O adaptador da Anthropic contra um cliente falso: o que vai no pedido (modelo, raciocínio,
 * esforço, fallback, cache) e o turno com ferramentas voltando igual no passo seguinte. */

import { describe, expect, it } from "vitest";

import type { PedidoAoModelo } from "@/nucleo/portas/saida/modelo-conversa";
import { criarModeloAnthropic, MODELO_ANTHROPIC, paraMensagens } from "./modelo-anthropic";

/** Um cliente que guarda os pedidos e devolve as respostas na ordem. */
function clienteFalso(respostas: unknown[]) {
  const pedidos: Record<string, unknown>[] = [];
  const cliente = {
    beta: {
      messages: {
        create: async (pedido: Record<string, unknown>) => {
          pedidos.push(JSON.parse(JSON.stringify(pedido)));
          return respostas.shift();
        },
      },
    },
  };
  return { cliente: cliente as unknown as Parameters<typeof criarModeloAnthropic>[0], pedidos };
}

const PEDIDO: PedidoAoModelo = {
  sistemaEstavel: "Você é a secretária.",
  sistemaVolatil: "Hoje é 30/10/2026.",
  ferramentas: [{ nome: "ver_horarios", descricao: "Horários livres", parametros: { type: "object", properties: {} } }],
  turnos: [{ papel: "cliente", texto: "Tem horário amanhã?" }],
  maxTokens: 2000,
};

const PENSOU = { type: "thinking", thinking: "", signature: "assinatura-opaca" };
const CHAMOU = { type: "tool_use", id: "toolu_1", name: "ver_horarios", input: { dia: "2026-10-31" } };

describe("o pedido à Anthropic", () => {
  it("vai no Sonnet 5.5, com raciocínio adaptativo, esforço baixo, fallback e o cache no bloco estável", async () => {
    const { cliente, pedidos } = clienteFalso([{ stop_reason: "end_turn", content: [{ type: "text", text: "Tenho às 10h." }] }]);
    const r = await criarModeloAnthropic(cliente).conversar(PEDIDO);

    expect(r).toEqual({ texto: "Tenho às 10h.", chamadas: [], recusou: false });
    expect(pedidos[0]).toMatchObject({
      model: MODELO_ANTHROPIC,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: "Você é a secretária.", cache_control: { type: "ephemeral" } },
        { type: "text", text: "Hoje é 30/10/2026." },
      ],
    });
    expect(MODELO_ANTHROPIC).toBe("claude-sonnet-5-5");
  });

  it("recusa (de todos os modelos da cadeia) vira `recusou`, sem texto", async () => {
    const { cliente } = clienteFalso([{ stop_reason: "refusal", content: [] }]);
    expect(await criarModeloAnthropic(cliente).conversar(PEDIDO)).toEqual({ texto: "", chamadas: [], recusou: true });
  });
});

describe("o turno com ferramentas, de um passo para o outro", () => {
  it("volta exatamente como o modelo escreveu, raciocínio incluso", async () => {
    const { cliente, pedidos } = clienteFalso([
      { stop_reason: "tool_use", content: [PENSOU, CHAMOU] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Amanhã tenho às 10h." }] },
    ]);
    const modelo = criarModeloAnthropic(cliente);
    const passo1 = await modelo.conversar(PEDIDO);
    expect(passo1.chamadas).toHaveLength(1);
    expect(passo1.chamadas[0].estadoOpaco).toBe(JSON.stringify([PENSOU, CHAMOU]));

    /* O agente devolve o turno e o resultado da ferramenta, como em `agente.ts`. */
    await modelo.conversar({
      ...PEDIDO,
      turnos: [
        ...PEDIDO.turnos,
        { papel: "assistente_ferramentas", chamadas: passo1.chamadas },
        { papel: "resultados", resultados: [{ id: "toolu_1", nome: "ver_horarios", texto: "10h e 15h", erro: false }] },
      ],
    });
    expect((pedidos[1].messages as unknown[])[1]).toEqual({ role: "assistant", content: [PENSOU, CHAMOU] });
  });

  it("quando outro modelo terminou a resposta (fallback), o turno volta reconstruído", async () => {
    const { cliente } = clienteFalso([{
      stop_reason: "tool_use",
      content: [{ type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" } }, CHAMOU],
    }]);
    const passo1 = await criarModeloAnthropic(cliente).conversar(PEDIDO);
    expect(passo1.chamadas[0].estadoOpaco).toBeUndefined();
  });

  it("sem estado, ou com o estado de outro provedor, monta o turno com o texto e as chamadas", () => {
    const msgs = paraMensagens([
      { papel: "cliente", texto: "Oi" },
      {
        papel: "assistente_ferramentas",
        texto: "Vou olhar.",
        chamadas: [{ id: "c1", nome: "ver_horarios", argumentos: {}, estadoOpaco: "thoughtSignature-do-gemini" }],
      },
    ]);
    expect(msgs[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Vou olhar." }, { type: "tool_use", id: "c1", name: "ver_horarios", input: {} }],
    });
  });
});
