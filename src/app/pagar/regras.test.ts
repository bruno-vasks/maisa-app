import { describe, expect, it } from "vitest";
import { destinoDaVolta, horaQueVence, voltaSegura } from "./regras";

describe("/pagar — a volta", () => {
  it("aceita caminho deste app", () => {
    expect(voltaSegura("/comecar?pagamento=recebido")).toBe("/comecar?pagamento=recebido");
    expect(voltaSegura("/?tela=mais&pagamento=recebido")).toBe("/?tela=mais&pagamento=recebido");
  });

  /* ★ Redirecionamento aberto: a pessoa acabou de pagar, está logada, e o link sairia daqui. */
  it("recusa tudo que sai do app", () => {
    for (const v of ["https://golpe.com", "//golpe.com", "/\\golpe.com", "javascript:alert(1)", "", null]) {
      expect(voltaSegura(v)).toBe("/?tela=mais");
    }
  });

  it("o funil volta para o onboarding; o resto, para o plano", () => {
    expect(destinoDaVolta("/comecar?pagamento=recebido")).toBe("onboarding");
    expect(destinoDaVolta("/?tela=mais")).toBe("painel");
  });

  it("hora que vence: torta vira null", () => {
    expect(horaQueVence(null)).toBeNull();
    expect(horaQueVence("ontem")).toBeNull();
    expect(horaQueVence("2026-10-01T03:04:46.492Z")).toMatch(/00:04$/);
  });
});
