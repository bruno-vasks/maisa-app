/* ----------------------------------------------------------------------------
 * Configuração por ICP (público). Fonte única de rotas, rótulos, navegação e do
 * CTA de WhatsApp para as 6 landing pages. Módulo puro (sem "use client"): pode
 * ser importado por Server e Client Components.
 * -------------------------------------------------------------------------- */

import { WHATSAPP_DA_MAISA } from "@/nucleo/dominio/suporte";

export type ICP = "barbeiros" | "terapeutas";
export type Nivel = "topo" | "meio" | "base";

/* Número da MAISA no WhatsApp, em E.164 sem o "+". Mora em `nucleo/dominio/suporte.ts`
 * desde 25/09/2026, porque o painel usa o mesmo no "Falar com o suporte" e não importa
 * daqui. É o mesmo número da LP oficial em lp/terapeutas/index.html: se trocar, troque lá
 * também, porque a LP é HTML estático e não importa módulo nenhum. O `juridico.test.ts`
 * confere os dois. */
export const WHATSAPP_NUMERO = WHATSAPP_DA_MAISA;

/* O e-mail de contato NÃO mora aqui: é o `CONTATO` de `_lib/Juridico.tsx`, o mesmo da
 * política e dos termos. Havia um `CONTATO_EMAIL = "contato@maisa.app"` de placeholder; saiu
 * em 28/09/2026, quando a análise do site do provedor de pagamento pediu contato e o Bruno
 * mandou unificar tudo nos contatos dele. Um endereço só, e o `juridico.test.ts` reprova se
 * a LP estática divergir. */

/** Monta o link wa.me com mensagem pré-preenchida (já codificada). */
export function whatsappUrl(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

/* ----------------------------------------------------------------------------
 * A PORTA DO APP — para quem JÁ é cliente.
 *
 * Constante solta e não campo do `IcpConfig`, de propósito: é o MESMO destino para os
 * dois públicos, porque o app é um só (a variação por cliente é linha no banco, nunca
 * ramo de código). Pôr isto no `IcpConfig` criaria dois campos com o mesmo valor —
 * ou seja, uma promessa de que um dia divergem, que ninguém pretende cumprir.
 *
 * ⚠️ APONTA PARA `/login` E NÃO PARA `/cadastro`. São públicos diferentes: quem chega
 * numa LP e quer COMPRAR é atendido pelos CTAs da página; quem procura este link já
 * paga e só quer entrar. Mandá-lo para o cadastro faria um cliente ativo encarar um
 * formulário de conta nova — e o `/login` tem link para o cadastro logo abaixo, então
 * quem errou o caminho está a um clique do certo. O contrário não é verdade.
 * -------------------------------------------------------------------------- */
export const APP_URL = "/login";

export interface NavItem {
  label: string;
  href: string;
  nivel?: Nivel;
}

export interface IcpConfig {
  id: ICP;
  /** classe do mundo (define os tokens OKLCH escopados em marketing.css) */
  mundoClass: string;
  /** rótulo curto que acompanha o wordmark ("para barbearias") */
  rotulo: string;
  /** o que a pessoa é ("barbearia", "terapeuta") — para copy reaproveitável */
  publico: string;
  home: string;
  rotas: Record<Nivel, string>;
  /** navegação topo → meio → base para a MarketingNav */
  nav: NavItem[];
  /** CTA principal (nav + heros): rótulo + mensagem de WhatsApp */
  ctaLabel: string;
  ctaMensagem: string;
  /** URL wa.me pronta do CTA principal */
  ctaUrl: string;
  /** rótulo do CTA secundário (avançar no funil) */
  ctaSecundarioLabel: string;
}

const barbeirosCta =
  "Oi! Tenho uma barbearia e quero deixar a MAISA cuidando da agenda e das confirmações no WhatsApp. Como começo?";
const terapeutasCta =
  "Olá! Sou terapeuta e quero organizar as notas fiscais e a agenda dos meus pacientes com a MAISA. Pode me explicar como funciona?";

export const ICPS: Record<ICP, IcpConfig> = {
  barbeiros: {
    id: "barbeiros",
    mundoClass: "mundo-barbeiros",
    rotulo: "para barbearias",
    publico: "barbearia",
    /* ⚠️ O MUNDO BARBEIROS TEM UMA PÁGINA SÓ, e por isso os três níveis apontam para
       o mesmo lugar. Até 11/08/2026 aqui havia um funil de três rotas mais duas
       variações completas; todas foram apagadas — a v3 é a única LP de barbeiro
       aprovada, e a v4 é ela com outra dobra. Uma one-pager não tem topo, meio e base:
       ela é os três numa rolagem. Manter os campos apontando para páginas mortas seria
       deixar 404 escrito na configuração, esperando que algum componente novo os
       renderizasse.

       Em 14/08/2026 a v3 foi PROMOVIDA a `/barbeiros` e a v4 a `/barbeiro`. Os caminhos
       antigos redirecionam (ver `next.config.mjs`), mas configuração não deve apontar
       para redirect: é um salto a mais em toda navegação e a primeira coisa a apodrecer
       quando o redirect for removido. */
    home: "/barbeiros",
    rotas: {
      topo: "/barbeiros",
      meio: "/barbeiros",
      base: "/barbeiros#planos",
    },
    /* A <MarketingNav> não é renderizada em nenhuma página de barbeiro — a v3 decidiu
       não ter nav ("uma one-pager não navega para nada", cabeçalho do page.tsx dela).
       A lista fica com a única âncora que existe, em vez de vazia, para que quem ligar
       a nav um dia não herde três links quebrados. */
    nav: [{ label: "Planos", href: "/barbeiros#planos", nivel: "base" }],
    ctaLabel: "Ativar minha agenda",
    ctaMensagem: barbeirosCta,
    ctaUrl: whatsappUrl(barbeirosCta),
    ctaSecundarioLabel: "Ver como funciona",
  },
  terapeutas: {
    id: "terapeutas",
    mundoClass: "mundo-terapeutas",
    rotulo: "para terapeutas",
    publico: "terapeuta",
    /* ⚠️ O MUNDO TERAPEUTAS TAMBÉM TEM UMA PÁGINA SÓ, desde 14/08/2026 — e ela NÃO É
       ROTA DO NEXT. É o bundle estático de `public/lp/terapeutas`, a LP oficial, a única
       do produto com link de pagamento. As quatro rotas Next que existiam aqui
       (`/terapeutas`, `/comecar`, `/como-funciona`, `/v2`) foram apagadas.

       Esta configuração continua viva mesmo sem página Next porque o RODAPÉ das páginas
       de barbearia faz link cruzado para o outro ICP (`Footer.tsx` → `CROSS`). Apagar o
       bloco quebraria o rodapé das duas LPs que ficaram. */
    home: "/lp/terapeutas",
    rotas: {
      topo: "/lp/terapeutas",
      meio: "/lp/terapeutas",
      base: "/lp/terapeutas",
    },
    /* Vazia porque não há para onde navegar: a LP é uma página só, servida fora do Next,
       e a <MarketingNav> não é renderizada em nenhuma página que sobrou. Um link para
       âncora de um HTML que este repositório não controla seria promessa que a próxima
       edição do bundle quebra em silêncio. */
    nav: [],
    ctaLabel: "Falar com a MAISA",
    ctaMensagem: terapeutasCta,
    ctaUrl: whatsappUrl(terapeutasCta),
    ctaSecundarioLabel: "Ver como funciona",
  },
};

/* ----------------------------------------------------------------------------
 * Nível de funil derivado do pathname — PONTO ÚNICO DE VERDADE.
 * A nav, a barra fixa do mobile e (opcionalmente) a faixa de CTA leem daqui, para
 * que o mesmo CTA forte de fundo-de-funil NÃO apareça no topo. Sem estado, sem
 * hooks: funções puras que recebem o pathname (via usePathname no cliente).
 * -------------------------------------------------------------------------- */

/** Primeiro segmento do path → ICP. Cai em "barbeiros" fora das rotas de marca.
 *
 * ⚠️ Reconhece `/lp/terapeutas` além de `/terapeutas`: desde 14/08/2026 a LP de
 * terapeutas é o bundle estático servido de `/lp`, e o caminho antigo só existe como
 * redirect. Um componente cliente que rode no bundle continuaria caindo em "barbeiros"
 * sem esta linha — e pintaria o mundo errado. */
export function icpDoPath(pathname: string | null | undefined): ICP {
  const segs = (pathname ?? "").split("/").filter(Boolean);
  const seg = segs[0] === "lp" ? segs[1] : segs[0];
  return seg === "terapeutas" ? "terapeutas" : "barbeiros";
}

/** Segundo segmento do path → nível de funil (topo/meio/base). */
export function nivelDoPath(pathname: string | null | undefined): Nivel {
  const sub = (pathname ?? "").split("/").filter(Boolean)[1];
  if (sub === "comecar") return "base";
  if (sub === "como-funciona") return "meio";
  // Uma one-pager percorre o funil INTEIRO numa rolagem, então ela não é "topo": quem está nela já
  // pode ter lido tudo. Classificada como topo, a barra fixa do mobile (StickyMobileCta) servia o
  // CTA mais fraco — "Ver como funciona" — apontando para FORA da one-pager, para uma página cujo
  // conteúdo ela contém inteiro. Era o único CTA permanentemente visível no celular.
  //
  // ⚠️ A v3 E A v4 ENTRARAM NESTA LINHA EM 11/08/2026, E O BUG ERA ANTIGO. Esta regra
  // nasceu para a `completa` e nunca foi estendida às one-pagers que vieram depois: no
  // celular, o único CTA sempre visível da v3 dizia "Ver como funciona" e apontava para
  // /barbeiros/como-funciona — OUTRA LP. É exatamente a fuga que o cabeçalho da v3
  // combate ("numa one-pager isso é vazamento"), acontecendo na barra que ela não
  // controlava. A remoção daquela rota tornou o bug visível: o link viraria 404.
  // As duas são one-pagers pelo mesmo motivo que a `completa` era, então: "base".
  if (sub === "completa" || sub === "v3" || sub === "v4") return "base";
  return "topo";
}

/** Peso visual do CTA por nível: leve (topo) < média (meio) < forte (base). */
export type CtaPeso = "leve" | "media" | "forte";

export interface NivelCta {
  label: string;
  href: string;
  /** abre em nova aba (só o CTA de base, que aponta pro WhatsApp) */
  external: boolean;
  icon: "whatsapp" | "arrow";
  peso: CtaPeso;
}

/**
 * CTA apropriado ao nível do funil:
 *   • topo → leve: "Ver como funciona" (→ MEIO), sem preço, baixa fricção.
 *   • meio → média: "Começar agora" (→ BASE).
 *   • base → forte: WhatsApp ("Ativar minha agenda" / "Falar com a MAISA").
 */
export function ctaDoNivel(icp: ICP, nivel: Nivel): NivelCta {
  const cfg = ICPS[icp];
  switch (nivel) {
    case "base":
      return { label: cfg.ctaLabel, href: cfg.ctaUrl, external: true, icon: "whatsapp", peso: "forte" };
    case "meio":
      return { label: "Começar agora", href: cfg.rotas.base, external: false, icon: "arrow", peso: "media" };
    case "topo":
    default:
      return { label: cfg.ctaSecundarioLabel, href: cfg.rotas.meio, external: false, icon: "arrow", peso: "leve" };
  }
}
