/* ═══════════════════════════════════════════════════════════════════════════════
 * 040 — A MAISA DA MAISA (05/11/2026)
 *
 * Um negócio do próprio app (a "casa", `MAISA_NEGOCIO_DA_CASA` na Vercel) atende os leads da
 * maisa num número só dele: tira dúvida, qualifica, manda o link do teste grátis ou marca uma
 * conversa com o Bruno, e manda três mensagens automáticas (boas-vindas, lembrete, retomada).
 * Ver `src/nucleo/dominio/vendas.ts`.
 *
 * Três partes, nesta ordem:
 *   1 · `leads_da_casa`: a ficha de cada lead (qualificação e quando cada automática saiu);
 *   2 · a origem `vendas` na fila de envios (036/038);
 *   3 · o agendador da rotina `/api/rotinas/vendas`, de 10 em 10 minutos.
 *
 * ⚠️ A PARTE 3 É ESPECÍFICA DE AMBIENTE, como a 011 e a 037: carrega a URL do deploy, e usa o
 * MESMO segredo do Vault (`maisa_rotinas_secret`). Nada novo para configurar.
 *
 * Rodar duas vezes não estraga nada: tudo é `if not exists`, `drop … if exists` ou reagenda.
 * ═══════════════════════════════════════════════════════════════════════════════ */


/* ── 1 · a ficha de cada lead ─────────────────────────────────────────────────────
 *
 * Uma linha por telefone, no negócio da casa. A chave é a mesma de `mensagens_agente` (os 8
 * últimos dígitos), para a ficha casar com a conversa sem depender do DDI. O telefone inteiro
 * fica ao lado: é para ele que a mensagem automática sai.
 *
 * Os quatro `*_em` de automática são a trava contra mensagem em dobro: a rotina só manda depois
 * de gravar o instante com `update … where <coluna> is null` e receber a linha de volta.
 * ────────────────────────────────────────────────────────────────────────────── */
create table if not exists public.leads_da_casa (
  tenant_id           uuid not null references public.negocios (id) on delete cascade,
  telefone_chave      text not null check (telefone_chave ~ '^[0-9]{8}$'),
  telefone            text not null check (telefone ~ '^[0-9]{10,15}$'),
  nome                text check (nome is null or length(nome) between 1 and 60),

  -- A qualificação, como a conversa descobriu. Tudo pode faltar.
  profissao           text check (profissao is null or length(profissao) <= 60),
  vertical            text check (vertical is null or vertical in ('terapeutas', 'barbeiros', 'generico')),
  equipe              int  check (equipe is null or equipe between 1 and 500),
  atendimentos_semana int  check (atendimentos_semana is null or atendimentos_semana between 1 and 2000),
  como_marca          text check (como_marca is null or length(como_marca) <= 120),
  -- O que a fez procurar a maisa: "recibo do Receita Saúde", "cobrar pelo Pix", "nota fiscal".
  interesse           text check (interesse is null or length(interesse) <= 120),
  pediu_conversa      boolean not null default false,

  -- O que o código decidiu (`proximoPasso` em `dominio/vendas.ts`).
  passo               text check (passo is null or passo in ('teste', 'conversa')),
  plano               text check (plano is null or plano in ('essencial', 'profissional', 'escala')),

  qualificado_em      timestamptz,
  link_em             timestamptz,
  boas_vindas_em      timestamptz,
  lembrete_em         timestamptz,
  retomada_em         timestamptz,

  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),

  primary key (tenant_id, telefone_chave)
);

drop trigger if exists tg_leads_da_casa_atualizado_em on public.leads_da_casa;
create trigger tg_leads_da_casa_atualizado_em before update on public.leads_da_casa
  for each row execute function public.toca_atualizado_em();

comment on table public.leads_da_casa is
  'A ficha de cada lead da maisa da maisa: qualificação e mensagens automáticas. Ver 040_vendas_da_casa.sql.';

/* Quem escreve é o servidor, com a service role. O dono da casa (o Bruno) LÊ, para um dia o painel
 * mostrar a lista; nenhum outro membro de negócio nenhum enxerga linha alguma. */
alter table public.leads_da_casa enable row level security;

drop policy if exists "membro lê" on public.leads_da_casa;
create policy "membro lê" on public.leads_da_casa
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));


/* ── 2 · a origem `vendas` na fila de envios ──────────────────────────────────── */
alter table public.envios_whatsapp drop constraint if exists envios_whatsapp_origem_check;
alter table public.envios_whatsapp add constraint envios_whatsapp_origem_check
  check (origem in ('lote_de_recibos', 'recibo', 'cobranca', 'vendas'));


/* ── 3 · o agendador ──────────────────────────────────────────────────────────────
 *
 * De 10 em 10 minutos. A rotina olha as contas das últimas 72 h e as conversas da casa, e na
 * maioria das rodadas não manda nada. Sem `MAISA_NEGOCIO_DA_CASA` na Vercel ela responde na hora
 * com `ligada: false`. Os horários de mandar (boas-vindas 8h–22h; lembrete e retomada de segunda
 * a sábado, 9h–19h) são decididos no código, em horário de São Paulo, e não aqui.
 * ────────────────────────────────────────────────────────────────────────────── */
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_vendas()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo text;
  v_id      bigint;
begin
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets
   where name = 'maisa_rotinas_secret';

  if v_segredo is null or v_segredo = '' then
    raise exception 'segredo "maisa_rotinas_secret" não existe no Vault — ver o §2 de 011_agendar_lembretes.sql';
  end if;

  select net.http_post(
    url     := 'https://maisa-app-sooty.vercel.app/api/rotinas/vendas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_segredo),
    body    := '{}'::jsonb,
    /* A rota declara `maxDuration = 300`; a drenagem da fila para aos 240 s. */
    timeout_milliseconds := 290000
  ) into v_id;

  return v_id;
end;
$$;

comment on function public.disparar_vendas() is
  'Chama POST /api/rotinas/vendas com o segredo do Vault. Agendada por pg_cron a cada 10 min.';

revoke all on function public.disparar_vendas() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('maisa-vendas');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'maisa-vendas',
  '*/10 * * * *',
  $$ select public.disparar_vendas(); $$
);

/* CONFERIR
 *
 *   select jobid, schedule, jobname, active from cron.job where jobname = 'maisa-vendas';
 *   select status_code, content, created from net._http_response order by created desc limit 10;
 *   select public.disparar_vendas();   -- disparar agora
 *
 *   -- os leads da casa, do mais recente para o mais antigo
 *   select nome, profissao, equipe, passo, plano, qualificado_em, link_em,
 *          boas_vindas_em, lembrete_em, retomada_em
 *     from public.leads_da_casa order by atualizado_em desc limit 30;
 *
 * DESLIGAR as automáticas sem mexer em código: `select cron.unschedule('maisa-vendas');`
 */
