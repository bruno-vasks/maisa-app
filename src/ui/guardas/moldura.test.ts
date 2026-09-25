/* ─────────────────────────────────────────────────────────────────────────────
 * G15 · MOLDURA SEM CORTE.
 *
 * A tabela do fechamento do CNPJ mostrava 8 de 16 clientes e não rolava (06 P0-1): o invólucro
 * da `Tabela` tinha `overflow:hidden` e era filho flex de uma coluna que rolava. Item flex com
 * `overflow:hidden` tem altura mínima 0, então encolhe até caber e esconde o resto, sem barra.
 *
 * Esta guarda cobra três coisas da fonte:
 *   1. as regras `.m-moldura*`, `.m-tabela-rola` e `.m-tabela-corpo` de `globals.css` não têm
 *      `overflow: hidden` nem `clip` (nem dentro do @media do celular);
 *   2. `Moldura.tsx` e a função `Tabela` de `primitivos.tsx` não escrevem `overflow:hidden`;
 *   3. as telas que ainda usam `TelaGrade` (a moldura antiga, que só rola) estão numa lista
 *      fechada que só encolhe. Tela nova usa `Moldura`.
 *
 * Layout não se prova aqui: a bancada (`scripts/bancada/medir.mjs`, "corte") é quem mede.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

const CORTA = /overflow(-[xy])?\s*:\s*(hidden|clip)/;

/** As regras de `globals.css` cujo seletor fala da moldura ou da tabela que rola. */
function regrasDaMoldura(css: string): { seletor: string; corpo: string }[] {
  const sem = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { seletor: string; corpo: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sem))) {
    const seletor = m[1].trim();
    if (/\.m-(moldura|tabela-rola|tabela-corpo)/.test(seletor)) out.push({ seletor, corpo: m[2] });
  }
  return out;
}

/** Literais de `arquivo` (dentro da função `nome`, se dada) que escrevem overflow que corta. */
function literaisQueCortam(arquivo: string, nome?: string): Achado[] {
  const fonte = ler(arquivo);
  const sf = arvore(arquivo, fonte);
  const achados: Achado[] = [];
  const olhar = (raiz: ts.Node) => visitar(raiz, (no) => {
    const t = textoDoNo(no);
    if (t !== null && CORTA.test(t)) {
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    }
  });
  if (!nome) olhar(sf);
  else visitar(sf, (no) => { if (ts.isFunctionDeclaration(no) && no.name?.text === nome) olhar(no); });
  return achados;
}

function usosDeTelaGrade(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!fonte.includes("TelaGrade")) continue;
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      if ((ts.isJsxOpeningElement(no) || ts.isJsxSelfClosingElement(no)) && no.tagName.getText(sf) === "TelaGrade") {
        const linha = linhaDe(sf, no);
        achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
      }
    });
  }
  return achados;
}

/** 25/09/2026. Cada tela sai da lista quando vira `Moldura`. */
const DIVIDA: Divida = {
  "src/ui/telas/Contatos.tsx": [2, "25/09/2026 · moldura de Contatos com a faixa do modo e a busca (2.27)"],
  "src/ui/telas/DocumentoFiscal.tsx": [1, "25/09/2026 · Documento fiscal enxuto (2.31)"],
  "src/ui/telas/Grades.tsx": [1, "25/09/2026 · a emissão de recibos (1C.9)"],
};

describe("G15 · moldura sem corte", () => {
  it("as regras da moldura em globals.css não cortam", () => {
    const regras = regrasDaMoldura(ler("src/app/globals.css"));
    const cortam = regras.filter((r) => CORTA.test(r.corpo)).map((r) => `${r.seletor} { ${r.corpo.trim()} }`);
    expect(cortam, "Moldura com overflow:hidden encolhe e esconde o resto sem rolar (a tabela do CNPJ, 06 P0-1).").toEqual([]);
  });

  it("Moldura.tsx e a Tabela não escrevem overflow:hidden", () => {
    const achados = [...literaisQueCortam("src/ui/componentes/Moldura.tsx"), ...literaisQueCortam("src/ui/primitivos.tsx", "Tabela")];
    expect(achados.map((a) => `${a.arquivo}:${a.linha}  ${a.trecho}`)).toEqual([]);
  });

  it("TelaGrade só nas telas da lista, que só encolhe", () => {
    const achados = usosDeTelaGrade();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Tela nova usa `Moldura` (componentes/Moldura.tsx), não `TelaGrade`.", problemas, achados)).toEqual([]);
  });

  it("o instrumento acha a regra, o literal e o uso", () => {
    expect(regrasDaMoldura(".m-moldura { flex: 1; }\n@media (max-width: 900px) { .m-moldura-regiao { overflow-y: hidden; } }").map((r) => CORTA.test(r.corpo))).toEqual([false, true]);
    expect(regrasDaMoldura(ler("src/app/globals.css")).length).toBeGreaterThanOrEqual(6);
    expect(CORTA.test("overflow:clip")).toBe(true);
    expect(CORTA.test("overflow-y:auto")).toBe(false);
    // A função `Tabela` precisa ser achada: sem ela a varredura voltaria vazia para sempre.
    let achou = false;
    visitar(arvore("src/ui/primitivos.tsx"), (no) => { if (ts.isFunctionDeclaration(no) && no.name?.text === "Tabela") achou = true; });
    expect(achou).toBe(true);
    expect(usosDeTelaGrade().length).toBeGreaterThan(0);
  });
});
