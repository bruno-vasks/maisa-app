import { describe, expect, it } from "vitest";
import { falasDoPreview, recorteAtivo, RECORTES, type DadosDoPreview } from "./ajustes";
import { SECOES } from "@/ui/estado/endereco";

const cfg = { confirmar: true, lembrete: true, remarcar: true, encaminhar: true, precoCatalogo: true, pix: false, encaixe: false, avisarRecibo: false };
const base: DadosDoPreview = {
  nomeAssistente: "Lia", nomeNegocio: "Clínica Aurora", lidos: true,
  /* `dow` 0 é segunda (`DIAS_DA_SEMANA`). */
  semana: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, aberto: dow <= 4, de: dow <= 4 ? "08:00" : null, ate: dow <= 4 ? "20:00" : null })),
  semanaLida: true, faqs: [], cfg, lembreteHoras: 3,
};
const bot = (p: ReturnType<typeof falasDoPreview>) => ("falas" in p && p.falas ? p.falas.filter((f) => f.de === "bot").map((f) => f.txt).join(" | ") : "");

describe("recorteAtivo (1C.11)", () => {
  it("a URL manda; sem ela, WhatsApp enquanto não conectou e Horário depois", () => {
    expect(recorteAtivo("duvidas", null)).toBe("duvidas");
    expect(recorteAtivo("auto", { status: "desconectado" })).toBe("whatsapp");
    expect(recorteAtivo(null, { status: "conectado" })).toBe("horarios");
    expect(recorteAtivo("lixo", { status: "conectado" })).toBe("horarios");
  });
  it("sem canal lido e sem escolha, não decide", () => {
    expect(recorteAtivo("auto", null)).toBeNull();
    expect(recorteAtivo("auto", null, "Sem resposta do servidor")).toBe("whatsapp");
  });
  it("todo recorte tem endereço, e o padrão da URL é o auto", () => {
    const regra = SECOES.assistente!;
    expect(regra.padrao).toBe("auto");
    for (const r of RECORTES) expect(regra.validas).toContain(r.id);
  });
});

describe("falasDoPreview (1C.12): derivado do dado, ou não aparece", () => {
  it("o horário é o da semana, pela mesma frase do prompt, e muda com ela", () => {
    const sab = { dow: 5, aberto: true, de: "10:00", ate: "14:00" };
    const a = bot(falasDoPreview("horarios", base));
    const b = bot(falasDoPreview("horarios", { ...base, semana: base.semana.map((d) => (d.dow === 5 ? sab : d)) }));
    expect(a).toContain("Seg–Sex 08:00–20:00");
    expect(b).toContain("Sáb 10:00–14:00");
    expect(a).not.toBe(b);
  });
  it("a resposta pronta é a primeira cadastrada", () => {
    const p = falasDoPreview("duvidas", { ...base, faqs: [{ pergunta: "Tem Wi-Fi?", resposta: "Temos, a senha fica na recepção." }] });
    expect("falas" in p && p.falas?.map((f) => f.txt)).toEqual(["Tem Wi-Fi?", "Temos, a senha fica na recepção."]);
  });
  it("lembrete e remarcar seguem os toggles", () => {
    expect(bot(falasDoPreview("agendamentos", base))).toContain("Te lembro por aqui 3 horas antes");
    const off = bot(falasDoPreview("agendamentos", { ...base, cfg: { ...cfg, lembrete: false, remarcar: false } }));
    expect(off).not.toContain("Te lembro");
    expect(off).toContain("chamo o responsável");
  });
  it("chamar você quando não souber segue o toggle", () => {
    expect(bot(falasDoPreview("comportamento", base))).toContain("Vou confirmar com o responsável");
    expect(bot(falasDoPreview("comportamento", { ...base, cfg: { ...cfg, encaminhar: false } }))).not.toContain("confirmar com o responsável");
  });
  it("antes de ler, nada de nome de placeholder", () => {
    expect(falasDoPreview("personalidade", { ...base, lidos: false })).toEqual({ falas: null });
    expect(falasDoPreview("horarios", { ...base, semanaLida: false })).toEqual({ falas: null });
  });
  it("o WhatsApp não inventa conversa", () => {
    expect(falasDoPreview("whatsapp", base)).toEqual({ aviso: "Esta seção não muda o que ela escreve." });
  });
  it("nenhuma fala tem emoji", () => {
    const todas = RECORTES.map((r) => JSON.stringify(falasDoPreview(r.id, base))).join(" ");
    expect(todas).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
