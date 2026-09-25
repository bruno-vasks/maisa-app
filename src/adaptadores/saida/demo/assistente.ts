/* Os ajustes da MAISA, com os valores de partida.
 *
 * O usuário edita isto na tela "A MAISA" e o resultado vive no localStorage. Quando o
 * agente de WhatsApp existir, é DAQUI que sai o prompt dele — por isso o formato é
 * estruturado, e não uma frase pronta. */

import type { Assistente, ChaveCfg, Dia, Toggle } from "@/nucleo/dominio/assistente";
import { HORAS_ANTES } from "@/nucleo/dominio/lembretes";

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

/* `PREVIEWS` saiu em 25/09/2026 (1C.12, 07 P0.2): era texto fixo com emoji, que dizia o horário
 * de outro negócio e "Te lembro por aqui" com o lembrete desligado. O preview agora é derivado do
 * dado (`ui/telas/ajustes.ts`, `falasDoPreview`). `SECOES_AJUSTE` saiu junto: os recortes dos
 * Ajustes moram lá também (`RECORTES`). */
