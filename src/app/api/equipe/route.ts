import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, sessaoOuDemo } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM ATENDE — a equipe, agora gravável.
//
// PUT /api/equipe  { id?, nome, papel?, ativo? }  →  { profissional }
//
// ── O CASO CONCRETO QUE PEDIU ESTA ROTA ──
//
// `criar_negocio()` cria o primeiro profissional ADIVINHANDO o nome: tenta
// `raw_user_meta_data.full_name`, depois o que vem antes do @ do e-mail
// (`005_provisionar.sql`). Foi assim que um negócio real ficou com um profissional
// chamado `bruno.vaskevicius` — e esse nome sai na voz da MAISA, porque é o que ela diz
// quando confirma "com quem?". Corrigir exigia SQL na mão até esta rota existir.
//
// É a irmã de `/api/servicos`, criada na mesma leva e pelo mesmo motivo: a tela de Equipe
// mostrava a lista e não escrevia nela.
//
// ── O QUE ELA DELIBERADAMENTE NÃO FAZ ──
//
// Não mexe em EXPEDIENTE. `expediente_folga`, `expediente_de` e `expediente_ate` mandam na
// grade inteira — quem escreve ali fecha ou abre a agenda de uma pessoa. Isso merece caso
// de uso próprio, com a mesma seriedade que `AjustarHorarios` já tem para o horário
// anunciado. Aceitá-los aqui num campo opcional convidaria a tela de cadastro a fechar a
// agenda de alguém sem querer, e o sintoma seria "a MAISA não oferece horário nenhum".
// O caso de uso próprio existe desde 24/10/2026 e tem rota própria: `PUT /api/equipe/expediente`
// (`AjustarExpediente`), chamada pela ficha do profissional. Esta continua recusando.
//
// Também não convida ninguém: `membros` é acesso ao painel e tem RLS própria (`dono
// convida`, `003_rls.sql`). Profissional é QUEM ATENDE; membro é quem entra no app. Um
// barbeiro que não usa o sistema é o primeiro sem o segundo, e é o caso comum.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "payload_invalido", info: "Corpo não é JSON." },
      { status: 400 },
    );
  }

  const { id, nome, papel, ativo } = (corpo ?? {}) as Record<string, unknown>;

  try {
    const profissional = await app.ajustarProfissional(porteiro.tenant, {
      ...(id == null ? {} : { id: String(id) }),
      nome: String(nome ?? ""),
      ...(papel == null ? {} : { papel: String(papel) }),
      ...(ativo === undefined ? {} : { ativo: Boolean(ativo) }),
    });

    return NextResponse.json({ ok: true, status: "ok", profissional });
  } catch (e) {
    return falha("equipe", e);
  }
}
