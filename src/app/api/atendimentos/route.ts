import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO — marcar e cancelar. Sempre no servidor.
//
// POST   → marca o atendimento (com videochamada, se pedido) e devolve o link
// PATCH  → remarca: { profissionalId, maisaAg, data, inicio } (1B.5, 25/09/2026). Mesmo
//          evento e mesmo Meet; `foraDoCalendario` diz que o Google ficou no horário antigo
// DELETE → cancela
//
// ⚠️ ESTA ROTA MORAVA EM `/api/google/evento`, E O NOME MENTIA (ADR-0009). O que ela cria
// é um atendimento no produto; o evento no calendário externo é um efeito adicional, que
// pode simplesmente não acontecer. O nome antigo vinha com `exigirSessaoComGoogle`, que
// recusa com 400 `nao_configurado` quando o AMBIENTE não tem credencial do Google — ou
// seja, num deploy sem Google ninguém marcava nada. Agora é `exigirSessao`.
//
// A rota é FINA de propósito: ela só traduz HTTP para o caso de uso. Toda a regra
// (validação, allowlist, idempotência, título do evento) mora em
// `nucleo/aplicacao/agendar-atendimento.ts`, porque o agente de WhatsApp vai chamar
// a MESMA função sem passar por aqui. Quando isso valia como "a rota faz tudo", a
// única forma de marcar um horário era ter um navegador aberto.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Uma série de semanais por três meses são 13 idas ao Google; o padrão da Vercel corta
 * antes. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  const body = await request.json().catch(() => ({} as any));

  const pedido = {
      agendaId: String(body?.profissionalId ?? ""),
      maisaAg: String(body?.maisaAg ?? ""),
      data: String(body?.data ?? ""),
      inicio: Number(body?.inicio),
      duracao: body?.duracao != null ? Number(body.duracao) : undefined,
      servicoId: String(body?.servicoId ?? ""),
      servicoNome: body?.servicoNome != null ? String(body.servicoNome) : undefined,
      servicoValor: body?.servicoValor != null ? Number(body.servicoValor) : undefined,
      clienteId: String(body?.clienteId ?? ""),
      clienteNome: body?.clienteNome != null ? String(body.clienteNome) : undefined,
      clienteTelefone: body?.clienteTelefone != null ? String(body.clienteTelefone) : undefined,
      comMeet: body?.comMeet !== false,
      convidarCliente: body?.convidarCliente === true,
  };

  try {
    /* Série ("toda semana", "a cada 2 semanas"): uma marcação por data, e a resposta diz
     * quais entraram e quais foram puladas por conflito. Os campos de cima repetem a
     * PRIMEIRA que entrou, para quem só lê a resposta avulsa continuar funcionando. */
    if (body?.recorrencia) {
      const serie = await app.agendarRecorrente(porteiro.tenant, {
        ...pedido,
        cadaSemanas: Number(body.recorrencia.cadaSemanas),
        chaves: Array.isArray(body.recorrencia.chaves) ? body.recorrencia.chaves.map(String) : [],
      });
      const r = serie.criados[0];
      return NextResponse.json({
        ok: true,
        status: r.situacao === "ja_existia" ? "ja_existia" : "criado",
        eventoId: r.eventoId,
        meetLink: r.meetLink,
        htmlLink: r.htmlLink,
        inicioISO: r.inicioISO,
        semMeet: r.semMeet,
        foraDoCalendario: r.foraDoCalendario,
        serie,
      });
    }

    const r = await app.agendarAtendimento(porteiro.tenant, pedido);

    return NextResponse.json({
      ok: true,
      // `criado` | `ja_existia` — a tela distingue para não dizer "marcado!" duas vezes.
      status: r.situacao === "ja_existia" ? "ja_existia" : "criado",
      eventoId: r.eventoId,
      meetLink: r.meetLink,
      htmlLink: r.htmlLink,
      inicioISO: r.inicioISO,
      semMeet: r.semMeet,
      /* O atendimento existe, mas não entrou em calendário externo nenhum. Para quem
       * nunca conectou isso é o normal e a tela ignora; para quem conectou, é o aviso de
       * que a agenda dele NÃO recebeu o evento. Ver o caso de uso. */
      foraDoCalendario: r.foraDoCalendario,
    });
  } catch (e) {
    return falha("atendimentos", e);
  }
}

export async function PATCH(request: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  const body = await request.json().catch(() => ({} as any));

  try {
    const r = await app.remarcarAtendimento(porteiro.tenant, {
      agendaId: String(body?.profissionalId ?? ""),
      maisaAg: String(body?.maisaAg ?? ""),
      data: String(body?.data ?? ""),
      inicio: Number(body?.inicio),
    });
    return NextResponse.json({ ok: true, ...r, status: r.situacao });
  } catch (e) {
    return falha("atendimentos", e);
  }
}

export async function DELETE(request: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  const { searchParams } = new URL(request.url);

  try {
    await app.cancelarAtendimento(porteiro.tenant, {
      agendaId: searchParams.get("pid") ?? "",
      eventoId: searchParams.get("eventoId") ?? "",
    });
    return NextResponse.json({ ok: true, status: "cancelado" });
  } catch (e) {
    return falha("atendimentos", e);
  }
}
