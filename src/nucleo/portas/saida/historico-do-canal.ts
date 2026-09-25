/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — o que o WhatsApp do dono já viu de um número.
 *
 * Existe por causa de 24/09/2026: a MAISA respondeu três pessoas que conversavam com a
 * Regina desde julho, porque o único sinal consultado era o caderno — e o caderno cobria 2%
 * da agenda dela. O histórico que o celular sincronizou ao parear é a outra fonte, e é a que
 * sabe responder "essa pessoa é nova?".
 *
 * ⚠️ QUEM IMPLEMENTA LANÇA EM FALHA, e quem chama cala. Não inventar "sem rastro" quando o
 * provedor não respondeu: "sem rastro" é exatamente o que libera a MAISA para falar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { RastroNoCanal } from "../../dominio/contatos";

export interface HistoricoDoCanal {
  /**
   * `jid` é o endereço cru que o WhatsApp usou, quando difere do telefone (`…@lid`). A
   * conversa pode estar guardada sob ele, e consultar só o telefone acharia uma conversa
   * vazia — que é o resultado que libera a MAISA.
   */
  rastro(t: ContextoTenant, p: { telefone: string; jid?: string }): Promise<RastroNoCanal>;
}
