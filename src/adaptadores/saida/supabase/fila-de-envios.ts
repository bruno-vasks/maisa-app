/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a fila de envios, em `envios_whatsapp` (036).
 *
 * A vez de cada mensagem é decidida no banco (`reservar_envio`): uma por vez por negócio, e
 * espaço desde a última que saiu. Ver o cabeçalho da 036 e a porta.
 *
 * Service role sempre, como a fila de lembretes: a tabela tem RLS ligada e política nenhuma,
 * e quem drena não tem sessão. O `tenant_id` de cada linha vem do `ContextoTenant`, nunca de
 * fora.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { FilaDeEnvios } from "@/nucleo/portas/saida/fila-de-envios";
import { MAX_TENTATIVAS, type DocumentoNaFila, type EnvioNaFila, type NovoEnvio } from "@/nucleo/dominio/envios";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";

type DocumentoGravado = { caminho?: string; url?: string; nome_do_arquivo: string; legenda: string };

type Linha = {
  id: string;
  tenant_id: string;
  para: string;
  textos: string[] | null;
  documento: DocumentoGravado | null;
  origem: NovoEnvio["origem"];
  recibo_id: string | null;
  desfecho_ao_enviar: "enviado" | "enviado_ao_dono" | null;
  criado_em: string;
  tentativas: number;
};

const gravado = (d: DocumentoNaFila): DocumentoGravado => ({
  ...(d.caminho ? { caminho: d.caminho } : {}),
  ...(d.url ? { url: d.url } : {}),
  nome_do_arquivo: d.nomeDoArquivo,
  legenda: d.legenda,
});

function paraEnvio(l: Linha): EnvioNaFila {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    para: l.para,
    textos: l.textos ?? [],
    ...(l.documento
      ? { documento: { caminho: l.documento.caminho, url: l.documento.url, nomeDoArquivo: l.documento.nome_do_arquivo, legenda: l.documento.legenda } }
      : {}),
    origem: l.origem,
    ...(l.recibo_id && l.desfecho_ao_enviar ? { recibo: { id: l.recibo_id, desfechoAoEnviar: l.desfecho_ao_enviar } } : {}),
    criadoEm: l.criado_em,
    tentativas: l.tentativas,
  };
}

export const filaDeEnviosSupabase: FilaDeEnvios = {
  faltando() {
    return isAdminConfigured ? [] : adminFaltando();
  },

  async enfileirar(t, envios) {
    if (envios.length === 0) return;
    const { error } = await createAdminClient()
      .from("envios_whatsapp")
      .insert(envios.map((e) => ({
        tenant_id: t.tenantId,
        para: e.para,
        textos: e.textos,
        documento: e.documento ? gravado(e.documento) : null,
        origem: e.origem,
        recibo_id: e.recibo?.id ?? null,
        desfecho_ao_enviar: e.recibo?.desfechoAoEnviar ?? null,
      })));
    /* Lança: quem enfileira manda direto, como antes da fila (é o caso da 036 não ter rodado). O
     * log é daqui porque é aqui que se sabe o porquê; o caso de uso só segue sem a fila. */
    if (error) {
      console.warn(`[supabase/fila-de-envios] ${t.tenantId}: a fila não aceitou ${envios.length} envio(s), eles saem na hora: ${error.message}`);
      throw new FalhaDoProvedor(`Supabase: enfileirar ${envios.length} envio(s): ${error.message}`);
    }
  },

  async negociosComEnvio() {
    const { data, error } = await createAdminClient().rpc("negocios_com_envio");
    if (error) throw new FalhaDoProvedor(`Supabase: negocios_com_envio: ${error.message}`);
    /* Função `returns setof uuid`. O PostgREST devolve a lista de valores; se vier como linhas
     * (`{ negocios_com_envio: "…" }`), o valor é o único campo. */
    return ((data ?? []) as unknown[]).map((x) => (x && typeof x === "object" ? String(Object.values(x)[0]) : String(x)));
  },

  async reservar(t, espacoMs) {
    const { data, error } = await createAdminClient().rpc("reservar_envio", { p_tenant: t.tenantId, p_espaco_ms: espacoMs });
    if (error) throw new FalhaDoProvedor(`Supabase: reservar_envio: ${error.message}`);
    const linha = ((data ?? []) as Linha[])[0];
    return linha ? paraEnvio(linha) : null;
  },

  async concluir(t, id) {
    const { error } = await createAdminClient().rpc("concluir_envio", { p_id: id });
    /* A mensagem já saiu: não estourar aqui. Se a marca não gravar, a reserva vence em 10
     * minutos e ela sai de novo; o log é a única pista disso. */
    if (error) console.error(`[supabase/fila-de-envios] ${t.tenantId}: enviado, mas não marcou ${id}: ${error.message}`);
  },

  async devolver(t, id, p) {
    const { data, error } = await createAdminClient().rpc("devolver_envio", {
      p_id: id, p_erro: p.erro, p_desistir: p.desistir, p_max: MAX_TENTATIVAS,
    });
    if (error) {
      console.error(`[supabase/fila-de-envios] ${t.tenantId}: não devolveu ${id}: ${error.message}`);
      return { desistiu: false };
    }
    return { desistiu: data === true };
  },
};
