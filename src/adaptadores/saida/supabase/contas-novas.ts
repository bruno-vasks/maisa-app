/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a conta recém-criada, relida em `auth.users`. ⚠️ SÓ SERVIDOR.
 *
 * Cumpre `ContasNovas` (`nucleo/portas/saida/contas-novas.ts`) para o aviso de cadastro novo.
 *
 * ⚠️ USA A SERVICE ROLE, sem `clienteDoContexto`, como `lembretes.ts`: não há sessão nem
 * inquilino (a conta acabou de nascer, e o negócio dela, se vier, vem depois). Por isso cada
 * leitura daqui é por UMA chave que já identifica a conta — o id de `auth.users`, e o negócio
 * achado por `membros.user_id` dessa conta. Nenhum parâmetro escolhe outra coisa.
 *
 * ── A MARCA DE "AVISADO" MORA NO `app_metadata` DA CONTA ──
 *
 * `app_metadata.maisa_aviso_cadastro_em`, gravada pela API de admin. Três motivos para ser aí, e
 * não numa tabela nova:
 *   · o `app_metadata` NÃO é escrito pelo usuário (o `user_metadata` é, via `auth.updateUser`):
 *     ninguém apaga a própria marca para receber o Bruno de novo;
 *   · morre junto com a conta, e não precisa de migração, RLS nem entrada na auditoria (099) —
 *     uma tabela só de service role, como a `cobranca_eventos`, cairia na regra "RLS sem política";
 *   · é uma leitura que o aviso já faz (`getUserById`), sem ida a mais ao banco.
 * A API de admin MESCLA o `app_metadata` chave a chave (e `null` apaga a chave), então gravar a
 * marca não mexe em `provider`/`providers`, que o próprio Supabase mantém ali.
 *
 * ⚠️ A marca é lida e gravada em dois passos, não é atômica — ver o cabeçalho do caso de uso.
 * ────────────────────────────────────────────────────────────────────────────── */

import { CHAVES_DE_CAMPANHA, type ContaNova } from "@/nucleo/dominio/aviso-de-cadastro";
import type { ContasNovas } from "@/nucleo/portas/saida/contas-novas";
import { NaoConfigurado } from "@/nucleo/dominio/erros";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";
import { isSupabaseConfigured } from "./config";

/** A chave da marca no `app_metadata`. Com prefixo, para não colidir com nada do Supabase. */
export const MARCA = "maisa_aviso_cadastro_em";

/** Metadata é JSON livre: só texto (ou número) atravessa, o resto vira nulo. */
const texto = (v: unknown): string | null =>
  typeof v === "string" ? (v.trim() || null) : typeof v === "number" ? String(v) : null;

function exigirAdmin() {
  if (!isAdminConfigured) throw new NaoConfigurado(adminFaltando());
  return createAdminClient();
}

/** O nome do negócio desta conta, se ele já nasceu. Falha aqui não derruba o aviso. */
async function negocioDoDono(id: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: m } = await admin
      .from("membros").select("tenant_id")
      .eq("user_id", id).eq("papel", "dono")
      .limit(1).maybeSingle();
    const tenant = (m as { tenant_id?: string } | null)?.tenant_id;
    if (!tenant) return null;
    const { data: n } = await admin.from("negocios").select("nome").eq("id", tenant).maybeSingle();
    return texto((n as { nome?: unknown } | null)?.nome);
  } catch {
    return null;
  }
}

export const contasNovasSupabase: ContasNovas = {
  faltando() {
    if (!isSupabaseConfigured) return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    return isAdminConfigured ? [] : adminFaltando();
  },

  async ler(id) {
    const admin = exigirAdmin();
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) {
      /* 404 é "não existe": o trigger só manda id de conta que acabou de nascer, então isto é
       * alguém chamando a rota à mão com um id inventado. Outra falha sobe, para a rota responder
       * erro e o `net._http_response` mostrar. */
      if (error.status === 404) return null;
      throw new Error(`contasNovas.ler: ${error.message}`);
    }
    const u = data.user;
    if (!u) return null;

    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const app = (u.app_metadata ?? {}) as Record<string, unknown>;

    const campanha: ContaNova["campanha"] = {};
    for (const k of CHAVES_DE_CAMPANHA) {
      const v = texto(meta[k]);
      if (v) campanha[k] = v;
    }

    return {
      id: u.id,
      email: u.email ?? null,
      criadaEm: u.created_at,
      emailConfirmado: Boolean(u.email_confirmed_at),
      provedor: texto(app.provider),
      /* O banco primeiro: é o nome que ficou. O metadata (`negocio`, gravado pelo `/assinar` desde
       * 22/10/2026) cobre o caso comum, em que o aviso chega antes do `criar_negocio()`. */
      negocio: (await negocioDoDono(u.id)) ?? texto(meta.negocio),
      nome: texto(meta.full_name) ?? texto(meta.name),
      telefone: texto(meta.telefone),
      plano: texto(meta.plano),
      funil: texto(meta.funil),
      vertical: texto(meta.icp),
      campanha,
      avisadaEm: texto(app[MARCA]),
    };
  },

  async marcarAvisada(id, quando) {
    const { error } = await exigirAdmin().auth.admin.updateUserById(id, { app_metadata: { [MARCA]: quando } });
    if (error) throw new Error(`contasNovas.marcarAvisada: ${error.message}`);
  },

  async desmarcarAvisada(id) {
    const { error } = await exigirAdmin().auth.admin.updateUserById(id, { app_metadata: { [MARCA]: null } });
    if (error) throw new Error(`contasNovas.desmarcarAvisada: ${error.message}`);
  },
};
