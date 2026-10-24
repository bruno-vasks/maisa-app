# `src/app/` — o roteamento do Next

Duas coisas moram aqui, e elas quase não se falam: o **painel** (o produto) e as
**landing pages** (o que vende o produto).

## Painel

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `page.tsx` | Monta o `StoreProvider` + `AppShell`. Protegida pelo middleware. |
| `/login` | `login/page.tsx` | Entrada por e‑mail (Supabase Auth). |
| `/comecar` | `comecar/Comecar.tsx` | O wizard de conta criada a negócio de pé (fora do `StoreProvider`, guarda G13). Desde 28/09/2026 é uma moldura: a página tem a altura da janela (`.m-altura-tela`), marca, trilha e título ficam parados em cima, só o cartão da etapa rola, e o primário de cada etapa aparece no pé parado por portal (`NoPe`), junto do "Pular por agora". Fundo `--bg` chapado (saiu o gradiente). |
| `/assinar/<plano>` | `assinar/[plano]/Assinar.tsx` | O pré-cadastro do anúncio: nome do negócio, WhatsApp e e-mail; senha aleatória; plano, vertical (`?icp=`), campanha (`utm_*`, `gclid`, `fbclid`) e `funil` no `user_metadata` (e `negocio`, o nome digitado, desde 22/10/2026: o aviso de cadastro novo sai antes de o negócio nascer); cria o negócio (`POST /api/negocio`) e gera o Pix (`POST /api/assinatura`) → `/pagar` → `/comecar`. Pública (`PUBLIC_PREFIXES`); só `essencial` e `profissional` (o `escala` é 404). ★ **`?teste=1` é o teste grátis** (22/10/2026): o mesmo cadastro sem o Pix, direto para o `/comecar`, com os 14 dias ABERTOS que todo negócio ganha no banco (`teste: "aberto"`). ★ **Sem `?teste=1`, o teste nasce FECHADO** (09/10/2026, `teste: "na_conversa"`: o trial acaba no dia do cadastro) e a `/pagar` oferece pedir 7 dias pelo WhatsApp. Quem decide é `testeDoNegocio`; os textos dos dois funis e o porquê de cada promessa estão em `assinar/[plano]/funil.ts` (testado). `maisa_sign_up` sai nos dois caminhos; `maisa_begin_checkout`, só no do Pix. Sem `?icp=` a vertical é `generico`, e o cartão mostra só os números do plano (antes herdava a nota fiscal de terapeutas) |
| `/pagar` | `pagar/Pagar.tsx` | **Split navy desde 09/10/2026**: plano e preço em navy à esquerda (cabeçalho curto no celular), pagamento à direita, pouco texto por decisão do Bruno. Aba **Cartão** só quando `capacidades.cartao`. ★ O Pix NA NOSSA TELA (30/09/2026): QR Code, copia-e-cola e o pagamento acompanhado a cada 3s e na volta do app do banco. Para onde `POST /api/assinatura` manda no pré-pago, no lugar da página da AbacatePay — que pedia nome, CPF, e-mail, telefone e endereço depois do nosso cadastro. No celular o primeiro botão é "Copiar código Pix"; no computador, o QR. Protegida pelo middleware; `?volta=` só aceita caminho relativo (`regras.ts`). Avisa que o recebedor no banco é a **Poli Júnior**. Para quem veio do funil, oferece **pedir 7 dias de teste no WhatsApp** (09/10/2026), com o link de liberação na mensagem |
| `/liberar/<pedido>` | `liberar/[pedido]/Liberar.tsx` | A tela da EQUIPE (09/10/2026): abre do link da mensagem de quem pediu teste, mostra o negócio e libera 7 dias com um toque. Protegida pelo middleware (o pedido vai no caminho porque o `next` do login guarda só o caminho) e por `MAISA_EQUIPE`. Abrir não libera: só o botão, por POST |
| `/auth/callback` | `auth/callback/route.ts` | Volta do login social / confirmação por e‑mail. Todo erro carrega um MOTIVO — "tente de novo" é conselho inútil quando a causa é o provedor estar desligado. |
| — | `layout.tsx`, `globals.css`, `manifest.ts`, `apple-icon.tsx` | Casca, fontes, PWA. `globals.css` é a fonte dos tokens do painel (o guarda G4 reprova `var(--x)` que não esteja lá ou no `next/font` do `layout.tsx`) e, desde 24/09/2026, das classes que decidem layout pelo contêiner: `.m-campos` + `.m-campos-grade` (duas colunas quando o contêiner passa de 520px, `.m-campo-largo` ocupa a linha), `.m-curto` (28rem) e `.m-prosa` (68ch). Desde 25/09/2026, `.m-canal` (a faixa do WhatsApp nos Ajustes quebra as ações para baixo abaixo de 560px de contêiner, 1C.13) e, só no celular, `.m-alvo` (o próprio controle ganha 44x44) e `.m-alvos` (os botões filhos ganham 44px de altura). Desde 28/09/2026, `.m-grudado`: título que gruda no topo da região da `Moldura` com `top` negativo igual ao padding dela (`--regiao-pt`), porque o `sticky` respeita o padding de quem rola. |

## API — o adaptador de entrada HTTP

Todas são **finas**: traduzem HTTP para um caso de uso e a resposta de volta. Se um `if`
de regra aparecer aqui, ele está no lugar errado — o lugar é
[`nucleo/aplicacao/`](../nucleo/aplicacao/LEIA-ME.md).

| Rota | Método | Caso de uso | Respostas |
|---|---|---|---|
| `/api/agenda` | GET | `lerAgenda` | `ok` + `de`/`ate`/`eventos` — atendimentos do produto + o que vier do calendário externo |
| `/api/atendimentos` | POST | `agendarAtendimento` | `criado` \| `ja_existia` + `eventoId`, `meetLink`, `inicioISO`, `semMeet`, `foraDoCalendario` |
| `/api/atendimentos` | PATCH | `remarcarAtendimento` | `remarcado` \| `mesmo_horario` + `eventoId`, `meetLink`, `data`, `inicio`, `inicioISO`, `foraDoCalendario` · corpo `{ profissionalId, maisaAg, data, inicio }` |
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

⚠️ **A campanha do anúncio viaja da LP para o `/assinar`** (21/10/2026). O anúncio cai na LP
com `?utm_source=…&gclid=…&fbclid=…`, e o botão do plano aponta para `/assinar/<plano>?icp=…`,
montado no servidor por `linkPlano()` sem ver a URL do visitante. O lead chegava ao
pré-cadastro sem origem. Quem soma a campanha é o `Medicao.tsx` do layout raiz: no clique num
`<a href="/assinar/…">`, reescreve o link com `levarCampanha()` (`ui/medicao.ts`, onde mora a
lista `CAMPANHA`, tirada de `CHAVES_DE_CAMPANHA` no domínio). A LP estática de terapeutas não
roda React: ela tem um `<script>` irmão no fim do `lp/terapeutas/index.html`, e o
`planos.test.ts` **executa** esse script e reprova se ele divergir de `levarCampanha` ou da
lista. O que o link já traz não é sobrescrito, e link para fora (WhatsApp do Escala) não é tocado.

### Nem tudo aqui é LP

Três rotas do grupo são **documento**, não venda: `/privacidade`, `/termos` e — desde
26/08/2026 — `/autorizar`, o tutorial da Autorização de Acesso do e-CAC. Elas não usam o
`<World>`, e por isso estão na lista `NAO_SAO_LP` do `juridico.test.ts`.

⚠️ **A lista dispensa o mecanismo, nunca o resultado.** Toda página pública tem que levar à
política de privacidade — é o que o revisor do Google abre e confere. Há teste que lê o texto
da página e o do invólucro direto dela procurando os dois links; entrar em `NAO_SAO_LP` não
escapa dele.

⚠️ **Um contato só** (28/09/2026). O e-mail público é o `CONTATO` de `_lib/Juridico.tsx` e o
WhatsApp é o `WHATSAPP_NUMERO` de `_lib/icp.ts`, os dois do Bruno. A análise do site do provedor
de pagamento confere o contato e cruza com o dos termos; havia três e-mails no ar. O
`juridico.test.ts` reprova qualquer `mailto:` ou `wa.me/` diferente nas páginas públicas,
inclusive no HTML estático da LP de terapeutas, e link de rede social que aponta para âncora.

⚠️ **O CNPJ no rodapé** (28/09/2026), pedido pela mesma análise. `EMPRESA` ("Junior Poli
Estudos · CNPJ 62.025.689/0001-66", em `_lib/Juridico.tsx`) aparece no `<RodapeLegal>` das LPs,
na `<LinhaLegal>` das páginas públicas do app, no rodapé dos termos e da privacidade e, digitado,
na LP estática de terapeutas. O número vem do `PROCURADOR_PADRAO`, a mesma conta do tutorial
`/autorizar`; o teste confere os dígitos verificadores e que o HTML estático não divergiu.

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
