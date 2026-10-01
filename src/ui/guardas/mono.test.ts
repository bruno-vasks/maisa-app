/* ─────────────────────────────────────────────────────────────────────────────
 * G21 · SEM FONTE MONOESPAÇADA.
 *
 * Em 30/09/2026 o Bruno colou o cartão do plano do `/assinar` ("R$ 197/mês", "700/mês",
 * "R$ 0,28") e disse: "essa fonte é o maior slop de todos, não vamos usar essa fonte mais". Era
 * a IBM Plex Mono no app e a JetBrains Mono na LP de terapeutas, nos valores e códigos.
 *
 * O que a mono fazia de útil era alinhar dígito em coluna. `font-variant-numeric:
 * tabular-nums` faz o mesmo na fonte do texto, e é o que entrou no lugar dela.
 *
 * Reprova o NOME das famílias monoespaçadas e do token `--font-mono` em tela, CSS e LP. A LP de
 * terapeutas guarda o nome `--font-mono` no `typography.css` dela, apontado para a Figtree, para
 * não reescrever 58 marcações: por isso o HTML dela pode usar `var(--font-mono)`, e é o
 * `typography.css` que este teste confere.
 *
 * `src/ds/` fica de fora: é o design system vendorado (`VENDORED.md`, "não edite à mão") e
 * nenhuma tela o usa hoje.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { RAIZ, arquivosDeTela, ler, rel } from "./fonte";

const FAMILIA = /monospace|JetBrains|Plex[ _]?Mono|SFMono|SF Mono|\bMenlo\b|ui-monospace|font-plex-mono|font-ds-mono/i;
const TOKEN_DO_APP = /var\(--font-mono\)/;

function arquivos(dir: string, exts: string[]): string[] {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((nome) => {
    const p = join(abs, nome);
    if (statSync(p).isDirectory()) return nome === "node_modules" ? [] : arquivos(join(dir, nome), exts);
    return exts.some((e) => nome.endsWith(e)) ? [rel(p)] : [];
  });
}

/**
 * Comentário que CONTA a história ("era IBM Plex Mono até…") não carrega fonte nenhuma. Sai
 * inteiro, de várias linhas inclusive, trocado pelas mesmas quebras: o número da linha do
 * achado continua batendo com o arquivo.
 */
function semComentario(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, " ");
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/<!--[\s\S]*?-->/g, vazio)
    .replace(/(^|[^:"'])\/\/.*$/gm, (m, antes: string) => antes + vazio(m.slice(antes.length)));
}

function achados(): string[] {
  const telas = arquivosDeTela().filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
  const css = arquivos("src", [".css"]).filter((f) => !f.startsWith("src/ds/"));
  const lp = arquivos("lp", [".css", ".html"]);
  const fora: string[] = [];

  for (const f of [...new Set([...telas, ...css, "src/app/layout.tsx"])]) {
    semComentario(ler(f)).split("\n").forEach((linha, i) => {
      if (FAMILIA.test(linha) || TOKEN_DO_APP.test(linha)) fora.push(`${f}:${i + 1}  ${linha.trim().slice(0, 100)}`);
    });
  }
  for (const f of lp) {
    semComentario(ler(f)).split("\n").forEach((linha, i) => {
      if (FAMILIA.test(linha)) fora.push(`${f}:${i + 1}  ${linha.trim().slice(0, 100)}`);
    });
  }
  return fora;
}

describe("G21 · sem fonte monoespaçada", () => {
  it("nenhuma tela, CSS ou LP usa família mono", () => {
    expect(achados()).toEqual([]);
  });

  it("o token `--font-mono` da LP de terapeutas aponta para a Figtree", () => {
    const tipo = ler("lp/terapeutas/_ds/tokens/typography.css");
    expect(tipo).toMatch(/--font-mono:\s*'Figtree'/);
  });
});
