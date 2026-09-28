/* ─────────────────────────────────────────────────────────────────────────────
 * G19 · RAIO DE CANTO É PAPEL, NÃO NÚMERO.
 *
 * Em 28/09/2026 o painel tinha 21 raios diferentes escritos à mão (12px aparecia 92 vezes,
 * depois 8, 10, 16, 14, 20, 11, 18, 9, 15, 13, 22, 24...) e o Bruno reclamou: "as bordas
 * seguem bem arredondadas". O app redondo ocupava espaço, deixava o botão grande e a pessoa
 * se perdia. A referência é o painel do aluno da Rede Inspira: chapado e reto.
 *
 * O conserto foram três tokens por papel em `globals.css` (`--r-casca` 12px, `--r-painel` 4px,
 * `--r-controle` 6px) e 240 trocas. Este guarda impede o 12px de voltar na próxima tela:
 * `border-radius` de 5 a 49px escrito em px reprova. Fica de fora o que não é canto:
 * até 4px (detalhe fino), pílula (≥ 50px, o `999px`) e círculo (`50%`).
 *
 * ⚠️ A LISTA ABAIXO NÃO É DÍVIDA, É FORMA COM SIGNIFICADO: o trilho do interruptor, a barra de
 * progresso e o celular do preview dos Ajustes são redondos porque o objeto que eles desenham é
 * redondo. Entrar na lista pede o motivo; "ficou mais bonito" não é motivo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

/** Os raios em px, de 5 a 49, num trecho de CSS escrito como texto (`border-radius:12px`). */
export function raiosSoltos(texto: string): number[] {
  return [...texto.matchAll(/(?<![-\w])border-radius:\s*([^;"'`]+)/g)]
    .flatMap((m) => [...m[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1])))
    .filter((n) => n > 4 && n < 50);
}

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!/border-radius|borderRadius/.test(fonte)) continue;
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      const texto = textoDoNo(no);
      if (texto !== null) {
        for (const n of raiosSoltos(texto)) {
          const linha = linhaDe(sf, no);
          achados.push({ arquivo, linha, trecho: `${n}px  ←  ${trechoDe(fonte, linha)}` });
        }
        return;
      }
      /* `style={{ borderRadius: 8 }}` no JSX: número puro também é px. */
      if (ts.isPropertyAssignment(no) && no.name.getText(sf) === "borderRadius" && ts.isNumericLiteral(no.initializer)) {
        const n = Number(no.initializer.text);
        if (n > 4 && n < 50) {
          const linha = linhaDe(sf, no);
          achados.push({ arquivo, linha, trecho: `${n}  ←  ${trechoDe(fonte, linha)}` });
        }
      }
    });
  }
  return achados;
}

const FORMA: Divida = {
  "src/ui/primitivos.tsx": [1, "28/09/2026 · o trilho do interruptor (Toggle): a pílula é o objeto"],
  "src/ui/componentes/EmitirRecibos.tsx": [2, "28/09/2026 · a barra de passos, trilho e preenchimento"],
  "src/ui/componentes/ProgressoDeEmissao.tsx": [2, "28/09/2026 · a barra de progresso da emissão, trilho e preenchimento"],
  "src/ui/telas/AMaisa.tsx": [4, "28/09/2026 · o preview desenha um CELULAR: moldura, tela e as duas bolhas"],
};

describe("G19 · raio de canto vem do papel", () => {
  it("nenhum raio de canto em px nas telas, fora da forma declarada", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, FORMA);
    expect(problemas, relatorio("Raio de canto escrito à mão: use --r-painel (cartão), --r-controle (botão, campo) ou --r-casca (a moldura).", problemas, achados)).toEqual([]);
  });

  it("o instrumento lê raio de verdade", () => {
    expect(raiosSoltos("padding:8px;border-radius:12px;")).toEqual([12]);
    expect(raiosSoltos("border-radius:var(--r-painel) var(--r-painel) 0 0")).toEqual([]);
    expect(raiosSoltos("border-radius:999px;border-radius:50%;border-radius:2px")).toEqual([]);
    expect(raiosSoltos("border-radius:0 0 15px 15px")).toEqual([15, 15]);
    /* A bolha da conversa declara os cantos um por um e não é pega: é forma de bolha. */
    expect(raiosSoltos("border-top-left-radius:20px;border-bottom-right-radius:7px")).toEqual([]);
  });

  it("os três papéis existem no globals.css", () => {
    const css = ler("src/app/globals.css");
    expect(css).toMatch(/--r-casca:\s*12px/);
    expect(css).toMatch(/--r-painel:\s*4px/);
    expect(css).toMatch(/--r-controle:\s*6px/);
  });
});
