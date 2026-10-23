/* ═══════════════════════════════════════════════════════════════════════════════
 * 035 — O AVISO DE CADASTRO NOVO (22/10/2026)
 *
 * Toda conta que nasce em `auth.users` faz o banco chamar `POST /api/interno/novo-cadastro` com o
 * id dela, e o app manda um e-mail ao Bruno (ou a quem estiver em `AVISO_CADASTRO_PARA`) com
 * e-mail, negócio, WhatsApp, plano, funil e campanha. Pedido dele: "toda vez que alguém se
 * cadastre, ou clique que quer fazer um teste grátis, ou que a gente ganhe o e-mail dela".
 *
 * ── POR QUE UM TRIGGER EM `auth.users` ──
 *
 * Porque os três eventos do pedido são o mesmo: uma linha nova ali. O trigger pega o
 * `/assinar?teste=1`, o `/assinar` com Pix, o `/cadastro`, o botão do Google, a conta criada à
 * mão no painel e qualquer caminho futuro — inclusive o `signUp` que volta SEM sessão quando a
 * confirmação de e-mail está ligada (a linha nasce do mesmo jeito; o e-mail já foi ganho). E não
 * abre rota pública: a chamada leva o segredo do Vault, como a dos lembretes.
 *
 * ── ⚠️ O TRIGGER NUNCA DERRUBA UM CADASTRO ──
 *
 * Ele roda DENTRO da transação do `signUp`. Uma exceção aqui desfaria a conta, e a pessoa veria
 * "Não foi possível criar a conta" por causa de um e-mail para o Bruno. Por isso:
 *   · tudo dentro de `exception when others` — o erro vira `warning` no log do Postgres e o
 *     cadastro segue;
 *   · sem o segredo no Vault, ele simplesmente não avisa (ao contrário da `011`, que falha alto:
 *     lá um cron mudo não manda lembrete a ninguém; aqui o prejuízo de calar é um e-mail a menos);
 *   · `net.http_post` só ENFILEIRA: a requisição sai depois do commit, por um worker do `pg_net`,
 *     então o `signUp` não espera o app responder — e se o `signUp` for desfeito, nada sai.
 *
 * ── O QUE PRECISA EXISTIR ANTES ──
 *
 *   · `pg_net` habilitado (a `011` já habilita; repetido abaixo, é idempotente);
 *   · o segredo `maisa_rotinas_secret` no Vault — O MESMO da `011`, criado no §2 dela. Se o cron
 *     dos lembretes funciona, não há nada novo a configurar. A rota aceita `ROTINAS_SECRET` (ou,
 *     na falta dele, `WHATSAPP_WEBHOOK_SECRET`), como `/api/rotinas/lembretes`.
 *
 * Não depende da `034` nem ela desta: rode em qualquer ordem em relação a ela.
 *
 * ⚠️ ESPECÍFICO DE AMBIENTE, COMO A `011`: carrega a URL do deploy (a mesma de lá). Ao subir a
 * MAISA para outro ambiente, troque a URL nos dois arquivos.
 *
 * ── E SE O CÓDIGO FOR PARA PRODUÇÃO ANTES DESTA MIGRAÇÃO? ──
 *
 * Nada quebra: sem o trigger, ninguém chama a rota nova, e o cadastro funciona como antes — só
 * não avisa. E o contrário (esta migração antes do código) também não quebra cadastro nenhum: a
 * chamada cai num 404 do app, que fica registrado em `net._http_response` e mais nada.
 *
 * ⚠️ `npm run banco:conferir` NÃO VÊ ESTA MIGRAÇÃO (cria função e trigger, nenhuma coluna). Para
 * conferir à mão, no SQL Editor:
 *     select tgname, tgenabled from pg_trigger
 *      where tgrelid = 'auth.users'::regclass and tgname = 'maisa_aviso_de_cadastro';
 *
 * Aditivo e reexecutável.
 * ═══════════════════════════════════════════════════════════════════════════════ */


/* ───────────────────────────────────────────────────────────────────────────────
 * 1. A EXTENSÃO
 * ────────────────────────────────────────────────────────────────────────────── */

create extension if not exists pg_net;


/* ───────────────────────────────────────────────────────────────────────────────
 * 2. A CHAMADA — testável à mão, como `disparar_lembretes()`
 *
 *     select public.avisar_novo_cadastro('<uuid de uma conta>');
 *
 * Devolve o id da requisição do `pg_net`, ou NULL quando não chamou (sem segredo no Vault). A
 * resposta do app aparece depois em `net._http_response`:
 *
 *     select id, status_code, content, created
 *       from net._http_response order by created desc limit 10;
 *
 *   200 "enviado" ......... saiu o e-mail
 *   200 "ja_avisado" ...... a conta já tinha sido avisada; nada saiu (a marca é
 *                           `raw_app_meta_data ->> 'maisa_aviso_cadastro_em'`)
 *   200 "conta_inexistente" o id não existe em `auth.users`
 *   401 ................... o segredo do Vault e o do servidor divergiram
 *   404 ................... o código da rota ainda não foi publicado
 *   400 "nao_configurado" . falta `SUPABASE_SERVICE_ROLE_KEY` na Vercel (o `faltando` diz)
 *   502 ................... nenhum e-mail saiu (Resend recusou?) — o log da Vercel diz por quê;
 *                           a marca é desfeita, então é só disparar de novo
 *
 * Para reenviar o aviso de uma conta JÁ avisada (testar o texto, por exemplo), apague a marca:
 *     update auth.users set raw_app_meta_data = raw_app_meta_data - 'maisa_aviso_cadastro_em'
 *      where id = '<uuid>';
 * ────────────────────────────────────────────────────────────────────────────── */

create or replace function public.avisar_novo_cadastro(p_user uuid)
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

  /* Sem segredo, não avisa — e não reclama. Ver o cabeçalho. */
  if p_user is null or v_segredo is null or v_segredo = '' then
    return null;
  end if;

  select net.http_post(
    url     := 'https://maisa-app-sooty.vercel.app/api/interno/novo-cadastro',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_segredo),
    /* Só o id. O app relê o resto do banco e não confia em mais nada do pedido. */
    body    := jsonb_build_object('id', p_user),
    /* Um usuário, um e-mail (a Resend tem teto de 8s por envio no adaptador). 20s sobra. */
    timeout_milliseconds := 20000
  ) into v_id;

  return v_id;
end;
$$;

comment on function public.avisar_novo_cadastro(uuid) is
  'Chama POST /api/interno/novo-cadastro com o id da conta e o segredo do Vault (maisa_rotinas_secret). '
  'Disparada pelo trigger maisa_aviso_de_cadastro em auth.users. NULL = não chamou (sem segredo). '
  'Ver 035_aviso_de_cadastro.sql.';

revoke all on function public.avisar_novo_cadastro(uuid) from public, anon, authenticated;


/* ───────────────────────────────────────────────────────────────────────────────
 * 3. O TRIGGER
 *
 * `after insert`: a linha já existe (o app vai relê-la), e um `after` não pode alterar o que foi
 * gravado. `security definer` porque quem insere em `auth.users` é o papel do serviço de auth, que
 * não lê o Vault nem chama o `pg_net`; o dono desta função, sim.
 *
 * O `exception when others` é a regra inteira deste arquivo: aviso que falha não desfaz conta.
 * ────────────────────────────────────────────────────────────────────────────── */

create or replace function public.ao_criar_conta_avisar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.avisar_novo_cadastro(new.id);
  exception when others then
    raise warning '[035] aviso de cadastro não saiu para %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

comment on function public.ao_criar_conta_avisar() is
  'Trigger after insert em auth.users: pede ao app o aviso de cadastro novo. Engole qualquer erro '
  '(vira warning) para nunca derrubar um cadastro. Ver 035_aviso_de_cadastro.sql.';

/* O navegador não chama função de trigger, mas a auditoria (099, seção 6) exige que toda
 * `security definer` esteja fechada — e o Postgres não confere EXECUTE na hora de disparar um
 * trigger, só na hora de criá-lo, então fechar não o desliga. */
revoke all on function public.ao_criar_conta_avisar() from public, anon, authenticated;

drop trigger if exists maisa_aviso_de_cadastro on auth.users;

create trigger maisa_aviso_de_cadastro
  after insert on auth.users
  for each row execute function public.ao_criar_conta_avisar();


/* ───────────────────────────────────────────────────────────────────────────────
 * 4. CONFERÊNCIA — o arquivo diz se funcionou, e se vai avisar
 * ────────────────────────────────────────────────────────────────────────────── */

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'auth.users'::regclass and tgname = 'maisa_aviso_de_cadastro'
  ) then
    raise exception '035 NÃO completou: o trigger maisa_aviso_de_cadastro não existe em auth.users';
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'maisa_rotinas_secret') then
    raise warning '035: trigger criado, mas o segredo "maisa_rotinas_secret" não está no Vault. Nenhum aviso vai sair até ele existir (ver o §2 de 011_agendar_lembretes.sql)';
  else
    raise notice '035 OK: toda conta nova em auth.users chama /api/interno/novo-cadastro';
  end if;
end;
$$;
