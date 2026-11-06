/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a ficha dos leads da casa, em `leads_da_casa` (040). ⚠️ SÓ SERVIDOR.
 *
 * Cumpre `RepositorioDeLeads` (`nucleo/portas/saida/repositorio-leads.ts`).
 *
 * ⚠️ SERVICE ROLE, e por isso `.eq("tenant_id", t.tenantId)` em TODA consulta: é a única fronteira
 * (ver o ⚠️ de service role em `ARQUITETURA.md`). Quem chama é o agente da casa (ator `agente`) e
 * a rotina de vendas (ator `sistema`), e nenhum dos dois tem sessão.
 *
 * ── A RESERVA ──
 *
 * `reservarAutomatica` é um `update … where <coluna> is null` com `select` de volta: duas
 * rodadas da rotina ao mesmo tempo disputam a mesma linha no banco, e só uma recebe a linha.
 * Antes dele, um `upsert … ignoreDuplicates` garante que a linha existe sem tocar no que já tem.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ConversaDoLead, RepositorioDeLeads } from "@/nucleo/portas/saida/repositorio-leads";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { Automatica, ChaveDoPlano, FichaDeLead, ProximoPasso } from "@/nucleo/dominio/vendas";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { ehVertical } from "@/nucleo/dominio/negocio";
import { FalhaDoProvedor, NaoConfigurado } from "@/nucleo/dominio/erros";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";

type Linha = {
  telefone: string;
  nome: string | null;
  profissao: string | null;
  vertical: string | null;
  equipe: number | null;
  atendimentos_semana: number | null;
  como_marca: string | null;
  interesse: string | null;
  pediu_conversa: boolean;
  passo: ProximoPasso | null;
  plano: ChaveDoPlano | null;
  qualificado_em: string | null;
  link_em: string | null;
  boas_vindas_em: string | null;
  lembrete_em: string | null;
  retomada_em: string | null;
};

const COLUNAS =
  "telefone, nome, profissao, vertical, equipe, atendimentos_semana, como_marca, interesse, pediu_conversa, passo, plano, " +
  "qualificado_em, link_em, boas_vindas_em, lembrete_em, retomada_em";

const COLUNA_DA: Record<Automatica, "boas_vindas_em" | "lembrete_em" | "retomada_em"> = {
  boas_vindas: "boas_vindas_em",
  lembrete: "lembrete_em",
  retomada: "retomada_em",
};

const chave8 = (tel: string) => soDigitos(tel).slice(-8);
const numero = (tel: string) => soDigitos(tel).slice(0, 15);
const nomeCurto = (n: string | null | undefined) => (n ? n.trim().slice(0, 60) || null : null);

function paraFicha(l: Linha): FichaDeLead {
  const qualificada = !!l.qualificado_em;
  return {
    telefone: l.telefone,
    nome: l.nome,
    qualificacao: qualificada
      ? {
          profissao: l.profissao,
          vertical: ehVertical(l.vertical) ? l.vertical : "generico",
          equipe: l.equipe,
          atendimentosPorSemana: l.atendimentos_semana,
          comoMarcaHoje: l.como_marca,
          interesse: l.interesse,
          pediuConversa: l.pediu_conversa,
        }
      : null,
    passo: l.passo,
    plano: l.plano,
    qualificadoEm: l.qualificado_em,
    linkEm: l.link_em,
    boasVindasEm: l.boas_vindas_em,
    lembreteEm: l.lembrete_em,
    retomadaEm: l.retomada_em,
  };
}

function admin() {
  if (!isAdminConfigured) throw new NaoConfigurado(adminFaltando());
  return createAdminClient();
}

function falhou(onde: string, error: { message: string } | null) {
  if (error) throw new FalhaDoProvedor(`Supabase: leads_da_casa.${onde}: ${error.message}`);
}

/** Cria a linha se não existe. Não toca em nada de uma linha que já existe. */
async function garantirLinha(t: ContextoTenant, telefone: string) {
  const { error } = await admin()
    .from("leads_da_casa")
    .upsert(
      { tenant_id: t.tenantId, telefone_chave: chave8(telefone), telefone: numero(telefone) },
      { onConflict: "tenant_id,telefone_chave", ignoreDuplicates: true },
    );
  falhou("garantir", error);
}

/** Grava o nome só onde ainda não há um: o que a pessoa disse vale mais que o que veio depois. */
async function nomeSeFaltar(t: ContextoTenant, telefone: string, nome: string | null | undefined) {
  const n = nomeCurto(nome);
  if (!n) return;
  const { error } = await admin()
    .from("leads_da_casa")
    .update({ nome: n })
    .eq("tenant_id", t.tenantId)
    .eq("telefone_chave", chave8(telefone))
    .is("nome", null);
  falhou("nome", error);
}

export const leadsSupabase: RepositorioDeLeads = {
  faltando() {
    return isAdminConfigured ? [] : adminFaltando();
  },

  async ler(t, telefone) {
    const { data, error } = await admin()
      .from("leads_da_casa")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chave8(telefone))
      .maybeSingle();
    falhou("ler", error);
    return data ? paraFicha(data as unknown as Linha) : null;
  },

  async registrarContato(t, p) {
    if (chave8(p.telefone).length < 8) return;
    await garantirLinha(t, p.telefone);
    await nomeSeFaltar(t, p.telefone, p.nome);
  },

  async qualificar(t, p) {
    const q = p.qualificacao;
    const { error } = await admin()
      .from("leads_da_casa")
      .upsert(
        {
          tenant_id: t.tenantId,
          telefone_chave: chave8(p.telefone),
          telefone: numero(p.telefone),
          ...(nomeCurto(p.nome) ? { nome: nomeCurto(p.nome) } : {}),
          profissao: q.profissao,
          vertical: q.vertical,
          equipe: q.equipe,
          atendimentos_semana: q.atendimentosPorSemana,
          como_marca: q.comoMarcaHoje,
          interesse: q.interesse,
          pediu_conversa: q.pediuConversa,
          passo: p.passo,
          plano: p.plano,
          qualificado_em: p.em,
        },
        { onConflict: "tenant_id,telefone_chave" },
      );
    falhou("qualificar", error);
  },

  async marcarConversa(t, p) {
    await garantirLinha(t, p.telefone);
    await nomeSeFaltar(t, p.telefone, p.nome);
    const { error } = await admin()
      .from("leads_da_casa")
      .update({ passo: "conversa" })
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chave8(p.telefone));
    falhou("marcarConversa", error);
  },

  async marcarLink(t, p) {
    await garantirLinha(t, p.telefone);
    const { error } = await admin()
      .from("leads_da_casa")
      .update({ link_em: p.em })
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chave8(p.telefone));
    falhou("marcarLink", error);
  },

  async reservarAutomatica(t, p) {
    await garantirLinha(t, p.telefone);
    await nomeSeFaltar(t, p.telefone, p.nome);
    const coluna = COLUNA_DA[p.tipo];
    const { data, error } = await admin()
      .from("leads_da_casa")
      .update({ [coluna]: p.em })
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chave8(p.telefone))
      .is(coluna, null)
      .select("telefone_chave");
    falhou("reservar", error);
    return (data ?? []).length === 1;
  },

  async devolverAutomatica(t, p) {
    try {
      const { error } = await admin()
        .from("leads_da_casa")
        .update({ [COLUNA_DA[p.tipo]]: null })
        .eq("tenant_id", t.tenantId)
        .eq("telefone_chave", chave8(p.telefone));
      if (error) console.warn(`[supabase/leads] não devolveu a reserva (${p.tipo}): ${error.message}`);
    } catch (e) {
      console.warn(`[supabase/leads] não devolveu a reserva (${p.tipo}): ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  async conversas(t, desde) {
    /* Uma semana antes de `desde`, para saber se o cliente falou ANTES da última fala da maisa.
     *
     * Da MAIS NOVA para a mais velha, em páginas de 1000 (o teto do PostgREST): a primeira linha
     * de cada telefone é a última fala dele. Em ordem crescente, o teto cortaria justamente as
     * mais novas, e um lead que respondeu ontem pareceria parado. Achado na revisão de 05/11/2026. */
    const antes = new Date(Date.parse(desde) - 7 * 86_400_000).toISOString();
    type LinhaDeMsg = { telefone_chave: string; autor: ConversaDoLead["ultimaDe"]; criado_em: string };
    const msgs: LinhaDeMsg[] = [];
    const PAGINA = 1000;
    for (let pagina = 0; pagina < 20; pagina++) {
      const { data, error } = await admin()
        .from("mensagens_agente")
        .select("telefone_chave, autor, criado_em")
        .eq("tenant_id", t.tenantId)
        .gte("criado_em", antes)
        .order("criado_em", { ascending: false })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      falhou("conversas", error);
      const lote = (data ?? []) as LinhaDeMsg[];
      msgs.push(...lote);
      if (lote.length < PAGINA) break;
    }

    const porChave = new Map<string, { ultimaDe: ConversaDoLead["ultimaDe"]; ultimaEm: string; clienteFalou: boolean }>();
    for (const m of msgs) {
      const atual = porChave.get(m.telefone_chave);
      if (!atual) porChave.set(m.telefone_chave, { ultimaDe: m.autor, ultimaEm: m.criado_em, clienteFalou: m.autor === "cliente" });
      else if (m.autor === "cliente") atual.clienteFalou = true;
    }
    const ativas = [...porChave].filter(([, c]) => c.ultimaEm >= desde).map(([k]) => k);
    if (ativas.length === 0) return [];

    const { data: linhas, error: e2 } = await admin()
      .from("leads_da_casa")
      .select(`telefone_chave, ${COLUNAS}`)
      .eq("tenant_id", t.tenantId)
      .in("telefone_chave", ativas);
    falhou("conversas.fichas", e2);

    return ((linhas ?? []) as unknown as (Linha & { telefone_chave: string })[]).map((l) => {
      const c = porChave.get(l.telefone_chave)!;
      return { ficha: paraFicha(l), ...c };
    });
  },
};
