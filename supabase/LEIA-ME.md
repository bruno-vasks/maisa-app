# `supabase/` — o schema é o arquivo, não a prosa

Aqui mora a DDL versionada da MAISA. A regra do repo vale inteira nesta pasta: **o
arquivo é a verdade**. No projeto de onde a integração do Google veio (BIP), a tabela
equivalente só existia descrita em texto na documentação — subir um ambiente novo
dependia de alguém lembrar do schema. Aqui não depende.

> **Leia junto:** [`../ARQUITETURA.md`](../ARQUITETURA.md) para o mapa do hexágono, e
> `src/nucleo/dominio/` para os tipos que estas tabelas espelham.

---

## 1. Ordem de execução

Supabase → Dashboard → **SQL Editor** → cole o arquivo inteiro → **Run**. Um por vez,
nesta ordem. Todos são reexecutáveis (`if not exists`, `create or replace`,
`drop policy if exists`), então rodar de novo não estraga nada.

| # | Arquivo | O que faz |
|---|---|---|
| 001 | `001_google_integracoes.sql` | **legado.** Tokens do Google por `user_id`. Ainda em uso pelo app em produção — ver §6 |
| 002 | `002_multitenant.sql` | Tabelas, índices, constraints, triggers |
| 003 | `003_rls.sql` | Os helpers de RLS e todas as políticas |
| 004 | `004_visoes.sql` | As views do que é derivado (contadores, fila) |
| 005 | `005_provisionar.sql` | `criar_negocio()` — um inquilino inteiro numa transação |
| 006 | `006_migrar_google.sql` | Copia as conexões do 001 para o modelo novo |
| 007 | `007_memoria_agente.sql` | Memória do cliente e a thread do WhatsApp (`mensagens_agente`) |
| 008 | `008_seed_bruno.sql` | O negócio do Bruno, para o app abrir com dado de verdade |
| 009 | `009_conversas_painel.sql` | O que faltava para o **painel** mostrar e responder a conversa: número completo em `mensagens_agente`, `conversas_estado` (quem conduz) e a view `v_conversas` |
| 010 | `010_lembretes.sql` | `atendimentos.lembrete_em` e `reservar_lembretes()` — a claim atômica que impede a rotina de mandar o mesmo lembrete duas vezes |
| 011 | `011_agendar_lembretes.sql` | `pg_cron` chamando a rotina a cada 15 min. **Único arquivo específico de ambiente** — carrega a URL do deploy e exige um segredo no Vault |
| 013 | `013_contatos.sql` | O **caderno de nomes** (`contatos`) e `integracoes_whatsapp.modo` — de quem é o número pareado. Sem isto a MAISA oferece horário para o pai do dono; ver `nucleo/dominio/contatos.ts`. Aditivo: dá para publicar o código antes de rodar, porque `criarAvaliarAtendimento` falha ABERTA de propósito |
| 014 | `014_fiscal_mei.sql` | **A nota fiscal por inquilino, pelo caminho do MEI.** O 002 acertou a tabela e errou o caminho: `config_fiscal` nasceu com os campos da NFS-e municipal, e MEI é obrigado a emitir pelo Ambiente Nacional desde 09/2023. Reescreve `fiscal_configurado()` para bifurcar por `optante_mei`, e acrescenta `atendimentos.nota_id` — que é o que faz a tela de faturamento parar de contar pelo `localStorage`. Aditivo e reexecutável |
| 015 | `015_faturamento.sql` | **O faturamento sai do navegador.** `v_a_faturar` (atendimentos já prestados e sem nota) e `abrir_nota()` — a claim atômica que impede documento fiscal duplicado, mesma forma de `reservar_lembretes()`. Depende do 014 (`atendimentos.nota_id`) |
| 016 | `016_fechar_funcoes.sql` | **Tranca as funções que o mundo podia chamar.** Função no Postgres nasce com EXECUTE para PUBLIC — é o único objeto cujo default é o permissivo. `limpar_mensagens_antigas` era `security definer` sem revoke nenhum: um POST com a chave anônima e `dias=0` esvaziava `mensagens_agente` de TODOS os inquilinos. `abrir_nota` revogava de `public, anon` e esquecia `authenticated`. Aditivo e reexecutável |
| 017 | `017_dono_por_inquilino.sql` | **Quem recebe a escalação vira coluna do inquilino.** O aviso "preciso de você nessa conversa" carrega o telefone do CLIENTE FINAL, e o destino era a env global `MAISA_WHATSAPP_DONO` — ou seja, o número do cliente de um negócio entregue no WhatsApp de outra pessoa, e o dono certo nunca avisado. `integracoes_whatsapp.telefone_dono`, nullable de propósito. Aditivo e reexecutável |
| 023 | `023_recibo_numero_e_comprovante.sql` | **O protocolo vira inteiro, e o PDF ganha onde morar.** `recibos_emitidos.numero` (identity global — a Rebots recusa uuid no `receipt_id`) e `comprovante_caminho` + o bucket privado `comprovantes-recibo`: a URL do PDF deles vale 5 minutos, e sem a cópia o comprovante existe por um instante e nunca mais. Recria `abrir_recibo_unitario` devolvendo três colunas |
| 024 | `024_avisar_recibo.sql` | **O interruptor da mensagem ao paciente.** `assistente.avisar_recibo`, padrão **false**: quando o callback confirma `emitido`, a MAISA avisa quem foi atendido — mensagem para terceiro, saindo do WhatsApp pessoal do dono, sem humano no disparo. O adaptador lê com queda (`42703` → relê sem a coluna) para a tela de ajustes não cair na janela entre o deploy e o `Run`. Aditivo e reexecutável |
| 025 | `025_desfecho_do_aviso.sql` | **O desfecho do aviso vira dado.** `recibos_emitidos.aviso` — `enviado` · `sem_telefone` · `falhou` · `desligado`. O aviso ao paciente engole o erro de propósito (o recibo já saiu), e o que ele engolia não aparecia: 19 mensagens falharam em 26/08/2026 e o silêncio foi igual ao sucesso. ⚠️ `desligado` é um ESTADO, não a ausência dele. Aditivo e reexecutável |
| 026 | `026_lembrete_horas.sql` | **O prazo do lembrete vira escolha do inquilino.** `assistente.lembrete_horas` (1..168, padrão 3) e `reservar_lembretes()` recriada com a janela POR LINHA (`make_interval`). Três horas é prazo de barbearia; sessão de terapia avisada 3h antes já está perdida. ⚠️ `p_ate` sobrevive com OUTRO significado — deixou de ser a janela e virou o teto da varredura, porque uma varredura cross-tenant não expressa N janelas num parâmetro só. Aditivo e reexecutável |
| 027a | `027a_desfazer_sobreposicoes.sql` | **Limpa o que impede o 027 de entrar.** Roda ANTES dele, e só se ele reprovar com `23P01` — foi o que aconteceu em 04/09/2026. Cancela (não apaga) o menos importante de cada par sobreposto, um por volta para não derrubar cadeia inteira; a preferência é **atendimento de verdade > semente**, depois **já virou recibo**, depois começa mais cedo. ⚠️ **Aborta sem tocar em nada** se as duas pontas de um conflito forem atendimentos reais — escolher qual cliente perde o horário não é decisão de script |
| 027 | `027_conflito_de_horario.sql` | **Dois atendimentos não ocupam o mesmo horário — o banco garante.** `btree_gist` + `exclude using gist (tenant_id =, profissional_id =, tstzrange(inicio, fim, '[)') &&) where (situacao = 'marcado')`. Até o ADR-0009 quem impedia era o Google, e para quem não conectava não havia proteção nenhuma. `[)` deixa 14–15h conviver com 15–16h; com `[]` a agenda de hora em hora aceitaria um horário por dia. ⚠️ **Pode falhar**: recusa se já houver sobreposição gravada (o `npm run semear` sorteia horários e não checa). A query de detecção está no cabeçalho do arquivo. Reexecutável |
| 028 | `028_cobranca_provedor.sql` | **A cobrança deixa de ser "a Stripe".** `stripe_customer_id`/`stripe_subscription_id` → `provedor_*`, mais `provedor` e `metodo` — a tela dizia "Cartão final ····" para quem pagou por Pix, e não tinha como saber que estava errada. Cria `cobranca_eventos`: ⚠️ **a AbacatePay não tem `GET` por id de assinatura**, então sem releitura na fonte a idempotência do webhook passa a ser nossa (reentrega chega com o mesmo `id` por ~18h). RLS ligada e política nenhuma = só service_role. Aditivo e reexecutável |
| 029 | `029_cliente_sem_telefone.sql` | **Cliente pode existir sem telefone.** `clientes.telefone` perde o `not null`; o `check` de 8 caracteres continua para quem tem. Entrou com o botão "Novo cliente": o recibo da Rebots pede só CPF, e exigir telefone obrigaria a inventar um. Telefone nulo = `telefone_chave` nula = o agente nunca reconhece essa pessoa, que é o certo. Aditivo e reexecutável |
| 030 | `030_valor_da_sessao.sql` | **O preço da sessão mora na ficha.** `clientes.valor_sessao` (nulo = vale o do serviço) e `v_clientes` recriada com ela no fim. O atendimento usa pedido → ficha → catálogo, pela tela e pelo WhatsApp. O código lê a view com `*`, então roda antes e depois desta migração. Aditivo e reexecutável |
| 031 | `031_foto_do_negocio.sql` | **A foto de perfil do negócio.** `negocios.foto` (texto, `data:` URL de até 200 mil caracteres, nula = avatar sorteado), com `check` de formato. Entrou com a gaveta "Seu negócio" do painel. O código lê a tabela com `*`, então roda antes e depois desta migração. Aditivo e reexecutável |
| 032 | `032_recibo_automatico.sql` | **O recibo automático e para quem ele vai** (01/10/2026, pedido da Regina). `clientes.dia_recibo` (1 a 31, nulo = não emite sozinha) e `v_clientes` recriada com ela no fim; `assistente.recibo_primeiro_para_mim` (padrão `false`: nada muda para ninguém só por rodar); e o quinto desfecho do aviso, `enviado_ao_dono`. ⚠️ **Rode a 030 antes**: a view repete a lista dela. Aditivo e reexecutável |
| 099 | `099_auditoria.sql` | **Falha se o isolamento estiver aberto.** Rode a cada mudança de schema |

**O que falta rodar se descobre com `npm run banco:conferir`**, nunca por esta página: ele
pergunta ao banco de produção, migração por migração, se a coluna ou tabela que ela cria
existe (só leitura, sem ler dado de ninguém). Esta seção dizia "o 009 é o único pendente" e
envelheceu calada; em 01/10/2026 a **030** estava pendente e o único sintoma era o valor da
sessão sumindo da ficha da Regina. Migração nova entra com o marcador dela em `MARCADORES`
(`scripts/conferir-banco.mjs`). Rode em ordem e leia os
`notice` — o 007 é a prova de que eles importam: um `create policy` abortado deixou duas
tabelas com RLS ligada e política nenhuma, e o sintoma foi "o painel não lê, o agente lê".

---

## 2. O desenho em cinco linhas

```
negocios ──┬── membros ──────────── auth.users        ← quem pode operar o quê
           ├── profissionais ─┬─ integracoes_google   ← quem atende, e a agenda dele
           │                  └─ servicos_profissionais ─ servicos
           ├── clientes ─────── atendimentos ← A AGENDA (o Google só soma por cima)
           ├── notas · config_fiscal · assinaturas    ← dinheiro e prefeitura
           └── conversas ─ mensagens · faqs · assistente · horarios_anunciados
```

`tenant_id` em **toda** tabela. Isolamento imposto pelo Postgres (RLS), nunca pelo
`where` do código.

---

## 3. As cinco decisões que valem discussão

### 3.1 `atendimentos` é a verdade; o calendário externo é aditivo

> ⚠️ **ESTA SEÇÃO DIZIA O CONTRÁRIO ATÉ 04/09/2026** — "é espelho, não verdade", e "não
> desenhe tela de agenda a partir desta tabela". Inverteu no **ADR-0009**. O texto antigo
> previa o momento certo: *"se um dia você precisar dela para render, o problema mudou de
> tamanho e a decisão precisa ser retomada de propósito"*. Foi o que aconteceu.

**O que mudou o tamanho do problema:** com o Google como fonte única, **nenhuma linha
entrava aqui sem Google conectado** — o caso de uso consultava o provedor antes de gravar
e abortava. Junto caíam faturamento, nota, lembrete e a tela de Agenda inteira. Para o ICP
que decidiu não entregar a agenda a um terceiro, o produto não existia.

Agora esta tabela responde **"está livre?"** e **"o que tem no dia?"** para todo inquilino.
O provedor externo é lido dentro de `try`: acrescenta o que nasceu fora da MAISA (o encaixe
que o dono marcou no celular, o almoço) e, quando não existe ou falha, acrescenta zero.

As quatro perguntas que só têm resposta aqui:

1. **Idempotência** sem ida ao provedor — `unique (tenant_id, maisa_ag)`. É a proteção
   primária desde o ADR-0009: o agente de WhatsApp retenta sozinho e não pode pagar uma
   varredura de agenda por tentativa.
2. **Faturamento** — `v_a_faturar` soma a competência daqui. Não há como somar a partir do
   Google sem reler a agenda inteira a cada abertura de tela.
3. **Ator** — `dominio/tenant.ts` pede que um atendimento criado pela IA seja
   distinguível de um criado à mão. O Google guarda a descrição, não quem escreveu.
4. **Disponibilidade sem provedor** — é o que faz a MAISA marcar para quem nunca vai
   conectar calendário nenhum.

**O preço, escrito para ninguém se surpreender:** um evento apagado **direto no Google**
deixa de sumir do painel — a linha continua `marcado` até alguém cancelar pelo produto.
Antes sumia de graça. E `evento_id` nulo virou estado **normal**, não corrupção.

**Com constraint de sobreposição desde o 027** — e a razão de antes não haver caiu junto: o
argumento era que "um evento nascido fora da MAISA não estaria na tabela, então a constraint
daria confiança falsa". Continua verdade, e continua sendo por isso que quem cruza as duas
fontes é `oferecerHorarios` em código. O que mudou é que sem constraint **não havia proteção
nenhuma** para quem não conecta Google: contar antes de inserir deixa duas requisições
simultâneas passarem as duas. Encaixe deliberado ainda é possível — cancele e remarque, ou
use outra agenda.

### 3.2 A config fiscal sai do `.env` — é isto que destrava o segundo cliente

Hoje `adaptadores/saida/focus/config.ts` lê `NF_PRESTADOR_CNPJ`, `NF_ITEM_LISTA_SERVICO`
e companhia de variável de ambiente. Variável de ambiente é **global**: com ela, o app
inteiro só sabe emitir nota de um CNPJ. Não é limitação de escala — é limitação de um.

`config_fiscal` põe uma linha por inquilino. O trabalho no código é `focus/config.ts`
deixar de ler `process.env` e passar a receber a config do inquilino que o contexto já
carrega. O env continua servindo de fallback durante a transição e para a demo aberta.

### 3.3 Segredo cifrado no banco, chave no servidor

Tokens do Google, token da Focus e token do WhatsApp ficam cifrados com AES-256-GCM
pela aplicação (`src/adaptadores/saida/google/cripto.ts`). O banco guarda texto cifrado;
a chave mora só em env de servidor.

**O limite, escrito:** a sessão de um `dono` comprometida consegue ler o *ciphertext*,
porque o app lê o banco com a sessão do usuário. Ela não consegue a credencial. Endurecer
mais significaria ler segredo com **service key** — e o custo disso é conhecido: foi a
service key ignorando RLS que transformou cinco filtros esquecidos em cinco IDORs no
projeto anterior. Fica como está. O caminho de endurecimento, se um dia valer o risco:
mover os segredos para tabela sem privilégio de `authenticated` e lê-los por RPC.

### 3.4 Nada de contador guardado

`Cliente.atendimentos`, `Cliente.valor`, `Profissional.atendimentosMes` e a fila
"Precisa de você" **não são colunas** — são views no arquivo 004. O fixture guardava
`atendimentosMes: 168` em cada profissional *e* a soma dos quatro dava 407 numa tela e
168 na outra: dois números para a mesma coisa, discordando na mesma sessão. Contador que
ninguém recalcula sempre vira isso.

### 3.5 Convenção de dia da semana: 0 = segunda

`expediente_folga` e `horarios_anunciados.dow` usam **0 = segunda … 6 = domingo**, que é
a convenção de `dominio/expediente.ts`. O Postgres não usa essa: `extract(dow)` devolve
**0 = domingo**. Use sempre `public.dow_maisa(data)`. Misturar as duas é o tipo de erro
que só aparece no domingo — quando o negócio está fechado e ninguém está olhando.

---

## 4. Como as FKs se comportam ao apagar

Escolhido para não haver **nenhum** conflito de cascade: apagar um `negocio` funciona
com um `delete` só, sem ordem manual.

| Relação | FK | `on delete` | Por quê |
|---|---|---|---|
| tudo → `negocios(id)` | simples | `cascade` | apagar o inquilino apaga o inquilino inteiro |
| `servicos_profissionais` → serviço/profissional | **composta** `(tenant_id, id)` | `cascade` | é a própria relação; sem as pontas ela não existe |
| `integracoes_google` → `profissionais` | **composta** | `cascade` | conexão sem agenda não faz sentido |
| `atendimentos` → `profissionais` | **composta** | `cascade` | idem |
| `mensagens` → `conversas` | **composta** | `cascade` | mensagem fora de thread é lixo |
| `clientes.servico_id` → `servicos(id)` | simples | `set null` | aposentar um serviço não pode apagar cliente |
| `atendimentos.cliente_id` → `clientes(id)` | simples | `set null` | LGPD: apagar o cliente não apaga o histórico do negócio; o snapshot preserva nome, telefone e valor |
| `conversas.cliente_id` → `clientes(id)` | simples | `set null` | lead sem cadastro é caso normal, não borda |
| `atendimentos.servico_id` | **sem FK** | — | o domínio **já assume** que esse id pode não resolver (serviço criado no navegador do usuário); nome e valor vêm no snapshot |
| `notas.cliente_id` | **sem FK** | — | nota autorizada é documento imutável e autossuficiente: não pode mudar nem desaparecer porque alguém editou um cadastro |

**Composta vs. simples:** a FK composta `(tenant_id, id)` é o que impede amarrar o
serviço de um inquilino ao profissional de outro — o banco recusa. Onde a FK é simples,
essa garantia não existe: se um membro colar o uuid de outro inquilino, o `join`
filtrado por `tenant_id` simplesmente não resolve. Nada vaza; só fica nulo.

**Remoção normal é `ativo = false`**, não `delete` — o domínio já tem o campo em
`Cliente`, `Servico` e `Profissional`. `delete` é o caminho de LGPD.

---

## 5. O que o código precisa ganhar para usar isto

Nada disto está feito — é a lista de trabalho que este schema habilita:

1. **`adaptadores/entrada/http/contexto.ts`** — `tenantDoUsuario()` hoje devolve
   `tenantId = usuarioId`. Passa a chamar `public.meus_negocios()` (ou a ler
   `membros` com `padrao`). O comentário no arquivo já promete que mais nada muda.
2. **`adaptadores/saida/supabase/repositorio.ts`** (não existe) — implementa
   `RepositorioNegocio` sobre `v_clientes`, `v_profissionais`, `v_servicos`,
   `v_negocio`. Depois é **uma linha** em `src/composicao.ts` trocando `repositorioDemo`.
   `agendasPermitidas()` deixa de ser a constante `COLUNAS_AGENDA` e vira
   `select id from profissionais where tenant_id = … and ativo`.
3. **`saida/google/conexoes.ts`** — trocar `google_integracoes` por
   `integracoes_google`, e `user_id` por `tenant_id`. O `onConflict` passa a ser
   `"tenant_id,profissional_id"`.
4. **`saida/focus/config.ts`** — parar de ler `process.env` e receber a linha de
   `config_fiscal` do inquilino.
5. ~~**Gravar em `atendimentos`**~~ — **FEITO.** `aplicacao/agendar-atendimento.ts` grava
   pela porta `RegistroDeAtendimentos` depois de o provedor confirmar; o adaptador é
   `saida/supabase/atendimentos.ts` (e `saida/demo/atendimentos.ts` no modo sem banco).
   `criarCancelarAtendimento` marca `situacao = 'cancelado'` pelo mesmo caminho — sem isso
   o mês cobraria por atendimento desmarcado.
   Dois detalhes que valem saber antes de mexer: **nada ali lança** (o evento já existe no
   Google quando a gravação roda, então falhar alto criaria horário bloqueado + cliente
   ouvindo "não deu"), e `hora_inicio` é arredondada para o meio mais próximo porque o
   `check` da coluna só aceita múltiplos de 0,5 — um serviço de 20 min produziria `14.333`
   e o Postgres recusaria a linha.
   Junto entrou `RepositorioNegocio.garantirCliente`: quem marca pelo WhatsApp passa a
   existir em `clientes`, senão `atendimentos.cliente_id` ficava nulo e `v_clientes.valor`
   somava zero para quem veio do canal que mais traz gente.
6. **Tela de criação de conta** chamando `supabase.rpc('criar_negocio', …)` logo depois
   do signup.

### Uma decisão que ainda é sua: como o agente de WhatsApp autentica

O agente **não tem cookie**. `integracoes_whatsapp.instancia` é `unique` global
justamente para o webhook poder responder "esta mensagem é de qual inquilino?" sem
sessão. Mas ler e escrever ele precisa, e há dois caminhos:

- **(a) service key confinada** ao adaptador do webhook, com o `tenant_id` vindo
  *sempre* do lookup por `instancia` e de nenhum outro lugar. Simples; o risco é o
  conhecido (RLS desligada nesse caminho), contido a um arquivo.
- **(b) um JWT por inquilino**, assinado no servidor com `sub` de um usuário-robô membro
  do negócio. A RLS continua valendo para o agente. Mais peça para manter.

Recomendação: **(a)**, com o lookup por `instancia` isolado numa função só e uma linha
no `LEIA-ME` do adaptador dizendo que aquele é o único lugar do app onde a service key
aparece. O que não pode é o `tenant_id` chegar por argumento — é literalmente o furo de
`dominio/tenant.ts`.

---

## 6. A ordem do deploy (não inverta)

A tabela `google_integracoes` do arquivo 001 **está em uso em produção agora** — é de lá
que sai o token que desenha a agenda real. O arquivo 006 **copia** e não apaga.

```
1. rodar 002 → 006 no Supabase      (banco novo de pé, dados copiados, app intacto)
2. conferir a query de conferência no fim do 006: nenhuma linha sem par
3. subir o código que lê `integracoes_google`
4. conectar/abrir a agenda em produção e ver que funciona
5. só então: drop table public.google_integracoes  ← numa migration 007
```

Derrubar a tabela antes do passo 3 desconecta a agenda no instante do `Run`, antes de
qualquer deploy.

---

## 7. Ao criar tabela nova

1. `tenant_id uuid not null references public.negocios (id) on delete cascade`
2. Se ela for "dado do dia" (todo membro lê e escreve): acrescente o nome ao array
   `uniformes` no **003**, seção 2. Se tiver segredo ou dinheiro, escreva a política à
   mão e diga qual papel manda.
3. View nova: **`with (security_invoker = true)`**, sempre. É o único objeto do Postgres
   cujo default é o inseguro.
4. Rode o **099**. Ele falha se você esqueceu qualquer um dos três.
