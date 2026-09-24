/* ─────────────────────────────────────────────────────────────────────────────
 * G5 · O ÍCONE PEDIDO EXISTE, E NINGUÉM GANHA UM SPARKLE POR ACASO.
 *
 * `Icon` (primitivos.tsx) desenhava `ICONS.sparkle` quando o nome não estava no registro. O
 * login pede `name="lock"`, que nunca existiu: a tela de entrada mostrava uma estrelinha de
 * "IA" no lugar do cadeado, e nada avisava. Era também o que fazia o `EmptyState` sem `icon`
 * nascer com sparkle, o carimbo de template que a auditoria de 24/09/2026 pediu para tirar.
 *
 * Confere todo nome LITERAL passado a `<Icon name=…>` e a qualquer prop `icon`/`icone` (é por
 * elas que `Btn`, `IconBtn`, `EmptyState`, o mapa `TELA` e a Paleta chegam ao `Icon`).
 * Nome montado em runtime não é conferível por fonte e fica de fora.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, trechoDe, visitar, type Achado, type Divida } from "./fonte";

function registro(): Set<string> {
  const sf = arvore("src/ui/primitivos.tsx");
  const nomes = new Set<string>();
  visitar(sf, (no) => {
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.name.text === "ICONS" && no.initializer && ts.isObjectLiteralExpression(no.initializer)) {
      for (const p of no.initializer.properties) {
        if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) nomes.add(p.name.text);
      }
    }
  });
  return nomes;
}

const literaisEm = (no: ts.Node): ts.StringLiteral[] => {
  const out: ts.StringLiteral[] = [];
  visitar(no, (n) => { if (ts.isStringLiteral(n)) out.push(n); });
  return out;
};

/** Os nomes de ícone pedidos no arquivo, cada um com o nó onde está. */
function pedidos(sf: ts.SourceFile): ts.StringLiteral[] {
  const out: ts.StringLiteral[] = [];
  visitar(sf, (no) => {
    if (ts.isJsxAttribute(no) && no.initializer && ts.isIdentifier(no.name)) {
      const attr = no.name.text;
      const el = no.parent.parent; // JsxAttributes → elemento
      const tag = ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el) ? el.tagName.getText(sf) : "";
      // Condicionais (`on ? "a" : "b"`) entram; comparações (`x === "y" ? …`) não pedem ícone.
      const alvos = literaisEm(no.initializer).filter((l) => !ts.isBinaryExpression(l.parent));
      if ((attr === "name" && tag === "Icon") || attr === "icon" || attr === "icone") out.push(...alvos);
    }
    if (ts.isPropertyAssignment(no) && ts.isIdentifier(no.name) && (no.name.text === "icone" || no.name.text === "icon")) {
      out.push(...literaisEm(no.initializer).filter((l) => !ts.isBinaryExpression(l.parent)));
    }
  });
  return out;
}

function varrer(nomes: Set<string>): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!/\bicone?\b|<Icon\b/.test(fonte)) continue;
    const sf = arvore(arquivo, fonte);
    for (const l of pedidos(sf)) {
      if (nomes.has(l.text)) continue;
      const linha = linhaDe(sf, l);
      achados.push({ arquivo, linha, trecho: `"${l.text}"  ←  ${trechoDe(fonte, linha)}` });
    }
  }
  return achados;
}

/** 24/09/2026. `lock` nunca existiu; paga o 3.4 (CTA de entrar sem ícone) ou o registro ganha o cadeado. */
const DIVIDA: Divida = {
  "src/app/login/page.tsx": [1, "24/09/2026 · `lock` no botão Entrar; o 3.4 tira o ícone do CTA (09 P2-3)"],
};

describe("G5 · ícone existe", () => {
  it("todo nome de ícone literal está no registro ICONS", () => {
    const achados = varrer(registro());
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Ícone que não existe no registro: o `Icon` desenha outra coisa no lugar.", problemas, achados)).toEqual([]);
  });

  it("o instrumento lê o registro e acha os pedidos", () => {
    const nomes = registro();
    expect(nomes.size).toBeGreaterThan(40);
    expect(nomes.has("calendar")).toBe(true);
    const sf = arvore("amostra.tsx", [
      '<Icon name="lock" size={16} />;',
      '<Btn icon={on ? "check" : "cadeado"} />;',
      'const t = { icone: "flow" };',
      '<Icon name={x === "a" ? "check" : "x"} />;',
    ].join("\n"));
    expect(pedidos(sf).map((l) => l.text)).toEqual(["lock", "check", "cadeado", "flow", "check", "x"]);
  });
});
