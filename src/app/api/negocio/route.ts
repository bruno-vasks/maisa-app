import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, barrouUsuario, exigirSessao, exigirUsuario } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// CRIAR O NEGÓCIO — a rota que tira a MAISA do "rode SQL na mão".
//
// POST /api/negocio  { nome, vertical, profissional? }  →  201 { tenantId, proximoPasso }
//
// ── POR QUE ESTA É A ROTA MAIS IMPORTANTE DO PRODUTO HOJE ──
//
// Porque era o único passo do funil que exigia uma pessoa. Todo o resto — conectar
// agenda, configurar assistente, emitir nota — já era self-service; criar a conta não
// era. Um produto em que o primeiro passo depende de alguém com acesso ao Supabase não
// se vende sozinho, e o resto do funil não importa se ninguém entra nele.
//
// ── `exigirUsuario`, NÃO `exigirSessao` ──
//
// `exigirSessao` barra com 409 `sem_negocio` exatamente quem ainda não tem inquilino.
// Usá-lo aqui tornaria impossível criar o primeiro negócio de qualquer conta — a rota
// recusaria justamente seu único público. Ver o comentário em `contexto.ts`.
//
// ── O CORPO NÃO TRAZ DONO, E NÃO PODE TRAZER ──
//
// `nome`, `vertical` e `profissional` são tudo que se aceita. O dono é `auth.uid()`,
// resolvido dentro da RPC `criar_negocio()`, que é `security definer`. Acrescentar aqui
// um campo `usuarioId` ou `tenantId` seria reabrir o furo que `dominio/tenant.ts`
// descreve no cabeçalho — id de inquilino vindo por parâmetro. Se um dia for preciso
// criar negócio em nome de outra pessoa (venda assistida, migração de cliente), isso é
// outra rota, com outra autorização, e não um campo a mais nesta.
//
// 201 e não 200: criou recurso, e o `tenantId` é o endereço dele. O 409 de
// `sem_negocio` que as outras rotas devolvem some sozinho na próxima chamada — é o
// mesmo cookie, e `tenantDoUsuario` passa a achar a linha em `membros`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirUsuario();
  if (barrouUsuario(porteiro)) return porteiro.barrado;

  // JSON quebrado é erro de quem chama, não do app: 400 com nome, nunca 500.
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, status: "payload_invalido", info: "Corpo não é JSON." }, { status: 400 });
  }

  const { nome, vertical, profissional, teste } = (corpo ?? {}) as {
    nome?: unknown; vertical?: unknown; profissional?: unknown; teste?: unknown;
  };

  try {
    /* A validação de verdade (nome vazio, vertical inventada, teto) mora no caso de uso,
     * não aqui: o agente de IA e um futuro script de venda assistida precisam da mesma
     * regra, e regra que mora na rota só vale para quem entra por HTTP. */
    const r = await app.provisionarNegocio(
      { usuarioId: porteiro.usuario.usuarioId },
      {
        nome: String(nome ?? ""),
        vertical: vertical as never,
        profissional: profissional == null ? undefined : String(profissional),
        /* O `/assinar` pede o teste fechado. Qualquer outro valor é o de sempre. */
        teste: teste === "na_conversa" ? "na_conversa" : undefined,
      },
    );

    return NextResponse.json({ ok: true, status: "ok", ...r }, { status: 201 });
  } catch (e) {
    return falha("negocio", e);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PATCH /api/negocio  { nome?, foto? }  →  { negocio }
 *
 * Trocar o nome do negócio depois de criado. Mora na MESMA rota do POST porque é o mesmo
 * recurso — criar e editar o negócio — e a casa prefere rota por recurso a rota por
 * tela (ver o cabeçalho de `/api/assistente`).
 *
 * ⚠️ USA `exigirSessao`, E NÃO `exigirUsuario` COMO O POST ACIMA. A diferença não é
 * estilo: o POST é o que CRIA o inquilino, então ele não pode exigir um — só a identidade
 * da pessoa. Aqui o inquilino já existe e tem que vir da sessão, nunca do corpo. Trocar
 * um pelo outro aqui abriria o caminho para renomear o negócio dos outros.
 * ────────────────────────────────────────────────────────────────────────────── */
export async function PATCH(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, status: "payload_invalido", info: "Corpo não é JSON." }, { status: 400 });
  }

  const { nome, foto } = (corpo ?? {}) as { nome?: unknown; foto?: unknown };

  /* O patch sem `nome` nem `foto` não é erro do usuário nem sucesso — é chamada perdida, e
   * responder 200 para ela esconderia um defeito de tela que só apareceria como "não salva".
   * Mesma decisão do `AjustarAssistente`, escrita lá com mais palavras. */
  if (nome === undefined && foto === undefined) {
    return NextResponse.json(
      { ok: false, status: "payload_invalido", info: "Nada para mudar." },
      { status: 400 },
    );
  }

  try {
    const negocio = await app.ajustarNegocio(porteiro.tenant, {
      ...(nome === undefined ? {} : { nome: String(nome) }),
      ...(foto === undefined ? {} : { foto: foto === null ? null : String(foto) }),
    });
    return NextResponse.json({ ok: true, status: "ok", negocio });
  } catch (e) {
    return falha("negocio", e);
  }
}
