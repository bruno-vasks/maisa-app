import { describe, expect, it, vi } from "vitest";
import { criarAgendarRecorrente } from "./agendar-atendimento";
import { DadoInvalido, HorarioOcupado } from "../dominio/erros";
import { numeroDigitado, ocorrenciasDaSerie, valorDoRascunho } from "../dominio/agenda";
import type { ContextoTenant } from "../dominio/tenant";
import type { PedidoDeAgendamento } from "../portas/entrada/casos-de-uso";

const T = { tenantId: "t1" } as unknown as ContextoTenant;
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const base = {
  agendaId: "pr1", maisaAg: uuid(0), data: "2026-10-05", inicio: 14,
  servicoId: "sv1", clienteId: "cl1", servicoValor: 150,
};
const agendou = (p: PedidoDeAgendamento) => ({
  situacao: "criado" as const, eventoId: p.maisaAg, meetLink: null, htmlLink: null,
  inicioISO: `${p.data}T14:00:00-03:00`, semMeet: false, foraDoCalendario: true,
});

describe("marcar uma série", () => {
  it("uma marcação por data, a cada N semanas, com o preço digitado em todas", async () => {
    const agendar = vi.fn(async (_t: ContextoTenant, p: PedidoDeAgendamento) => agendou(p));
    const serie = await criarAgendarRecorrente({ agendar })(T, {
      ...base, cadaSemanas: 2, chaves: [uuid(0), uuid(1), uuid(2)],
    });
    expect(serie.criados.map((c) => c.data)).toEqual(["2026-10-05", "2026-10-19", "2026-11-02"]);
    expect(agendar.mock.calls.every(([, p]) => p.servicoValor === 150)).toBe(true);
    expect(serie.pulados).toEqual([]);
  });

  it("data com horário ocupado é PULADA e dita — as outras entram", async () => {
    const agendar = vi.fn(async (_t: ContextoTenant, p: PedidoDeAgendamento) => {
      if (p.data === "2026-10-12") throw new HorarioOcupado();
      return agendou(p);
    });
    const serie = await criarAgendarRecorrente({ agendar })(T, {
      ...base, cadaSemanas: 1, chaves: [uuid(0), uuid(1), uuid(2)],
    });
    expect(serie.criados).toHaveLength(2);
    expect(serie.pulados).toEqual([{ data: "2026-10-12", motivo: "Esse horário já está ocupado." }]);
  });

  it("se NENHUMA entrou, a recusa sobe como numa marcação avulsa", async () => {
    const agendar = vi.fn(async () => { throw new DadoInvalido("Essa agenda não existe neste negócio.", "agendaId"); });
    await expect(criarAgendarRecorrente({ agendar })(T, { ...base, cadaSemanas: 1, chaves: [uuid(0), uuid(1)] }))
      .rejects.toMatchObject({ campo: "agendaId" });
  });

  it("recusa chave repetida — a segunda data 'já existiria' na primeira", async () => {
    const agendar = vi.fn();
    await expect(criarAgendarRecorrente({ agendar })(T, { ...base, cadaSemanas: 1, chaves: [uuid(0), uuid(0)] }))
      .rejects.toMatchObject({ campo: "chaves" });
    expect(agendar).not.toHaveBeenCalled();
  });

  it("três meses de semanais são 13 sessões; um ano cabe no teto", () => {
    expect(ocorrenciasDaSerie(1, 3)).toBe(13);
    expect(ocorrenciasDaSerie(2, 3)).toBe(7);
    expect(ocorrenciasDaSerie(1, 12)).toBeLessThanOrEqual(52);
    expect(ocorrenciasDaSerie(0, 3)).toBe(1);
  });
});

describe("o preço digitado no atendimento", () => {
  const r = (valor?: string) => ({
    id: "x", maisaAg: uuid(0), data: "2026-10-05", profissionalId: "pr1", inicio: 14,
    clienteId: "cl1", servicoId: "sv1", valor,
  });
  it("vazio usa o preço do serviço", () => expect(valorDoRascunho(r(""), { preco: 200 })).toBe(200));
  it("aceita as grafias brasileiras", () => {
    expect(valorDoRascunho(r("180,50"))).toBe(180.5);
    expect(valorDoRascunho(r("1.250,00"))).toBe(1250);
    expect(valorDoRascunho(r("180.50"))).toBe(180.5);
    expect(valorDoRascunho(r("R$ 90"))).toBe(90);
  });
  it("o que não é dinheiro trava o botão", () => {
    expect(valorDoRascunho(r("abc"))).toBeNull();
    expect(valorDoRascunho(r("-10"))).toBeNull();
  });
  it("o número de qualquer campo da gaveta lê igual, e vazio não é zero", () => {
    expect(numeroDigitado("30")).toBe(30);
    expect(numeroDigitado("45")).toBe(45);
    expect(numeroDigitado("90,50")).toBe(90.5);
    expect(numeroDigitado(" R$ 1.250,00 ")).toBe(1250);
    expect(numeroDigitado("")).toBeNull();
    expect(numeroDigitado("3a")).toBeNull();
  });
});
