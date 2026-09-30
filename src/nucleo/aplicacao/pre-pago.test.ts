/* ─────────────────────────────────────────────────────────────────────────────
 * O PRÉ-PAGO NOS CASOS DE USO (29/09/2026). O que cada teste prende:
 *
 *   · a reentrega do mesmo Pix não soma dois meses — o `bill_…` é a chave;
 *   · o evento só é marcado DEPOIS de gravar (a regra do webhook recorrente, aqui também);
 *   · a rotina manda o aviso do dia, pula quem não tem e-mail, e uma falha não derruba as outras.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import type { Assinatura } from "../dominio/assinatura";
import type { ContextoTenant } from "../dominio/tenant";
import type { Correio, Mensagem } from "../portas/saida/correio";
import type { ParaAvisar, RepositorioAssinaturas } from "../portas/saida/repositorio-assinaturas";
import { criarAcessoDoNegocio, criarAvisarVencimentos, criarRegistrarPagamentoAvulso } from "./assinatura";

const T: ContextoTenant = { tenantId: "t1", usuarioId: "abacatepay", ator: { tipo: "sistema", rotina: "teste" } };

const linha = (over: Partial<Assinatura> = {}): Assinatura => ({
  plano: "Profissional", preco: 149.9, moeda: "BRL", status: "trial", provedor: null, clienteId: null,
  assinaturaId: null, periodoFim: "2026-10-06", trialFim: "2026-10-06", metodo: null, cartaoMarca: null,
  cartaoFinal4: null, ...over,
});

function repo(inicial: Assinatura | null, avisar: ParaAvisar[] = []) {
  let estado = inicial;
  const vistos = new Set<string>();
  const ordem: string[] = [];
  const r: RepositorioAssinaturas = {
    ler: async () => estado,
    gravar: async (_t, a) => { ordem.push("gravar"); estado = a; },
    eventoJaVisto: async (id) => vistos.has(id),
    registrarEvento: async (e) => { ordem.push("marcar"); vistos.add(e.eventoId); },
    paraAvisar: async () => avisar,
    vincularCliente: async () => {},
    tenantDoCliente: async () => null,
    tenantDaAssinatura: async () => null,
    faltando: () => [],
  };
  return { r, ordem, estado: () => estado };
}

const pix = { pagamentoId: "bill_1", plano: "Profissional", preco: 197, metodo: "pix" as const, clienteId: null, hoje: "2026-09-30" };

describe("registrarPagamentoAvulso", () => {
  it("soma um mês a partir do fim do teste, e marca depois de gravar", async () => {
    const { r, ordem, estado } = repo(linha());
    const res = await criarRegistrarPagamentoAvulso({ assinaturas: r, provedor: "abacatepay" })(T, pix);
    expect(res.creditado).toBe(true);
    expect(estado()?.periodoFim).toBe("2026-11-06");
    expect(estado()?.status).toBe("ativa");
    expect(ordem).toEqual(["gravar", "marcar"]);
  });

  /* ★ Sete reentregas do mesmo Pix não viram sete meses. */
  it("o mesmo pagamento de novo não soma", async () => {
    const { r, estado } = repo(linha());
    const registrar = criarRegistrarPagamentoAvulso({ assinaturas: r, provedor: "abacatepay" });
    await registrar(T, pix);
    const segunda = await registrar(T, pix);
    expect(segunda.creditado).toBe(false);
    expect(estado()?.periodoFim).toBe("2026-11-06");
  });

  it("dois pagamentos diferentes são dois meses", async () => {
    const { r, estado } = repo(linha());
    const registrar = criarRegistrarPagamentoAvulso({ assinaturas: r, provedor: "abacatepay" });
    await registrar(T, pix);
    await registrar(T, { ...pix, pagamentoId: "bill_2" });
    expect(estado()?.periodoFim).toBe("2026-12-06");
  });
});

describe("acessoDoNegocio", () => {
  it("corta no dia seguinte ao fim, e sem linha libera", async () => {
    expect((await criarAcessoDoNegocio({ assinaturas: repo(linha()).r })(T, "2026-10-06")).liberado).toBe(true);
    expect((await criarAcessoDoNegocio({ assinaturas: repo(linha()).r })(T, "2026-10-07")).liberado).toBe(false);
    expect((await criarAcessoDoNegocio({ assinaturas: repo(null).r })(T, "2026-10-07")).liberado).toBe(true);
  });
});

describe("avisarVencimentos", () => {
  const item = (tenantId: string, email: string | null, a: Assinatura): ParaAvisar => ({ tenantId, negocio: tenantId, email, assinatura: a });

  it("manda o do dia, pula quem não tem e-mail e segue depois de uma falha", async () => {
    const enviados: Mensagem[] = [];
    const correio: Correio = {
      enviar: async (m) => { if (m.para === "quebra@x.com") throw new Error("recusado"); enviados.push(m); },
      faltando: () => [],
    };
    const lista = [
      item("vence-em-3", "a@x.com", linha({ trialFim: "2026-10-03" })),
      item("longe", "b@x.com", linha({ trialFim: "2026-10-20" })),
      item("sem-email", null, linha({ trialFim: "2026-10-01" })),
      item("quebra", "quebra@x.com", linha({ trialFim: "2026-09-30" })),
      item("pausou", "d@x.com", linha({ status: "ativa", periodoFim: "2026-09-29", provedor: "abacatepay" })),
      /* Débito automático: o provedor cobra sozinho, não se avisa. */
      item("recorrente", "e@x.com", linha({ status: "ativa", periodoFim: "2026-10-01", assinaturaId: "sub_1", provedor: "stripe" })),
    ];

    const r = await criarAvisarVencimentos({ assinaturas: repo(null, lista).r, correio, linkDePagamento: "https://x/?tela=mais" })("2026-09-30");

    expect(enviados.map((m) => m.para)).toEqual(["a@x.com", "d@x.com"]);
    expect(enviados[1].assunto).toBe("Sua MAISA pausou");
    expect(r).toEqual({ enviados: 2, semEmail: 1, falhas: [{ tenantId: "quebra", motivo: "recusado" }] });
  });
});
