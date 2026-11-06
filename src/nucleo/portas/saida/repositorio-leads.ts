/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — a ficha de cada lead da casa (05/11/2026).
 *
 * Uma linha por telefone, no negócio da casa: o que a conversa descobriu (a qualificação), o
 * próximo passo que o código decidiu, quando o link do teste saiu, e quando cada mensagem
 * automática saiu. Ver `dominio/vendas.ts`.
 *
 * ── A RESERVA É A TRAVA CONTRA A MENSAGEM EM DOBRO ──
 *
 * `reservarAutomatica` grava o instante SÓ SE ainda não houver um, e diz se gravou. Quem
 * implementa faz isso numa operação só (no banco, um `update … where … is null`): a rotina pode
 * rodar em duas instâncias ao mesmo tempo, e ler-depois-gravar deixaria as duas mandarem. Quem
 * não reservou não manda.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { Automatica, ChaveDoPlano, FichaDeLead, ProximoPasso, Qualificacao } from "../../dominio/vendas";

/** Uma conversa da casa e a sua última fala. Matéria-prima da retomada. */
export type ConversaDoLead = {
  ficha: FichaDeLead;
  /** Quem falou por último, e quando. */
  ultimaDe: "cliente" | "bot" | "voce";
  ultimaEm: string;
  /** O lead escreveu pelo menos uma vez. Quem só recebeu as boas-vindas não conta. */
  clienteFalou: boolean;
};

export interface RepositorioDeLeads {
  ler(t: ContextoTenant, telefone: string): Promise<FichaDeLead | null>;

  /** Cria a linha se ela não existe, e guarda o nome quando ele aparece. Não apaga nada. */
  registrarContato(t: ContextoTenant, p: { telefone: string; nome?: string | null }): Promise<void>;

  qualificar(
    t: ContextoTenant,
    p: { telefone: string; nome?: string | null; qualificacao: Qualificacao; passo: ProximoPasso; plano: ChaveDoPlano | null; em: string },
  ): Promise<void>;

  /** Uma conversa com o vendedor foi marcada: o passo vira `conversa`, sem mexer na qualificação. */
  marcarConversa(t: ContextoTenant, p: { telefone: string; nome?: string | null }): Promise<void>;

  /** O link do teste saiu para este telefone em `em`. */
  marcarLink(t: ContextoTenant, p: { telefone: string; em: string }): Promise<void>;

  /** Grava `em` na automática deste tipo só se ela ainda não saiu. `true` = é sua, pode mandar. */
  reservarAutomatica(t: ContextoTenant, p: { telefone: string; nome?: string | null; tipo: Automatica; em: string }): Promise<boolean>;

  /** Desfaz a reserva de um envio que nem entrou na fila. Não lança: quem chama já trata um erro. */
  devolverAutomatica(t: ContextoTenant, p: { telefone: string; tipo: Automatica }): Promise<void>;

  /** As conversas cuja última fala é de `desde` para cá. Só deste negócio. */
  conversas(t: ContextoTenant, desde: string): Promise<ConversaDoLead[]>;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
