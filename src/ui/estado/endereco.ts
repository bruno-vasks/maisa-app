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
 * `?secao=` ainda não existe (entra com o item T9 do backlog). Quando entrar, cada chave ganha
 * uma lista fechada e um padrão em `SECOES`, e o G10 passa a cobrar as duas coisas.
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

/** `?secao=` por tela: a lista fechada e o padrão. Vazio até o T9. */
export const SECOES: Partial<Record<TelaId, { validas: readonly string[]; padrao: string }>> = {};

export function secaoDoEndereco(tela: TelaId, valor: string | null | undefined): string | null {
  const regra = SECOES[tela];
  if (!regra) return null;
  return valor && regra.validas.includes(valor) ? valor : regra.padrao;
}
