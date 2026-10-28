/* O cliente do Asaas contra um `fetch` gravado: URL, cabeçalho e corpo de cada chamada. São os
 * casos do `asaas.test.ts` do Smiller (Deno) que valem para a MAISA, passados para o vitest. */

import { describe, expect, it } from "vitest";

import { criarClienteAsaas, FalhaNoAsaas, type ContaAsaas } from "./cliente";

const CONTA: ContaAsaas = { ambiente: "sandbox", chave: "$aact_teste" };

type Chamada = { metodo: string; url: string; chave: string | null; corpo: any };

export function gravador(respostas: Record<string, { status?: number; corpo: unknown }>) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    chamadas.push({ metodo, url: u, chave: headers.get("access_token"), corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const caminho = u.replace(/^https?:\/\/[^/]+(\/api)?\/v3/, "");
    const r = respostas[`${metodo} ${caminho}`] ?? respostas[`${metodo} ${caminho.split("?")[0]}`];
    if (!r) return new Response(JSON.stringify({ errors: [{ description: `sem resposta para ${metodo} ${caminho}` }] }), { status: 404 });
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, chamadas };
}

const PEDIDO = {
  referencia: "rec-41",
  valor: 50,
  vencimento: "2026-10-29",
  descricao: "Corte, 27/10",
  pagador: { nome: "João Silva", documento: "123.456.789-09", telefone: "5511988887777", referencia: "cli-1" },
};

describe("emitir", () => {
  it("cria o cliente sem notificação do Asaas, a cobrança em que o cliente escolhe a forma, e busca o Pix", async () => {
    const { f, chamadas } = gravador({
      "GET /customers?cpfCnpj=12345678909&limit=1": { corpo: { data: [] } },
      "POST /customers": { corpo: { id: "cus_1" } },
      "POST /payments": { corpo: { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/pay_1" } },
      "GET /payments/pay_1/pixQrCode": { corpo: { payload: "00020101pix" } },
    });
    const r = await criarClienteAsaas({ fetch: f }).emitir(CONTA, PEDIDO);
    expect(r).toEqual({ idExterno: "pay_1", link: "https://sandbox.asaas.com/i/pay_1", pixCopiaECola: "00020101pix" });
    expect(chamadas[0].url).toBe("https://sandbox.asaas.com/api/v3/customers?cpfCnpj=12345678909&limit=1");
    expect(chamadas.every((c) => c.chave === "$aact_teste")).toBe(true);
    expect(chamadas[1].corpo).toMatchObject({ cpfCnpj: "12345678909", mobilePhone: "11988887777", notificationDisabled: true });
    expect(chamadas[2].corpo).toMatchObject({ customer: "cus_1", billingType: "UNDEFINED", value: 50, externalReference: "rec-41" });
    expect(chamadas[2].corpo.split).toBeUndefined();
  });

  it("reaproveita o cliente que já existe, segue sem Pix se o QR falhar, e manda o split da taxa", async () => {
    const { f, chamadas } = gravador({
      "GET /customers?cpfCnpj=12345678909&limit=1": { corpo: { data: [{ id: "cus_9" }] } },
      "POST /payments": { corpo: { id: "pay_2", invoiceUrl: "https://x/i/pay_2" } },
    });
    const r = await criarClienteAsaas({ fetch: f }).emitir(CONTA, { ...PEDIDO, taxaDaPlataforma: { walletId: "w_plat", fixo: 1 } });
    expect(r.pixCopiaECola).toBeNull();
    expect(chamadas.find((c) => c.metodo === "POST" && c.url.endsWith("/payments"))?.corpo.split).toEqual([{ walletId: "w_plat", fixedValue: 1 }]);
  });

  it("produção usa a URL de produção; a chave recusada e o erro do Asaas chegam em frase", async () => {
    const { f, chamadas } = gravador({ "DELETE /payments/pay_1": { corpo: {} } });
    await criarClienteAsaas({ fetch: f }).cancelar({ ...CONTA, ambiente: "producao" }, "pay_1");
    expect(chamadas[0].url).toBe("https://api.asaas.com/v3/payments/pay_1");

    const recusa = gravador({ "GET /myAccount/status": { status: 401, corpo: {} } });
    await expect(criarClienteAsaas({ fetch: recusa.f }).situacaoDaConta(CONTA)).rejects.toThrow(/recusou a chave/);
    const erro = gravador({ "POST /accounts": { status: 400, corpo: { errors: [{ description: "O CEP informado é inválido." }] } } });
    await expect(criarClienteAsaas({ fetch: erro.f }).abrirConta(CONTA, TITULAR)).rejects.toThrow("O CEP informado é inválido.");
  });

  it("cancelar o que já sumiu no Asaas não é erro", async () => {
    const { f } = gravador({ "DELETE /payments/pay_x": { status: 404, corpo: {} } });
    await expect(criarClienteAsaas({ fetch: f }).cancelar(CONTA, "pay_x")).resolves.toBeUndefined();
  });
});

const TITULAR = {
  documento: "123.456.789-09", nome: "Ana Lúcia Souza", email: "ana@x.com", celular: "+55 11 98888-7777", cep: "01310-100",
  endereco: "Av. Paulista", numero: "1000", bairro: "Bela Vista", faturamentoMensal: 8000, nascimento: "1990-05-10",
};

describe("a subconta", () => {
  it("abre com a chave da plataforma, manda os campos do Asaas e devolve a chave da subconta", async () => {
    const { f, chamadas } = gravador({ "POST /accounts": { corpo: { id: "acc_1", walletId: "w_1", accessToken: { apiKey: "$aact_sub" } } } });
    const r = await criarClienteAsaas({ fetch: f }).abrirConta({ ambiente: "sandbox", chave: "$aact_plat" }, TITULAR);
    expect(r).toEqual({ chave: "$aact_sub", idConta: "acc_1", walletId: "w_1" });
    expect(chamadas[0].chave).toBe("$aact_plat");
    expect(chamadas[0].corpo).toMatchObject({ cpfCnpj: "12345678909", mobilePhone: "11988887777", postalCode: "01310100", birthDate: "1990-05-10", incomeValue: 8000 });
    expect(chamadas[0].corpo.companyType).toBeUndefined();
  });

  it("sem apiKey na resposta (sem BaaS), falha dizendo o motivo e o id da conta", async () => {
    const { f } = gravador({ "POST /accounts": { corpo: { id: "acc_2" } } });
    await expect(criarClienteAsaas({ fetch: f }).abrirConta(CONTA, TITULAR)).rejects.toThrow(/acc_2.*acordo BaaS/);
  });

  it("situação: aprovada; pendente com o link de envio; em análise; recusada", async () => {
    const aprovada = gravador({ "GET /myAccount/status": { corpo: { general: "APPROVED" } } });
    expect(await criarClienteAsaas({ fetch: aprovada.f }).situacaoDaConta(CONTA)).toEqual({ situacao: "aprovada", pendencias: [] });
    expect(aprovada.chamadas).toHaveLength(1);

    const pendente = gravador({
      "GET /myAccount/status": { corpo: { general: "PENDING", documentation: "PENDING" } },
      "GET /myAccount/documents": { corpo: { data: [{ status: "NOT_SENT", type: "IDENTIFICATION", onboardingUrl: "https://asaas/onb/1" }] } },
    });
    expect(await criarClienteAsaas({ fetch: pendente.f }).situacaoDaConta(CONTA)).toEqual({
      situacao: "pendente", pendencias: [{ titulo: "Enviar documento de identificação e selfie do responsável", link: "https://asaas/onb/1" }],
    });

    const analise = gravador({ "GET /myAccount/status": { corpo: { general: "AWAITING_APPROVAL", documentation: "AWAITING_APPROVAL" } } });
    expect((await criarClienteAsaas({ fetch: analise.f }).situacaoDaConta(CONTA)).situacao).toBe("em_analise");
    const recusada = gravador({ "GET /myAccount/status": { corpo: { general: "REJECTED" } } });
    expect((await criarClienteAsaas({ fetch: recusada.f }).situacaoDaConta(CONTA)).situacao).toBe("recusada");
  });

  it("registrar o aviso: tira o antigo da mesma URL, fila sequencial, token e só os eventos que importam", async () => {
    const { f, chamadas } = gravador({
      "GET /webhooks": { corpo: { data: [{ id: "wh_velho", url: "https://maisa/api/recebimentos/asaas" }, { id: "wh_outro", url: "https://outra" }] } },
      "DELETE /webhooks/wh_velho": { corpo: {} },
      "POST /webhooks": { corpo: { id: "wh_novo" } },
    });
    await criarClienteAsaas({ fetch: f }).registrarAviso(CONTA, { url: "https://maisa/api/recebimentos/asaas", token: "tok", email: "a@b.com" });
    expect(chamadas.map((c) => `${c.metodo} ${c.url.split("/v3")[1]}`)).toEqual(["GET /webhooks", "DELETE /webhooks/wh_velho", "POST /webhooks"]);
    expect(chamadas[2].corpo).toMatchObject({ authToken: "tok", sendType: "SEQUENTIALLY", events: ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_REFUNDED", "PAYMENT_DELETED"] });
  });
});

describe("o aviso de pagamento", () => {
  const asaas = criarClienteAsaas({ fetch: (async () => new Response("{}")) as typeof fetch });

  it("pago, com o dia em que o cliente pagou e a nossa referência", () => {
    expect(asaas.lerEvento({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", externalReference: "rec-41", value: 50, clientPaymentDate: "2026-10-27", billingType: "PIX" } }))
      .toEqual({ tipo: "paga", idExterno: "pay_1", referencia: "rec-41", valorPago: 50, pagoEm: "2026-10-27" });
  });

  it("estornado, removido, outro evento e lixo", () => {
    expect(asaas.lerEvento({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1", externalReference: "rec-41" } })).toMatchObject({ tipo: "estornada" });
    expect(asaas.lerEvento({ event: "PAYMENT_DELETED", payment: { id: "pay_1" } })).toMatchObject({ tipo: "cancelada", referencia: null });
    expect(asaas.lerEvento({ event: "PAYMENT_CREATED", payment: { id: "pay_1" } })).toEqual({ tipo: "ignorado", evento: "PAYMENT_CREATED" });
    expect(asaas.lerEvento("lixo")).toBeNull();
    expect(new FalhaNoAsaas("x", 400).status).toBe(400);
  });
});
