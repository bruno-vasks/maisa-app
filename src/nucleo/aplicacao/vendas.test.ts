/* ─────────────────────────────────────────────────────────────────────────────
 * A MAISA DA MAISA — os casos de uso (05/11/2026).
 *
 * O que mais importa aqui é a rotina: ela manda mensagem para gente de verdade, sem ninguém ter
 * pedido, de um número que a Evolution pode banir. Cada teste é uma mensagem que NÃO pode sair (em
 * dobro, de madrugada, para o Bruno, para cliente pago, para telefone de mentira) ou uma que tem
 * de sair uma vez só.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";

import type { CadastrosDoApp } from "../portas/saida/cadastros-do-app";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { FilaDeEnvios } from "../portas/saida/fila-de-envios";
import type { RepositorioHistorico } from "../portas/saida/memoria-cliente";
import type { ConversaDoLead, RepositorioDeLeads } from "../portas/saida/repositorio-leads";
import type { ContextoTenant } from "../dominio/tenant";
import type { NovoEnvio } from "../dominio/envios";
import type { Automatica, CadastroNoApp, FichaDeLead, PlanoAVenda } from "../dominio/vendas";
import { criarAcompanharLeads, criarConversaMarcada, criarLinkDoTesteDoLead, criarQualificarLead } from "./vendas";

const CASA = "11111111-1111-1111-1111-111111111111";
const t: ContextoTenant = { tenantId: CASA, usuarioId: "", ator: { tipo: "agente", canal: "whatsapp" } };
const BRUNO = "5511994294906";

const PLANOS: PlanoAVenda[] = [
  { chave: "essencial", nome: "Essencial", preco: "R$ 127", agendamentosPorMes: 300, excedente: "R$ 0,42" },
  { chave: "profissional", nome: "Profissional", preco: "R$ 197", agendamentosPorMes: 700, excedente: "R$ 0,28" },
];

const k8 = (tel: string) => tel.replace(/\D/g, "").slice(-8);

/** A ficha em memória, com a reserva atômica do banco. */
function leadsFalsos(conversas: (Omit<ConversaDoLead, "ficha"> & { telefone: string; nome?: string })[] = []) {
  const fichas = new Map<string, FichaDeLead>();
  const garantir = (tel: string) => {
    let f = fichas.get(k8(tel));
    if (!f) {
      f = { telefone: tel, nome: null, qualificacao: null, passo: null, plano: null, qualificadoEm: null, linkEm: null, boasVindasEm: null, lembreteEm: null, retomadaEm: null };
      fichas.set(k8(tel), f);
    }
    return f;
  };
  for (const c of conversas) garantir(c.telefone).nome = c.nome ?? null;
  const campo = (tipo: Automatica): "boasVindasEm" | "lembreteEm" | "retomadaEm" =>
    tipo === "boas_vindas" ? "boasVindasEm" : tipo === "lembrete" ? "lembreteEm" : "retomadaEm";
  const repo: RepositorioDeLeads = {
    faltando: () => [],
    ler: async (_t, tel) => (fichas.get(k8(tel)) ? { ...fichas.get(k8(tel))! } : null),
    registrarContato: async (_t, p) => void garantir(p.telefone),
    qualificar: async (_t, p) => {
      const f = garantir(p.telefone);
      Object.assign(f, { nome: p.nome ?? f.nome, qualificacao: p.qualificacao, passo: p.passo, plano: p.plano, qualificadoEm: p.em });
    },
    marcarConversa: async (_t, p) => void (garantir(p.telefone).passo = "conversa"),
    marcarLink: async (_t, p) => void (garantir(p.telefone).linkEm = p.em),
    reservarAutomatica: async (_t, p) => {
      const f = garantir(p.telefone);
      if (f[campo(p.tipo)]) return false;
      f[campo(p.tipo)] = p.em;
      return true;
    },
    devolverAutomatica: async (_t, p) => void (garantir(p.telefone)[campo(p.tipo)] = null),
    conversas: async () => conversas.map((c) => ({ ficha: { ...garantir(c.telefone) }, ultimaDe: c.ultimaDe, ultimaEm: c.ultimaEm, clienteFalou: c.clienteFalou })),
  };
  return { repo, fichas };
}

function mundo(p: { cadastros?: CadastroNoApp[]; conversas?: Parameters<typeof leadsFalsos>[0]; casa?: string | null; filaQuebrada?: boolean } = {}) {
  const enfileirados: NovoEnvio[] = [];
  const naConversa: { telefone: string; txt: string }[] = [];
  let drenagens = 0;
  const { repo, fichas } = leadsFalsos(p.conversas);
  const cadastros: CadastrosDoApp = {
    faltando: () => [],
    recentes: async (desde) => (p.cadastros ?? []).filter((c) => c.criadaEm >= desde),
    porTelefone: async (tel) => (p.cadastros ?? []).find((c) => c.telefone && k8(c.telefone) === k8(tel)) ?? null,
  };
  const fila = {
    enfileirar: async (_t: ContextoTenant, envios: NovoEnvio[]) => {
      if (p.filaQuebrada) throw new Error("036 não rodou");
      enfileirados.push(...envios);
    },
  } as unknown as FilaDeEnvios;
  const historico = {
    anexar: async (_t: ContextoTenant, telefone: string, msgs: { txt: string }[]) => void naConversa.push(...msgs.map((m) => ({ telefone, txt: m.txt }))),
  } as unknown as RepositorioHistorico;

  const acompanhar = criarAcompanharLeads({
    casa: () => (p.casa === undefined ? CASA : p.casa),
    cadastros,
    leads: repo,
    fila,
    historico,
    drenar: async () => (drenagens++, { enviados: 0, adiados: 0, desistidos: 0 }),
    vendedorDe: async () => BRUNO,
  });
  return { acompanhar, enfileirados, naConversa, fichas, drenagens: () => drenagens };
}

/** Quinta, 05/11/2026, às `hora` de São Paulo. */
const as = (hora: string) => new Date(`2026-11-05T${hora}:00-03:00`);
const minutosAntes = (d: Date, min: number) => new Date(d.getTime() - min * 60_000).toISOString();

const conta = (over: Partial<CadastroNoApp>): CadastroNoApp => ({
  contaId: "c", nome: "Fernanda", telefone: "11988887777", criadaEm: "", emailConfirmado: true,
  negocio: "Clínica Fernanda", vertical: "terapeutas", whatsapp: null, testeAte: "2026-11-19", pagoAte: null, ...over,
});

describe("a rotina: boas-vindas", () => {
  it("sai uma vez, pela fila, e entra na conversa como fala da maisa", async () => {
    const agora = as("15:00");
    const m = mundo({ cadastros: [conta({ criadaEm: minutosAntes(agora, 10) })] });

    const r1 = await m.acompanhar(agora);
    const r2 = await m.acompanhar(new Date(agora.getTime() + 10 * 60_000));

    expect(r1.boasVindas).toBe(1);
    expect(r2.boasVindas).toBe(0);
    expect(m.enfileirados).toHaveLength(1);
    expect(m.enfileirados[0]).toMatchObject({ para: "11988887777", origem: "vendas" });
    expect(m.enfileirados[0].textos[0]).toBe("Boa tarde, Fernanda! Tudo certo?");
    expect(m.enfileirados[0].textos[m.enfileirados[0].textos.length - 1]).toBe("O que está achando até agora?");
    expect(m.naConversa.map((x) => x.txt)).toEqual(m.enfileirados[0].textos);
    expect(m.drenagens()).toBe(1);
  });

  it("não sai cedo demais, nem para quem criou a conta ontem", async () => {
    const agora = as("15:00");
    const m = mundo({ cadastros: [
      conta({ contaId: "a", telefone: "11911112222", criadaEm: minutosAntes(agora, 1) }),
      conta({ contaId: "b", telefone: "11933334444", criadaEm: minutosAntes(agora, 5 * 60) }),
    ] });
    expect((await m.acompanhar(agora)).boasVindas).toBe(0);
  });

  it("não sai de madrugada", async () => {
    const agora = as("23:30");
    const m = mundo({ cadastros: [conta({ criadaEm: minutosAntes(agora, 10) })] });
    expect((await m.acompanhar(agora)).boasVindas).toBe(0);
  });

  it("nunca para o próprio Bruno, para cliente pago ou para telefone de mentira", async () => {
    const agora = as("15:00");
    const m = mundo({ cadastros: [
      conta({ contaId: "bruno", telefone: "11994294906", criadaEm: minutosAntes(agora, 10) }),
      conta({ contaId: "pago", telefone: "11955556666", criadaEm: minutosAntes(agora, 10), pagoAte: "2026-12-05" }),
      conta({ contaId: "falso", telefone: "11999999999", criadaEm: minutosAntes(agora, 10) }),
      conta({ contaId: "sem", telefone: null, criadaEm: minutosAntes(agora, 10) }),
    ] });
    expect((await m.acompanhar(agora)).boasVindas).toBe(0);
    expect(m.enfileirados).toEqual([]);
  });

  it("espera a pessoa parar de conversar com a casa antes de dar boas-vindas", async () => {
    const agora = as("15:00");
    const m = mundo({
      cadastros: [conta({ criadaEm: minutosAntes(agora, 10) })],
      conversas: [{ telefone: "5511988887777", ultimaDe: "bot", ultimaEm: minutosAntes(agora, 2), clienteFalou: true }],
    });
    expect((await m.acompanhar(agora)).boasVindas).toBe(0);
  });

  it("fila que não aceita devolve a reserva: a próxima rodada tenta de novo", async () => {
    const agora = as("15:00");
    const quebrada = mundo({ cadastros: [conta({ criadaEm: minutosAntes(agora, 10) })], filaQuebrada: true });
    const r = await quebrada.acompanhar(agora);
    expect(r.boasVindas).toBe(0);
    expect(r.falhas).toHaveLength(1);
    expect([...quebrada.fichas.values()][0].boasVindasEm).toBeNull();
    expect(quebrada.naConversa).toEqual([]);
  });

  it("sem a casa configurada, não olha nada", async () => {
    const agora = as("15:00");
    const m = mundo({ casa: null, cadastros: [conta({ criadaEm: minutosAntes(agora, 10) })] });
    expect(await m.acompanhar(agora)).toMatchObject({ ligada: false, boasVindas: 0 });
  });
});

describe("a rotina: lembrete a quem travou", () => {
  it("sai entre 24 h e 72 h, uma vez, com o texto da etapa", async () => {
    const agora = as("10:00");
    const m = mundo({ cadastros: [conta({ criadaEm: minutosAntes(agora, 26 * 60), whatsapp: "pareando" })] });
    expect((await m.acompanhar(agora)).lembretes).toBe(1);
    expect(m.enfileirados[0].textos.join(" ")).toMatch(/conectar o seu WhatsApp/);
    expect((await m.acompanhar(new Date(agora.getTime() + 3_600_000))).lembretes).toBe(0);
  });

  it("não lembra quem já está atendendo com a maisa", async () => {
    const agora = as("10:00");
    const m = mundo({ cadastros: [conta({ criadaEm: minutosAntes(agora, 26 * 60), whatsapp: "conectado" })] });
    expect((await m.acompanhar(agora)).lembretes).toBe(0);
  });

  it("não lembra quem conversou com a casa nas últimas 24 h", async () => {
    const agora = as("10:00");
    const m = mundo({
      cadastros: [conta({ criadaEm: minutosAntes(agora, 26 * 60), whatsapp: null })],
      conversas: [{ telefone: "11988887777", ultimaDe: "cliente", ultimaEm: minutosAntes(agora, 120), clienteFalou: true }],
    });
    expect((await m.acompanhar(agora)).lembretes).toBe(0);
  });

  it("domingo não sai", async () => {
    const domingo = new Date("2026-11-08T10:00:00-03:00");
    const m = mundo({ cadastros: [conta({ criadaEm: minutosAntes(domingo, 26 * 60), whatsapp: null })] });
    expect((await m.acompanhar(domingo)).lembretes).toBe(0);
  });
});

describe("a rotina: retomada de quem conversou e sumiu", () => {
  const agora = as("11:00");
  type Parada = { telefone: string; nome: string; ultimaDe: "cliente" | "bot" | "voce"; ultimaEm: string; clienteFalou: boolean };
  const parada = (over: Partial<Parada> = {}): Parada => ({
    telefone: "5511977776666", nome: "Lucas", ultimaDe: "bot", ultimaEm: minutosAntes(agora, 30 * 60), clienteFalou: true, ...over,
  });

  it("sai uma vez para quem escreveu e ficou sem responder a maisa entre 24 h e 72 h", async () => {
    const m = mundo({ conversas: [parada()] });
    expect((await m.acompanhar(agora)).retomadas).toBe(1);
    expect(m.enfileirados[0].textos[0]).toMatch(/^Oi, Lucas! Ficou alguma dúvida/);
    expect((await m.acompanhar(new Date(agora.getTime() + 3_600_000))).retomadas).toBe(0);
  });

  it("não sai para quem só recebeu as boas-vindas e nunca escreveu", async () => {
    expect((await mundo({ conversas: [parada({ clienteFalou: false })] }).acompanhar(agora)).retomadas).toBe(0);
  });

  it("não sai quando a última fala foi do lead (quem deve resposta é a maisa, não ele)", async () => {
    expect((await mundo({ conversas: [parada({ ultimaDe: "cliente" })] }).acompanhar(agora)).retomadas).toBe(0);
  });

  it("não sai cedo nem tarde", async () => {
    expect((await mundo({ conversas: [parada({ ultimaEm: minutosAntes(agora, 5 * 60) })] }).acompanhar(agora)).retomadas).toBe(0);
    expect((await mundo({ conversas: [parada({ ultimaEm: minutosAntes(agora, 80 * 60) })] }).acompanhar(agora)).retomadas).toBe(0);
  });

  it("quem tem conta é do lembrete, não da retomada", async () => {
    const m = mundo({
      conversas: [parada()],
      cadastros: [conta({ telefone: "11977776666", criadaEm: minutosAntes(agora, 100 * 60), whatsapp: "conectado" })],
    });
    expect((await m.acompanhar(agora)).retomadas).toBe(0);
  });

  it("se não dá para saber quem tem conta, nada sai: a retomada não arrisca falar com quem já paga", async () => {
    const m = mundo({ conversas: [parada()] });
    const quebrado = criarAcompanharLeads({
      casa: () => CASA,
      cadastros: { faltando: () => [], recentes: async () => { throw new Error("auth fora"); }, porTelefone: async () => null },
      leads: leadsFalsos([parada()]).repo,
      fila: { enfileirar: async () => { throw new Error("não devia enfileirar"); } } as unknown as FilaDeEnvios,
      historico: { anexar: async () => {} } as unknown as RepositorioHistorico,
      drenar: async () => ({ enviados: 0, adiados: 0, desistidos: 0 }),
      vendedorDe: async () => BRUNO,
    });
    await expect(quebrado(agora)).rejects.toThrow("auth fora");
    expect(m.enfileirados).toEqual([]);
  });

  it("quem vai conversar com o Bruno não recebe retomada automática", async () => {
    const m = mundo({ conversas: [parada()] });
    const f = [...m.fichas.values()][0];
    f.passo = "conversa";
    expect((await m.acompanhar(agora)).retomadas).toBe(0);
  });
});

describe("qualificar o lead", () => {
  function montar() {
    const { repo } = leadsFalsos();
    const avisos: { para: string; textos: string[] }[] = [];
    const canal = { enviar: async (_t: ContextoTenant, para: string, textos: string[]) => void avisos.push({ para, textos }) } as unknown as CanalDeMensagens;
    const qualificar = criarQualificarLead({ leads: repo, planos: PLANOS, canal, vendedorDe: async () => BRUNO });
    return { qualificar, avisos, repo };
  }

  it("decide o passo em código e avisa o Bruno uma vez", async () => {
    const { qualificar, avisos } = montar();
    const tel = "5511988887777";
    const r1 = await qualificar(t, { telefone: tel, nome: "Fernanda", qualificacao: { profissao: "psicóloga", vertical: "terapeutas", equipe: 1, atendimentosPorSemana: 25 } });
    const r2 = await qualificar(t, { telefone: tel, qualificacao: { profissao: "psicóloga", vertical: "terapeutas", equipe: 1, atendimentosPorSemana: 30, comoMarcaHoje: "caderno" } });

    expect(r1).toMatchObject({ passo: "teste", avisou: true });
    expect(r1.plano?.chave).toBe("essencial");
    expect(r2.avisou).toBe(false);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].para).toBe(BRUNO);
  });

  it("avisa de novo quando o passo muda (ia testar e pediu para falar com alguém)", async () => {
    const { qualificar, avisos } = montar();
    const tel = "5511988887777";
    await qualificar(t, { telefone: tel, qualificacao: { profissao: "barbeiro", vertical: "barbeiros", equipe: 1 } });
    const r = await qualificar(t, { telefone: tel, qualificacao: { profissao: "barbeiro", vertical: "barbeiros", equipe: 1, pediuConversa: true } });
    expect(r).toMatchObject({ passo: "conversa", avisou: true });
    expect(avisos).toHaveLength(2);
  });

  it("o que vem do modelo é conferido: número absurdo some, vertical inventada vira genérico", async () => {
    const { qualificar, repo } = montar();
    const tel = "5511988887777";
    await qualificar(t, { telefone: tel, qualificacao: { profissao: "  dentista  ", vertical: "dentistas", equipe: -3, atendimentosPorSemana: "40" } });
    const f = await repo.ler(t, tel);
    expect(f?.qualificacao).toMatchObject({ profissao: "dentista", vertical: "generico", equipe: null, atendimentosPorSemana: 40, pediuConversa: false });
  });

  it("o aviso que falha não derruba a qualificação", async () => {
    const { repo } = leadsFalsos();
    const canal = { enviar: async () => { throw new Error("WhatsApp do Bruno fora"); } } as unknown as CanalDeMensagens;
    const qualificar = criarQualificarLead({ leads: repo, planos: PLANOS, canal, vendedorDe: async () => BRUNO });
    await expect(qualificar(t, { telefone: "5511988887777", qualificacao: { profissao: "x", vertical: "generico", equipe: 1 } })).resolves.toMatchObject({ passo: "teste" });
  });
});

describe("o link do teste", () => {
  it("usa o plano da ficha e marca que saiu", async () => {
    const { repo } = leadsFalsos();
    const tel = "5511988887777";
    await repo.qualificar(t, {
      telefone: tel, passo: "teste", plano: "essencial", em: "2026-11-05T15:00:00Z",
      qualificacao: { profissao: "barbeiro", vertical: "barbeiros", equipe: 1, atendimentosPorSemana: 20, comoMarcaHoje: null, interesse: null, pediuConversa: false },
    });
    const { link } = await criarLinkDoTesteDoLead({ leads: repo, base: "https://app.maisasecretary.com.br" })(t, { telefone: tel, vertical: "barbeiros" });
    expect(link).toContain("/assinar/essencial?teste=1&icp=barbeiros");
    expect((await repo.ler(t, tel))?.linkEm).not.toBeNull();
  });
});

describe("a conversa marcada", () => {
  it("vira passo CONVERSA e avisa o Bruno com dia e hora, mesmo sem o lead registrado antes", async () => {
    const { repo } = leadsFalsos();
    const avisos: string[] = [];
    const canal = { enviar: async (_t: ContextoTenant, _para: string, textos: string[]) => void avisos.push(...textos) } as unknown as CanalDeMensagens;
    await criarConversaMarcada({ leads: repo, canal, vendedorDe: async () => BRUNO })(t, {
      telefone: "5511966665555", nome: "Marcos", quando: "quinta, 29 de outubro às 13h30",
    });
    expect((await repo.ler(t, "5511966665555"))?.passo).toBe("conversa");
    expect(avisos[0]).toContain("📅 *Conversa marcada*");
    expect(avisos[0]).toContain("quinta, 29 de outubro às 13h30");
    expect(avisos[0]).toContain("https://wa.me/5511966665555");
  });
});
