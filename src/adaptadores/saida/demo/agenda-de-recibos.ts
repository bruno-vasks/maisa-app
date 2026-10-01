/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — ninguém tem dia de recibo automático.
 *
 * Lista vazia, pelo motivo de `lembretes.ts` ao lado: sem banco não há pagamento de verdade, e
 * um paciente de fixture com dia marcado faria a rotina pedir recibo ao canal toda vez que alguém
 * a disparasse num ambiente sem Supabase. A rotina RODA, responde zero, e não emite nada.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AgendaDeRecibos } from "@/nucleo/portas/saida/agenda-de-recibos";

export const agendaDeRecibosDemo: AgendaDeRecibos = {
  async comDia() {
    console.info("[demo/agenda-de-recibos] rotina rodou sem banco: ninguém com dia de recibo");
    return [];
  },
};
