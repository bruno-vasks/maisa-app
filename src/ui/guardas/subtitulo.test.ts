/* ─────────────────────────────────────────────────────────────────────────────
 * G17 (a parte da casca) · A TELA TEM UM TÍTULO, NÃO TÍTULO + SUBTÍTULO.
 *
 * Até 24/09/2026 o mapa `TELA` de `AppShell.tsx` tinha um `sub` por tela, desenhado num `<p>`
 * embaixo do título da topbar. Eram justificativas de design ("Uma seção por vez — o preview
 * segue você"), com travessão, e uma delas mentia a data (`D.PERIODO`). Regra 3 do texto de
 * tela (emenda 5 do `maisa-design`, item T8 do backlog do front).
 *
 * A outra metade do G17, `SectionTitle` com `sub` numa lista fechada que encolhe, entra na
 * Onda 2 do backlog.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arvore, visitar } from "./fonte";

const CASCA = "src/ui/componentes/AppShell.tsx";

describe("G17 · a casca sem subtítulo", () => {
  it("o mapa TELA não tem `sub`", () => {
    const sf = arvore(CASCA);
    const comSub: string[] = [];
    let achouTela = false;
    visitar(sf, (no) => {
      if (!(ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.name.text === "TELA")) return;
      achouTela = true;
      if (no.type) visitar(no.type, (n) => { if (ts.isPropertySignature(n) && n.name.getText(sf) === "sub") comSub.push("(no tipo)"); });
      if (no.initializer && ts.isObjectLiteralExpression(no.initializer)) {
        for (const tela of no.initializer.properties) {
          if (!ts.isPropertyAssignment(tela) || !ts.isObjectLiteralExpression(tela.initializer)) continue;
          if (tela.initializer.properties.some((p) => p.name?.getText(sf) === "sub")) comSub.push(tela.name.getText(sf));
        }
      }
    });
    expect(achouTela, "não achei `const TELA` em AppShell.tsx: o guarda está protegendo o vazio").toBe(true);
    expect(comSub, "tela com subtítulo na topbar").toEqual([]);
  });

  it("a topbar não desenha <p>", () => {
    const sf = arvore(CASCA);
    const ps: number[] = [];
    visitar(sf, (no) => {
      if (ts.isFunctionDeclaration(no) && no.name?.text === "Topbar") {
        visitar(no, (n) => {
          if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === "p") ps.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
        });
      }
    });
    expect(ps, "linhas com <p> dentro da Topbar").toEqual([]);
  });
});
