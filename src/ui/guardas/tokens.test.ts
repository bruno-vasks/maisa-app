/* ─────────────────────────────────────────────────────────────────────────────
 * G4 · TODO `var(--x)` DA TELA EXISTE.
 *
 * `var(--t-xs)` estava em três lugares dos Ajustes (07 P2.3). O token não existe: o navegador
 * descarta a declaração em silêncio, o texto herda o tamanho do pai, e ninguém vê diferença
 * no dia em que escreve. O nome parecia certo porque o design system do site tem
 * `--text-xs`; o do app tem `--t-label`.
 *
 * Definido é: declarado em `src/app/globals.css` (qualquer bloco, inclusive `@media`),
 * publicado pelo `next/font` em `src/app/layout.tsx` (`variable: "--x"`), ou definido no
 * próprio arquivo (a propriedade local de um `style`, como `--i` ou `--len`). `var(--x, y)`
 * com valor de reserva é escolha consciente e passa.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

function definidosGlobais(): Set<string> {
  const nomes = new Set<string>();
  for (const m of ler("src/app/globals.css").matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) nomes.add(m[1]);
  for (const m of ler("src/app/layout.tsx").matchAll(/variable:\s*"(--[A-Za-z0-9-]+)"/g)) nomes.add(m[1]);
  return nomes;
}

/** `var(--x)` sem reserva, em texto de código (comentário não conta). */
export function usosSemReserva(texto: string): string[] {
  return [...texto.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)].map((m) => m[1]);
}

function varrer(globais: Set<string>): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!fonte.includes("var(--")) continue;
    const locais = new Set([...fonte.matchAll(/["'`;{\s](--[A-Za-z0-9-]+)["']?\s*:/g)].map((m) => m[1]));
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      const texto = textoDoNo(no);
      if (texto === null) return;
      for (const nome of usosSemReserva(texto)) {
        if (globais.has(nome) || locais.has(nome)) continue;
        const linha = linhaDe(sf, no);
        achados.push({ arquivo, linha, trecho: `${nome}  ←  ${trechoDe(fonte, linha)}` });
      }
    });
  }
  return achados;
}

/** Zerada em 24/09/2026 pelo 1B.3: `--t-xs` virou `--t-label`; `--dur`/`--ease` viraram `--dur-base`/`--ease-out`; `--brand` virou `--success`/`--primary`. */
const DIVIDA: Divida = {};

describe("G4 · token de CSS existe", () => {
  it("todo var(--x) do painel e das rotas de entrada está definido", () => {
    const achados = varrer(definidosGlobais());
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Token de CSS que não existe: o navegador descarta a declaração sem avisar.", problemas, achados)).toEqual([]);
  });

  it("o instrumento lê os tokens de verdade", () => {
    const g = definidosGlobais();
    expect(g.has("--t-label")).toBe(true);
    expect(g.has("--primary")).toBe(true);
    expect(g.has("--font-plex-sans")).toBe(true); // do next/font
    expect(g.has("--t-xs")).toBe(false);
    expect(usosSemReserva("font-size:var(--t-xs);color:var(--x, red)")).toEqual(["--t-xs"]);
  });
});
