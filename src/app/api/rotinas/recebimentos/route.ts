import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DOS RECEBIMENTOS (27/10/2026) — irmã da fila de envios.
//
// POST /api/rotinas/recebimentos  →  { negocios, pix, perguntas, falhas }
//
// De 5 em 5 minutos, pelo `pg_cron` da 038: o atendimento que acabou vira cobrança (pergunta ao
// dono ou Pix direto), quem paga "por mês" ganha o Pix do mês no dia do recibo, e a próxima
// pergunta "já está pago?" vai ao WhatsApp do dono. Tudo entra na fila de envios, e a fila de
// cada negócio começa a sair em segundo plano. Ver `aplicacao/recebimentos.ts`.
//
// Mesmo esquema das outras rotinas: autenticada por `ROTINAS_SECRET` (ou, na falta dele,
// `WHATSAPP_WEBHOOK_SECRET`), FALHA FECHADA sem segredo, e `POST` porque escreve e manda
// mensagem. Duas chamadas ao mesmo tempo não cobram duas vezes: um atendimento entra em uma
// cobrança só, e quem decide é o banco.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A varredura é curta; o que demora é a fila, que sai em segundo plano depois da resposta e para
 * aos 240 s (`TEMPO_DA_RODADA_MS`). 300 é o teto do Hobby com Fluid compute (`vercel.json`). */
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
    const r = await app.cobrarAtendimentos(new Date());
    /* Um negócio que falhou é informação de operação, não falha da rotina: 200, com a lista. */
    if (r.falhas.length) {
      console.warn(`[rotinas/recebimentos] ${r.falhas.length} negócio(s) com falha: ${r.falhas.map((f) => `${f.tenantId}: ${f.motivo}`).join(" | ")}`);
    }
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("recebimentos", e);
  }
}
