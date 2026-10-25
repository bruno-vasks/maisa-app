-- ─────────────────────────────────────────────────────────────────────────────
-- MAISA — o que faltava para o PAINEL mostrar a conversa real do WhatsApp.
--
-- Rode DEPOIS de 007_memoria_agente.sql (depende de `mensagens_agente`).
-- Dashboard → SQL Editor → cole → Run. Leia os `notice`.
--
-- O 007 versionou a thread antes do adaptador, e acertou no formato para o AGENTE:
-- `telefone_chave` (8 dígitos) é tudo que ele precisa, porque quem responde já recebeu o
-- número completo no envelope do webhook. Duas coisas que o painel precisa não estavam lá:
--
--   1. RESPONDER. Do painel não vem envelope nenhum. Com 8 dígitos não se manda WhatsApp:
--      falta DDI e DDD, e não há como deduzi-los — "81234567" pode ser de qualquer DDD do
--      país. Sem o número completo o botão de enviar da tela de Conversas seria decorativo.
--   2. QUEM CONDUZ. Assumir a conversa no painel tem que CALAR a MAISA naquela conversa, e
--      isso é estado compartilhado: quem lê é o webhook, num processo que nunca viu o
--      navegador do dono. Enquanto morava no `localStorage`, o botão prometia silêncio e não
--      entregava — o cliente escrevia de volta e a MAISA respondia por cima do dono.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. o número completo, junto de cada mensagem ─────────────────────────────
--
-- Mora em `mensagens_agente` e não em `memoria_cliente`, embora "o telefone de alguém" soe
-- como perfil. A razão é ciclo de vida: memória só é GRAVADA quando há fato a lembrar (nome,
-- escolha — ver `criarLembrarCliente`), então um lead que mandou "oi" e foi respondido não
-- tem linha nenhuma lá. Ele tem, sempre, linha aqui. Pendurar o número na memória deixaria
-- justamente a conversa mais nova — a que mais pede resposta à mão — sem como ser respondida.
--
-- Nullable de propósito: as threads gravadas antes desta coluna não têm como recuperá-la.
-- O painel trata `null` como "esta conversa é somente leitura" em vez de mandar mensagem
-- para um número inventado.
alter table public.mensagens_agente
  add column if not exists telefone text;

-- Dígitos puros, com DDI quando o provedor mandou. O piso de 10 é o menor telefone
-- brasileiro discável (DDD + 8); o teto de 15 é o limite do E.164.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mensagens_agente_telefone_digitos'
  ) then
    alter table public.mensagens_agente
      add constraint mensagens_agente_telefone_digitos
      check (telefone is null or telefone ~ '^[0-9]{10,15}$');
    raise notice 'check mensagens_agente_telefone_digitos criado';
  end if;
end $$;

-- ── 2. quem conduz a conversa ────────────────────────────────────────────────
--
-- Tabela separada, e não colunas em `mensagens_agente`: lá cada linha é um FATO imutável
-- ("às 10:31 o cliente disse isto"), e thread é log — nunca se reescreve o passado. Assumir
-- e devolver é ESTADO, muda dez vezes na mesma conversa. Misturar os dois faria o log ganhar
-- um `update`, e log com update deixa de servir de log.
--
-- Só duas datas e nenhum enum. `EstadoConversa` do domínio tem quatro valores
-- (`maisa`/`espera`/`voce`/`ok`), mas três deles são DERIVADOS do que já está gravado: quem
-- falou por último diz se a bola está com o cliente (`espera`) ou com a MAISA (`maisa`).
-- Guardar o estado calculado seria criar uma segunda verdade que envelhece sozinha —
-- mensagem nova chega e a coluna passa a mentir. Ver `estadoDaConversa` em
-- `nucleo/dominio/conversas.ts`: a regra é uma função pura, e este arquivo guarda só o que
-- ela não tem como deduzir.
--
-- `timestamptz` em vez de `boolean` porque a pergunta "desde quando isto está com você?"
-- aparece na primeira vez que alguém esquecer uma conversa assumida — e um boolean não
-- responde. Custa o mesmo.
create table if not exists public.conversas_estado (
  tenant_id      uuid not null references public.negocios (id) on delete cascade,

  -- Mesma chave de `mensagens_agente` e `memoria_cliente`: os 8 últimos dígitos. É o que
  -- casa o "(11) 98123-4567" escrito no cadastro com o "5511981234567" do webhook.
  telefone_chave text not null check (telefone_chave ~ '^[0-9]{8}$'),

  -- Preenchido = o dono assumiu; a MAISA não responde mais nesta conversa. Devolver é
  -- voltar para null, não gravar outra data: o histórico de posse não vale uma tabela.
  assumida_em    timestamptz,

  -- Preenchido = o dono marcou como resolvida. Não impede a MAISA de responder — resolver
  -- é sobre a fila de pendências do painel, não sobre quem conduz. Mensagem nova não zera
  -- isto: `estadoDaConversa` compara `resolvida_em` com a data da última mensagem, e a
  -- conversa que voltou a andar deixa de contar como resolvida, sem escrita nenhuma.
  resolvida_em   timestamptz,

  atualizado_em  timestamptz not null default now(),

  primary key (tenant_id, telefone_chave)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Mesmo padrão de 003_rls.sql e 007: só membro do negócio vê o que é do negócio, via o
-- helper `public.negocios_do_usuario()` (uma avaliação por consulta, não por linha).
--
-- ⚠️ O AGENTE NÃO PASSA POR AQUI — ele roda sem `auth.uid()`, com service role, que ignora
-- RLS por definição. Do lado dele a fronteira é o `.eq("tenant_id", …)` do adaptador, e o
-- `tenantId` vem do destino da mensagem, nunca do corpo. Estas políticas protegem o PAINEL.
--
-- E note o que o 007 ensinou do jeito caro: `enable row level security` roda ANTES do bloco
-- de políticas, então um erro no `create policy` deixa a tabela com RLS ligada e política
-- nenhuma — o que nega tudo para o painel enquanto o agente continua funcionando. A
-- combinação que faz o problema passar despercebido. Leia os `notice`.
alter table public.conversas_estado enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'conversas_estado' and policyname = 'membro_ve_estado_conversa'
  ) then
    create policy membro_ve_estado_conversa on public.conversas_estado
      for all
      using (tenant_id in (select public.negocios_do_usuario()))
      with check (tenant_id in (select public.negocios_do_usuario()));
    raise notice 'policy membro_ve_estado_conversa criada';
  end if;
end $$;

-- ── A lista de conversas, numa consulta ──────────────────────────────────────
--
-- O painel abre a tela de Conversas com uma pergunta: quem falou comigo, o que disse por
-- último, e a bola está com quem. Sem esta view isso é `select distinct` + subconsulta por
-- telefone + dois joins escritos à mão no adaptador — e o custo real não é a digitação, é o
-- N+1: uma ida ao banco por conversa para descobrir a última mensagem de cada uma.
--
-- `distinct on (telefone_chave)` com `order by criado_em desc` é a forma que o Postgres
-- resolve com o índice `mensagens_agente_thread` que o 007 já criou. Nada de `group by` com
-- max e re-join: aqui precisamos da LINHA inteira da última mensagem (autor e texto), não do
-- máximo de uma coluna.
--
-- ⚠️ O `id desc` no fim do `order by` NÃO é desempate decorativo. Um turno da MAISA grava a
-- fala do cliente e as bolhas da resposta num INSERT só, e `now()` é estável dentro do
-- comando: as três linhas nascem com `criado_em` IDÊNTICO. Sem o `id desc` (identity, sempre
-- crescente na ordem de inserção) o Postgres pode eleger a fala do CLIENTE como "a última",
-- e a lista mostraria a conversa como pendente de resposta um segundo depois de a MAISA ter
-- respondido — com ponto âmbar, badge no rail e tudo. Bug de aparência inocente e diagnóstico
-- infernal, porque só aparece quando o banco resolve a ordem "errada".
--
-- `security_invoker = true` pelo mesmo motivo das views do 004: a RLS de quem consulta se
-- aplica dentro da view. Sem isso a view rodaria com os direitos de quem a criou (o dono do
-- banco) e o filtro por inquilino sumiria — exatamente o furo que a auditoria achou cinco
-- vezes na integração anterior.
create or replace view public.v_conversas
with (security_invoker = true) as
select distinct on (m.tenant_id, m.telefone_chave)
  m.tenant_id,
  m.telefone_chave,
  -- O número completo mais recente que conhecemos deste contato. Vem da própria linha da
  -- última mensagem: se ela é antiga (anterior à coluna) e veio sem número, o painel abre a
  -- conversa em modo leitura em vez de arriscar um envio.
  m.telefone,
  m.autor       as ultimo_autor,
  m.texto       as ultimo_texto,
  m.criado_em   as atualizada_em,
  -- Nome: a memória do agente primeiro (é onde o lead ganha nome antes de virar cliente),
  -- o cadastro depois. Quem não tem nenhum dos dois aparece pelo telefone — nunca por um
  -- "Cliente #4", que é pior que a verdade.
  coalesce(mem.nome, cl.nome) as nome,
  coalesce(mem.cliente_id, cl.id) as cliente_id,
  est.assumida_em,
  est.resolvida_em
from public.mensagens_agente m
left join public.memoria_cliente mem
  on mem.tenant_id = m.tenant_id and mem.telefone_chave = m.telefone_chave
left join public.clientes cl
  on cl.tenant_id = m.tenant_id and cl.telefone_chave = m.telefone_chave
left join public.conversas_estado est
  on est.tenant_id = m.tenant_id and est.telefone_chave = m.telefone_chave
order by m.tenant_id, m.telefone_chave, m.criado_em desc, m.id desc;

comment on view public.v_conversas is
  'Uma linha por conversa de WhatsApp, com a última mensagem já resolvida. É o que '
  'RepositorioHistorico.conversas() consulta — ver adaptadores/saida/supabase/memoria.ts.';
