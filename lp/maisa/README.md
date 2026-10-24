# LP tradicional da Maisa

A LP que era do Skip (`maisasecretary.com.br`), refeita em 22/10/2026. **Esta pasta é build,
não fonte.** A fonte é o projeto Vite em `~/Desktop/maisa-lp` (React + Tailwind). Para mudar
qualquer coisa, edite lá, rode `npm run build` e copie o `dist/` para cá:

    cd ~/Desktop/maisa-lp && npm run build && rm -rf <app>/lp/maisa/{assets,index.html} && cp -R dist/. <app>/lp/maisa/

    http://localhost:3100/lp/maisa

## Como chega no navegador

Igual à de terapeutas: `scripts/espelha-lp.mjs` copia `lp/` para `public/lp/`, e o
`next.config.mjs` reescreve `/lp/maisa` para `/lp/maisa/index.html`. O build do Vite usa
`base: '/lp/maisa/'`, então os assets saem com caminho absoluto a partir desse prefixo.

No domínio raiz, quando o DNS dele apontar para este projeto na Vercel, o middleware reescreve
`/` para esta página e manda o resto para o app (`src/config/site.ts`).

## Tags

`GTM-NPQSDKVD` (o container da Maisa) e `AW-941084775` (Google Ads da Maisa), como pede o passo
a passo do marketing de 20/10/2026. O container da Poli Júnior não entra.

## Para onde os botões vão

Para o app, com a campanha da URL (`utm_*`, `gclid`, `fbclid`): o teste grátis é
`/assinar/profissional?teste=1&icp=generico`, o "Entrar" é `/login`. Os destinos estão em
`src/lib/links.ts` do projeto fonte.
