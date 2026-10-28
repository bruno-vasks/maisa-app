/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o cofre da subconta de recebimentos, em memória (27/10/2026).
 *
 * As regras da 039: uma conta por negócio, um token por conta, e a chave guardada à parte. Serve ao
 * teste do adaptador do Asaas e ao demo. ⚠️ Não é banco: morre no fim do processo.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CofreDeRecebimentos, ContaGuardada } from "@/nucleo/portas/saida/cofre-de-recebimentos";
import { DadoInvalido } from "@/nucleo/dominio/erros";

let CONTAS: Record<string, ContaGuardada & { hashDoToken: string }> = {};

export const cofreDeRecebimentosDemo: CofreDeRecebimentos = {
  async ler(t) {
    const c = CONTAS[t.tenantId];
    if (!c) return null;
    const { hashDoToken: _h, ...conta } = c;
    return conta;
  },
  async guardar(t, c) {
    if (CONTAS[t.tenantId]) throw new DadoInvalido("Este negócio já tem conta de recebimentos.");
    if (Object.values(CONTAS).some((x) => x.hashDoToken === c.hashDoToken)) throw new DadoInvalido("Token repetido.");
    CONTAS[t.tenantId] = { ...c };
  },
  async atualizarSituacao(t, situacao) {
    if (CONTAS[t.tenantId]) CONTAS[t.tenantId].situacao = situacao;
  },
  async negocioDoToken(hash) {
    return Object.keys(CONTAS).find((id) => CONTAS[id].hashDoToken === hash) ?? null;
  },
};

/** Só o teste chama. */
export function zerarCofreDeRecebimentosDemo(): void {
  CONTAS = {};
}
