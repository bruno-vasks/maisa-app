import { describe, expect, it } from "vitest";

import {
  cadastroEmTexto, dentroDaJanela, etapaDoCadastro, horarioDeMandar, linkDoPagamento, linkDoTeste, planoPeloVolume,
  proximoPasso, resumoParaOVendedor, textoDeBoasVindas, textoDeLembrete, textoDeRetomada,
  type CadastroNoApp, type PlanoAVenda,
} from "./vendas";

const PLANOS: PlanoAVenda[] = [
  { chave: "escala", nome: "Escala", preco: "R$ 397", agendamentosPorMes: 1700, excedente: "R$ 0,23" },
  { chave: "essencial", nome: "Essencial", preco: "R$ 127", agendamentosPorMes: 300, excedente: "R$ 0,42" },
  { chave: "profissional", nome: "Profissional", preco: "R$ 197", agendamentosPorMes: 700, excedente: "R$ 0,28" },
];

const cadastro = (over: Partial<CadastroNoApp> = {}): CadastroNoApp => ({
  contaId: "c1", nome: "Fernanda", telefone: "11988887777", criadaEm: "2026-11-04T13:00:00Z",
  emailConfirmado: true, negocio: "Clínica Fernanda", vertical: "terapeutas", whatsapp: "conectado",
  testeAte: "2026-11-18", pagoAte: null, ...over,
});

describe("proximoPasso — a decisão do Bruno de 05/11/2026", () => {
  it("quem atende sozinha testa", () => {
    expect(proximoPasso({ equipe: 1, pediuConversa: false })).toBe("teste");
  });
  it("equipe de 2 ou mais conversa com ele", () => {
    expect(proximoPasso({ equipe: 2, pediuConversa: false })).toBe("conversa");
    expect(proximoPasso({ equipe: 12, pediuConversa: false })).toBe("conversa");
  });
  it("quem pede para falar com alguém conversa, mesmo sozinha", () => {
    expect(proximoPasso({ equipe: 1, pediuConversa: true })).toBe("conversa");
  });
  it("equipe desconhecida conta como sozinha: quem pula a pergunta pediu o link", () => {
    expect(proximoPasso({ equipe: null, pediuConversa: false })).toBe("teste");
  });
});

describe("planoPeloVolume", () => {
  it("o menor plano cuja cota cobre o volume, em qualquer ordem da tabela", () => {
    expect(planoPeloVolume(25, PLANOS)?.chave).toBe("essencial"); // ~108/mês
    expect(planoPeloVolume(100, PLANOS)?.chave).toBe("profissional"); // ~430/mês
    expect(planoPeloVolume(300, PLANOS)?.chave).toBe("escala"); // ~1290/mês
  });
  it("acima do maior, o maior", () => {
    expect(planoPeloVolume(900, PLANOS)?.chave).toBe("escala");
  });
  it("sem volume, nenhum: não se chuta plano", () => {
    expect(planoPeloVolume(null, PLANOS)).toBeNull();
    expect(planoPeloVolume(0, PLANOS)).toBeNull();
  });
});

describe("linkDoTeste", () => {
  it("vai para o teste grátis, sem Pix, na profissão certa, marcado como venda da maisa", () => {
    const u = new URL(linkDoTeste({ base: "https://app.maisasecretary.com.br/", vertical: "barbeiros", plano: "essencial" }));
    expect(u.origin + u.pathname).toBe("https://app.maisasecretary.com.br/assinar/essencial");
    expect(u.searchParams.get("teste")).toBe("1");
    expect(u.searchParams.get("icp")).toBe("barbeiros");
    expect(u.searchParams.get("utm_source")).toBe("whatsapp");
    expect(u.searchParams.get("utm_campaign")).toBe("maisa-da-maisa");
  });
  it("Escala não tem página: o link abre no Profissional", () => {
    expect(linkDoTeste({ base: "https://x.br", vertical: "generico", plano: "escala" })).toContain("/assinar/profissional?");
    expect(linkDoTeste({ base: "https://x.br", vertical: "generico", plano: null })).toContain("/assinar/profissional?");
  });
});

describe("linkDoPagamento", () => {
  it("abre o app na gaveta do plano, a mesma do aviso de vencimento", () => {
    expect(linkDoPagamento("https://app.maisasecretary.com.br/")).toBe("https://app.maisasecretary.com.br/?tela=mais&abrir=plano");
  });
});

describe("etapaDoCadastro", () => {
  const hoje = "2026-11-05";
  it("as etapas em ordem", () => {
    expect(etapaDoCadastro(cadastro({ negocio: null, emailConfirmado: false }), hoje)).toBe("confirmar_email");
    expect(etapaDoCadastro(cadastro({ negocio: null }), hoje)).toBe("criar_negocio");
    expect(etapaDoCadastro(cadastro({ whatsapp: "pareando" }), hoje)).toBe("conectar_whatsapp");
    expect(etapaDoCadastro(cadastro({ whatsapp: null }), hoje)).toBe("conectar_whatsapp");
    expect(etapaDoCadastro(cadastro(), hoje)).toBe("em_teste");
    expect(etapaDoCadastro(cadastro({ testeAte: "2026-11-01" }), hoje)).toBe("teste_acabou");
    expect(etapaDoCadastro(cadastro({ pagoAte: "2026-12-05" }), hoje)).toBe("cliente");
  });
  it("o último dia do teste ainda é teste", () => {
    expect(etapaDoCadastro(cadastro({ testeAte: hoje }), hoje)).toBe("em_teste");
  });
  it("a frase diz onde parou, para a vendedora não recomeçar a venda", () => {
    expect(cadastroEmTexto(cadastro({ whatsapp: "pareando" }), hoje)).toMatch(/parou na leitura do QR/);
    expect(cadastroEmTexto(cadastro({ negocio: null }), hoje)).toMatch(/antes de criar o negócio/);
  });
});

describe("quando uma automática pode sair", () => {
  const criada = "2026-11-05T13:00:00Z";
  const em = (min: number) => Date.parse(criada) + min * 60_000;
  it("boas-vindas: de 3 min a 3 h depois do cadastro", () => {
    expect(dentroDaJanela("boas_vindas", criada, em(1))).toBe(false);
    expect(dentroDaJanela("boas_vindas", criada, em(5))).toBe(true);
    expect(dentroDaJanela("boas_vindas", criada, em(181))).toBe(false);
  });
  it("lembrete: de 24 h a 72 h", () => {
    expect(dentroDaJanela("lembrete", criada, em(23 * 60))).toBe(false);
    expect(dentroDaJanela("lembrete", criada, em(25 * 60))).toBe(true);
    expect(dentroDaJanela("lembrete", criada, em(73 * 60))).toBe(false);
  });
  it("boas-vindas sai das 8h às 22h; lembrete e retomada, seg–sáb das 9h às 19h (São Paulo)", () => {
    const sp = (iso: string) => Date.parse(iso);
    expect(horarioDeMandar("boas_vindas", sp("2026-11-05T21:30:00-03:00"))).toBe(true);
    expect(horarioDeMandar("boas_vindas", sp("2026-11-05T22:30:00-03:00"))).toBe(false);
    expect(horarioDeMandar("lembrete", sp("2026-11-05T19:30:00-03:00"))).toBe(false);
    expect(horarioDeMandar("lembrete", sp("2026-11-07T10:00:00-03:00"))).toBe(true); // sábado
    expect(horarioDeMandar("retomada", sp("2026-11-08T10:00:00-03:00"))).toBe(false); // domingo
  });
});

describe("os textos", () => {
  it("chamam pelo primeiro nome, e sem nome não inventam", () => {
    const noite = Date.parse("2026-11-05T20:42:00-03:00");
    expect(textoDeBoasVindas("fernanda souza", noite)[0]).toBe("Boa noite, Fernanda! Tudo certo?");
    expect(textoDeBoasVindas(null, Date.parse("2026-11-05T09:10:00-03:00"))[0]).toBe("Bom dia! Tudo certo?");
  });
  it("a boas-vindas termina numa pergunta: é a resposta que abre a conversa", () => {
    const b = textoDeBoasVindas("Ana", Date.parse("2026-11-05T15:00:00-03:00"));
    expect(b[0]).toBe("Boa tarde, Ana! Tudo certo?");
    expect(b[b.length - 1]).toMatch(/\?$/);
    expect(b.join(" ")).toMatch(/criou sua conta/);
  });

  it("lembrete só para quem parou no meio", () => {
    expect(textoDeLembrete("Ana", "conectar_whatsapp")?.join(" ")).toMatch(/conectar o seu WhatsApp/);
    expect(textoDeLembrete("Ana", "em_teste")).toBeNull();
    expect(textoDeLembrete("Ana", "cliente")).toBeNull();
  });
  it("retomada não oferece o link a quem já recebeu", () => {
    expect(textoDeRetomada("Ana", false).join(" ")).toMatch(/te mando o link/);
    expect(textoDeRetomada("Ana", true).join(" ")).not.toMatch(/te mando o link/);
  });
  it("nenhum texto automático escreve link", () => {
    const todos = [
      ...textoDeBoasVindas("Ana", Date.now()), ...textoDeRetomada("Ana", false), ...textoDeRetomada("Ana", true),
      ...(["confirmar_email", "criar_negocio", "conectar_whatsapp"] as const).flatMap((e) => textoDeLembrete("Ana", e) ?? []),
    ];
    for (const t of todos) expect(t).not.toMatch(/https?:|\.com/);
  });
});

describe("resumoParaOVendedor", () => {
  it("cabe numa olhada: quem é, como marca, o passo e o link da conversa", () => {
    const r = resumoParaOVendedor({
      nome: "Fernanda", telefone: "5511988887777",
      qualificacao: { profissao: "psicóloga", vertical: "terapeutas", equipe: 1, atendimentosPorSemana: 25, comoMarcaHoje: "pelo WhatsApp, à mão", interesse: "recibo do Receita Saúde", pediuConversa: false },
      passo: "teste", plano: PLANOS[1],
    });
    expect(r).toContain("Fernanda · psicóloga · sozinha · ~25 atendimentos/semana");
    expect(r).toContain("Quer: recibo do Receita Saúde");
    expect(r).toContain("Hoje marca: pelo WhatsApp, à mão");
    expect(r).toContain("Próximo passo: link do teste (Essencial)");
    expect(r).toContain("https://wa.me/5511988887777");
  });
});
