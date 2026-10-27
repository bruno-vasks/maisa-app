# `saida/evolution/` — WhatsApp pela Evolution API

Cumpre a porta `CanalDeMensagens`. **⚠️ Só servidor.**

É por onde a MAISA **fala**. O lado que **ouve** é [`entrada/whatsapp/`](../../entrada/whatsapp/LEIA-ME.md);
os dois juntos fecham o ciclo da conversa, e nenhum dos dois conhece o outro — eles se
encontram em `composicao.ts`.

Doc oficial: <https://doc.evolution-api.com/v2/> · Auth: header `apikey: <token>`

## Arquivos

| Arquivo | Assunto | Detalhe que não é óbvio |
|---|---|---|
| `canal-evolution.ts` | **A fachada.** Implementa `CanalDeMensagens`: bolhas no ritmo de quem manda (ver "O ritmo", abaixo) + escalação para o dono, um aviso por cliente a cada 10 min. | `escalar()` **nunca lança** — ele é chamado justamente nos caminhos de falha do agente, e uma exceção aqui trocaria o problema original por um erro de notificação. Desde 01/10/2026 também `enviarDocumento` (o PDF do recibo, com a mensagem na legenda), **sem segunda chance**: a Evolution segura a resposta enquanto baixa o arquivo, e repetir pode entregar duas vezes. |
| `contatos-evolution.ts` | Implementa `ContatosDoCanal`: lê a agenda por `POST /chat/findContacts/{instancia}`. | **Só POST — o GET responde 404** nesta versão. Filtra aqui, não em quem chama: da agenda do Bruno, 1.840 entradas dão **374** utilizáveis (o resto é grupo ou `@lid` sem telefone). `findChats` é fonte pior: 137 conversas, 3 com telefone. |
| `cliente.ts` | HTTP: `sendText`, `sendPresence`, `markMessageAsRead`, `connectionState`, `webhook/set` | Todo o mapeamento de erro vive aqui. O prazo do `sendText` **soma o `delay`** (o "digitando…" segura a requisição). `markMessageAsRead` (27/10/2026, `confirmarLeitura`): o tique azul, corpo `{ readMessages: [{ remoteJid, fromMe: false, id }] }`; conferido no código da 2.3.7, chave `@lid` é descartada em silêncio. `LimiteDoProvedor` só para status que provam que a Evolution **não** processou. `sendMedia` (01/10/2026): corpo plano da v2 (`mediatype: "document"`, `mimetype`, `media` como URL, `fileName`, `caption`), conferido no `SendMediaDto` da Evolution. `getBase64FromMediaMessage` (26/10/2026, `baixarMidia`): o áudio recebido, para a MAISA transcrever; corpo `{ message: { key: { id } }, convertToMp4: false }`. Segue a documentação da Evolution e ainda espera o primeiro áudio real. Com `webhookBase64` ligado na instância, o áudio já vem no webhook e esta chamada não acontece. |
| `config.ts` | Env vars, `isEvolutionConfigured`, avisos | Sem configuração o app **não quebra**: cai no `canalDemo` e a MAISA continua respondendo no log. |

## Fluxo de operação

```
agente atende    →  POST /chat/markMessageAsRead/{instancia}   (tique azul, antes de pensar)
agente responde  →  canal.enviar(t, telefone, ["bolha 1", "bolha 2"])   (ritmo "conversa")
                    └─ paraNumeroWhats()      "(11) 98888-7777" → "5511988887777"
                       └─ POST /message/sendText/{instancia}   (uma por bolha, em ordem,
                          com `delay` = o "digitando…" daquela bolha)

agente desiste   →  canal.escalar(t, { telefone, motivo })
                    └─ POST /message/sendText/{instancia}  → número do DONO, com link wa.me
```

## Dois tokens existem, e misturá-los é o erro de estreia

| Token | Onde nasce | Para quê |
|---|---|---|
| **global** | `AUTHENTICATION_API_KEY` do servidor | criar/apagar instância |
| **da instância** | o `hash` que volta do `POST /instance/create` | **mandar mensagem — é o que vai em `EVOLUTION_API_KEY`** |

O global também mandaria mensagem, e é por isso que ele não deve ser usado: um vazamento
passaria de "mandaram mensagem pelo número do negócio" para "apagaram todas as instâncias
do servidor".

## Decisões que não são óbvias

- **Sequencial, nunca `Promise.all`.** Em paralelo a bolha curta chega antes da longa, e
  resposta fora de ordem no WhatsApp lê como bot quebrado — exatamente o que as bolhas
  existem para evitar.
- **O "digitando…" é o `delay` do `sendText`**, executado dentro da Evolution: conferido no
  código da 2.3.7, ela manda a presença `composing`, espera o `delay`, manda `paused` e só
  então envia. Uma chamada por bolha. `sinalizarDigitando()` (`/chat/sendPresence`) existe
  no cliente para quem quiser a presença solta — o corpo dela é **plano**, não aninhado em
  `options` (a doc antiga mostrava aninhado e devolve 400: evolution-api#1107).
- **Retentativa só em `LimiteDoProvedor`, uma vez.** Aquele erro significa que a Evolution
  disse que não processou (429/502/503/504). Timeout e 500 passam direto: podem ter sido
  entregues, e mensagem duplicada no WhatsApp do cliente é um erro que ele **vê**.
- **Timeout não é transitório.** Ele é ambíguo (a mensagem pode ter saído), então vira
  `FalhaDoProvedor`. Classificá-lo como transitório faria o agente reenviar — ver
  `comoFrase` em `entrada/whatsapp/ferramentas.ts`, que chama a ferramenta de novo.
- **`linkPreview: false` sempre.** A prévia obriga a Evolution a baixar a URL (atraso) e
  a única URL que aparece num agendamento é o Meet, cuja prévia é uma caixa cinza.
- **Só o evento `MESSAGES_UPSERT` é assinado.** Assinar tudo traria recibo de entrega,
  presença e "digitando" do cliente — dezenas de POST por conversa, todos descartados,
  cada um uma invocação paga.

## O ritmo (27/10/2026)

Pela Evolution, a MAISA é um WhatsApp Web não oficial, e o WhatsApp derruba número assim
por volume e por padrão de robô. Até aqui a primeira bolha saía sem "digitando…" e as
seguintes a ~10 palavras por segundo. Agora o canal tem três ritmos, um por quem manda, e
`composicao.ts` monta uma instância do canal para cada:

| Ritmo | Quem usa | "Digitando…" por bolha | Entre duas pessoas do mesmo número |
|---|---|---|---|
| `conversa` | o agente | 95–130 ms por caractere (≈ 1,3–1,8 palavra/s, sorteado a cada bolha), mín. 1,4 s, máx. 10 s, **até 18 s por resposta**; 0,4–1,1 s de pausa entre bolhas | — |
| `rotina` | o lembrete | o mesmo cálculo, máx. 4 s (o texto é pronto) | **3 a 7 s**, sorteado |
| `direto` | a resposta do dono no painel, os avisos ao dono, os recibos | a primeira bolha na hora; as outras 0,4–2 s, como era | — |

Os números:

- **Por que ~1,5 palavra/s, e não a velocidade de gente no celular (~0,6).** Uma resposta de
  três bolhas levaria mais de um minuto: o cliente desiste antes, e a função da Vercel tem
  teto de 60 s. Não há evidência pública de que o WhatsApp meça velocidade de digitação; o
  que tira a cara de robô é o "digitando…" existir, durar conforme o tamanho e variar.
  Numa resposta típica ("Tenho sexta às 15h e às 16h30 com o Rafael." + "Qual fica melhor
  pra você?"), são ~5 s e ~3 s.
- **O teto de 18 s entra na conta do agente.** `ORCAMENTO_DO_TURNO_MS`, em
  `entrada/whatsapp/agente.ts`, reserva esse tempo dentro dos 60 s. Subir um sem rever o
  outro é turno cortado no meio da segunda bolha.
- **E ainda há uma rede.** O canal recebe de `composicao.ts` o prazo da execução
  (`getDeadline()`, do `@vercel/functions`) e, se o turno pensou demais, encolhe o
  "digitando…" para caber (`caberNoPrazo`). Fora da Vercel o prazo não existe e valem os tetos.
- **A vez de cada pessoa é por processo.** O ritmo `rotina` lembra a última mensagem de cada
  instância na memória do processo; vale dentro de uma execução da rotina, que manda em
  série, e é onde a rajada de lembretes acontece. A rotina, por sua vez, para de enviar aos
  40 s e devolve o resto para a fila (`TEMPO_DA_RODADA_MS`, em `aplicacao/lembretes.ts`).
- **⚠️ O lote de recibos ainda sai colado.** Fechar o mês com "avisar pacientes" manda um
  aviso por paciente em sequência, sem espaço (ritmo `direto`), dentro de uma requisição do
  painel. Espaçar ali estoura o tempo da requisição; o certo é uma fila, e é uma fatia própria.

Na criação da instância (`criarInstancia`), os ajustes vão explícitos: `groupsIgnore: true`
(grupo nem chega ao webhook), `alwaysOnline: false` (gente não fica online 24 horas) e
`readMessages: false` (o tique azul é da MAISA, só na conversa que ela atende; marcar tudo
apagaria do celular do dono o "não lida" das conversas pessoais dele). Instância que já
existe não muda: ajuste pelo manager da Evolution, ou `POST /settings/set/{instancia}`.

## Ligar isso na prática

Precisa de uma URL pública: a Evolution roda em outro servidor e não alcança
`localhost`. Em desenvolvimento, um túnel (`cloudflared tunnel --url http://localhost:3100`)
resolve.

```bash
# 1. o que está configurado, e a instância está pareada?
curl -H "apikey: $WHATSAPP_WEBHOOK_SECRET" https://SEU-APP/api/whatsapp/conexao

# 2. apontar o webhook da instância para o app (idempotente)
curl -X POST -H "apikey: $WHATSAPP_WEBHOOK_SECRET" https://SEU-APP/api/whatsapp/conexao

# 3. conversar sem WhatsApp nenhum, para afinar o tom
curl -X POST https://SEU-APP/api/whatsapp \
  -H "apikey: $WHATSAPP_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"de":"5511988887777","texto":"tem horário amanhã de tarde?"}'
```

`conexao` responde `conectado: true` só quando o estado é `open`. `connecting` e `close`
significam pareamento pendente — e isso é um humano com o celular na mão, não código.

## Parear: QR ou código de 8 caracteres

`criarInstancia` devolve `{ qrcode, codigo }`. O `codigo` só vem quando se passa `numero`, e é
o "Conectar com número de telefone" do WhatsApp — **o caminho de quem está no próprio celular**,
onde o QR é impossível de ler porque a câmera não fotografa a tela do mesmo aparelho.

São **duas chamadas em cascata**, e a segunda não é redundância:

1. `POST /instance/create` com `number` no corpo. Funciona em algumas versões da Evolution e é
   ignorado em outras, que devolvem o QR e `pairingCode` ausente.
2. `GET /instance/connect/{instancia}?number=` — o endpoint documentado do recurso. Só roda
   quando a primeira não trouxe o código, e é **silencioso em qualquer falha**: quem chamou já
   tem um QR válido na mão, e transformar "não consegui o código" em exceção destruiria um
   pareamento que ia funcionar pelo outro caminho.

⚠️ **`qrcode: true` continua no corpo mesmo quando se pede código.** O pairing code depende da
versão do Baileys do servidor e falha calado (vem `null`). O QR do mesmo corpo é a rede de
segurança — e é o que a tela oferece como "prefiro ler o QR". Pedir os dois custa uma chamada
só; pedir só o código e receber `null` deixaria o dono sem caminho nenhum.

⚠️ **O código também vence, e vence mais rápido que o QR** (~1 min). É por isso que `conectar`
apaga e recria a instância em qualquer estado que não seja `open`: código velho é pior que QR
velho, porque o dono digita oito caracteres à mão para o WhatsApp dizer que estão errados.

## Env vars

Ver [`.env.local.example`](../../../../.env.local.example), seção do WhatsApp. As três
obrigatórias são `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCIA`;
`MAISA_WHATSAPP_DONO` é opcional e é quem recebe a escalação.
