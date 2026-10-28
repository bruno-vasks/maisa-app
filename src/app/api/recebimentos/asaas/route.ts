import { NextResponse } from "next/server";
import { app, negocioDoAvisoDePagamento } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DE PAGAMENTO DO ASAAS — a baixa sozinha da opção B (27/10/2026).
//
// POST /api/recebimentos/asaas   (cabeçalho `asaas-access-token`)  →  { ok, status }
//
// Quem chama é o servidor do Asaas, sem sessão. O NEGÓCIO SAI DO TOKEN: cada subconta tem o seu,
// sorteado na abertura, e o banco guarda só o hash (`negocioDoAvisoDePagamento`). O corpo só diz
// QUAL cobrança; nunca de quem é. Token desconhecido é 401.
//
// ⚠️ A FILA DE AVISOS DO ASAAS É SEQUENCIAL: enquanto um aviso não recebe 200, o próximo não vem, e
// depois de várias falhas a fila da conta para. Então tudo o que é decisão nossa (evento que não
// importa, cobrança que já estava paga, cobrança de outro lugar) responde 200 com o motivo; só a
// falha de infraestrutura (banco fora) responde erro, para valer a reentrega. Lição do Smiller.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* O pagamento confirmado põe a confirmação na fila de envios, que sai em segundo plano depois da
 * resposta. Mesmo teto das outras rotas que enfileiram. */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const token = (request.headers.get("asaas-access-token") ?? "").trim();
    const tenantId = await negocioDoAvisoDePagamento(token);
    if (!tenantId) return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });

    const corpo = await request.json().catch(() => null);
    const t: ContextoTenant = { tenantId, usuarioId: "", ator: { tipo: "sistema", rotina: "asaas" } };
    const r = await app.receberAvisoDePagamento(t, corpo);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return falha("recebimentos/asaas", e);
  }
}
