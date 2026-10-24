import { NextResponse } from "next/server";
import { app, capacidadesDeCobranca } from "@/composicao";
import { barrou, sessaoOuDemo } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
/* A tabela de preços da landing page. Importada AQUI, e não na tela, de propósito: esta
 * rota é adaptador de entrada e mora no mesmo `src/app` que ela, então a seta não sai de
 * lugar nenhum. Se a gaveta importasse `_lib/planos.ts`, a UI passaria a depender de
 * `app/(marketing)` — e o preço exibido no app viraria cópia da copy da LP, livre para
 * divergir. Aqui a tela recebe o que a fonte única diz, e o `planos.test.ts` continua
 * sendo quem cobra que ela bata com o HTML estático. */
import { PLANOS } from "@/app/(marketing)/_lib/planos";

// ─────────────────────────────────────────────────────────────────────────────
// A ASSINATURA — o que este negócio paga, e o botão que começa a pagar.
//
// GET  /api/assinatura                →  { assinatura }  (ou `null`, e isso não é erro)
// POST /api/assinatura  { plano }     →  { url }         (para onde mandar o navegador)
//
// ── ⚠️ O POST NÃO COBRA NADA. ELE ABRE UMA PÁGINA. ──
//
// Responder 200 aqui significa "a sessão de checkout existe", e mais nada. Quem pagou,
// se pagou e quando pagou é assunto de `/api/stripe/webhook`. Um `redirect` automático
// no lugar do `{ url }` esconderia isso: a tela precisa poder dizer "abrindo pagamento"
// antes de sair, e precisa poder falhar sem sair da página.
//
// A tela também não pode escrever "assinatura ativa" quando a pessoa voltar. Boleto
// demora um dia; a volta do navegador não é confirmação. Ver o ⚠️ em `demo/assinaturas.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * As três ofertas, para a tela poder mostrar nome e preço ANTES de cobrar.
 *
 * ⚠️ O PREÇO AQUI É O EXIBIDO, NÃO O COBRADO. Quem cobra é o objeto Price do provedor,
 * achado por `lookup_key`. Os dois têm que bater, e quem garante isso é `planos.test.ts`
 * — esta rota só repassa o que a fonte única da LP diz, sem redigitar número nenhum.
 *
 * `resumo` usa as DUAS PRIMEIRAS specs porque a tabela de `_lib/planos.ts` é ordenada por
 * relevância de decisão: quantas pessoas atendem e quantos agendamentos entram. Reordenar
 * as specs lá muda esta linha aqui — é acoplamento por ordem, e está escrito para que
 * quem reordenar saiba.
 */
/**
 * Para onde o navegador volta do checkout. **Dois destinos, e não uma URL no corpo.**
 *
 * ⚠️ ACEITAR `voltarPara` DO REQUEST SERIA REDIRECIONAMENTO ABERTO. Um POST com
 * `voltarPara: "https://sitedoatacante/"` faria a Stripe devolver a pessoa, logada e
 * recém-cobrada, num domínio de terceiro — e o link sairia do domínio da Stripe, com
 * cara de legítimo. Por isso o corpo escolhe entre dois nomes e o servidor resolve a URL.
 *
 * `onboarding` é o destino de quem veio do funil: pagou e nunca usou o produto, então o
 * lugar certo é o wizard. `painel` é o de quem já estava dentro e assinou pela gaveta.
 *
 * ⚠️ `/?tela=mais`, NÃO `/faturamento`: aquela rota não existe. O app é uma página só
 * (`app/page.tsx`) e a tela sai do store — quem chega de fora chega por `?tela=`. Enquanto
 * isto apontou para `/faturamento`, a volta do checkout era um 404 servido a quem acabou
 * de pagar R$ 127.
 *
 * Nenhum dos dois pode afirmar que a assinatura está ativa: a volta do navegador não é
 * confirmação de pagamento. Quem confirma é `/api/stripe/webhook`.
 */
const VOLTA = {
  onboarding: { ok: "/comecar?pagamento=recebido", cancelado: "/comecar?pagamento=cancelado" },
  painel: { ok: "/?tela=mais&pagamento=recebido", cancelado: "/?tela=mais&pagamento=cancelado" },
} as const;

const OFERTAS = PLANOS.map((p) => ({
  plano: p.chave,
  nome: p.nome,
  preco: `${p.preco}${p.periodo}`,
  resumo: p.specs.slice(0, 2).map((s) => `${s.rotulo} ${s.valor}`).join(" · "),
  /** O plano base — o mesmo que a LP destaca. Um só, e a tabela é quem decide qual. */
  base: p.destaque === true,
}));

export async function GET() {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const assinatura = await app.lerAssinatura(porteiro.tenant);
    /* As ofertas vão JUNTO com a assinatura, e não numa rota separada: a tela precisa das
     * duas para desenhar uma única vez. Separadas, ela teria um estado em que sabe o plano
     * atual e ainda não sabe os preços — e nesse instante ou mostra botão sem valor, ou
     * pisca. */
    /* ★ `capacidades` VAI JUNTO, e não numa rota separada, pelo mesmo motivo das ofertas:
     * a tela precisa das três coisas para desenhar UMA vez. Sem elas ela não sabe qual dos
     * dois botões mostrar — "gerenciar cobrança" (provedor com portal, como a Stripe) ou
     * "cancelar assinatura" (provedor sem portal, como a AbacatePay). Separadas, haveria
     * um instante em que a tela conhece o plano e ainda não sabe o que ele permite: ou
     * mostra os dois botões, ou pisca. Ver `portas/saida/cobranca.ts`. */
    return NextResponse.json({
      ok: true,
      status: "ok",
      assinatura,
      ofertas: OFERTAS,
      capacidades: capacidadesDeCobranca,
    });
  } catch (e) {
    return falha("assinatura", e);
  }
}

export async function POST(req: Request) {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: { plano?: unknown; destino?: unknown; metodo?: unknown };
  try {
    corpo = (await req.json()) as { plano?: unknown; destino?: unknown; metodo?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, status: "payload_invalido", info: "Corpo não é JSON." },
      { status: 400 },
    );
  }

  /* A volta é para ONDE A PESSOA ESTAVA, derivada do pedido — e não de
   * `MAISA_PUBLIC_URL`. A variável aponta para produção mesmo em `.env.local` (é fato
   * conhecido deste repositório), então usá-la aqui jogaria quem testa localmente para
   * dentro do app publicado, com a sessão errada e sem entender por quê. */
  const origem = new URL(req.url).origin;
  /* Desconhecido cai em `painel`, que é o destino mais conservador: manda para dentro do
   * app, nunca para fora dele. */
  const volta = corpo.destino === "onboarding" ? VOLTA.onboarding : VOLTA.painel;

  try {
    const { url, pagamento } = await app.abrirCheckout(porteiro.tenant, {
      plano: corpo.plano as never,
      /* Só `cartao` muda alguma coisa; o resto é o padrão do provedor. Quem confere se o
       * provedor aceita cartão é o caso de uso. */
      ...(corpo.metodo === "cartao" ? { metodo: "cartao" as const } : {}),
      voltarPara: `${origem}${volta.ok}`,
      cancelarPara: `${origem}${volta.cancelado}`,
    });
    /* `pagamento` vai junto quando o provedor desenha o Pix na nossa tela (`/pagar`): é o que
     * deixa a página aparecer com o QR Code em vez de buscá-lo de novo. Ver `CheckoutAberto`. */
    return NextResponse.json({ ok: true, status: "ok", url, ...(pagamento ? { pagamento } : {}) });
  } catch (e) {
    return falha("assinatura", e);
  }
}
