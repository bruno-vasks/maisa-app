# maisa — design system

> A maisa é uma **secretária de IA que trabalha dentro do WhatsApp**. Ela atende os clientes de pequenos negócios, marca atendimentos na agenda do dono e emite a nota fiscal sozinha. O dono só entra na conversa quando quer.

**Público:** PMEs brasileiras de serviço com agenda e atendimento por WhatsApp — salões, barbearias, clínicas, estúdios, consultórios, oficinas, petshops. Gente que atende com a mão ocupada e não tem secretária.

**Superfícies cobertas por este sistema**
1. **Site institucional** — venda o produto para quem nunca ouviu falar de IA.
2. **Painel web** — o app do dono: conversas, agenda, clientes, notas fiscais, ajustes.
3. **App mobile** — o mesmo painel no bolso, para consultar entre um atendimento e outro.

> ⚠️ **O painel (app) e as rotas de entrada têm emendas a este documento.** Antes de desenhar
> tela do app, leia **EMENDAS DO PAINEL**, logo antes de ICONOGRAPHY. Onde elas contradizem o
> resto deste arquivo, elas valem para o app; o site e as LPs seguem o texto original.

## Fontes usadas

Nenhuma. Este sistema foi criado **do zero**, a partir de uma entrevista com o time, em 27/07/2026. Não havia logo, paleta, fontes, Figma, codebase, site no ar nem deck.

Respostas que definiram a direção: personalidade *confiável e institucional · calorosa e humana · otimista e brilhante*; clima de cor *creme + verde-mata + âmbar*; densidade equilibrada tendendo a arejada; **só tema claro**; ícones **Heroicons**; idioma **pt-BR**; tom de voz **informal, quase conversa**; referências citadas: **Duolingo, Apple, Google**.

**Não existe símbolo gráfico.** O que existe é um **wordmark tipográfico** (`components/core/Logo.jsx`): a palavra `maisa` em minúscula, Bricolage Grotesque 700, com um ponto âmbar. Nenhum logo foi desenhado ou inventado — quando a marca tiver um símbolo, ele entra em `assets/` e o componente ganha uma variante.

---

## CONTENT FUNDAMENTALS

A maisa fala como uma pessoa competente que trabalha com você — não como um software avisando que a operação foi concluída.

**Pessoa e tratamento.** Falamos **você** com o dono do negócio, sempre. Nunca "o usuário", nunca "o cliente" quando o cliente é quem lê. A assistente é **a maisa**, minúscula, em terceira pessoa: *"A maisa já avisou a Juliana"*, nunca *"Eu já avisei"* fora de uma conversa de chat, e nunca *"o sistema"*.

**Caixa.** Minúscula na marca (`maisa`, nunca `Maisa` ou `MAISA`). Títulos e botões em **sentence case**: "Emitir nota fiscal", não "Emitir Nota Fiscal". CAIXA ALTA só em rótulos micro de 11px com tracking `--tracking-caps` — e **nunca em um rótulo que contenha a palavra `maisa`**: a marca não sobrevive a `text-transform: uppercase`.

**Tamanho da frase.** Curta. Uma ideia por frase. Se cabe em uma linha, cabe.

**Números e moeda.** Sempre pt-BR: `R$ 12.480`, `27/07/2026`, `14:30`, `11 91234-5678`, `NF-e 1.284`. Em fonte mono com `tabular-nums`.

**Emoji: não.** Em nenhuma superfície — nem em site, nem em produto, nem em mensagem enviada ao cliente final. O calor vem da escrita e da cor, não do emoji.

**Jargão: não.** Nada de "payload", "sincronizado", "processamento", "IA generativa", "automação de fluxo". Nada de "sucesso" como substantivo.

**Erros dizem o que fazer.** Sempre: o que aconteceu → por quê → o que resolver.

| Assim sim | Assim não |
| --- | --- |
| "Tudo certo. A Juliana já foi avisada." | "Operação realizada com sucesso." |
| "Agenda livre hoje. Aproveita pra respirar." | "Nenhum registro encontrado." |
| "A nota saiu e o link já tá no WhatsApp dela." | "Documento fiscal eletrônico emitido. 🎉" |
| "Não deu pra emitir a nota. O CNPJ tá com um dígito a mais." | "Erro 422: validação de payload falhou." |
| "Sua secretária que nunca dorme" | "Automação inteligente de atendimento omnichannel" |

**Contrações e oralidade** são bem-vindas em produto e site (*"tá"*, *"pra"*), com moderação e nunca em texto legal, fiscal ou de cobrança — ali a linguagem é neutra e exata.

**Campos de formulário** marcam o que é **opcional**, não o que é obrigatório. Sem asterisco vermelho.

**Estados vazios** são otimistas e oferecem uma saída: *"Agenda livre hoje. Nada marcado até agora — a maisa avisa aqui assim que alguém chamar no WhatsApp."*

---

## VISUAL FOUNDATIONS

### Cor
Base **creme quente** (`--surface-page: #F7F2E9`) com **cards brancos** por cima — é esse contraste que dá o calor. O verde nunca é o fundo da tela inteira, só de blocos de destaque.

- **Verde-mata** `--brand: #1F6749` — ação primária, links, estado ativo, sucesso. É deliberadamente **mais escuro e menos saturado que o verde do WhatsApp**: convive com ele sem imitá-lo.
- **Âmbar** `--accent: #E09A34` — o ponto do wordmark, CTA de marketing, avisos que pedem atenção do dono. Nunca ação primária de produto. Nunca como cor de texto sobre branco (use `--accent-text`).
- **Neutros quentes** (`--ink-*`) puxados para o marrom. **Nenhum cinza azulado no sistema.**
- **Semânticas**: sucesso reaproveita o verde da marca (no maisa, "deu certo" e "é da marca" são a mesma cor), atenção usa âmbar, erro um vermelho quente `#C7452F`, informação um azul-petróleo dessaturado.
- **Máximo de duas cores de fundo por tela.** Só tema claro — não existe dark mode.

### Tipografia
- **Bricolage Grotesque** (display) — títulos, números grandes, wordmark. Tem caráter sem ser esquisita; é o que impede o sistema de virar mais um SaaS genérico.
- **Figtree** (texto/UI) — humanista geométrica, altura-x alta, ótima em pt-BR com acento.
- **JetBrains Mono** — valores, horários, CPF/CNPJ, número de NF. Sempre `tabular-nums`.
- Títulos com tracking negativo (`-0.03em` no display); corpo em `1.65` de entrelinha. `text-wrap: balance` em título, `pretty` em parágrafo.

### Espaçamento e layout
Base **4px**. Dentro de componentes: 8/12/16. Entre blocos: 24. Entre seções: **96px** (`--section-y`) — o respiro é parte da marca. Container de 1180px no site, sidebar fixa de 248px e topbar de 68px no painel. Grade de 12 colunas implícita via CSS grid; nada de framework de grid.

### Fundos
Cor chapada, sempre. **Sem gradiente**, sem textura, sem padrão repetido, sem ilustração de fundo, sem imagem full-bleed decorativa. O único fundo "rico" permitido é o bloco verde-900 (`--surface-inverse`) usado uma vez por página como âncora visual. Ilustração **não é fundo**: quando entra, é em bloco delimitado com fundo e borda próprios — ver **Ilustração**, abaixo. Se um dia entrarem fotos: gente real trabalhando, luz quente e natural, sem grão, sem filtro azulado, sem foto de banco de imagem sorrindo para a câmera.

### Cantos
`--radius-xs 4` (check) · `sm 6` (tag) · **`md 8` — todo controle: botão, input, select** · **`lg 12` — todo card** · `xl 16` (modal, painel) · `2xl 24` (bloco hero) · pílula só em badge, switch e avatar. Nunca arredondamento diferente nos quatro cantos, com uma exceção: a **bolha de chat**, que tem o canto de baixo do lado do falante em 4px — é o "rabinho".

### Bordas
`1px` sempre. `--border-subtle` (#E8E4DC) é o padrão de card e divisória; `--border-default` em input; `--border-strong` no hover de input. Borda **1.5px** só em checkbox e radio, para o traço não sumir. **Nunca borda colorida só de um lado** — nem em card, nem em alerta, nem em bloco de agenda.

### Sombras
Baixas e **quentes** — construídas sobre `rgba(23,21,18,…)`, nunca preto puro. `--shadow-xs` no repouso do botão, `sm` no card, `md` no hover de card e no toast, `lg` só em modal. `--shadow-brand` (verde translúcido) reservado para um CTA em destaque. Sombra interna (`--shadow-press`) só no press do botão primário.

### Hover, press e foco
- **Hover**: escurece um degrau (`--brand` → `--brand-hover`). Superfície neutra ganha `--ink-50`. Card interativo sobe `-2px` e troca `shadow-sm` por `shadow-md`. **Nunca opacidade** como hover.
- **Press**: `translateY(1px)` + sombra interna. Sem `scale`.
- **Foco**: anel de 3px verde-200 (`--focus-ring`) em campo; `outline: 2px solid var(--brand)` com offset 2px em qualquer elemento focável pelo teclado. O foco nunca é removido.
- **Desabilitado**: `opacity .42`, cursor `not-allowed`, sem sombra.

### Movimento
Rápido e discreto: 120ms para cor e hover, 180ms para abrir/fechar, 280ms para modal e toast, 420ms só em entrada de página. Curva padrão `--ease-out`. **Bounce (`--ease-spring`) existe em exatamente um lugar: o knob do switch.** Nada de parallax, número contando, confete ou elemento entrando de longe. `prefers-reduced-motion` zera todas as durações.

Esses tetos governam **resposta a interação** — hover, abrir, fechar, entrar. O **respiro ambiente da ilustração** é a única coisa que roda em ciclo longo, porque a 420ms um loop viraria tremor; ele tem limite próprio em **Ilustração**, abaixo. Fora dele, nada na interface fica em loop.

### Ilustração
A marca usa **Open Peeps** (Pablo Stanley, CC0), recolorido na paleta: traço em `--green-900` (o sistema não tem preto neutro), roupa em neutro quente, e `--brand-soft` reservado para o estado "atendida". Ilustração é **conteúdo**, nunca decoração de fundo.

Limites: uma aparição por página, em bloco delimitado; respiro vertical de até **10px** em ciclo de 2,5s a 3,5s; entrada por fade no lugar dentro de `--dur-slower`; o scroll pode **avançar a narrativa**, nunca mover a arte (isso seria parallax); `prefers-reduced-motion` entrega o quadro final estático. Detalhe e mapa de cor no card **Ilustração**; implementação de referência em `src/app/(marketing)/_lib/terapeutas-v2/` no maisa-app.

### Transparência e blur
Dois usos, só: a topbar do site (`rgba(247,242,233,.82)` + `blur(12px)`) e o overlay do modal (verde-900 a 44% + `blur(3px)`). Não usamos vidro fosco como decoração.

### Cards
Branco, raio 12px, borda `--border-subtle` de 1px, `--shadow-sm`, padding 24px. Variantes: `flat` (sem sombra), `raised` (sombra média, sem borda), `sunken` (creme, para fundos de lista e chat), `accent` (âmbar claro, para o que pede atenção do dono), `inverse` (verde-900, uma vez por tela).

### Elementos fixos
Painel: sidebar e topbar fixas, conteúdo rola. Site: header sticky com blur. Mobile: tab bar fixa embaixo com área segura de 22px. Toast no canto inferior direito no desktop, no topo no mobile.

### Acessibilidade
Contraste AA em todo par de texto/fundo (ver o card "Pares aprovados"). Alvo de toque mínimo de 44px no mobile. Todo `IconButton` exige `label`. Foco sempre visível.

---

## EMENDAS DO PAINEL (24/09/2026)

Escritas uma vez, com limite, pela auditoria do front de 24/09/2026 (backlog `(C) 10`, item
T10). Regra do projeto: quando o app precisa fugir do sistema, a exceção é escrita aqui; nunca
violada em silêncio. Cada emenda diz até onde vai. Fora do limite, vale o resto deste arquivo.

### 1. Pílula é controle
Forma de pílula (raio de meia altura ou mais: o `999px` do filtro, os `20px` do `Badge`) promete clique. No painel ela só aparece em: filtro e
segmento (`Filtros`), interruptor (`Toggle`), contagem **dentro** de um controle (o número do
item do rail, o ponto da aba) e avatar.

- **Status que não clica é forma + rótulo**, pelo primitivo `Estado` (`src/ui/primitivos.tsx`):
  uma marca de forma (anel, disco, triângulo) e o rótulo em tinta, `width: fit-content`, sem
  fundo. A forma carrega o sentido junto com a cor, porque cor sozinha é o sinal mais frágil.
- **Status editável numa lista** é `Toggle` (44px de alvo).
- **Exceção única:** a tarja de data na conversa ("Hoje", "Ontem", "12 de setembro"). É a
  convenção de mensageiro que quem usa WhatsApp já lê sem pensar.
- **Limite medido:** `node scripts/bancada/medir.mjs <tela>` conta `pilulasMudas`; tem de dar 0
  em toda tela, fora a tarja da conversa.

### 2. Âmbar não é ação
No painel o âmbar (`--warm`) tem dois empregos e só dois: **marca** (wordmark e selo "m" sobre
`--nav`) e **pendência** (o ponto e a contagem do rail sobre `--nav`, 7,3:1; na barra de abas,
que é clara, a pendência usa `--warn`, porque o ouro sobre fundo claro dá 1,6:1).

- **A ação primária é `--primary`** (o azul do app), nunca um fill âmbar. Isto substitui, no
  painel, o "verde-mata `--brand` na ação primária" deste documento.
- **Um primário por tela na dobra**, no fim do caminho. `medir.mjs` conta `primariosNaDobra`.
- **Limite:** nenhum `<button>` com `background: var(--warm)` em `src/ui` nem nas rotas de
  entrada.

### 3. Sem gradiente, sem emoji, e cantos retos
- **Sem gradiente** (`linear-gradient`, `radial-gradient`, `conic-gradient`) em tela do painel,
  nas cinco rotas de entrada (`/login`, `/cadastro`, `/esqueci`, `/nova-senha`, `/comecar`) e
  no **preview do WhatsApp** dos Ajustes. Fundo chapado.
- **Sem emoji** na tela e no preview. O preview mostra o que a MAISA manda, e ela não manda
  emoji (ver CONTENT FUNDAMENTALS).
- **Cantos retos, por papel** (Bruno, 28/09/2026: *"as bordas seguem bem arredondadas"*; o
  app redondo ocupava espaço e deixava o botão grande). Isto **substitui** o 8/12 de *Cantos*
  no painel e nas rotas de entrada, com a referência no painel do aluno da Rede Inspira:
  `--r-casca` **0** (rail, topbar, cartão principal), `--r-painel` **4px** (cartão, painel,
  tabela, gaveta, modal) e `--r-controle` **6px** (botão, campo, select, botão-ícone), em
  `globals.css`. Limite: continua redondo só o que desenha um objeto redondo (interruptor,
  avatar, ponto de status, barra de progresso, bolha de conversa, o celular do preview), e
  filtro/segmentado em pílula, que é controle (emenda 1). Nas LPs vale o resto deste arquivo.
  O guarda G19 (`src/ui/guardas/raio.test.ts`) reprova raio de 5 a 49px escrito à mão.

### 4. A paleta do app é navy e azul (divergência declarada)
O painel e as rotas de entrada **não** usam o creme + verde-mata + neutros marrons deste
documento. Usam os tokens de `src/app/globals.css`: um azul só (matiz 262 em OKLCH) variando
luz e croma, o navy `--nav` como chassi e a tinta `--ink`, neutros temperados para o mesmo
matiz. A decisão está escrita em `globals.css` e no cabeçalho de `src/ui/telas/Agenda.tsx`
("o creme e o papel saíram; o navy é o sistema agora"). A tipografia também diverge pelo mesmo
motivo: IBM Plex Sans na UI, Alegreya Sans no rail, Plex Mono só em string de máquina.

- **Limite:** isto registra o que existe, não autoriza repintar. Nenhuma tela é repintada para o
  creme, nem o site para o navy, sem decisão do Bruno.
- Para o painel, **os tokens de `globals.css` mandam**; os nomes deste documento (`--brand`,
  `--surface-page`, `--ink-*`) não existem lá, e o guarda de tokens (`src/ui/guardas/`) reprova
  `var(--x)` que não esteja definido.

### 5. Texto de tela: um título, sem travessão
Vale para todo texto que o dono lê no painel e nas rotas de entrada (as quatro regras vieram da
Rede Inspira, `docs/texto-de-tela.md` de lá):

1. **Sem travessão** (`—`) em copy. Use ponto, vírgula ou dois-pontos. O `—` sozinho como marca
   de valor ausente fica. Comentário de código segue livre.
2. **Fale do que a pessoa faz**, não do que o sistema é.
3. **Um título, não título + subtítulo.** A topbar não tem subtítulo.
4. **A justificativa fica no comentário**, não na tela.

- **Não se corta:** ressalva que evita erro real (o telefone que identifica a pessoa, o
  certificado que não guardamos, o número do pareamento que não fica salvo) e mensagem de erro.
- Os exemplos com travessão em CONTENT FUNDAMENTALS (o estado vazio da agenda) valem pela ideia,
  não pela pontuação.
- **Limite medido:** o guarda G1 (`src/ui/guardas/travessao.test.ts`) lê a fonte e reprova
  travessão novo; os arquivos que ainda têm estão numa lista de dívida que só encolhe.

---

## ICONOGRAPHY

**Heroicons v2** (MIT, Tailwind Labs) — escolha do time na entrevista. Os SVGs foram copiados para dentro do projeto; não dependemos de CDN.

- `assets/icons/outline/` — 50 ícones de 24px, traço. **É o padrão da interface.**
- `assets/icons/solid/` — 8 ícones de 24px preenchidos, para aba ativa e ícone de status.
- `assets/icons/solid-20/` — 8 ícones de 20px preenchidos, para chevron de select, check de checkbox e affixes de campo.
- `assets/icons/HEROICONS-LICENSE.txt` — licença MIT original.

**Como usar.** Sempre pelo componente `Icon` (`components/core/Icon.jsx`), que carrega os mesmos paths copiados dos arquivos. `<Icon name="calendar-days" size={20} />`.

**Regras.** Traço **1.6** (um pouco mais leve que o padrão Heroicons, para combinar com Figtree) · 20px na interface, 18px dentro de botão, 24px em destaque · cor sempre `currentColor` herdada do contexto · **nunca dois pesos de traço na mesma tela**.

**Não fazemos:** desenhar ícone novo à mão, misturar outra biblioteca (Lucide, Font Awesome, Material), usar emoji como ícone, usar caractere unicode (✓ ✗ →) no lugar de um ícone — as únicas exceções são as setas `↑` `↓` do delta em `StatCard`, que são texto, não ícone. Se faltar um ícone, pegue no pacote Heroicons e adicione ao registro em `Icon.jsx`.

**Não existe icon font.** Não existe sprite. São SVGs inline, recoloridos por `currentColor`.

---

## Componentes

`window.MaisaDesignSystem_00adcb.<Nome>` depois de carregar `_ds_bundle.js`.

**core** (`components/core/`) — `Button`, `IconButton`, `Icon`, `Badge`, `Tag`, `Card`, `Avatar`, `Logo`
**forms** (`components/forms/`) — `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
**feedback** (`components/feedback/`) — `Dialog`, `Toast`, `Tooltip`, `EmptyState`
**navigation** (`components/navigation/`) — `Tabs`
**product** (`components/product/`) — `ChatBubble`, `StatCard`

Cada pasta tem `<Nome>.jsx`, `<Nome>.d.ts` (contrato de props) e `<Nome>.prompt.md` (quando usar + exemplo), mais um card HTML com os estados.

### Adições intencionais
Como não havia inventário de componentes de origem, o conjunto padrão foi autorado. Três peças fogem do padrão e existem por necessidade da marca:
- **`Icon`** — wrapper do set Heroicons; sem ele cada tela reinventaria SVG.
- **`ChatBubble`** — o produto **é** uma conversa de WhatsApp; sem esse primitivo, todo kit refaria a bolha.
- **`Logo`** — a marca não tem símbolo, então o wordmark precisa ser um componente para ninguém digitar "Maisa" com maiúscula.

---

## UI kits

- **`ui_kits/site/`** — site institucional. Header, hero com conversa real de WhatsApp, faixa de segmentos, "três passos", bloco verde de recursos, depoimento, planos, FAQ acordeão, chamada final, rodapé.
- **`ui_kits/painel/`** — painel web (1440×880). Seis telas navegáveis: Início, Conversas (3 colunas com thread e ficha do cliente), Agenda (semana), Clientes, Notas fiscais (tabela + filtros), Ajustes. Modal de emissão de NF e toast de confirmação funcionando.
- **`ui_kits/app-mobile/`** — app iOS 390×844 com 4 abas, lista de conversas e thread aberta.

---

## Substituições sinalizadas — **precisa da sua atenção**

1. **Fontes carregadas do Google Fonts, não self-hosted.** Não consegui baixar os binários `.woff2` neste ambiente, então `tokens/fonts.css` usa um `@import` remoto. As três famílias são OFL (livres para self-host). Para tirar a dependência de rede: suba os `.woff2` em `assets/fonts/` e troque o `@import` por regras `@font-face` locais.
2. **A escolha das fontes foi minha**, não sua — você respondeu "decide for me". Bricolage Grotesque + Figtree + JetBrains Mono. Se não for a cara da maisa, é a primeira coisa a trocar.
3. **Não há logo.** Onde uma marca gráfica entraria, o sistema escreve `maisa.` em tipografia.
4. **Não há fotografia.** Ilustração passou a existir: o **Open Peeps** recolorido preenche a lacuna, com regras em **Ilustração** e no card `guidelines/illustration.card.html`. Fotografia segue sem material — se entrar, vale o critério descrito em *Fundos*.

---

## Índice do repositório

```
styles.css               ponto de entrada — só @imports
tokens/
  fonts.css              @import das webfonts (Google Fonts)
  colors.css             paleta crua + aliases semânticos
  typography.css         famílias, escala, papéis (--type-h1, --type-body…)
  spacing.css            escala 4px, container, alturas de controle
  shape.css              raios, bordas, sombras
  motion.css             durações e curvas
  base.css               reset mínimo e defaults do documento
components/
  components.css         classes .ms-* de core
  forms.css              classes .ms-* de formulário
  patterns.css           classes .ms-* de navegação, feedback e produto
  core/                  Button IconButton Icon Badge Tag Card Avatar Logo
  forms/                 Input Textarea Select Checkbox Radio Switch
  feedback/              Dialog Toast Tooltip EmptyState
  navigation/            Tabs
  product/               ChatBubble StatCard
guidelines/              19 cards de fundamentos (Colors, Type, Spacing, Brand, Ilustração)
assets/icons/            Heroicons v2 copiados + licença
ui_kits/site/            site institucional
ui_kits/painel/          painel web
ui_kits/app-mobile/      app iOS
thumbnail.html           tile do sistema
SKILL.md                 versão Agent Skill deste sistema
```
