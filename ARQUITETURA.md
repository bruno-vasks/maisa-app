# Arquitetura da MAISA — o mapa geral

> **Comece por aqui.** Este é o roteador do repositório: o que existe, onde está e por
> quê. Cada pasta tem o seu próprio `LEIA-ME.md` com a tabela arquivo a arquivo.
> Última reorganização: **11/08/2026** (adoção da arquitetura hexagonal).

---

## 1. A ideia em um parágrafo

O app é um **hexágono**. No meio fica o que a MAISA É — atendimento, agenda,
expediente, cliente, nota fiscal — sem saber que existe Next.js, React, Google ou
Supabase. Em volta ficam os **adaptadores**: pedaços de código que traduzem o mundo
externo para a língua do meio, e vice‑versa. Entre os dois há **portas**: interfaces
que o meio declara e os adaptadores cumprem.qs

A regra que sustenta tudo:

> **As setas apontam para dentro.** Adaptador importa núcleo. Núcleo nunca importa
> adaptador. Se você precisou escrever `import … from "@/adaptadores/…"` dentro de
> `src/nucleo/`, parou: o que falta é uma porta.

O único lugar que conhece os dois lados é `src/composicao.ts`.

---

## 2. Por que isto agora

Duas razões concretas, nenhuma delas estética:

**O agente de WhatsApp.** A MAISA vai marcar horário conversando com o cliente. Um
agente de IA não tem navegador, não tem React e não faz `fetch` no próprio app. Antes,
"marcar um atendimento" só existia como um `POST /api/atendimentos` com validação
escrita dentro do handler — ou seja, a regra de negócio só existia para quem falasse
HTTP. Agora ela é `app.agendarAtendimento(tenant, pedido)`, e o agente vai chamar a
**mesma função**, com a mesma proteção contra marcar duas vezes.

**Multi‑inquilino.** O mesmo app atende terapeutas e barbeiros, e cada assinante é um
negócio isolado. Toda porta de saída já recebe `ContextoTenant`, mesmo que hoje só
exista um negócio. Quando o banco entrar, é um adaptador novo — não é caçar `where`
faltando em vinte arquivos.

---

## 3. O mapa

```
code/
├── ARQUITETURA.md              ← você está aqui
├── README.md                   ← como rodar, env vars, deploy
├── supabase/                   ← DDL versionada (o schema é o arquivo, não a prosa)
├── lp/  → public/lp/           ← LP estática de terapeutas (espelhada no predev)
├── scripts/                    ← espelha-lp, vendor-ds, captura de telas
└── src/
    ├── composicao.ts           ★ RAIZ DE COMPOSIÇÃO — portas encontram adaptadores
    ├── config/                 ← configuração LIDA NO EDGE (o middleware não roda em Node)
    │
    ├── nucleo/                 ● O HEXÁGONO — zero import de framework
    │   ├── dominio/            ..... tipos e regras puras (o que a MAISA é)
    │   ├── portas/
    │   │   ├── entrada/        ..... o que se pode PEDIR ao app (casos de uso)
    │   │   └── saida/          ..... o que o app PRECISA do mundo (interfaces)
    │   └── aplicacao/          ..... implementação dos casos de uso
    │
    ├── adaptadores/
    │   ├── entrada/            ◀ quem CHAMA o app
    │   │   ├── http/           ..... sessão → tenant, erro de domínio → status HTTP
    │   │   └── whatsapp/       ..... o agente de IA (ferramentas + memória + bolhas)
    │   └── saida/              ▶ quem o app CHAMA
    │       ├── google/         ..... Google Calendar + OAuth + tokens cifrados
    │       ├── focus/          ..... Focus NFe (NFS-e municipal)
    │       ├── evolution/      ..... WhatsApp: por onde a MAISA FALA
    │       ├── gemini/         ..... o modelo que responde HOJE (chave de teste)
    │       ├── anthropic/      ..... o outro modelo — troca em 1 linha
    │       ├── resend/         ..... e-mail: o aviso de vencimento do pré-pago
    │       ├── supabase/       ..... auth, sessão, cliente do banco
    │       └── demo/           ..... fixtures em memória (cadastro, agenda, memória)
    │
    ├── app/                    ← Next.js: páginas e route handlers (finos)
    ├── ui/                     ◀ adaptador de entrada humano (React)
    └── ds/                     ← design system vendorado (ver src/ds/VENDORED.md)
```

Legenda: ● núcleo · ◀ entrada · ▶ saída · ★ composição

---

## 4. Um pedido inteiro, de ponta a ponta

Marcar um atendimento pelo painel:

```
 clique na grade
   └─ ui/telas/Agenda.tsx ......... cria o rascunho (uuid de idempotência nasce aqui)
      └─ ui/estado/store.tsx ...... POST /api/atendimentos
         └─ app/api/atendimentos/route.ts         ← rota FINA: só traduz HTTP
            ├─ adaptadores/entrada/http/contexto.ts ...... cookie → ContextoTenant
            └─ composicao.ts → app.agendarAtendimento
               └─ nucleo/aplicacao/agendar-atendimento.ts  ← TODA a regra
                  ├─ nucleo/dominio/* .............. validação, instantes, invariantes
                  ├─ porta RepositorioNegocio ...... → adaptadores/saida/demo
                  └─ porta AgendaExterna ........... → adaptadores/saida/google
                     └─ conexoes.ts (token) → calendario.ts (HTTP v3) → Google
```

Pelo WhatsApp, os quatro primeiros passos somem e entra um só —
`adaptadores/entrada/whatsapp` chamando `app.agendarAtendimento`. **Nada abaixo disso
mudou.** Era o teste de que a arquitetura estava fazendo o trabalho dela, e ele passou:

```
 mensagem do cliente (Evolution API)
   └─ app/api/whatsapp/route.ts ............ rota FINA: segredo + normaliza envelope
      ├─ whatsapp/contexto.ts .............. instância que recebeu → ContextoTenant (ator = agente)
      └─ whatsapp/agente.ts ................ loop: histórico → Claude → ferramenta → bolhas
         ├─ whatsapp/persona.ts ............ prompt montado do cadastro (estável + volátil)
         ├─ whatsapp/ferramentas.ts ........ recusa o ALUCINADO (horário não ofertado, id inventado)
         ├─ composicao.ts → app.agendarAtendimento   ← MESMA função, MESMA proteção
         └─ porta CanalDeMensagens .......... → saida/evolution (a resposta volta por aqui)
```

O agente ganhou de graça a idempotência, a allowlist de agenda e a validação de data —
porque elas moram no caso de uso, não na rota. O que ele precisou acrescentar foi um caso
de uso novo (`oferecerHorarios`: a tela calculava o vago desenhando a grade, o que não
serve para quem não tem tela) e uma camada de desconfiança própria, para o que o núcleo
não tem como distinguir: "14h que o cliente escolheu de uma lista" e "14h que o modelo
achou razoável" são, para ele, o mesmo pedido válido.

---

## 5. Onde eu mexo quando quero…

| Quero… | Mexo em |
|---|---|
| mudar uma REGRA (o que é válido, o que o app faz) | `src/nucleo/aplicacao/` |
| mudar um TIPO do negócio | `src/nucleo/dominio/` |
| criar uma ação nova do produto | porta em `portas/entrada/` + caso de uso em `aplicacao/` |
| trocar Google por outro calendário | novo adaptador em `saida/` + 1 linha em `composicao.ts` |
| sair dos fixtures e ir pro banco | `saida/demo/repositorio.ts` → `saida/supabase/…` + 1 linha em `composicao.ts` |
| mudar o formato JSON de uma resposta | `app/api/**/route.ts` e `adaptadores/entrada/http/` |
| mexer em tela | `src/ui/` |
| mexer em landing page | `src/app/(marketing)/` e `lp/` (ver o CLAUDE.md do projeto) |

---

## 6. Regras que valem sempre

**A lista canônica mora no [`CLAUDE.md`](CLAUDE.md), seção "Regras invioláveis".** Ela está
lá, e não aqui, por dois motivos: é o arquivo que um agente lê em toda sessão, e é a lista
que o mecanismo de reafirmação reinjeta durante a sessão. Duplicá-la aqui garantiria que uma
das duas cópias ficasse velha.

O que este documento acrescenta é o **porquê** de cada uma, que está espalhado pelas seções
acima e pelos `LEIA-ME.md` de cada pasta.

Três delas são executáveis e reprovam o build — ver `src/arquitetura.test.ts`:

| Regra | Onde é verificada |
|---|---|
| núcleo não importa adaptador, UI, rota nem pacote externo | `arquitetura.test.ts`, regra 1 |
| adaptador não importa adaptador (4 exceções nominais) | `arquitetura.test.ts`, regra 2 |
| `tenantId` nunca vem do request | `arquitetura.test.ts`, regra 3 |
| segredo nenhum escrito em `src/` | `arquitetura.test.ts`, regra 4 |

E as de documentação — rota documentada, pasta com `LEIA-ME.md`, índice da §8 completo, porta
com `demo`, teto do `CLAUDE.md` — em `src/documentacao.test.ts`.

---

## 7. O que ficou faltando (dívida declarada)

Honestidade sobre o estado real, para ninguém achar que está mais pronto do que está:

- **⚠️ O AGENTE JÁ MENTIU QUE MARCOU — e o guardrail que impede isso é código novo.**
  Medido em conversa de teste com `gemini-3.5-flash-lite`, em ~1 de 3 tentativas: `agendar`
  era recusado pelo guardrail de oferta, o modelo chamava `oferecer_horarios`, recebia o
  horário livre e **escrevia a confirmação em vez de chamar `agendar` de novo**. Como o
  turno terminava sem chamada de ferramenta, o loop dava por encerrado e "Pronto, agendado
  para amanhã às 09:00" seguia para o cliente com a agenda vazia.
  A defesa é `EstadoDoTurno.tentouAgendar` + a checagem no fim de `whatsapp/agente.ts`:
  tentou marcar, não marcou ⇒ a resposta é descartada e o dono assume. É sinal
  ESTRUTURAL de propósito — distinguir "Pronto, agendado!" de "Consigo às 09:00, confirma?"
  por texto é heurística de string, e errar para o lado permissivo entrega a mentira.
  **O guardrail contém o dano; ele não conserta o modelo.** Se a frequência incomodar, o
  degrau é `GEMINI_MODELO=gemini-3.6-flash` — não prompt novo.
- **`SUPABASE_SERVICE_ROLE_KEY` não está em produção.** Confirmado no `vercel env ls`: as
  outras 20 estão, essa não. O agente não tem cookie, então `saida/supabase/contexto-cliente.ts`
  cai no ramo de service role, `isAdminConfigured` é false e ele lança `NaoConfigurado`
  antes de ler cadastro ou token do Google. **É a causa mais próxima de a MAISA escalar
  toda tentativa de marcar em produção.**
  ⚠️ E acrescentar a chave sozinha não basta: hoje `whatsapp/contexto.ts` resolve o
  inquilino pelo FALLBACK de env justamente porque a service role falta. Com ela presente,
  a resolução migra para `integracoes_whatsapp` e **falha fechada** se não houver linha com
  a instância — descartando a mensagem em vez de chutar o negócio do env (o que é o
  comportamento certo, e é preciso saber antes). O `008_seed_bruno.sql` pula essa linha
  quando `c_instancia` não foi ajustada, e avisa por `warning`.

- **A UI lê fixture só como PLACEHOLDER, e ainda para 4 coisas.** `negocio`,
  `profissionais`, `servicos` e `clientes` passaram a vir de `GET /api/cadastro` (caso de
  uso `lerCadastro`); o `store.tsx` guarda o fixture como valor INICIAL e repinta quando a
  resposta chega — ver o comentário de `CADASTRO_INICIAL` para por que há placeholder em
  vez de estado de carregando. O que **continua** fixture de verdade: `faturamento`, `notas`,
  `assistente` e `DIAS_PADRAO`. **Conversas e mensagens saíram da lista**: vêm de
  `GET /api/conversas` (casos de uso em `aplicacao/conversas.ts`), e ali NÃO há placeholder de
  fixture de propósito — cadastro com placeholder mostra um preço errado, conversa com
  placeholder mostra uma pessoa que não existe. E o preço da escolha:
  se o fetch falhar, a tela segue mostrando placeholder — é o que `cadastroErro` existe
  para denunciar, e quem mostra número de negócio tem obrigação de olhar para ele.
- **`repositorioDemo` ignora o inquilino que recebe** — mas agora ele é o FALLBACK.
  `composicao.ts` usa `repositorioSupabase` quando há chave de Supabase, e ele filtra por
  `tenant_id` em toda consulta. O fixture ficou para o ambiente sem banco (afinar a MAISA
  por `curl`), e é lá que "um negócio só" continua verdade.
- **⚠️ Com service role, `.eq("tenant_id")` é a única fronteira.** O webhook do WhatsApp
  não tem cookie, então `saida/supabase/contexto-cliente.ts` escolhe o cliente pelo `ator`
  do contexto: sessão para `usuario`, service role para `agente`/`sistema`. Service role
  ignora RLS. Nos adaptadores `saida/supabase/repositorio.ts` e `saida/google/conexoes.ts`
  os filtros por tenant deixaram de ser redundantes e passaram a ser a proteção — perder
  um vaza o inquilino inteiro. É a faca que a auditoria do BIP achou cinco vezes.
- **Não há teste automatizado.** Agora dá para ter: os casos de uso recebem as portas
  por parâmetro, então um teste monta dublês e roda o núcleo sem rede. Era impossível
  quando a regra morava dentro do `route.ts`. 69 asserções cobrindo vagas, inferência de
  memória, bolhas, normalização de webhook e a allowlist de horários do agente já foram
  escritas e passaram — **fora do repositório**, porque não há runner escolhido. Falta
  trazê-las para dentro.
- **A memória do agente é um `Map` de processo.** Morre no redeploy e não é compartilhada
  entre instâncias: na Vercel, duas mensagens seguidas podem cair em lambdas diferentes e
  a segunda não lembra da primeira. A DDL está em `supabase/007_memoria_agente.sql`;
  faltam `saida/supabase/memoria.ts` e duas linhas em `composicao.ts`.
- **O agente não responde a áudio.** Cliente que manda áudio recebe silêncio: a mensagem
  é reconhecida, aparece no log com o tipo, e é descartada. No Brasil áudio é como muita
  gente manda mensagem — é decisão de produto pendente (pedir texto, escalar, ou
  transcrever), não caso de borda. A plumbing está pronta em `Envelope.midia`.
- **A conversa não é deduplicada.** O webhook reentrega quando não recebe 200 a tempo, e
  hoje uma reentrega gera resposta duplicada. O índice único em `provedor_id` já está na
  DDL; o adaptador de demonstração não o usa.
- **O espelho `atendimentos` agora é gravado** — porta `RegistroDeAtendimentos`, chamada por
  `agendar-atendimento.ts` depois de o provedor confirmar, e `garantirCliente` faz o lead do
  WhatsApp entrar em `clientes` (antes ele era `lead:<telefone>`, que o `PARECE_UUID` do
  adaptador recusava, então `cliente_id` ficava sempre nulo). Ver `supabase/LEIA-ME.md` §5.5.
  ⚠️ **Verificado só no modo demonstração.** O caminho Supabase compila e foi lido, mas
  nenhuma dessas escritas jamais recebeu resposta de um Postgres.
- **O schema multi‑inquilino agora É usado — mas nada disso foi executado.**
  `entrada/http/contexto.ts` resolve `tenantId` por `select tenant_id from membros`;
  `saida/supabase/repositorio.ts` existe e lê das views `v_negocio` / `v_profissionais` /
  `v_servicos` / `v_clientes`; `saida/google/conexoes.ts` migrou de `google_integracoes`
  (legado, `profissional_id` em texto) para `integracoes_google` (uuid, PK composta); e
  `entrada/whatsapp/contexto.ts` resolve o inquilino por `integracoes_whatsapp.instancia`.
  O que sobrou de dívida está listado em [supabase/LEIA-ME.md](supabase/LEIA-ME.md), §5.
- **⚠️ O CÓDIGO AINDA NÃO FALOU COM O POSTGRES.** A DDL `002`→`006` **foi rodada** no
  Supabase de produção (12/08/2026), então as tabelas e as views existem. O que continua
  sem verificação é o outro lado: `saida/supabase/repositorio.ts`, `atendimentos.ts` e o
  `conexoes.ts` novo estão conferidos só por tipo e por leitura — nenhuma consulta deles
  jamais recebeu resposta de um banco, porque `.env.local` está vazio nas duas variáveis
  que importam (`SUPABASE_*`, `GOOGLE_*`) e nesta máquina não há Postgres.
  Sobre o `008_seed_bruno.sql`: não se sabe se rodou, e importa — é ele que cadastra a
  linha de `integracoes_whatsapp`, e ele **pula** essa parte com um `warning` quando
  `c_instancia` não foi ajustada.
- **Os ids mudam de formato entre os dois modos.** Fixture dá `"pr1"`/`"sv1"`/`"cl1"`;
  banco dá `uuid`. O núcleo não se importa, mas dado copiado de um modo para o outro não
  casa — e a regex de `criarDesconectarAgenda` aceita os dois de propósito, porque a tabela
  legada tem `"pr1"` gravado até o `006` rodar.

---

## 8. Índice dos LEIA‑ME

| Pasta | Documento |
|---|---|
| `supabase/` | [supabase/LEIA-ME.md](supabase/LEIA-ME.md) |
| `src/` | [src/LEIA-ME.md](src/LEIA-ME.md) |
| `src/nucleo/` | [src/nucleo/LEIA-ME.md](src/nucleo/LEIA-ME.md) |
| `src/nucleo/dominio/` | [src/nucleo/dominio/LEIA-ME.md](src/nucleo/dominio/LEIA-ME.md) |
| `src/nucleo/portas/` | [src/nucleo/portas/LEIA-ME.md](src/nucleo/portas/LEIA-ME.md) |
| `src/nucleo/aplicacao/` | [src/nucleo/aplicacao/LEIA-ME.md](src/nucleo/aplicacao/LEIA-ME.md) |
| `src/adaptadores/` | [src/adaptadores/LEIA-ME.md](src/adaptadores/LEIA-ME.md) |
| `src/adaptadores/entrada/http/` | [.../entrada/http/LEIA-ME.md](src/adaptadores/entrada/http/LEIA-ME.md) |
| `src/adaptadores/entrada/whatsapp/` | [.../entrada/whatsapp/LEIA-ME.md](src/adaptadores/entrada/whatsapp/LEIA-ME.md) |
| `src/adaptadores/entrada/stripe/` | [.../entrada/stripe/LEIA-ME.md](src/adaptadores/entrada/stripe/LEIA-ME.md) |
| `src/adaptadores/entrada/abacatepay/` | [.../entrada/abacatepay/LEIA-ME.md](src/adaptadores/entrada/abacatepay/LEIA-ME.md) |
| `src/adaptadores/saida/google/` | [.../saida/google/LEIA-ME.md](src/adaptadores/saida/google/LEIA-ME.md) |
| `src/adaptadores/saida/focus/` | [.../saida/focus/LEIA-ME.md](src/adaptadores/saida/focus/LEIA-ME.md) |
| `src/adaptadores/saida/stripe/` | [.../saida/stripe/LEIA-ME.md](src/adaptadores/saida/stripe/LEIA-ME.md) |
| `src/adaptadores/saida/abacatepay/` | [.../saida/abacatepay/LEIA-ME.md](src/adaptadores/saida/abacatepay/LEIA-ME.md) |
| `src/adaptadores/saida/resend/` | [.../saida/resend/LEIA-ME.md](src/adaptadores/saida/resend/LEIA-ME.md) |
| `src/adaptadores/saida/evolution/` | [.../saida/evolution/LEIA-ME.md](src/adaptadores/saida/evolution/LEIA-ME.md) |
| `src/adaptadores/saida/rebots/` | [.../saida/rebots/LEIA-ME.md](src/adaptadores/saida/rebots/LEIA-ME.md) |
| `src/adaptadores/saida/gemini/` | [.../saida/gemini/LEIA-ME.md](src/adaptadores/saida/gemini/LEIA-ME.md) |
| `src/adaptadores/saida/anthropic/` | [.../saida/anthropic/LEIA-ME.md](src/adaptadores/saida/anthropic/LEIA-ME.md) |
| `src/adaptadores/saida/supabase/` | [.../saida/supabase/LEIA-ME.md](src/adaptadores/saida/supabase/LEIA-ME.md) |
| `src/adaptadores/saida/demo/` | [.../saida/demo/LEIA-ME.md](src/adaptadores/saida/demo/LEIA-ME.md) |
| `src/app/` | [src/app/LEIA-ME.md](src/app/LEIA-ME.md) |
| `src/ui/` | [src/ui/LEIA-ME.md](src/ui/LEIA-ME.md) |
| `src/ui/guardas/` | [src/ui/guardas/LEIA-ME.md](src/ui/guardas/LEIA-ME.md) |
| `scripts/bancada/` | [scripts/bancada/LEIA-ME.md](scripts/bancada/LEIA-ME.md) |
