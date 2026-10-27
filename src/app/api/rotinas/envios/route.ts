import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DA FILA DE ENVIOS (27/10/2026) — irmã da de lembretes.
//
// POST /api/rotinas/envios  →  { enviados, adiados, desistidos }
//
// Esvazia o que estiver vencido na fila de envios, de todos os negócios: uma mensagem por vez
// por negócio, espaçadas (ver `aplicacao/fila-de-envios.ts`). Quem enfileira já dispara a
// drenagem na hora; esta rota é para o que sobrou (rodada que acabou o tempo, execução que
// morreu, falha passageira que pediu para tentar de novo).
//
// Mesmo esquema da de lembretes: chamada pelo `pg_cron` do Supabase (`037_agendar_envios.sql`,
// de 5 em 5 minutos), autenticada por `ROTINAS_SECRET` (ou, na falta dele,
// `WHATSAPP_WEBHOOK_SECRET`), FALHA FECHADA sem segredo, e `POST` porque escreve e manda
// mensagem. Duas chamadas ao mesmo tempo não mandam em dobro: a vez de cada mensagem é
// decidida no banco.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A drenagem para de mandar aos 240 s (`TEMPO_DA_RODADA_MS`) e o resto fica para o próximo
 * tique. 300 é o teto do Hobby com Fluid compute (`vercel.json`). */
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
    const r = await app.enviarFilaDeMensagens(new Date());
    /* Desistência e adiamento voltam no corpo, com 200: a rodada funcionou. Um negócio com o
     * WhatsApp desconectado é informação de operação, não falha da rotina. */
    if (r.adiados || r.desistidos) {
      console.warn(`[rotinas/envios] ${r.enviados} enviados, ${r.adiados} adiados, ${r.desistidos} desistidos`);
    }
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("envios", e);
  }
}
