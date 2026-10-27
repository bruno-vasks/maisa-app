import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { app } from "@/composicao";
import { lerCallbackRebots } from "@/adaptadores/saida/rebots/emissor-recibo";
import { tenantDoProtocolo } from "@/adaptadores/saida/supabase/livro-de-recibos";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

// ─────────────────────────────────────────────────────────────────────────────
// O CALLBACK DO CANAL DE EMISSÃO — onde o recibo deixa de ser "pendente".
//
// POST /api/recibos/callback  →  { ok: true, desfecho }
//
// ── ⚠️ A REGRA QUE A DOC DELES IMPÕE: GRAVAR ANTES DE RESPONDER 200 ──
//
// A Rebots diz, textualmente, que depois da nossa confirmação o dado é descartado — "will be
// discarded and cannot be recovered". E a API deles **não tem endpoint de consulta**: nove
// endpoints no OpenAPI, nenhum GET.
//
// Somados, os dois fatos têm uma consequência afiada: **um 200 nosso sem gravação apaga a única
// cópia do desfecho que existe no mundo.** A linha fica `pendente` para sempre, o pagamento
// segue trancado, e não há a quem perguntar — só olhando o e-CAC.
//
// Daí o desenho: grava primeiro, responde 200 depois. Qualquer falha de gravação responde
// **erro**, para o canal reentregar. Um 500 aqui é barato; um 200 mentiroso não tem desfazer.
//
// ── ★ ESTA ROTA NÃO DECIDE MAIS NADA, E É POR ISSO QUE OS BUGS APARECERAM ──
//
// Até 25/08/2026 ela gravava o desfecho e, se fosse recusa, soltava o pagamento. Isso é regra de
// negócio — "recusa reabre a porta da cascata" — dentro de um `route.ts`, onde nenhum teste de
// domínio chega. Foi ali que três defeitos moraram sem ninguém ver: o corpo lido fora do
// envelope `data`, o cancelamento gravado como emissão, e a URL do PDF tratada como se durasse
// dois dias quando dura cinco minutos.
//
// Agora ela faz o que rota faz: autentica, traduz, descobre o inquilino, chama o caso de uso.
//
// ── AUTENTICAÇÃO POR SEGREDO, E FALHA FECHADA ──
//
// Quem chama é o servidor do canal — não há cookie, não há usuário. Reusa o mesmo esquema de
// `/api/rotinas/lembretes`: `RECIBOS_CALLBACK_SECRET`, com queda para `ROTINAS_SECRET`.
//
// ⚠️ Sem segredo configurado, responde 401 e nunca roda. O custo de errar para o lado do 401 é
// um callback reentregue; para o outro lado, é qualquer um na internet marcando recibos como
// emitidos — e "emitido" é o estado do qual o pagamento nunca mais volta para a lista.
//
// ⚠️ E O SEGREDO PESA MAIS DESDE A MIGRAÇÃO 023. O protocolo era um uuid v4; agora é inteiro
// sequencial, porque o `receipt_id` da Rebots é `int`. Ele ficou **enumerável**: quem tiver o
// segredo não precisa mais adivinhar nada. O segredo é a única defesa que sobrou aqui.
//
// ── ⚠️ O `tenantId` NÃO VEM DO CORPO, E ISSO NÃO É NEGOCIÁVEL ──
//
// Ele nasce de `tenantDoProtocolo()`, que é dado durável nosso — mesma mecânica de
// `integracoes_whatsapp.instancia` no webhook do WhatsApp. Protocolo desconhecido é 404, não
// 500 — POST com corpo torto é ruído, não incidente.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* O aviso ao paciente sai pela fila de envios, drenada em segundo plano depois da resposta
 * (ver o fim do POST). 300 s é o teto do Hobby com Fluid compute (`vercel.json`); a drenagem
 * para aos 240 s e o resto sai pela rotina. */
export const maxDuration = 300;

const SEGREDO = (process.env.RECIBOS_CALLBACK_SECRET || process.env.ROTINAS_SECRET || "").trim();

function autorizado(request: Request): boolean {
  if (!SEGREDO) return false;
  const enviado =
    request.headers.get("apikey")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return enviado.trim() === SEGREDO;
}

/**
 * O ator do callback. Não é usuário nem agente: ninguém clicou, e a IA não escreveu.
 *
 * `usuarioId` vazio de propósito — pôr o dono aqui faria a auditoria dizer que ele marcou o
 * recibo como emitido, e ele estava dormindo. É o mesmo `contextoDeSistema` da rotina de
 * lembretes, e é ele que faz `contexto-cliente.ts` escolher a service role.
 */
const contextoDeSistema = (tenantId: string): ContextoTenant => ({
  tenantId,
  usuarioId: "",
  ator: { tipo: "sistema", rotina: "recibo-callback" },
});

/**
 * O aviso ao paciente, quando há, foi para a fila de envios (27/10/2026): ela começa a sair
 * depois desta resposta, espaçada dos outros retornos que chegam juntos. Fila vazia responde
 * na hora.
 *
 * ⚠️ NUNCA LANÇA. O desfecho já está gravado quando isto roda; um erro aqui virando 500 faria a
 * Rebots reentregar um retorno que não precisa de nada.
 */
function drenarDepois(t: ContextoTenant): void {
  try {
    waitUntil(app.drenarFilaDoNegocio(t).catch((e) => console.error("[recibos/callback] drenar a fila", e)));
  } catch (e) {
    console.error("[recibos/callback] drenar a fila", e);
  }
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  }

  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    /* Corpo ilegível: 400 e pronto. Reentregar não vai consertar JSON quebrado. */
    return NextResponse.json({ ok: false, erro: "corpo_invalido" }, { status: 400 });
  }

  /* A tradução do vocabulário do fornecedor mora no adaptador dele, não aqui. Esta rota não
   * conhece `success`, `key`, `file_url` nem o envelope `data` — ver `lerCallbackRebots`. */
  const leitura = lerCallbackRebots(corpo);

  if (leitura.tipo === "ilegivel") {
    return NextResponse.json({ ok: false, erro: "sem_receipt_id" }, { status: 400 });
  }

  /* ⚠️ `pending` É 200, E ISSO É O CONSERTO DE UM BUG DE VERDADE. O canal documenta `pending`
   * como estado de callback: "na fila de processamento". Não há o que gravar — a linha já é
   * `pendente`. As duas alternativas seriam piores: 400 faria o canal reentregar um aviso que
   * chegou bem, e tratar como recusa liberaria a cascata e emitiria o segundo recibo. */
  if (leitura.tipo === "pendente") {
    return NextResponse.json({ ok: true, desfecho: "ainda_pendente" });
  }

  const desfecho = leitura.desfecho;

  const tenantId = await tenantDoProtocolo({ canal: "rebots", protocolo: desfecho.protocolo });
  if (!tenantId) {
    /* 404 e não 500: protocolo que não existe é ruído, tentativa de terceiro, ou reentrega de
     * algo já apagado. Nada disso é incidente nosso.
     *
     * ⚠️ Mas `tenantDoProtocolo` também devolve `null` em falha de banco, de propósito — e aí
     * 404 é a resposta errada, porque o canal não vai reentregar. É dívida declarada: distinguir
     * as duas exigiria a função devolver um tipo soma, e o custo hoje é um callback perdido num
     * cenário em que o banco está fora do ar (quando a emissão já teria falhado antes). */
    return NextResponse.json({ ok: false, erro: "protocolo_desconhecido" }, { status: 404 });
  }

  try {
    /* ── O CASO DE USO GRAVA ANTES DE A GENTE RESPONDER 200. Ver o cabeçalho. ── */
    const t = contextoDeSistema(tenantId);
    const r = await app.fecharReciboDoCallback(t, desfecho);
    drenarDepois(t);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    /* ⚠️ 500 DE PROPÓSITO, e é o ponto inteiro desta rota. Falhou a gravação: se respondermos
     * 200, eles descartam o desfecho e ele deixa de existir. Um 500 pede reentrega. */
    return NextResponse.json(
      { ok: false, erro: "falha_ao_gravar", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
