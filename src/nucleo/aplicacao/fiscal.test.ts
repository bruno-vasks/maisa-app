/* ─────────────────────────────────────────────────────────────────────────────
 * LIGAR A NOTA FISCAL — UMA PERGUNTA, E NENHUMA EMPRESA DUPLICADA.
 *
 * Dois modos de falha justificam este arquivo, e os dois custam dinheiro de verdade:
 *
 *   1 · EMPRESA DUPLICADA NA FOCUS. `criarEmpresa` não é idempotente e o provedor **não
 *       deduplica por CNPJ**. Um duplo clique, ou um retry depois de um timeout, cria uma
 *       segunda empresa cobrada — e só se resolve à mão no painel da Focus.
 *
 *   2 · CAMINHO ERRADO DE EMISSÃO. MEI tem que ir pelo Ambiente Nacional. Errar não dá
 *       erro: dá 202 "processando" e recusa da Receita minutos depois.
 *
 * Nenhum dos dois aparece num teste de integração sem gastar dinheiro e esperar.
 * ────────────────────────────────────────────────────────────────────────────── */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadastroDeEmissor, EmpresaDoEmissor } from "../portas/saida/cadastro-de-emissor";
import type { EmissorDeReciboSaude } from "../portas/saida/emissor-recibo";
import type { RemendoFiscal, RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { CadastroDoCnpj, ConfigFiscal } from "../dominio/fiscal";
import type { ContextoTenant } from "../dominio/tenant";
import { DadoInvalido } from "../dominio/erros";
import {
  codigoNacionalDoCnae, criarEnviarCertificado, criarLerEstadoFiscal,
  criarLiberarProducaoFiscal, criarLigarNotaFiscal, criarLigarReciboSaude,
} from "./fiscal";

const t: ContextoTenant = { tenantId: "neg-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };

const VAZIA: ConfigFiscal = {
  ambiente: "homologacao",
  cnpj: null, razaoSocial: null, codigoMunicipio: null,
  optanteMei: false, optanteSimples: false,
  empresaId: null, certificadoValidoAte: null,
  codigoTributacaoNacional: null,
  prestadorCpf: null,
  ocupacaoSaude: null,
  registroProfissional: null,
  procuradorDocumento: null,
  procuracaoValidaAte: null,
  procuracaoAceitaEm: null,
  inscricaoMunicipal: null, itemListaServico: null, aliquotaIss: null,
  codigoTributarioMunicipio: null,
};

/** Um MEI de barbearia, como a Receita responde. */
const MEI_BARBEARIA: CadastroDoCnpj = {
  cnpj: "12345678000123",
  razaoSocial: "BARBEARIA DO ZE MEI",
  situacao: "ativa",
  cnae: "9602501",
  optanteMei: true,
  optanteSimples: false,
  codigoMunicipio: "3550308",
  municipio: "São Paulo",
  uf: "SP",
};

/** Repositório em memória que acumula os remendos, para dar para inspecionar a ORDEM. */
function repo(inicial: ConfigFiscal = VAZIA) {
  let estado = { ...inicial };
  const remendos: RemendoFiscal[] = [];
  const r: RepositorioFiscal = {
    async ler() { return { ...estado }; },
    async salvar(_t, remendo) { remendos.push(remendo); estado = { ...estado, ...remendo }; return { ...estado }; },
  };
  return { r, remendos, atual: () => estado };
}

function emissor(over: Partial<CadastroDeEmissor> = {}) {
  const empresa: EmpresaDoEmissor = { id: 9001, certificadoValidoAte: null, certificadoCnpj: null };
  const base: CadastroDeEmissor = {
    consultarCnpj: vi.fn(async () => MEI_BARBEARIA),
    criarEmpresa: vi.fn(async () => empresa),
    estadoDaEmpresa: vi.fn(async () => empresa),
    enviarCertificado: vi.fn(async () => ({ ...empresa, certificadoValidoAte: "2027-08-17" })),
    faltando: () => [],
  };
  return { ...base, ...over };
}

/** O canal que emite o Receita Saúde — só `cadastrarEmissor` importa para ligar o recibo. */
function canal(cadastrar: EmissorDeReciboSaude["cadastrarEmissor"] = async () => {}) {
  const c: EmissorDeReciboSaude = {
    canal: "rebots",
    protocoloEhNossaReferencia: true,
    cadastrarEmissor: vi.fn(cadastrar),
    emitir: vi.fn(async () => { throw new Error("não usado"); }),
    consultar: vi.fn(async () => null),
    cancelar: vi.fn(async () => {}),
  };
  return c;
}

describe("o código nacional a partir do CNAE", () => {
  it("cabeleireiro e barbearia → 060101 (LC 116 item 6.01)", () => {
    expect(codigoNacionalDoCnae("9602501")).toBe("060101");
    expect(codigoNacionalDoCnae("96025-01")).toBe("060101");
  });

  /* ⚠️ CNAE desconhecido devolve `null` DE PROPÓSITO, e a tela passa a fazer uma pergunta.
   * O alternativo — chutar um código para a tela ficar verde — autoriza a nota de alguém
   * sob o código errado, e aí é problema fiscal do cliente, não bug nosso de resolver. */
  it("CNAE que não está no mapa devolve null, e não um chute", () => {
    expect(codigoNacionalDoCnae("8650003")).toBeNull(); // psicologia — ainda não confirmado
    expect(codigoNacionalDoCnae("")).toBeNull();
    expect(codigoNacionalDoCnae(null)).toBeNull();
  });
});

describe("ligar a nota fiscal", () => {
  let fiscal: ReturnType<typeof repo>;
  beforeEach(() => { fiscal = repo(); });

  it("faz UMA pergunta: do CNPJ deriva nome, município e regime", async () => {
    const cadastro = emissor();
    const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro });

    const e = await ligar(t, { cnpj: "12.345.678/0001-23" });

    expect(e.config.razaoSocial).toBe("BARBEARIA DO ZE MEI");
    expect(e.config.codigoMunicipio).toBe("3550308");
    expect(e.config.optanteMei).toBe(true);
    expect(e.caminho).toBe("nacional");
    /* O código do serviço saiu do CNAE — a última pergunta que sobrava. */
    expect(e.config.codigoTributacaoNacional).toBe("060101");
  });

  /* ⚠️ O TESTE QUE PROTEGE DINHEIRO. Segunda chamada não pode criar segunda empresa. */
  it("chamar de novo NÃO cria outra empresa na Focus", async () => {
    const cadastro = emissor();
    const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro });

    await ligar(t, { cnpj: MEI_BARBEARIA.cnpj });
    await ligar(t, { cnpj: MEI_BARBEARIA.cnpj });
    await ligar(t, { cnpj: MEI_BARBEARIA.cnpj });

    expect(cadastro.criarEmpresa).toHaveBeenCalledTimes(1);
  });

  /* A ordem existe para o caso do meio: se a criação falhar, o que a Receita respondeu já
   * está salvo e a tela mostra o nome da empresa em vez de voltar ao campo vazio. */
  it("grava o que a Receita disse ANTES de tentar criar a empresa", async () => {
    const cadastro = emissor({
      criarEmpresa: vi.fn(async () => { throw new Error("a Focus recusou"); }),
    });
    const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro });

    await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).rejects.toThrow("a Focus recusou");

    expect(fiscal.atual().cnpj).toBe(MEI_BARBEARIA.cnpj);
    expect(fiscal.atual().razaoSocial).toBe("BARBEARIA DO ZE MEI");
    /* E o `empresaId` continua nulo — então a próxima tentativa cria, sem duplicar. */
    expect(fiscal.atual().empresaId).toBeNull();
  });

  it("grava o empresaId no remendo seguinte ao da consulta, sem nada no meio", async () => {
    const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro: emissor() });
    await ligar(t, { cnpj: MEI_BARBEARIA.cnpj });

    expect(fiscal.remendos).toHaveLength(2);
    expect(fiscal.remendos[1]).toMatchObject({ empresaId: 9001 });
  });

  it("não põe código nacional em empresa que vai pelo caminho municipal", async () => {
    const cadastro = emissor({
      consultarCnpj: vi.fn(async () => ({ ...MEI_BARBEARIA, optanteMei: false, optanteSimples: true })),
    });
    const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro });

    const e = await ligar(t, { cnpj: MEI_BARBEARIA.cnpj });

    expect(e.caminho).toBe("municipal");
    expect(e.config.codigoTributacaoNacional).toBeNull();
  });

  describe("as recusas, e todas com frase que o dono entende", () => {
    it("CNPJ com menos de 14 dígitos", async () => {
      const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro: emissor() });
      await expect(ligar(t, { cnpj: "123" })).rejects.toBeInstanceOf(DadoInvalido);
    });

    it("CNPJ que a Receita não conhece", async () => {
      const ligar = criarLigarNotaFiscal({
        fiscal: fiscal.r, cadastro: emissor({ consultarCnpj: vi.fn(async () => null) }),
      });
      await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).rejects.toThrow(/não encontrei esse cnpj/i);
    });

    /* Melhor dizer agora do que na primeira nota — quando o cliente já contou com ela. */
    it("CNPJ baixado, e a frase repete a situação que a Receita deu", async () => {
      const ligar = criarLigarNotaFiscal({
        fiscal: fiscal.r,
        cadastro: emissor({ consultarCnpj: vi.fn(async () => ({ ...MEI_BARBEARIA, situacao: "baixada" })) }),
      });
      await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).rejects.toThrow(/baixada/);
    });

    /* ⚠️ Situação NULA não barra: ausência de informação não é informação de ausência. */
    it("situação nula não impede — não sabemos, e presumir 'inativa' travaria quem está ativo", async () => {
      const ligar = criarLigarNotaFiscal({
        fiscal: fiscal.r,
        cadastro: emissor({ consultarCnpj: vi.fn(async () => ({ ...MEI_BARBEARIA, situacao: null })) }),
      });
      await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).resolves.toBeTruthy();
    });

    it("sem município não dá para emitir, e o erro fala do CNPJ", async () => {
      const ligar = criarLigarNotaFiscal({
        fiscal: fiscal.r,
        cadastro: emissor({ consultarCnpj: vi.fn(async () => ({ ...MEI_BARBEARIA, codigoMunicipio: null })) }),
      });
      await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).rejects.toThrow(/município/i);
    });

    it("emissor não configurado no ambiente recusa antes de chamar a Receita", async () => {
      const cadastro = emissor({ faltando: () => ["FOCUS_NFE_TOKEN"] });
      const ligar = criarLigarNotaFiscal({ fiscal: fiscal.r, cadastro });
      await expect(ligar(t, { cnpj: MEI_BARBEARIA.cnpj })).rejects.toThrow(/FOCUS_NFE_TOKEN/);
      expect(cadastro.consultarCnpj).not.toHaveBeenCalled();
    });
  });
});

describe("o certificado", () => {
  it("exige o CNPJ ligado antes — não há empresa para instalar nada", async () => {
    const fiscal = repo();
    const enviar = criarEnviarCertificado({ fiscal: fiscal.r, cadastro: emissor() });
    await expect(enviar(t, { pfxBase64: "AAAA", senha: "1234" })).rejects.toThrow(/CNPJ/i);
  });

  it("instala e guarda só o vencimento", async () => {
    const fiscal = repo({ ...VAZIA, cnpj: MEI_BARBEARIA.cnpj, empresaId: 9001 });
    const enviar = criarEnviarCertificado({ fiscal: fiscal.r, cadastro: emissor() });

    const e = await enviar(t, { pfxBase64: "AAAA", senha: "1234" });
    expect(e.config.certificadoValidoAte).toBe("2027-08-17");

    /* ⚠️ O que foi gravado é SÓ o vencimento. Nem arquivo, nem senha — ver a porta. */
    expect(fiscal.remendos.at(-1)).toEqual({ certificadoValidoAte: "2027-08-17" });
  });

  it("recusa arquivo grande antes de subir, para o timeout não parecer 'emissor fora do ar'", async () => {
    const fiscal = repo({ ...VAZIA, cnpj: MEI_BARBEARIA.cnpj, empresaId: 9001 });
    const cadastro = emissor();
    const enviar = criarEnviarCertificado({ fiscal: fiscal.r, cadastro });

    await expect(enviar(t, { pfxBase64: "A".repeat(1_400_001), senha: "1234" }))
      .rejects.toThrow(/grande demais/i);
    expect(cadastro.enviarCertificado).not.toHaveBeenCalled();
  });

  it("sem senha não vai — a Focus não instala certificado sem ela", async () => {
    const fiscal = repo({ ...VAZIA, cnpj: MEI_BARBEARIA.cnpj, empresaId: 9001 });
    const enviar = criarEnviarCertificado({ fiscal: fiscal.r, cadastro: emissor() });
    await expect(enviar(t, { pfxBase64: "AAAA", senha: "" })).rejects.toThrow(/senha/i);
  });
});

describe("virar a chave para produção", () => {
  /* ⚠️ É A ÚNICA BARREIRA entre "configurei metade" e um documento fiscal torto. Nota em
   * produção não se apaga: cancela-se na prefeitura, e algumas cidades não aceitam
   * cancelamento por webservice nenhum. */
  it("recusa enquanto faltar qualquer coisa, e diz o que falta", async () => {
    const fiscal = repo({ ...VAZIA, cnpj: MEI_BARBEARIA.cnpj, codigoMunicipio: "3550308", empresaId: 9001, optanteMei: true, codigoTributacaoNacional: "060101" });
    const liberar = criarLiberarProducaoFiscal({ fiscal: fiscal.r, cadastro: emissor() });

    await expect(liberar(t)).rejects.toThrow(/certificado/i);
    expect(fiscal.atual().ambiente).toBe("homologacao");
  });

  it("libera quando está tudo pronto", async () => {
    const fiscal = repo({
      ...VAZIA, cnpj: MEI_BARBEARIA.cnpj, codigoMunicipio: "3550308", empresaId: 9001,
      optanteMei: true, codigoTributacaoNacional: "060101", certificadoValidoAte: "2099-01-01",
    });
    const liberar = criarLiberarProducaoFiscal({ fiscal: fiscal.r, cadastro: emissor() });

    const e = await liberar(t);
    expect(e.config.ambiente).toBe("producao");
  });
});

describe("ler o estado", () => {
  it("de quem nunca ligou: o que falta começa pelo CNPJ", async () => {
    const ler = criarLerEstadoFiscal({ fiscal: repo().r, cadastro: emissor() });
    const e = await ler(t);
    expect(e.falta[0]).toBe("o CNPJ de quem emite");
    expect(e.provedorFaltando).toEqual([]);
  });

  it("repassa o que falta no ambiente, para a tela não culpar o cliente", async () => {
    const ler = criarLerEstadoFiscal({
      fiscal: repo().r, cadastro: emissor({ faltando: () => ["FOCUS_NFE_TOKEN"] }),
    });
    expect((await ler(t)).provedorFaltando).toEqual(["FOCUS_NFE_TOKEN"]);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * LIGAR O RECIBO — o outro lado da bifurcação.
 *
 * ★ O QUE ESTES TESTES PRENDEM É UMA AUSÊNCIA: depois de ligar, `falta` fica VAZIO sem
 * ninguém ter enviado certificado, criado empresa ou consultado a Receita. Se algum dia
 * alguém acrescentar uma exigência de CNPJ na função compartilhada, é aqui que quebra.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("ligar o Receita Saúde", () => {
  it("grava CPF, ocupação e registro — e não fala com o provedor da nota", async () => {
    const { r, atual } = repo();
    const cadastro = emissor();
    const ligar = criarLigarReciboSaude({ fiscal: r, cadastro, emissor: canal() });

    const estado = await ligar(t, { cpf: "123.456.789-09", ocupacao: "psicologo", registro: "CRP 06/123456" });

    expect(atual().prestadorCpf).toBe("12345678909");
    expect(atual().ocupacaoSaude).toBe("psicologo");
    expect(atual().registroProfissional).toBe("CRP 06/123456");
    expect(estado.caminho).toBe("recibo_saude");
    /* Nenhuma das três chamadas que custam dinheiro ou dependem de rede. */
    expect(cadastro.consultarCnpj).not.toHaveBeenCalled();
    expect(cadastro.criarEmpresa).not.toHaveBeenCalled();
    expect(cadastro.enviarCertificado).not.toHaveBeenCalled();
  });

  /* ★ A AUSÊNCIA QUE É O PRODUTO. */
  it("fica pronto para emitir SEM certificado digital", async () => {
    const { r } = repo();
    const ligar = criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() });
    const estado = await ligar(t, { cpf: "12345678909", ocupacao: "fisioterapeuta", registro: null });
    expect(estado.falta).toEqual([]);
  });

  /* Não existe homologação neste caminho — o ensaio é o "Analisar Arquivo" do e-CAC. Deixar
   * em homologação faria a tela estampar "modo teste" sobre o arquivo que ela vai importar. */
  it("nasce em produção", async () => {
    const { r, atual } = repo();
    await criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() })(t, { cpf: "12345678909", ocupacao: "psicologo" });
    expect(atual().ambiente).toBe("producao");
  });

  it("recusa CPF que não tem 11 dígitos", async () => {
    const { r } = repo();
    await expect(criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() })(t, { cpf: "123", ocupacao: "psicologo" }))
      .rejects.toBeInstanceOf(DadoInvalido);
  });

  /* A lista de ocupações é fechada pela Receita: nutricionista não está nela, e um código
   * inventado só falha na análise do arquivo, depois, com mensagem que fala do CSV. */
  it("recusa profissão fora da lista da Receita", async () => {
    const { r } = repo();
    await expect(criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() })(
      t, { cpf: "12345678909", ocupacao: "nutricionista" as never },
    )).rejects.toBeInstanceOf(DadoInvalido);
  });

  /* Virar o caminho com empresa já criada deixaria um CNPJ vivo e cobrado no provedor, com o
   * dono achando que "desligou a nota fiscal". */
  it("recusa trocar de caminho quando já existe empresa no emissor", async () => {
    const { r } = repo({ ...VAZIA, cnpj: "12345678000123", empresaId: 9001, optanteMei: true });
    await expect(criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() })(
      t, { cpf: "12345678909", ocupacao: "psicologo" },
    )).rejects.toThrow(/já está ligado com CNPJ/i);
  });

  it("corta o registro profissional em 15 caracteres, como o arquivo exige", async () => {
    const { r, atual } = repo();
    await criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: canal() })(
      t, { cpf: "12345678909", ocupacao: "psicologo", registro: "CRP 06/123456789012345" },
    );
    expect(atual().registroProfissional).toHaveLength(15);
  });

  /* ★ O PEDIDO DE 29/09/2026: o que ela preenche no card é o que habilita ela no canal. Antes
   * disso, todo emissor na Rebots nascia de um `POST /issuers` feito à mão. */
  it("habilita a profissional no canal de emissão com os mesmos dados que grava", async () => {
    const { r } = repo();
    const c = canal();
    await criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: c })(
      t, { cpf: "123.456.789-09", ocupacao: "psicologo", registro: " CRP 06/123456 " },
    );
    expect(c.cadastrarEmissor).toHaveBeenCalledWith(t, {
      cpf: "12345678909", ocupacao: "psicologo", registroProfissional: "CRP 06/123456",
    });
  });

  /* O canal recusa criar emissor sem registro. O salvamento continua valendo — é por ele que o
   * editor de `LoteReceitaSaude` grava a autorização. */
  it("sem registro, grava e não chama o canal", async () => {
    const { r, atual } = repo();
    const c = canal();
    await criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: c })(
      t, { cpf: "12345678909", ocupacao: "psicologo", registro: "   " },
    );
    expect(c.cadastrarEmissor).not.toHaveBeenCalled();
    expect(atual().prestadorCpf).toBe("12345678909");
  });

  /* Recusa do canal é dado errado: nada gravado, e a frase dele vai para a tela. */
  it("canal recusando o dado não grava nada", async () => {
    const { r, remendos } = repo();
    const c = canal(async () => { throw new DadoInvalido("CPF em formato inválido", "rebots"); });
    await expect(criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: c })(
      t, { cpf: "12345678909", ocupacao: "psicologo", registro: "CRP 06/123456" },
    )).rejects.toThrow(/CPF em formato inválido/);
    expect(remendos).toEqual([]);
  });

  /* Queda do fornecedor não trava o onboarding: a emissão habilita de novo antes de cada recibo. */
  it("canal fora do ar não impede de gravar", async () => {
    const { r, atual } = repo();
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = canal(async () => { throw new Error("O canal de emissão está fora do ar (503)."); });
    const estado = await criarLigarReciboSaude({ fiscal: r, cadastro: emissor(), emissor: c })(
      t, { cpf: "12345678909", ocupacao: "psicologo", registro: "CRP 06/123456" },
    );
    expect(estado.caminho).toBe("recibo_saude");
    expect(atual().registroProfissional).toBe("CRP 06/123456");
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
