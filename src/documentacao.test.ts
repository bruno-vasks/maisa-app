/* ─────────────────────────────────────────────────────────────────────────────
 * A DOCUMENTAÇÃO, VERIFICADA.
 *
 * Irmão de `arquitetura.test.ts`: lá as regras de código, aqui as de documentação.
 *
 * Existe por uma assimetria medida: documentação DESATUALIZADA é pior que
 * documentação AUSENTE. Com um ponteiro incorreto o acerto cai de 78,5% para
 * 68,1%; com o documento faltando, quase não muda (arXiv:2404.03114). Ou seja,
 * um `.md` que apodrece não é neutro — ele é uma armadilha, e num projeto que
 * programa quase todo por agente ela dispara toda sessão.
 *
 * O custo real disso já foi pago aqui. Em 14/08/2026, três afirmações deste
 * repositório estavam falsas há ~24 horas:
 *   • whatsapp/LEIA-ME.md — "nenhum teste automatizado no repo" (a suíte já existia);
 *   • whatsapp/LEIA-ME.md — "um inquilino só, lê de env" (já lia integracoes_whatsapp);
 *   • http/LEIA-ME.md ..... — "quando existir a tabela de negócios" (já existia, em uso).
 * Ninguém errou: o código andou e a prosa ficou. É exatamente o que um teste pega
 * e uma revisão não.
 *
 * ⚠️ AS LISTAS DE EXCEÇÃO SÃO O CONTEÚDO. Cada entrada tem motivo e data. Adicionar
 * um nome para "o teste passar" é a hora de parar e perguntar por quê.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const RAIZ = join(SRC, "..");

const ler = (p: string) => readFileSync(p, "utf8");
const posix = (p: string) => relative(RAIZ, p).split("\\").join("/");

function arquivos(dir: string, ext = [".ts", ".tsx"]): string[] {
  const achados: string[] = [];
  if (!existsSync(dir)) return achados;
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, ext));
    else if (ext.some((e) => nome.endsWith(e))) achados.push(caminho);
  }
  return achados;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 1 — TODA ROTA ESTÁ EM `docs/rotas.md`, E O CONTRÁRIO TAMBÉM.
 *
 * Nos dois sentidos de propósito. Rota não documentada faz um agente reescrever
 * o que já existe; rota documentada que sumiu do código é pior — ele constrói em
 * cima de uma promessa e só descobre no runtime.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("docs/rotas.md acompanha o código", () => {
  const doc = join(RAIZ, "docs", "rotas.md");

  const rotasDoCodigo = () =>
    arquivos(join(SRC, "app", "api"), [".ts"])
      .filter((f) => f.endsWith("route.ts"))
      .map((f) => "/" + posix(f).replace(/^src\/app\//, "").replace(/\/route\.ts$/, ""))
      .sort();

  /** Só o que está entre crases — prosa que menciona `/api/...` corrido não conta. */
  const rotasDoDoc = () => {
    const texto = ler(doc);
    const achadas = new Set<string>();
    /* Colchetes desde 15/10/2026: `/api/nf/pdf/[ref]` é a primeira rota de API com segmento
     * dinâmico, e o documento a escreve como a pasta se chama. */
    const re = /`(\/api\/[A-Za-z0-9/_\[\]-]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) achadas.add(m[1]);
    return [...achadas].sort();
  };

  it("existe", () => {
    expect(existsSync(doc)).toBe(true);
  });

  it("nenhuma rota do código está fora do documento", () => {
    const doc_ = rotasDoDoc();
    expect(rotasDoCodigo().filter((r) => !doc_.includes(r))).toEqual([]);
  });

  it("nenhuma rota do documento sumiu do código", () => {
    const codigo = rotasDoCodigo();
    expect(rotasDoDoc().filter((r) => !codigo.includes(r))).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 2 — PASTA DE ADAPTADOR TEM `LEIA-ME.md`.
 *
 * É o arquivo que um agente lê ANTES de escrever ali. Sem ele, a primeira coisa
 * que ele faz é inferir a convenção do código vizinho — e inferir errado, porque
 * o que não é óbvio (por que fábrica e não constante, por que `private` e não
 * `shared`) não está no código: está no motivo.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("toda pasta de adaptador se explica", () => {
  it("nenhuma pasta com código está sem LEIA-ME.md", () => {
    const semDoc: string[] = [];
    for (const lado of ["entrada", "saida"]) {
      const base = join(SRC, "adaptadores", lado);
      if (!existsSync(base)) continue;
      for (const nome of readdirSync(base)) {
        const p = join(base, nome);
        if (!statSync(p).isDirectory()) continue;
        const temCodigo = readdirSync(p).some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
        if (temCodigo && !existsSync(join(p, "LEIA-ME.md"))) semDoc.push(posix(p));
      }
    }
    expect(semDoc.sort()).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 3 — O ÍNDICE DE `ARQUITETURA.md` §8 É COMPLETO E VIVO.
 *
 * Índice mantido à mão é o primeiro lugar onde a documentação apodrece: some do
 * radar assim que alguém cria uma pasta. E um índice incompleto é pior que
 * nenhum — quem lê conclui que a pasta ausente não tem documento, e reescreve o
 * que já estava explicado.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("o índice de LEIA-ME não fica para trás", () => {
  const arquitetura = join(RAIZ, "ARQUITETURA.md");

  const leiameNoDisco = () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === "node_modules" || nome === ".next" || nome === ".git") continue;
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (nome === "LEIA-ME.md") achados.push(posix(p));
      }
    };
    varrer(RAIZ);
    return achados.sort();
  };

  it("todo LEIA-ME.md do repositório está listado no índice", () => {
    const texto = ler(arquitetura);
    expect(leiameNoDisco().filter((p) => !texto.includes(p))).toEqual([]);
  });

  it("todo caminho citado no índice existe", () => {
    const texto = ler(arquitetura);
    const mortos: string[] = [];
    const re = /\]\(([^)]+LEIA-ME\.md)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      if (!existsSync(join(RAIZ, m[1]))) mortos.push(m[1]);
    }
    expect(mortos).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 4 — TODA PORTA DE SAÍDA TEM UM ADAPTADOR `demo`.
 *
 * Porta com uma implementação só não é porta: é acoplamento com nome de
 * interface. O `demo/` é a segunda implementação que PROVA que a troca funciona
 * — e é o que faz o laboratório rodar sem credencial nenhuma.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Portas conscientemente sem demo. Cada uma é dívida com prazo, não permissão. */
const PORTAS_SEM_DEMO: Record<string, string> = {
  EmissorFiscal:
    "14/08/2026 — a rota fiscal usa `estaConfigurado()` em vez de cair num demo. " +
    "Emitir nota de mentira é pior que dizer que a configuração falta.",
  ModeloDeConversa:
    "14/08/2026 — sem chave de modelo o laboratório não roda. Um modelo de " +
    "demonstração com respostas fixas exercitaria o loop de ferramentas sem gastar " +
    "token, e tornaria o caminho 'agente' testável no CI. Vale escrever.",
};

describe("toda porta tem um demo que prova que ela é porta", () => {
  it("a lista de portas sem demo não cresceu sem alguém decidir", () => {
    const demo = arquivos(join(SRC, "adaptadores", "saida", "demo")).map(ler).join("\n");

    const semDemo = arquivos(join(SRC, "nucleo", "portas", "saida"))
      .flatMap((f) => [...ler(f).matchAll(/^export interface ([A-Za-z0-9_]+)/gm)].map((m) => m[1]))
      // O demo tipa cada implementação com `const x: NomeDaPorta = {`.
      .filter((nome) => !new RegExp(`:\\s*${nome}\\s*=`).test(demo));

    expect(semDemo.sort()).toEqual(Object.keys(PORTAS_SEM_DEMO).sort());
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 5 — `CLAUDE.md` CABE NUMA SESSÃO.
 *
 * Todo arquivo de instrução é pago em TODA sessão, e aderência a instrução decai
 * DENTRO da sessão (~5,6% menos conformidade por função gerada). Arquivo maior
 * não compra obediência: compra custo. O que sobra vai para o LEIA-ME da pasta,
 * que é lido só por quem abre a pasta.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("nenhum ponteiro morto na documentação", () => {
  /* O `CLAUDE.md` e o `docs/` são o mapa que um agente segue antes de escrever. Um link
   * que não resolve é pior que a ausência dele: o agente conclui que o assunto não está
   * documentado e reescreve o que já existia — que é exatamente o retrabalho que este
   * repositório está tentando eliminar.
   *
   * Só links RELATIVOS. URL externa não dá para verificar sem rede, e teste que depende
   * de rede fica vermelho por motivo errado até alguém desligá-lo. */
  const docs = [
    join(RAIZ, "CLAUDE.md"),
    join(RAIZ, "ARQUITETURA.md"),
    ...arquivos(join(RAIZ, "docs"), [".md"]),
  ].filter((p) => existsSync(p));

  it("todo link relativo em CLAUDE.md, ARQUITETURA.md e docs/ resolve", () => {
    const mortos: string[] = [];

    for (const doc of docs) {
      const dir = join(doc, "..");
      const texto = ler(doc);
      const re = /\[[^\]]*\]\(([^)]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto)) !== null) {
        const alvo = m[1];
        if (/^(https?:|mailto:|#)/.test(alvo)) continue;
        const caminho = alvo.split("#")[0];
        if (!caminho) continue;
        if (!existsSync(join(dir, caminho))) mortos.push(`${posix(doc)} → ${alvo}`);
      }
    }

    expect(mortos.sort()).toEqual([]);
  });
});

describe("CLAUDE.md", () => {
  const TETO = 150;
  const p = join(RAIZ, "CLAUDE.md");

  it("existe", () => {
    expect(existsSync(p)).toBe(true);
  });

  it(`tem no máximo ${TETO} linhas`, () => {
    expect(ler(p).split("\n").length).toBeLessThanOrEqual(TETO);
  });

  /* O contrato com o mecanismo de reafirmação do harness: a PRIMEIRA FRASE de cada
   * item é a regra. Item cuja primeira frase não fecha sozinha vira meia proibição
   * quando reinjetado — e meia proibição lê como permissão. */
  it("cada inviolável fecha na primeira frase", () => {
    const secao = ler(p).split(/^## /m).find((s) => s.startsWith("Regras invioláveis"));
    expect(secao, "falta a seção '## Regras invioláveis'").toBeDefined();

    const truncados = secao!
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim())
      .filter((item) => {
        const primeira = item.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? item;
        // Uma regra que não fecha em uma frase, ou que fecha vaga demais para valer sozinha.
        return !/[.!?]$/.test(primeira) || primeira.length < 15;
      });

    expect(truncados).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * O CHECKLIST DE ATIVAÇÃO SÓ PODE LER TABELA QUE O PRODUTO ESCREVE.
 *
 * `dominio/ativacao.ts` decidiu derivar o progresso do mundo em vez de guardar uma flag,
 * e o argumento era que uma flag dessincroniza. O adaptador tem um jeito próprio de
 * dessincronizar, e ele apareceu em produção em 16/08/2026: o passo `primeira_conversa`
 * consultava `mensagens` (arquivo 002), uma tabela órfã de um desenho anterior — enquanto o
 * histórico do agente é gravado em `mensagens_agente` (arquivo 007).
 *
 * O Bruno conversou com a MAISA pela etapa 4 do wizard, ela marcou de verdade, e o passo
 * continuou apagado. **Nenhum erro em lugar nenhum**: as duas tabelas existem, a consulta é
 * válida, a contagem dá zero, e o `Promise.allSettled` não tem o que registrar. O checklist
 * simplesmente nunca chegaria a 100%.
 *
 * ⚠️ Conferir se a tabela EXISTE não pegaria — as duas existem. O que denuncia é ninguém
 * escrever nela: uma tabela citada só pelo leitor do checklist é, por definição, uma tabela
 * que o checklist inventou.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("o adaptador de ativação", () => {
  const ATIVACAO = join(SRC, "adaptadores", "saida", "supabase", "ativacao.ts");

  /** As tabelas que o checklist consulta: `existe(t, "x")` e `.from("x")`. */
  function tabelasLidas(): string[] {
    const fonte = readFileSync(ATIVACAO, "utf8");
    const achadas = new Set<string>();
    for (const m of fonte.matchAll(/existe\(\s*t\s*,\s*"([a-z_]+)"/g)) achadas.add(m[1]);
    for (const m of fonte.matchAll(/\.from\("([a-z_]+)"\)/g)) achadas.add(m[1]);
    return [...achadas];
  }

  it("consulta pelo menos uma tabela — senão este guarda protege o vazio", () => {
    expect(tabelasLidas().length).toBeGreaterThan(0);
  });

  it("toda tabela que ele lê é escrita por algum outro adaptador", () => {
    const outros = arquivos(join(SRC, "adaptadores"))
      .filter((f) => f !== ATIVACAO && !f.endsWith(".test.ts"))
      .map((f) => readFileSync(f, "utf8"));

    const orfas = tabelasLidas().filter((t) => !outros.some((fonte) => fonte.includes(`"${t}"`)));

    expect(
      orfas,
      "tabela lida pelo checklist e citada por mais ninguém: ou o produto não grava nela, "
        + "ou o nome está errado. Nos dois casos o passo nunca acende, e sem erro nenhum",
    ).toEqual([]);
  });
});
