/* ─────────────────────────────────────────────────────────────────────────────
 * O WEBHOOK DA ABACATEPAY, TRADUZIDO. ⚠️ SÓ SERVIDOR.
 *
 * Adaptador de ENTRADA: o mundo externo fala, isto vira vocabulário da MAISA. Irmão de
 * `entrada/stripe/eventos.ts` — e a comparação com ele é o jeito mais rápido de entender
 * este arquivo, porque as QUATRO decisões centrais são diferentes, uma a uma.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. ★ O HMAC **NÃO AUTENTICA NADA**. QUEM AUTENTICA É O SEGREDO DA QUERY STRING.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a diferença que mais importa, e é a que um desenvolvedor vindo da Stripe erra
 * com mais facilidade — porque o mecanismo TEM o nome certo e a forma certa.
 *
 * A AbacatePay assina cada POST no header `X-Webhook-Signature`, HMAC-SHA256 sobre o
 * corpo cru, em base64. Igualzinho à Stripe. **Só que a chave do HMAC é uma constante
 * pública, publicada na documentação deles** (`docs.abacatepay.com/pages/webhooks/security`,
 * a mesma string para todas as lojas do mundo).
 *
 * Consequência, em uma frase: **qualquer pessoa consegue produzir uma assinatura válida.**
 * A chave está na internet. Um HMAC cuja chave é pública prova integridade em trânsito e
 * mais nada — é um checksum, não uma credencial. Quem tratar essa conferência como
 * autenticação (como se trata a da Stripe, onde o `whsec_…` é privado por endpoint)
 * deixa o webhook de pagamento aberto para quem souber a URL: um POST forjado com
 * `subscription.completed` e o produto liberado de graça.
 *
 * O que autentica de verdade é `?webhookSecret=…`, o valor que NÓS escolhemos ao cadastrar
 * o endpoint e que só nós e eles conhecemos.
 *
 * ⚠️ E ISSO TRAZ UM PROBLEMA PRÓPRIO: SEGREDO EM URL VAZA PARA LOG. Query string entra em
 * log de acesso, em relatório de plataforma e no `Referer` de qualquer redirecionamento.
 * Não há como mudar onde eles o põem. O que dá para fazer, e está feito:
 *   · exigir segredo longo e aleatório (`openssl rand -hex 32`) — ver `config.ts`;
 *   · comparar em tempo constante, para a resposta não vazar o prefixo correto;
 *   · conferir o HMAC **também**, porque integridade continua valendo e o custo é zero;
 *   · e rotacionar o segredo se algum log for exposto. É uma linha no painel deles.
 *
 * As duas checagens juntas são o que a documentação deles manda fazer, e a ordem certa é
 * segredo primeiro: ele é o que decide se a chamada é nossa.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 2. ★ NÃO EXISTE RELEITURA NA FONTE. O CORPO DO EVENTO É A ÚNICA VERDADE.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `entrada/stripe/eventos.ts` ignora o corpo e relê a assinatura na API — é o que torna
 * ordem de chegada irrelevante e reentrega inofensiva, de graça.
 *
 * Aqui não dá: **a AbacatePay não tem `GET` por id de assinatura.** Medido em 21/09/2026 —
 * existe `GET /subscriptions/list`, que devolve *checkouts* de assinatura, e a página de
 * referência cita um `GET /subscriptions/get` que não aparece como endpoint em lugar
 * nenhum da documentação.
 *
 * Sem releitura, três garantias passam a ser nossas:
 *   · **idempotência** → tabela `cobranca_eventos`, pelo `id` do evento (028)
 *   · **ordem** → ver a decisão 4 abaixo
 *   · **completude** → o que não vier no payload, não sabemos
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 3. ★ O INQUILINO VEM DO `customer.id` QUE NÓS GRAVAMOS NA IDA.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Na Stripe o inquilino viaja dentro do evento (`metadata.tenant_id`). Aqui **nenhum
 * payload de evento de assinatura traz `metadata`**, e `checkout.externalId` vem `null`
 * em todos os exemplos publicados — mesmo tendo sido enviado na criação.
 *
 * Então a cadeia é, nesta ordem:
 *   1. `data.checkout.externalId` — o nosso carimbo, SE um dia eles passarem a devolvê-lo
 *   2. `data.customer.id` → reverso por `provedor_cliente_id` na nossa tabela
 *   3. `data.subscription.id` → reverso por `provedor_assinatura_id`
 *
 * O passo 3 não é redundância: `subscription.payment_failed` chega **sem `customer` e sem
 * `checkout`** — só `subscription`, `installmentId` e `retryNumber`. É o evento que avisa
 * que alguém parou de pagar, e sem o passo 3 ele seria descartado por falta de dono.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 4. ★ `periodoFim` É CALCULADO POR NÓS. ELES NÃO INFORMAM.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * O objeto de assinatura deles não tem campo de fim de período. Nenhum — a busca por
 * `nextBilling`, `periodEnd`, `currentPeriod` e `nextPayment` na documentação inteira não
 * retorna nada. O que há é `frequency` (`MONTHLY`…) e as datas de criação/atualização.
 *
 * Então o "próxima cobrança" da tela sai de `updatedAt + diasDoCiclo(frequency)`. É
 * aproximado (mês = 30 dias) e está documentado como aproximado em `diasDoCiclo`. A
 * alternativa seria a tela mostrar "—" para toda assinatura ativa, que é pior: parece
 * defeito.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHmac, timingSafeEqual } from "node:crypto";

import { diasDoCiclo, statusDaAbacatePay } from "@/nucleo/dominio/assinatura";
import type { Assinatura } from "@/nucleo/dominio/assinatura";
import { NaoConfigurado } from "@/nucleo/dominio/erros";
import { SEGREDO_WEBHOOK, faltandoWebhook } from "@/adaptadores/saida/abacatepay/config";
import { lerCarimbo } from "@/adaptadores/saida/abacatepay/carimbo";
import { chamar } from "@/adaptadores/saida/abacatepay/cliente";
import type { ChaveDePlano, MetodoDePagamento } from "@/nucleo/dominio/assinatura";

/**
 * ⚠️ IMPORTA UM ADAPTADOR IRMÃO (`saida/abacatepay/config.ts`), e é a MESMA exceção
 * consciente que `entrada/stripe` já faz com `saida/stripe`: os dois lados falam com o
 * mesmo provedor, e duplicar a leitura do segredo criaria duas configurações capazes de
 * divergir. O sintoma seria o webhook autenticando contra um segredo enquanto o painel
 * manda outro. Está registrada em `src/arquitetura.test.ts`.
 */

/**
 * ⚠️ A CHAVE PÚBLICA DO HMAC DELES. Não é segredo, e escrevê-la aqui é correto.
 *
 * Está publicada na documentação (`/pages/webhooks/security`), igual para todas as lojas.
 * Ela NÃO vai para variável de ambiente de propósito: env var é onde moram segredos, e
 * pôr um valor público lá ensinaria a próxima pessoa que este valor é sensível — e que
 * conferi-lo autentica alguém. Não autentica. Ver a decisão 1 no cabeçalho.
 *
 * O que ela serve para provar: que o corpo não foi alterado entre eles e nós.
 */
const CHAVE_PUBLICA_HMAC =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VM"
  + "Ugo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNN"
  + "YmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9"
  + "HS1JhNHDX9";

/** Os eventos que mexem no estado da assinatura. O resto responde 200 e é ignorado. */
const RELEVANTES = new Set([
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.trial_started",
  /* ★ O que avisa que alguém parou de pagar. Sem ele, inadimplência só apareceria no
   * `subscription.cancelled` automático — depois de 3 tentativas, ou seja, dias depois. */
  "subscription.payment_failed",
  "subscription.plan_changed",
]);

export function ehRelevante(tipo: string): boolean {
  return RELEVANTES.has(tipo);
}

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  /* `timingSafeEqual` lança se os tamanhos diferem, e o próprio lançamento vazaria o
   * tamanho. Conferir antes e devolver `false` é o comportamento certo. */
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

export type Verificado = {
  /** `log_…`. O mesmo em todas as 7 reentregas — é a chave da idempotência. */
  id: string;
  /** `subscription.renewed`, etc. */
  evento: string;
  /** `true` quando o evento veio de uma chave `dev_`. Pagamento simulado. */
  devMode: boolean;
  data: Record<string, unknown>;
};

/**
 * Confere que este POST é da AbacatePay e que o corpo chegou intacto.
 *
 * Lança quando não é. Falha FECHADA: sem `ABACATEPAY_WEBHOOK_SECRET` no ambiente, recusa
 * tudo — um webhook de pagamento que aceita qualquer POST deixa qualquer pessoa se dar
 * plano ilimitado escrevendo um JSON, e como a escrita roda com service_role a RLS não
 * salva ninguém.
 *
 * ⚠️ `cru` TEM DE SER O TEXTO EXATO QUE CHEGOU. `await req.json()` seguido de
 * `JSON.stringify` reordena chaves e muda espaçamento: o HMAC deixa de bater em 100% dos
 * eventos. É a mesma armadilha da Stripe, e o sintoma também lê como "segredo errado".
 */
export function verificar(
  cru: string,
  p: { segredoDaUrl: string | null; assinatura: string | null },
): Verificado {
  if (!SEGREDO_WEBHOOK) throw new NaoConfigurado(faltandoWebhook());

  /* ── 1. o segredo da query string: é ELE que autentica ──
   * Primeiro, e sozinho decide. Ver a decisão 1 no cabeçalho deste arquivo. */
  if (!p.segredoDaUrl) {
    throw new Error("requisição sem ?webhookSecret= — não é da AbacatePay");
  }
  if (!iguaisEmTempoConstante(p.segredoDaUrl, SEGREDO_WEBHOOK)) {
    throw new Error("webhookSecret não confere");
  }

  /* ── 2. o HMAC: integridade, não identidade ──
   * A chave é pública, então isto NÃO prova quem mandou. Prova que o corpo não foi
   * alterado no caminho, e custa um hash. Header ausente é recusado em vez de tolerado: a
   * documentação diz que todo webhook inclui o `X-Webhook-Signature`, então a ausência é
   * anomalia — e num endpoint de pagamento a escolha conservadora é a certa. */
  if (!p.assinatura) {
    throw new Error("requisição sem cabeçalho X-Webhook-Signature");
  }
  const esperada = createHmac("sha256", CHAVE_PUBLICA_HMAC)
    .update(Buffer.from(cru, "utf8"))
    .digest("base64");

  if (!iguaisEmTempoConstante(esperada, p.assinatura)) {
    throw new Error("X-Webhook-Signature não confere — corpo alterado no caminho");
  }

  /* ── 3. o corpo ──
   * ⚠️ SEM SCHEMA RÍGIDO, E É RECOMENDAÇÃO EXPLÍCITA DELES: "não realize validação do
   * payload inteiro (como com Zod), evitando que mudanças futuras quebrem seu endpoint".
   * Lemos os campos que usamos e ignoramos o resto. */
  const corpo = JSON.parse(cru) as {
    id?: unknown; event?: unknown; devMode?: unknown; data?: unknown;
  };

  if (typeof corpo.id !== "string" || typeof corpo.event !== "string") {
    throw new Error("payload sem `id` ou `event`");
  }

  return {
    id: corpo.id,
    evento: corpo.event,
    devMode: corpo.devMode === true,
    data: (corpo.data ?? {}) as Record<string, unknown>,
  };
}

/* ─────────────────────── de quem é este pagamento ─────────────────────────── */

/** As três pistas de dono que um evento pode trazer. `null` onde o payload não traz. */
export type Pistas = {
  /** O nosso carimbo, se eles devolverem. Hoje vem `null` — ver a decisão 3. */
  carimbo: string | null;
  clienteId: string | null;
  assinaturaId: string | null;
};

export function pistasDeDono(v: Verificado): Pistas {
  const sub = v.data.subscription as { id?: unknown } | undefined;
  const cli = v.data.customer as { id?: unknown } | undefined;
  const chk = v.data.checkout as { externalId?: unknown } | undefined;

  const texto = (x: unknown) => (typeof x === "string" && x.length > 0 ? x : null);

  return {
    carimbo: texto(chk?.externalId),
    clienteId: texto(cli?.id),
    assinaturaId: texto(sub?.id),
  };
}

/* ─────────────────────── o evento vira `Assinatura` ───────────────────────── */

type SubBruta = {
  id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  status?: string;
  frequency?: string;
  trialEndsAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

/**
 * O payload → o nosso vocabulário.
 *
 * ⚠️ NÃO HÁ RELEITURA NA FONTE (decisão 2), então o que este mapeamento não extrair está
 * perdido até o próximo evento. É a razão de cada `?? null` abaixo ser deliberado e não
 * defensivo por hábito.
 *
 * ── ⚠️ O NOME DO PLANO NÃO VEM NO PAYLOAD, E ISSO QUASE VIROU UM APAGAMENTO ──
 *
 * O objeto de assinatura deles não traz nome de produto nem o `externalId` do item — só
 * `amount`. E `gravar` **substitui a linha inteira**, não faz merge (está escrito na porta
 * e é decisão). Logo, devolver `plano: "—"` aqui apagaria "Profissional" da tela na
 * primeira renovação, sem erro em lugar nenhum.
 *
 * A saída é `planoDoValor`: o chamador injeta a tradução preço → nome, porque quem tem a
 * tabela de preços é a camada `app/` (`_lib/planos.ts`) e este adaptador não pode
 * importá-la — a seta apontaria para fora do hexágono. É o mesmo arranjo que
 * `api/assinatura/route.ts` já usa para servir as ofertas.
 *
 * Sem resolvedor, o rótulo fica `"Assinatura"` e não `"—"`: um texto neutro que a tela
 * desenha sem parecer defeito.
 */
export function assinaturaDoEvento(
  v: Verificado,
  planoDoValor?: (reais: number) => string | null,
): Assinatura {
  const sub = (v.data.subscription ?? {}) as SubBruta;
  const pagador = v.data.payerInformation as
    { method?: string; CARD?: { number?: string; brand?: string } } | undefined;

  const metodoBruto = (sub.method ?? pagador?.method ?? "").toUpperCase();
  const metodo = metodoBruto === "PIX" ? "pix" : metodoBruto === "CARD" ? "cartao" : null;

  /* Trial é derivado: a AbacatePay não tem status de trial, e o que distingue é
   * `trialEndsAt` no futuro. Ver `statusDaAbacatePay`. */
  const trialFim = sub.trialEndsAt ? sub.trialEndsAt.slice(0, 10) : null;
  const emTrial = Boolean(trialFim && trialFim >= hoje());

  /* ⚠️ O CARTÃO SÓ EXISTE QUANDO É CARTÃO. `payerInformation.CARD.number` são os quatro
   * últimos dígitos (o payload já vem mascarado), e no Pix o objeto é `PIX` — sem número
   * nenhum. Deixar o campo passar de um evento para o outro faria a tela mostrar "Cartão
   * final 4242" para quem migrou para Pix. */
  const cartao = metodo === "cartao" ? pagador?.CARD : undefined;

  /* Centavos → reais. `amount` é inteiro em centavos, como todo valor desta API. */
  const preco = typeof sub.amount === "number" ? sub.amount / 100 : null;

  return {
    /* Ver o ⚠️ do cabeçalho desta função: sem resolvedor, rótulo neutro — nunca "—", que
     * a tela desenharia como defeito. */
    plano: (preco !== null && planoDoValor?.(preco)) || "Assinatura",
    preco,
    moeda: (sub.currency ?? "BRL").toUpperCase(),
    status: statusDaAbacatePay({
      status: sub.status ?? "",
      evento: v.evento,
      emTrial,
    }),
    provedor: "abacatepay",
    clienteId: (v.data.customer as { id?: string } | undefined)?.id ?? null,
    assinaturaId: sub.id ?? null,
    /* Calculado, não informado. Ver a decisão 4 no cabeçalho. */
    periodoFim: proximaCobranca(sub),
    trialFim,
    metodo,
    cartaoMarca: cartao?.brand?.toLowerCase() ?? null,
    cartaoFinal4: cartao?.number ?? null,
  };
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Quando cai a próxima cobrança, derivado.
 *
 * A base é `updatedAt` e não `createdAt`: numa renovação, `updatedAt` é a data do
 * pagamento que acabou de entrar, e é dali que o próximo ciclo conta. Usar `createdAt`
 * mostraria para sempre a segunda cobrança de uma assinatura de dois anos.
 *
 * Em trial, a próxima cobrança é o fim do trial — não um ciclo depois dele. É quando o
 * cartão é debitado pela primeira vez.
 */
function proximaCobranca(sub: SubBruta): string | null {
  if (sub.trialEndsAt) return sub.trialEndsAt.slice(0, 10);

  const dias = diasDoCiclo(sub.frequency ?? "");
  const base = sub.updatedAt ?? sub.createdAt;
  if (dias === null || !base) return null;

  const t = Date.parse(base);
  if (Number.isNaN(t)) return null;

  return new Date(t + dias * 864e5).toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O PRÉ-PAGO (29/09/2026) — o pagamento avulso, e aqui a RELEITURA EXISTE.
 *
 * A decisão 2 do cabeçalho ("não existe releitura na fonte") vale para ASSINATURA. Para
 * pagamento avulso há `GET /transparents/get` (o Pix de `/pagar`) e `GET /checkouts/get` (a
 * página hospedada), os dois medidos em produção em 29 e 30/09/2026.
 * Então este caminho faz o que a Stripe faz: usa do corpo do evento só o id, e relê o resto na
 * API com a nossa chave. Três coisas ficam de graça com isso:
 *
 *   · um POST forjado (se o `webhookSecret` vazar de um log) não inventa pagamento: o id tem de
 *     ser de um checkout da NOSSA loja, e o status lido tem de ser `PAID`;
 *   · o inquilino sai do `externalId` que NÓS gravamos na criação (ver `carimbo.ts`), relido —
 *     não de um campo do corpo;
 *   · a reentrega não soma de novo: a chave de idempotência é o `bill_…`, conferida no caso de
 *     uso (`registrarPagamentoAvulso`).
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * Os dois eventos de pagamento avulso. `transparent.completed` é o Pix desenhado na NOSSA tela
 * (`/pagar`), que é o caminho do pré-pago desde 30/09/2026; `checkout.completed` é o da página
 * hospedada deles, que o pré-pago usou por um dia e que continua aceito aqui.
 */
export function ehPagamentoAvulso(tipo: string): boolean {
  return tipo === "transparent.completed" || tipo === "checkout.completed";
}

/**
 * O id do pagamento (`pix_char_…` ou `bill_…`). É a ÚNICA coisa que este caminho usa do corpo.
 *
 * O exemplo publicado do `transparent.completed` mostra `char_…`; o real, criado por nós em
 * 29/09/2026, é `pix_char_…`. Aceitar os dois é aceitar o que a documentação diz e o que a
 * API faz.
 */
export function idDoPagamentoAvulso(v: Verificado): string | null {
  const chk = (v.data.checkout as { id?: unknown } | undefined)?.id;
  if (typeof chk === "string" && chk.startsWith("bill_")) return chk;
  const pix = (v.data.transparent as { id?: unknown } | undefined)?.id;
  if (typeof pix === "string" && /^(pix_)?char_/.test(pix)) return pix;
  return null;
}

type CheckoutRelido = {
  id: string;
  externalId?: string | null;
  status?: string;
  amount?: number;
  paidAmount?: number | null;
  methods?: string[];
  customerId?: string | null;
  devMode?: boolean;
};

export type PagamentoRelido = {
  pagamentoId: string;
  pago: boolean;
  /** `null` = o checkout não é nosso (outro produto da conta, link criado no painel). */
  dono: { tenantId: string; plano: ChaveDePlano } | null;
  /** Em reais, o que foi pago. */
  preco: number;
  metodo: MetodoDePagamento | null;
  clienteId: string | null;
  devMode: boolean;
};

/**
 * Relê o checkout na fonte e diz de quem é, se foi pago e quanto.
 *
 * Lança se a API não responder — e o webhook devolve 500, que é o que faz a AbacatePay tentar
 * de novo. É o comportamento certo: sem a releitura não há como saber se o Pix caiu.
 */
export async function lerPagamentoAvulso(id: string): Promise<PagamentoRelido> {
  /* ★ O PIX TRANSPARENTE (o de `/pagar`). O carimbo mora no `metadata` — o transparente não
   * tem `externalId` —, e o `metadata` volta intacto no `GET /transparents/get` (medido em
   * 30/09/2026). Só Pix: o `/pagar` não cria outro método. */
  if (!id.startsWith("bill_")) {
    const t = await chamar<CheckoutRelido & { metadata?: Record<string, unknown> | null }>(
      "/transparents/get", { busca: { id } },
    );
    return {
      pagamentoId: t.id,
      pago: t.status === "PAID",
      dono: lerCarimbo(t.metadata?.carimbo),
      preco: (typeof t.paidAmount === "number" ? t.paidAmount : t.amount ?? 0) / 100,
      metodo: "pix",
      clienteId: t.customerId ?? null,
      devMode: t.devMode === true,
    };
  }

  const c = await chamar<CheckoutRelido>("/checkouts/get", { busca: { id } });

  /* `paidAmount` é o que entrou; `amount` é o que foi pedido. Os dois só divergem com cupom,
   * e o que a linha registra é o cobrado de verdade. Centavos → reais, como tudo desta API. */
  const centavos = typeof c.paidAmount === "number" ? c.paidAmount : c.amount ?? 0;
  const metodos = (c.methods ?? []).map((m) => m.toUpperCase());

  return {
    pagamentoId: c.id,
    pago: c.status === "PAID",
    dono: lerCarimbo(c.externalId),
    preco: centavos / 100,
    /* O checkout avulso é criado só com Pix (ver `cobranca-avulsa.ts`); o cartão aparece aqui
     * no dia em que ele entrar na lista. */
    metodo: metodos.length === 1 && metodos[0] === "CARD" ? "cartao" : metodos.includes("PIX") ? "pix" : null,
    clienteId: c.customerId ?? null,
    devMode: c.devMode === true,
  };
}
