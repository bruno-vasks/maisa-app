/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — as contas do app, vistas pela casa (05/11/2026).
 *
 * Uma lista em memória que o teste e a bancada enchem (`CADASTROS_DEMO`). Sem nada nela, a casa
 * não acha conta nenhuma, que é o caso de quem chegou pela LP sem se cadastrar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CadastrosDoApp } from "@/nucleo/portas/saida/cadastros-do-app";
import type { CadastroNoApp } from "@/nucleo/dominio/vendas";
import { soDigitos } from "@/nucleo/dominio/clientes";

export const CADASTROS_DEMO: CadastroNoApp[] = [];

const k8 = (v: string | null | undefined) => soDigitos(v).slice(-8);

export const cadastrosDoAppDemo: CadastrosDoApp = {
  faltando: () => [],

  async recentes(desde) {
    return CADASTROS_DEMO.filter((c) => c.criadaEm >= desde)
      .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
      .map((c) => ({ ...c }));
  },

  async porTelefone(telefone) {
    const k = k8(telefone);
    if (k.length < 8) return null;
    const c = CADASTROS_DEMO.find((x) => k8(x.telefone) === k);
    return c ? { ...c } : null;
  },
};
