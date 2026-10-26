import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { conversasDemo, historicoDemo } from "@/adaptadores/saida/demo/memoria";
import { CFG_PADRAO } from "@/adaptadores/saida/demo/assistente";
import { memoriaNova } from "@/nucleo/dominio/memoria";
import { atorAgente, type ContextoTenant } from "@/nucleo/dominio/tenant";
import type { ModeloDeConversa, TurnoDeConversa } from "@/nucleo/portas/saida/modelo-conversa";

import { criarAgente, type Dependencias } from "./agente";
import type { ConfiguracaoDoAgente } from "./persona";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const config: ConfiguracaoDoAgente = {
  negocio: { nome: "Barbearia do Zé", plano: "", precoPlano: 0, proximaCobranca: "", cartao: "", conversasPlano: "" },
  assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 },
  servicos: [],
  profissionais: [],
  expedientes: {},
  semana: null,
  cfg: CFG_PADRAO,
};

/** Um agente com modelo falso: grava o que o modelo viu e responde depois de `pensaMs`. */
function montar(pensaMs = 0) {
  const vistos: TurnoDeConversa[][] = [];
  const modelo: ModeloDeConversa = {
    nome: "falso",
    async conversar(p) {
      vistos.push(p.turnos);
      await dormir(pensaMs);
      return { texto: "Sexta tenho 14h ou 16h, qual fica melhor?", chamadas: [], recusou: false };
    },
  };
  const naoUsado = async () => {
    throw new Error("não usado neste teste");
  };
  const deps = {
    modelo,
    config: async () => config,
    lembrarCliente: async (_t: ContextoTenant, telefone: string) => ({
      telefone, clienteId: null, nome: null, memoria: memoriaNova(telefone, "2026-10-27T10:00:00-03:00"),
    }),
    avaliarAtendimento: async () => ({ pode: true, motivo: null, nome: null }),
    historico: historicoDemo,
    conversas: conversasDemo,
    canal: { enviar: async () => {}, enviarDocumento: async () => {}, escalar: async () => {} },
    oferecerHorarios: naoUsado, agendarAtendimento: naoUsado, cancelarAtendimento: naoUsado,
    lerAgenda: naoUsado, anotarFato: naoUsado, responderDuvida: naoUsado,
  } as unknown as Dependencias;
  const t: ContextoTenant = { tenantId: `teste-${randomUUID()}`, usuarioId: "teste", ator: atorAgente("teste") };
  return { responder: criarAgente(deps), vistos, t };
}

const TEL = "11990001111";

describe("a rajada", () => {
  it("três mensagens seguidas recebem UMA resposta, e o modelo lê as três juntas", async () => {
    const { responder, vistos, t } = montar();
    const opcoes = { esperaDaRajadaMs: 300 };
    const r = await Promise.all([
      responder(t, { de: TEL, texto: "oi" }, opcoes),
      dormir(60).then(() => responder(t, { de: TEL, texto: "queria marcar corte" }, opcoes)),
      dormir(120).then(() => responder(t, { de: TEL, texto: "pra sexta" }, opcoes)),
    ]);
    expect(r.map((x) => x.bolhas.length > 0)).toEqual([false, false, true]);
    expect(vistos).toHaveLength(1);
    expect(vistos[0][vistos[0].length - 1]).toEqual({ papel: "cliente", texto: "oi\nqueria marcar corte\npra sexta" });
  });

  it("a resposta que nasceu velha é descartada: quem responde é o turno da mensagem nova", async () => {
    const { responder, vistos, t } = montar(400);
    const opcoes = { esperaDaRajadaMs: 100 };
    const primeira = responder(t, { de: TEL, texto: "tem horário sexta?" }, opcoes);
    await dormir(250); // a primeira já passou da espera e está "pensando"
    const segunda = responder(t, { de: TEL, texto: "de tarde" }, opcoes);
    const [r1, r2] = await Promise.all([primeira, segunda]);
    expect(r1.bolhas).toEqual([]);
    expect(r1.motivo).toContain("chegou mensagem nova");
    expect(r2.bolhas.length).toBeGreaterThan(0);
    expect(vistos[vistos.length - 1].slice(-1)[0]).toEqual({ papel: "cliente", texto: "tem horário sexta?\nde tarde" });
  });

  it("sem espera (o laboratório), cada mensagem é respondida na hora, como antes", async () => {
    const { responder, t } = montar();
    const r = await responder(t, { de: TEL, texto: "oi" });
    expect(r.bolhas.length).toBeGreaterThan(0);
  });
});
