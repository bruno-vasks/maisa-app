/* ─────────────────────────────────────────────────────────────────────────────
 * `Cobranca` CUMPRIDA PELA ABACATEPAY — checkout hospedado de assinatura, com Pix.
 * ⚠️ SÓ SERVIDOR: nenhuma chave `dev_`/`prod_` chega ao navegador.
 *
 * ── AS TRÊS DIFERENÇAS EM RELAÇÃO À STRIPE QUE MUDAM ESTE ARQUIVO ──
 *
 * 1. **O CLIENTE É CRIADO POR NÓS, ANTES DO CHECKOUT.** Na Stripe dá para mandar só
 *    `customer_email` e ela cria a ficha na conclusão. Aqui o cliente é criado num POST
 *    separado (`/customers/create`) e o `cust_…` volta na hora — e é bom que volte, porque
 *    é o ÚNICO identificador nosso que os webhooks de assinatura carregam de volta. Ver
 *    `portas/saida/cobranca.ts`, `CheckoutAberto`.
 *
 * 2. **NÃO HÁ PORTAL.** `abrirPortal` lança `NaoSuportado`, e `capacidades()` avisa antes
 *    para a tela desenhar "cancelar assinatura" em vez de "gerenciar cobrança".
 *
 * 3. **NÃO HÁ CHAVE DE IDEMPOTÊNCIA.** A Stripe aceita `idempotencyKey` e com isso dois
 *    cliques viram uma sessão. Nada equivalente está documentado aqui — ver o ⚠️ em
 *    `abrirCheckout`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { NaoEncontrado, NaoSuportado } from "@/nucleo/dominio/erros";
import type { ChaveDePlano } from "@/nucleo/dominio/assinatura";
import type {
  CapacidadesDeCobranca, CheckoutAberto, Cobranca, PedidoDeCheckout,
} from "@/nucleo/portas/saida/cobranca";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { chamar } from "./cliente";
import { CATALOGO, METODOS, faltando } from "./config";

/* ─────────────────────────────── o catálogo ───────────────────────────────── */

type Produto = { id: string; externalId: string; status?: string; cycle?: string | null };

/**
 * `externalId` → `prod_…`, resolvido uma vez por processo.
 *
 * Mesmo desenho e mesma justificativa do cache de `saida/stripe/cobranca-stripe.ts`: um
 * produto não muda de id, e trocar o preço de um plano cria produto novo. Um processo
 * velho continua cobrando o valor antigo até o próximo deploy — que é exatamente o
 * desejado, porque quem estava no meio de um checkout termina pelo preço que viu.
 */
const cache = new Map<string, string>();

/**
 * O `prod_…` do plano, procurado pelo nome que nós escolhemos.
 *
 * ⚠️ FILTRA POR `status === "ACTIVE"`. Produto desativado no painel continua listado, e
 * usar um deles faz o `subscriptions/create` recusar com uma mensagem que não menciona o
 * produto — uma tarde de investigação para descobrir que alguém arquivou o plano.
 */
async function idDoProduto(plano: ChaveDePlano): Promise<string> {
  const externo = CATALOGO[plano];
  const guardado = cache.get(externo);
  if (guardado) return guardado;

  /* ⚠️ SEM PAGINAÇÃO, E ISSO É UM LIMITE ACEITO COM DATA DE VALIDADE. `/products/list` não
   * documenta `limit`/`after`, então não há como saber se devolve tudo ou a primeira
   * página. Com TRÊS produtos no catálogo não importa. Passa a importar no dia em que
   * alguém criar plano anual, cupom-produto ou item de pay-as-you-go pelo painel: o plano
   * procurado pode cair fora da primeira página, `idDoProduto` lança `NaoEncontrado`, e o
   * sintoma é o botão "assinar" quebrado para UM plano só — o mais difícil de reproduzir.
   * Se o catálogo passar de ~20 itens, medir isto antes de qualquer outra coisa. */
  const produtos = await chamar<Produto[]>("/products/list");
  const achado = produtos.find((p) => p.externalId === externo && (p.status ?? "ACTIVE") === "ACTIVE");

  if (!achado) {
    /* A mensagem carrega o `externalId` procurado: o erro só acontece quando o catálogo da
     * conta não bate com o código, e a primeira pergunta de quem investiga é sempre "qual
     * nome ele procurou?". Sem isso o chamado vira adivinhação. */
    throw new NaoEncontrado(
      `produto com externalId "${externo}" e status ACTIVE na conta da AbacatePay `
        + "(rode `npm run abacate:catalogo`)",
    );
  }

  /* ⚠️ SEM `cycle` O PRODUTO NÃO É DE ASSINATURA, e `subscriptions/create` o recusa. Vale
   * conferir aqui porque o erro deles não diz isso com clareza, e porque o modo de falha é
   * criar o produto pelo painel esquecendo de marcar a recorrência — o que acontece. */
  if (!achado.cycle) {
    throw new NaoEncontrado(
      `ciclo no produto "${externo}": ele existe na AbacatePay mas foi criado sem `
        + "recorrência (`cycle`), e assinatura exige produto com ciclo",
    );
  }

  cache.set(externo, achado.id);
  return achado.id;
}

/* ─────────────────────────────── o cliente ────────────────────────────────── */

type Cliente = { id: string; email?: string };

/**
 * O `cust_…` deste inquilino — o existente, ou um recém-criado.
 *
 * ── POR QUE ESTE PASSO EXTRA EXISTE ──
 *
 * Porque `customerId` no checkout é o que faz o `customer.id` voltar dentro dos webhooks,
 * e sem ele o webhook não descobre de quem é o pagamento. Ver `CheckoutAberto`.
 *
 * ⚠️ `POST /customers/create` É IDEMPOTENTE POR CPF/CNPJ, NÃO POR E-MAIL. A documentação
 * diz "clientes são únicos por CPF/CNPJ — criar um cliente com taxId já existente retorna
 * o existente". Nós **não temos** o CPF/CNPJ de quem está assinando neste ponto do funil
 * (`/assinar/<plano>` pede três campos, e documento não é um deles). Logo, sem `taxId`, o
 * lado deles NÃO deduplica: dois cliques criam duas fichas.
 *
 * O que impede isso é a nossa tabela: `criarAbrirCheckout` grava o `cust_…` na ida, e na
 * segunda vez ele chega aqui em `p.clienteId` e nenhuma ficha nova nasce. É a mesma
 * proteção que a Stripe tem, deslocada para o nosso lado porque o lado deles não a dá.
 */
export async function clienteDoInquilino(t: ContextoTenant, p: PedidoDeCheckout): Promise<string | null> {
  if (p.clienteId) return p.clienteId;

  /* Sem e-mail não há como criar cliente: `email` é o único campo obrigatório deles.
   * Devolver `null` em vez de lançar é decisão: o checkout FUNCIONA sem `customerId` (a
   * pessoa digita os dados na página deles), só perde a reconciliação automática. Entre
   * "não vende" e "vende e o webhook cai no caminho reserva", vende. */
  if (!p.email) return null;

  const cliente = await chamar<Cliente>("/customers/create", {
    corpo: {
      email: p.email,
      /* `metadata` é aceito na criação de cliente, e aqui ele é para o HUMANO que abrir o
       * painel da AbacatePay investigando um pagamento — NÃO para o código. Os webhooks de
       * assinatura não devolvem `metadata`: construir a reconciliação sobre este campo
       * seria apoiá-la num valor que nunca volta. Quem reconcilia é o `cust_…` gravado na
       * nossa tabela. */
      metadata: { tenant_id: t.tenantId, plano: p.plano },
    },
  });

  return cliente.id;
}

/* ─────────────────────────────── a assinatura ─────────────────────────────── */

type CheckoutCriado = { id: string; url: string; customerId?: string | null };

export const cobrancaAbacatePay: Cobranca = {
  async abrirCheckout(t: ContextoTenant, p: PedidoDeCheckout): Promise<CheckoutAberto> {
    /* Em paralelo porque são independentes: o catálogo não depende do cliente. Dois
     * round-trips em série somariam ~400ms ao clique em "assinar". */
    const [produto, cliente] = await Promise.all([
      idDoProduto(p.plano),
      clienteDoInquilino(t, p),
    ]);

    const checkout = await chamar<CheckoutCriado>("/subscriptions/create", {
      corpo: {
        /* Exatamente UM item — a API recusa dois em assinatura. O ciclo não vai aqui: ele
         * é do produto, definido quando o catálogo foi criado. */
        items: [{ id: produto, quantity: 1 }],

        /* Pix primeiro. Ver o ⚠️ de `METODOS` em `config.ts`: os dois juntos é o que faz
         * a conta sem Pix recorrente habilitado degradar para cartão em vez de recusar o
         * checkout e fechar a loja. */
        methods: [...METODOS],

        ...(cliente ? { customerId: cliente } : {}),

        /* ⚠️ O CARIMBO, E ELE É UM CAMINHO DE RESERVA — NÃO O PRINCIPAL.
         *
         * Na Stripe `metadata.tenant_id` volta em todo evento e é a fonte primária. Aqui
         * NÃO volta: medido em 21/09/2026, nenhum payload de evento de assinatura da
         * AbacatePay traz `metadata`, e `checkout.externalId` aparece `null` em todos os
         * exemplos publicados.
         *
         * Vai nos dois campos de qualquer forma, porque custa nada e porque o dia em que
         * eles passarem a devolver um dos dois, a reconciliação melhora sozinha. Quem
         * resolve o inquilino de verdade é `entrada/abacatepay/eventos.ts`, pelo
         * `customer.id` gravado na ida. */
        externalId: t.tenantId,
        metadata: { tenant_id: t.tenantId, plano: p.plano },

        /* `completionUrl` é depois de pagar, `returnUrl` é o "Voltar". Os nomes não são os
         * da Stripe (`success_url`/`cancel_url`) e trocá-los manda quem pagou para a tela
         * de desistência. */
        completionUrl: p.voltarPara,
        returnUrl: p.cancelarPara,

        /* Uma tentativa por dia, três dias, antes de a assinatura ser cancelada sozinha.
         * O padrão deles é o mesmo (3 × 1 dia) e está escrito aqui de propósito: é regra
         * de negócio de cobrança, e regra de negócio que vive só no default do fornecedor
         * muda quando ele decide mudar. */
        retryPolicy: { maxRetry: 3, retryEvery: 1 },
      },
    });

    if (!checkout.url) throw new NaoEncontrado("URL do checkout de assinatura");

    /* ⚠️ NÃO HÁ IDEMPOTÊNCIA DO LADO DELES, E ISSO É UM RISCO ACEITO COM MITIGAÇÃO NOSSA.
     *
     * A Stripe aceita `idempotencyKey`: a rede cai entre o POST e a resposta, a pessoa
     * clica de novo, e sai a MESMA sessão. Nada equivalente está documentado na
     * AbacatePay, então dois cliques criam dois checkouts.
     *
     * O que impede o dano real: os dois checkouts apontam para o mesmo `customerId`, e a
     * `assinaturas` tem `tenant_id` como chave primária — o segundo pagamento sobrescreve
     * a mesma linha em vez de criar uma paralela. O que sobra é o caso de alguém pagar
     * DUAS VEZES de verdade, e isso não é evitável daqui: é reembolso pelo painel. Está
     * escrito para quem for investigar "por que este cliente tem duas cobranças". */
    return { url: checkout.url, clienteId: cliente ?? checkout.customerId ?? null };
  },

  /**
   * ⚠️ NÃO EXISTE. A AbacatePay não tem Billing Portal — não há página hospedada onde a
   * pessoa troque o método, baixe fatura ou cancele sozinha.
   *
   * Lança em vez de devolver a `voltarPara` (que "funcionaria" e levaria a pessoa de volta
   * à tela de onde ela veio) porque um botão que não faz nada é pior que um botão ausente:
   * quem clicou em "gerenciar cobrança" e voltou ao mesmo lugar tenta de novo, e depois
   * manda mensagem no WhatsApp do dono. A tela pergunta `capacidades().portal` antes de
   * desenhar o botão; este erro é a rede de quem esqueceu de perguntar.
   */
  async abrirPortal(): Promise<CheckoutAberto> {
    throw new NaoSuportado("portal de autoatendimento de cobrança", "AbacatePay");
  },

  async cancelar(_t: ContextoTenant, p: { assinaturaId: string }): Promise<void> {
    /* ⚠️ IMEDIATO E IRREVERSÍVEL. A documentação deles é explícita: `cancelPolicy: NOW`,
     * "não há período de carência — o cliente perde o acesso imediatamente". Diferente da
     * Stripe, onde cancelar pelo portal vale ao fim do período já pago.
     *
     * Quem chama isto TEM de ter confirmado com a pessoa. A confirmação é da tela, e não
     * daqui — mas está escrito aqui porque é aqui que a irreversibilidade acontece. */
    await chamar<{ id: string; status: string }>("/subscriptions/cancel", {
      corpo: { id: p.assinaturaId },
    });

    /* Sem gravar nada de propósito: quem grava é o webhook, ao receber
     * `subscription.cancelled`. Ver `criarCancelarAssinatura`. */
  },

  /* O recorrente cobra no checkout hospedado deles. O Pix na nossa tela é do pré-pago,
   * `cobranca-avulsa.ts`. */
  async lerPagamento() {
    return null;
  },

  capacidades(): CapacidadesDeCobranca {
    return {
      /* Não tem. É a diferença que mais aparece na tela. */
      portal: false,
      /* Tem, por API, e é o que cumpre o "cancele quando quiser" da LP. */
      cancelamento: true,
      /* ⚠️ `true` AQUI É A OFERTA, NÃO UMA CERTEZA SOBRE A CONTA. `METODOS` manda Pix e
       * cartão; se o Pix recorrente não estiver habilitado nesta loja, o checkout mostra
       * só cartão e a tela terá prometido Pix. A habilitação é item de operação — ver o
       * `LEIA-ME.md`. Não há endpoint documentado que responda "esta conta tem Pix
       * Automático?", então não há como medir isto em runtime. */
      pix: true,
      /* Este é o modo RECORRENTE: a AbacatePay cobra sozinha a cada ciclo. O pré-pago é o
       * irmão ao lado, `cobranca-avulsa.ts`. */
      prepago: false,
    };
  },

  faltando,
};

/** Só para o teste poder limpar o catálogo resolvido entre casos. */
export function _resetarCatalogo(): void {
  cache.clear();
}
