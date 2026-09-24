/* ─────────────────────────────────────────────────────────────────────────────
 * G10 · O ENDEREÇO É VÁLIDO: toda tela abre por link, todo apelido também, lixo cai no padrão.
 *
 * `?tela=` é o link que a gente manda no WhatsApp e a volta do checkout. Tela nova que entra no
 * mapa `TELA` da casca e esquece a lista do endereço fica inalcançável por link, em silêncio:
 * o valor é ignorado e a pessoa cai no Fluxo de hoje. Apelido que some quebra link já mandado.
 * Valor que passa sem validação deixa o painel branco. Ver `src/ui/estado/endereco.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arvore, ler, visitar } from "./fonte";
import { APELIDOS_ETERNOS, SECOES, TELAS_DO_ENDERECO, secaoDoEndereco, telaDoEndereco } from "../estado/endereco";
import type { TelaId } from "../estado/store";

/** As chaves do mapa `TELA` de `AppShell.tsx`, lidas da fonte. */
function telasDaCasca(): string[] {
  const sf = arvore("src/ui/componentes/AppShell.tsx");
  const chaves: string[] = [];
  visitar(sf, (no) => {
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.name.text === "TELA" && no.initializer && ts.isObjectLiteralExpression(no.initializer)) {
      for (const p of no.initializer.properties) if (p.name && ts.isIdentifier(p.name)) chaves.push(p.name.text);
    }
  });
  return chaves;
}

/** Os membros do tipo `TelaId`, lidos da fonte do store. */
function membrosDeTelaId(): string[] {
  const sf = arvore("src/ui/estado/store.tsx");
  const membros: string[] = [];
  visitar(sf, (no) => {
    if (ts.isTypeAliasDeclaration(no) && no.name.text === "TelaId") {
      visitar(no.type, (n) => { if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) membros.push(n.literal.text); });
    }
  });
  return membros;
}

describe("G10 · endereço válido", () => {
  it("toda tela do mapa TELA abre pelo ?tela=", () => {
    const casca = telasDaCasca();
    expect(casca.length).toBeGreaterThan(8);
    expect(casca.filter((t) => telaDoEndereco(t) === null)).toEqual([]);
  });

  it("todo membro de TelaId abre pelo ?tela=, e a lista não inventa tela", () => {
    const membros = membrosDeTelaId();
    expect([...membros].sort()).toEqual([...TELAS_DO_ENDERECO].sort());
  });

  it("os apelidos que já saíram em link continuam abrindo", () => {
    for (const apelido of APELIDOS_ETERNOS) expect(telaDoEndereco(apelido), apelido).not.toBeNull();
    expect(telaDoEndereco("faturamento")).toBe("faturamento");
  });

  it("valor inválido não vira tela", () => {
    for (const lixo of ["xyz", "", null, undefined, "Fluxo", "__proto__", "constructor", "toString", " fluxo", "fluxo "]) {
      expect(telaDoEndereco(lixo as string | null | undefined), String(lixo)).toBeNull();
    }
  });

  it("toda ?secao= tem lista e padrão, e lixo cai no padrão", () => {
    for (const [tela, regra] of Object.entries(SECOES)) {
      expect(regra!.validas, tela).toContain(regra!.padrao);
      expect(secaoDoEndereco(tela as TelaId, "lixo"), tela).toBe(regra!.padrao);
      for (const v of regra!.validas) expect(secaoDoEndereco(tela as TelaId, v)).toBe(v);
    }
    expect(secaoDoEndereco("fluxo", "qualquer")).toBeNull(); // tela sem seções
  });

  it("o store valida pelo endereco.ts, e não por uma lista própria", () => {
    const store = ler("src/ui/estado/store.tsx");
    expect(store).toContain("telaDoEndereco(");
    expect(store).not.toMatch(/const\s+VALIDAS\s*:\s*TelaId\[\]/);
  });
});
