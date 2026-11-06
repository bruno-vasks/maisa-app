import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DA MAISA DA MAISA (05/11/2026) — irmã da de envios.
//
// POST /api/rotinas/vendas  →  { ligada, boasVindas, lembretes, retomadas, falhas }
//
// As três mensagens automáticas do negócio da casa aos leads da maisa: boas-vindas a quem criou
// conta, um lembrete a quem travou no meio, uma retomada a quem conversou e parou de responder.
// Uma de cada por pessoa, no horário certo, pela fila de envios. A regra está em
// `aplicacao/vendas.ts`; esta rota só autentica e chama.
//
// Mesmo esquema da de envios: chamada pelo `pg_cron` do Supabase (`040_vendas_da_casa.sql`, de 10
// em 10 minutos), autenticada por `ROTINAS_SECRET` (ou, na falta dele, `WHATSAPP_WEBHOOK_SECRET`),
// FALHA FECHADA sem segredo, e `POST` porque manda mensagem. Duas chamadas ao mesmo tempo não
// mandam em dobro: cada mensagem é reservada no banco antes de entrar na fila.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Depois de enfileirar, a rota esvazia a fila da casa, que para de mandar aos 240 s. */
export const maxDuration = 300;

const SEGREDO = (process.env.ROTINAS_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || "").trim();

function autorizado(request: Request): boolean {
  if (!SEGREDO) return false;
  const enviado =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return enviado === SEGREDO;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });
  }

  try {
    const r = await app.acompanharLeads(new Date());
    if (r.falhas.length) console.warn(`[rotinas/vendas] ${r.falhas.length} falha(s): ${r.falhas.join(" | ")}`);
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("vendas", e);
  }
}
