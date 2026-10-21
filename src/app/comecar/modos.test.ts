import { describe, expect, it } from "vitest";
import { ajustesDosModos, alternarModo } from "./modos";

describe("ajustesDosModos", () => {
  it("só recibo desliga tudo que sai pelo WhatsApp", () => {
    expect(ajustesDosModos(["recibos"])).toEqual({
      assistente: { ativa: false }, cfg: { lembrete: false, avisarRecibo: false },
    });
  });

  it("os três marcados ligam o agente, o lembrete e o aviso de recibo", () => {
    expect(ajustesDosModos(["conversa", "avisos", "recibos"])).toEqual({
      assistente: { ativa: true }, cfg: { lembrete: true, avisarRecibo: true },
    });
  });

  it("conversa sozinha não liga o aviso de recibo, que dispara do número do dono", () => {
    expect(ajustesDosModos(["conversa"]).cfg.avisarRecibo).toBe(false);
  });

  it("lembretes sem conversa deixam o agente calado", () => {
    expect(ajustesDosModos(["avisos", "recibos"])).toEqual({
      assistente: { ativa: false }, cfg: { lembrete: true, avisarRecibo: true },
    });
  });
});

describe("alternarModo", () => {
  it("marca e desmarca", () => {
    expect(alternarModo(["conversa"], "recibos")).toEqual(["conversa", "recibos"]);
    expect(alternarModo(["conversa", "recibos"], "conversa")).toEqual(["recibos"]);
  });
});
