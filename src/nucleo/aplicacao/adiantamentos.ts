/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — pagou adiantado, o crédito de sessões (12/11/2026, a Regina).
 *
 * O paciente paga N sessões antes de elas acontecerem. Duas coisas nascem juntas:
 *   · o PAGAMENTO avulso, pelo mesmo caminho do "Lançar à mão" (`lancarAvulso`): é ele que vira o
 *     recibo, com a data do pagamento, e herda todas as conferências (CPF, data no futuro, caminho);
 *   · o CRÉDITO, que faz as próximas N sessões da agenda ficarem fora de outro recibo e do Pix.
 *
 * ⚠️ OS DOIS OU NENHUM. Pagamento sem crédito emitiria o recibo do adiantamento E, depois, o de cada
 * sessão: recibo em dobro. Se gravar o crédito falhar, o pagamento recém-criado é apagado.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { LancarAdiantamento, LancarPagamentoAvulso, ListarAdiantamentos } from "../portas/entrada/casos-de-uso";
import type { RepositorioAdiantamentos } from "../portas/saida/repositorio-adiantamentos";
import type { RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import { DadoInvalido } from "../dominio/erros";

/** O pacote maior que se aceita. Mais que isso é erro de digitação (um "40" que era "4"). */
export const MAXIMO_DE_SESSOES_ADIANTADAS = 60;

export function criarLancarAdiantamento(deps: {
  lancarAvulso: LancarPagamentoAvulso;
  recibos: Pick<RepositorioRecibos, "excluirAvulso">;
  adiantamentos: RepositorioAdiantamentos;
}): LancarAdiantamento {
  return async (t, p) => {
    if (!p.clienteId?.trim()) throw new DadoInvalido("Diga de quem é o pagamento.", "clienteId");
    const sessoes = Number(p.sessoes);
    if (!Number.isInteger(sessoes) || sessoes < 1 || sessoes > MAXIMO_DE_SESSOES_ADIANTADAS) {
      throw new DadoInvalido(`Quantas sessões foram pagas? De 1 a ${MAXIMO_DE_SESSOES_ADIANTADAS}.`, "sessoes");
    }

    const pagamento = await deps.lancarAvulso(t, {
      data: p.data,
      valor: p.valor,
      nome: p.nome,
      cpf: p.cpf,
      cpfPagador: p.cpfPagador ?? null,
      clienteId: p.clienteId,
      /* Bilhete para a dona, que nunca sai no documento (ver `RascunhoAvulso.observacao`). */
      observacao: `Pagou ${sessoes} ${sessoes === 1 ? "sessão" : "sessões"} adiantado`,
    });

    try {
      const { id } = await deps.adiantamentos.criar(t, {
        clienteId: p.clienteId,
        pagamentoId: pagamento.id,
        sessoes,
        aPartirDe: pagamento.data,
      });
      return { adiantamentoId: id, pagamento };
    } catch (e) {
      await deps.recibos.excluirAvulso(t, pagamento.id).catch(() => undefined);
      throw e;
    }
  };
}

export function criarListarAdiantamentos(deps: { adiantamentos: RepositorioAdiantamentos }): ListarAdiantamentos {
  return (t) => deps.adiantamentos.listar(t);
}
