> Espec dos avatares da MAISA (28/09/2026), a regra que os 16 ilustradores seguiram. O tênis de corrida
> ficou fora do conjunto. O código dos desenhos mora em `src/ui/avatares.ts`.

# Avatares da MAISA — espec única

Dezesseis avatares, dezesseis ilustradores, uma mão só. Cada pessoa cadastrada na MAISA (cliente,
membro da equipe, dono) recebe um destes no lugar das iniciais em pastel. O espírito é o das
fotos de perfil de console: **um** personagem ou objeto carismático, grande, sobre cor chapada,
que se reconhece de longe. O desenho é nosso. Não copie, não "homenageie" e não redesenhe
nenhuma gamerpic, mascote ou personagem existente.

**Âncoras.** Antes de começar, abra os dois avatares de referência. Eles valem mais que qualquer
frase desta espec. Em caso de dúvida, faça como eles fizeram:

- `svg/gato.svg`: a âncora de **bicho**. Rosto padrão, receita A de sombra, orelha em triângulo.
- `svg/xicara-de-cafe.svg`: a âncora de **objeto**. Sem rosto, receita B e receita C de sombra,
  traço de 3 no vapor, furo pintado com a cor do fundo.

```
```

Não dê o avatar por pronto sem abrir o PNG e sem compará-lo com as duas âncoras na folha.

---

## 0. O arquivo

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#FUNDO"/>
  <!-- peças de trás (orelhas, alça, cauda) -->
  <!-- corpo: sombra inteira, depois a luz -->
  <!-- detalhes chapados -->
  <!-- rosto (só bicho) -->
</svg>
```

- `svg/<nome>.svg`, `<nome>` em kebab-case, sem acento (tabela da seção 3).
- O primeiro elemento é o `<rect width="64" height="64">` do fundo, sem `rx`.
- Elementos permitidos: `<rect>`, `<circle>`, `<ellipse>`, `<path>`, `<polygon>`, `<g>`.
- **Proibido:** gradiente, `filter`, `mask`, `clipPath`, `pattern`, `<text>`, `<image>`,
  `<use>`, qualquer `opacity`/`fill-opacity` abaixo de 1, `transform`, CSS, cor fora da paleta.
- Coordenadas com no máximo 1 casa decimal (o rosto usa as medidas exatas da seção 1.5).
- Ordem das camadas: fundo → o que fica atrás → corpo (sombra e depois luz) → detalhes → rosto.
- **Simetria é feita à mão:** a peça da direita é a da esquerda espelhada em x' = 64 − x.
  A orelha esquerda do gato vai de 13 a 33 e a direita de 31 a 51. A sombra quebra a simetria
  de propósito, e é a única coisa que pode quebrá-la.

---

## 1. Estilo

### 1.1 Forma
Geometria simples e **cheia**: círculo, elipse, retângulo de canto arredondado, triângulo, gota.
Cada peça é uma mancha sólida. Nada de linha fina fazendo contorno de nada. O personagem se
monta com 3 a 8 formas grandes e uns poucos detalhes. Se você precisou de mais de ~15
elementos, o desenho está complicado demais para 24px.

### 1.2 Contorno
**Não tem.** Nenhum `stroke` contornando forma. A figura se separa do fundo por contraste de cor
(regra da seção 2.3), e uma peça se separa da outra pela cor ou pelo tom de sombra.

`stroke` existe só para **o que é uma linha no mundo real**, sempre com `fill="none"`,
`stroke-linecap="round"` e cor da paleta:
- boca do bicho: espessura **2**, sempre tinta `#1B2233`;
- vapor, esguicho, raio de luz, costura de bola, cabo em J: espessura **3**.

### 1.3 Cores por avatar
No máximo **4 cores de personagem** (a tinta conta), mais o fundo. A sombra de cada cor é
derivada e não conta. O gato usa três (laranja, creme, tinta) e a xícara usa três (branco,
azul, marrom). Menos é melhor.

### 1.4 Sombra (o único volume que existe)
A luz vem **de cima, à esquerda**, e a sombra fica sempre **à direita e embaixo**. O tom de
sombra é o par fixo da cor (seção 2.2), nunca um preto translúcido e nunca um tom inventado.
A sombra entra só nas 1 a 3 maiores formas; os detalhes ficam chapados. Três receitas cobrem
tudo:

| Receita | Quando | Como | Onde ver |
|---|---|---|---|
| **A** (redonda) | círculo, elipse | a forma inteira no tom de sombra; por cima, a mesma forma com **rx − 3, ry − 3** e centro deslocado **(−2, −2)** na cor base | cabeça do gato: sombra `rx21 ry18 @32,36`, luz `rx18 ry15 @30,34` |
| **B** (reta) | retângulo, path de lados retos, triângulo | a forma inteira no tom de sombra; por cima, a mesma forma com a **borda direita** e a **borda de baixo** recolhidas **3** | corpo e faixa da xícara; orelhas do gato (só a borda direita recolhe) |
| **C** (pequena) | peça com menos de 8 de largura, ou peça que fica atrás/à direita do corpo | a peça **inteira** no tom de sombra, ou inteira na cor base. Nunca um crescente de 1 unidade | alça da xícara: inteira em sombra |

Não existe: sombra projetada no fundo, sombra de chão, brilho claro (highlight), reflexo,
ponto branco no olho, meio-tom entre base e sombra.

### 1.5 Rosto (só bicho; objeto, comida e planta nunca têm rosto)
Um padrão, idêntico nos seis bichos. Copie os números do `gato.svg`:

- **Olhos:** duas `<ellipse rx="2.6" ry="3.4">` em tinta `#1B2233`, na mesma altura, centros
  separados por **13** (cx ± 6.5 do eixo do rosto). Sem pupila, sem brilho, sem cílio, sem
  sobrancelha. Olhando para a frente.
- **Altura dos olhos:** na metade da cabeça ou 1 a 2 unidades acima (no gato: cabeça em y 36,
  olhos em y 34).
- **Boca:** `M(x−3) y Q x (y+3) (x+3) y`, traço 2, tinta, **10 unidades abaixo dos olhos**
  (gato: olhos em 34, boca em 44.2). Sorriso pequeno e sempre esse. Sem dente, sem língua, sem
  boca aberta.
- **Nariz:** só em mamífero de focinho (gato, raposa). Triângulo de tinta de 4.8 × 2.6, com o
  vértice para baixo, entre olho e boca.
- Sem bochecha rosada. Cabeça reta, de frente, simétrica.
- **Exceção única:** o sapo tem os olhos nos calombos do topo da cabeça, com os centros
  separados por **22**. O tamanho e a cor do olho continuam os do padrão.

### 1.6 Enquadramento e área de segurança
- O personagem ocupa **~70% do quadro**: a maior dimensão entre **42 e 46** unidades. A xícara
  mede 41,5 × 47 (o vapor, traço fino, pode passar o teto em até 1) e o gato 38 × 45.
- Centro visual em **(32, 30–34)**. Personagem alto pode subir um pouco, e bicho pode descer
  um pouco (a cabeça pesa).
- **Tudo o que identifica o tema fica dentro do círculo de raio 26 centrado em (32, 32).**
  Nada passa do raio 28, porque as listas recortam em círculo. Ponta de orelha, vapor e cabo
  podem chegar a 26–27, nunca além. Teste: ponto (x, y) → √((x−32)² + (y−32)²) ≤ 26.
- Nada encosta nas bordas do quadrado.
- Um personagem só. Sem cenário, sem chão, sem objeto de apoio, sem moldura.

### 1.7 O que precisa ler em 24px
Em 24px, uma unidade vale 0,375px. Então:
- **A silhueta sozinha tem de dizer o tema.** Pinte o personagem inteiro de preto mentalmente:
  se ainda der para saber que é uma xícara ou um gato, está bom.
- Qualquer detalhe que precise ser visto tem **≥ 3 unidades** no lado menor. O olho padrão
  (5,2 × 6,8) é o menor elemento que conta. Detalhe menor que isso é enfeite: tire.
- Em 24px o que tem de sobreviver é: a silhueta, a cor principal contra o fundo e os dois olhos
  (em bicho). Sombra, focinho e faixa podem sumir sem o avatar perder o sentido.

---

## 2. Paleta

### 2.1 Fundos (8)
Chapados, de luz média: aguentam um personagem claro ou escuro na frente e ficam ao lado do navy
do rail (`#15294F`) sem gritar e sem sumir. O fundo nunca leva sombra, textura ou segundo tom.
Ele também pinta os **furos** (miolo da alça, mordida do picolé, vão do cabo).

| Fundo | Hex |
|---|---|
| anil | `#4F7FD9` |
| turquesa | `#2FA7A0` |
| folha | `#4CAF6E` |
| lima | `#A3BE3C` |
| mostarda | `#E9B43C` |
| coral | `#EC7A5C` |
| framboesa | `#D8638F` |
| uva | `#8E6FD1` |

### 2.2 Cores de personagem (base / sombra)
Só estas cores entram, e cada uma só com a sua sombra.

| Cor | Base | Sombra |
|---|---|---|
| tinta | `#1B2233` | nenhuma (olho, boca, nariz, semente, costura) |
| grafite | `#3A4254` | `#262C3A` |
| branco | `#FFFFFF` | `#D9DEE8` |
| creme | `#F6E7C8` | `#E0C99D` |
| amarelo | `#FFD23F` | `#E6AE1F` |
| laranja | `#FF8A3D` | `#DB6A22` |
| vermelho | `#E8483B` | `#BF3226` |
| rosa | `#FF9BB5` | `#E07595` |
| verde-claro | `#BFE37A` | `#9CC756` |
| verde | `#3FBF6B` | `#2A9851` |
| verde-escuro | `#2E7D4F` | `#1F5E3A` |
| azul | `#3D8BFF` | `#2769D1` |
| marrom | `#9A5B34` | `#764223` |
| cinza | `#A7B0C0` | `#818BA0` |

### 2.3 Contraste figura/fundo
A cor que ocupa a maior área do personagem **não pode ser da família do fundo**:
- verde, verde-claro e verde-escuro não vão sobre folha, lima ou turquesa;
- azul não vai sobre anil nem turquesa;
- laranja, amarelo e vermelho não vão sobre coral nem mostarda;
- rosa não vai sobre framboesa nem coral.

Na dúvida, veja a linha de 24px do PNG: se a silhueta se desmancha no fundo, trocou-se a cor
errada.

---

## 3. Os 16 temas

Dois por fundo. As cores listadas são o máximo; pode usar menos. A coluna "diferença" diz o
que impede o tema de virar o vizinho.

| # | nome (arquivo) | tema | fundo | cores | silhueta | diferença |
|---|---|---|---|---|---|---|
| 1 | `gato` | gato (**âncora**) | turquesa | laranja, creme, tinta | cabeça larga + 2 orelhas em triângulo | focinho redondo creme; queixo redondo |
| 2 | `xicara-de-cafe` | caneca de café quente (**âncora**) | coral | branco, azul, marrom | cilindro + alça à direita + 2 fios de vapor | alça sempre à direita, no lado da sombra |
| 3 | `raposa` | raposa | uva | laranja, branco, tinta | cabeça em V (queixo pontudo), orelhas altas e finas | máscara branca nas bochechas descendo até o queixo; ponta das orelhas em tinta. Não pode parecer o gato |
| 4 | `coruja` | coruja | lima | marrom, creme, amarelo, tinta | ovo em pé + 2 tufos no topo | olhos padrão sobre 2 discos creme de raio 6; bico amarelo pequeno em losango |
| 5 | `pinguim` | pinguim | mostarda | grafite, branco, laranja, tinta | cápsula alta e estreita, asinhas coladas | rosto e barriga brancos num só coração/oval; bico laranja; pés laranja visíveis |
| 6 | `sapo` | sapo | uva | verde, creme, tinta | larga e baixa: cúpula com 2 calombos no topo | olhos nos calombos (exceção 1.5); barriga creme |
| 7 | `baleia` | baleia | lima | azul, branco, tinta | horizontal: gota deitada + cauda erguida à direita | esguicho branco em traço 3 saindo do topo; barriga branca; olhos padrão na frente |
| 8 | `cacto` | cacto no vaso | framboesa | verde, laranja, rosa | vertical: coluna com 2 braços desencontrados + vaso trapézio | uma flor rosa no topo; o vaso laranja é metade da altura do cacto, nunca mais |
| 9 | `abacate` | meio abacate | coral | verde-escuro, verde-claro, marrom | pera (gota de base larga) | caroço marrom redondo e grande no terço de baixo; casca verde-escura como borda de 3 |
| 10 | `melancia` | fatia de melancia | turquesa | vermelho, verde-escuro, branco, tinta | triângulo com a ponta para cima e a base curva | casca verde-escura na base curva, filete branco de 2, sementes tinta em gota (≥ 3) |
| 11 | `cogumelo` | cogumelo | folha | vermelho, branco, creme | cúpula larga sobre caule curto e grosso | 3 a 5 bolinhas brancas de raio ≥ 2,5 no chapéu; caule creme |
| 12 | `picole` | picolé | mostarda | rosa, marrom, creme | retângulo vertical de topo redondo + palito | mordida em arco no canto superior direito (pintada com o fundo); cobertura marrom no topo; palito creme |
| 13 | `bola-de-basquete` | bola de basquete | anil | laranja, tinta | círculo de raio 21 | costuras em traço 3 tinta: uma vertical, uma horizontal e 2 arcos laterais simétricos |
| 14 | `tenis-de-corrida` | tênis de corrida, de lado | folha | branco, vermelho, azul, cinza | horizontal e baixa, bico à esquerda, calcanhar à direita | sola cinza grossa; 2 faixas retas vermelhas no cabedal. **Nada** de risco curvo ou de 3 listras (lembra marca) |
| 15 | `guarda-chuva` | guarda-chuva aberto | framboesa | amarelo, marrom, cinza | cúpula de 3 gomos + cabo em J | cabo marrom em traço 3; ponteira cinza no topo; borda de baixo em arcos (recortada) |
| 16 | `lampada` | lâmpada acesa | anil | amarelo, cinza, branco | pera de cabeça para baixo + rosca | rosca cinza em 2 a 3 faixas; 3 raios curtos em traço 3 amarelo no topo (dentro do raio 26) |

Fundos: anil (13, 16), turquesa (1, 10), folha (11, 14), lima (4, 7), mostarda (5, 12),
coral (2, 9), framboesa (8, 15), uva (3, 6).

Neutros de propósito: nada de marca, logotipo, bandeira, time, religião, álcool, arma,
personagem conhecido, gesto de mão ou comida com carinha. Os objetos não têm rosto, e é isso que
impede o conjunto de ficar infantil para um consultório.

---

## 4. Checklist de aprovação

Só está pronto com tudo marcado:

**Arquivo**
- [ ] `viewBox="0 0 64 64"`, o primeiro filho é o `<rect width="64" height="64">` do fundo da
      tabela.
- [ ] `grep -nE 'gradient|filter|mask|clip|pattern|<text|<image|<use|opacity|transform' svg/<nome>.svg`
      não devolve nada.
- [ ] Todo hex está na seção 2, e toda sombra é o par da sua base.
- [ ] Tem no máximo 4 cores-base (tinta conta) e ~15 elementos.

**Desenho**
- [ ] Em 24px, no círculo, dá para dizer o tema sem saber o nome.
- [ ] A silhueta não se confunde com nenhum outro avatar da folha (gato × raposa, abacate ×
      lâmpada, bola × gato visto pequeno).
- [ ] A maior dimensão tem entre 42 e 46 e o centro visual fica perto de (32, 32).
- [ ] Nada que importe fica fora do raio 26 (confira na linha de 160px do círculo).
- [ ] A sombra está à direita e embaixo, com uma das receitas A/B/C, nas 1 a 3 maiores formas.
- [ ] Não há contorno; os traços são só os da seção 1.2, com espessura 2 ou 3.
- [ ] Bicho: olho, boca e (se couber) nariz têm os números exatos da 1.5, e são idênticos aos
      do gato quando postos lado a lado na folha.
- [ ] Objeto/comida/planta: sem rosto.
- [ ] Na folha, o avatar tem o mesmo "peso" das âncoras: nem mais miúdo que a xícara nem
      mais pesado que o gato.

## 5. Erros típicos de SVG ilustrado por IA (e como achar)

| Erro | Como aparece | Conserto |
|---|---|---|
| **Proporção torta** | cabeça ovalada sem querer, vaso maior que o cacto, alça do tamanho da caneca | meça as coordenadas; siga as proporções da coluna "diferença" |
| **Simetria quebrada** | uma orelha mais alta, olho a 6 de um lado e a 7 do outro | espelhe à mão: x' = 64 − x. Confira os pares de números |
| **Formas soltas** | peça flutuando a 0,5 do corpo, fresta de fundo entre cabeça e orelha, braço que não encosta | peças que se tocam **se sobrepõem** em ≥ 2 unidades; a de trás entra embaixo da da frente |
| **Crescente de sombra fantasma** | anel escuro fino no lado de cima/esquerda da forma (a luz deslocada errado) | use a receita A exata (−3 no raio, −2 −2 no centro); em peça pequena, receita C |
| **Sombra do lado errado** | sombra à esquerda ou em cima, ou cada peça com a luz de um lado | direita e embaixo, sempre |
| **Rosto diferente de um para o outro** | olho redondo num e oval no outro, boca maior, olho com brilho, sobrancelha | copie os números do `gato.svg`; nada além de olho, boca e nariz |
| **Detalhe que some em 24px** | sementinha de 1, listras finas, bigode de gato, texto no objeto | se tem < 3 unidades, sai |
| **Personagem pequeno** | figura ocupando 50% do quadro, fundo sobrando | maior dimensão entre 42 e 46 |
| **Personagem cortado pelo círculo** | orelha ou cabo sumindo no recorte | tudo dentro do raio 26 |
| **Cor inventada** | "um laranja um pouco mais claro", preto puro `#000`, sombra com opacity | só hex da seção 2 |
| **Mais de um personagem / cenário** | chão, nuvem atrás, sol no canto | um personagem, fundo chapado e mais nada |
| **Figura some no fundo** | verde sobre folha, azul sobre anil | regra 2.3 |
| **Path mal fechado** | ponta aberta, preenchimento vazando em diagonal | todo path de forma termina em `Z` |
