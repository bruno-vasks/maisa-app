import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, sessaoOuDemo } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// QUANDO ATENDE — o expediente de UM profissional (24/10/2026).
//
// PUT /api/equipe/expediente  { profissionalId, dias, de, ate }  →  { profissional }
//
//   dias  dias em que atende, de 0 (segunda) a 5 (sábado). Domingo é recusado.
//   de/ate  hora decimal de meia em meia hora, das 07:00 às 22:00 (9.5 = 09:30). Uma faixa só,
//           que vale para todos os dias marcados.
//
// É a rota que `/api/equipe` apontava como "caso de uso próprio": aquela recusa o expediente de
// propósito (ver o comentário dela e o commit e3e201b), porque quem escreve aqui fecha ou abre a
// agenda de uma pessoa, e o formulário de cadastro não deveria poder fazer isso sem querer. Esta
// só faz isso, e a ficha do profissional é quem a chama.
//
// ── PUT, E NÃO PATCH ──
//
// O corpo é o expediente INTEIRO, não o que mudou: marcar mais um dia manda os dias todos. Mandá-lo
// duas vezes dá o mesmo resultado, e duas abas abertas convergem para a última que salvou em vez
// de produzir um expediente que nunca existiu em nenhuma das duas. Mesma razão de `/api/horarios`.
//
// A rota só traduz. O que é válido (nenhum dia, domingo, hora fora do passo ou da janela, `ate`
// antes de `de`, profissional de outro negócio) é do caso de uso `AjustarExpediente`, que lança
// `DadoInvalido` e `NaoEncontrado`; quem os vira 400 é `falha`. O negócio nasce da sessão, nunca
// do corpo: o `profissionalId` é só QUAL profissional, e o caso de uso o confere contra o negócio
// da sessão antes de gravar.
//
// `sessaoOuDemo` como as irmãs: com Supabase ligado ele é `exigirSessao`, e sem banco o app é
// demonstração aberta, onde a ficha precisa gravar para a Agenda mudar.
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

  const { profissionalId, dias, de, ate } = (corpo ?? {}) as Record<string, unknown>;

  try {
    /* Os `as` abaixo não validam nada: o tipo é o da porta, e quem confere o que chegou é o caso
     * de uso (lista, inteiros, janela, passo). Lista vazia e domingo chegam lá e voltam 400. */
    const profissional = await app.ajustarExpediente(porteiro.tenant, {
      profissionalId: String(profissionalId ?? ""),
      dias: dias as number[],
      de: de as number,
      ate: ate as number,
    });

    return NextResponse.json({ ok: true, status: "ok", profissional });
  } catch (e) {
    return falha("equipe", e);
  }
}
