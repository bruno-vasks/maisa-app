/* ─────────────────────────────────────────────────────────────────────────────
 * G1 · TEXTO DE TELA NÃO LEVA TRAVESSÃO.
 *
 * Porte do `apps/web/src/testes/texto-de-tela.test.ts` da Rede Inspira, onde a regra nasceu
 * (Bruno, 13/09/2026). Regra 1 da emenda 5 do `maisa-design` (24/09/2026).
 *
 * O travessão não entrou por desleixo: o modelo que escreve o código pontua assim por padrão,
 * e o comentário da casa é cheio deles, com razão. Uma varredura limpa o app uma vez; a próxima
 * feature devolve o travessão na semana seguinte. Só um teste segura.
 *
 * Lê a FONTE, e não a tela: um teste que renderiza só vê o que algum teste renderiza, e a copy
 * de um estado de erro raro passaria inteira. Comentário é trivia para o parser e segue livre.
 *
 * O `—` SOZINHO FICA: `<span>—</span>` numa célula, `valor ?? "—"`, é a marca de "sem dado",
 * não pontuação. Vale só quando é o texto inteiro do nó; `${a} — ${b}` cai, porque ali o
 * travessão separa duas coisas, que é o uso proibido.
 *
 * ⚠️ A LISTA DE DÍVIDA É DE 24/09/2026 e só encolhe (ver `conferirDivida`). Cada onda do
 * backlog do front esvazia as telas que tocou; a Onda 3, item 3.1, zera o resto.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

const TRAVESSAO = "—";

const eMarcaDeValorAusente = (texto: string) => texto.trim() === TRAVESSAO;

const soEspaco = (no: ts.Node) => ts.isJsxText(no) && no.text.trim() === "";

/** `<span>—</span>` é marca; `<p>Olá <b>x</b>—fim</p>` é pontuação escondida atrás de uma quebra de nó. */
function eFilhoUnico(no: ts.Node): boolean {
  const pai = no.parent;
  if (!pai || !(ts.isJsxElement(pai) || ts.isJsxFragment(pai))) return false;
  return pai.children.filter((f) => !soEspaco(f)).length === 1;
}

/** A regra inteira, num lugar só: a varredura e a aferição do instrumento chamam esta função. */
function copyComTravessao(sf: ts.SourceFile): ts.Node[] {
  const flagrados: ts.Node[] = [];
  visitar(sf, (no) => {
    const texto = textoDoNo(no);
    if (texto === null || !texto.includes(TRAVESSAO)) return;
    /* Pedaço de template nunca é marca: `${a} — ${b}` tem " — " como TemplateMiddle, que
       aparado vira "—" e passaria (a versão da Rede deixa passar). Ali o travessão separa. */
    const inteiro = ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || (ts.isJsxText(no) && eFilhoUnico(no));
    const marca = inteiro && eMarcaDeValorAusente(texto);
    if (!marca) flagrados.push(no);
  });
  return flagrados;
}

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!fonte.includes(TRAVESSAO)) continue;
    const sf = arvore(arquivo, fonte);
    for (const no of copyComTravessao(sf)) {
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    }
  }
  return achados;
}

/** Dívida de 24/09/2026, por arquivo. Só encolhe. Quem paga: Onda 3, item 3.1 (e cada onda, nas telas que tocar). */
const DIVIDA: Divida = {
  "src/app/cadastro/page.tsx": [4, "24/09/2026 · entrada, 3.1 (09 P2-5)"],
  "src/app/comecar/Comecar.tsx": [11, "24/09/2026 · wizard, 3.1 (09 P2-5)"],
  "src/app/esqueci/page.tsx": [2, "24/09/2026 · entrada, 3.1 (09 P2-5)"],
  "src/app/login/page.tsx": [1, "24/09/2026 · entrada, 3.1 (09 P2-5)"],
  "src/app/nova-senha/page.tsx": [2, "24/09/2026 · entrada, 3.1 (09 P2-5)"],
  "src/ui/componentes/DeQuemEEsseNumero.tsx": [1, "24/09/2026 · contatos, 3.1 (05 P2-2)"],
  "src/ui/componentes/LigarNotaFiscal.tsx": [6, "24/09/2026 · fiscal, 3.1 (06 P2-4)"],
  "src/ui/componentes/LoteReceitaSaude.tsx": [12, "24/09/2026 · fiscal, 3.1 (06 P2-4)"],
  "src/ui/componentes/NovoPagamento.tsx": [5, "24/09/2026 · fiscal, 3.1 (06 P2-4)"],
  "src/ui/componentes/Pareamento.tsx": [1, "24/09/2026 · ajustes, 2.35 (07 P1.9)"],
  "src/ui/componentes/ProgressoDeEmissao.tsx": [1, "24/09/2026 · fiscal, 2.31 (06 P2-4)"],
  "src/ui/detalhe.tsx": [15, "24/09/2026 · gavetas, 3.1 (01 P2-24)"],
  "src/ui/estado/store.tsx": [28, "24/09/2026 · toasts do store, 3.1"],
  "src/ui/telas/AMaisa.tsx": [12, "24/09/2026 · ajustes, 2.37 (07 P1.9)"],
  "src/ui/telas/Contatos.tsx": [3, "24/09/2026 · contatos, 2.27 (05 P2-2)"],
  "src/ui/telas/DocumentoFiscal.tsx": [3, "24/09/2026 · fiscal, 2.31 (06 P2-4)"],
  "src/ui/telas/Grades.tsx": [8, "24/09/2026 · clientes, serviços, mais, 3.1 (08 P2-2)"],
};

describe("G1 · texto de tela sem travessão", () => {
  it("nenhum travessão novo em copy do painel e das rotas de entrada", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(
      problemas,
      relatorio(
        "Travessão em texto de tela (emenda 5 do maisa-design). Troque por ponto, vírgula ou dois-pontos, " +
          "ou reescreva. Encurtar não é apagar: mensagem de erro e ressalva que evita erro real ficam.",
        problemas,
        achados,
      ),
    ).toEqual([]);
  });

  it("varre o app de verdade, e distingue copy de comentário", () => {
    /* Um `arquivosDeTela` que devolvesse nada deixaria o teste acima verde para sempre. */
    const varridos = arquivosDeTela();
    expect(varridos.length).toBeGreaterThan(30);
    expect(varridos.some((c) => c.includes(".test."))).toBe(false);
    expect(varridos).toContain("src/app/comecar/Comecar.tsx");

    const sf = arvore(
      "amostra.tsx",
      [
        "// comentário com travessão — livre",
        "/** docstring com travessão — livre */",
        'const semDado = <span className="x">—</span>;',
        'const vazio = valor ?? "—";',
        "const copy = <p>Busque pelo nome — ou pelo telefone</p>;",
        'const aria = <button aria-label="Fechar — sem salvar" />;',
        "const tpl = `${a} — ${b}`;",
      ].join("\n"),
    );
    const flagrados = copyComTravessao(sf).map((n) => (textoDoNo(n) ?? "").trim());
    expect(flagrados).toEqual(["Busque pelo nome — ou pelo telefone", "Fechar — sem salvar", "—"]);
  });
});
