/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o leitor de comprovante de pagamento sem provedor.
 *
 * Sem Gemini não há quem leia imagem, e inventar um valor faria o demo registrar pagamento que
 * ninguém fez. Então ele não lê nada: devolve `null`, que é o "não é comprovante" da porta, e a
 * mensagem segue o caminho de sempre. O teste que precisa de uma leitura passa a sua (`lerComo`).
 * ────────────────────────────────────────────────────────────────────────────── */

import type { LeitorDeComprovanteDePagamento } from "@/nucleo/portas/saida/leitor-de-comprovante-de-pagamento";
import type { DadosDoComprovante } from "@/nucleo/dominio/recebimentos";

let LEITURA: DadosDoComprovante | null = null;

export const leitorDeComprovanteDemo: LeitorDeComprovanteDePagamento = {
  async ler() {
    return LEITURA;
  },
};

/** O que o próximo `ler` devolve. Só o teste chama. */
export function lerComo(dados: DadosDoComprovante | null): void {
  LEITURA = dados;
}
