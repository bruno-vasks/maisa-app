/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o cofre da subconta de recebimentos, no Supabase (039).
 *
 * A tabela `contas_de_recebimento` guarda o id no Asaas, a carteira, a situação e o HASH do token
 * do aviso; a chave da subconta vai para o Vault, e só as funções da 039 a leem. Tudo service role:
 * quem usa este cofre é o adaptador do Asaas, nunca a tela.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CofreDeRecebimentos, ContaGuardada } from "@/nucleo/portas/saida/cofre-de-recebimentos";
import { DadoInvalido, FalhaDoProvedor } from "@/nucleo/dominio/erros";
import { createAdminClient } from "./admin";

const AVISO_039 =
  "Os recebimentos pelo Asaas ainda não foram migrados neste banco. Rode `supabase/039_recebimentos_asaas.sql` no SQL Editor do Supabase.";

const faltaMigracao = (error: { code?: string; message?: string } | null) =>
  !!error && (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "") || /could not find the function|does not exist/i.test(error.message ?? ""));

function falha(onde: string, error: { code?: string; message?: string }): Error {
  if (faltaMigracao(error)) return new FalhaDoProvedor(AVISO_039);
  if (error.code === "P0001") return new DadoInvalido(error.message ?? "Recusado.");
  return new FalhaDoProvedor(`Supabase: ${onde}: ${error.message}`);
}

export const cofreDeRecebimentosSupabase: CofreDeRecebimentos = {
  async ler(t) {
    const { data, error } = await createAdminClient().rpc("conta_de_recebimento", { p_tenant: t.tenantId });
    if (faltaMigracao(error)) return null;
    if (error) throw falha("conta_de_recebimento", error);
    const l = ((data ?? []) as {
      ambiente: ContaGuardada["ambiente"]; id_conta: string; wallet_id: string | null; situacao: ContaGuardada["situacao"];
      aviso_cadastrado: boolean | null; chave: string;
    }[])[0];
    return l
      ? { ambiente: l.ambiente, idConta: l.id_conta, walletId: l.wallet_id, situacao: l.situacao, avisoCadastrado: l.aviso_cadastrado === true, chave: l.chave }
      : null;
  },

  async guardar(t, c) {
    const { error } = await createAdminClient().rpc("guardar_conta_de_recebimento", {
      p_tenant: t.tenantId, p_ambiente: c.ambiente, p_id_conta: c.idConta, p_wallet: c.walletId ?? "",
      p_chave: c.chave, p_token_hash: c.hashDoToken, p_situacao: c.situacao,
    });
    if (error) {
      /* A conta já existe no Asaas e a chave não volta mais: o id vai para o log, que é o único
       * lugar onde ele ainda existe. */
      console.error(`[supabase/cofre-de-recebimentos] ${t.tenantId}: a subconta ${c.idConta} foi aberta e NÃO foi guardada: ${error.message}`);
      throw falha("guardar_conta_de_recebimento", error);
    }
  },

  async atualizarSituacao(t, situacao) {
    const { error } = await createAdminClient().rpc("atualizar_situacao_de_recebimento", { p_tenant: t.tenantId, p_situacao: situacao });
    if (error) throw falha("atualizar_situacao_de_recebimento", error);
  },

  async trocarToken(t, hash) {
    const { error } = await createAdminClient().rpc("trocar_token_de_recebimento", { p_tenant: t.tenantId, p_token_hash: hash });
    if (error) throw falha("trocar_token_de_recebimento", error);
  },

  async negocioDoToken(hash) {
    const { data, error } = await createAdminClient().rpc("negocio_do_aviso", { p_token_hash: hash });
    if (faltaMigracao(error)) return null;
    if (error) throw falha("negocio_do_aviso", error);
    return typeof data === "string" && data ? data : null;
  },
};
