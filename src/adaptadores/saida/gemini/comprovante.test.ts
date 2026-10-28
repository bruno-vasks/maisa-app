/* O leitor de comprovante: o que volta do modelo é conferido antes de sair daqui, e qualquer falha
 * vira `null`, nunca exceção. Os casos são os do `test_comprovante.py` do Smiller que cabem aqui. */

import { afterEach, describe, expect, it, vi } from "vitest";

import { atorAgente } from "@/nucleo/dominio/tenant";

const t = { tenantId: "t1", usuarioId: "", ator: atorAgente("teste") };
const IMAGEM = { base64: "aGVsbG8=", mimetype: "image/jpeg" };

async function leitor() {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", "chave-de-teste");
  return import("./comprovante");
}

const respostaDoGemini = (json: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("o que o modelo devolveu", () => {
  it("um comprovante: os campos no nosso vocabulário, aparados e no formato", async () => {
    const { dadosDaResposta } = await leitor();
    expect(dadosDaResposta({
      e_comprovante: true, valor: 150.004, pago_em: "2026-10-27", recebedor_nome: "  ANA  LUCIA ", recebedor_chave: "ana@x.com",
      recebedor_documento: "***.456.789-**", pagador_nome: "JOAO", banco: "Nubank", id_transacao: "E1823 6120 2026", identificador: null,
    })).toEqual({
      valor: 150, pagoEm: "2026-10-27", recebedorNome: "ANA LUCIA", recebedorChave: "ana@x.com", recebedorDocumento: "***.456.789-**",
      pagadorNome: "JOAO", banco: "Nubank", idTransacao: "E182361202026", identificador: null,
    });
  });

  it("não é comprovante, ou não tem valor: nada", async () => {
    const { dadosDaResposta } = await leitor();
    expect(dadosDaResposta({ e_comprovante: false, valor: 10 })).toBeNull();
    expect(dadosDaResposta({ e_comprovante: true, valor: null })).toBeNull();
    expect(dadosDaResposta({ e_comprovante: true, valor: -5 })).toBeNull();
    expect(dadosDaResposta("lixo")).toBeNull();
  });

  it("data fora do formato vira nula; texto gigante é cortado", async () => {
    const { dadosDaResposta } = await leitor();
    const d = dadosDaResposta({ e_comprovante: true, valor: 10, pago_em: "27/10/2026", recebedor_nome: "x".repeat(500) })!;
    expect(d.pagoEm).toBeNull();
    expect(d.recebedorNome).toHaveLength(200);
  });
});

describe("a chamada", () => {
  it("manda o arquivo inline e devolve o que leu", async () => {
    const { leitorDeComprovanteGemini } = await leitor();
    const chamadas: { url: string; corpo: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
      return respostaDoGemini({ e_comprovante: true, valor: 50, id_transacao: "E123" });
    });
    const d = await leitorDeComprovanteGemini.ler(t, IMAGEM);
    expect(d).toMatchObject({ valor: 50, idTransacao: "E123" });
    expect(chamadas[0].corpo.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "aGVsbG8=" } });
    expect(chamadas[0].corpo.generationConfig.responseMimeType).toBe("application/json");
  });

  it("provedor fora, resposta torta ou tipo de arquivo estranho: null, sem exceção", async () => {
    const { leitorDeComprovanteGemini } = await leitor();
    vi.stubGlobal("fetch", async () => new Response("erro", { status: 503 }));
    expect(await leitorDeComprovanteGemini.ler(t, IMAGEM)).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("não é json", { status: 200 }));
    expect(await leitorDeComprovanteGemini.ler(t, IMAGEM)).toBeNull();
    vi.stubGlobal("fetch", async () => { throw new Error("rede"); });
    expect(await leitorDeComprovanteGemini.ler(t, IMAGEM)).toBeNull();
    expect(await leitorDeComprovanteGemini.ler(t, { base64: "x", mimetype: "video/mp4" })).toBeNull();
  });
});
