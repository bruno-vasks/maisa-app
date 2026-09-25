/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — remarcar um atendimento (25/09/2026, item 1B.5 do backlog do front).
 *
 * Até aqui remarcar não existia no produto: a Agenda dizia "remarcar, por enquanto, é no
 * Google Calendar", o que para quem não conectou Google (o caso comum desde o ADR-0009)
 * significava cancelar e marcar de novo, perdendo o link do Meet e a chave do atendimento.
 *
 * A ordem é a mesma da criação: **o banco primeiro, o calendário externo depois, dentro de
 * um `try`**. Quem manda no horário é a tabela `atendimentos` (é nela que a constraint de
 * exclusão recusa o horário ocupado); o evento lá fora só acompanha.
 *
 * ⚠️ SEM MÉTODO NOVO NAS PORTAS, de propósito. Mover a linha é `registrar` de novo com a
 * MESMA `maisaAg`: a porta já é um upsert idempotente por essa chave, e é o mesmo caminho
 * pelo qual a criação anexa o `eventoId`. O `eventoId`, o link do Meet e o `htmlLink` vão
 * iguais, e o calendário tem `remarcar` desde sempre (ele move o evento, não recria: o link
 * do Meet continua o mesmo).
 *
 * ⚠️ E `registrar` não lança fora do conflito: ele engole a falha de banco e loga. Na criação
 * isso é aceitável porque o calendário ainda carrega o atendimento; aqui seria dizer "movido"
 * com a linha no horário antigo. Por isso o passo 4 RELÊ a linha e confere o instante antes
 * de responder: se não bate, lança, e a tela devolve o bloco ao lugar.
 *
 * O tipo do caso de uso mora aqui e não em `portas/entrada/casos-de-uso.ts`: aquela pasta
 * não se mexe neste trabalho de front (regra do `code/CLAUDE.md`). Quem quiser promovê-lo a
 * contrato de entrada move o tipo sem mudar uma linha do corpo.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AgendaExterna } from "../portas/saida/agenda-externa";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RegistroDeAtendimentos } from "../portas/saida/registro-atendimentos";
import type { ContextoTenant } from "../dominio/tenant";
import { DIAS_DE_ALCANCE, ehUuid, horaValida } from "../dominio/agenda";
import { DadoInvalido, FalhaDoProvedor, NaoEncontrado } from "../dominio/erros";
import { ehDataCivil, instanteISO } from "../dominio/tempo";

export type PedidoDeRemarcacao = {
  /** A agenda (o profissional). Continua a mesma: remarcar não troca de pessoa. */
  agendaId: string;
  /** A chave do atendimento. É por ela que a linha se acha, com ou sem evento lá fora. */
  maisaAg: string;
  /** O novo dia civil, "2026-10-15". */
  data: string;
  /** A nova hora de início, em horas (14.5 = 14:30). */
  inicio: number;
};

export type AtendimentoRemarcado = {
  /** `remarcado`, ou `mesmo_horario` quando o pedido não mudava nada. */
  situacao: "remarcado" | "mesmo_horario";
  /** A mesma identidade de antes: o id do evento lá fora, ou a chave quando não há evento. */
  eventoId: string;
  meetLink: string | null;
  htmlLink: string | null;
  data: string;
  inicio: number;
  inicioISO: string;
  /** Havia evento lá fora e ele NÃO foi movido: a tela avisa, senão o dono confia nele. */
  foraDoCalendario: boolean;
};

export type RemarcarAtendimento = (t: ContextoTenant, p: PedidoDeRemarcacao) => Promise<AtendimentoRemarcado>;

export function criarRemarcarAtendimento(deps: {
  agenda: AgendaExterna;
  negocio: RepositorioNegocio;
  registro: RegistroDeAtendimentos;
  /** Só para poder congelar o tempo em teste. */
  agora?: () => number;
}): RemarcarAtendimento {
  const agora = deps.agora ?? Date.now;
  return async (t, p) => {
    /* ── 1. o pedido faz sentido? ── As mesmas guardas da criação. */
    if (!ehUuid(p.maisaAg)) throw new DadoInvalido("Atendimento não informado.", "maisaAg");
    if (!ehDataCivil(p.data)) throw new DadoInvalido("Data inválida.", "data");
    if (!horaValida(p.inicio)) throw new DadoInvalido("Horário fora do dia.", "inicio");

    const permitidas = await deps.negocio.agendasPermitidas(t);
    if (!permitidas.includes(p.agendaId)) throw new DadoInvalido("Essa agenda não existe neste negócio.", "agendaId");

    /* ── 2. a linha, e de quem ela é ── */
    const atual = await deps.registro.buscarPorAg(t, { maisaAg: p.maisaAg });
    if (!atual || atual.agendaId !== p.agendaId) throw new NaoEncontrado("Atendimento");
    if (atual.situacao === "cancelado") throw new DadoInvalido("Esse atendimento foi cancelado. Marque um novo.", "maisaAg");

    const inicioISO = instanteISO(p.data, p.inicio);
    const fimISO = instanteISO(p.data, p.inicio + atual.duracaoMin / 60);
    if (Math.abs((Date.parse(inicioISO) - agora()) / 86_400_000) > DIAS_DE_ALCANCE) {
      throw new DadoInvalido("Data a mais de um ano daqui.", "data");
    }

    const resposta = (situacao: AtendimentoRemarcado["situacao"], foraDoCalendario: boolean): AtendimentoRemarcado => ({
      situacao,
      eventoId: atual.eventoId ?? atual.maisaAg,
      meetLink: atual.meetLink,
      htmlLink: atual.htmlLink,
      data: p.data,
      inicio: p.inicio,
      inicioISO,
      foraDoCalendario,
    });

    if (Date.parse(atual.inicioISO) === Date.parse(inicioISO)) return resposta("mesmo_horario", false);

    /* ── 3. GRAVA AQUI, ANTES DO PROVEDOR ──
     * Mesma chave, mesmo vínculo com o evento: só o instante e a projeção civil mudam. O
     * conflito (`HorarioOcupado`) sobe daqui, antes de qualquer efeito lá fora. */
    await deps.registro.registrar(t, {
      maisaAg: atual.maisaAg,
      agendaId: atual.agendaId,
      clienteId: atual.clienteId,
      clienteNome: atual.clienteNome,
      clienteTel: atual.clienteTel,
      servicoId: atual.servicoId,
      servicoNome: atual.servicoNome,
      servicoValor: atual.servicoValor,
      inicioISO,
      fimISO,
      duracaoMin: atual.duracaoMin,
      dataLocal: p.data,
      horaInicio: p.inicio,
      eventoId: atual.eventoId,
      meetLink: atual.meetLink,
      htmlLink: atual.htmlLink,
    });

    /* ── 4. CONFERE QUE GRAVOU ── Ver o ⚠️ do cabeçalho: `registrar` engole falha de banco. */
    const depois = await deps.registro.buscarPorAg(t, { maisaAg: atual.maisaAg });
    if (!depois || Date.parse(depois.inicioISO) !== Date.parse(inicioISO)) {
      throw new FalhaDoProvedor("Não consegui gravar o novo horário. O atendimento continua no horário de antes.");
    }

    /* ── 5. O CALENDÁRIO EXTERNO, SE HOUVER ── Aditivo: a falha dele não desfaz a remarcação. */
    if (!atual.eventoId) return resposta("remarcado", false);
    try {
      await deps.agenda.remarcar({ tenant: t, agendaId: p.agendaId }, { eventoId: atual.eventoId, inicio: inicioISO, fim: fimISO });
      return resposta("remarcado", false);
    } catch (e) {
      console.error(`[remarcar] o evento ${atual.eventoId} ficou no horário antigo no calendário externo`, e);
      return resposta("remarcado", true);
    }
  };
}
