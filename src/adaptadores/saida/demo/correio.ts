/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — o correio, no console.
 *
 * Sem `RESEND_API_KEY` o app não manda e-mail de verdade para ninguém: escreve no log o que
 * teria mandado. É o que deixa a rotina de avisos rodar em `npm run dev` sem que um teste
 * local acorde o dono de um negócio real às nove da manhã.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Correio } from "@/nucleo/portas/saida/correio";

export const correioDemo: Correio = {
  async enviar(m) {
    console.info(`[correio demo] para ${m.para} · ${m.assunto}\n${m.texto}`);
  },
  faltando: () => [],
};
