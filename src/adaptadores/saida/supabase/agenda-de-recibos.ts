/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — quem tem dia de recibo automático, em `clientes.dia_recibo` (032).
 *
 * ⚠️ USA A SERVICE ROLE, e atravessa inquilinos, como `lembretes.ts` e `paraAvisar` das
 * assinaturas: é a rotina diária perguntando "de quem é o dia hoje?", sem sessão nem negócio.
 * Ver o limite escrito na porta (`portas/saida/agenda-de-recibos.ts`): três colunas, nenhuma
 * delas dado pessoal, e o `tenantId` saindo da linha, nunca de quem chama.
 *
 * ⚠️ BANCO SEM A 032: a coluna não existe, o PostgREST recusa com `42703`, e a resposta certa é
 * lista vazia com um aviso no log. Ninguém escolheu dia num banco que não sabe guardá-lo, então
 * não há recibo deixando de sair; derrubar a rotina com 500 só faria barulho no cron.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AgendaDeRecibos, PacienteComDiaDeRecibo } from "@/nucleo/portas/saida/agenda-de-recibos";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";
import { RECIBOS_POR_MES_PADRAO } from "@/nucleo/dominio/recibos-do-mes";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";

type Linha = { tenant_id: string; id: string; dia_recibo: number; recibos_por_mes?: number | null };

export const agendaDeRecibosSupabase: AgendaDeRecibos = {
  async comDia(): Promise<PacienteComDiaDeRecibo[]> {
    if (!isAdminConfigured) throw new FalhaDoProvedor(`falta ${adminFaltando().join(", ")}`);
    const admin = createAdminClient();
    const ler = (cols: string) => admin.from("clientes").select(cols).not("dia_recibo", "is", null).eq("ativo", true);
    let { data, error } = await ler("tenant_id, id, dia_recibo, recibos_por_mes");

    /* Sem a 033 a escolha de quantos por mês não existe, e a função que junta sessões também não:
     * cai para um por sessão, que é como era antes dela. Juntar sem a função recusaria tudo. */
    let semPorMes = false;
    if (error && ["42703", "PGRST204"].includes(error.code ?? "") && /recibos_por_mes/.test(error.message ?? "")) {
      console.warn("[supabase/agenda-de-recibos] sem recibos_por_mes: falta rodar supabase/033_recibo_por_mes.sql; um recibo por sessão até lá");
      semPorMes = true;
      ({ data, error } = await ler("tenant_id, id, dia_recibo"));
    }

    if (error && ["42703", "PGRST204"].includes(error.code ?? "")) {
      console.warn("[supabase/agenda-de-recibos] sem a coluna dia_recibo: falta rodar supabase/032_recibo_automatico.sql");
      return [];
    }
    if (error) throw new FalhaDoProvedor(`Não foi possível ler os dias de recibo: ${error.message}`);

    return ((data ?? []) as unknown as Linha[]).map((l) => ({
      tenantId: l.tenant_id,
      clienteId: l.id,
      dia: Number(l.dia_recibo),
      porMes: semPorMes ? 0 : Number(l.recibos_por_mes ?? RECIBOS_POR_MES_PADRAO),
    }));
  },
};
