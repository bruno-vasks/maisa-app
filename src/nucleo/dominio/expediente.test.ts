/* ─────────────────────────────────────────────────────────────────────────────
 * O EXPEDIENTE QUE A FICHA EDITA (24/10/2026).
 *
 * O que se prova aqui é o que, errado, não dá erro nenhum: domingo entrando na folga, a frase da
 * tabela de Equipe divergindo do número, e a janela de horas do expediente descolando da que a
 * Agenda desenha (a MAISA ofereceria um horário que a grade não mostra).
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DIAS_DE_ATENDIMENTO, HORAS_DO_EXPEDIENTE, HORA_MAX_DO_EXPEDIENTE, HORA_MIN_DO_EXPEDIENTE,
  diasQueAtende, expedienteDosDias, fechado, frasesDoExpediente, fraseDeFolga, fraseDoHorario,
  horaDoExpedienteValida,
} from "./expediente";

describe("expedienteDosDias", () => {
  it("põe o domingo na folga em TODA combinação de segunda a sábado", () => {
    /* As 63 combinações não vazias dos seis dias. É a trava estrutural: a ficha não oferece
     * domingo, o caso de uso o recusa, e esta função ainda o põe na folga sozinha. */
    for (let mascara = 1; mascara < 64; mascara++) {
      const dias = DIAS_DE_ATENDIMENTO.filter((_, i) => mascara & (1 << i));
      const e = expedienteDosDias(dias, 9, 19);
      expect(e.folga).toContain(6);
      expect(diasQueAtende(e)).toEqual(dias);
    }
  });

  it("mesmo que alguém passe o domingo, ele continua na folga", () => {
    expect(expedienteDosDias([0, 6], 9, 19).folga).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("a folga é tudo o que não é dia de atendimento", () => {
    expect(expedienteDosDias([0, 1, 2, 3, 4], 9, 19)).toEqual({ folga: [5, 6], de: 9, ate: 19 });
    expect(expedienteDosDias([0, 1, 2, 3, 4, 5], 8, 20.5)).toEqual({ folga: [6], de: 8, ate: 20.5 });
  });

  it("concorda com a regra da Agenda: dia de folga não atende, domingo é fechado", () => {
    expect(fechado("2026-10-25")).toBe(true); // domingo
    expect(diasQueAtende({ folga: [6], de: 9, ate: 19 })).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("as frases do par", () => {
  it.each([
    [{ folga: [6], de: 9, ate: 19 }, "Seg–Sáb 09–19", "domingo"],
    [{ folga: [5, 6], de: 9, ate: 19 }, "Seg–Sex 09–19", "sábado e domingo"],
    [{ folga: [6], de: 9.5, ate: 20 }, "Seg–Sáb 09:30–20", "domingo"],
    [{ folga: [1, 3, 5, 6], de: 7, ate: 22 }, "Seg, Qua, Sex 07–22", "terça, quinta, sábado e domingo"],
    [{ folga: [0, 1, 2, 3, 4, 6], de: 8, ate: 13 }, "Sáb 08–13", "segunda, terça, quarta, quinta, sexta e domingo"],
    [{ folga: [2, 3, 4, 5, 6], de: 9, ate: 12 }, "Seg–Ter 09–12", "quarta, quinta, sexta, sábado e domingo"],
  ])("%j", (e, horario, folga) => {
    expect(frasesDoExpediente(e)).toEqual({ horario, folga });
  });

  it("sem nenhum dia diz que não há expediente, e sem folga diz que não há folga", () => {
    expect(fraseDoHorario({ folga: [0, 1, 2, 3, 4, 5, 6], de: 9, ate: 19 })).toBe("Sem expediente");
    expect(fraseDeFolga([])).toBe("sem folga fixa");
  });
});

describe("a janela de horas", () => {
  it("vai de meia em meia hora, de 07:00 a 22:00", () => {
    expect(HORAS_DO_EXPEDIENTE[0]).toBe(7);
    expect(HORAS_DO_EXPEDIENTE[1]).toBe(7.5);
    expect(HORAS_DO_EXPEDIENTE[HORAS_DO_EXPEDIENTE.length - 1]).toBe(22);
    expect(HORAS_DO_EXPEDIENTE).toHaveLength(31);
  });

  it.each([[7, true], [19.5, true], [22, true], [6.5, false], [22.5, false], [9.25, false], [Number.NaN, false], ["9", false], [null, false]])(
    "horaDoExpedienteValida(%j) = %s",
    (h, esperado) => {
      expect(horaDoExpedienteValida(h)).toBe(esperado);
    },
  );

  /* ⚠️ A janela do expediente é a que a grade da Agenda DESENHA. Se alguém mexer num lado, o
   * outro fica descolado e a MAISA passa a oferecer um horário que a Agenda não mostra (ou a
   * ficha deixa de oferecer um que a Agenda desenha). O teste lê a fonte da tela porque a
   * constante é geometria dela, e não do domínio. */
  it("é a mesma janela que a Agenda desenha", () => {
    const fonte = readFileSync(fileURLToPath(new URL("../../ui/telas/Agenda.tsx", import.meta.url)), "utf8");
    const inicio = Number(fonte.match(/const AGENDA_INICIO = (\d+)/)?.[1]);
    const horas = Number(fonte.match(/const AGENDA_HORAS = (\d+)/)?.[1]);
    expect(Number.isFinite(inicio) && Number.isFinite(horas), "AGENDA_INICIO e AGENDA_HORAS não foram achadas").toBe(true);
    expect(HORA_MIN_DO_EXPEDIENTE).toBe(inicio);
    expect(HORA_MAX_DO_EXPEDIENTE).toBe(inicio + horas);
  });
});
