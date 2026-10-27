/* ═══════════════════════════════════════════════════════════════════════════════
 * 037 — O AGENDADOR DA FILA DE ENVIOS (27/10/2026)
 *
 * A `036` deu ao banco a fila; esta faz alguém esvaziá-la de tempos em tempos. Quem
 * enfileira já dispara o envio na hora (em segundo plano, na mesma requisição), então
 * este tique existe para o que sobrar: a execução que acabou o tempo com mensagem na
 * fila, a que morreu no meio, e a falha transitória que pediu para tentar de novo.
 *
 * É a `011` de novo, para outra rota: o mesmo `pg_cron` + `pg_net`, o MESMO segredo do
 * Vault (`maisa_rotinas_secret`), nada novo para configurar se o cron dos lembretes já
 * funciona.
 *
 * ⚠️ ESPECÍFICO DE AMBIENTE, como a 011: carrega a URL do deploy.
 * ═══════════════════════════════════════════════════════════════════════════════ */

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_envios()
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
    url     := 'https://maisa-app-sooty.vercel.app/api/rotinas/envios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_segredo),
    body    := '{}'::jsonb,
    /* A rota declara `maxDuration = 300`, e a rodada para de enviar aos 240 s. */
    timeout_milliseconds := 290000
  ) into v_id;

  return v_id;
end;
$$;

comment on function public.disparar_envios() is
  'Chama POST /api/rotinas/envios com o segredo do Vault. Agendada por pg_cron a cada 5 min.';

revoke all on function public.disparar_envios() from public, anon, authenticated;

/* De 5 em 5 minutos: o grosso sai na hora, quando é enfileirado. Aqui só passa o que
 * sobrou, e uma fila vazia responde na hora. Rodar o arquivo de novo reagenda. */
do $$
begin
  perform cron.unschedule('maisa-envios');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'maisa-envios',
  '*/5 * * * *',
  $$ select public.disparar_envios(); $$
);

/* CONFERIR
 *
 *   select jobid, schedule, jobname, active from cron.job where jobname = 'maisa-envios';
 *   select status_code, content, created from net._http_response order by created desc limit 10;
 *   select public.disparar_envios();   -- disparar agora
 *
 *   -- o que está na fila, por negócio
 *   select tenant_id, count(*) filter (where enviado_em is null and desistido_em is null) as esperando,
 *          count(*) filter (where desistido_em is not null) as desistidos, max(enviado_em) as ultimo
 *     from public.envios_whatsapp group by tenant_id;
 */
