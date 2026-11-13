import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// PAGOU ADIANTADO — o crédito de sessões (12/11/2026, pedido da Regina).
//
// GET  /api/adiantamentos → { adiantamentos }            os créditos, com as sessões que cobrem
// POST /api/adiantamentos → { adiantamentoId, pagamento } lança o pagamento e o crédito
//
// O `pagamento` que volta é o avulso que vira o recibo, no mesmo formato de `/api/recibos`: a tela
// o emite em seguida pelo caminho de sempre (`/api/recibos/emitir`). Ver `LancarAdiantamento`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;
  try {
    const adiantamentos = await app.listarAdiantamentos(porteiro.tenant);
    return NextResponse.json({ ok: true, status: "ok", adiantamentos });
  } catch (e) {
    return falha("adiantamentos", e);
  }
}

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;
  try {
    const c = await req.json().catch(() => ({}));
    const r = await app.lancarAdiantamento(porteiro.tenant, {
      clienteId: String(c?.clienteId ?? ""),
      nome: String(c?.nome ?? ""),
      cpf: String(c?.cpf ?? ""),
      cpfPagador: typeof c?.cpfPagador === "string" ? c.cpfPagador : null,
      sessoes: Number(c?.sessoes),
      /* `Number`, e não `parseFloat`: "12,50" vira NaN e o caso de uso recusa, em vez de gravar 12. */
      valor: Number(c?.valor),
      data: String(c?.data ?? ""),
    });
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("adiantamentos", e);
  }
}
