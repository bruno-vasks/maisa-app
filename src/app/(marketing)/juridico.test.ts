/* ─────────────────────────────────────────────────────────────────────────────
 * TODA PÁGINA PÚBLICA DO PRODUTO LEVA À POLÍTICA DE PRIVACIDADE.
 *
 * ── O QUE ESTE ARQUIVO CONGELA (18/08/2026) ──
 *
 * `/barbeiros` e `/barbeiro` estavam no ar sem UM link para a política de privacidade.
 * Não faltou cuidado: as páginas terminam na <Planos>, que é onde elas convertem, e
 * ninguém escreve um rodapé numa página que acaba num botão de compra. A LP estática de
 * terapeutas tinha o link porque foi consertada à mão em 17/08 — uma página por vez.
 *
 * O custo disso não aparece em nenhuma tela: o Google confere que a página pública do app
 * LINKA a política antes de verificar um app que pede escopo sensível, e `calendar.events`
 * é sensível. Sem verificação, a tela de consentimento trava em 100 usuários e nenhum
 * cliente da MAISA liga a agenda dele. A fila do Google leva semanas — errar aqui custa um
 * ciclo, não uma correção.
 *
 * O conserto de verdade não foi adicionar o link nas duas páginas: foi pendurá-lo no
 * <World>, que TODA LP usa. É isto que estes testes provam — que o mecanismo continua no
 * lugar, e que uma LP nova não consegue nascer sem ele.
 *
 * Lê o código-fonte como TEXTO, igual `arquitetura.test.ts`: não precisa de DOM, roda em
 * milissegundos, e a falha diz o arquivo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublic } from "@/adaptadores/saida/supabase/sessao";
import { CNPJ, CONTATO, EMPRESA } from "./_lib/Juridico";
import { WHATSAPP_NUMERO } from "./_lib/icp";

const MARKETING = fileURLToPath(new URL(".", import.meta.url));
const RAIZ = join(MARKETING, "..", "..", "..");

const ler = (p: string) => readFileSync(p, "utf8");

/** Todo `page.tsx` sob `(marketing)`, com o caminho relativo para a falha ser legível. */
function paginas(): { nome: string; texto: string }[] {
  const achadas: { nome: string; texto: string }[] = [];
  const varrer = (dir: string, prefixo: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) varrer(p, `${prefixo}/${nome}`);
      else if (nome === "page.tsx") achadas.push({ nome: `${prefixo}/page.tsx`, texto: ler(p) });
    }
  };
  varrer(MARKETING, "(marketing)");
  return achadas;
}

/* As páginas de DOCUMENTO são a exceção, e é a única que faz sentido: elas não usam o
 * <World> porque não são LP — não vendem, não convertem, não têm preço. Exigir <World> da
 * política de privacidade seria exigir que ela linkasse para si mesma pelo rodapé de uma
 * landing page.
 *
 * ⚠️ MAS A EXCEÇÃO NÃO AS DISPENSA DO QUE O ARQUIVO PROTEGE. Até 26/08/2026 esta lista era
 * um buraco: sair dela significava sair de toda checagem, e o teste seguinte não existia.
 * `/autorizar` entrou aqui e obrigou a fechá-lo — ver o teste "levam à política pelas
 * próprias mãos", que confere os dois links no texto da página ou do invólucro dela.
 *
 * | Página | Por que não é LP | Desde |
 * |---|---|---|
 * | `/privacidade`, `/termos` | documento legal; usam <PaginaJuridica>, com nav própria | 17/08/2026 |
 * | `/autorizar` | tutorial da Autorização de Acesso do e-CAC; quem lê está no site da Receita, não comprando | 26/08/2026 |
 * | `/sobre` | home pública, neutra de ICP; o <World> exige um `icp` e monta a barra de conversão daquele mundo, e esta página apresenta o produto em vez de vender para um público | 21/09/2026 |
 */
const NAO_SAO_LP = [
  "(marketing)/privacidade/page.tsx",
  "(marketing)/termos/page.tsx",
  "(marketing)/autorizar/page.tsx",
  "(marketing)/sobre/page.tsx",
];

/**
 * O texto da página MAIS o dos componentes locais que ela importa.
 *
 * ⚠️ UMA CAMADA SÓ, de propósito. A tira legal mora sempre no invólucro DIRETO — <World> nas
 * LPs, <PaginaJuridica> nos documentos — e nunca dois níveis abaixo. Varrer o grafo inteiro
 * transformaria o teste num resolvedor de módulos e faria ele passar por acidente, achando um
 * `href="/termos"` em qualquer canto do projeto.
 */
function textoComInvolucros(nome: string, texto: string): string {
  const dir = join(MARKETING, "..", "..", "..", "src", "app", nome.replace(/\/page\.tsx$/, "").replace("(marketing)", "(marketing)"));
  let junto = texto;
  for (const [, rel] of texto.matchAll(/from\s+"(\.[^"]+)"/g)) {
    for (const ext of [".tsx", ".ts", "/index.tsx"]) {
      const alvo = join(dir, rel + ext);
      try { junto += ler(alvo); break; } catch { /* import de tipo, pasta, ou não existe */ }
    }
  }
  return junto;
}

describe("o caminho para a política existe em toda página pública", () => {
  it("toda LP passa pelo <World> — é ele que monta a tira legal", () => {
    const semWorld = paginas()
      .filter((p) => !NAO_SAO_LP.includes(p.nome))
      .filter((p) => !/<World[\s>]/.test(p.texto))
      .map((p) => p.nome);

    expect(semWorld).toEqual([]);
  });

  /* ★ O TESTE QUE FECHA O BURACO DA LISTA DE EXCEÇÃO.
   *
   * Sem ele, `NAO_SAO_LP` é um jeito de sair da checagem: basta pôr o nome ali e a página
   * pública nasce sem caminho nenhum para a política. O que a exceção dispensa é o
   * MECANISMO (<World>), nunca o RESULTADO — e o resultado é o que o revisor do Google abre
   * e confere.
   *
   * Escrito quando `/autorizar` entrou na lista, em 26/08/2026. */
  it("as páginas que não são LP levam à política pelas próprias mãos", () => {
    const semCaminho = paginas()
      .filter((p) => NAO_SAO_LP.includes(p.nome))
      .filter((p) => {
        const texto = textoComInvolucros(p.nome, p.texto);
        return !texto.includes('href="/privacidade"') || !texto.includes('href="/termos"');
      })
      .map((p) => p.nome);

    expect(semCaminho).toEqual([]);
  });

  /* E a lista não cresce sozinha: cada entrada aqui é uma página que saiu do <World>, e a
   * tabela no comentário acima diz por quê e desde quando. Se este número subir sem a linha
   * correspondente, alguém usou a exceção como atalho. */
  it("a lista de exceção tem o tamanho que está documentado", () => {
    expect(NAO_SAO_LP).toHaveLength(4);
  });

  /* ★ O TESTE QUE JUSTIFICA O ARQUIVO. Se alguém tirar a tira do <World> para "limpar o
   * fim da página", as duas LPs de barbearia voltam a ficar sem link para a política — e
   * o sintoma só aparece semanas depois, numa reprovação do Google. */
  it("o <World> monta a tira legal", () => {
    const world = ler(join(MARKETING, "_lib", "World.tsx"));

    expect(world).toMatch(/<RodapeLegal\s*\/>/);
  });

  it("a tira aponta para privacidade, para termos e para um contato", () => {
    const tira = ler(join(MARKETING, "_lib", "RodapeLegal.tsx"));

    expect(tira).toContain('href="/privacidade"');
    expect(tira).toContain('href="/termos"');
    expect(tira).toContain("mailto:");
  });

  /* O e-mail da tira tem que ser o MESMO da política: o Google cruza o canal de contato
   * do site com o do documento. `CONTATO_EMAIL` do `icp.ts` é placeholder declarado
   * ("trocar pelo endereço real antes de publicar") e não pode vazar para o rodapé. */
  it("o contato da tira vem do mesmo lugar que o da política", () => {
    const tira = ler(join(MARKETING, "_lib", "RodapeLegal.tsx"));

    expect(tira).toMatch(/import\s*\{[^}]*\bCONTATO\b[^}]*\}\s*from\s*"\.\/Juridico"/);
    /* A asserção é sobre o IMPORT e não sobre a string: o cabeçalho do arquivo cita
     * `CONTATO_EMAIL` de propósito, para explicar por que ele NÃO é usado. A primeira
     * versão deste teste era um `not.toContain` e reprovou por causa do próprio
     * comentário — teste que não distingue código de prosa mede a prosa. */
    expect(tira).not.toMatch(/import\s*\{[^}]*CONTATO_EMAIL/);
  });

  /* A LP oficial de terapeutas é HTML estático servido de `public/lp` (ver
   * scripts/espelha-lp.mjs), então nenhum componente React a alcança: o <World> não roda
   * ali. O link dela é uma linha escrita à mão no `index.html`, e é por isso que ela
   * precisa de teste próprio — ela é a página do produto com link de PAGAMENTO. */
  it("a LP estática de terapeutas leva à política pelas próprias mãos", () => {
    const html = ler(join(RAIZ, "lp", "terapeutas", "index.html"));

    expect(html).toContain('href="/privacidade"');
    expect(html).toContain('href="/termos"');
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * UM CONTATO SÓ, EM TODA PÁGINA PÚBLICA (28/09/2026).
 *
 * A análise do site do provedor de pagamento pede "meios de contato" em
 * `app.maisasecretary.com.br`, e o site tinha três e-mails: o da política
 * (bruno.vaskevicius@polijunior.com.br), um `contato@maisa.app` de placeholder no `icp.ts` e
 * um `oi@maisa.com.br` escrito à mão na LP de terapeutas, num domínio que não é nosso. O
 * revisor cruza o contato do site com o dos termos, e um e-mail que volta sem entregar derruba
 * a análise. O Bruno mandou unificar nos contatos dele.
 *
 * A LP de terapeutas é HTML estático e não importa TS, então ela redigita o e-mail e o número.
 * Estes testes são o que impede os dois lados de divergirem de novo, como o `planos.test.ts`
 * faz com os preços.
 * ────────────────────────────────────────────────────────────────────────────── */


/** Todo arquivo de texto das páginas públicas: o `(marketing)` inteiro e a LP estática. */
function fontesPublicas(): { nome: string; texto: string }[] {
  const achadas: { nome: string; texto: string }[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) varrer(p);
      else if (/\.(tsx?|html)$/.test(nome) && !/\.test\.ts$/.test(nome)) achadas.push({ nome: relative(RAIZ, p).split(sep).join("/"), texto: ler(p) });
    }
  };
  varrer(MARKETING);
  varrer(join(RAIZ, "lp"));
  return achadas;
}

describe("um contato só, em toda página pública", () => {
  it("todo mailto das páginas públicas é o CONTATO da política", () => {
    const fora = fontesPublicas().flatMap(({ nome, texto }) =>
      [...texto.matchAll(/mailto:([^"'`?\s}]+)/g)]
        .map((m) => m[1])
        .filter((email) => !email.startsWith("$") && email !== CONTATO)
        .map((email) => `${nome}: ${email}`));
    expect(fora).toEqual([]);
  });

  it("todo wa.me das páginas públicas é o WhatsApp da MAISA", () => {
    const fora = fontesPublicas().flatMap(({ nome, texto }) =>
      [...texto.matchAll(/wa\.me\/(\d+)/g)]
        .map((m) => m[1])
        .filter((n) => n !== WHATSAPP_NUMERO)
        .map((n) => `${nome}: ${n}`));
    expect(fora).toEqual([]);
  });

  it("a LP estática de terapeutas mostra o e-mail e o WhatsApp de verdade", () => {
    const html = ler(join(RAIZ, "lp", "terapeutas", "index.html"));
    expect(html).toContain(`mailto:${CONTATO}`);
    expect(html).toContain(`wa.me/${WHATSAPP_NUMERO}`);
  });

  /* Link de rede social que aponta para âncora da própria página é link falso, e um revisor
   * que clica nele vê isso. Era o "instagram" do rodapé da LP de terapeutas (`href="#planos"`). */
  it("nenhum link de rede social aponta para dentro da própria página", () => {
    const falsos = fontesPublicas().flatMap(({ nome, texto }) =>
      [...texto.matchAll(/<a\b[^>]*href="#[^"]*"[^>]*>\s*(instagram|facebook|tiktok|linkedin|youtube|x|twitter)\s*<\/a>/gi)]
        .map((m) => `${nome}: ${m[1]}`));
    expect(falsos).toEqual([]);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * ★ A MESMA REGRA, MAS PARTINDO DE QUEM DECIDE O QUE É PÚBLICO (21/09/2026).
 *
 * Os testes acima varrem `(marketing)`. Isso deixou um buraco, e ele foi usado no mesmo
 * dia: `/assinar/[plano]` — a PÁGINA DE COMPRA do funil — nasceu pública, fora de
 * `(marketing)`, e sem um link para a política. Passou por todos os testes deste arquivo
 * porque nenhum deles olhava para lá.
 *
 * O conserto não é acrescentar `/assinar` a uma lista: é parar de derivar "página
 * pública" de uma PASTA e passar a derivar de `PUBLIC_PREFIXES`, que é quem realmente
 * decide. Página pública nova, em qualquer lugar de `src/app`, cai aqui automaticamente.
 *
 * ⚠️ E numa página de compra o link não é só exigência do Google: é do Stripe, que pede
 * termos e política acessíveis no fluxo de checkout, e é o mínimo para cobrar de alguém.
 * ────────────────────────────────────────────────────────────────────────────── */

const APP = join(RAIZ, "src", "app");

/** Toda `page.tsx` de `src/app`, com a rota que o middleware veria. */
function paginasPublicas(): { rota: string; arquivo: string; texto: string }[] {
  const achadas: { rota: string; arquivo: string; texto: string }[] = [];

  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (nome === "page.tsx") {
        /* A rota que o Next serve: grupo `(x)` não conta como segmento, e `[param]` vira
         * um valor qualquer — `isPublic` casa por segmento, então o valor é irrelevante. */
        const rota =
          "/" +
          relative(APP, dirname(caminho))
            .split(sep)
            .filter((s) => s && !s.startsWith("("))
            .map((s) => (s.startsWith("[") ? "x" : s))
            .join("/");
        achadas.push({ rota, arquivo: relative(RAIZ, caminho), texto: ler(caminho) });
      }
    }
  };

  varrer(APP);
  return achadas.filter((p) => isPublic(p.rota));
}

/** O texto da página mais o dos módulos que ela importa, **em profundidade**.
 *
 *  ⚠️ DUAS COISAS QUE A PRIMEIRA VERSÃO ERROU, E AS DUAS REPROVAM QUEM ESTÁ CERTO:
 *
 *  1. **Resolve `@/` também**, não só `./`. O alias é o estilo normal do repositório; um
 *     resolvedor que só entende caminho relativo acha que a página não importa nada.
 *  2. **Desce mais de um nível.** O `/assinar` chega na tira legal por
 *     `page.tsx → Assinar.tsx → LinhaLegal.tsx`. Parar no primeiro nível dizia que a
 *     página de compra não tinha link para a política — quando ela tem.
 *
 *  Com `vistos` para não entrar em ciclo de import, e teto de profundidade porque o
 *  objetivo é achar uma tira legal, não indexar o repositório. */
function comImportes(arquivo: string, texto: string, profundidade = 3): string {
  const vistos = new Set<string>();

  const juntar = (dirAtual: string, conteudo: string, resta: number): string => {
    if (resta <= 0) return conteudo;
    let junto = conteudo;

    for (const [, esp] of conteudo.matchAll(/from\s+"((?:\.|@\/)[^"]+)"/g)) {
      const base = esp.startsWith("@/") ? join(RAIZ, "src", esp.slice(2)) : join(dirAtual, esp);
      for (const ext of [".tsx", ".ts", "/index.tsx"]) {
        const alvo = base + ext;
        if (vistos.has(alvo)) break;
        try {
          const lido = ler(alvo);
          vistos.add(alvo);
          junto += juntar(dirname(alvo), lido, resta - 1);
          break;
        } catch { /* tipo, pasta ou inexistente */ }
      }
    }

    return junto;
  };

  return juntar(join(RAIZ, dirname(arquivo)), texto, profundidade);
}

describe("toda página pública tem caminho para a política — venha de onde vier", () => {
  it("existe mais de uma, senão a varredura está quebrada", () => {
    expect(paginasPublicas().length).toBeGreaterThan(3);
  });

  it("nenhuma página pública fica sem privacidade e termos", () => {
    const semCaminho = paginasPublicas()
      .filter((p) => {
        const texto = comImportes(p.arquivo, p.texto);
        /* `<World>` monta a tira legal; quem não o usa precisa dos dois links à mão. */
        if (/<World[\s>]/.test(texto)) return false;
        return !texto.includes('href="/privacidade"') || !texto.includes('href="/termos"');
      })
      .map((p) => `${p.rota} (${p.arquivo})`);

    expect(semCaminho).toEqual([]);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * O CNPJ NO RODAPÉ DE TODA PÁGINA PÚBLICA (28/09/2026).
 *
 * A mesma análise do provedor de pagamento pede o "CNPJ exibido no rodapé", e ele não estava
 * em página nenhuma. Os três rodapés do app e a LP estática de terapeutas mostram
 * `EMPRESA` ("Junior Poli Estudos · CNPJ …"), e o número vem do `PROCURADOR_PADRAO`.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Os dois dígitos verificadores do CNPJ: número digitado errado reprova aqui, e não no revisor. */
function cnpjValido(formatado: string): boolean {
  const d = formatado.replace(/\D/g, "").split("").map(Number);
  if (d.length !== 14 || new Set(d).size === 1) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + p * d[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === d[12] && dv(13) === d[13];
}

describe("o CNPJ no rodapé de toda página pública", () => {
  it("é um CNPJ de verdade, formatado", () => {
    expect(CNPJ).toBe("62.025.689/0001-66");
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(cnpjValido("62.025.689/0001-67")).toBe(false);
    expect(EMPRESA).toBe(`Junior Poli Estudos · CNPJ ${CNPJ}`);
  });

  it.each([
    ["RodapeLegal.tsx", "o rodapé das LPs (pelo <World>)"],
    ["LinhaLegal.tsx", "a linha das páginas públicas do app: login, cadastro, esqueci, assinar"],
    ["Juridico.tsx", "o rodapé dos termos e da privacidade"],
  ])("%s mostra a empresa (%s)", (arquivo) => {
    expect(ler(join(MARKETING, "_lib", arquivo))).toContain("{EMPRESA}");
  });

  it("a LP estática de terapeutas mostra o mesmo CNPJ", () => {
    expect(ler(join(RAIZ, "lp", "terapeutas", "index.html"))).toContain(EMPRESA);
  });
});

