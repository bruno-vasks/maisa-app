/* ─────────────────────────────────────────────────────────────────────────────
 * A CONFIGURAÇÃO FISCAL VOLTA DO BANCO INTEIRA.
 *
 * Existe por causa de um defeito que viveu de 24/08 a 29/09/2026: as três colunas da
 * procuração (021/022) eram gravadas por `paraLinha` e lidas por `paraConfig`, mas nunca
 * pedidas no `select`. O PostgREST devolve só o que se pede — sem erro — e elas chegavam
 * `undefined`. Na tela, a autorização nunca ficava `aguardando_aceite` nem `vencida`.
 *
 * O cliente falso abaixo imita exatamente isso: devolve só as colunas nomeadas no `select`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it, vi } from "vitest";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

/** Uma linha de `config_fiscal` como o banco a guarda — todas as colunas preenchidas. */
const LINHA_NO_BANCO: Record<string, unknown> = {
  tenant_id: "neg-1",
  ambiente: "producao",
  prestador_cnpj: null, prestador_nome: null, codigo_municipio: null,
  optante_mei: false, optante_simples: false,
  focus_empresa_id: null, certificado_valido_ate: null, codigo_tributacao_nacional: null,
  prestador_cpf: "12345678909",
  ocupacao_saude: "psicologo",
  registro_profissional: "CRP 06/123456",
  procurador_documento: "62025689000166",
  procuracao_valida_ate: "2031-09-29",
  procuracao_aceita_em: "2026-09-29T10:00:00-03:00",
  inscricao_municipal: null, item_lista_servico: null, aliquota_iss: null,
  codigo_tributario_municipio: null,
};

/** Só as colunas que o `select` nomeou, como o PostgREST responde. */
function projetar(colunas: string): Record<string, unknown> {
  const pedidas = colunas.split(",").map((c) => c.trim());
  return Object.fromEntries(pedidas.map((c) => [c, LINHA_NO_BANCO[c]]));
}

vi.mock("./contexto-cliente", () => ({
  clienteDoContexto: () => ({
    from: () => {
      const consulta = {
        colunas: "",
        select(c: string) { consulta.colunas = c; return consulta; },
        eq() { return consulta; },
        upsert() { return consulta; },
        async maybeSingle() { return { data: projetar(consulta.colunas), error: null }; },
      };
      return consulta;
    },
  }),
}));

const t: ContextoTenant = { tenantId: "neg-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };

describe("fiscalSupabase", () => {
  it("lê de volta a autorização de acesso", async () => {
    const { fiscalSupabase } = await import("./fiscal");
    const c = await fiscalSupabase.ler(t);

    expect(c.procuradorDocumento).toBe("62025689000166");
    expect(c.procuracaoValidaAte).toBe("2031-09-29");
    expect(c.procuracaoAceitaEm).toBe("2026-09-29T10:00:00-03:00");
  });

  /* O `salvar` devolve o que o banco respondeu ao upsert — com o mesmo `select`. Se ele perder
   * uma coluna, a tela aplica o envelope e a apaga do estado no mesmo clique. */
  it("o que o salvamento devolve também vem inteiro", async () => {
    const { fiscalSupabase } = await import("./fiscal");
    const c = await fiscalSupabase.salvar(t, { registroProfissional: "CRP 06/123456" });

    expect(c.procuradorDocumento).toBe("62025689000166");
    expect(c.procuracaoAceitaEm).toBe("2026-09-29T10:00:00-03:00");
  });

  /* A regra do cabeçalho de `COLUNAS`, sem depender de lembrar dela: nenhum campo da
   * configuração pode chegar `undefined` com o banco preenchido. */
  it("nenhum campo da configuração volta undefined", async () => {
    const { fiscalSupabase } = await import("./fiscal");
    const c = await fiscalSupabase.ler(t);

    const faltando = Object.entries(c).filter(([, v]) => v === undefined).map(([k]) => k);
    expect(faltando).toEqual([]);
  });
});
