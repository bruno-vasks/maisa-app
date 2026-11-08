/* ═══════════════════════════════════════════════════════════════════════════════
 * 041 — DESFAZ A 040 (08/11/2026)
 *
 * A 040 criou o lado de banco da "maisa da maisa" como código especial do app: a ficha de
 * cada lead (`leads_da_casa`), a origem `vendas` na fila de envios e o agendador de 10 em 10
 * minutos para `/api/rotinas/vendas`. Em 08/11/2026 o Bruno decidiu outro caminho: a conta
 * oficial da maisa é uma cliente comum do app, configurada pela tela (respostas prontas,
 * serviço "Conversar com o Bruno", Google Agenda), sem código próprio. O código saiu no revert
 * do commit d46eda2, e esta migração tira do banco o que a 040 pôs.
 *
 * ⚠️ RODAR ANTES DO DEPLOY DO REVERT, ou logo depois: sem ela, o pg_cron segue chamando uma
 * rota que deixou de existir, de 10 em 10 minutos.
 *
 * Rodar duas vezes não estraga nada, e em banco onde a 040 nunca rodou não faz nada.
 * ═══════════════════════════════════════════════════════════════════════════════ */

-- 1 · o agendador e a função que ele chamava
do $$
begin
  perform cron.unschedule('maisa-vendas');
exception when others then
  null;
end;
$$;
drop function if exists public.disparar_vendas();

-- 2 · as fichas dos leads (nunca chegaram a ser escritas: a casa não foi ligada)
drop table if exists public.leads_da_casa;

-- 3 · a fila de envios volta a aceitar só as origens da 038. Nenhuma mensagem de origem
--     `vendas` chegou a sair; o delete existe só para a constraint não falhar se houver.
delete from public.envios_whatsapp where origem = 'vendas';
alter table public.envios_whatsapp drop constraint if exists envios_whatsapp_origem_check;
alter table public.envios_whatsapp add constraint envios_whatsapp_origem_check
  check (origem in ('lote_de_recibos', 'recibo', 'cobranca'));

/* CONFERIR
 *
 *   select jobname from cron.job where jobname = 'maisa-vendas';            -- nenhuma linha
 *   select to_regclass('public.leads_da_casa');                             -- null
 */
