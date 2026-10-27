import { describe, expect, it } from "vitest";

import type { Msg } from "@/nucleo/dominio/conversas";

import { MAX_RESPOSTAS_NA_JANELA, pareceLaco, respostasDesde } from "./disjuntor";

const AGORA = Date.parse("2026-10-27T15:00:00-03:00");
const ha = (segundos: number) => new Date(AGORA - segundos * 1000).toISOString();

/** Uma troca: o cliente fala e a MAISA responde, `segundos` atrás. */
const troca = (segundos: number, cliente = "e aí?", bot = ["Tenho às 15h."]): Msg[] => [
  { de: "cliente", txt: cliente, em: ha(segundos + 5) },
  ...bot.map((txt) => ({ de: "bot" as const, txt, em: ha(segundos) })),
];

describe("respostasDesde", () => {
  it("bolhas seguidas são UMA resposta", () => {
    const msgs = troca(60, "oi", ["Oi!", "Tudo bem?", "Como posso ajudar?"]);
    expect(respostasDesde(msgs, AGORA - 600_000, AGORA)).toBe(1);
  });

  it("resposta fora da janela não conta", () => {
    expect(respostasDesde([...troca(1_200), ...troca(30)], AGORA - 600_000, AGORA)).toBe(1);
  });
});

describe("pareceLaco", () => {
  it("conversa de agendamento normal passa", () => {
    const msgs = [...troca(500), ...troca(300), ...troca(120), ...troca(40), { de: "cliente" as const, txt: "obrigado!" }];
    expect(pareceLaco(msgs, AGORA)).toBeNull();
  });

  it("a mesma mensagem longa pela terceira vez é resposta automática de outro robô", () => {
    const auto = "Olá! Recebemos sua mensagem e em breve retornaremos.";
    const duas = [...troca(90, auto), ...troca(45, auto)];
    expect(pareceLaco([...duas.slice(0, 2), { de: "cliente", txt: auto }], AGORA)).toBeNull();
    expect(pareceLaco([...duas, { de: "cliente", txt: auto }], AGORA)).toMatch(/3 vezes/);
  });

  it("mensagem curta repetida é coisa de gente (\"oi?\", \"ok\")", () => {
    const msgs = [...troca(90, "oi?"), ...troca(45, "oi?"), { de: "cliente" as const, txt: "oi?" }];
    expect(pareceLaco(msgs, AGORA)).toBeNull();
  });

  it(`${MAX_RESPOSTAS_NA_JANELA} respostas em dez minutos desarmam; uma a menos, não`, () => {
    const onze = Array.from({ length: MAX_RESPOSTAS_NA_JANELA - 1 }, (_, i) => troca(30 + i * 40, `mensagem ${i}`)).reverse().flat();
    expect(pareceLaco([...onze, { de: "cliente", txt: "e agora?" }], AGORA)).toBeNull();
    const doze = [...troca(500, "mais uma"), ...onze];
    expect(pareceLaco([...doze, { de: "cliente", txt: "e agora?" }], AGORA)).toMatch(/12 vezes em 10 minutos/);
  });
});
