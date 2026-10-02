/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ **A ROTA NÃO ACEITA DINHEIRO.** Só `fonte` e `id` chegam ao caso de uso, e nada mais. Valor,
 * CPF, data e descrição saem do banco. É a lição que custou caro na `/api/nf/emitir`, que até
 * 17/08/2026 aceitava `valor` e `tomador` do corpo — e com isso um POST forjado emitia documento
 * fiscal de qualquer valor para qualquer CPF, sob o CNPJ do dono.
 *
 * Se um dia alguém acrescentar um campo ao corpo desta rota "para a tela não precisar recarregar",
 * é o teste `ignora tudo que não é fonte e id` que reprova.
 *
 * E o segundo: **200 não é "emitido".** A emissão é assíncrona; a resposta é `pendente`, e a tela
 * que escrever "emitido" em cima disso promete um documento que talvez não exista.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

const t: ContextoTenant = { tenantId: "t1", usuarioId: "u1", ator: { tipo: "usuario", id: "u1" } };

/** O que o caso de uso recebeu. Reiniciado por teste. */
let recebidos: unknown[] = [];
let comSessao = true;
let estoura: Error | null = null;

vi.mock("@/adaptadores/entrada/http/contexto", () => ({
  barrou: (p: any) => Boolean(p?.barrado),
  async exigirSessao() {
    return comSessao
      ? { tenant: t }
      : { barrado: new Response(JSON.stringify({ ok: false, erro: "sem_sessao" }), { status: 401 }) };
  },
}));

vi.mock("@/composicao", () => ({
  app: {
    async emitirRecibo(_t: unknown, p: unknown) {
      recebidos.push(p);
      if (estoura) throw estoura;
      return {
        reciboId: "rec1", canal: "rebots", situacao: "pendente",
        protocolo: "1042", valor: 250, nome: "Ana", data: "2026-08-20",
      };
    },
  },
}));

async function rota() {
  vi.resetModules();
  return (await import("./route")).POST;
}

const pedir = (corpo: unknown) =>
  new Request("http://local/api/recibos/emitir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

beforeEach(() => { recebidos = []; comSessao = true; estoura = null; });
afterEach(() => { vi.restoreAllMocks(); });

describe("porta de entrada", () => {
  it("sem sessão, não emite nada", async () => {
    comSessao = false;
    const POST = await rota();
    const r = await POST(pedir({ fonte: "atendimento", id: "at1" }));

    expect(r.status).toBe(401);
    expect(recebidos).toEqual([]);
  });

  it("emite e devolve o lançamento", async () => {
    const POST = await rota();
    const r = await POST(pedir({ fonte: "atendimento", id: "at1" }));

    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.protocolo).toBe("1042");
  });

  /* ⚠️ 200 NÃO É "EMITIDO". O canal aceitou o pedido; o documento chega no callback. */
  it("a resposta é `pendente`, nunca `emitido`", async () => {
    const POST = await rota();
    const r = await POST(pedir({ fonte: "avulso", id: "av9" }));

    expect((await r.json()).situacao).toBe("pendente");
  });
});

describe("★ a rota não aceita dinheiro", () => {
  it("ignora tudo que não é fonte e id", async () => {
    const POST = await rota();
    await POST(pedir({
      fonte: "atendimento",
      id: "at1",
      /* O que um POST forjado tentaria mandar. */
      valor: 999999,
      cpfBeneficiario: "00000000000",
      cpfPagador: "00000000000",
      descricao: "Consulta de psiquiatria",
      dataPagamento: "2020-01-01",
      tenantId: "outro-inquilino",
    }));

    /* ★ Exatamente duas chaves chegam ao núcleo. Nem uma a mais. */
    expect(recebidos).toEqual([{ fonte: "atendimento", id: "at1" }]);
  });

  /* Um recibo por mês (01/10/2026): várias sessões, e de cada uma só `fonte` e `id`. */
  it("com `itens`, chega a lista, e só fonte e id de cada", async () => {
    const POST = await rota();
    await POST(pedir({ itens: [
      { fonte: "atendimento", id: "at1", valor: 999999 },
      { fonte: "avulso", id: "av2", cpfPagador: "00000000000" },
    ], valor: 1 }));
    expect(recebidos).toEqual([{ itens: [{ fonte: "atendimento", id: "at1" }, { fonte: "avulso", id: "av2" }] }]);
  });

  it("um item torto na lista recusa o pedido inteiro", async () => {
    const POST = await rota();
    const r = await POST(pedir({ itens: [{ fonte: "atendimento", id: "at1" }, { fonte: "boleto", id: "x" }] }));
    expect(r.status).toBe(400);
    expect(recebidos).toEqual([]);
  });

  /* ⚠️ E o inquilino vem da SESSÃO, não do corpo — mesmo com o corpo pedindo outro. */
  it("`tenantId` no corpo não escolhe inquilino", async () => {
    const POST = await rota();
    await POST(pedir({ fonte: "atendimento", id: "at1", tenantId: "outro-inquilino" }));

    expect(JSON.stringify(recebidos)).not.toContain("outro-inquilino");
  });
});

describe("corpo torto é 400, não incidente", () => {
  it("JSON ilegível", async () => {
    const POST = await rota();
    const r = await POST(pedir("{nao é json"));
    expect(r.status).toBe(400);
    expect(recebidos).toEqual([]);
  });

  it("fonte desconhecida não chega ao banco", async () => {
    const POST = await rota();
    const r = await POST(pedir({ fonte: "boleto", id: "x1" }));

    expect(r.status).toBe(400);
    /* Sem esta guarda, a função do banco levantaria exceção de SQL — que na tela do dono não
     * quer dizer nada. */
    expect(recebidos).toEqual([]);
  });

  it("id vazio não chega ao banco", async () => {
    const POST = await rota();
    expect((await POST(pedir({ fonte: "avulso", id: "   " }))).status).toBe(400);
    expect(recebidos).toEqual([]);
  });
});

describe("erro do núcleo vira resposta legível", () => {
  it("recusa do caso de uso não vira 500 genérico", async () => {
    /* ⚠️ A ORDEM IMPORTA: `rota()` chama `vi.resetModules()`, e `falha()` reconhece o erro por
     * `instanceof`. Construir o `DadoInvalido` ANTES do reset daria uma classe de outra cópia do
     * módulo, o `instanceof` falharia, e a rota responderia 502 em vez de 400 — que é exatamente
     * o que aconteceu na primeira versão deste teste. */
    const POST = await rota();
    const { DadoInvalido } = await import("@/nucleo/dominio/erros");
    estoura = new DadoInvalido("Este pagamento já entrou num recibo ou num lote.", "id");

    const r = await POST(pedir({ fonte: "atendimento", id: "at1" }));

    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain("já entrou num recibo");
  });
});
