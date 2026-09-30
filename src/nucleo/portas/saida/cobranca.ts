/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — abrir a cobrança.
 *
 * O que o app precisa de um provedor de pagamento, e nada além disso: uma URL para
 * onde mandar a pessoa. Quem cobra, em que bandeira, com que antifraude e em quantas
 * parcelas é problema do adaptador.
 *
 * ── POR QUE A PORTA DEVOLVE URL, E NÃO UM "ASSINAR()" ──
 *
 * Porque o app NÃO toca em cartão, e a porta é o lugar onde essa decisão fica escrita.
 * Número de cartão que passa pelo nosso servidor arrasta PCI-DSS SAQ-D para dentro de um
 * produto de uma pessoa. A página hospedada do provedor mantém o escopo em SAQ-A, e a
 * diferença entre os dois é da ordem de um projeto inteiro.
 *
 * Consequência que o desenho aceita de propósito: **o retorno é assíncrono**. Quando a
 * pessoa volta da URL, ainda não sabemos se pagou. Quem sabe é o webhook
 * (`adaptadores/entrada/stripe/`), e é por isso que ele não é opcional. Tela de sucesso
 * não é confirmação de pagamento — é confirmação de que o navegador voltou.
 *
 * ── O `voltarPara` É ARGUMENTO, E NÃO CONFIG ──
 *
 * Porque quem clica em "assinar" na tela de faturamento tem que voltar para a tela de
 * faturamento, e quem clica na landing page volta para o cadastro. Uma URL de retorno
 * global mandaria metade das pessoas para o lugar errado, e o sintoma seria uma pessoa
 * que pagou achando que não pagou.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ChaveDePlano } from "../../dominio/assinatura";
import type { ContextoTenant } from "../../dominio/tenant";

export type PedidoDeCheckout = {
  plano: ChaveDePlano;
  /**
   * Para o provedor já chegar com o campo preenchido. Opcional porque a pessoa pode
   * pagar com um e-mail diferente do login — e forçar o do login criaria dois cadastros
   * no provedor para a mesma pessoa no dia em que ela usasse o e-mail da empresa.
   */
  email?: string;
  /** Absoluta. Para onde o navegador volta em caso de sucesso. */
  voltarPara: string;
  /** Absoluta. Para onde volta quem desistiu. */
  cancelarPara: string;
  /**
   * O cliente que este inquilino JÁ tem no provedor, quando tem.
   *
   * ⚠️ Sem isto, cada clique em "assinar" cria um cliente novo lá dentro — e a pessoa
   * que desistiu na primeira tentativa e voltou vira duas fichas, capazes de carregar
   * duas assinaturas ativas do mesmo negócio. O caso de uso lê de `Assinatura.clienteId`
   * e repassa; o adaptador nunca vai buscar sozinho.
   */
  clienteId?: string | null;
};

/**
 * A URL, e o cliente que o provedor criou para chegar até ela.
 *
 * ── ⚠️ ERA SÓ `url`, E O COMENTÁRIO DIZIA "se um dia precisar de mais, o provedor está
 * vazando para dentro". Mudou em 21/09/2026, e não por conveniência ──
 *
 * `clienteId` voltar é o que permite ao caso de uso GRAVAR o cliente ANTES do pagamento.
 * Sem isso, a AbacatePay não tem como o webhook descobrir de quem é um pagamento:
 *
 *   · na Stripe, o carimbo `metadata.tenant_id` volta dentro de todo evento de assinatura,
 *     então o inquilino viaja com o evento e nada precisa estar gravado antes;
 *   · na AbacatePay, **nenhum payload de evento de assinatura traz `metadata`** — medido
 *     na documentação em 21/09/2026 — e `checkout.externalId` vem `null` em todos os
 *     exemplos publicados. O que os eventos SEMPRE trazem é `customer.id`.
 *
 * Logo: quem não gravou o `cust_…` no momento do checkout recebe o primeiro pagamento e
 * não sabe a quem creditar. O sintoma é o pior possível — alguém pagou e o produto não
 * liberou — e ele acontece justamente na primeira venda.
 *
 * `null` é resposta legítima: a Stripe cria o cliente só quando a pessoa conclui o
 * checkout, então não há id para devolver na abertura. O caso de uso trata os dois.
 */
export type CheckoutAberto = { url: string; clienteId?: string | null };

/**
 * O que ESTE provedor sabe fazer. A tela desenha a partir disto.
 *
 * ── POR QUE CAPACIDADE É DADO, E NÃO UM `try/catch` NA TELA ──
 *
 * Porque a diferença entre os dois provedores é real e não some se a gente não olhar: a
 * Stripe tem Billing Portal (a pessoa troca cartão, baixa fatura e cancela sozinha, numa
 * página hospedada por eles) e **a AbacatePay não tem página nenhuma dessas.** O que ela
 * tem é `POST /subscriptions/cancel`, que cancela na hora, pela API.
 *
 * A LP promete "cancele quando quiser" por escrito. Então a promessa tem de ser cumprida
 * pelos dois, por caminhos diferentes: um botão que abre o portal, ou um botão que
 * cancela aqui mesmo com confirmação. Descobrir isso por exceção significaria a tela
 * desenhar o botão errado e falhar no clique — na tela de cancelamento, que é a última
 * onde se quer um erro.
 */
export type CapacidadesDeCobranca = {
  /** Existe página hospedada de autoatendimento? Stripe sim, AbacatePay não. */
  portal: boolean;
  /** `cancelar()` funciona? AbacatePay sim, Stripe não (quem cancela é o portal). */
  cancelamento: boolean;
  /**
   * O checkout oferece Pix?
   *
   * ⚠️ `false` na Stripe **em conta brasileira**, e isso é medição, não preguiça: Pix
   * Automático não existe para conta BR (ver `saida/stripe/LEIA-ME.md`). Assinatura lá é
   * cartão ou boleto. É a razão de a AbacatePay existir neste código.
   */
  pix: boolean;
  /**
   * ★ Cada pagamento compra UM MÊS, e não existe assinatura no provedor (29/09/2026).
   *
   * É o modo da AbacatePay enquanto a recorrência da conta está bloqueada: Pix avulso, um de
   * cada vez. Muda três coisas na tela, e é por isso que é capacidade e não detalhe:
   *
   *   · não há o que cancelar — quem não quer mais, só não paga o próximo mês;
   *   · quem está `ativa` pode pagar de novo ANTES de vencer, e isso soma um mês em vez de
   *     criar uma segunda assinatura (o risco que faz a tela esconder "Assinar" de quem já
   *     paga num provedor recorrente);
   *   · o "Próxima cobrança" vira "Pago até": ninguém vai cobrar sozinho.
   */
  prepago: boolean;
};

export interface Cobranca {
  /**
   * Abre o checkout para este inquilino.
   *
   * ⚠️ A IMPLEMENTAÇÃO TEM QUE CARIMBAR O `tenantId` NA SESSÃO DO PROVEDOR. É o que o
   * webhook lê depois para saber de quem é o pagamento. Sem esse carimbo, a única pista
   * é o e-mail — e e-mail digitado no checkout casa com o do cadastro com a frequência
   * de quem digita e-mail em formulário.
   */
  abrirCheckout(t: ContextoTenant, p: PedidoDeCheckout): Promise<CheckoutAberto>;

  /**
   * O portal onde a pessoa troca o cartão, baixa a fatura e cancela sozinha.
   *
   * Existe na porta, e não como "depois a gente vê", porque cancelamento sem autonomia
   * volta como chamado no WhatsApp do dono — e é a promessa que a landing page já faz
   * por escrito ("cancele quando quiser").
   */
  abrirPortal(
    t: ContextoTenant,
    /** `clienteId` é obrigatório aqui: não existe portal de quem nunca pagou. */
    p: { voltarPara: string; clienteId: string },
  ): Promise<CheckoutAberto>;

  /**
   * Cancela a assinatura deste inquilino, agora.
   *
   * Existe porque a AbacatePay não tem portal: sem este método, "cancele quando quiser" —
   * que a LP promete por escrito — viraria um chamado no WhatsApp do dono. O provedor sem
   * cancelamento direto lança `NaoSuportado`, e `capacidades().cancelamento` diz de
   * antemão qual é o caso, para a tela não descobrir no clique.
   *
   * ⚠️ NÃO GRAVA NADA. Quem grava é o webhook, ao receber `subscription.cancelled` — a
   * mesma regra do checkout, e pelo mesmo motivo: o dono da verdade é o provedor. Gravar
   * aqui criaria um estado local que divergiria dele no primeiro cancelamento que a API
   * aceitasse e o evento não chegasse (ou vice-versa).
   */
  cancelar(t: ContextoTenant, p: { assinaturaId: string }): Promise<void>;

  /** O que este provedor sabe fazer. Ver `CapacidadesDeCobranca`. */
  capacidades(): CapacidadesDeCobranca;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
