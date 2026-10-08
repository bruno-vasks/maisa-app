import { describe, expect, it } from "vitest";
import {
  cabecalhoParaADona, nomeDoPdf, corteDoRecibo, diaDoReciboAlcancado, diaDoReciboNoMes, diaDoReciboValido,
  mesQueOReciboFecha, numeroDaDona, proximoDiaDoRecibo,
} from "./recibo-automatico";

describe("o dia do recibo no mês", () => {
  it("é o dia escolhido", () => {
    expect(diaDoReciboNoMes(5, "2026-10")).toBe("2026-10-05");
  });
  /* A Regina escolhe "dia 31" uma vez; setembro não tem 31, e o recibo não pode pular o mês. */
  it("em mês curto, vira o último dia", () => {
    expect(diaDoReciboNoMes(31, "2026-09")).toBe("2026-09-30");
    expect(diaDoReciboNoMes(30, "2026-02")).toBe("2026-02-28");
    expect(diaDoReciboNoMes(29, "2028-02")).toBe("2028-02-29");
  });
});

describe("a rotina atende o dia hoje?", () => {
  it("no próprio dia", () => {
    expect(diaDoReciboAlcancado(5, "2026-10-05")).toBe("2026-10-05");
  });
  it("e nos dois dias seguintes, se a rotina não rodou", () => {
    expect(diaDoReciboAlcancado(5, "2026-10-06")).toBe("2026-10-05");
    expect(diaDoReciboAlcancado(5, "2026-10-07")).toBe("2026-10-05");
    expect(diaDoReciboAlcancado(5, "2026-10-08")).toBeNull();
  });
  it("não antes do dia", () => {
    expect(diaDoReciboAlcancado(5, "2026-10-04")).toBeNull();
  });
  /* O 31 de setembro é o 30, e a folga dele atravessa para outubro. */
  it("a folga atravessa a virada do mês", () => {
    expect(diaDoReciboAlcancado(31, "2026-10-01")).toBe("2026-09-30");
    expect(diaDoReciboAlcancado(31, "2026-10-02")).toBe("2026-09-30");
    expect(diaDoReciboAlcancado(31, "2026-10-03")).toBeNull();
  });
});

/* ★ 08/10/2026: um mês por recibo. Dia 31 fecha o próprio mês; os outros, o anterior. */
describe("quais sessões o recibo fecha", () => {
  it("dia comum: só os meses que já acabaram", () => {
    expect(corteDoRecibo(10, "2026-11-10")).toBe("2026-11-01");
    expect(mesQueOReciboFecha(10, "2026-11-10")).toBe("2026-10");
    expect(mesQueOReciboFecha(1, "2027-01-01")).toBe("2026-12");
  });
  it("último dia: o próprio mês, até a véspera, também no mês curto", () => {
    expect(corteDoRecibo(31, "2026-10-31")).toBe("2026-10-31");
    expect(corteDoRecibo(31, "2026-09-30")).toBe("2026-09-30");
    expect(mesQueOReciboFecha(31, "2026-09-30")).toBe("2026-09");
  });
  it("o 30 que cai no último dia de novembro continua fechando o mês anterior", () => {
    expect(corteDoRecibo(30, "2026-11-30")).toBe("2026-11-01");
    expect(mesQueOReciboFecha(30, "2026-11-30")).toBe("2026-10");
  });
});

describe("o próximo dia do recibo, que a ficha mostra", () => {
  it("ainda neste mês", () => {
    expect(proximoDiaDoRecibo(10, "2026-10-01")).toBe("2026-10-10");
  });
  it("hoje conta", () => {
    expect(proximoDiaDoRecibo(1, "2026-10-01")).toBe("2026-10-01");
  });
  it("já passou: mês que vem, com o último dia se ele for curto", () => {
    expect(proximoDiaDoRecibo(31, "2027-01-31")).toBe("2027-01-31");
    expect(proximoDiaDoRecibo(30, "2027-01-31")).toBe("2027-02-28");
  });
});

describe("o dia vindo da tela", () => {
  it("aceita 1 a 31 e nulo", () => {
    expect(diaDoReciboValido(1)).toBe(true);
    expect(diaDoReciboValido(31)).toBe(true);
    expect(diaDoReciboValido(null)).toBe(true);
  });
  it("recusa o resto", () => {
    for (const v of [0, 32, 2.5, Number.NaN, "5", undefined]) expect(diaDoReciboValido(v)).toBe(false);
  });
});

describe("para onde vai o primeiro para mim", () => {
  it("o número de avisos, quando existe", () => {
    expect(numeroDaDona({ telefoneDono: "5511977776666", numero: "5511988887777" })).toBe("5511977776666");
  });
  /* A Regina: MAISA no número pessoal, número de avisos vazio (medido em 01/10/2026). */
  it("sem ele, o próprio número conectado", () => {
    expect(numeroDaDona({ telefoneDono: null, numero: "5511988887777" })).toBe("5511988887777");
  });
  it("sem nenhum dos dois, ninguém", () => {
    expect(numeroDaDona({ telefoneDono: null, numero: null })).toBeNull();
    expect(numeroDaDona(null)).toBeNull();
  });
});

describe("a linha antes do aviso, para a dona", () => {
  const recibo = { nome: "Ana Beatriz Moura", data: "2026-09-16", valor: 180 };
  it("diz de quem é, quando, e quanto, com o nome inteiro", () => {
    const t = cabecalhoParaADona(recibo, true);
    expect(t).toContain("Ana Beatriz Moura");
    expect(t).toContain("16/09/2026");
    expect(t).toContain("R$ 180,00");
    expect(t).toContain("prontos para você encaminhar");
  });
  it("sem telefone no cadastro, avisa", () => {
    expect(cabecalhoParaADona(recibo, false)).toContain("Não há telefone no cadastro");
  });
  it("sem travessão", () => {
    expect(cabecalhoParaADona(recibo, true)).not.toContain("—");
  });
});

describe("um recibo de várias sessões, para a dona e no nome do arquivo", () => {
  const doMes = { nome: "Ana Beatriz Moura", data: "2026-09-23", valor: 720, sessoes: 4 };
  it("a linha da dona fala do mês", () => {
    expect(cabecalhoParaADona(doMes, true)).toContain("4 atendimentos de setembro de 2026, R$ 720,00");
  });
  it("o arquivo diz de quem e de quando, sem o serviço", () => {
    expect(nomeDoPdf(doMes)).toBe("Recibo Ana Beatriz Moura setembro 2026.pdf");
    expect(nomeDoPdf({ nome: "Ana", data: "2026-09-16", valor: 180 })).toBe("Recibo Ana 16-09-2026.pdf");
  });
  it("nome com barra não vira pasta no arquivo", () => {
    expect(nomeDoPdf({ nome: "Ana/Bia", data: "2026-09-16", valor: 180 })).toBe("Recibo Ana Bia 16-09-2026.pdf");
  });
});
