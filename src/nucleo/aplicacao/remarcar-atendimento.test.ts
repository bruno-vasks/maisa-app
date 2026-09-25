/* ─────────────────────────────────────────────────────────────────────────────
 * Remarcar (1B.5): o banco primeiro, o calendário externo depois e sem derrubar nada.
 *
 * O que estes testes travam, na ordem em que importa:
 *   · o atendimento muda de horário SEM trocar de identidade (`eventoId`, Meet, chave);
 *   · o calendário que lança não desfaz a remarcação: ela vale, e a resposta avisa;
 *   · o horário ocupado é recusado antes de qualquer efeito lá fora;
 *   · o banco que engole a falha não vira "movido" na tela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it, vi } from "vitest";
import { criarRemarcarAtendimento } from "./remarcar-atendimento";
import { DadoInvalido, FalhaDoProvedor, HorarioOcupado, NaoEncontrado, PrecisaReconectar } from "../dominio/erros";
import { instanteISO } from "../dominio/tempo";
import type { ContextoTenant } from "../dominio/tenant";
import type { AgendaExterna } from "../portas/saida/agenda-externa";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { AtendimentoRegistrado, RegistroDeAtendimentos } from "../portas/saida/registro-atendimentos";

const T: ContextoTenant = { tenantId: "t-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };
const PROF = "11111111-1111-4111-8111-111111111111";
const AG = "44444444-4444-4444-8444-444444444444";
const AG2 = "55555555-5555-4555-8555-555555555555";
const DIA = "2026-10-15";
const AGORA = () => Date.parse(`${DIA}T06:00:00-03:00`);

const negocio = {
  agendasPermitidas: vi.fn(async () => [PROF]),
} as unknown as RepositorioNegocio;

function linha(sobre: Partial<AtendimentoRegistrado> = {}): AtendimentoRegistrado {
  const inicio = sobre.horaInicio ?? 9;
  return {
    maisaAg: AG, agendaId: PROF, clienteId: null, clienteNome: "Ana", clienteTel: "11999990000",
    servicoId: null, servicoNome: "Sessão", servicoValor: 200,
    inicioISO: instanteISO(DIA, inicio), fimISO: instanteISO(DIA, inicio + 1), duracaoMin: 60,
    dataLocal: DIA, horaInicio: inicio, eventoId: null, meetLink: null, htmlLink: null,
    situacao: "marcado", ...sobre,
  };
}

/** Registro em memória com a constraint de exclusão. `surdo` finge o banco que engole a falha. */
function registro(linhas: AtendimentoRegistrado[], surdo = false) {
  const reg = {
    listarJanela: vi.fn(async () => []),
    listar: vi.fn(async () => linhas),
    buscarPorAg: vi.fn(async (_t: ContextoTenant, p: { maisaAg: string }) => linhas.find((l) => l.maisaAg === p.maisaAg) ?? null),
    registrar: vi.fn(async (_t: ContextoTenant, a: AtendimentoRegistrado) => {
      const colide = linhas.some((l) => l.agendaId === a.agendaId && l.situacao === "marcado" && l.maisaAg !== a.maisaAg &&
        l.inicioISO < a.fimISO && l.fimISO > a.inicioISO);
      if (colide) throw new HorarioOcupado();
      if (surdo) return;
      const i = linhas.findIndex((l) => l.maisaAg === a.maisaAg);
      linhas[i] = { ...linhas[i], ...a };
    }),
    cancelar: vi.fn(async () => undefined),
  };
  return Object.assign(reg as unknown as RegistroDeAtendimentos, { linhas, espiao: reg });
}

function agenda(lanca = false) {
  const remarcar = vi.fn(async () => { if (lanca) throw new PrecisaReconectar("Conecte de novo."); });
  return Object.assign({ listar: vi.fn(), buscarPorAtendimento: vi.fn(), criar: vi.fn(), remarcar, cancelar: vi.fn() } as unknown as AgendaExterna, { remarcar });
}

const pedido = (sobre: Record<string, unknown> = {}) => ({ agendaId: PROF, maisaAg: AG, data: DIA, inicio: 15, ...sobre });

describe("remarcar, sem calendário externo", () => {
  it("move 09:00 para 15:00 na mesma linha, e a identidade é a chave", async () => {
    const reg = registro([linha()]);
    const r = await criarRemarcarAtendimento({ agenda: agenda(true), negocio, registro: reg, agora: AGORA })(T, pedido());

    expect(r.situacao).toBe("remarcado");
    expect(r.eventoId).toBe(AG);
    expect(r.foraDoCalendario).toBe(false);
    expect(reg.linhas).toHaveLength(1);
    expect(reg.linhas[0].horaInicio).toBe(15);
    expect(Date.parse(reg.linhas[0].inicioISO)).toBe(Date.parse(instanteISO(DIA, 15)));
    expect(Date.parse(reg.linhas[0].fimISO)).toBe(Date.parse(instanteISO(DIA, 16)));
  });

  it("o mesmo horário não grava nada", async () => {
    const reg = registro([linha()]);
    const r = await criarRemarcarAtendimento({ agenda: agenda(), negocio, registro: reg, agora: AGORA })(T, pedido({ inicio: 9 }));
    expect(r.situacao).toBe("mesmo_horario");
    expect(reg.espiao.registrar).not.toHaveBeenCalled();
  });
});

describe("remarcar, com calendário conectado", () => {
  const comGoogle = () => linha({ eventoId: "ev-google-1", meetLink: "https://meet/x", htmlLink: "https://cal/x" });

  it("move o evento lá fora com o MESMO id, e o Meet continua o mesmo", async () => {
    const reg = registro([comGoogle()]);
    const cal = agenda();
    const r = await criarRemarcarAtendimento({ agenda: cal, negocio, registro: reg, agora: AGORA })(T, pedido());

    expect(cal.remarcar).toHaveBeenCalledTimes(1);
    expect(cal.remarcar).toHaveBeenCalledWith(
      { tenant: T, agendaId: PROF },
      { eventoId: "ev-google-1", inicio: instanteISO(DIA, 15), fim: instanteISO(DIA, 16) },
    );
    expect(r.eventoId).toBe("ev-google-1");
    expect(r.meetLink).toBe("https://meet/x");
    expect(reg.linhas[0].eventoId).toBe("ev-google-1");
    expect(reg.linhas[0].meetLink).toBe("https://meet/x");
  });

  it("★ o Google lança: a remarcação vale no produto, e a resposta avisa", async () => {
    const reg = registro([comGoogle()]);
    const r = await criarRemarcarAtendimento({ agenda: agenda(true), negocio, registro: reg, agora: AGORA })(T, pedido());

    expect(r.situacao).toBe("remarcado");
    expect(r.foraDoCalendario).toBe(true);
    expect(r.eventoId).toBe("ev-google-1");
    expect(reg.linhas[0].horaInicio).toBe(15);
  });
});

describe("o que remarcar recusa", () => {
  it("horário ocupado: sobe HorarioOcupado, e o calendário nem é chamado", async () => {
    const reg = registro([linha(), linha({ maisaAg: AG2, horaInicio: 15 })]);
    const cal = agenda();
    await expect(
      criarRemarcarAtendimento({ agenda: cal, negocio, registro: reg, agora: AGORA })(T, pedido({ inicio: 15.5 })),
    ).rejects.toBeInstanceOf(HorarioOcupado);
    expect(cal.remarcar).not.toHaveBeenCalled();
    expect(reg.linhas[0].horaInicio).toBe(9);
  });

  it("★ banco que engole a falha não vira 'movido': lança e não mexe no calendário", async () => {
    const reg = registro([linha({ eventoId: "ev-google-1" })], true);
    const cal = agenda();
    await expect(
      criarRemarcarAtendimento({ agenda: cal, negocio, registro: reg, agora: AGORA })(T, pedido()),
    ).rejects.toBeInstanceOf(FalhaDoProvedor);
    expect(cal.remarcar).not.toHaveBeenCalled();
  });

  it("atendimento cancelado não se remarca", async () => {
    const reg = registro([linha({ situacao: "cancelado" })]);
    await expect(
      criarRemarcarAtendimento({ agenda: agenda(), negocio, registro: reg, agora: AGORA })(T, pedido()),
    ).rejects.toBeInstanceOf(DadoInvalido);
  });

  it("a chave de outra agenda não se acha por esta", async () => {
    const reg = registro([linha({ agendaId: "outra" })]);
    await expect(
      criarRemarcarAtendimento({ agenda: agenda(), negocio, registro: reg, agora: AGORA })(T, pedido()),
    ).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("agenda fora do negócio é recusada antes de ler qualquer linha", async () => {
    const reg = registro([linha()]);
    await expect(
      criarRemarcarAtendimento({ agenda: agenda(), negocio, registro: reg, agora: AGORA })(T, pedido({ agendaId: "intrusa" })),
    ).rejects.toBeInstanceOf(DadoInvalido);
    expect(reg.espiao.buscarPorAg).not.toHaveBeenCalled();
  });
});
