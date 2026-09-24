# `src/app/` — o roteamento do Next

Duas coisas moram aqui, e elas quase não se falam: o **painel** (o produto) e as
**landing pages** (o que vende o produto).

## Painel

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `page.tsx` | Monta o `StoreProvider` + `AppShell`. Protegida pelo middleware. |
| `/login` | `login/page.tsx` | Entrada por e‑mail (Supabase Auth). |
| `/auth/callback` | `auth/callback/route.ts` | Volta do login social / confirmação por e‑mail. Todo erro carrega um MOTIVO — "tente de novo" é conselho inútil quando a causa é o provedor estar desligado. |
| — | `layout.tsx`, `globals.css`, `manifest.ts`, `apple-icon.tsx` | Casca, fontes, PWA. `globals.css` é a fonte dos tokens do painel (o guarda G4 reprova `var(--x)` que não esteja lá ou no `next/font` do `layout.tsx`) e, desde 24/09/2026, das classes que decidem layout pelo contêiner: `.m-campos` + `.m-campos-grade` (duas colunas quando o contêiner passa de 520px, `.m-campo-largo` ocupa a linha), `.m-curto` (28rem) e `.m-prosa` (68ch). |

## API — o adaptador de entrada HTTP

Todas são **finas**: traduzem HTTP para um caso de uso e a resposta de volta. Se um `if`
de regra aparecer aqui, ele está no lugar errado — o lugar é
[`nucleo/aplicacao/`](../nucleo/aplicacao/LEIA-ME.md).

| Rota | Método | Caso de uso | Respostas |
|---|---|---|---|
| `/api/agenda` | GET | `lerAgenda` | `ok` + `de`/`ate`/`eventos` — atendimentos do produto + o que vier do calendário externo |
| `/api/atendimentos` | POST | `agendarAtendimento` | `criado` \| `ja_existia` + `eventoId`, `meetLink`, `inicioISO`, `semMeet`, `foraDoCalendario` |
| `/api/atendimentos` | DELETE | `cancelarAtendimento` | `cancelado` |
| `/api/google/conectar` | GET | — (protocolo OAuth) | **redirect** para o consent do Google |
| `/api/google/conectar` | DELETE | `desconectarAgenda` | `{ ok, revogado }` |
| `/api/google/callback` | GET | — (protocolo OAuth) | **redirect** com `?google=ok` ou `?google=erro&motivo=…` |
| `/api/google/status` | GET | `listarConexoes` | sempre 200 com `status` dentro — é a rota que RELATA o estado |
| `/api/nf/emitir` | POST | `emitirNota` | `simulado` \| `processando` \| `autorizado` \| `config_incompleta` \| `erro` |
| `/api/nf/status` | GET | `consultarNota` | idem, para o polling |
| `/api/nf/cancelar` | POST | `cancelarNota` | `cancelado` \| `erro` |

**Duas saem do padrão, e é de propósito:**

- `conectar` (GET) e `callback` respondem **redirect, nunca JSON** — o usuário chegou
  navegando, e despejar um JSON na cara dele seria um beco sem saída. Também são as
  únicas que tocam protocolo OAuth diretamente (PKCE, cookie, `state` assinado).
- `status` responde **200 mesmo sem sessão**. Ela existe para relatar se há sessão e se
  há configuração; um 401 esconderia justamente a resposta que a pergunta pede.

## Landing pages

`(marketing)/` — grupo de rotas com as LPs dos dois ICPs. Vive à parte do painel:
importa só `@/ui/primitivos` e os componentes de `_lib/`, nada do núcleo.

Ver a tabela "Onde está cada LP no código" no `CLAUDE.md` do projeto (uma pasta acima
do repo) e o script `scripts/espelha-lp.mjs` para a LP estática de terapeutas.

### Nem tudo aqui é LP

Três rotas do grupo são **documento**, não venda: `/privacidade`, `/termos` e — desde
26/08/2026 — `/autorizar`, o tutorial da Autorização de Acesso do e-CAC. Elas não usam o
`<World>`, e por isso estão na lista `NAO_SAO_LP` do `juridico.test.ts`.

⚠️ **A lista dispensa o mecanismo, nunca o resultado.** Toda página pública tem que levar à
política de privacidade — é o que o revisor do Google abre e confere. Há teste que lê o texto
da página e o do invólucro direto dela procurando os dois links; entrar em `NAO_SAO_LP` não
escapa dele.

`/autorizar` é pública de propósito: quem lê está no site da Receita, mandado por WhatsApp, e
pode nem ter conta na MAISA. Os passos vêm de `passosDaProcuracao()`, o mesmo do painel — uma
fonte, dois lugares.

## Regra

Rota é **tradutora**, não decisora:

```ts
const porteiro = await exigirSessaoComGoogle();   // quem é
if (barrou(porteiro)) return porteiro.barrado;
try {
  const r = await app.oQueFor(porteiro.tenant, { …corpo });   // o que fazer
  return NextResponse.json({ ok: true, …r });                 // como responder
} catch (e) {
  return falha("escopo", e);                                  // erro → status
}
```
