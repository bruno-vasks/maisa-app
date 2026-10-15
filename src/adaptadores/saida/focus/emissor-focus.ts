/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a Focus NFe cumprindo a porta `EmissorFiscal`. ⚠️ SÓ SERVIDOR.
 *
 * Aqui mora a tradução do vocabulário da Receita e da prefeitura para o nosso:
 * "processando_autorizacao" → "processando", "erro_autorizacao" → "erro". O núcleo nunca
 * vê uma string da Focus.
 *
 * ── ★ A BIFURCAÇÃO QUE DÁ SENTIDO A ESTE ARQUIVO ──
 *
 *   MEI  → DPS no Ambiente Nacional (`/v2/nfsen`, `nfsen.ts`)
 *   resto → NFS-e no formato da prefeitura (`/v2/nfse`, `focus.ts`)
 *
 *   "Para MEI a emissão via Ambiente Nacional é obrigatória, independente do município,
 *    desde setembro de 2023."   — guia dos municípios da NFS-e Nacional, Focus NFe (2026)
 *
 * O ICP da MAISA é quase todo MEI, e até 17/08/2026 este adaptador mandava TODO MUNDO pelo
 * caminho municipal. ⚠️ O erro não aparecia na emissão: a Focus aceita, devolve 202
 * "processando", e a recusa chega minutos depois no `GET`. Quem olha a tela vê "processando"
 * e conclui que está lento.
 *
 * ── OS TRÊS MODOS, E A DIFERENÇA IMPORTA ──
 *
 *   sem token da conta ................. `simulado` — fluxo inteiro, nada real
 *   token, mas falta dado do inquilino . `NaoConfigurado` — não arrisca emitir errado
 *   tudo pronto ........................ emissão de verdade (homologação ou produção)
 *
 * ── ⚠️ O TOKEN DE EMISSÃO É PEDIDO AQUI, E DESCARTADO AQUI ──
 *
 * `ConfigFiscal` traz o `empresaId`, nunca a credencial. O token da empresa vem de
 * `conta.ts` (autenticado com o token da CONTA) no instante da emissão e morre com a
 * função. Nenhuma credencial de cliente atravessa o núcleo nem encosta no nosso banco.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { EmissorFiscal } from "@/nucleo/portas/saida/emissor-fiscal";
import type { ConfigFiscal, ResultadoDeNota } from "@/nucleo/dominio/fiscal";
import { caminhoDaNota, fiscalFaltando } from "@/nucleo/dominio/fiscal";
import { FalhaDoProvedor, NaoConfigurado } from "@/nucleo/dominio/erros";
import { hojeISO } from "@/nucleo/dominio/tempo";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { NF_CONFIG } from "./config";
import { tokenDaEmpresa } from "./conta";
import { cancelarNfse, consultarNfse, emitirNfse, normalizarStatus } from "./focus";
import { cancelarDps, consultarDps, emitirDps } from "./nfsen";
import type { EmissaoInput, Prestador } from "./prestador";
import { numeroSimulado, urlDoPdfSimulado } from "./nota-simulada";

const JUSTIFICATIVA_PADRAO =
  "Cancelamento automatico de nota emitida para teste de integracao MAISA.";

/** Erros da Focus (ou da prefeitura) no formato que a UI já sabe mostrar. */
const errosDe = (data: any, padrao: string) =>
  data?.erros ?? [{ mensagem: data?.mensagem ?? padrao }];

/** Sem token de conta nada é real — e o fluxo inteiro continua exercitável. */
const semEmissor = () => !NF_CONFIG.token;

/**
 * Traduz a `ConfigFiscal` do inquilino para o prestador da Focus, buscando o token.
 *
 * Lança `NaoConfigurado` com as frases de `fiscalFaltando` — as mesmas que a tela mostra,
 * para o erro da API e o aviso da tela nunca contarem histórias diferentes.
 */
async function prestadorDe(config: ConfigFiscal): Promise<Prestador> {
  const falta = fiscalFaltando(config, hojeISO());
  if (falta.length) throw new NaoConfigurado(falta);

  /* `empresaId` não é nulo aqui: `fiscalFaltando` já barraria. O `!` seria suficiente,
   * mas a checagem explícita sobrevive a alguém mexer na função do domínio. */
  const id = config.empresaId;
  if (id == null) throw new NaoConfigurado(["cadastrar o CNPJ no emissor"]);

  const token = await tokenDaEmpresa(id, config.ambiente);
  if (!token) {
    /* Empresa existe e não tem token naquele ambiente — acontece quando o ambiente não
     * está habilitado no cadastro dela. É configuração, não falha de rede. */
    throw new NaoConfigurado([
      `habilitar ${config.ambiente === "producao" ? "a produção" : "a homologação"} da nota fiscal no emissor`,
    ]);
  }

  return {
    cnpj: soDigitos(config.cnpj),
    codigoMunicipio: soDigitos(config.codigoMunicipio),
    ambiente: config.ambiente,
    optanteMei: config.optanteMei,
    optanteSimples: config.optanteSimples,
    token,
    codigoTributacaoNacional: config.codigoTributacaoNacional,
    inscricaoMunicipal: config.inscricaoMunicipal,
    itemListaServico: config.itemListaServico,
    aliquotaIss: config.aliquotaIss,
    codigoTributarioMunicipio: config.codigoTributarioMunicipio,
    naturezaOperacao: NF_CONFIG.naturezaOperacao,
  };
}

/** Todo retorno carrega ambiente e simulado — ver o ⚠️ de `ResultadoDeNota`. */
const marca = (r: Omit<ResultadoDeNota, "ambiente" | "simulado">, config: ConfigFiscal): ResultadoDeNota => ({
  ...r,
  ambiente: config.ambiente,
  simulado: false,
});

export const emissorFocus: EmissorFiscal = {
  async emitir(_t, config, p): Promise<ResultadoDeNota> {
    if (semEmissor()) {
      /* Em homologação a simulada sai com número e PDF, como a de verdade — ver
       * `nota-simulada.ts`. Em produção, sem documento: PDF com cara de nota num negócio que
       * acha que está faturando é o erro que não se desfaz. */
      const comDocumento = config.ambiente === "homologacao";
      const pdf = comDocumento ? urlDoPdfSimulado(p.ref) : null;
      return {
        status: "simulado", ref: p.ref, ambiente: config.ambiente, simulado: true,
        ...(pdf ? { numero: numeroSimulado(), pdf } : {}),
      };
    }

    const prestador = await prestadorDe(config);
    const nacional = caminhoDaNota(config, hojeISO()) === "nacional";
    const input: EmissaoInput = {
      ref: p.ref,
      valorServicos: p.valor,
      discriminacao: p.discriminacao,
      tomador: {
        cpf: p.tomador.cpf,
        cnpj: p.tomador.cnpj,
        razaoSocial: p.tomador.nome,
        email: p.tomador.email,
        telefone: p.tomador.telefone,
      },
    };

    /* Log da config EFETIVA, sem segredo. É o que responde em dez segundos a pergunta
     * "por que a nota deste cliente foi recusada" — e o `caminho` é o primeiro suspeito. */
    console.log("[nf/emitir] config efetiva", {
      ref: p.ref,
      caminho: nacional ? "nacional" : "municipal",
      ambiente: prestador.ambiente,
      prestador_cnpj: prestador.cnpj,
      codigo_municipio: prestador.codigoMunicipio,
      codigo_nacional: prestador.codigoTributacaoNacional,
      item_lista_servico: prestador.itemListaServico,
      tomador_doc: soDigitos(p.tomador.cnpj || p.tomador.cpf),
    });

    let httpStatus: number;
    let data: any;
    try {
      ({ httpStatus, data } = nacional
        ? await emitirDps(prestador, input)
        : await emitirNfse(prestador, input));
    } catch (e) {
      console.error("[nf/emitir] erro de conexão com a Focus", { ref: p.ref, erro: String(e) });
      throw new FalhaDoProvedor("Erro de conexão com a Focus NFe.", e);
    }

    if (data?.status === "autorizado") {
      return marca({
        status: "autorizado",
        ref: p.ref,
        numero: data.numero,
        url: data.url,
        pdf: data.url_danfse,
        xml: data.caminho_xml_nota_fiscal,
      }, config);
    }
    // 202 accepted / processando_autorizacao → assíncrono, quem pediu faz polling.
    if (httpStatus === 202 || data?.status === "processando_autorizacao") {
      return marca({ status: "processando", ref: p.ref }, config);
    }

    console.error("[nf/emitir] Focus rejeitou (síncrono)", {
      ref: p.ref, httpStatus, status: data?.status, erros: data?.erros ?? data?.mensagem,
    });
    return marca({ status: "erro", ref: p.ref, erros: errosDe(data, "Falha ao emitir a nota.") }, config);
  },

  async consultar(_t, config, ref): Promise<ResultadoDeNota> {
    if (semEmissor()) return { status: "simulado", ref, ambiente: config.ambiente, simulado: true };

    const prestador = await prestadorDe(config);
    const nacional = caminhoDaNota(config, hojeISO()) === "nacional";

    let data: any;
    try {
      ({ data } = nacional ? await consultarDps(prestador, ref) : await consultarNfse(prestador, ref));
    } catch (e) {
      throw new FalhaDoProvedor("Erro ao consultar a Focus NFe.", e);
    }

    const status = normalizarStatus(data?.status);
    /* ⚠️ A REJEIÇÃO FISCAL CHEGA AQUI, e nunca na resposta da emissão. No caminho nacional
     * é a Receita; no municipal, a prefeitura ("Código de Serviço inexistente"). */
    if (status === "erro") {
      console.error("[nf/status] recusa no status assíncrono", {
        ref, caminho: nacional ? "nacional" : "municipal", focusStatus: data?.status, erros: data?.erros,
      });
    }
    return marca({
      status,
      ref,
      numero: data?.numero,
      url: data?.url,
      pdf: data?.url_danfse,
      xml: data?.caminho_xml_nota_fiscal,
      erros: data?.erros,
    }, config);
  },

  async cancelar(_t, config, ref, justificativa): Promise<ResultadoDeNota> {
    // Sem emissor → cancelamento simulado (fluxo validado, sessão exigida mesmo assim).
    if (semEmissor()) return { status: "cancelado", ref, ambiente: config.ambiente, simulado: true };

    const prestador = await prestadorDe(config);
    const nacional = caminhoDaNota(config, hojeISO()) === "nacional";
    const motivo = justificativa || JUSTIFICATIVA_PADRAO;

    let data: any;
    try {
      ({ data } = nacional
        ? await cancelarDps(prestador, ref, motivo)
        : await cancelarNfse(prestador, ref, motivo));
    } catch (e) {
      throw new FalhaDoProvedor("Erro de conexão ao cancelar a nota.", e);
    }

    if (data?.status === "cancelado") return marca({ status: "cancelado", ref }, config);
    return marca({ status: "erro", ref, erros: errosDe(data, "Falha ao cancelar a nota.") }, config);
  },
};
