# `scripts/bancada/` — a régua do front

Scripts de Playwright que abrem o **demo** (`next dev` em `:3200`, sem `.env.local`, sem
Supabase) e medem a tela de verdade: altura do documento, o que rola, o que corta, onde está o
botão. Existem porque **jsdom não faz layout**: teste verde não prova tela certa, e um critério
de "pronto" do backlog do front só vale medido no Chrome, a 1440x900 **e** a 390x844.

Nasceram na auditoria do front de 24/09/2026 (uma pasta temporária por auditor) e vieram para
o repositório para que o critério medido hoje seja conferível na semana que vem.

## Como rodar

O Playwright **não** está no `package.json`, de propósito: o CI roda `npm ci` em toda branch e
não abre navegador nenhum. Instale à parte uma vez e aponte a variável:

```sh
npm i playwright@1.55 --prefix ~/.bancada
export BANCADA_PLAYWRIGHT=~/.bancada
node scripts/bancada/foto.mjs fluxo /tmp/fluxo.png desktop --medir
```

Usa o Chrome instalado (`channel: "chrome"`), sem baixar navegador.

⚠️ **Só contra o demo.** Os scripts falam com `http://localhost:3200`. Apontá-los para o dev de
`:3100` com o `.env.local` de produção faria os cliques gravarem no Supabase e na Evolution
reais. Os cenários simulados (`page.route`) respondem no navegador; nada sai para a rede.

⚠️ **Nunca `npm run build` com o dev no ar** para "conferir": o build clobbera o `.next` e a tela
perde o CSS. A foto sai sem estilo e parece defeito do código.

Os scripts que fotografam em lote gravam em `.bancada-fotos/<assunto>/` (ignorada pelo git) ou
em `BANCADA_FOTOS`, se definida. Foto não é versionada: git não esquece PNG.

## Os scripts

| Script | O que mede |
|---|---|
| `_comum.mjs` | Acha o Playwright e a pasta de saída. Todo script importa daqui. |
| `medir.mjs` | **A régua (G18).** `medir.mjs <tela> [desktop\|mobile]` imprime documento×viewport, regiões que rolam e a fração visível, a sonda de corte (`overflow:hidden` com conteúdo maior que a caixa), botões fora da tela, primários na dobra, pílulas que não clicam (raio de meia altura ou mais em algo que não é o próprio controle; contagem só com dígitos passa), alvos < 44px no celular, caracteres e travessões visíveis, altura do cabeçalho. `medir.mjs --lote <pasta>` faz as 11 telas e as 5 rotas de entrada nas duas larguras, com foto e `medidas.json`. |
| `foto.mjs` | Uma foto de uma tela ou rota; `--medir` imprime documento e rolagens, `--full` a página inteira. |
| `casca.mjs` … `casca6.mjs` | A casca: rail, topbar, abas, busca (posição da Paleta), rodapé da gaveta (`casca5`, 5 ações a 680 e 390). |
| `fluxo.mjs`, `fluxo2.mjs`, `fluxo3.mjs` | O Fluxo de hoje com dia cheio simulado. `--lento`, `--erroagenda`, `--vazio`, `--gaveta`, `--formado`; o `2` acrescenta `--rolar`, o `3` acrescenta `--meiodia` e `--hora=HH` (relógio do navegador parado em hoje, HH:00 de São Paulo) e conta "sem confirmação", "a confirmar" e "já cobrou" na tela. |
| `leitura.mjs` | **T3 e T4.** Uma tela com as leituras atrasadas (`--atraso=`), falhando (`--erro`) ou simuladas (`--canal=`, `--agenda=`, `--conversas=`, `--contatos=`, `--ativa=false`), amostrada a 150, 600 e 1200 ms e depois: quais frases que afirmam antes de saber estão visíveis ("Nenhum atendimento", "Nada pendente", "Conectar WhatsApp", "no ar"…), quantos "Tentar de novo" e o texto do cabeçalho. `--clicar=<nome>` clica num botão e fotografa de novo. |
| `fluxo-medidas.mjs` | Tamanho do cartão e dos botões do Fluxo em 1024, 1280, 1440 e 390. |
| `novo.mjs` | **T2.** As 11 telas numa largura: o rótulo do "＋" do celular, os botões com fundo `--primary` visíveis sem rolar (no máximo 1) e quantos cliques até a gaveta "Novo atendimento" (desktop: "Novo" e "Marcar atendimento"; celular: o "＋", o menu, ou a aba Agenda e o "＋"), com o dia, a hora e a pessoa em que o rascunho nasceu. Descarta sem gravar. |
| `gaveta.mjs` | **T6.** O rodapé da gaveta com as ações reais: `atendimento` (o de hoje com Meet, Google e conversa: as cinco ações que cortavam), `servico`, `cliente`, `profissional`. Mede cada botão contra a borda do painel e da tela, os de fundo `--primary`, o X, a alça; abre "Mais ações", toca UMA vez no destrutivo e diz se o aviso está na tela sem rolar e quantos `DELETE` saíram (respondidos no navegador). |
| `agenda-cheia.mjs` | A Agenda com cadastro, agenda e Google simulados. "Hoje" é o dia de verdade e a semana é a dele (até 25/09/2026 as datas eram fixas em 24/09). `cancelar` passa por "Mais ações" e mede o aviso de perigo (`avisoDePerigo`); `marcar` usa o slot da casca. `--rolar` rola 600px o que rola antes de medir; a saída traz `marcarNaCasca` (o "＋"/slot e se está na tela) e `livres` (as linhas "livre" tocáveis da lista do celular, 1B.4). `<cenario> <saida.png> [desktop\|mobile\|WxH] [--equipe] [--google=ok\|nao] [--falha=<pid>] [--valor=<n>]`. Responde um GET por agenda com os eventos daquele `pid` e imprime `getsAgenda`, `bloqueiosAlmoco`, `vagosPorPessoa` e o texto da gaveta aberta. `--valor` grava esse valor no atendimento de hoje com Meet; o cenário `passado` abre um atendimento de ontem. `remarcar` (1B.5): abre o primeiro atendimento de um dia que ainda vem, toca "Remarcar", escolhe 15:00 (ou o último vago), responde o PATCH no navegador com o mesmo `eventoId` e Meet, e conta o bloco no horário novo e no antigo; tira também `-escolha.png`. |
| `conversas-audit.mjs` … `-audit4.mjs` | Conversas com 30 conversas falsas; `audit2` mede a rolagem com o polling. `conversas-audit.mjs cabecalho` mede o nome da thread nos quatro estados a 375 e a 390 (1B.6); `whatsapp` registra a ordem entre o POST `assumir` e o `window.open` (interceptado) ao tocar ⋯ → "Abrir no WhatsApp" (1B.7); `semnumero` conta `a[href="https://wa.me/"]`, "Número incompleto" e o composer (1B.8), nas duas larguras. |
| `equipe-criar.mjs` | **1B.12.** Adiciona um profissional pelo slot "Adicionar profissional" (`--nome=`), confere a ficha aberta e a lista antes e depois do F5, renomeia pela ficha e confere de novo, e lista os `PUT /api/equipe`. ⚠️ **Grava no demo** (memória do `next dev`, sem banco) e não há como apagar: a pessoa termina pausada e some quando o dev reinicia. |
| `ficha-responde.mjs` | **1B.11.** A ficha da primeira cliente com o caderno simulado (`--modo=pessoal\|negocio`, `--marca=null\|false\|true\|fora`): o texto da faixa "A MAISA responde / não responde", o botão, e depois de tocar "Responder a …" a faixa de novo e o corpo do PATCH (respondido no navegador). |
| `contatos-portas.mjs` | **1B.9 e 1B.10.** ⌘K "contatos" e "documento" (desktop) e o Enter; o botão "Quem a MAISA atende" de Clientes; e o vazio de Contatos com o POST simulado (`novos: 374`): o que o botão diz enquanto lê, se a tela fica e se a lista aparece. `--modo=negocio\|pessoal`, `--canal=conectado\|desconectado`. |
| `clientes-audit.mjs`, `clientes-paleta2.mjs` | Clientes e Meus contatos com 200 clientes e 400 contatos; a busca da Paleta. |
| `fiscal.mjs` | Fiscal e Documento fiscal nos cenários `recibo-cheio`, `recibo-vazio`, `recibo-sem-registro`, `recibo-procuracao-vencida`, `cnpj`, `cnpj-sem-cert`, `nada-com-atend`, `nada`. `cenario+roda`, `+rolar`, `+doc`, `+botao:<nome>`, `+clicar:<texto>` encadeiam ações. `COMPETENCIA=2026-08-01,2026-09-01` reparte competências pelas linhas do faturamento (1A.10). |
| `ajustes.mjs`, `ajustes-parear.mjs`, `ajustes-texto.mjs` | Ajustes da MAISA: seções, pareamento por código, texto visível. |
| `ajustes-leitura.mjs` | Ajustes com `/api/assistente`, `/api/horarios`, `/api/cadastro` e `/api/canal` atrasados (`--atraso=`) ou falhando (`--erro`): abre as cinco seções antes e depois da resposta e conta campos editáveis, valores do placeholder ("MAISA", "Seu Negócio", "08:00", "20:00") e "Conectar WhatsApp" (1A.7). |
| `ajustes-gravacao.mjs` | O sinal de gravação dos Ajustes (1A.8): com o WhatsApp simulado conectado, muda o interruptor mestre e marca quando aparecem "Salvando…", "Salvo" e quando somem. `--falha` faz o `PATCH /api/assistente` devolver `ok:false`, clica em "Tentar de novo" e conta os PATCH. Sem `--falha` grava no demo (memória, sem banco) e desfaz no fim. |
| `texto.mjs` | O que uma tela diz, contado: abre `?tela=`, clica na ordem em cada `--clicar=<texto>` (texto visível ou nome acessível, para o "＋" do celular) e diz quantas vezes cada `--procura=<regex>` aparece no texto visível (rail e gaveta incluídos), mais os `href` de `wa.me`. Para critério de copy ("nenhum Junho de 2026", "diz setembro de 2026"). |
| `entrada-numero.mjs` | O wizard e o número (1A.15): `pergunta` pareia com o `POST /api/canal` voltando `conectado`, conta "Continuar" antes e depois de escolher, os `PATCH /api/contatos` (e o corpo) e a frase de "Trazer meus contatos"; `calada` faz o laboratório devolver `bolhas: []` com `motivo` e mostra a frase que a conversa escreve. Nas duas larguras (no celular, pelo caminho do código). |
| `aud08.mjs`, `aud08b.mjs` | Equipe, Serviços e Mais; `aud08b` digita 30, 45 e "90,50" nos campos da gaveta de serviço (o defeito do 30 que vira 50). |
| `entrada09.mjs`, `entrada09b.mjs` | O `/comecar` e as rotas de entrada com `/api` simulada. Desde 1B.14/1B.15 imprime a URL e o `h1` de onde parou, pula a etapa 4 pelo "Pular este passo" quando a chave do modelo falta (o demo), e simula o fiscal de quem ainda não escolheu com `caminho` (sem ele o painel fica no esqueleto). Cenários `e5-fiscal-ligar-agora` e `e5-fiscal-cnpj` (os dois caminhos que abrem o Documento fiscal), `e4-sem-cerebro-pular` e `e4-marcou-oferta` (a oferta do Google só depois de marcar). |
| `e5-sub.mjs` | **1B.14.** A frase do "Decidir depois" da etapa 5 com agente, só lembrete e nada ligado. |

Script novo entra aqui na mesma mudança, com uma linha dizendo o que ele mede.
