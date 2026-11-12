import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// OS PAGAMENTOS DO PRÓXIMO ARQUIVO — e o lançamento do que a agenda não pegou.
//
// GET    /api/recibos   → { pagamentos, total, semCpf }   o que vai no arquivo
// POST   /api/recibos   → { …pagamento }                  lança um avulso
// DELETE /api/recibos?id=…                                apaga um avulso
// DELETE /api/recibos?id=…&fonte=atendimento → { tirou, maisaAg }
//                                                          a sessão não aconteceu: sai do recibo
//                                                          (12/11/2026, a Regina; `tirarDoRecibo`)
//
// ── ★ POR QUE ESTA ROTA EXISTE ──
//
// A MAISA cobre a maioria dos pagamentos, não todos: sessão marcada por fora, pacote pago
// adiantado, paciente que voltou depois de meses. O recibo é obrigatório do mesmo jeito — e a
// unidade do arquivo do Receita Saúde sempre foi o PAGAMENTO, não o atendimento.
//
// O `GET` existe para o lançamento ser VISÍVEL. Sem ele, digitar um pagamento era um
// formulário que engolia o dado: nada mudava na tela até gerar o arquivo.
//
// ⚠️ `exigirSessao`, como as outras rotas de recibo: a resposta é uma lista de CPFs de
// pacientes com valores de sessão. É o dado mais sensível que este app produz.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const r = await app.lerRecibosPendentes(porteiro.tenant);
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("recibos", e);
  }
}

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const c = await req.json().catch(() => ({}));
    const pagamento = await app.lancarPagamentoAvulso(porteiro.tenant, {
      data: String(c?.data ?? ""),
      /* `Number` e não `parseFloat`: "12,50" vira NaN aqui em vez de 12 — e o caso de uso
       * recusa NaN com "o valor precisa ser maior que zero". Silenciar a vírgula gravaria
       * doze reais num recibo de doze e cinquenta. */
      valor: Number(c?.valor),
      nome: String(c?.nome ?? ""),
      cpf: String(c?.cpf ?? ""),
      cpfPagador: typeof c?.cpfPagador === "string" ? c.cpfPagador : null,
      clienteId: typeof c?.clienteId === "string" ? c.clienteId : null,
      observacao: typeof c?.observacao === "string" ? c.observacao : null,
    });
    return NextResponse.json({ ok: true, status: "ok", pagamento });
  } catch (e) {
    return falha("recibos", e);
  }
}

export async function DELETE(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const q = new URL(req.url).searchParams;
    const id = q.get("id") ?? "";
    /* Sem `fonte`, o pedido antigo: apagar um avulso. Com ela, `tirarDoRecibo` decide o caminho. */
    if (!q.get("fonte")) {
      await app.excluirPagamentoAvulso(porteiro.tenant, { id });
      return NextResponse.json({ ok: true, status: "ok" });
    }
    const r = await app.tirarDoRecibo(porteiro.tenant, { id, fonte: q.get("fonte") as "atendimento" | "avulso" });
    return NextResponse.json({ ok: true, status: r.tirou ? "ok" : "ja_em_recibo", ...r });
  } catch (e) {
    return falha("recibos", e);
  }
}
