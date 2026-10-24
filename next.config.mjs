/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /* ⚠️ O CONSERTO DE UM PÉ DE OUVIDO REAL, 17/08/2026.
   *
   * O `CLAUDE.md` avisa: "Nunca `npm run build` com o `next dev` no ar — o build clobbera o
   * `.next` do dev e a tela perde todo o CSS. Parece bug do código, e não é."
   *
   * O aviso estava lá e não bastava, porque não havia como obedecer: `next build` não tem
   * flag de diretório de saída, e `NEXT_DIST_DIR` **não existe** — passá-la é silenciosamente
   * ignorado, o build escreve em `.next` como sempre, e a única pista é a tela do dev ficando
   * sem estilo. Foi exatamente o que aconteceu aqui.
   *
   * Com esta linha, verificar um build sem derrubar o dev é:
   *
   *     MAISA_DIST_DIR=.next-verificacao npx next build
   *
   * ⚠️ CAMINHO RELATIVO, SEMPRE. O Next resolve `distDir` a partir da raiz do projeto e não
   * recusa caminho absoluto — ele o trata como relativo. Passar `/tmp/build-x` criou
   * `code/private/tmp/build-x`, 208 MB dentro do repositório e fora do `.gitignore`. O
   * `.gitignore` cobre `/.next*`, então qualquer nome com esse prefixo já nasce ignorado.
   *
   * Sem a variável, nada muda — `.next` continua sendo o padrão para o `dev`, para o CI e
   * para a Vercel. Aviso em prosa depende de alguém lembrar; isto não.
   *
   * ⚠️ EFEITO COLATERAL, descoberto em 18/08/2026: o `next build` REESCREVE o
   * `tsconfig.json` sozinho — reformata o arquivo inteiro e acrescenta
   * `.next-verificacao/types/**` ao `include`. Não é opcional e não há flag para desligar.
   * Depois de verificar um build assim, `git checkout tsconfig.json` antes de commitar; o
   * diff parece uma decisão de estilo de alguém e não é de ninguém. */
  distDir: process.env.MAISA_DIST_DIR || ".next",

  async rewrites() {
    return [
      // A LP oficial de terapeutas é um bundle estático servido de public/lp
      // (ver scripts/espelha-lp.mjs). O Next casa arquivo de public por caminho
      // exato, então /lp/terapeutas sem o "/index.html" daria 404 — daí o rewrite.
      { source: "/lp/terapeutas", destination: "/lp/terapeutas/index.html" },
      // A LP tradicional (a do domínio raiz), mesmo esquema. Ver src/config/site.ts.
      { source: "/lp/maisa", destination: "/lp/maisa/index.html" },
    ];
  },

  /* As LPs de barbearia deixaram de ser "versões" em 14/08/2026: a v3 virou `/barbeiros`
   * e a v4 (a variante com a dobra filmada) virou `/barbeiro`.
   *
   * Os caminhos antigos redirecionam em vez de sumir. Uma LP existe para ser
   * COMPARTILHADA — o link já foi para conversa de WhatsApp, anúncio e mensagem de
   * prospecção, e nada disso pode ser editado depois de enviado. Um 404 aqui não é um
   * caminho quebrado, é um cliente que clicou e desistiu.
   *
   * `permanent: true` (301) porque a mudança é definitiva e é o que faz o buscador
   * transferir o histórico da URL antiga para a nova, em vez de tratá-la como desvio
   * temporário e continuar mostrando a que morreu. */
  async redirects() {
    return [
      { source: "/barbeiros/v3", destination: "/barbeiros", permanent: true },
      { source: "/barbeiros/v4", destination: "/barbeiro", permanent: true },

      /* As quatro rotas Next de terapeutas foram apagadas em 14/08/2026 — sobrou a LP
       * oficial, o bundle estático de `public/lp`. `/terapeutas` estava PÚBLICA e no ar,
       * então é a que mais tem chance de ter link solto por aí; as outras três eram
       * níveis de um funil que não se usa mais. Todas caem na LP que ficou.
       *
       * `:path*` cobre âncoras e qualquer nível que tenha existido, inclusive os que eu
       * não conheça — vale mais que quatro linhas exatas que envelhecem uma a uma. */
      { source: "/terapeutas", destination: "/lp/terapeutas", permanent: true },
      { source: "/terapeutas/:path*", destination: "/lp/terapeutas", permanent: true },
    ];
  },
};

export default nextConfig;
