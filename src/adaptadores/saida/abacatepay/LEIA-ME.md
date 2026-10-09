# `saida/abacatepay/` — AbacatePay (checkout de assinatura com Pix)

Cumpre `Cobranca`. **⚠️ Só servidor** — nenhuma chave chega ao navegador.

O lado que RECEBE (webhook) é [`adaptadores/entrada/abacatepay/`](../../entrada/abacatepay/).
Os dois compartilham `config.ts` de propósito: duplicar o segredo criaria duas
configurações capazes de divergir, e o sintoma seria o webhook recusando 100% dos eventos
enquanto o checkout cobra normalmente.

## ★ Hoje ela cobra no PRÉ-PAGO — um Pix por mês (29/09/2026)

A loja foi aprovada para produção em 29/09/2026 e **a recorrência continua bloqueada nos dois
trilhos**, medido na conta de produção depois de o fundador deles ativar o cartão:

| Chamada (produção, 29/09) | Resultado |
|---|---|
| `subscriptions/create` `["PIX"]` | ❌ `PIX Automático is not available for this store` |
| `subscriptions/create` `["CARD"]` | ❌ `CARD is not available for this store` |
| `checkouts/create` `["PIX"]` com produto **com** `cycle` | ❌ a mesma recusa do Pix Automático |
| `checkouts/create` `["PIX"]` com produto **sem** `cycle` | ✅ `bill_…`, `frequency: ONE_TIME` |
| `transparents/create` Pix de R$ 1 | ✅ **pago** — a primeira transação real da loja |

**09/10/2026, cartão avulso:** `checkouts/create` `["CARD"]` com produto **sem** `cycle` voltou
❌ `CARD is not available for this store` (loja de teste; em 29/09 teste e produção recusaram igual).
O código já tem o caminho (`abrirCartao` em `cobranca-avulsa.ts`: um mês no cartão, na página
deles, somado pelo mesmo `checkout.completed`), e ele só abre com `ABACATEPAY_METODOS=PIX,CARD`
na Vercel. Pôr `CARD` ali **antes** de a loja aceitar mostra uma aba que quebra no clique: confira
com `checkouts/create` `["CARD"]` primeiro.

Então o padrão virou o **pré-pago** (`ABACATEPAY_COBRANCA=avulsa`, que é o default):
`cobranca-avulsa.ts` cria um **Pix transparente** do mês e manda a pessoa para a NOSSA tela,
`/pagar`, que desenha o QR Code e o copia-e-cola (desde 30/09/2026 — ver abaixo); o webhook
`transparent.completed` soma um mês (`creditarUmMes`, no domínio), a rotina diária manda o aviso de vencimento por e-mail, e o
webhook do WhatsApp deixa a MAISA em silêncio quando o mês acaba. Nada disso precisou de
migração: o fim do mês é o `periodo_fim` que já existia.

`cobranca-abacatepay.ts` (o recorrente) continua aqui, inteiro, para o dia em que a sonda
passar. Trocar é `ABACATEPAY_COBRANCA=assinatura` + redeploy.

### ★ Por que o Pix é desenhado por nós, e não pela página deles (30/09/2026)

No primeiro dia o pré-pago mandava para `app.abacatepay.com/pay/bill_…`. A captura de tela
dessa página mostrou **três etapas depois do nosso cadastro**: nome, CPF, e-mail e telefone
(os dois últimos pela segunda vez), depois **endereço**, e só então o Pix. Doze campos em dois
sites. O Pix transparente (`/transparents/create`) pede **só o valor** e devolve `brCode` e
`brCodeBase64`. Medido em produção:

| | Página hospedada (`checkouts/create`) | Pix transparente (`transparents/create`) |
|---|---|---|
| Campos que a pessoa preenche lá | nome, CPF, e-mail, telefone, endereço | **nenhum** |
| Taxa por Pix pago | R$ 1,00 (`platformFee: 100`) | **R$ 0,80** (`platformFee: 80`) |
| Onde vai o carimbo | `externalId` | `metadata.carimbo` — volta intacto em `GET /transparents/get` |
| Releitura na fonte | `GET /checkouts/get` | `GET /transparents/get` |

O preço do Pix vem do **produto avulso** do plano (`products/get?externalId=`), não de um
número digitado aqui — o valor cobrado continua morando no provedor, e o `abacate:catalogo`
confere que ele bate com `_lib/planos.ts`. O webhook aceita os dois eventos.

⚠️ **O recebedor que o banco mostra é "POLI JUNIOR"**, o titular da conta. A tela `/pagar`
avisa antes, porque a pessoa espera ler "maisa" e desiste achando que é golpe.

⚠️ **O Pix transparente não tem idempotência por `externalId`.** Dois cliques criam dois Pix.
Quem segura é a trava síncrona do botão; se os dois forem pagos, são dois meses — a favor do
cliente, e sem estorno necessário.

### ⚠️ As três coisas medidas que desenharam o pré-pago

1. **O `externalId` do checkout é CHAVE DE IDEMPOTÊNCIA.** Dois `checkouts/create` com o mesmo
   `externalId` devolveram **o mesmo** `bill_…`. Ótimo contra clique duplo, e uma armadilha com
   carimbo fixo: o mês seguinte devolveria o checkout já pago. Por isso o carimbo tem a data
   (`carimbo.ts`), e por isso `abrirCheckout` pula para o carimbo seguinte quando o do dia volta
   pago ou expirado.
2. **`/products/list` sem parâmetro mente logo depois de criar.** Voltou lista vazia por minutos
   depois do `--aplicar`, com os produtos lá. `products/get?externalId=` acha na hora — é o que
   `cobranca-avulsa.ts` usa. (O `idDoProduto` do recorrente ainda usa `list`; trocar antes de
   ligar o recorrente.)
3. **Produto com `cycle` não serve para checkout avulso.** A loja entende como recorrência e
   recusa com a mensagem do Pix Automático, que não fala de produto. Daí o segundo catálogo:

| Plano | `externalId` avulso | Preço (centavos) | `prod_…` em produção |
|---|---|---|---|
| Essencial | `maisa-essencial-avulso` | `12700` | (criado pelo `--aplicar`) |
| Profissional | `maisa-profissional-avulso` | `19700` | `prod_mtQxtCmu1chYxkJMkMwXYp6M` |
| Escala | `maisa-escala-avulso` | `39700` | (criado pelo `--aplicar`) |

A taxa medida é **R$ 1,00 por checkout pago por Pix** (`platformFee: 100`) e R$ 0,80 no Pix
transparente (`platformFee: 80`) — não os R$ 0,80 da página comercial para os dois.

## Por que ela existe, se já havia Stripe

Porque **a Stripe não faz Pix recorrente em conta brasileira.** Está medido e escrito em
[`saida/stripe/LEIA-ME.md`](../stripe/LEIA-ME.md): assinatura em conta BR é cartão
(Visa/Mastercard — Elo, Hipercard e Amex ficam de fora) ou boleto.

Num produto de R$ 127/mês vendido no Brasil isso custa duas vezes:

| | Stripe (cartão) | AbacatePay (Pix) |
|---|---|---|
| Taxa por cobrança | percentual + fixo | **R$ 0,80 por parcela** |
| Em R$ 127 | ~R$ 5,4 | R$ 0,80 |
| Em R$ 197 | ~R$ 8,2 | R$ 0,80 |
| Elo / Hipercard | não | cartão: 3,5% + R$ 0,60 |

E custa na conversão, que é o lado que não aparece em planilha: Pix é como o país paga.

> Os números de taxa vêm da página comercial deles e **não estão medidos contra a conta
> real**. Confirmar no extrato da primeira cobrança antes de usar em proposta.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `config.ts` | As env vars, o `CATALOGO` (plano → `externalId`), `METODOS` e `mundo`. ⚠️ **Id de produto não é env var** — leia o cabeçalho antes de "simplificar" |
| `cliente.ts` | `fetch` à mão, com retry, teto de 8s e o desembrulho do envelope. ⚠️ **erro vem com HTTP 200** |
| `cobranca-abacatepay.ts` | O modo RECORRENTE: `abrirCheckout`, `cancelar`, `capacidades`. Resolve `externalId → prod_…` com cache de processo |
| `cobranca-avulsa.ts` | ★ O PRÉ-PAGO (padrão desde 29/09/2026): Pix transparente de um mês, desenhado em `/pagar` (30/09); `lerPagamento` relê e confere o carimbo; sem cancelar nem portal |
| `carimbo.ts` | O `externalId` do checkout avulso — `maisa:<tenant>:<plano>:<dia>` — e a leitura de volta, que o webhook usa depois de reler na fonte |

## ⚠️ As cinco armadilhas desta API

Nenhuma é hipótese — todas saem da documentação lida em 21/09/2026.

1. **Erro chega com HTTP 200.** Toda resposta é `{ data, error, success }`. Dá para
   receber 200 com `{ data: null, error: "…" }`. Quem escrever `const { data } =
   await r.json()` e seguir recebe `undefined`, a tela manda o navegador para
   `about:blank#undefined`, e quem ia pagar R$ 197 vê uma página branca. Sem log.
   → resolvido em `chamar()`, que lança em vez de devolver algo ignorável.

2. **⚠️ Teste e produção atendem no MESMO endpoint.** Não há URL de sandbox; quem separa
   é o prefixo da chave. Uma chave de teste em produção **funciona**: responde 200, desenha
   um QR Code bonito e não cobra ninguém. O produto parece vendido e não entrou dinheiro.
   → `mundo` existe por isso, e `composicao.ts` grita no boot. ⚠️ O prefixo real é
   `abc_dev_` / `abc_prod_`, **não** o `dev_`/`prod_` que a documentação descreve.

3. **Valores em centavos.** `10000` = R$ 100,00. Mandar reais cobra 100× menos.

4. **Cliente é único por CPF/CNPJ, não por e-mail.** A documentação promete deduplicação
   por `taxId` — e nós **não temos** o CPF/CNPJ neste ponto do funil (`/assinar/<plano>`
   pede três campos, e documento não é um deles). Sem `taxId`, dois cliques criam duas
   fichas. → o que impede é a nossa tabela: o `cust_…` é gravado na ida.

5. **A idempotência não é documentada, mas existe — e é o `externalId`.** Medido em
   29/09/2026 no checkout avulso: o mesmo `externalId` devolve o mesmo checkout. No
   recorrente o carimbo é o `tenantId` puro, então dois cliques dão no mesmo checkout de
   assinatura também (não medido lá). No avulso, ver o ★ do topo: o carimbo tem data.

## O catálogo — o contrato com a conta da AbacatePay

O código procura o produto por `externalId`, pelo mesmo desenho da `lookup_key` da Stripe.
Estes três têm que existir na conta da chave que está sendo usada, **`ACTIVE`**, com
`cycle: "MONTHLY"` e `currency: "BRL"`:

| Plano | `externalId` | Preço (centavos) | `prod_…` no sandbox |
|---|---|---|---|
| Essencial | `maisa-essencial-mensal` | `12700` | `prod_qFUThL3xAF6nFuxYSC0mbCs0` |
| Profissional | `maisa-profissional-mensal` | `19700` | `prod_uKa33aw6FSeJLxBqJ6bwqCQa` |
| Escala | `maisa-escala-mensal` | `39700` | `prod_Z6433z52fHE6Wq2rY41CUPHn` |

Os três foram criados em 21/09/2026 e conferidos com `cycle: MONTHLY` e `status: ACTIVE`.
Os ids acima são **do sandbox** e não valem em produção — o código nunca os digita, procura
por `externalId`.

Quem cria é `npm run abacate:catalogo` — idempotente, roda quantas vezes quiser.

**O valor exibido continua sendo o de [`_lib/planos.ts`](../../../app/\(marketing\)/_lib/planos.ts).**
Os dois têm que bater, e é `planos.test.ts` que cobra — a AbacatePay não sabe o que a
landing page promete.

⚠️ **Produto sem `cycle` não serve para assinatura**, e o erro deles não diz isso com
clareza. `idDoProduto` confere e lança uma mensagem que diz.

## Permissões da chave de API

O painel deles permite escopo por recurso. Dê só o que esta integração usa:

`CHECKOUT:CREATE` · `CHECKOUT:READ` · `CUSTOMER:CREATE` · `CUSTOMER:READ` ·
`PRODUCT:CREATE` · `PRODUCT:READ` · `SUBSCRIPTION:CREATE` · `SUBSCRIPTION:DELETE`

⚠️ **NÃO dê `WITHDRAW:CREATE`.** Saque manda dinheiro para fora da conta e nada neste
código saca. Uma chave que não saca é uma chave que não esvazia a conta se vazar.

Falta de permissão chega como **403**, não 401 — e confundir os dois começa com alguém
rotacionando a chave à toa. `erroDeHttp` separa os dois na mensagem.

## O que a AbacatePay NÃO faz

- **Não tem Billing Portal.** Nenhuma página hospedada onde a pessoa troque método, baixe
  fatura ou cancele sozinha. `abrirPortal` lança `NaoSuportado`; quem cumpre o "cancele
  quando quiser" da LP é `cancelar()`, e a tela pergunta `capacidades().portal` antes de
  desenhar o botão.
- **Cancelamento é imediato e irreversível.** `cancelPolicy: NOW`, sem carência — o
  cliente perde o acesso na hora. Diferente da Stripe, onde o portal cancela ao fim do
  período já pago. **A tela tem que confirmar antes.**
- **Não tem `GET` por id de assinatura.** Existe `/subscriptions/list`, que devolve
  *checkouts*. Isso derruba o padrão "releia na fonte" que o webhook da Stripe usa — ver
  o `LEIA-ME.md` de `entrada/abacatepay/`.
- **Não informa fim de período.** Nenhum campo de próxima cobrança no objeto de
  assinatura. Calculamos de `frequency` + data do último pagamento.

## ★ O que foi MEDIDO na conta (21/09/2026)

Loja de sandbox `store_rcqED0KYAxkmcp4Aqn4cH6Wf` ("Maisa"), chave `abc_dev_…`:

| Chamada | Resultado |
|---|---|
| `subscriptions/create` `methods:["PIX","CARD"]` | ❌ `PIX Automático is not available for this store` |
| `subscriptions/create` `methods:["PIX"]` | ❌ mesma recusa |
| `subscriptions/create` `methods:["CARD"]` | ❌ `CARD is not available for this store` |
| `transparents/create` PIX (QR direto) | ✅ devolveu `brCode`, `devMode: true` |
| `checkouts/create` PIX em produto **sem** `cycle` | ✅ abriu a página de pagamento |

**Leitura:** Pix **avulso** funciona. **Recorrência está bloqueada nos dois trilhos** — nem
Pix Automático nem cartão. É capacidade de CONTA, não defeito de código, e só o suporte
deles liga.

### ⚠️ `methods` é CONJUNÇÃO, não preferência

Foi a suposição errada que este documento carregava até ser medido. A versão anterior
dizia "mandar os dois degrada para cartão se o Pix não estiver ligado". **É falso:** a API
recusa o pedido inteiro se QUALQUER método da lista faltar na loja. Mandar os dois não é a
opção segura — é falhar por dois motivos em vez de um.

Por isso `METODOS` virou `ABACATEPAY_METODOS`, padrão `PIX`. Só acrescente `CARD` depois
que o cartão estiver habilitado, senão o checkout inteiro para.

O erro tem classe própria (`NaoSuportado` → HTTP 501) com a mensagem dizendo o que fazer —
um 502 genérico mandaria quem investiga procurar rede, chave e timeout por horas.

### Como isso se resolve, e como saber que resolveu

A recorrência é capacidade de **conta**, e a conta de sandbox nasce sem ela. O caminho é
completar a verificação no painel (dados da empresa, sócios, comprovante) — é o mesmo
processo de "ir para produção", e vale para os dois mundos.

⚠️ **Cartão pode não abrir nem com a conta verificada.** A página comercial deles diz que
o cartão é "liberado mediante consulta, conforme disponibilidade da conta", e em 2026 o
fundador anunciou publicamente que o cartão está **pausado para novos entrantes** (quem já
tinha continua). Ou seja: Pix Automático é o caminho realista; cartão é bônus.

**Não adivinhe — sonde:**

```
npm run abacate:catalogo -- --sondar
```

Ele tenta criar um checkout de assinatura com cada método e imprime o que passou. É a
única forma de saber: **não existe endpoint que responda "esta loja tem Pix Automático?"**.
Depois, ponha em `ABACATEPAY_METODOS` exatamente o que passou.

### ⚠️ Não ponha a chave na Vercel antes de a sonda passar

Em `composicao.ts`, a presença de `ABACATEPAY_API_KEY` é o que faz a AbacatePay ganhar da
Stripe. Se a chave existir em produção enquanto a recorrência estiver bloqueada, **todo
clique em "assinar" vira erro** — a Stripe, que funciona, deixa de ser usada.

Enquanto a sonda não passar, a chave vive só no `.env.local`. É por isso que não há
interruptor separado: a própria env var é o interruptor, e ela ainda não foi para lá.

## ⚠️ Outras coisas medidas no mesmo dia

- **O prefixo real da chave é `abc_dev_`**, não `dev_` como a documentação diz. O código
  procura o segmento `_dev_`/`_prod_` e tem um terceiro estado (`desconhecido`) que grita
  no boot — adivinhar foi o que errou da primeira vez.
- **Eles validam dígito verificador de CPF.** `taxId: "12345678909"` volta
  `Invalid taxId`; `11144477735` passa.
- **`products/delete` quer o id na QUERY STRING**, não no corpo — com `id` no corpo devolve
  `Expected property 'id' to be string but found: undefined`. E exige `PRODUCT:DELETE`, que
  não está no escopo mínimo desta integração de propósito.
- **O erro vem mesmo com HTTP 200.** Confirmado na prática, não só na documentação.

## Os dois modos

| Situação | Resultado |
|---|---|
| sem `ABACATEPAY_API_KEY` | `composicao.ts` cai na Stripe, ou em `cobrancaDemo` se ela também faltar |
| com chave `dev_` | checkout real, pagamento **simulado**. O boot avisa |
| com chave `prod_` | cobra de verdade |
