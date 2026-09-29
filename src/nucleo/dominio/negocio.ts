/* ─────────────────────────────────────────────────────────────────────────────
 * NEGÓCIO — o assinante da MAISA, visto por dentro.
 *
 * Genérico de propósito: o MESMO app atende terapeutas e barbeiros, e a diferença
 * entre os dois vive nas landing pages e no catálogo de serviços, nunca aqui.
 *
 * ── EMENDA (13/08/2026): a vertical passou a existir no domínio ──
 *
 * O parágrafo acima dizia "nunca aqui" e continua valendo para COMPORTAMENTO. O que
 * mudou é que provisionar um negócio precisa escolher um catálogo de partida, e essa
 * escolha é um dado do negócio — está em `negocios.vertical` desde `002_multitenant.sql`.
 * Ignorá-la no TypeScript não a fazia sumir: fazia o app não saber pedir.
 *
 * O LIMITE, que é o que importa: `Vertical` só pode decidir o que o banco SEMEIA na
 * criação (catálogo, expediente, tom da assistente, FAQs). Nenhum `if (vertical === …)`
 * pode aparecer em caso de uso, adaptador ou tela. No instante em que aparecer, cada
 * cliente novo vira um ramo de código — que é exatamente o modo de falha que este
 * produto precisa evitar, porque ele é vendido com modificações pontuais por cliente.
 * Variação por cliente é LINHA NO BANCO. Se um dia não puder ser, é decisão consciente,
 * escrita aqui, não um `if` que alguém escreveu com pressa.
 * ────────────────────────────────────────────────────────────────────────────── */

import { colapsarEspaco } from "./texto";

/**
 * As verticais que o provisionamento sabe semear.
 *
 * ⚠️ Espelha o `check` de `provisionar_negocio` (`supabase/005_provisionar.sql:108`).
 * Acrescentar uma vertical é DOIS lugares: esta lista e aquele `check` — e mais os
 * blocos de seed da mesma função. Está duplicado de propósito: o banco precisa recusar
 * lixo mesmo se alguém chamar a RPC por fora do app, e o app precisa recusar antes de
 * gastar uma ida ao banco. Duas guardas, não uma repetida por descuido.
 */
export const VERTICAIS = ["terapeutas", "barbeiros", "generico"] as const;

export type Vertical = (typeof VERTICAIS)[number];

export const ehVertical = (v: unknown): v is Vertical =>
  typeof v === "string" && (VERTICAIS as readonly string[]).includes(v);

/* ───────────────────────────── o nome do negócio ─────────────────────────────
 * ⚠️ ESTE CAMPO NÃO É DECORATIVO — ELE SAI NA VOZ DA MAISA, PARA O CLIENTE FINAL.
 *
 * Ele aparece em três lugares, e só um deles é interno:
 *   • `persona.ts` — "Você é MAISA, a assistente de atendimento de ___". Vai no prompt
 *     de TODA mensagem de WhatsApp, então é o que o agente responde quando perguntam
 *     onde ele trabalha.
 *   • `lembretes.ts` — "…do seu horário hoje às 18:00, no ___".
 *   • a sidebar do painel, que é o único uso que o dono vê.
 *
 * Foi assim que se descobriu, em 14/08/2026, que o negócio de teste se chamava
 * `bruno.vaskevicius`: o primeiro lembrete de verdade chegou dizendo "no
 * bruno.vaskevicius". A linha nascera de SQL escrito à mão em 11/08, antes de existir
 * tela, e quem escreveu usou o prefixo do e-mail. Ninguém viu por três dias porque
 * NENHUMA TELA ESCREVIA ESSE CAMPO — só o `criar_negocio()`, no instante da criação.
 *
 * ── O TETO, E POR QUE ELE É MENOR DO QUE CABERIA NO BANCO ──
 * A coluna aceita texto livre. O limite aqui é do PROMPT: este nome entra inteiro no
 * contexto a cada mensagem, e um "nome" de 500 caracteres é token pago para sempre —
 * além de ser o vetor óbvio para escrever instrução dentro de um campo de cadastro.
 * 60 cabe em "Barbearia do Zé — Unidade Centro" com folga e não cabe num parágrafo.
 *
 * ⚠️ O MÍNIMO ESPELHA `provisionar_negocio` (`supabase/005_provisionar.sql:113`), que
 * levanta `check_violation` com menos de 2 caracteres. Duplicado de propósito, pelo
 * mesmo motivo de `VERTICAIS` acima: o banco recusa lixo mesmo se chamarem a RPC por
 * fora, e o app recusa antes de gastar uma ida ao banco. */
export const NOME_NEGOCIO_MIN = 2;
export const NOME_NEGOCIO_MAX = 60;

/** Colapsa espaço e apara as pontas — o mesmo `btrim` que a RPC faz, feito antes.
 *
 *  Delega para `dominio/texto.ts` desde 15/08/2026: esta função tinha cópia idêntica em
 *  `aplicacao/provisionar.ts` e o catálogo ia criar a terceira. O nome específico fica,
 *  porque é o que os chamadores importam e ele diz DE QUE campo se trata. */
export const normalizarNomeDoNegocio = (bruto: string): string => colapsarEspaco(bruto);

export type Negocio = {
  nome: string;
  plano: string;
  precoPlano: number;
  proximaCobranca: string;
  cartao: string;
  conversasPlano: string;
  /** A foto de perfil do negócio, como `data:` URL já reduzida no navegador. `null` ou ausente =
   *  sem foto, e a tela desenha o avatar sorteado (`ui/avatares.ts`). Ver `FOTO_MAX`. */
  foto?: string | null;
};

/* ───────────────────────────── a foto de perfil ─────────────────────────────
 * Pedida pelo Bruno em 29/09/2026 para a gaveta "Seu negócio": o rodapé do rail mostrava um
 * avatar sorteado e nada mais, sem clique.
 *
 * ── POR QUE `data:` URL NUMA COLUNA, E NÃO UM BUCKET ──
 * A foto é uma só por negócio e só o painel a mostra (a MAISA não manda foto no WhatsApp). O
 * navegador reduz para 256px e JPEG antes de enviar, o que dá 15 a 40 KB: cabe numa coluna de
 * texto e chega junto com o cadastro, sem política de storage, URL assinada nem limpeza de
 * arquivo órfão. Se um dia a foto for para fora do painel, aí vale um bucket.
 *
 * ⚠️ O TETO É DE CARACTERES DO TEXTO, e espelha o `check` de `031_foto_do_negocio.sql`. 200 mil
 * cabem com folga os 256px; uma foto de celular crua (3 a 5 MB) não cabe, e é de propósito: ela
 * viria em toda leitura do cadastro. */
export const FOTO_MAX = 200_000;

const PREFIXO_DA_FOTO = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** A foto é imagem, em base64, e cabe no teto. Não confere o conteúdo: quem desenha é um `<img>`. */
export function fotoAceitavel(foto: string): boolean {
  return foto.length <= FOTO_MAX && PREFIXO_DA_FOTO.test(foto);
}

/** Dados fiscais do prestador — cabeçalho do recibo de NFS-e. */
export type Prestador = {
  nome: string;
  doc: string;
};
