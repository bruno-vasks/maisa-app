/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — mandar um e-mail (29/09/2026).
 *
 * Nasceu para o aviso de vencimento do pré-pago: três dias antes, um dia antes, no último dia
 * e quando a MAISA pausa. O e-mail vai para o DONO do negócio, não para os clientes dele — quem
 * fala com cliente é o WhatsApp, pelo `CanalDeMensagens`.
 *
 * ── POR QUE E-MAIL, E NÃO WHATSAPP ──
 *
 * Porque a MAISA roda no número PESSOAL do dono. Um aviso mandado pela instância dele chegaria
 * como mensagem dele para ele mesmo, sem notificação no celular. Mandar de um número central
 * resolve, mas aí a resposta do dono cai no agente de vendas que atende aquele número. E-mail
 * não tem nenhum dos dois problemas, e todo dono tem um: foi com ele que entrou no app.
 *
 * Só texto, sem HTML: um aviso de cobrança que parece newsletter é o primeiro a ir para o spam,
 * e o link cru é o que o dono precisa.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Mensagem = {
  para: string;
  assunto: string;
  texto: string;
};

export interface Correio {
  /** Manda, ou lança. Não há "enviado talvez": quem chama conta a falha e segue. */
  enviar(m: Mensagem): Promise<void>;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
