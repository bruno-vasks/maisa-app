import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
import type { DecisaoSobreRecebimento } from "@/nucleo/portas/entrada/casos-de-uso";

// ─────────────────────────────────────────────────────────────────────────────
// A RESPOSTA À PERGUNTA "JÁ ESTÁ PAGO?" — pelo painel (27/10/2026).
//
// POST /api/recebimentos/decidir  { id, decisao: "pagou" | "pix" | "nao_cobrar" }
//   →  { recebimento, documento }
//
// A mesma decisão que o dono dá pelo WhatsApp ("1" ou "2"). `documento` diz o que aconteceu
// depois do pagamento: recibo ou nota pedidos, CPF pedido ao cliente, nada, ou a recusa do
// emissor. Quem confere a decisão é o caso de uso.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const corpo = await req.json().catch(() => ({}));
    const r = await app.decidirRecebimento(porteiro.tenant, {
      id: String(corpo?.id ?? ""),
      decisao: String(corpo?.decisao ?? "") as DecisaoSobreRecebimento,
    });
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("recebimentos/decidir", e);
  }
}
