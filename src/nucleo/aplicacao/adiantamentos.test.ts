/* PAGOU ADIANTADO (12/11/2026, a Regina): o pagamento e o crédito nascem juntos, ou nenhum dos dois. */
import { describe, expect, it } from "vitest";
import type { ContextoTenant } from "../dominio/tenant";
import type { LancarPagamentoAvulso, PagamentoPendente } from "../portas/entrada/casos-de-uso";
import type { RepositorioAdiantamentos } from "../portas/saida/repositorio-adiantamentos";
import { criarLancarAdiantamento } from "./adiantamentos";

const t: ContextoTenant = { tenantId: "t1", usuarioId: "u1", ator: { tipo: "usuario", id: "u1" } };

function montar(opcoes: { criarFalha?: boolean } = {}) {
  const lancados: Parameters<LancarPagamentoAvulso>[1][] = [];
  const apagados: string[] = [];
  const creditos: Parameters<RepositorioAdiantamentos["criar"]>[1][] = [];
  const lancarAvulso: LancarPagamentoAvulso = async (_t, p) => {
    lancados.push(p);
    return { id: "av1", fonte: "avulso", clienteId: p.clienteId ?? null, cpfPagador: null, nome: p.nome, cpf: p.cpf, data: p.data, valor: p.valor, podeExcluir: true } as PagamentoPendente;
  };
  const adiantamentos: RepositorioAdiantamentos = {
    async criar(_t, p) {
      if (opcoes.criarFalha) throw new Error("banco fora");
      creditos.push(p);
      return { id: "adi1" };
    },
    async listar() { return []; },
  };
  const lancar = criarLancarAdiantamento({
    lancarAvulso,
    recibos: { async excluirAvulso(_t, id) { apagados.push(id); } },
    adiantamentos,
  });
  return { lancar, lancados, apagados, creditos };
}

const pedido = { clienteId: "cl1", nome: "Mariana Alves", cpf: "52998224725", sessoes: 4, valor: 1000, data: "2026-11-12" };

describe("pagou adiantado", () => {
  it("lança o pagamento com a data do pagamento e o crédito a partir dela", async () => {
    const { lancar, lancados, creditos } = montar();
    const r = await lancar(t, pedido);
    expect(r.adiantamentoId).toBe("adi1");
    expect(r.pagamento.id).toBe("av1");
    expect(lancados[0]).toMatchObject({ data: "2026-11-12", valor: 1000, clienteId: "cl1" });
    expect(lancados[0].observacao).toContain("4 sessões");
    expect(creditos).toEqual([{ clienteId: "cl1", pagamentoId: "av1", sessoes: 4, aPartirDe: "2026-11-12" }]);
  });

  it("recusa quantidade de sessões fora de 1 a 60, e sem pessoa", async () => {
    const { lancar, lancados } = montar();
    await expect(lancar(t, { ...pedido, sessoes: 0 })).rejects.toThrow();
    await expect(lancar(t, { ...pedido, sessoes: 61 })).rejects.toThrow();
    await expect(lancar(t, { ...pedido, sessoes: 2.5 })).rejects.toThrow();
    await expect(lancar(t, { ...pedido, clienteId: " " })).rejects.toThrow();
    expect(lancados).toEqual([]);
  });

  it("⚠️ se o crédito não grava, o pagamento é apagado: sem ele o recibo sairia em dobro", async () => {
    const { lancar, apagados } = montar({ criarFalha: true });
    await expect(lancar(t, pedido)).rejects.toThrow("banco fora");
    expect(apagados).toEqual(["av1"]);
  });
});
