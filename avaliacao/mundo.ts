/* ─────────────────────────────────────────────────────────────────────────────
 * O MUNDO DE UMA CONVERSA — o negócio, a agenda e a MAISA montada em cima deles.
 *
 * As peças são as de produção, ligadas como em `composicao.ts`: os casos de uso do
 * núcleo, o `criarAgente` do adaptador de WhatsApp, as ferramentas e os guardrails.
 * Só o que guarda estado é trocado pelo `demo` em memória, e o cadastro do negócio sai
 * de `negocios.ts`. Nada aqui fala com Supabase, Google ou Evolution.
 *
 * O isolamento entre cenários é o `tenantId`: os adaptadores `demo` separam agenda,
 * memória e conversa por inquilino, e cada conversa nasce com um inquilino novo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { criarAgente, type Dependencias as DepsDoAgente } from "@/adaptadores/entrada/whatsapp/agente";
import type { ConfiguracaoDoAgente } from "@/adaptadores/entrada/whatsapp/persona";
import { agendaDemo } from "@/adaptadores/saida/demo/agenda";
import { espelhoDemo, registroDemo } from "@/adaptadores/saida/demo/atendimentos";
import { conversasDemo, historicoDemo, memoriaDemo } from "@/adaptadores/saida/demo/memoria";
import { embeddingDemo } from "@/adaptadores/saida/demo/embedding";
import { embeddingDePergunta, embeddingGemini } from "@/adaptadores/saida/gemini/embedding";
import { criarCancelarAtendimento, criarLerAgenda } from "@/nucleo/aplicacao/agenda";
import { criarAgendarAtendimento } from "@/nucleo/aplicacao/agendar-atendimento";
import { criarResponderDuvida } from "@/nucleo/aplicacao/faqs";
import { criarAnotarFato, criarLembrarCliente } from "@/nucleo/aplicacao/memoria";
import { criarOferecerHorarios } from "@/nucleo/aplicacao/oferecer-horarios";
import type { Cliente } from "@/nucleo/dominio/clientes";
import { CORTE_DE_SIMILARIDADE, type FaqEncontrada } from "@/nucleo/dominio/faq";
import { atorAgente, type ContextoTenant } from "@/nucleo/dominio/tenant";
import { hojeISO, somarDias } from "@/nucleo/dominio/tempo";
import type { AvaliarAtendimento } from "@/nucleo/portas/entrada/casos-de-uso";
import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import type { ModeloDeConversa } from "@/nucleo/portas/saida/modelo-conversa";
import type { RepositorioFaqs } from "@/nucleo/portas/saida/repositorio-faqs";
import type { RepositorioNegocio } from "@/nucleo/portas/saida/repositorio-negocio";

import type { AtendimentoVisto, Cenario, Desfecho } from "./cenarios";
import { NEGOCIOS, type NegocioDeTeste } from "./negocios";

const ultimos8 = (tel: string) => tel.replace(/\D/g, "").slice(-8);

const naoUsado = (nome: string) => async () => {
  throw new Error(`${nome} não é usado na avaliação`);
};

/** O cadastro, em memória. Só as leituras que o atendimento faz; o resto estoura. */
function repositorioDe(n: NegocioDeTeste, clientes: Cliente[]): RepositorioNegocio {
  return {
    negocio: async () => n.negocio,
    profissional: async (_t, id) => n.profissionais.find((p) => p.id === id) ?? null,
    servico: async (_t, id) => n.servicos.find((s) => s.id === id) ?? null,
    cliente: async (_t, id) => clientes.find((c) => c.id === id) ?? null,
    expediente: async (_t, id) => n.profissionais.find((p) => p.id === id)?.expediente ?? null,
    profissionais: async () => [...n.profissionais],
    servicos: async () => [...n.servicos],
    clientes: async () => [...clientes],
    agendasPermitidas: async () => n.profissionais.filter((p) => p.ativo).map((p) => p.id),
    clientePorTelefone: async (_t, tel) => clientes.find((c) => ultimos8(c.telefone) === ultimos8(tel)) ?? null,
    async garantirCliente(_t, p) {
      const achado = clientes.find((c) => ultimos8(c.telefone) === ultimos8(p.telefone));
      if (achado) return achado;
      const novo = cliente(p.nome, p.telefone);
      clientes.push(novo);
      return novo;
    },
    renomear: naoUsado("renomear"),
    trocarFoto: naoUsado("trocarFoto"),
    salvarServico: naoUsado("salvarServico"),
    removerServico: naoUsado("removerServico"),
    salvarProfissional: naoUsado("salvarProfissional"),
    salvarExpediente: naoUsado("salvarExpediente"),
    atualizarCliente: naoUsado("atualizarCliente"),
    criarCliente: naoUsado("criarCliente"),
  } as RepositorioNegocio;
}

function cliente(nome: string, telefone: string): Cliente {
  return {
    id: randomUUID(), nome, telefone, email: "", cpf: "", canal: "Presencial", ativo: true,
    desde: hojeISO(), servicoId: "", atendimentos: 0, valor: 0,
  };
}

/* Paciência com a cota do embedding, como a do modelo em `conversa.ts`: dezenas de conversas
 * começando juntas estouram o limite por minuto do plano gratuito, e a conversa morria antes da
 * primeira mensagem. O erro do adaptador é `FalhaDoProvedor` com o status na causa. */
async function comPaciencia<T>(f: () => Promise<T>): Promise<T> {
  for (const espera of [3_000, 6_000, 12_000, 20_000, 30_000, 45_000, 60_000, 0]) {
    try {
      return await f();
    } catch (e) {
      const texto = `${(e as Error)?.message ?? ""} ${String((e as { causa?: unknown })?.causa ?? "")}`;
      if (!espera || !/429|quota|RESOURCE_EXHAUSTED/i.test(texto)) throw e;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw new Error("inalcançável");
}

/* As respostas prontas, indexadas com o MESMO embedding de produção (Gemini). Guardadas em
 * disco entre processos: são as mesmas em toda conversa, e calcular de novo em cada uma
 * gastava a cota que a conversa precisa. Gravação por arquivo temporário + rename, porque
 * várias conversas escrevem ao mesmo tempo. */
const CACHE_DE_VETORES = join(tmpdir(), "maisa-avaliacao-vetores-faq.json");

function lerCacheDeVetores(): Record<string, number[]> {
  try {
    return existsSync(CACHE_DE_VETORES) ? JSON.parse(readFileSync(CACHE_DE_VETORES, "utf8")) : {};
  } catch {
    return {};
  }
}

async function vetorDaPergunta(pergunta: string): Promise<number[]> {
  const guardado = lerCacheDeVetores()[pergunta];
  if (guardado) return guardado;
  if (EMBEDDING_DEMO) return embeddingDemo.embutir(pergunta);
  const vetor = await comPaciencia(() => embeddingGemini.embutir(pergunta));
  const temporario = `${CACHE_DE_VETORES}.${process.pid}`;
  writeFileSync(temporario, JSON.stringify({ ...lerCacheDeVetores(), [pergunta]: vetor }));
  renameSync(temporario, CACHE_DE_VETORES);
  return vetor;
}

const vetoresPorNegocio = new Map<string, Promise<number[][]>>();

/* `AVAL_EMBEDDING=demo` troca o embedding do Gemini pelo saco de palavras do `demo`. Existe
 * porque a bancada estourou a cota DIÁRIA do embedding (1000/dia no plano gratuito) em
 * 26/10/2026, e a chave é a mesma de produção. É busca lexical, mais fraca: compare só
 * rodadas que usaram o mesmo embedding. */
const EMBEDDING_DEMO = process.env.AVAL_EMBEDDING === "demo";

function faqsDe(n: NegocioDeTeste): RepositorioFaqs {
  let vetores = vetoresPorNegocio.get(n.chave);
  if (!vetores) {
    vetores = (async () => {
      const vs: number[][] = [];
      for (const f of n.faqs) vs.push(await vetorDaPergunta(f.pergunta));
      return vs;
    })();
    vetoresPorNegocio.set(n.chave, vetores);
  }
  const cosseno = (a: number[], b: number[]) => {
    let ab = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? ab / Math.sqrt(na * nb) : 0;
  };
  return {
    listar: async () => n.faqs.map((f, i) => ({ id: `faq-${i}`, ...f, usos: 0 })),
    async buscar(_t, vetor, k = 3): Promise<FaqEncontrada[]> {
      const vs = await vetores!;
      return n.faqs
        .map((f, i) => ({ id: `faq-${i}`, ...f, similaridade: cosseno(vs[i], vetor) }))
        .filter((f) => f.similaridade >= CORTE_DE_SIMILARIDADE)
        .sort((a, b) => b.similaridade - a.similaridade)
        .slice(0, k);
    },
    salvar: naoUsado("salvar"),
    remover: naoUsado("remover"),
    registrarUso: async () => {},
  } as RepositorioFaqs;
}

/** Um gerador pseudoaleatório com semente: o mesmo cenário ocupa a agenda do mesmo jeito. */
function sorteador(semente: string) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export type Mundo = {
  t: ContextoTenant;
  negocio: NegocioDeTeste;
  responder: ReturnType<typeof criarAgente>;
  /** Mensagens que o canal entregou ao cliente, e chamadas ao dono. */
  escalacoes: string[];
  desfecho(): Desfecho;
};

export type OpcoesDoMundo = {
  modelo: ModeloDeConversa;
};

export async function criarMundo(c: Cenario, o: OpcoesDoMundo): Promise<Mundo> {
  const n = NEGOCIOS[c.negocio];
  const t: ContextoTenant = { tenantId: `aval-${c.id}-${randomUUID().slice(0, 8)}`, usuarioId: "avaliacao", ator: atorAgente("avaliacao") };
  const clientes: Cliente[] = [];
  const negocio = repositorioDe(n, clientes);
  const agenda = agendaDemo;
  const registro = registroDemo;
  const memoria = memoriaDemo;

  const agendarAtendimento = criarAgendarAtendimento({ agenda, negocio, registro });
  const anotarFato = criarAnotarFato({ negocio, memoria });

  /* ── o cliente, se já é conhecido ── */
  if (c.conhecido) {
    clientes.push(cliente(c.conhecido.nome, c.telefone));
    await anotarFato(t, { telefone: c.telefone, nome: c.conhecido.nome });
    for (const v of c.conhecido.visitas ?? []) {
      await anotarFato(t, { telefone: c.telefone, escolha: { data: v.data, inicio: v.inicio, profissionalId: v.profissionalId, servicoId: v.servicoId } });
    }
  }

  /* ── o que ESTE cliente já tem marcado ── */
  for (const m of c.marcados ?? []) {
    await agendarAtendimento(t, {
      agendaId: m.profissionalId, clienteId: clientes[0]?.id ?? `lead:${c.telefone}`,
      clienteNome: c.conhecido?.nome ?? "Cliente", clienteTelefone: c.telefone,
      servicoId: m.servicoId, data: m.data, inicio: m.inicio, maisaAg: randomUUID(),
      comMeet: false, convidarCliente: false,
    });
  }
  const jaTinha = new Set(espelhoDemo(t.tenantId).map((a) => a.maisaAg));

  /* ── a agenda dos outros: ocupada em parte, sempre do mesmo jeito para o mesmo cenário ── */
  const sorte = sorteador(c.id);
  const ocupacao = c.ocupacao ?? 0.45;
  const hoje = hojeISO();
  for (let d = 0; d < 12; d++) {
    const data = somarDias(hoje, d);
    for (const p of n.profissionais) {
      for (let h = p.expediente.de; h < p.expediente.ate; h += 0.5) {
        if (sorte() >= ocupacao) continue;
        const servicoId = p.servicoIds[Math.floor(sorte() * p.servicoIds.length)];
        try {
          await agendarAtendimento(t, {
            agendaId: p.id, clienteId: `lead:outro-${d}-${h}`, clienteNome: "Outro cliente",
            clienteTelefone: `1198${String(Math.floor(sorte() * 1e7)).padStart(7, "0")}`,
            servicoId, data, inicio: h, maisaAg: randomUUID(), comMeet: false, convidarCliente: false,
          });
        } catch {
          /* Colisão, folga, horário que já passou: o núcleo recusa e a vaga fica livre. */
        }
      }
    }
  }

  const escalacoes: string[] = [];
  const canal: CanalDeMensagens = {
    enviar: async () => {},
    enviarDocumento: async () => {},
    escalar: async (_t, p) => void escalacoes.push(p.motivo),
  };

  const configuracao: ConfiguracaoDoAgente = {
    negocio: n.negocio,
    assistente: n.assistente,
    servicos: n.servicos,
    profissionais: n.profissionais,
    expedientes: Object.fromEntries(n.profissionais.map((p) => [p.id, p.expediente])),
    semana: n.semana,
    cfg: n.cfg,
  };

  const deps: DepsDoAgente = {
    modelo: o.modelo,
    config: async () => configuracao,
    oferecerHorarios: criarOferecerHorarios({ agenda, negocio, registro }),
    agendarAtendimento,
    cancelarAtendimento: criarCancelarAtendimento({ agenda, negocio, registro }),
    lerAgenda: criarLerAgenda({ agenda, negocio, registro }),
    lembrarCliente: criarLembrarCliente({ negocio, memoria }),
    /* A regra de quem a MAISA atende (número pessoal × do negócio) tem teste próprio e
     * não é o que esta bancada mede: aqui todo mundo é cliente do negócio. */
    avaliarAtendimento: (async () => ({ pode: true, motivo: null, nome: null })) as unknown as AvaliarAtendimento,
    anotarFato,
    responderDuvida: criarResponderDuvida({
      faqs: faqsDe(n),
      embeddingDePergunta: EMBEDDING_DEMO
        ? embeddingDemo
        : { embutir: (texto) => comPaciencia(() => embeddingDePergunta.embutir(texto)) },
    }),
    historico: historicoDemo,
    conversas: conversasDemo,
    canal,
  };

  const visto = (a: ReturnType<typeof espelhoDemo>[number]): AtendimentoVisto => ({
    servicoId: a.servicoId,
    servicoNome: a.servicoNome,
    profissionalId: a.agendaId,
    data: a.dataLocal,
    inicio: a.horaInicio,
    situacao: a.situacao,
  });

  return {
    t,
    negocio: n,
    responder: criarAgente(deps),
    escalacoes,
    desfecho(): Desfecho {
      const meus = espelhoDemo(t.tenantId).filter((a) => ultimos8(a.clienteTel) === ultimos8(c.telefone));
      return {
        novos: meus.filter((a) => !jaTinha.has(a.maisaAg) && a.situacao === "marcado").map(visto),
        cancelados: meus.filter((a) => jaTinha.has(a.maisaAg) && a.situacao === "cancelado").map(visto),
        escalou: escalacoes.length > 0,
        motivosDeEscalada: [...escalacoes],
      };
    },
  };
}
