/* ─────────────────────────────────────────────────────────────────────────────
 * G8 · O RODAPÉ DA GAVETA TEM TETO, E O QUE APAGA PEDE DOIS TOQUES.
 *
 * Até 25/09/2026 o rodapé desenhava toda ação que a gaveta montava, numa linha só: o
 * atendimento de hoje com Meet tinha cinco, e a 390px três saíam da tela (o "Cancelar
 * atendimento" entre eles). "Cancelar nota" e "Excluir serviço" apagavam num toque. E
 * gaveta sem o que fazer ganhava um "Fechar" azul como primário (item T6 do backlog).
 *
 * O teto de verdade é o TIPO: `Detalhe.acoes` é `Rodape`, uma tupla de até dois, e o
 * `npm run typecheck` reprova o terceiro. Este teste guarda o resto, que o tipo não vê:
 *   · o tipo continua sendo tupla (alguém trocar para `Acao[]` desligaria o teto calado);
 *   · todo objeto com `tone: "danger"` em `detalhe.tsx` traz `confirmar`;
 *   · nenhuma ação chamada "Fechar" (o X do cabeçalho fecha);
 *   · o rodapé de `Gaveta.tsx` tem `flex-wrap:wrap`, a rede para rótulo longo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arvore, ler, linhaDe, visitar } from "./fonte";

const DETALHE = "src/ui/detalhe.tsx";
const GAVETA = "src/ui/componentes/Gaveta.tsx";

const nomeDa = (p: ts.ObjectLiteralElementLike, sf: ts.SourceFile) => p.name?.getText(sf);

/** Objetos literais de `detalhe.tsx` com `prop: "valor"` (string literal). */
function objetosCom(sf: ts.SourceFile, prop: string, valor: string): ts.ObjectLiteralExpression[] {
  const out: ts.ObjectLiteralExpression[] = [];
  visitar(sf, (no) => {
    if (!ts.isObjectLiteralExpression(no)) return;
    const p = no.properties.find((x) => ts.isPropertyAssignment(x) && nomeDa(x, sf) === prop);
    if (p && ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer) && p.initializer.text === valor) out.push(no);
  });
  return out;
}

describe("G8 · rodapé da gaveta", () => {
  it("`Detalhe.acoes` é a tupla `Rodape`, de até dois", () => {
    const sf = arvore(DETALHE);
    let rodape = "";
    let acoes = "";
    visitar(sf, (no) => {
      if (ts.isTypeAliasDeclaration(no) && no.name.text === "Rodape") rodape = no.type.getText(sf).replace(/\s+/g, " ");
      if (ts.isTypeAliasDeclaration(no) && no.name.text === "Detalhe") {
        visitar(no.type, (n) => { if (ts.isPropertySignature(n) && n.name.getText(sf) === "acoes") acoes = n.type?.getText(sf) ?? ""; });
      }
    });
    expect(rodape).toBe("readonly [] | readonly [Acao] | readonly [Acao, Acao]");
    expect(acoes).toBe("Rodape");
  });

  it("todo destrutivo traz `confirmar` (dois toques)", () => {
    const sf = arvore(DETALHE);
    // Só ações: o bloco `aviso` também tem `tone: "danger"` (a cor), e é identificado pelo `tipo`.
    const perigos = objetosCom(sf, "tone", "danger").filter((o) => !o.properties.some((p) => nomeDa(p, sf) === "tipo"));
    // Afere o instrumento: há destrutivos em detalhe.tsx (cancelar atendimento, excluir serviço…).
    expect(perigos.length, "não achei nenhum `tone: \"danger\"`: o guarda está olhando o vazio").toBeGreaterThanOrEqual(3);
    const sem = perigos
      .filter((o) => !o.properties.some((p) => nomeDa(p, sf) === "confirmar"))
      .map((o) => `${DETALHE}:${linhaDe(sf, o)}`);
    expect(sem, "ação destrutiva sem `confirmar`").toEqual([]);
  });

  it("nenhuma ação \"Fechar\": gaveta sem ação fica sem rodapé e fecha pelo X", () => {
    const sf = arvore(DETALHE);
    const fechar = objetosCom(sf, "label", "Fechar").map((o) => `${DETALHE}:${linhaDe(sf, o)}`);
    expect(fechar).toEqual([]);
    expect(ler(DETALHE)).not.toMatch(/\bfecharAcao\b/);
  });

  it("o rodapé da Gaveta quebra linha em vez de cortar", () => {
    const sf = arvore(GAVETA);
    let fonteDoRodape = "";
    visitar(sf, (no) => {
      if (ts.isFunctionDeclaration(no) && no.name?.text === "Rodape") fonteDoRodape = no.getText(sf);
    });
    expect(fonteDoRodape, "não achei `function Rodape` em Gaveta.tsx").not.toBe("");
    expect(fonteDoRodape).toContain("flex-wrap:wrap");
  });
});
