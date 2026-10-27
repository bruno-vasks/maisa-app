import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DE LEMBRETES — a única rota do app que não tem gente do outro lado.
//
// POST /api/rotinas/lembretes  →  { enviados, falhas: [...] }
//
// Manda o lembrete dos atendimentos que começam nas próximas 3 horas e ainda não
// receberam. Idempotente por construção: quem reserva a linha é o banco, num passo só
// (`reservar_lembretes()` em `010_lembretes.sql`), então chamar duas vezes seguidas não
// manda nada duas vezes.
//
// ── AUTENTICAÇÃO POR SEGREDO, E NÃO POR SESSÃO ──
//
// Quem chama é um agendador — não há cookie, não há usuário, não há inquilino. Reusa
// `ROTINAS_SECRET` (ou, na falta dele, `WHATSAPP_WEBHOOK_SECRET`), o mesmo esquema de
// `/api/whatsapp/conexao`.
//
// ⚠️ FALHA FECHADA: sem segredo configurado, a rota responde 401 e nunca roda. Uma rotina
// que manda WhatsApp para a base inteira de clientes de todos os inquilinos não pode
// ficar aberta porque alguém esqueceu de configurar uma variável. O custo de errar para
// o lado do 401 é um lembrete não enviado; para o outro lado, é qualquer um na internet
// disparando mensagem em nome de todos os negócios.
//
// ── POR QUE `POST` ──
//
// Ela ESCREVE — marca linha e manda mensagem. Um `GET` seria mais fácil de pendurar em
// agendador de brinquedo e mais fácil de disparar sem querer: um prefetch de navegador,
// um crawler ou uma extensão que segue links mandaria lembrete para clientes de verdade.
//
// ── O AGENDADOR ──
//
// A Vercel neste projeto é plano Hobby, onde cron roda UMA VEZ POR DIA — inútil para uma
// janela de 3h. O gatilho, portanto, é externo: `pg_cron` + `pg_net` no próprio Supabase
// (recomendado — o dado já está lá e não custa nada), ou qualquer agendador que faça um
// POST a cada 15 minutos.
//
// A frequência não precisa ser precisa. A janela é de 3 horas e a reserva é atômica:
// rodar de 15 em 15 minutos, ou de hora em hora, muda só quanto antes o lembrete sai
// dentro dessa janela — nunca se manda duas vezes, e um tique perdido é recuperado no
// seguinte.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Cada lembrete é uma chamada de rede, e desde 27/10/2026 eles saem espaçados (ver o ritmo
 * "rotina" em `canal-evolution.ts`). Estourar no meio deixa lembretes reservados sem terem
 * saído, e eles só voltam se a devolução tiver rodado, o que não acontece se a função
 * morreu. Por isso a rodada para sozinha antes: ver `TEMPO_DA_RODADA_MS` em
 * `aplicacao/lembretes.ts`. */
export const maxDuration = 60;

const SEGREDO = (process.env.ROTINAS_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || "").trim();

function autorizado(request: Request): boolean {
  if (!SEGREDO) return false;
  const enviado =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return enviado === SEGREDO;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });
  }

  try {
    /* `agora` vem daqui, e não de dentro do caso de uso, porque é o que torna a rotina
     * testável sem esperar três horas — e o que permitiria, um dia, reprocessar uma
     * janela perdida sem mexer no relógio da máquina. */
    const r = await app.enviarLembretes(new Date());

    /* As falhas voltam no CORPO, com 200, e não como erro: a rodada funcionou. Um
     * inquilino com o WhatsApp desconectado é informação de operação, não falha da
     * rotina — devolver 500 faria o agendador registrar erro e mascararia o dia em que a
     * rotina quebrar de verdade. */
    if (r.falhas.length) {
      console.warn(`[rotinas/lembretes] ${r.enviados} enviados, ${r.falhas.length} falharam:`,
        r.falhas.map((f) => `${f.tenantId}/${f.atendimentoId}: ${f.motivo}`).join(" | "));
    }

    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("lembretes", e);
  }
}
