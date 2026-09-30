/* ─────────────────────────────────────────────────────────────────────────────
 * O que estes testes protegem, em ordem de quanto custa errar:
 *
 *   1. evento forjado não passa            → produto liberado de graça
 *   2. o inquilino do `payment_failed`     → inadimplência que nunca chega à tela
 *   3. Pix não vira "Cartão final ····"    → tela mentindo para o cliente
 *   4. renovação não apaga o nome do plano → `gravar` substitui a linha inteira
 *
 * ⚠️ O `verificar` LÊ `SEGREDO_WEBHOOK` NO MOMENTO DO IMPORT (é `const` de módulo), então
 * o `vi.stubEnv` tem de rodar ANTES — daí o `vi.resetModules()` + import dinâmico em
 * `comSegredo()`. Um `stubEnv` no `beforeEach` com import estático no topo não teria
 * efeito nenhum, e os testes passariam por acidente.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A mesma constante pública que o adaptador usa. Repetida aqui de propósito: se alguém
 *  trocar a do código, este teste tem de reprovar em vez de acompanhar a mudança. */
const CHAVE_PUBLICA =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VM"
  + "Ugo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNN"
  + "YmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9"
  + "HS1JhNHDX9";

const SEGREDO = "segredo-longo-e-aleatorio-de-teste";

const assinar = (cru: string) =>
  createHmac("sha256", CHAVE_PUBLICA).update(Buffer.from(cru, "utf8")).digest("base64");

/**
 * Carrega o módulo com o segredo já no ambiente. Ver o ⚠️ do cabeçalho.
 *
 * ⚠️ O "ausente" é `null`, NÃO `undefined` — e isso já custou um teste que passava por
 * acidente. Parâmetro com valor default em JS cai no default quando o argumento é
 * `undefined`, então `comSegredo(undefined)` stubava o segredo VERDADEIRO e o teste de
 * falha fechada não falhava. `null` não dispara o default.
 */
async function comSegredo(segredo: string | null = SEGREDO) {
  vi.resetModules();
  vi.stubEnv("ABACATEPAY_WEBHOOK_SECRET", segredo ?? "");
  return import("./eventos");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/* ─────────────────────────── os payloads de verdade ───────────────────────────
 * Copiados dos exemplos publicados em `docs.abacatepay.com/pages/webhooks/events/
 * subscriptions`, encurtados no que não usamos. O formato é o contrato — inventar um
 * payload mais conveniente seria testar contra a nossa imaginação. */

const PAGO_PIX = {
  id: "log_taQArRTApemxwcbw5EJeF3hS",
  event: "subscription.completed",
  apiVersion: 2,
  devMode: false,
  data: {
    subscription: {
      id: "subs_tAFqDWBhcEYTjQh2K0ZYDHau",
      amount: 19700,
      currency: "BRL",
      method: "PIX",
      status: "ACTIVE",
      frequency: "MONTHLY",
      createdAt: "2026-09-06T20:00:00.000Z",
      updatedAt: "2026-09-06T20:00:05.000Z",
      canceledAt: null,
      cancelledDueTo: null,
    },
    customer: { id: "cust_def456", name: "Maria Santos", email: "maria@exemplo.com" },
    payerInformation: { method: "PIX", PIX: { name: "Maria Santos", isSameAsCustomer: true } },
    /* ⚠️ `null` MESMO TENDO SIDO ENVIADO NA CRIAÇÃO. É assim no exemplo publicado, e é a
     * razão de a resolução por `customer.id` existir. */
    checkout: { id: "bill_x", externalId: null, customerId: "cust_def456" },
  },
};

/** ★ O único evento sem `customer` e sem `checkout`. Copiado do exemplo publicado. */
const FALHOU = {
  id: "log_falhou123",
  event: "subscription.payment_failed",
  apiVersion: 2,
  devMode: false,
  data: {
    subscription: {
      id: "subs_tAFqDWBhcEYTjQh2K0ZYDHau",
      amount: 19700,
      currency: "BRL",
      method: "CARD",
      /* ⚠️ `ACTIVE` NUMA COBRANÇA QUE FALHOU. É o coração do problema. */
      status: "ACTIVE",
      frequency: "MONTHLY",
      retryPolicy: { maxRetry: 3, retryEvery: 2 },
      updatedAt: "2026-10-06T20:00:05.000Z",
    },
    installmentId: "intl_abc123xyz",
    installmentNumber: 2,
    retryNumber: 1,
  },
};

describe("verificar", () => {
  it("aceita o que veio da AbacatePay", async () => {
    const { verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);

    const v = verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) });

    expect(v.id).toBe("log_taQArRTApemxwcbw5EJeF3hS");
    expect(v.evento).toBe("subscription.completed");
    expect(v.devMode).toBe(false);
  });

  /* ★★★ O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
   *
   * A chave do HMAC é PÚBLICA — está na documentação deles. Então um atacante consegue
   * produzir uma assinatura perfeitamente válida. O que o barra é o segredo da query
   * string, e é por isso que `verificar` o confere PRIMEIRO.
   *
   * Se alguém "simplificar" `verificar` para só conferir o HMAC (o que parece razoável
   * para quem vem da Stripe), este teste reprova. Sem ele, o webhook de pagamento fica
   * aberto para quem souber a URL: um POST com `subscription.completed` e plano liberado
   * de graça. */
  it("RECUSA evento com HMAC válido e segredo errado — a chave do HMAC é pública", async () => {
    const { verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);
    /* Assinatura legítima, computável por qualquer pessoa que leia a documentação. */
    const assinaturaForjada = assinar(cru);

    expect(() =>
      verificar(cru, { segredoDaUrl: "segredo-que-o-atacante-chutou", assinatura: assinaturaForjada }),
    ).toThrow(/webhookSecret/);
  });

  it("recusa quando não há segredo na URL", async () => {
    const { verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);

    expect(() => verificar(cru, { segredoDaUrl: null, assinatura: assinar(cru) }))
      .toThrow(/webhookSecret/);
  });

  /* Corpo trocado depois de assinado. O HMAC serve exatamente para isto — é a única coisa
   * que ele prova, já que a chave é pública. */
  it("recusa corpo alterado no caminho", async () => {
    const { verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);
    const assinaturaDoOriginal = assinar(cru);
    const adulterado = cru.replace("19700", "100");

    expect(() =>
      verificar(adulterado, { segredoDaUrl: SEGREDO, assinatura: assinaturaDoOriginal }),
    ).toThrow(/X-Webhook-Signature/);
  });

  it("recusa requisição sem o header de assinatura", async () => {
    const { verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);

    expect(() => verificar(cru, { segredoDaUrl: SEGREDO, assinatura: null }))
      .toThrow(/X-Webhook-Signature/);
  });

  /* ★ FALHA FECHADA. Sem o segredo no ambiente, recusa tudo em vez de aceitar tudo. Um
   * webhook de pagamento que aceita qualquer POST deixa qualquer pessoa se dar plano
   * ilimitado escrevendo um JSON — e como a escrita roda com service_role, a RLS não
   * salva ninguém. */
  it("sem ABACATEPAY_WEBHOOK_SECRET no ambiente, recusa tudo", async () => {
    const { verificar } = await comSegredo(null);
    const cru = JSON.stringify(PAGO_PIX);

    expect(() => verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) }))
      .toThrow(/não configurada/i);
  });
});

describe("ehRelevante", () => {
  it("escuta os seis eventos de assinatura", async () => {
    const { ehRelevante } = await comSegredo();
    for (const e of [
      "subscription.completed", "subscription.renewed", "subscription.cancelled",
      "subscription.trial_started", "subscription.payment_failed", "subscription.plan_changed",
    ]) {
      expect(ehRelevante(e)).toBe(true);
    }
  });

  /* A conta recebe dezenas de tipos. Ignorar explicitamente é o contrato certo — e um
   * `payout.completed` tratado como assinatura gravaria lixo na tabela. */
  it("ignora o que não é assinatura", async () => {
    const { ehRelevante } = await comSegredo();
    for (const e of ["payout.completed", "transfer.failed", "checkout.completed", "qualquer"]) {
      expect(ehRelevante(e)).toBe(false);
    }
  });
});

describe("pistasDeDono", () => {
  it("acha o cliente no evento que o traz", async () => {
    const { pistasDeDono, verificar } = await comSegredo();
    const cru = JSON.stringify(PAGO_PIX);
    const v = verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) });

    const p = pistasDeDono(v);

    expect(p.clienteId).toBe("cust_def456");
    expect(p.assinaturaId).toBe("subs_tAFqDWBhcEYTjQh2K0ZYDHau");
    /* ⚠️ `null` MESMO TENDO SIDO CARIMBADO na criação do checkout. Documentado, medido, e
     * a razão de a resolução não depender dele. */
    expect(p.carimbo).toBeNull();
  });

  /* ★ O CASO QUE JUSTIFICA `tenantDaAssinatura` EXISTIR.
   *
   * `payment_failed` chega sem `customer` e sem `checkout`. Se `pistasDeDono` devolvesse
   * só o cliente, este evento seria descartado por falta de dono — e ele é justamente o
   * que avisa que alguém parou de pagar. A inadimplência nunca chegaria à tela. */
  it("no payment_failed, a assinatura é a ÚNICA pista", async () => {
    const { pistasDeDono, verificar } = await comSegredo();
    const cru = JSON.stringify(FALHOU);
    const v = verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) });

    const p = pistasDeDono(v);

    expect(p.clienteId).toBeNull();
    expect(p.carimbo).toBeNull();
    expect(p.assinaturaId).toBe("subs_tAFqDWBhcEYTjQh2K0ZYDHau");
  });
});

describe("assinaturaDoEvento", () => {
  async function traduzir(payload: unknown, planoDoValor?: (r: number) => string | null) {
    const { assinaturaDoEvento, verificar } = await comSegredo();
    const cru = JSON.stringify(payload);
    const v = verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) });
    return assinaturaDoEvento(v, planoDoValor);
  }

  it("traduz o pagamento por Pix", async () => {
    const a = await traduzir(PAGO_PIX, (r) => (r === 197 ? "Profissional" : null));

    expect(a.status).toBe("ativa");
    expect(a.provedor).toBe("abacatepay");
    /* Centavos → reais. `amount` é inteiro em centavos em toda esta API. */
    expect(a.preco).toBe(197);
    expect(a.moeda).toBe("BRL");
    expect(a.clienteId).toBe("cust_def456");
    expect(a.assinaturaId).toBe("subs_tAFqDWBhcEYTjQh2K0ZYDHau");
  });

  /* ★ A TELA ESTAVA MENTINDO ANTES DISTO. `cartaoMarca`/`cartaoFinal4` eram as duas únicas
   * pistas de forma de pagamento, e quem paga por Pix não tem nenhuma das duas — ficava
   * indistinguível de um cartão que o provedor não informou, e a tela escrevia "Cartão
   * final ····" para quem nunca usou cartão. */
  it("Pix é `pix`, e NÃO deixa resto de cartão para trás", async () => {
    const a = await traduzir(PAGO_PIX);

    expect(a.metodo).toBe("pix");
    expect(a.cartaoMarca).toBeNull();
    expect(a.cartaoFinal4).toBeNull();
  });

  it("cartão traz bandeira e os quatro últimos — mascarados pela origem", async () => {
    const a = await traduzir({
      ...PAGO_PIX,
      data: {
        ...PAGO_PIX.data,
        subscription: { ...PAGO_PIX.data.subscription, method: "CARD" },
        payerInformation: { method: "CARD", CARD: { number: "4242", brand: "VISA" } },
      },
    });

    expect(a.metodo).toBe("cartao");
    expect(a.cartaoMarca).toBe("visa");
    expect(a.cartaoFinal4).toBe("4242");
  });

  /* ★ `status: "ACTIVE"` NUMA COBRANÇA QUE FALHOU. Sem a regra que olha o EVENTO antes do
   * campo, isto viraria `ativa` e o produto seguiria liberado para quem parou de pagar. */
  it("cobrança que falhou vira `inadimplente`, apesar do status ACTIVE", async () => {
    const a = await traduzir(FALHOU);

    expect(a.status).toBe("inadimplente");
  });

  it("cancelamento vira `cancelada`", async () => {
    const a = await traduzir({
      ...PAGO_PIX,
      event: "subscription.cancelled",
      data: {
        ...PAGO_PIX.data,
        subscription: { ...PAGO_PIX.data.subscription, status: "CANCELLED" },
      },
    });

    expect(a.status).toBe("cancelada");
  });

  /* ★ ISTO QUASE VIROU UM APAGAMENTO SILENCIOSO. O payload não traz o nome do plano, e
   * `gravar` SUBSTITUI a linha inteira (não faz merge). Um rótulo vazio aqui apagaria
   * "Profissional" da tela na primeira renovação, sem erro em lugar nenhum. */
  it("o nome do plano sai do resolvedor de preço", async () => {
    const a = await traduzir(PAGO_PIX, (r) => (r === 197 ? "Profissional" : null));

    expect(a.plano).toBe("Profissional");
  });

  /* Rótulo neutro e nunca "—": "—" a tela desenha como defeito, "Assinatura" ela desenha
   * como informação. Acontece com valor que não está na tabela (cupom, plano legado). */
  it("sem resolvedor, o rótulo é neutro em vez de vazio", async () => {
    const a = await traduzir(PAGO_PIX);

    expect(a.plano).toBe("Assinatura");
  });

  /* ⚠️ CALCULADO POR NÓS: o objeto de assinatura deles não tem campo de fim de período.
   * Base é `updatedAt` (06/09 + 30 dias = 06/10) e não `createdAt` — numa renovação,
   * `updatedAt` é a data do pagamento que acabou de entrar. */
  it("calcula a próxima cobrança, que eles não informam", async () => {
    const a = await traduzir(PAGO_PIX);

    expect(a.periodoFim).toBe("2026-10-06");
  });

  /* Ciclo desconhecido não inventa data. `null` faz a tela mostrar "—", que é verdade. */
  it("ciclo que não conhecemos não vira data chutada", async () => {
    const a = await traduzir({
      ...PAGO_PIX,
      data: {
        ...PAGO_PIX.data,
        subscription: { ...PAGO_PIX.data.subscription, frequency: "DAILY" },
      },
    });

    expect(a.periodoFim).toBeNull();
  });

  /* Em trial a próxima cobrança é o FIM DO TRIAL, não um ciclo depois dele: é quando o
   * primeiro debito acontece. */
  it("em trial, a próxima cobrança é o fim do trial", async () => {
    const a = await traduzir({
      ...PAGO_PIX,
      event: "subscription.trial_started",
      data: {
        ...PAGO_PIX.data,
        subscription: {
          ...PAGO_PIX.data.subscription,
          trialEndsAt: "2099-01-08T23:59:59.999Z",
        },
      },
    });

    expect(a.status).toBe("trial");
    expect(a.trialFim).toBe("2099-01-08");
    expect(a.periodoFim).toBe("2099-01-08");
  });
});

/* ─────────────────────── o pré-pago (29/09/2026) ───────────────────────
 * `checkout.completed`: do corpo só sai o `bill_…`, o resto é relido na fonte. O payload abaixo
 * é o exemplo publicado em `docs.abacatepay.com/pages/webhooks/events/checkout`. */

const T = "e53f6630-b266-435d-b777-7f0a99d94ce9";

const CHECKOUT_PAGO = {
  id: "log_chk_1",
  event: "checkout.completed",
  apiVersion: 2,
  devMode: false,
  data: {
    checkout: {
      id: "bill_abc123xyz",
      /* ⚠️ Este campo do CORPO não é o que decide o inquilino. O teste de `lerPagamentoAvulso`
       * abaixo prova que quem decide é o `externalId` relido. */
      externalId: `maisa:${T}:profissional:2026-10-06`,
      amount: 19700, paidAmount: 19700, status: "PAID", methods: ["PIX"], frequency: "ONE_TIME",
    },
    customer: { id: "cust_abc123" },
    payerInformation: { method: "PIX", PIX: { isSameAsCustomer: true } },
  },
};

describe("pré-pago — checkout.completed", () => {
  it("é o evento do pagamento avulso, e o id sai do corpo", async () => {
    const m = await comSegredo(SEGREDO);
    const cru = JSON.stringify(CHECKOUT_PAGO);
    const v = m.verificar(cru, { segredoDaUrl: SEGREDO, assinatura: assinar(cru) });
    expect(m.ehPagamentoAvulso(v.evento)).toBe(true);
    expect(m.idDoPagamentoAvulso(v)).toBe("bill_abc123xyz");
    expect(m.ehPagamentoAvulso("subscription.completed")).toBe(false);
  });

  it("id que não é `bill_` não passa", async () => {
    const m = await comSegredo(SEGREDO);
    const v = { id: "log", evento: "checkout.completed", devMode: false, data: { checkout: { id: "pix_char_x" } } };
    expect(m.idDoPagamentoAvulso(v)).toBeNull();
  });

  /* ★ A releitura: o inquilino, o status e o valor saem da API, não do corpo. */
  it("relê na fonte: dono pelo carimbo relido, pago só se a API diz PAID", async () => {
    vi.stubEnv("ABACATEPAY_API_KEY", "abc_prod_teste");
    const m = await comSegredo(SEGREDO);
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      chamadas.push(String(url));
      return new Response(JSON.stringify({
        success: true, error: null,
        data: { id: "bill_abc123xyz", externalId: `maisa:${T}:escala:2026-10-06`, status: "PAID", amount: 39700, paidAmount: 39700, methods: ["PIX"], customerId: "cust_1" },
      }), { status: 200 });
    });

    const pg = await m.lerPagamentoAvulso("bill_abc123xyz");
    expect(chamadas[0]).toContain("/checkouts/get?id=bill_abc123xyz");
    expect(pg).toMatchObject({ pagamentoId: "bill_abc123xyz", pago: true, preco: 397, metodo: "pix", dono: { tenantId: T, plano: "escala" } });
    vi.unstubAllGlobals();
  });

  it("a API dizendo PENDING não credita, diga o evento o que disser", async () => {
    vi.stubEnv("ABACATEPAY_API_KEY", "abc_prod_teste");
    const m = await comSegredo(SEGREDO);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      success: true, error: null, data: { id: "bill_x", externalId: `maisa:${T}:profissional:2026-10-06`, status: "PENDING", amount: 19700, paidAmount: null },
    }), { status: 200 }));
    expect((await m.lerPagamentoAvulso("bill_x")).pago).toBe(false);
    vi.unstubAllGlobals();
  });
});
