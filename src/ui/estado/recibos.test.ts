/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM — o número do selo do Fiscal para quem emite recibo.
 *
 * ★ **O SELO CONTA RECIBOS, NÃO SESSÕES, E SÓ QUEM TEM CPF.** É a conta do "A emitir" da tela
 * (`EmitirRecibos`). O teste de igualdade com `agrupar` + `juntarEmRecibos` é o que impede as duas
 * de se separarem: o selo dizendo 5 ao lado de um botão "Emitir 2" é o defeito que a tela já teve.
 *
 * ★ **SEM NÚMERO CERTO, SEM SELO.** Fora do caminho do recibo, antes de ler a lista, antes de ler
 * as fichas e com a leitura falha, `recibosParaOSelo` devolve `null`, nunca zero. Zero é uma
 * resposta ("nada a emitir") e o selo só some com ela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { juntarEmRecibos } from "@/nucleo/dominio/recibos-do-mes";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";
import { agrupar } from "@/ui/componentes/EmitirRecibos";
import { pagamentosDaResposta, recibosAEmitir, recibosParaOSelo } from "./recibos";

const pag = (over: Partial<PagamentoPendente> = {}): PagamentoPendente => ({
  id: "p1",
  fonte: "atendimento",
  clienteId: "cl1",
  cpfPagador: null,
  nome: "Patrícia Mendes",
  cpf: "545.739.088-89",
  data: "2026-10-07",
  valor: 250,
  podeExcluir: false,
  ...over,
});

/** Quatro sessões da Ana e uma da Bia, no mesmo mês. */
const MES = [
  pag({ id: "a1", clienteId: "ana", nome: "Ana", cpf: "111", data: "2026-10-01" }),
  pag({ id: "a2", clienteId: "ana", nome: "Ana", cpf: "111", data: "2026-10-08" }),
  pag({ id: "a3", clienteId: "ana", nome: "Ana", cpf: "111", data: "2026-10-15" }),
  pag({ id: "a4", clienteId: "ana", nome: "Ana", cpf: "111", data: "2026-10-22" }),
  pag({ id: "b1", clienteId: "bia", nome: "Bia", cpf: "222", data: "2026-10-05" }),
];
const umPorMes = () => 1;
const umPorSessao = () => 0;

describe("recibosAEmitir", () => {
  it("um recibo por mês: as sessões da mesma pessoa viram um só", () => {
    expect(recibosAEmitir(MES, umPorMes)).toBe(2);
  });

  it("um por sessão: conta as sessões", () => {
    expect(recibosAEmitir(MES, umPorSessao)).toBe(5);
  });

  it("a escolha é da ficha de cada pessoa", () => {
    expect(recibosAEmitir(MES, (id) => (id === "ana" ? 2 : 1))).toBe(3);
  });

  it("quem está sem CPF não conta: a Receita recusaria", () => {
    const lista = [...MES, pag({ id: "c1", clienteId: "caio", nome: "Caio", cpf: null }), pag({ id: "d1", clienteId: "dani", nome: "Dani", cpf: "" })];
    expect(recibosAEmitir(lista, umPorMes)).toBe(2);
  });

  it("lançado à mão sem ficha: um recibo por lançamento", () => {
    const avulsos = [
      pag({ id: "x1", fonte: "avulso", clienteId: null, nome: "Eva", cpf: "333" }),
      pag({ id: "x2", fonte: "avulso", clienteId: null, nome: "Eva", cpf: "333" }),
    ];
    expect(recibosAEmitir(avulsos, umPorMes)).toBe(2);
  });

  it("lista vazia é zero, não erro", () => {
    expect(recibosAEmitir([], umPorMes)).toBe(0);
  });

  it("★ é a mesma conta do 'A emitir' da tela (agrupar + juntarEmRecibos)", () => {
    const lista = [...MES, pag({ id: "c1", clienteId: "caio", nome: "Caio", cpf: null }), pag({ id: "x1", fonte: "avulso", clienteId: null, nome: "Eva", cpf: "333" })];
    for (const porMesDe of [umPorMes, umPorSessao, (id: string) => (id === "ana" ? 2 : 1)]) {
      const daTela = juntarEmRecibos(agrupar(lista).flatMap((g) => g.itens), porMesDe).length;
      expect(recibosAEmitir(lista, porMesDe)).toBe(daTela);
    }
  });
});

describe("pagamentosDaResposta", () => {
  it("resposta boa devolve a lista", () => {
    expect(pagamentosDaResposta({ ok: true, status: "ok", pagamentos: MES, total: 5, semCpf: 0 })).toEqual(MES);
  });

  it("lista vazia é uma resposta, não falha", () => {
    expect(pagamentosDaResposta({ ok: true, pagamentos: [] })).toEqual([]);
  });

  it("ok:false, 200 sem lista e resposta nula são falha (null), nunca lista vazia", () => {
    expect(pagamentosDaResposta({ ok: false, info: "sessão vencida" })).toBeNull();
    expect(pagamentosDaResposta({ ok: true })).toBeNull();
    expect(pagamentosDaResposta({ pagamentos: "x" })).toBeNull();
    expect(pagamentosDaResposta(null)).toBeNull();
    expect(pagamentosDaResposta(undefined)).toBeNull();
  });
});

describe("★ recibosParaOSelo", () => {
  const pronto = { noCaminhoDoRecibo: true, fichasLidas: true, pagamentos: MES, porMesDe: umPorMes };

  it("no caminho do recibo, com tudo lido: a contagem", () => {
    expect(recibosParaOSelo(pronto)).toBe(2);
  });

  it("zero a emitir é zero, e não null", () => {
    expect(recibosParaOSelo({ ...pronto, pagamentos: [] })).toBe(0);
  });

  it("fora do caminho do recibo: null, mesmo com a lista na mão", () => {
    expect(recibosParaOSelo({ ...pronto, noCaminhoDoRecibo: false })).toBeNull();
  });

  it("antes de ler a lista, ou com a leitura falha: null", () => {
    expect(recibosParaOSelo({ ...pronto, pagamentos: null })).toBeNull();
  });

  it("antes de ler as fichas: null (sem `recibosPorMes` a conta dava um recibo por sessão)", () => {
    expect(recibosParaOSelo({ ...pronto, fichasLidas: false, porMesDe: umPorSessao })).toBeNull();
  });
});
