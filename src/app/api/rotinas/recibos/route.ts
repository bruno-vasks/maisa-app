import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";
import { hojeISO } from "@/nucleo/dominio/tempo";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DO RECIBO AUTOMÁTICO — o dia de cada paciente (01/10/2026, a Regina).
//
// GET  /api/rotinas/recibos  →  { pacientes, emitidos, semCpf, adiados, falhas }   (o cron da Vercel)
// POST /api/rotinas/recibos  →  idem                                               (à mão)
//
// Emite, para cada pessoa cujo dia de recibo é hoje (ou foi nos dois dias anteriores), os
// recibos das sessões dela anteriores a esse dia que ainda não têm. As regras de quem e quando
// estão em `aplicacao/recibo-automatico.ts`; esta rota só autentica e chama.
//
// ── POR QUE GET, COMO A DE COBRANÇA ──
//
// Quem chama é o cron da Vercel, uma vez por dia, e ele só sabe fazer GET. O risco que fez a
// rota de lembretes recusar GET (um prefetch disparando efeito) não existe sem o segredo, e o
// segredo é exigido igual.
//
// ── AUTENTICAÇÃO ──
//
// `Authorization: Bearer $CRON_SECRET` (a Vercel manda sozinha) ou o `ROTINAS_SECRET` das outras
// rotinas, para rodar à mão com `curl`. ⚠️ FALHA FECHADA: sem nenhum dos dois configurado, 401
// sempre. Esta rota emite documento fiscal no CPF de profissionais; aberta por esquecimento, ela
// seria um botão de "emitir o mês de todo mundo" na internet.
//
// ── O QUE ELA NÃO FAZ ──
//
// Não manda mensagem. Quem avisa o paciente (ou a dona, no "primeiro para mim") é o callback do
// canal, quando a Receita confirma o recibo. Ver `criarFecharReciboDoCallback`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Cada recibo é uma ida ao canal; a rodada para de emitir em 45s (`TETO_DA_RODADA_MS`) e deixa o
 * resto `adiado` para amanhã, dentro da folga de dias. 60 é o teto da função no plano Hobby. */
export const maxDuration = 60;

const SEGREDOS = [process.env.CRON_SECRET, process.env.ROTINAS_SECRET]
  .map((v) => (v ?? "").trim())
  .filter(Boolean);

function autorizado(request: Request): boolean {
  if (!SEGREDOS.length) return false;
  const enviado =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return SEGREDOS.includes(enviado);
}

async function rodar(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });
  }

  try {
    const r = await app.emitirRecibosAutomaticos(hojeISO());

    /* Falha de um negócio volta no CORPO, com 200: a rodada funcionou. Mesmo critério das outras
     * rotinas, para o cron só registrar erro no dia em que a rotina quebrar de verdade. */
    console.info(`[rotinas/recibos] ${r.pacientes} pacientes, ${r.emitidos} recibos pedidos, ${r.semCpf} sem CPF, ${r.adiados} adiados, ${r.falhas.length} falhas`
      + (r.falhas.length ? `: ${r.falhas.map((f) => `${f.tenantId}: ${f.motivo}`).join(" | ")}` : ""));

    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("rotinas/recibos", e);
  }
}

export const GET = rodar;
export const POST = rodar;
