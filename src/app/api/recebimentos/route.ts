import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// OS RECEBIMENTOS — o negócio recebendo do cliente pelo Pix na chave de sempre (27/10/2026).
//
// GET /api/recebimentos  → { config, faltando, paraDecidir, abertos, comprovantes, recebidos }
// PUT /api/recebimentos  → { tipoDaChave, chave, nome, cidade, depoisDoAtendimento } → a config salva
//
// As ações ficam nas rotas irmãs: `pix` (mandar o Pix de um atendimento), `decidir` (a resposta
// à pergunta "já está pago?") e `comprovante` (confirmar ou descartar o que o cliente mandou).
// Ver `aplicacao/recebimentos.ts`.
//
// ⚠️ `exigirSessao`: o corpo é quem pagou, quanto e para qual chave. Inquilino de demonstração
// não responde isso.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const painel = await app.lerRecebimentos(porteiro.tenant);
    return NextResponse.json({ ok: true, status: "ok", ...painel });
  } catch (e) {
    return falha("recebimentos", e);
  }
}

export async function PUT(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const corpo = await req.json().catch(() => ({}));
    const texto = (v: unknown) => (typeof v === "string" ? v : null);
    const config = await app.salvarConfigDeRecebimentos(porteiro.tenant, {
      tipoDaChave: texto(corpo?.tipoDaChave),
      chave: texto(corpo?.chave),
      nome: texto(corpo?.nome),
      cidade: texto(corpo?.cidade),
      depoisDoAtendimento: texto(corpo?.depoisDoAtendimento) ?? "",
    });
    return NextResponse.json({ ok: true, status: "ok", config });
  } catch (e) {
    return falha("recebimentos", e);
  }
}
