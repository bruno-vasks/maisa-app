#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * QUAIS MIGRAÇÕES FALTAM RODAR NO BANCO — `npm run banco:conferir` (01/10/2026).
 *
 *   npm run banco:conferir     → uma linha por migração: ✓ rodou, ✗ falta, · não dá para ver daqui
 *
 * ── POR QUE EXISTE ──
 *
 * As migrações de `supabase/` rodam À MÃO, coladas no SQL Editor, e nada avisa quando uma
 * fica para trás. Em 01/10/2026 a Regina digitou o valor da sessão na ficha de uma paciente,
 * clicou em "Marcar horário" e teve que digitar de novo: a `030_valor_da_sessao.sql` nunca
 * tinha rodado em produção. A tela pintava o valor, o servidor recusava ao gravar, e o
 * valor sumia. A `031` também estava pendente. Nenhum teste pega isso: o código foi escrito
 * para funcionar ANTES da migração (lê com `*`), então o único sintoma é um campo que não
 * guarda.
 *
 * ── COMO CONFERE ──
 *
 * Para cada migração, um objeto que só existe depois dela (uma coluna ou uma tabela), lido
 * com `select=<coluna>&limit=0`: não traz linha nenhuma, só pergunta se a coluna existe. O
 * PostgREST responde 200 ou recusa com `42703`/`PGRST204` (coluna) ou `42P01`/`PGRST205`
 * (tabela). Constraint, função e `drop not null` não aparecem por aí: essas ficam como "·".
 *
 * ⚠️ SÓ LEITURA, e não lê dado de ninguém (`limit=0`). Lê o `.env.local`, que aponta para o
 * Supabase de PRODUÇÃO, com a service role.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

function ambiente() {
  const env = { ...process.env };
  try {
    for (const linha of readFileSync(join(RAIZ, ".env.local"), "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env.local: vale o que estiver no ambiente */ }
  return env;
}

/* O marcador de cada migração. `coluna: null` = basta a tabela (ou view) existir. Quem
 * escrever a 033 acrescenta uma linha aqui na mesma mudança. */
export const MARCADORES = [
  { migracao: "009_conversas_painel", tabela: "conversas_estado", coluna: null },
  { migracao: "010_lembretes", tabela: "atendimentos", coluna: "lembrete_em" },
  { migracao: "012_faqs_vetorial", tabela: "faqs", coluna: "embedding" },
  { migracao: "013_contatos", tabela: "contatos", coluna: null },
  { migracao: "014_fiscal_mei", tabela: "atendimentos", coluna: "nota_id" },
  { migracao: "015_faturamento", tabela: "v_a_faturar", coluna: null },
  { migracao: "017_dono_por_inquilino", tabela: "integracoes_whatsapp", coluna: "telefone_dono" },
  { migracao: "018_recibo_saude", tabela: "lotes_recibo", coluna: null },
  { migracao: "019_pagamento_avulso", tabela: "pagamentos_avulsos", coluna: null },
  { migracao: "020_recibo_unitario", tabela: "recibos_emitidos", coluna: null },
  { migracao: "021_procuracao", tabela: "config_fiscal", coluna: "procuracao_valida_ate" },
  { migracao: "022_procuracao_aceite", tabela: "config_fiscal", coluna: "procuracao_aceita_em" },
  { migracao: "023_recibo_numero_e_comprovante", tabela: "recibos_emitidos", coluna: "comprovante_caminho" },
  { migracao: "024_avisar_recibo", tabela: "assistente", coluna: "avisar_recibo" },
  { migracao: "025_desfecho_do_aviso", tabela: "recibos_emitidos", coluna: "aviso" },
  { migracao: "026_lembrete_horas", tabela: "assistente", coluna: "lembrete_horas" },
  { migracao: "027_conflito_de_horario", tabela: null, coluna: null },
  { migracao: "028_cobranca_provedor", tabela: "cobranca_eventos", coluna: null },
  { migracao: "029_cliente_sem_telefone", tabela: null, coluna: null },
  { migracao: "030_valor_da_sessao", tabela: "v_clientes", coluna: "valor_sessao" },
  { migracao: "031_foto_do_negocio", tabela: "negocios", coluna: "foto" },
  { migracao: "032_recibo_automatico", tabela: "assistente", coluna: "recibo_primeiro_para_mim" },
  { migracao: "033_recibo_por_mes", tabela: "v_clientes", coluna: "recibos_por_mes" },
];

const FALTA = new Set(["42703", "PGRST204", "42P01", "PGRST205", "PGRST200"]);

async function conferir(url, chave, m) {
  if (!m.tabela) return { m, estado: "invisivel" };
  const r = await fetch(`${url}/rest/v1/${m.tabela}?select=${m.coluna ?? "*"}&limit=0`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });
  if (r.ok) return { m, estado: "rodou" };
  const corpo = await r.json().catch(() => ({}));
  if (FALTA.has(corpo.code)) return { m, estado: "falta" };
  return { m, estado: "erro", detalhe: `HTTP ${r.status} ${corpo.code ?? ""} ${corpo.message ?? ""}`.trim() };
}

async function principal() {
  const env = ambiente();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const chave = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !chave) {
    console.error("✗ falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  console.log(`Banco: ${url}\n`);
  const resultados = await Promise.all(MARCADORES.map((m) => conferir(url, chave, m)));
  const faltam = [];
  for (const { m, estado, detalhe } of resultados) {
    const alvo = m.tabela ? `${m.tabela}${m.coluna ? `.${m.coluna}` : ""}` : "";
    if (estado === "rodou") console.log(`  ✓ ${m.migracao}`);
    else if (estado === "falta") { console.log(`  ✗ ${m.migracao}   (não existe ${alvo})`); faltam.push(m.migracao); }
    else if (estado === "invisivel") console.log(`  · ${m.migracao}   (não dá para conferir por aqui)`);
    else console.log(`  ? ${m.migracao}   ${detalhe}`);
  }
  console.log(
    faltam.length
      ? `\n${faltam.length} para rodar, nesta ordem: Supabase → SQL Editor → cole o arquivo inteiro → Run.\n${faltam.map((f) => `  supabase/${f}.sql`).join("\n")}`
      : "\nNenhuma migração conferível está faltando.",
  );
  if (faltam.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await principal();
