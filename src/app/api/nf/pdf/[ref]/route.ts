import { confereAssinatura, pdfDaNota } from "@/adaptadores/saida/focus/nota-simulada";
import { documentoDaNota } from "@/adaptadores/saida/supabase/notas";

// ─────────────────────────────────────────────────────────────────────────────
// O PDF DA NOTA SIMULADA — GET /api/nf/pdf/[ref]?a=<assinatura>  →  application/pdf
//
// Existe desde 15/10/2026 para a nota que o modo `simulado` emite em homologação: a Focus
// devolve o PDF dela numa URL própria, e a simulada precisava de uma para a tela ("Baixar PDF")
// e para o aviso no WhatsApp do dono, que a Evolution baixa por URL. Ver `nota-simulada.ts`.
//
// ── AUTENTICAÇÃO POR CAPACIDADE, E FALHA FECHADA ──
//
// Quem baixa é a Evolution: sem cookie, sem usuário. O `a` é um HMAC da `ref`; sem ele, ou com
// ele errado, 404 — e 404 também para nota inexistente ou não emitida, para a resposta não
// dizer a quem não tem o link quais refs existem.
//
// ⚠️ O INQUILINO NÃO VEM DO REQUEST. `documentoDaNota` acha a nota pela `ref` e o negócio pela
// própria linha dela, como `tenantDoProtocolo` faz no callback dos recibos.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nada = () => new Response("Não encontrado.", { status: 404 });

export async function GET(request: Request, { params }: { params: { ref: string } }) {
  const ref = decodeURIComponent(params.ref ?? "");
  if (!confereAssinatura(ref, new URL(request.url).searchParams.get("a"))) return nada();

  const doc = await documentoDaNota(ref);
  if (!doc) return nada();

  const nome = `nota-fiscal-${doc.numero ?? ref}.pdf`.replace(/[^a-zA-Z0-9.-]/g, "-");
  return new Response(Buffer.from(pdfDaNota(doc)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      /* Documento com nome de pessoa: nenhum cache compartilhado guarda. */
      "Cache-Control": "private, no-store",
    },
  });
}
