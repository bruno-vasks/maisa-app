/* ─────────────────────────────────────────────────────────────────────────────
 * O AGENTE NA CASA — a maisa vendendo a própria maisa (05/11/2026).
 *
 * O loop é o de sempre; o que muda na casa, e o que estes testes congelam:
 *   • o prompt e as ferramentas de venda só existem na casa — o assinante não vê nada disso;
 *   • o link do teste sai como bolha própria, montado pelo código, e link escrito pelo modelo cai;
 *   • quem vende (o Bruno) escrevendo para o número da casa não vira lead.
 * ────────────────────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { conversasDemo, historicoDemo } from "@/adaptadores/saida/demo/memoria";
import { CFG_PADRAO } from "@/adaptadores/saida/demo/assistente";
import { memoriaNova } from "@/nucleo/dominio/memoria";
import { atorAgente, type ContextoTenant } from "@/nucleo/dominio/tenant";
import type { PedidoAoModelo, RespostaDoModelo } from "@/nucleo/portas/saida/modelo-conversa";

import { criarAgente, type Dependencias } from "./agente";
import { semLinks } from "./bolhas";
import { parteEstavel, type ConfiguracaoDoAgente } from "./persona";

const LINK = "https://app.maisasecretary.com.br/assinar/profissional?teste=1&icp=terapeutas&utm_source=whatsapp";
const BRUNO = "5511994294906";

const base: ConfiguracaoDoAgente = {
  negocio: { nome: "maisa", plano: "", precoPlano: 0, proximaCobranca: "", cartao: "", conversasPlano: "" },
  assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 },
  servicos: [],
  profissionais: [],
  expedientes: {},
  semana: null,
  cfg: CFG_PADRAO,
};

const casa: ConfiguracaoDoAgente = {
  ...base,
  vendas: {
    planos: [{ chave: "profissional", nome: "Profissional", preco: "R$ 197", agendamentosPorMes: 700, excedente: "R$ 0,28" }],
    vendedor: BRUNO,
  },
};

function montar(config: ConfiguracaoDoAgente, respostas: RespostaDoModelo[] = []) {
  const pedidos: PedidoAoModelo[] = [];
  const enviadas: string[][] = [];
  const qualificados: unknown[] = [];
  const modelo = {
    nome: "falso",
    async conversar(p: PedidoAoModelo): Promise<RespostaDoModelo> {
      pedidos.push(p);
      return respostas.shift() ?? { texto: "Oi! Me conta, o que você faz?", chamadas: [], recusou: false };
    },
  };
  const naoUsado = async () => {
    throw new Error("não usado neste teste");
  };
  const deps = {
    modelo,
    config: async () => config,
    lembrarCliente: async (_t: ContextoTenant, telefone: string) => ({
      telefone, clienteId: null, nome: null, memoria: memoriaNova(telefone, "2026-11-05T10:00:00-03:00"),
    }),
    avaliarAtendimento: async () => ({ pode: true, motivo: null, nome: null }),
    historico: historicoDemo,
    conversas: conversasDemo,
    canal: {
      enviar: async (_t: unknown, _para: string, textos: string[]) => void enviadas.push(textos),
      enviarDocumento: async () => {},
      escalar: async () => {},
    },
    oferecerHorarios: naoUsado, agendarAtendimento: naoUsado, cancelarAtendimento: naoUsado,
    lerAgenda: naoUsado, anotarFato: naoUsado, responderDuvida: naoUsado,
    vendas: {
      abrirFicha: async (_t: ContextoTenant, p: { telefone: string }) => ({
        ficha: null,
        cadastro: p.telefone.endsWith("77770000")
          ? { contaId: "c", nome: "Ana", telefone: p.telefone, criadaEm: "2026-11-05T10:00:00Z", emailConfirmado: true, negocio: "Ana Psicologia", vertical: "terapeutas" as const, whatsapp: null, testeAte: "2026-11-19", pagoAte: null }
          : null,
      }),
      qualificarLead: async (_t: ContextoTenant, p: unknown) => (qualificados.push(p), { passo: "teste" as const, plano: null, avisou: true }),
      linkDoTeste: async () => ({ link: LINK }),
      linkDoPagamento: async () => ({ link: "https://app.maisasecretary.com.br/?tela=mais&abrir=plano" }),
      conversaMarcada: async () => {},
    },
  } as unknown as Dependencias;
  const t: ContextoTenant = { tenantId: `casa-${randomUUID()}`, usuarioId: "teste", ator: atorAgente("teste") };
  return { responder: criarAgente(deps), pedidos, enviadas, qualificados, t };
}

const nomes = (p: PedidoAoModelo) => p.ferramentas.map((f) => f.nome);

describe("só a casa vende", () => {
  it("na casa: prompt de vendas, ferramentas de venda e o que se sabe do lead", async () => {
    const { responder, pedidos, t } = montar(casa);
    await responder(t, { de: "11988887777", texto: "Quero saber mais sobre a maisa" });
    expect(pedidos[0].sistemaEstavel).toMatch(/^Você é a maisa\. Você atende pelo WhatsApp quem quer conhecer a maisa/);
    expect(pedidos[0].sistemaEstavel).toContain("Profissional: R$ 197 por mês");
    expect(pedidos[0].sistemaVolatil).toContain("Ainda não tem conta no app.");
    expect(nomes(pedidos[0])).toEqual(expect.arrayContaining(["registrar_lead", "mandar_link_do_teste", "oferecer_horarios"]));
  });

  it("no assinante: nada disso", async () => {
    const { responder, pedidos, t } = montar(base);
    await responder(t, { de: "11988887777", texto: "tem horário amanhã?" });
    expect(pedidos[0].sistemaEstavel).toMatch(/^Você é a maisa, secretária de maisa\./);
    expect(nomes(pedidos[0])).not.toContain("registrar_lead");
    expect(nomes(pedidos[0])).not.toContain("mandar_link_do_teste");
  });

  it("a persona do assinante continua com o jeito de escrever, uma vez só", () => {
    const prompt = parteEstavel(base);
    expect(prompt.split("## Como você escreve").length).toBe(2);
    expect(prompt).toContain("Hora do jeito falado: 9h, 10h30, 14h. Nunca 09:00.");
  });
});

describe("o link do teste", () => {
  it("sai como a última bolha, montado pelo código; o link que o modelo escreveu cai", async () => {
    const { responder, enviadas, qualificados, t } = montar(casa, [
      {
        texto: "",
        chamadas: [
          { id: "1", nome: "registrar_lead", argumentos: { profissao: "psicóloga", vertical: "terapeutas", equipe: 1 } },
          { id: "2", nome: "mandar_link_do_teste", argumentos: { vertical: "terapeutas" } },
        ],
        recusou: false,
      },
      { texto: "Te mandei o link aqui: https://maisa.com.br/assinar\n\nÉ só criar a conta, leva 5 minutos.", chamadas: [], recusou: false },
    ]);
    const r = await responder(t, { de: "11988887777", texto: "sou psicóloga, atendo sozinha. me manda o link" });

    expect(qualificados).toHaveLength(1);
    expect(r.bolhas[r.bolhas.length - 1]).toBe(LINK);
    expect(r.bolhas.slice(0, -1).join(" ")).not.toMatch(/https?:|maisa\.com/);
    expect(enviadas[0]).toEqual(r.bolhas);
  });
});

describe("o link exige o lead registrado", () => {
  it("sem registrar_lead antes, a ferramenta recusa e o link não sai", async () => {
    const { responder, enviadas, t } = montar(casa, [
      { texto: "", chamadas: [{ id: "1", nome: "mandar_link_do_teste", argumentos: { vertical: "terapeutas" } }], recusou: false },
      { texto: "Antes de te mandar: o que você faz?", chamadas: [], recusou: false },
    ]);
    const r = await responder(t, { de: "11988887777", texto: "me manda o link" });
    expect(r.trilha[0]).toMatchObject({ ferramenta: "mandar_link_do_teste", erro: true });
    expect(r.bolhas).not.toContain(LINK);
    expect(enviadas[0]).toEqual(["Antes de te mandar: o que você faz?"]);
  });
});

describe("quem já tem conta", () => {
  it("é qualificada, mas não recebe link: o passo dela é dentro do app", async () => {
    const comConta = montar(casa, [
      {
        texto: "",
        chamadas: [
          { id: "1", nome: "registrar_lead", argumentos: { profissao: "psicóloga", vertical: "terapeutas", equipe: 1, interesse: "recibo do Receita Saúde" } },
          { id: "2", nome: "mandar_link_do_teste", argumentos: { vertical: "terapeutas" } },
        ],
        recusou: false,
      },
      { texto: "O recibo sai sozinho no dia que você escolher. Agora é só conectar o seu WhatsApp no app.", chamadas: [], recusou: false },
    ]);
    const r = await comConta.responder(comConta.t, { de: "11977770000", texto: "to gostando, como funciona o recibo?" });
    expect(r.trilha.find((p) => p.ferramenta === "registrar_lead")?.resultado).toMatch(/já tem conta/);
    expect(r.trilha.find((p) => p.ferramenta === "mandar_link_do_teste")).toMatchObject({ erro: true });
    expect(r.bolhas).not.toContain(LINK);
  });
});

describe("o link de pagar", () => {
  it("sai para quem tem conta, como bolha própria", async () => {
    const comConta = montar(casa, [
      { texto: "", chamadas: [{ id: "1", nome: "mandar_link_do_pagamento", argumentos: {} }], recusou: false },
      { texto: "É só a mensalidade, sem taxa. Esse link abre o app na tela do plano.", chamadas: [], recusou: false },
    ]);
    const r = await comConta.responder(comConta.t, { de: "11977770000", texto: "como pago pra continuar?" });
    expect(r.bolhas[r.bolhas.length - 1]).toBe("https://app.maisasecretary.com.br/?tela=mais&abrir=plano");
  });

  it("não sai para quem ainda não tem conta: o primeiro passo é o teste", async () => {
    const semConta = montar(casa, [
      { texto: "", chamadas: [{ id: "1", nome: "mandar_link_do_pagamento", argumentos: {} }], recusou: false },
      { texto: "Primeiro você testa 14 dias grátis. Quer o link?", chamadas: [], recusou: false },
    ]);
    const r = await semConta.responder(semConta.t, { de: "11988887777", texto: "quero pagar" });
    expect(r.trilha[0]).toMatchObject({ ferramenta: "mandar_link_do_pagamento", erro: true });
    expect(r.bolhas.join(" ")).not.toMatch(/https?:/);
  });
});

describe("quem vende não é lead", () => {
  it("a mensagem do Bruno no número da casa não chega ao modelo", async () => {
    const { responder, pedidos, t } = montar(casa);
    const r = await responder(t, { de: "11994294906", texto: "valeu, vou chamar ela" });
    expect(r.bolhas).toEqual([]);
    expect(r.motivo).toMatch(/quem vende/);
    expect(pedidos).toHaveLength(0);
  });
});

describe("semLinks", () => {
  it("tira link http e domínio solto da maisa, e o que sobra da frase fecha", () => {
    expect(semLinks("Segue o link: https://app.maisasecretary.com.br/assinar/x?teste=1")).toBe("Segue o link.");
    expect(semLinks("Entra em app.maisasecretary.com.br e cria a conta")).toBe("Entra em e cria a conta");
  });
  it("não mexe em linha sem link, nem nos dois-pontos dela", () => {
    expect(semLinks("Os planos são:\nEssencial e Profissional.")).toBe("Os planos são:\nEssencial e Profissional.");
  });
  it("o CVV fica: numa crise, é a coisa mais importante da mensagem", () => {
    expect(semLinks("Liga 188 ou entra em cvv.org.br")).toBe("Liga 188 ou entra em cvv.org.br");
    expect(semLinks("o chat é https://cvv.org.br")).toBe("o chat é https://cvv.org.br");
  });
});
