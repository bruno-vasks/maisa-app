/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ **O BOTÃO DIZ A VERDADE ANTES DO CLIQUE.** `faltaDoLancamento` devolve vazio só quando o
 * lançamento é aceitável; qualquer outra coisa é a frase que aparece ao lado do botão desligado.
 * Antes desta função o botão ficava clicável, o servidor recusava, e a resposta morria embaixo da
 * dobra — "cliquei em lançar e não lançou".
 *
 * ⚠️ O CPF É CONFERIDO NO DÍGITO VERIFICADOR, não no tamanho. A Receita recusa o arquivo INTEIRO
 * por causa de uma linha, e a mensagem dela fala do arquivo. Aceitar `000.000.000-00` aqui é
 * transformar um erro de digitação num fechamento de mês recusado.
 *
 * ★ **CLIENTE DE TESTE NÃO ENTRA NO SELETOR.** `lancaveis` é uma linha e evita a pior falha deste
 * formulário: a `v_a_recibar` lê `coalesce(c.teste,false)` e `lerRecibosPendentes` filtra `!teste`
 * — escolher um cliente de teste gravava a linha no banco e ela nunca voltava na lista. O
 * formulário dizia "lançado" e nada aparecia.
 *
 * Este arquivo existe porque a função é a mesma nas DUAS telas que lançam pagamento (a de emitir e
 * a do arquivo do e-CAC). Era código duplicado até 26/08/2026; um teste só garante as duas.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { faltaDoLancamento, lancaveis, mascaraCpf, type Rascunho } from "./NovoPagamento";

/** Um lançamento válido. Cada teste estraga um campo de propósito. */
const bom = (over: Partial<Rascunho> = {}): Rascunho => ({
  nome: "Patrícia Mendes",
  cpf: "545.739.088-89",
  datas: ["2026-08-20"],
  valor: "250",
  cpfPagador: "",
  clienteId: "",
  ...over,
});

describe("faltaDoLancamento", () => {
  /* ★ VÁRIAS DATAS NUM LANÇAMENTO (12/11/2026, a Regina). */
  it("aceita mais de uma data", () => {
    expect(faltaDoLancamento(bom({ datas: ["2026-08-06", "2026-08-13", "2026-08-20"] }))).toBe("");
  });

  it("data vazia, repetida ou no futuro trava o botão", () => {
    expect(faltaDoLancamento(bom({ datas: [] }))).toContain("dia");
    expect(faltaDoLancamento(bom({ datas: ["2026-08-06", ""] }))).toContain("dia");
    expect(faltaDoLancamento(bom({ datas: ["2026-08-06", "2026-08-06"] }))).toContain("repetido");
    expect(faltaDoLancamento(bom({ datas: ["2026-08-06", "2999-01-01"] }))).toContain("já passaram");
  });

  it("lançamento completo não falta nada", () => {
    expect(faltaDoLancamento(bom())).toBe("");
  });

  it("sem nome, pede o nome", () => {
    expect(faltaDoLancamento(bom({ nome: "  " }))).toContain("nome");
  });

  it("sem CPF, pede o CPF", () => {
    expect(faltaDoLancamento(bom({ cpf: "" }))).toContain("CPF");
  });

  /* ★ O TESTE QUE IMPORTA: onze dígitos que não fecham na conta. */
  it("⚠️ CPF com 11 dígitos mas inválido é recusado aqui", () => {
    expect(faltaDoLancamento(bom({ cpf: "111.111.111-11" }))).toContain("não fecha");
    expect(faltaDoLancamento(bom({ cpf: "000.000.000-00" }))).not.toBe("");
  });

  it("valor zero ou vazio pede o valor", () => {
    expect(faltaDoLancamento(bom({ valor: "" }))).toContain("valor");
    expect(faltaDoLancamento(bom({ valor: "0" }))).toContain("valor");
  });

  /* Quem digita "250,50" está certo — a vírgula é a do teclado dela. */
  it("aceita vírgula decimal", () => {
    expect(faltaDoLancamento(bom({ valor: "250,50" }))).toBe("");
  });

  /* O CPF de quem pagou é OPCIONAL (vazio = pagou por si), mas se vier tem que fechar: é ele que
   * vai no recibo de quem deduz no IRPF. */
  it("CPF do pagador vazio é válido; torto não é", () => {
    expect(faltaDoLancamento(bom({ cpfPagador: "" }))).toBe("");
    expect(faltaDoLancamento(bom({ cpfPagador: "111.444.777-35" }))).toBe("");
    expect(faltaDoLancamento(bom({ cpfPagador: "111.111.111-11" }))).toContain("quem pagou");
  });

  /* A ordem da frase é a ordem em que se resolve: pedir o valor antes do nome faria a pessoa
   * pular pelo formulário. */
  it("pede uma coisa por vez, na ordem do formulário", () => {
    expect(faltaDoLancamento(bom({ nome: "", cpf: "", valor: "" }))).toContain("nome");
  });
});

describe("mascaraCpf", () => {
  it("pontua enquanto digita e para em 11 dígitos", () => {
    expect(mascaraCpf("54573908889")).toBe("545.739.088-89");
    expect(mascaraCpf("545739088890000")).toBe("545.739.088-89");
  });

  it("ignora o que não é dígito", () => {
    expect(mascaraCpf("abc545xyz739")).toBe("545.739");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O SELETOR DE CLIENTE — o que pode ser escolhido sem sumir depois.
 * ────────────────────────────────────────────────────────────────────────────── */

/** O mínimo que a função lê. O resto do cliente não interessa aqui — é por isso que ela é genérica. */
type Ficha = { id: string; teste?: boolean };

describe("lancaveis", () => {
  it("cliente normal fica", () => {
    const todos: Ficha[] = [{ id: "a" }, { id: "b" }];
    expect(lancaveis(todos)).toHaveLength(2);
  });

  /* ⚠️ O caso que motivou a função: lançamento gravado no banco que nunca volta na lista. */
  it("cliente de teste sai — a view filtra e o lançamento sumiria calado", () => {
    const todos: Ficha[] = [{ id: "a" }, { id: "t", teste: true }];
    const fica = lancaveis(todos);

    expect(fica).toHaveLength(1);
    expect(fica[0].id).toBe("a");
  });

  it("`teste: false` fica — só o `true` some", () => {
    const todos: Ficha[] = [{ id: "a", teste: false }];
    expect(lancaveis(todos)).toHaveLength(1);
  });
});
