/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM — a contabilidade de uma emissão de recibos.
 *
 * ★ **FALHA NÃO CONTA COMO FEITO.** O cartão do canto mostra `feitos/total` e dá um check no
 * último nome. Se um recibo recusado subisse o contador, a tela afirmaria que saiu um documento
 * fiscal que não existe — e a dona só descobriria na hora em que o paciente pedisse o recibo para
 * o plano de saúde.
 *
 * ⚠️ E `ultimo` SÓ ANDA QUANDO SAIU. É o nome que recebe o ✓ verde. Dar check em quem foi recusado
 * é a mentira mais cara que esta tela consegue contar.
 *
 * Estas duas funções vivem fora do laço do store por isso: o laço precisa de rede e de React para
 * rodar, e a conta que ele faz precisa de teste.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { aplicarDesfecho, comecarEmissao, type NaFila } from "./store";

const fila = (...nomes: string[]): NaFila[] =>
  nomes.map((nome, i) => ({ itens: [{ fonte: "atendimento" as const, id: `at${i}` }], nome }));

describe("comecarEmissao", () => {
  it("começa em zero, apontando para o primeiro da fila", () => {
    expect(comecarEmissao(fila("Ana", "Bia", "Cau"))).toEqual({
      estado: "andando", total: 3, feitos: 0, atual: "Ana", ultimo: null, falhas: [],
    });
  });

  /* Fila vazia não deveria chegar aqui (o store recusa antes), mas se chegar não pode estourar
   * num `fila[0].nome`. */
  it("fila vazia não estoura", () => {
    expect(comecarEmissao([])).toMatchObject({ total: 0, atual: null });
  });
});

describe("★ aplicarDesfecho", () => {
  const inicio = comecarEmissao(fila("Ana", "Bia"));

  it("saiu: conta, e o nome ganha o check", () => {
    const e = aplicarDesfecho(inicio, "Ana", null);
    expect(e.feitos).toBe(1);
    expect(e.ultimo).toBe("Ana");
    expect(e.falhas).toEqual([]);
  });

  /* ★ O TESTE QUE JUSTIFICA O ARQUIVO. */
  it("recusado: NÃO conta como feito", () => {
    const e = aplicarDesfecho(inicio, "Ana", "CPF do beneficiário inválido.");
    expect(e.feitos).toBe(0);
    expect(e.falhas).toEqual([{ nome: "Ana", erro: "CPF do beneficiário inválido." }]);
  });

  it("⚠️ recusado não recebe o check — `ultimo` fica onde estava", () => {
    const comUmaFeita = aplicarDesfecho(inicio, "Ana", null);
    const depoisDeFalhar = aplicarDesfecho(comUmaFeita, "Bia", "O canal recusou.");
    expect(depoisDeFalhar.ultimo).toBe("Ana");
  });

  it("as falhas acumulam, na ordem em que aconteceram", () => {
    let e = aplicarDesfecho(inicio, "Ana", "primeiro erro");
    e = aplicarDesfecho(e, "Bia", "segundo erro");
    expect(e.falhas.map((f) => f.nome)).toEqual(["Ana", "Bia"]);
  });

  /* `feitos + falhas.length` é o que o cartão usa para a barra: os dois somados são "resolvidos",
   * e a barra tem que chegar a 100% mesmo num lote em que tudo falhou — senão ela fica parada
   * pela metade dizendo "andando" depois do fim. */
  it("feitos + falhas fecha o total", () => {
    let e = aplicarDesfecho(inicio, "Ana", null);
    e = aplicarDesfecho(e, "Bia", "recusado");
    expect(e.feitos + e.falhas.length).toBe(e.total);
  });

  it("não muda o total nem o estado — quem fecha é o laço", () => {
    const e = aplicarDesfecho(inicio, "Ana", null);
    expect(e.total).toBe(2);
    expect(e.estado).toBe("andando");
  });
});
