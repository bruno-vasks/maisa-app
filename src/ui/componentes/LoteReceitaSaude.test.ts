/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE TESTE PRENDE
 *
 * ★ QUE DOBRAR A LISTA NÃO ESCONDA O QUE PRECISA DE AÇÃO.
 *
 * A lista de pagamentos sem recibo passou a começar fechada porque um mês cheio (44 linhas)
 * empurrava o botão de gerar para fora da tela. O jeito óbvio de fazer isso — esconder todas as
 * linhas — tem um custo que não aparece em nenhuma tela: os pagamentos SEM CPF ficam de fora do
 * arquivo, e são a única coisa desta lista sobre a qual há o que fazer.
 *
 * Escondidos, o dono gera o arquivo do mês sem saber que perdeu três linhas, e descobre no e-CAC
 * ou nunca. Por isso `pagamentosNaTela` é função pura, exportada e testada: "simplificar" para
 * `aberta ? todos : []` passa em qualquer revisão visual e quebra isto.
 *
 * ⚠️ Ambiente `node` importando um `.tsx` — mesmo motivo e mesma condição do
 * `pareamento.test.ts`: a função é pura e nada do módulo toca DOM na carga.
 * ───────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { entramNoArquivo, pagamentosNaTela, resumoDosDados, rotuloDeGerar } from "./LoteReceitaSaude";
import { checklistDoRecibo, partesDoChecklist } from "@/nucleo/dominio/checklist-recibo";
import type { ConfigFiscal } from "@/nucleo/dominio/fiscal";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";

const com = (n: number, cpf: string | null) =>
  Array.from({ length: n }, (_, i) => ({ id: `${cpf ? "ok" : "sem"}-${i}`, cpf }));

describe("lista curta não vira acordeão", () => {
  /* Cerimônia sobre três linhas é pior que a rolagem que ela evita. */
  it("até seis pagamentos, mostra tudo e não oferece o botão", () => {
    const r = pagamentosNaTela(com(6, "123"), false);
    expect(r.dobravel).toBe(false);
    expect(r.visiveis).toHaveLength(6);
  });

  it("o sétimo é que liga o botão", () => {
    expect(pagamentosNaTela(com(7, "123"), false).dobravel).toBe(true);
  });
});

describe("★ fechada, sobra o que precisa de CPF", () => {
  /* O TESTE QUE JUSTIFICA O ARQUIVO. */
  it("esconde os completos e mantém os sem CPF", () => {
    const todos = [...com(40, "123"), ...com(3, null)];

    const r = pagamentosNaTela(todos, false);

    expect(r.visiveis).toHaveLength(3);
    expect(r.visiveis.every((p) => !p.cpf)).toBe(true);
  });

  /* Mês inteiro em ordem: fechada não mostra nada, e é o certo — não há o que fazer. */
  it("todos com CPF: fechada fica vazia, e o botão continua lá", () => {
    const r = pagamentosNaTela(com(44, "123"), false);
    expect(r.visiveis).toEqual([]);
    expect(r.dobravel).toBe(true);
  });

  it("aberta, mostra os 44", () => {
    expect(pagamentosNaTela(com(44, "123"), true).visiveis).toHaveLength(44);
  });

  /* CPF em branco é o mesmo caso de CPF ausente: a Receita recusa os dois. */
  it("string vazia conta como sem CPF", () => {
    const todos = [...com(10, "123"), { id: "vazio", cpf: "" }];
    expect(pagamentosNaTela(todos, false).visiveis).toEqual([{ id: "vazio", cpf: "" }]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
 * ★ O BOTÃO DE GERAR DIZ O QUE FAZ — e o "meus dados" diz o que falta.
 *
 * Bruno, 25/08/2026: *"o gerar arquivo nn está com um texto claro do que ele faz (gerar o arquivo
 * que vai ser usado para fazer os recibos do mes... só que menos longo)"* e *"o Preencher meus
 * dados nn está com a mesma importância que deveria ter"*.
 *
 * As duas frases são as únicas coisas que a pessoa lê antes de clicar, e nenhuma delas é
 * renderizada por acaso — daí serem funções puras, com teste.
 * ═══════════════════════════════════════════════════════════════════════════════ */

describe("o rótulo do botão nomeia o documento e a quantidade", () => {
  it("14 recibos", () => {
    expect(rotuloDeGerar(14)).toBe("Gerar o arquivo dos 14 recibos");
  });

  /* Singular à mão: "os 1 recibos" é o tipo de frase que faz o produto parecer improvisado
   * justamente na tela fiscal, que é onde a confiança importa mais. */
  it("um recibo fala no singular", () => {
    expect(rotuloDeGerar(1)).toBe("Gerar o arquivo de 1 recibo");
  });

  /* ⚠️ `null` é "a lista ainda não chegou". Chutar zero aqui escreveria "Gerar o arquivo dos 0
   * recibos" no primeiro paint de todo mês cheio. */
  it("sem saber a quantidade, o rótulo é genérico e verdadeiro", () => {
    expect(rotuloDeGerar(null)).toBe("Gerar o arquivo do mês");
  });
});

const pago = (): PagamentoPendente => ({
  id: "p1", fonte: "atendimento", clienteId: "cl1", cpfPagador: null, nome: "Alguém", cpf: "39053344705",
  data: "2026-08-10", valor: 200, podeExcluir: false,
});

describe("★ quem conta são os que TÊM CPF", () => {
  /* O TESTE QUE IMPEDE O BOTÃO DE MENTIR: a Receita recusa linha sem CPF, então prometer 14 e
   * entregar 11 é o mesmo defeito que fez o hero do Faturamento ser reescrito. */
  it("desconta os sem CPF", () => {
    expect(entramNoArquivo({ pagamentos: Array.from({ length: 14 }, pago), total: 0, semCpf: 3, avisos: { falhou: 0, semTelefone: 0 } })).toBe(11);
  });

  it("nada ainda lido é null, não zero", () => {
    expect(entramNoArquivo(null)).toBe(null);
  });

  /* Defensivo: `semCpf` maior que a lista viria de resposta torta, e um rótulo negativo é pior
   * que um genérico. */
  it("nunca devolve negativo", () => {
    expect(entramNoArquivo({ pagamentos: [pago()], total: 0, semCpf: 9, avisos: { falhou: 0, semTelefone: 0 } })).toBe(0);
  });
});

const CONFIG = (over: Partial<ConfigFiscal> = {}) => ({
  prestadorCpf: "39053344705", ocupacaoSaude: "psicologo", registroProfissional: "CRP 06/12345",
  ...over,
}) as ConfigFiscal;

describe("a linha de 'seus dados' — cheia diz o que é, vazia diz o que falta", () => {
  const itens = (c: ConfigFiscal) => partesDoChecklist(checklistDoRecibo(c, "2026-08-25")).meusDados;

  it("completa, mostra o que vai em toda linha do arquivo", () => {
    const c = CONFIG();
    expect(resumoDosDados(c, itens(c))).toBe("CPF 390.533.447-05 · Psicólogo · CRP 06/12345");
  });

  /* O nome do campo que falta, e não "1 item pendente": ela vai procurar a palavra na tela. */
  it("faltando o registro, nomeia o registro", () => {
    const c = CONFIG({ registroProfissional: null });
    expect(resumoDosDados(c, itens(c))).toBe("Falta seu CRP — é o que vai em todas as linhas do arquivo.");
  });

  it("faltando dois, junta com 'e'", () => {
    const c = CONFIG({ ocupacaoSaude: null, registroProfissional: null });
    expect(resumoDosDados(c, itens(c))).toBe(
      "Falta sua profissão e seu conselho — é o que vai em todas as linhas do arquivo.",
    );
  });
});
