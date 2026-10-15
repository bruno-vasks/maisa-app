# Fluxo — emitir nota fiscal de serviço

NFS-e municipal via **Focus NFe**. É a feature mais recente do produto (desde 21/07/2026) e a
única que, até hoje, só existe na MAISA — está registrada como tal no
[catálogo do Product-House](https://github.com/contasinovacao-dev/Product-House/blob/main/docs/features/CATALOGO.md).

## Por que são três operações, e não uma

**A emissão é assíncrona.** A prefeitura responde "processando" e o número da nota sai depois —
às vezes segundos, às vezes minutos. Quem pede acompanha por `consultar`. Modelar isso como uma
chamada só produziria uma tela que trava esperando, ou uma que mente dizendo que emitiu.

```
POST /api/nf/emitir     → EmitirNota      aplicacao/notas.ts:19
GET  /api/nf/status     → ConsultarNota   aplicacao/notas.ts:41   ← o polling vive aqui
POST /api/nf/cancelar   → CancelarNota    aplicacao/notas.ts:48
```

Os estados são **nossos**, não da Focus (`nucleo/dominio/fiscal.ts:15`):

```
pendente → processando → emitida
                      ↘ erro
              emitida  → cancelada
```

`emissor-focus.ts` traduz: `"processando_autorizacao"` vira `processando`,
`"erro_autorizacao"` vira `erro`. É o que permite trocar de emissor sem nenhuma tela perceber.

## O caso de uso é fino de propósito

`aplicacao/notas.ts` tem 53 linhas. Ele valida o mínimo (`:23` — valor, discriminação e
documento do tomador) e delega. **A regra fiscal não é nossa**: quem sabe se o código de
serviço existe é a prefeitura, e descobrir isso replicando a tabela municipal dentro do nosso
código seria assinar manutenção de legislação de 5.500 municípios.

## Os três modos, e por que existem

| Situação | O que acontece | Por quê |
|---|---|---|
| **sem token** | modo `simulado` | o fluxo inteiro roda, inclusive o polling, sem emitir nada. Em homologação a simulada sai com número e PDF (15/10/2026, ver abaixo); em produção, sem documento |
| **token, faltando dado fiscal** | `NaoConfigurado` → `config_incompleta` **com a lista** | não arrisca emitir errado; a tela diz exatamente quais variáveis faltam |
| **token + dados completos** | emissão real | ambiente por `FOCUS_NFE_AMBIENTE`, padrão **homologação** |

⚠️ `config_incompleta` sai com **HTTP 200**. Não é falha de requisição — é o app dizendo ao dono
o que falta configurar. Um 400 aqui faria a tela mostrar erro vermelho para uma situação que é
de setup, não de defeito.

## Armadilhas já pagas

**A rejeição fiscal chega no status, não na emissão.** "Código de Serviço inexistente" só
aparece no polling. É por isso que o log de erro mora no `consultar`, e não onde a intuição
mandaria.

**Data de emissão em horário de São Paulo.** `toISOString()` seria UTC e, depois das 21h, já
estaria no dia seguinte — a prefeitura rejeita "emissão superior à data de hoje". A conta mora
em `nucleo/dominio/tempo.ts`, num lugar só.

**A config precisa de `clean()`.** A Vercel guarda o valor cru da variável, e é comum colar com
aspas (`"producao"`) ou espaço sobrando. Sem limpar, a comparação falha em silêncio e o texto
inválido vai para a prefeitura.

**CPF de teste tem que ser real.** A prefeitura valida a existência do documento; um CPF
inventado é rejeitado **antes** de a integração ser exercitada, e o erro parece de código.

## O PDF vai para o WhatsApp de quem emite (15/10/2026)

Quando a nota sai com PDF — autorizada pela Focus, ou simulada em homologação —, `avisarDono`
(`aplicacao/notas.ts`) manda o arquivo para o WhatsApp do dono, com nº, tomador e valor na
legenda, para ele conferir e encaminhar. O número é o mesmo `numeroDaDona` do recibo
(`telefoneDono`, senão o número conectado), e o envio sai pela instância do próprio negócio:
**sem WhatsApp conectado, não há aviso.**

- **Vai para o dono, nunca para o cliente.** Nota sai no CNPJ dele; quem decide se e quando ela
  chega ao cliente é ele.
- **Uma vez só.** Na consulta, só na virada para `emitida` — a tela consulta a cada poucos
  segundos.
- **Nunca lança.** A nota está gravada; mensagem que falha vai para o log e não vira erro.
- **Lote = uma mensagem por nota.** "Emitir as 33 pendentes" manda 33 PDFs.

Até esta data não existia envio nenhum da nota: o `enviar_email_destinatario: false` de
`conta.ts` assumia que a MAISA mandaria, e ninguém mandava.

## Formato de erro diferente do resto do app

As rotas fiscais respondem `erros: [{ mensagem }]` — formato herdado da Focus e já entranhado
na tela de Faturamento. Um `info: string` no lugar da lista faria a tela mostrar "undefined" em
toda rejeição da prefeitura. O tradutor separado é `entrada/http/fiscal.ts`.

## Dívida conhecida

**Não existe adaptador `demo` para `EmissorFiscal`** — está declarado como exceção em
`src/documentacao.test.ts`. A decisão foi consciente: emitir nota de mentira é pior que dizer
que a configuração falta. O modo `simulado` do próprio adaptador da Focus cobre o teste local.

## Onde mexer

| Quero mudar | Mexo em |
|---|---|
| os estados da nota | `nucleo/dominio/fiscal.ts` |
| o que é obrigatório para emitir | `nucleo/aplicacao/notas.ts:23` |
| dados fiscais do prestador | env, lidos em `saida/focus/config.ts` |
| trocar a Focus por outro emissor | adaptador cumprindo `EmissorFiscal` + 1 linha em `composicao.ts` |
| o formato do erro na tela | `entrada/http/fiscal.ts` |
