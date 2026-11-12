/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o lote do Receita Saúde, no Postgres. ⚠️ SÓ SERVIDOR.
 *
 * DDL em `supabase/018_recibo_saude.sql` — o arquivo é a verdade, não esta prosa.
 *
 * ── ⚠️ O QUE ESTE ADAPTADOR NÃO FAZ, E NÃO É ESQUECIMENTO ──
 *
 * Não guarda o CSV. O arquivo é derivado (agenda + CPF + ocupação) e reconstruível a
 * qualquer momento pela mesma função pura; o que ele CONTÉM é CPF de paciente e valor de
 * sessão de psicoterapia — dado sensível, de gente que não é nossa cliente. Guardar linha a
 * linha seria assumir a guarda de um prontuário financeiro para economizar uma chamada de
 * função. Fica o agregado: quantas linhas, quanto, e o que aconteceu com o arquivo.
 *
 * A soma vem do banco (`abrir_lote_recibo`), nunca de quem chama — mesma regra de
 * `abrir_nota`: tela aberta há dez minutos manda total velho.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  DestinatarioDeRecibo, FontePagamento, LoteAberto, LoteGravado, PagamentoAFaturar,
  RascunhoAvulso, RepositorioRecibos,
} from "@/nucleo/portas/saida/repositorio-recibos";
import { DadoInvalido } from "@/nucleo/dominio/erros";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { civilSP } from "@/nucleo/dominio/tempo";
import { clienteDoContexto } from "./contexto-cliente";

/**
 * A migração ainda não rodou neste banco?
 *
 * `42P01` relação inexistente · `PGRST202` função fora do schema cache · `42703` coluna
 * inexistente · `PGRST204` coluna fora do schema cache.
 *
 * ⚠️ AS DUAS DE COLUNA ENTRARAM EM 21/08/2026, e o motivo foi concreto: o 019 acrescentou
 * `id` e `fonte` à `v_a_recibar`. Entre o deploy e o `Run` no SQL Editor — que é um humano
 * abrindo o painel do Supabase — o `select` pede colunas que não existem, e o Postgres
 * responde `42703`. Sem isto o dono via um erro cru de banco no lugar de "rode a migração".
 */
function faltaMigracao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST202", "42703", "PGRST204"].includes(error.code ?? "")) return true;
  return /relation .* does not exist|could not find the (function|.* column)|column .* does not exist/i
    .test(error.message ?? "");
}

const AVISO_018 =
  "O Receita Saúde ainda não foi migrado neste banco. Rode `supabase/018_recibo_saude.sql` e "
  + "`supabase/019_pagamento_avulso.sql` no SQL Editor do Supabase, nesta ordem — até lá não "
  + "dá para gerar o arquivo do mês.";

type LinhaPendente = {
  id: string;
  fonte: string;
  cliente_id: string | null;
  nome: string | null;
  cpf: string | null;
  pagador_cpf: string | null;
  data: string;
  valor: number | string | null;
  servico: string | null;
  teste: boolean | null;
};

type LinhaLote = {
  id: string;
  competencia: string | null;
  linhas: number | null;
  valor: number | string | null;
  criado_em: string;
  situacao: string | null;
};

/**
 * O cadastro embutido no `select`.
 *
 * ⚠️ O POSTGREST DEVOLVE OBJETO OU ARRAY DEPENDENDO DE COMO ELE INFERE A CARDINALIDADE, e a
 * inferência muda com a FK. Ler as duas formas é mais barato que amarrar o código a um
 * palpite sobre o schema cache — o mesmo motivo do `qrcode.base64 ?? base64` na Evolution.
 */
type LinhaContato = { nome: string | null; telefone: string | null };

type LinhaAtendimentoDoLote = {
  inicio: string;
  servico_valor: number | string | null;
  clientes: LinhaContato | LinhaContato[] | null;
};

type LinhaAvulsoDoLote = {
  data: string;
  valor: number | string | null;
  nome: string | null;
  clientes: LinhaContato | LinhaContato[] | null;
};

const so = (v: string | null) => (v ?? "").replace(/\D/g, "") || null;

/** Instante do banco → dia civil em São Paulo. `null` improvável: o fallback é o corte cru. */
const dataCivil = (iso: string) => civilSP(iso)?.data ?? String(iso).slice(0, 10);

export const recibosSupabase: RepositorioRecibos = {
  async pendentes(t: ContextoTenant, p): Promise<PagamentoAFaturar[]> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_a_recibar")
      .select("id, fonte, cliente_id, nome, cpf, pagador_cpf, data, valor, servico, teste")
      .eq("tenant_id", t.tenantId)
      .lte("data", p.ate)
      /* Do mais antigo para o mais novo: é a ordem do arquivo, e é a ordem em que alguém
       * confere um fechamento de mês linha por linha. */
      .order("data", { ascending: true });

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);

    return (data ?? []).map((l: LinhaPendente) => ({
      id: String(l.id),
      /* A view só emite dois valores, e o `check` da coluna não existe numa view — mas ler
       * texto do banco como união de tipos sem conferir é como "producao" com aspas chegou na
       * Vercel. Desconhecido cai em `atendimento`, que é o comportamento do 018. */
      fonte: (l.fonte === "avulso" ? "avulso" : "atendimento") as FontePagamento,
      clienteId: l.cliente_id ? String(l.cliente_id) : null,
      nome: l.nome ?? "—",
      cpf: so(l.cpf),
      cpfPagador: so(l.pagador_cpf),
      data: String(l.data).slice(0, 10),
      valor: l.valor == null ? 0 : Number(l.valor),
      servico: l.servico ?? null,
      teste: l.teste === true,
    }));
  },

  async abrirLote(t: ContextoTenant, p): Promise<LoteAberto | null> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase.rpc("abrir_lote_recibo", {
      p_tenant_id: t.tenantId,
      p_atendimentos: p.atendimentoIds,
      p_avulsos: p.avulsoIds,
      p_competencia: p.competencia,
    });

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);

    /* Zero linhas = outra aba prendeu primeiro. NÃO é erro — ver a porta. */
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.lote_id) return null;

    return {
      id: String(linha.lote_id),
      competencia: p.competencia,
      linhas: Number(linha.linhas ?? 0),
      valor: linha.valor == null ? 0 : Number(linha.valor),
      atendimentoIds: (linha.atendimentos ?? []).map(String),
      avulsoIds: (linha.avulsos ?? []).map(String),
    };
  },

  async lancarAvulso(t: ContextoTenant, p: RascunhoAvulso): Promise<PagamentoAFaturar> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("pagamentos_avulsos")
      .insert({
        tenant_id: t.tenantId,
        data: p.data,
        valor: p.valor,
        cliente_id: p.clienteId ?? null,
        nome: p.nome,
        cpf: so(p.cpf),
        pagador_cpf: so(p.cpfPagador ?? null),
        observacao: p.observacao ?? null,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);
    /* ⚠️ Zero linhas é RECUSA, não sucesso: um insert barrado pela RLS volta sem erro e sem
     * linha, e o sintoma seria a tela dizer "lançado" e a linha não aparecer no reload. */
    if (!data) {
      throw new DadoInvalido("Não consegui lançar — só quem administra o negócio pode fazer isso.", "tenant");
    }

    return {
      id: String(data.id),
      fonte: "avulso",
      clienteId: p.clienteId ?? null,
      nome: p.nome,
      cpf: so(p.cpf),
      cpfPagador: so(p.cpfPagador ?? null),
      data: p.data,
      valor: p.valor,
      servico: null,
      teste: false,
    };
  },

  async excluirAvulso(t: ContextoTenant, id): Promise<void> {
    const supabase = clienteDoContexto(t);
    /* ⚠️ `lote_recibo_id is null` no WHERE, e não uma checagem antes: entre o `select` e o
     * `delete` cabe o clique que gera o lote. Aqui o banco decide, na mesma instrução. */
    const { error } = await supabase
      .from("pagamentos_avulsos")
      .delete()
      .eq("tenant_id", t.tenantId)
      .eq("id", id)
      .is("lote_recibo_id", null);

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);
  },

  async sessaoNaoAconteceu(t: ContextoTenant, atendimentoId): Promise<{ maisaAg: string | null } | null> {
    const supabase = clienteDoContexto(t);
    /* Tudo no `where`, numa instrução só: entre ler e gravar cabe a emissão que prende a sessão.
     * O `.select` devolve a linha mudada, e é a contagem dela que diz se aconteceu agora. */
    const { data, error } = await supabase
      .from("atendimentos")
      .update({ situacao: "cancelado", cancelado_em: new Date().toISOString() })
      .eq("tenant_id", t.tenantId)
      .eq("id", atendimentoId)
      .eq("situacao", "marcado")
      .is("recibo_id", null)
      .is("lote_recibo_id", null)
      .select("maisa_ag");

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);
    const linha = (data ?? [])[0] as { maisa_ag: string | null } | undefined;
    return linha ? { maisaAg: linha.maisa_ag ?? null } : null;
  },

  async confirmarLote(t: ContextoTenant, loteId): Promise<boolean> {
    const supabase = clienteDoContexto(t);
    /* Só sai de `gerado`: confirmar duas vezes não muda nada, e confirmar um descartado
     * ressuscitaria um arquivo que ela jogou fora.
     *
     * ⚠️ O `.select("id")` NÃO É DECORAÇÃO. É ele que faz o Postgres devolver as linhas
     * afetadas, e é a contagem delas que diz se a transição aconteceu AGORA. Sem isso, o
     * segundo clique no "Importei" seria indistinguível do primeiro — e cada clique mandaria
     * outra rodada de WhatsApp para os mesmos pacientes. */
    const { data, error } = await supabase
      .from("lotes_recibo")
      .update({ situacao: "importado" })
      .eq("tenant_id", t.tenantId)
      .eq("id", loteId)
      .eq("situacao", "gerado")
      .select("id");

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);

    return (data ?? []).length > 0;
  },

  async destinatariosDoLote(t: ContextoTenant, loteId): Promise<DestinatarioDeRecibo[]> {
    const supabase = clienteDoContexto(t);

    /* Duas leituras porque são duas tabelas — `atendimentos` e `pagamentos_avulsos` — e a
     * `v_a_recibar` não serve aqui: ela mostra o que está FORA de lote, e estas linhas
     * acabaram de entrar em um. O telefone vem do cadastro, que é o único lugar onde ele
     * existe: o lote não guarda snapshot de contato (ver o cabeçalho deste arquivo). */
    const [atend, avulsos] = await Promise.all([
      supabase
        .from("atendimentos")
        .select("inicio, servico_valor, clientes!inner(nome, telefone)")
        .eq("tenant_id", t.tenantId)
        .eq("lote_recibo_id", loteId),
      supabase
        .from("pagamentos_avulsos")
        .select("data, valor, nome, clientes(nome, telefone)")
        .eq("tenant_id", t.tenantId)
        .eq("lote_recibo_id", loteId),
    ]);

    for (const r of [atend, avulsos]) {
      if (faltaMigracao(r.error)) throw new Error(AVISO_018);
      if (r.error) throw new Error(r.error.message);
    }

    const um = (c: LinhaContato | LinhaContato[] | null): LinhaContato | null =>
      Array.isArray(c) ? (c[0] ?? null) : c;

    const deAtendimentos = (atend.data ?? []).map((l: LinhaAtendimentoDoLote) => {
      const c = um(l.clientes);
      return {
        nome: c?.nome ?? null,
        telefone: so(c?.telefone ?? null),
        /* Mesma conversão da view: a data do recibo é a data CIVIL em São Paulo, e cortar o
         * ISO em 10 daria o dia errado para a sessão das 21h de um horário de verão. */
        data: dataCivil(l.inicio),
        valor: l.servico_valor == null ? 0 : Number(l.servico_valor),
      };
    });

    const deAvulsos = (avulsos.data ?? []).map((l: LinhaAvulsoDoLote) => {
      const c = um(l.clientes);
      return {
        /* Cadastro na frente do digitado, como na view. */
        nome: c?.nome ?? l.nome ?? null,
        telefone: so(c?.telefone ?? null),
        data: String(l.data).slice(0, 10),
        valor: l.valor == null ? 0 : Number(l.valor),
      };
    });

    return [...deAtendimentos, ...deAvulsos].sort((a, b) => a.data.localeCompare(b.data));
  },

  async descartarLote(t: ContextoTenant, loteId): Promise<void> {
    const supabase = clienteDoContexto(t);
    /* Função e não `update`: soltar as sessões e marcar o lote têm que acontecer juntos. Um
     * update aqui e outro ali deixaria, na falha do meio, um lote descartado com as sessões
     * ainda presas — e a tela diria "nada a faturar" para o mês inteiro, sem erro nenhum. */
    const { error } = await supabase.rpc("descartar_lote_recibo", {
      p_tenant_id: t.tenantId,
      p_lote_id: loteId,
    });

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);
  },

  async listarLotes(t: ContextoTenant): Promise<LoteGravado[]> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("lotes_recibo")
      .select("id, competencia, linhas, valor, criado_em, situacao")
      .eq("tenant_id", t.tenantId)
      .order("criado_em", { ascending: false });

    if (faltaMigracao(error)) throw new Error(AVISO_018);
    if (error) throw new Error(error.message);

    return (data ?? []).map((l: LinhaLote) => ({
      id: String(l.id),
      competencia: l.competencia,
      linhas: Number(l.linhas ?? 0),
      valor: l.valor == null ? 0 : Number(l.valor),
      criadoEm: l.criado_em,
      situacao: l.situacao === "importado" || l.situacao === "descartado" ? l.situacao : "gerado",
    }));
  },
};
