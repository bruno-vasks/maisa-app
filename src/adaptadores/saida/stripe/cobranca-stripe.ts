/* ─────────────────────────────────────────────────────────────────────────────
 * `Cobranca` CUMPRIDA PELA STRIPE — Checkout hospedado + Billing Portal.
 * ⚠️ SÓ SERVIDOR: nenhum `sk_`/`rk_` chega ao navegador.
 * ────────────────────────────────────────────────────────────────────────────── */

import type Stripe from "stripe";
import { NaoEncontrado, NaoSuportado } from "@/nucleo/dominio/erros";
import type { ChaveDePlano } from "@/nucleo/dominio/assinatura";
import type {
  CapacidadesDeCobranca, CheckoutAberto, Cobranca, PedidoDeCheckout,
} from "@/nucleo/portas/saida/cobranca";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { stripe } from "./cliente";
import { LOOKUP, faltando } from "./config";

/**
 * `lookup_key` → id do preço, resolvido uma vez por processo.
 *
 * Cache sem invalidação de propósito: um preço não muda de id, e trocar o preço de um
 * plano é `--transfer-lookup-key`, que produz um id novo — e um processo velho com o id
 * velho continuaria cobrando o valor antigo até o próximo deploy. Isso é exatamente o
 * que se quer: quem já estava no meio de um checkout termina pelo preço que viu.
 */
const cache = new Map<string, string>();

async function idDoPreco(s: Stripe, plano: ChaveDePlano): Promise<string> {
  const chave = LOOKUP[plano];
  const guardado = cache.get(chave);
  if (guardado) return guardado;

  const { data } = await s.prices.list({ lookup_keys: [chave], active: true, limit: 1 });
  const preco = data[0];
  if (!preco) {
    /* Mensagem com a chave dentro: o erro só acontece quando o catálogo da conta não
     * bate com o código, e a primeira pergunta de quem investiga é sempre "qual chave
     * ele procurou?". Sem ela, o chamado vira uma sessão de adivinhação. */
    throw new NaoEncontrado(`preço com lookup_key "${chave}" na conta da Stripe`);
  }
  cache.set(chave, preco.id);
  return preco.id;
}

export const cobrancaStripe: Cobranca = {
  async abrirCheckout(t: ContextoTenant, p: PedidoDeCheckout): Promise<CheckoutAberto> {
    const s = stripe();
    const price = await idDoPreco(s, p.plano);

    const sessao = await s.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: p.voltarPara,
        cancel_url: p.cancelarPara,

        /* ⚠️ O CARIMBO. É o que o webhook lê para saber de quem é o pagamento. Vai nos
         * DOIS lugares de propósito: `client_reference_id` só existe na sessão, e a
         * sessão some do horizonte depois que a assinatura passa a viver sozinha —
         * `customer.subscription.updated` de daqui a três meses não traz sessão nenhuma.
         * O metadado na assinatura é o que sobrevive. */
        client_reference_id: t.tenantId,
        subscription_data: { metadata: { tenant_id: t.tenantId, plano: p.plano } },
        metadata: { tenant_id: t.tenantId, plano: p.plano },

        /* Cliente existente quando há; e-mail só quando não há. Os dois juntos a Stripe
         * recusa — e a recusa é boa, porque significaria tentar renomear um cliente. */
        ...(p.clienteId ? { customer: p.clienteId } : p.email ? { customer_email: p.email } : {}),

        /* CPF/CNPJ. Não é para imposto — a Stripe não calcula imposto no Brasil (Tax não
         * cobre BR) — é porque QUEM VENDE precisa emitir a NFS-e do próprio SaaS, e sem
         * o documento do tomador a nota não sai. Coletar depois significa caçar cliente
         * por WhatsApp no dia do fechamento. */
        tax_id_collection: { enabled: true },

        /* ⚠️ Nada de `payment_method_types`. Omitir é o que liga os métodos dinâmicos: o
         * que aparece passa a ser decidido no painel, por cliente elegível. Fixar a lista
         * aqui congela o checkout em "cartão" e exige deploy para ligar boleto. */
      },
      {
        /* A rede cai entre o POST e a resposta, a pessoa clica de novo, e sem isto são
         * duas sessões — logo, duas assinaturas possíveis para o mesmo negócio. A chave
         * junta inquilino e plano: trocar de plano na mesma hora é legítimo e tem que
         * abrir sessão nova. */
        idempotencyKey: `checkout:${t.tenantId}:${p.plano}`,
      },
    );

    if (!sessao.url) throw new NaoEncontrado("URL da sessão de checkout");
    return { url: sessao.url };
  },

  async abrirPortal(_t, p): Promise<CheckoutAberto> {
    const s = stripe();
    const portal = await s.billingPortal.sessions.create({
      customer: p.clienteId,
      return_url: p.voltarPara,
    });
    return { url: portal.url };
  },

  /**
   * ⚠️ NÃO CANCELA AQUI, DE PROPÓSITO — e isso não é uma limitação técnica.
   *
   * `s.subscriptions.cancel(id)` existe e funcionaria. Não é chamado porque a Stripe TEM
   * portal, e o portal é melhor em dois pontos que importam:
   *
   *   · ele cancela **ao fim do período já pago**, que é o que a pessoa contratou. Um
   *     cancelamento imediato por API tiraria o acesso de quem pagou o mês inteiro — e
   *     geraria um pedido de reembolso legítimo;
   *   · ele mostra o que vai acontecer ("seu acesso vai até 14/10") antes de confirmar. A
   *     nossa tela não tem essa data com a mesma autoridade.
   *
   * Duas portas para a operação mais destrutiva do produto é como se acaba com uma delas
   * cancelando diferente da outra. `capacidades().cancelamento` é `false`, a tela desenha
   * o botão do portal, e este erro é a rede de quem não perguntou.
   */
  async cancelar(): Promise<void> {
    throw new NaoSuportado(
      "cancelamento direto por API (use o portal, que cancela ao fim do período pago)",
      "Stripe",
    );
  },

  capacidades(): CapacidadesDeCobranca {
    return {
      /* Billing Portal: troca de cartão, fatura e cancelamento, hospedado por eles. */
      portal: true,
      /* Ver o ⚠️ de `cancelar` acima: é decisão, não ausência. */
      cancelamento: false,
      /* ⚠️ `false` É MEDIÇÃO, e está detalhada em `LEIA-ME.md`. Pix Automático não existe
       * em conta brasileira — a linha do BR na documentação da Stripe diz pagamento
       * único, liquidação em BRL e por convite. Assinatura em conta BR é cartão ou boleto.
       * É a razão pela qual a AbacatePay entrou neste repositório. */
      pix: false,
      /* Assinatura de verdade: a Stripe cobra sozinha todo mês. */
      prepago: false,
    };
  },

  faltando,
};
