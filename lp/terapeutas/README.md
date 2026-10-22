# LP oficial de terapeutas

Bundle estático. HTML + web components + o design system, sem React e sem build.
É a LP de verdade — as rotas `/terapeutas` e `/terapeutas/v2` do app Next são as
versões antigas do funil e não recebem mais mudança.

    http://localhost:3100/lp/terapeutas

## Como isso chega no navegador

`npm run dev` e `npm run build` disparam `scripts/espelha-lp.mjs`, que copia esta
pasta para `public/lp/terapeutas/` (a cópia está no `.gitignore` — é build, não
fonte; **editar `public/lp/` é jogar trabalho fora**). O `next.config.mjs` tem um
rewrite de `/lp/terapeutas` para `/lp/terapeutas/index.html`, porque o Next casa
arquivo de `public/` por caminho exato e sem isso a URL sem `index.html` daria 404.

Os caminhos de asset no `index.html` são **absolutos a partir da raiz do site**
(`/lp/terapeutas/_ds/…`). Tem de ser: a página é servida na URL `/lp/terapeutas`,
sem barra no fim, então caminho relativo resolveria contra `/lp/` e tudo quebraria
com 404. A consequência é que a pasta só funciona publicada em `/lp/terapeutas/` —
para servir na raiz de outro host, troque o prefixo nos 19 `href`/`src`.

## De onde veio, e o que mudou no caminho

A fonte de desenho é o projeto de design `Landing Maisa.dc.html`
(claude.ai/design, projeto `96c4c4d1-040e-4e86-b09e-0032623cfac3`). Este arquivo é
um **porte** dele, não uma cópia: lá a página é escrita no dialeto do editor
(`<x-dc>`, `<x-import>`, `{{ props }}`, `style-hover=…`), que só renderiza com o
runtime `support.js` **e com React carregado**. Numa landing page isso custaria
duas dependências de CDN e, pior, deixaria a página sem conteúdo nenhum no HTML —
ruim para quem indexa e para quem tem JS lento. Então aqui:

- `x-import` de componente virou a própria custom element (`<crowd-canvas>`, …);
- `x-import` de `Logo`/`Icon` virou SVG inline, o que dispensa o `_ds_bundle.js`
  (158 KB de componentes React que não seriam usados);
- `style-hover` / `style-active` viraram classes CSS reais no `<style>` do topo —
  com `!important`, porque disputam com o `style` inline do mesmo elemento;
- `image-slot` virou `<img>` com `object-fit:cover`.

Os 7 `.js` e o `_ds/` são **cópia byte a byte** do projeto de design. Mudança de
comportamento se faz lá e se traz de volta, não se remenda aqui.

O único JavaScript que **não** veio do projeto de design é o `<script>` inline no fim do
`index.html` (22/10/2026): ele acrescenta a campanha do anúncio (`utm_*`, `gclid`, `fbclid`)
da URL desta página aos links do `/assinar`, para o lead não chegar ao pré-cadastro sem
origem. A lista de chaves é a `CAMPANHA` de `src/app/(marketing)/_lib/planos.ts`, e o
`planos.test.ts` executa o script e reprova se divergir.

## As fotos

Nove vagas, nove fotos em `assets/*.webp`, nomeadas pela vaga. São as imagens que o
Bruno mandou — não vêm por API (o `get_file` do DesignSync corta em 256 KiB e todas
passariam disso), então entraram à mão.

| arquivo | onde aparece | o que a legenda promete |
| --- | --- | --- |
| `nf-lote` | `#demo`, cartão 1 | as 30 notas de uma vez |
| `nf-enviada` | `#demo`, cartão 2 | recibo enviado |
| `nf-recebida` | `#demo`, cartão 3 | recibo recebido |
| `domingo-livre` | `#demo`, cartão 4 | domingo devolvido |
| `passo-conversa` | `#fluxo`, painel 01 | a paciente chama |
| `passo-agenda` | `#fluxo`, painel 02 | entra na agenda |
| `passo-nota` | `#fluxo`, painel 03 | nota emitida |
| `passo-recibo` | `#fluxo`, painel 04 | recibo entregue |
| `footer-recibo` | rodapé | — |

Há também `foto-sessao.webp` (sessão de terapia, duas poltronas) **sem vaga no
layout de hoje** — o mesmo nome existe no projeto de design e também não é usado lá.
Fica guardada.

Todas entram com `object-fit:cover`, ou seja, **o que se vê é o recorte central**:
uma foto com o assunto na beirada perde o assunto. As quatro do `#demo` ainda levam
`transform:scale(1.25)` por cima, o que aperta mais o recorte. Ao trocar alguma,
conferir no navegador em vez de confiar no arquivo.

Somadas dão ~1,6 MB. Não é problema porque todas são `loading="lazy"` e a dobra não
tem foto nenhuma (é o canvas dos bonecos), mas é o teto: não vale engordar mais.

## Onde ficam os números

Não há config: é HTML estático, tudo literal no `index.html`.

| o quê | onde |
| --- | --- |
| checkout do plano Completo (R$ 197, 15 dias) | `href` do botão em `#planos`, card do meio |
| WhatsApp (Essencial, Clínica, rodapé) | `wa.me/5511994294906` — 4 ocorrências |
| "Entrar" (porta do app) | `<a href="/login">` fixo, logo depois de `<body>` |
| bonecos da hero | `assets/open-peeps-sheet.png`, regerado por `scripts/recolor_peeps_sheet.py` |

O número do WhatsApp também vive em `src/app/(marketing)/_lib/icp.ts` (para as
outras 6 LPs). Trocar num lugar exige trocar no outro — esta LP não importa TS.

**O "Entrar" tem a mesma dobradiça.** Nas LPs de barbearia ele é o componente
`_lib/EntrarNoApp.tsx`, montado pelo `<World>` e lendo `APP_URL` do `icp.ts`. Aqui é
uma tag escrita à mão, porque esta LP é HTML estático. Mudar o destino do app exige
mexer nos dois.
