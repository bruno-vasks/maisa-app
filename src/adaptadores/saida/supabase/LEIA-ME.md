# `saida/supabase/` — auth, sessão e acesso ao banco

Infraestrutura, não porta. Ninguém no núcleo declara uma interface "Supabase" — o que o
núcleo declara é `RepositorioNegocio` e `ConexoesDeAgenda`. Isto aqui é o encanamento
que outros adaptadores usam (hoje, `google/conexoes.ts`) e que o middleware usa para
renovar sessão.

## Arquivos

| Arquivo | Onde roda | O que faz |
|---|---|---|
| `config.ts` | ambos | Lê `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Expõe `isSupabaseConfigured`. |
| `client.ts` | navegador | Cliente para login, `signOut`, `getUser` no client. |
| `server.ts` | servidor | Cliente para Server Components e route handlers. Lê/escreve sessão via cookies. |
| `sessao.ts` | middleware | `updateSession()`: renova o token e redireciona quem não está logado. Era `lib/supabase/middleware.ts`. |
| `admin.ts` | servidor | Cliente com **service role** — ignora RLS. Só `contexto-cliente.ts` importa. |
| `contexto-cliente.ts` | servidor | Decide sessão vs. service role a partir do `ator` do contexto. |
| `repositorio.ts` | servidor | `RepositorioNegocio`: negócio, equipe, catálogo, carteira. Lê das **views**. |
| `atendimentos.ts` | servidor | `RegistroDeAtendimentos` — **a agenda do produto**, e a fonte da verdade dos horários (ADR-0009). ⚠️ Regra invertida em relação ao resto desta pasta: as **leituras lançam** (lista vazia por erro vira "o dia todo está livre") e as **escritas não** — exceto conflito de horário (`23P01` → `HorarioOcupado`). |
| `memoria.ts` | servidor | `RepositorioMemoria` + `RepositorioHistorico` + `RepositorioConversas`: o perfil do cliente, a thread do WhatsApp e quem conduz cada conversa. **É o que faz o painel ver a conversa** — enquanto isto era um `Map` de processo (`saida/demo/memoria.ts`), a tela rodava em outro processo que o webhook e a thread era invisível para ela por construção. |
| `notas.ts` | servidor | `RepositorioNotas`: `v_a_faturar` e a RPC `abrir_nota()`. ⚠️ `abrir` é RPC e não duas escritas daqui — criar a nota e prender os atendimentos **tem** que ser uma transação, senão uma falha no meio deixa a nota criada com os atendimentos soltos e a próxima tentativa emite a segunda. |
| `fiscal.ts` | servidor | `RepositorioFiscal`: a `config_fiscal` do inquilino (CNPJ, município, regime, `focus_empresa_id`, vencimento do certificado). ⚠️ **Não lê nem escreve segredo** — o token da Focus é pedido ao provedor na hora de emitir, e o `.pfx` nunca chega ao banco. `upsert` com `.select()` porque escrita barrada por RLS volta sem erro e sem linha. |
| `contatos.ts` | servidor | `RepositorioContatos`: o caderno de nomes (tabela `contatos`) e o modo do número (`integracoes_whatsapp.modo`). ⚠️ Lido pelo AGENTE, sem sessão — a RLS sai de cena e o `.eq("tenant_id")` daqui é o cinto único. O upsert da importação **não toca em `cliente`**: reimportar não pode apagar o que o dono marcou. |
| `livro-de-recibos.ts` | servidor | `LivroDeRecibos`: a linha do razão da emissão unitária + `tenantDoProtocolo` (o resolvedor de inquilino do callback). ⚠️ `fechar` sai de `pendente` para emitido/recusado **e de `emitido` para `cancelado`** — sem a segunda transição o cancelamento se perdia calado. ★ `abrir` com uma sessão usa a `abrir_recibo_unitario` (020); com várias, a `abrir_recibo_agrupado` (033), tudo ou nada, e sem a 033 recusa com frase para a tela. `destinatario` lê LISTAS desde 01/10/2026 (o `maybeSingle` com duas sessões no mesmo recibo dava erro e virava "ninguém para avisar") e devolve soma, última data e `sessoes`. |
| `guarda-de-comprovante.ts` | servidor | `GuardaDeComprovante`: a nossa cópia do PDF do recibo no bucket privado `comprovantes-recibo`. ⚠️ Existe porque a `file_url` do canal vale **5 minutos** e a API dele não tem consulta — fora da janela do callback o documento é irrecuperável. Falha em silêncio (`null`) de propósito: perder o PDF é ruim, perder o desfecho é irreversível. |
| `agenda-de-recibos.ts` | servidor | `AgendaDeRecibos`: `clientes.dia_recibo` de todos os negócios, para a rotina do recibo automático (01/10/2026). ⚠️ **Service role direto**, como `lembretes.ts`: não há contexto. Banco sem a 032 devolve lista vazia com aviso no log, não erro Traz `porMes` (`recibos_por_mes`, 033); sem a 033, `0`, um por sessão, como antes. |
| `assistente.ts` | servidor | `RepositorioAssistente`. ⚠️ Lê e grava **em degraus** desde 01/10/2026 (`DEGRAUS`: com a 032, sem ela, sem a 024): um degrau só faria a 032 pendente apagar também o `avisar_recibo` da 024 |

## Duas decisões estruturais

**Sem chaves, o app roda como demonstração aberta.** `isSupabaseConfigured` falso ⇒ o
middleware não bloqueia nada e as rotas fiscais usam o `TENANT_DEMO`. As rotas de agenda
NÃO aceitam isso: gravar token do Google sem dono seria pior do que não conectar.

**Anon key + RLS no caminho do PAINEL. Service role no caminho do AGENTE.**

Esta seção dizia "nunca service key", e por muito tempo foi verdade. Deixou de ser, e a
mudança é grande demais para ficar implícita:

| Quem age (`ator`) | Cliente | Quem garante o isolamento |
|---|---|---|
| `usuario` (painel) | `server.ts` — anon key + cookie | **O Postgres.** RLS. Filtro esquecido não vaza. |
| `agente` (WhatsApp) | `admin.ts` — service role | **O código.** `.eq("tenant_id", …)`. Filtro esquecido vaza o inquilino inteiro. |
| `sistema` (rotina) | `admin.ts` — service role | idem |

Quem escolhe é `contexto-cliente.ts`, num lugar só, a partir do `ator` — que nasce nos
adaptadores de ENTRADA e nunca vem do corpo do request.

Por que a exceção existe: o webhook do WhatsApp não tem cookie. Toda política de leitura do
`003_rls.sql` é `tenant_id in (select negocios_do_usuario())`, e com `auth.uid()` nulo isso
devolve conjunto vazio — o agente lia ZERO, inclusive o token do Google, e escalava toda
conversa em vez de marcar. Não era lógica errada: era ausência de identidade.

⚠️ **O risco continua exatamente o que este parágrafo dizia**, só mudou de lugar: com
service role, um `where tenant_id` esquecido vira vazamento entre inquilinos — foi assim
que a auditoria do projeto de onde esta integração veio encontrou IDOR em cinco rotas,
todas por filtro esquecido *enquanto a service key ignorava a RLS*. Os arquivos onde isso
importa são três: `repositorio.ts`, `memoria.ts` e `saida/google/conexoes.ts`. Toda consulta
deles filtra por tenant, inclusive as que "obviamente" só têm uma linha.

## Rotas públicas (não exigem login)

Definidas em `sessao.ts`: `/login`, `/auth`, `/api` (cada rota faz a própria checagem e
responde 401 em JSON), `/barbeiros`, `/terapeutas` (as landing pages são públicas por
natureza).

## Confirmação de e-mail — o que precisa estar certo no PAINEL

⚠️ **`/auth/callback` tem que estar em Redirect URLs** (Authentication → URL Configuration).
Fora da lista, o Supabase **ignora o `emailRedirectTo` em silêncio** e usa o *Site URL* do
projeto. Nenhum erro aparece em lugar nenhum — nem log, nem tela.

Os dois endereços que precisam estar lá:

```
https://maisa-app-sooty.vercel.app/auth/callback
http://localhost:3100/auth/callback
```

**O sintoma de estar errado é uma tela de login LIMPA, sem mensagem nenhuma**, logo depois
de a pessoa clicar no link de confirmação. A sequência: o Supabase devolve para o Site URL
(`/`) em vez do callback → não há `?code=` para trocar por sessão → o middleware não acha
cookie numa rota protegida → redireciona para `/login?next=/`, sem `?error=`, porque quem
redirecionou foi ele e não o callback. Custou uma sessão de diagnóstico em 17/08/2026, e é
indistinguível a olho nu de "a sessão não foi salva".

O callback entende os três formatos que o Supabase pode mandar (`?code=`, `?token_hash=`,
e o `#access_token=` do fluxo implícito, esse último recolhido no navegador por
`app/auth/RecuperarSessaoDaUrl.tsx`, já que fragmento não chega ao servidor). **Isso é rede
de segurança, não conserto** — com a lista errada, o `next=/comecar` do cadastro é perdido
no caminho e a pessoa cai no painel em vez do onboarding.

## Schema

`supabase/` na raiz do repositório, do `001` ao `009` — ver o
[LEIA-ME de lá](../../../../supabase/LEIA-ME.md) para a ordem de execução. Este parágrafo
dizia "hoje: `001_google_integracoes.sql`; o desenho multi-inquilino ainda não existe": ele
existe desde o `002`, e o `009` fechou a última peça que faltava para as conversas.
