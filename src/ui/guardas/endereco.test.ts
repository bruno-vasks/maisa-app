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
import { APELIDOS_ETERNOS, FILTROS, SECOES, TELAS_DO_ENDERECO, escreverEndereco, filtroDoEndereco, idDoEndereco, lerEndereco, secaoDoEndereco, telaDoEndereco } from "../estado/endereco";
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
    expect(store).toContain("lerEndereco(window.location.search)");
    expect(store).toContain("escreverEndereco(window.location.search");
    expect(store).not.toMatch(/const\s+VALIDAS\s*:\s*TelaId\[\]/);
  });

  /* T9 (25/09/2026): a URL espelha o lugar, e o F5 volta para ele. */
  it("lê o lugar inteiro, e lixo cai no padrão sem levar o resto", () => {
    expect(lerEndereco("")).toBeNull();
    expect(lerEndereco("?tela=xyz&abrir=c1")).toBeNull(); // cai no Fluxo, e o abrir não vale sem tela
    expect(lerEndereco("?tela=faturamento")).toMatchObject({ tela: "faturamento", secao: null, abrir: null });
    expect(lerEndereco("?tela=fiscal&secao=autorizacao")).toMatchObject({ tela: "fiscal", secao: "autorizacao" });
    expect(lerEndereco("?tela=fiscal&secao=lixo")?.secao).toBe("inicio");
    expect(lerEndereco("?tela=conversas&conversa=cv12")?.conversa).toBe("cv12");
    expect(lerEndereco("?tela=agenda&conversa=cv12")?.conversa).toBeNull(); // conversa só em Conversas
    expect(lerEndereco("?tela=clientes&filtro=inativos")?.filtro).toBe("inativos");
    expect(lerEndereco("?tela=clientes&filtro=<script>")?.filtro).toBe("ativos");
    expect(lerEndereco("?tela=clientes&abrir=c-3")?.abrir).toBe("c-3");
    for (const lixo of ["<img>", "a b", "novo-2026-09-25-pr1-13", "x".repeat(81), "../../"]) {
      expect(idDoEndereco(lixo), lixo).toBeNull();
    }
  });

  it("escreve o lugar, sem padrão na URL e sem tocar no que não é dele", () => {
    const e = { tela: "fluxo" as const, secao: null, abrir: null, conversa: null, filtro: null };
    expect(escreverEndereco("", e)).toBe("");
    expect(escreverEndereco("?tela=agenda", e)).toBe("");
    expect(escreverEndereco("", { ...e, tela: "faturamento" })).toBe("?tela=faturamento");
    expect(escreverEndereco("", { ...e, tela: "fiscal", secao: "inicio" })).toBe("?tela=fiscal");
    expect(escreverEndereco("", { ...e, tela: "fiscal", secao: "dados" })).toBe("?tela=fiscal&secao=dados");
    expect(escreverEndereco("", { ...e, tela: "clientes", filtro: "ativos", abrir: "c1" })).toBe("?tela=clientes&abrir=c1");
    expect(escreverEndereco("", { ...e, tela: "agenda", abrir: "novo-2026-09-25-pr1-13" })).toBe("?tela=agenda");
    // `?pagamento=` e `?google=` são de outro efeito: passam, e quem os lê é que apaga.
    expect(escreverEndereco("?tela=mais&pagamento=recebido", { ...e, tela: "mais" })).toBe("?tela=mais&pagamento=recebido");
    expect(escreverEndereco("?google=ok&tela=agenda", { ...e, tela: "conversas", conversa: "cv9" })).toBe("?tela=conversas&conversa=cv9&google=ok");
  });

  it("ler o que se escreveu devolve o mesmo lugar (o F5)", () => {
    const lugares = [
      { tela: "agenda" as const, secao: null, abrir: "ag-1", conversa: null, filtro: null },
      { tela: "fiscal" as const, secao: "carne-leao", abrir: null, conversa: null, filtro: null },
      { tela: "conversas" as const, secao: null, abrir: null, conversa: "cv3", filtro: null },
      { tela: "clientes" as const, secao: null, abrir: "c7", conversa: null, filtro: "todos" },
    ];
    for (const l of lugares) {
      const lido = lerEndereco(escreverEndereco("", l))!;
      expect({ ...lido, secao: lido.secao === SECOES[l.tela]?.padrao ? null : lido.secao, filtro: lido.filtro === FILTROS[l.tela]?.padrao ? null : lido.filtro }, l.tela).toEqual(l);
    }
  });

  it("todo ?filtro= tem lista e padrão", () => {
    for (const [tela, regra] of Object.entries(FILTROS)) {
      expect(regra!.validos, tela).toContain(regra!.padrao);
      expect(filtroDoEndereco(tela as TelaId, "lixo")).toBe(regra!.padrao);
    }
    expect(filtroDoEndereco("fluxo", "ativos")).toBeNull();
  });
});
