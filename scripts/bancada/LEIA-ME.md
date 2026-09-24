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
| `medir.mjs` | **A régua (G18).** `medir.mjs <tela> [desktop\|mobile]` imprime documento×viewport, regiões que rolam e a fração visível, a sonda de corte (`overflow:hidden` com conteúdo maior que a caixa), botões fora da tela, primários na dobra, pílulas que não clicam, alvos < 44px no celular, caracteres e travessões visíveis, altura do cabeçalho. `medir.mjs --lote <pasta>` faz as 11 telas e as 5 rotas de entrada nas duas larguras, com foto e `medidas.json`. |
| `foto.mjs` | Uma foto de uma tela ou rota; `--medir` imprime documento e rolagens, `--full` a página inteira. |
| `casca.mjs` … `casca6.mjs` | A casca: rail, topbar, abas, busca (posição da Paleta), rodapé da gaveta (`casca5`, 5 ações a 680 e 390). |
| `fluxo.mjs`, `fluxo2.mjs`, `fluxo3.mjs` | O Fluxo de hoje com dia cheio simulado. `--lento`, `--erroagenda`, `--vazio`, `--gaveta`, `--formado`; o `2` acrescenta `--rolar`, o `3` acrescenta `--meiodia`. |
| `fluxo-medidas.mjs` | Tamanho do cartão e dos botões do Fluxo em 1024, 1280, 1440 e 390. |
| `agenda-cheia.mjs` | A Agenda com cadastro, agenda e Google simulados. `<cenario> <saida.png> [desktop\|mobile\|WxH] [--equipe] [--google=ok\|nao]`. |
| `conversas-audit.mjs` … `-audit4.mjs` | Conversas com 30 conversas falsas; `audit2` mede a rolagem com o polling. |
| `clientes-audit.mjs`, `clientes-paleta2.mjs` | Clientes e Meus contatos com 200 clientes e 400 contatos; a busca da Paleta. |
| `fiscal.mjs` | Fiscal e Documento fiscal nos cenários `recibo-cheio`, `recibo-vazio`, `recibo-sem-registro`, `recibo-procuracao-vencida`, `cnpj`, `cnpj-sem-cert`, `nada-com-atend`, `nada`. `cenario+roda`, `+rolar`, `+doc`, `+botao:<nome>` encadeiam ações. |
| `ajustes.mjs`, `ajustes-parear.mjs`, `ajustes-texto.mjs` | Ajustes da MAISA: seções, pareamento por código, texto visível. |
| `aud08.mjs`, `aud08b.mjs` | Equipe, Serviços e Mais; `aud08b` digita 30, 45 e "90,50" nos campos da gaveta de serviço (o defeito do 30 que vira 50). |
| `entrada09.mjs`, `entrada09b.mjs` | O `/comecar` e as rotas de entrada com `/api` simulada. |

Script novo entra aqui na mesma mudança, com uma linha dizendo o que ele mede.
