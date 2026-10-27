/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — as notas fiscais, no Postgres. ⚠️ SÓ SERVIDOR.
 *
 * Tabela `notas` (DDL em `002_multitenant.sql` §7), view `v_a_faturar` e a função
 * `abrir_nota()` (`015_faturamento.sql`). Os arquivos são a verdade, não esta prosa.
 *
 * ── ⚠️ `abrir` É UMA RPC, E NÃO DUAS ESCRITAS DAQUI ──
 *
 * Criar a nota e prender os atendimentos nela **tem** que ser uma transação. Feito em dois
 * `await` deste arquivo, uma falha de rede no meio deixaria a nota criada com os atendimentos
 * soltos — e a próxima tentativa abriria a segunda nota para o mesmo serviço. Documento fiscal
 * duplicado não se apaga: cancela-se na prefeitura, e há cidade que não aceita cancelamento
 * por webservice nenhum.
 *
 * A função também soma o valor lá dentro, sobre exatamente as linhas que prendeu. É o que
 * impede uma tela velha de emitir nota com total que não corresponde ao que foi marcado.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { NotaAberta, RepositorioNotas } from "@/nucleo/portas/saida/repositorio-notas";
import type {
  AFaturar, AmbienteFiscal, NotaGravada, ResultadoDeNota, StatusNota,
} from "@/nucleo/dominio/fiscal";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { NaoEncontrado } from "@/nucleo/dominio/erros";
import { clienteDoContexto } from "./contexto-cliente";

const TABELA = "notas";

const COLUNAS_NOTA =
  "id, ref, status, numero, emitida_em, pdf_url, xml_url, erro, simulada, ambiente, "
  + "valor, competencia, cliente_id, tomador_nome";

type LinhaNota = {
  id: string;
  ref: string;
  status: string;
  numero: string | null;
  emitida_em: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  erro: string | null;
  simulada: boolean | null;
  ambiente: string | null;
  valor: number | string | null;
  competencia: string | null;
  cliente_id: string | null;
  tomador_nome: string | null;
};

const paraNota = (l: LinhaNota): NotaGravada => ({
  id: l.id,
  ref: l.ref,
  status: (["pendente", "processando", "emitida", "cancelada", "erro"].includes(l.status)
    ? l.status
    : "pendente") as StatusNota,
  numero: l.numero ?? undefined,
  data: l.emitida_em ?? undefined,
  pdf: l.pdf_url ?? undefined,
  erro: l.erro ?? undefined,
  simulada: l.simulada === true,
  clienteId: l.cliente_id,
  tomadorNome: l.tomador_nome,
  /* `numeric` volta string no supabase-js. Aqui `Number(null)` viraria 0, e nota de valor
   * zero é diferente de nota sem valor — a primeira a prefeitura recusa. */
  valor: l.valor == null ? 0 : Number(l.valor),
  competencia: l.competencia,
  ambiente: l.ambiente === "producao" ? "producao" : l.ambiente === "homologacao" ? "homologacao" : null,
});

/** Do vocabulário do emissor para o da tabela. */
function statusDoResultado(r: ResultadoDeNota): StatusNota {
  switch (r.status) {
    case "autorizado": return "emitida";
    case "cancelado": return "cancelada";
    case "erro": return "erro";
    /* `simulado` conta como EMITIDA, com `simulada = true`. O fluxo foi exercitado até o fim e
     * os atendimentos estão presos — devolvê-los para "a faturar" faria o teste sem token
     * parecer que não aconteceu, e o dono clicaria de novo para sempre. */
    case "simulado": return "emitida";
    default: return "processando";
  }
}

/**
 * A migração 015 ainda não rodou neste banco?
 *
 * ⚠️ É A JANELA ENTRE O DEPLOY E O `Run` NO SQL EDITOR, e ela é real: o código sobe pela
 * Vercel em segundos, a migração é um humano colando um arquivo no painel do Supabase.
 *
 * Sem esta checagem o sintoma seria uma MENTIRA SILENCIOSA: `v_a_faturar` não existe, a
 * consulta estoura, a tela cai no `catch` e mostra "Nada a faturar" — que é exatamente a
 * frase errada para um mês cheio de atendimentos. É o mesmo tipo de silêncio que fez o passo
 * `primeira_conversa` ficar apagado por três dias lendo uma tabela vazia por construção.
 *
 * `42P01` = relação inexistente · `PGRST202` = função não encontrada no schema cache.
 */
function faltaMigracao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST202") return true;
  return /relation .* does not exist|could not find the function/i.test(error.message ?? "");
}

const AVISO_015 =
  "O faturamento ainda não foi migrado neste banco. Rode `supabase/015_faturamento.sql` no "
  + "SQL Editor do Supabase — até lá não dá para emitir nem listar o que falta.";

export const notasSupabase: RepositorioNotas = {
  async aFaturar(t: ContextoTenant): Promise<AFaturar[]> {
    const supabase = clienteDoContexto(t);
    /* Join com `clientes` porque a view agrupa por `cliente_id` e a tela precisa de nome e
     * CPF — e o CPF decide se dá para emitir (a prefeitura exige o documento do tomador). */
    const { data, error } = await supabase
      .from("v_a_faturar")
      .select("cliente_id, atendimentos, valor, desde, ate, competencia, servico, clientes!inner(nome, cpf, teste, ativo)")
      .eq("tenant_id", t.tenantId);

    /* Fala o que fazer, em vez de devolver lista vazia — ver `faltaMigracao`. */
    if (faltaMigracao(error)) throw new Error(AVISO_015);
    if (error) throw new Error(error.message);

    return (data ?? [])
      .map((l: any) => ({
        clienteId: String(l.cliente_id),
        nome: l.clientes?.nome ?? "—",
        cpf: l.clientes?.cpf ?? null,
        atendimentos: Number(l.atendimentos ?? 0),
        valor: l.valor == null ? 0 : Number(l.valor),
        servico: l.servico ?? null,
        desde: String(l.desde ?? "").slice(0, 10),
        ate: String(l.ate ?? "").slice(0, 10),
        competencia: String(l.competencia ?? "").slice(0, 10),
        teste: l.clientes?.teste === true,
        ativo: l.clientes?.ativo !== false,
      }))
      /* Cliente desativado sai da lista: o dono desligou por algum motivo, e faturar quem foi
       * desligado é o oposto do que ele pediu. O atendimento continua com `nota_id` nulo, e
       * volta a aparecer se ele reativar — nada se perde. */
      .filter((a) => a.ativo)
      .map(({ ativo: _ativo, ...a }) => a)
      /* Maior valor primeiro: é a ordem em que alguém confere um fechamento de mês. */
      .sort((a, b) => b.valor - a.valor);
  },

  async abrir(t, p): Promise<NotaAberta | null> {
    const supabase = clienteDoContexto(t);

    /* Com a lista, a nota de um pagamento só (038); sem ela, a de tudo o que falta faturar. */
    const { data, error } = p.atendimentoIds?.length
      ? await supabase.rpc("abrir_nota_dos_atendimentos", {
          p_tenant_id: t.tenantId,
          p_cliente_id: p.clienteId,
          p_atendimentos: p.atendimentoIds,
          p_ref: p.ref,
          p_ambiente: p.ambiente,
          p_discriminacao: p.discriminacao,
        })
      : await supabase.rpc("abrir_nota", {
          p_tenant_id: t.tenantId,
          p_cliente_id: p.clienteId,
          p_ref: p.ref,
          p_ambiente: p.ambiente,
          p_discriminacao: p.discriminacao,
        });

    if (faltaMigracao(error)) throw new Error(AVISO_015);
    if (error) throw new Error(error.message);

    /* ⚠️ ZERO LINHAS É "JÁ FOI", NÃO FALHA. A função devolve vazio quando o `for update skip
     * locked` não encontrou nada para prender — outra aba chegou primeiro. Quem chama responde
     * `ja_faturado`, nunca erro. */
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.nota_id) return null;

    /* O snapshot do tomador foi gravado pela própria função; relemos da nota para o emissor
     * usar EXATAMENTE o que está no documento, e não o cadastro de agora. */
    const { data: nota, error: erroNota } = await supabase
      .from(TABELA)
      .select("tomador_nome, tomador_cpf, tomador_email, tomador_telefone")
      .eq("tenant_id", t.tenantId)
      .eq("id", linha.nota_id)
      .maybeSingle<{ tomador_nome: string | null; tomador_cpf: string | null; tomador_email: string | null; tomador_telefone: string | null }>();

    if (erroNota) throw new Error(erroNota.message);

    return {
      id: String(linha.nota_id),
      ref: p.ref,
      valor: linha.valor == null ? 0 : Number(linha.valor),
      atendimentos: Number(linha.atendimentos ?? 0),
      competencia: linha.competencia ? String(linha.competencia).slice(0, 10) : null,
      discriminacao: p.discriminacao,
      tomador: {
        nome: nota?.tomador_nome ?? null,
        cpf: nota?.tomador_cpf ?? null,
        email: nota?.tomador_email ?? null,
        telefone: nota?.tomador_telefone ?? null,
      },
    };
  },

  async concluir(t, notaId, r): Promise<void> {
    const supabase = clienteDoContexto(t);
    const status = statusDoResultado(r);

    const { data, error } = await supabase
      .from(TABELA)
      .update({
        status,
        numero: r.numero ?? null,
        pdf_url: r.pdf ?? null,
        xml_url: r.xml ?? null,
        erro: r.erros?.[0]?.mensagem ?? null,
        simulada: r.simulado === true,
        ...(r.ambiente ? { ambiente: r.ambiente } : {}),
        /* A data só entra quando a nota de fato saiu. Gravar `hoje` num `processando` faria o
         * histórico mostrar data de emissão para documento que não existe. */
        ...(status === "emitida" ? { emitida_em: new Date().toISOString().slice(0, 10) } : {}),
      })
      .eq("tenant_id", t.tenantId)
      .eq("id", notaId)
      .select("id");

    if (error) throw new Error(error.message);
    /* ⚠️ Zero linhas é recusa, não sucesso: update barrado pela RLS volta sem erro e sem
     * linha. Aqui o sintoma seria pior que o de costume — a nota ficaria `pendente` para
     * sempre com os atendimentos presos, e a tela mostraria "processando" eternamente. */
    if (!data?.length) {
      throw new NaoEncontrado("Não consegui gravar o resultado da nota — só quem administra o negócio pode emitir.");
    }
  },

  async reabrir(t, notaId, novaRef): Promise<void> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from(TABELA)
      .update({ ref: novaRef, status: "pendente", erro: null, numero: null, pdf_url: null, xml_url: null })
      .eq("tenant_id", t.tenantId)
      .eq("id", notaId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!data?.length) throw new NaoEncontrado("Nota não encontrada.");
  },

  async listar(t): Promise<NotaGravada[]> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS_NOTA)
      .eq("tenant_id", t.tenantId)
      .order("criado_em", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return (data ?? []).map((l) => paraNota(l as unknown as LinhaNota));
  },

  async porRef(t, ref): Promise<NotaGravada | null> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS_NOTA)
      .eq("tenant_id", t.tenantId)
      .eq("ref", ref)
      .maybeSingle<LinhaNota>();

    if (error) throw new Error(error.message);
    return data ? paraNota(data) : null;
  },
};

/**
 * Tudo o que o PDF de uma nota mostra, achado pela `ref` — SEM inquilino na entrada (15/10/2026).
 *
 * Quem chama é `GET /api/nf/pdf/[ref]`, que a Evolution baixa sem sessão para mandar o PDF no
 * WhatsApp. A rota confere o HMAC da `ref` antes; o inquilino sai da própria linha da nota, nunca
 * do request — mesma mecânica de `tenantDoProtocolo` nos recibos. Por isso `service_role`.
 *
 * `null` quando a nota não existe, não está emitida ou o banco falhou: a rota responde 404 em
 * todos, e não há diferença que valha contar a quem não tem sessão.
 */
export async function documentoDaNota(ref: string): Promise<{
  numero: string | null;
  emitidaEm: string | null;
  competencia: string | null;
  valor: number;
  discriminacao: string;
  tomador: { nome: string | null; cpf: string | null };
  prestador: {
    razaoSocial: string | null; cnpj: string | null; inscricaoMunicipal: string | null;
    codigoMunicipio: string | null; itemListaServico: string | null; aliquotaIss: number | null;
  };
  nomeDoNegocio: string | null;
} | null> {
  const { createAdminClient, isAdminConfigured } = await import("./admin");
  if (!isAdminConfigured || !ref.trim()) return null;
  const supabase = createAdminClient();

  const { data: n, error } = await supabase
    .from(TABELA)
    .select("tenant_id, status, numero, emitida_em, competencia, valor, discriminacao, tomador_nome, tomador_cpf")
    .eq("ref", ref)
    .eq("status", "emitida")
    .maybeSingle();
  if (error || !n) return null;

  const [{ data: cfg }, { data: neg }] = await Promise.all([
    supabase.from("config_fiscal")
      .select("prestador_nome, prestador_cnpj, inscricao_municipal, codigo_municipio, item_lista_servico, aliquota_iss")
      .eq("tenant_id", n.tenant_id).maybeSingle(),
    supabase.from("negocios").select("nome").eq("id", n.tenant_id).maybeSingle(),
  ]);

  return {
    numero: n.numero ?? null,
    emitidaEm: n.emitida_em ?? null,
    competencia: n.competencia ?? null,
    valor: Number(n.valor),
    discriminacao: n.discriminacao,
    tomador: { nome: n.tomador_nome ?? null, cpf: n.tomador_cpf ?? null },
    prestador: {
      razaoSocial: cfg?.prestador_nome ?? null,
      cnpj: cfg?.prestador_cnpj ?? null,
      inscricaoMunicipal: cfg?.inscricao_municipal ?? null,
      codigoMunicipio: cfg?.codigo_municipio ?? null,
      itemListaServico: cfg?.item_lista_servico ?? null,
      aliquotaIss: cfg?.aliquota_iss == null ? null : Number(cfg.aliquota_iss),
    },
    nomeDoNegocio: neg?.nome ?? null,
  };
}
