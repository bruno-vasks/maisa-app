# `entrada/whatsapp/` — o agente

Adaptador de **entrada**, irmão do `http/`. A diferença é só quem começa a conversa: lá
é o navegador do Bruno, aqui é uma mensagem do cliente.

Este documento era um plano. Agora é descrição — a reorganização hexagonal foi feita
**para** este adaptador, e o teste dela era: marcar horário pelo WhatsApp tinha que ser
a mesma chamada que marcar pelo painel, sem nada abaixo mudar. Foi.

## O caminho de uma mensagem

```
cliente no WhatsApp
  └─ webhook (Evolution / Cloud API) → app/api/whatsapp/route.ts   ← rota FINA, 200 na hora
     ├─ contexto.ts ....... segredo + destino da mensagem → ContextoTenant, ator = agente
     └─ agente.ts ......... (em segundo plano, `waitUntil`)
        │                   atrasada? grava e para → espera a rajada (4 s) → atende? →
        │                   disjuntor → tique azul → o loop
        ├─ persona.ts ..... system prompt montado a partir do cadastro
        ├─ ferramentas.ts . casos de uso como tools + os guardrails de alucinação
        ├─ disjuntor.ts ... a conversa virou laço com outro robô?
        ├─ bolhas.ts ...... texto do modelo → mensagens curtas de WhatsApp, sem fala inventada
        └─ composicao.ts → app.agendarAtendimento(...)   ← A MESMA FUNÇÃO DO PAINEL
                           └─ canal.enviar(...) → saida/evolution/  ← sai com "digitando…"
```

A volta é o [`saida/evolution/`](../../saida/evolution/LEIA-ME.md). Os dois lados não se
conhecem: encontram-se em `composicao.ts`.

## Arquivo a arquivo

| Arquivo | O que faz |
|---|---|
| `contexto.ts` | Valida o segredo, resolve o inquilino **pelo destino da mensagem**, normaliza o envelope de três formatos de webhook e diz como um áudio entra na conversa (`textoDoAudio`) |
| `persona.ts` | Monta o system prompt em duas partes: estável (cacheável) e volátil (hoje + memória) |
| `ferramentas.ts` | As ferramentas, o executor e a camada que desconfia do modelo |
| `bolhas.ts` | Quebra a resposta em mensagens, converte Markdown, põe hora e preço do jeito falado (`comoSeFala`), corta a fala que o modelo inventou para o cliente (`semFalaInventada`), aplica os tetos |
| `disjuntor.ts` | Diz, só pela thread, se a conversa virou laço: a mesma mensagem longa pela terceira vez, ou 12 respostas em 10 minutos |
| `agente.ts` | O loop: rajada → histórico → modelo → ferramenta → resposta → memória |

## O destino da mensagem, por provedor

| Provedor | O que identifica o negócio |
|---|---|
| Cloud API (Meta) | `metadata.display_phone_number` — o número do negócio |
| **Evolution** | **`instance`** — o nome da instância (`EVOLUTION_INSTANCIA`) |

Basta um dos dois casar. Não é frouxidão: a Evolution **não manda o número do negócio**
de forma confiável no envelope de mensagem — o que ela sempre manda é qual instância
recebeu. Uma instância é um negócio, e o campo é preenchido pelo servidor dela, não por
quem escreveu a mensagem. É essa última propriedade que importa: identidade tem que vir
de algo que o cliente não controla.

> **Custou um bug que descartava 100% das mensagens reais.** O código comparava
> `corpo.instance` com `MAISA_WHATSAPP_NUMERO`. Mas `instance` é um *nome*
> (`"maisa-barbearia"`), não um número: `digitos("maisa-barbearia")` é `""`, a comparação
> nunca casava, e o log dizia "número de destino não pertence a nenhum negócio" —
> apontando para a env errada. Nada estourava. A MAISA só ficava calada.

## O que a normalização descarta, e por quê

Tudo devolve `null` e a rota responde **200**: para o provedor, resposta de erro significa
"tente de novo", e ele reentrega o mesmo evento em loop.

| Caso | Por quê |
|---|---|
| `fromMe: true` | **A Evolution devolve o que NÓS mandamos** como `messages.upsert`, no mesmo evento das recebidas. Sem o descarte a MAISA responde a si mesma, num loop caro e visível para o cliente. ⚠️ **ACONTECEU EM 18/08/2026.** `MAISA_RESPONDER_A_SI_MESMO=1` estava em produção — a válvula que troca a regra absoluta pelo campo `source` do provedor — e a MAISA entrou em loop consigo mesma no número do dono, até as instâncias serem apagadas na mão. A env var saiu da produção no mesmo dia. **`source` não é garantia**; enquanto o conserto de verdade não existir (rastrear os ids que enviamos em `mensagens_agente.provedor_id`, o índice único já está criado), o descarte de todo `fromMe` é a única defesa que vale. |
| `@g.us` / `@broadcast` | Grupo não é atendimento. A MAISA num grupo responderia a cada mensagem de cada participante — e o dono descobre pelo grupo da família. |
| `@lid` sem telefone | Desde 2025 o WhatsApp entrega alguns contatos por id opaco (`69385314111689@lid`). Tratá-lo como número põe um "cliente" de telefone falso no cadastro **e** o `sendText` de volta falha com `exists: false`: a conversa roda inteira, gasta token, e a resposta não chega em ninguém. Quando vem `remoteJidAlt`/`senderPn`, usamos o telefone de lá. |
| evento ≠ `messages.upsert` | `messages.update` (recibo de leitura) também tem `data.key`. |
| figurinha, localização, foto sem legenda | A MAISA não lê. Áudio **segue**: é transcrito (ver "Áudio"). |

O nome do evento é comparado numa forma canônica porque a Evolution é inconsistente: a
configuração usa `MESSAGES_UPSERT`, o corpo entregue traz `messages.upsert`
(evolution-api#1340).

E o texto não vem num campo só: `conversation` para texto simples,
`extendedTextMessage` quando é resposta a outra mensagem, dentro de `ephemeralMessage`
quando o cliente usa mensagens temporárias (padrão em muitos aparelhos),
`imageMessage.caption` quando ele manda foto escrevendo em cima, `buttonsResponseMessage`
quando toca num botão. Ler só `conversation` funciona no teste e perde uma fatia grande da
conversa real — sem erro nenhum no log.

## As três camadas de guardrail

Saber qual protege de quê é o que evita achar que está protegido e não estar.

| Camada | Recusa | Onde | Vale para o painel? |
|---|---|---|---|
| **1. Núcleo** | O impossível: data inexistente, hora fora do dia, agenda de outro inquilino, atendimento duplicado | `nucleo/aplicacao/` | Sim |
| **2. Ferramenta** | O **alucinado**: horário que ninguém ofereceu, id que o modelo compôs porque parecia plausível | `ferramentas.ts` | Não — um humano não inventa id |
| **3. Prompt** | Mau comportamento: inventar preço, dar conselho clínico, prometer desconto | `persona.ts` | Não |

A camada 3 é a mais fraca e a única que **não vale como garantia**. Guardrail que mora
só em prompt é sugestão. A camada 2 existe porque a 1 não consegue distinguir "14h que
o cliente escolheu de uma lista" de "14h que o modelo achou razoável" — para o núcleo,
os dois são um pedido válido.

### O guardrail principal

`agendar` só aceita um horário que saiu de `oferecer_horarios`. Sem isso, o caminho de
falha é silencioso e caro: o modelo diz "tenho quinta às 15h" sem consultar, o cliente
aceita, o núcleo não tem como saber que ninguém ofereceu 15h, o evento nasce em cima do
almoço do dono — e todo mundo descobre na quinta.

Até 26/10/2026 a oferta tinha que ser **do mesmo turno**. O caminho mais comum de uma
marcação atravessa turnos (a MAISA oferece 10h30, pede o nome, o cliente responde "Lucas"),
e a recusa obrigava o modelo a consultar e marcar de novo: duas voltas inteiras do modelo na
hora de confirmar, medidas na bancada como 78 s até o "Pronto, Lucas!". Agora, quando o
horário não foi ofertado neste turno, **o executor consulta `oferecer_horarios` sozinho**
para aquele dia e profissional — o dia inteiro (`porDia` no teto), e não a amostra de três
que a conversa mostra, senão um horário livre podia ficar de fora — e só marca se o horário
voltar livre. A garantia é a mesma (só se marca o que a agenda de agora oferece, almoço do
dono incluído); some só a volta do modelo.

**"Já existia" pode ser um horário cancelado.** A chave de idempotência é derivada do
horário, e o núcleo devolve `ja_existia` também para uma linha cancelada com a mesma chave
(de propósito: retentar não ressuscita o que alguém desmarcou). Para o agente isso tornava
impossível voltar a um horário cancelado, e a MAISA confirmava um atendimento que não
existia. Agora `agendar` confere na agenda e, se o horário não está marcado, a chave ganha
uma geração (`#1`, `#2`…). A retentativa do modelo continua caindo na geração que vingou.

### Idempotência sem colaboração do modelo

`maisaAg` é **derivado** de `(inquilino, telefone, serviço, dia, hora)` por SHA-256
formatado como uuid v4, não sorteado. No painel o uuid nasce do clique, e clique é
único. Aqui não há clique: um modelo que não recebeu a resposta da ferramenta tenta de
novo — é o comportamento normal dele. Com uuid aleatório, a retentativa é um
atendimento novo e o cliente fica com dois horários às 14h. Derivando, a segunda
tentativa **encontra** o primeiro. A proteção funciona sem o modelo cooperar, que é o
único jeito de ela funcionar.

## As ferramentas

Elas são, literalmente, [`nucleo/portas/entrada/casos-de-uso.ts`](../../../nucleo/portas/entrada/casos-de-uso.ts).

| Tool | Caso de uso | Guardrail próprio |
|---|---|---|
| `oferecer_horarios` | `OferecerHorarios` | Registra a oferta — é o que dá poder ao `agendar` |
| `agendar` | `AgendarAtendimento` | Só horário ofertado; chave de idempotência derivada; hora em `HH:MM` |
| `meus_horarios` | `LerAgenda` | Filtra por marca da MAISA **e** por telefone — sem isso vaza o compromisso pessoal do dono e o atendimento de outro cliente |
| `cancelar` | `CancelarAtendimento` | `evento_id` só vem de `meus_horarios` |
| `anotar_nome` | `AnotarFato` | Só nome. Favorito é inferido, nunca escrito |
| `chamar_humano` | `CanalDeMensagens.escalar` | Uma vez por assunto; o aviso ao cliente não se repete |
| `nao_responder` | — | Termina o turno sem mensagem. Recusado no primeiro contato e no turno que marcou, cancelou ou chamou o dono |

Não existe ferramenta de identificar cliente: o telefone vem do envelope e o perfil é
carregado **antes** do primeiro token. Uma ferramenta a menos, e um passo que o modelo
não pode esquecer.

## A rajada

Gente escreve "oi", "tudo bem?", "queria marcar", "pra sexta" em quatro mensagens, e cada
uma chega num webhook próprio, ao mesmo tempo. Sem tratamento, a MAISA respondia as quatro:
duas saudações seguidas, respostas que se contradiziam e, pior, dois turnos tentando marcar o
mesmo horário — um conseguia, o outro era barrado e chamava o dono por um atendimento que
tinha dado certo. Visto nas conversas reais e medido na bancada (`avaliacao/`).

Agora a rota passa `esperaDaRajadaMs` (`ESPERA_DA_RAJADA_MS`, 4 s). Cada turno grava a fala
do cliente, espera, e só segue se ela ainda for a **última fala do cliente** na thread (do
cliente, e não a última de todas: a resposta de um turno anterior pode ser gravada logo
depois); os outros saem calados, e o que segue lê a rajada inteira (o histórico junta falas
seguidas do mesmo lado num turno só). Se a fala nem aparece na thread (a gravação falhou),
ele responde sem esperar, como antes. Antes de enviar (passo 3a), confere de novo: se o
cliente escreveu ou o dono assumiu enquanto a MAISA pensava, a resposta é descartada —
**salvo se o turno marcou, cancelou ou chamou o dono**, porque aí a resposta é o único aviso
disso. O 3a vem antes da trava do 3b, para um turno velho não chamar o dono à toa.

A pergunta é feita à thread (`RepositorioHistorico`), não à memória do processo: cada webhook
pode rodar numa instância diferente da Vercel. O laboratório não passa a espera (lá uma
pessoa manda uma mensagem e espera a resposta).

## Áudio

Transcrito e respondido como se a MAISA tivesse lido (decisão do Bruno, 26/10/2026). A rota
não transcreve: manda ao agente a função `ouvir` (`ouvirAudio`, em `composicao.ts`), e o
agente só a chama **depois de saber que atende essa pessoa** (passo 1a). Transcrever é mandar
a voz de alguém para o provedor de IA, e no número pessoal do dono quem manda áudio é quase
sempre a vida pessoal dele; com texto, a mensagem de um contato pessoal nem chega ao modelo,
e com áudio tem que ser igual. Número novo no modo pessoal também não é ouvido (a regra dele
é "só se pedir horário com clareza", e áudio não diz isso sem ser ouvido): fica `[áudio]` na
tela de Conversas, e o dono responde.

Quando ouve, a Evolution entrega o áudio (no próprio webhook, com `webhookBase64` ligado, ou
por `getBase64FromMediaMessage`) e o Gemini transcreve (`saida/gemini/transcricao.ts`). A
fala entra na thread como `[áudio] <transcrição>` (texto, e não emoji, porque o design system
não usa emoji em superfície nenhuma), então o dono lê na tela de Conversas o que o cliente
disse. Se não der para ouvir, entra `[áudio] (não deu para ouvir)` e a MAISA pede para a
pessoa escrever — nunca o silêncio de antes. Só Evolution: na Cloud API da Meta, o áudio cai
no aviso.

## Às vezes ela não responde

"Tá certo, vou ficar esperando", "ok", um 👍 depois da despedida: uma secretária lê e não
responde, e responder isso com frase de praxe é o que denuncia robô. Até 26/10/2026 a MAISA
respondia toda mensagem; pior, um turno sem texto era tratado como falha e chamava o dono.
Agora o silêncio é uma ferramenta, `nao_responder`, com duas travas em código: quem escreve
pela primeira vez sempre recebe resposta (`podeCalar`, ligado só se a thread já tem fala da
MAISA ou do dono), e o turno que marcou, cancelou ou chamou o dono sempre avisa o cliente. O
turno calado termina sem bolha e sem escalar (passo 2b de `agente.ts`); se o modelo tentou
marcar, não conseguiu e escolheu calar, vale o 3b e o dono é chamado. O prompt diz quando
calar e quando não: um "ok" depois de "10h ou 15h?" não fecha nada, e quem está irritado ou
cobrando uma solução nunca fica sem resposta, mesmo repetindo o que já disse (medido na
bancada: o silêncio ali virou "oi??" e reclamação de demora). Uma frase curta basta.

A fala escrita junto com `chamar_humano` só se junta à final quando é mais longa e diz outra
coisa (`parecidas`, por palavras em comum): o CVV de uma crise passa; o mesmo "sinto muito,
já avisei o Zé" dito duas vezes, não.

## Blindagem do número

Pela Evolution, a MAISA é um WhatsApp Web não oficial (Baileys), e o WhatsApp derruba número
assim por volume e por padrão de robô. Pedido do Bruno em 27/10/2026: agir como gente,
digitar de verdade, não disparar mensagem em rajada, nunca responder a si mesma. O que
existe, em ordem de importância:

| Trava | Onde | O que evita |
|---|---|---|
| A rota responde 200 na hora; o turno segue depois (`waitUntil`) | `app/api/whatsapp/route.ts` | Conferido no código da Evolution 2.3.7: o webhook desiste em 30 s e reentrega o evento até 10 vezes. Sem deduplicação, cada reentrega era a conversa rodando de novo, e com o "digitando…" quase todo turno passaria de 30 s |
| Eco da própria mensagem (`fromMe`) cai fora | `contexto.ts` | A MAISA respondendo a si mesma, em laço. Já existia |
| A mesma mensagem (mesmo id no provedor) é gravada e respondida uma vez só | `agente.ts`, passo 1b (`anexarRecebida`) | A reentrega que vier por outro motivo, mesmo com o 200 na hora |
| Mensagem escrita há mais de 15 min é gravada e não respondida (`IDADE_MAXIMA_MS`) | `agente.ts`, fim do passo 1b | A enxurrada de quando a Evolution volta de uma queda: dezenas de respostas no mesmo minuto, para perguntas de horas atrás |
| Disjuntor: a mesma mensagem longa pela 3ª vez, ou 12 respostas em 10 min, e ela para e chama o dono | `disjuntor.ts`, passo 1f | Laço com outro robô (resposta automática de loja respondendo a ela, sem fim) |
| A mesma resposta, palavra por palavra, a menos de 10 min da anterior e para uma fala diferente do cliente, não sai. A mesma pergunta de novo recebe a resposta de novo | `agente.ts`, passo 3c | O parágrafo repetido, marca de robô e o que o laço com robô de menu produz |
| A fala inventada ("Cliente: pode ser às 15h", e a resposta a ela) é cortada | `bolhas.ts` | A MAISA conversando consigo mesma dentro de uma resposta |
| Tique azul antes de pensar, só na conversa que ela atende | passo 1g; `confirmarLeitura` no `saida/evolution/` | Responder sem nunca ter lido (os tiques do cliente ficavam cinza para sempre) |
| "Digitando…" em toda bolha, ~1,5 palavra/s, variando | `saida/evolution/canal-evolution.ts`, ritmo "conversa" | Resposta instantânea, várias bolhas no mesmo segundo, sempre no mesmo compasso |
| Um aviso ao dono por cliente a cada 10 min | `saida/evolution/canal-evolution.ts` | Uma falha repetida (a cota do modelo, por exemplo) virando um 🔔 por mensagem no WhatsApp do dono |

O tique azul não vai para a conversa pessoal do dono, a conversa assumida por ele nem a
mensagem atrasada: essas continuam "não lidas" no celular dele, que é como ele sabe que tem
alguém esperando. Contato `@lid` fica sem tique (a Evolution descarta a chave).

O ritmo de digitação, os números e o porquê deles estão no LEIA-ME do
[`saida/evolution/`](../../saida/evolution/LEIA-ME.md). O que ele custa aqui: até 18 s por
resposta, dentro dos 120 s da função. Ver o orçamento logo abaixo.

## Quando o modelo não responde

`LimiteDoProvedor` (429, 5xx, timeout) ganha duas novas tentativas, 2 s e 5 s depois, desde
que caibam no orçamento do turno (`ORCAMENTO_DO_TURNO_MS`, 50 s contados do webhook). A rota tem
120 s (com Fluid compute, ligado no `vercel.json`): a espera da rajada, o modelo e até 18 s de
"digitando…" cabem com folga. Turno morto pela Vercel não chama ninguém, e o cliente fica com
meia resposta; se o modelo terminar muito tarde, o canal encolhe o "digitando…" para caber
(`caberNoPrazo`, com o prazo que a Vercel informa). Se o provedor continuar
fora, o dono é chamado com a causa e o cliente não fica num silêncio que ninguém vê — era o
que acontecia, porque a exceção subia até a rota.

A fala que o modelo escreve **junto com `chamar_humano`** não se perde: numa crise é ela que
tem o acolhimento e o CVV, e antes só a última fala do loop ("vou falar com a Ana") chegava. Medido na bancada:
com a chave do Gemini de plano gratuito (15 pedidos por minuto), 184 chamadas de 24
conversas voltaram 429.

## Ser conversacional é código, não pedido

O que denuncia um bot na primeira frase é o **bloco**: parágrafo, lista com marcadores,
fecho educado, tudo numa mensagem. Gente manda "Bom dia!", depois "Como posso te
ajudar?".

O prompt pede (uma ideia por mensagem, separadas por linha em branco); `bolhas.ts`
**garante** — teto de 3 bolhas, 320 caracteres cada, quebra em fronteira de frase.
Instrução em prompt é probabilidade, e num canal onde o cliente vê o resultado cru a
exceção aparece.

`bolhas.ts` também traduz Markdown, porque o WhatsApp não é Markdown: `**negrito**`
aparece com os asteriscos duplos e `### Título` com as cerquilhas. O modelo escreve
Markdown por hábito, e o cliente lê o hábito.

E põe hora e preço do jeito falado (`comoSeFala`): "09:00" vira "9h", "14:30" vira "14h30",
"R$ 50.00" vira "R$ 50". As ferramentas já entregam a hora falada e o prompt pede, mas o
modelo copia o formato de onde estiver olhando, e "09:00" é a marca mais visível de que
quem responde é um sistema.

O que o prompt pede (`persona.ts`, reescrito em 26/10/2026 a partir da bancada): escrever
como gente no WhatsApp, acompanhar o tom de quem escreve (formal com formal, leve com leve,
calma no assunto delicado), cumprimentar só na primeira mensagem e com o período certo do
dia (a hora agora vai no prompt), e conduzir até o horário marcado — preço vem com oferta
de horário, "vou ver" ganha uma porta aberta. Perguntada se é robô, ela diz a verdade.

## Memória

Nome, profissional favorito, serviço favorito e — quando o padrão passa do limiar —
horário favorito. Ver [`nucleo/dominio/memoria.ts`](../../../nucleo/dominio/memoria.ts).

**Preferência é inferida, não anotada.** O agente grava FATOS (marcou tal dia, tal hora,
com tal profissional); a conclusão é uma função pura com mínimo de 3 amostras e
concentração mínima de 50%. Se o modelo pudesse escrever "horário favorito = 15h" porque
o cliente disse uma vez "15h tá bom", a memória viraria bloco de notas dele — e um
modelo anotando conclusões próprias inventa padrão onde há coincidência.

Quem alternou entre três profissionais em seis visitas **não tem** favorito. Preferimos
não lembrar nada a lembrar errado: errar aqui é chamar o cliente pelo nome do
profissional que ele não quer.

No prompt, favorito entra como **atalho a confirmar**, nunca como fato a executar.

## Histórico é só texto

A cada mensagem recebida o loop de ferramentas **começa de novo**: replayamos as falas e
descartamos os blocos de `tool_use`/`tool_result` dos turnos passados. Parece
desperdício e é o contrário:

- **Correção** — resultado de ferramenta sobre agenda azeda em segundos. Um
  `tool_result` de "quinta 15h está livre" replayado dez minutos depois faz o modelo
  reafirmar com convicção um horário já tomado.
- **Fronteira** — a porta `RepositorioHistorico` fala `Msg`, o tipo que a tela de
  Conversas já usa. Se guardasse blocos da Anthropic, trocar de modelo viraria migração
  de banco.

## Quem responde

**Nenhum nome de provedor aparece neste adaptador.** O loop fala
[`portas/saida/modelo-conversa.ts`](../../../nucleo/portas/saida/modelo-conversa.ts), e
quem responde é uma linha em `composicao.ts`:

| Provedor | Adaptador | Quando |
|---|---|---|
| Gemini | `saida/gemini/` | Há `GEMINI_API_KEY` — é o caso de **hoje** |
| Anthropic | `saida/anthropic/` | Só `ANTHROPIC_API_KEY` |

⚠️ **A chave do Gemini em uso é de TESTE e será revogada na ida para produção.** Trocar de
volta é apagar `GEMINI_API_KEY` do ambiente — nenhuma linha de código. A porta existe por
causa disso: antes o `agente.ts` importava o SDK da Anthropic e falava `tool_use`,
`stop_reason`, `TextBlock`, e trocar de provedor era reescrever o loop.

**Modelo hoje:** `gemini-3.5-flash-lite`, US$ 0,30 / 2,50 por 1M tokens (entrada/saída) —
mesmo preço da 2.5 Flash, uma geração depois. Dá ~US$ 0,001 por mensagem. Se ele tropeçar
na disciplina que importa (chamar `oferecer_horarios` antes de afirmar qualquer coisa
sobre agenda), o degrau é `GEMINI_MODELO=gemini-3.6-flash`, não prompt novo.

Três coisas valem para os dois provedores:

- **Pensamento LIGADO.** Com raciocínio desabilitado, os dois às vezes escrevem a chamada
  de ferramenta como **texto visível**: o turno "dá certo", a ferramenta nunca roda, e o
  cliente recebe a intenção em vez do agendamento. Num canal onde ele não vê que algo
  falhou, é o pior modo de falha possível — e a economia não paga isso.
- **Prompt cache é casamento de prefixo.** O bloco estável (persona + catálogo + FAQ) vem
  primeiro; a data de hoje fica no bloco volátil, **depois**. Se a data estivesse no topo
  (o lugar "natural"), o prefixo mudaria à meia-noite e o catálogo inteiro seria
  reprocessado a preço cheio a cada mensagem.
- **`estadoOpaco` na chamada de ferramenta.** Modelos com raciocínio interno guardam
  estado cifrado junto da chamada e exigem que ele volte **intacto** no turno seguinte. No
  Gemini 3 é o `thoughtSignature`; sem ele a API responde **400** e o agente morre na
  primeira consulta de agenda. Descoberto testando, não lendo. Nunca inspecione nem
  reconstrua esse valor — só carregue.

## Testar sem número de WhatsApp

**`npm run dev` e abra [/laboratorio](http://localhost:3100/laboratorio).** Você é o
cliente; ao lado da conversa aparece o que ela fez por baixo. Dev-only: fecha em produção
e só abre com `MAISA_LABORATORIO=1`.

A coluna da direita é o motivo de o laboratório existir em vez de um `curl`. No texto da
resposta, *"consultei a agenda e tenho quinta às 15h"* e *"inventei quinta às 15h"* são
**indistinguíveis** — e a segunda é o pior bug deste produto. A trilha mostra se
`oferecer_horarios` rodou antes da fala. Sem ela, você está avaliando prosa.

Também mostra o que a MAISA lembra (e o que ela **não** afirma: favorito só aparece com 3
visitas e 50% de concentração) e o que foi marcado. "Esquecer tudo" zera memória,
histórico e agenda — sem isso, o caminho "cliente que nunca falou com a MAISA" só é
testável uma vez por processo, e é justamente ele que decide a primeira impressão.

Sem credencial do Google, a agenda cai numa **agenda em memória** (`saida/demo/agenda.ts`)
com o almoço bloqueado das 12h às 13h. Um selo no topo diz qual está em uso — um horário
que "não existe" parece bug do agente quando é só a agenda de mentira.

Por `curl`, se preferir:

```sh
curl -s localhost:3100/api/laboratorio \
  -H 'content-type: application/json' \
  -d '{"texto":"bom dia"}' | jq
```

O `de` é opcional e cai no telefone da Mariana Alves dos fixtures — o caminho de cliente
reconhecido. Trocar o número dá o caminho de desconhecido.

A rota `/api/whatsapp` também aceita `{ de, texto }` cru, mas exige o segredo do webhook:
ela é a porta pública, e afrouxar a autenticação dela "só no dev" é afrouxá-la.

## O que NÃO fazer aqui

- ❌ `fetch("/api/atendimentos")`. O agente roda no mesmo processo: chama o caso de uso
  direto. HTTP no meio só adiciona latência, um round-trip de auth e um ponto de falha.
- ❌ Reimplementar regra de agendamento "porque no WhatsApp é diferente". Se for
  diferente de verdade, é parâmetro do caso de uso — não uma segunda cópia dele.
- ❌ Deixar o modelo escolher `tenantId`. Ele vem do destino da mensagem (instância ou
  número), resolvido antes de o modelo ver qualquer coisa.
- ❌ Deixar o modelo escolher `maisaAg`, `comMeet` ou `convidarCliente`. Não estão no
  schema das ferramentas de propósito: convite é e-mail de verdade despachado pelo
  provedor, e isso não é decisão de um modelo.
- ❌ Novo guardrail em prompt quando ele cabe em código. Prompt é a camada 3.

## O que a fatia das conversas reais mudou aqui

Três coisas, e vale saber porque as duas primeiras eram dívida declarada neste arquivo:

- **A memória saiu do `Map`.** `saida/supabase/memoria.ts` existe e `composicao.ts` escolhe
  por `isSupabaseConfigured`. O que isso destravou não foi só sobreviver ao redeploy: **o
  painel passou a ver a conversa.** A tela roda em outro processo que este webhook, então um
  `Map` de módulo era invisível para ela por construção — era a razão de fundo de a tela de
  Conversas ter vivido de fixture.
- **`voce` é gravado.** Quando o dono responde pelo painel, a fala dele entra em
  `mensagens_agente` como qualquer outra, e o replay do próximo turno a inclui. A MAISA não
  contradiz mais o próprio dono ao retomar.
- **A fala do cliente é gravada ANTES de o turno decidir qualquer coisa** (passo 1b do
  `agente.ts`). Antes a gravação era o último passo, então todo `return` antecipado
  descartava a pergunta junto com a resposta que não houve — assistente desligada, recusa do
  provedor, seis voltas sem conclusão, e o pior: "tentou marcar e não conseguiu". O efeito era
  o inverso do necessário: **a conversa que mais exige o dono era a única invisível no painel
  dele.** Ele recebia o aviso de escalada no WhatsApp e não achava a conversa em lugar nenhum.

E uma capacidade nova: **o agente CALA quando o dono assume.** `RepositorioConversas.posse` é
lida no passo 1d, antes do primeiro token. Enquanto isso morava no `localStorage` do painel, o
botão "Assumir" prometia silêncio no toast e o webhook nunca soube — o dono respondia, o
cliente respondia de volta, e a MAISA falava por cima dele.

## Dívida declarada
- **Áudio seguido de texto pode inverter a ordem.** A transcrição leva alguns segundos e a fala
  só é gravada depois dela, então um texto mandado logo após um áudio ("ops, 11h") entra antes
  dele na thread. A thread usa o relógio do Postgres de propósito (ver `saida/supabase/memoria.ts`),
  e gravar a hora de chegada pelo relógio do processo desfaria isso. Raro: pede uma correção por
  texto até uns 3 s depois do áudio.
- **Dois turnos ao mesmo tempo não se veem.** Se o cliente escreve enquanto um turno está
  marcando, o turno seguinte lê a thread sem a resposta do primeiro (ela ainda não foi gravada).
  Na maioria das vezes isso dá uma confirmação repetida; se a mensagem nova mudar o horário, pode
  dar dois atendimentos. Resolver pede coordenação entre instâncias que hoje não existe.
- ~~**Áudio não é respondido.**~~ **Fechada em 26/10/2026**: transcrito (ver "Áudio"). O
  caminho até o Gemini foi provado com nota de voz OGG/Opus de verdade; o download pela
  Evolution (`getBase64FromMediaMessage`) segue a documentação dela e ainda espera o primeiro
  áudio real.
- ~~**Um inquilino só.**~~ **Fechada em 14/08/2026.** `tenantPorDestino` resolve o inquilino
  em `integracoes_whatsapp` pela instância. O env (`MAISA_TENANT_ID`) sobrou para um caso e
  só um: ambiente **sem** Supabase, onde a MAISA roda em demonstração e se conversa com ela
  por `curl`. Com Supabase configurado o banco ganha sempre — um env esquecido apontando para
  o inquilino errado escreveria na agenda de outro negócio. E falha de banco **não** cai para
  o env: descartar a mensagem é reversível, marcar horário no negócio errado não é.
- ~~**Sem deduplicação de reentrega.**~~ **Fechada em 27/10/2026** (o Bruno autorizou mexer na
  porta). `RepositorioHistorico.anexarRecebida` grava a fala com o id da mensagem no provedor, e
  o índice único da 007 (`provedor_id`, por inquilino) recusa a segunda: o turno da reentrega
  termina no passo 1b, sem responder e sem segunda linha no painel. O id não entrou em `Msg`
  (o tipo da tela continua sem detalhe do canal) e nunca volta na leitura. Resta uma ponta: um
  áudio reentregue é transcrito de novo antes de chegar ao 1b.
- **As travas de volume valem por conversa, não pelo número inteiro.** O disjuntor olha uma
  pessoa; não há teto de mensagens por minuto para a instância toda, porque um contador assim
  precisaria morar no banco (cada webhook pode rodar numa instância diferente da Vercel).
- **A thread do painel não é realtime.** A tela relê de 15 em 15 segundos com ela aberta (ver
  `RELER_CONVERSAS_MS` no store). O Supabase tem realtime; é uma fatia própria.
- ~~**Nenhum teste automatizado no repo.**~~ **Fechada em 13/08/2026.** O vitest entrou e o
  repositório tem suíte de verdade (`npm test`). ⚠️ As que faltam ainda são as **deste
  adaptador**: os envelopes da Evolution (`fromMe`, grupo, `@lid`, `ephemeralMessage`,
  resolução por instância, formatação de número) continuam provados só à mão. Cada linha da
  tabela "o que a normalização descarta" acima é um caso de teste esperando para existir, e
  cada um deles já foi um bug real.
