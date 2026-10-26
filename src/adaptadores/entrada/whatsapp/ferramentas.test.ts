import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { agendaDemo } from "@/adaptadores/saida/demo/agenda";
import { registroDemo } from "@/adaptadores/saida/demo/atendimentos";
import { memoriaDemo } from "@/adaptadores/saida/demo/memoria";
import { CFG_PADRAO } from "@/adaptadores/saida/demo/assistente";
import { criarCancelarAtendimento, criarLerAgenda } from "@/nucleo/aplicacao/agenda";
import { criarAgendarAtendimento } from "@/nucleo/aplicacao/agendar-atendimento";
import { criarAnotarFato } from "@/nucleo/aplicacao/memoria";
import { criarOferecerHorarios } from "@/nucleo/aplicacao/oferecer-horarios";
import type { Profissional, Servico } from "@/nucleo/dominio/catalogo";
import { memoriaNova } from "@/nucleo/dominio/memoria";
import { atorAgente, type ContextoTenant } from "@/nucleo/dominio/tenant";
import { hojeISO, somarDias } from "@/nucleo/dominio/tempo";
import type { RepositorioNegocio } from "@/nucleo/portas/saida/repositorio-negocio";

import { criarExecutor, novoEstado, type Dependencias } from "./ferramentas";
import type { ConfiguracaoDoAgente } from "./persona";

const ze: Profissional = {
  id: "pr-ze", nome: "Zé", papel: "Barbeiro", atendimentosMes: 0, avaliacao: 5, comissao: 0, desde: "2024-01-01",
  servicoIds: ["sv-corte"], ativo: true, horario: "", folga: "", expediente: { folga: [], de: 9, ate: 19 },
};
const corte: Servico = { id: "sv-corte", nome: "Corte", categoria: "Recorrente", preco: 50, duracao: 40, profissionalIds: ["pr-ze"], ativo: true };

/** O executor de verdade, sobre os casos de uso de verdade e a agenda em memória. */
function montar() {
  const negocio = {
    negocio: async () => ({ nome: "Barbearia", plano: "", precoPlano: 0, proximaCobranca: "", cartao: "", conversasPlano: "" }),
    servico: async (_t: ContextoTenant, id: string) => (id === corte.id ? corte : null),
    profissional: async (_t: ContextoTenant, id: string) => (id === ze.id ? ze : null),
    expediente: async () => ze.expediente,
    profissionais: async () => [ze],
    servicos: async () => [corte],
    agendasPermitidas: async () => [ze.id],
    clientePorTelefone: async () => null,
    garantirCliente: async () => null,
    cliente: async () => null,
  } as unknown as RepositorioNegocio;
  const agenda = agendaDemo;
  const registro = registroDemo;
  const deps = {
    oferecerHorarios: criarOferecerHorarios({ agenda, negocio, registro }),
    agendarAtendimento: criarAgendarAtendimento({ agenda, negocio, registro }),
    cancelarAtendimento: criarCancelarAtendimento({ agenda, negocio, registro }),
    lerAgenda: criarLerAgenda({ agenda, negocio, registro }),
    anotarFato: criarAnotarFato({ negocio, memoria: memoriaDemo }),
    canal: { enviar: async () => {}, enviarDocumento: async () => {}, escalar: async () => {} },
    responderDuvida: async () => [],
  } as unknown as Dependencias;
  const config = {
    negocio: { nome: "Barbearia" }, servicos: [corte], profissionais: [ze], expedientes: { [ze.id]: ze.expediente },
    semana: null, cfg: CFG_PADRAO,
  } as unknown as ConfiguracaoDoAgente;
  const t: ContextoTenant = { tenantId: `teste-${randomUUID()}`, usuarioId: "teste", ator: atorAgente("teste") };
  const telefone = "11990002222";
  const perfil = { telefone, clienteId: null, nome: "Lucas", memoria: memoriaNova(telefone, "2026-10-27T10:00:00-03:00") };
  const executar = criarExecutor(deps);
  /* Um turno novo a cada chamada: `ofertas` vazio, como no turno em que o cliente diz o nome. */
  const turno = (nome: string, entrada: Record<string, unknown>) => executar({ t, perfil, estado: novoEstado(), config }, nome, entrada);
  const marcados = async (data: string) =>
    (await deps.lerAgenda(t, { agendaId: ze.id, de: data, ate: data })).eventos.filter((e) => e.maisa);
  return { turno, marcados };
}

/** Um dia útil daqui a uma semana: longe o bastante para nenhum horário já ter passado. */
const dia = somarDias(hojeISO(), 7);

describe("agendar, quando a oferta foi num turno anterior", () => {
  it("marca um horário livre mesmo fora da amostra de três que a conversa mostra", async () => {
    const { turno, marcados } = montar();
    /* 10h está livre, mas a amostra espalhada do dia (9h, o meio e o fim) não o inclui. */
    const r = await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "10h", nome_cliente: "Lucas" });
    expect(r.erro).toBe(false);
    expect((await marcados(dia)).map((e) => e.inicio)).toEqual([10]);
  });

  it("recusa horário ocupado: o almoço do dono continua bloqueando", async () => {
    const { turno, marcados } = montar();
    const r = await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "12:00", nome_cliente: "Lucas" });
    expect(r.erro).toBe(true);
    expect(await marcados(dia)).toEqual([]);
  });
});

describe("voltar a um horário que foi cancelado", () => {
  it("marca de novo de verdade, em vez de confirmar um atendimento que não existe", async () => {
    const { turno, marcados } = montar();
    await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "15h", nome_cliente: "Lucas" });
    const [marcado] = await marcados(dia);
    await turno("cancelar", { evento_id: marcado.eventoId, profissional_id: "pr-ze" });
    expect(await marcados(dia)).toEqual([]);

    const r = await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "15h", nome_cliente: "Lucas" });
    expect(r.erro).toBe(false);
    expect((await marcados(dia)).map((e) => e.inicio)).toEqual([15]);
  });

  it("a retentativa do modelo continua idempotente: não cria um segundo atendimento", async () => {
    const { turno, marcados } = montar();
    await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "16h", nome_cliente: "Lucas" });
    const r = await turno("agendar", { servico_id: "sv-corte", profissional_id: "pr-ze", data: dia, hora: "16:00", nome_cliente: "Lucas" });
    expect(r.texto).toMatch(/já (está|estava) marcado/);
    expect(await marcados(dia)).toHaveLength(1);
  });
});

describe("nao_responder", () => {
  const executar = criarExecutor({} as unknown as Dependencias);
  const ctx = (mexer: (e: ReturnType<typeof novoEstado>) => void) => {
    const estado = novoEstado();
    mexer(estado);
    return { t: {} as ContextoTenant, perfil: {} as never, estado, config: {} as ConfiguracaoDoAgente };
  };

  it("no turno em que chamou o dono, não pode calar: o cliente tem que saber", async () => {
    const r = await executar(ctx((e) => { e.podeCalar = true; e.escalou = { motivo: "reclamação" }; }), "nao_responder", { motivo: "ok" });
    expect(r.erro).toBe(true);
  });

  it("sem resposta anterior na conversa, não pode calar", async () => {
    const c = ctx(() => {});
    const r = await executar(c, "nao_responder", { motivo: "ok" });
    expect(r.erro).toBe(true);
    expect(c.estado.calou).toBeNull();
  });

  it("com a conversa andando e nada feito no turno, cala", async () => {
    const c = ctx((e) => { e.podeCalar = true; });
    const r = await executar(c, "nao_responder", { motivo: "só um 👍" });
    expect(r.erro).toBe(false);
    expect(c.estado.calou).toEqual({ motivo: "só um 👍" });
  });
});
