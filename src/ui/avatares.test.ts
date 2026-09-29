/* Os avatares (28/09/2026): a mesma pessoa sempre recebe o mesmo, o conjunto inteiro é usado, e
 * nenhum desenho traz o que o painel proíbe. */

import { describe, expect, it } from "vitest";
import { AVATARES, NOMES_DOS_AVATARES, avatarDe } from "./avatares";

describe("avatares", () => {
  it("são 15, na ordem que é contrato (acrescentar só no fim)", () => {
    expect(NOMES_DOS_AVATARES).toHaveLength(15);
    expect(NOMES_DOS_AVATARES[0]).toBe("abacate");
    expect(NOMES_DOS_AVATARES.at(-1)).toBe("xicara-de-cafe");
  });

  it("a mesma pessoa recebe sempre o mesmo avatar", () => {
    expect(avatarDe("cl1")).toBe(avatarDe("cl1"));
    expect(avatarDe("Seu Negócio")).toBe(avatarDe("Seu Negócio"));
  });

  it("espalha: 200 ids usam os 15 desenhos", () => {
    const usados = new Set(Array.from({ length: 200 }, (_, i) => avatarDe(`cl${i}`)));
    expect(usados.size).toBe(15);
  });

  it.each(NOMES_DOS_AVATARES)("%s é SVG chapado: sem gradiente, filtro, texto, imagem, opacidade ou script", (nome) => {
    const svg = AVATARES[nome];
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).not.toMatch(/gradient|filter|<text|<image|opacity|<script|on\w+=/i);
  });
});
