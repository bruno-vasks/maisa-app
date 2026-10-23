/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — as contas novas, em memória (22/10/2026).
 *
 * Sem banco não existe `auth.users`, então nenhuma conta existe: `ler` devolve `null` e o aviso
 * de cadastro responde `conta_inexistente` sem mandar nada. Mesmo critério de `lembretes.ts`:
 * uma conta de fixture faria o correio (que pode ser a Resend de verdade, se a chave estiver no
 * `.env.local`) mandar um aviso falso ao Bruno toda vez que alguém chamasse a rota sem banco.
 *
 * `semear` existe para o desenvolvimento à mão (e para um teste que queira o adaptador inteiro):
 * põe uma conta no mapa, e daí em diante a marca funciona como a de verdade.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContaNova } from "@/nucleo/dominio/aviso-de-cadastro";
import type { ContasNovas } from "@/nucleo/portas/saida/contas-novas";

const contas = new Map<string, ContaNova>();

export const contasNovasDemo: ContasNovas = {
  faltando: () => [],

  async ler(id) {
    const c = contas.get(id);
    return c ? { ...c, campanha: { ...c.campanha } } : null;
  },

  async marcarAvisada(id, quando) {
    const c = contas.get(id);
    if (c) contas.set(id, { ...c, avisadaEm: quando });
  },

  async desmarcarAvisada(id) {
    const c = contas.get(id);
    if (c) contas.set(id, { ...c, avisadaEm: null });
  },
};

/** Só para desenvolvimento e teste: a conta passa a existir neste processo. */
export function semearContaNovaDemo(c: ContaNova): void {
  contas.set(c.id, { ...c });
}
