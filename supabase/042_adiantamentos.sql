/* ═══════════════════════════════════════════════════════════════════════════════
 * 042 — PAGOU ADIANTADO: o crédito de sessões (12/11/2026, pedido da Regina)
 *
 * Alguns pacientes pagam antes: o mês inteiro, ou um pacote de sessões. O recibo sai na data do
 * PAGAMENTO (é a regra do Receita Saúde: nunca data futura), e as sessões que esse dinheiro cobre não
 * podem entrar em outro recibo, nem no automático, nem receber Pix.
 *
 * O desenho, decidido com o Bruno: o crédito CONTA SESSÕES. "Pagou 4" cobre as próximas 4 sessões da
 * agenda a partir do dia do pagamento, sejam do mês que forem. O mês pago é o caso de 4; o pacote de
 * 10 é o caso de 10; e sessão marcada depois do pagamento também gasta o crédito.
 *
 *   · falta sem aviso GASTA o crédito: a sessão continua `marcado`. Quem não quer cobrar usa o "Não
 *     teve sessão", que a cancela, e o crédito passa para a próxima;
 *   · cancelada e "Não teve sessão" não gastam; remarcada continua coberta (é a mesma linha).
 *
 * O que esta migração cria:
 *   1 · `adiantamentos` — um por pagamento adiantado: de quem, quantas sessões, a partir de quando, e
 *       o PAGAMENTO avulso que leva o valor e vira o recibo (`pagamentos_avulsos`, 019);
 *   2 · `v_sessoes_adiantadas` — quais atendimentos cada crédito cobre, calculado na hora;
 *   3 · `v_a_recibar` sem as sessões cobertas (a tela, o automático e o CSV leem dela);
 *   4 · as duas funções do Pix (038) sem as sessões cobertas.
 *
 * ⚠️ O CRÉDITO NÃO GRAVA NADA NO ATENDIMENTO. A cobertura é derivada: ordena as sessões `marcado` sem
 * recibo da pessoa, a partir do primeiro dia de crédito, e as N primeiras são do crédito. Gravar
 * "coberta" em cada linha pediria desfazer à mão a cada cancelamento e remarcação; derivado, cancelar
 * a terceira faz a quinta ser coberta sozinha.
 *
 * ⚠️ DEPENDE DA 019, 020 E 038. Aditivo e reexecutável.
 * ═══════════════════════════════════════════════════════════════════════════════ */

-- ── 1 · os créditos ──────────────────────────────────────────────────────────

create table if not exists public.adiantamentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.negocios (id) on delete cascade,
  cliente_id    uuid not null references public.clientes (id) on delete cascade,
  /* O dinheiro. Apagar o pagamento (lançado errado, antes de virar recibo) apaga o crédito junto. */
  pagamento_id  uuid not null unique references public.pagamentos_avulsos (id) on delete cascade,
  sessoes       int  not null check (sessoes between 1 and 60),
  /* A partir de quando as sessões contam. É o dia do pagamento: a sessão do próprio dia entra. */
  a_partir_de   date not null,
  criado_em     timestamptz not null default now()
);

create index if not exists adiantamentos_cliente on public.adiantamentos (tenant_id, cliente_id);

alter table public.adiantamentos enable row level security;
revoke all on public.adiantamentos from anon;
grant select, insert, update, delete on public.adiantamentos to authenticated;

drop policy if exists "membro lê" on public.adiantamentos;
drop policy if exists "membro insere" on public.adiantamentos;
drop policy if exists "membro apaga" on public.adiantamentos;

create policy "membro lê" on public.adiantamentos
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

create policy "membro insere" on public.adiantamentos
  for insert to authenticated
  with check (tenant_id in (select public.negocios_do_usuario()));

create policy "membro apaga" on public.adiantamentos
  for delete to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

-- ── 2 · quais sessões cada crédito cobre ─────────────────────────────────────
/* Os créditos da pessoa, em ordem, viram faixas: o primeiro cobre as sessões 1 a 4, o segundo as 5
 * a 14, e assim por diante. As sessões contam a partir do PRIMEIRO dia de crédito da pessoa. Só
 * entra sessão `marcado` sem recibo: a que já tinha recibo antes do crédito não gasta nada. */
create or replace view public.v_sessoes_adiantadas
with (security_invoker = true) as
with creditos as (
  select ad.id, ad.tenant_id, ad.cliente_id, ad.sessoes,
         sum(ad.sessoes) over (partition by ad.tenant_id, ad.cliente_id
                               order by ad.a_partir_de, ad.criado_em, ad.id) as ate,
         min(ad.a_partir_de) over (partition by ad.tenant_id, ad.cliente_id) as desde
    from public.adiantamentos ad
),
pessoas as (
  select distinct tenant_id, cliente_id, desde from creditos
),
sessoes as (
  select a.id, a.tenant_id, a.cliente_id, a.inicio,
         row_number() over (partition by a.tenant_id, a.cliente_id order by a.inicio, a.id) as n
    from public.atendimentos a
    join pessoas p on p.tenant_id = a.tenant_id and p.cliente_id = a.cliente_id
   where a.situacao = 'marcado'
     and a.lote_recibo_id is null
     and a.recibo_id is null
     and (a.inicio at time zone 'America/Sao_Paulo')::date >= p.desde
)
select s.id        as atendimento_id,
       s.tenant_id,
       s.cliente_id,
       c.id        as adiantamento_id,
       (s.inicio at time zone 'America/Sao_Paulo')::date as data,
       s.inicio
  from sessoes s
  join creditos c
    on c.tenant_id = s.tenant_id and c.cliente_id = s.cliente_id
   and s.n > c.ate - c.sessoes and s.n <= c.ate;

comment on view public.v_sessoes_adiantadas is
  'Os atendimentos que um pagamento adiantado cobre (042). Derivado: cancelar uma sessão passa o crédito para a próxima.';

-- ── 3 · a fila do recibo sem as sessões cobertas ─────────────────────────────
/* Mesmas colunas, na mesma ordem, da 020: `create or replace` em vez de drop, para não derrubar o
 * que depende dela. A única linha nova é o `not exists`. */
create or replace view public.v_a_recibar
with (security_invoker = true) as
  select
    a.id            as id,
    'atendimento'::text as fonte,
    a.tenant_id,
    a.cliente_id,
    (a.inicio at time zone 'America/Sao_Paulo')::date as data,
    coalesce(a.servico_valor, 0) as valor,
    a.servico_nome  as servico,
    c.nome,
    c.cpf,
    c.pagador_cpf,
    coalesce(c.teste, false) as teste
  from public.atendimentos a
  join public.clientes c
    on c.tenant_id = a.tenant_id and c.id = a.cliente_id
  where a.lote_recibo_id is null
    and a.recibo_id is null
    and a.situacao = 'marcado'
    and a.cliente_id is not null
    and a.inicio < now()
    and coalesce(c.ativo, true)
    and not exists (select 1 from public.v_sessoes_adiantadas s where s.atendimento_id = a.id)

  union all

  select
    p.id            as id,
    'avulso'::text  as fonte,
    p.tenant_id,
    p.cliente_id,
    p.data,
    p.valor,
    null::text      as servico,
    coalesce(c.nome, p.nome)               as nome,
    coalesce(c.cpf, p.cpf)                 as cpf,
    coalesce(c.pagador_cpf, p.pagador_cpf) as pagador_cpf,
    coalesce(c.teste, false)               as teste
  from public.pagamentos_avulsos p
  left join public.clientes c
    on c.tenant_id = p.tenant_id and c.id = p.cliente_id
  where p.lote_recibo_id is null
    and p.recibo_id is null;

-- ── 4 · o Pix não cobra sessão já paga ───────────────────────────────────────
/* As duas funções da 038, iguais, com o mesmo `not exists`. */
create or replace function public.atendimentos_que_acabaram(p_tenant uuid, p_desde timestamptz, p_ate timestamptz)
returns table (
  id uuid, cliente_id uuid, nome text, telefone text, servico text, valor numeric,
  data_local date, fim timestamptz, como_paga text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.cliente_id, coalesce(c.nome, a.cliente_nome), coalesce(nullif(a.cliente_tel, ''), c.telefone),
         a.servico_nome, a.servico_valor, a.data_local, a.fim, coalesce(c.como_paga, 'padrao')
    from public.atendimentos a
    left join public.clientes c on c.tenant_id = a.tenant_id and c.id = a.cliente_id
   where a.tenant_id = p_tenant
     and a.situacao = 'marcado'
     and a.fim > p_desde and a.fim <= p_ate
     and a.servico_valor > 0
     and coalesce(nullif(a.cliente_tel, ''), c.telefone) is not null
     and coalesce(c.como_paga, 'padrao') = 'padrao'
     and not coalesce(c.teste, false)
     and not exists (
       select 1 from public.recebimento_atendimentos ra where ra.atendimento_id = a.id
     )
     and not exists (select 1 from public.v_sessoes_adiantadas s where s.atendimento_id = a.id)
   order by a.fim
$$;

create or replace function public.sessoes_do_mes_a_cobrar(p_tenant uuid, p_cliente uuid, p_desde date, p_ate date)
returns table (
  id uuid, cliente_id uuid, nome text, telefone text, servico text, valor numeric,
  data_local date, fim timestamptz, como_paga text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.cliente_id, coalesce(c.nome, a.cliente_nome), coalesce(nullif(a.cliente_tel, ''), c.telefone),
         a.servico_nome, a.servico_valor, a.data_local, a.fim, coalesce(c.como_paga, 'padrao')
    from public.atendimentos a
    left join public.clientes c on c.tenant_id = a.tenant_id and c.id = a.cliente_id
   where a.tenant_id = p_tenant
     and a.cliente_id = p_cliente
     and a.situacao = 'marcado'
     and a.data_local >= p_desde and a.data_local < p_ate
     and a.inicio < now()
     and a.servico_valor > 0
     and coalesce(nullif(a.cliente_tel, ''), c.telefone) is not null
     and not coalesce(c.teste, false)
     and not exists (
       select 1 from public.recebimento_atendimentos ra where ra.atendimento_id = a.id
     )
     and not exists (select 1 from public.v_sessoes_adiantadas s where s.atendimento_id = a.id)
   order by a.data_local, a.inicio
$$;

revoke all on function public.atendimentos_que_acabaram(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.sessoes_do_mes_a_cobrar(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.atendimentos_que_acabaram(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.sessoes_do_mes_a_cobrar(uuid, uuid, date, date) to service_role;

-- ── conferência ──────────────────────────────────────────────────────────────
do $$
declare
  tabela int;
  visao  int;
begin
  select count(*) into tabela from information_schema.tables where table_schema = 'public' and table_name = 'adiantamentos';
  select count(*) into visao from information_schema.views where table_schema = 'public' and table_name = 'v_sessoes_adiantadas';
  raise notice '042 · adiantamentos: % (1) · v_sessoes_adiantadas: % (1)', tabela, visao;
end $$;
