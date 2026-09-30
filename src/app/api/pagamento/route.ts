import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, sessaoOuDemo } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// O PIX DA TELA `/pagar` — o QR Code, o copia-e-cola e se já foi pago (30/09/2026).
//
// GET /api/pagamento?id=pix_char_…  →  { pagamento }   (404 se não existe OU não é seu)
//
// A tela chama isto a cada poucos segundos enquanto o Pix está pendente. Cada chamada relê
// o Pix na AbacatePay: o status que a tela mostra é o do provedor, não um cache nosso.
//
// ⚠️ ESTA ROTA NÃO CREDITA NADA. Quem soma o mês é o webhook, relendo o mesmo Pix com a mesma
// chave. Duas escritas em `assinaturas` — uma aqui, na sessão do usuário, e outra no webhook
// — seriam o fim da garantia de "dono nenhum se dá desconto" (`003_rls.sql` §3.4). A tela diz
// "pago" quando a AbacatePay diz; o plano libera quando o webhook grava, segundos depois.
//
// O `id` vem da query, e é o que está sendo PERGUNTADO — não o inquilino, que continua saindo
// da sessão. Quem garante que o Pix é deste negócio é o adaptador, pelo carimbo relido.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  const id = new URL(req.url).searchParams.get("id") ?? "";

  try {
    const pagamento = await app.lerPagamento(porteiro.tenant, id);
    if (!pagamento) {
      return NextResponse.json({ ok: false, status: "nao_encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: "ok", pagamento });
  } catch (e) {
    return falha("pagamento", e);
  }
}
