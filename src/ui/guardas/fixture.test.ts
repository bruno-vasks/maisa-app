/* ─────────────────────────────────────────────────────────────────────────────
 * G3 · DADO INVENTADO NÃO VAI PARA A TELA.
 *
 * O painel mostrava "Junho de 2026" em setembro (`D.PERIODO`, dez usos), o prestador de
 * fixture na prévia da nota (`D.PRESTADOR`), FAQ e "números do mês" escritos à mão, o preço do
 * plano do placeholder com "em dia" do lado, um WhatsApp de suporte que não é de ninguém, e
 * frases sem fonte: "dois lembretes", "Confirmado pelo WhatsApp", "a MAISA já cobrou". Tudo
 * com cara de dado real (auditoria do front, 24/09/2026, item T5 do backlog).
 *
 * Duas varreduras:
 *   · os NOMES de fixture (`D.PERIODO`, `D.PRESTADOR`, `D.FAQS`, `D.NUMEROS_MES`,
 *     `D.FATURAS`, `precoPlano`) nas telas, nos componentes e na gaveta. O store fica de fora
 *     de propósito: o fixture como valor inicial do cadastro é deliberado (⚠️ `store.tsx`,
 *     `CADASTRO_INICIAL`, contradição C6 do backlog); o defeito é a TELA exibi-lo como verdade;
 *   · as FRASES e o número de suporte em todo `src/`.
 *
 * Pelo parser, não por regex: comentário que cita `D.PERIODO` para explicar por que saiu não
 * é tela, e não reprova.
 *
 * ⚠️ A DÍVIDA É DE 24/09/2026 e só encolhe. Quem paga tudo é o item 1A.10 do backlog.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDe, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

const FIXTURES_DE_D = ["PERIODO", "PRESTADOR", "FAQS", "NUMEROS_MES", "FATURAS"];
const CAMPOS_DE_FIXTURE = ["precoPlano"];
const ONDE_NOMES = ["src/ui/telas", "src/ui/componentes", "src/ui/detalhe.tsx"];

const FRASES = ["5511999999999", "dois lembretes", "Confirmado pelo WhatsApp", "já cobrou"];
const ONDE_FRASES = ["src"];

function nomesDeFixture(sf: ts.SourceFile): ts.Node[] {
  const achados: ts.Node[] = [];
  visitar(sf, (no) => {
    if (ts.isPropertyAccessExpression(no)) {
      const alvo = no.expression;
      if (ts.isIdentifier(alvo) && alvo.text === "D" && FIXTURES_DE_D.includes(no.name.text)) achados.push(no);
      else if (CAMPOS_DE_FIXTURE.includes(no.name.text)) achados.push(no);
    }
  });
  return achados;
}

function frasesInventadas(sf: ts.SourceFile): ts.Node[] {
  const achados: ts.Node[] = [];
  visitar(sf, (no) => {
    const texto = textoDoNo(no);
    if (texto !== null && FRASES.some((f) => texto.includes(f))) achados.push(no);
  });
  return achados;
}

function varrer(onde: string[], regra: (sf: ts.SourceFile) => ts.Node[]): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of onde.flatMap(arquivosDe)) {
    // `guardas/` cita as frases proibidas no próprio código de teste (e no helper).
    if (arquivo.startsWith("src/ui/guardas/")) continue;
    const fonte = ler(arquivo);
    const sf = arvore(arquivo, fonte);
    for (const no of regra(sf)) {
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    }
  }
  return achados;
}

/** 24/09/2026. Paga o 1A.10 (tabela T5): `rotuloDoMes`, identidade real do emissor, FAQ e números fora da tela, `resumoDaAssinatura`. */
const DIVIDA_NOMES: Divida = {
  "src/ui/componentes/AppShell.tsx": [1, "24/09/2026 · D.PERIODO no subtítulo do Fiscal; sai com o subtítulo (1C.5)"],
  "src/ui/detalhe.tsx": [11, "24/09/2026 · D.PRESTADOR, D.PERIODO, D.FAQS, D.NUMEROS_MES nas gavetas (1A.10)"],
  "src/ui/telas/Grades.tsx": [12, "24/09/2026 · D.PERIODO, D.FAQS, D.NUMEROS_MES, precoPlano em Clientes, Fiscal e Mais (1A.10)"],
};

/** 24/09/2026. Paga o 1A.5 (frases sem fonte) e o 1A.10 (número de suporte). */
const DIVIDA_FRASES: Divida = {
  "src/ui/detalhe.tsx": [3, "24/09/2026 · \"Confirmado pelo WhatsApp\" e \"dois lembretes\" na gaveta do atendimento (1A.5)"],
  "src/ui/estado/store.tsx": [1, "24/09/2026 · \"a MAISA já cobrou\" no alerta do Fluxo (1A.5)"],
  "src/ui/telas/Grades.tsx": [1, "24/09/2026 · wa.me/5511999999999 no suporte do Mais (1A.10)"],
};

describe("G3 · fixture fora da tela", () => {
  it("nenhum nome de fixture novo nas telas, nos componentes e na gaveta", () => {
    const achados = varrer(ONDE_NOMES, nomesDeFixture);
    const problemas = conferirDivida(achados, DIVIDA_NOMES);
    expect(problemas, relatorio("Fixture exibido como dado real (T5 do backlog do front).", problemas, achados)).toEqual([]);
  });

  it("nenhuma frase sem fonte e nenhum número de suporte inventado em src/", () => {
    const achados = varrer(ONDE_FRASES, frasesInventadas);
    const problemas = conferirDivida(achados, DIVIDA_FRASES);
    expect(problemas, relatorio("Frase que afirma o que o app não sabe, ou suporte que não é de ninguém.", problemas, achados)).toEqual([]);
  });

  it("o instrumento acha o que deve e ignora comentário", () => {
    const sf = arvore(
      "amostra.tsx",
      [
        "// D.PERIODO saiu daqui porque dizia junho em setembro",
        "const a = D.PERIODO;",
        "const b = D.hhmm(9);",
        "const c = st.cadastro.negocio.precoPlano;",
        'const d = "A MAISA já mandou dois lembretes";',
        "/* dois lembretes, citado num comentário */",
      ].join("\n"),
    );
    expect(nomesDeFixture(sf).map((n) => n.getText(sf))).toEqual(["D.PERIODO", "st.cadastro.negocio.precoPlano"]);
    expect(frasesInventadas(sf).length).toBe(1);
  });
});
