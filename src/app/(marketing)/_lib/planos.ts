/* ----------------------------------------------------------------------------
 * O CATÁLOGO. Fonte única de preço, limite e CTA de plano do produto inteiro.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE (21/09/2026) ──────────────────────────────
 * Até hoje o produto tinha DUAS tabelas de preço que nunca se falaram:
 *
 *   · terapeutas  R$ 79 / R$ 197 / R$ 349   (digitados em lp/terapeutas/index.html)
 *   · barbeiros   R$ 97 / R$ 147 / R$ 197   (digitados em barbeiros/v3/dados.ts)
 *
 * Seis preços, cinco valores distintos, dois nomes de plano diferentes para a mesma
 * linha do banco — e um "R$ 147" redigitado numa TERCEIRA seção (o card da <Duelo>),
 * que tinha de ser atualizado à mão toda vez que o destaque mudasse. A LP de barbeiros
 * já carregava a cicatriz por escrito: "na v1 estes valores estavam digitados em 4
 * arquivos e já divergiam entre si".
 *
 * A causa nunca foi descuido: é que NÃO HAVIA ONDE ESCREVER O PREÇO UMA VEZ SÓ. Agora há.
 *
 * ── UMA TABELA PARA OS DOIS ICPs, E ISSO É DECISÃO DE PRODUTO ─────────────
 * Barbeiro e terapeuta compram O MESMO APP — a variação por cliente é linha no banco,
 * nunca ramo de código, e é regra escrita do projeto. Duas tabelas de preço eram a
 * promessa de dois produtos que ninguém pretende construir nem manter.
 *
 * O que VARIA por ICP é só a copy: o `resumo` (para quem é), o `cta` (o rótulo do
 * botão), a mensagem do WhatsApp e uma linha extra de especificação. Preço, limite e
 * excedente são os mesmos números nos dois mundos, porque são o mesmo produto.
 *
 * ── DE ONDE VÊM ESTES NÚMEROS ─────────────────────────────────────────────
 * Da §6 de `08 Attachments/MAISA-precificacao-unificada.md`, que é a tabela vigente.
 * Ancorada em pesquisa de preço real: acima dos booking apps (R$ 76–110), no meio da
 * faixa dos peers de IA (Zaia/Belasis/Flly/Cloudia) e abaixo do topo. Não são preços
 * inventados para encher card — é a mesma regra que a v3 de barbeiros já aplicava aos
 * dados da <Duelo>: sem origem, não entra.
 *
 * ── ⚠️ "PROFISSIONAIS: ILIMITADO" É A OFERTA, NÃO UMA GENEROSIDADE (21/09/2026) ──
 *
 * Até hoje este arquivo dizia "até 3" e "até 10", e a cota era 300/800/1.500 com
 * excedente de R$ 0,29/0,24/0,19. Estava contra a própria estratégia: a §17.1 do
 * documento de precificação chama "cobrança por profissional é imposto sobre
 * crescimento" de **Brecha 2** — o argumento central contra a AVEC, que encarece quando
 * o cliente contrata alguém. A LP escrevia exatamente o que devia atacar.
 *
 * O driver de custo nunca foi profissional; é CONVERSA (R$ 0,111 por agendamento). Então
 * a escada é cota de agendamento, e o resto é ilimitado. A cota segmenta sozinha: quem
 * cresce estoura e sobe de plano pelo próprio uso, sem a gente proibir nada.
 *
 * Números vigentes: 300 / 700 / 1.700 agendamentos, excedente R$ 0,42 / 0,28 / 0,23 —
 * cobrado ao preço efetivo do próprio plano, que é por que ele não pune quem estoura.
 *
 * ⚠️ O EXCEDENTE É PARTE DA OFERTA, NÃO LETRA MIÚDA. Ele aparece como LINHA DO CARTÃO
 * nos dois mundos. Um limite de agendamentos sem o preço do que passa dele é a pegadinha
 * que o cliente descobre na fatura — e a página inteira se apoia em não ter pegadinha.
 *
 * ⚠️ O HTML DE TERAPEUTAS NÃO IMPORTA ESTE MÓDULO — é bundle estático, servido fora do
 * Next, e não tem como. Ele REDIGITA os mesmos números, e é por isso que existe
 * `planos.test.ts`: o teste lê o HTML como texto e reprova se um preço daqui não estiver
 * lá, ou se um preço morto continuar. A sincronia é garantida por teste, não por bom
 * comportamento — porque bom comportamento é exatamente o que falhou até hoje.
 * -------------------------------------------------------------------------- */

import { whatsappUrl, type ICP } from "./icp";

/* ─────────────────────────── para onde o botão vai ───────────────────────────
 *
 * ★ PARA O PRÉ-CADASTRO, NUNCA PARA UM LINK DE PAGAMENTO. Decidido em 21/09/2026,
 * depois de MEDIR a conta live.
 *
 * Existia aqui um mapa `CHECKOUT` com uma URL de `buy.stripe.com` por plano, vazio à
 * espera dos preços novos. Ele saiu, e não por estar vazio: **o desenho estava errado.**
 *
 * O que a conta live mostrou (`acct_1SgtGgKYvspChjeQ`): 21 clientes, três deles com o
 * MESMO e-mail criados em segundos, e 14 assinaturas com `metadata` vazio — nenhuma
 * atribuível a inquilino nenhum. Era o link antigo desta LP sendo clicado de novo e
 * criando ficha nova a cada clique. Link de pagamento **cobra sem saber de quem é**, e a
 * conta que ele deixa para trás não tem dono nem negócio.
 *
 * O caminho é `/assinar/<plano>`: três campos, a conta e o negócio nascem ANTES, e o
 * checkout sai com o inquilino carimbado. Um clique a mais, e a venda fica reconciliada.
 *
 * ⚠️ `escala` NÃO TEM PÁGINA e continua indo para o WhatsApp — a §19 do documento de
 * precificação o põe "sob proposta". Ali a venda É conversa, e o `/assinar/escala`
 * responde 404 de propósito.
 * -------------------------------------------------------------------------- */

/** Os planos que se vendem sozinhos. Espelha `AUTOATENDIDOS` de `app/assinar/[plano]`. */
export const AUTOATENDIDOS = ["essencial", "profissional"] as const;

export type ChavePlano = "essencial" | "profissional" | "escala";

/** Uma linha da tabela: rótulo à esquerda, valor à direita. É a MESMA forma nos dois
 *  mundos — rótulo e valor em colunas, e não bullet solto. Bullet compara mal: o olho
 *  não sabe se o item que falta no cartão de baixo é ausência ou esquecimento.
 *
 *  ⚠️ VALOR CURTO É REQUISITO, NÃO ESTILO. Medido em 1440: o lembrete dizia "1 por
 *  agendamento" e quebrava em duas linhas em DOIS dos três cartões de barbeiros — as
 *  linhas 4 e 5 saíam de altura entre as colunas e o olho perdia a horizontal na hora
 *  exata de comparar. Numa seção cujo trabalho é comparar, isso é o defeito. O "um por
 *  agendamento" virou frase da `nota`, que é onde cabe. Valor que não couber numa
 *  linha nos três cartões vira nota, sempre. */
export type Spec = { rotulo: string; valor: string };

export type Plano = {
  chave: ChavePlano;
  nome: string;
  preco: string;
  periodo: string;
  /** Os números do plano — iguais para os dois ICPs, porque é o mesmo produto. */
  specs: readonly Spec[];
  destaque?: boolean;
};

/* ⚠️ SE UM PREÇO MUDAR, MUDA AQUI E NO `lp/terapeutas/index.html`. São os dois únicos
 * lugares do projeto onde um preço pode estar escrito, e o `planos.test.ts` reprova se
 * eles divergirem. Nenhum outro arquivo redigita valor — o card da <Duelo> lê o plano
 * destacado daqui, e o `OFERTA.precoDe` lê o mais barato. */
export const PLANOS: readonly Plano[] = [
  {
    chave: "essencial",
    nome: "Essencial",
    preco: "R$ 127",
    periodo: "/mês",
    specs: [
      { rotulo: "Profissionais", valor: "ilimitado" },
      { rotulo: "Agendamentos com IA", valor: "300/mês" },
      { rotulo: "Excedente por agendamento", valor: "R$ 0,42" },
      { rotulo: "Lembrete automático", valor: "incluído" },
      { rotulo: "Suporte", valor: "e-mail" },
    ],
  },
  {
    chave: "profissional",
    nome: "Profissional",
    preco: "R$ 197",
    periodo: "/mês",
    specs: [
      { rotulo: "Profissionais", valor: "ilimitado" },
      { rotulo: "Agendamentos com IA", valor: "700/mês" },
      { rotulo: "Excedente por agendamento", valor: "R$ 0,28" },
      { rotulo: "Lembrete automático", valor: "incluído" },
      { rotulo: "Suporte", valor: "WhatsApp" },
    ],
    destaque: true,
  },
  {
    chave: "escala",
    nome: "Escala",
    preco: "R$ 397",
    periodo: "/mês",
    specs: [
      { rotulo: "Profissionais", valor: "ilimitado" },
      { rotulo: "Agendamentos com IA", valor: "1.700/mês" },
      { rotulo: "Excedente por agendamento", valor: "R$ 0,23" },
      { rotulo: "Lembrete automático", valor: "incluído" },
      { rotulo: "Suporte", valor: "WhatsApp prioritário" },
    ],
  },
] as const;

/** O plano em destaque. Quem precisa dele: o card da <Duelo> (que compara O PREÇO
 *  DESTACADO com o salário de uma recepção) e qualquer copy que cite "a partir de"
 *  sem ser o piso. Função e não constante porque o destaque é um campo da tabela —
 *  mover a estrela de plano não pode exigir editar um segundo lugar. */
export function planoDestaque(): Plano {
  return PLANOS.find((p) => p.destaque) ?? PLANOS[0];
}

/** O plano mais barato — a origem do "a partir de". Primeiro da lista por convenção
 *  (a tabela é ordenada por preço), e não por `Math.min` de string. */
export function planoPiso(): Plano {
  return PLANOS[0];
}

/* ─────────────────────────── a copy, por ICP ───────────────────────────
 *
 * O ÚNICO EIXO EM QUE OS DOIS MUNDOS DIVERGEM. Preço, limite e excedente são os
 * mesmos; o que muda é para QUEM o plano é e o que o botão promete. Uma linha extra
 * de especificação também vive aqui: terapeuta compra nota fiscal, barbeiro não.
 */
export type CopiaPlano = {
  /** Uma linha dizendo para quem é. É o que faz a pessoa se reconhecer no cartão. */
  resumo: string;
  /** Rótulo do botão. Ação, nunca "Saiba mais". */
  cta: string;
};

type CopiaIcp = {
  titulo: string;
  lead: string;
  /** Linhas extras coladas ao fim das `specs`, só neste mundo. */
  extras: readonly Spec[];
  garantias: readonly string[];
  nota: string;
  planos: Record<ChavePlano, CopiaPlano>;
};

export const COPIA: Record<ICP, CopiaIcp> = {
  barbeiros: {
    titulo: "Escolha o tamanho da sua operação.",
    /* ⚠️ O LEAD NÃO PODE FALAR DE CADEIRA. Cadeira é ilimitada nos três planos, e o
       cartão logo abaixo diz isso. Enquanto esta frase dizia "quantas cadeiras cabem",
       ela prometia um limite que a tabela não tem — e jogava fora o único argumento que
       nenhum concorrente vertical consegue copiar. */
    lead: "Todos atendem no WhatsApp que a barbearia já usa e começam a marcar horário no mesmo dia. Cadeira é ilimitada nos três — a diferença é quantos agendamentos a maisa fecha no mês.",
    extras: [],
    garantias: [
      "No ar em cerca de 30 minutos",
      "Se não se pagar no primeiro mês, a gente devolve",
      "Sem fidelidade — cancele quando quiser",
    ],
    nota: "Barbeiro é ilimitado em todos os planos: contrate quantos quiser, você paga pelo que a maisa agenda. Um lembrete por agendamento, sempre. Ela atende no número que a barbearia já tem — você não troca de WhatsApp nem avisa cliente nenhum. Passou do limite do mês, você paga só o excedente; nada trava.",
    planos: {
      essencial: {
        resumo: "Pra barbearia que ainda não enche a agenda e quer parar de perder horário.",
        cta: "Começar no Essencial",
      },
      profissional: {
        resumo: "Pra quem já tem equipe e agenda disputada o mês inteiro.",
        cta: "Ativar minha agenda",
      },
      escala: {
        resumo: "Pra rede com mais de uma unidade e volume alto todo mês.",
        cta: "Falar sobre o Escala",
      },
    },
  },
  terapeutas: {
    titulo: "Custa menos que uma sessão por mês.",
    /* Mesmo motivo do lead de barbeiros: terapeuta é ilimitado nos três. */
    lead: "Escolhe o plano e a maisa começa a atender no mesmo dia. Terapeuta é ilimitado nos três — a diferença é quantos atendimentos ela marca no mês.",
    /* A linha que só existe neste mundo: a página inteira de terapeutas é sobre a
       NFS-e, e um cartão de preço que não a menciona parece esconder um adicional. */
    extras: [{ rotulo: "Nota fiscal e recibo", valor: "incluídos" }],
    garantias: [
      "No ar em cerca de 30 minutos",
      "Se não se pagar no primeiro mês, a gente devolve",
      "Sem fidelidade — cancele quando quiser",
    ],
    nota: "Terapeuta é ilimitado em todos os planos: traga quem quiser pra clínica, você paga pelo que a maisa agenda. Um lembrete por agendamento, sempre. Ela atende no número que você já usa e emite a nota de cada sessão. Passou do limite do mês, você paga só o excedente; nada trava.",
    planos: {
      essencial: {
        resumo: "Pra quem atende sozinho e quer parar de emitir nota à mão.",
        cta: "Começar no Essencial",
      },
      profissional: {
        resumo: "Agenda cheia, mês fechado em um clique e relatório pro contador.",
        cta: "Ativar a maisa",
      },
      escala: {
        resumo: "Pra clínica com agenda cheia todos os dias e volume alto no mês.",
        cta: "Falar sobre o Escala",
      },
    },
  },
};

/** Para quem o cartão de um plano fala: um dos dois ICPs, ou `generico`.
 *
 *  ⚠️ `generico` NÃO É UM TERCEIRO ICP. Não tem LP, nem `COPIA`, nem título de seção. É quem
 *  chega ao `/assinar` sem `?icp=` (a LP tradicional, um link solto, um anúncio genérico), e
 *  o negócio dele nasce com a vertical `generico`. Até 22/10/2026 esse caso caía na copy de
 *  terapeutas e o cartão prometia "Nota fiscal e recibo: incluídos" para uma loja de
 *  bicicleta. Para ele valem só os números do plano, que são verdade para qualquer negócio. */
export type PublicoDoCartao = ICP | "generico";

/** As `specs` do plano já com a linha extra do mundo, na ordem em que o cartão mostra. */
export function specsDoPlano(plano: Plano, publico: PublicoDoCartao): readonly Spec[] {
  return publico === "generico" ? plano.specs : [...plano.specs, ...COPIA[publico].extras];
}

/** A mensagem do WhatsApp por plano e por mundo — a conversa já começa no contexto
 *  certo, em vez de três botões abrindo a mesma frase genérica.
 *
 *  ⚠️ O NÚMERO NÃO É DIGITADO AQUI. Vem do `whatsappUrl` de `./icp.ts`, que se declara
 *  fonte única do CTA de WhatsApp das landing pages e é módulo puro de propósito, para
 *  Server Components poderem importá-lo. Redigitar um telefone seria repetir com o
 *  número o defeito que este arquivo acabou de consertar com os preços. */
export function mensagemPlano(plano: Plano, icp: ICP): string {
  const quem = icp === "barbeiros" ? "Tenho uma barbearia" : "Sou terapeuta";
  return whatsappUrl(
    `Oi! ${quem} e quero ativar a maisa no plano ${plano.nome} (${plano.preco}/mês). Como começo?`,
  );
}

/* ─────────────────────────── a campanha viaja junto ───────────────────────────
 *
 * Os parâmetros de campanha que o anúncio põe na URL da LP e que o `/assinar` grava no
 * metadata do usuário (`app/assinar/[plano]/Assinar.tsx`), de onde `npm run leads` lê.
 *
 * ⚠️ O BURACO QUE ISTO FECHA (22/10/2026). O anúncio cai na LP com `?utm_source=…&gclid=…`,
 * e o botão do plano montava `/assinar/<plano>?icp=…` — sem nada disso. O `/assinar` lia a
 * própria URL, achava vazio e gravava o lead sem campanha. Todo cadastro vindo de LP chegava
 * como "orgânico", e tráfego pago sem atribuição é orçamento no escuro.
 *
 * ⚠️ A LISTA É ESTA E SÓ ESTA. O HTML estático de terapeutas a redigita no script que
 * reescreve os links, e o `planos.test.ts` reprova se uma chave daqui faltar lá. */
export const CAMPANHA = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "fbclid",
] as const;

/** Teto de cada valor de campanha. É texto que qualquer um escreve na barra de endereço, e
 *  vai parar no metadata do usuário: sem teto, um `?utm_content=` de 50 mil caracteres. */
export const CAMPANHA_MAX = 120;

/**
 * Os parâmetros de campanha de uma busca (`?…`), já com teto. Vazio quando não há nenhum.
 *
 * Função pura e não `useSearchParams` porque três lugares a usam: o `/assinar`, o componente
 * que reescreve os links das LPs do Next e o `linkPlano` abaixo.
 */
export function campanhaDaBusca(busca: string | URLSearchParams): Record<string, string> {
  const q = typeof busca === "string" ? new URLSearchParams(busca) : busca;
  const m: Record<string, string> = {};
  for (const k of CAMPANHA) {
    const v = q.get(k);
    if (v) m[k] = v.slice(0, CAMPANHA_MAX);
  }
  return m;
}

/**
 * O mesmo `href`, com a campanha da página acrescentada. O que o link já traz não é
 * sobrescrito: um link que alguém montou com `utm_source` próprio sabe o que está dizendo.
 *
 * Só mexe em link relativo (`/assinar/…`). Link para fora (o WhatsApp do Escala) não leva a
 * campanha: não há quem a leia do outro lado, e o texto da mensagem não é lugar para ela.
 */
export function comCampanha(href: string, busca: string | URLSearchParams): string {
  if (!href.startsWith("/")) return href;
  const campanha = campanhaDaBusca(busca);
  const chaves = Object.keys(campanha);
  if (!chaves.length) return href;
  const i = href.indexOf("#");
  const ancora = i === -1 ? "" : href.slice(i);
  const semAncora = i === -1 ? href : href.slice(0, i);
  const j = semAncora.indexOf("?");
  const caminho = j === -1 ? semAncora : semAncora.slice(0, j);
  const q = new URLSearchParams(j === -1 ? "" : semAncora.slice(j + 1));
  for (const k of chaves) if (!q.has(k)) q.set(k, campanha[k]);
  return `${caminho}?${q.toString()}${ancora}`;
}

/** Para onde o botão de um plano aponta: o pré-cadastro nos planos autoatendidos, o
 *  WhatsApp no `escala`. Ver a nota "para onde o botão vai", acima.
 *
 *  O `?icp=` viaja porque a página de pré-cadastro precisa dele para duas coisas: a
 *  vertical do negócio que vai ser criado e a copy do cartão. Sem ele, cai em `generico`.
 *
 *  ⚠️ `externo: false` nos autoatendidos é o que mantém o clique na mesma aba. Abrir o
 *  formulário de compra num `_blank` perde o histórico de navegação — e com ele o
 *  "voltar" que a pessoa usa quando quer reler a página de preço antes de decidir.
 *
 *  ⚠️ A CAMPANHA (`busca`) É OPCIONAL AQUI PORQUE AS LPs SÃO RENDERIZADAS NO SERVIDOR SEM A
 *  URL DO VISITANTE: as de barbeiros são estáticas, e ler a query no servidor as tornaria
 *  dinâmicas. Quem repassa a campanha nelas é o `<RepassaCampanha>` do `<World>`, que
 *  reescreve os links no navegador com `comCampanha`. Quem tiver a busca em mãos passa aqui. */
export function linkPlano(
  plano: Plano,
  icp: ICP,
  busca: string | URLSearchParams = "",
): { href: string; externo: boolean } {
  const autoatendido = (AUTOATENDIDOS as readonly string[]).includes(plano.chave);
  return autoatendido
    ? { href: comCampanha(`/assinar/${plano.chave}?icp=${icp}`, busca), externo: false }
    : { href: mensagemPlano(plano, icp), externo: true };
}
