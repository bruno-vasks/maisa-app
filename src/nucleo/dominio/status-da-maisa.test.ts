/* A tabela-verdade inteira do `statusDaMaisa` (G11, parte 1). São 3 × 4 combinações, e todas
 * estão aqui: a que ninguém escreve é a que volta a mentir. */

import { describe, expect, it } from "vitest";
import { statusDaMaisa, type StatusDaMaisa } from "./status-da-maisa";
import type { StatusDoCanal } from "./canal";

const TABELA: [boolean | null, StatusDoCanal | null, StatusDaMaisa][] = [
  // canal ainda não respondeu: nada se afirma, nem com o interruptor conhecido
  [null, null, "conferindo"],
  [true, null, "conferindo"],
  [false, null, "conferindo"],
  // conectado: quem decide é o interruptor, e só depois de ele ser lido
  [null, "conectado", "conferindo"],
  [true, "conectado", "atendendo"],
  [false, "conectado", "pausada"],
  // sem canal: o interruptor não salva ninguém, e não precisa esperar os ajustes
  [null, "desconectado", "sem_whatsapp"],
  [true, "desconectado", "sem_whatsapp"],
  [false, "desconectado", "sem_whatsapp"],
  [null, "pareando", "sem_whatsapp"],
  [true, "pareando", "sem_whatsapp"],
  [false, "pareando", "sem_whatsapp"],
];

describe("statusDaMaisa", () => {
  it.each(TABELA)("ativa=%j, canal=%j → %s", (ativa, canal, esperado) => {
    expect(statusDaMaisa({ ativa, canal })).toBe(esperado);
  });

  /* O defeito de 24/09/2026, escrito como caso: interruptor ligado e WhatsApp desconectado
   * era "MAISA no ar" na topbar. */
  it("ligada sem WhatsApp nunca é atendendo", () => {
    expect(statusDaMaisa({ ativa: true, canal: "desconectado" })).not.toBe("atendendo");
  });
});
