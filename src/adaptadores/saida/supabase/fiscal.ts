/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a configuração fiscal do inquilino, no Postgres. ⚠️ SÓ SERVIDOR.
 *
 * Tabela `config_fiscal` (DDL em `supabase/002_multitenant.sql` §8 e
 * `supabase/014_fiscal_mei.sql` — os arquivos são a verdade, não esta prosa).
 *
 * ── ⚠️ NENHUM SEGREDO PASSA POR AQUI ──
 *
 * A tabela tem `token_cifrado`, morto desde o 014 e nunca escrito. Este adaptador **não o
 * lê e não o escreve**, e a coluna do certificado não existe: o token vem do provedor na
 * hora de emitir, e o `.pfx` atravessa a requisição e vai embora. O que fica é
 * `certificado_valido_ate` — metadado, não credencial.
 *
 * Quem quiser guardar token aqui vai ter que apagar este parágrafo primeiro.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { RemendoFiscal, RepositorioFiscal } from "@/nucleo/portas/saida/repositorio-fiscal";
import type { AmbienteFiscal, ConfigFiscal } from "@/nucleo/dominio/fiscal";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { NaoEncontrado } from "@/nucleo/dominio/erros";
import { CODIGO_OCUPACAO, type OcupacaoSaude } from "@/nucleo/dominio/recibo-saude";
import { clienteDoContexto } from "./contexto-cliente";

/** Texto do banco → ocupação, ou `null`. Ver o ⚠️ em `paraConfig`. */
const ocupacaoValida = (v: string | null): OcupacaoSaude | null =>
  v && v in CODIGO_OCUPACAO ? (v as OcupacaoSaude) : null;

const TABELA = "config_fiscal";

/* ⚠️ TODA CHAVE DE `Linha` TEM QUE ESTAR AQUI. O PostgREST devolve só o que o `select` pede, e
 * coluna esquecida chega `undefined` — sem erro. As três da procuração (021/022) ficaram de fora
 * até 29/09/2026: a autorização nunca aparecia como `aguardando_aceite` ou `vencida`, e o editor
 * do `LoteReceitaSaude` apagava o procurador a cada salvamento. `fiscal.test.ts` prende isso. */
const COLUNAS =
  "ambiente, prestador_cnpj, prestador_nome, codigo_municipio, optante_mei, optante_simples, "
  + "focus_empresa_id, certificado_valido_ate, codigo_tributacao_nacional, "
  + "prestador_cpf, ocupacao_saude, registro_profissional, "
  + "procurador_documento, procuracao_valida_ate, procuracao_aceita_em, "
  + "inscricao_municipal, item_lista_servico, aliquota_iss, codigo_tributario_municipio";

type Linha = {
  ambiente: string | null;
  prestador_cnpj: string | null;
  prestador_nome: string | null;
  codigo_municipio: string | null;
  optante_mei: boolean | null;
  optante_simples: boolean | null;
  focus_empresa_id: number | null;
  certificado_valido_ate: string | null;
  codigo_tributacao_nacional: string | null;
  prestador_cpf: string | null;
  ocupacao_saude: string | null;
  registro_profissional: string | null;
  procurador_documento: string | null;
  procuracao_valida_ate: string | null;
  procuracao_aceita_em: string | null;
  inscricao_municipal: string | null;
  item_lista_servico: string | null;
  aliquota_iss: number | string | null;
  codigo_tributario_municipio: string | null;
};

/**
 * A configuração de quem ainda não ligou a nota fiscal.
 *
 * ⚠️ `ambiente: "homologacao"` é o default do banco e o default daqui, e os dois têm que
 * bater. Se este objeto nascesse em "producao", um inquilino sem linha na tabela apareceria
 * pronto para emitir nota valendo — e a primeira nota de teste dele teria efeito fiscal.
 */
const VAZIA: ConfigFiscal = {
  ambiente: "homologacao",
  cnpj: null,
  razaoSocial: null,
  codigoMunicipio: null,
  optanteMei: false,
  optanteSimples: false,
  empresaId: null,
  certificadoValidoAte: null,
  codigoTributacaoNacional: null,
  prestadorCpf: null,
  ocupacaoSaude: null,
  registroProfissional: null,
  procuradorDocumento: null,
  procuracaoValidaAte: null,
  procuracaoAceitaEm: null,
  inscricaoMunicipal: null,
  itemListaServico: null,
  aliquotaIss: null,
  codigoTributarioMunicipio: null,
};

const paraConfig = (l: Linha): ConfigFiscal => ({
  /* Só dois valores são válidos, e o `check` do banco garante — mas ler texto do banco
   * como união de tipos sem conferir é como o "producao" com aspas chegou na Vercel. */
  ambiente: (l.ambiente === "producao" ? "producao" : "homologacao") as AmbienteFiscal,
  cnpj: l.prestador_cnpj,
  razaoSocial: l.prestador_nome,
  codigoMunicipio: l.codigo_municipio,
  optanteMei: l.optante_mei === true,
  optanteSimples: l.optante_simples === true,
  empresaId: l.focus_empresa_id ?? null,
  certificadoValidoAte: l.certificado_valido_ate,
  codigoTributacaoNacional: l.codigo_tributacao_nacional,
  prestadorCpf: l.prestador_cpf,
  /* ⚠️ O `check` do 018 fecha o domínio da coluna, mas texto do banco não é união de tipos
   * no TypeScript: `ocupacaoValida` confere de novo aqui. Ocupação desconhecida virando
   * `null` faz a tela pedir a profissão; virando string qualquer, o CSV sai com um código
   * que a Receita recusa na análise — e a mensagem fala do arquivo, não da coluna. */
  ocupacaoSaude: ocupacaoValida(l.ocupacao_saude),
  registroProfissional: l.registro_profissional,
  procuradorDocumento: l.procurador_documento,
  procuracaoValidaAte: l.procuracao_valida_ate,
  procuracaoAceitaEm: l.procuracao_aceita_em,
  inscricaoMunicipal: l.inscricao_municipal,
  itemListaServico: l.item_lista_servico,
  /* `numeric` volta como string no supabase-js — `Number(null)` é 0, e alíquota 0 é
   * diferente de "não informada": 0 vai no XML e isenta o ISS sem ninguém pedir. */
  aliquotaIss: l.aliquota_iss == null ? null : Number(l.aliquota_iss),
  codigoTributarioMunicipio: l.codigo_tributario_municipio,
});

/** Do nosso vocabulário para o do banco. Chave ausente não vira coluna — ver `RemendoFiscal`. */
function paraLinha(r: RemendoFiscal): Record<string, unknown> {
  const l: Record<string, unknown> = {};
  if ("ambiente" in r) l.ambiente = r.ambiente;
  if ("cnpj" in r) l.prestador_cnpj = r.cnpj;
  if ("razaoSocial" in r) l.prestador_nome = r.razaoSocial;
  if ("codigoMunicipio" in r) l.codigo_municipio = r.codigoMunicipio;
  if ("optanteMei" in r) l.optante_mei = r.optanteMei;
  if ("optanteSimples" in r) l.optante_simples = r.optanteSimples;
  if ("empresaId" in r) l.focus_empresa_id = r.empresaId;
  if ("certificadoValidoAte" in r) l.certificado_valido_ate = r.certificadoValidoAte;
  if ("codigoTributacaoNacional" in r) l.codigo_tributacao_nacional = r.codigoTributacaoNacional;
  if ("prestadorCpf" in r) l.prestador_cpf = r.prestadorCpf;
  if ("ocupacaoSaude" in r) l.ocupacao_saude = r.ocupacaoSaude;
  if ("registroProfissional" in r) l.registro_profissional = r.registroProfissional;
  if ("procuradorDocumento" in r) l.procurador_documento = r.procuradorDocumento;
  if ("procuracaoValidaAte" in r) l.procuracao_valida_ate = r.procuracaoValidaAte;
  if ("procuracaoAceitaEm" in r) l.procuracao_aceita_em = r.procuracaoAceitaEm;
  if ("inscricaoMunicipal" in r) l.inscricao_municipal = r.inscricaoMunicipal;
  if ("itemListaServico" in r) l.item_lista_servico = r.itemListaServico;
  if ("aliquotaIss" in r) l.aliquota_iss = r.aliquotaIss;
  if ("codigoTributarioMunicipio" in r) l.codigo_tributario_municipio = r.codigoTributarioMunicipio;

  /* `regime_tributario` é derivado dos dois booleanos, e é gravado junto para o painel da
   * Focus e o nosso banco contarem a mesma história. 4 = MEI · 1 = Simples · 3 = normal. */
  if ("optanteMei" in r || "optanteSimples" in r) {
    l.regime_tributario = r.optanteMei ? 4 : r.optanteSimples ? 1 : 3;
  }
  return l;
}

/**
 * As colunas do 014 ainda não existem neste banco?
 *
 * ⚠️ ISTO NÃO É PARANOIA, É A JANELA ENTRE O DEPLOY E O `Run` NO SQL EDITOR. O código sobe
 * pela Vercel em segundos; a migração é um humano abrindo o painel do Supabase e colando um
 * arquivo. Entre as duas coisas existe um intervalo real, e nele o `select` desta tabela pede
 * colunas que não existem.
 *
 * O Postgres responde `42703 undefined_column`; o PostgREST às vezes traduz para `PGRST204`
 * antes de chegar ao banco. Reconhecer pelo TEXTO também, e não só pelo código, porque a
 * mensagem é a única coisa que as duas camadas sempre trazem.
 */
function colunaNaoExiste(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

export const fiscalSupabase: RepositorioFiscal = {
  async ler(t: ContextoTenant): Promise<ConfigFiscal> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .maybeSingle<Linha>();

    if (error) {
      /* ── DEGRADA PARA "NÃO LIGOU AINDA", E A DIREÇÃO DO ERRO É O PONTO ──
       *
       * `VAZIA` faz `fiscalFaltando` pedir o CNPJ, e a emissão recusar com `NaoConfigurado` —
       * uma frase honesta em vez de um 500. Ou seja: a LEITURA falha macia, a EMISSÃO continua
       * falhando fechada. É o oposto do `criarAvaliarAtendimento` da Fatia 6, que falha aberta
       * de propósito, e a assimetria é deliberada: lá o custo era calar para um cliente
       * pagante; aqui seria emitir documento fiscal com dado que não conseguimos ler.
       *
       * Só para coluna ausente. Qualquer outro erro sobe — RLS estreita e banco fora do ar
       * precisam aparecer, e engolir os dois aqui faria "não configurado" virar a resposta
       * universal para qualquer problema. */
      if (colunaNaoExiste(error)) {
        console.warn(
          `[supabase/fiscal] o inquilino ${t.tenantId} leu config_fiscal antes de supabase/014_fiscal_mei.sql `
          + `rodar — respondendo "nota fiscal não ligada". Rode a migração: ${error.message}`,
        );
        return VAZIA;
      }
      throw new Error(error.message);
    }
    /* Linha ausente = ainda não ligou a nota fiscal. NÃO é erro, e não é `null`: ver o ⚠️
     * de `RepositorioFiscal.ler` — devolver null espalharia `?.` por cada tela. */
    return data ? paraConfig(data) : VAZIA;
  },

  async salvar(t: ContextoTenant, remendo: RemendoFiscal): Promise<ConfigFiscal> {
    const supabase = clienteDoContexto(t);
    const campos = paraLinha(remendo);
    if (!Object.keys(campos).length) return this.ler(t);

    const { data, error } = await supabase
      .from(TABELA)
      .upsert({ tenant_id: t.tenantId, ...campos }, { onConflict: "tenant_id" })
      .select(COLUNAS)
      .maybeSingle<Linha>();

    if (error) throw new Error(error.message);

    /* ⚠️ ZERO LINHAS É RECUSA, NÃO SUCESSO. Um upsert barrado pela RLS volta sem erro e
     * sem linha — e o sintoma é a tela dizer "salvo" e reverter no reload. É o mesmo
     * cuidado do `renomear` neste diretório, e o motivo de o `select` estar aqui. */
    if (!data) {
      throw new NaoEncontrado(
        "Não consegui salvar a configuração fiscal — só quem administra o negócio pode mexer nisso.",
      );
    }
    return paraConfig(data);
  },
};
