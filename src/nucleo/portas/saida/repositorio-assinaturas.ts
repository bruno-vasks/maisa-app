/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — onde a assinatura fica guardada.
 *
 * Separada de `Cobranca` de propósito: ler "qual o plano deste negócio" não pode
 * depender de o provedor de pagamento estar de pé. A tela de faturamento abre todo dia;
 * a Stripe é consultada só quando alguém clica em assinar.
 *
 * ⚠️ `gravar` É A ÚNICA ESCRITA DO PRODUTO NESTA TABELA, e ela roda com service_role.
 * A RLS de `assinaturas` (`003_rls.sql`, §3.4) não tem política de INSERT nem de UPDATE
 * para usuário logado, e o comentário de lá diz por quê: "dono nenhum se dá desconto".
 * Uma segunda escrita em qualquer outro lugar do código desfaz essa garantia — e o
 * sintoma seria plano ilimitado num `PATCH`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Assinatura, Provedor } from "../../dominio/assinatura";
import type { ContextoTenant } from "../../dominio/tenant";

/**
 * Um negócio que a rotina de avisos precisa olhar, com o que ela precisa para escrever.
 *
 * `email` é o do DONO (`membros.papel = 'dono'`), porque é quem paga. `null` quando o negócio
 * não tem dono com e-mail — a rotina pula e conta, em vez de chutar outro membro.
 */
export type ParaAvisar = {
  tenantId: string;
  negocio: string;
  email: string | null;
  assinatura: Assinatura;
};

export interface RepositorioAssinaturas {
  ler(t: ContextoTenant): Promise<Assinatura | null>;

  /**
   * ★ Todo negócio cuja assinatura pode vencer: `trial` e `ativa`. Usado só pela rotina diária
   * de avisos (`avisarVencimentos`), que roda sem sessão e sem dono — ninguém a chama de uma
   * tela.
   *
   * ⚠️ ATRAVESSA INQUILINOS, e é a terceira consulta deste repositório que faz isso (as outras
   * são `tenantDoCliente` e `tenantDaAssinatura`). A pergunta é "quem vence esta semana?", e a
   * resposta é sobre todos. O que a torna segura é não ter parâmetro: não há por onde pedir o
   * inquilino de alguém. Cada item volta com o seu `tenantId`, e quem usa monta o contexto
   * dele na linha seguinte — o mesmo arranjo da fila de lembretes.
   */
  paraAvisar(): Promise<ParaAvisar[]>;

  /**
   * ★ Grava SÓ o cliente do provedor, no momento em que o checkout abre.
   *
   * ── POR QUE ESTE MÉTODO EXISTE, SENDO QUE `gravar` JÁ ESCREVE NESTA TABELA ──
   *
   * Porque sem ele a AbacatePay perde a primeira venda de todo inquilino.
   *
   * Na Stripe o inquilino viaja DENTRO do evento: `cobranca-stripe.ts` carimba
   * `metadata.tenant_id` na assinatura, e todo evento posterior traz o carimbo de volta.
   * Nada precisa estar gravado antes do pagamento.
   *
   * Na AbacatePay não viaja. Medido na documentação em 21/09/2026: **nenhum payload de
   * evento de assinatura tem `metadata`**, e `checkout.externalId` aparece `null` em
   * todos os exemplos publicados. O único identificador nosso que os eventos sempre
   * trazem é `customer.id` — e ele só serve se já estiver na nossa tabela QUANDO o
   * primeiro evento chegar. Depois é tarde: o pagamento entrou e não há a quem creditar.
   *
   * Então o checkout grava o `cust_…` na ida, e o webhook lê na volta.
   *
   * ── ⚠️ E POR QUE NÃO USAR `gravar` PARA ISSO ──
   *
   * Porque `gravar` escreve plano, preço e **status** — e esta chamada roda dentro da
   * sessão do usuário, não do webhook. Um método capaz de escrever status, alcançável de
   * uma sessão logada, é exatamente o buraco que a RLS de `assinaturas` foi desenhada
   * para não ter ("dono nenhum se dá desconto", `003_rls.sql` §3.4).
   *
   * A garantia aqui é estrutural, não documental: este método escreve DUAS colunas
   * (`provedor` e `provedor_cliente_id`) e não tem parâmetro por onde pedir uma terceira.
   * Ninguém se dá desconto por uma assinatura de função que não aceita desconto.
   */
  vincularCliente(t: ContextoTenant, p: { provedor: Provedor; clienteId: string }): Promise<void>;

  /**
   * Grava o estado que o provedor afirmou.
   *
   * ⚠️ SUBSTITUI, não faz merge. O webhook sempre recebe o objeto inteiro do provedor,
   * então um merge só serviria para preservar um campo velho que o provedor já mudou —
   * tipo um `cartao_final4` de um cartão que a pessoa trocou.
   *
   * Idempotente por construção: a tabela tem `tenant_id` como chave primária, e a Stripe
   * reentrega o mesmo evento quando o 200 demora. Duas entregas do mesmo evento têm que
   * dar no mesmo estado, e não em duas linhas.
   */
  gravar(t: ContextoTenant, a: Assinatura): Promise<void>;

  /**
   * De quem é este cliente do provedor. Usado só pelo webhook, para os eventos que
   * chegam SEM o nosso carimbo — `invoice.payment_failed`, por exemplo, nasce da fatura
   * e não da sessão de checkout, então não carrega `client_reference_id`.
   *
   * Devolve `null` quando ninguém reconhece o cliente, e o webhook responde 200 e ignora.
   * Pagamento de gente que não é nossa acontece de verdade em conta compartilhada.
   */
  tenantDoCliente(clienteId: string): Promise<string | null>;

  /**
   * De quem é esta assinatura. O irmão de `tenantDoCliente`, pelo id da assinatura.
   *
   * ⚠️ EXISTE POR CAUSA DE UM EVENTO SÓ, E É O EVENTO QUE IMPORTA MAIS:
   * `subscription.payment_failed` da AbacatePay chega com `subscription`, `installmentId`
   * e `retryNumber` — **sem objeto `customer` e sem `checkout`**. Está assim no payload
   * documentado. É o único caminho de resolução que resta, e ele avisa que alguém parou
   * de pagar. Sem este método, a inadimplência é o estado que nunca chega à tela.
   */
  tenantDaAssinatura(assinaturaId: string): Promise<string | null>;

  /**
   * ★ Este evento já foi processado? A idempotência do webhook, quando o provedor não
   * oferece releitura.
   *
   * ── POR QUE A STRIPE NÃO PRECISA DISTO E A ABACATEPAY PRECISA ──
   *
   * `entrada/stripe/eventos.ts` descarta o corpo do evento e relê a assinatura na API.
   * Isso torna reentrega inofensiva e ordem de chegada irrelevante **de graça**, sem
   * tabela nenhuma. O desenho depende de existir um `GET` por id de assinatura.
   *
   * A AbacatePay não tem esse `GET`: existe `GET /subscriptions/list`, que devolve
   * *checkouts*, e a referência cita um `GET /subscriptions/get` que não está documentado
   * como endpoint. Sem releitura, o corpo do evento passa a ser a única fonte — e então
   * reentrega volta a ser problema nosso. São até 7 tentativas ao longo de ~18h, todas
   * com o mesmo `id`, e a própria documentação deles diz "idempotência é obrigatória".
   *
   * Devolve `true` se já vimos. O webhook responde 200 e não processa de novo.
   */
  eventoJaVisto(eventoId: string): Promise<boolean>;

  /**
   * Marca o evento como processado.
   *
   * ⚠️ CHAMAR **DEPOIS** DE GRAVAR A ASSINATURA, NUNCA ANTES. Marcar antes e falhar no
   * meio produz o pior resultado possível: o evento consta como processado, a assinatura
   * ficou no estado antigo, e a reentrega — que existe exatamente para salvar este caso —
   * passa a ser descartada. O pagamento se perde em silêncio, para sempre.
   *
   * `tenantId` é `null` quando o evento não era de ninguém nosso. Pagamento de terceiro
   * acontece de verdade em conta compartilhada (a conta live da Stripe tem 14 assinaturas
   * sem inquilino atribuível), e esses eventos também têm de ser marcados — senão a
   * reentrega os traz de volta por 18 horas.
   */
  registrarEvento(e: {
    eventoId: string;
    provedor: Provedor;
    tipo: string;
    tenantId: string | null;
  }): Promise<void>;

  faltando(): string[];
}
