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
import { estadoDaFila, estadoDoDia, estadoDosContatos, semConfirmacao, type LeituraDaAgenda } from "@/ui/estado/leitura";
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
