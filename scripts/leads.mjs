#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * QUEM ENTROU NO FUNIL E NÃO COMPROU — `npm run leads` (30/09/2026).
 *
 *   npm run leads                 → a lista no terminal, do mais novo para o mais velho
 *   npm run leads -- --csv x.csv  → a mesma lista num CSV, para importar onde quiser
 *
 * ── DE ONDE VEM ──
 *
 * O `/assinar` grava no `user_metadata` do usuário o telefone, o plano, a vertical e a
 * campanha (UTM) NO MOMENTO DO CADASTRO, antes de qualquer pagamento — ver o cabeçalho de
 * `app/assinar/[plano]/Assinar.tsx`. Então quem preencheu os três campos e desistiu está
 * guardado, mesmo sem negócio e sem Pix. O que faltava era alguém conseguir LER isso.
 *
 * ── O ESTADO DE CADA UM ──
 *
 *   travou no e-mail ..... criou a conta e não confirmou o e-mail, então nunca viu o Pix.
 *                          Com "Confirm email" ligado no Supabase, TODO cadastro cai aqui
 *   sem negócio .......... confirmou e não chegou a criar o negócio
 *   não pagou ............ tem negócio e nunca pagou nada
 *   pagou ................ tem mês pago (e até quando)
 *
 * ⚠️ SÓ LEITURA, MAS É DADO PESSOAL DE VERDADE (e-mail e WhatsApp de quem não é cliente). O
 * padrão é imprimir no terminal. O CSV só sai com `--csv`, no caminho que você der — e não o
 * guarde em pasta sincronizada ou compartilhada: é a LGPD inteira num arquivo.
 *
 * Lê o `.env.local`, que aponta para o Supabase de PRODUÇÃO. Precisa da service role.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from "node:fs";
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

const env = ambiente();
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_ || !CHAVE) {
  console.error("✗ falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };
const pegar = async (caminho) => {
  const r = await fetch(`${URL_}${caminho}`, { headers: H });
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

/* Todos os usuários, de página em página. A API de admin pagina em até 1000. */
async function usuarios() {
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const d = await pegar(`/auth/v1/admin/users?page=${pagina}&per_page=1000`);
    const lote = d.users ?? [];
    todos.push(...lote);
    if (lote.length < 1000) return todos;
  }
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
const dia = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "");
const fone = (d) => (d && d.length >= 10 ? `(${d.slice(-11, -9)}) ${d.slice(-9, -4)}-${d.slice(-4)}` : d ?? "");

const [us, membros, negocios, assinaturas] = await Promise.all([
  usuarios(),
  pegar("/rest/v1/membros?select=user_id,tenant_id&papel=eq.dono"),
  pegar("/rest/v1/negocios?select=id,nome"),
  pegar("/rest/v1/assinaturas?select=tenant_id,status,provedor,periodo_fim,plano"),
]);

const tenantDe = new Map(membros.map((m) => [m.user_id, m.tenant_id]));
const nomeDe = new Map(negocios.map((n) => [n.id, n.nome]));
const assDe = new Map(assinaturas.map((a) => [a.tenant_id, a]));

/* Só quem entrou pelo funil: é o `/assinar` que grava `plano` no metadata. Conta criada
 * por `/cadastro` ou à mão não é lead de anúncio. */
const leads = us
  .filter((u) => u.user_metadata && "plano" in u.user_metadata)
  .map((u) => {
    const m = u.user_metadata;
    const t = tenantDe.get(u.id);
    const a = t ? assDe.get(t) : null;
    const pagou = a && a.provedor && a.status === "ativa";
    const estado = !t
      ? (u.email_confirmed_at ? "sem negócio" : "travou no e-mail")
      : pagou ? `pagou (até ${a.periodo_fim ?? "?"})` : "não pagou";
    return {
      quando: dia(u.created_at),
      estado,
      negocio: t ? nomeDe.get(t) ?? "" : "",
      email: u.email ?? "",
      whatsapp: fone(m.telefone),
      plano: m.plano ?? "",
      vertical: m.icp ?? "",
      campanha: UTM.map((k) => m[k]).filter(Boolean).join(" / "),
      _ordem: u.created_at,
    };
  })
  .sort((a, b) => (a._ordem < b._ordem ? 1 : -1));

const iCsv = process.argv.indexOf("--csv");
if (iCsv !== -1) {
  const destino = process.argv[iCsv + 1];
  if (!destino) { console.error("✗ --csv precisa de um caminho: npm run leads -- --csv leads.csv"); process.exit(1); }
  const cols = ["quando", "estado", "negocio", "email", "whatsapp", "plano", "vertical", "campanha"];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  writeFileSync(destino, [cols.join(","), ...leads.map((l) => cols.map((c) => esc(l[c])).join(","))].join("\n"));
  console.log(`✓ ${leads.length} leads em ${destino}. ⚠️ dado pessoal: não deixe em pasta compartilhada.`);
} else {
  const pendentes = leads.filter((l) => !l.estado.startsWith("pagou")).length;
  console.log(`\n${leads.length} cadastros pelo funil · ${pendentes} sem pagamento\n`);
  for (const l of leads) {
    console.log(`${l.quando}  ${l.estado.toUpperCase()}`);
    console.log(`  ${l.negocio || "(sem negócio)"} · ${l.email} · ${l.whatsapp || "sem WhatsApp"} · ${l.plano}${l.vertical ? ` · ${l.vertical}` : ""}`);
    if (l.campanha) console.log(`  campanha: ${l.campanha}`);
  }
  if (leads.some((l) => l.estado === "travou no e-mail")) {
    console.log("\n⚠️ \"travou no e-mail\" = o Supabase está pedindo confirmação de e-mail, e quem não");
    console.log("   confirma nunca vê o Pix. Desligue em Authentication → Sign In / Providers → Email.");
  }
}
