/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR — os créditos de sessões no Supabase (042, 12/11/2026).
 *
 * Grava em `adiantamentos` e lê as sessões cobertas de `v_sessoes_adiantadas`, que calcula a
 * cobertura na hora. Ver `nucleo/portas/saida/repositorio-adiantamentos.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Adiantamento, RepositorioAdiantamentos } from "@/nucleo/portas/saida/repositorio-adiantamentos";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { clienteDoContexto } from "./contexto-cliente";

const AVISO_042 =
  "O pagamento adiantado ainda não existe neste banco. Rode `supabase/042_adiantamentos.sql` no SQL Editor do Supabase.";

function faltaMigracao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST202", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "")) return true;
  return /relation .* does not exist|could not find the (table|function|.* column)|column .* does not exist/i
    .test(error.message ?? "");
}

type Linha = {
  id: string;
  cliente_id: string;
  pagamento_id: string;
  sessoes: number;
  a_partir_de: string;
  pagamentos_avulsos: { data: string; valor: number | string; recibo_id: string | null; lote_recibo_id: string | null } | null;
};

export const adiantamentosSupabase: RepositorioAdiantamentos = {
  async criar(t: ContextoTenant, p) {
    const { data, error } = await clienteDoContexto(t)
      .from("adiantamentos")
      .insert({
        tenant_id: t.tenantId,
        cliente_id: p.clienteId,
        pagamento_id: p.pagamentoId,
        sessoes: p.sessoes,
        a_partir_de: p.aPartirDe,
      })
      .select("id")
      .single();
    if (faltaMigracao(error)) throw new Error(AVISO_042);
    if (error || !data) throw new Error(error?.message ?? "Não consegui gravar o pagamento adiantado.");
    return { id: String((data as { id: string }).id) };
  },

  async listar(t: ContextoTenant): Promise<Adiantamento[]> {
    const supabase = clienteDoContexto(t);
    const [creditos, cobertas] = await Promise.all([
      supabase
        .from("adiantamentos")
        .select("id, cliente_id, pagamento_id, sessoes, a_partir_de, pagamentos_avulsos(data, valor, recibo_id, lote_recibo_id)")
        .eq("tenant_id", t.tenantId)
        .order("criado_em", { ascending: false }),
      supabase
        .from("v_sessoes_adiantadas")
        .select("atendimento_id, adiantamento_id, data, inicio")
        .eq("tenant_id", t.tenantId)
        .order("inicio", { ascending: true }),
    ]);
    if (faltaMigracao(creditos.error) || faltaMigracao(cobertas.error)) throw new Error(AVISO_042);
    if (creditos.error) throw new Error(creditos.error.message);
    if (cobertas.error) throw new Error(cobertas.error.message);

    const porCredito = new Map<string, { atendimentoId: string; data: string }[]>();
    for (const c of (cobertas.data ?? []) as { atendimento_id: string; adiantamento_id: string; data: string }[]) {
      const lista = porCredito.get(c.adiantamento_id) ?? [];
      lista.push({ atendimentoId: c.atendimento_id, data: String(c.data).slice(0, 10) });
      porCredito.set(c.adiantamento_id, lista);
    }

    return ((creditos.data ?? []) as unknown as Linha[]).map((l) => ({
      id: l.id,
      clienteId: l.cliente_id,
      pagamentoId: l.pagamento_id,
      pagoEm: String(l.pagamentos_avulsos?.data ?? l.a_partir_de).slice(0, 10),
      valor: Number(l.pagamentos_avulsos?.valor ?? 0),
      sessoes: Number(l.sessoes),
      aPartirDe: String(l.a_partir_de).slice(0, 10),
      comRecibo: !!(l.pagamentos_avulsos?.recibo_id || l.pagamentos_avulsos?.lote_recibo_id),
      cobertas: porCredito.get(l.id) ?? [],
    }));
  },
};
