import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// EMITIR UM RECIBO — um pagamento, um documento, agora.
//
// POST /api/recibos/emitir  { fonte, id }  →  { ok: true, ...ReciboLancado }
//
// ── ★ POR QUE ELA RECEBE DOIS CAMPOS, E NENHUM DELES É DINHEIRO ──
//
// `fonte` e `id` apontam QUAL pagamento. Valor, CPF, data e descrição saem do banco, dentro da
// mesma transação que tranca o pagamento. Não é preciosismo: até 17/08/2026 a `/api/nf/emitir`
// aceitava `valor` e `tomador` do corpo, e com isso um POST forjado emitia documento fiscal de
// qualquer valor para qualquer CPF, sob o CNPJ do dono.
//
// Tela aberta há dez minutos manda total velho. Total velho aqui viraria recibo de valor errado —
// e recibo errado só se conserta cancelando, um por um, em dez dias (art. 7º da IN RFB
// 2.240/2024).
//
// ── ⚠️ 200 AQUI NÃO QUER DIZER "EMITIDO" ──
//
// Quer dizer "o canal aceitou o pedido". A emissão é assíncrona em todo canal conhecido: o
// desfecho chega depois, em `/api/recibos/callback`. A resposta traz `situacao: "pendente"`, e a
// tela **não pode** escrever "emitido" em cima disso — prometeria um documento que talvez não
// exista.
//
// ── ⚠️ `exigirSessao`, E NÃO `sessaoOuDemo` COMO OS `/api/nf/*` ──
//
// Aqui se emite documento fiscal no CPF de uma pessoa física. Um inquilino de demonstração
// respondendo isto seria uma rota que emite recibo sem login.
//
// ── O QUE NÃO ESTÁ AQUI ──
//
// Nenhuma decisão. Qual canal, se o negócio emite recibo ou nota, se o CPF é válido, se o
// pagamento já saiu — tudo isso é `EmitirRecibo`, no núcleo, com teste. Esta rota autentica,
// converte JSON e chama.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo_invalido" }, { status: 400 });
  }

  /* Um recibo de uma sessão (`{ fonte, id }`) ou de várias (`{ itens: [{ fonte, id }, …] }`), desde
   * 01/10/2026: um recibo por mês. Se as várias podem ir juntas (mesma pessoa, pagador e mês) é
   * regra, e quem decide é o caso de uso. */
  const brutos: unknown[] = Array.isArray(corpo?.itens) ? corpo.itens : [corpo];
  const itens = brutos.map((x) => {
    const o = (x ?? {}) as { fonte?: unknown; id?: unknown };
    return { fonte: o.fonte, id: typeof o.id === "string" ? o.id.trim() : "" };
  });

  /* Valida a FORMA aqui — é tradução, não regra. `fonte` fora do par conhecido não é "dado de
   * negócio inválido", é corpo torto: deixar passar faria a função do banco levantar exceção
   * de SQL, que na tela do dono não quer dizer nada. */
  if (!itens.length || itens.some((x) => (x.fonte !== "atendimento" && x.fonte !== "avulso") || !x.id)) {
    return NextResponse.json(
      { ok: false, erro: "corpo_invalido", detalhe: "Informe `fonte` ('atendimento' ou 'avulso') e `id`, ou `itens` com eles." },
      { status: 400 },
    );
  }

  try {
    const validos = itens as { fonte: "atendimento" | "avulso"; id: string }[];
    const r = await app.emitirRecibo(porteiro.tenant, validos.length === 1 ? validos[0] : { itens: validos });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    /* `falha` já traduz `DadoInvalido` em 400 com o campo, e `NaoConfigurado` em 400 com a lista
     * do que falta no ambiente. Ver `entrada/http/respostas.ts` — a rota não decide status. */
    return falha("recibos/emitir", e);
  }
}
