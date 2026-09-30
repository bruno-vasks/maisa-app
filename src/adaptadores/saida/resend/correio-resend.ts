/* ─────────────────────────────────────────────────────────────────────────────
 * `Correio` CUMPRIDO PELA RESEND. ⚠️ SÓ SERVIDOR.
 *
 * Um POST, e `fetch` à mão pelo mesmo motivo de `saida/abacatepay/cliente.ts`: a superfície é
 * um endpoint só, e uma dependência nova no `package.json` para isso é dívida sem troco.
 *
 * ⚠️ SEM RETRY, DE PROPÓSITO. A rotina de avisos roda uma vez por dia sobre todos os negócios;
 * repetir aqui dentro multiplica o tempo da função pelo número de e-mails que falharam, e a
 * Vercel mata a rodada no meio. Quem falhou é contado e aparece no log. Um aviso perdido custa
 * menos que uma rodada inteira morta.
 * ────────────────────────────────────────────────────────────────────────────── */

import { FalhaDoProvedor, NaoConfigurado } from "@/nucleo/dominio/erros";
import type { Correio, Mensagem } from "@/nucleo/portas/saida/correio";
import { CHAVE, REMETENTE, faltando } from "./config";

/** Teto por e-mail. Sem ele um `fetch` pendurado come o `maxDuration` da rotina inteira. */
const TETO_MS = 8_000;

export const correioResend: Correio = {
  async enviar(m: Mensagem): Promise<void> {
    if (!CHAVE) throw new NaoConfigurado(faltando());

    let r: Response;
    try {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: REMETENTE, to: [m.para], subject: m.assunto, text: m.texto }),
        signal: AbortSignal.timeout(TETO_MS),
        cache: "no-store",
      });
    } catch (e) {
      throw new FalhaDoProvedor("Resend: sem resposta.", e);
    }

    if (!r.ok) {
      /* O corpo da Resend diz o campo que ela recusou ("domain is not verified", "invalid
       * `to`"). Sem ele, 403 e 422 leem igual no log e a investigação começa pela chave. */
      const corpo = (await r.text().catch(() => "")).slice(0, 300);
      throw new FalhaDoProvedor(`Resend: HTTP ${r.status}. ${corpo}`);
    }
  },

  faltando,
};
