/* ═══════════════════════════════════════════════════════════════════════════════
 * 036 — A FILA DE ENVIOS (27/10/2026)
 *
 * Mensagem que sai sem ninguém ter escrito (o aviso do recibo ao paciente, o PDF dele) entra
 * aqui em vez de sair na hora, e quem esvazia a fila manda UMA de cada vez por negócio, com
 * espaço entre uma pessoa e outra.
 *
 * ── POR QUE ──
 *
 * Pela Evolution, a MAISA é um WhatsApp Web não oficial, e o que derruba um número assim é
 * disparo: trinta mensagens para trinta pessoas no mesmo minuto. Era o que o fechamento do
 * mês com "avisar pacientes" fazia (um laço dentro da requisição do painel), e o que a rotina
 * diária do recibo automático provocava (cada recibo confirmado mandava o PDF na hora, e eles
 * chegam juntos). Espaçar dentro de uma requisição estoura o tempo dela; a fila é o lugar.
 *
 * ── O ESPAÇO É DO BANCO, NÃO DO PROCESSO ──
 *
 * Cada retorno da Receita chega numa requisição própria, e cada uma pode rodar numa instância
 * diferente da Vercel. Um "espera 5 s" no processo não vê os outros. `reservar_envio` vê:
 * por negócio, ela só entrega uma mensagem se nenhuma outra dele estiver saindo e se a
 * última que saiu tem pelo menos `p_espaco_ms`. Duas chamadas ao mesmo tempo para o mesmo
 * negócio se enfileiram no `pg_advisory_xact_lock`, e a segunda não acha nada.
 *
 * ── O CONTEÚDO NÃO FICA ──
 *
 * O texto e o documento têm nome e valor de paciente. Saiu (ou desistiu), o conteúdo é
 * apagado e a linha fica só com o que serve à conta do espaço e à auditoria.
 *
 * Só a service role lê e escreve (RLS ligada e política nenhuma, como `cobranca_eventos` da
 * 028), e as funções nascem fechadas para `anon` e `authenticated` (a lição da 016).
 *
 * Aditivo e reexecutável. O código roda ANTES desta migração: enquanto a tabela não existe,
 * enfileirar falha e quem enfileira manda direto, como antes.
 * ═══════════════════════════════════════════════════════════════════════════════ */

create table if not exists public.envios_whatsapp (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.negocios (id) on delete cascade,
  -- Como veio do cadastro. Quem normaliza é o canal, na hora de mandar, como em todo envio;
  -- número que não vira WhatsApp falha ali, sozinho, sem derrubar o lote na entrada.
  para          text not null check (length(para) between 1 and 40),
  -- As bolhas de texto, nesta ordem. Antes do documento, quando há documento.
  textos        text[] not null default '{}',
  -- { caminho | url, nome_do_arquivo, legenda }: o PDF. `caminho` é a nossa cópia, e o
  -- link é gerado na hora de enviar; `url` é o link do canal de emissão (vale minutos).
  documento     jsonb,
  origem        text not null check (origem in ('lote_de_recibos', 'recibo')),
  -- O recibo cujo aviso isto é, e o desfecho a gravar nele quando sair.
  recibo_id     uuid,
  desfecho_ao_enviar text check (desfecho_ao_enviar is null or desfecho_ao_enviar in ('enviado', 'enviado_ao_dono')),

  criado_em     timestamptz not null default now(),
  enviar_apos   timestamptz not null default now(),
  reservado_em  timestamptz,
  tentativas    int not null default 0,
  enviado_em    timestamptz,
  desistido_em  timestamptz,
  erro          text
);

-- O que está esperando a vez, por negócio e por ordem de chegada.
create index if not exists envios_whatsapp_pendentes
  on public.envios_whatsapp (tenant_id, enviar_apos, criado_em)
  where enviado_em is null and desistido_em is null;

-- A última que saiu de cada negócio: é dela que se conta o espaço.
create index if not exists envios_whatsapp_ultimo_enviado
  on public.envios_whatsapp (tenant_id, enviado_em desc)
  where enviado_em is not null;

alter table public.envios_whatsapp enable row level security;


/* ───────────────────────────────────────────────────────────────────────────────
 * Quem tem mensagem vencida esperando. A única pergunta que atravessa negócios, e ela
 * devolve só o id: o resto é por negócio, em `reservar_envio`.
 * ────────────────────────────────────────────────────────────────────────────── */
create or replace function public.negocios_com_envio()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct tenant_id
    from public.envios_whatsapp
   where enviado_em is null
     and desistido_em is null
     and enviar_apos <= now()
     and (reservado_em is null or reservado_em < now() - interval '10 minutes');
$$;


/* ───────────────────────────────────────────────────────────────────────────────
 * A vez de UMA mensagem deste negócio, se chegou: nenhuma outra dele saindo, e a última
 * que saiu há pelo menos `p_espaco_ms`. Reserva e devolve no mesmo passo (reservar não é
 * ler; ver `reservar_lembretes` da 010). Reserva de mais de 10 minutos é de uma execução
 * que morreu, e volta a valer.
 * ────────────────────────────────────────────────────────────────────────────── */
create or replace function public.reservar_envio(p_tenant uuid, p_espaco_ms int)
returns setof public.envios_whatsapp
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('envios_whatsapp:' || p_tenant::text));

  if exists (
    select 1 from public.envios_whatsapp
     where tenant_id = p_tenant
       and enviado_em is null and desistido_em is null
       and reservado_em > now() - interval '10 minutes'
  ) then
    return;
  end if;

  if exists (
    select 1 from public.envios_whatsapp
     where tenant_id = p_tenant
       and enviado_em > now() - p_espaco_ms * interval '1 millisecond'
  ) then
    return;
  end if;

  return query
  with reservada as (
    update public.envios_whatsapp e
       set reservado_em = now(), tentativas = e.tentativas + 1
     where e.id = (
       select id from public.envios_whatsapp
        where tenant_id = p_tenant
          and enviado_em is null and desistido_em is null
          and enviar_apos <= now()
          and (reservado_em is null or reservado_em < now() - interval '10 minutes')
        order by enviar_apos, criado_em
        limit 1
     )
    returning e.*
  )
  select * from reservada;
end;
$$;


/* Saiu: marca, solta a reserva e apaga o conteúdo. */
create or replace function public.concluir_envio(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.envios_whatsapp
     set enviado_em = now(), reservado_em = null, erro = null, textos = '{}', documento = null
   where id = p_id;
$$;


/* Não saiu. Com `p_desistir` (a falha pode ter entregado, e mandar de novo seria o paciente
 * recebendo duas vezes) ou passadas `p_max` tentativas, desiste e apaga o conteúdo. Senão,
 * solta a reserva e tenta de novo daqui a 2, 4, 6… minutos. Devolve se desistiu. */
create or replace function public.devolver_envio(p_id uuid, p_erro text, p_desistir boolean, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desistiu boolean;
begin
  update public.envios_whatsapp
     set reservado_em = null,
         erro = left(p_erro, 500),
         desistido_em = case when p_desistir or tentativas >= p_max then now() end,
         enviar_apos = now() + (2 * tentativas) * interval '1 minute',
         textos = case when p_desistir or tentativas >= p_max then '{}'::text[] else textos end,
         documento = case when p_desistir or tentativas >= p_max then null else documento end
   where id = p_id
  returning desistido_em is not null into v_desistiu;
  return coalesce(v_desistiu, false);
end;
$$;


revoke all on function public.negocios_com_envio() from public, anon, authenticated;
revoke all on function public.reservar_envio(uuid, int) from public, anon, authenticated;
revoke all on function public.concluir_envio(uuid) from public, anon, authenticated;
revoke all on function public.devolver_envio(uuid, text, boolean, int) from public, anon, authenticated;

comment on table public.envios_whatsapp is
  'Mensagens que saem sem ninguém ter escrito, uma de cada vez por negócio. Ver 036_fila_de_envios.sql.';

do $$
begin
  raise notice '036 · envios_whatsapp % · reservar_envio %',
    (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'envios_whatsapp'),
    (select count(*) from pg_proc where proname = 'reservar_envio');
end;
$$;
