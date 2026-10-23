/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ **FALHA FECHADA.** Sem segredo no ambiente, 401 em tudo — inclusive com header vazio, que é o
 * que um ambiente sem variável compararia com `""` se a conferência fosse ingênua. O custo de
 * errar para este lado é um e-mail a menos para o Bruno; para o outro, é qualquer um na internet
 * disparando aviso.
 *
 * ★ **DO CORPO, SÓ O `id`.** Um `email`, `para` ou `tenantId` no corpo não chega ao caso de uso.
 *
 * E a tradução: `ja_avisado` e `conta_inexistente` são 200 (a rota funcionou e decidiu); id torto
 * é 400; nenhum e-mail saiu é erro, para o `net._http_response` mostrar.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";
import type { ResultadoDoAvisoDeCadastro } from "@/nucleo/portas/entrada/casos-de-uso";
import { iguaisEmTempoConstante, segredoConfere } from "@/adaptadores/entrada/http/segredo";

const SEGREDO = "segredo-do-teste";
const ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

/** O que o dublê do caso de uso recebeu. Reiniciado por teste. */
let chamadas: unknown[][] = [];
let resposta: ResultadoDoAvisoDeCadastro | Error = { status: "enviado", enviados: 1, falhas: [] };

vi.mock("@/composicao", () => ({
  app: {
    async avisarNovoCadastro(...args: unknown[]) {
      chamadas.push(args);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  },
}));

async function rota(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ROTINAS_SECRET: SEGREDO, WHATSAPP_WEBHOOK_SECRET: undefined, ...env })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("./route")).POST;
}

const pedir = (corpo: unknown, cabecalhos: Record<string, string> = { apikey: SEGREDO }) =>
  new Request("http://local/api/interno/novo-cadastro", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

const envOriginal = { ...process.env };

beforeEach(() => {
  chamadas = [];
  resposta = { status: "enviado", enviados: 1, falhas: [] };
});
afterEach(() => { process.env = { ...envOriginal }; });

describe("autenticação — falha fechada", () => {
  it("sem segredo no ambiente, 401 mesmo com header vazio e corpo perfeito", async () => {
    const POST = await rota({ ROTINAS_SECRET: undefined, WHATSAPP_WEBHOOK_SECRET: undefined });
    expect((await POST(pedir({ id: ID }, { apikey: "" }))).status).toBe(401);
    expect((await POST(pedir({ id: ID }, {}))).status).toBe(401);
    expect(chamadas).toEqual([]);
  });

  it("segredo errado, 401, e o caso de uso não roda", async () => {
    const POST = await rota();
    expect((await POST(pedir({ id: ID }, { apikey: "chute" }))).status).toBe(401);
    expect((await POST(pedir({ id: ID }, { apikey: `${SEGREDO}x` }))).status).toBe(401);
    expect(chamadas).toEqual([]);
  });

  it("aceita `apikey` (o que o pg_net manda) e `Authorization: Bearer`", async () => {
    const POST = await rota();
    expect((await POST(pedir({ id: ID }))).status).toBe(200);
    expect((await POST(pedir({ id: ID }, { authorization: `Bearer ${SEGREDO}` }))).status).toBe(200);
  });

  it("cai para WHATSAPP_WEBHOOK_SECRET quando ROTINAS_SECRET não existe, como a rota dos lembretes", async () => {
    const POST = await rota({ ROTINAS_SECRET: undefined, WHATSAPP_WEBHOOK_SECRET: SEGREDO });
    expect((await POST(pedir({ id: ID }))).status).toBe(200);
  });
});

describe("a comparação do segredo", () => {
  it("compara pelo conteúdo, de qualquer tamanho, sem lançar", () => {
    expect(iguaisEmTempoConstante("abc", "abc")).toBe(true);
    expect(iguaisEmTempoConstante("abc", "abd")).toBe(false);
    expect(iguaisEmTempoConstante("abc", "abcdef")).toBe(false);
    expect(iguaisEmTempoConstante("", "abc")).toBe(false);
  });

  it("lista vazia ou só de vazios nunca autoriza", () => {
    const req = new Request("http://local", { headers: { apikey: "" } });
    expect(segredoConfere(req, [])).toBe(false);
    expect(segredoConfere(req, [""])).toBe(false);
    expect(segredoConfere(new Request("http://local"), ["  "])).toBe(false);
  });
});

describe("do corpo, só o id", () => {
  it("passa o id e o instante, e ignora o resto do corpo", async () => {
    const POST = await rota();
    const r = await POST(pedir({ id: ID, email: "atacante@x.com", para: "atacante@x.com", tenantId: "t2" }));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, status: "enviado", enviados: 1, falhas: [] });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toHaveLength(2);
    expect(chamadas[0][0]).toBe(ID);
    expect(chamadas[0][1]).toBeInstanceOf(Date);
  });

  it("corpo que não é JSON chega como id vazio, e o caso de uso recusa com 400", async () => {
    const POST = await rota();
    /* Depois do `resetModules`: a rota enxerga a classe recarregada, e `instanceof` com a classe
     * importada no topo deste arquivo daria falso. */
    const { DadoInvalido: DadoInvalidoDaRota } = await import("@/nucleo/dominio/erros");
    resposta = new DadoInvalidoDaRota("O id da conta tem de ser um uuid.", "id");
    const r = await POST(pedir("isto não é json"));
    expect(r.status).toBe(400);
    expect(chamadas[0][0]).toBe("");
  });
});

describe("os status", () => {
  it("já avisado e conta inexistente são 200 — a rota funcionou e decidiu", async () => {
    const POST = await rota();
    resposta = { status: "ja_avisado", enviados: 0, falhas: [] };
    const a = await POST(pedir({ id: ID }));
    expect(a.status).toBe(200);
    expect((await a.json()).status).toBe("ja_avisado");

    resposta = { status: "conta_inexistente", enviados: 0, falhas: [] };
    const b = await POST(pedir({ id: ID }));
    expect(b.status).toBe(200);
    expect((await b.json()).status).toBe("conta_inexistente");
  });

  it("nenhum e-mail saiu vira erro, para o net._http_response mostrar", async () => {
    resposta = new FalhaDoProvedor("Aviso de cadastro: nenhum e-mail saiu. Resend: HTTP 403");
    const POST = await rota();
    const r = await POST(pedir({ id: ID }));
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect((await r.json()).ok).toBe(false);
  });
});
