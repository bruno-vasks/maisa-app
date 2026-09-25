/* Os ajustes da MAISA, com os valores de partida.
 *
 * O usuário edita isto na tela "A MAISA" e o resultado vive no localStorage. Quando o
 * agente de WhatsApp existir, é DAQUI que sai o prompt dele — por isso o formato é
 * estruturado, e não uma frase pronta. */

import type { Assistente, ChaveCfg, Dia, SecaoAjuste, Toggle } from "@/nucleo/dominio/assistente";
import { HORAS_ANTES } from "@/nucleo/dominio/lembretes";
import type { Msg } from "@/nucleo/dominio/conversas";

/**
 * A MAISA de partida — nome, tom e se está ligada.
 *
 * Existia só como campos espalhados na tela; virou objeto quando o agente de WhatsApp
 * passou a precisar dele para montar o prompt (ver `entrada/whatsapp/persona.ts`).
 * `ativa: true` é o padrão porque um agente que nasce desligado nunca é testado — mas
 * é o dono quem manda: desligar na tela cala a MAISA no WhatsApp também.
 */
export const ASSISTENTE_PADRAO: Assistente = {
  nome: "MAISA",
  tom: "amigável",
  saudacao: "Olá! Aqui é a MAISA. Como posso te ajudar?",
  ativa: true,
  /* O mesmo `default` da coluna — ver `HORAS_ANTES`. Os dois têm que bater: a demonstração
   * que começa num prazo diferente do banco faz a tela mentir antes de existir inquilino. */
  lembreteHoras: HORAS_ANTES,
};

export const SECOES_AJUSTE: SecaoAjuste[] = [
  { id: "personalidade", titulo: "Personalidade", sub: "Como a MAISA fala e se apresenta" },
  { id: "horarios", titulo: "Horário de atendimento", sub: "Quando ela pode marcar" },
  { id: "agendamentos", titulo: "Agendamentos", sub: "O que ela faz com os horários" },
  { id: "duvidas", titulo: "Dúvidas frequentes", sub: "O que ela responde além de agenda" },
  { id: "comportamento", titulo: "Comportamento", sub: "Até onde ela vai sozinha" },
];

export const DIAS_PADRAO: Dia[] = [
  { nome: "Segunda", aberto: true, de: "08:00", ate: "20:00" },
  { nome: "Terça", aberto: true, de: "08:00", ate: "20:00" },
  { nome: "Quarta", aberto: true, de: "08:00", ate: "20:00" },
  { nome: "Quinta", aberto: true, de: "08:00", ate: "20:00" },
  { nome: "Sexta", aberto: true, de: "08:00", ate: "21:00" },
  { nome: "Sábado", aberto: true, de: "09:00", ate: "13:00" },
  { nome: "Domingo", aberto: false, de: "—", ate: "—" },
];

export const CFG_PADRAO: Record<ChaveCfg, boolean> = {
  confirmar: true,
  lembrete: true,
  remarcar: true,
  encaminhar: true,
  precoCatalogo: true,
  pix: false,
  encaixe: false,
  /* Desligado no demo pelo mesmo motivo do banco (024): a mensagem vai para terceiro. */
  avisarRecibo: false,
};

export const TOGGLES_AGENDAMENTO: Toggle[] = [
  /* "Confirmar no WhatsApp" (`confirmar`) SAIU DA TELA em 25/09/2026 (1A.9, 07 P0.3): nada
   * em `src/` nem em `supabase/` lê a chave, e a ferramenta de marcar manda confirmar SEMPRE
   * (`ferramentas.ts`, "Depois de chamar, confirme…"). Desligar não desligava. A chave segue no
   * banco e no tipo; volta para cá quando o prompt ler as duas ramas (decisão do Bruno: mexe
   * em custo e cache do prompt). */
  /* ⚠️ O TÍTULO PERDEU O "3h" DE PROPÓSITO. O prazo agora é `assistente.lembreteHoras`,
   * escolhido por inquilino — um número fixo aqui viraria rótulo mentindo para quem pôs
   * 24h, e é a tela que ele abre para conferir. Quem mostra o prazo é o seletor ao lado,
   * que o lê do dado. */
  { chave: "lembrete", titulo: "Lembrete antes do atendimento", desc: "Manda um lembrete automático para o cliente" },
  { chave: "remarcar", titulo: "Permitir remarcação", desc: "Deixa o cliente remarcar sozinho pela conversa" },
  { chave: "encaixe", titulo: "Aceitar encaixes", desc: "Pode oferecer horários que abriram de última hora" },
];

export const TOGGLES_COMPORTAMENTO: Toggle[] = [
  { chave: "encaminhar", titulo: "Chamar você quando não souber", desc: "Em vez de arriscar, ela te passa a conversa" },
  { chave: "precoCatalogo", titulo: "Nunca inventar preço", desc: "Só fala valores que estão no catálogo" },
  { chave: "pix", titulo: "Pedir Pix antecipado", desc: "Para garantir o horário em dia cheio" },
];

/** Preview de WhatsApp que acompanha a seção aberta em "A MAISA". */
export const PREVIEWS: Record<string, { titulo: string; msgs: Msg[] }> = {
  personalidade: {
    titulo: "Personalidade",
    msgs: [
      { de: "cliente", txt: "Oi, bom dia!" },
      { de: "bot", txt: "Olá! Aqui é a MAISA, assistente do Seu Negócio. Como posso te ajudar hoje?" },
    ],
  },
  horarios: {
    titulo: "Horário de atendimento",
    msgs: [
      { de: "cliente", txt: "Que horas vocês atendem?" },
      { de: "bot", txt: "Atendo seg a sex das 8h às 20h, e sábado das 9h às 13h 🕗" },
      { de: "cliente", txt: "E domingo?" },
      { de: "bot", txt: "Domingo fechamos, mas já posso deixar seu horário marcado para segunda." },
    ],
  },
  agendamentos: {
    titulo: "Agendamentos",
    msgs: [
      { de: "cliente", txt: "Consigo marcar pra amanhã?" },
      { de: "bot", txt: "Consigo! Tenho 14:00 e 16:00. Qual fica melhor?" },
      { de: "cliente", txt: "16h" },
      /* Sem prazo na fala: o preview é o mesmo para todo inquilino, e o prazo agora varia
       * por inquilino (`lembreteHoras`). Um "3h" aqui contradiria a tela ao lado de quem
       * escolheu 1 dia — no mesmo acordeão, um do lado do outro. */
      { de: "bot", txt: "Fechado, 16:00 ✅ Te lembro por aqui antes do horário." },
    ],
  },
  comportamento: {
    titulo: "Comportamento",
    msgs: [
      { de: "cliente", txt: "Vocês fazem um serviço bem específico?" },
      { de: "bot", txt: "Boa pergunta! Vou confirmar com o responsável e já te respondo 🙌" },
    ],
  },
};
