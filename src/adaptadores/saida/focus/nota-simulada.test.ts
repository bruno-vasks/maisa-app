import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confereAssinatura, numeroSimulado, pdfDaNota, urlDoPdfSimulado } from "./nota-simulada";

/* O link do PDF é uma capacidade: quem tem o link baixa, quem não tem leva 404. */
describe("nota simulada — o link assinado", () => {
  const antes = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
    process.env.MAISA_PUBLIC_URL = "https://app.exemplo.com.br/";
  });
  afterEach(() => { process.env = { ...antes }; });

  it("o link gerado confere, e só para a própria ref", () => {
    const url = new URL(urlDoPdfSimulado("maisa-cl1-abc")!);
    expect(url.origin + url.pathname).toBe("https://app.exemplo.com.br/api/nf/pdf/maisa-cl1-abc");
    const a = url.searchParams.get("a");
    expect(confereAssinatura("maisa-cl1-abc", a)).toBe(true);
    expect(confereAssinatura("maisa-cl2-abc", a)).toBe(false);
    expect(confereAssinatura("maisa-cl1-abc", null)).toBe(false);
  });

  it("sem URL pública não há link — a nota sai sem PDF, como antes", () => {
    delete process.env.MAISA_PUBLIC_URL;
    expect(urlDoPdfSimulado("x")).toBeNull();
  });

  it("o número tem seis dígitos e cresce no tempo", () => {
    expect(numeroSimulado(1_000)).toMatch(/^\d{6}$/);
    expect(Number(numeroSimulado(2_000_000))).toBeGreaterThan(Number(numeroSimulado(1_000_000)));
  });
});

describe("nota simulada — o PDF", () => {
  it("é um PDF de uma página, com os acentos em WinAnsi e o CPF do tomador mascarado", () => {
    const bytes = pdfDaNota({
      numero: "000123", emitidaEm: "2026-10-15", competencia: "2026-10-01", valor: 400,
      discriminacao: "2 sessões de psicoterapia (outubro)",
      tomador: { nome: "Ana Beatriz Rocha", cpf: "41000000123" },
      prestador: { razaoSocial: "JUNIOR POLI ESTUDOS", cnpj: "62025689000166", inscricaoMunicipal: "1", codigoMunicipio: "3550308", itemListaServico: "04.16", aliquotaIss: 2 },
      nomeDoNegocio: "Teste",
    });
    const txt = Buffer.from(bytes).toString("latin1");
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(txt).toContain("(Nº 000123)");
    expect(txt).toContain("62.025.689/0001-66");
    expect(txt).toContain("sessões");
    expect(txt).toContain("\\(outubro\\)");
    expect(txt).toContain("***.000.001-**");
    expect(txt).not.toContain("41000000123");
    /* O xref aponta para onde cada objeto começa — leitor de PDF confere isso. */
    const inicio = Number(txt.match(/startxref\n(\d+)/)![1]);
    expect(txt.slice(inicio, inicio + 4)).toBe("xref");
  });
});
