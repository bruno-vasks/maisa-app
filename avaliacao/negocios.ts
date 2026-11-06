/* ─────────────────────────────────────────────────────────────────────────────
 * OS DOIS NEGÓCIOS DE TESTE — um consultório e uma barbearia, as duas verticais que a
 * MAISA vende hoje (ver `docs/dominio.md`).
 *
 * Inventados, mas com a forma exata do que o banco devolve: os mesmos tipos de
 * `nucleo/dominio`, o mesmo formato de expediente, a mesma grade anunciada. A MAISA
 * não sabe que está num teste; o prompt dela é montado por `parteEstavel` a partir
 * daqui, como seria a partir do Supabase.
 *
 * As respostas prontas deixam DE FORA, de propósito, o que um cenário pergunta para ver
 * a MAISA dizer "vou confirmar" (estacionamento na barbearia). Acrescentar uma resposta
 * aqui muda o que esse cenário mede.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Assistente, ChaveCfg } from "@/nucleo/dominio/assistente";
import type { Profissional, Servico } from "@/nucleo/dominio/catalogo";
import type { SemanaAnunciada } from "@/nucleo/dominio/horarios";
import type { Negocio } from "@/nucleo/dominio/negocio";

export type NegocioDeTeste = {
  chave: "consultorio" | "barbearia" | "casa";
  negocio: Negocio;
  assistente: Assistente;
  cfg: Record<ChaveCfg, boolean>;
  servicos: Servico[];
  profissionais: Profissional[];
  semana: SemanaAnunciada;
  faqs: { pergunta: string; resposta: string }[];
};

const NEGOCIO_BASE = {
  plano: "Essencial",
  precoPlano: 0,
  proximaCobranca: "",
  cartao: "",
  conversasPlano: "",
} satisfies Omit<Negocio, "nome">;

const CFG_BASE: Record<ChaveCfg, boolean> = {
  confirmar: true,
  lembrete: true,
  remarcar: true,
  encaminhar: true,
  precoCatalogo: true,
  pix: false,
  encaixe: false,
  avisarRecibo: false,
  reciboPrimeiroParaMim: false,
};

function profissional(p: Pick<Profissional, "id" | "nome" | "papel" | "servicoIds" | "expediente">): Profissional {
  return {
    ...p,
    atendimentosMes: 0,
    avaliacao: 5,
    comissao: 0,
    desde: "2024-01-01",
    ativo: true,
    horario: "",
    folga: "",
  };
}

/** `de`/`ate` em "HH:MM"; `null` fecha o dia. Sete posições, segunda primeiro. */
function semana(dias: ([string, string] | null)[]): SemanaAnunciada {
  return dias.map((d, dow) => (d ? { dow, aberto: true, de: d[0], ate: d[1] } : { dow, aberto: false, de: null, ate: null }));
}

/* ───────────────────────────── o consultório ───────────────────────────── */

export const CONSULTORIO: NegocioDeTeste = {
  chave: "consultorio",
  negocio: { ...NEGOCIO_BASE, nome: "Espaço Acolher Psicologia" },
  /* "profissional" é o tom com que o provisionamento cria toda conta de terapeuta
   * (`005_provisionar.sql`). Testar com outro seria testar uma MAISA que não existe. */
  assistente: { nome: "MAISA", tom: "profissional", saudacao: "", ativa: true, lembreteHoras: 24 },
  cfg: { ...CFG_BASE },
  servicos: [
    { id: "sv-sessao", nome: "Sessão individual", categoria: "Recorrente", preco: 200, duracao: 50, profissionalIds: ["pr-ana", "pr-marcos"], ativo: true },
    { id: "sv-primeira", nome: "Primeira consulta", categoria: "Extra", preco: 150, duracao: 50, profissionalIds: ["pr-ana", "pr-marcos"], ativo: true },
    { id: "sv-casal", nome: "Terapia de casal", categoria: "Recorrente", preco: 320, duracao: 80, profissionalIds: ["pr-ana"], ativo: true },
  ],
  profissionais: [
    profissional({
      id: "pr-ana", nome: "Ana Ribeiro", papel: "Psicóloga",
      servicoIds: ["sv-sessao", "sv-primeira", "sv-casal"],
      expediente: { folga: [5, 6], de: 8, ate: 18 },
    }),
    profissional({
      id: "pr-marcos", nome: "Marcos Teles", papel: "Psicólogo",
      servicoIds: ["sv-sessao", "sv-primeira"],
      expediente: { folga: [0, 6], de: 10, ate: 20 },
    }),
  ],
  semana: semana([
    ["08:00", "20:00"], ["08:00", "20:00"], ["08:00", "20:00"], ["08:00", "20:00"], ["08:00", "20:00"],
    ["10:00", "20:00"], null,
  ]),
  faqs: [
    { pergunta: "Qual o endereço?", resposta: "Rua Harmonia, 412, sala 23, Vila Madalena, São Paulo. Fica a 8 minutos a pé do metrô Vila Madalena." },
    { pergunta: "Vocês atendem online?", resposta: "Sim. As sessões online são por Google Meet, com o mesmo valor e a mesma duração da presencial." },
    { pergunta: "Aceitam convênio ou plano de saúde?", resposta: "Não atendemos por convênio. Emitimos recibo no Receita Saúde, que a maioria dos planos aceita para pedir reembolso." },
    { pergunta: "Quais as formas de pagamento?", resposta: "Pix ou cartão de crédito, no dia da sessão." },
    { pergunta: "Qual a política de cancelamento?", resposta: "Pedimos aviso com 24 horas de antecedência. Cancelamento em cima da hora é cobrado." },
    { pergunta: "Atendem adolescentes e crianças?", resposta: "Atendemos adolescentes a partir de 14 anos e adultos. Não atendemos crianças." },
    { pergunta: "Quanto tempo dura a sessão?", resposta: "A sessão individual dura 50 minutos. A de casal dura 80 minutos." },
  ],
};

/* ───────────────────────────── a barbearia ───────────────────────────── */

export const BARBEARIA: NegocioDeTeste = {
  chave: "barbearia",
  negocio: { ...NEGOCIO_BASE, nome: "Barbearia do Zé" },
  assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 },
  cfg: { ...CFG_BASE, encaixe: true },
  servicos: [
    { id: "sv-corte", nome: "Corte", categoria: "Recorrente", preco: 50, duracao: 40, profissionalIds: ["pr-ze", "pr-rafael", "pr-leo"], ativo: true },
    { id: "sv-barba", nome: "Barba", categoria: "Recorrente", preco: 35, duracao: 30, profissionalIds: ["pr-ze", "pr-rafael"], ativo: true },
    { id: "sv-combo", nome: "Corte + barba", categoria: "Pacote", preco: 80, duracao: 60, profissionalIds: ["pr-ze", "pr-rafael"], ativo: true },
    { id: "sv-pezinho", nome: "Pezinho", categoria: "Extra", preco: 15, duracao: 15, profissionalIds: ["pr-ze", "pr-rafael", "pr-leo"], ativo: true },
    { id: "sv-sobrancelha", nome: "Sobrancelha", categoria: "Extra", preco: 20, duracao: 15, profissionalIds: ["pr-leo"], ativo: true },
  ],
  profissionais: [
    profissional({
      id: "pr-ze", nome: "Zé Carlos", papel: "Barbeiro e dono",
      servicoIds: ["sv-corte", "sv-barba", "sv-combo", "sv-pezinho"],
      expediente: { folga: [0, 6], de: 9, ate: 19 },
    }),
    profissional({
      id: "pr-rafael", nome: "Rafael", papel: "Barbeiro",
      servicoIds: ["sv-corte", "sv-barba", "sv-combo", "sv-pezinho"],
      expediente: { folga: [0, 6], de: 10, ate: 19 },
    }),
    profissional({
      id: "pr-leo", nome: "Léo", papel: "Barbeiro",
      servicoIds: ["sv-corte", "sv-pezinho", "sv-sobrancelha"],
      expediente: { folga: [5, 6], de: 12, ate: 20 },
    }),
  ],
  semana: semana([
    ["12:00", "20:00"], ["09:00", "20:00"], ["09:00", "20:00"], ["09:00", "20:00"], ["09:00", "20:00"],
    ["09:00", "19:00"], null,
  ]),
  faqs: [
    { pergunta: "Onde fica a barbearia?", resposta: "Rua dos Pinheiros, 1.020, loja 3, Pinheiros, São Paulo. Em frente à padaria Pão de Ouro." },
    { pergunta: "Quais as formas de pagamento?", resposta: "Pix, cartão de débito e crédito, e dinheiro." },
    { pergunta: "Atende criança?", resposta: "Sim, a partir de 3 anos, com o mesmo valor do corte." },
    { pergunta: "Precisa agendar ou pode chegar?", resposta: "Pode chegar sem horário, mas aí entra na fila. Com horário marcado é garantido." },
    { pergunta: "Tem bebida?", resposta: "Café é sempre cortesia. Sexta e sábado tem cerveja gelada por conta da casa." },
  ],
};

/**
 * A CASA (05/11/2026): a maisa vendendo a própria maisa. O negócio que o Bruno vai criar no app:
 * um serviço só, a conversa de 15 minutos com ele, e as respostas prontas tiradas das perguntas
 * frequentes das LPs. Os planos e o prompt de vendas vêm do código (`mundo.ts` liga `vendas`).
 */
export const CASA: NegocioDeTeste = {
  chave: "casa",
  negocio: { ...NEGOCIO_BASE, nome: "maisa" },
  assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 },
  cfg: { ...CFG_BASE, precoCatalogo: false },
  servicos: [
    { id: "sv-conversa", nome: "Conversa com o Bruno", categoria: "Recorrente", preco: 0, duracao: 15, profissionalIds: ["pr-bruno"], ativo: true },
  ],
  profissionais: [
    profissional({
      id: "pr-bruno", nome: "Bruno", papel: "Fundador da maisa",
      servicoIds: ["sv-conversa"],
      expediente: { folga: [5, 6], de: 9, ate: 18 },
    }),
  ],
  semana: semana([
    ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], null, null,
  ]),
  faqs: [
    { pergunta: "Preciso trocar meu número de WhatsApp?", resposta: "Não. A maisa atende no número que você já usa. Seus clientes continuam falando com você no mesmo contato." },
    { pergunta: "Quanto tempo leva para começar?", resposta: "No ar em 5 minutos. Você conecta o WhatsApp e ela já começa a atender, com a gente do lado na configuração." },
    { pergunta: "E se o cliente perguntar algo que ela não sabe?", resposta: "Ela não inventa resposta. Passa a conversa para você, e no painel você vê todas as conversas e pode assumir qualquer uma." },
    { pergunta: "A maisa substitui o meu contador?", resposta: "Não. Ela emite a nota de cada sessão e deixa o mês fechado para ele." },
    { pergunta: "Tem fidelidade?", resposta: "Não. Você cancela quando quiser." },
    { pergunta: "E os dados dos meus clientes?", resposta: "Ficam no Brasil, e o sigilo profissional é respeitado." },
    { pergunta: "Funciona com o Google Agenda?", resposta: "Sim. Conectando o Google Agenda, compromisso seu bloqueia o horário para os clientes. Sem Google Agenda, ela usa a agenda do painel." },
  ],
};

export const NEGOCIOS = { consultorio: CONSULTORIO, barbearia: BARBEARIA, casa: CASA } as const;
