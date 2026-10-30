/* As regras puras dos recebimentos: a janela da cobrança, a pergunta que está valendo, o que o
 * dono e o cliente respondem, a conferência de quem recebeu e a sugestão de qual cobrança o
 * comprovante paga. */

import { describe, expect, it } from "vitest";

import {
  avisoDeComprovanteAoDono, conferirCodigoDoPix, conferirRecebedor, cpfNaMensagem, decisaoDoDono, descricaoDoRecebimento, documentoConfere,
  identificadorDoRecebimento, janelaDepoisDoAtendimento, mensagensDoPix,
  perguntaValendo, pixFaltando, RECEBIMENTOS_DESLIGADOS, soOCpf, sugerirRecebimento,
  ESPERA_DEPOIS_DO_FIM_MS, JANELA_DE_COBRANCA_MS, PERGUNTA_VALE_MS,
} from "./recebimentos";

const AGORA = Date.parse("2026-10-27T18:00:00-03:00");

describe("quando cobrar", () => {
  it("a janela vai do que acabou há 12 h até 5 min atrás", () => {
    const j = janelaDepoisDoAtendimento(AGORA, "2026-01-01T00:00:00Z")!;
    expect(Date.parse(j.ate)).toBe(AGORA - ESPERA_DEPOIS_DO_FIM_MS);
    expect(Date.parse(j.desde)).toBe(AGORA - JANELA_DE_COBRANCA_MS);
  });

  it("o que acabou antes de ligar não entra; nunca ligado não tem janela", () => {
    const ligado = new Date(AGORA - 60 * 60_000).toISOString();
    expect(janelaDepoisDoAtendimento(AGORA, ligado)!.desde).toBe(ligado);
    expect(janelaDepoisDoAtendimento(AGORA, new Date(AGORA - 60_000).toISOString())).toBeNull();
    expect(janelaDepoisDoAtendimento(AGORA, null)).toBeNull();
  });

  it("uma pergunta por vez no WhatsApp do dono; a velha deixa de segurar a fila", () => {
    const r = (perguntadoEm: string | null, situacao: "perguntar" | "pago" = "perguntar") => ({ perguntadoEm, situacao });
    const recente = r(new Date(AGORA - 10 * 60_000).toISOString());
    expect(perguntaValendo([r(null), recente], AGORA)).toBe(recente);
    expect(perguntaValendo([r(new Date(AGORA - PERGUNTA_VALE_MS - 1).toISOString())], AGORA)).toBeNull();
    expect(perguntaValendo([r(new Date(AGORA - 60_000).toISOString(), "pago")], AGORA)).toBeNull();
  });

  it("sem chave ou sem nome, não há Pix", () => {
    expect(pixFaltando(RECEBIMENTOS_DESLIGADOS)).toEqual(["a chave Pix", "o nome de quem recebe"]);
    expect(pixFaltando({ ...RECEBIMENTOS_DESLIGADOS, tipoDaChave: "email", chave: "a@b.com", nome: "Zé" })).toEqual([]);
  });
});

describe("o que as pessoas respondem", () => {
  it("o dono: 1 ou 2, e as palavras que querem dizer o mesmo", () => {
    for (const t of ["1", "Sim", "já pagou", "Pagou!", "tá pago"]) expect(decisaoDoDono(t)).toBe("pagou");
    for (const t of ["2", "manda o pix", "Não", "ainda não", "PIX"]) expect(decisaoDoDono(t)).toBe("pix");
    for (const t of ["não sei se pagou", "depois vejo", "3", ""]) expect(decisaoDoDono(t)).toBeNull();
  });

  it("o cliente: um CPF válido, formatado ou não", () => {
    expect(cpfNaMensagem("123.456.789-09")).toBe("12345678909");
    expect(cpfNaMensagem("meu cpf é 12345678909 ok")).toBe("12345678909");
    expect(cpfNaMensagem("123.456.789-00")).toBeNull();
    expect(cpfNaMensagem("123.456.789-09 ou 529.982.247-25")).toBeNull();
    expect(cpfNaMensagem("liga no 11 98765-4321")).toBeNull();
  });

  it("só o CPF, ou CPF com assunto a mais", () => {
    expect(soOCpf("123.456.789-09")).toBe(true);
    expect(soOCpf("Meu CPF é 123.456.789-09, obrigada")).toBe(true);
    expect(soOCpf("123.456.789-09. Tem horário amanhã?")).toBe(false);
    expect(soOCpf("123.456.789-09 e queria remarcar a sessão de sexta")).toBe(false);
  });
});

describe("quem recebeu é o profissional?", () => {
  const nosso = { tipoDaChave: "email" as const, chave: "fin@sorriso.com.br", documento: "12345678909" };

  it("pela chave", () => {
    expect(conferirRecebedor({ recebedorChave: "FIN@sorriso.com.br", recebedorDocumento: null }, nosso)).toBe("confere");
    expect(conferirRecebedor({ recebedorChave: "outra@pessoa.com", recebedorDocumento: null }, nosso)).toBe("nao_confere");
  });

  it("pelo CPF mascarado, posição a posição", () => {
    expect(documentoConfere("***.456.789-**", "12345678909")).toBe(true);
    expect(documentoConfere("***.456.780-**", "12345678909")).toBe(false);
    expect(documentoConfere("***.4**.***-**", "12345678909")).toBeNull();
    expect(conferirRecebedor({ recebedorChave: null, recebedorDocumento: "***.456.789-**" }, nosso)).toBe("confere");
  });

  it("CNPJ inteiro, e a chave CPF valendo como documento", () => {
    expect(documentoConfere("11.222.333/0001-81", "11222333000181")).toBe(true);
    const cpf = { tipoDaChave: "cpf" as const, chave: "12345678909", documento: null };
    expect(conferirRecebedor({ recebedorChave: "***.456.789-**", recebedorDocumento: null }, cpf)).toBe("confere");
  });

  it("celular com ou sem o país", () => {
    const cel = { tipoDaChave: "telefone" as const, chave: "+5571999990000", documento: null };
    expect(conferirRecebedor({ recebedorChave: "(71) 99999-0000", recebedorDocumento: null }, cel)).toBe("confere");
    expect(conferirRecebedor({ recebedorChave: "+55 71 99999-0000", recebedorDocumento: null }, cel)).toBe("confere");
  });

  it("sem nada para comparar, não dá para saber", () => {
    expect(conferirRecebedor({ recebedorChave: null, recebedorDocumento: null }, nosso)).toBe("sem_como_saber");
  });
});

describe("qual cobrança o comprovante paga", () => {
  const r = (id: string, valor: number, criadoEm: string) => ({ id, valor, criadoEm, identificador: identificadorDoRecebimento(id) });
  const abertos = [
    r("bbbb2222-0000-0000-0000-000000000000", 80, "2026-10-20T10:00:00Z"),
    r("aaaa1111-0000-0000-0000-000000000000", 80, "2026-10-10T10:00:00Z"),
    r("cccc3333-0000-0000-0000-000000000000", 85, "2026-10-25T10:00:00Z"),
  ];

  it("pelo identificador, quando o banco o mostrou", () => {
    expect(sugerirRecebimento({ valor: 80, identificador: identificadorDoRecebimento("cccc3333-0000-0000-0000-000000000000") }, abertos)?.valor).toBe(85);
  });

  it("senão a mais antiga com o mesmo valor; nenhuma, nada", () => {
    expect(sugerirRecebimento({ valor: 80, identificador: null }, abertos)?.id).toMatch(/^aaaa/);
    expect(sugerirRecebimento({ valor: 81, identificador: "OUTRA" }, abertos)).toBeNull();
  });

  it("o identificador cabe no campo do Pix", () => {
    expect(identificadorDoRecebimento("aaaa1111-2222-3333-4444-555566667777")).toBe("MAISAAAAA1111222233334444");
  });
});

describe("as mensagens", () => {
  it("um atendimento; o mês do pacote", () => {
    expect(descricaoDoRecebimento([{ servico: "Corte", data: "2026-10-27" }])).toBe("Corte, 27/10");
    const mes = [{ servico: "Sessão", data: "2026-10-06" }, { servico: "Sessão", data: "2026-10-27" }];
    expect(descricaoDoRecebimento(mes)).toBe("2 atendimentos de outubro de 2026");
  });

  it("o código vai sozinho na segunda mensagem", () => {
    const [texto, codigo] = mensagensDoPix({ nome: "João Silva", valor: 50, descricao: "Corte, 27/10", codigo: "000201…" });
    expect(texto.startsWith("Oi, João! Segue o Pix de R$ 50,00 (Corte, 27/10).")).toBe(true);
    expect(texto).toContain("comprovante");
    expect(codigo).toBe("000201…");
  });
});

describe("o código da transação contra o comprovante", () => {
  /* Nubank, 30/10/2026 17:32 UTC (14:32 em Brasília). */
  const CODIGO = "E18236120202610301732AbC12dE34fG";
  const lido = { idTransacao: CODIGO, banco: "Nubank", pagoEm: "2026-10-30" };
  const quando = { recebidoEm: "2026-10-30T17:40:00Z", cobrancaEnviadaEm: "2026-10-30T15:00:00Z" };

  it("banco e data batem, e o Pix é entre a cobrança e o comprovante: confere", () => {
    expect(conferirCodigoDoPix(lido, quando)).toEqual({ situacao: "confere", motivos: [] });
  });

  it("o código é de outra instituição: o dono fica sabendo qual", () => {
    const r = conferirCodigoDoPix({ ...lido, banco: "Itaú" }, quando);
    expect(r.situacao).toBe("nao_confere");
    expect(r.motivos).toEqual(["O código da transação é de outra instituição: Nubank, e não Itaú."]);
  });

  it("a data do código fica em Brasília: 00:30 UTC do dia 31 ainda é o dia 30", () => {
    const r = conferirCodigoDoPix({ ...lido, idTransacao: "E18236120202610310030AbC12dE34fG" }, { recebidoEm: "2026-10-31T01:00:00Z" });
    expect(r.situacao).toBe("confere");
  });

  it("mais de um dia entre a data do código e a escrita no comprovante", () => {
    const r = conferirCodigoDoPix({ ...lido, pagoEm: "2026-10-27" }, quando);
    expect(r.motivos).toEqual(["O código da transação é de 30/10/2026, e o comprovante diz 27/10/2026."]);
  });

  it("um Pix de semanas antes da cobrança: comprovante antigo", () => {
    const antigo = { idTransacao: "E18236120202610011732AbC12dE34fG", banco: "Nubank", pagoEm: "2026-10-01" };
    const r = conferirCodigoDoPix(antigo, quando);
    expect(r.motivos).toEqual(["O Pix do comprovante é de 01/10/2026, antes desta cobrança. Pode ser um comprovante antigo."]);
  });

  it("o cliente que pagou na chave ao sair, horas antes de a cobrança sair, não é acusado", () => {
    const r = conferirCodigoDoPix(lido, { recebidoEm: "2026-10-31T10:00:00Z", cobrancaEnviadaEm: "2026-10-31T05:00:00Z" });
    expect(r.situacao).toBe("confere");
  });

  it("um Pix de depois de o comprovante chegar não existe", () => {
    const r = conferirCodigoDoPix({ ...lido, idTransacao: "E18236120202611021732AbC12dE34fG", pagoEm: null }, quando);
    expect(r.motivos).toEqual(["O código da transação é de depois de o comprovante chegar."]);
  });

  it("sem código no formato do Pix, ou sem banco e data para comparar, não conclui nada", () => {
    expect(conferirCodigoDoPix({ ...lido, idTransacao: "AUT-938271" }, quando)).toEqual({ situacao: "sem_como_saber", motivos: [] });
    expect(conferirCodigoDoPix({ idTransacao: CODIGO, banco: null, pagoEm: null }, quando)).toEqual({ situacao: "sem_como_saber", motivos: [] });
  });

  it("o aviso ao dono leva os motivos, junto do recebedor que não confere", () => {
    const codigo = conferirCodigoDoPix({ ...lido, banco: "Itaú" }, quando);
    const aviso = avisoDeComprovanteAoDono({ nome: "João", telefone: "5511912345678", valor: 50, conferencia: "nao_confere", codigo });
    expect(aviso).toContain("Atenção: No comprovante, quem recebeu não parece ser você. O código da transação é de outra instituição: Nubank, e não Itaú.");
    expect(avisoDeComprovanteAoDono({ nome: "João", telefone: "5511912345678", valor: 50, conferencia: "confere", codigo: { situacao: "confere", motivos: [] } }))
      .not.toContain("Atenção");
  });
});
