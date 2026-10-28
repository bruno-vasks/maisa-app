/* O adaptador do Asaas contra o Asaas falso: abrir a subconta (a chave guardada antes de tudo), a
 * situação, a cobrança só com a conta aprovada, a taxa da plataforma e o aviso que leva ao negócio. */

import { beforeEach, describe, expect, it } from "vitest";

import { cofreDeRecebimentosDemo, zerarCofreDeRecebimentosDemo } from "@/adaptadores/saida/demo/cofre-de-recebimentos";
import { atorUsuario, type ContextoTenant } from "@/nucleo/dominio/tenant";

import { CHAVE_DA_PLATAFORMA, criarAsaasFalso } from "./asaas-falso";
import { criarClienteAsaas } from "./cliente";
import type { ConfigAsaas } from "./config";
import { criarProvedorAsaas, hashDoToken } from "./recebimentos-asaas";

const t: ContextoTenant = { tenantId: "negocio-1", usuarioId: "u1", ator: atorUsuario("u1") };
const CONFIG: ConfigAsaas = {
  ligado: true, ambiente: "sandbox", chavePlataforma: CHAVE_DA_PLATAFORMA, walletPlataforma: null, taxaFixa: 0, taxaPercentual: 0,
  urlDoAviso: "https://maisa.falsa/api/recebimentos/asaas", emailDoAviso: "avisos@maisa.falsa",
};
const TITULAR = {
  documento: "12345678909", nome: "Ana Lúcia Souza", email: "ana@x.com", celular: "11988887777", cep: "01310100",
  endereco: "Av. Paulista", numero: "1000", bairro: "Bela Vista", faturamentoMensal: 8000, nascimento: "1990-05-10",
};
const PEDIDO = {
  referencia: "rec-1", valor: 50, vencimento: "2026-10-30", descricao: "Corte, 27/10",
  pagador: { nome: "João Silva", documento: "98765432100", telefone: "5511977776666", referencia: "cli-1" },
};

function montar(o: { config?: Partial<ConfigAsaas>; semChave?: boolean } = {}) {
  const falso = criarAsaasFalso({ semChave: o.semChave });
  const provedor = criarProvedorAsaas({
    cofre: cofreDeRecebimentosDemo,
    config: { ...CONFIG, ...o.config },
    cliente: criarClienteAsaas({ fetch: falso.fetch, base: { sandbox: "https://asaas.falso/v3" } }),
    sortearToken: () => "token-do-aviso",
  });
  return { falso, provedor };
}

beforeEach(() => zerarCofreDeRecebimentosDemo());

describe("abrir a conta", () => {
  it("guarda a chave da subconta antes de tudo, cadastra o aviso com o token, e mostra o que falta", async () => {
    const { falso, provedor } = montar();
    expect(await provedor.conta(t)).toEqual({ situacao: "sem_conta", pendencias: [] });

    const conta = await provedor.abrirConta(t, TITULAR);
    expect(conta).toEqual({ situacao: "pendente", pendencias: [{ titulo: "Enviar documento de identificação e selfie do responsável", link: "https://asaas.falso/onboarding/acc_1" }] });
    expect(falso.registro.slice(0, 3)).toEqual(["POST /accounts", "GET /webhooks", "POST /webhooks"]);
    expect(await cofreDeRecebimentosDemo.ler(t)).toMatchObject({ idConta: "acc_1", chave: "$aact_sub_1", situacao: "pendente" });
    expect(falso.webhooks[0]).toMatchObject({ url: CONFIG.urlDoAviso, authToken: "token-do-aviso" });
    expect(await cofreDeRecebimentosDemo.negocioDoToken(hashDoToken("token-do-aviso"))).toBe(t.tenantId);

    await expect(provedor.abrirConta(t, TITULAR)).rejects.toThrow(/já tem conta/);
  });

  it("sem o acordo BaaS a chave não vem: falha dizendo, e nada fica guardado", async () => {
    const { provedor } = montar({ semChave: true });
    await expect(provedor.abrirConta(t, TITULAR)).rejects.toThrow(/acordo BaaS/);
    expect(await cofreDeRecebimentosDemo.ler(t)).toBeNull();
  });

  it("a recusa do Asaas por dado vira frase de tela", async () => {
    const { provedor } = montar();
    await expect(provedor.abrirConta(t, { ...TITULAR, cep: "123" })).rejects.toThrow("O CEP informado é inválido.");
  });
});

describe("a conta andando", () => {
  it("conferir pergunta ao Asaas e guarda; aprovada, não pergunta mais", async () => {
    const { falso, provedor } = montar();
    await provedor.abrirConta(t, TITULAR);
    falso.enviarDocumentos("acc_1");
    expect((await provedor.conta(t, { conferir: true })).situacao).toBe("em_analise");
    falso.aprovar("acc_1");
    expect((await provedor.conta(t)).situacao).toBe("em_analise");
    expect((await provedor.conta(t, { conferir: true })).situacao).toBe("aprovada");
    const chamadas = falso.registro.length;
    expect((await provedor.conta(t, { conferir: true })).situacao).toBe("aprovada");
    expect(falso.registro.length).toBe(chamadas);
  });
});

describe("a cobrança", () => {
  it("só com a conta aprovada; com ela, o link e o Pix copia e cola", async () => {
    const { falso, provedor } = montar();
    await provedor.abrirConta(t, TITULAR);
    await expect(provedor.emitir(t, PEDIDO)).rejects.toThrow(/não foi aprovada/);
    falso.aprovar("acc_1");
    await provedor.conta(t, { conferir: true });
    const c = await provedor.emitir(t, PEDIDO);
    expect(c).toMatchObject({ link: expect.stringContaining("https://asaas.falso/i/pay_"), pixCopiaECola: expect.stringContaining("00020126pix-") });
    expect(falso.cobrancas[c.idExterno]).toMatchObject({ value: 50, externalReference: "rec-1", billingType: "UNDEFINED" });
  });

  it("a taxa da plataforma vai por split; taxa fixa maior que o valor fica de fora", async () => {
    const { falso, provedor } = montar({ config: { walletPlataforma: "wal_plat", taxaFixa: 2 } });
    await provedor.abrirConta(t, TITULAR);
    falso.aprovar("acc_1");
    await provedor.conta(t, { conferir: true });
    const comTaxa = await provedor.emitir(t, PEDIDO);
    expect(falso.cobrancas[comTaxa.idExterno].split).toEqual([{ walletId: "wal_plat", fixedValue: 2 }]);
    const barato = await provedor.emitir(t, { ...PEDIDO, valor: 1.5 });
    expect(falso.cobrancas[barato.idExterno].split).toBeUndefined();
  });

  it("o aviso de pagamento: o token leva ao negócio, e o evento diz qual cobrança foi paga", async () => {
    const { falso, provedor } = montar();
    await provedor.abrirConta(t, TITULAR);
    falso.aprovar("acc_1");
    await provedor.conta(t, { conferir: true });
    const c = await provedor.emitir(t, PEDIDO);
    const aviso = falso.pagar(c.idExterno);
    expect(await cofreDeRecebimentosDemo.negocioDoToken(hashDoToken(aviso.token))).toBe(t.tenantId);
    expect(provedor.lerEvento(aviso.corpo)).toEqual({ tipo: "paga", idExterno: c.idExterno, referencia: "rec-1", valorPago: 50, pagoEm: "2026-10-27" });
  });

  it("desligado sem a flag ou sem a chave da plataforma", () => {
    expect(montar({ config: { ligado: false } }).provedor.disponivel()).toBe(false);
    expect(montar({ config: { chavePlataforma: "" } }).provedor.disponivel()).toBe(false);
    expect(montar().provedor.disponivel()).toBe(true);
  });
});

describe("o aviso que não foi cadastrado", () => {
  it("é cadastrado de novo na conferência, com token novo; o velho deixa de valer", async () => {
    const falso = criarAsaasFalso();
    let falhar = true;
    const fetchQueFalha = (async (url: string | URL | Request, init?: RequestInit) =>
      falhar && String(url).endsWith("/webhooks") && init?.method === "POST" ? new Response("{}", { status: 500 }) : falso.fetch(url, init)) as typeof fetch;
    let n = 0;
    const provedor = criarProvedorAsaas({
      cofre: cofreDeRecebimentosDemo,
      config: CONFIG,
      cliente: criarClienteAsaas({ fetch: fetchQueFalha, base: { sandbox: "https://asaas.falso/v3" } }),
      sortearToken: () => `token-${++n}`,
    });
    await provedor.abrirConta(t, TITULAR);
    expect(falso.webhooks).toHaveLength(0);
    expect((await cofreDeRecebimentosDemo.ler(t))?.avisoCadastrado).toBe(false);

    falhar = false;
    await provedor.conta(t, { conferir: true });
    expect(falso.webhooks).toHaveLength(1);
    expect((await cofreDeRecebimentosDemo.ler(t))?.avisoCadastrado).toBe(true);
    expect(await cofreDeRecebimentosDemo.negocioDoToken(hashDoToken(falso.webhooks[0].authToken))).toBe(t.tenantId);
  });

  it("sem a URL do aviso, a opção B não liga", () => {
    expect(montar({ config: { urlDoAviso: "" } }).provedor.disponivel()).toBe(false);
  });
});
