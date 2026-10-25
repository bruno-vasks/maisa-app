# MAISA — Assistente por WhatsApp

Painel da **MAISA**: um assistente que atende, agenda e confirma pelo WhatsApp. Next.js 14
(App Router) + TypeScript, com **arquitetura hexagonal** — o núcleo do negócio não conhece
Next, React nem os serviços externos.

> 📐 **Como o código está organizado: [`ARQUITETURA.md`](ARQUITETURA.md).** Comece por lá.
> Cada pasta tem também o seu `LEIA-ME.md`.

O que é real e o que é demonstração:

| | Estado |
|---|---|
| Agenda (Google Calendar + Meet) | ✅ real — lê e escreve a agenda de verdade |
| Nota fiscal (Focus NFe / NFS-e) | ✅ real — homologação ou produção |
| Login (Supabase Auth) | ✅ real |
| Cadastro (clientes, serviços, equipe) | ⚠️ fixtures em memória — um negócio só |
| Conversas de WhatsApp | ⚠️ demonstração — a integração ainda não existe |

> Feito por Poli Júnior.

## Rodando localmente

```bash
npm install
npm run dev
# abre http://localhost:3100
```

Build de produção:

```bash
npm run build && npm start
```

## As telas

Rail à esquerda, gaveta de detalhe à direita. Cinco telas (ver [`src/ui/LEIA-ME.md`](src/ui/LEIA-ME.md)):

- **Fluxo de hoje** — o dia pelo relógio: quem está em atendimento, o próximo, a lista do dia (com os compromissos do Google) e o que precisa de você.
- **Agenda** — dia/semana/mês, com a agenda REAL do Google dentro da grade.
- **Conversas** — as conversas de WhatsApp (demonstração).
- **Grades** — clientes, equipe, catálogo, faturamento (emissão de NFS-e), "Mais".
- **A MAISA** — os ajustes da assistente, com preview de WhatsApp ao vivo.

O negócio é **genérico**: o mesmo app atende terapeutas e barbeiros, e a diferença vive nas
landing pages, não no produto. As decisões do usuário ficam no navegador (`localStorage`,
chave `maisa.app.v3`).

## Stack

Next.js 14 (App Router) · TypeScript · React · Supabase (auth + tokens) · Google Calendar ·
Focus NFe. Design system próprio vendorado em `src/ds/` (tokens OKLCH, sem Tailwind); sem
biblioteca de componentes externa.

## Google Calendar + Meet

Cada profissional conecta a **própria** conta Google. A partir daí, um atendimento vira evento na agenda dele com **link do Google Meet**, e o link pode ser mandado ao cliente pelo WhatsApp.

Onde fica: **Minha Equipe → o profissional → Conectar agenda do Google**. Depois, em qualquer atendimento daquele profissional, aparece **Criar evento com Meet**.

### 1. Google Cloud Console

1. Crie (ou escolha) um projeto em [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.
3. **APIs e serviços → Tela de permissão OAuth**:
   - Tipo **Externo** (a menos que todos usem contas do mesmo Workspace — aí **Interno**, e você pula a parte de usuários de teste).
   - Preencha nome do app, e-mail de suporte e e-mail do desenvolvedor.
   - Em **Escopos**, adicione `.../auth/calendar.events`, `openid` e `.../auth/userinfo.email`.
   - Em **Usuários de teste**, adicione o e-mail de cada profissional que vai conectar. Enquanto o app estiver "Em teste", **só esses e-mails conseguem autorizar** — e o limite é 100.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em **URIs de redirecionamento autorizados**, coloque uma linha por ambiente (precisa bater caractere a caractere):
   - `http://localhost:3100/api/google/callback`
   - `https://SEU-DOMINIO/api/google/callback`
5. Copie o **Client ID** e o **Client secret**.

### 2. Banco

No Supabase: **SQL Editor** → cole [`supabase/001_google_integracoes.sql`](supabase/001_google_integracoes.sql) → **Run**. Cria a tabela dos tokens com RLS (cada usuário só enxerga as próprias linhas).

### 3. Variáveis

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_TOKEN_KEY=$(openssl rand -base64 32)   # cifra os tokens no banco
```

Sem as três, o botão de conectar não aparece (e nada quebra) — mesma lógica da Focus NFe. `GOOGLE_TOKEN_KEY` é obrigatória de propósito: não existe modo "conectado mas sem criptografia".

Para a cobrança (Stripe):

```bash
STRIPE_SECRET_KEY=rk_test_...      # chave RESTRITA, não `sk_`. Checkout + Billing Portal + Prices + Subscriptions
STRIPE_WEBHOOK_SECRET=whsec_...    # OUTRO segredo: vem do cadastro do endpoint, não da chave de API
```

Sem `STRIPE_SECRET_KEY` o app monta o checkout de demonstração (paga na hora, em memória) e
nada quebra. Sem `STRIPE_WEBHOOK_SECRET` o webhook recusa tudo — falha fechada de propósito,
porque a escrita dele passa por cima da RLS.

⚠️ **O `whsec_` do `stripe listen` não é o da Vercel**, e ele muda toda vez que você
reinicia o comando. Os detalhes do provedor — inclusive o que a Stripe **não** faz no Brasil
— estão em [`src/adaptadores/saida/stripe/LEIA-ME.md`](src/adaptadores/saida/stripe/LEIA-ME.md).

### Detalhes que valem saber

- **As datas são reais.** A agenda do Google é a fonte da verdade dos atendimentos: o app não mantém uma segunda lista. A conversão entre a data civil da tela (`"2026-08-06"` + hora decimal `14.5`) e o instante com fuso que o Google entende mora em [`src/nucleo/dominio/tempo.ts`](src/nucleo/dominio/tempo.ts) — e é o único lugar do código que sabe que existe fuso horário.
- **Marcar duas vezes não cria dois eventos.** Um uuid é cunhado antes do pedido e gravado no evento; o servidor procura por ele antes de inserir. Cobre o caso feio: o POST que chegou ao Google, criou o evento e perdeu a resposta na volta.
- **Ninguém é convidado por e-mail.** O evento é criado só na agenda do profissional. Os clientes do protótipo são fictícios, mas o e-mail deles é **real**: hoje todos apontam para o dono do projeto, de propósito, para que um teste de convite caia na própria caixa. (Antes era `@email.com`, que é um domínio de verdade, com dono — convidar disparava e-mail para estranhos.) Para ligar, mande `convidarCliente: true` no POST de `/api/atendimentos`, ciente de que é e-mail real saindo.
- **O WhatsApp abre com a mensagem pronta** (link `wa.me`), faltando apertar enviar. Envio automático depende da API oficial do WhatsApp, que este protótipo ainda não tem.
- **Desconectar revoga de verdade** no Google, não só apaga a linha local.

## Deploy (Vercel)

Zero configuração — a Vercel detecta o Next.js automaticamente. Importe o repositório em [vercel.com/new](https://vercel.com/new). Lembre de adicionar a URL de produção nos URIs de redirecionamento do client OAuth.

⚠️ **Nunca rode `npm run build` com o `next dev` no ar** — o build clobbera o `.next` do dev
e a tela perde todo o CSS. Parece bug do código, e não é.
