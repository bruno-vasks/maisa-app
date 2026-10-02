/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ **QUEM NÃO TEM CPF NÃO ENTRA NA SELEÇÃO.** A Receita recusa recibo sem o CPF do
 * beneficiário, então oferecer essas linhas para marcar seria oferecer um erro que só aparece
 * depois da emissão — quando o pagamento já está trancado no livro-razão. `agrupar` é o único
 * lugar onde esse filtro mora, e é o tipo de regra que se perde numa refatoração de layout.
 *
 * ★ **O LANÇAMENTO À MÃO APARECE, E APARECE UMA VEZ SÓ.** `mesclar` e `reconciliar` são as duas
 * funções da lista otimista, e as duas erram em silêncio: linha duplicada conta dois recibos no
 * CTA, linha perdida some da tela com o dinheiro dentro. Nenhuma das duas tem sintoma visível
 * antes de alguém conferir o fechamento do mês contra o extrato.
 *
 * O resto protege a contagem: um cliente com três sessões é UMA linha na lista e TRÊS recibos no
 * CTA. Confundir os dois faz o botão prometer um número e o modal emitir outro — foi essa classe
 * de erro (o botão dizer N e saírem M) que motivou o redesenho da tela.
 *
 * ── SOBRE O TESTE DE RENDER ──
 *
 * Há um, e ele é de SSR (`renderToStaticMarkup`), não de DOM. O `vitest.config.ts` roda em
 * ambiente `node` por decisão escrita, e o motivo dado lá é o custo do `jsdom`. Render por
 * servidor não custa dependência nenhuma — `react-dom` já está no projeto — e pega a classe de
 * erro que mais dói num redesenho: token que não existe, import quebrado, componente que estoura
 * no primeiro render. `useEffect` não roda em SSR, então o que se vê é o estado de carregamento;
 * é smoke, não teste de comportamento, e está nomeado assim.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { agrupar, leituraDaTela, mesclar, reconciliar, semCpfPorPessoa } from "./EmitirRecibos";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";

const pag = (over: Partial<PagamentoPendente> = {}): PagamentoPendente => ({
  id: "p1",
  fonte: "atendimento",
  clienteId: "cl1",
  cpfPagador: null,
  nome: "Patrícia Mendes",
  cpf: "545.739.088-89",
  data: "2026-08-07",
  valor: 250,
  podeExcluir: false,
  ...over,
});

describe("semCpfPorPessoa (1C.10)", () => {
  it("junta os sem CPF por pessoa, maior valor primeiro, e ignora quem tem CPF", () => {
    const g = semCpfPorPessoa([
      pag({ id: "a", nome: "Ana", cpf: null, valor: 100 }),
      pag({ id: "b", nome: "Bia", cpf: null, valor: 300 }),
      pag({ id: "c", nome: "Ana", cpf: null, valor: 150 }),
      pag({ id: "d", nome: "Caio" }),
    ]);
    expect(g.map((x) => [x.nome, x.itens.length, x.valor])).toEqual([["Bia", 1, 300], ["Ana", 2, 250]]);
    expect(g.every((x) => x.cpf === null)).toBe(true);
  });
  it("ninguém sem CPF, grupo vazio", () => {
    expect(semCpfPorPessoa([pag({ id: "a" })])).toEqual([]);
  });
});

describe("agrupar", () => {
  it("junta as sessões da mesma pessoa numa linha só", () => {
    const g = agrupar([
      pag({ id: "a" }),
      pag({ id: "b", data: "2026-08-14" }),
      pag({ id: "c", data: "2026-08-21", valor: 280 }),
    ]);

    expect(g).toHaveLength(1);
    expect(g[0].itens).toHaveLength(3);
    /* ★ A LINHA É UMA, OS RECIBOS SÃO TRÊS. É essa distinção que o CTA conta. */
    expect(g[0].valor).toBe(780);
  });

  /* ⚠️ O FILTRO QUE IMPORTA. Sem CPF a Receita recusa — e o pagamento fica trancado à toa. */
  it("descarta quem está sem CPF", () => {
    const g = agrupar([pag({ id: "a" }), pag({ id: "b", nome: "Bruno", cpf: null })]);

    expect(g).toHaveLength(1);
    expect(g[0].nome).toBe("Patrícia Mendes");
    expect(JSON.stringify(g)).not.toContain("Bruno");
  });

  it("sem ninguém com CPF, a lista é vazia — não é erro", () => {
    expect(agrupar([pag({ cpf: null })])).toEqual([]);
    expect(agrupar([])).toEqual([]);
  });

  /* Homônimos com CPF diferente são duas pessoas. Agrupar por nome só juntaria o recibo de uma
   * na conta da outra — e o beneficiário do documento é o CPF, não o nome. */
  it("mesmo nome com CPF diferente são dois clientes", () => {
    const g = agrupar([
      pag({ id: "a", nome: "Ana Souza", cpf: "111.444.777-35" }),
      pag({ id: "b", nome: "Ana Souza", cpf: "545.739.088-89" }),
    ]);
    expect(g).toHaveLength(2);
  });

  /* Maior valor primeiro: num fechamento de mês é por onde o olho começa, e a ordem estável
   * evita a lista dançar entre recarregamentos. */
  it("ordena pelo valor, maior primeiro", () => {
    const g = agrupar([
      pag({ id: "a", nome: "Menor", cpf: "111.444.777-35", valor: 100 }),
      pag({ id: "b", nome: "Maior", cpf: "545.739.088-89", valor: 900 }),
    ]);
    expect(g.map((x) => x.nome)).toEqual(["Maior", "Menor"]);
  });

  /* A soma é do grupo, não do mês: o painel da direita soma os grupos ESCOLHIDOS, e um valor
   * inflado aqui viraria um "R$" errado ao lado de um CTA que emite documento fiscal. */
  it("a soma do grupo é só dos itens dele", () => {
    const g = agrupar([
      pag({ id: "a", valor: 250 }),
      pag({ id: "b", nome: "Outra", cpf: "111.444.777-35", valor: 999 }),
    ]);
    expect(g.find((x) => x.nome === "Patrícia Mendes")!.valor).toBe(250);
  });
});


describe("smoke de render (SSR)", () => {
  it("a tela monta sem estourar", async () => {
    const { createElement: h } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { StoreProvider } = await import("@/ui/estado/store");
    const { EmitirRecibos } = await import("./EmitirRecibos");

    const html = renderToStaticMarkup(h(StoreProvider, null, h(EmitirRecibos)));
    expect(html.length).toBeGreaterThan(50);
  });
});

/* ── ★ NENHUMA RESPOSTA PASSA SEM DECIDIR ─────────────────────────────────────
 *
 * Bruno, 26/08/2026, com a tela na frente: o Faturamento era um retângulo cinza parado. A causa
 * era um `if` sem `else` — `/api/fiscal` respondia `ok: false` (sessão vencida), a tela não
 * guardava a config E não guardava erro, e o esqueleto de carregamento ficava para sempre.
 *
 * ⚠️ O teste que importa é o do 401: é o caso comum (sessão vence sozinha) e é o que fica MUDO. */
describe("★ leitura das duas rotas", () => {
  const fiscalOk = { ok: true, config: { prestadorCpf: "11144477735" }, caminho: "recibo_saude", falta: [] };
  const pendOk = { ok: true, pagamentos: [], total: 0, semCpf: 0 };

  it("as duas boas viram tela", () => {
    const r = leituraDaTela(fiscalOk, pendOk);
    expect("erro" in r).toBe(false);
  });

  it("⚠️ /api/fiscal com ok:false vira FRASE, nunca silêncio", () => {
    const r = leituraDaTela({ ok: false, status: "nao_autenticado" }, pendOk);
    expect("erro" in r && r.erro.length > 0).toBe(true);
  });

  it("200 sem config também vira frase — seguir estouraria no primeiro campo", () => {
    const r = leituraDaTela({ ok: true }, pendOk);
    expect("erro" in r).toBe(true);
  });

  it("/api/recibos com ok:false vira frase", () => {
    const r = leituraDaTela(fiscalOk, { ok: false, info: "Rode a migração." });
    expect(r).toEqual({ erro: "Rode a migração." });
  });

  /* `info` do servidor manda: ele sabe o motivo, a tela não. */
  it("usa o `info` do servidor quando existe", () => {
    const r = leituraDaTela({ ok: false, info: "Sua sessão expirou." }, pendOk);
    expect(r).toEqual({ erro: "Sua sessão expirou." });
  });

  it("resposta nula não estoura", () => {
    expect("erro" in leituraDaTela(null, null)).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ A LISTA OTIMISTA — lançar à mão tem que aparecer no mesmo clique.
 *
 * Bruno, 27/08/2026: *"o banco de recibos a ser emitidos não muda automaticamente quando eu lanço
 * um novo recibo à mão"*. Gravava sempre; a tela é que só mudava depois de duas leituras de rede
 * sem sinal nenhum. Agora a linha entra na hora e a leitura confirma por baixo.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("★ mesclar — o que a tela mostra enquanto o servidor não respondeu", () => {
  it("põe o otimista na frente do que veio do servidor", () => {
    const m = mesclar([pag({ id: "a" })], [pag({ id: "novo", nome: "Sofia Ribeiro" })]);

    expect(m.map((x) => x.id)).toEqual(["novo", "a"]);
  });

  /* ⚠️ O TESTE QUE IMPORTA. Duplicar não é feio: é o CTA prometendo dois recibos e a Receita
     recebendo dois documentos para a mesma sessão. */
  it("quando a leitura traz a linha, a cópia otimista some — nunca duas", () => {
    const doServidor = [pag({ id: "novo" }), pag({ id: "a" })];
    const m = mesclar(doServidor, [pag({ id: "novo" })]);

    expect(m).toHaveLength(2);
    expect(m.filter((x) => x.id === "novo")).toHaveLength(1);
  });

  it("sem otimista, é exatamente o que o servidor mandou", () => {
    const doServidor = [pag({ id: "a" }), pag({ id: "b" })];
    expect(mesclar(doServidor, [])).toEqual(doServidor);
  });

  it("servidor vazio ainda mostra o que acabou de ser lançado", () => {
    expect(mesclar([], [pag({ id: "novo" })])).toHaveLength(1);
  });

  /* O grupo do CTA tem que enxergar o otimista, senão a lista diz 2 e o botão diz 1. */
  it("o lançamento entra no grupo do cliente e soma no valor", () => {
    const g = agrupar(mesclar([pag({ id: "a", valor: 250 })], [pag({ id: "novo", valor: 150 })]));

    expect(g).toHaveLength(1);
    expect(g[0].itens).toHaveLength(2);
    expect(g[0].valor).toBe(400);
  });
});

describe("★ reconciliar — o que a leitura confirmou e o que ela engoliu", () => {
  it("linha que voltou: conferida e sem aviso", () => {
    const r = reconciliar([pag({ id: "novo" })], [pag({ id: "novo" }), pag({ id: "a" })]);

    expect(r.conferidos).toEqual(["novo"]);
    expect(r.sumiram).toEqual([]);
  });

  /* ⚠️ O CASO CONHECIDO: cliente marcado como `teste`. A view filtra, a linha existe no banco e
     nunca aparece. Antes disso era silêncio; agora é frase com o nome. */
  it("linha que NÃO voltou vira aviso com o nome — nunca silêncio", () => {
    const r = reconciliar([pag({ id: "novo", nome: "Sofia Ribeiro" })], [pag({ id: "a" })]);

    expect(r.sumiram).toEqual(["Sofia Ribeiro"]);
    /* Conferida do mesmo jeito: insistir com a cópia otimista deixaria na tela uma linha que o
       servidor não tem, e o CTA tentaria emitir um pagamento que não existe para ele. */
    expect(r.conferidos).toEqual(["novo"]);
  });

  it("a foto vazia não inventa aviso", () => {
    expect(reconciliar([], [pag({ id: "a" })])).toEqual({ conferidos: [], sumiram: [] });
  });

  /* ★ A REGRA DA FOTO. `antes` é lido ANTES do `await` justamente para isto: o lançamento feito
     durante a leitura não está em `antes`, então esta resposta não o julga nem o apaga. */
  it("só julga o que estava na foto — quem chegou durante a leitura fica de fora", () => {
    const antes = [pag({ id: "primeiro", nome: "Patrícia" })];
    const r = reconciliar(antes, [pag({ id: "primeiro" })]);

    expect(r.conferidos).not.toContain("durante");
    expect(r.sumiram).toEqual([]);
  });

  it("dois lançamentos perdidos viram dois nomes", () => {
    const r = reconciliar(
      [pag({ id: "x", nome: "Sofia" }), pag({ id: "y", nome: "Marina" })],
      [],
    );

    expect(r.sumiram).toEqual(["Sofia", "Marina"]);
  });
});
