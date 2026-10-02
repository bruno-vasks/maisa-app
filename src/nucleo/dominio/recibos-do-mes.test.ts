import { describe, expect, it } from "vitest";
import { descricaoDasSessoes, juntarEmRecibos, recibosPorMesValido } from "./recibos-do-mes";

const s = (id: string, data: string, over: Partial<{ clienteId: string | null; cpf: string | null; cpfPagador: string | null }> = {}) => ({
  id, data, clienteId: "ana", cpf: "52998224725", cpfPagador: null, ...over,
});
const ids = (g: { id: string }[][]) => g.map((x) => x.map((y) => y.id));

describe("juntar sessões em recibos", () => {
  /* O padrão do Bruno: cada paciente, um recibo por mês. */
  it("um por mês junta as sessões do mês, em ordem de data", () => {
    const r = juntarEmRecibos([s("c", "2026-09-23"), s("a", "2026-09-02"), s("b", "2026-09-16")], () => 1);
    expect(ids(r)).toEqual([["a", "b", "c"]]);
  });

  it("um por sessão separa todas", () => {
    expect(ids(juntarEmRecibos([s("a", "2026-09-02"), s("b", "2026-09-09")], () => 0))).toEqual([["a"], ["b"]]);
  });

  /* Quem paga a cada quinze dias. Cinco sessões em dois: 3 e 2, os primeiros levam a sobra. */
  it("dois por mês divide em metades, em ordem de data", () => {
    const r = juntarEmRecibos(["01", "08", "15", "22", "29"].map((d) => s(d, `2026-09-${d}`)), () => 2);
    expect(ids(r)).toEqual([["01", "08", "15"], ["22", "29"]]);
  });

  it("pedir mais recibos que sessões dá um por sessão", () => {
    expect(ids(juntarEmRecibos([s("a", "2026-09-02"), s("b", "2026-09-09")], () => 4))).toEqual([["a"], ["b"]]);
  });

  /* A renda entra no Carnê-Leão pelo mês do pagamento. */
  it("nunca junta meses diferentes", () => {
    expect(ids(juntarEmRecibos([s("set", "2026-09-30"), s("out", "2026-10-01")], () => 1))).toEqual([["set"], ["out"]]);
  });

  it("nunca junta pessoas diferentes, nem outro pagador", () => {
    const r = juntarEmRecibos([
      s("ana", "2026-09-02"),
      s("bia", "2026-09-03", { clienteId: "bia", cpf: "11144477735" }),
      s("ana-mae", "2026-09-09", { cpfPagador: "12345678909" }),
    ], () => 1);
    expect(ids(r)).toEqual([["ana"], ["bia"], ["ana-mae"]]);
  });

  /* Sem ficha, juntar por nome juntaria duas Anas. */
  it("pagamento sem ficha fica sozinho", () => {
    const r = juntarEmRecibos([s("x", "2026-09-02", { clienteId: null }), s("y", "2026-09-03", { clienteId: null })], () => 1);
    expect(ids(r)).toEqual([["x"], ["y"]]);
  });

  it("cada pessoa com a sua escolha", () => {
    const r = juntarEmRecibos([
      s("a1", "2026-09-02"), s("a2", "2026-09-09"),
      s("b1", "2026-09-03", { clienteId: "bia", cpf: "11144477735" }), s("b2", "2026-09-10", { clienteId: "bia", cpf: "11144477735" }),
    ], (id) => (id === "ana" ? 1 : 0));
    expect(ids(r)).toEqual([["a1", "a2"], ["b1"], ["b2"]]);
  });
});

describe("a descrição do recibo", () => {
  it("uma sessão, como era", () => {
    expect(descricaoDasSessoes(["2026-09-16"])).toBe("Atendimento realizado em 16/09/2026");
  });
  it("várias, só as datas", () => {
    expect(descricaoDasSessoes(["2026-09-16", "2026-09-02", "2026-09-09"])).toBe("Atendimentos realizados em 02/09, 09/09 e 16/09/2026");
  });
  it("31 sessões cabem no teto de 255 da Receita", () => {
    const datas = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    expect(descricaoDasSessoes(datas).length).toBeLessThanOrEqual(255);
  });
});

describe("as escolhas da ficha", () => {
  it("1 a 4 e um por sessão", () => {
    for (const v of [0, 1, 2, 3, 4]) expect(recibosPorMesValido(v)).toBe(true);
    for (const v of [5, -1, 1.5, "1", null]) expect(recibosPorMesValido(v)).toBe(false);
  });
});
