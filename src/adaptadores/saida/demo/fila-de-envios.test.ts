/* O dublê da fila de envios segue as regras da 036: uma por vez por negócio, espaço desde a
 * última que saiu, reserva vencida volta a valer, conteúdo apagado quando sai, e um negócio não
 * enxerga a fila do outro. Se ele divergir do banco, os testes que o usam mentem. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { atorAgente } from "@/nucleo/dominio/tenant";

import { filaDeEnviosDemo as fila } from "./fila-de-envios";

const ctx = (tenantId: string): ContextoTenant => ({ tenantId, usuarioId: "", ator: atorAgente("teste") });
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T15:00:00-03:00"));
});
afterEach(() => vi.useRealTimers());

describe("a fila de envios em memória", () => {
  it("uma por vez por negócio, com espaço desde a última que saiu; outro negócio não espera", async () => {
    const a = ctx(`demo-a-${++n}`);
    const b = ctx(`demo-b-${n}`);
    await fila.enfileirar(a, [
      { para: "1", textos: ["um"], origem: "lote_de_recibos" },
      { para: "2", textos: ["dois"], origem: "lote_de_recibos" },
    ]);
    await fila.enfileirar(b, [{ para: "9", textos: ["nove"], origem: "lote_de_recibos" }]);

    const primeira = await fila.reservar(a, 3_000);
    expect(primeira?.para).toBe("1");
    expect(await fila.reservar(a, 3_000)).toBeNull();
    expect((await fila.reservar(b, 3_000))?.para).toBe("9");

    await fila.concluir(a, primeira!.id);
    expect(await fila.reservar(a, 3_000)).toBeNull();
    vi.advanceTimersByTime(3_100);
    expect((await fila.reservar(a, 3_000))?.para).toBe("2");
  });

  it("reserva de mais de 10 minutos é de execução que morreu, e volta a valer", async () => {
    const a = ctx(`demo-c-${++n}`);
    await fila.enfileirar(a, [{ para: "1", textos: ["um"], origem: "recibo" }]);
    const presa = await fila.reservar(a, 3_000);
    vi.advanceTimersByTime(11 * 60_000);
    const solta = await fila.reservar(a, 3_000);
    expect(solta?.id).toBe(presa?.id);
    expect(solta?.tentativas).toBe(2);
  });

  it("devolver: passageira volta mais tarde; ambígua desiste na hora", async () => {
    const a = ctx(`demo-d-${++n}`);
    await fila.enfileirar(a, [{ para: "1", textos: ["um"], origem: "recibo" }]);
    const e = await fila.reservar(a, 3_000);
    expect(await fila.devolver(a, e!.id, { erro: "503", desistir: false })).toEqual({ desistiu: false });
    expect(await fila.reservar(a, 3_000)).toBeNull();
    vi.advanceTimersByTime(2 * 60_000 + 1);
    const de_novo = await fila.reservar(a, 3_000);
    expect(de_novo?.id).toBe(e!.id);
    expect(await fila.devolver(a, de_novo!.id, { erro: "timeout", desistir: true })).toEqual({ desistiu: true });
    expect(await fila.negociosComEnvio()).not.toContain(a.tenantId);
  });
});
