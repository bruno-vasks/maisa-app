/* ─────────────────────────────────────────────────────────────────────────────
 * A FILA DE ENVIOS — o que sai, em que ordem, com que espaço, e o que acontece quando falha.
 *
 * A vez de cada mensagem (uma por vez por negócio, espaço no banco) é do adaptador e tem teste
 * próprio; aqui a fila é um dublê simples, e o que se prende é a drenagem: ela espera entre uma
 * pessoa e outra, gera o link do PDF na hora, anota o desfecho do recibo, devolve o que é
 * passageiro e desiste do que pode ter entregado.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";

import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { FilaDeEnvios } from "../portas/saida/fila-de-envios";
import type { GuardaDeComprovante } from "../portas/saida/guarda-de-comprovante";
import type { ContextoTenant } from "../dominio/tenant";
import type { EnvioNaFila } from "../dominio/envios";
import { FalhaDoProvedor, PrecisaReconectar } from "../dominio/erros";
import { atorAgente } from "../dominio/tenant";

import { criarDrenarFilaDoNegocio, criarEnviarFilaDeMensagens, TEMPO_DA_RODADA_MS } from "./fila-de-envios";

const T0 = Date.parse("2026-10-27T15:00:00-03:00");
const t: ContextoTenant = { tenantId: "t1", usuarioId: "u1", ator: atorAgente("teste") };

const envio = (over: Partial<EnvioNaFila> = {}): EnvioNaFila => ({
  id: `e${Math.random().toString(36).slice(2, 8)}`,
  tenantId: "t1",
  para: "5511981234567",
  textos: ["Oi, Mariana! O recibo de agosto já foi emitido."],
  origem: "lote_de_recibos",
  criadoEm: new Date(T0).toISOString(),
  tentativas: 1,
  ...over,
});

function ambiente(p: { fila: EnvioNaFila[]; quebra?: (para: string) => Error | null; sorteio?: number; semLinkDaCopia?: boolean }) {
  let agora = T0;
  const esperas: number[] = [];
  const saidas: { tenant: string; ator: string; para: string; textos: string[]; arquivo?: string }[] = [];
  const devolvidos: { id: string; desistir: boolean }[] = [];
  const concluidos: string[] = [];
  const anotados: { reciboId: string; desfecho: string }[] = [];
  const pendentes = [...p.fila];

  const fila: FilaDeEnvios = {
    faltando: () => [],
    async enfileirar() {},
    async negociosComEnvio() { return [...new Set(pendentes.map((e) => e.tenantId))]; },
    async reservar(ctx) {
      const i = pendentes.findIndex((e) => e.tenantId === ctx.tenantId);
      return i === -1 ? null : pendentes.splice(i, 1)[0];
    },
    async concluir(_ctx, id) { concluidos.push(id); },
    async devolver(_ctx, id, x) { devolvidos.push({ id, desistir: x.desistir }); return { desistiu: x.desistir }; },
  };

  const vez = (ctx: ContextoTenant, para: string) => {
    const erro = p.quebra?.(para);
    if (erro) throw erro;
    return { tenant: ctx.tenantId, ator: ctx.ator.tipo };
  };
  const canal: CanalDeMensagens = {
    async enviar(ctx, para, textos) { saidas.push({ ...vez(ctx, para), para, textos }); },
    async enviarDocumento(ctx, para, doc) { saidas.push({ ...vez(ctx, para), para, textos: [doc.legenda], arquivo: doc.url }); },
    async escalar() {},
  };

  const guarda = {
    async linkParaBaixar(_ctx: unknown, x: { caminho: string; segundos: number }) {
      return p.semLinkDaCopia ? null : `https://copia/${x.caminho}?vale=${x.segundos}`;
    },
  } as unknown as GuardaDeComprovante;

  const deps = {
    fila, canal, guarda,
    livro: { async registrarAviso(_ctx: ContextoTenant, x: { reciboId: string; desfecho: string }) { anotados.push(x); } },
    relogio: () => agora,
    dormir: async (ms: number) => { esperas.push(ms); agora += ms; },
    sorteio: () => p.sorteio ?? 0.5,
  };
  return {
    drenar: criarDrenarFilaDoNegocio(deps as never),
    rotina: criarEnviarFilaDeMensagens(deps as never),
    saidas, esperas, devolvidos, concluidos, anotados, pendentes,
    passar: (ms: number) => { agora += ms; },
  };
}

describe("a drenagem", () => {
  it("manda na ordem, uma de cada vez, com 3 a 7 s entre uma pessoa e outra", async () => {
    const a = ambiente({ fila: [envio({ para: "1" }), envio({ para: "2" }), envio({ para: "3" })], sorteio: 0.5 });
    const r = await a.drenar(t);

    expect(r).toEqual({ enviados: 3, adiados: 0, desistidos: 0 });
    expect(a.saidas.map((s) => s.para)).toEqual(["1", "2", "3"]);
    expect(a.esperas.length).toBeGreaterThanOrEqual(2);
    expect(a.esperas.every((ms) => ms >= 3_000 && ms <= 7_000)).toBe(true);
    expect(a.concluidos).toHaveLength(3);
  });

  it("o recibo ganha o desfecho do aviso quando ele sai", async () => {
    const a = ambiente({ fila: [envio({ origem: "recibo", recibo: { id: "rec1", desfechoAoEnviar: "enviado_ao_dono" } })] });
    await a.drenar(t);
    expect(a.anotados).toEqual([{ reciboId: "rec1", desfecho: "enviado_ao_dono" }]);
  });

  it("PDF: o link sai na hora, da nossa cópia; sem ela, o do canal enquanto vale; vencido, vai em texto", async () => {
    const legenda = "O recibo de agosto já foi emitido.";
    const a = ambiente({
      fila: [
        envio({ para: "copia", textos: [], documento: { caminho: "t1/1042.pdf", url: "https://s3/x", nomeDoArquivo: "r.pdf", legenda } }),
        envio({ para: "canal", textos: [], documento: { url: "https://s3/y", nomeDoArquivo: "r.pdf", legenda } }),
        envio({
          para: "vencido", textos: [], documento: { url: "https://s3/z", nomeDoArquivo: "r.pdf", legenda },
          criadoEm: new Date(T0 - 6 * 60_000).toISOString(),
        }),
      ],
    });
    await a.drenar(t);

    expect(a.saidas[0]).toMatchObject({ para: "copia", arquivo: "https://copia/t1/1042.pdf?vale=600" });
    expect(a.saidas[1]).toMatchObject({ para: "canal", arquivo: "https://s3/y" });
    expect(a.saidas[2]).toEqual(expect.objectContaining({ para: "vencido", textos: [legenda] }));
    expect(a.saidas[2].arquivo).toBeUndefined();
  });

  it("WhatsApp desconectado: devolve para a fila (não desiste) e para a rodada, que daria no mesmo", async () => {
    const a = ambiente({
      fila: [envio({ para: "1" }), envio({ para: "2" })],
      quebra: () => new PrecisaReconectar("instância fechada"),
    });
    const r = await a.drenar(t);

    expect(r).toEqual({ enviados: 0, adiados: 1, desistidos: 0 });
    expect(a.devolvidos).toEqual([expect.objectContaining({ desistir: false })]);
    expect(a.pendentes).toHaveLength(1);
  });

  it("falha que pode ter entregado: desiste na hora (mandar de novo seria em dobro), anota `falhou`, e a fila segue", async () => {
    const a = ambiente({
      fila: [
        envio({ para: "ruim", origem: "recibo", recibo: { id: "rec1", desfechoAoEnviar: "enviado" } }),
        envio({ para: "bom" }),
      ],
      quebra: (para) => (para === "ruim" ? new FalhaDoProvedor("Evolution 500") : null),
    });
    const r = await a.drenar(t);

    expect(r).toEqual({ enviados: 1, adiados: 0, desistidos: 1 });
    expect(a.devolvidos).toEqual([expect.objectContaining({ desistir: true })]);
    expect(a.anotados).toEqual([{ reciboId: "rec1", desfecho: "falhou" }]);
    expect(a.saidas.map((s) => s.para)).toEqual(["bom"]);
  });

  it("para no tempo da rodada e deixa o resto na fila", async () => {
    const a = ambiente({ fila: Array.from({ length: 80 }, (_, i) => envio({ para: String(i) })), sorteio: 1 });
    const r = await a.drenar(t);

    expect(r.enviados).toBeLessThan(80);
    expect(r.enviados).toBeGreaterThan(30);
    expect(a.esperas.reduce((x, y) => x + y, 0)).toBeLessThan(TEMPO_DA_RODADA_MS);
    expect(a.pendentes.length).toBe(80 - r.enviados);
  });
});

describe("a rotina", () => {
  it("esvazia todos os negócios, cada um no contexto de sistema dele", async () => {
    const a = ambiente({ fila: [envio({ tenantId: "t1", para: "1" }), envio({ tenantId: "t2", para: "2" })] });
    const r = await a.rotina(new Date(T0));

    expect(r.enviados).toBe(2);
    expect(a.saidas.map((s) => `${s.tenant}:${s.para}`).sort()).toEqual(["t1:1", "t2:2"]);
    expect(a.saidas.every((s) => s.ator === "sistema")).toBe(true);
  });
});
