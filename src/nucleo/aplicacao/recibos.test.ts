/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * A regra que dá nome ao caso de uso: **só é prendido o que entrou no arquivo**. Uma sessão
 * sem CPF do paciente não pode sair da lista de pendências — senão ela desaparece do radar
 * exatamente no caso em que alguém precisa agir (pedir o CPF).
 *
 * E a que protege o mês seguinte: nada é truncado em silêncio. O que ficou de fora vira frase
 * com nome de gente.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import type { ConfigFiscal } from "../dominio/fiscal";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type {
  DestinatarioDeRecibo, LoteAberto, LoteGravado, PagamentoAFaturar, RepositorioRecibos,
} from "../portas/saida/repositorio-recibos";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { ContextoTenant } from "../dominio/tenant";
import {
  criarDesligarReciboSaude, criarExcluirPagamentoAvulso, criarFecharLoteDeRecibos,
  criarGerarLoteDeRecibos, criarLancarPagamentoAvulso, criarLerRecibosPendentes,
} from "./recibos";

const t: ContextoTenant = { tenantId: "t1", usuarioId: "u1", ator: { tipo: "usuario", id: "u1" } };

/** Uma psicóloga pessoa física pronta: CPF, ocupação, CRP. Sem CNPJ e sem certificado. */
const carla: ConfigFiscal = {
  ambiente: "producao",
  cnpj: null,
  razaoSocial: null,
  codigoMunicipio: null,
  optanteMei: false,
  optanteSimples: false,
  empresaId: null,
  certificadoValidoAte: null,
  codigoTributacaoNacional: null,
  prestadorCpf: "12345678909",
  ocupacaoSaude: "psicologo",
  registroProfissional: "CRP 06/123456",
  procuradorDocumento: null,
  procuracaoValidaAte: null,
  procuracaoAceitaEm: null,
  inscricaoMunicipal: null,
  itemListaServico: null,
  aliquotaIss: null,
  codigoTributarioMunicipio: null,
};

const fiscalDe = (c: ConfigFiscal): RepositorioFiscal => ({
  async ler() { return c; },
  async salvar() { return c; },
});

const sessao = (over: Partial<PagamentoAFaturar> = {}): PagamentoAFaturar => ({
  id: "at1",
  fonte: "atendimento",
  clienteId: "cl1",
  nome: "Mariana Alves",
  cpf: "12345678909",
  cpfPagador: null,
  data: "2026-08-14",
  valor: 250,
  servico: "Sessão",
  teste: false,
  ...over,
});

function recibosDe(pendentes: PagamentoAFaturar[]) {
  const abertos: { atendimentoIds: string[]; avulsoIds: string[]; competencia: string }[] = [];
  const lancados: unknown[] = [];
  const apagados: string[] = [];
  const repo: RepositorioRecibos = {
    async pendentes() { return pendentes; },
    async abrirLote(_t, p): Promise<LoteAberto | null> {
      abertos.push(p);
      const total = p.atendimentoIds.length + p.avulsoIds.length;
      if (!total) return null;
      return {
        id: "lote1",
        competencia: p.competencia,
        linhas: total,
        valor: 0,
        atendimentoIds: p.atendimentoIds,
        avulsoIds: p.avulsoIds,
      };
    },
    async confirmarLote() { return true; },
    async descartarLote() {},
    async destinatariosDoLote() { return []; },
    async lancarAvulso(_t, p) {
      lancados.push(p);
      return { ...sessao(), id: "av1", fonte: "avulso", nome: p.nome, cpf: p.cpf, data: p.data, valor: p.valor };
    },
    async excluirAvulso(_t, id) { apagados.push(id); },
    async listarLotes(): Promise<LoteGravado[]> { return []; },
  };
  return { repo, abertos, lancados, apagados };
}

describe("gerar o lote", () => {
  it("monta o CSV com uma linha por sessão", async () => {
    const { repo } = recibosDe([sessao(), sessao({ id: "at2", data: "2026-08-21" })]);
    /* ⚠️ `ate` EXPLÍCITO, e não `{}`. A competência sai de `ate`, que sem parâmetro vira
     * `hojeISO()` — então este teste passou de julho a agosto e reprovou sozinho no dia 1º de
     * setembro, sem ninguém tocar em código. Teste que depende do calendário da máquina não
     * está prendendo a regra, está prendendo o mês em que foi escrito. */
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, { ate: "2026-08-31" });

    expect(lote.linhas).toBe(2);
    expect(lote.csv.split("\r\n")).toHaveLength(2);
    expect(lote.arquivo).toBe("receita-saude-12345678909-2026-08.csv");
  });

  /* ★ A REGRA QUE DÁ NOME AO ARQUIVO. */
  it("não prende a sessão que ficou fora do arquivo", async () => {
    const { repo, abertos } = recibosDe([
      sessao(),
      sessao({ id: "at2", nome: "Rafael Costa", cpf: null }),
    ]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});

    expect(abertos[0].atendimentoIds).toEqual(["at1"]);
    expect(lote.linhas).toBe(1);
  });

  it("diz quem ficou de fora, com nome e motivo", async () => {
    const { repo } = recibosDe([
      sessao(),
      sessao({ id: "at2", nome: "Rafael Costa", cpf: null }),
    ]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});

    expect(lote.avisos[0]).toContain("Rafael Costa");
    expect(lote.avisos[0]).toContain("CPF válido de quem foi atendido");
    /* Um CPF só, uma falta só: paga por si não vira duas frases. */
    expect(lote.avisos[0]).not.toContain("quem pagou");
  });

  it("tira o cliente de teste do lote", async () => {
    const { repo, abertos } = recibosDe([sessao(), sessao({ id: "at2", teste: true })]);
    await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});
    expect(abertos[0].atendimentoIds).toEqual(["at1"]);
  });

  /* Mãe que paga a terapia do filho: o recibo tem que sair no CPF dela, senão não há
   * reembolso nem dedução. São colunas separadas no arquivo oficial. */
  it("usa o CPF do pagador quando ele existe, e repete o do paciente quando não", async () => {
    const { repo } = recibosDe([
      sessao({ cpfPagador: "98765432100" }),
      sessao({ id: "at2", data: "2026-08-21" }),
    ]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});
    const [l1, l2] = lote.csv.split("\r\n").map((l) => l.split(";"));

    expect([l1[7], l1[8]]).toEqual(["98765432100", "12345678909"]);
    expect([l2[7], l2[8]]).toEqual(["12345678909", "12345678909"]);
  });

  /* ⚠️ A descrição é fixa e neutra. O nome do serviço no catálogo ("Terapia de casal",
   * "Avaliação TDAH") é dado sensível, e recibo é documento que passa pelo plano de saúde. */
  it("não deixa o nome do serviço vazar para a descrição", async () => {
    const { repo } = recibosDe([sessao({ servico: "Terapia de casal — crise conjugal" })]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});

    expect(lote.csv).not.toContain("Terapia de casal");
    expect(lote.csv.split(";")[5]).toBe("Atendimento realizado em 14/08/2026");
  });

  it("recusa quando o negócio emite nota fiscal, e não recibo", async () => {
    const { repo } = recibosDe([sessao()]);
    const mei: ConfigFiscal = { ...carla, prestadorCpf: null, optanteMei: true, cnpj: "12345678000123" };
    await expect(criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(mei) })(t, {}))
      .rejects.toThrow(/não recibo/i);
  });

  it("pede o que falta antes de ler a agenda", async () => {
    const { repo } = recibosDe([sessao()]);
    const semOcupacao: ConfigFiscal = { ...carla, ocupacaoSaude: null };
    await expect(criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(semOcupacao) })(t, {}))
      .rejects.toThrow(/profissão/i);
  });

  it("avisa quando não há nada a faturar, em vez de gerar arquivo vazio", async () => {
    const { repo } = recibosDe([]);
    await expect(criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {}))
      .rejects.toThrow(/Nenhum atendimento/i);
  });
});

const TEL_DONO = "5511999990000";

const loteDeAgosto = (over: Partial<LoteGravado> = {}): LoteGravado => ({
  id: "l2", competencia: "2026-08-01", linhas: 35, valor: 7240,
  criadoEm: "2026-08-24T12:00:00-03:00", situacao: "gerado", ...over,
});

/* No escopo do módulo porque DOIS describes usam: "fechar o lote" e "a confirmação do
 * fechamento, para o dono". */
function ambiente(p: {
    destinatarios?: DestinatarioDeRecibo[];
    jaFechado?: boolean;
    quebrarPara?: string[];
    /** `null` = o dono ainda não preencheu o "WhatsApp do dono". */
    telefoneDono?: string | null;
    /** O lote que o banco devolve em `listarLotes` — é dele que saem os números da confirmação. */
    lote?: LoteGravado | null;
  } = {}) {
    const soltos: string[] = [];
    const confirmados: string[] = [];
    const enviados: { para: string; texto: string }[] = [];
    const quebra = new Set(p.quebrarPara ?? []);

    const recibos: RepositorioRecibos = {
      async pendentes() { return []; },
      async abrirLote() { return null; },
      async confirmarLote(_t, id) {
        confirmados.push(id);
        /* `false` = o lote já não estava em `gerado`. É o segundo clique. */
        return !p.jaFechado;
      },
      async descartarLote(_t, id) { soltos.push(id); },
      async destinatariosDoLote() { return p.destinatarios ?? []; },
      async lancarAvulso() { throw new Error("não usado neste teste"); },
      async excluirAvulso() {},
      async listarLotes() {
        const l = p.lote === undefined ? loteDeAgosto() : p.lote;
        return l ? [l] : [];
      },
    };

    const canal: CanalDeMensagens = {
      async enviar(_t, para, textos) {
        if (quebra.has(para)) throw new Error("WhatsApp desconectado");
        enviados.push({ para, texto: textos.join(" ") });
      },
      async enviarDocumento() { throw new Error("o lote não manda arquivo"); },
      async escalar() {},
    };

    const canalRepo = {
      async ler() {
        const tel = p.telefoneDono === undefined ? TEL_DONO : p.telefoneDono;
        return tel ? { telefoneDono: tel } : null;
      },
    } as never;

    const negocio = { async negocio() { return { nome: "Consultório Carla Guth" }; } } as never;
    const assistente = {
      async ler() {
        return { assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true }, cfg: {} };
      },
    } as never;

    const fechar = criarFecharLoteDeRecibos({ recibos, canal, negocio, assistente, canalRepo });
    /* A confirmação do dono é a ÚLTIMA mensagem, e vai para o número dele. Separar por
     * destino é mais honesto que por posição: se o dono também for paciente, a posição mente. */
    const paraODono = () => enviados.filter((e) => e.para === TEL_DONO);
    const paraPacientes = () => enviados.filter((e) => e.para !== TEL_DONO);
  return { fechar, soltos, confirmados, enviados, paraODono, paraPacientes };
}

const quem = (over: Partial<DestinatarioDeRecibo> = {}): DestinatarioDeRecibo => ({
  nome: "Mariana Alves",
  telefone: "5511981234567",
  data: "2026-08-14",
  valor: 250,
  ...over,
});

describe("fechar o lote", () => {

  /* ⚠️ Trocar os dois é o erro caro: soltar depois de importado faz o mês seguinte gerar
   * recibo em dobro para sessões já assinadas no e-CAC. */
  it("descartado solta as sessões; importado não", async () => {
    const { fechar, soltos, confirmados, paraODono } = ambiente();

    await fechar(t, { loteId: "l1", situacao: "descartado" });
    await fechar(t, { loteId: "l2", situacao: "importado" });

    expect(soltos).toEqual(["l1"]);
    expect(confirmados).toEqual(["l2"]);
  });

  /* ★ OPT-IN. A MAISA fala pelo WhatsApp pessoal de quem a usa: `avisar` ausente é silêncio. */
  it("não manda nada sem `avisar`", async () => {
    const { fechar, enviados, paraPacientes, paraODono } = ambiente({ destinatarios: [quem()] });

    const r = await fechar(t, { loteId: "l1", situacao: "importado" });

    expect(paraPacientes()).toEqual([]);
    expect(r.avisados).toBe(0);
  });

  it("avisa cada paciente com data, valor e o nome do negócio — e nunca o serviço", async () => {
    const { fechar, enviados, paraPacientes, paraODono } = ambiente({
      destinatarios: [quem(), quem({ nome: "Rafael Costa", telefone: "5511998761234", valor: 180 })],
    });

    const r = await fechar(t, { loteId: "l1", situacao: "importado", avisar: true });

    expect(r).toEqual({ avisados: 2, semTelefone: 0, falhas: 0 });
    expect(paraPacientes().map((e) => e.para)).toEqual(["5511981234567", "5511998761234"]);
    expect(paraPacientes()[0].texto).toContain("Oi, Mariana!");
    expect(paraPacientes()[0].texto).toContain("14/08");
    expect(paraPacientes()[0].texto).toContain("R$ 250,00");
    expect(paraPacientes()[0].texto).toContain("Consultório Carla Guth");
    expect(paraPacientes()[0].texto).toContain("declaração pré-preenchida");
    expect(paraPacientes()[0].texto).toContain("— MAISA");
    expect(paraPacientes()[1].texto).toContain("R$ 180,00");
  });

  /* ★ O TESTE QUE EXISTE PORQUE MENSAGEM ENTREGUE NÃO SE APAGA.
   *
   * Segundo clique no "Importei", F5 depois de uma resposta lenta, segunda aba: `confirmarLote`
   * devolve `false` e ninguém pode ser avisado de novo. Sem este portão, o paciente recebe dois
   * avisos do mesmo recibo e liga perguntando se foi cobrado duas vezes. */
  it("não avisa duas vezes quando o lote já estava fechado", async () => {
    const { fechar, enviados, paraPacientes, paraODono } = ambiente({ destinatarios: [quem()], jaFechado: true });

    const r = await fechar(t, { loteId: "l1", situacao: "importado", avisar: true });

    expect(paraPacientes()).toEqual([]);
    expect(r.avisados).toBe(0);
  });

  it("conta quem ficou sem telefone em vez de falhar o lote", async () => {
    const { fechar, enviados, paraPacientes, paraODono } = ambiente({
      destinatarios: [quem(), quem({ nome: "Avulso sem cadastro", telefone: null })],
    });

    const r = await fechar(t, { loteId: "l1", situacao: "importado", avisar: true });

    expect(r).toEqual({ avisados: 1, semTelefone: 1, falhas: 0 });
    expect(paraPacientes()).toHaveLength(1);
  });

  /* ⚠️ O recibo já existe quando isto acontece — foi importado no e-CAC pela mão dela. Deixar a
   * exceção subir faria a tela dizer que o fechamento falhou, e o clique seguinte não avisaria
   * mais ninguém: os que receberam nunca apareceriam num número. */
  it("um envio que falha não derruba os outros", async () => {
    const { fechar, enviados, paraPacientes, paraODono } = ambiente({
      destinatarios: [quem(), quem({ telefone: "5511900000000" }), quem({ telefone: "5511911111111" })],
      quebrarPara: ["5511900000000"],
    });

    const r = await fechar(t, { loteId: "l1", situacao: "importado", avisar: true });

    expect(r).toEqual({ avisados: 2, semTelefone: 0, falhas: 1 });
    expect(paraPacientes()).toHaveLength(2);
  });

  /* Descartar é desistir do arquivo: não existe recibo, então não existe aviso. */
  it("descartar não avisa ninguém, mesmo com `avisar`", async () => {
    const { fechar, enviados, confirmados, paraPacientes, paraODono } = ambiente({ destinatarios: [quem()] });

    const r = await fechar(t, { loteId: "l1", situacao: "descartado", avisar: true });

    expect(paraPacientes()).toEqual([]);
    expect(confirmados).toEqual([]);
    expect(r.avisados).toBe(0);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * TROCAR DE CAMINHO — a saída de quem escolheu errado, com a linha que ela não cruza.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("desligar o Receita Saúde", () => {
  function repoComLotes(lotes: LoteGravado[]) {
    const salvos: unknown[] = [];
    const recibos: RepositorioRecibos = {
      async pendentes() { return []; },
      async abrirLote() { return null; },
      async confirmarLote() { return true; },
      async descartarLote() {},
      async destinatariosDoLote() { return []; },
      async lancarAvulso() { throw new Error("não usado neste teste"); },
      async excluirAvulso() {},
      async listarLotes() { return lotes; },
    };
    const fiscal: RepositorioFiscal = {
      async ler() { return carla; },
      async salvar(_t, remendo) { salvos.push(remendo); return { ...carla, ...remendo }; },
    };
    return { recibos, fiscal, salvos };
  }

  const lote = (situacao: LoteGravado["situacao"]): LoteGravado => ({
    id: "l1", competencia: "2026-08-01", linhas: 3, valor: 750,
    criadoEm: "2026-08-28T12:00:00-03:00", situacao,
  });

  it("limpa CPF, ocupação e registro, e volta para a pergunta", async () => {
    const { recibos, fiscal, salvos } = repoComLotes([]);
    const estado = await criarDesligarReciboSaude({ recibos, fiscal })(t);

    expect(salvos[0]).toMatchObject({
      prestadorCpf: null, ocupacaoSaude: null, registroProfissional: null, ambiente: "homologacao",
    });
    expect(estado.caminho).not.toBe("recibo_saude");
  });

  it("deixa trocar quando o lote foi só gerado ou descartado — o arquivo é inerte", async () => {
    const { recibos, fiscal } = repoComLotes([lote("gerado"), lote("descartado")]);
    await expect(criarDesligarReciboSaude({ recibos, fiscal })(t)).resolves.toBeTruthy();
  });

  /* ★ A LINHA: lote importado é recibo emitido no e-CAC, no nome dela, e o paciente já pode
   * ver. A partir daí trocar o caminho não é preferência de tela. */
  it("recusa depois de um lote importado", async () => {
    const { recibos, fiscal } = repoComLotes([lote("importado")]);
    await expect(criarDesligarReciboSaude({ recibos, fiscal })(t)).rejects.toThrow(/já importou/i);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * PAGAMENTO AVULSO — o que a agenda não pegou.
 *
 * "Nem tudo vai estar registrado automaticamente, a MAISA cobre a maioria dos casos, mas não
 * todos" (Bruno, 21/08/2026).
 * ────────────────────────────────────────────────────────────────────────────── */

describe("o lote com pagamento avulso", () => {
  it("mistura agenda e avulso no mesmo arquivo, cada id na sua tabela", async () => {
    const { repo, abertos } = recibosDe([
      sessao(),
      sessao({ id: "av9", fonte: "avulso", nome: "Paciente de fora", data: "2026-08-19" }),
    ]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});

    expect(lote.linhas).toBe(2);
    /* ★ A separação é o que faz a claim trancar de verdade: id de avulso mandado como
     * atendimento não tranca nada, e a linha voltaria depois de o recibo sair. */
    expect(abertos[0].atendimentoIds).toEqual(["at1"]);
    expect(abertos[0].avulsoIds).toEqual(["av9"]);
  });

  /* ★ O BUG QUE A CHAVE `data + cpf` TINHA: duas sessões do mesmo paciente no mesmo dia
   * (sessão dupla, ou dois irmãos no cadastro de um) colidiam, e a claim trancava a errada. */
  it("não confunde duas sessões do mesmo paciente no mesmo dia", async () => {
    const { repo, abertos } = recibosDe([
      sessao({ id: "at1" }),
      sessao({ id: "at2" }),
    ]);
    const lote = await criarGerarLoteDeRecibos({ recibos: repo, fiscal: fiscalDe(carla) })(t, {});

    expect(lote.linhas).toBe(2);
    expect(abertos[0].atendimentoIds).toEqual(["at1", "at2"]);
    expect(lote.csv.split("\r\n")).toHaveLength(2);
  });
});

describe("lançar um pagamento avulso", () => {
  const lancar = (repo: RepositorioRecibos) =>
    criarLancarPagamentoAvulso({ recibos: repo, fiscal: fiscalDe(carla) });

  it("normaliza CPF e devolve a linha pronta para a lista", async () => {
    const { repo, lancados } = recibosDe([]);
    const linha = await lancar(repo)(t, {
      data: "2026-08-19", valor: 180, nome: "  Paciente de fora  ", cpf: "123.456.789-09",
    });

    expect(lancados[0]).toMatchObject({ cpf: "12345678909", nome: "Paciente de fora", valor: 180 });
    expect(linha).toMatchObject({ fonte: "avulso", podeExcluir: true });
  });

  /* O lançamento existe PARA virar recibo. Sem CPF ele seria uma linha que nunca entra em
   * arquivo nenhum, aparecendo para sempre na lista com um aviso. */
  it("exige o CPF de quem foi atendido", async () => {
    const { repo } = recibosDe([]);
    await expect(lancar(repo)(t, { data: "2026-08-19", valor: 180, nome: "X", cpf: "" }))
      .rejects.toThrow(/CPF/i);
  });

  /* O erro que a Receita devolveu no primeiro arquivo real: 11 dígitos que não fecham. */
  it("recusa CPF que não fecha no dígito verificador", async () => {
    const { repo } = recibosDe([]);
    await expect(lancar(repo)(t, { data: "2026-08-19", valor: 180, nome: "X", cpf: "111.222.333-44" }))
      .rejects.toThrow(/não é válido/i);
  });

  it("exige nome", async () => {
    const { repo } = recibosDe([]);
    await expect(lancar(repo)(t, { data: "2026-08-19", valor: 180, nome: "   ", cpf: "12345678909" }))
      .rejects.toThrow(/de quem é/i);
  });

  it("recusa valor zero ou texto", async () => {
    const { repo } = recibosDe([]);
    await expect(lancar(repo)(t, { data: "2026-08-19", valor: 0, nome: "X", cpf: "12345678909" }))
      .rejects.toThrow(/maior que zero/i);
    await expect(lancar(repo)(t, { data: "2026-08-19", valor: NaN, nome: "X", cpf: "12345678909" }))
      .rejects.toThrow(/maior que zero/i);
  });

  /* O manual manda emitir na data do PAGAMENTO. Data futura é erro de digitação, e barrar
   * aqui é melhor que barrar na claim — lá a linha desapareceria sem explicação. */
  it("recusa data no futuro", async () => {
    const { repo } = recibosDe([]);
    await expect(lancar(repo)(t, { data: "2099-01-01", valor: 180, nome: "X", cpf: "12345678909" }))
      .rejects.toThrow(/ainda não aconteceu/i);
  });

  it("recusa quando o negócio emite nota fiscal", async () => {
    const { repo } = recibosDe([]);
    const mei: ConfigFiscal = { ...carla, prestadorCpf: null, optanteMei: true, cnpj: "12345678000123" };
    await expect(criarLancarPagamentoAvulso({ recibos: repo, fiscal: fiscalDe(mei) })(
      t, { data: "2026-08-19", valor: 180, nome: "X", cpf: "12345678909" },
    )).rejects.toThrow(/não recibo/i);
  });

  /* Escolher o cliente é o caminho principal do formulário: quem pagou fora da agenda quase
   * sempre já é cadastro. O `clienteId` viaja para o banco porque é ele que faz a view ler
   * nome e CPF do cadastro (`coalesce(cadastro, digitado)`) — e o digitado fica como lembrança
   * de quem era a pessoa no dia, se o cliente for apagado depois. */
  it("carrega o cliente escolhido junto do lançamento", async () => {
    const { repo, lancados } = recibosDe([]);
    await lancar(repo)(t, {
      data: "2026-08-19", valor: 180, nome: "Mariana Alves", cpf: "12345678909", clienteId: "cl1",
    });
    expect(lancados[0]).toMatchObject({ clienteId: "cl1" });
  });

  it("aceita lançamento de quem não é cadastro", async () => {
    const { repo, lancados } = recibosDe([]);
    await lancar(repo)(t, { data: "2026-08-19", valor: 180, nome: "Paciente novo", cpf: "12345678909" });
    expect(lancados[0]).toMatchObject({ clienteId: null });
  });

  it("apaga por id", async () => {
    const { repo, apagados } = recibosDe([]);
    await criarExcluirPagamentoAvulso({ recibos: repo })(t, { id: "av1" });
    expect(apagados).toEqual(["av1"]);
  });
});

describe("o que vai no próximo arquivo", () => {
  it("soma só quem tem CPF, e conta quantos faltam", async () => {
    const { repo } = recibosDe([
      sessao({ valor: 250 }),
      sessao({ id: "at2", cpf: null, valor: 300 }),
      sessao({ id: "av1", fonte: "avulso", valor: 180 }),
    ]);
    const r = await criarLerRecibosPendentes({ recibos: repo })(t);

    /* ⚠️ 430 e não 730: é o valor que vai SAIR no arquivo. Somar tudo faria a tela prometer
     * um número que o CSV não confirma. */
    expect(r.total).toBe(430);
    expect(r.semCpf).toBe(1);
    expect(r.pagamentos.map((p) => p.podeExcluir)).toEqual([false, false, true]);
  });

  it("tira o cliente de teste da lista", async () => {
    const { repo } = recibosDe([sessao(), sessao({ id: "at2", teste: true })]);
    const r = await criarLerRecibosPendentes({ recibos: repo })(t);
    expect(r.pagamentos).toHaveLength(1);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * A CONFIRMAÇÃO PARA O DONO — pedida por quem usa: "assim que eu clicasse que subi os
 * recibos, eu recebesse da MAISA a confirmação".
 *
 * ★ A REGRA QUE UM BUG MEU QUASE ENTERROU: ela NÃO depende de `avisar`. A primeira versão
 * juntava os dois num early return, e a confirmação do dono só saía quando ele também tinha
 * pedido para avisar os pacientes. São coisas diferentes — o aviso ao paciente é opt-in porque
 * vai para o WhatsApp de terceiro; a confirmação vai para o número dele mesmo.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("a confirmação do fechamento, para o dono", () => {
  /* ★ O TESTE QUE PRENDE O BUG. */
  it("sai MESMO sem `avisar`", async () => {
    const a = ambiente({ destinatarios: [] });
    await a.fechar(t, { loteId: "l2", situacao: "importado" });

    expect(a.paraODono()).toHaveLength(1);
    expect(a.paraODono()[0].texto).toContain("Recibos de agosto lançados");
  });

  it("leva linhas e valor DO BANCO, não a contagem de destinatários", async () => {
    const a = ambiente({
      destinatarios: [quem(), quem({ telefone: "5511900000001" })],
      lote: loteDeAgosto({ linhas: 35, valor: 7240 }),
    });
    await a.fechar(t, { loteId: "l2", situacao: "importado", avisar: true });

    const texto = a.paraODono()[0].texto;
    expect(texto).toContain("35 recibos");
    expect(texto).toContain("R$ 7240,00");
    /* Dois destinatários, mas o lote diz 35: quem manda é o banco. */
    expect(texto).not.toContain("2 recibos");
  });

  it("conta os avisados e os sem telefone", async () => {
    const a = ambiente({
      destinatarios: [quem(), quem({ telefone: null }), quem({ telefone: "5511900000002" })],
    });
    await a.fechar(t, { loteId: "l2", situacao: "importado", avisar: true });

    const texto = a.paraODono()[0].texto;
    expect(texto).toContain("2 pacientes avisados");
    expect(texto).toContain("1 sem telefone no cadastro");
  });

  /* Descartar é desistir do arquivo: não há recibo, então não há o que confirmar. */
  it("descartar não manda confirmação", async () => {
    const a = ambiente();
    await a.fechar(t, { loteId: "l2", situacao: "descartado" });
    expect(a.paraODono()).toEqual([]);
  });

  /* Segundo clique: `confirmarLote` devolve `false` e ninguém recebe nada de novo. */
  it("lote já fechado não manda confirmação de novo", async () => {
    const a = ambiente({ jaFechado: true });
    await a.fechar(t, { loteId: "l2", situacao: "importado" });
    expect(a.paraODono()).toEqual([]);
  });

  /* Estado legítimo: a tela pede o "WhatsApp do dono" e não bloqueia por causa dele. */
  it("sem telefone do dono, ninguém é avisado e nada estoura", async () => {
    const a = ambiente({ telefoneDono: null });
    const r = await a.fechar(t, { loteId: "l2", situacao: "importado", avisar: true });

    expect(a.paraODono()).toEqual([]);
    expect(r.avisados).toBe(0);
  });

  /* ⚠️ A confirmação é a ÚLTIMA coisa e fica FORA de `falhas`. Somá-la faria a tela dizer que
   * envios de paciente falharam quando o que falhou foi o recibo do próprio dono. */
  it("confirmação que não sai não conta como falha de paciente", async () => {
    const a = ambiente({
      destinatarios: [quem()],
      quebrarPara: [TEL_DONO],
    });
    const r = await a.fechar(t, { loteId: "l2", situacao: "importado", avisar: true });

    expect(r).toEqual({ avisados: 1, semTelefone: 0, falhas: 0 });
  });

  /* ⚠️ Mensagem se encaminha. Nome de paciente e CPF não podem estar nela. */
  it("não leva nome de paciente nem CPF", async () => {
    const a = ambiente({ destinatarios: [quem({ nome: "Mariana Alves" })] });
    await a.fechar(t, { loteId: "l2", situacao: "importado", avisar: true });

    const texto = a.paraODono()[0].texto;
    expect(texto).not.toContain("Mariana");
    expect(texto).not.toMatch(/\d{11}/);
  });
});
