/* ─────────────────────────────────────────────────────────────────────────────
 * `Cobranca` CUMPRIDA PELA ABACATEPAY NO PRÉ-PAGO — um Pix por mês, NA NOSSA TELA.
 * ⚠️ SÓ SERVIDOR.
 *
 * Irmão de `cobranca-abacatepay.ts`, que é o modo RECORRENTE. Este existe porque a recorrência
 * está bloqueada na conta, nos dois trilhos, e o Pix avulso não (medido na loja de produção em
 * 29/09/2026 — ver o `LEIA-ME.md`).
 *
 * ── ★ POR QUE PIX TRANSPARENTE, E NÃO A PÁGINA HOSPEDADA DELES (30/09/2026) ──
 *
 * A primeira versão deste arquivo mandava a pessoa para `app.abacatepay.com/pay/bill_…`. A
 * captura de tela dessa página mostrou o custo: depois dos nossos três campos, mais TRÊS
 * etapas — nome, CPF, e-mail, telefone, depois endereço, depois o Pix —, pedindo de novo o
 * e-mail e o telefone que a pessoa tinha acabado de digitar. Doze campos em dois sites.
 *
 * O Pix transparente (`/transparents/create`) não pede nada além do valor, e devolve o QR Code
 * e o copia-e-cola. Então `abrirCheckout` cria o Pix e devolve a URL da NOSSA página,
 * `/pagar?id=…`, que desenha os dois e acompanha o pagamento. A pessoa não sai do app.
 *
 * E é mais barato: `platformFee` 80 (R$ 0,80) no transparente contra 100 no checkout
 * hospedado, medido nos dois em 29/09/2026.
 *
 * ── O QUE CONTINUA IGUAL ──
 *
 *   · o webhook que importa é o do pagamento (`transparent.completed`), relido na fonte, e
 *     cada um soma UM MÊS (`creditarUmMes`);
 *   · não há assinatura no provedor: `cancelar` não existe, e `capacidades().prepago` avisa;
 *   · o inquilino viaja no CARIMBO (`carimbo.ts`), aqui dentro de `metadata` — o Pix
 *     transparente não tem `externalId`. Medido em 30/09/2026: o `metadata` volta intacto no
 *     `GET /transparents/get`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { FalhaDoProvedor, NaoEncontrado, NaoSuportado } from "@/nucleo/dominio/erros";
import type { ChaveDePlano } from "@/nucleo/dominio/assinatura";
import { hojeISO } from "@/nucleo/dominio/tempo";
import type {
  CapacidadesDeCobranca, CheckoutAberto, Cobranca, PagamentoPix, PedidoDeCheckout,
} from "@/nucleo/portas/saida/cobranca";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { carimbo, lerCarimbo } from "./carimbo";
import { chamar } from "./cliente";
import { CATALOGO_AVULSO, faltando } from "./config";

type Produto = { id: string; externalId: string; name?: string; price?: number; status?: string; cycle?: string | null };

const cache = new Map<string, { preco: number; nome: string }>();

/**
 * O preço e o nome do mês avulso deste plano, lidos do produto na conta.
 *
 * ── POR QUE O PREÇO VEM DO PRODUTO, SE O PIX TRANSPARENTE ACEITA QUALQUER VALOR ──
 *
 * Porque o valor COBRADO mora no provedor, e o exibido mora em `_lib/planos.ts` — a divisão
 * está no cabeçalho de `dominio/assinatura.ts`, e `planos.test.ts` + `npm run
 * abacate:catalogo` cobram que os dois batam. Digitar o valor aqui criaria a terceira tabela
 * de preço do projeto, e este adaptador não pode importar a da LP (a seta sairia do hexágono).
 * O produto avulso já existe para isso: o Pix leva o preço dele.
 *
 * ⚠️ POR `products/get?externalId=`, E NÃO POR `products/list`: logo depois de criar, a lista
 * sem parâmetro voltou VAZIA por minutos (cache deles, 29/09/2026).
 */
async function doProdutoAvulso(plano: ChaveDePlano): Promise<{ preco: number; nome: string }> {
  const externo = CATALOGO_AVULSO[plano];
  const guardado = cache.get(externo);
  if (guardado) return guardado;

  let achado: Produto | null = null;
  try {
    achado = await chamar<Produto>("/products/get", { busca: { externalId: externo } });
  } catch (e) {
    if (!/not found/i.test(String((e as Error)?.message))) throw e;
  }

  if (!achado || (achado.status ?? "ACTIVE") !== "ACTIVE" || typeof achado.price !== "number" || achado.price <= 0) {
    throw new NaoEncontrado(
      `produto avulso "${externo}" ativo e com preço na conta da AbacatePay (rode \`npm run abacate:catalogo -- --aplicar\`)`,
    );
  }

  const r = { preco: achado.price, nome: achado.name ?? `MAISA ${plano}` };
  cache.set(externo, r);
  return r;
}

type PixBruto = {
  id: string;
  status?: string;
  amount?: number;
  brCode?: string | null;
  brCodeBase64?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

const STATUS: Record<string, PagamentoPix["status"]> = {
  PENDING: "pendente",
  PAID: "pago",
  EXPIRED: "expirado",
  CANCELLED: "cancelado",
  /* Estornado é, para a tela, um Pix que não vale: não há o que pagar nele. */
  REFUNDED: "cancelado",
};

/** O Pix cru → o que a tela desenha. Só mostra o código enquanto ele pode ser pago. */
export function paraPagamentoPix(b: PixBruto, plano: ChaveDePlano | null): PagamentoPix {
  const status = STATUS[b.status ?? ""] ?? "cancelado";
  const pendente = status === "pendente";
  return {
    id: b.id,
    status,
    valor: (b.amount ?? 0) / 100,
    plano,
    copiaECola: pendente ? b.brCode ?? null : null,
    qrCode: pendente && b.brCodeBase64?.startsWith("data:image/") ? b.brCodeBase64 : null,
    expiraEm: b.expiresAt ?? null,
  };
}

/**
 * A descrição do Pix, só com o que a API aceita.
 *
 * ⚠️ ELES RECUSAM CARACTERE NA DESCRIÇÃO, E O PEDIDO INTEIRO VOLTA ERRO. Medido em 30/09/2026,
 * logo depois de publicar: `"MAISA Profissional — 1 mês"` (o nome do produto avulso) voltou
 * `Disallowed character in description: "—" (U+2014)`, e `R$` voltou o mesmo para o `$`. Acento
 * passa. Sem esta limpeza, todo clique em "Assinar" morria aqui.
 *
 * Lista do que PASSA, e não do que não passa: não há lista publicada do que eles recusam, e o
 * próximo caractere proibido seria descoberto do mesmo jeito — em produção. Faixas ASCII e
 * Latin-1 escritas à mão, sem `\p{L}`: o `target` do projeto é anterior a ES2015.
 */
export function descricaoDoPix(nome: string): string {
  const limpo = nome
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/[^A-Za-z0-9\u00C0-\u00FF .,()\/-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return limpo || "MAISA";
}

export const cobrancaAbacatePayAvulsa: Cobranca = {
  async abrirCheckout(t: ContextoTenant, p: PedidoDeCheckout): Promise<CheckoutAberto> {
    const produto = await doProdutoAvulso(p.plano);

    const pix = await chamar<PixBruto>("/transparents/create", {
      corpo: {
        method: "PIX",
        data: {
          amount: produto.preco,
          /* Aparece no app do banco de quem paga. É o que a pessoa lê antes de confirmar. */
          description: descricaoDoPix(produto.nome),
          /* ★ O carimbo no `metadata`, que volta intacto na releitura (medido em 30/09/2026).
           * É dele que o webhook tira o inquilino — nunca do corpo do evento. */
          metadata: { carimbo: carimbo(t.tenantId, p.plano, hojeISO()), tenant_id: t.tenantId, plano: p.plano },
        },
      },
    });

    if (!pix.id || !pix.brCode) throw new FalhaDoProvedor("AbacatePay: o Pix foi criado sem código.");

    /* A URL é da NOSSA página. A volta vai como caminho relativo, e `/pagar` só aceita
     * caminho que começa com uma barra: é o que impede este parâmetro de virar um
     * redirecionamento para fora do app. O destino em si quem escolhe é o servidor
     * (`VOLTA` em `api/assinatura/route.ts`), nunca o corpo do pedido. */
    const volta = new URL(p.voltarPara);
    const pagina = new URL("/pagar", volta.origin);
    pagina.searchParams.set("id", pix.id);
    pagina.searchParams.set("volta", volta.pathname + volta.search);

    return { url: pagina.toString(), clienteId: null, pagamento: paraPagamentoPix(pix, p.plano) };
  },

  async lerPagamento(t: ContextoTenant, id: string): Promise<PagamentoPix | null> {
    let b: PixBruto;
    try {
      b = await chamar<PixBruto>("/transparents/get", { busca: { id } });
    } catch (e) {
      if (/not found/i.test(String((e as Error)?.message))) return null;
      throw e;
    }

    /* ★ O PIX TEM DE SER DESTE NEGÓCIO. O id viaja na URL, e URL se compartilha: sem esta
     * checagem, qualquer pessoa logada leria valor e QR Code de outro inquilino trocando o
     * `?id=`. `null`, e não um erro, para a resposta não confirmar que o id existe. */
    const dono = lerCarimbo(b.metadata?.carimbo);
    if (!dono || dono.tenantId !== t.tenantId) return null;

    return paraPagamentoPix(b, dono.plano);
  },

  async abrirPortal(): Promise<CheckoutAberto> {
    throw new NaoSuportado("portal de autoatendimento de cobrança", "AbacatePay");
  },

  async cancelar(): Promise<void> {
    /* Não há o que cancelar: não existe assinatura no provedor, só meses pagos. O mês que já
     * foi pago vai até o fim, e o próximo simplesmente não é pago. */
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
