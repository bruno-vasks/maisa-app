import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// O COMPROVANTE QUE O CLIENTE MANDOU — o dono conferiu no extrato (27/10/2026).
//
// POST /api/recebimentos/comprovante  { id, acao: "confirmar", recebimentoId? }  →  { recebimento, documento }
// POST /api/recebimentos/comprovante  { id, acao: "descartar", motivo }          →  {}
//
// Confirmar é a única baixa que existe: comprovante se falsifica, e nada vira pago só pela
// imagem. Sem `recebimentoId`, vale a cobrança que a MAISA sugeriu.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const corpo = await req.json().catch(() => ({}));
    const id = String(corpo?.id ?? "");
    /* O padrão é o INOFENSIVO: só `"confirmar"` confirma. Um corpo torto descartando um
     * pagamento de verdade seria pior que um clique a mais. */
    if (corpo?.acao === "confirmar") {
      const r = await app.confirmarComprovante(porteiro.tenant, {
        id,
        recebimentoId: typeof corpo?.recebimentoId === "string" ? corpo.recebimentoId : null,
      });
      return NextResponse.json({ ok: true, status: "ok", ...r });
    }
    await app.descartarComprovante(porteiro.tenant, { id, motivo: String(corpo?.motivo ?? "") });
    return NextResponse.json({ ok: true, status: "ok" });
  } catch (e) {
    return falha("recebimentos/comprovante", e);
  }
}
