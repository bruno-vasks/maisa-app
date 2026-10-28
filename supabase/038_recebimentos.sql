/* ═══════════════════════════════════════════════════════════════════════════════
 * 038 — RECEBIMENTOS: o Pix na chave do profissional, e o comprovante (27/10/2026)
 *
 * ★ PEDIDO DO BRUNO, vindo do Smiller: o negócio recebe do cliente na chave Pix de sempre, a MAISA
 * manda o código com o valor certo depois do atendimento, lê o comprovante que o cliente devolve
 * e o profissional confirma olhando o extrato. Confirmado, sai o recibo ou a nota.
 *
 * ⚠️ NÃO É A ASSINATURA (`cobrancas_*`, 028): lá o negócio paga a MAISA. Aqui o dinheiro vai do
 * cliente para o negócio e nunca passa por nós.
 *
 * O que esta migração cria:
 *   1 · `config_recebimentos` — a chave Pix, o nome e a cidade, e o que fazer depois do atendimento
 *   2 · `clientes.como_paga` — padrão, por mês (no dia do recibo) ou não cobrar; e a view
 *   3 · `recebimentos` + `recebimento_atendimentos` — o "em aberto": um Pix mandado e não confirmado
 *   4 · `comprovantes_de_pagamento` — o que o cliente mandou, lido, esperando o dono conferir
 *   5 · as funções que precisam ser atômicas (criar, mudar, confirmar, descartar) e as varreduras
 *   6 · a origem `cobranca` na fila de envios (036)
 *   7 · a nota de alguns atendimentos só (a NFS-e de um pagamento), irmã de `abrir_nota` (015)
 *   8 · o agendador de 5 em 5 minutos, como a 037
 *
 * As regras (qual cobrança o comprovante paga, se quem recebeu é o profissional, quando perguntar)
 * moram em TypeScript, em `nucleo/dominio/recebimentos.ts`. O banco só garante o que precisa ser
 * atômico: um atendimento em uma cobrança só, a mesma transação Pix uma vez só, e a confirmação
 * que não roda em dobro.
 *
 * ⚠️ DEPENDE DA 033 (a view `v_clientes` repete a lista dela e acrescenta no fim) e da 036 (a fila).
 * ⚠️ ESPECÍFICO DE AMBIENTE no §8, como a 037: carrega a URL do deploy.
 * Aditivo e reexecutável.
 * ═══════════════════════════════════════════════════════════════════════════════ */

-- ── 1 · os ajustes do negócio ────────────────────────────────────────────────
create table if not exists public.config_recebimentos (
  tenant_id     uuid primary key references public.negocios (id) on delete cascade,
  /* O tipo é escolhido pelo dono, nunca adivinhado: onze dígitos podem ser CPF ou celular (ver
   * `dominio/pix.ts`). A chave é gravada já normalizada (`chavePix`). */
  tipo_da_chave text check (tipo_da_chave in ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria')),
  chave         text check (chave is null or length(chave) between 1 and 77),
  nome          text check (nome is null or length(nome) between 1 and 25),
  cidade        text check (cidade is null or length(cidade) between 1 and 15),
  depois_do_atendimento text not null default 'desligado'
                  check (depois_do_atendimento in ('desligado', 'perguntar', 'direto')),
  /* Desde quando a cobrança depois do atendimento está ligada: o que acabou antes nunca é cobrado
   * sozinho. Quem grava é o caso de uso, ao ligar. */
  ligado_em     timestamptz,
  atualizado_em timestamptz not null default now(),
  check ((tipo_da_chave is null) = (chave is null))
);

alter table public.config_recebimentos enable row level security;

drop policy if exists "membro lê" on public.config_recebimentos;
create policy "membro lê" on public.config_recebimentos
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

/* ⚠️ A CHAVE PIX É PARA ONDE VAI O DINHEIRO: só dono e gestor gravam, como `config_fiscal` e o
 * WhatsApp (003). Com "membro", um atendente poria a chave dele e receberia todo Pix do negócio. */
drop policy if exists "membro insere" on public.config_recebimentos;
drop policy if exists "dono insere" on public.config_recebimentos;
create policy "dono insere" on public.config_recebimentos
  for insert to authenticated
  with check (public.tem_papel(tenant_id, array['dono','gestor']));

drop policy if exists "membro atualiza" on public.config_recebimentos;
drop policy if exists "dono atualiza" on public.config_recebimentos;
create policy "dono atualiza" on public.config_recebimentos
  for update to authenticated
  using (public.tem_papel(tenant_id, array['dono','gestor']))
  with check (public.tem_papel(tenant_id, array['dono','gestor']));

-- ── 2 · como cada cliente paga ───────────────────────────────────────────────
alter table public.clientes add column if not exists como_paga text not null default 'padrao';

alter table public.clientes drop constraint if exists clientes_como_paga_check;
alter table public.clientes add constraint clientes_como_paga_check
  check (como_paga in ('padrao', 'por_mes', 'nao_cobrar'));

comment on column public.clientes.como_paga is
  'padrao = segue o ajuste do negócio (config_recebimentos.depois_do_atendimento); por_mes = um Pix '
  'por mês, no dia_recibo, com as sessões do mês, e o recibo só depois de pago; nao_cobrar = a MAISA '
  'nunca manda Pix. Ver 038_recebimentos.sql.';

/* A coluna nova vai no FIM: `create or replace view` só aceita acrescentar. A lista de cima é a
 * da 033, igual. */
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
    c.recibos_por_mes,
    c.como_paga
  from public.clientes c
  left join public.v_cliente_competencia cc
    on  cc.tenant_id   = c.tenant_id
    and cc.cliente_id  = c.id
    and cc.competencia = public.competencia_atual(c.tenant_id);

-- ── 3 · os recebimentos ──────────────────────────────────────────────────────
create table if not exists public.recebimentos (
  /* Cunhado pelo caso de uso: o identificador do Pix sai dele, antes de existir a linha. */
  id            uuid primary key,
  tenant_id     uuid not null references public.negocios (id) on delete cascade,
  cliente_id    uuid references public.clientes (id) on delete set null,
  telefone      text not null check (length(telefone) between 8 and 40),
  nome          text check (nome is null or length(nome) <= 200),
  /* Somado pelo banco sobre os atendimentos presos, nunca vindo de fora (`criar_recebimento`). */
  valor         numeric(10, 2) not null check (valor > 0 and valor <= 100000),
  descricao     text not null check (length(descricao) between 1 and 200),
  identificador text not null check (identificador ~ '^[A-Za-z0-9]{1,25}$'),
  situacao      text not null check (situacao in ('perguntar', 'aberto', 'pago', 'cancelado')),
  forma         text check (forma in ('pix', 'na_hora')),
  perguntado_em timestamptz,
  pago_em       timestamptz,
  cpf_pedido_em timestamptz,
  decidido_por  text check (decidido_por is null or length(decidido_por) <= 120),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, identificador),
  check ((situacao = 'pago') = (pago_em is not null))
);

create index if not exists recebimentos_em_aberto_idx
  on public.recebimentos (tenant_id, telefone)
  where situacao in ('perguntar', 'aberto');

create index if not exists recebimentos_tenant_criado_idx
  on public.recebimentos (tenant_id, criado_em desc);

/* Quais atendimentos cada recebimento cobre. `ativo` cai quando o recebimento é cancelado, e o
 * índice parcial abaixo é a garantia que importa: um atendimento ativo em UMA cobrança só. Sem ele,
 * a rotina e o botão "Mandar Pix" ao mesmo tempo cobrariam o mesmo corte duas vezes. */
create table if not exists public.recebimento_atendimentos (
  tenant_id      uuid not null references public.negocios (id) on delete cascade,
  recebimento_id uuid not null references public.recebimentos (id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos (id) on delete cascade,
  ativo          boolean not null default true,
  primary key (recebimento_id, atendimento_id)
);

create unique index if not exists recebimento_atendimentos_um_ativo
  on public.recebimento_atendimentos (atendimento_id)
  where ativo;

alter table public.recebimentos enable row level security;
alter table public.recebimento_atendimentos enable row level security;

/* Só leitura para quem tem sessão. Escrever é pelas funções da §5, que conferem o negócio e as
 * transições; o agente e as rotinas usam service role. */
drop policy if exists "membro lê" on public.recebimentos;
create policy "membro lê" on public.recebimentos
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

drop policy if exists "membro lê" on public.recebimento_atendimentos;
create policy "membro lê" on public.recebimento_atendimentos
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

-- ── 4 · os comprovantes ──────────────────────────────────────────────────────
create table if not exists public.comprovantes_de_pagamento (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.negocios (id) on delete cascade,
  telefone            text not null check (length(telefone) between 8 and 40),
  /* A cobrança que a MAISA sugeriu. Na confirmação, a que o dono escolheu. */
  recebimento_id      uuid references public.recebimentos (id) on delete set null,
  /* Tudo abaixo foi LIDO por um modelo numa imagem que o cliente mandou: texto de fora, com teto. */
  valor               numeric(12, 2) check (valor is null or valor between 0 and 1000000),
  pago_em             date,
  recebedor_nome      text check (recebedor_nome is null or length(recebedor_nome) <= 200),
  recebedor_chave     text check (recebedor_chave is null or length(recebedor_chave) <= 200),
  recebedor_documento text check (recebedor_documento is null or length(recebedor_documento) <= 40),
  pagador_nome        text check (pagador_nome is null or length(pagador_nome) <= 200),
  banco               text check (banco is null or length(banco) <= 120),
  id_transacao        text check (id_transacao is null or length(id_transacao) <= 120),
  identificador       text check (identificador is null or length(identificador) <= 120),
  conferencia         text not null check (conferencia in ('confere', 'nao_confere', 'sem_como_saber')),
  situacao            text not null default 'a_conferir'
                        check (situacao in ('a_conferir', 'confirmado', 'descartado')),
  motivo              text check (motivo is null or length(motivo) <= 300),
  /* O id da mensagem no WhatsApp: a reentrega do mesmo evento não registra duas vezes. */
  mensagem_id         text check (mensagem_id is null or length(mensagem_id) <= 120),
  criado_em           timestamptz not null default now(),
  decidido_em         timestamptz,
  decidido_por        text check (decidido_por is null or length(decidido_por) <= 120)
);

/* O mesmo comprovante não entra duas vezes: o id fim a fim do Pix é único no país. */
create unique index if not exists comprovantes_mesma_transacao
  on public.comprovantes_de_pagamento (tenant_id, id_transacao)
  where id_transacao is not null;

create unique index if not exists comprovantes_mesma_mensagem
  on public.comprovantes_de_pagamento (tenant_id, mensagem_id)
  where mensagem_id is not null;

create index if not exists comprovantes_a_conferir_idx
  on public.comprovantes_de_pagamento (tenant_id, criado_em)
  where situacao = 'a_conferir';

alter table public.comprovantes_de_pagamento enable row level security;

drop policy if exists "membro lê" on public.comprovantes_de_pagamento;
create policy "membro lê" on public.comprovantes_de_pagamento
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

-- ── 5 · as funções ───────────────────────────────────────────────────────────

/* Cria o recebimento e prende os atendimentos, numa transação só. O valor, o telefone, o nome e o
 * cliente saem dos atendimentos (nunca de quem chama). Atendimento que já está em outra cobrança
 * ativa: devolve vazio, e quem chama entende "já foi". */
create or replace function public.criar_recebimento(
  p_id            uuid,
  p_tenant        uuid,
  p_identificador text,
  p_situacao      text,
  p_descricao     text,
  p_atendimentos  uuid[]
)
returns setof public.recebimentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd      int;
  v_valor    numeric;
  v_clientes uuid[];
  v_telefone text;
  v_nome     text;
begin
  if auth.uid() is not null and not (p_tenant in (select public.negocios_do_usuario())) then
    raise exception 'negócio de outra pessoa';
  end if;
  if p_situacao not in ('perguntar', 'aberto') then
    raise exception 'recebimento nasce perguntando ou em aberto, não %', p_situacao;
  end if;

  select count(*), coalesce(sum(a.servico_valor), 0),
         array_agg(distinct a.cliente_id) filter (where a.cliente_id is not null),
         min(coalesce(nullif(a.cliente_tel, ''), c.telefone)),
         min(coalesce(c.nome, a.cliente_nome))
    into v_qtd, v_valor, v_clientes, v_telefone, v_nome
    from public.atendimentos a
    left join public.clientes c on c.tenant_id = a.tenant_id and c.id = a.cliente_id
   where a.tenant_id = p_tenant
     and a.id = any(p_atendimentos)
     and a.situacao = 'marcado';

  if v_qtd is distinct from coalesce(array_length(p_atendimentos, 1), 0) or v_qtd = 0 then
    raise exception 'atendimento que não é deste negócio, ou cancelado';
  end if;
  if coalesce(array_length(v_clientes, 1), 0) > 1 then
    raise exception 'um recebimento é de uma pessoa só';
  end if;
  /* Só dígitos: o atendimento marcado pelo painel guarda o telefone como foi digitado, "(11)
   * 98888-7777", e quem procura o recebimento pelo telefone compara os últimos oito dígitos. */
  v_telefone := nullif(regexp_replace(coalesce(v_telefone, ''), '\D', '', 'g'), '');
  if v_telefone is null or length(v_telefone) < 8 then
    raise exception 'atendimento sem telefone: não há para onde mandar o Pix';
  end if;
  if v_valor <= 0 then
    raise exception 'atendimento sem valor';
  end if;

  begin
    insert into public.recebimentos (id, tenant_id, cliente_id, telefone, nome, valor, descricao, identificador, situacao)
    values (p_id, p_tenant, v_clientes[1], v_telefone, v_nome, v_valor, p_descricao, p_identificador, p_situacao);

    insert into public.recebimento_atendimentos (tenant_id, recebimento_id, atendimento_id)
    select p_tenant, p_id, unnest(p_atendimentos);
  exception when unique_violation then
    /* Outro recebimento ativo já prende um destes atendimentos (a rotina e o botão ao mesmo
     * tempo), ou o mesmo pedido de novo. Nada fica gravado. */
    return;
  end;

  return query select * from public.recebimentos where id = p_id;
end;
$$;

/* A transição, com guarda: só muda quem está numa das situações de `p_de`. Devolve a linha mudada,
 * ou vazio quando outra decisão chegou antes (o duplo clique, o "1" no WhatsApp e o botão juntos). */
create or replace function public.mudar_recebimento(
  p_tenant uuid,
  p_id     uuid,
  p_de     text[],
  p_para   text,
  p_forma  text,
  p_por    text
)
returns setof public.recebimentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.recebimentos;
begin
  if auth.uid() is not null and not (p_tenant in (select public.negocios_do_usuario())) then
    raise exception 'negócio de outra pessoa';
  end if;

  update public.recebimentos r
     set situacao      = p_para,
         forma         = case when p_para = 'pago' then p_forma else r.forma end,
         pago_em       = case when p_para = 'pago' then now() else null end,
         decidido_por  = left(p_por, 120),
         atualizado_em = now()
   where r.tenant_id = p_tenant
     and r.id = p_id
     and r.situacao = any(p_de)
  returning r.* into v;

  /* Nada mudou (outra decisão chegou antes): nada se solta. Soltar aqui liberaria o atendimento de
   * um recebimento já PAGO, e o "Mandar Pix" cobraria de novo. */
  if not found then
    return;
  end if;

  if p_para = 'cancelado' then
    update public.recebimento_atendimentos ra
       set ativo = false
     where ra.tenant_id = p_tenant and ra.recebimento_id = p_id;
  end if;

  return next v;
end;
$$;

/* O dono conferiu no extrato: o comprovante fica confirmado e o recebimento, pago, juntos. */
create or replace function public.confirmar_comprovante(
  p_tenant      uuid,
  p_id          uuid,
  p_recebimento uuid,
  p_por         text
)
returns setof public.recebimentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprovantes_de_pagamento;
begin
  if auth.uid() is not null and not (p_tenant in (select public.negocios_do_usuario())) then
    raise exception 'negócio de outra pessoa';
  end if;

  select * into v_comp from public.comprovantes_de_pagamento
   where tenant_id = p_tenant and id = p_id
   for update;
  if not found then
    raise exception 'Comprovante não encontrado.';
  end if;
  if v_comp.situacao <> 'a_conferir' then
    raise exception 'Este comprovante já foi conferido.';
  end if;

  update public.recebimentos r
     set situacao = 'pago', forma = 'pix', pago_em = now(), decidido_por = left(p_por, 120), atualizado_em = now()
   where r.tenant_id = p_tenant and r.id = p_recebimento and r.situacao in ('perguntar', 'aberto');
  if not found then
    raise exception 'Esta cobrança não está mais em aberto.';
  end if;

  update public.comprovantes_de_pagamento
     set situacao = 'confirmado', recebimento_id = p_recebimento, decidido_em = now(), decidido_por = left(p_por, 120)
   where id = p_id;

  return query select * from public.recebimentos where id = p_recebimento;
end;
$$;

create or replace function public.descartar_comprovante(
  p_tenant uuid,
  p_id     uuid,
  p_motivo text,
  p_por    text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not (p_tenant in (select public.negocios_do_usuario())) then
    raise exception 'negócio de outra pessoa';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga por que o comprovante foi descartado.';
  end if;

  update public.comprovantes_de_pagamento
     set situacao = 'descartado', motivo = left(trim(p_motivo), 300), decidido_em = now(), decidido_por = left(p_por, 120)
   where tenant_id = p_tenant and id = p_id and situacao = 'a_conferir';
  return found;
end;
$$;

/* Os negócios com a chave Pix configurada: é por eles que a rotina passa. Sem filtro de inquilino,
 * por isso só service role. */
create or replace function public.negocios_com_recebimento()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.config_recebimentos where chave is not null
$$;

/* O que acabou na janela e nunca entrou em cobrança: atendimento marcado, com valor, com telefone,
 * de quem não está como "por mês" ou "não cobrar", e que não é cliente de teste. A janela vem do
 * domínio (`janelaDepoisDoAtendimento`).
 *
 * ⚠️ "NUNCA ENTROU", E NÃO "NÃO ESTÁ AGORA": o link cancelado conta. Sem isso, o "não cobrar" do
 * dono durava cinco minutos: o próximo tique via o atendimento solto e perguntava de novo. A rotina
 * cobra cada atendimento uma vez; depois disso, só o botão "Mandar Pix". */
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
   order by a.fim
$$;

/* As sessões de um mês de quem paga "por mês" que nunca entraram em cobrança (o mesmo "uma vez só"
 * de cima), com telefone (sem ele, `criar_recebimento` recusa, e a recusa derrubava a rodada do
 * negócio inteiro). `p_ate` exclusivo. */
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
   order by a.data_local, a.inicio
$$;

revoke all on function public.criar_recebimento(uuid, uuid, text, text, text, uuid[]) from public, anon;
revoke all on function public.mudar_recebimento(uuid, uuid, text[], text, text, text) from public, anon;
revoke all on function public.confirmar_comprovante(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.descartar_comprovante(uuid, uuid, text, text) from public, anon;
grant execute on function public.criar_recebimento(uuid, uuid, text, text, text, uuid[]) to authenticated, service_role;
grant execute on function public.mudar_recebimento(uuid, uuid, text[], text, text, text) to authenticated, service_role;
grant execute on function public.confirmar_comprovante(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.descartar_comprovante(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.negocios_com_recebimento() from public, anon, authenticated;
revoke all on function public.atendimentos_que_acabaram(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.sessoes_do_mes_a_cobrar(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.negocios_com_recebimento() to service_role;
grant execute on function public.atendimentos_que_acabaram(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.sessoes_do_mes_a_cobrar(uuid, uuid, date, date) to service_role;

-- ── 6 · a fila de envios aceita a cobrança ───────────────────────────────────
alter table public.envios_whatsapp drop constraint if exists envios_whatsapp_origem_check;
alter table public.envios_whatsapp add constraint envios_whatsapp_origem_check
  check (origem in ('lote_de_recibos', 'recibo', 'cobranca'));

-- ── 7 · a nota de um pagamento ───────────────────────────────────────────────
/* `abrir_nota` (015) prende TODOS os atendimentos do cliente sem nota: é a nota do mês. Confirmado
 * um pagamento, a nota é só dos atendimentos que ele pagou. Mesma claim, mesma forma, com a lista. */
create or replace function public.abrir_nota_dos_atendimentos(
  p_tenant_id     uuid,
  p_cliente_id    uuid,
  p_atendimentos  uuid[],
  p_ref           text,
  p_ambiente      text,
  p_discriminacao text
)
returns table (
  nota_id      uuid,
  valor        numeric,
  atendimentos int,
  competencia  date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota  uuid;
  v_ids   uuid[];
  v_valor numeric;
  v_comp  date;
  v_cli   record;
begin
  select array_agg(a.id), coalesce(sum(a.servico_valor), 0), max(a.competencia)
    into v_ids, v_valor, v_comp
  from (
    select b.id, b.servico_valor, b.competencia
      from public.atendimentos b
     where b.tenant_id  = p_tenant_id
       and b.cliente_id = p_cliente_id
       and b.id = any(p_atendimentos)
       and b.nota_id is null
       and b.situacao = 'marcado'
       and b.inicio < now()
       for update skip locked
  ) a;

  if v_ids is null or array_length(v_ids, 1) is null then
    return;
  end if;

  select c.nome, c.cpf, c.email, c.telefone
    into v_cli
  from public.clientes c
  where c.tenant_id = p_tenant_id and c.id = p_cliente_id;

  insert into public.notas (
    tenant_id, ref, status, valor, discriminacao, competencia, cliente_id, ambiente,
    tomador_nome, tomador_cpf, tomador_email, tomador_telefone
  ) values (
    p_tenant_id, p_ref, 'pendente', v_valor, p_discriminacao, v_comp, p_cliente_id, p_ambiente,
    v_cli.nome, v_cli.cpf, v_cli.email, v_cli.telefone
  )
  returning id into v_nota;

  update public.atendimentos a
     set nota_id = v_nota
   where a.id = any(v_ids);

  return query select v_nota, v_valor, array_length(v_ids, 1), v_comp;
end;
$$;

revoke all on function public.abrir_nota_dos_atendimentos(uuid, uuid, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.abrir_nota_dos_atendimentos(uuid, uuid, uuid[], text, text, text) to service_role;

-- ── 8 · o agendador ──────────────────────────────────────────────────────────
/* A `037` de novo, para outra rota: o mesmo `pg_cron` + `pg_net` e o MESMO segredo do Vault
 * (`maisa_rotinas_secret`). A rota cria o que venceu (o Pix depois do atendimento, o do mês, a
 * pergunta ao dono) e põe na fila; quem manda é a fila. */
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_recebimentos()
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
    url     := 'https://maisa-app-sooty.vercel.app/api/rotinas/recebimentos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_segredo),
    body    := '{}'::jsonb,
    timeout_milliseconds := 290000
  ) into v_id;

  return v_id;
end;
$$;

comment on function public.disparar_recebimentos() is
  'Chama POST /api/rotinas/recebimentos com o segredo do Vault. Agendada por pg_cron a cada 5 min.';

revoke all on function public.disparar_recebimentos() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('maisa-recebimentos');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'maisa-recebimentos',
  '*/5 * * * *',
  $$ select public.disparar_recebimentos(); $$
);

-- ── conferência ──────────────────────────────────────────────────────────────
do $$
declare
  tem_config  boolean;
  tem_coluna  boolean;
  tem_view    boolean;
  tem_tabelas boolean;
  tem_origem  boolean;
begin
  select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'config_recebimentos') into tem_config;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clientes' and column_name = 'como_paga') into tem_coluna;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_clientes' and column_name = 'como_paga') into tem_view;
  select count(*) = 3 from information_schema.tables
   where table_schema = 'public' and table_name in ('recebimentos', 'recebimento_atendimentos', 'comprovantes_de_pagamento')
    into tem_tabelas;
  select exists (
    select 1 from pg_constraint where conname = 'envios_whatsapp_origem_check'
       and pg_get_constraintdef(oid) like '%cobranca%'
  ) into tem_origem;

  raise notice '038 · config_recebimentos % · clientes.como_paga % · v_clientes.como_paga % · tabelas % · fila aceita cobrança %',
    case when tem_config  then 'ok' else 'FALTANDO' end,
    case when tem_coluna  then 'ok' else 'FALTANDO' end,
    case when tem_view    then 'ok' else 'FALTANDO' end,
    case when tem_tabelas then 'ok' else 'FALTANDO' end,
    case when tem_origem  then 'ok' else 'FALTANDO' end;
end $$;

/* CONFERIR
 *
 *   select jobid, schedule, jobname, active from cron.job where jobname = 'maisa-recebimentos';
 *   select public.disparar_recebimentos();   -- disparar agora
 *   select tenant_id, situacao, count(*) from public.recebimentos group by 1, 2;
 */
