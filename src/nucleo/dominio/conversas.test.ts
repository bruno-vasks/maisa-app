/* ─────────────────────────────────────────────────────────────────────────────
 * QUEM ESTÁ COM A BOLA — `estadoDaConversa`.
 *
 * Até 24/10/2026 não havia teste desta função, e a ordem das regras estava errada de um
 * jeito que só aparecia na tela: o "Já resolvi" da fila "Precisa de você" gravava
 * `resolvida_em`, mas a fala do cliente continuava sendo a última e a conversa seguia em
 * `espera`. O botão dizia "Conversa resolvida" e a pendência não saía.
 *
 * Quem decide se a MAISA responde NÃO é esta função (é `posse.assumidaEm`, em `agente.ts`).
 * Os casos de `assumidaEm` abaixo existem para a tela não mentir sobre quem está com a bola.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { estadoDaConversa } from "./conversas";

const FALA = "2026-10-24T14:10:00-03:00";
const DEPOIS = "2026-10-24T14:30:00-03:00";
const MUITO_DEPOIS = "2026-10-24T15:00:00-03:00";

describe("estadoDaConversa", () => {
  describe("sem posse gravada", () => {
    it("cliente foi o último a falar: espera", () => {
      expect(estadoDaConversa({ ultimoAutor: "cliente", atualizadaEm: FALA })).toBe("espera");
    });

    it("a MAISA foi a última a falar: maisa", () => {
      expect(estadoDaConversa({ ultimoAutor: "bot", atualizadaEm: FALA })).toBe("maisa");
    });

    /* O dono respondeu à mão e devolveu: a última fala é dele, e quem conduz é a MAISA. */
    it("o dono foi o último a falar e a conversa não está assumida: maisa", () => {
      expect(estadoDaConversa({ ultimoAutor: "voce", atualizadaEm: FALA, posse: { assumidaEm: null } })).toBe("maisa");
    });
  });

  describe("resolvida", () => {
    it("resolvida depois da última fala do cliente: ok", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: FALA,
          posse: { assumidaEm: null, resolvidaEm: DEPOIS },
        }),
      ).toBe("ok");
    });

    it("fala do cliente depois de resolvida: volta para espera", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: MUITO_DEPOIS,
          posse: { assumidaEm: null, resolvidaEm: DEPOIS },
        }),
      ).toBe("espera");
    });

    /* O cliente voltou a escrever e a MAISA respondeu: a última fala é dela, mais nova que
     * o resolvido. Conversa que voltou a andar não está resolvida. */
    it("resposta da MAISA depois de resolvida: volta para maisa", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "bot",
          atualizadaEm: MUITO_DEPOIS,
          posse: { assumidaEm: null, resolvidaEm: DEPOIS },
        }),
      ).toBe("maisa");
    });

    /* O banco devolve `+00:00` e o app escreve `-03:00`. 14:10 em SP é 17:10 em UTC: o mesmo
     * instante, e `>=` comparado como texto erraria. É o caso para o qual `depoisOuIgual`
     * existe. */
    it("mesmo instante em fusos diferentes: ok", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: "2026-10-24T17:10:00+00:00",
          posse: { assumidaEm: null, resolvidaEm: "2026-10-24T14:10:00-03:00" },
        }),
      ).toBe("ok");
    });

    it("instantes diferentes em fusos diferentes: vale o instante, não o texto", () => {
      // Como texto, "2026-10-24T17:..." é maior que "2026-10-24T15:..."; como instante, 15:00-03:00 é 18:00 UTC.
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: "2026-10-24T17:30:00+00:00",
          posse: { assumidaEm: null, resolvidaEm: "2026-10-24T15:00:00-03:00" },
        }),
      ).toBe("ok");
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: "2026-10-24T18:30:00+00:00",
          posse: { assumidaEm: null, resolvidaEm: "2026-10-24T15:00:00-03:00" },
        }),
      ).toBe("espera");
    });

    /* Na dúvida a conversa NÃO está resolvida: errar para esse lado custa um clique. */
    it("data ilegível: espera, não ok", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: "ontem",
          posse: { assumidaEm: null, resolvidaEm: DEPOIS },
        }),
      ).toBe("espera");
    });
  });

  describe("assumida", () => {
    it("assumida vence a fala do cliente: voce", () => {
      expect(
        estadoDaConversa({ ultimoAutor: "cliente", atualizadaEm: FALA, posse: { assumidaEm: FALA } }),
      ).toBe("voce");
    });

    /* Protege o item 1 da ordem: se "resolvida" viesse antes, uma conversa que o dono ainda
     * conduz (e em que a MAISA está calada) apareceria como `ok`. */
    it("assumida e também resolvida continua voce", () => {
      expect(
        estadoDaConversa({
          ultimoAutor: "cliente",
          atualizadaEm: FALA,
          posse: { assumidaEm: FALA, resolvidaEm: DEPOIS },
        }),
      ).toBe("voce");
      expect(
        estadoDaConversa({
          ultimoAutor: "voce",
          atualizadaEm: FALA,
          posse: { assumidaEm: FALA, resolvidaEm: DEPOIS },
        }),
      ).toBe("voce");
    });
  });
});
