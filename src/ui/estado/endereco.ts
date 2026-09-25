/* ─────────────────────────────────────────────────────────────────────────────
 * O ENDEREÇO DO PAINEL: o que a URL pode pedir, e o que acontece quando pede errado.
 *
 * Função pura, sem React, para ser testada (guarda G10, `src/ui/guardas/endereco.test.ts`).
 * O store lê daqui; a lista de telas não mora em mais lugar nenhum.
 *
 * ⚠️ VALIDA ANTES DE APLICAR. `TelaId` é tipo, e tipo não existe em runtime: um
 * `?tela=qualquercoisa` que passasse viraria `st.tela` inválido, o mapa de telas devolveria
 * `undefined` e o painel inteiro ficaria branco, a partir de um parâmetro que qualquer um
 * escreve na barra de endereço. Valor fora da lista devolve `null`, e quem chama fica na tela
 * padrão.
 *
 * ⚠️ OS APELIDOS SÃO PARA SEMPRE. `faturamento` (o id do Fiscal desde que o rótulo mudou, em
 * 26/08/2026), `equipe`, `servicos` e `mais` já foram mandados em link de WhatsApp, e o
 * `/?tela=mais&pagamento=recebido` é a volta do checkout. Link enviado não se edita: quando o
 * item 2.40 do backlog juntar Equipe, Serviços e Mais em "Seu negócio", estes nomes continuam
 * abrindo o lugar certo, por aqui.
 *
 * `?secao=` existe no Documento fiscal (1A.14, 25/09/2026): `autorizacao` e `carne-leao`
 * levam direto ao passo a passo do site da Receita, e é para onde o "Renovar autorização" da
 * tela Fiscal aponta. Cada chave tem lista fechada e padrão em `SECOES`, e o G10 cobra as duas.
 *
 * ★ A URL ESPELHA O LUGAR (T9, 25/09/2026, contradição C7). Até aqui o `?tela=` era instrução de
 * chegada: o store aplicava e apagava, para o F5 no meio de outra tela não pular de volta. O
 * motivo era a URL ficar velha. Agora o store ESCREVE a URL a cada navegação (`escreverEndereco`,
 * com `replaceState`), então ela nunca envelhece e o F5 volta aonde a pessoa está: tela, recorte,
 * o que está aberto na gaveta (`?abrir=`), a conversa (`?conversa=`) e o filtro (`?filtro=`).
 * Parâmetro que não é nosso (`?google=`, `?pagamento=`) passa intacto: quem o lê é que apaga.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { TelaId } from "./store";

/** Toda tela que o `?tela=` abre. */
export const TELAS_DO_ENDERECO = [
  "fluxo", "conversas", "agenda", "clientes", "faturamento", "fiscal",
  "equipe", "servicos", "assistente", "contatos", "mais",
] as const satisfies readonly TelaId[];

/** Nomes que já saíram em link e não podem deixar de abrir. */
export const APELIDOS_ETERNOS = ["faturamento", "equipe", "servicos", "mais"] as const;

export function telaDoEndereco(valor: string | null | undefined): TelaId | null {
  if (!valor) return null;
  return (TELAS_DO_ENDERECO as readonly string[]).includes(valor) ? (valor as TelaId) : null;
}

/** `?secao=` por tela: a lista fechada e o padrão. */
export const SECOES: Partial<Record<TelaId, { validas: readonly string[]; padrao: string }>> = {
  /* `inicio` é a tela como sempre foi, do topo. `recibo` e `nota` chegam do wizard (1B.14): com a
   * escolha ainda não gravada, abrem o formulário daquele caminho. */
  fiscal: { validas: ["inicio", "dados", "autorizacao", "carne-leao", "recibo", "nota"], padrao: "inicio" },
};

export function secaoDoEndereco(tela: TelaId, valor: string | null | undefined): string | null {
  const regra = SECOES[tela];
  if (!regra) return null;
  return valor && regra.validas.includes(valor) ? valor : regra.padrao;
}

/* ───────────────────────── o lugar inteiro, lido e escrito ───────────────────────── */

/** Onde a pessoa está, do jeito que cabe na URL. `null` é "nada", e some da URL. */
export type Endereco = {
  tela: TelaId;
  secao: string | null;
  /** O id aberto na gaveta. */
  abrir: string | null;
  /** A conversa escolhida em Conversas. */
  conversa: string | null;
  /** O filtro da lista da tela, quando ela tem (`FILTROS`). */
  filtro: string | null;
};

/** As chaves que o store é dono. Qualquer outra passa pela escrita sem ser tocada. */
export const CHAVES_DO_ENDERECO = ["tela", "secao", "abrir", "conversa", "filtro"] as const;

/** `?filtro=` por tela: lista fechada e padrão, como `SECOES`. O padrão não vai para a URL. */
export const FILTROS: Partial<Record<TelaId, { validos: readonly string[]; padrao: string }>> = {
  clientes: { validos: ["ativos", "inativos", "todos"], padrao: "ativos" },
};

export function filtroDoEndereco(tela: TelaId, valor: string | null | undefined): string | null {
  const regra = FILTROS[tela];
  if (!regra) return null;
  return valor && regra.validos.includes(valor) ? valor : regra.padrao;
}

/** Um id de gaveta ou de conversa que a URL pode carregar. Lista não há (são ids de banco), então
 *  a regra é de forma: curto, sem espaço nem símbolo. O rascunho de atendimento (`novo-…`) não
 *  vai: é um formulário pela metade, e o F5 o abriria vazio. */
const ID_OK = /^[A-Za-z0-9_:.-]{1,80}$/;
export function idDoEndereco(valor: string | null | undefined): string | null {
  if (!valor || !ID_OK.test(valor) || valor.startsWith("novo-")) return null;
  return valor;
}

/**
 * O que a URL pede, já validado. `null` quando ela não pede tela nenhuma (a pessoa chegou em `/`)
 * ou pede uma que não existe: quem chama fica no Fluxo, e o resto da URL não vale sem a tela.
 */
export function lerEndereco(busca: string): Endereco | null {
  const q = new URLSearchParams(busca);
  const tela = telaDoEndereco(q.get("tela"));
  if (!tela) return null;
  return {
    tela,
    secao: secaoDoEndereco(tela, q.get("secao")),
    abrir: idDoEndereco(q.get("abrir")),
    conversa: tela === "conversas" ? idDoEndereco(q.get("conversa")) : null,
    filtro: filtroDoEndereco(tela, q.get("filtro")),
  };
}

/**
 * A busca (`?…`) que espelha `e`, mantendo o que não é nosso de `buscaAtual`. Padrão não se
 * escreve (o Fluxo sem nada aberto é `/`, a seção padrão e o filtro padrão somem), para o link
 * copiado da barra ser o mais curto que volta ao mesmo lugar.
 */
export function escreverEndereco(buscaAtual: string, e: Endereco): string {
  const q = new URLSearchParams(buscaAtual);
  for (const k of CHAVES_DO_ENDERECO) q.delete(k);
  const secao = e.secao && e.secao !== SECOES[e.tela]?.padrao ? e.secao : null;
  const filtro = e.filtro && e.filtro !== FILTROS[e.tela]?.padrao ? e.filtro : null;
  const abrir = idDoEndereco(e.abrir);
  const conversa = e.tela === "conversas" ? idDoEndereco(e.conversa) : null;
  const vazio = e.tela === "fluxo" && !secao && !abrir && !filtro;
  const nossas = new URLSearchParams();
  if (!vazio) nossas.set("tela", e.tela);
  if (secao) nossas.set("secao", secao);
  if (conversa) nossas.set("conversa", conversa);
  if (filtro) nossas.set("filtro", filtro);
  if (abrir) nossas.set("abrir", abrir);
  const tudo = [nossas.toString(), q.toString()].filter(Boolean).join("&");
  return tudo ? `?${tudo}` : "";
}
