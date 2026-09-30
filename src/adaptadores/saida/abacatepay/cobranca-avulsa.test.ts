/* ─────────────────────────────────────────────────────────────────────────────
 * O Pix na nossa tela (30/09/2026). O que estes testes prendem:
 *
 *   · o Pix nasce com o CARIMBO no `metadata` e o preço do PRODUTO avulso, sem nenhum dado do
 *     cliente — é o que tirou as três etapas da página deles;
 *   · a URL devolvida é a nossa, `/pagar`, com uma volta relativa;
 *   · ★ Pix de outro inquilino volta `null`: trocar o `?id=` não mostra o QR Code de ninguém;
 *   · QR Code pago ou vencido não aparece — seria convite a pagar duas vezes.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, describe, expect, it, vi } from "vitest";

const T = "e53f6630-b266-435d-b777-7f0a99d94ce9";
const OUTRO = "a431996c-baaf-4a4c-86a1-83dc111e2bea";
const ctx = (tenantId: string) => ({ tenantId, usuarioId: "u", ator: { tipo: "usuario" } }) as never;

type Resp = { data: unknown; error?: string | null };
async function carregar(respostas: (url: string, corpo: unknown) => Resp) {
  vi.resetModules();
  vi.stubEnv("ABACATEPAY_API_KEY", "abc_prod_teste");
  const pedidos: { url: string; corpo: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: URL, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    pedidos.push({ url: String(url), corpo });
    const r = respostas(String(url), corpo);
    return new Response(JSON.stringify({ success: !r.error, error: r.error ?? null, data: r.data }), { status: 200 });
  });
  const m = await import("./cobranca-avulsa");
  return { m, pedidos };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

const PRODUTO = { id: "prod_x", externalId: "maisa-profissional-avulso", name: "MAISA Profissional — 1 mês", price: 19700, status: "ACTIVE", cycle: null };

describe("abrirCheckout — o Pix na nossa tela", () => {
  it("cria o Pix com o preço do produto e o carimbo, sem dado do cliente, e devolve /pagar", async () => {
    const { m, pedidos } = await carregar((url) =>
      url.includes("/products/get") ? { data: PRODUTO } : { data: { id: "pix_char_1", brCode: "000201…", status: "PENDING" } });

    const r = await m.cobrancaAbacatePayAvulsa.abrirCheckout(ctx(T), {
      plano: "profissional",
      voltarPara: "https://app.maisasecretary.com.br/comecar?pagamento=recebido",
      cancelarPara: "https://app.maisasecretary.com.br/comecar?pagamento=cancelado",
    });

    const pix = pedidos.find((p) => p.url.includes("/transparents/create"))!.corpo as { method: string; data: Record<string, unknown> };
    expect(pix.method).toBe("PIX");
    expect(pix.data.amount).toBe(19700);
    expect(pix.data.customer).toBeUndefined();
    expect(String((pix.data.metadata as { carimbo: string }).carimbo)).toMatch(new RegExp(`^maisa:${T}:profissional:`));

    const u = new URL(r.url);
    expect(u.origin + u.pathname).toBe("https://app.maisasecretary.com.br/pagar");
    expect(u.searchParams.get("id")).toBe("pix_char_1");
    expect(u.searchParams.get("volta")).toBe("/comecar?pagamento=recebido");
  });

  it("produto avulso sem preço não vira Pix de zero reais", async () => {
    const { m } = await carregar(() => ({ data: { ...PRODUTO, price: 0 } }));
    await expect(m.cobrancaAbacatePayAvulsa.abrirCheckout(ctx(T), {
      plano: "profissional", voltarPara: "https://x.com/a", cancelarPara: "https://x.com/b",
    })).rejects.toThrow(/preço/);
  });
});

describe("lerPagamento", () => {
  const pix = (tenant: string, status = "PENDING") => ({
    id: "pix_char_1", status, amount: 19700, brCode: "000201…", brCodeBase64: "data:image/png;base64,AAA",
    expiresAt: "2026-10-01T00:00:00Z", metadata: { carimbo: `maisa:${tenant}:profissional:2026-09-30` },
  });

  it("devolve o Pix do próprio negócio, com os dois códigos", async () => {
    const { m } = await carregar(() => ({ data: pix(T) }));
    const r = await m.cobrancaAbacatePayAvulsa.lerPagamento(ctx(T), "pix_char_1");
    expect(r).toMatchObject({ status: "pendente", valor: 197, plano: "profissional", copiaECola: "000201…" });
    expect(r?.qrCode).toMatch(/^data:image\//);
  });

  /* ★ O teste que importa: o id viaja na URL, e URL se compartilha. */
  it("Pix de outro negócio é null — nem valor, nem QR Code", async () => {
    const { m } = await carregar(() => ({ data: pix(OUTRO) }));
    expect(await m.cobrancaAbacatePayAvulsa.lerPagamento(ctx(T), "pix_char_1")).toBeNull();
  });

  it("pago não mostra mais o código", async () => {
    const { m } = await carregar(() => ({ data: pix(T, "PAID") }));
    const r = await m.cobrancaAbacatePayAvulsa.lerPagamento(ctx(T), "pix_char_1");
    expect(r).toMatchObject({ status: "pago", copiaECola: null, qrCode: null });
  });

  it("id que não existe é null, não erro", async () => {
    const { m } = await carregar(() => ({ data: null, error: "Charge not found" }));
    expect(await m.cobrancaAbacatePayAvulsa.lerPagamento(ctx(T), "pix_char_nao")).toBeNull();
  });
});
