/* ═══════════════════════════════════════════════════════════════════════════════
 * 039 — RECEBIMENTOS PELO ASAAS: a subconta que a plataforma abre para o negócio (27/10/2026)
 *
 * A opção B do pedido vindo do Smiller, ATRÁS DE FLAG (`RECEBIMENTOS_ASAAS`): a conta Asaas da
 * plataforma abre uma subconta no CPF ou CNPJ do profissional, sem ele ver o Asaas; a cobrança vira
 * uma página com Pix, boleto e cartão, e o aviso de pagamento dá a baixa sozinho.
 *
 * O que esta migração cria:
 *   1 · `contas_de_recebimento` — a subconta de cada negócio: o id no Asaas, a carteira, a situação e
 *       o HASH do token do aviso. A chave da subconta NÃO mora aqui: vai para o Vault, e só a
 *       service role lê (`conta_de_recebimento`);
 *   2 · as funções do cofre (`guardar_conta_de_recebimento`, `conta_de_recebimento`,
 *       `atualizar_situacao_de_recebimento`, `negocio_do_aviso`), todas só service role;
 *   3 · em `recebimentos`, o meio (`pix` estático ou `asaas`), o id da cobrança lá e o link, e a
 *       forma `asaas` de quem pagou pela página.
 *
 * ⚠️ A CHAVE SÓ VEM UMA VEZ: o Asaas a devolve na criação da subconta e nunca mais. Quem chama
 * `guardar_conta_de_recebimento` faz isso antes de qualquer outra chamada.
 *
 * ⚠️ DEPENDE DA 038 (`recebimentos`). Rodar sem a flag não liga nada: as tabelas ficam vazias.
 * Aditivo e reexecutável.
 * ═══════════════════════════════════════════════════════════════════════════════ */

-- ── 1 · a subconta de cada negócio ───────────────────────────────────────────
create table if not exists public.contas_de_recebimento (
  tenant_id     uuid primary key references public.negocios (id) on delete cascade,
  provedor      text not null default 'asaas' check (provedor in ('asaas')),
  ambiente      text not null check (ambiente in ('sandbox', 'producao')),
  id_conta      text not null check (length(id_conta) between 1 and 80),
  wallet_id     text check (wallet_id is null or length(wallet_id) <= 80),
  situacao      text not null default 'pendente' check (situacao in ('pendente', 'em_analise', 'aprovada', 'recusada')),
  /* sha256 do token que o Asaas manda no cabeçalho do aviso. O token em si não se guarda. */
  token_hash    text not null unique check (length(token_hash) = 64),
  /* O id do segredo no Vault, onde mora a chave da subconta. */
  segredo_id    uuid not null,
  /* O aviso de pagamento foi cadastrado no Asaas. Falso: a conferência da conta tenta de novo, com
   * token novo (o antigo não se guarda, só o hash). */
  aviso_cadastrado boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

/* Reexecutável sobre uma versão anterior desta mesma migração. */
alter table public.contas_de_recebimento add column if not exists aviso_cadastrado boolean not null default false;

alter table public.contas_de_recebimento enable row level security;

/* Quem tem sessão vê a situação da própria conta. A chave nunca está nesta tabela. */
drop policy if exists "membro lê" on public.contas_de_recebimento;
create policy "membro lê" on public.contas_de_recebimento
  for select to authenticated
  using (tenant_id in (select public.negocios_do_usuario()));

-- ── 2 · o cofre ──────────────────────────────────────────────────────────────
create or replace function public.guardar_conta_de_recebimento(
  p_tenant     uuid,
  p_ambiente   text,
  p_id_conta   text,
  p_wallet     text,
  p_chave      text,
  p_token_hash text,
  p_situacao   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo uuid;
begin
  if exists (select 1 from public.contas_de_recebimento where tenant_id = p_tenant) then
    raise exception 'Este negócio já tem conta de recebimentos.';
  end if;
  if coalesce(p_chave, '') = '' then
    raise exception 'sem a chave da subconta';
  end if;

  select vault.create_secret(p_chave, 'maisa_recebimentos_' || p_tenant::text, 'chave da subconta Asaas do negócio')
    into v_segredo;

  insert into public.contas_de_recebimento (tenant_id, ambiente, id_conta, wallet_id, situacao, token_hash, segredo_id)
  values (p_tenant, p_ambiente, p_id_conta, nullif(p_wallet, ''), p_situacao, p_token_hash, v_segredo);
end;
$$;

/* `drop` antes: `create or replace` não troca o formato da resposta de uma função que já existe. */
drop function if exists public.conta_de_recebimento(uuid);
create function public.conta_de_recebimento(p_tenant uuid)
returns table (ambiente text, id_conta text, wallet_id text, situacao text, aviso_cadastrado boolean, chave text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.ambiente, c.id_conta, c.wallet_id, c.situacao, c.aviso_cadastrado, s.decrypted_secret
    from public.contas_de_recebimento c
    join vault.decrypted_secrets s on s.id = c.segredo_id
   where c.tenant_id = p_tenant
$$;

create or replace function public.atualizar_situacao_de_recebimento(p_tenant uuid, p_situacao text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contas_de_recebimento
     set situacao = p_situacao, atualizado_em = now()
   where tenant_id = p_tenant
$$;

/* O aviso de pagamento cadastrado de novo, com token novo: o hash troca, e o antigo deixa de valer. */
create or replace function public.trocar_token_de_recebimento(p_tenant uuid, p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contas_de_recebimento
     set token_hash = p_token_hash, aviso_cadastrado = true, atualizado_em = now()
   where tenant_id = p_tenant
$$;

/* O aviso de pagamento chega sem sessão: o token do cabeçalho é o que diz de quem é. */
create or replace function public.negocio_do_aviso(p_token_hash text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.contas_de_recebimento where token_hash = p_token_hash
$$;

revoke all on function public.guardar_conta_de_recebimento(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.conta_de_recebimento(uuid) from public, anon, authenticated;
revoke all on function public.atualizar_situacao_de_recebimento(uuid, text) from public, anon, authenticated;
revoke all on function public.negocio_do_aviso(text) from public, anon, authenticated;
revoke all on function public.trocar_token_de_recebimento(uuid, text) from public, anon, authenticated;
grant execute on function public.trocar_token_de_recebimento(uuid, text) to service_role;
grant execute on function public.guardar_conta_de_recebimento(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.conta_de_recebimento(uuid) to service_role;
grant execute on function public.atualizar_situacao_de_recebimento(uuid, text) to service_role;
grant execute on function public.negocio_do_aviso(text) to service_role;

-- ── 3 · a cobrança pelo Asaas, nos recebimentos ──────────────────────────────
alter table public.recebimentos add column if not exists meio text not null default 'pix';
alter table public.recebimentos drop constraint if exists recebimentos_meio_check;
alter table public.recebimentos add constraint recebimentos_meio_check check (meio in ('pix', 'asaas'));
alter table public.recebimentos add column if not exists id_externo text;
alter table public.recebimentos add column if not exists link text;

alter table public.recebimentos drop constraint if exists recebimentos_forma_check;
alter table public.recebimentos add constraint recebimentos_forma_check check (forma in ('pix', 'na_hora', 'asaas'));

-- ── conferência ──────────────────────────────────────────────────────────────
do $$
declare
  tem_tabela boolean;
  tem_meio   boolean;
begin
  select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contas_de_recebimento') into tem_tabela;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recebimentos' and column_name = 'meio') into tem_meio;
  raise notice '039 · contas_de_recebimento % · recebimentos.meio %',
    case when tem_tabela then 'ok' else 'FALTANDO' end,
    case when tem_meio   then 'ok' else 'FALTANDO' end;
end $$;
