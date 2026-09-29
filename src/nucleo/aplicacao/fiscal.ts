/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — ligar a nota fiscal, que é o nosso maior diferencial.
 *
 * ★ A REGRA QUE ORGANIZA ESTE ARQUIVO, na palavra do Bruno (17/08/2026):
 *   "quanto menos perguntas no onboarding sempre melhor."
 *
 * Então o fluxo faz UMA pergunta — o CNPJ — e deriva todo o resto:
 *
 *   14 dígitos ──► Receita ──► razão social · município · CNAE · optante_mei
 *                                                          │
 *                              ┌───────────────────────────┘
 *                              ▼
 *              MEI? ──sim──► caminho NACIONAL (DPS em /v2/nfsen)
 *                   └──não──► caminho MUNICIPAL (NFS-e da prefeitura)
 *
 * O que NÃO se pergunta, e por quê:
 *   endereço ............. vem da Receita
 *   inscrição municipal .. o DPS nacional não tem o campo
 *   código de serviço .... nacional é tabela única; derivado da vertical do negócio
 *   regime tributário .... `optante_mei` / `optante_simples_nacional` da Receita
 *   ambiente ............. nasce homologação, sempre. Virar é decisão, não pergunta
 *
 * Sobra um passo humano e só um: **o certificado digital**. Não é pergunta, é entrega — e
 * é o único ponto do produto onde o cliente precisa trazer algo de fora.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  ConsultarCnpj, EnviarCertificado, EstadoFiscal, LerEstadoFiscal, LiberarProducaoFiscal,
  LigarNotaFiscal, LigarReciboSaude,
} from "../portas/entrada/casos-de-uso";
import type { CadastroDeEmissor } from "../portas/saida/cadastro-de-emissor";
import type { EmissorDeReciboSaude } from "../portas/saida/emissor-recibo";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { CadastroDoCnpj, ConfigFiscal } from "../dominio/fiscal";
import { caminhoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { CODIGO_OCUPACAO } from "../dominio/recibo-saude";
import { cpfValido, soDigitos } from "../dominio/clientes";
import { DadoInvalido } from "../dominio/erros";
import { hojeISO } from "../dominio/tempo";

export type DepsFiscal = {
  fiscal: RepositorioFiscal;
  cadastro: CadastroDeEmissor;
};

/** O caminho do recibo fala com um canal a mais: quem emite o Receita Saúde por ela. */
export type DepsLigarReciboSaude = DepsFiscal & {
  emissor: EmissorDeReciboSaude;
};

/**
 * O código de tributação nacional a partir do CNAE — o único campo fiscal que a MAISA
 * adivinha, e a última pergunta que ela consegue não fazer.
 *
 * `codigo_tributacao_nacional_iss` do DPS: os dígitos do subitem da LC 116 mais dois de
 * desdobro. Item 6.01 da LC 116 — "Barbearia, cabeleireiros, manicuros, pedicuros e
 * congêneres" — vira **060101**.
 *
 * ── POR QUE PELO CNAE, E NÃO PELA VERTICAL DO NEGÓCIO ──
 *
 * Porque a vertical é rótulo de marketing e o CNAE é o que a Receita registrou. "terapeutas"
 * abriga psicóloga, fisioterapeuta e nutricionista, e cada uma tem subitem próprio na LC 116
 * (4.16, 4.08, 4.10). Derivar do grupo poria o código de fisioterapia na nota de uma
 * psicóloga. O CNAE vem de graça na consulta de CNPJ e distingue as três.
 *
 * ── ⚠️ O MAPA COMEÇA COM UMA ENTRADA, E A LISTA CURTA É HONESTA ──
 *
 * Só entra aqui o que está **confirmado**. CNAE sem entrada cai em `null`, `fiscalFaltando`
 * pede "o código do serviço", e a tela faz UMA pergunta. Isso é melhor do que o alternativo:
 * chutar o desdobro de um subitem para a tela ficar verde e a Receita recusar a nota de
 * alguém — ou pior, autorizar sob o código errado, que é problema fiscal do cliente e não
 * bug nosso de resolver.
 *
 * E mesmo o 060101 é PADRÃO, não verdade: o valor real mora em
 * `config_fiscal.codigo_tributacao_nacional` — coluna, para ser corrigido sem deploy. A
 * verificação não é revisão de código, é **uma emissão em homologação**: não tem efeito
 * fiscal e é a única prova que vale.
 */
const CODIGO_NACIONAL_POR_CNAE: { prefixo: string; codigo: string; oQueE: string }[] = [
  /* 9602-5/01 — cabeleireiros, manicure e pedicure. LC 116 item 6.01 → 06.01.01. */
  { prefixo: "96025", codigo: "060101", oQueE: "barbearia, cabeleireiros, manicure e pedicure" },
];

export function codigoNacionalDoCnae(cnae: string | null | undefined): string | null {
  const d = String(cnae ?? "").replace(/\D/g, "");
  if (!d) return null;
  return CODIGO_NACIONAL_POR_CNAE.find((e) => d.startsWith(e.prefixo))?.codigo ?? null;
}

/** Monta o `EstadoFiscal` a partir da config — um lugar só, para as telas não divergirem. */
function estado(config: ConfigFiscal, provedorFaltando: string[]): EstadoFiscal {
  return {
    config,
    caminho: caminhoDaNota(config, hojeISO()),
    falta: fiscalFaltando(config, hojeISO()),
    provedorFaltando,
  };
}

export function criarLerEstadoFiscal(deps: DepsFiscal): LerEstadoFiscal {
  return async (t) => estado(await deps.fiscal.ler(t), deps.cadastro.faltando());
}

export function criarConsultarCnpj(deps: Pick<DepsFiscal, "cadastro">): ConsultarCnpj {
  return async (_t, cnpj) => {
    const d = soDigitos(cnpj);
    if (d.length !== 14) throw new DadoInvalido("CNPJ precisa ter 14 dígitos.", "cnpj");
    return deps.cadastro.consultarCnpj(d);
  };
}

/**
 * Liga a nota fiscal — a única pergunta do fluxo.
 *
 * ⚠️ A ORDEM DE GRAVAÇÃO É A PARTE DELICADA. `criarEmpresa` não é idempotente e o provedor
 * não deduplica por CNPJ: se a empresa fosse criada e a gravação do id falhasse, a próxima
 * tentativa criaria uma SEGUNDA empresa com o mesmo CNPJ — e isso só se resolve à mão no
 * painel do provedor. Por isso:
 *
 *   1. já tem `empresaId`? devolve o estado. Não cria nada. (protege o duplo clique)
 *   2. consulta o CNPJ e grava o que a Receita disse
 *   3. cria a empresa
 *   4. grava o `empresaId` IMEDIATAMENTE, antes de qualquer outra coisa poder falhar
 *
 * O passo 2 antes do 3 é deliberado: se a criação falhar, o que a Receita respondeu já
 * está salvo e a tela mostra o nome da empresa em vez de voltar ao campo vazio.
 */
export function criarLigarNotaFiscal(deps: DepsFiscal): LigarNotaFiscal {
  return async (t, p) => {
    const faltaProvedor = deps.cadastro.faltando();
    if (faltaProvedor.length) {
      throw new DadoInvalido(`O emissor de notas não está configurado: falta ${faltaProvedor.join(", ")}.`, "provedor");
    }

    const atual = await deps.fiscal.ler(t);
    /* 1 · já ligado. Não é erro, e não é motivo para criar outra empresa. */
    if (atual.empresaId) return estado(atual, faltaProvedor);

    const d = soDigitos(p.cnpj);
    if (d.length !== 14) throw new DadoInvalido("CNPJ precisa ter 14 dígitos.", "cnpj");

    /* 2 · o que a Receita sabe. */
    const cadastro = await deps.cadastro.consultarCnpj(d);
    if (!cadastro) throw new DadoInvalido("Não encontrei esse CNPJ na Receita. Confira os números.", "cnpj");
    if (!cadastro.codigoMunicipio) {
      throw new DadoInvalido("A Receita não devolveu o município desse CNPJ — não dá para emitir sem ele.", "cnpj");
    }
    /* CNPJ baixado ou suspenso não emite, e é melhor dizer agora do que na primeira nota.
     * `situacao` nula não barra: ausência de informação não é informação de ausência. */
    if (cadastro.situacao && cadastro.situacao.toLowerCase() !== "ativa") {
      throw new DadoInvalido(`Esse CNPJ está "${cadastro.situacao}" na Receita. Nota fiscal só sai de CNPJ ativo.`, "cnpj");
    }

    const salvo = await deps.fiscal.salvar(t, {
      cnpj: cadastro.cnpj,
      razaoSocial: cadastro.razaoSocial,
      codigoMunicipio: cadastro.codigoMunicipio,
      optanteMei: cadastro.optanteMei,
      optanteSimples: cadastro.optanteSimples,
      /* Só preenche o código nacional quando o caminho é o nacional — pôr um código de
       * DPS numa empresa municipal seria dado morto que alguém depois lê como verdade. */
      ...(cadastro.optanteMei ? { codigoTributacaoNacional: codigoNacionalDoCnae(cadastro.cnae) } : {}),
    });

    /* 3 · cadastra no emissor. */
    const empresa = await deps.cadastro.criarEmpresa(t, {
      cnpj: cadastro.cnpj,
      nome: cadastro.razaoSocial ?? cadastro.cnpj,
      nacional: cadastro.optanteMei,
      optanteMei: cadastro.optanteMei,
      optanteSimples: cadastro.optanteSimples,
      email: p.email ?? null,
      municipio: cadastro.municipio,
      uf: cadastro.uf,
    });

    /* 4 · o id, antes de mais nada. */
    const comEmpresa = await deps.fiscal.salvar(t, {
      empresaId: empresa.id,
      certificadoValidoAte: empresa.certificadoValidoAte,
    });

    return estado({ ...salvo, ...comEmpresa }, faltaProvedor);
  };
}

/**
 * Repassa o certificado A1. O arquivo não fica com a gente — ver a porta.
 *
 * A validação de tamanho é aqui, e não na rota, porque é regra: um A1 de verdade tem
 * poucos KB. Recusar 20 MB antes de subir evita um timeout que a tela leria como "o
 * emissor está fora do ar".
 */
export function criarEnviarCertificado(deps: DepsFiscal): EnviarCertificado {
  return async (t, p) => {
    const config = await deps.fiscal.ler(t);
    if (!config.empresaId) {
      throw new DadoInvalido("Informe o CNPJ antes de enviar o certificado.", "cnpj");
    }
    if (!p.pfxBase64?.trim()) throw new DadoInvalido("Escolha o arquivo do certificado (.pfx ou .p12).", "certificado");
    if (!p.senha) throw new DadoInvalido("O certificado precisa da senha para ser instalado.", "senha");

    /* ~1,3 MB de base64 ≈ 1 MB de arquivo. Um A1 tem alguns KB; o que passa disso é
     * outra coisa (alguém escolheu o arquivo errado). */
    if (p.pfxBase64.length > 1_400_000) {
      throw new DadoInvalido("Esse arquivo é grande demais para um certificado A1. Confira se escolheu o .pfx.", "certificado");
    }

    const empresa = await deps.cadastro.enviarCertificado(t, config.empresaId, p);
    const salvo = await deps.fiscal.salvar(t, { certificadoValidoAte: empresa.certificadoValidoAte });
    return estado(salvo, deps.cadastro.faltando());
  };
}

/**
 * Vira a chave para produção.
 *
 * ⚠️ RECUSA ENQUANTO FALTAR QUALQUER COISA, e essa é a única barreira entre "configurei
 * metade" e um documento fiscal torto. Nota emitida em produção não se apaga: cancela-se
 * na prefeitura, com justificativa, e algumas cidades não aceitam cancelamento por
 * webservice nenhum.
 */
export function criarLiberarProducaoFiscal(deps: DepsFiscal): LiberarProducaoFiscal {
  return async (t) => {
    const config = await deps.fiscal.ler(t);
    const falta = fiscalFaltando(config, hojeISO());
    if (falta.length) {
      throw new DadoInvalido(`Ainda falta ${falta.join(", ")} antes de emitir nota valendo.`, "fiscal");
    }
    const salvo = await deps.fiscal.salvar(t, { ambiente: "producao" });
    return estado(salvo, deps.cadastro.faltando());
  };
}

/**
 * Liga o caminho do recibo — o onboarding fiscal de quem atende como pessoa física.
 *
 * ★ TRÊS CAMPOS E UMA CHAMADA EXTERNA, QUE NÃO CUSTA NADA DESFAZER. Não há CNPJ para consultar
 * na Receita (é o próprio caso), não há empresa para criar no provedor e não há certificado para
 * instalar. A única conversa com o mundo é habilitar a profissional no canal de emissão
 * (`cadastrarEmissor`) — e ela é idempotente pela porta: na Rebots, `enable` cria quem não existe
 * e atualiza ocupação e registro de quem existe. Salvar de novo é seguro, e é o que conserta.
 *
 * ── ⚠️ O CANAL ANTES DO BANCO, E SÓ A RECUSA DO DADO PARA O SALVAMENTO ──
 *
 * 4xx do canal (`DadoInvalido`) é dado errado: nada é gravado e a frase vai para a tela, que é
 * onde ela pode ser consertada. Canal fora do ar NÃO segura o onboarding: grava assim mesmo, e a
 * emissão habilita de novo antes de cada recibo (`criarEmitirRecibo`). Travar o salvamento por
 * queda de um fornecedor faria a terapeuta achar que o CPF dela está errado.
 *
 * Sem registro do conselho, não habilita: o canal recusa criar emissor sem ele, e a emissão já
 * está bloqueada por `faltaParaEmitirRecibo`. O registro segue opcional AQUI porque o editor de
 * `LoteReceitaSaude` salva a autorização por este mesmo caso de uso.
 *
 * ⚠️ `ambiente: "producao"`, e não o `homologacao` padrão. Não existe homologação neste
 * caminho: o ensaio é o "Analisar Arquivo" do e-CAC, que acontece fora do nosso app. Deixar
 * em homologação faria a tela de Faturamento estampar "isto é teste" sobre o arquivo que ela
 * vai realmente importar — e aqui isso é seguro, porque um CSV é inerte até alguém assiná-lo
 * no e-CAC. É o oposto da nota fiscal, onde produção significa documento irreversível e por
 * isso tem `criarLiberarProducaoFiscal` como cancela.
 */
export function criarLigarReciboSaude(deps: DepsLigarReciboSaude): LigarReciboSaude {
  return async (t, p) => {
    const cpf = soDigitos(p.cpf);
    /* O CPF de quem emite é o que a Receita casa com o Carnê-Leão. Errar um dígito aqui faz
     * o arquivo inteiro ser recusado, linha por linha, e a mensagem fala do arquivo. */
    if (!cpfValido(cpf)) throw new DadoInvalido("Esse CPF não é válido — confira os dígitos.", "cpf");
    if (!(p.ocupacao in CODIGO_OCUPACAO)) {
      throw new DadoInvalido("Escolha a profissão registrada no seu conselho.", "ocupacao");
    }

    const atual = await deps.fiscal.ler(t);
    /* ⚠️ RECUSA TROCAR DE CAMINHO COM EMPRESA JÁ CRIADA. Existe um CNPJ cadastrado (e
     * cobrado) no provedor: virar este negócio para pessoa física deixaria a empresa lá,
     * viva, e o dono acharia que "desligou a nota fiscal". Quem precisa disso está migrando
     * de regime, e migração de regime não é campo de tela. */
    if (atual.empresaId) {
      throw new DadoInvalido(
        "Esse negócio já está ligado com CNPJ. Fale com a gente antes de mudar para pessoa física.",
        "cnpj",
      );
    }

    /* ⚠️ O DOCUMENTO DO PROCURADOR É VALIDADO, e o motivo é o mesmo do CPF acima: ele vai ser
     * digitado na tela "Alterar perfil de acesso" do e-CAC, e um dígito a mais faz a troca de
     * perfil falhar com uma mensagem que fala de procuração, não de digitação. */
    const procurador = p.procurador === undefined ? undefined : soDigitos(p.procurador ?? "") || null;
    if (procurador && procurador.length !== 11 && procurador.length !== 14) {
      throw new DadoInvalido("O documento de quem emite por você tem que ser um CPF ou um CNPJ.", "procurador");
    }

    const registro = p.registro?.trim().slice(0, 15) || null;
    if (registro) {
      try {
        await deps.emissor.cadastrarEmissor(t, { cpf, ocupacao: p.ocupacao, registroProfissional: registro });
      } catch (e) {
        if (e instanceof DadoInvalido) throw e;
        console.error(`[ligarReciboSaude] canal de emissão indisponível para ${t.tenantId} — gravando mesmo assim`, e);
      }
    }

    const salvo = await deps.fiscal.salvar(t, {
      prestadorCpf: cpf,
      ocupacaoSaude: p.ocupacao,
      registroProfissional: registro,
      ...(procurador !== undefined ? { procuradorDocumento: procurador } : {}),
      ...("procuracaoAte" in p ? { procuracaoValidaAte: p.procuracaoAte || null } : {}),
      ...("procuracaoAceitaEm" in p ? { procuracaoAceitaEm: p.procuracaoAceitaEm || null } : {}),
      ambiente: "producao",
    });
    return estado(salvo, deps.cadastro.faltando());
  };
}

/** Reexportado para o teste e para quem monta a tela. */
export type { CadastroDoCnpj };
