# `saida/rebots` — a Rebots como canal de emissão do Receita Saúde

⚠️ **SÓ SERVIDOR.** A `master_key` emite documento fiscal no CPF das nossas clientes. Nenhuma
variável desta pasta tem prefixo `NEXT_PUBLIC_`, e nenhum arquivo daqui pode ser importado de
componente `"use client"`.

## O que é

Terceiro que automatiza a emissão do Recibo Eletrônico de Serviços de Saúde. **Não é API
oficial** — não existe uma: verificado na lista de serviços do Integra Contador, que tem 11
soluções e nenhuma de Carnê-Leão, IRPF ou Receita Saúde. É automação em cima do canal oficial,
assinando com certificado, sob procuração e-CAC.

### ★ A fonte da verdade é o OpenAPI, não a página comercial

<https://api.rebots.com.br/static/openapi.yaml> — 80 KB, versão 2.0.0. O Swagger em
`/receita-saude/v2/docs/` é só a casca dele. A página `rebots.com.br/documentacao-api` lista
**cinco** endpoints; o OpenAPI tem **nove**, e descreve formatos que ela não descreve.

Antes de mexer em qualquer coisa aqui, releia o OpenAPI. Foi a leitura dele + o sandbox que
achou os cinco defeitos consertados em 25/08/2026.

| O que | Onde |
|---|---|
| `config.ts` | env vars, `isRebotsConfigured`, `rebotsFaltando()`, `rebotsAvisos()` |
| `cliente.ts` | JWT com `master_key`, POST com segunda chance em 401 |
| `emissor-recibo.ts` | o adaptador de `EmissorDeReciboSaude` + `lerCallbackRebots` |

## Pode importar

`@/nucleo/portas/**`, `@/nucleo/dominio/**`, e os arquivos desta pasta. **Não pode** importar
outro adaptador — eles se encontram em `src/composicao.ts`.

## Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `REBOTS_IDENTIFICADOR` | sim | o CNPJ da conta. Viaja no corpo de toda chamada. **Não é segredo** |
| `REBOTS_MASTER_KEY` | sim | ⚠️ **o segredo.** Só aparece no `POST /auth/token` |
| `REBOTS_BASE_URL` | não | padrão `https://api.rebots.com.br`. Sandbox: `https://sandbox.api.rebots.com.br` |
| `REBOTS_PRODUCAO` | não | ⚠️ **sem ela, toda emissão sai com `test: true`** |
| `REBOTS_TIMEOUT_MS` | não | padrão 20s |
| `RECIBOS_CALLBACK_SECRET` | **sim, para receber desfecho** | o token que registramos no `POST /endpoint` deles. Eles o devolvem em `Authorization: Bearer` no callback. Sem ele a rota responde 401 a tudo, e todo recibo fica `pendente` |

⚠️ **`REBOTS_PRODUCAO` é a única flag do repo cujo padrão é "não valendo", e isso é desenho.** O
desfecho de errar não é simétrico: nascer em teste custa uma variável esquecida; nascer em
produção custa um documento fiscal no CPF de uma paciente, que se cancela um por um, em dez dias
(art. 7º da IN RFB 2.240/2024). Mesma lógica do `ambiente` da config fiscal.

⚠️ **A `master_key` não se gera de novo.** O `POST /auth/masterkey-generate` responde uma vez por
conta. Perder o valor é abrir chamado com eles.

## ✅ O certificado é UM, da conta — a profissional não compra nada

`POST /client/certificate` vincula o A1 ao **cliente** (nós), e o `/issuers` não tem nenhum campo
de credencial: só `cpf`, `occupation_code`, `registration`. Então a delegação acontece no e-CAC,
por autorização de acesso, e **um e-CNPJ A1 serve a base toda**.

Era a pergunta que decidia a viabilidade comercial do canal ("ela vai ter que comprar
certificado?") e a resposta é não.

## ★ Quem habilita a profissional: o onboarding, sozinho (desde 29/09/2026)

Até essa data **nenhum código chamava `cadastrarEmissor`**: todo emissor nascia de um
`POST /issuers` feito à mão. Agora ele roda em dois lugares, com a mesma chamada:

| Onde | Quando | Se falhar |
|---|---|---|
| `criarLigarReciboSaude` | ela salva o card "Recibos do Receita Saúde" (ou o editor de dados) | 4xx: **nada é gravado**, a frase vai para a tela. 5xx/timeout: grava assim mesmo, `console.error` |
| `criarEmitirRecibo` | antes de cada recibo, **antes de prender o pagamento** | a emissão recusa e nenhum pagamento fica trancado |

A segunda é a rede: cobre quem salvou antes de 29/09 e quem salvou com a Rebots fora do ar. O custo
é uma chamada a mais por recibo, e em troca não há backfill, coluna nova nem migração.

**Medido no sandbox em 29/09/2026**, e não só lido no OpenAPI:

| Pedido | Resposta |
|---|---|
| `enable`, `issuer_code` novo, com registro | `200 "Issuer created and enabled successfully."` |
| `enable` de novo, mesmo `issuer_code` | `200 "Issuer updated and enabled successfully."` — **é upsert**, e atualiza ocupação e registro |
| `enable`, `issuer_code` novo, `registration: ""` | `400 ISSUERS_ERROR_014 Missing field: registration` |
| `enable`, `issuer_code` existente, **outro CPF** | `409 ISSUERS_ERROR_016 CPF cannot be changed…` |

Consequências no nosso código:

- **Sem registro no conselho, não chamamos.** A recusa viria em inglês. `criarLigarReciboSaude`
  pula a chamada, e `criarEmitirRecibo` recusa em português antes de falar com o canal.
- **O 409 nunca acontece aqui**, porque o `issuer_code` é o próprio CPF. O reverso é a dívida:
  trocar o CPF cria um emissor novo e **deixa o antigo ativo**. A porta não tem `disable`, e
  desligar os recibos também não desativa ninguém lá. Hoje isso é inofensivo, porque nada emite
  sob o código velho. Passa a importar se a Rebots cobrar por emissor ativo, e isso ainda não
  foi perguntado.
- **Não existe GET de emissores.** A única prova de que alguém está habilitado é a mensagem do
  `enable`, e o adaptador a descarta.

## ★ `receipt_id` é nosso, e isso melhora o desenho

O `POST /receipts` aceita `receipt_id` **de entrada**, e o callback o devolve. Então o protocolo é
a nossa chave, conhecida antes da chamada.

Consequência concreta: **para este canal, o estado `pendente` sem protocolo não nasce.** Aquele
estado vem do intervalo entre "o canal aceitou" e "gravei o protocolo" — aqui não há intervalo.
Ver `precisaDeOlhoHumano` em `nucleo/dominio/recibo-unitario.ts`.

⚠️ **Mas ele é INTEIRO, e não é chave de replay.** Ver a tabela abaixo.

## ⚠️ A dívida que é DELES: não existe consulta

Nove endpoints, e **nenhum GET**. Não há como perguntar "o que aconteceu com o protocolo X".
(`/expenses/list` existe, mas lê despesa do Carnê-Leão, não recibo.)

Então `consultar` devolve sempre `null`, e no nosso desenho `null` significa "o canal não me
disse": a linha fica `pendente`, nunca vira recusa, nunca libera a cascata. Seguro — e inútil,
porque a reconciliação deste canal **não converge**. Ela pergunta para sempre e nunca ouve.

Pior: a doc deles diz que o dado é descartado depois do nosso 200 — *"will be discarded and cannot
be recovered"*. Daí a regra da rota de callback:

> **Gravar ANTES de responder 200.** Se a gravação falhar, responder erro para eles reentregarem.
> Um 200 sem gravação apaga a única cópia do desfecho que existe no mundo.

Um `pendente` da Rebots com callback perdido só se resolve **olhando o e-CAC**. É a limitação que
mais pesa a favor de construirmos a automação própria: ela pode ler.

## ✅ Os formatos, medidos no sandbox em 25/08/2026

Não são mais inferência. Cada linha tem o teste correspondente em `emissor-recibo.test.ts`.

| Campo | O que é | Como se sabe |
|---|---|---|
| `amount` | **reais decimais** (`250.50` = R$ 250,50) | o teto: `99999999.99` passa, `100000000` devolve `RECEIPT_ERROR_016 maximum allowed value of 99,999,999.99`. Em centavos o teto bateria 10.000× mais alto |
| `date` | ISO, **só-data basta** | `2026-08-20` aceito, apesar de o campo ser `date-time`. Futura devolve `RECEIPT_ERROR_017` |
| `receipt_id` | **inteiro** | uuid devolve `RECEIPT_ERROR_024 invalid literal for int()` |
| `receipt_id` repetido | **409, não replay** | `RECEIPT_ERROR_023`. É unicidade, não idempotência — não dá para reenviar em cima |
| `issuer_code` | obrigatório **no cancelamento também** | sem ele, `RECEIPT_ERROR_005 Missing field: issuer_code` |
| callback de recibo | envelopado em **`data`** | `CallbackPayload` tem um campo só. Os de despesa **não** são envelopados |
| `file_url` | presigned S3 de **5 minutos** | `X-Amz-Expires=300`, e o OpenAPI diz "válida por 5 minutos" |

### ⚠️ A consequência dos cinco minutos: nós guardamos o PDF

Cinco minutos + nenhuma consulta = o PDF existe durante a chamada do callback e não existe depois.
"Guardar só a URL" deixou de ser uma política conservadora e passou a significar perder o
documento — que é a única coisa que o canal pago entrega e o lote CSV não.

Então a cópia acontece dentro do callback, pela porta `GuardaDeComprovante`. Os limites em que
isso é aceitável estão escritos em `supabase/023_recibo_numero_e_comprovante.sql`, e eles
contradizem de propósito o que a migração 020 dizia.

## ✅ Os códigos de ocupação: a doc DELES está errada, a nossa tabela está certa

O enum deles é `[225, 226, 230, 231, 232, 255]` — **exatamente os seis números** do nosso
`CODIGO_OCUPACAO` — mas com três rótulos trocados. Conferido na
[tabela oficial da Receita](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/manual/ocupacoes)
em 25/08/2026:

| Código | Receita Federal (oficial) | Rebots diz |
|---|---|---|
| 230 | Fonoaudiólogo (a partir de 2024) | Psicólogo ❌ |
| 232 | Terapeuta ocupacional (a partir de 2024) | Fonoaudiólogo ❌ |
| 255 | **Psicólogo** | Nutricionista ❌ |

Nutricionista nem é 255: é **227**, que não está no enum deles. Os códigos 230/231/232 nasceram do
desdobramento do antigo 229 pela IN de março/2024 — provavelmente é aí que eles se perderam.

⚠️ **O que fica em aberto, e não dá para verificar de fora:** mandamos o número certo, e o enum
deles o aceita. Mas se o robô deles procurar o **rótulo** na tabela interna errada em vez de
repassar o inteiro, o recibo de uma psicóloga sai preenchido como nutricionista. É pergunta para o
suporte, e é a última coisa a confirmar antes de emitir em produção por este canal.

## ✅ O callback registrado — e a corrida que ele revelou (26/08/2026)

`POST /endpoint` com `{ identificador, url, token }`. **Uma url por cliente: cada chamada
substitui a anterior.** O `token` que mandamos é o que eles devolvem em `Authorization: Bearer` —
é o nosso `RECIBOS_CALLBACK_SECRET`.

Rode `npm run callback -- <base-https>`. O script sonda a url antes de registrar (401 sem segredo,
400 com), porque registrar uma url que responde 307 ou 404 **não dá erro nenhum** na Rebots: ela
aceita, e o silêncio começa depois, um recibo por vez.

### ★ No sandbox o callback é SÍNCRONO — e isso achou um bug de produção

O sandbox dispara o callback **dentro do próprio `POST /receipts`**, antes de a chamada retornar.
O primeiro teste real (recibo nº 56) recebeu o callback e respondeu **404
`protocolo_desconhecido`**: o caso de uso gravava o protocolo DEPOIS da chamada ao canal, então o
aviso chegou numa janela em que a linha existia sem protocolo — e `tenantDoProtocolo` procura por
ele.

Não é artefato de sandbox: em produção a janela é menor, não inexistente. E como não existe
consulta (seção acima), um `pendente` que perdeu o callback não tem saída automática nenhuma.

A correção é possível porque **aqui o protocolo é a nossa referência**: `protocoloEhNossaReferencia:
true` na porta faz o caso de uso gravá-lo antes de falar com o mundo. Ver o teste
`★ protocolo gravado antes da chamada`.

O PDF do sandbox tem ~100 KB e é sempre o mesmo arquivo de exemplo, seja qual for o recibo.

## Estado

**O sandbox rodou.** Conta `62025689000166` ("Junior Poli Estudos"), liberada em 25/08/2026;
credenciais no `.env.local`, que é ignorado pelo git. O que foi exercitado contra a API real:
`auth/masterkey-generate`, `auth/token`, `issuers`, `receipts` (emissão e cancelamento, com os
casos de erro).

**O ciclo completo fechou no sandbox em 26/08/2026** — recibo nº 57: emissão pela tela, callback
entregue num túnel `cloudflared` para o dev local, linha fechada como `emitido` com chave
`SANDBOX14CF…`, e o PDF (100.661 bytes) arquivado no bucket privado. A emissão está montada no
`composicao.ts`, com rota (`POST /api/recibos/emitir`) e botão (tela Fiscal).

**A Vercel Production aponta para a Rebots de PRODUÇÃO desde 29/09/2026.**

- **O que foi trocado:** `REBOTS_BASE_URL=https://api.rebots.com.br`, e `REBOTS_MASTER_KEY` recebeu a
  chave de produção. O `REBOTS_IDENTIFICADOR` é o mesmo nos dois ambientes.
- **Callback de produção:** registrado no mesmo dia, via `npm run callback`, apontando para
  `https://app.maisasecretary.com.br/api/recibos/callback`. As sondas responderam 401 e 400. Fora do
  sandbox, o `/receipts` **exige** callback registrado.
- **Certificado:** vinculado na conta de produção desde 24/09.
- **Emissores:** não passam de um ambiente para o outro. A rede em `criarEmitirRecibo` recadastra
  cada profissional no primeiro recibo.

⚠️ **`REBOTS_PRODUCAO` continua ausente, e é de propósito.** Todo recibo sai com `test: true`, que
o OpenAPI define como *"o recibo não é enviado à Receita Federal"*. Então, hoje, cadastro de
emissor é de verdade e recibo não tem efeito fiscal. Antes de ligar a variável, falta a
resposta do suporte sobre o código 255 (ver a tabela de ocupações acima).

**Localmente, as `REBOTS_*` do `.env.local` seguem no sandbox.** Os valores de produção moram em
`REBOTS_PROD_BASE_URL` e `REBOTS_PROD_MASTER_KEY`, com nomes diferentes de propósito: `npm run dev`
não cadastra ninguém na conta de produção por acidente. Para rodar `npm run callback` contra a
produção, sobrescreva `REBOTS_BASE_URL` e `REBOTS_MASTER_KEY` na linha de comando. O script só lê do
`.env.local` o que não veio do ambiente.
