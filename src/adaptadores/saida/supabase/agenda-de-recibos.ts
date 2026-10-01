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
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";

type Linha = { tenant_id: string; id: string; dia_recibo: number };

export const agendaDeRecibosSupabase: AgendaDeRecibos = {
  async comDia(): Promise<PacienteComDiaDeRecibo[]> {
    if (!isAdminConfigured) throw new FalhaDoProvedor(`falta ${adminFaltando().join(", ")}`);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("clientes")
      .select("tenant_id, id, dia_recibo")
      .not("dia_recibo", "is", null)
      .eq("ativo", true);

    if (error && ["42703", "PGRST204"].includes(error.code ?? "")) {
      console.warn("[supabase/agenda-de-recibos] sem a coluna dia_recibo: falta rodar supabase/032_recibo_automatico.sql");
      return [];
    }
    if (error) throw new FalhaDoProvedor(`Não foi possível ler os dias de recibo: ${error.message}`);

    return ((data ?? []) as Linha[]).map((l) => ({ tenantId: l.tenant_id, clienteId: l.id, dia: Number(l.dia_recibo) }));
  },
};
