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
function montar(o: number | { pensaMs?: number; pode?: boolean; respostas?: Awaited<ReturnType<ModeloDeConversa["conversar"]>>[] } = 0) {
  const { pensaMs = 0, pode = true, respostas } = typeof o === "number" ? { pensaMs: o } : o;
  const vistos: TurnoDeConversa[][] = [];
  const enviadas: string[][] = [];
  const escaladas: string[] = [];
  const modelo: ModeloDeConversa = {
    nome: "falso",
    async conversar(p) {
      vistos.push(p.turnos);
      await dormir(pensaMs);
      return respostas?.shift() ?? { texto: "Sexta tenho 14h ou 16h, qual fica melhor?", chamadas: [], recusou: false };
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
    avaliarAtendimento: async () => ({ pode, motivo: pode ? null : "contato pessoal do dono", nome: null }),
    historico: historicoDemo,
    conversas: conversasDemo,
    canal: {
      enviar: async (_t: unknown, _para: string, textos: string[]) => { enviadas.push(textos); },
      enviarDocumento: async () => {},
      escalar: async (_t: unknown, p: { motivo: string }) => { escaladas.push(p.motivo); },
    },
    oferecerHorarios: naoUsado, agendarAtendimento: naoUsado, cancelarAtendimento: naoUsado,
    lerAgenda: naoUsado, anotarFato: naoUsado, responderDuvida: naoUsado,
  } as unknown as Dependencias;
  const t: ContextoTenant = { tenantId: `teste-${randomUUID()}`, usuarioId: "teste", ator: atorAgente("teste") };
  return { responder: criarAgente(deps), vistos, t, enviadas, escaladas };
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

describe("o áudio", () => {
  it("de quem a MAISA atende: é ouvido, e a transcrição entra na conversa", async () => {
    const { responder, vistos, t } = montar();
    let ouviu = 0;
    const r = await responder(t, { de: TEL, texto: "", ouvir: async () => (ouviu++, "[áudio] tem horário sexta?") });
    expect(ouviu).toBe(1);
    expect(r.bolhas.length).toBeGreaterThan(0);
    expect(vistos[0][vistos[0].length - 1]).toEqual({ papel: "cliente", texto: "[áudio] tem horário sexta?" });
  });

  it("de quem ela NÃO atende (a vida pessoal do dono): não sai do celular, nem para transcrever", async () => {
    const { responder, t } = montar({ pode: false });
    let ouviu = 0;
    const r = await responder(t, { de: TEL, texto: "", ouvir: async () => (ouviu++, "[áudio] oi filho") });
    expect(ouviu).toBe(0);
    expect(r.bolhas).toEqual([]);
    const [gravada] = await historicoDemo.ler(t, TEL, 1);
    expect(gravada.txt).toBe("[áudio]");
  });
});

describe("o que o turno não pode perder", () => {
  it("a fala escrita junto com chamar_humano chega ao cliente (numa crise, é ela que tem o CVV)", async () => {
    const respostas = [
      { texto: "Sinto muito que você esteja passando por isso. Se for urgente, ligue 188 (CVV), é de graça e 24 horas.", chamadas: [{ id: "c1", nome: "chamar_humano", argumentos: { motivo: "risco" } }], recusou: false },
      { texto: "Vou falar com a Ana agora e já te retorno.", chamadas: [], recusou: false },
    ];
    const { responder, t } = montar({ respostas });
    const r = await responder(t, { de: TEL, texto: "nao aguento mais" });
    expect(r.bolhas.join(" ")).toContain("188");
    expect(r.bolhas.join(" ")).toContain("Vou falar com a Ana");
  });

  it("quando a fala da escalada e a final dizem o mesmo, o aviso sai uma vez só", async () => {
    const respostas = [
      { texto: "Já chamei o Zé.", chamadas: [{ id: "c1", nome: "chamar_humano", argumentos: { motivo: "reclamação" } }], recusou: false },
      { texto: "Sinto muito pelo que aconteceu. O Zé já foi avisado e vai falar com você por aqui.", chamadas: [], recusou: false },
    ];
    const { responder, t } = montar({ respostas });
    const r = await responder(t, { de: TEL, texto: "cheguei e ninguem tava la" });
    expect(r.bolhas.join(" ")).not.toContain("Já chamei o Zé.");
    expect(r.bolhas.join(" ")).toContain("vai falar com você");
  });

  it("a fala da escalada mais longa, mas dizendo o mesmo que a final, também não se repete", async () => {
    const respostas = [
      { texto: "Poxa, sinto muito que o corte tenha ficado torto. Já avisei o Zé pra dar uma olhada, e ele retorna com você por aqui.", chamadas: [{ id: "c1", nome: "chamar_humano", argumentos: { motivo: "corte torto" } }], recusou: false },
      { texto: "Poxa, sinto muito que o corte tenha ficado torto. Avisei o Zé, ele retorna com você.", chamadas: [], recusou: false },
    ];
    const { responder, t } = montar({ respostas });
    const r = await responder(t, { de: TEL, texto: "o corte ficou torto" });
    expect(r.bolhas.join(" ").match(/sinto muito/g)).toHaveLength(1);
  });

  it("o dono assumiu enquanto ela pensava: a resposta não sai", async () => {
    const { responder, t } = montar({ pensaMs: 300 });
    const turno = responder(t, { de: TEL, texto: "tem horário sexta?" }, { esperaDaRajadaMs: 50 });
    await dormir(150);
    await conversasDemo.marcar(t, TEL, { assumida: true });
    const r = await turno;
    expect(r.bolhas).toEqual([]);
    expect(r.motivo).toContain("dono assumiu");
  });
});

describe("o silêncio", () => {
  const calar = { texto: "", chamadas: [{ id: "s1", nome: "nao_responder", argumentos: { motivo: "cliente só confirmou que vai esperar" } }], recusou: false };

  it("depois de a conversa já ter resposta, ela pode não responder um 'vou esperar', e ninguém é chamado", async () => {
    const respostas = [
      { texto: "Já avisei o Zé, ele vai falar com você por aqui.", chamadas: [], recusou: false },
      calar,
    ];
    const { responder, t } = montar({ respostas });
    await responder(t, { de: TEL, texto: "quero falar com o dono" });
    const r = await responder(t, { de: TEL, texto: "ta certo, vou ficar esperando" });
    expect(r.bolhas).toEqual([]);
    expect(r.escalou).toBe(false);
    expect(r.motivo).toContain("escolheu não responder");
  });

  it("quem escreve pela primeira vez sempre recebe resposta, mesmo que o modelo tente calar", async () => {
    const respostas = [calar, { texto: "Oi! Sexta tenho 14h ou 16h, qual fica melhor?", chamadas: [], recusou: false }];
    const { responder, t } = montar({ respostas });
    const r = await responder(t, { de: TEL, texto: "oi" });
    expect(r.bolhas.length).toBeGreaterThan(0);
    expect(r.trilha.find((p) => p.ferramenta === "nao_responder")?.erro).toBe(true);
  });
});

describe("a blindagem do número (27/10/2026)", () => {
  const fala = (texto: string) => ({ texto, chamadas: [], recusou: false });

  it("mensagem escrita há mais de 15 minutos é gravada, e não é lida nem respondida", async () => {
    const { responder, vistos, t } = montar();
    let lidas = 0;
    const r = await responder(t, {
      de: TEL, texto: "tem horário hoje às 14h?", enviadaEm: Date.now() - 40 * 60_000,
      marcarComoLida: async () => { lidas++; },
    });
    expect(r.bolhas).toEqual([]);
    expect(r.motivo).toContain("escrita há 40 min");
    expect(vistos).toHaveLength(0);
    expect(lidas).toBe(0);
    const [gravada] = await historicoDemo.ler(t, TEL, 1);
    expect(gravada.txt).toBe("tem horário hoje às 14h?");
  });

  it("mensagem de agora fica lida (tique azul) antes de ela pensar", async () => {
    const { responder, vistos, t } = montar();
    let antesDoModelo: boolean | null = null;
    const r = await responder(t, {
      de: TEL, texto: "oi", enviadaEm: Date.now() - 5_000,
      marcarComoLida: async () => { antesDoModelo = vistos.length === 0; },
    });
    expect(antesDoModelo).toBe(true);
    expect(r.bolhas.length).toBeGreaterThan(0);
  });

  it("conversa da vida pessoal do dono continua não lida no celular dele", async () => {
    const { responder, t } = montar({ pode: false });
    let lidas = 0;
    await responder(t, { de: TEL, texto: "oi filho", marcarComoLida: async () => { lidas++; } });
    expect(lidas).toBe(0);
  });

  it("outro robô mandando a mesma mensagem: na terceira ela para, sem gastar o modelo, e chama o dono", async () => {
    const auto = "Olá! Recebemos sua mensagem e em breve retornaremos.";
    const { responder, vistos, t, escaladas } = montar({
      respostas: [fala("Oi! Quer marcar um horário?"), fala("Desculpe, não entendi. Quer marcar um horário?")],
    });
    await responder(t, { de: TEL, texto: auto });
    await responder(t, { de: TEL, texto: auto });
    const r = await responder(t, { de: TEL, texto: auto });
    expect(r.bolhas).toEqual([]);
    expect(r.escalou).toBe(true);
    expect(r.motivo).toContain("disjuntor");
    expect(vistos).toHaveLength(2);
    expect(escaladas).toHaveLength(1);
  });

  it("a mesma resposta de novo, palavra por palavra, não sai", async () => {
    const igual = "Funcionamos de terça a sábado, das 9h às 19h.";
    const { responder, t, enviadas } = montar({ respostas: [fala(igual), fala(igual)] });
    await responder(t, { de: TEL, texto: "qual o horário de vocês?" });
    const r = await responder(t, { de: TEL, texto: "qual o horário?" });
    expect(r.bolhas).toEqual([]);
    expect(r.motivo).toContain("igual à anterior");
    expect(enviadas).toHaveLength(1);
  });

  it("a fala que ela inventou para o cliente, e a resposta a ela, não saem", async () => {
    const { responder, t, enviadas } = montar({
      respostas: [fala("Tenho sexta às 15h, serve?\n\nCliente: serve sim\n\nÓtimo, marcado!")],
    });
    const r = await responder(t, { de: TEL, texto: "tem sexta?" });
    expect(r.bolhas).toEqual(["Tenho sexta às 15h, serve?"]);
    expect(enviadas).toEqual([["Tenho sexta às 15h, serve?"]]);
  });
});
