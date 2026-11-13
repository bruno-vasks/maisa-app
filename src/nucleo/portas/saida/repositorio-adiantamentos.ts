/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — os pagamentos adiantados, o crédito de sessões (12/11/2026, a Regina).
 * DDL em `supabase/042_adiantamentos.sql`.
 *
 * O paciente paga N sessões antes. O dinheiro é um pagamento avulso (`RepositorioRecibos`), que vira
 * o recibo na data do pagamento; o crédito, guardado aqui, faz as próximas N sessões da agenda
 * ficarem fora de qualquer outro recibo e de qualquer Pix.
 *
 * ⚠️ QUAIS SESSÕES O CRÉDITO COBRE É DERIVADO, NÃO GRAVADO. Quem decide é o banco
 * (`v_sessoes_adiantadas`): as sessões `marcado` sem recibo da pessoa, a partir do dia do pagamento,
 * em ordem, viram as do crédito. Cancelar uma passa o crédito para a seguinte sem ninguém gravar nada.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";

export type Adiantamento = {
  id: string;
  clienteId: string;
  /** O pagamento avulso que leva o valor e vira o recibo. */
  pagamentoId: string;
  /** Data do pagamento, civil. É a data do recibo. */
  pagoEm: string;
  valor: number;
  sessoes: number;
  /** As sessões contam a partir deste dia (o do pagamento). */
  aPartirDe: string;
  /** O pagamento já entrou num recibo (emitido, ou saindo). `false` = está na fila do Fiscal. */
  comRecibo: boolean;
  /** As sessões que o crédito cobre agora, em ordem de data. As que já passaram gastaram crédito. */
  cobertas: { atendimentoId: string; data: string }[];
};

export interface RepositorioAdiantamentos {
  /** Grava o crédito de um pagamento que já existe. */
  criar(t: ContextoTenant, p: { clienteId: string; pagamentoId: string; sessoes: number; aPartirDe: string }): Promise<{ id: string }>;
  /** Os créditos do negócio, com as sessões que cada um cobre. Mais novo primeiro. */
  listar(t: ContextoTenant): Promise<Adiantamento[]>;
}
