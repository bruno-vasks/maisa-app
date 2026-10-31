/* ─────────────────────────────────────────────────────────────────────────────
 * QUEM ENTRA SEM LOGIN.
 *
 * Este arquivo existe por causa de um bug de 14/08/2026 que ficou meses no ar sem
 * ninguém ver: `/lp` não estava na lista de rotas públicas, e é de lá que sai a ÚNICA
 * página do produto com link de pagamento. Todo visitante que chegasse ao checkout era
 * redirecionado para uma tela de login de um produto que ele ainda não tinha comprado.
 *
 * Ele não quebrou nada visível para quem desenvolve — logado, tudo abre. O sintoma era
 * zero venda, que é o sintoma que ninguém consegue atribuir a uma linha de código.
 *
 * Por isso os dois lados são testados. Uma lista pública que só cresce vira um painel
 * aberto; uma que esquece uma LP vira um funil que termina em login.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { desvioParaWhatsapp, isPublic } from "./sessao";

describe("o funil é público", () => {
  /* A LP oficial de terapeutas é um bundle estático em `public/lp/` — não é rota do
   * Next, e foi por isso que ela escapou da lista quando as outras entraram. */
  it.each([
    "/lp",
    "/lp/terapeutas",
    "/lp/terapeutas/",
    "/lp/terapeutas/index.html",
    /* A LP tradicional, a do domínio raiz (24/10/2026). O `.js` e o `.css` dela passam
     * pelo middleware (o matcher só pula imagem), então também têm de ser públicos. */
    "/lp/maisa",
    "/lp/maisa/index.html",
    "/lp/maisa/assets/index.js",
    /* `/terapeutas` não tem mais página desde 14/08/2026 — só redirect para
     * `/lp/terapeutas`. Continua tendo que ser pública: se o middleware barrar antes, o
     * visitante que chegar por um link antigo cai no login em vez de na LP, e o redirect
     * nunca chega a rodar. */
    "/terapeutas",
    "/terapeutas/comecar",
    /* As duas LPs de barbearia. `/barbeiro` (singular, a variante filmada) NÃO é coberta
     * pelo prefixo `/barbeiros` — a comparação é por segmento. Foi por isso que ela
     * precisou de entrada própria em `PUBLIC_PREFIXES`, e é por isso que está aqui. */
    "/barbeiros",
    "/barbeiro",
    /* A página de compra do funil. Mesmo motivo do `/cadastro` abaixo, com a consequência
     * mais direta que existe: barrá-la é barrar quem está com o cartão na mão. */
    "/assinar",
    "/assinar/profissional",
    /* A home pública. Ela existe para o Google conseguir verificar o app — atrás do login
     * ela não cumpre a única função que tem. */
    "/sobre",
  ])("%s abre sem login", (rota) => {
    expect(isPublic(rota)).toBe(true);
  });

  it("login e callback de OAuth também, senão não há como logar", () => {
    expect(isPublic("/login")).toBe(true);
    expect(isPublic("/auth/callback")).toBe(true);
  });

  /* Barrar a tela de CRIAR CONTA manda para o login justamente quem ainda não tem login.
   * O laço é perfeito e é invisível para quem desenvolve, porque desenvolvedor já está
   * logado — mesma forma exata do bug do `/lp` que abriu este arquivo. */
  it("criar conta abre sem login, senão ninguém nunca terá um", () => {
    expect(isPublic("/cadastro")).toBe(true);
  });

  /* ⚠️ `/comecar` é o OPOSTO do `/cadastro`, e confundir os dois abre o produto.
   *
   * O wizard cria NEGÓCIO, não conta — e ele o cria em nome de `auth.uid()`. Público, ele
   * seria uma tela de criar inquilino aberta a anônimo: a RPC recusaria (ela levanta
   * `insufficient_privilege` sem sessão), mas a página existiria, prometeria, e falharia
   * com um erro de banco na cara de quem passasse por ali. O middleware manda para o
   * login com `?next=/comecar`, e a pessoa volta para cá depois de entrar. */
  it("o wizard NÃO é público — ele cria negócio em nome de quem está logado", () => {
    expect(isPublic("/comecar")).toBe(false);
  });

  /* As rotas de API fazem a própria checagem e respondem 401 em JSON. Barrá-las aqui
   * devolveria um REDIRECT para uma chamada `fetch`, e a tela receberia o HTML da página
   * de login onde esperava um objeto — o erro mais confuso que uma SPA pode dar. */
  it("as APIs passam pelo middleware e se defendem sozinhas", () => {
    expect(isPublic("/api/canal")).toBe(true);
  });
});

describe("o painel não é público", () => {
  it.each(["/", "/agenda", "/clientes", "/conversas", "/a-maisa", "/financeiro"])(
    "%s exige login",
    (rota) => {
      expect(isPublic(rota)).toBe(false);
    },
  );

  /* A comparação é por SEGMENTO (`p` ou `p + "/"`), e não por `startsWith` cru. Sem isso,
   * uma rota futura chamada `/lpainel` ou `/terapeutas-admin` entraria de graça só por
   * começar com o mesmo texto. */
  it("prefixo não vaza para rota de nome parecido", () => {
    expect(isPublic("/lpainel")).toBe(false);
    expect(isPublic("/terapeutas-admin")).toBe(false);
    expect(isPublic("/logins")).toBe(false);
    expect(isPublic("/cadastros")).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * AS PÁGINAS JURÍDICAS SÃO PÚBLICAS — e isso é requisito do GOOGLE, não estética.
 *
 * Para verificar um app que pede escopo sensível (`calendar.events` é), o Google abre as
 * URLs de política de privacidade e de termos. Se elas estiverem atrás do login, o revisor
 * encontra um formulário de senha onde deveria estar a política, e reprova. A fila leva
 * semanas — errar aqui custa um ciclo inteiro de submissão.
 *
 * Sem verificação, a tela de consentimento mostra "app não verificado" e trava em 100
 * usuários. Na prática: nenhum cliente da MAISA liga a agenda, e dois dos seis passos do
 * onboarding ficam impossíveis.
 * ────────────────────────────────────────────────────────────────────────────── */
describe("as páginas que o Google precisa abrir sem login", () => {
  it.each(["/privacidade", "/termos"])("%s é pública", (rota) => {
    expect(isPublic(rota)).toBe(true);
  });

  /* A checagem é por SEGMENTO: `/privacidade-interna` não deve herdar nada de
   * `/privacidade`. Sem isto, um prefixo novo abriria rotas que ninguém pretendia abrir. */
  it("não abre vizinho por prefixo de string", () => {
    expect(isPublic("/privacidadezinha")).toBe(false);
    expect(isPublic("/termos-internos")).toBe(false);
  });

  /* O painel continua fechado. O teste existe para o dia em que alguém, resolvendo outro
   * problema, acrescentar "/" à lista — o sintoma seria o app inteiro aberto, e nenhuma
   * tela reclamaria. */
  it("o painel segue exigindo login", () => {
    expect(isPublic("/")).toBe(false);
    expect(isPublic("/comecar")).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * RECUPERAR SENHA — a rota que atende justamente quem não consegue entrar.
 *
 * `/esqueci` atrás do middleware seria o laço perfeito: ela manda para `/login` a pessoa
 * que veio de `/login` porque não consegue passar dali. Antes de 17/08/2026 não havia
 * recuperação nenhuma no produto — a saída era o cliente mandar e-mail para o Bruno trocar
 * a senha à mão no painel do Supabase, o que não escala nem no primeiro cliente.
 * ────────────────────────────────────────────────────────────────────────────── */
describe("recuperação de senha", () => {
  it("/esqueci é pública — ela atende quem não consegue logar", () => {
    expect(isPublic("/esqueci")).toBe(true);
  });

  /* ⚠️ E `/nova-senha` NÃO é, de propósito: ela só faz sentido com sessão, e o link do
   * e-mail já cria uma ao passar pelo `/auth/callback`. Deixá-la pública permitiria abrir
   * a tela de trocar senha sem nenhuma prova de identidade — o `updateUser` recusaria,
   * mas a tela existiria, e tela que não pode funcionar é pior que tela nenhuma. */
  it("/nova-senha exige sessão", () => {
    expect(isPublic("/nova-senha")).toBe(false);
  });

  it("não abre vizinho por prefixo", () => {
    expect(isPublic("/esqueci-tudo")).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * O TUTORIAL DA AUTORIZAÇÃO — a rota que atende quem ainda não é usuário.
 *
 * `/autorizar` ensina a dar à MAISA a Autorização de Acesso do e-CAC. Quem lê está com o site
 * da Receita aberto, quase sempre no celular, mandado por WhatsApp — e pode nem ter conta na
 * MAISA ainda (o contador da cliente, por exemplo).
 *
 * ⚠️ ATRÁS DO LOGIN, O SINTOMA É INVISÍVEL: ninguém abre um chamado dizendo "a página de
 * tutorial pediu senha". A pessoa fecha, não autoriza, e o que aparece do nosso lado é a
 * emissão parada por semanas sem motivo aparente — porque a autorização é o único item que
 * bloqueia os recibos inteiros.
 * ────────────────────────────────────────────────────────────────────────────── */
describe("tutorial da Autorização de Acesso", () => {
  it("/autorizar é pública — quem lê ainda não entrou no app", () => {
    expect(isPublic("/autorizar")).toBe(true);
  });

  /* A checagem é por segmento, então uma sub-rota futura (`/autorizar/contador`) já nasce
   * pública. É o comportamento que se quer aqui, e está escrito para não virar surpresa. */
  it("sub-rota do tutorial também é pública", () => {
    expect(isPublic("/autorizar/contador")).toBe(true);
  });

  it("não abre vizinho por prefixo", () => {
    expect(isPublic("/autorizarem")).toBe(false);
    expect(isPublic("/autorizacoes")).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SEM WHATSAPP, NINGUÉM ENTRA NO APP (30/10/2026).
 *
 * Uma conta nasceu pelo `/cadastro` com e-mail e mais nada, e o Bruno não tinha como chamar a
 * pessoa para ajudar. O desvio tem dois modos de falha, e os dois estão aqui: pegar rota pública
 * (a `/api` passaria a devolver redirect em vez de JSON, e a LP mandaria visitante para uma tela
 * de quem já tem conta) e laço (a própria `/whatsapp` desviando para ela mesma).
 * ────────────────────────────────────────────────────────────────────────────── */
describe("logado sem WhatsApp", () => {
  const semNumero = { email: "a@b.com", email_verified: true, sub: "x" };
  const comNumero = { email: "a@b.com", telefone: "11944470703" };

  it.each(["/", "/agenda", "/comecar", "/financeiro", "/nova-senha"])("%s desvia para /whatsapp", (rota) => {
    expect(desvioParaWhatsapp(rota, "", semNumero)).toBe(`/whatsapp?next=${encodeURIComponent(rota)}`);
  });

  it("guarda a busca junto, para voltar exatamente para onde ia", () => {
    expect(desvioParaWhatsapp("/agenda", "?dia=2026-10-30", semNumero)).toBe("/whatsapp?next=%2Fagenda%3Fdia%3D2026-10-30");
  });

  it("com número, segue", () => {
    expect(desvioParaWhatsapp("/", "", comNumero)).toBeNull();
  });

  it("a própria /whatsapp não desvia para ela mesma", () => {
    expect(desvioParaWhatsapp("/whatsapp", "?next=%2F", semNumero)).toBeNull();
  });

  it("/whatsapp exige login", () => {
    expect(isPublic("/whatsapp")).toBe(false);
  });

  it.each(["/api/cadastro", "/api/negocio", "/auth/callback", "/login", "/lp/maisa", "/assinar/essencial", "/termos"])(
    "%s é pública e passa direto",
    (rota) => {
      expect(desvioParaWhatsapp(rota, "", semNumero)).toBeNull();
    },
  );
});
