/* ─────────────────────────────────────────────────────────────────────────────
 * O RITMO DO CANAL — quanto o "digitando…" dura, e quem espera por quem.
 *
 * Pedido do Bruno em 27/10/2026: pela Evolution a MAISA é um WhatsApp Web não oficial, e
 * resposta instantânea em rajada é o desenho de robô que derruba o número. O que se prende
 * aqui é o que dá para errar sem ver: a primeira bolha voltar a sair sem digitar, o teto
 * da resposta crescer além do que o turno reserva, e a rotina voltar a disparar colado.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { atorAgente } from "@/nucleo/dominio/tenant";

import { caberNoPrazo, esperasDeDigitacao } from "./canal-evolution";

const sempre = (x: number) => () => x;
const LONGA = "a".repeat(300);

describe("o ritmo de conversa", () => {
  it("a primeira bolha também digita; no ritmo direto ela sai na hora, como antes", () => {
    expect(esperasDeDigitacao(["Oi, tudo bem?", "Tenho sexta às 15h."], "conversa", sempre(0.5))[0]).toBeGreaterThan(0);
    expect(esperasDeDigitacao(["Oi, tudo bem?", "Tenho sexta às 15h."], "direto")[0]).toBe(0);
  });

  it("proporcional ao tamanho: 95 a 130 ms por caractere, entre 1,4 s e 10 s por bolha", () => {
    const cinquenta = "b".repeat(50);
    expect(esperasDeDigitacao([cinquenta], "conversa", sempre(0))).toEqual([50 * 95]);
    expect(esperasDeDigitacao([cinquenta], "conversa", sempre(1))).toEqual([50 * 130]);
    expect(esperasDeDigitacao(["Ok!"], "conversa", sempre(0.5))).toEqual([1_400]);
    expect(esperasDeDigitacao([LONGA], "conversa", sempre(0.5))).toEqual([10_000]);
  });

  it("a resposta inteira não passa de 18 s: as bolhas encolhem na mesma proporção", () => {
    const esperas = esperasDeDigitacao([LONGA, LONGA, LONGA], "conversa", sempre(0.5));
    expect(esperas).toEqual([6_000, 6_000, 6_000]);
  });

  it("a rotina digita pouco: o lembrete é texto pronto", () => {
    expect(esperasDeDigitacao([LONGA], "rotina", sempre(0.5))).toEqual([4_000]);
  });
});

describe("caberNoPrazo", () => {
  const AGORA = 1_000_000;

  it("sem prazo, ou com folga, não mexe", () => {
    expect(caberNoPrazo([5_000, 3_000], undefined, AGORA)).toEqual([5_000, 3_000]);
    expect(caberNoPrazo([5_000, 3_000], AGORA + 60_000, AGORA)).toEqual([5_000, 3_000]);
  });

  it("apertado, encolhe tudo na mesma proporção, descontando a ida de cada bolha e a folga", () => {
    // sobra = 11 000 - 3 000 de folga - 2 × 1 500 de ida = 5 000 para 10 000 pedidos
    expect(caberNoPrazo([6_000, 4_000], AGORA + 11_000, AGORA)).toEqual([3_000, 2_000]);
  });

  it("sem tempo nenhum, a resposta sai sem digitar, mas sai", () => {
    expect(caberNoPrazo([6_000, 4_000], AGORA + 1_000, AGORA)).toEqual([0, 0]);
  });
});

/* ── o canal de verdade, com a Evolution falsa ── */

type Chamada = { caminho: string; corpo: any };
let chamadas: Chamada[];

const t: ContextoTenant = { tenantId: "t1", usuarioId: "", ator: atorAgente("teste") };

async function canalNoRitmo(ritmo: "conversa" | "rotina" | "direto", instancia: string) {
  vi.resetModules();
  const { criarCanalEvolution } = await import("./canal-evolution");
  return criarCanalEvolution({
    instanciaDe: async () => instancia,
    donoDe: async () => "5511900000000",
    ritmo,
    sorteio: sempre(0),
  });
}

beforeEach(() => {
  chamadas = [];
  vi.stubEnv("EVOLUTION_API_URL", "https://evo.teste");
  vi.stubEnv("EVOLUTION_API_KEY", "chave");
  vi.stubEnv("EVOLUTION_INSTANCIA", "padrao");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ caminho: new URL(url).pathname, corpo: JSON.parse(String(init.body ?? "{}")) });
    return new Response(JSON.stringify({ key: { id: "x" } }), { status: 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enviar, no ritmo de conversa", () => {
  it("cada bolha vai com o seu digitando, na ordem, e a primeira também", async () => {
    const canal = await canalNoRitmo("conversa", "barbearia");
    await canal.enviar(t, "11988887777", ["Oi, tudo bem?", "Tenho sexta às 15h."]);

    expect(chamadas.map((c) => c.caminho)).toEqual(["/message/sendText/barbearia", "/message/sendText/barbearia"]);
    expect(chamadas.map((c) => c.corpo.text)).toEqual(["Oi, tudo bem?", "Tenho sexta às 15h."]);
    expect(chamadas.map((c) => c.corpo.delay)).toEqual([1_400, "Tenho sexta às 15h.".length * 95]);
  });
});

describe("enviar, no ritmo de rotina", () => {
  it("duas pessoas do mesmo número nunca saem coladas: a segunda espera a vez", async () => {
    vi.useFakeTimers();
    const canal = await canalNoRitmo("rotina", "clinica");

    await canal.enviar(t, "11911110000", ["Lembrete da Ana"]);
    expect(chamadas).toHaveLength(1);

    const segunda = canal.enviar(t, "11922220000", ["Lembrete do Beto"]);
    await vi.advanceTimersByTimeAsync(2_900);
    expect(chamadas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await segunda;
    expect(chamadas).toHaveLength(2);
  });
});

describe("escalar", () => {
  it("o dono recebe um aviso por cliente a cada dez minutos, não um por mensagem", async () => {
    const canal = await canalNoRitmo("conversa", "barbearia");
    await canal.escalar(t, { telefone: "11988887777", motivo: "a MAISA ficou sem resposta do modelo" });
    await canal.escalar(t, { telefone: "11988887777", motivo: "a MAISA ficou sem resposta do modelo" });
    await canal.escalar(t, { telefone: "11977776666", motivo: "a MAISA ficou sem resposta do modelo" });

    expect(chamadas).toHaveLength(2);
    expect(chamadas.every((c) => c.corpo.number === "5511900000000")).toBe(true);
  });
});
