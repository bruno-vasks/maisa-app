/* O recibo automático (01/10/2026, a Regina): a rotina diária que emite, no dia de cada paciente,
 * os recibos das sessões que ainda não têm. A emissão em si é a de `recibo-unitario.test.ts`; aqui
 * se protege só QUANDO e DE QUEM. */
import { describe, expect, it } from "vitest";
import { criarEmitirRecibosAutomaticos } from "./recibo-automatico";
import type { ConfigFiscal } from "../dominio/fiscal";
import type { ContextoTenant } from "../dominio/tenant";
import type { EmitirRecibo } from "../portas/entrada/casos-de-uso";
import type { PacienteComDiaDeRecibo } from "../portas/saida/agenda-de-recibos";
import type { PagamentoAFaturar, RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";

const regina: ConfigFiscal = {
  ambiente: "producao",
  cnpj: null, razaoSocial: null, codigoMunicipio: null,
  optanteMei: false, optanteSimples: false, empresaId: null,
  certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "12345678909",
  ocupacaoSaude: "psicologo",
  registroProfissional: "CRP 06/123456",
  procuradorDocumento: null, procuracaoValidaAte: null, procuracaoAceitaEm: null,
  inscricaoMunicipal: null, itemListaServico: null,
  aliquotaIss: null, codigoTributarioMunicipio: null,
};

const sessao = (over: Partial<PagamentoAFaturar> = {}): PagamentoAFaturar => ({
  id: "at1", fonte: "atendimento", clienteId: "ana",
  nome: "Ana Souza", cpf: "98765432100", cpfPagador: null,
  data: "2026-09-16", valor: 180, servico: "Sessão", teste: false,
  ...over,
});

function ambiente(p: {
  agenda?: PacienteComDiaDeRecibo[];
  pendentes?: PagamentoAFaturar[];
  config?: ConfigFiscal | ((tenantId: string) => ConfigFiscal);
  emitirQuebra?: string;
  /** Quanto o relógio anda a cada emissão. Para testar o teto sem esperar. */
  passoDoRelogio?: number;
  teto?: number;
} = {}) {
  const emitidos: { tenantId: string; id: string; fonte: string; ator: ContextoTenant["ator"] }[] = [];
  const pedidosDePendentes: { tenantId: string; ate: string }[] = [];
  let relogio = 0;

  const fiscal: RepositorioFiscal = {
    async ler(t) { return typeof p.config === "function" ? p.config(t.tenantId) : (p.config ?? regina); },
    async salvar() { throw new Error("não usado"); },
  };
  const recibos = {
    async pendentes(t: ContextoTenant, q: { ate: string }) {
      pedidosDePendentes.push({ tenantId: t.tenantId, ate: q.ate });
      return p.pendentes ?? [sessao()];
    },
  } as unknown as RepositorioRecibos;
  const emitirRecibo: EmitirRecibo = async (t, x) => {
    if (p.emitirQuebra) throw new Error(p.emitirQuebra);
    emitidos.push({ tenantId: t.tenantId, id: x.id, fonte: x.fonte, ator: t.ator });
    relogio += p.passoDoRelogio ?? 0;
    return { reciboId: `r-${x.id}`, canal: "rebots", situacao: "pendente", protocolo: "1", valor: 180, nome: "Ana", data: "2026-09-16" };
  };

  const rodar = criarEmitirRecibosAutomaticos({
    agenda: { async comDia() { return p.agenda ?? [{ tenantId: "regina", clienteId: "ana", dia: 5 }]; } },
    recibos, fiscal, emitirRecibo,
    agora: () => relogio,
    teto: p.teto,
  });
  return { rodar, emitidos, pedidosDePendentes };
}

describe("recibo automático: quando", () => {
  it("no dia da pessoa, emite as sessões dela que não têm recibo", async () => {
    const a = ambiente();
    const r = await a.rodar("2026-10-05");
    expect(a.emitidos.map((e) => e.id)).toEqual(["at1"]);
    expect(r).toMatchObject({ pacientes: 1, emitidos: 1, semCpf: 0, adiados: 0, falhas: [] });
  });

  it("fora do dia, não emite nada", async () => {
    const a = ambiente();
    const r = await a.rodar("2026-10-04");
    expect(a.emitidos).toEqual([]);
    expect(r.pacientes).toBe(0);
    /* Nem pergunta os pendentes: sem ninguém para hoje, não há o que ler. */
    expect(a.pedidosDePendentes).toEqual([]);
  });

  it("um dia de atraso ainda alcança (a rotina pode não ter rodado)", async () => {
    const a = ambiente();
    await a.rodar("2026-10-06");
    expect(a.emitidos).toHaveLength(1);
  });

  /* Dia 5: entra o que foi atendido ATÉ o dia 4. Na folga (dia 6), a sessão do dia 5 fica para o
   * mês que vem, senão o recibo dependeria de em que dia a rotina conseguiu rodar. */
  it("só sessões ANTERIORES ao dia do recibo, mesmo na folga", async () => {
    const a = ambiente({ pendentes: [sessao({ id: "a4", data: "2026-10-04" }), sessao({ id: "a5", data: "2026-10-05" })] });
    await a.rodar("2026-10-06");
    expect(a.emitidos.map((e) => e.id)).toEqual(["a4"]);
  });
});

describe("recibo automático: de quem", () => {
  it("só da pessoa que tem o dia, não das outras do mesmo negócio", async () => {
    const a = ambiente({ pendentes: [sessao({ id: "da-ana" }), sessao({ id: "da-bia", clienteId: "bia" })] });
    await a.rodar("2026-10-05");
    expect(a.emitidos.map((e) => e.id)).toEqual(["da-ana"]);
  });

  it("cada negócio com o seu contexto, e o ator é a rotina", async () => {
    const a = ambiente({ agenda: [{ tenantId: "regina", clienteId: "ana", dia: 5 }, { tenantId: "carla", clienteId: "ana", dia: 5 }] });
    await a.rodar("2026-10-05");
    expect(a.emitidos.map((e) => e.tenantId).sort()).toEqual(["carla", "regina"]);
    expect(a.emitidos.every((e) => e.ator.tipo === "sistema")).toBe(true);
  });

  it("cliente de teste fica de fora", async () => {
    const a = ambiente({ pendentes: [sessao({ teste: true })] });
    await a.rodar("2026-10-05");
    expect(a.emitidos).toEqual([]);
  });

  it("sem CPF válido, pula e conta, sem chamar a emissão", async () => {
    const a = ambiente({ pendentes: [sessao({ cpf: null }), sessao({ id: "at2", cpf: "11111111111" })] });
    const r = await a.rodar("2026-10-05");
    expect(a.emitidos).toEqual([]);
    expect(r.semCpf).toBe(2);
    expect(r.falhas).toEqual([]);
  });
});

describe("recibo automático: o que não é com ela", () => {
  it("negócio de CNPJ não emite recibo, e não é falha", async () => {
    const a = ambiente({ config: { ...regina, prestadorCpf: null, ocupacaoSaude: null, cnpj: "12345678000199" } });
    const r = await a.rodar("2026-10-05");
    expect(a.emitidos).toEqual([]);
    expect(r.falhas).toEqual([]);
  });

  it("sem registro no conselho, vira falha do negócio, e os outros seguem", async () => {
    const a = ambiente({
      agenda: [{ tenantId: "sem-crp", clienteId: "ana", dia: 5 }, { tenantId: "regina", clienteId: "ana", dia: 5 }],
      config: (id) => (id === "sem-crp" ? { ...regina, registroProfissional: null } : regina),
    });
    const r = await a.rodar("2026-10-05");
    expect(a.emitidos.map((e) => e.tenantId)).toEqual(["regina"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toMatchObject({ tenantId: "sem-crp" });
    expect(r.falhas[0].motivo).toContain("registro no conselho");
  });

  it("recibo que o canal recusa vira falha, e a rodada segue", async () => {
    const a = ambiente({ emitirQuebra: "canal fora do ar" });
    const r = await a.rodar("2026-10-05");
    expect(r.falhas).toEqual([{ tenantId: "regina", motivo: "canal fora do ar" }]);
  });
});

describe("recibo automático: o relógio da função", () => {
  it("passado o teto, o resto fica adiado para a próxima rodada", async () => {
    const a = ambiente({
      pendentes: [sessao({ id: "a1" }), sessao({ id: "a2" }), sessao({ id: "a3" })],
      passoDoRelogio: 10, teto: 15,
    });
    const r = await a.rodar("2026-10-05");
    expect(a.emitidos.map((e) => e.id)).toEqual(["a1", "a2"]);
    expect(r.adiados).toBe(1);
  });
});
