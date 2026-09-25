/* ─────────────────────────────────────────────────────────────────────────────
 * G13 · O WIZARD NÃO IMPORTA COMPONENTE DO PAINEL.
 *
 * O `/comecar` roda FORA do `StoreProvider`: ele existe antes de o negócio existir. Um
 * componente que chama `useStore()` montado ali lança na hora do clique, e a página inteira
 * cai. Foi o "Ligar agora" da etapa 5 (09 P0-1): o wizard importou `LigarNotaFiscal`, que lê
 * o store, e quem tocava no botão via a tela branca. E é o risco de levar
 * `DeQuemEEsseNumero` para o wizard como está (1A.15), em vez de extrair a peça sem store.
 *
 * Segue os imports a partir de `src/app/comecar/` (relativos e `@/…`, menos `import type`,
 * que some na compilação) e reprova todo arquivo alcançado que chame `useStore(`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "typescript";
import { RAIZ, arquivosDe, arvore, ler, linhaDe, trechoDe, visitar } from "./fonte";

/** Resolve o especificador para um arquivo do repositório, ou `null` se for pacote. */
function resolver(de: string, espec: string): string | null {
  let base: string;
  if (espec.startsWith("@/")) base = join("src", espec.slice(2));
  else if (espec.startsWith(".")) base = normalize(join(dirname(de), espec));
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    const abs = join(RAIZ, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c.split("\\").join("/");
  }
  return null;
}

/** Imports de valor do arquivo (os `import type` e `export type` saem: não chegam ao bundle). */
function importsDeValor(arquivo: string): string[] {
  const sf = arvore(arquivo);
  const out: string[] = [];
  visitar(sf, (no) => {
    if ((ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) && no.moduleSpecifier && ts.isStringLiteral(no.moduleSpecifier)) {
      const soTipo = ts.isImportDeclaration(no) ? !!no.importClause?.isTypeOnly : no.isTypeOnly;
      if (soTipo) return;
      const alvo = resolver(arquivo, no.moduleSpecifier.text);
      if (alvo) out.push(alvo);
    }
  });
  return out;
}

/** Todo arquivo alcançado a partir do wizard. */
function alcancados(): string[] {
  const vistos = new Set<string>();
  const fila = arquivosDe("src/app/comecar");
  while (fila.length) {
    const f = fila.shift()!;
    if (vistos.has(f)) continue;
    vistos.add(f);
    fila.push(...importsDeValor(f));
  }
  return [...vistos].sort();
}

/** Quem chama `useStore(` (a definição no próprio store também conta: importar o store é importar o contexto). */
function chamaUseStore(arquivo: string): number | null {
  const sf = arvore(arquivo);
  let linha: number | null = null;
  visitar(sf, (no) => {
    if (linha === null && ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === "useStore") linha = linhaDe(sf, no);
  });
  return linha;
}

/** Arquivo → motivo e data. Fechada: sai quando o wizard deixar de importar o arquivo, ou ele deixar de ler o store. */
/* Vazia desde 25/09/2026 (1B.14): a etapa 5 navega para /?tela=fiscal em vez de montar o
 * `LigarNotaFiscal`, que era a única entrada. */
const DIVIDA: Record<string, string> = {};

describe("G13 · wizard sem componente do painel", () => {
  it("nenhum arquivo alcançado pelo /comecar chama useStore(), fora da dívida", () => {
    const ruins = alcancados()
      .map((f) => ({ f, linha: chamaUseStore(f) }))
      .filter((x) => x.linha !== null);
    const novos = ruins.filter((x) => !(x.f in DIVIDA)).map((x) => `${x.f}:${x.linha}  ${trechoDe(ler(x.f), x.linha!)}`);
    const pagos = Object.keys(DIVIDA).filter((f) => !ruins.some((x) => x.f === f)).map((f) => `${f}: não é mais alcançado ou não lê o store. Tire da lista.`);
    expect([...novos, ...pagos], "O /comecar roda fora do StoreProvider: componente que chama useStore() derruba a página no clique.").toEqual([]);
  });

  it("o instrumento segue os imports de verdade", () => {
    const a = alcancados();
    expect(a).toContain("src/app/comecar/Comecar.tsx");
    expect(a).toContain("src/ui/primitivos.tsx"); // via @/ui/primitivos
    expect(a).toContain("src/ui/componentes/Pareamento.tsx");
    expect(chamaUseStore("src/ui/componentes/AppShell.tsx")).not.toBeNull();
    expect(chamaUseStore("src/ui/primitivos.tsx")).toBeNull();
  });
});
