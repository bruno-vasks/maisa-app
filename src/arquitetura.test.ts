/* ─────────────────────────────────────────────────────────────────────────────
 * AS REGRAS DA ARQUITETURA, EXECUTÁVEIS.
 *
 * `ARQUITETURA.md` descreve o hexágono. Um documento não impede ninguém de escrever um
 * `import` — e o estudo dos repositórios da linhagem Smiller mostrou o custo disso na
 * prática: `painel-smiller` e `painel-configuracao-skip-maisa` nasceram do mesmo código,
 * derivaram tela a tela, e hoje ninguém consegue mesclá-los de volta. Ninguém decidiu
 * isso — cada passo pareceu razoável sozinho.
 *
 * Este arquivo é a diferença entre uma regra escrita e uma regra que segura. Ele lê o
 * código-fonte como texto de propósito: não precisa de grafo de módulos, roda em
 * milissegundos, e a mensagem de falha diz o arquivo e a linha.
 *
 * ⚠️ AS LISTAS DE EXCEÇÃO SÃO O CONTEÚDO, não a burocracia. Cada entrada tem um motivo
 * escrito ao lado. Adicionar um nome à lista é uma decisão de arquitetura — se estiver
 * fazendo isso para "o teste passar", é a hora de parar e perguntar por quê.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL(".", import.meta.url));

function arquivos(dir: string, ext = [".ts", ".tsx"]): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, ext));
    else if (ext.some((e) => nome.endsWith(e))) achados.push(caminho);
  }
  return achados;
}

/** `caminho:linha` relativo a `src/`, para a falha ser clicável. */
const marcar = (caminho: string, i: number) => `${relative(SRC, caminho)}:${i + 1}`;

function linhasQueCasam(caminho: string, re: RegExp): string[] {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .map((linha, i) => (re.test(linha) ? marcar(caminho, i) : null))
    .filter((x): x is string => x !== null);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 1 — A SETA DO HEXÁGONO SÓ APONTA PARA DENTRO.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("o núcleo não conhece o mundo", () => {
  /* Se o núcleo importa um adaptador, ele deixa de ser testável sem aquele adaptador — e
   * a partir daí trocar o Supabase, a Evolution ou o Google vira reescrita em vez de
   * troca de peça. É a única regra deste arquivo que não tem nenhuma exceção. */
  it("nenhum arquivo de src/nucleo importa src/adaptadores", () => {
    const violacoes = arquivos(join(SRC, "nucleo")).flatMap((f) =>
      linhasQueCasam(f, /from\s+["'](@\/adaptadores|(\.\.\/)+adaptadores)/),
    );

    expect(violacoes).toEqual([]);
  });

  it("nenhum arquivo de src/nucleo importa a UI ou as rotas", () => {
    const violacoes = arquivos(join(SRC, "nucleo")).flatMap((f) =>
      linhasQueCasam(f, /from\s+["'](@\/(ui|app)|(\.\.\/)+(ui|app))/),
    );

    expect(violacoes).toEqual([]);
  });

  /* As duas regras acima cobrem as camadas de DENTRO do projeto, e deixavam passar o
   * caso mais direto de todos: `import Anthropic from "@anthropic-ai/sdk"` num caso de
   * uso. Nenhum `@/adaptadores` aparece, os dois testes passam, e o núcleo acabou de
   * ficar impossível de testar sem credencial — que é justamente o dano que a regra 1
   * existe para impedir.
   *
   * A checagem é por LISTA BRANCA e não por lista negra de SDKs conhecidos: o modo de
   * falha é sempre a dependência que ninguém previu. O núcleo importa `@/nucleo/**`,
   * caminho relativo, e nada mais.
   *
   * `vitest` é a única exceção, e só aparece em arquivo de teste — o corredor que PROVA
   * o núcleo não é uma dependência dele em produção. */
  it("nenhum arquivo de src/nucleo importa pacote externo", () => {
    const PERMITIDOS = new Set(["vitest"]);

    const violacoes = arquivos(join(SRC, "nucleo")).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((linha, i) => {
          if (!/^\s*(import|export)\b/.test(linha)) return null;
          const alvo = linha.match(/from\s+["']([^"']+)["']/)?.[1];
          if (!alvo) return null;
          if (alvo.startsWith(".") || alvo.startsWith("@/nucleo/") || alvo.startsWith("node:")) return null;
          if (PERMITIDOS.has(alvo.split("/")[0])) return null;
          return `${marcar(f, i)} → ${alvo}`;
        })
        .filter((x): x is string => x !== null),
    );

    expect(violacoes).toEqual([]);
  });

  /* A UI fala com o servidor por `fetch`, não por adaptador. As duas exceções são de
   * natureza diferente do resto e por isso são nominais:
   *   • `demo` — as FIXTURES que a tela usa para se desenhar sem banco;
   *   • `supabase/client` — o login, que roda no navegador por definição.
   *
   * Qualquer outro adaptador de saída importado por uma tela significa a tela falando
   * direto com Google, Evolution ou Focus — e um segredo de servidor indo para o bundle.
   *
   * As ROTAS ficam de fora desta regra de propósito: elas SÃO a camada de adaptador de
   * entrada, e o OAuth do Google não tem caso de uso nenhum — é conversa entre
   * adaptadores por natureza. */
  it("a UI só importa os adaptadores de saída permitidos", () => {
    const PERMITIDO = /@\/adaptadores\/saida\/(demo|supabase\/(client|config))/;

    const violacoes = arquivos(join(SRC, "ui"))
      .flatMap((f) => linhasQueCasam(f, /from\s+["']@\/adaptadores\/saida\//))
      .filter((marca) => {
        const [caminho, linha] = marca.split(":");
        const texto = readFileSync(join(SRC, caminho), "utf8").split("\n")[Number(linha) - 1];
        return !PERMITIDO.test(texto);
      });

    expect(violacoes).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 2 — ADAPTADOR NÃO IMPORTA ADAPTADOR (com exceções escritas).
 * ────────────────────────────────────────────────────────────────────────────── */

/** As cinco exceções vivas. Cada uma tem o limite escrito no cabeçalho do próprio arquivo. */
const PODEM_IMPORTAR_ADAPTADOR: Record<string, string> = {
  "adaptadores/entrada/http/contexto.ts":
    "resolver 'de quem é este pedido' é intrinsecamente acesso a dado — o mapa usuário → negócio mora numa tabela",
  "adaptadores/entrada/whatsapp/contexto.ts":
    "idem, pelo outro lado: o mapa instância → negócio também é tabela",
  /* 21/09/2026 — os DOIS lados da Stripe falam com o MESMO provedor: o webhook confere a
   * assinatura com o mesmo segredo e pelo mesmo cliente HTTP que o checkout usa para
   * cobrar. Duplicar `cliente.ts` e `config.ts` aqui criaria duas configurações capazes
   * de divergir, e o sintoma seria o webhook autenticando contra uma conta enquanto o
   * checkout cobra de outra — em produção, sem erro em lugar nenhum. É a mesma exceção
   * que `entrada/whatsapp` já faz com `saida/evolution`. */
  "adaptadores/entrada/stripe/eventos.ts":
    "o webhook e o checkout são o mesmo provedor: um cliente HTTP e um segredo, não dois",
  /* 21/09/2026 — a MESMA exceção da Stripe logo acima, pelo mesmo motivo e com um
   * agravante: na AbacatePay o segredo do webhook é escolhido por NÓS e digitado no painel
   * deles. Duas leituras desse valor (uma em cada lado) é uma divergência esperando
   * acontecer, e o sintoma seria o webhook recusando 100% dos eventos com "não confere"
   * enquanto o checkout cobra normalmente — pagamento entrando e nada aparecendo no app. */
  "adaptadores/entrada/abacatepay/eventos.ts":
    "o webhook e o checkout são o mesmo provedor: um segredo lido num lugar só",
  "adaptadores/saida/google/conexoes.ts":
    "usa clienteDoContexto para escolher sessão vs service role — a mesma decisão dos outros repositórios",
  "adaptadores/saida/demo/index.ts":
    "barril de re-export; a UI importa a pasta inteira como `D`",
};

describe("adaptador não importa adaptador", () => {
  it("a lista de exceções não cresceu sem alguém decidir", () => {
    const importadores = arquivos(join(SRC, "adaptadores"))
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => linhasQueCasam(f, /from\s+["']@\/adaptadores\//).length > 0)
      .map((f) => relative(SRC, f));

    /* A comparação é nos DOIS sentidos: um arquivo novo na lista é uma decisão que passou
     * batida, e um arquivo que sumiu dela é uma exceção que deixou de ser necessária e
     * deveria sair daqui — lista de exceção obsoleta é permissão que ninguém revisa. */
    expect(importadores.sort()).toEqual(Object.keys(PODEM_IMPORTAR_ADAPTADOR).sort());
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 3 — O INQUILINO NUNCA VEM DO REQUEST.
 *
 * A regra está escrita em `dominio/tenant.ts`, e o comentário lá conta de onde ela veio:
 * na integração original o id de inquilino chegava por query param, e bastava conhecer o
 * id da vítima para sobrescrever a agenda dela. Um `searchParams.get("tenant_id")` num
 * arquivo de rota reabre isso — sem erro, sem log, sem sintoma até alguém tentar.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("o inquilino nasce da sessão, nunca do request", () => {
  const PROIBIDO = [
    /searchParams\s*\.\s*get\(\s*["'][^"']*tenant/i,
    /(body|corpo|json|payload|dados)\s*[.?]\s*tenant/i,
    /params\s*[.?]\s*tenant/i,
    /["']tenant_id["']\s*\]/i,
  ];

  it("nenhuma rota lê tenant do corpo, da query ou dos params", () => {
    const violacoes = arquivos(join(SRC, "app")).flatMap((f) =>
      PROIBIDO.flatMap((re) => linhasQueCasam(f, re)),
    );

    expect(violacoes).toEqual([]);
  });

  /* Todo caso de uso recebe `ContextoTenant` como PRIMEIRO argumento — e é aqui, na porta
   * de entrada, que isso se verifica: a assinatura é o contrato, a implementação só a
   * cumpre. Um caso de uso novo que recebesse `tenantId: string` no lugar aceitaria um id
   * vindo de qualquer lugar, inclusive do corpo do request.
   *
   * DUAS exceções, e elas são simétricas — uma acontece antes do inquilino existir, a
   * outra atravessa todos eles:
   *
   *   `ProvisionarNegocio` — PRODUZ o inquilino. No instante em que roda, ele ainda não
   *     existe. Escrita em `portas/saida/provisionador-negocio.ts`.
   *
   *   `EnviarLembretes` .... É uma ROTINA AGENDADA. A pergunta que ela faz é sobre todos
   *     os inquilinos ("quem tem lembrete para mandar agora?"), e não tem sessão nem dono.
   *     Um `tenantId` de entrada seria um parâmetro por onde disparar a rotina — e o
   *     WhatsApp — de outra pessoa. O isolamento é refeito na linha seguinte: cada item da
   *     fila traz o inquilino dele, e o envio usa um `ContextoTenant` de ator `sistema`.
   *     Escrita em `portas/saida/fila-de-lembretes.ts`.
   *
   *   `AvisarVencimentos` .. (29/09/2026) A TERCEIRA, e pelo motivo da segunda: é a rotina
   *     diária do pré-pago perguntando "quem vence hoje?" sobre todos os negócios. O limite
   *     está escrito em `portas/entrada/casos-de-uso.ts`: ela só LÊ e manda e-mail ao dono —
   *     não grava nada e não corta ninguém.
   *
   * Uma quarta exceção não é impossível, mas é decisão de arquitetura: não a acrescente
   * aqui sem escrever o limite no arquivo da porta, como estas três fizeram. */
  it("toda porta de entrada recebe ContextoTenant primeiro, menos o provisionamento e as rotinas", () => {
    const fonte = readFileSync(join(SRC, "nucleo", "portas", "entrada", "casos-de-uso.ts"), "utf8");

    /** O primeiro parâmetro de cada `export type X = (…)`, respeitando aninhamento. */
    const primeiroParametro = (desde: number): string => {
      let profundidade = 0;
      for (let i = desde; i < fonte.length; i++) {
        const c = fonte[i];
        if ("([{<".includes(c)) profundidade++;
        else if (")]}>".includes(c)) { if (--profundidade === 0) return fonte.slice(desde + 1, i); }
        else if (c === "," && profundidade === 1) return fonte.slice(desde + 1, i);
      }
      return "";
    };

    /* `exec` em laço, e não `matchAll`: o `target` deste projeto é anterior a ES2015 e
     * iterar o resultado exigiria `downlevelIteration`. Mesma razão pela qual
     * `aplicacao/provisionar.ts` valida nome com faixas ASCII em vez de `\p{L}` — mudar o
     * `target` por causa de um teste seria mexer no compilador do produto inteiro. */
    const semContexto: string[] = [];
    const re = /export type (\w+) = \(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      const abre = m.index + m[0].length - 1;
      if (!primeiroParametro(abre).includes("ContextoTenant")) semContexto.push(m[1]);
    }

    expect(semContexto.sort()).toEqual(["AvisarVencimentos", "EnviarLembretes", "ProvisionarNegocio"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * REGRA 4 — NENHUM SEGREDO NO CÓDIGO.
 *
 * O `.env` commitado do `painel-configuracao-skip-maisa` é o exemplo de para onde isso
 * vai. Um segredo em arquivo versionado não se apaga: fica no histórico do git para
 * sempre, e rotacionar a chave é a única saída.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("segredo nenhum entra no código", () => {
  it("nenhuma chave de provedor está escrita em src/", () => {
    const FORMATOS = [
      /\bsk-[A-Za-z0-9_-]{20,}/,          // OpenAI / Anthropic
      /\bAIza[0-9A-Za-z_-]{30,}/,          // Google
      /\bgh[pousr]_[A-Za-z0-9]{30,}/,      // GitHub
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, // JWT (Supabase)
    ];

    const violacoes = arquivos(SRC).flatMap((f) => FORMATOS.flatMap((re) => linhasQueCasam(f, re)));

    expect(violacoes).toEqual([]);
  });
});
