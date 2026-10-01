/* ─────────────────────────────────────────────────────────────────────────────
 * G23 · O TEXTO DE DENTRO DO CAMPO É INSTRUÇÃO, NÃO DADO.
 *
 * Em 01/10/2026, numa call com o Bruno, a Regina foi cadastrar os recibos, viu "CRP 06/123456"
 * no campo do registro e achou que precisava apagar o CRP "que já estava lá". Na cor de texto
 * (`--muted`, 7,3:1), um exemplo realista é indistinguível de um valor preenchido. A varredura
 * achou o mesmo em todo canto: "000.000.000-00", "(11) 99999-9999", "Maria Silva",
 * "voce@exemplo.com", e oito bolinhas no campo de senha.
 *
 * A regra (emenda 6 do `maisa-design`), em duas partes que esta guarda cobra:
 *   1. termina em reticências: é uma instrução ("Escreva seu CRP aqui…"), não um exemplo;
 *   2. não tem cara de dado: nada de máscara ou número de exemplo (três dígitos seguidos, DDD
 *      entre parênteses, "06/123456"), e-mail de exemplo nem bolinha de senha.
 * A cor apagada (`--placeholder`) mora em `globals.css` e não é assunto daqui.
 *
 * Lê o atributo `placeholder` do JSX (literal, template e os dois lados de um ternário) e o
 * valor padrão de uma prop `placeholder`. Variável com nome de placeholder não conta: o
 * composer de Conversas monta a frase do campo travado, que é explicação, não instrução.
 * ────────────────────────────────────────────────────────────────────────────── */

import ts from "typescript";
import { describe, expect, it } from "vitest";
import { arquivosDe, arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, trechoDe, visitar, type Achado, type Divida } from "./fonte";

/** O que há de errado num texto de campo; `null` se ele obedece. `final` = é o último pedaço do texto. */
export function placeholderRuim(texto: string, final = true): string | null {
  const dado = texto.match(/\d{3,}|\(\d{2}\)|\d{2}\/\d|@exemplo|•{2,}/);
  if (dado) return `tem cara de dado (${dado[0]})`;
  if (final && !texto.trimEnd().endsWith("…")) return "não termina em reticências";
  return null;
}

/** Os textos que um inicializador de `placeholder` pode mostrar, com "é o último pedaço?". */
function textos(no: ts.Node, saida: { no: ts.Node; texto: string; final: boolean }[]): void {
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) saida.push({ no, texto: no.text, final: true });
  else if (ts.isTemplateExpression(no)) {
    saida.push({ no: no.head, texto: no.head.text, final: false });
    no.templateSpans.forEach((sp, i) => saida.push({ no: sp.literal, texto: sp.literal.text, final: i === no.templateSpans.length - 1 }));
  } else if (ts.isJsxExpression(no) && no.expression) textos(no.expression, saida);
  else if (ts.isParenthesizedExpression(no)) textos(no.expression, saida);
  else if (ts.isConditionalExpression(no)) { textos(no.whenTrue, saida); textos(no.whenFalse, saida); }
  else if (ts.isBinaryExpression(no) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(no.operatorToken.kind)) {
    textos(no.left, saida); textos(no.right, saida);
  }
}

/** O painel, as rotas de entrada e as que também pedem dado a quem chega (assinar, pagar, laboratório). */
const arquivos = () => [...arquivosDeTela(), ...["src/app/assinar", "src/app/pagar", "src/app/laboratorio"].flatMap(arquivosDe)];

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivos()) {
    const fonte = ler(arquivo);
    if (!fonte.includes("placeholder")) continue;
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      let inicial: ts.Node | undefined;
      if (ts.isJsxAttribute(no) && no.name.getText(sf) === "placeholder") inicial = no.initializer;
      else if (ts.isBindingElement(no) && no.name.getText(sf) === "placeholder") inicial = no.initializer;
      if (!inicial) return;
      const lista: { no: ts.Node; texto: string; final: boolean }[] = [];
      textos(inicial, lista);
      for (const t of lista) {
        const ruim = placeholderRuim(t.texto, t.final);
        if (!ruim) continue;
        const linha = linhaDe(sf, t.no);
        achados.push({ arquivo, linha, trecho: `${ruim}  ←  ${trechoDe(fonte, linha)}` });
      }
    });
  }
  return achados;
}

/** Zerada no dia em que nasceu (01/10/2026). */
const DIVIDA: Divida = {};

describe("G23 · o texto de dentro do campo é instrução, não dado", () => {
  it("todo placeholder termina em reticências e não imita um valor preenchido", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Placeholder com cara de campo preenchido: escreva uma instrução que termine em reticências (\"Escreva seu CRP aqui…\"). O que a pessoa precisa saber vai no rótulo.", problemas, achados)).toEqual([]);
  });

  it("a varredura acha os placeholders (senão a guarda passaria por não olhar nada)", () => {
    expect(arquivos()).toContain("src/ui/componentes/LigarNotaFiscal.tsx");
    const fonte = ler("src/ui/componentes/LigarNotaFiscal.tsx");
    expect(fonte).toContain("placeholder=");
  });

  it("o instrumento reconhece o defeito", () => {
    expect(placeholderRuim("CRP 06/123456")).toMatch(/cara de dado/);
    expect(placeholderRuim("000.000.000-00")).toMatch(/cara de dado/);
    expect(placeholderRuim("(11) 99999-9999")).toMatch(/cara de dado/);
    expect(placeholderRuim("voce@exemplo.com")).toMatch(/cara de dado/);
    expect(placeholderRuim("••••••••")).toMatch(/cara de dado/);
    expect(placeholderRuim("Maria Silva")).toBe("não termina em reticências");
    expect(placeholderRuim(" 00/000000", true)).toMatch(/cara de dado/);
    expect(placeholderRuim("Escreva seu ", false)).toBeNull();
    expect(placeholderRuim("Escreva seu CRP aqui…")).toBeNull();
    expect(placeholderRuim("Buscar cliente, conversa, serviço ou tela…")).toBeNull();
  });
});
