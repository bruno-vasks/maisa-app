# Os ícones da MAISA

> Espec escrita em 28/09/2026 para redesenhar o conjunto inteiro. Os desenhos aprovados vivem no
> registro `ICONS` (linha) e `CHEIOS` (ativo da navegação) de `src/ui/primitivos.tsx`. Três nomes
> de chave ficaram de propósito: `bot` desenha o fone de atendimento, `documento` é o antigo
> `config`, `negocio` é o antigo `sparkle` (que saiu do app). O traço por tamanho está em `traco()`
> no mesmo arquivo (tabela da 1.3). Emenda a esta espec: só com uma medição que a justifique.

Uma instrução só, para 43 desenhistas que não se falam. Se dois de vocês desenharem o mesmo
objeto seguindo este texto, os dois SVGs devem sair quase iguais. Quando o texto não decidir,
compare com as três referências (`calendar`, `search` e `chat` no registro `ICONS`) e
faça o que elas fazem.

**A queixa que motiva tudo:** o Bruno acha os ícones atuais "com muita cara de IA, bem
robotizados". O diagnóstico: o conjunto atual é o visual padrão de ícone gerado por IA. Tem traço
1.8 com canto redondo em tudo, lembra Lucide/Feather, usa números arbitrários (`r="3.1"`,
`2.33-1.6`) e metáforas de template (robô, estrelinha). Premium não é enfeite. Premium é
proporção medida, pouca coisa, tudo alinhado, e um estado ativo cheio que pesa na medida certa.

---

## 0. De onde vem o método (e o que NÃO copiar)

Não copie nenhum SF Symbol nem nenhum ícone da Meta. A licença do SF Symbols proíbe o uso fora
das plataformas Apple, inclusive de imagens "confusamente parecidas". Os ícones da Meta são
proprietários. Copiamos o **método**:

- **Apple HIG, Icons:** "Crie um desenho reconhecível e altamente simplificado." Todos os
  ícones do app usam "o mesmo tamanho, o mesmo nível de detalhe, a mesma espessura de traço e a
  mesma perspectiva". O tamanho se ajusta ao peso visual de cada ícone. O centro é óptico e não
  geométrico: o exemplo deles é o download, que pesa embaixo e precisa subir. O peso do ícone
  casa com o peso do texto vizinho.
- **Apple HIG, SF Symbols:** o contorno serve para ícone ao lado de texto e em lista. A variante
  cheia "dá mais ênfase" e é a escolha da tab bar e do item selecionado. A iOS tab bar prefere
  o cheio.
- **Meta (Horizon OS design, sistema de ícones):** grade de 24 construída numa prancha de 192,
  **área viva de 20×20 dentro de 2 de margem**, formas-base quadrado, retângulos
  vertical/horizontal e círculo, ângulos em **incrementos de 45°**, um vão entre objetos igual à
  espessura do traço para dar profundidade, e **todo ícone com par 1:1 contorno/cheio**. No
  Instagram, o ativo da tab bar é o cheio.

Fontes: developer.apple.com/design/human-interface-guidelines/icons,
…/sf-symbols, …/tab-bars; developers.meta.com/horizon/design/fonts-icons.

---

## 1. A grade

### 1.1 Prancha e área viva
- `viewBox="0 0 24 24"`. O desenho é conferido em 192px (8×), igual à Meta.
- **Margem de 2. Área viva de 2 a 22 nos dois eixos.** Nenhuma tinta sai daí. Conta a
  **borda externa da tinta**, e não a linha de centro.
- O traço tem 1.5, então a tinta passa 0.75 de cada lado do que você escreve no SVG. Regra de
  bolso: **uma coordenada de linha de centro vai de 2.75 a 21.25**. Na prática, de 3 a 21.
- As guias marcam **bordas de tinta**. Se o traço encosta por dentro da guia, está certo. Se
  passa por cima dela, está grande demais.

### 1.2 Formas-base (coordenadas de LINHA DE CENTRO, que é o que você escreve)

| Forma | Quando usar | Linha de centro | Tinta |
|---|---|---|---|
| **Círculo** | objeto redondo (relógio, alvo, balão do WhatsApp) | `circle cx=12 cy=12 r=9` | Ø19.5 |
| **Quadrado** | objeto quadrado (calendário, alvo de toque) | `x 4..20, y 4..20` (16×16) | 17.5 |
| **Retrato** | papel, lixeira, telefone, caderno | `x 5..19, y 3..21` (14×18) | 15.5×19.5 |
| **Paisagem** | cartão, balão de chat, olho | `x 3..21, y 5..19` (18×14) | 19.5×15.5 |
| **Diagonal/aberto** | tag, enviar, tesoura, setas, pessoas | ocupa a área viva inteira (2..22) | até 20 |

**Compensação óptica entre formas.** O círculo é **maior** que o quadrado: Ø18 de centro contra
16 de lado. Com isso as áreas ficam iguais (círculo ≈ 298, quadrado ≈ 306 em tinta). Sem essa
diferença, o círculo parece menor ao lado do quadrado. Formas pontudas (triângulo do alerta, avião
do enviar, tag em diagonal) vão até a borda da área viva, porque as pontas perdem massa. Uma forma
não passa da sua guia, a não ser por um apêndice (argola, cabo, rabicho), e mesmo o apêndice fica
dentro de 2..22.

### 1.3 Peso
- **Um traço só: 1.5 no 24px, em todo elemento.** Nunca varie a espessura para compensar.
  Compense no tamanho (1.2) e no vão (1.4).
- Diagonal e curva não ganham traço mais grosso. Se uma diagonal parecer fina, ela está curta
  demais: estique.
- Nota para o integrador (os desenhistas validam só em 1.5): hoje o app passa `sw` de 1.9 a 3
  em cada chamada, e isso engorda e empasta o desenho. A tabela alvo, para que o traço renderizado
  fique entre 1.3 e 1.5px, é **≥20px → 1.5 · 17–19px → 1.75 · ≤16px → 2**. Os vãos de 1.4 foram
  medidos para ainda sobrar ar com sw 2.

### 1.4 Vão, detalhe mínimo, contagem
- **Vão entre duas tintas paralelas: no mínimo 1.5 limpo**, o que dá **distância de centro ≥ 3**.
  É a regra da Meta: o vão é igual ao traço.
- **Cruzamento por trás** (uma pessoa atrás da outra, um objeto sobre outro): o de trás **é
  cortado**, com 1.5 limpo de cada lado do da frente. Traço nunca cruza traço.
- **Detalhe mínimo:** forma fechada com interior menor que 1.5 limpo (centro < 3) não pode.
  Segmento aberto com menos de 2 de comprimento de centro não pode (vira um borrão). Nenhum
  retângulo com lado menor que 4.
- **Pontos: só dois tamanhos.** `<circle r="0.25"/>` dá um disco sólido de Ø2, para o pingo do
  alerta ou da interrogação. `<circle r="0.75"/>` dá um disco sólido de Ø3, para o `dots` e o
  dia marcado do calendário. Ponto é sempre `<circle>`, nunca `h.01`.
- **Contagem:** **1 silhueta + até 3 detalhes internos + até 2 apêndices.** Ícone aberto, sem
  silhueta (flow, equipe, setas), tem **no máximo 5 primitivas**. Se precisar de mais, a metáfora
  está errada.

### 1.5 Raio de canto
- **Retângulo: `rx="1.5"`. Um valor só, em qualquer tamanho de retângulo.** A tinta dá 2.25 por
  fora e 0.75 por dentro: quase quadrado, lido como "canto aparado". O raio conversa com o app,
  que está de canto reto por papel desde 28/09 (moldura de 8px, painéis de 4–6px). O Lucide usa 2
  a 3 e parece bala. Nós não.
- Canto de forma que não é `<rect>` (topo do recibo, cartão desenhado em `<path>`): arco `A1.5
  1.5`. Mesma regra.
- Vértice agudo de polígono (ponta do rabicho, bico da tag, seta) fica **sem arco**, e a junção
  redonda do renderizador faz o resto.
- No **cheio** o raio externo vira **2.25** (1.5 + 0.75). Furo em forma de traço vira cápsula com
  raio **0.75**.

### 1.6 Terminais e junções
- A ponta é sempre redonda (`linecap round`). A junção é sempre redonda (`linejoin round`). Os dois
  vêm do renderizador, não escreva nada.
- Ponta de traço aberto cai em coordenada **.0 ou .5**.
- Traço que termina **em** outro traço termina **exatamente na linha de centro** do outro, nem
  curto nem passando. Junção em T só a 90°.
- Um traço aberto não termina a menos de 1.5 limpo de outro traço com que não se junta (distância
  de centro ≥ 3). A ponta redonda conta: ela avança 0.75 além da coordenada final.

### 1.7 Ângulos e curvas
- Segmento reto: **0°, 45° ou 90°.** A 45°, Δx = Δy exatos, como em `L7.5 20` saindo de `11 16.5`.
- Exceção só quando o objeto exige (lâmina da tesoura, bico do avião do `send`, rabicho do
  WhatsApp): múltiplos de 15° (30°, 60°), **declarados em `notas`**.
- Curva: primeiro `<circle>` e `<ellipse>`, depois arco `A` com **raio múltiplo de 0.5**. Bézier
  (`C`) só quando arco nenhum resolve (coração, dente), com pontos de controle na grade de 0.25 e
  alças colineares nas emendas, para não haver quina escondida. Proibidos `S`, `Q` e `T`.

### 1.8 Centro óptico
- Por padrão, a **caixa da tinta** fica centrada em 12 ± 0.25 nos dois eixos. Confira somando as
  bordas: (mín + máx) / 2.
- **Pesa embaixo** (download, sino, alfinete, pessoa): sobe **0.5**.
- **Aponta para um lado** (chevron, play, enviar): a caixa fica centrada e a ponta não recebe
  compensação extra. A exceção é o triângulo cheio, que anda 0.5 na direção da ponta.
- **Objeto simétrico é simétrico de verdade:** espelhe em torno de x=12 e confira os números
  (argolas do calendário em 8 e 16, não em 8 e 15.9).

### 1.9 Precisão do SVG
- **Coordenadas em múltiplos de 0.25. Prefira inteiros e .5.** Use .25 e .75 só no cheio (os
  deslocamentos de 0.75) ou quando anotado.
- No cheio, deslocar uma diagonal de 45° em 0.75 dá √2 (0.53). **Arredonde para o 0.25 mais
  próximo** e mantenha a diagonal numa reta do tipo `x+y = constante`. É a única aproximação
  tolerada (erro < 0.06).
- **Círculo é `<circle>`. Retângulo é `<rect>`.** Não desenhe círculo com quatro arcos nem rect
  com `path`, a não ser quando a forma se funde com outra (o balão do chat é um `path` porque o
  rabicho sai do corpo).
- Permitidos: `<path> <circle> <rect> <line> <polyline> <ellipse>`. Proibidos: `transform`,
  `style`, `class`, `opacity`, `stroke-*`, e `fill`/`stroke` na "linha". Uma casa decimal no
  máximo depois do 0.25: `7.25` sim, `7.3` não.
- Comando absoluto em maiúscula (`M L H V A Z`) é o preferido: fica legível e dá para conferir.

---

## 2. A família "cheio" (estado ativo)

### 2.1 Quem tem
Só os 10 da navegação: **flow, chat, calendar, clientes, receipt, config, equipe, tag, bot,
dots.** Todos os outros entregam `"cheio": null`. Ícone de botão, de aviso ou de ação não tem
estado ativo.

### 2.2 Como se deriva, sem inventar
É o método da tab bar do iOS e do Instagram: **a mesma silhueta, o interior preenchido e os
detalhes vazados.**

1. **Silhueta = a borda externa da tinta da linha.** Pegue a linha de centro da forma principal e
   desloque 0.75 para fora. Raios convexos ganham 0.75 (1.5 → 2.25). Vértice agudo convexo vira
   arco de r 0.75 em volta do vértice original. Canto côncavo fica agudo, no cruzamento das duas
   retas deslocadas. Nada é maior nem menor que a linha: **a caixa da tinta do cheio é idêntica à
   da linha.**
2. **Detalhe interno que é tinta na linha vira furo no cheio, com a mesma pegada.** Um traço de
   1.5 com pontas redondas vira um furo-cápsula de 1.5 com raio 0.75. Um ponto sólido de Ø3 vira
   um furo de Ø3.
3. **Detalhe que encosta nas paredes** (a faixa do cabeçalho do calendário) vira fenda de parede
   a parede **interna**, deixando 1.5 de moldura dos lados, igual à linha.
4. **Apêndice que sai da silhueta** (argola, cabo, rabicho) fica **sólido** e se funde com o
   corpo.
5. **Dois objetos** (as duas pessoas da equipe, a pessoa dentro do caderno): os dois ficam
   sólidos, **separados por 1.5 limpo**. Esse fosso de 1.5 também é escrito na linha, onde o de
   trás é cortado.
6. **Ícone aberto, sem silhueta fechada** (flow, dots): o cheio **preenche o elemento-chave** e
   mantém o resto. No flow, o anel do "agora" vira disco. No dots, a geometria é a mesma, só
   preenchida: os três discos de Ø3 continuam Ø3, porque na tab bar do iOS o "Mais" ativo muda
   de cor e não de forma.
7. **Tudo que tem furo vai num `<path fill-rule="evenodd">` só**, com os furos como subcaminhos
   do mesmo `d`. Peças sólidas avulsas (argolas) podem ser `<rect>`/`<circle>` à parte.
8. Nenhuma sobra entre furo e borda pode ficar abaixo de **1.5** de tinta. Se ficar, o furo sai.

Referência: `calendar` e `chat` mostram os passos 1 a 4 feitos à mão.

---

## 3. "Cara de IA": proibido

| Proibido | Por quê / o que fazer |
|---|---|
| Sparkle, estrelinha, brilho, "✦" | É o carimbo de "feito por IA". Some do app (ver brief do `sparkle`) |
| Robô, antena, olhos de LED, rosto em caixa | A MAISA é uma secretária, não uma máquina |
| Cérebro, varinha, chapéu de mágico, raio de "turbo" | Metáfora de marketing, não de função |
| Gradiente, opacidade, duas cores, sombra | O ícone é uma cor só, `currentColor` |
| Enfeite: tracinho de movimento, brilhinho, ponto decorativo | Todo elemento responde "o que ele diz?" |
| Bézier desleixada: curva com quina escondida, alça torta, "quase círculo" | Use `<circle>`/arco. Bézier só onde o arco não chega |
| Ponto solto sem função | Ponto só nos dois tamanhos da 1.4, e com significado |
| Comprimento arbitrário (linhas de 5.5, 4.4, 3.4) | Comprimento de detalhe = 1/1, 2/3 ou 1/2 do principal |
| Decimal demais (`2.33`, `3.1`, `.48`) | Grade de 0.25 |
| Assimetria sem motivo | Espelhe em x=12, ou escreva em `notas` o motivo |
| Tudo arredondado igual (rx 3 em tudo) | rx 1.5, vértice agudo onde o objeto é agudo |
| Metáfora genérica de template (engrenagem para qualquer coisa) | Desenhe o objeto que aquela tela É |
| Copiar o formato do Lucide/Feather (a mesma lupa, o mesmo sino) | Parta das formas-base e das referências daqui |

---

## 4. As três referências (a âncora visual)

Desenhe cada um ampliado em 192px, sobre as guias, antes de desenhar o seu.

- **calendar** (quadrado + apêndices + cheio com fenda e furo). Corpo `rect 4,5 16×15.5`;
  cabeçalho em y=9.5; argolas em x=8/16 de y=3 a 6.5; ponto Ø3 em (16,15.5), sob a argola.
- **chat** (paisagem, `path` com vértice agudo a 45°, cheio com offset calculado). Corpo x 3..21,
  y 4..16.5; rabicho vertical em x=7.5 até y=20, volta a 45° até (11,16.5); linhas de 9 e 6.
- **search** (círculo de objeto + diagonal, sem cheio). Lente `circle 11,11 r7`; cabo de
  (16,16) a (20.5,20.5), nascendo no aro.

Os três têm a mesma "mão": 1.5, rx 1.5, junções limpas, nada fora de 0/45/90, caixa centrada.
Seu ícone, lado a lado com eles, não pode parecer de outra família.

**Módulos compartilhados (use estes números, para sair igual):**
- **Pessoa:** cabeça `circle cx=12 cy=7 r=3.5`; ombros `M5 20.5 A7 7 0 0 1 19 20.5` (vão limpo
  de 1.5 entre cabeça e ombros). Para reduzir, escale os dois juntos e mantenha o vão de 1.5
  limpo.
- **Ponta de seta:** dois braços a 45°. **Avanço 6 por eixo** quando a seta é o ícone (chevron,
  arrow). **Avanço 4** quando a seta é parte de outro ícone (download, undo, refresh, send).
- **Linha de texto dentro de objeto:** principal com o comprimento que fica simétrico no objeto,
  secundária com 2/3 dela, **3.5 entre as linhas**, alinhadas à esquerda.
- **Moldura de papel (retrato):** `x 5..19`, topo em y=3, rx 1.5.

---

## 5. Os briefs, um por ícone

Formato: **Onde / o que significa** · **Metáfora** · **Base** · **Evitar**. Antes de desenhar,
rode o grep (`grep -rn '"<nome>"' src --include='*.tsx'`)
e confirme o uso. Os usos abaixo foram medidos em 28/09/2026.

### 5.1 A navegação como conjunto (os 10 com cheio)

O rail, em ordem: **flow · chat · calendar** | **clientes · receipt** | **equipe · tag · bot ·
dots**. As abas do celular: flow, chat, calendar, clientes, dots. O `config` aparece na lista do
Mais. A 21px no navy, a pessoa distingue os dez **pela silhueta, antes do detalhe**. Então cada um
tem um contorno que nenhum outro tem:

| Ícone | Silhueta à distância |
|---|---|
| flow | **aberto**: linhas horizontais com um anel à esquerda, sem moldura |
| chat | **paisagem com rabicho** embaixo à esquerda |
| calendar | **quadrado com dois dentes** em cima |
| clientes | **retrato** (caderno) com uma pessoa dentro e lombada |
| receipt | **retrato com serrilha** embaixo |
| config | **retrato com canto dobrado** em cima à direita |
| equipe | **aberto, largo**: duas pessoas, uma atrás |
| tag | **diagonal** (a única inclinada da barra) |
| bot | **arco com duas conchas** (fone), a única forma em U invertido |
| dots | **três discos**, a única sem traço |

Três retratos (clientes, receipt, config) é o limite: o que os separa é a borda de baixo (reta
com lombada, serrilha, reta com canto dobrado em cima). Ninguém mais usa retrato na navegação.

### 5.2 Briefs

**flow** · *Onde:* rail e primeira aba ("Fluxo de hoje" / "Hoje"), paleta. A tela é a lista do
dia **cortada pelo agora**: a faixa AGORA com quem está em atendimento e o próximo, e as linhas
por hora. Não é mais um kanban desde 25/09. · *Metáfora:* a lista do dia com o marcador do agora.
São três linhas horizontais (as horas) à direita, e na do meio um anel à esquerda: "você está
aqui". · *Base:* aberto, dentro de 3..21 × 5..19. O anel em Ø5 de centro (r 2.5) na altura da
linha do meio, as linhas começando depois do anel com vão de 1.5, a do meio mais comprida ou
todas iguais (decida medindo). · *Cheio:* o anel vira disco sólido com o mesmo contorno externo, e
as linhas viram cápsulas sólidas. · *Evitar:* colunas de kanban (a tela não é mais isso), três
linhas decrescentes centradas (é o `filter`), relógio (é o `clock`), sol ou nascer do sol.

**chat** · *Onde:* rail e aba "Conversas", paleta, passo "Ver funcionando", modo "Ela conversa e
marca sozinha", cartão "Precisa de ajuda?" no Mais. Significa as conversas dos clientes com a
MAISA. · *Metáfora:* balão retangular com rabicho. · **REFERÊNCIA, já desenhado.** · *Evitar:*
balão redondo (é o `whatsapp`), três pontinhos de "digitando".

**calendar** · *Onde:* rail e aba "Agenda", paleta, botão "Abrir a Agenda", selo da agenda no
laboratório, estado da agenda (troca com o alert). · *Metáfora:* folha de calendário com um dia
marcado. · **REFERÊNCIA, já desenhado.**

**clientes** · *Onde:* rail e aba "Clientes", "Meus contatos" (quem a MAISA atende), botões "Quem
a MAISA atende" e "De quem é esse número". Significa a carteira de clientes, **o caderno** (é a
palavra do app para a agenda de contatos). · *Metáfora:* caderno de contatos, com a capa em
retrato, uma pessoa (módulo pessoa reduzido) no centro-alto da capa e a lombada como traço
vertical interno junto à borda esquerda. · *Base:* retrato 5..19 × 3..21, rx 1.5. · *Cheio:* capa
sólida, pessoa vazada (cabeça e ombros como furos, com o vão de 1.5 entre eles preservado),
lombada como fenda. · *Evitar:* cartão paisagem com pessoa e linhas (lê como "cartão de
crédito/ID"), duas pessoas (é a `equipe`), pessoa solta (é o `user`).

**receipt** · *Onde:* rail "Fiscal" (recibos e notas do mês), passo "Nota fiscal", modo "Só quero
emitir recibo ou nota", opção "Tenho CNPJ", botão "Continuar para emissão", stat "pagamentos no
arquivo". Significa o documento que sai depois do atendimento. · *Metáfora:* recibo de papel com
serrilha embaixo e duas linhas de texto. · *Base:* retrato 5..19 × 3..21, topo com cantos r 1.5,
laterais retas. **A serrilha tem dentes a 45° de passo igual, com vale e pico em coordenadas
inteiras** (ex.: 14 de largura = 4 dentes de 3.5, ou 7 de 2; escolha e anote). A primeira ponta e
a última encostam nas laterais. · *Cheio:* papel sólido com a serrilha idêntica, linhas vazadas.
· *Evitar:* "$" ou "R$" (texto dentro de ícone), dentes de 2.33, serrilha em curva, dobra no
canto (é o `config`).

**config** · *Onde:* **só** "Documento fiscal" (Mais, paleta, título da tela): escolher entre nota
fiscal e recibo do Receita Saúde e preencher os dados de quem emite. Não há outra tela de ajustes
com esse ícone. · *Metáfora:* **a folha de documento com canto dobrado** e duas linhas. É o
"documento" universal, e é exatamente o que a tela escolhe. · *Base:* retrato 5..19 × 3..21. O
canto superior direito é cortado a 45° (4 por eixo), com a dobra desenhada como o triângulo
interno. As linhas ficam abaixo da dobra. · *Cheio:* folha sólida, a dobra separada do corpo por
fenda de 1.5, linhas vazadas. · *Evitar:* engrenagem (diz "configurações" e mente sobre a tela),
sliders, qualquer coisa que se confunda com o `receipt`. · **Integrador:** registre como
`"documento"` e troque os 3 usos. `config` com desenho de documento é armadilha para quem
procurar "configurações" no futuro.

**equipe** · *Onde:* rail "Equipe" (quem atende e quando), paleta, Mais, "Adicionar
profissional". · *Metáfora:* duas pessoas, a da frente inteira (módulo pessoa, levemente à
esquerda) e a de trás à direita, mais alta. **A de trás é cortada com 1.5 limpo** em volta da
cabeça e do ombro da frente (não se cruzam). · *Base:* aberto, área viva inteira, massa centrada.
· *Cheio:* as duas sólidas, fosso de 1.5 entre elas. · *Evitar:* três pessoas, a de trás
desenhada como "meio parêntese" solto (o antigo), pessoas de tamanho igual lado a lado (lê como
"casal"), gênero marcado (saia, cabelo).

**tag** · *Onde:* rail "Serviços" (o que você oferece e por quanto), itens de serviço na paleta,
gaveta de serviço. · *Metáfora:* etiqueta de preço inclinada a 45°, com o furo do cordão. ·
*Base:* diagonal. Corpo com lados a 0/90° girado (o bico aponta para o canto inferior direito ou
superior esquerdo, escolha e mantenha), bico agudo a 45°, furo = anel `<circle r="1.5">` (1.5 limpo
por dentro), centrado no eixo da diagonal. · *Cheio:* etiqueta sólida, furo vazado com o diâmetro externo do anel (Ø4.5). · *Evitar:* o
path antigo com `20.59/13.41` (é o Lucide), cordão desenhado, símbolo de moeda.

**bot → "A MAISA"** · *Onde:* rail "A MAISA" → "Ajustes da MAISA" (tom de voz, horários, o que
ela pode fazer), Mais, paleta, e **como assinatura da MAISA nas mensagens** (Conversas, linha
355: marca o que ela respondeu) e no laboratório (selo do modelo, falas dela). São 21 usos.
Representa a própria MAISA, a secretária. · **Decisão: fone de atendimento (headset).** Arco de
cabeça, duas conchas e a haste do microfone saindo da concha direita até a frente, terminando num
ponto Ø2. · *Por quê:* é o objeto da **recepcionista/secretária que atende**, e é isso que a
MAISA é para o dono. Funciona como assinatura de mensagem ("quem atendeu") e como item de
ajustes ("como ela atende"). Não é robô, não é "IA", e a silhueta (U invertido) não existe em
nenhum outro ícone da barra. · *Rejeitados:* **o "m" da marca**, porque o rail já abre com o selo
"m" logo acima, e o item repetiria o logo a dois centímetros, lido como "início". **Balão com
traço de voz**, porque seria o terceiro balão (chat, whatsapp). **Sineta de balcão**, porque
colide com o `bell` (lembrete) no mesmo wizard. · *Base:* círculo. O arco é o semicírculo de r 7
centrado em (12,12.5). As conchas são `rect` retrato 4×6 de centro, rx 1.5, centradas nas pontas
do arco. A haste é um arco de r 0.5-múltiplo da base da concha direita até x≈12, com o
ponto dentro do vão de 1.5. · *Cheio:* conchas sólidas, arco e haste iguais (já são traço). Esse é
o elemento-chave que enche. · *Evitar:* antena, olhos, rosto dentro do arco, onda sonora,
microfone de podcast, fone de música sem haste (lê "áudio").

**dots** · *Onde:* rail e aba "Mais" (plano, conexões e suporte), menu "Mais ações" da gaveta no
celular, menu da conversa. · *Metáfora:* reticências. · *Base:* três `<circle r="0.75">` (disco
Ø3) em y=12, x = 6, 12, 18 (centro a centro 6). · *Cheio:* três `<circle r="1.5">` de fill, a
mesma tinta (ver 2.2 passo 6). · *Evitar:* discos de tamanhos diferentes, vertical, anéis.

---

**sparkle → some do app** · *Os 7 usos, medidos:*
1. `Contatos.tsx:319`, aviso âmbar "Este número está como só do negócio…" → **`alert`**
2. `cadastro/page.tsx:350`, aviso âmbar "Cadastro ainda não ativado" → **`alert`**
3. `login/page.tsx:91`, aviso âmbar "Login ainda não ativado" → **`alert`**
4. `LigarNotaFiscal.tsx:520`, botão "Emitir valendo a partir de agora" (irreversível) → **sem
   ícone.** Ação irreversível não se enfeita, e o texto basta.
5. `JornadaDeAtivacao.tsx:150`, passo "Negócio criado · Sua conta está de pé" → **`negocio`**
6. `Comecar.tsx:100`, vertical "Outro tipo · catálogo neutro", ao lado de tesoura e estetoscópio
   → **`negocio`**
7. `guardas/icones.test.ts:87` é o guarda que proíbe o fallback. Continua valendo, não é uso.

· *O que foi desenhado no lugar:* **a fachada de um negócio** (loja pequena). Um
toldo como faixa no topo, com 3 ou 4 gomos por traços verticais, **retos** e sem babado de arcos.
O corpo é um `rect` abaixo, com uma porta (retângulo aberto embaixo, centrado ou deslocado à
direita, com motivo anotado). É o "seu negócio, qualquer que seja", honesto para os usos 5 e 6.
· *Base:* quadrado 4..20. · *Cheio:* null. · *Evitar:* estrela, brilho, loja de e-commerce
(carrinho, sacola), prédio de escritório. · **Integrador:** registre como `"negocio"`, apague a
chave `sparkle`, troque os usos 1 a 6 como acima.

---

**whatsapp** · *Onde:* passo "WhatsApp", botões "Conectar WhatsApp", "Falar com o suporte" (fundo
verde) e o cartão de conexões. É marca de terceiros. · *Metáfora:* a forma reconhecível do balão
redondo com o rabicho embaixo à esquerda e o fone dentro, **simplificada ao peso 1.5**. Não copie
o logotipo detalhado. · *Base:* círculo (`r` 8.5–9 de centro, centro deslocado para cima-direita
para caber o rabicho). O rabicho sai a 45° ou 30° do contorno (anote qual). **O fone é o `phone`
desta família, reduzido**: um só `path` com no máximo 2 arcos e 4 retas, simétrico na sua diagonal
e com 1.5 de vão para o balão. · *Cheio:* null. · *Evitar:* o fone antigo (Bézier com 30
decimais, o pior caso de "cara de IA"), fone solto flutuando torto, verde (cor é do botão).

**alert** · *Onde:* 29 usos. Avisos âmbar, erros, "falta", impedimentos, troca com check/clock
em estados. Significa "atenção, falta algo". · *Metáfora:* triângulo de aviso com exclamação.
· *Base:* diagonal. O triângulo usa a área viva inteira na largura (as pontas perdem massa). Os
vértices são arredondados pela junção, **não** com arco de r 1.8 (o antigo). A haste é vertical,
com o pingo `<circle r="0.25">` 1.5 limpo abaixo. A caixa fica centrada no vertical (o triângulo
pesa embaixo: suba 0.5). · *Evitar:* círculo com exclamação (vira "info"), haste encostando no
pingo.

**check** · *Onde:* 32 usos. Checkbox, pronto, confirmado, copiado, feito. · *Metáfora:* visto.
· *Base:* `M5 12.5 L9.5 17 L19 7.5` (braços a 45°, curto 4.5 e longo 9.5 por eixo). Não mude sem
motivo. · *Evitar:* visto dentro de círculo, curva.

**x** · *Onde:* fechar gaveta/modal, erro no laboratório. · *Base:* `M6.5 6.5 L17.5 17.5 M17.5
6.5 L6.5 17.5`. É menor que o `plus` de propósito, porque a diagonal pesa mais.

**plus** · *Onde:* "Novo cliente", "Marcar atendimento", "Novo serviço", "Adicionar profissional",
"＋" do topo. · *Base:* `M12 5 V19 M5 12 H19`.

**chevron-right** · *Onde:* "abrir" em linhas de lista, próximo período da Agenda, jornada.
· *Base:* `M9 6 L15 12 L9 18`. **chevron-left:** `M15 6 L9 12 L15 18` (voltar, período
anterior). **chevron-down:** `M6 9 L12 15 L18 9` (expandir, "Mais ações", gira 180° para
recolher, então a caixa precisa ficar centrada em y=12).

**arrow-right** · *Onde:* "abrir e editar" nos cartões, item ativo da paleta, próximos passos do
lote. · *Base:* `M4.5 12 H19.5 M13.5 6 L19.5 12 L13.5 18` (ponta com avanço 6).

**user** · *Onde:* sem uso literal no app hoje (28/09). Desenhe mesmo assim, porque é o módulo
pessoa de referência para `clientes` e `equipe`: **desenhe primeiro**. · *Metáfora:* busto
neutro. · *Base:* exatamente o módulo pessoa da seção 4. · *Evitar:* pescoço, ombros com quina,
gênero.

**link** · *Onde:* "Abrir meu Carnê-Leão" (site externo), estado "falta fazer no e-CAC" no lote.
Significa "abre um lugar de fora". · *Metáfora:* dois elos de corrente a 45°, cada elo uma
cápsula (pista de corrida) com as retas paralelas à diagonal, entrelaçados. **O elo de trás é
cortado com 1.5 limpo** onde passa sob o da frente. · *Base:* diagonal. · *Evitar:* dois "U" com
Bézier (o antigo), seta de sair.

**search** · *Onde:* busca do topo, paleta de comandos. · **REFERÊNCIA, já desenhado.**

**clock** · *Onde:* "com a gente" (esperando), impedimento de horário, horário anunciado,
aguardando no wizard. · *Metáfora:* relógio de ponteiros. · *Base:* círculo `r=9`. Ponteiros de
(12,12): o das horas para 12h (até y=7), o dos minutos até 3h, **ou** horas para 10h a 45°. Sem
marcações de hora. · *Evitar:* ponteiro de 5 com ângulo arbitrário (o antigo, `15 14.5`), círculo
menor que r 9, ponto central.

**send** · *Onde:* enviar mensagem (Conversas, preview da MAISA, laboratório, wizard). · *Metáfora:*
avião de papel. · *Base:* diagonal, apontando para o canto superior direito. Um contorno fechado
(o avião) e uma dobra: o traço interno do bico até o centro da base, sem sair do contorno.
Ângulo do bico a 45°, asas simétricas na diagonal. · *Evitar:* traço interno que atravessa o
contorno (o antigo), seta reta.

**download** · *Onde:* "Gerar/baixar arquivo" do lote, "Baixar de novo", "Trazer meus contatos do
WhatsApp" (importar). · *Metáfora:* seta para baixo sobre a linha de base (bandeja). · *Base:*
vertical, haste de y=4 a 15, ponta com avanço 4, base `M5 19.5 H19` ou bandeja em U raso com rx
1.5. Suba 0.5 (pesa embaixo, é o exemplo da Apple). · *Evitar:* nuvem, seta comprida sem base.

**target** · *Onde:* sem uso literal hoje. · *Metáfora:* alvo de dois anéis e o centro. · *Base:*
círculo r 9, anel r 5, centro `<circle r="0.75">`. O vão entre os anéis é ≥ 3 de centro (4 é
melhor). · *Evitar:* anel com vão menor que 1.5 limpo, o `r=".6"` antigo.

**edit** · *Onde:* "Preencher meus dados", editar pergunta frequente. · *Metáfora:* lápis a 45°.
· *Base:* diagonal. O corpo é uma cápsula de largura 3–4 de centro, com a ponta triangular a 45°
e o anel da borracha (um traço perpendicular). · *Evitar:* lápis com traço de "rabisco", linha de
base (o `edit` antigo misturava).

**trash** · *Onde:* remover pergunta, remover item do lote, limpar no laboratório. · *Metáfora:*
lixeira. · *Base:* retrato. Tampa como traço horizontal de largura cheia com a alça (U raso,
rx 1.5), corpo em trapézio leve **ou** retângulo, com os lados a 90° ou a um ângulo exato (anote).
Duas ranhuras verticais com o vão da 1.4. · *Evitar:* corpo com curvas de Bézier (o antigo),
três ranhuras.

**calendar-check** · *Onde:* "Conexões → Google Calendar" (a faixa do topo), agendamento
confirmado no laboratório e no wizard. · *Metáfora:* o `calendar` de referência **com o ponto
trocado por um visto** no corpo. · *Base:* copie o corpo, o cabeçalho e as argolas do
o `calendar` coordenada por coordenada. O visto usa a proporção do `check`, reduzida, e fica
centrado no corpo abaixo do cabeçalho. · *Cheio:* null. · *Evitar:* redesenhar o corpo.

**scissors** · *Onde:* passo "Seus preços" (onboarding), vertical "Barbearia ou salão". · *Metáfora:*
tesoura aberta. · *Base:* diagonal/aberto. Dois anéis `<circle>` iguais embaixo à esquerda
(ou à esquerda), lâminas retas que se cruzam num eixo. **A lâmina de trás é cortada** no
cruzamento, 1.5 limpo. Ângulo de abertura de 30° ou 45° (anote). · *Evitar:* o tracinho solto do
eixo (o antigo `M11 12l2.2-1.9`), anéis de tamanhos diferentes.

**card** · *Onde:* linha do plano/assinatura no Mais, stat "valor" do lote. · *Metáfora:* cartão
de pagamento. · *Base:* paisagem 3..21 × 5..19, rx 1.5. Uma tarja horizontal (traço) a 1/3 da
altura e uma linha curta embaixo à esquerda (o número). · *Evitar:* chip desenhado, "rx 3" (o
antigo).

**pin** · *Onde:* **Agenda, blocos de compromisso vindos da agenda do Google** (dentista, almoço),
a 12px e 16px, em cinza. Não é endereço. · *Metáfora:* **alfinete de mural (tachinha)**:
"compromisso preso na sua agenda, não é atendimento". · *Base:* vertical, cabeça em cima (disco
ou trapézio), agulha reta embaixo, um pouco inclinada a 45° **ou** vertical (anote). Tem de ler a
12px: no máximo 3 primitivas. · *Evitar:* gota de mapa (o antigo, diz "local"), cadeado.

**stethoscope** · *Onde:* vertical "Consultório ou clínica", opção "Atendo como pessoa física"
(recibo do Receita Saúde). · *Metáfora:* estetoscópio. · *Base:* aberto. Os dois tubos da
auricular em U (um arco de r 0.5-múltiplo), o tubo descendo e voltando em arco até o diafragma
(`<circle>` com anel). O diafragma à direita, simétrico ao U quando der. · *Evitar:* cruz médica,
coração, o `v1.7` solto do antigo.

**eye** / **eye-off** · *Onde:* mostrar/ocultar senha (19px). · *Metáfora:* olho amendoado com
pupila. · *Base:* paisagem. A amêndoa é **dois arcos de mesmo raio**, simétricos em y=12, com
pontas agudas em x=2.5/21.5. A pupila é `circle r=3`. **eye-off:** o mesmo olho, com a barra de
(4,4) a (20,20) e o olho **cortado com 1.5 limpo** em volta da barra. Não reescreva o olho: corte
os mesmos arcos. · *Evitar:* o olho redesenhado em 3 pedaços com `17.6/16.8` (o antigo), cílios.

**faq** · *Onde:* sem uso literal hoje (as gavetas de FAQ saíram em 25/09). · *Metáfora:* balão
com ponto de interrogação, usando **o corpo do `chat`** (copie o path) com a interrogação no lugar
das linhas: arco de r 2 + haste curta + pingo `r=0.25`. · *Evitar:* livro aberto (o antigo),
"?" solto.

**bell** · *Onde:* modo "Minha agenda é fixa" (ela só manda lembrete e avisa quando o recibo sai).
Significa lembrete. · *Metáfora:* sino. · *Base:* retrato. O corpo é simétrico em x=12, com o
ombro em arco e as laterais retas ou levemente abertas até uma aba horizontal. O badalo é um arco
curto abaixo, com 1.5 limpo. Suba 0.5. · *Evitar:* ondas de vibração, ponto de notificação.

**filter** · *Onde:* sem uso literal hoje. · *Metáfora:* três linhas centradas decrescentes
(1, 2/3, 1/3), a 3.5 uma da outra, centradas em y=12. · *Evitar:* funil.

**phone** · *Onde:* "Código enviado para (11) 9…" no pareamento. Significa o número/celular.
· *Metáfora:* **celular** (o aparelho), não o fone de gancho, porque o que se mostra é o número do
celular que recebe o código. · *Base:* retrato estreito (x 7..17 × 3..21), rx 1.5, uma linha curta
centrada embaixo (a barra de início). · *Evitar:* fone de gancho (o `whatsapp` já tem um),
entalhe detalhado, botões.

**copy** · *Onde:* copiar o código de pareamento (troca com check). · *Metáfora:* duas folhas.
· *Base:* quadrado. A da frente é um `rect` inteiro embaixo à direita. A de trás só aparece como
um L (topo e esquerda) com 1.5 limpo da frente. **Não desenhe a de trás inteira passando por
baixo.** As duas com rx 1.5. · *Evitar:* raios 2.5 (o antigo).

**refresh** · *Onde:* **gira como spinner** durante a emissão (`mspin`) e significa "tentar de
novo". · *Metáfora:* duas setas em arco, circulando. · *Base:* círculo r 7–8. **Simetria
rotacional exata de 180° em torno de (12,12)**, senão ele bamboleia girando. As pontas usam o
avanço 4. · *Evitar:* arcos com raios diferentes, ponta desencontrada do arco (o antigo).

**undo** · *Onde:* "Descartar" o lote gerado (volta ao estado anterior). · *Metáfora:* seta que
volta. · *Base:* aberto. A seta sai para a esquerda (ponta com avanço 4), a haste horizontal
dobra num semicírculo `A` de raio inteiro e termina em traço reto. · *Evitar:* círculo quase
fechado (é o `refresh`).

---

## 6. Checklist de aprovação

Desenhe o ícone em 192px sobre as guias e em 16/20/24px no claro e no navy do rail, e **olhe**. Só entregue
quando todos passarem:

- [ ] **Área viva:** no 192px, nenhuma tinta passa do quadrado vermelho externo (2..22).
- [ ] **Forma-base:** a forma principal encosta por dentro da guia da sua forma (círculo,
      quadrado, retrato ou paisagem), sem passar e sem sobrar mais que 0.5.
- [ ] **Peso:** na faixa "vizinhos", o seu ícone não parece mais escuro nem mais claro que
      calendar/chat/search. Se parecer mais escuro, tem elemento demais.
- [ ] **16px no claro e no navy:** a metáfora se lê, nenhum vão fecha, nada vira borrão.
- [ ] **Vãos:** todo vão entre tintas tem ≥ 1.5 limpo (no 192px, ≥ 12px de ar).
- [ ] **Traço não cruza traço.** Onde um passa atrás, está cortado.
- [ ] **Junções:** nenhum traço termina um pouco antes ou um pouco depois de onde deveria. No 192px
      não aparece "dente" nem "fresta" em junção.
- [ ] **Ângulos:** retas só a 0/45/90 (ou a exceção anotada).
- [ ] **Centro:** caixa da tinta centrada em 12 ± 0.25 (ou a compensação da 1.8, anotada).
- [ ] **Simetria:** se o objeto é simétrico, os números espelham exatamente em x=12.
- [ ] **Contagem:** silhueta + ≤ 3 detalhes + ≤ 2 apêndices (aberto: ≤ 5 primitivas).
- [ ] **Precisão:** toda coordenada é múltiplo de 0.25, rx é 1.5, pontos são `r=0.25` ou
      `r=0.75`, círculo é `<circle>`.
- [ ] **Cheio (só os 10):** mesma caixa de tinta da linha, detalhes vazados, nenhuma sobra de
      tinta menor que 1.5. Na faixa "rail", o cheio branco não parece maior que o contorno cinza.
- [ ] **Antigo x novo:** o novo é mais simples ou igual, nunca mais cheio de coisa.
- [ ] **Nada da seção 3.**
- [ ] JSON válido com `nome`, `linha`, `cheio` (ou null), `metafora` (uma frase: o objeto) e
      `notas` (as decisões com números, as exceções e o porquê).

## 7. Erros típicos de SVG feito à mão por IA, e como vê-los ampliado

| Erro | Como aparece em 192px | Conserto |
|---|---|---|
| Junção que não fecha (`L` para 11.9 em vez de 12) | fresta ou dente na quina no 192px | coordenadas iguais nos dois lados |
| Traço que passa do alvo | "espinho" saindo da junção | termine na linha de centro do outro |
| Arco com flag `sweep` trocada | a curva abaulada para o lado errado | inverta o 5º parâmetro do `A` |
| Arco com raio menor que meia corda | o navegador aumenta o raio e vira semicírculo | raio ≥ corda/2 |
| Bézier com alças não colineares | quina escondida no meio da curva | use arco, ou alinhe as alças |
| Círculo feito de 4 curvas | "ovo", achatado num eixo | `<circle>` |
| Subcaminho do cheio no sentido errado sem evenodd | o furo não vaza | `fill-rule="evenodd"` no path que tem furo |
| Furo do cheio em elemento separado | o furo aparece sólido | furo dentro do mesmo `d` |
| Cheio desenhado sobre a linha de centro | o ativo fica 0.75 menor que o contorno ("encolhe" ao clicar) | desloque 0.75 para fora |
| Elementos perto demais | a 16px dois traços viram um borrão | distância de centro ≥ 3 |
| Detalhe menor que o mínimo | pontinho sujo, "poeira" a 16px | apague ou use os pontos da 1.4 |
| Decimais aleatórios | nada visível, mas denuncia no código | grade de 0.25, releia o `d` |
| Assimetria de 0.1 | no 192px um lado mais gordo | espelhe os números |
| Tudo desenhado na caixa 0..24 | ícone maior que os vizinhos, encostando na borda | área viva 2..22 |

---

*Referências desenhadas e verificadas em 28/09/2026: `calendar`, `chat`, `search`. Espec escrita
pelo diretor de arte. Emenda: só com uma medição que a justifique.*
