/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE TESTE PRENDE
 *
 * ★ QUE O FATURAMENTO NÃO PROMETA NOTA FISCAL A QUEM NÃO EMITE NOTA FISCAL.
 *
 * Bruno, 25/08/2026: *"O CTA lá em cima ainda esta escrito emitir 14 notas mesmo depois de eu ter
 * escolhido o modo de recibos"*. Quem atende como pessoa física emite Recibo Eletrônico de
 * Serviços de Saúde, dentro do e-CAC — nota fiscal, nunca. O hero, a topbar, a tabela e a gaveta
 * liam o estado das NOTAS (sempre `pendente`, para sempre) em vez do CAMINHO, e as quatro
 * superfícies falavam de um documento que não existe naquele negócio.
 *
 * ⚠️ O caso que quase ninguém escreve é o `carregando`, e é o que este arquivo mais protege:
 * enquanto `/api/fiscal` não responde, a tela não pode chutar "nota fiscal" e corrigir meio
 * segundo depois. Piscar a promessa errada é a mesma mentira, mais curta — e é exatamente o que
 * um `caminho !== "recibo_saude"` solto faria, porque `null !== "recibo_saude"` é `true`.
 *
 * ⚠️ Ambiente `node` importando um `.tsx` — mesma condição do `LoteReceitaSaude.test.ts`: a
 * função é pura e nada do módulo toca DOM na carga.
 * ───────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { vocabulario } from "./Grades";

describe("quem emite nota fiscal ganha os verbos de nota fiscal", () => {
  it("municipal emite nota", () => {
    expect(vocabulario({ status: "ok", caminho: "municipal" })).toMatchObject({ sabemos: true, emiteNota: true, falhou: false });
  });

  it("ambiente nacional também", () => {
    expect(vocabulario({ status: "ok", caminho: "nacional" }).emiteNota).toBe(true);
  });
});

describe("★ pessoa física não emite nota fiscal em hipótese nenhuma", () => {
  /* O TESTE QUE JUSTIFICA O ARQUIVO. Sem ele, o hero volta a anunciar "14 a emitir" e a topbar
   * volta a oferecer o botão dourado — para uma psicóloga que não tem nota fiscal para emitir. */
  it("recibo_saude não tem verbo de emitir", () => {
    expect(vocabulario({ status: "ok", caminho: "recibo_saude" })).toMatchObject({ sabemos: true, emiteNota: false, falhou: false, podeEmitir: false });
  });
});

describe("⚠️ enquanto não sabemos, ninguém promete nada", () => {
  /* `null !== "recibo_saude"` é `true` — o jeito ingênuo de escrever isto acende o botão errado
   * durante o carregamento e o apaga depois. Meio segundo de promessa falsa continua sendo uma. */
  it("carregando não emite nota", () => {
    expect(vocabulario({ status: "carregando", caminho: null })).toMatchObject({ sabemos: false, emiteNota: false, falhou: false, podeEmitir: false });
  });

  it("erro na leitura também não", () => {
    expect(vocabulario({ status: "erro", caminho: null }).emiteNota).toBe(false);
  });

  /* Resposta torta que trouxe status de erro E um caminho: manda o status. */
  it("o status manda sobre o caminho", () => {
    expect(vocabulario({ status: "erro", caminho: "municipal" }).emiteNota).toBe(false);
  });
});

/* ── ★ ERRO NÃO É CARREGANDO ──────────────────────────────────────────────────
 *
 * Bruno, 26/08/2026, com a tela na frente: um retângulo cinza no lugar do Faturamento, parado.
 * A causa era esta distinção não existir: `!sabemos` cobria os dois estados e os dois viravam
 * esqueleto de carregamento. Só que carregando vira tela em um instante e erro não vira nada
 * nunca — o esqueleto ficava para sempre, sem uma palavra e sem botão.
 *
 * ⚠️ Quem apagar `falhou` daqui reintroduz o beco. Os dois têm `sabemos: false`; é só isso que
 * eles têm em comum. */
describe("★ erro tem saída, carregando não precisa de uma", () => {
  it("erro é `falhou`", () => {
    expect(vocabulario({ status: "erro", caminho: null }).falhou).toBe(true);
  });

  it("carregando NÃO é `falhou` — senão pisca 'não deu' antes de tentar", () => {
    expect(vocabulario({ status: "carregando", caminho: null }).falhou).toBe(false);
  });

  it("ok não é `falhou`", () => {
    expect(vocabulario({ status: "ok", caminho: "recibo_saude" }).falhou).toBe(false);
  });
});

/* ── ★ ESCOLHA E FALTA (25/09/2026, item 1A.12, 06 P0-2) ─────────────────────
 *
 * O hero e a topbar liam só `caminho` e `emitiveis`: quem NUNCA escolheu o documento (config
 * vazia cai em `municipal`) via "Emitir 13 notas", e quem estava sem certificado via os dois
 * dourados acesos, com "Falta o certificado" logo abaixo. Sem pendência, "Mês fechado" para
 * quem nunca configurou nada. */
describe("★ sem escolha, o verbo é escolher; com falta, o botão desliga com o motivo", () => {
  const vazia = { prestadorCpf: null, cnpj: null, empresaId: null };
  const cnpj = { prestadorCpf: null, cnpj: "12345678000199", empresaId: 77 };

  it("config vazia: emite nota pelo caminho padrão, mas NÃO escolheu e NÃO pode emitir", () => {
    const v = vocabulario({ status: "ok", caminho: "municipal", config: vazia, falta: ["o CNPJ de quem emite"] });
    expect(v.emiteNota).toBe(true);
    expect(v.escolheu).toBe(false);
    expect(v.podeEmitir).toBe(false);
  });

  it("escolheu CNPJ e falta o certificado: escolheu, não pode emitir, e o motivo é a frase do servidor", () => {
    const v = vocabulario({ status: "ok", caminho: "municipal", config: cnpj, falta: ["o certificado digital da empresa"] });
    expect(v.escolheu).toBe(true);
    expect(v.podeEmitir).toBe(false);
    expect(v.motivo).toBe("Falta o certificado digital da empresa.");
  });

  it("escolheu e nada falta: pode emitir, sem motivo", () => {
    const v = vocabulario({ status: "ok", caminho: "municipal", config: cnpj, falta: [] });
    expect(v.podeEmitir).toBe(true);
    expect(v.motivo).toBe(null);
  });

  it("duas faltas viram uma frase", () => {
    expect(vocabulario({ status: "ok", caminho: "municipal", config: cnpj, falta: ["a razão social", "o certificado"] }).motivo)
      .toBe("Falta a razão social e o certificado.");
  });

  it("carregando não escolheu nada e não tem falta (não afirma nem uma coisa nem outra)", () => {
    const v = vocabulario({ status: "carregando", caminho: null, config: cnpj, falta: ["x"] });
    expect(v.escolheu).toBe(false);
    expect(v.falta).toEqual([]);
  });
});
