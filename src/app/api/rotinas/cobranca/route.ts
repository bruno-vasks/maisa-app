import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";
import { hojeISO } from "@/nucleo/dominio/tempo";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTINA DE AVISOS DE VENCIMENTO — o pré-pago cobrando o próximo mês (29/09/2026).
//
// GET  /api/rotinas/cobranca  →  { enviados, semEmail, falhas: [...] }   (o cron da Vercel)
// POST /api/rotinas/cobranca  →  idem                                    (à mão, ou pg_cron)
//
// Manda o e-mail de quem vence daqui a 3 dias, amanhã, hoje, ou venceu ontem. As regras de
// quem e quando estão em `avisoDoDia` (`dominio/assinatura.ts`); esta rota só autentica e
// chama.
//
// ── POR QUE ESTA TEM GET, E A DE LEMBRETES NÃO ──
//
// Porque quem chama esta é o cron da Vercel, e ele só sabe fazer GET. A de lembretes precisa
// rodar de 15 em 15 minutos, o que o plano Hobby não faz, e por isso é chamada pelo `pg_cron`
// com POST. Aqui uma vez por dia basta — é o que o Hobby permite, e é a frequência certa para
// um aviso de "vence em 3 dias". O risco que fez a outra recusar GET (um prefetch disparando
// mensagem) não existe sem o segredo, e o segredo é exigido igual.
//
// ── AUTENTICAÇÃO ──
//
// A Vercel manda `Authorization: Bearer $CRON_SECRET` quando essa variável existe no projeto.
// Aceita também o `ROTINAS_SECRET` das outras rotinas, para dar para rodar à mão com `curl`.
// ⚠️ FALHA FECHADA: sem nenhum dos dois configurado, 401 sempre. Uma rotina que manda e-mail
// de cobrança para o dono de todos os negócios não fica aberta por esquecimento.
//
// ── O QUE ELA NÃO FAZ ──
//
// Não corta ninguém. O corte é derivado da data, na hora em que a mensagem do WhatsApp chega
// (`acessoDoNegocio`). Se esta rotina não rodar num dia, sai um aviso a menos — e ninguém
// ganha MAISA de graça por isso.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Um e-mail por negócio que vence, com teto de 8s cada (`correio-resend.ts`). 60s cobre
 * folgado a base de hoje; ver o LEIA-ME da Resend para quando deixar de cobrir. */
export const maxDuration = 60;

const SEGREDOS = [process.env.CRON_SECRET, process.env.ROTINAS_SECRET]
  .map((v) => (v ?? "").trim())
  .filter(Boolean);

function autorizado(request: Request): boolean {
  if (!SEGREDOS.length) return false;
  const enviado =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return SEGREDOS.includes(enviado);
}

async function rodar(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });
  }

  try {
    const r = await app.avisarVencimentos(hojeISO());

    /* Falha de envio volta no CORPO, com 200: a rodada funcionou. Mesmo critério da rotina de
     * lembretes — 500 aqui faria o cron registrar erro por um e-mail recusado, e esconderia o
     * dia em que a rotina quebrar de verdade. */
    console.info(`[rotinas/cobranca] ${r.enviados} avisos, ${r.semEmail} sem e-mail, ${r.falhas.length} falhas`
      + (r.falhas.length ? `: ${r.falhas.map((f) => `${f.tenantId}: ${f.motivo}`).join(" | ")}` : ""));

    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("rotinas/cobranca", e);
  }
}

export const GET = rodar;
export const POST = rodar;
