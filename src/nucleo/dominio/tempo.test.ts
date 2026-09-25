import { describe, expect, it } from "vitest";
import { rotuloDaCompetencia, rotuloDoMes } from "./tempo";

describe("rotuloDoMes", () => {
  it("dia ou mês ISO viram o mês por extenso", () => {
    expect(rotuloDoMes("2026-09-24")).toBe("setembro de 2026");
    expect(rotuloDoMes("2026-01")).toBe("janeiro de 2026");
    expect(rotuloDoMes("2026-12-31")).toBe("dezembro de 2026");
  });
});

describe("rotuloDaCompetencia", () => {
  it("sem competência do servidor, o mês de hoje", () => {
    expect(rotuloDaCompetencia([], "2026-09-24")).toBe("setembro de 2026");
    expect(rotuloDaCompetencia(["", "lixo"], "2026-09-24")).toBe("setembro de 2026");
  });
  it("uma competência só manda, mesmo que não seja o mês de hoje", () => {
    expect(rotuloDaCompetencia(["2026-08-01", "2026-08-01"], "2026-09-24")).toBe("agosto de 2026");
  });
  it("duas competências: do primeiro ao último mês", () => {
    expect(rotuloDaCompetencia(["2026-09-01", "2026-08-01"], "2026-09-24")).toBe("agosto a setembro de 2026");
    expect(rotuloDaCompetencia(["2025-12-01", "2026-01-01"], "2026-01-10")).toBe("dezembro de 2025 a janeiro de 2026");
  });
});
