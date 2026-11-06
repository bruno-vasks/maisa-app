/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — as contas do app, vistas pela casa (05/11/2026). ⚠️ SÓ SERVIDOR.
 *
 * Cumpre `CadastrosDoApp` (`nucleo/portas/saida/cadastros-do-app.ts`), cujo limite está escrito
 * lá: só leitura, e só os campos de `CadastroNoApp`.
 *
 * ⚠️ USA A SERVICE ROLE, sem `clienteDoContexto`, como `contas-novas.ts`: a pergunta é sobre o app
 * inteiro ("quem criou conta?"), e não há sessão nem inquilino que a responda. É a mesma leitura
 * do `npm run leads`, feita pelo servidor: os usuários pela API de admin, e o negócio, o WhatsApp
 * e a assinatura de cada dono pelas tabelas.
 *
 * ── O NOME DA PESSOA ──
 *
 * O `/assinar` não pergunta o nome da pessoa: o campo é "nome da clínica ou o seu", e ele vira o
 * nome do negócio E do profissional. O `/comecar` pergunta "Seu nome" separado. Então o nome vem
 * do metadata (login do Google), ou do profissional da conta quando ele é diferente do nome do
 * negócio. Sem isso, a boas-vindas sairia "Oi, Barbearia!".
 *
 * Lê tudo de uma vez a cada chamada: são dezenas de contas, e a rotina roda de 10 em 10 minutos.
 * Quando passar de mil, `usuarios()` já pagina; o resto vira consulta com filtro.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CadastrosDoApp } from "@/nucleo/portas/saida/cadastros-do-app";
import type { CadastroNoApp } from "@/nucleo/dominio/vendas";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { ehVertical } from "@/nucleo/dominio/negocio";
import { NaoConfigurado } from "@/nucleo/dominio/erros";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";
import { isSupabaseConfigured } from "./config";

const texto = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : null);
const dia = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);
const k8 = (v: string | null | undefined) => soDigitos(v).slice(-8);

type Usuario = { id: string; created_at: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> };

function exigirAdmin() {
  if (!isAdminConfigured) throw new NaoConfigurado(adminFaltando());
  return createAdminClient();
}

async function usuarios(): Promise<Usuario[]> {
  const admin = exigirAdmin();
  const todos: Usuario[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`cadastrosDoApp.usuarios: ${error.message}`);
    const lote = (data?.users ?? []) as unknown as Usuario[];
    todos.push(...lote);
    if (lote.length < 1000) return todos;
  }
}

async function tabela<T>(nome: string, colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  let q = exigirAdmin().from(nome).select(colunas);
  if (filtro) q = filtro(q);
  const { data, error } = await q;
  if (error) throw new Error(`cadastrosDoApp.${nome}: ${error.message}`);
  return (data ?? []) as T[];
}

async function carregar(filtrar: (u: Usuario) => boolean): Promise<CadastroNoApp[]> {
  const escolhidos = (await usuarios()).filter(filtrar);
  if (escolhidos.length === 0) return [];

  const membros = await tabela<{ user_id: string; tenant_id: string }>(
    "membros", "user_id, tenant_id", (q) => q.eq("papel", "dono").in("user_id", escolhidos.map((u) => u.id)),
  );
  const tenants = [...new Set(membros.map((m) => m.tenant_id))];
  const [negocios, whatsapp, assinaturas, profissionais] = tenants.length
    ? await Promise.all([
        tabela<{ id: string; nome: string; vertical: string }>("negocios", "id, nome, vertical", (q) => q.in("id", tenants)),
        tabela<{ tenant_id: string; status: string }>("integracoes_whatsapp", "tenant_id, status", (q) => q.in("tenant_id", tenants)),
        tabela<{ tenant_id: string; status: string; provedor: string | null; periodo_fim: string | null; trial_fim: string | null }>(
          "assinaturas", "tenant_id, status, provedor, periodo_fim, trial_fim", (q) => q.in("tenant_id", tenants),
        ),
        tabela<{ tenant_id: string; nome: string; usuario_id: string | null }>(
          "profissionais", "tenant_id, nome, usuario_id", (q) => q.in("tenant_id", tenants).order("criado_em", { ascending: true }),
        ),
      ])
    : [[], [], [], []];

  const tenantDe = new Map(membros.map((m) => [m.user_id, m.tenant_id]));
  const negocioDe = new Map(negocios.map((n) => [n.id, n]));
  const whatsappDe = new Map(whatsapp.map((w) => [w.tenant_id, w.status]));
  const assinaturaDe = new Map(assinaturas.map((a) => [a.tenant_id, a]));

  return escolhidos
    .map((u): CadastroNoApp => {
      const meta = u.user_metadata ?? {};
      const t = tenantDe.get(u.id) ?? null;
      const n = t ? negocioDe.get(t) ?? null : null;
      const a = t ? assinaturaDe.get(t) ?? null : null;
      const w = t ? whatsappDe.get(t) : undefined;
      const doTenant = t ? profissionais.filter((p) => p.tenant_id === t) : [];
      const prof = doTenant.find((p) => p.usuario_id === u.id) ?? doTenant[0];
      const nomeDoProfissional = prof && n && prof.nome.trim() !== n.nome.trim() ? prof.nome : null;
      const vertical = n?.vertical ?? texto(meta.icp);
      return {
        contaId: u.id,
        nome: texto(meta.full_name) ?? texto(meta.name) ?? texto(meta.nome) ?? nomeDoProfissional,
        telefone: soDigitos(texto(meta.telefone)) || null,
        criadaEm: u.created_at,
        emailConfirmado: Boolean(u.email_confirmed_at),
        negocio: n?.nome ?? null,
        vertical: ehVertical(vertical) ? vertical : null,
        whatsapp: w === "conectado" || w === "pareando" || w === "desconectado" ? w : null,
        testeAte: a?.status === "trial" ? dia(a.trial_fim) : null,
        pagoAte: a && a.provedor && a.status === "ativa" ? dia(a.periodo_fim) : null,
      };
    })
    .sort((x, y) => y.criadaEm.localeCompare(x.criadaEm));
}

export const cadastrosDoAppSupabase: CadastrosDoApp = {
  faltando() {
    if (!isSupabaseConfigured) return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    return isAdminConfigured ? [] : adminFaltando();
  },

  recentes(desde) {
    return carregar((u) => u.created_at >= desde);
  },

  async porTelefone(telefone) {
    const k = k8(telefone);
    if (k.length < 8) return null;
    const [achado] = await carregar((u) => k8(texto(u.user_metadata?.telefone)) === k);
    return achado ?? null;
  },
};
