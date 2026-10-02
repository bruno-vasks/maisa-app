/* ─────────────────────────────────────────────────────────────────────────────
 * QUANTOS RECIBOS POR MÊS — as sessões de uma pessoa num recibo só (01/10/2026).
 *
 * ★ BRUNO, DEPOIS DA CALL COM A REGINA: *"a ideia é que cada paciente só recebe um recibo por mês,
 * mas podemos configurar isso também"*. Até aqui era um recibo por sessão: quatro sessões em
 * setembro, quatro documentos na Receita e quatro mensagens no WhatsApp do paciente.
 *
 * Agora o padrão é UM por mês (`RECIBOS_POR_MES_PADRAO`), e a ficha de cada pessoa escolhe 1, 2,
 * 3, 4 ou "um por sessão" (`0`). Com 2, as sessões do mês se dividem em duas metades, em ordem de
 * data: é a pessoa que paga a cada quinze dias.
 *
 * ── O QUE NUNCA SE JUNTA ──
 *
 *   · sessões de MESES diferentes: a renda entra no Carnê-Leão pelo mês do pagamento, e um recibo
 *     com setembro e outubro dentro jogaria setembro para outubro;
 *   · pessoas diferentes, ou a mesma pessoa com outro pagador (a mãe que paga uma parte): o recibo
 *     tem UM beneficiário e UM pagador;
 *   · pagamento lançado à mão de quem não tem ficha (`clienteId: null`): sem ficha não há escolha
 *     de quantos por mês, e juntar por nome juntaria duas Anas.
 *
 * A data do recibo juntado é a da ÚLTIMA sessão do grupo, e é uma escolha: o produto não sabe o dia
 * em que a pessoa pagou, e a última sessão é o dia mais tarde que ainda é desse mês.
 * ────────────────────────────────────────────────────────────────────────────── */

import { mesDe } from "./tempo";

/** Um recibo por mês: todas as sessões do mês juntas. */
export const RECIBOS_POR_MES_PADRAO = 1;

/** As escolhas da ficha. `0` = um recibo por sessão, como era antes. */
export const OPCOES_RECIBOS_POR_MES = [1, 2, 3, 4, 0] as const;

export function recibosPorMesValido(v: unknown): v is number {
  return typeof v === "number" && (OPCOES_RECIBOS_POR_MES as readonly number[]).includes(v);
}

/** Como a ficha diz cada escolha. */
export function rotuloRecibosPorMes(n: number): string {
  if (n === 0) return "Um por sessão";
  if (n === 1) return "Um por mês, com todas as sessões";
  return `${n} por mês, dividindo as sessões`;
}

/** O mínimo que um pagamento precisa ter para entrar num recibo junto com outros. */
export type Juntavel = {
  clienteId: string | null;
  cpf: string | null;
  cpfPagador: string | null;
  /** Data civil da sessão, ISO. */
  data: string;
};

/**
 * Divide `itens` em recibos.
 *
 * `porMesDe(clienteId)` diz quantos recibos por mês aquela pessoa quer (ver
 * `OPCOES_RECIBOS_POR_MES`). Cada grupo sai em ordem de data, e os grupos saem na ordem em que a
 * primeira sessão de cada um aparece em `itens`.
 *
 * Divisão em N: o mais igual possível, e os primeiros levam a sobra. Cinco sessões em 2 recibos são
 * 3 e 2. Pedir mais recibos que sessões dá um por sessão.
 */
export function juntarEmRecibos<T extends Juntavel>(itens: T[], porMesDe: (clienteId: string) => number): T[][] {
  const grupos = new Map<string, T[]>();
  const sozinhos: { pos: number; itens: T[] }[] = [];
  const ordem: { pos: number; chave: string }[] = [];

  itens.forEach((x, pos) => {
    if (!x.clienteId) { sozinhos.push({ pos, itens: [x] }); return; }
    const chave = [x.clienteId, x.cpf ?? "", x.cpfPagador ?? "", mesDe(x.data)].join("|");
    if (!grupos.has(chave)) { grupos.set(chave, []); ordem.push({ pos, chave }); }
    grupos.get(chave)!.push(x);
  });

  const saida: { pos: number; itens: T[] }[] = [...sozinhos];
  for (const { pos, chave } of ordem) {
    const doMes = [...grupos.get(chave)!].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    const pedido = porMesDe(doMes[0].clienteId!);
    const n = doMes.length;
    const k = pedido <= 0 ? n : Math.min(pedido, n);
    const base = Math.floor(n / k);
    const sobra = n % k;
    let i = 0;
    for (let g = 0; g < k; g++) {
      const tamanho = base + (g < sobra ? 1 : 0);
      saida.push({ pos: pos + g / k, itens: doMes.slice(i, i + tamanho) });
      i += tamanho;
    }
  }
  return saida.sort((a, b) => a.pos - b.pos).map((g) => g.itens);
}

/**
 * A descrição que sai no documento quando ele junta sessões.
 *
 * ⚠️ Só datas, nunca o nome do serviço, pela regra de `descricaoPadrao` no caso de uso ("Terapia de
 * casal" num recibo é dado sensível). As datas são justamente o que o plano de saúde pede para
 * reembolsar. Cabe no teto de 255 da Receita até com 31 sessões.
 */
export function descricaoDasSessoes(datas: string[]): string {
  const ordenadas = [...datas].map((d) => d.slice(0, 10)).sort();
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (ordenadas.length === 1) {
    const [a, m, d] = ordenadas[0].split("-");
    return `Atendimento realizado em ${d}/${m}/${a}`;
  }
  const ultima = ordenadas[ordenadas.length - 1];
  const antes = ordenadas.slice(0, -1).map(ddmm).join(", ");
  return `Atendimentos realizados em ${antes} e ${ddmm(ultima)}/${ultima.slice(0, 4)}`;
}
