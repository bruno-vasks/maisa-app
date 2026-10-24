import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
import { assinarPedido } from "@/adaptadores/entrada/http/pedido-de-teste";
import { hojeISO } from "@/nucleo/dominio/tempo";

/* ─────────────────────────────────────────────────────────────────────────────
 * POST /api/teste/pedido — o link de liberação que vai na mensagem do WhatsApp (09/10/2026).
 *
 * Quem chama é quem está na `/pagar` e quer testar antes. O negócio sai da SESSÃO, como em toda
 * rota; o que sai daqui é um pedido assinado que a equipe abre em `/liberar/<pedido>`. Não muda
 * nada no banco: pedir não libera, e quem decide é a conversa. Ver `entrada/http/pedido-de-teste.ts`.
 *
 * Devolve também o nome do negócio, que a mensagem leva para a equipe saber com quem fala.
 * ────────────────────────────────────────────────────────────────────────────── */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  const pedido = assinarPedido(porteiro.tenant.tenantId);
  if (!pedido) {
    return NextResponse.json(
      { ok: false, status: "nao_configurado", faltando: ["SUPABASE_SERVICE_ROLE_KEY"] },
      { status: 400 },
    );
  }

  try {
    const { negocio } = await app.lerSituacaoDoTeste(porteiro.tenant, hojeISO());
    /* A origem do pedido, e não `MAISA_PUBLIC_URL`, pelo motivo de `api/assinatura`: quem testa
     * localmente seria jogado para o app publicado, onde o pedido não abre nada. */
    const link = `${new URL(req.url).origin}/liberar/${pedido}`;
    return NextResponse.json({ ok: true, status: "ok", negocio, link });
  } catch (e) {
    return falha("teste", e);
  }
}
