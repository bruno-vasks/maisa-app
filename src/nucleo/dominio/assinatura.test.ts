/* ─────────────────────────────────────────────────────────────────────────────
 * O que estes testes protegem, em ordem de quanto custa errar:
 *
 *   1. status desconhecido não libera o produto  → vazamento de receita silencioso
 *   2. as chaves de plano batem entre núcleo, landing page e catálogo da Stripe
 *      → botão que cobra o preço de outro plano, ou que não cobra nada
 *   3. o pré-pago (29/09/2026): a data corta o acesso, e pagar soma um mês sem perder dia
 *      → MAISA respondendo de graça depois do vencimento, ou calando quem acabou de pagar
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DIAS_DO_TESTE_LIBERADO, PLANOS, acessoLiberado, avisoDoDia, creditarUmMes, diasDoCiclo, diasParaVencer,
  ehChaveDePlano, ehPrePaga, fecharTeste, liberada, liberarTeste, somarUmMes, statusDaAbacatePay,
  statusDaStripe, textoDoAviso,
} from "./assinatura";
import type { Assinatura } from "./assinatura";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("statusDaStripe", () => {
  it("traduz os status que a Stripe manda hoje", () => {
    expect(statusDaStripe("trialing")).toBe("trial");
    expect(statusDaStripe("active")).toBe("ativa");
    expect(statusDaStripe("past_due")).toBe("inadimplente");
    expect(statusDaStripe("unpaid")).toBe("inadimplente");
    expect(statusDaStripe("canceled")).toBe("cancelada");
    expect(statusDaStripe("incomplete_expired")).toBe("cancelada");
  });

  /* ★ O TESTE QUE MAIS IMPORTA DESTE ARQUIVO. A Stripe acrescenta status sem avisar —
   * `paused` apareceu assim. Um `default` permissivo entregaria o produto de graça a um
   * estado que ninguém leu ainda, e o buraco só apareceria no fechamento do mês. */
  it("status desconhecido NÃO libera o produto", () => {
    for (const bruto of ["paused", "status_que_ainda_nao_existe", "", "ACTIVE"]) {
      expect(statusDaStripe(bruto)).toBe("inadimplente");
      expect(liberada({ status: statusDaStripe(bruto) })).toBe(false);
    }
  });

  it("boleto emitido e não pago não libera — `incomplete` é ausência de pagamento", () => {
    expect(liberada({ status: statusDaStripe("incomplete") })).toBe(false);
  });

  it("trial e ativa liberam", () => {
    expect(liberada({ status: "trial" })).toBe(true);
    expect(liberada({ status: "ativa" })).toBe(true);
  });
});

describe("statusDaAbacatePay", () => {
  /* ★ O TESTE QUE MAIS IMPORTA DESTE BLOCO, e o motivo de a função receber o evento.
   * `subscription.payment_failed` chega com `status: "ACTIVE"` — está assim no payload
   * documentado. Quem traduzir só o campo libera o produto para quem parou de pagar. */
  it("cobrança que falhou não libera, mesmo com o status vindo ACTIVE", () => {
    const s = statusDaAbacatePay({ status: "ACTIVE", evento: "subscription.payment_failed" });

    expect(s).toBe("inadimplente");
    expect(liberada({ status: s })).toBe(false);
  });

  it("traduz os dois estados de vida que a AbacatePay tem", () => {
    expect(statusDaAbacatePay({ status: "ACTIVE", evento: "subscription.completed" })).toBe("ativa");
    expect(statusDaAbacatePay({ status: "ACTIVE", evento: "subscription.renewed" })).toBe("ativa");
    expect(statusDaAbacatePay({ status: "CANCELLED", evento: "subscription.cancelled" }))
      .toBe("cancelada");
  });

  it("trial é derivado do `trialEndsAt`, porque não existe status de trial lá", () => {
    expect(statusDaAbacatePay({
      status: "ACTIVE", evento: "subscription.trial_started", emTrial: true,
    })).toBe("trial");
  });

  /* Mesma regra da Stripe, pelo mesmo motivo. `PENDING`/`EXPIRED`/`REFUNDED` são do
   * vocabulário de CHECKOUT deles e podem vazar para o objeto de assinatura numa mudança
   * de payload — e os três significam "não há pagamento vigente". */
  it("status desconhecido NÃO libera o produto", () => {
    for (const status of ["PENDING", "EXPIRED", "REFUNDED", "active", "", "qualquer_coisa"]) {
      const s = statusDaAbacatePay({ status, evento: "subscription.renewed" });
      expect(s).toBe("inadimplente");
      expect(liberada({ status: s })).toBe(false);
    }
  });
});

describe("diasDoCiclo", () => {
  it("cobre os cinco ciclos que a AbacatePay aceita", () => {
    expect(diasDoCiclo("WEEKLY")).toBe(7);
    expect(diasDoCiclo("MONTHLY")).toBe(30);
    expect(diasDoCiclo("QUARTERLY")).toBe(90);
    expect(diasDoCiclo("SEMIANNUALLY")).toBe(182);
    expect(diasDoCiclo("ANNUALLY")).toBe(365);
  });

  /* `null` e não 30: sem ciclo conhecido a tela mostra "—", que é verdade. Um default
   * inventaria data de cobrança para um ciclo que ninguém leu ainda. */
  it("ciclo desconhecido não inventa data", () => {
    expect(diasDoCiclo("DAILY")).toBeNull();
    expect(diasDoCiclo("")).toBeNull();
  });
});

describe("as chaves de plano", () => {
  it("`ehChaveDePlano` recusa o que não está na lista", () => {
    expect(ehChaveDePlano("profissional")).toBe(true);
    expect(ehChaveDePlano("Profissional")).toBe(false);
    expect(ehChaveDePlano("premium")).toBe(false);
    expect(ehChaveDePlano(undefined)).toBe(false);
  });

  /* ── A PONTE COM A LANDING PAGE ──
   * `dominio/assinatura.ts` não pode importar `app/(marketing)/_lib/planos.ts` — a seta
   * apontaria para fora do hexágono. Então a garantia é este teste, que lê o arquivo
   * como texto. Divergir aqui significa um botão de plano que o núcleo recusa: a pessoa
   * clica em "Assinar" e recebe `Plano desconhecido`. */
  it("são exatamente as mesmas de `_lib/planos.ts`", () => {
    const fonte = readFileSync(join(SRC, "app", "(marketing)", "_lib", "planos.ts"), "utf8");
    const declarado = fonte.match(/export type ChavePlano\s*=\s*([^;]+);/)?.[1] ?? "";
    const daLp = [...declarado.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();

    expect(daLp).toEqual([...PLANOS].sort());
  });
});

/* ─────────────────────── o pré-pago (29/09/2026) ─────────────────────── */

const linha = (over: Partial<Assinatura> = {}): Assinatura => ({
  plano: "Profissional",
  preco: 197,
  moeda: "BRL",
  status: "ativa",
  provedor: "abacatepay",
  clienteId: null,
  assinaturaId: null,
  periodoFim: "2026-10-30",
  trialFim: null,
  metodo: "pix",
  cartaoMarca: null,
  cartaoFinal4: null,
  ...over,
});

describe("acessoLiberado — a pergunta do corte", () => {
  it("o último dia pago ainda responde; o dia seguinte, não", () => {
    expect(acessoLiberado(linha(), "2026-10-30")).toBe(true);
    expect(acessoLiberado(linha(), "2026-10-31")).toBe(false);
  });

  /* ★ O caso que motivou a função: a linha continua `trial` depois de o teste acabar, porque
   * ninguém a reescreve. `liberada` diria que sim. */
  it("trial vencido corta, mesmo com o status ainda `trial`", () => {
    const t = linha({ status: "trial", trialFim: "2026-09-14", periodoFim: "2026-09-14" });
    expect(liberada(t)).toBe(true);
    expect(acessoLiberado(t, "2026-09-30")).toBe(false);
  });

  it("sem data não corta — falta de campo não cala quem paga", () => {
    expect(acessoLiberado(linha({ periodoFim: null }), "2030-01-01")).toBe(true);
    expect(acessoLiberado(linha({ status: "trial", trialFim: null }), "2030-01-01")).toBe(true);
  });

  it("inadimplente e cancelada não passam, com data ou sem", () => {
    expect(acessoLiberado(linha({ status: "inadimplente" }), "2026-10-01")).toBe(false);
    expect(acessoLiberado(linha({ status: "cancelada", periodoFim: null }), "2026-10-01")).toBe(false);
  });

  it("diasParaVencer conta o último dia como zero", () => {
    expect(diasParaVencer(linha(), "2026-10-27")).toBe(3);
    expect(diasParaVencer(linha(), "2026-10-30")).toBe(0);
    expect(diasParaVencer(linha(), "2026-11-01")).toBe(-2);
  });
});

describe("somarUmMes", () => {
  it("é mês de calendário, não 30 dias", () => {
    expect(somarUmMes("2026-09-30")).toBe("2026-10-30");
    expect(somarUmMes("2026-12-15")).toBe("2027-01-15");
  });

  it("o dia que não existe no mês seguinte cai no último", () => {
    expect(somarUmMes("2026-01-31")).toBe("2026-02-28");
    expect(somarUmMes("2028-01-31")).toBe("2028-02-29");
  });
});

describe("creditarUmMes", () => {
  const pago = { hoje: "2026-10-27", plano: "Profissional", preco: 197, provedor: "abacatepay" as const, metodo: "pix" as const, clienteId: null };

  it("pagar antes de vencer soma a partir do fim, sem perder dia", () => {
    expect(creditarUmMes(linha(), pago).periodoFim).toBe("2026-11-30");
  });

  it("pagar atrasado conta de hoje — os dias pausados não são cobrados", () => {
    const r = creditarUmMes(linha(), { ...pago, hoje: "2026-11-12" });
    expect(r.periodoFim).toBe("2026-12-12");
    expect(r.status).toBe("ativa");
  });

  /* ★ Decisão: o funil da LP cobra no cadastro, e pagar cedo não pode custar o teste. */
  it("o teste grátis continua valendo: o mês começa quando ele acaba", () => {
    const t = linha({ status: "trial", trialFim: "2026-10-13", periodoFim: "2026-10-13", provedor: null, metodo: null, preco: 149.9 });
    const r = creditarUmMes(t, { ...pago, hoje: "2026-09-30" });
    expect(r.periodoFim).toBe("2026-11-13");
    expect(r.preco).toBe(197);
  });

  it("de quem nunca teve linha, começa hoje", () => {
    expect(creditarUmMes(null, { ...pago, hoje: "2026-09-30" }).periodoFim).toBe("2026-10-30");
  });

  it("não inventa assinatura no provedor: é o que faz a linha seguir pré-paga", () => {
    const r = creditarUmMes(linha({ assinaturaId: "subs_velha" }), pago);
    expect(r.assinaturaId).toBeNull();
    expect(ehPrePaga(r)).toBe(true);
  });
});

describe("o teste na conversa", () => {
  /* A linha que o `005_provisionar.sql` cria: 14 dias a partir do cadastro. */
  const nasceu = linha({ status: "trial", trialFim: "2026-10-23", periodoFim: "2026-10-23", provedor: null, metodo: null, preco: 149.9 });

  it("o funil pago nasce com o teste acabando no dia do cadastro", () => {
    const f = fecharTeste(nasceu, "2026-10-09");
    expect(f.trialFim).toBe("2026-10-09");
    expect(acessoLiberado(f, "2026-10-09")).toBe(true);
    expect(acessoLiberado(f, "2026-10-10")).toBe(false);
  });

  /* ★ Pagar no dia do cadastro dá um mês, e não um mês mais os 14 dias que ninguém liberou. */
  it("quem paga no dia ganha um mês contado de hoje", () => {
    const r = creditarUmMes(fecharTeste(nasceu, "2026-10-09"), {
      hoje: "2026-10-09", plano: "Essencial", preco: 127, provedor: "abacatepay", metodo: "pix", clienteId: null,
    });
    expect(r.periodoFim).toBe("2026-11-09");
  });

  it("fechar não mexe em quem já pagou", () => {
    expect(fecharTeste(linha(), "2026-10-09")).toEqual(linha());
  });

  it("liberar dá sete dias a partir de hoje", () => {
    const r = liberarTeste(fecharTeste(nasceu, "2026-10-09"), "2026-10-11");
    expect(DIAS_DO_TESTE_LIBERADO).toBe(7);
    expect(r?.status).toBe("trial");
    expect(r?.trialFim).toBe("2026-10-18");
    expect(r?.periodoFim).toBe("2026-10-18");
  });

  it("liberar nunca encurta um teste maior", () => {
    expect(liberarTeste(nasceu, "2026-10-09")?.trialFim).toBe("2026-10-23");
  });

  it("liberar de novo recomeça de hoje", () => {
    const uma = liberarTeste(fecharTeste(nasceu, "2026-10-09"), "2026-10-09")!;
    expect(liberarTeste(uma, "2026-10-14")?.trialFim).toBe("2026-10-21");
  });

  it("não há teste para liberar a quem tem mês pago valendo", () => {
    expect(liberarTeste(linha(), "2026-10-09")).toBeNull();
  });

  it("quem pagou e venceu pode ganhar teste de novo", () => {
    expect(liberarTeste(linha(), "2026-11-05")?.trialFim).toBe("2026-11-12");
  });
});

describe("avisoDoDia", () => {
  it("sai três dias antes, um dia antes, no último dia e no dia seguinte — e só", () => {
    const dias: Record<string, string | null> = {};
    for (const hoje of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) {
      dias[hoje] = avisoDoDia(linha(), hoje)?.tipo ?? null;
    }
    expect(dias).toEqual({
      "2026-10-26": null,
      "2026-10-27": "faltam",
      "2026-10-28": null,
      "2026-10-29": "faltam",
      "2026-10-30": "vence_hoje",
      "2026-10-31": "pausou",
      "2026-11-01": null,
    });
  });

  /* ★ Quem tem débito automático não recebe "pague até sexta": sairia pagamento em dobro. */
  it("assinatura recorrente no provedor não recebe aviso", () => {
    expect(avisoDoDia(linha({ assinaturaId: "sub_123", provedor: "stripe" }), "2026-10-29")).toBeNull();
  });

  it("o fim do teste também avisa", () => {
    const t = linha({ status: "trial", trialFim: "2026-10-06", provedor: null });
    expect(avisoDoDia(t, "2026-10-03")).toEqual({ tipo: "faltam", dias: 3, fim: "2026-10-06" });
  });
});

describe("textoDoAviso", () => {
  const p = { negocio: "Psicologia Regina", emTeste: false, link: "https://app.maisasecretary.com.br/?tela=mais" };

  it("diz quando vence e manda o link, sem preço", () => {
    const r = textoDoAviso({ tipo: "faltam", dias: 3, fim: "2026-10-30" }, p);
    expect(r.assunto).toBe("Sua MAISA vence em 3 dias");
    expect(r.texto).toContain("30 de outubro");
    expect(r.texto).toContain(p.link);
    expect(r.texto).not.toMatch(/R\$/);
  });

  it("um dia antes diz amanhã; no dia seguinte diz que pausou", () => {
    expect(textoDoAviso({ tipo: "faltam", dias: 1, fim: "2026-10-30" }, p).assunto).toBe("Sua MAISA vence amanhã");
    expect(textoDoAviso({ tipo: "pausou", fim: "2026-10-30" }, p).assunto).toBe("Sua MAISA pausou");
  });

  it("no teste fala de teste", () => {
    expect(textoDoAviso({ tipo: "faltam", dias: 3, fim: "2026-10-06" }, { ...p, emTeste: true }).texto)
      .toContain("teste grátis");
  });
});
