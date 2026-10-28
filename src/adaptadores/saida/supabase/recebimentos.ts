/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — os recebimentos, em `recebimentos`, `recebimento_atendimentos`,
 * `comprovantes_de_pagamento` e `config_recebimentos` (038).
 *
 * O que precisa ser atômico é função do banco (`criar_recebimento`, `mudar_recebimento`,
 * `confirmar_comprovante`, `descartar_comprovante`), e elas conferem o negócio de quem tem sessão.
 * O resto é leitura e escrita simples, sempre com `.eq("tenant_id", …)`: com o ator de sistema ou
 * do agente, `clienteDoContexto` devolve a service role, e o filtro passa a ser a única proteção
 * (ver `contexto-cliente.ts`).
 *
 * As tabelas só têm política de LEITURA para quem tem sessão. Escrever com a sessão do dono só
 * acontece pelas funções acima e pelos ajustes (`config_recebimentos`, que tem as três políticas);
 * o caso de uso roda o resto como rotina (ver `aplicacao/recebimentos.ts`).
 * ────────────────────────────────────────────────────────────────────────────── */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientePorMes, RepositorioRecebimentos } from "@/nucleo/portas/saida/repositorio-recebimentos";
import {
  RECEBIMENTOS_DESLIGADOS, ehComoPaga, ehDepoisDoAtendimento, type AtendimentoACobrar, type ComprovanteDePagamento,
  type ConfigDeRecebimentos, type Recebimento,
} from "@/nucleo/dominio/recebimentos";
import { ehTipoDeChave } from "@/nucleo/dominio/pix";
import { chaveDe } from "@/nucleo/dominio/contatos";
import { DadoInvalido, FalhaDoProvedor } from "@/nucleo/dominio/erros";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { createAdminClient } from "./admin";
import { clienteDoContexto } from "./contexto-cliente";

const AVISO_038 =
  "Os recebimentos ainda não foram migrados neste banco. Rode `supabase/038_recebimentos.sql` no SQL "
  + "Editor do Supabase — até lá o Pix não sai e os comprovantes não são lidos.";

function faltaMigracao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) return true;
  return /relation .* does not exist|could not find the (function|table)/i.test(error.message ?? "");
}

/** Erro de banco virando o do domínio: a recusa escrita nas funções (`raise exception`) é frase para a tela. */
function falha(onde: string, error: { code?: string; message?: string }): Error {
  if (faltaMigracao(error)) return new FalhaDoProvedor(AVISO_038);
  if (error.code === "P0001") return new DadoInvalido(error.message ?? "Recusado.");
  return new FalhaDoProvedor(`Supabase: ${onde}: ${error.message}`);
}

type LinhaRecebimento = {
  id: string;
  cliente_id: string | null;
  telefone: string;
  nome: string | null;
  valor: number | string;
  descricao: string;
  identificador: string;
  situacao: Recebimento["situacao"];
  forma: Recebimento["forma"];
  criado_em: string;
  perguntado_em: string | null;
  pago_em: string | null;
  cpf_pedido_em: string | null;
  recebimento_atendimentos?: { atendimento_id: string }[] | null;
};

const COLUNAS =
  "id, cliente_id, telefone, nome, valor, descricao, identificador, situacao, forma, criado_em, perguntado_em, pago_em, cpf_pedido_em, " +
  "recebimento_atendimentos(atendimento_id)";

function paraRecebimento(l: LinhaRecebimento, atendimentoIds?: string[]): Recebimento {
  return {
    id: l.id,
    clienteId: l.cliente_id,
    telefone: l.telefone,
    nome: l.nome,
    valor: Number(l.valor),
    descricao: l.descricao,
    identificador: l.identificador,
    situacao: l.situacao,
    forma: l.forma,
    atendimentoIds: atendimentoIds ?? (l.recebimento_atendimentos ?? []).map((a) => a.atendimento_id),
    criadoEm: l.criado_em,
    perguntadoEm: l.perguntado_em,
    pagoEm: l.pago_em,
    cpfPedidoEm: l.cpf_pedido_em,
  };
}

type LinhaACobrar = {
  id: string;
  cliente_id: string | null;
  nome: string;
  telefone: string | null;
  servico: string;
  valor: number | string;
  data_local: string;
  fim: string;
  como_paga: string;
};

const paraCobrar = (l: LinhaACobrar): AtendimentoACobrar => ({
  id: l.id,
  clienteId: l.cliente_id,
  nome: l.nome,
  telefone: l.telefone,
  servico: l.servico,
  valor: Number(l.valor),
  data: String(l.data_local).slice(0, 10),
  fim: l.fim,
  comoPaga: ehComoPaga(l.como_paga) ? l.como_paga : "padrao",
});

/** O recebimento que a função devolveu, relido com os atendimentos dele. */
async function relido(supabase: SupabaseClient, t: ContextoTenant, id: string): Promise<Recebimento | null> {
  const { data, error } = await supabase
    .from("recebimentos")
    .select(COLUNAS)
    .eq("tenant_id", t.tenantId)
    .eq("id", id)
    .maybeSingle<LinhaRecebimento>();
  if (error) throw falha("recebimento", error);
  return data ? paraRecebimento(data) : null;
}

export const recebimentosSupabase: RepositorioRecebimentos = {
  async config(t) {
    const { data, error } = await clienteDoContexto(t)
      .from("config_recebimentos")
      .select("tipo_da_chave, chave, nome, cidade, depois_do_atendimento, ligado_em")
      .eq("tenant_id", t.tenantId)
      .maybeSingle<{ tipo_da_chave: string | null; chave: string | null; nome: string | null; cidade: string | null; depois_do_atendimento: string; ligado_em: string | null }>();
    /* Sem a 038, desligado: o resto do app não pode cair porque a cobrança ao cliente não foi
     * migrada. Quem tenta ligar recebe o aviso no salvar. */
    if (faltaMigracao(error)) return RECEBIMENTOS_DESLIGADOS;
    if (error) throw falha("config_recebimentos", error);
    if (!data) return RECEBIMENTOS_DESLIGADOS;
    return {
      tipoDaChave: ehTipoDeChave(data.tipo_da_chave) ? data.tipo_da_chave : null,
      chave: data.chave,
      nome: data.nome,
      cidade: data.cidade,
      depoisDoAtendimento: ehDepoisDoAtendimento(data.depois_do_atendimento) ? data.depois_do_atendimento : "desligado",
      ligadoEm: data.ligado_em,
    };
  },

  async salvarConfig(t, c) {
    const { error } = await clienteDoContexto(t)
      .from("config_recebimentos")
      .upsert(
        {
          tenant_id: t.tenantId,
          tipo_da_chave: c.tipoDaChave,
          chave: c.chave,
          nome: c.nome,
          cidade: c.cidade,
          depois_do_atendimento: c.depoisDoAtendimento,
          ligado_em: c.ligadoEm,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    if (error) throw falha("salvar config_recebimentos", error);
  },

  async negociosComRecebimento() {
    const { data, error } = await createAdminClient().rpc("negocios_com_recebimento");
    if (faltaMigracao(error)) return [];
    if (error) throw falha("negocios_com_recebimento", error);
    /* `returns setof uuid`: lista de valores, ou linhas de um campo só. Ver `negociosComEnvio`. */
    return ((data ?? []) as unknown[]).map((x) => (x && typeof x === "object" ? String(Object.values(x)[0]) : String(x)));
  },

  async atendimentosQueAcabaram(t, janela) {
    const { data, error } = await clienteDoContexto(t).rpc("atendimentos_que_acabaram", {
      p_tenant: t.tenantId, p_desde: janela.desde, p_ate: janela.ate,
    });
    if (error) throw falha("atendimentos_que_acabaram", error);
    return ((data ?? []) as LinhaACobrar[]).map(paraCobrar);
  },

  async clientesPorMes(t) {
    const { data, error } = await clienteDoContexto(t)
      .from("clientes")
      .select("id, dia_recibo")
      .eq("tenant_id", t.tenantId)
      .eq("como_paga", "por_mes")
      .not("dia_recibo", "is", null);
    if (error) throw falha("clientes por mês", error);
    return ((data ?? []) as { id: string; dia_recibo: number }[]).map((l): ClientePorMes => ({ clienteId: l.id, diaRecibo: Number(l.dia_recibo) }));
  },

  async sessoesDoMes(t, p) {
    const { data, error } = await clienteDoContexto(t).rpc("sessoes_do_mes_a_cobrar", {
      p_tenant: t.tenantId, p_cliente: p.clienteId, p_desde: p.desde, p_ate: p.ate,
    });
    if (error) throw falha("sessoes_do_mes_a_cobrar", error);
    return ((data ?? []) as LinhaACobrar[]).map(paraCobrar);
  },

  async atendimento(t, id) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("atendimentos")
      .select("id, cliente_id, cliente_nome, cliente_tel, servico_nome, servico_valor, data_local, fim, situacao, clientes(nome, telefone, como_paga)")
      .eq("tenant_id", t.tenantId)
      .eq("id", id)
      .maybeSingle<{
        id: string; cliente_id: string | null; cliente_nome: string; cliente_tel: string | null; servico_nome: string;
        servico_valor: number | string; data_local: string; fim: string; situacao: string;
        clientes: { nome: string | null; telefone: string | null; como_paga: string | null } | null;
      }>();
    if (error) throw falha("atendimento", error);
    if (!data || data.situacao !== "marcado") return null;

    const { data: ativo, error: erroAtivo } = await supabase
      .from("recebimento_atendimentos")
      .select("recebimento_id")
      .eq("tenant_id", t.tenantId)
      .eq("atendimento_id", id)
      .eq("ativo", true)
      .maybeSingle<{ recebimento_id: string }>();
    if (erroAtivo) throw falha("recebimento do atendimento", erroAtivo);

    return {
      ...paraCobrar({
        id: data.id,
        cliente_id: data.cliente_id,
        nome: data.clientes?.nome ?? data.cliente_nome,
        telefone: data.cliente_tel || data.clientes?.telefone || null,
        servico: data.servico_nome,
        valor: data.servico_valor,
        data_local: data.data_local,
        fim: data.fim,
        como_paga: data.clientes?.como_paga ?? "padrao",
      }),
      recebimentoId: ativo?.recebimento_id ?? null,
    };
  },

  async atendimentosEmCobranca(t) {
    const supabase = clienteDoContexto(t);
    const { data: abertos, error } = await supabase
      .from("recebimentos")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .in("situacao", ["perguntar", "aberto"]);
    /* Sem a 038 não há cobrança: o recibo automático segue como sempre. */
    if (faltaMigracao(error)) return [];
    if (error) throw falha("recebimentos em aberto", error);
    const ids = ((abertos ?? []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) return [];
    const { data, error: erroLinks } = await supabase
      .from("recebimento_atendimentos")
      .select("atendimento_id")
      .eq("tenant_id", t.tenantId)
      .eq("ativo", true)
      .in("recebimento_id", ids);
    if (erroLinks) throw falha("atendimentos em cobrança", erroLinks);
    return ((data ?? []) as { atendimento_id: string }[]).map((l) => l.atendimento_id);
  },

  async criar(t, novo) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase.rpc("criar_recebimento", {
      p_id: novo.id,
      p_tenant: t.tenantId,
      p_identificador: novo.identificador,
      p_situacao: novo.situacao,
      p_descricao: novo.descricao,
      p_atendimentos: novo.atendimentoIds,
    });
    if (error) throw falha("criar_recebimento", error);
    const linha = ((data ?? []) as LinhaRecebimento[])[0];
    /* Vazio: um destes atendimentos já está em outra cobrança. Ver a porta. */
    return linha ? paraRecebimento(linha, novo.atendimentoIds) : null;
  },

  async porId(t, id) {
    return relido(clienteDoContexto(t), t, id);
  },

  async emAberto(t, p) {
    let q = clienteDoContexto(t)
      .from("recebimentos")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .in("situacao", ["perguntar", "aberto"]);
    /* O telefone gravado vem do atendimento, com ou sem o 55: compara pelos últimos oito dígitos,
     * a mesma chave da conversa (`telefone_chave`). */
    if (p?.telefone) q = q.like("telefone", `%${chaveDe(p.telefone)}`);
    const { data, error } = await q.order("criado_em", { ascending: true });
    if (faltaMigracao(error)) return [];
    if (error) throw falha("recebimentos em aberto", error);
    return ((data ?? []) as unknown as LinhaRecebimento[]).map((l) => paraRecebimento(l));
  },

  async pagos(t, p) {
    const { data, error } = await clienteDoContexto(t)
      .from("recebimentos")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .eq("situacao", "pago")
      .gte("pago_em", p.desde)
      .order("pago_em", { ascending: false })
      .limit(100);
    if (faltaMigracao(error)) return [];
    if (error) throw falha("recebimentos pagos", error);
    return ((data ?? []) as unknown as LinhaRecebimento[]).map((l) => paraRecebimento(l));
  },

  async mudar(t, id, p) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase.rpc("mudar_recebimento", {
      p_tenant: t.tenantId,
      p_id: id,
      p_de: p.de,
      p_para: p.para,
      p_forma: p.forma ?? null,
      p_por: p.por,
    });
    if (error) throw falha("mudar_recebimento", error);
    const linha = ((data ?? []) as LinhaRecebimento[])[0];
    return linha ? relido(supabase, t, linha.id) : null;
  },

  async anotar(t, id, p) {
    const campos = {
      ...(p.perguntadoEm ? { perguntado_em: p.perguntadoEm } : {}),
      ...(p.cpfPedidoEm ? { cpf_pedido_em: p.cpfPedidoEm } : {}),
    };
    if (!Object.keys(campos).length) return;
    const { error } = await clienteDoContexto(t)
      .from("recebimentos")
      .update({ ...campos, atualizado_em: new Date().toISOString() })
      .eq("tenant_id", t.tenantId)
      .eq("id", id);
    if (error) throw falha("anotar recebimento", error);
  },

  async esperandoCpf(t, telefone) {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const { data, error } = await clienteDoContexto(t)
      .from("recebimentos")
      .select(`${COLUNAS}, clientes(cpf)`)
      .eq("tenant_id", t.tenantId)
      .eq("situacao", "pago")
      .not("cliente_id", "is", null)
      .gte("cpf_pedido_em", desde)
      .like("telefone", `%${chaveDe(telefone)}`)
      .order("criado_em", { ascending: true });
    if (faltaMigracao(error)) return [];
    if (error) throw falha("recebimentos esperando CPF", error);
    return ((data ?? []) as unknown as (LinhaRecebimento & { clientes: { cpf: string | null } | null })[])
      .filter((l) => !(l.clientes?.cpf ?? "").trim())
      .map((l) => paraRecebimento(l));
  },

  async registrarComprovante(t, c) {
    const { data, error } = await clienteDoContexto(t)
      .from("comprovantes_de_pagamento")
      .insert({
        tenant_id: t.tenantId,
        telefone: c.telefone,
        recebimento_id: c.recebimentoId,
        valor: c.valor,
        pago_em: c.pagoEm,
        recebedor_nome: c.recebedorNome,
        recebedor_chave: c.recebedorChave,
        recebedor_documento: c.recebedorDocumento,
        pagador_nome: c.pagadorNome,
        banco: c.banco,
        id_transacao: c.idTransacao,
        identificador: c.identificador,
        conferencia: c.conferencia,
        mensagem_id: c.mensagemId,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    /* A mesma transação Pix, ou a mesma mensagem, de novo: o índice único recusa, e é a resposta. */
    if (error?.code === "23505") return { id: null, repetido: true };
    if (error) throw falha("registrar comprovante", error);
    return { id: data?.id ?? null, repetido: false };
  },

  async comprovantes(t, p) {
    const { data, error } = await clienteDoContexto(t)
      .from("comprovantes_de_pagamento")
      .select(
        "id, telefone, recebimento_id, valor, pago_em, recebedor_nome, recebedor_chave, recebedor_documento, pagador_nome, " +
          "banco, id_transacao, identificador, conferencia, situacao, criado_em, recebimentos(nome)",
      )
      .eq("tenant_id", t.tenantId)
      .eq("situacao", p.situacao)
      .order("criado_em", { ascending: true })
      .limit(100);
    if (faltaMigracao(error)) return [];
    if (error) throw falha("comprovantes", error);
    return ((data ?? []) as unknown as {
      id: string; telefone: string; recebimento_id: string | null; valor: number | string | null; pago_em: string | null;
      recebedor_nome: string | null; recebedor_chave: string | null; recebedor_documento: string | null; pagador_nome: string | null;
      banco: string | null; id_transacao: string | null; identificador: string | null;
      conferencia: ComprovanteDePagamento["conferencia"]; situacao: ComprovanteDePagamento["situacao"]; criado_em: string;
      recebimentos: { nome: string | null } | null;
    }[]).map((l): ComprovanteDePagamento => ({
      id: l.id,
      telefone: l.telefone,
      nome: l.recebimentos?.nome ?? null,
      recebimentoId: l.recebimento_id,
      valor: l.valor == null ? null : Number(l.valor),
      pagoEm: l.pago_em ? String(l.pago_em).slice(0, 10) : null,
      recebedorNome: l.recebedor_nome,
      recebedorChave: l.recebedor_chave,
      recebedorDocumento: l.recebedor_documento,
      pagadorNome: l.pagador_nome,
      banco: l.banco,
      idTransacao: l.id_transacao,
      identificador: l.identificador,
      conferencia: l.conferencia,
      situacao: l.situacao,
      criadoEm: l.criado_em,
    }));
  },

  async confirmarComprovante(t, p) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase.rpc("confirmar_comprovante", {
      p_tenant: t.tenantId, p_id: p.id, p_recebimento: p.recebimentoId, p_por: p.por,
    });
    if (error) throw falha("confirmar_comprovante", error);
    const linha = ((data ?? []) as LinhaRecebimento[])[0];
    const r = linha ? await relido(supabase, t, linha.id) : null;
    if (!r) throw new FalhaDoProvedor("Supabase: confirmar_comprovante não devolveu o recebimento.");
    return r;
  },

  async descartarComprovante(t, p) {
    const { data, error } = await clienteDoContexto(t).rpc("descartar_comprovante", {
      p_tenant: t.tenantId, p_id: p.id, p_motivo: p.motivo, p_por: p.por,
    });
    if (error) throw falha("descartar_comprovante", error);
    return data === true;
  },
};
