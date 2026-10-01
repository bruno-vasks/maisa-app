# MAISA — secretária de IA por WhatsApp

Next.js 14 · TypeScript · arquitetura hexagonal. O cliente conversa no WhatsApp, a MAISA
oferece horário, marca na agenda do dono e emite nota. O dono acompanha por um painel.

**O mapa do repositório é o [`ARQUITETURA.md`](ARQUITETURA.md)** — não está repetido aqui de
propósito. Quando dois arquivos dizem a mesma coisa, um envelhece e ninguém sabe qual.

## Comandos

| Comando | O quê |
|---|---|
| `npm run dev` | sobe em :3100. Teste a conversa em [/laboratorio](http://localhost:3100/laboratorio) — sem número de WhatsApp |
| `npm test` | vitest: a suíte inteira, incluindo as guardas abaixo |
| `npm run guardas` | só as guardas de arquitetura e documentação |
| `npm run typecheck` | `tsc --noEmit`, sem cache incremental de propósito — com cache ele já reprovou código que compila |
| `npm run semear` | enche os últimos 30 dias de atendimentos pagos, para ter o que emitir na tela Fiscal. `-- --limpar` desfaz. ⚠️ **escreve no Supabase de produção** — ver o cabeçalho de [`scripts/semear-demo.mjs`](scripts/semear-demo.mjs) |
| `npm run abacate:catalogo` | confere se a conta da AbacatePay tem os 3 produtos e o webhook que o código espera. **Só leitura**; `-- --aplicar` cria o que falta; `-- --sondar` descobre **o que a conta deixa cobrar** (não há endpoint que responda isso — a sonda tenta e lê a recusa). ⚠️ em conta de produção, `--aplicar` e `--sondar` escrevem de verdade |
| `npm run email:conferir` | confere o caminho do e-mail: os 4 registros de DNS que a Resend pede, os 2 da Hostinger que **não** podem ter sido tocados, e o estado do Supabase. **Só leitura** — não escreve em nada e não manda e-mail. Resolve por 8.8.8.8/1.1.1.1 de propósito: o resolvedor local desta máquina já mentiu sobre propagação. Com `RESEND_API_KEY` no ambiente, também diz se o domínio está `verified` lá. `-- --enviar voce@x.com` **manda um e-mail de verdade**, falando SMTP na mão e imprimindo cada linha do servidor — existe porque o Supabase engole a recusa da Resend num `500` genérico, e a linha crua diz qual campo do painel consertar. ⚠️ Só o modo padrão é leitura; `--enviar` gasta cota e produz efeito no mundo |
| `npm run leads` | quem preencheu o `/assinar` e **não pagou**: e-mail, WhatsApp, plano, campanha e em que ponto parou (`travou no e-mail`, `sem negócio`, `não pagou`, `pagou`). **Só leitura**, do banco de produção. `-- --csv x.csv` grava num arquivo. ⚠️ é dado pessoal de quem não é cliente: não guarde o CSV em pasta compartilhada |
| `npm run callback -- <url>` | registra na Rebots para onde mandar o desfecho dos recibos. Sonda a url antes (401 sem segredo, 400 com) — url torta é `pendente` para sempre. ⚠️ **substitui a url anterior**: registrar o túnel local derruba a de produção |
| `npm run lint` · `npm run build` | eslint · next build |

Os quatro primeiros rodam no CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)),
em toda branch. `lint` não roda: o ESLint nunca foi configurado aqui, e o motivo de não
ligá-lo às pressas está escrito no próprio workflow.

⚠️ **Nunca `npm run build` com o `next dev` no ar.** O build clobbera o `.next` do dev e a
tela perde todo o CSS — parece bug do código, e não é.

## Regras invioláveis

**NUNCA**

- Importar SDK externo, `@/adaptadores`, `@/ui` ou `@/app` dentro de `src/nucleo/`. O núcleo só conhece `@/nucleo/**` e caminho relativo. Precisa do mundo? Declare uma porta em `nucleo/portas/saida/`.
- Ler `tenantId` do corpo do request, da query string ou de argumento do agente de IA. Ele nasce da sessão autenticada, sempre — foi esse descuido que abriu o pior furo da integração de origem.
- Importar um adaptador de dentro de outro adaptador. Eles se encontram em `src/composicao.ts`, e as cinco exceções vivas estão listadas em `src/arquitetura.test.ts`.
- Decidir regra de negócio dentro de um `route.ts`. Rota é tradutora: autentica, converte JSON, chama caso de uso.
- Devolver erro de domínio como status HTTP a partir do núcleo. O núcleo lança `DadoInvalido`; quem vira 400 é `entrada/http/respostas.ts`.
- Renomear um campo `status` de resposta sem procurar o nome em `src/ui/estado/store.tsx`. Esses nomes são contrato com a tela.
- Importar `saida/google`, `saida/focus` ou `composicao.ts` de um componente `"use client"`. Segredo de servidor não cruza para o bundle.
- Pôr guardrail em prompt quando ele cabe em código. Prompt é a camada mais fraca e não vale como garantia.
- Deixar o modelo escolher `tenantId`, `maisaAg`, `comMeet` ou `convidarCliente`. Ficaram fora do schema das ferramentas por decisão, não por esquecimento.
- Tratar o HMAC da AbacatePay como credencial. **A chave dele é pública, publicada na documentação deles** — qualquer pessoa assina um payload válido. Quem autentica o webhook é o `?webhookSecret=` da query string, conferido primeiro. Há teste.
- Pedir à AbacatePay um método de pagamento que a loja não tem habilitado. `methods` é **conjunção**, medido em 21 e 29/09/2026: um método ausente recusa o checkout inteiro e **ninguém compra** — os dois juntos não degradam para o que estiver ligado. O que a conta deixa cobrar se descobre com `npm run abacate:catalogo -- --sondar`, nunca por suposição.
- Cortar o acesso de um negócio gravando status. No pré-pago o corte é **derivado da data** (`acessoLiberado`, no domínio) na hora em que a mensagem chega; uma rotina que grava "vencida" e não roda num dia deixaria de cortar, ou de religar quem pagou.
- Marcar um evento de webhook como processado ANTES de gravar a assinatura. Falhar no meio deixaria o evento como visto com o estado antigo, e a reentrega — que existe para salvar esse caso — passaria a ser descartada. O pagamento se perde para sempre.

**PERGUNTE ANTES**

- De mexer em `src/nucleo/portas/`. Mudar uma porta muda todos os adaptadores dela de uma vez.
- De trocar o modelo de linguagem em `composicao.ts`. Isso invalida o cache de prompt e muda o custo por mensagem.
- De criar um **terceiro** lugar que guarde atendimento. Desde o [ADR-0009](https://github.com/contasinovacao-dev/Product-House/blob/main/docs/adr) a fonte da verdade é a tabela `atendimentos`, e o calendário externo é uma camada **aditiva** por cima — soma o que nasceu fora e, quando falha ou não existe, soma zero. Esta regra dizia o contrário até 04/09/2026, e o que ela protegia continua valendo: quando havia duas listas simétricas, nenhuma tela sabia qual era a real. A assimetria é o que torna duas fontes sustentáveis — uma manda, a outra acrescenta.

**SEMPRE**

- Escrever em pt-BR: código, comentário e documentação. Termo técnico sem tradução consagrada fica em inglês.
- Atualizar o `LEIA-ME.md` da pasta na mesma mudança que altera o comportamento dela. Documentação vencida é pior que ausente — com ponteiro errado o acerto medido cai de 78,5% para 68,1%.
- Chamar o caso de uso direto, nunca `fetch` para a própria API. O agente roda no mesmo processo que as rotas.

## As guardas

`src/arquitetura.test.ts` e `src/documentacao.test.ts` transformam as regras acima em teste.
Elas rodam no `npm test` e no CI, e **reprovam o build**. As listas de exceção nesses arquivos
são o conteúdo, não burocracia: cada entrada tem motivo e data. Adicionar um nome para "o teste
passar" é a hora de parar e perguntar por quê.

## Onde olhar primeiro

| Você vai mexer em | Leia antes |
|---|---|
| qualquer rota | [`docs/rotas.md`](docs/rotas.md) |
| o agente de WhatsApp | [`.../entrada/whatsapp/LEIA-ME.md`](src/adaptadores/entrada/whatsapp/LEIA-ME.md) — guardrails, envelopes e dívida |
| agenda, horários, nota fiscal | [`docs/fluxos/`](docs/fluxos/) |
| adaptador de saída novo | [`src/nucleo/portas/LEIA-ME.md`](src/nucleo/portas/LEIA-ME.md) e o `saida/demo/` ao lado |
| cobrança, planos, **Pix** | [`.../saida/abacatepay/LEIA-ME.md`](src/adaptadores/saida/abacatepay/LEIA-ME.md) — o provedor preferido, e as 5 armadilhas da API |
| cobrança por cartão / Stripe | [`.../saida/stripe/LEIA-ME.md`](src/adaptadores/saida/stripe/LEIA-ME.md) — inclui o que a Stripe **não** faz no Brasil |
| webhook de pagamento | [`.../entrada/abacatepay/LEIA-ME.md`](src/adaptadores/entrada/abacatepay/LEIA-ME.md) — ⚠️ **o HMAC deles não autentica ninguém** |
| entender o negócio, sem código | [`docs/dominio.md`](docs/dominio.md) |
| onde mexo para fazer X | [`ARQUITETURA.md`](ARQUITETURA.md) §5 |

**Toda pasta tem `LEIA-ME.md`** com o que ela é, o que pode e o que não pode importar. Leia o
da pasta antes de escrever nela — é onde mora o "por quê" que não cabe no código.

## O teste que a arquitetura tem que passar

Adicionar um provedor novo (outra agenda, outro canal, outro modelo) é: escrever o adaptador,
trocar uma linha em `composicao.ts`. **Se você precisou tocar em `src/nucleo/`, algo está
errado** — ou a porta está mal desenhada, ou aquilo não era um adaptador. Pare e diga.

## Padrão da casa

Este repositório segue o padrão do
[Product-House](https://github.com/contasinovacao-dev/Product-House). Decisão arquitetural vira
ADR de lá — não comentário no código, nem parágrafo neste arquivo.
