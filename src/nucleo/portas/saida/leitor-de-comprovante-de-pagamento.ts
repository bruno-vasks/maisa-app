/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — quem lê o comprovante de pagamento que o cliente mandou no WhatsApp.
 *
 * ⚠️ "COMPROVANTE" SOZINHO, NA MAISA, É O PDF DO RECIBO (`GuardaDeComprovante`). Esta porta é a do
 * comprovante de PAGAMENTO: a imagem ou o PDF do banco que o cliente devolve depois do Pix. Daí o
 * nome comprido.
 *
 * ── POR QUE UMA PORTA PRÓPRIA, E NÃO A DO MODELO ──
 *
 * `ModeloDeConversa` só fala texto, e ensiná-la a receber imagem mexeria no loop do agente para
 * servir a uma chamada que não é conversa: é extração, com um formato de resposta fixo. Aqui a
 * pergunta é uma só ("o que diz este comprovante?") e a resposta é dado, não fala.
 *
 * ── O QUE ELA NÃO FAZ: FALHAR RUIDOSAMENTE ──
 *
 * `ler` devolve `null` em vez de lançar: arquivo que não é comprovante (uma foto qualquer, um
 * QR Code a pagar, um print de conversa), provedor fora, resposta torta. Ler o comprovante é um
 * extra; a mensagem do cliente segue o caminho de sempre sem ele.
 *
 * E ela não decide nada: não diz se o pagamento vale, nem qual cobrança ele paga. Isso é do
 * domínio (`conferirRecebedor`, `sugerirRecebimento`) e, no fim, do dono olhando o extrato.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { ArquivoRecebido, DadosDoComprovante } from "../../dominio/recebimentos";

export interface LeitorDeComprovanteDePagamento {
  /**
   * O que está escrito no comprovante, sem inventar: campo que não aparece volta `null`.
   * `null` inteiro quando o arquivo não é um comprovante de pagamento concluído, ou não deu
   * para ler. Nunca lança.
   */
  ler(t: ContextoTenant, arquivo: ArquivoRecebido): Promise<DadosDoComprovante | null>;
}
