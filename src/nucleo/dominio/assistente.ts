/* ─────────────────────────────────────────────────────────────────────────────
 * ASSISTENTE — como a MAISA se comporta, por inquilino.
 *
 * Isto deixa de ser tela de configuração e vira o PROMPT do agente no dia em que o
 * WhatsApp entrar: o tom, o horário em que ela pode marcar e os limites do que ela faz
 * sozinha são exatamente os parâmetros que o agente vai receber. Por isso o formato é
 * dado estruturado, e não texto pronto.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Vertical } from "./negocio";

/**
 * A MAISA nasce atendendo no WhatsApp?
 *
 * ★ TERAPEUTA NASCE COM ELA DESLIGADA, desde 24/09/2026. No mesmo dia, a MAISA de uma
 * psicóloga respondeu três pessoas da vida pessoal dela. Consultório é, quase sempre, uma
 * pessoa só atendendo pelo celular pessoal (o modo do número nasce `pessoal`, ver
 * `MODO_PADRAO`), e muita terapeuta assina só pelo recibo. Para esse público, "ligado" tem
 * que ser um gesto dela — no wizard ("Ela conversa e marca sozinha") ou na tela "A MAISA".
 *
 * Barbearia continua nascendo ligada: responder quem pede corte é o produto inteiro lá.
 */
export function atendeNoWhatsAppPorPadrao(vertical: Vertical): boolean {
  return vertical !== "terapeutas";
}

export const TONS = ["amigável", "profissional", "descontraído"] as const;
export type Tom = (typeof TONS)[number];

export type Assistente = {
  nome: string;
  tom: Tom;
  saudacao: string;
  ativa: boolean;
  /**
   * Quantas horas antes do atendimento o lembrete sai.
   *
   * Mora aqui e não em `ChaveCfg` porque não é interruptor: `lembrete` decide SE manda,
   * este decide QUANDO. Enfiá-lo entre os toggles obrigaria um `Record<ChaveCfg, boolean>`
   * a virar `boolean | number`, e o tipo que hoje recusa chave inventada passaria a aceitar
   * qualquer coisa. Ver `OPCOES_ANTECEDENCIA` em `dominio/lembretes.ts`.
   */
  lembreteHoras: number;
};

/** Um dia da semana no horário de atendimento anunciado ao cliente. */
export type Dia = { nome: string; aberto: boolean; de: string; ate: string };

/** Chaves dos toggles de comportamento — o store guarda um booleano por chave. */
export type ChaveCfg =
  | "confirmar" | "lembrete" | "remarcar"
  | "encaminhar" | "precoCatalogo" | "pix" | "encaixe"
  /* ⚠️ O ÚNICO QUE DISPARA SEM NINGUÉM POR PERTO. Os outros seis governam a conversa: existe
   * alguém do outro lado tendo escrito. Este é acionado pelo CALLBACK do canal de emissão, minutos
   * depois de um clique — e a mensagem vai para o paciente, do número pessoal de quem usa a MAISA.
   * Daí o padrão `false` no banco (024). Ver `criarFecharReciboDoCallback`. */
  | "avisarRecibo";

export type SecaoAjuste = { id: string; titulo: string; sub: string };

/** Um toggle como a tela mostra: chave + como explicá-lo. */
export type Toggle = { chave: ChaveCfg; titulo: string; desc: string };
