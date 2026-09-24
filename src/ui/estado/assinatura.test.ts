/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM — a única tela do app que dispara uma COBRANÇA.
 *
 * ★ **BOTÃO DE COBRAR NÃO APARECE SOBRE DÚVIDA.** Enquanto a leitura está em `carregando`
 * ou deu `erro`, e quando a rota não achou linha de assinatura, a gaveta não oferece nada.
 * Um "Assinar" que pisca meio segundo antes da resposta do servidor é um botão que pode
 * cobrar o plano errado no cartão de alguém.
 *
 * ★ **PLANO QUE NÃO ESTÁ NA TABELA NÃO VIRA BOTÃO PRIMÁRIO.** `assinaturas.plano` é texto
 * livre, e o `005_provisionar.sql` semeia o trial com `preco = 149.90` — valor que não é de
 * plano nenhum. Chutar "profissional" ali cobraria R$ 197 de quem contratou outra coisa. As
 * três ofertas continuam na lista, cada uma com preço à vista: aí a escolha é informada.
 *
 * ★ **TODO BOTÃO DE COBRAR DIZ QUANTO CUSTA.** "Assinar" sozinho cobra sem dizer o valor, e
 * o valor só apareceria na página do provedor — depois do clique.
 *
 * ★ **INADIMPLENTE COM ASSINATURA NO PROVEDOR NÃO ASSINA DE NOVO.** Assinaria em cima, e o
 * resultado são duas assinaturas ativas e duas cobranças no mesmo cartão. O caminho é o
 * portal: trocar o cartão e pagar a fatura que está aberta.
 *
 * E a volta do checkout: ela manda para uma rota QUE EXISTE. Ver o último `describe`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chaveDoPlano, resumoDaAssinatura, type EstadoAssinatura, type Oferta } from "./store";
import type { Assinatura } from "@/nucleo/dominio/assinatura";
import { telaDoEndereco } from "./endereco";

/** Uma assinatura de trial como o `005_provisionar.sql` cria: sem cartão, sem id de provedor. */
const trial = (over: Partial<Assinatura> = {}): Assinatura => ({
  plano: "Profissional",
  preco: null,
  moeda: "BRL",
  status: "trial",
  /* `null` nos três: em `trial` ninguém pagou, então não há provedor, nem método, nem
   * ficha de cliente em gateway nenhum. */
  provedor: null,
  clienteId: null,
  assinaturaId: null,
  periodoFim: null,
  trialFim: "2026-10-05",
  metodo: null,
  cartaoMarca: null,
  cartaoFinal4: null,
  ...over,
});

/** As três ofertas como a rota as monta a partir de `_lib/planos.ts`. */
const OFERTAS: Oferta[] = [
  { plano: "essencial", nome: "Essencial", preco: "R$ 127/mês", resumo: "Profissionais até 3", base: false },
  { plano: "profissional", nome: "Profissional", preco: "R$ 197/mês", resumo: "Profissionais até 10", base: true },
  { plano: "escala", nome: "Escala", preco: "R$ 397/mês", resumo: "Profissionais ilimitado", base: false },
];

const ok = (a: Assinatura | null, ofertas = OFERTAS): EstadoAssinatura => ({ status: "ok", assinatura: a, ofertas });
const linha = (r: ReturnType<typeof resumoDaAssinatura>, label: string) =>
  r.linhas.find(([l]) => l === label)?.[1];

describe("chaveDoPlano", () => {
  it("traduz o texto da tabela para a chave do POST", () => {
    expect(chaveDoPlano("Profissional")).toBe("profissional");
    expect(chaveDoPlano("Essencial")).toBe("essencial");
    expect(chaveDoPlano("  ESCALA ")).toBe("escala");
  });

  it("devolve null para o que não está na tabela — não chuta", () => {
    expect(chaveDoPlano("Premium")).toBeNull();
    expect(chaveDoPlano("Profissional Plus")).toBeNull();
    expect(chaveDoPlano("")).toBeNull();
    expect(chaveDoPlano(null)).toBeNull();
    expect(chaveDoPlano(undefined)).toBeNull();
  });
});

describe("resumoDaAssinatura — nenhum botão sobre dúvida", () => {
  it("carregando não oferece ação nem afirma situação", () => {
    const r = resumoDaAssinatura({ status: "carregando", assinatura: null, ofertas: OFERTAS });
    expect(r.assinar).toBeNull();
    expect(r.outras).toEqual([]);
    expect(r.gerenciar).toBe(false);
    expect(r.linhas).toEqual([]);
    expect(r.sub).not.toMatch(/ativa|em teste/i);
  });

  it("erro não oferece ação, e avisa", () => {
    const r = resumoDaAssinatura({ status: "erro", assinatura: null, ofertas: OFERTAS });
    expect(r.assinar).toBeNull();
    expect(r.outras).toEqual([]);
    expect(r.gerenciar).toBe(false);
    expect(r.aviso?.tone).toBe("warn");
  });

  it("assinatura ausente avisa em vez de oferecer botão", () => {
    const r = resumoDaAssinatura(ok(null));
    expect(r.assinar).toBeNull();
    /* Nem a lista: sem saber o que ela tem hoje, oferecer três preços é palpite. */
    expect(r.outras).toEqual([]);
    expect(r.gerenciar).toBe(false);
    expect(r.aviso).not.toBeNull();
  });
});

describe("resumoDaAssinatura — os quatro status", () => {
  it("trial oferece assinar o plano que está na linha, e não o portal", () => {
    const r = resumoDaAssinatura(ok(trial()));
    expect(r.assinar?.plano).toBe("profissional");
    /* Sem assinatura no provedor o portal abre vazio — ver o comentário em `gerenciar`. */
    expect(r.gerenciar).toBe(false);
    expect(r.aviso).toBeNull();
    expect(linha(r, "Teste até")).toBe("5 de outubro");
  });

  it("trial com plano fora da tabela não vira botão primário, mas deixa escolher", () => {
    const r = resumoDaAssinatura(ok(trial({ plano: "Premium" })));
    expect(r.assinar).toBeNull();
    /* As TRÊS na lista: o botão primário cobraria um plano que ninguém contratou, mas a
     * lista mostra nome e preço de cada um — escolher informado é diferente de chutar. */
    expect(r.outras.map((o) => o.plano)).toEqual(["essencial", "profissional", "escala"]);
    /* A linha continua mostrando o que a tabela diz: esconder o texto esconderia o defeito. */
    expect(linha(r, "Plano")).toBe("Premium");
  });

  it("ativa não oferece assinar de novo, só o portal", () => {
    const r = resumoDaAssinatura(ok(trial({
      status: "ativa", assinaturaId: "sub_1", clienteId: "cus_1",
      preco: 197, periodoFim: "2026-10-21", cartaoMarca: "Visa", cartaoFinal4: "4417",
    })));
    expect(r.assinar).toBeNull();
    /* Nem a lista: trocar de plano é assunto do portal, que sabe fazer proração. */
    expect(r.outras).toEqual([]);
    expect(r.gerenciar).toBe(true);
    expect(linha(r, "Próxima cobrança")).toBe("21 de outubro");
    expect(linha(r, "Valor")).toBe("R$ 197,00");
    expect(linha(r, "Forma de pagamento")).toBe("Visa final 4417");
  });

  it("inadimplente com assinatura no provedor manda para o portal, nunca para um segundo checkout", () => {
    const r = resumoDaAssinatura(ok(trial({ status: "inadimplente", assinaturaId: "sub_1", preco: 197 })));
    expect(r.assinar).toBeNull();
    expect(r.outras).toEqual([]);
    expect(r.gerenciar).toBe(true);
    expect(r.aviso?.tone).toBe("danger");
    /* A frase fala de boleto de propósito: é o caso brasileiro que mais vai cair aqui. */
    expect(r.aviso?.texto).toMatch(/boleto/i);
  });

  it("cancelada deixa assinar de novo", () => {
    const r = resumoDaAssinatura(ok(trial({ status: "cancelada", plano: "Essencial", assinaturaId: "sub_1" })));
    expect(r.assinar?.plano).toBe("essencial");
    expect(r.gerenciar).toBe(true);
  });

  it("preço não pago é travessão, não zero", () => {
    expect(linha(resumoDaAssinatura(ok(trial())), "Valor")).toBe("—");
  });

  it("data ausente ou torta é travessão, não `Invalid Date`", () => {
    expect(linha(resumoDaAssinatura(ok(trial({ trialFim: null }))), "Teste até")).toBe("—");
    expect(linha(resumoDaAssinatura(ok(trial({ trialFim: "31/12/2026" }))), "Teste até")).toBe("—");
  });
});

/**
 * ★ 197 É A BASE, E OS OUTROS DOIS FICAM DISPONÍVEIS. Decisão do Bruno em 21/09/2026: a LP
 * documenta três preços, e o app oferecia um. O botão primário é o plano da linha da tabela
 * (`'Profissional'` para todo trial, por causa do `005`), e os outros vão para a lista.
 */
describe("os três preços da LP chegam ao app", () => {
  it("o botão primário diz o plano e o preço, não só \"Assinar\"", () => {
    const r = resumoDaAssinatura(ok(trial()));
    expect(r.assinar?.label).toBe("Assinar Profissional · R$ 197/mês");
  });

  it("os outros dois ficam na lista, sem repetir o do botão", () => {
    const r = resumoDaAssinatura(ok(trial()));
    expect(r.outras.map((o) => o.plano)).toEqual(["essencial", "escala"]);
    expect(r.outras.map((o) => o.preco)).toEqual(["R$ 127/mês", "R$ 397/mês"]);
  });

  it("quem está no Essencial vê o Profissional e o Escala na lista", () => {
    const r = resumoDaAssinatura(ok(trial({ plano: "Essencial" })));
    expect(r.assinar?.label).toBe("Assinar Essencial · R$ 127/mês");
    expect(r.outras.map((o) => o.plano)).toEqual(["profissional", "escala"]);
  });

  it("sem ofertas no payload, o botão do plano da linha sobrevive com o texto curto", () => {
    /* Payload antigo em cache, ou a rota respondendo sem a lista. O plano é conhecido; só
     * não se sabe o preço EXIBIDO dele. Esconder o botão travaria a venda por um detalhe
     * de copy. */
    const r = resumoDaAssinatura(ok(trial(), []));
    expect(r.assinar).toEqual({ plano: "profissional", label: "Assinar" });
    expect(r.outras).toEqual([]);
  });
});

/**
 * ⚠️ ESTE TESTE EXISTE POR UM 404 QUE FOI SERVIDO A QUEM ACABOU DE PAGAR.
 *
 * As rotas mandavam a volta do checkout para `/faturamento?pagamento=recebido`. Essa rota
 * NÃO EXISTE: o app é uma página só, e a tela vem do store pelo `?tela=`. O erro é
 * invisível em teste de unidade e invisível no demo — só aparece depois do cartão passar.
 */
describe("a volta do checkout vai para uma rota que existe", () => {
  const rotas = [
    "src/app/api/assinatura/route.ts",
    "src/app/api/assinatura/portal/route.ts",
  ];

  it.each(rotas)("%s não manda para /faturamento", (r) => {
    expect(readFileSync(r, "utf8")).not.toMatch(/voltarPara:\s*`\$\{origem\}\/faturamento/);
  });

  it("o checkout devolve para a tela `mais`, com o desfecho na query", () => {
    const fonte = readFileSync(rotas[0], "utf8");
    expect(fonte).toContain("/?tela=mais&pagamento=recebido");
    expect(fonte).toContain("/?tela=mais&pagamento=cancelado");
  });

  it("`mais` está na lista de telas que o `?tela=` aceita", () => {
    /* A lista é validada em runtime: um alvo fora dela é ignorado em silêncio, e a volta
     * do pagamento cairia no Fluxo de hoje sem explicação nenhuma.
     * Até 24/09/2026 este teste lia o literal `const VALIDAS: TelaId[]` de dentro do store;
     * a lista virou `endereco.ts` (guarda G10) e o teste passou a perguntar à função. */
    expect(telaDoEndereco("mais")).toBe("mais");
  });
});
