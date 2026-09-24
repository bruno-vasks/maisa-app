/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE AS GUARDAS DA TELA TÊM EM COMUM: ler a fonte, achar o nó, conferir a dívida.
 *
 * Só os testes de `src/ui/guardas/` importam daqui. Nada de React, nada de tela: é `node:fs`
 * e o compilador do TypeScript, que já está no `node_modules`.
 *
 * ⚠️ POR QUE O PARSER E NÃO UMA REGEX. Comentário é onde o "porquê" mora neste repositório, e
 * ele cita de propósito o defeito que proibiu (`D.PERIODO`, "100vh", o travessão). Uma regex
 * por linha reprovaria o cabeçalho que explica a regra. Para o `ts`, comentário é trivia e
 * nunca vira nó; o que sobra de literal de string, pedaço de template e texto de JSX é, em
 * código de UI, o que chega à tela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** A raiz do repositório (onde está o `package.json`). */
export const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

export const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

/** Caminho relativo à raiz, com `/`, que é o que a mensagem de falha e a lista de dívida usam. */
export const rel = (abs: string) => relative(RAIZ, abs).split(sep).join("/");

/** Todo `.ts`/`.tsx` debaixo de `dir` (relativo à raiz), sem teste. Um caminho de arquivo vale por si. */
export function arquivosDe(dir: string): string[] {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [dir];
  const saida: string[] = [];
  for (const nome of readdirSync(abs).sort()) {
    if (nome === "node_modules" || nome === ".next") continue;
    const filho = join(abs, nome);
    if (statSync(filho).isDirectory()) saida.push(...arquivosDe(rel(filho)));
    // Teste fica de fora: ele CITA o defeito (inclusive o velho, para provar que saiu).
    else if (/\.tsx?$/.test(nome) && !nome.includes(".test.")) saida.push(rel(filho));
  }
  return saida;
}

/**
 * Onde mora o que o dono lê: o painel inteiro e as cinco rotas de entrada.
 *
 * As LPs (`src/app/(marketing)`) ficam de fora: têm design system e voz próprios, e o backlog
 * do front não é sobre elas.
 */
export const RAIZES_DE_TELA = [
  "src/ui",
  "src/app/login",
  "src/app/cadastro",
  "src/app/esqueci",
  "src/app/nova-senha",
  "src/app/comecar",
  "src/app/page.tsx",
] as const;

export const arquivosDeTela = () => RAIZES_DE_TELA.flatMap(arquivosDe);

export function arvore(caminho: string, fonte = ler(caminho)): ts.SourceFile {
  return ts.createSourceFile(caminho, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Visita todo nó da árvore, em ordem. */
export function visitar(no: ts.Node, fn: (n: ts.Node) => void): void {
  fn(no);
  ts.forEachChild(no, (f) => visitar(f, fn));
}

/** O conteúdo do nó, se ele for texto (literal, pedaço de template, texto de JSX); `null` se não for. */
export function textoDoNo(no: ts.Node): string | null {
  switch (no.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.JsxText:
      return (no as ts.LiteralLikeNode).text;
    default:
      return null;
  }
}

export const linhaDe = (sf: ts.SourceFile, no: ts.Node) => sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;

export interface Achado {
  arquivo: string;
  linha: number;
  trecho: string;
}

export const trechoDe = (fonte: string, linha: number) => (fonte.split("\n")[linha - 1] ?? "").trim().slice(0, 140);

/* ─────────────────────────────────────────────────────────────────────────────
 * A LISTA DE DÍVIDA
 *
 * Cada guarda nasce com o que já existe de errado. Apagar tudo num commit só seria mexer em
 * vinte telas às cegas; deixar sem lista seria o guarda nascer desligado. A lista fica no
 * teste, por arquivo, com a contagem, o motivo e a data, e reprova NAS DUAS DIREÇÕES:
 *   · arquivo novo com o defeito, ou contagem que subiu → reprova (a dívida não cresce);
 *   · contagem que desceu, ou arquivo limpo ainda na lista → reprova pedindo para baixar o
 *     número (senão a folga vira permissão para o próximo voltar a sujar).
 * ────────────────────────────────────────────────────────────────────────────── */

/** `arquivo → [quantos, "data · motivo ou item do backlog que paga"]` */
export type Divida = Record<string, readonly [number, string]>;

export function conferirDivida(achados: Achado[], divida: Divida): string[] {
  const porArquivo = new Map<string, Achado[]>();
  for (const a of achados) porArquivo.set(a.arquivo, [...(porArquivo.get(a.arquivo) ?? []), a]);

  const problemas: string[] = [];
  for (const [arquivo, lista] of porArquivo) {
    const devido = divida[arquivo]?.[0] ?? 0;
    if (lista.length > devido) {
      problemas.push(
        `${arquivo}: ${lista.length} (a dívida registrada é ${devido})\n` +
          lista.map((a) => `    ${a.arquivo}:${a.linha}  ${a.trecho}`).join("\n"),
      );
    } else if (lista.length < devido) {
      problemas.push(`${arquivo}: a dívida caiu de ${devido} para ${lista.length}. Baixe o número na lista, para ela não voltar a crescer.`);
    }
  }
  for (const arquivo of Object.keys(divida)) {
    if (!porArquivo.has(arquivo)) problemas.push(`${arquivo}: está limpo e continua na lista de dívida. Tire a linha.`);
  }
  return problemas;
}

/** Para o `expect(..., mensagem)`: a lista de problemas e a dívida de hoje pronta para colar. */
export function relatorio(titulo: string, problemas: string[], achados: Achado[]): string {
  if (problemas.length === 0) return "";
  const contagem: Record<string, number> = {};
  for (const a of achados) contagem[a.arquivo] = (contagem[a.arquivo] ?? 0) + 1;
  return [
    titulo,
    "",
    ...problemas,
    "",
    "Contagem de hoje, por arquivo (só para conferir; não cole sem entender por que mudou):",
    ...Object.entries(contagem).sort().map(([a, n]) => `  "${a}": ${n}`),
  ].join("\n");
}
