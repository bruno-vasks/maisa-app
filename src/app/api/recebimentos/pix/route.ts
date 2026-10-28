import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// MANDAR PIX — o botão do atendimento (27/10/2026).
//
// POST /api/recebimentos/pix  { atendimentoId }  →  { recebimento }
//
// Cria a cobrança daquele atendimento e manda o Pix pela fila de envios. Se ele já estava
// perguntando ao dono, vira Pix; se o Pix já tinha ido, manda o mesmo de novo (o cliente pediu o
// código outra vez). O valor sai do banco, nunca do corpo. Ver `aplicacao/recebimentos.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const corpo = await req.json().catch(() => ({}));
    const recebimento = await app.mandarPix(porteiro.tenant, { atendimentoId: String(corpo?.atendimentoId ?? "") });
    return NextResponse.json({ ok: true, status: "ok", recebimento });
  } catch (e) {
    return falha("recebimentos/pix", e);
  }
}
