/* ─────────────────────────────────────────────────────────────────────────────
 * `Cobranca` CUMPRIDA PELA ABACATEPAY NO PRÉ-PAGO — um Pix por mês (29/09/2026).
 * ⚠️ SÓ SERVIDOR.
 *
 * Irmão de `cobranca-abacatepay.ts`, que é o modo RECORRENTE. Este existe porque a recorrência
 * está bloqueada na conta, nos dois trilhos, e o Pix avulso não:
 *
 *   subscriptions/create  PIX  → "PIX Automático is not available for this store"
 *   subscriptions/create  CARD → "CARD is not available for this store"
 *   checkouts/create      PIX, produto sem ciclo → abre a página ✅
 *
 * (medido na loja de produção em 29/09/2026, depois de o fundador deles ativar o cartão e a
 * conta ser aprovada — e a primeira transação real, um Pix de R$ 1, passou no mesmo dia.)
 *
 * ── O QUE MUDA EM RELAÇÃO AO RECORRENTE ──
 *
 *   · o checkout é `/checkouts/create` com o produto AVULSO do plano (`CATALOGO_AVULSO`);
 *   · o webhook que importa é `checkout.completed`, e cada um soma UM MÊS (`creditarUmMes`);
 *   · não há assinatura no provedor: `cancelar` não existe (quem não quer mais, não paga o
 *     mês seguinte), e `capacidades().prepago` avisa a tela;
 *   · quem cobra de novo é a rotina diária de avisos, por e-mail. Ninguém cobra sozinho.
 * ────────────────────────────────────────────────────────────────────────────── */

import { FalhaDoProvedor, NaoEncontrado, NaoSuportado } from "@/nucleo/dominio/erros";
import type { ChaveDePlano } from "@/nucleo/dominio/assinatura";
import { hojeISO } from "@/nucleo/dominio/tempo";
import type {
  CapacidadesDeCobranca, CheckoutAberto, Cobranca, PedidoDeCheckout,
} from "@/nucleo/portas/saida/cobranca";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { carimbo } from "./carimbo";
import { chamar } from "./cliente";
import { clienteDoInquilino } from "./cobranca-abacatepay";
import { CATALOGO_AVULSO, faltando } from "./config";

type Produto = { id: string; externalId: string; status?: string; cycle?: string | null };

const cache = new Map<string, string>();

/**
 * O `prod_…` do mês avulso deste plano.
 *
 * ⚠️ POR `products/get?externalId=`, E NÃO POR `products/list`. Medido em 29/09/2026: logo
 * depois de criar os produtos, `/products/list` sem parâmetro continuou devolvendo lista
 * VAZIA por minutos (cache deles), enquanto a busca por `externalId` achava na hora. Pelo
 * `list`, o primeiro clique em "pagar" depois de um catálogo novo lançaria `NaoEncontrado`.
 */
async function idDoProdutoAvulso(plano: ChaveDePlano): Promise<string> {
  const externo = CATALOGO_AVULSO[plano];
  const guardado = cache.get(externo);
  if (guardado) return guardado;

  let achado: Produto | null = null;
  try {
    achado = await chamar<Produto>("/products/get", { busca: { externalId: externo } });
  } catch (e) {
    /* "Product not found" chega como erro de negócio (HTTP 200 com `error`). Vira a mensagem
     * que diz o que fazer; qualquer outra falha (rede, chave) sobe como veio. */
    if (!/not found/i.test(String((e as Error)?.message))) throw e;
  }

  if (!achado || (achado.status ?? "ACTIVE") !== "ACTIVE") {
    throw new NaoEncontrado(
      `produto avulso "${externo}" ativo na conta da AbacatePay (rode \`npm run abacate:catalogo -- --aplicar\`)`,
    );
  }
  /* ⚠️ COM `cycle` O CHECKOUT VIRA RECORRÊNCIA, e a loja recusa com "PIX Automático is not
   * available" — uma mensagem que não fala de produto nenhum. Melhor dizer aqui. */
  if (achado.cycle) {
    throw new NaoEncontrado(
      `produto "${externo}" sem ciclo: ele foi criado como assinatura (${achado.cycle}), e o avulso não pode ter \`cycle\``,
    );
  }

  cache.set(externo, achado.id);
  return achado.id;
}

type Checkout = { id: string; url?: string; status?: string; customerId?: string | null };

/**
 * Quantos carimbos do mesmo dia tentar. O segundo só existe se o primeiro já foi pago ou
 * expirou — a idempotência deles devolve o checkout antigo, e ele não serve para pagar de
 * novo. Três é folga para "paguei hoje e quero pagar mais um mês hoje" e nada além disso.
 */
const CARIMBOS_POR_DIA = 3;

export const cobrancaAbacatePayAvulsa: Cobranca = {
  async abrirCheckout(t: ContextoTenant, p: PedidoDeCheckout): Promise<CheckoutAberto> {
    const [produto, cliente] = await Promise.all([idDoProdutoAvulso(p.plano), clienteDoInquilino(t, p)]);
    const dia = hojeISO();

    for (let n = 1; n <= CARIMBOS_POR_DIA; n++) {
      const chk = await chamar<Checkout>("/checkouts/create", {
        corpo: {
          items: [{ id: produto, quantity: 1 }],
          /* Pix sozinho. ⚠️ `methods` é CONJUNÇÃO nesta API: pedir CARD numa loja sem cartão
           * avulso recusa o pedido inteiro. O cartão entra aqui no dia em que a sonda disser
           * que ele passa em checkout avulso — ver o `LEIA-ME.md`. */
          methods: ["PIX"],
          ...(cliente ? { customerId: cliente } : {}),
          /* ★ O carimbo com data. Ver o cabeçalho de `carimbo.ts`: o `externalId` é chave de
           * idempotência deles, e sem a data o mês seguinte devolveria o checkout já pago. */
          externalId: carimbo(t.tenantId, p.plano, dia, n),
          /* Para o humano que abrir o painel deles investigando. O código não depende disto:
           * quem resolve o inquilino é o carimbo, relido na fonte. */
          metadata: { tenant_id: t.tenantId, plano: p.plano },
          completionUrl: p.voltarPara,
          returnUrl: p.cancelarPara,
        },
      });

      /* O checkout do carimbo pode já existir e ter acabado — pago mais cedo, ou expirado.
       * Nos dois casos a página dele não cobra de novo: próximo carimbo. */
      if ((chk.status ?? "PENDING") === "PENDING" && chk.url) {
        return { url: chk.url, clienteId: cliente ?? chk.customerId ?? null };
      }
    }

    throw new FalhaDoProvedor(
      `AbacatePay: ${CARIMBOS_POR_DIA} checkouts de hoje para ${t.tenantId} já foram usados. `
        + "Tente amanhã, ou confira no painel deles se há pagamento pendente de confirmação.",
    );
  },

  async abrirPortal(): Promise<CheckoutAberto> {
    throw new NaoSuportado("portal de autoatendimento de cobrança", "AbacatePay");
  },

  async cancelar(): Promise<void> {
    /* Não há o que cancelar: não existe assinatura no provedor, só meses pagos. O mês que já
     * foi pago vai até o fim, e o próximo simplesmente não é pago. `capacidades()` diz isso à
     * tela antes, e este erro é a rede de quem não perguntou. */
    throw new NaoSuportado("cancelamento — no pré-pago, basta não pagar o próximo mês", "AbacatePay");
  },

  capacidades(): CapacidadesDeCobranca {
    return { portal: false, cancelamento: false, pix: true, prepago: true };
  },

  faltando,
};

/** Só para o teste poder limpar o catálogo resolvido entre casos. */
export function _resetarCatalogoAvulso(): void {
  cache.clear();
}
