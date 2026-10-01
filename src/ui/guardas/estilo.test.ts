/* ─────────────────────────────────────────────────────────────────────────────
 * G22 · CHAVE DE ESTILO NÃO VALE `undefined`.
 *
 * Em 01/10/2026 o Bruno colou a ficha de uma cliente: o "Marcar horário" encostava na borda de
 * baixo da gaveta, "parece até que o botão está um pouco cortado". Medido na bancada, o rodapé
 * tinha `padding: 14px 24px 0px` no desktop. O código pedia 18px embaixo:
 *
 *     ...s("padding:14px 24px 18px; …"),
 *     paddingBottom: mobile ? "max(16px, env(safe-area-inset-bottom))" : undefined,
 *
 * Para o React, chave com `undefined` não é "sem valor": ele grava `style.paddingBottom = ""`,
 * que APAGA o lado de baixo que o shorthand tinha posto. No celular o valor existia e tudo
 * parecia certo; o defeito só aparecia na largura em que ninguém olhava o ternário.
 *
 * A forma certa é a chave nem existir: `...(mobile ? { paddingBottom: "…" } : {})`.
 *
 * Varre objeto de estilo: o `style={{ … }}` do JSX e todo objeto que espalha `s(…)`. Reprova a
 * propriedade cujo valor é `undefined`/`null`, ou ternário com um dos lados `undefined`/`null`.
 * Mesmo sem shorthand no objeto hoje: o próximo que puser um `padding` ali não vai olhar.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, trechoDe, visitar, type Achado } from "./fonte";

const vazio = (e: ts.Expression): boolean => {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return (ts.isIdentifier(e) && e.text === "undefined") || e.kind === ts.SyntaxKind.NullKeyword;
};

const podeSerVazio = (e: ts.Expression): boolean => {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (vazio(e)) return true;
  return ts.isConditionalExpression(e) && (podeSerVazio(e.whenTrue) || podeSerVazio(e.whenFalse));
};

/** `style={{ … }}`, ou um objeto que espalha `s(…)`: é estilo, não importa onde mora. */
function eEstilo(o: ts.ObjectLiteralExpression): boolean {
  const pai = o.parent;
  if (pai && ts.isJsxExpression(pai) && pai.parent && ts.isJsxAttribute(pai.parent) && pai.parent.name.getText() === "style") return true;
  return o.properties.some((p) => ts.isSpreadAssignment(p) && ts.isCallExpression(p.expression) && p.expression.expression.getText() === "s");
}

export function chavesVazias(arquivo: string, fonte: string): { achados: Achado[]; objetos: number } {
  const sf = arvore(arquivo, fonte);
  const achados: Achado[] = [];
  let objetos = 0;
  visitar(sf, (no) => {
    if (!ts.isObjectLiteralExpression(no) || !eEstilo(no)) return;
    objetos++;
    for (const p of no.properties) {
      if (!ts.isPropertyAssignment(p) || !podeSerVazio(p.initializer)) continue;
      const linha = linhaDe(sf, p);
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    }
  });
  return { achados, objetos };
}

function varrer() {
  const achados: Achado[] = [];
  let objetos = 0;
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!/style=|\.\.\.s\(/.test(fonte)) continue;
    const r = chavesVazias(arquivo, fonte);
    achados.push(...r.achados);
    objetos += r.objetos;
  }
  return { achados, objetos };
}

describe("G22 · chave de estilo não vale `undefined`", () => {
  it("nenhum objeto de estilo das telas tem chave que pode ser `undefined` ou `null`", () => {
    const { achados } = varrer();
    const problemas = conferirDivida(achados, {});
    expect(problemas, relatorio("Chave de estilo que pode valer undefined: o React grava \"\" e apaga o shorthand. Use ...(cond ? { chave: valor } : {}).", problemas, achados)).toEqual([]);
  });

  it("o instrumento acha o defeito de 01/10/2026 e deixa passar a forma certa", () => {
    const velho = `const pad = { ...s("padding:14px 24px 18px"), paddingBottom: mobile ? "16px" : undefined };`;
    expect(chavesVazias("x.tsx", velho).achados).toHaveLength(1);
    expect(chavesVazias("x.tsx", `const x = <div style={{ top: a ? (b ? 1 : null) : 2 }} />;`).achados).toHaveLength(1);
    expect(chavesVazias("x.tsx", `const pad = { ...s("padding:0"), ...(mobile ? { paddingBottom: "16px" } : {}) };`).achados).toEqual([]);
    /* Objeto que não é estilo pode ter `undefined` à vontade: é dado. */
    expect(chavesVazias("x.tsx", `const d = { mais: zap ? [zap] : undefined };`).achados).toEqual([]);
  });

  it("a varredura enxerga os objetos de estilo do painel", () => {
    // Centenas hoje. Se cair para perto de zero, o detector parou de reconhecer estilo e o
    // primeiro teste ficaria verde para sempre.
    expect(varrer().objetos).toBeGreaterThan(100);
  });
});
