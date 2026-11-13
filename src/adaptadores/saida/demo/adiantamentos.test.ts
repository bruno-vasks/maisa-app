/* A cobertura do crédito no demo segue a regra da `v_sessoes_adiantadas` (042). */
import { describe, expect, it } from "vitest";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { adiantamentosDemo, recibosDemo } from "./recibos";

const t: ContextoTenant = { tenantId: "demo", usuarioId: "u", ator: { tipo: "usuario", id: "u" } };

describe("pagou adiantado, no demo", () => {
  it("cobre as próximas sessões a partir do pagamento, e cancelar uma passa o crédito adiante", async () => {
    const antes = (await recibosDemo.pendentes(t, { ate: "2099-12-31" })).filter((x) => x.clienteId === "cl1" && x.fonte === "atendimento");
    expect(antes.length).toBeGreaterThanOrEqual(3);
    const [primeira, segunda, terceira] = antes;

    const pagamento = await recibosDemo.lancarAvulso(t, { data: segunda.data, valor: 250, nome: "Mariana Alves", cpf: "52998224725", clienteId: "cl1" });
    await adiantamentosDemo.criar(t, { clienteId: "cl1", pagamentoId: pagamento.id, sessoes: 1, aPartirDe: segunda.data });

    const depois = (await recibosDemo.pendentes(t, { ate: "2099-12-31" })).map((x) => x.id);
    expect(depois).toContain(primeira.id);
    expect(depois).not.toContain(segunda.id);
    expect(depois).toContain(terceira.id);
    expect(depois).toContain(pagamento.id);

    /* A coberta não aconteceu: o crédito passa para a seguinte. */
    expect(await recibosDemo.sessaoNaoAconteceu(t, segunda.id)).not.toBeNull();
    const [credito] = await adiantamentosDemo.listar(t);
    expect(credito.cobertas.map((x) => x.atendimentoId)).toEqual([terceira.id]);
  });
});
