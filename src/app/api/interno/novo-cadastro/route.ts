import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { falha } from "@/adaptadores/entrada/http/respostas";
import { segredoConfere } from "@/adaptadores/entrada/http/segredo";

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DE CADASTRO NOVO — o banco avisa o app que uma conta nasceu (22/10/2026).
//
// POST /api/interno/novo-cadastro   { "id": "<uuid da conta em auth.users>" }
//   → 200 { ok, status: "enviado" | "ja_avisado" | "conta_inexistente", enviados, falhas }
//
// Quem chama é o trigger `after insert on auth.users` da `supabase/035_aviso_de_cadastro.sql`,
// pelo `pg_net`, com o mesmo segredo do Vault que o cron dos lembretes usa. O caso de uso relê a
// conta e manda o e-mail ao Bruno (`AvisarNovoCadastro`).
//
// ── ★ POR QUE UM TRIGGER NO BANCO, E NÃO O NAVEGADOR AVISANDO ──
//
//   · pega TODOS os caminhos de cadastro: `/assinar?teste=1`, `/assinar` com Pix, `/cadastro`,
//     o botão do Google, conta criada no painel do Supabase, e os que vierem — sem ninguém
//     lembrar de chamar nada. Inclusive o `signUp` que volta SEM sessão quando a confirmação de
//     e-mail está ligada: a linha em `auth.users` nasce do mesmo jeito, e o e-mail já foi ganho;
//   · não abre rota pública. Um "me avise do meu cadastro" chamado pelo navegador teria de aceitar
//     qualquer um, e qualquer um poderia encher a caixa do Bruno. Esta exige segredo.
//
// ── AUTENTICAÇÃO ──
//
// `ROTINAS_SECRET` (ou, na falta dele, `WHATSAPP_WEBHOOK_SECRET`), exatamente como
// `/api/rotinas/lembretes`: é o valor que mora no Vault como `maisa_rotinas_secret`, e o trigger
// o manda no header `apikey`. Comparado em tempo constante (`entrada/http/segredo.ts`).
// ⚠️ FALHA FECHADA: sem segredo no ambiente, 401 sempre.
//
// ── ⚠️ DO CORPO, SÓ O `id` ──
//
// Nada do pedido além do id da conta chega ao caso de uso: e-mail, metadata e nome do negócio são
// relidos do banco pelo servidor, e o destinatário é fixo da configuração. Não há `tenantId` aqui
// (a conta ainda não tem negócio) — ver a quinta exceção em `portas/entrada/casos-de-uso.ts`.
//
// ── OS STATUS, E POR QUE `ja_avisado` E `conta_inexistente` SÃO 200 ──
//
// A resposta vai parar em `net._http_response`, e é lá que se investiga. 200 com o status dentro
// quer dizer "a rota funcionou e decidiu isto"; erro (502) quer dizer "nenhum e-mail saiu, olhe o
// log", e é só nesse caso que vale disparar de novo (`select public.avisar_novo_cadastro('<id>')`).
// O `pg_net` não reentrega sozinho, então o status de erro não cria loop nenhum.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEGREDOS = [process.env.ROTINAS_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || ""];

export async function POST(request: Request) {
  if (!segredoConfere(request, SEGREDOS)) {
    return NextResponse.json({ ok: false, status: "nao_autorizado" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof corpo?.id === "string" ? corpo.id : "";

  try {
    const r = await app.avisarNovoCadastro(id, new Date());
    if (r.falhas.length) {
      console.warn(`[interno/novo-cadastro] ${r.enviados} enviados, ${r.falhas.length} falharam: ${r.falhas.join(" | ")}`);
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return falha("interno/novo-cadastro", e);
  }
}
