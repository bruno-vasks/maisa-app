# `saida/resend/` — o correio (Resend)

Cumpre `Correio` (`nucleo/portas/saida/correio.ts`). **⚠️ Só servidor.**

Existe desde 29/09/2026 por um motivo só: o **aviso de vencimento do pré-pago**. Cada Pix
compra um mês, ninguém cobra sozinho, e alguém tem de avisar o dono antes de a MAISA pausar.
A rotina é `/api/rotinas/cobranca`, uma vez por dia; as regras de quem recebe e quando estão
em `avisoDoDia`, no domínio.

Desde 22/10/2026 o mesmo correio leva também o **aviso de cadastro novo**: uma conta nasce em
`auth.users`, o trigger da `035` chama `/api/interno/novo-cadastro`, e sai um e-mail para o Bruno
(ou para `AVISO_CADASTRO_PARA`, lista por vírgula). Mesmo remetente, texto puro. ⚠️ Com a chave no
`.env.local`, disparar essa rota à mão no local manda e-mail de verdade ao Bruno.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `config.ts` | `RESEND_API_KEY` e o remetente (`MAISA_EMAIL_REMETENTE`, padrão `nao-responda@maisasecretary.com.br`) |
| `correio-resend.ts` | Um `POST https://api.resend.com/emails`, texto puro, sem retry |

## Por que e-mail, e não WhatsApp

A MAISA roda no **número pessoal do dono**. Um aviso pela instância dele chegaria como
mensagem dele para ele mesmo, sem notificação. Mandar pelo número central da MAISA resolve,
mas a resposta do dono cairia no agente de vendas que atende aquele número. E-mail não tem
nenhum dos dois problemas, e todo dono tem um: é o login dele.

## ⚠️ O que precisa estar certo

- **A conta é a mesma do SMTP do Supabase** (desde 22/09/2026), e o domínio
  `maisasecretary.com.br` está verificado lá. Remetente de outro domínio volta **403**, e o
  aviso para de sair sem ninguém notar.
- **Sem `RESEND_API_KEY`, `composicao.ts` usa o `demo/correio.ts`**, que só escreve no log.
  ⚠️ O `.env.local` TEM a chave (o `email:conferir` usa) e aponta para o banco de produção:
  chamar `/api/rotinas/cobranca` à mão no local manda cobrança de verdade para donos de
  verdade. A rota exige o segredo, então não acontece sem querer — mas acontece.
- **Sem retry.** Uma rodada com muitos e-mails falhando, repetindo cada um, estouraria o
  `maxDuration` da rotina e morreria no meio. Falha é contada e aparece no log.

## Quando isto deixa de caber

A rotina manda em série, com teto de 8s por e-mail, dentro de 60s. Com o volume de hoje
(poucos negócios vencendo por dia) cabe com folga. Passando de ~50 avisos no mesmo dia,
usar o envio em lote da Resend (`/emails/batch`) antes de qualquer outra coisa.
