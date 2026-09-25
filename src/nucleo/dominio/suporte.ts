/* O WhatsApp da MAISA, em E.164 sem o "+". Um número só para o painel e as landing pages.
 *
 * Até 25/09/2026 o "Falar com o suporte" do painel abria `wa.me/5511999999999`, um número que
 * não é de ninguém, enquanto as LPs usavam este (item T5 do backlog do front, 08 P0-6). O
 * painel não importa de `app/(marketing)`, então a constante mora aqui e `_lib/icp.ts` a
 * reexporta. ⚠️ A LP oficial de terapeutas é HTML estático e redigita o número: trocar aqui é
 * trocar lá também (`planos.test.ts` confere).
 *
 * Suporte e vendas no mesmo número até o Bruno dizer outro. */
export const WHATSAPP_DA_MAISA = "5511994294906";
