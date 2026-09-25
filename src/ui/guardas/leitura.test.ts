/* ─────────────────────────────────────────────────────────────────────────────
 * G12 · CARREGANDO NÃO É VAZIO.
 *
 * Cada tela que lê do servidor deriva o que desenha por uma função pura de
 * `estado/leitura.ts`, e este teste afirma, para cada uma, o que a auditoria do front achou
 * quebrado em 24/09/2026: leitura em voo nunca vira vazio, leitura que falhou nunca vira vazio.
 * Mesmo formato de `telas/Grades.test.ts` (`vocabulario`).
 *
 * O caso que a tela mostra quando os dois são verdade ao mesmo tempo (dado lido E erro na
 * releitura) também está aqui: o que foi lido fica.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { estadoDaFila, estadoDaGravacao, estadoDoDia, estadoDosContatos, semConfirmacao, type LeituraDaAgenda } from "@/ui/estado/leitura";
import type { StatusDaMaisa } from "@/nucleo/dominio/status-da-maisa";

const AGENDA: Record<string, LeituraDaAgenda> = {
  nasceu: { status: "nao_conectado", jaLeu: false },
  carregando: { status: "carregando", jaLeu: false },
  limite: { status: "limite", jaLeu: false },
  erro: { status: "erro", jaLeu: false, info: "Sem conexão" },
  reconectar: { status: "reconectar", jaLeu: false },
  ok: { status: "ok", jaLeu: true },
  erroDepoisDeLer: { status: "erro", jaLeu: true },
  relendo: { status: "carregando", jaLeu: true },
};

describe("G12 · estadoDoDia", () => {
  it("antes da primeira leitura nunca é vazio", () => {
    for (const a of [AGENDA.nasceu, AGENDA.carregando, AGENDA.limite]) expect(estadoDoDia(a, 0)).toBe("carregando");
  });
  it("leitura que falhou é erro, não vazio", () => {
    expect(estadoDoDia(AGENDA.erro, 0)).toBe("erro");
    expect(estadoDoDia(AGENDA.reconectar, 0)).toBe("erro");
  });
  it("vazio só depois de ler", () => {
    expect(estadoDoDia(AGENDA.ok, 0)).toBe("vazio");
    expect(estadoDoDia(AGENDA.relendo, 0)).toBe("vazio");
  });
  it("o que foi lido fica na tela quando a releitura falha", () => {
    expect(estadoDoDia(AGENDA.erroDepoisDeLer, 3)).toBe("cheio");
    expect(estadoDoDia(AGENDA.erro, 3)).toBe("cheio");
  });
});

describe("G12 · estadoDaFila", () => {
  const base = { itens: 0, conversas: { carregadas: true, erro: null }, agenda: AGENDA.ok, status: "atendendo" as StatusDaMaisa };

  it("Nada pendente só com tudo lido e a MAISA atendendo", () => {
    expect(estadoDaFila(base)).toBe("vazio");
  });
  it("conversas em voo, agenda em voo ou status conferindo: carregando", () => {
    expect(estadoDaFila({ ...base, conversas: { carregadas: false, erro: null } })).toBe("carregando");
    expect(estadoDaFila({ ...base, agenda: AGENDA.carregando })).toBe("carregando");
    expect(estadoDaFila({ ...base, status: "conferindo" })).toBe("carregando");
  });
  it("qualquer leitura que falhou é erro", () => {
    expect(estadoDaFila({ ...base, conversas: { carregadas: false, erro: "Sem conexão" } })).toBe("erro");
    expect(estadoDaFila({ ...base, agenda: AGENDA.erro })).toBe("erro");
  });
  it("fila vazia com a MAISA parada não é 'tudo resolvido'", () => {
    expect(estadoDaFila({ ...base, status: "pausada" })).toBe("sem_maisa");
    expect(estadoDaFila({ ...base, status: "sem_whatsapp" })).toBe("sem_maisa");
  });
  it("com item, mostra o item, qualquer que seja o resto", () => {
    expect(estadoDaFila({ ...base, itens: 2, status: "sem_whatsapp", agenda: AGENDA.erro })).toBe("cheio");
  });
  it("nenhuma combinação em voo ou com erro devolve vazio", () => {
    const conversas = [{ carregadas: false, erro: null }, { carregadas: false, erro: "x" }, { carregadas: true, erro: "x" }, { carregadas: true, erro: null }];
    const status: StatusDaMaisa[] = ["conferindo", "atendendo", "pausada", "sem_whatsapp"];
    for (const c of conversas) for (const a of Object.values(AGENDA)) for (const s of status) {
      const r = estadoDaFila({ itens: 0, conversas: c, agenda: a, status: s });
      const tudoLido = c.carregadas && a.jaLeu && s === "atendendo";
      if (r === "vazio") expect(tudoLido, JSON.stringify({ c, a, s })).toBe(true);
    }
  });
});

describe("G12 · estadoDosContatos", () => {
  it("lista nula é carregando, erro é erro, nunca vazio", () => {
    expect(estadoDosContatos({ lidos: null, erro: null })).toBe("carregando");
    expect(estadoDosContatos({ lidos: null, erro: "Sem conexão" })).toBe("erro");
    expect(estadoDosContatos({ lidos: 0, erro: "Sem conexão" })).toBe("erro");
  });
  it("vazio só com a leitura de volta e zero contatos", () => {
    expect(estadoDosContatos({ lidos: 0, erro: null })).toBe("vazio");
    expect(estadoDosContatos({ lidos: 5, erro: null })).toBe("cheio");
  });
});

describe("semConfirmacao · só quem ainda vem e ainda não respondeu (1A.5)", () => {
  // 24/09/2026 14:00 em São Paulo = 17:00 UTC.
  const agora = Date.parse("2026-09-24T17:00:00Z");
  const ag = (o: Partial<{ confirmado: boolean; etapa: string; data: string; inicio: number }>) =>
    ({ confirmado: false, etapa: "chegando", data: "2026-09-24", inicio: 18.5, ...o });

  it("chegando, sem resposta, antes da hora: marca", () => {
    expect(semConfirmacao(ag({}), agora)).toBe(true);
    expect(semConfirmacao(ag({ data: "2026-09-30", inicio: 9 }), agora)).toBe(true);
  });
  it("já passou da hora, ou dia passado: não marca", () => {
    expect(semConfirmacao(ag({ inicio: 10 }), agora)).toBe(false);
    expect(semConfirmacao(ag({ data: "2026-09-23" }), agora)).toBe(false);
  });
  it("em atendimento ou feito: não marca, mesmo sem resposta ao convite", () => {
    expect(semConfirmacao(ag({ etapa: "atendendo" }), agora)).toBe(false);
    expect(semConfirmacao(ag({ etapa: "feito" }), agora)).toBe(false);
  });
  it("confirmado: não marca", () => {
    expect(semConfirmacao(ag({ confirmado: true }), agora)).toBe(false);
  });
});

describe("estadoDaGravacao (1A.8)", () => {
  it("parada sem nada em voo, sem falha e sem salvo", () => {
    expect(estadoDaGravacao({ emVoo: {}, falhas: {}, salvo: false })).toEqual({ fase: "parada" });
  });
  it("em voo ganha de tudo: o toque novo é o que o dono está olhando", () => {
    expect(estadoDaGravacao({ emVoo: { semana: true }, falhas: { ajustes: "x" }, salvo: true })).toEqual({ fase: "salvando" });
  });
  it("falha ganha do salvo de outro recurso, e traz o motivo", () => {
    expect(estadoDaGravacao({ emVoo: { ajustes: false }, falhas: { nome: "Nome curto demais." }, salvo: true }))
      .toEqual({ fase: "falhou", motivo: "Nome curto demais." });
  });
  it("salvo só quando o store segura `salvo`", () => {
    expect(estadoDaGravacao({ emVoo: { ajustes: false }, falhas: { ajustes: undefined }, salvo: true })).toEqual({ fase: "salva" });
  });
});

/* 1C.6: o dia em partes, pelo relógio. */
import { partesDoDia } from "../estado/leitura";

describe("partesDoDia · o Fluxo lê o relógio", () => {
  const hoje = "2026-09-25";
  const as16 = Date.parse(`${hoje}T16:00:00-03:00`);
  const dia = Array.from({ length: 15 }, (_, i) => ({ id: `ev${i}`, data: hoje, inicio: 8 + i * 0.75, etapa: "chegando" }));

  it("às 16h, 11 passaram sem chegada e o próximo é o das 16:15", () => {
    const p = partesDoDia(dia, as16);
    expect(p.passaram.map((a) => a.id)).toEqual(dia.slice(0, 11).map((a) => a.id));
    expect(p.proximo?.inicio).toBe(16.25);
    expect(p.depois.map((a) => a.inicio)).toEqual([17, 17.75, 18.5]);
  });

  it("a tolerância de 15 min: quem marcou 15:50 às 16:00 ainda é o próximo", () => {
    const p = partesDoDia([{ id: "a", data: hoje, inicio: 15 + 50 / 60, etapa: "chegando" }], as16);
    expect(p.proximo?.id).toBe("a");
    expect(p.passaram).toEqual([]);
  });

  it("em atendimento e feito não passam nem vêm; ordem por hora", () => {
    const p = partesDoDia([
      { id: "f", data: hoje, inicio: 9, etapa: "feito" },
      { id: "x", data: hoje, inicio: 15.5, etapa: "atendendo" },
      { id: "n", data: hoje, inicio: 17, etapa: "chegando" },
      { id: "e", data: hoje, inicio: 8, etapa: "feito" },
    ], as16);
    expect(p.atendendo.map((a) => a.id)).toEqual(["x"]);
    expect(p.feitos.map((a) => a.id)).toEqual(["e", "f"]);
    expect(p.proximo?.id).toBe("n");
    expect(p.passaram).toEqual([]);
  });

  it("dia que não é hoje: nada passou", () => {
    const p = partesDoDia(dia.map((a) => ({ ...a, data: "2026-09-26" })), as16);
    expect(p.passaram).toEqual([]);
    expect(p.proximo?.inicio).toBe(8);
  });
});
