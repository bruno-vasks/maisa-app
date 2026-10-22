-- ═════════════════════════════════════════════════════════════════════════════
-- MAISA — 034 · O TESTE GRÁTIS NASCE COM O PLANO QUE A PESSOA ESCOLHEU
--
-- Rode DEPOIS da 028 (usa `assinaturas.provedor`). Aditivo e reexecutável.
--
-- ── ★ DE ONDE VEIO (22/10/2026) ──
--
-- A landing page tradicional vai prometer "teste grátis, sem cartão", e o link dela é o
-- `/assinar/<plano>?teste=1`: o mesmo pré-cadastro, sem o Pix (ver `app/assinar/[plano]/funil.ts`).
-- O teste em si já existia — todo negócio nasce em `trial` de 14 dias no `provisionar_negocio`.
-- O que estava errado era a linha que ele grava:
--
--     insert into public.assinaturas (…) values (v_tenant, 'Profissional', 149.90, 'trial', …)
--
--   · o plano era 'Profissional' para TODO MUNDO, e a gaveta "Meu plano" oferece como botão
--     principal o plano da linha. Quem escolheu o Essencial (R$ 127) no `/assinar` chegava ao
--     fim do teste com "Assinar Profissional · R$ 197/mês" na cara;
--   · 149,90 não é preço de plano nenhum (os de hoje são 127 / 197 / 397, em `_lib/planos.ts`).
--     O e-mail de aviso já evitava citar o preço por causa disso (`textoDoAviso`).
--
-- ── O QUE ESTE ARQUIVO FAZ ──
--
--   1 · `plano_do_cadastro(user)`: lê o `user_metadata.plano` que o `/assinar` grava no
--       cadastro (`essencial` → 'Essencial'). Fora da lista, nulo.
--   2 · `provisionar_negocio` recriada, IGUAL à da 005 menos a linha da assinatura: plano
--       escolhido (ou 'Profissional', o destaque das LPs, para quem não escolheu) e preço NULO —
--       ninguém pagou nada, e quem grava preço é o webhook. A 005 foi editada junto, para rodá-la
--       de novo não desfazer isto.
--   3 · conserta as linhas que já existem e ainda estão INTACTAS: `trial`, sem provedor,
--       'Profissional' a 149.90 — ou seja, exatamente o que a 005 gravou e ninguém tocou depois.
--
-- ── ⚠️ POR QUE O PLANO VEM DO METADATA, E NÃO DE UM PARÂMETRO NOVO DO `criar_negocio` ──
--
-- Porque assim o código não depende desta migração. O `/assinar` grava `plano` no metadata
-- desde 21/09/2026; com um parâmetro novo, o app publicado ANTES desta migração chamaria uma
-- função que não existe e o negócio não nasceria — ninguém entraria no funil. Do jeito que
-- está, código e banco podem ir em qualquer ordem: sem a 034, o teste continua funcionando,
-- só que com a linha antiga ('Profissional' a 149.90) e o botão principal do plano errado
-- para quem escolheu o Essencial (o Essencial continua na lista "Outros planos", com o preço
-- dele, e o Pix cobra o que a pessoa clicar).
--
-- ⚠️ O METADATA É ESCRITO PELO PRÓPRIO USUÁRIO (`auth.updateUser`). Não é furo aqui: a linha
-- de trial não libera nada que o plano mude, o preço cobrado é o do produto do provedor para
-- o plano CLICADO, e o webhook regrava plano e preço com o que foi pago.
--
-- ⚠️ `npm run banco:conferir` NÃO VÊ ESTA MIGRAÇÃO (não cria coluna nem tabela). Para conferir
-- à mão, no SQL Editor:
--     select pg_get_functiondef('public.provisionar_negocio(uuid,text,text,text)'::regprocedure)
--       like '%plano_do_cadastro%';
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · o plano que a pessoa escolheu
--
-- Não é `security definer`: quem chama é o `provisionar_negocio`, que já roda como dono do
-- banco. Fechada para o navegador mesmo assim — ela lê `auth.users`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.plano_do_cadastro(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case lower(btrim(u.raw_user_meta_data ->> 'plano'))
           when 'essencial'    then 'Essencial'
           when 'profissional' then 'Profissional'
           when 'escala'       then 'Escala'
         end
  from auth.users u
  where u.id = p_user
$$;

comment on function public.plano_do_cadastro(uuid) is
  'O plano que a pessoa escolheu no /assinar (user_metadata.plano), com o nome que a tabela '
  'assinaturas guarda. Nulo quando não escolheu ou escreveu outra coisa. Ver 034_plano_do_teste.sql.';

revoke all on function public.plano_do_cadastro(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · provisionar_negocio — igual à 005, menos a linha da assinatura
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.provisionar_negocio(
  p_user         uuid,
  p_nome         text,
  p_vertical     text default 'generico',
  /* Nome de quem atende. Ausente ⇒ deduz do cadastro do usuário. Numa clínica de uma
   * pessoa, dono e profissional são a mesma pessoa e não faz sentido perguntar duas. */
  p_profissional text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant     uuid;
  v_prof       uuid;
  v_slug       text;
  v_nome_prof  text;
  v_primeiro   boolean;
  v_folga      smallint[];
  v_de         numeric(4,2);
  v_ate        numeric(4,2);
  v_horario    text;
  v_folga_txt  text;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Dono inexistente: %', p_user using errcode = 'foreign_key_violation';
  end if;

  if p_vertical not in ('terapeutas', 'barbeiros', 'generico') then
    raise exception 'Vertical inválida: %. Use terapeutas, barbeiros ou generico.', p_vertical
      using errcode = 'check_violation';
  end if;

  if length(btrim(coalesce(p_nome, ''))) < 2 then
    raise exception 'O negócio precisa de um nome.' using errcode = 'check_violation';
  end if;

  /* ── o negócio ──
   * O slug leva um sufixo do próprio uuid quando o nome já foi usado. Colisão não
   * retenta: duas barbearias "Do Zé" viram `do-ze` e `do-ze-a1b2c3`, e está resolvido. */
  v_tenant := gen_random_uuid();
  v_slug   := public.slugificar(p_nome);
  if v_slug is null or length(v_slug) < 3 then
    v_slug := 'negocio';
  end if;
  v_slug := left(v_slug, 30);
  if exists (select 1 from public.negocios where slug = v_slug) then
    v_slug := v_slug || '-' || left(replace(v_tenant::text, '-', ''), 6);
  end if;

  insert into public.negocios (id, nome, vertical, slug)
  values (v_tenant, btrim(p_nome), p_vertical, v_slug);

  /* ── o dono ──
   * `padrao` só quando esta pessoa ainda não tem negócio padrão: criar o segundo não
   * pode roubar o login de quem trabalha no primeiro todo dia. */
  v_primeiro := not exists (select 1 from public.membros where user_id = p_user and padrao);

  insert into public.membros (tenant_id, user_id, papel, padrao)
  values (v_tenant, p_user, 'dono', v_primeiro);

  /* ── a assinatura ──
   * Nasce em trial de 14 dias. Sem esta linha, `v_negocio` devolve plano nulo e a tela
   * de cobrança abre vazia — o que parece bug de código e é só linha que não existe.
   *
   * ★ O PLANO É O QUE A PESSOA ESCOLHEU, E O PREÇO É NULO (034, 22/10/2026). Até a 034 esta
   * linha gravava 'Profissional' a 149.90 para todo mundo: quem escolheu o Essencial no
   * `/assinar` via "Assinar Profissional" como botão principal no fim do teste, e 149,90 não
   * é preço de plano nenhum. O plano vem do `user_metadata` que o `/assinar` grava
   * (`plano_do_cadastro`); sem escolha, 'Profissional', o plano em destaque das LPs. O preço
   * fica nulo porque ninguém pagou nada — quem grava preço é o webhook, com o que o provedor
   * cobrou (`dominio/assinatura.ts`: "o núcleo nunca afirma quanto custa").
   *
   * ⚠️ OS 14 DIAS SÃO PROMESSA DE LANDING PAGE ("teste grátis de 14 dias"). A tela os repete
   * em `DIAS_DE_TESTE` (`dominio/assinatura.ts`), e o `funil.test.ts` do `/assinar` lê este
   * arquivo e reprova se divergirem. */
  insert into public.assinaturas (tenant_id, plano, preco, status, trial_fim, periodo_fim)
  values (
    v_tenant, coalesce(public.plano_do_cadastro(p_user), 'Profissional'), null, 'trial',
    (now() + interval '14 days')::date,
    (now() + interval '14 days')::date
  );

  /* ── a config fiscal, vazia e em homologação ──
   * Existir vazia é melhor que não existir: a tela de ajustes faz UPDATE numa linha que
   * está lá, e `v_negocio.fiscal_pronto` responde `false` com honestidade em vez de nulo.
   * Homologação é o default certo — ninguém emite nota real por acidente no dia 1. */
  insert into public.config_fiscal (tenant_id, ambiente)
  values (v_tenant, 'homologacao');

  /* ── quem atende ── */
  v_nome_prof := btrim(coalesce(
    nullif(btrim(p_profissional), ''),
    (select nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
       from auth.users u where u.id = p_user),
    (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user),
    btrim(p_nome)
  ));

  /* Expediente de partida por vertical. São chutes informados, não verdades — o dono
   * ajusta na primeira semana. O que importa é não começar em zero, porque expediente
   * vazio faz a grade recusar TODO horário e a Agenda parece quebrada. */
  if p_vertical = 'terapeutas' then
    v_folga := array[5,6]::smallint[];  -- sábado e domingo
    v_de := 9; v_ate := 19;
    v_horario := 'Seg–Sex 09–19'; v_folga_txt := 'sábado e domingo';
  elsif p_vertical = 'barbeiros' then
    v_folga := array[6]::smallint[];    -- domingo
    v_de := 9; v_ate := 20;
    v_horario := 'Seg–Sáb 09–20'; v_folga_txt := 'domingo';
  else
    v_folga := array[6]::smallint[];
    v_de := 9; v_ate := 19;
    v_horario := 'Seg–Sáb 09–19'; v_folga_txt := 'domingo';
  end if;

  insert into public.profissionais
    (tenant_id, nome, usuario_id, desde, horario, folga,
     expediente_folga, expediente_de, expediente_ate)
  values
    (v_tenant, v_nome_prof, p_user, current_date, v_horario, v_folga_txt,
     v_folga, v_de, v_ate)
  returning id into v_prof;

  /* ── horário ANUNCIADO ── as sete linhas, derivadas do expediente do primeiro
   * profissional. É o que a MAISA responde a "que horas vocês atendem?".
   * Sábado curto porque sábado quase nunca é igual aos outros dias. */
  insert into public.horarios_anunciados (tenant_id, dow, aberto, de, ate)
  select
    v_tenant,
    d.dow::smallint,
    not (d.dow::smallint = any (v_folga)),
    case when d.dow::smallint = any (v_folga) then null
         when d.dow = 5 then time '09:00'   -- sábado (0=segunda…6=domingo)
         else public.hora_decimal_para_time(v_de) end,
    case when d.dow::smallint = any (v_folga) then null
         when d.dow = 5 then time '13:00'
         else public.hora_decimal_para_time(v_ate) end
  from generate_series(0, 6) as d(dow);

  /* ── a assistente ──
   *
   * ⚠️ `lembrete_horas` NÃO entra aqui, e foi decisão, não esquecimento. A 026 chegou com um
   * padrão por vertical (24h no consultório, 3h no resto) e ele foi RECUSADO em 04/09/2026:
   * *"3 horas antes é suave para terapeutas também"*. Todo mundo nasce no `default 3` da
   * coluna, e quem quiser outro prazo escolhe na tela.
   *
   * Fica registrado porque a ideia volta sozinha: parece óbvio que consultório precise de
   * mais antecedência, e não precisa. */
  insert into public.assistente (tenant_id, nome, tom, saudacao)
  values (
    v_tenant, 'MAISA',
    case when p_vertical = 'terapeutas' then 'profissional' else 'amigável' end,
    'Olá! Aqui é a MAISA, assistente do ' || btrim(p_nome) || '. Como posso te ajudar hoje?'
  );

  /* ── catálogo de partida ── */
  if p_vertical = 'terapeutas' then
    insert into public.servicos (tenant_id, nome, categoria, preco, duracao) values
      (v_tenant, 'Primeira consulta',  'Extra',      250, 60),
      (v_tenant, 'Sessão individual',  'Recorrente', 200, 50),
      (v_tenant, 'Sessão de casal',    'Recorrente', 300, 80),
      (v_tenant, 'Pacote 4 sessões',   'Pacote',     720, 50),
      (v_tenant, 'Retorno',            'Extra',      180, 40);
  elsif p_vertical = 'barbeiros' then
    insert into public.servicos (tenant_id, nome, categoria, preco, duracao) values
      (v_tenant, 'Corte',              'Recorrente',  60, 30),
      (v_tenant, 'Barba',              'Recorrente',  45, 30),
      (v_tenant, 'Corte + Barba',      'Pacote',      95, 60),
      (v_tenant, 'Pezinho',            'Extra',       25, 15),
      (v_tenant, 'Sobrancelha',        'Extra',       20, 15);
  else
    insert into public.servicos (tenant_id, nome, categoria, preco, duracao) values
      (v_tenant, 'Atendimento padrão', 'Recorrente', 100, 40),
      (v_tenant, 'Atendimento rápido', 'Recorrente',  60, 30),
      (v_tenant, 'Pacote completo',    'Pacote',     180, 60),
      (v_tenant, 'Serviço adicional',  'Extra',       80, 40);
  end if;

  /* Todo serviço aponta para o único profissional. No fixture isso ficou desalinhado —
   * sv4/sv5/sv6 apontavam para gente que não existia mais, e abrir a gaveta do serviço
   * dava tela branca, porque a tela monta "Quem faz" a partir do primeiro id. Serviço
   * sem ninguém que o faça é sempre um bug esperando. */
  insert into public.servicos_profissionais (tenant_id, servico_id, profissional_id)
  select v_tenant, s.id, v_prof
  from public.servicos s
  where s.tenant_id = v_tenant;

  /* ── FAQs ── as quatro perguntas que todo negócio recebe. */
  insert into public.faqs (tenant_id, pergunta, resposta) values
    (v_tenant, 'Como faço para agendar?',
       'Me diz o melhor dia e horário que eu já agendo seu atendimento.'),
    (v_tenant, 'Quais os horários de atendimento?',
       'Posso te passar agora — me diz que dia você prefere.'),
    (v_tenant, 'Quais formas de pagamento?',
       'Aceitamos Pix, cartão e dinheiro.'),
    (v_tenant, 'Quais serviços vocês oferecem?',
       'Temos vários — me diz o que você precisa que eu te explico.');

  insert into public.eventos_auditoria
    (tenant_id, ator_tipo, ator_id, acao, alvo_tipo, alvo_id, dados)
  values
    (v_tenant, 'usuario', p_user::text, 'criar_negocio', 'negocio', v_tenant::text,
     jsonb_build_object('vertical', p_vertical, 'slug', v_slug));

  return v_tenant;
end;
$$;

comment on function public.provisionar_negocio(uuid, text, text, text) is
  'Cria um inquilino COMPLETO numa transação. Corpo do provisionamento — não exposto a '
  'usuário logado, porque aceita qualquer uuid como dono. O app usa criar_negocio().';

revoke all on function public.provisionar_negocio(uuid, text, text, text)
  from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · as linhas de trial que já existem, se ninguém as tocou
--
-- A condição é a assinatura exata do que a 005 gravava: `trial`, sem provedor, 'Profissional'
-- a 149.90. Linha que o webhook já escreveu, ou que alguém ajustou à mão, fica como está.
-- Rodar de novo não acha nada para mudar.
-- ─────────────────────────────────────────────────────────────────────────────

update public.assinaturas a
   set plano = coalesce(public.plano_do_cadastro(m.user_id), a.plano),
       preco = null
  from public.membros m
 where m.tenant_id = a.tenant_id
   and m.papel = 'dono'
   and a.status = 'trial'
   and a.provedor is null
   and a.plano = 'Profissional'
   and a.preco = 149.90;

do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'provisionar_negocio'
      and pronamespace = 'public'::regnamespace
      and prosrc like '%plano_do_cadastro%'
  ) then
    raise exception '034 NÃO completou: provisionar_negocio ainda grava o plano fixo';
  end if;
  raise notice '034 OK: o trial nasce com o plano escolhido e sem preço';
end;
$$;
