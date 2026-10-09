import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrouEquipe, contextoDoPedido, exigirEquipe } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
import { hojeISO } from "@/nucleo/dominio/tempo";

/* ─────────────────────────────────────────────────────────────────────────────
 * /api/teste/liberar — a equipe abre o teste de quem pediu pelo WhatsApp (09/10/2026).
 *
 *   GET  ?pedido=…   o que a tela mostra antes do clique: nome do negócio e situação
 *   POST { pedido }  libera `DIAS_DO_TESTE_LIBERADO` dias
 *
 * Duas portas, as duas em `entrada/http/contexto.ts`: o clique é de alguém da equipe
 * (`MAISA_EQUIPE`), e o negócio vem de um pedido assinado por nós. Um pedido torto ou de outra
 * chave é 400, sem dizer qual das duas coisas falhou.
 *
 * ⚠️ LIBERAR É POST, E SÓ POST. O link vai numa mensagem de WhatsApp, e o WhatsApp abre o link
 * sozinho para montar a pré-visualização. Se o GET liberasse, a pré-visualização liberaria o teste
 * antes de qualquer conversa.
 * ────────────────────────────────────────────────────────────────────────────── */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pedidoInvalido = () =>
  NextResponse.json(
    { ok: false, status: "pedido_invalido", info: "Este link de teste não vale: veio cortado, é antigo ou é de outro ambiente." },
    { status: 400 },
  );

export async function GET(req: Request) {
  const porteiro = await exigirEquipe();
  if (barrouEquipe(porteiro)) return porteiro.barrado;

  const t = contextoDoPedido(new URL(req.url).searchParams.get("pedido"), porteiro.equipe);
  if (!t) return pedidoInvalido();

  try {
    return NextResponse.json({ ok: true, status: "ok", ...(await app.lerSituacaoDoTeste(t, hojeISO())) });
  } catch (e) {
    return falha("teste", e);
  }
}

export async function POST(req: Request) {
  const porteiro = await exigirEquipe();
  if (barrouEquipe(porteiro)) return porteiro.barrado;

  let corpo: { pedido?: unknown };
  try {
    corpo = (await req.json()) as { pedido?: unknown };
  } catch {
    return NextResponse.json({ ok: false, status: "payload_invalido", info: "Corpo não é JSON." }, { status: 400 });
  }

  const t = contextoDoPedido(typeof corpo.pedido === "string" ? corpo.pedido : null, porteiro.equipe);
  if (!t) return pedidoInvalido();

  try {
    return NextResponse.json({ ok: true, status: "ok", ...(await app.liberarTeste(t, hojeISO())) });
  } catch (e) {
    return falha("teste", e);
  }
}
