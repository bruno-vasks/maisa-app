/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ **GRAVAR ANTES DE RESPONDER 200.** A doc da Rebots diz que o dado é descartado depois da
 * nossa confirmação — "will be discarded and cannot be recovered" — e a API deles não tem
 * endpoint de consulta. Somados: um 200 nosso sem gravação **apaga a única cópia do desfecho que
 * existe no mundo**. A linha fica `pendente` para sempre, o pagamento segue trancado, e não há a
 * quem perguntar.
 *
 * Então falha de gravação tem que virar 500, para eles reentregarem. É o único teste deste
 * arquivo cuja ausência custaria um documento fiscal perdido em vez de um inconveniente.
 *
 * E a falha fechada: **sem segredo configurado, 401 em tudo**. O custo de errar para este lado é
 * um callback reentregue; para o outro, é qualquer um na internet marcando recibos como
 * "emitido" — o estado do qual o pagamento nunca mais volta para a lista.
 *
 * ── ⚠️ O CORPO AQUI VEM ENVELOPADO EM `data`, COMO NA VIDA REAL ──
 *
 * Este arquivo NÃO dubla `lerCallbackRebots`: usa o tradutor de verdade. É de propósito. Os
 * testes antigos mandavam o corpo desembrulhado — a forma que a gente supunha — e por isso
 * passavam enquanto **todo callback real teria sido respondido com 400**. Um dublê ali teria
 * escondido o defeito para sempre.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesfechoDeRecibo } from "@/nucleo/dominio/recibo-unitario";
import type { ReciboFechado } from "@/nucleo/portas/entrada/casos-de-uso";

const SEGREDO = "segredo-do-teste";

/** O que o dublê do caso de uso recebeu. Reiniciado por teste. */
let fechados: DesfechoDeRecibo[] = [];
let tenantResolvido: string | null = "t1";
let resultado: ReciboFechado | "estoura" = { desfecho: "emitido", comprovanteGuardado: true };
/** Quantas vezes a rota disparou a fila de envios depois de fechar (27/10/2026). */
let drenagens = 0;

vi.mock("@/adaptadores/saida/supabase/livro-de-recibos", () => ({
  async tenantDoProtocolo() { return tenantResolvido; },
}));

vi.mock("@/composicao", () => ({
  app: {
    async fecharReciboDoCallback(_t: unknown, d: DesfechoDeRecibo) {
      fechados.push(d);
      if (resultado === "estoura") throw new Error("conexão com o banco caiu");
      return resultado;
    },
    async drenarFilaDoNegocio() {
      drenagens++;
      return { enviados: 0, adiados: 0, desistidos: 0 };
    },
  },
}));

async function rota(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ RECIBOS_CALLBACK_SECRET: SEGREDO, ...env })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("./route")).POST;
}

const pedir = (corpo: unknown, cabecalhos: Record<string, string> = { apikey: SEGREDO }) =>
  new Request("http://local/api/recibos/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

/** O corpo como a Rebots manda: envelopado em `data`. */
const envelope = (d: Record<string, unknown>) => ({ data: d });

const CALLBACK_OK = envelope({
  receipt_id: "1042", issuer_code: "12345678909", success: true,
  key: "SANDBOX3F2A", file_url: "https://s3/f/1.pdf?X-Amz-Expires=300",
  status_message: "issued", original_action: "issue", test: true,
});

const envOriginal = { ...process.env };

beforeEach(() => {
  fechados = [];
  tenantResolvido = "t1";
  resultado = { desfecho: "emitido", comprovanteGuardado: true };
});
afterEach(() => { process.env = { ...envOriginal }; });

describe("autenticação — falha fechada", () => {
  it("sem segredo no ambiente, 401 mesmo com corpo perfeito", async () => {
    const POST = await rota({ RECIBOS_CALLBACK_SECRET: undefined, ROTINAS_SECRET: undefined });
    const r = await POST(pedir(CALLBACK_OK, {}));

    expect(r.status).toBe(401);
    /* ⚠️ E não gravou nada: um 401 que já tivesse escrito seria pior que inútil. */
    expect(fechados).toEqual([]);
  });

  it("segredo errado, 401", async () => {
    const POST = await rota();
    expect((await POST(pedir(CALLBACK_OK, { apikey: "chute" }))).status).toBe(401);
    expect(fechados).toEqual([]);
  });

  it("aceita Bearer, além de apikey", async () => {
    const POST = await rota();
    const r = await POST(pedir(CALLBACK_OK, { authorization: `Bearer ${SEGREDO}` }));
    expect(r.status).toBe(200);
  });

  /* `ROTINAS_SECRET` é a queda: um segredo só para o agendador e o callback é aceitável, e
   * evita mais uma variável esquecida na Vercel. */
  it("cai para ROTINAS_SECRET quando o específico não existe", async () => {
    const POST = await rota({ RECIBOS_CALLBACK_SECRET: undefined, ROTINAS_SECRET: SEGREDO });
    expect((await POST(pedir(CALLBACK_OK))).status).toBe(200);
  });
});

describe("o caminho felizardo", () => {
  /* ★ ESTE TESTE É O CONSERTO DO DEFEITO MAIS CARO. Com o corpo envelopado — o formato real — a
   * rota antiga respondia 400 `sem_receipt_id`, sempre. */
  it("lê o corpo envelopado, grava o desfecho e responde", async () => {
    const POST = await rota();
    const r = await POST(pedir(CALLBACK_OK));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, desfecho: "emitido", comprovanteGuardado: true });
    expect(fechados).toHaveLength(1);
    expect(fechados[0]).toMatchObject({
      protocolo: "1042", situacao: "emitido", chave: "SANDBOX3F2A",
    });
  });

  it("recusa chega ao caso de uso como recusa", async () => {
    resultado = { desfecho: "recusado", comprovanteGuardado: false };
    const POST = await rota();

    const r = await POST(pedir(envelope({ receipt_id: "1042", success: false })));

    expect(await r.json()).toEqual({ ok: true, desfecho: "recusado", comprovanteGuardado: false });
    expect(fechados[0].situacao).toBe("recusado");
  });

  /* ⚠️ E O CANCELAMENTO NÃO É EMISSÃO. Ele chega com `success: true`, e o código antigo o lia
   * como sucesso de emissão — gravando "emitido" a confirmação de que o documento deixou de
   * existir. */
  it("cancelamento chega como `cancelado`, não como emissão", async () => {
    resultado = { desfecho: "cancelado", comprovanteGuardado: false };
    const POST = await rota();

    await POST(pedir(envelope({
      receipt_id: "1042", success: true, key: "SANDBOX3F2A",
      status_message: "cancelled", original_action: "cancel",
    })));

    expect(fechados[0].situacao).toBe("cancelado");
  });

  /* Reentrega, ou a reconciliação chegou primeiro. **200 e não erro**: pedir reentrega de algo
   * já gravado é loop infinito de webhook. */
  it("linha já fechada devolve 200, não erro", async () => {
    resultado = { desfecho: "ja_fechado", comprovanteGuardado: false };
    const POST = await rota();

    const r = await POST(pedir(CALLBACK_OK));

    expect(r.status).toBe(200);
    expect((await r.json()).desfecho).toBe("ja_fechado");
  });
});

describe("★ `pending` é aviso, não desfecho", () => {
  /* O canal documenta `pending` como estado de callback: "na fila de processamento". Não há o que
   * gravar — a linha já é `pendente`. As duas alternativas seriam piores: 400 faria o canal
   * reentregar um aviso que chegou bem, e tratar como recusa liberaria a cascata e emitiria o
   * SEGUNDO recibo, que é o único bug caro deste produto. */
  it("responde 200 e não chama o caso de uso", async () => {
    const POST = await rota();
    const r = await POST(pedir(envelope({
      receipt_id: "1042", success: false, status_message: "pending",
    })));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, desfecho: "ainda_pendente" });
    /* ⚠️ NADA GRAVADO. É o ponto: um `pending` que virasse recusa soltaria o pagamento. */
    expect(fechados).toEqual([]);
  });
});

describe("★ falha de gravação vira 500, para eles reentregarem", () => {
  /* O TESTE MAIS IMPORTANTE DESTE ARQUIVO. Ver o cabeçalho. */
  it("banco fora do ar responde 500, nunca 200", async () => {
    resultado = "estoura";
    const POST = await rota();

    const r = await POST(pedir(CALLBACK_OK));

    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.erro).toBe("falha_ao_gravar");
  });
});

describe("corpo e protocolo tortos não são incidente", () => {
  it("JSON ilegível é 400 — reentregar não conserta sintaxe", async () => {
    const POST = await rota();
    const r = await POST(pedir("{isso não é json", { apikey: SEGREDO }));

    expect(r.status).toBe(400);
    expect((await r.json()).erro).toBe("corpo_invalido");
  });

  it("sem receipt_id é 400 — não há de quem seja o desfecho", async () => {
    const POST = await rota();
    const r = await POST(pedir(envelope({ success: true, key: "K" })));

    expect(r.status).toBe(400);
    expect((await r.json()).erro).toBe("sem_receipt_id");
    expect(fechados).toEqual([]);
  });

  /* Protocolo desconhecido é ruído, tentativa de terceiro, ou reentrega de algo apagado. 404 e
   * não 500 — nada disso é incidente nosso. */
  it("protocolo que não existe é 404", async () => {
    tenantResolvido = null;
    const POST = await rota();
    const r = await POST(pedir(CALLBACK_OK));

    expect(r.status).toBe(404);
    expect((await r.json()).erro).toBe("protocolo_desconhecido");
    expect(fechados).toEqual([]);
  });
});

describe("a fila de envios (27/10/2026)", () => {
  it("depois de gravar o desfecho, dispara a fila do negócio; antes, não", async () => {
    drenagens = 0;
    resultado = { desfecho: "emitido", comprovanteGuardado: true };
    const POST = await rota();
    const r = await POST(pedir(CALLBACK_OK));
    expect(r.status).toBe(200);
    expect(drenagens).toBe(1);

    drenagens = 0;
    resultado = "estoura";
    const falhou = await (await rota())(pedir(CALLBACK_OK));
    expect(falhou.status).toBe(500);
    expect(drenagens).toBe(0);
  });
});
