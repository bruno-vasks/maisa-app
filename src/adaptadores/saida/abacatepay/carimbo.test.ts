/* O carimbo é de onde o webhook do pré-pago tira o inquilino. Ler errado é creditar o mês de
 * alguém na conta de outro; ler frouxo é aceitar checkout que não é da MAISA. */

import { describe, expect, it } from "vitest";
import { carimbo, lerCarimbo } from "./carimbo";

const T = "e53f6630-b266-435d-b777-7f0a99d94ce9";

describe("carimbo", () => {
  it("ida e volta", () => {
    expect(lerCarimbo(carimbo(T, "profissional", "2026-10-06"))).toEqual({ tenantId: T, plano: "profissional" });
    expect(lerCarimbo(carimbo(T, "essencial", "2026-10-06", 2))).toEqual({ tenantId: T, plano: "essencial" });
  });

  /* ★ Sem data, o mês seguinte devolveria o checkout já pago: o `externalId` é chave de
   * idempotência na AbacatePay (medido em 29/09/2026). */
  it("dias diferentes dão carimbos diferentes; o mesmo dia, o mesmo", () => {
    expect(carimbo(T, "profissional", "2026-10-06")).not.toBe(carimbo(T, "profissional", "2026-11-06"));
    expect(carimbo(T, "profissional", "2026-10-06")).toBe(carimbo(T, "profissional", "2026-10-06"));
    expect(carimbo(T, "profissional", "2026-10-06", 2)).not.toBe(carimbo(T, "profissional", "2026-10-06"));
  });

  it("recusa o que não é nosso", () => {
    for (const x of [null, "", "pedido-123", `outro:${T}:profissional:2026-10-06`, "maisa:nao-e-uuid:profissional:x",
      `maisa:${T}:premium:2026-10-06`, `maisa:${T}`]) {
      expect(lerCarimbo(x)).toBeNull();
    }
  });
});
