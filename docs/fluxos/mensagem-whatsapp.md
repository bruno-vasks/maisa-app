# Fluxo — uma mensagem de WhatsApp, de ponta a ponta

Do "oi, tem horário quinta?" até a resposta chegando no celular do cliente. É o fluxo mais
importante do produto e o que tem mais armadilhas.

## O caminho

```
cliente no WhatsApp
 └─ Evolution API → POST /api/whatsapp                    app/api/whatsapp/route.ts:59
    ├─ 1. o segredo confere?                              route.ts:60-79   → 401
    ├─ 2. normalizar o envelope                           route.ts:91      → contexto.ts
    │     descarta eco, grupo, @lid, recibo, figurinha    → 200 "ignorado"
    │     (áudio SEGUE, com `ouvir` = composicao.ouvirAudio)
    ├─ 3. de quem é esta linha?                           route.ts:105     → integracoes_whatsapp
    └─ 6. 200 AGORA; o agente roda depois (waitUntil)     route.ts:156-187 → whatsapp/agente.ts
       ├─ 0.  o que a MAISA sabe do negócio               agente.ts:356
       ├─ 1.  quem é o cliente (pelo telefone)            agente.ts:375
       ├─ 1a. áudio: só ouve quem ela vai atender         agente.ts:393  → senão grava "[áudio]"
       ├─ 1b. GRAVA a fala do cliente, uma vez por id     agente.ts:416  → reentrega para aqui
       │      escrita há mais de 15 min?                  agente.ts:446  → para aqui, sem responder
       ├─ 1b'. espera 4 s; só segue a última fala         agente.ts:454  → os outros calam
       ├─ 1c. a assistente está ligada?                   agente.ts:508
       ├─ 1d. o dono assumiu a conversa?                  agente.ts:516  → cala
       ├─ 1e. é da vida pessoal do dono?                  agente.ts:533  → cala
       ├─ 1f. a conversa virou laço? (disjuntor.ts)       agente.ts:559  → para e chama o dono
       ├─ 1g. tique azul                                  agente.ts:573
       ├─ 2.  o loop: modelo ↔ ferramentas                agente.ts:607  → 429: tenta de novo dentro de 50 s, depois chama o dono
       ├─ 2b. ela escolheu não responder?                 agente.ts:670  → termina sem mensagem, sem chamar o dono
       ├─ 3a. o cliente escreveu ou o dono assumiu?       agente.ts:693  → descarta, salvo se marcou/cancelou/chamou
       ├─ 3b. tentou marcar e não marcou?                 agente.ts:718  → descarta e chama o dono
       ├─ 3c. a mesma resposta de antes?                  agente.ts:775  → não sai
       └─ 4.  grava o que aconteceu                       agente.ts:788
          └─ canal.enviar() → saida/evolution/            "digitando…" em cada bolha, ~1,5 palavra/s
```

O passo 4 chama **os mesmos casos de uso do painel**. Marcar horário pelo WhatsApp e marcar
pelo navegador são a mesma função — esse era o teste da reorganização hexagonal, e ele passou.

## Os pontos que não são óbvios

### Responde 200 mesmo quando descarta

Para o provedor, resposta de erro significa "tente de novo", e ele reentrega o mesmo evento em
laço. Por isso todo descarte sai `200 {ok: true, ignorado: true}` com um motivo dentro
(`route.ts:100-143`). Até a falha interna sai **200** (`route.ts:180`, no formato de teste): reentregar não conserta
bug nosso, só multiplica.

### Responde 200 ANTES de responder ao cliente

Desde 27/10/2026, a conversa roda depois da resposta HTTP (`waitUntil`), dentro do teto da
rota (120 s, com Fluid compute). Conferido no código da Evolution 2.3.7: o webhook dela desiste em **30 s**
e reentrega o evento até 10 vezes, e não há deduplicação do nosso lado. Com o "digitando…" em
cada bolha, quase todo turno passaria de 30 s, e cada reentrega seria a conversa inteira de novo:
o cliente recebendo a resposta em dobro. Só o formato de teste (`curl`) espera o turno, para
devolver as bolhas no corpo.

### O que protege o número de ser derrubado

A Evolution é um WhatsApp Web não oficial. As travas (mensagem atrasada, disjuntor, resposta
repetida, fala inventada, tique azul, "digitando…", um aviso por cliente ao dono) estão
descritas em [`entrada/whatsapp/LEIA-ME.md`](../../src/adaptadores/entrada/whatsapp/LEIA-ME.md)
("Blindagem do número"), e o ritmo em [`saida/evolution/LEIA-ME.md`](../../src/adaptadores/saida/evolution/LEIA-ME.md).

### O que é descartado, e por quê

| Caso | Se não descartasse |
|---|---|
| `fromMe` (eco) | a Evolution devolve o que **nós** mandamos; a MAISA responderia a si mesma em laço |
| grupo / broadcast | ela responderia a cada participante — e o dono descobre pelo grupo da família |
| `@lid` sem telefone | cadastra cliente falso **e** a resposta não chega em ninguém |
| evento ≠ `messages.upsert` | recibo de leitura tem a mesma forma de uma mensagem |
| figurinha, localização, foto sem legenda | a MAISA não lê; o descarte sai com o tipo no log |
| áudio | **não é descartado desde 26/10/2026**: segue para o agente, que só o transcreve se for atender a pessoa (contato pessoal do dono não é ouvido). A fala entra como `[áudio] …`; se não der para ouvir, ela pede para a pessoa escrever |

O nome do evento é comparado numa forma canônica porque a Evolution é inconsistente: a
configuração usa `MESSAGES_UPSERT` e o corpo entregue traz `messages.upsert`.

E o texto **não vem num campo só** — há pelo menos cinco lugares onde ele pode estar
(mensagem simples, resposta a outra, mensagem temporária, legenda de foto, resposta de botão).
Ler só o primeiro funciona no teste e perde uma fatia grande da conversa real, sem erro nenhum
no log.

### De quem é esta mensagem

Vem da **instância** que recebeu (`route.ts:105` → `tenantPorDestino`), consultada em
`integracoes_whatsapp`. A instância é preenchida pelo servidor da Evolution, não por quem
escreveu a mensagem — é essa propriedade que importa: identidade tem que vir de algo que o
cliente não controla.

⚠️ **Falha de banco não cai para a variável de ambiente.** Seria trocar "não sei de quem é" por
"vou chutar o negócio do env", e o chute escreve na agenda de alguém. Descartar é reversível —
o cliente reenvia. Marcar no negócio errado não é.

### A fala do cliente é gravada antes de qualquer decisão

Passo 1b, e a ordem é o conteúdo. Quando a gravação era o último passo, **todo retorno
antecipado descartava a pergunta**: assistente desligada, recusa do provedor, e o pior — "tentou
marcar e não conseguiu". O efeito era exatamente o inverso do necessário: a conversa que mais
exigia o dono era a única invisível no painel dele.

### As três camadas de guardrail

| Camada | Recusa | Vale para o painel? |
|---|---|---|
| **núcleo** | o impossível: data inexistente, agenda de outro inquilino, duplicata | sim |
| **ferramenta** | o **alucinado**: horário que ninguém ofereceu, id inventado | não — humano não inventa id |
| **prompt** | mau comportamento: inventar preço, prometer desconto | não |

A camada de prompt é a mais fraca e **não vale como garantia**. Guardrail que mora só em prompt
é sugestão.

### O guardrail que impede a mentira

Passo 3b. Medido em conversa real: em ~1 de 3 tentativas o modelo consultava a agenda, recebia o
horário e **escrevia a confirmação sem chamar a ferramenta de marcar**. O turno terminava sem
chamada, o loop dava por encerrado, e "Pronto, agendado para amanhã às 09:00" seguia para o
cliente com a agenda vazia.

A defesa: tentou marcar, não marcou ⇒ a resposta é **descartada** e o dono assume.

### Idempotência sem colaboração do modelo

A chave do agendamento é **derivada** de (inquilino, telefone, serviço, dia, hora), não
sorteada. No painel o identificador nasce do clique, e clique é único; aqui não há clique — um
modelo que não recebeu a resposta da ferramenta tenta de novo, que é o comportamento normal
dele. Com valor aleatório a retentativa vira um segundo horário. Derivando, ela **encontra** o
primeiro. A proteção funciona sem o modelo cooperar, que é o único jeito de ela funcionar.

## Onde mexer

| Quero mudar | Mexo em |
|---|---|
| o que a MAISA fala | `whatsapp/persona.ts` (tom) — mas guardrail vai para código |
| as ferramentas dela | `whatsapp/ferramentas.ts` + `nucleo/portas/entrada/casos-de-uso.ts` |
| o formato das mensagens | `whatsapp/bolhas.ts` |
| o que é descartado | `whatsapp/contexto.ts` |
| trocar de provedor de modelo | uma linha em `src/composicao.ts` |
| trocar de canal (não-WhatsApp) | novo adaptador cumprindo `CanalDeMensagens` |

Detalhe: [`.../entrada/whatsapp/LEIA-ME.md`](../../src/adaptadores/entrada/whatsapp/LEIA-ME.md).
