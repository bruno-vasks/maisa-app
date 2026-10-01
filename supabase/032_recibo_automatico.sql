-- ─────────────────────────────────────────────────────────────────────────────
-- 032 · O RECIBO AUTOMÁTICO: o dia de cada paciente, e para quem a MAISA manda
--
-- ── ★ DE ONDE VEIO (01/10/2026) ──
--
-- Call do Bruno com a Regina, a primeira usuária. Dois pedidos dela, e os dois moram aqui:
--
--   1 · "Receber os recibos automaticamente, num dia fixo do mês, e escolher o dia que cada
--       paciente quer receber." → `clientes.dia_recibo`. Nulo = a MAISA não emite sozinha para
--       essa pessoa (é o padrão: ninguém ganha recibo automático sem a dona escolher o dia).
--   2 · "Escolher se o recibo vai direto para o paciente ou primeiro para mim." →
--       `assistente.recibo_primeiro_para_mim`. Padrão `false`: quem já avisava os pacientes
--       continua avisando os pacientes, e nada muda para ninguém só por esta migração rodar.
--
-- E o desfecho do aviso ganha um quinto estado, `enviado_ao_dono`: a mensagem saiu, mas para a
-- dona, e não para quem foi atendido. Sem ele a tela contaria "paciente avisado" de quem não
-- recebeu nada.
--
-- ── O DIA, EM MÊS CURTO ──
--
-- 1 a 31. Em mês que não tem o dia (31 em setembro, 30 em fevereiro), vale o último. Quem
-- decide isso é o código (`dominio/recibo-automatico.ts`), não o banco: aqui só se garante a faixa.
--
-- ⚠️ DEPENDE DA 030 (`clientes.valor_sessao`): a view abaixo repete a lista da 030 e acrescenta
-- `dia_recibo` no fim, porque `create or replace view` só aceita coluna nova no fim. Sem a 030 o
-- `create or replace view` falha com "column c.valor_sessao does not exist" — rode a 030 antes.
-- `npm run banco:conferir` mostra as duas.
--
-- Aditivo e reexecutável.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · o dia do recibo, na ficha ──
alter table public.clientes add column if not exists dia_recibo smallint;

alter table public.clientes drop constraint if exists clientes_dia_recibo_check;
alter table public.clientes add constraint clientes_dia_recibo_check
  check (dia_recibo is null or dia_recibo between 1 and 31);

comment on column public.clientes.dia_recibo is
  'Dia do mês (1 a 31) em que a MAISA emite sozinha os recibos desta pessoa. Em mês curto vale '
  'o último dia. null = não emite sozinha. Ver 032_recibo_automatico.sql.';

/* A rotina diária pergunta "quem tem dia de recibo?" sobre todos os negócios. Parcial: a enorme
 * maioria das linhas é nula, e o índice só guarda quem escolheu um dia. */
create index if not exists clientes_dia_recibo_idx
  on public.clientes (tenant_id, dia_recibo)
  where dia_recibo is not null;

/* A coluna nova vai no FIM: `create or replace view` só aceita acrescentar. A lista de cima é a
 * da 030, igual. */
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
    c.dia_recibo
  from public.clientes c
  left join public.v_cliente_competencia cc
    on  cc.tenant_id   = c.tenant_id
    and cc.cliente_id  = c.id
    and cc.competencia = public.competencia_atual(c.tenant_id);

-- ── 2 · para quem vai o recibo ──
alter table public.assistente
  add column if not exists recibo_primeiro_para_mim boolean not null default false;

comment on column public.assistente.recibo_primeiro_para_mim is
  'true = o aviso de recibo emitido vai para a dona (telefone_dono, ou o próprio número '
  'conectado), pronto para ela encaminhar; false = vai para o paciente. Só vale com '
  'avisar_recibo ligado. Ver 032_recibo_automatico.sql.';

-- ── 3 · o quinto desfecho do aviso ──
alter table public.recibos_emitidos drop constraint if exists recibos_emitidos_aviso_check;
alter table public.recibos_emitidos add constraint recibos_emitidos_aviso_check
  check (aviso is null or aviso in ('enviado', 'enviado_ao_dono', 'sem_telefone', 'falhou', 'desligado'));

-- ── conferência ──
do $$
declare
  tem_dia     boolean;
  tem_na_view boolean;
  tem_chave   boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'dia_recibo'
  ) into tem_dia;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_clientes' and column_name = 'dia_recibo'
  ) into tem_na_view;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assistente' and column_name = 'recibo_primeiro_para_mim'
  ) into tem_chave;

  raise notice '032 · clientes.dia_recibo % · v_clientes.dia_recibo % · assistente.recibo_primeiro_para_mim %',
    case when tem_dia     then 'ok' else 'FALTANDO' end,
    case when tem_na_view then 'ok' else 'FALTANDO' end,
    case when tem_chave   then 'ok' else 'FALTANDO' end;
end $$;
