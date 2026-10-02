-- ─────────────────────────────────────────────────────────────────────────────
-- 033 · UM RECIBO POR MÊS, E AS FUNÇÕES DO RECIBO FECHADAS PARA QUEM NÃO ENTROU
--
-- ── ★ DE ONDE VEIO (01/10/2026) ──
--
-- Bruno, depois da call com a Regina: *"a ideia é que cada paciente só recebe um recibo por mês,
-- mas podemos configurar isso também"*. Até aqui cada sessão era um recibo: quatro sessões em
-- setembro, quatro documentos na Receita e quatro mensagens para o paciente.
--
--   1 · `clientes.recibos_por_mes`: 1 (o padrão), 2, 3, 4, ou 0 = um por sessão, como era. A regra
--       de como dividir mora no código (`dominio/recibos-do-mes.ts`); aqui só a faixa.
--   2 · `abrir_recibo_agrupado()`: prende VÁRIAS sessões num recibo só, tudo ou nada, e soma o
--       valor no banco. O banco já sabia guardar isso (várias sessões com o mesmo `recibo_id`, e a
--       `soltar_recibo_unitario` já solta todas); faltava a porta de entrada.
--
-- ── ⚠️ E UM FURO FECHADO NO CAMINHO ──
--
-- Medido em 01/10/2026: `abrir_recibo_unitario` e `soltar_recibo_unitario` respondiam 200 para a
-- chave ANÔNIMA, a que vai no navegador de qualquer visitante. Nenhuma das duas tinha `revoke`, e
-- nenhuma conferia se o negócio era de quem chamava. Com o id de um negócio e de um pagamento,
-- qualquer pessoa prendia o pagamento de outra num recibo fantasma, e o recibo de verdade deixava
-- de sair. O risco prático era baixo (ids longos e aleatórios), mas o furo era inteiro.
--
-- Agora as três: sem acesso para `anon`, e com sessão (`auth.uid()` presente) só o próprio
-- negócio. A rotina e o retorno da Rebots usam a service role, que não tem `auth.uid()`, e passam.
--
-- ⚠️ DEPENDE DA 032 (a view repete a lista dela). Aditivo e reexecutável.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · quantos recibos por mês, na ficha ──
alter table public.clientes add column if not exists recibos_por_mes smallint not null default 1;

alter table public.clientes drop constraint if exists clientes_recibos_por_mes_check;
alter table public.clientes add constraint clientes_recibos_por_mes_check
  check (recibos_por_mes between 0 and 4);

comment on column public.clientes.recibos_por_mes is
  'Quantos recibos por mês esta pessoa recebe: 1 (padrão, todas as sessões do mês num só), 2 a 4 '
  '(divide as sessões em ordem de data), 0 = um por sessão. Ver 033_recibo_por_mes.sql.';

create or replace view public.v_clientes
with (security_invoker = true) as
  select
    c.id,
    c.tenant_id,
    c.nome,
    c.telefone,
    c.telefone_chave,
    c.email,
    c.cpf,
    c.canal,
    c.ativo,
    c.desde,
    c.servico_id,
    c.teste,
    coalesce(cc.atendimentos, 0) as atendimentos,
    coalesce(cc.valor, 0)        as valor,
    c.valor_sessao,
    c.dia_recibo,
    c.recibos_por_mes
  from public.clientes c
  left join public.v_cliente_competencia cc
    on  cc.tenant_id   = c.tenant_id
    and cc.cliente_id  = c.id
    and cc.competencia = public.competencia_atual(c.tenant_id);

-- ── 2 · abrir_recibo_unitario, a mesma da 023 com a guarda do negócio ──
create or replace function public.abrir_recibo_unitario(
  p_tenant_id uuid,
  p_fonte     text,
  p_id        uuid,
  p_canal     text
)
returns table (
  recibo_id uuid,
  numero    bigint,
  valor     numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recibo uuid;
  v_numero bigint;
  v_valor  numeric;
  v_achou  boolean := false;
begin
  if p_fonte not in ('atendimento', 'avulso') then
    raise exception 'fonte desconhecida: %', p_fonte;
  end if;

  /* Antes do insert, para a mensagem ser legível. Sem isto o erro que sobe é violação de
   * CHECK constraint, que na tela do dono não quer dizer nada. */
  if p_canal not in ('automacao', 'rebots', 'lote_csv') then
    raise exception 'canal desconhecido: %', p_canal;
  end if;

  /* ★ 033: QUEM TEM SESSÃO SÓ PRENDE PAGAMENTO DO PRÓPRIO NEGÓCIO. Ver o cabeçalho da 033. */
  if auth.uid() is not null and not (p_tenant_id in (select public.negocios_do_usuario())) then
    raise exception 'este negócio não é seu';
  end if;

  /* ── tranca a fonte ──
   * O valor sai do BANCO, nunca de quem chama: tela aberta há dez minutos manda total velho,
   * e aqui o total velho viraria um recibo de valor errado — documento fiscal torto que só se
   * conserta cancelando. Mesma regra de `abrir_nota`. */
  if p_fonte = 'atendimento' then
    select a.servico_valor into v_valor
      from public.atendimentos a
     where a.tenant_id = p_tenant_id
       and a.id = p_id
       and a.lote_recibo_id is null
       and a.recibo_id is null
       and a.situacao = 'marcado'
       and a.inicio < now()
       for update skip locked;
    v_achou := found;
  else
    select q.valor into v_valor
      from public.pagamentos_avulsos q
     where q.tenant_id = p_tenant_id
       and q.id = p_id
       and q.lote_recibo_id is null
       and q.recibo_id is null
       for update skip locked;
    v_achou := found;
  end if;

  /* Já preso por outro canal, ou segunda aba. NÃO é erro — quem chama responde "já foi". */
  if not v_achou then
    return;
  end if;

  /* ★ O `numero` VOLTA DAQUI, da mesma transação que prendeu. É isso que faz o protocolo ser
   * conhecido antes de qualquer chamada ao canal. */
  insert into public.recibos_emitidos (tenant_id, canal, situacao)
  values (p_tenant_id, p_canal, 'pendente')
  returning id, recibos_emitidos.numero into v_recibo, v_numero;

  if p_fonte = 'atendimento' then
    update public.atendimentos set recibo_id = v_recibo
     where tenant_id = p_tenant_id and id = p_id;
  else
    update public.pagamentos_avulsos set recibo_id = v_recibo
     where tenant_id = p_tenant_id and id = p_id;
  end if;

  return query select v_recibo, v_numero, coalesce(v_valor, 0);
end;
$$;

-- ── 3 · soltar_recibo_unitario, a mesma da 020 com a guarda do negócio ──
create or replace function public.soltar_recibo_unitario(
  p_tenant_id uuid,
  p_recibo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not (p_tenant_id in (select public.negocios_do_usuario())) then
    raise exception 'este negócio não é seu';
  end if;

  /* A guarda mora no WHERE, como na 020: entre um `select` e um `if` cabe o callback que muda
   * a situação para `emitido`. */
  perform 1 from public.recibos_emitidos
   where tenant_id = p_tenant_id
     and id = p_recibo_id
     and situacao = 'recusado'
     for update;

  if not found then
    return false;
  end if;

  update public.atendimentos set recibo_id = null
   where tenant_id = p_tenant_id and recibo_id = p_recibo_id;
  update public.pagamentos_avulsos set recibo_id = null
   where tenant_id = p_tenant_id and recibo_id = p_recibo_id;

  return true;
end;
$$;

-- ── 4 · abrir_recibo_agrupado — várias sessões, um recibo, tudo ou nada ──
--
-- ⚠️ TUDO OU NADA, e é de propósito. Se uma das sessões já entrou noutro recibo (segunda aba, o
-- lote do e-CAC), prender só as outras emitiria um recibo com um valor que ninguém pediu. Devolve
-- zero linhas, como a unitária, e quem chama responde "já foi". O valor é a soma do BANCO.
create or replace function public.abrir_recibo_agrupado(
  p_tenant_id    uuid,
  p_atendimentos uuid[],
  p_avulsos      uuid[],
  p_canal        text
)
returns table (
  recibo_id uuid,
  numero    bigint,
  valor     numeric,
  linhas    integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atend   uuid[] := array(select distinct x from unnest(coalesce(p_atendimentos, '{}'::uuid[])) x);
  v_avul    uuid[] := array(select distinct x from unnest(coalesce(p_avulsos, '{}'::uuid[])) x);
  v_pedidas integer;
  v_n_at    integer;
  v_n_av    integer;
  v_s_at    numeric;
  v_s_av    numeric;
  v_recibo  uuid;
  v_numero  bigint;
begin
  if p_canal not in ('automacao', 'rebots', 'lote_csv') then
    raise exception 'canal desconhecido: %', p_canal;
  end if;
  if auth.uid() is not null and not (p_tenant_id in (select public.negocios_do_usuario())) then
    raise exception 'este negócio não é seu';
  end if;

  v_pedidas := cardinality(v_atend) + cardinality(v_avul);
  if v_pedidas = 0 then
    return;
  end if;

  /* Tranca o que está livre, com as mesmas condições da unitária. `skip locked`: outra aba no meio
   * da mesma emissão faz esta contar menos, e cair no "tudo ou nada" abaixo, em vez de esperar. */
  select count(*), coalesce(sum(t.v), 0) into v_n_at, v_s_at from (
    select coalesce(a.servico_valor, 0) as v
      from public.atendimentos a
     where a.tenant_id = p_tenant_id
       and a.id = any (v_atend)
       and a.lote_recibo_id is null
       and a.recibo_id is null
       and a.situacao = 'marcado'
       and a.inicio < now()
       for update of a skip locked
  ) t;

  select count(*), coalesce(sum(t.v), 0) into v_n_av, v_s_av from (
    select coalesce(q.valor, 0) as v
      from public.pagamentos_avulsos q
     where q.tenant_id = p_tenant_id
       and q.id = any (v_avul)
       and q.lote_recibo_id is null
       and q.recibo_id is null
       for update of q skip locked
  ) t;

  if v_n_at + v_n_av < v_pedidas then
    return;
  end if;

  insert into public.recibos_emitidos (tenant_id, canal, situacao)
  values (p_tenant_id, p_canal, 'pendente')
  returning id, recibos_emitidos.numero into v_recibo, v_numero;

  update public.atendimentos set recibo_id = v_recibo
   where tenant_id = p_tenant_id and id = any (v_atend);
  update public.pagamentos_avulsos set recibo_id = v_recibo
   where tenant_id = p_tenant_id and id = any (v_avul);

  return query select v_recibo, v_numero, v_s_at + v_s_av, v_pedidas;
end;
$$;

comment on function public.abrir_recibo_agrupado is
  'Tranca várias sessões num recibo só, tudo ou nada, e devolve o número, o valor somado pelo '
  'banco e quantas linhas prendeu. Zero linhas = alguma já estava presa. Ver 033_recibo_por_mes.sql.';

-- ── 5 · quem pode chamar ──
-- `authenticated` continua: o painel chama logado, e a guarda de dentro confere o negócio.
revoke all on function public.abrir_recibo_unitario(uuid, text, uuid, text) from public, anon;
grant execute on function public.abrir_recibo_unitario(uuid, text, uuid, text) to authenticated, service_role;
revoke all on function public.soltar_recibo_unitario(uuid, uuid) from public, anon;
grant execute on function public.soltar_recibo_unitario(uuid, uuid) to authenticated, service_role;
revoke all on function public.abrir_recibo_agrupado(uuid, uuid[], uuid[], text) from public, anon;
grant execute on function public.abrir_recibo_agrupado(uuid, uuid[], uuid[], text) to authenticated, service_role;

-- ── conferência ──
do $$
declare
  tem_coluna boolean;
  tem_funcao boolean;
  anon_abre  boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_clientes' and column_name = 'recibos_por_mes'
  ) into tem_coluna;

  select exists (select 1 from pg_proc where proname = 'abrir_recibo_agrupado') into tem_funcao;

  select has_function_privilege('anon', 'public.abrir_recibo_unitario(uuid, text, uuid, text)', 'execute')
    into anon_abre;

  raise notice '033 · v_clientes.recibos_por_mes % · abrir_recibo_agrupado % · visitante sem login abre recibo: %',
    case when tem_coluna then 'ok' else 'FALTANDO' end,
    case when tem_funcao then 'ok' else 'FALTANDO' end,
    case when anon_abre  then 'SIM, CONFIRA' else 'não' end;
end $$;
