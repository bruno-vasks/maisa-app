import { describe, expect, it } from "vitest";
import { contaTemWhatsapp, whatsappDaConta } from "./whatsapp-da-conta";

describe("whatsappDaConta", () => {
  it.each([
    ["(11) 94447-0703", "11944470703"],
    ["11 4447-0703", "1144470703"],
    ["+55 11 94447-0703", "5511944470703"],
    ["15988350959", "15988350959"],
  ])("%s vira %s", (bruto, esperado) => {
    expect(whatsappDaConta(bruto)).toBe(esperado);
  });

  /* Sem DDD não se chama ninguém: os 8 e 9 dígitos que o `/assinar` aceitava não servem aqui. */
  it.each(["94447-0703", "4447-0703", "", "abc", "55119444707031"])("%j não serve", (bruto) => {
    expect(whatsappDaConta(bruto)).toBeNull();
  });

  it("ignora o que não é texto nem número", () => {
    expect(whatsappDaConta(null)).toBeNull();
    expect(whatsappDaConta(undefined)).toBeNull();
    expect(whatsappDaConta({ telefone: "11944470703" })).toBeNull();
  });
});

describe("contaTemWhatsapp", () => {
  it("conta do /assinar, com o telefone no metadata, passa", () => {
    expect(contaTemWhatsapp({ email: "a@b.com", telefone: "11944470703", plano: "essencial" })).toBe(true);
  });

  /* O caso de 30/10/2026: cadastro direto, metadata só com e-mail. */
  it("conta do /cadastro sem telefone não passa", () => {
    expect(contaTemWhatsapp({ email: "a@b.com", email_verified: true, sub: "x" })).toBe(false);
  });

  it("conta do Google, com nome e foto mas sem telefone, não passa", () => {
    expect(contaTemWhatsapp({ full_name: "Fulana", avatar_url: "https://x", iss: "https://accounts.google.com" })).toBe(false);
  });

  it("metadata vazio ou ausente não passa", () => {
    expect(contaTemWhatsapp({})).toBe(false);
    expect(contaTemWhatsapp(null)).toBe(false);
    expect(contaTemWhatsapp(undefined)).toBe(false);
  });
});
