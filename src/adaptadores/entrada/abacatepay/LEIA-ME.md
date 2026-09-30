# `entrada/abacatepay/` — o webhook da AbacatePay

Adaptador de **entrada**: o provedor de pagamento fala, isto vira vocabulário da MAISA.
Irmão de [`entrada/stripe/`](../stripe/) — mesmo problema (um POST sem cookie), e
**respostas diferentes em quatro pontos**. É essa a parte que importa deste documento.

A rota é [`app/api/abacatepay/webhook/route.ts`](../../../app/api/abacatepay/webhook/route.ts),
e ela é fina: confere, resolve, chama. Tudo que decide alguma coisa está em `eventos.ts`.

## ★ O pré-pago (29/09/2026): `checkout.completed`, COM releitura na fonte

Desde 29/09/2026 a cobrança padrão é o pré-pago — um Pix avulso por mês (ver o topo de
`saida/abacatepay/LEIA-ME.md`). O evento que importa passa a ser `checkout.completed`, e ele
tem o que a assinatura não tinha: **`GET /checkouts/get?id=`**. Então esse caminho faz o
desenho da Stripe:

1. do corpo sai **só o `bill_…`**;
2. o checkout é **relido na API com a nossa chave** — status, valor e `externalId`;
3. `status !== "PAID"` na fonte → 200 e nada acontece, diga o evento o que disser;
4. o inquilino sai do **carimbo relido** (`saida/abacatepay/carimbo.ts`), nunca do corpo;
5. `registrarPagamentoAvulso` soma um mês, com o `bill_…` como chave de idempotência —
   sete reentregas não viram sete meses.

Um `webhookSecret` vazado de um log não inventa pagamento por aqui: o id tem de ser de um
checkout da nossa loja, e pago.

⚠️ **O webhook de produção precisa escutar `checkout.completed`.** O `npm run abacate:catalogo`
confere e, com `--aplicar`, cria um segundo webhook para o que faltar (a API não tem update).

> Em 23/09/2026 a AbacatePay passou a documentar também `GET /v2/subscriptions/get` (por `id`,
> `externalId` ou `customerId`) — medido em 29/09: a rota existe. **A seção 2 abaixo ("não
> existe releitura na fonte") está vencida para assinatura também.** O caminho recorrente não
> foi reescrito porque nenhuma assinatura nasceu ainda para medir o formato; reescrever antes
> de ligar o recorrente.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `eventos.ts` | `verificar` (segredo + HMAC), `ehRelevante`, `pistasDeDono`, `assinaturaDoEvento` · ★ pré-pago: `ehPagamentoAvulso`, `idDoPagamentoAvulso`, `lerPagamentoAvulso` (a releitura) |

---

## ⚠️ 1. O HMAC NÃO AUTENTICA NADA

**É o erro mais fácil de cometer nesta integração**, porque o mecanismo tem o nome certo e
a forma certa.

A AbacatePay assina cada POST em `X-Webhook-Signature`, HMAC-SHA256 sobre o corpo cru, em
base64. Igualzinho à Stripe. **Só que a chave do HMAC é uma constante pública, publicada
na documentação deles** — a mesma string para todas as lojas do mundo, em
`docs.abacatepay.com/pages/webhooks/security`.

> Qualquer pessoa consegue produzir uma assinatura válida. A chave está na internet.

Um HMAC de chave pública prova **integridade em trânsito** e nada mais — é um checksum,
não uma credencial. Quem tratar essa conferência como autenticação (como se trata o
`whsec_…` da Stripe, que é privado por endpoint) deixa o webhook de pagamento aberto para
quem souber a URL: um POST forjado com `subscription.completed` e o produto liberado de
graça.

**Quem autentica é `?webhookSecret=…`** — o valor que nós escolhemos ao cadastrar o
endpoint, que só nós e eles conhecemos. `verificar()` confere o segredo **primeiro**, e é
ele que decide.

### E isso traz um problema próprio: segredo em URL vaza para log

Query string entra em log de acesso, em relatório de plataforma e no `Referer` de
qualquer redirecionamento. **Não há como mudar onde eles o põem.** O que dá para fazer, e
está feito:

- segredo longo e aleatório — `openssl rand -hex 32`, nunca uma palavra;
- comparação em tempo constante, para a resposta não vazar o prefixo correto;
- conferir o HMAC **também**, porque integridade continua valendo e custa um hash;
- **rotacionar** se algum log for exposto — é uma linha no painel deles.

---

## ⚠️ 2. Não existe releitura na fonte

`entrada/stripe/eventos.ts` ignora o corpo do evento e relê a assinatura na API. É o que
torna ordem de chegada irrelevante e reentrega inofensiva, **de graça**, sem tabela
nenhuma. O desenho depende de existir um `GET` por id.

**A AbacatePay não tem esse `GET`.** Existe `GET /subscriptions/list`, que devolve
*checkouts* de assinatura, e a página de referência cita um `GET /subscriptions/get` que
não aparece como endpoint em lugar nenhum da documentação.

Sem releitura, três garantias passam a ser nossas:

| Garantia | Como |
|---|---|
| **idempotência** | tabela `cobranca_eventos` (migração 028), pelo `id` do evento |
| **ordem** | não há solução completa — ver o buraco conhecido no fim |
| **completude** | o que não vier no payload, não sabemos |

Reentrega: até **7 tentativas em ~18h** (5s, 5min, 30min, 2h, 5h, 10h), todas com o mesmo
`id`. A documentação deles diz, literalmente, "idempotência é obrigatória".

⚠️ **`registrarEvento` é chamado DEPOIS de gravar a assinatura.** Marcar antes e falhar no
meio deixa o evento como processado com a assinatura no estado antigo — e a reentrega, que
existe exatamente para salvar esse caso, passa a ser descartada. O pagamento se perde para
sempre.

---

## ⚠️ 3. O inquilino vem do `customer.id` que gravamos na ida

Na Stripe o inquilino viaja dentro do evento (`metadata.tenant_id`). Aqui **nenhum payload
de evento de assinatura traz `metadata`**, e `checkout.externalId` vem `null` em todos os
exemplos publicados — mesmo tendo sido enviado na criação.

A cadeia, nesta ordem:

1. `data.checkout.externalId` — o nosso carimbo, **se** um dia eles passarem a devolvê-lo
2. `data.customer.id` → reverso por `provedor_cliente_id` na nossa tabela
3. `data.subscription.id` → reverso por `provedor_assinatura_id`

O passo 3 não é redundância: **`subscription.payment_failed` chega sem `customer` e sem
`checkout`** — só `subscription`, `installmentId` e `retryNumber`. É o evento que avisa que
alguém parou de pagar, e sem o passo 3 ele seria descartado por falta de dono.

É por isso que `criarAbrirCheckout` grava o `cust_…` **antes** de qualquer pagamento. Sem
esse passo, a primeira venda de todo inquilino entra sem dono.

Sem nenhuma das três, responde 200, registra o evento com `tenant_id: null` e ignora.
Pagamento de quem não é nosso acontece de verdade em conta compartilhada.

---

## ⚠️ 4. `periodoFim` é calculado por nós

O objeto de assinatura deles **não tem campo de fim de período**. Nenhum — a busca por
`nextBilling`, `periodEnd`, `currentPeriod` e `nextPayment` na documentação inteira não
retorna nada. Há `frequency` (`MONTHLY`…) e as datas de criação/atualização.

O "próxima cobrança" da tela sai de `updatedAt + diasDoCiclo(frequency)`, com mês
aproximado por 30 dias. É aproximado e está documentado como aproximado em `diasDoCiclo`.
A alternativa seria a tela mostrar "—" para toda assinatura ativa, que parece defeito.

Base é `updatedAt` e não `createdAt`: numa renovação, `updatedAt` é a data do pagamento que
acabou de entrar. Com `createdAt`, a tela mostraria para sempre a segunda cobrança de uma
assinatura de dois anos.

---

## O status não conta a inadimplência

O objeto `subscription` tem dois estados de vida: `ACTIVE` e `CANCELLED`. E em
`subscription.payment_failed` ele vem **`ACTIVE`** — a cobrança falhou, o dinheiro não
entrou, e o campo diz "ativa".

Por isso `statusDaAbacatePay` recebe o **evento**, não só o status, e o evento é conferido
primeiro. Quem traduzir só o campo libera o produto para quem parou de pagar, sem erro em
lugar nenhum. Há teste para isso em `dominio/assinatura.test.ts`, e é o que mais importa
daquele arquivo.

## Eventos que escutamos

| Evento | O que faz aqui |
|---|---|
| `subscription.completed` | assinatura ativada — a venda |
| `subscription.renewed` | renovação paga; recalcula `periodoFim` |
| `subscription.payment_failed` | → `inadimplente`. **Único evento sem `customer`** |
| `subscription.cancelled` | → `cancelada`, imediata |
| `subscription.trial_started` | → `trial` |
| `subscription.plan_changed` | troca de plano |

O resto (`payout.*`, `transfer.*`, `checkout.*`, `transparent.*`) responde 200 e é
ignorado.

## Testar localmente

A CLI deles faz o papel do `stripe listen`:

```bash
abacatepay -l login                                   # -l = dev mode
abacatepay -l listen --forward-to http://localhost:3100/api/abacatepay/webhook
```

⚠️ **O `listen` não põe o `?webhookSecret=` na URL.** Ele encaminha o POST para o caminho
que você deu — então inclua o segredo no `--forward-to`:

```bash
abacatepay -l listen \
  --forward-to "http://localhost:3100/api/abacatepay/webhook?webhookSecret=$ABACATEPAY_WEBHOOK_SECRET"
```

Sem isso, todo evento local volta **401** e parece segredo errado.

> ⚠️ A documentação da CLI mostra um `abacatepay verify --secret whsec_… --signature
> "t=…,v1=…"`, que é o formato da **Stripe** e não bate com o `X-Webhook-Signature`
> base64 descrito na página de webhooks. Um dos dois documentos está velho. Se o `verify`
> da CLI discordar deste código, **acredite no header que chegar de verdade** e corrija
> aqui.

## Buraco conhecido: ordem de entrega

Não há solução completa sem o `GET` por id, e está registrado em vez de escondido.

Se `renewed` (de ontem) chegar **depois** de `payment_failed` (de hoje) — o que a
reentrega de 18h torna possível — o último a gravar vence, e a linha fica `ativa` quando
devia estar `inadimplente`. A janela é estreita e o custo é um mês de acesso indevido, não
um vazamento permanente: o próximo evento corrige.

O conserto de verdade é comparar `updatedAt` do payload com o que está gravado e descartar
o mais velho. Exige uma coluna nova (`provedor_atualizado_em`) e não foi feito — **não
faça sem medir primeiro se isso acontece**, porque a alternativa tem o modo de falha
oposto e pior: descartar evento legítimo cuja data o provedor não mexeu.
