/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — oferecer horários.
 *
 * O buraco que o agente de WhatsApp escancarou. `agendarAtendimento` existia desde a
 * reorganização, mas ele responde "marque às 14h" — e ninguém sabia responder "que
 * horas você tem?". A tela não precisava: ela desenha a grade e o vago aparece como
 * espaço em branco. Um agente não vê espaço em branco.
 *
 * Cruza quatro fontes: expediente do profissional (quem trabalha quando), os
 * atendimentos já marcados no produto (o que tem dono), o calendário externo (o que tem
 * dono e nasceu fora) e o catálogo (quanto tempo o serviço leva). A conta em si é pura e
 * mora em `dominio/vagas.ts`; aqui é a orquestração — buscar, filtrar por allowlist,
 * cortar o teto.
 *
 * ⚠️ A OCUPAÇÃO MUDOU DE FONTE (ADR-0009). Era só o Google, e por isso este caso de uso
 * estourava inteiro para quem não conectou Google — o agente escalava para humano em toda
 * tentativa de marcar. Agora a fonte primária é a tabela de atendimentos, e o calendário
 * externo entra somando o que nasceu fora, dentro de um `catch`.
 *
 * ⚠️ É a ferramenta MAIS CHAMADA pelo agente. Uma leitura por profissional cobrindo a
 * janela inteira, nunca uma por dia: sete dias × três profissionais seriam 21 chamadas
 * para responder "tem vaga essa semana?", e o cliente desistiria antes.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { OferecerHorarios } from "../portas/entrada/casos-de-uso";
import type { AgendaExterna } from "../portas/saida/agenda-externa";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RegistroDeAtendimentos } from "../portas/saida/registro-atendimentos";
import { DadoInvalido, NaoEncontrado } from "../dominio/erros";
import { ehDataCivil, somarDias } from "../dominio/tempo";
import { duracaoValida } from "../dominio/agenda";
import { espalhar, MAX_DIAS_VARRIDOS, vagasDoDia, type Ocupado, type VagasDoDia } from "../dominio/vagas";

export type Dependencias = {
  /** ⚠️ Aditivo desde o ADR-0009: lido dentro de `catch`, some zero quando não existe. */
  agenda: AgendaExterna;
  negocio: RepositorioNegocio;
  /** A ocupação primária. É o que faz a MAISA marcar para quem não conecta calendário. */
  registro: RegistroDeAtendimentos;
  agora?: () => number;
};

/** O teto de `porDia`: um dia inteiro, de meia em meia hora. */
const MAX_POR_DIA = 48;

/** Quantos dias COM VAGA devolver. Passou disso, para de varrer: a conversa não
 *  aproveita o oitavo dia, e cada dia extra é agenda lida de graça. */
const MAX_DIAS_COM_VAGA = 4;

export function criarOferecerHorarios({ agenda, negocio, registro, agora = Date.now }: Dependencias): OferecerHorarios {
  return async (t, p) => {
    /* ── 1. o serviço existe? ──
     * Primeiro porque é ele que define a duração, e sem duração não há o que calcular.
     * O agente preenche `servicoId` com o que entendeu de uma frase; um id inventado
     * tem que morrer aqui, com um erro que o agente possa transformar em pergunta
     * ("qual serviço você quer?") em vez de virar lista vazia — lista vazia ele
     * traduziria para "não tenho vaga", que é mentira. */
    const servico = await negocio.servico(t, p.servicoId);
    if (!servico) throw new NaoEncontrado("Serviço");
    if (!servico.ativo) throw new DadoInvalido("Esse serviço não está sendo oferecido.", "servicoId");

    const duracaoMin = Number(servico.duracao);
    if (!duracaoValida(duracaoMin)) throw new DadoInvalido("Duração do serviço inválida.", "duracao");

    if (!ehDataCivil(p.de)) throw new DadoInvalido("Data inválida.", "de");

    const dias = Math.min(Math.max(Number(p.dias ?? 7), 1), MAX_DIAS_VARRIDOS);
    /* Teto de 48, um dia inteiro de meia em meia hora. Quem pede o dia inteiro é o agente,
     * para reconferir se o horário que o cliente escolheu ainda está livre (`agendar` em
     * `whatsapp/ferramentas.ts`): com o teto antigo de 8, um horário livre podia ficar fora
     * da amostra e ser recusado. O modelo não escolhe este número — ele não está no esquema
     * da ferramenta —, então a conversa continua recebendo 2 ou 3 opções. */
    const porDia = Math.min(Math.max(Number(p.porDia ?? 3), 1), MAX_POR_DIA);

    /* ── 2. quais agendas podem ser consultadas ──
     * Interseção de DUAS listas, e as duas importam por motivos diferentes:
     *   • `agendasPermitidas` é segurança — o inquilino não lê agenda de outro;
     *   • `servico.profissionalIds` é verdade de negócio — nem todo mundo faz tudo.
     * Sem a segunda, o agente ofereceria com quem não sabe fazer o serviço e o
     * cliente descobriria isso na cadeira. */
    const permitidas = await negocio.agendasPermitidas(t);
    const fazemOServico = new Set(servico.profissionalIds);

    let candidatas = permitidas.filter((id) => fazemOServico.has(id));

    if (p.agendaId) {
      // Pediu alguém específico: recusa em vez de cair no silêncio de devolver todos.
      // "Quero com o Rafael" respondido com horários da Ana é pior que um erro.
      if (!permitidas.includes(p.agendaId)) {
        throw new DadoInvalido("Essa agenda não existe neste negócio.", "agendaId");
      }
      if (!fazemOServico.has(p.agendaId)) {
        throw new DadoInvalido("Esse profissional não faz esse serviço.", "agendaId");
      }
      candidatas = [p.agendaId];
    }

    if (candidatas.length === 0) throw new NaoEncontrado("Profissional para esse serviço");

    /* ── 3. uma leitura por agenda, cobrindo a janela inteira ──
     * `dias - 1` porque a janela é FECHADA nas duas pontas: de 06/08 por 7 dias vai
     * até 12/08, não 13. */
    const janela = { de: p.de, ate: somarDias(p.de, dias - 1) };

    const porAgenda = await Promise.all(
      candidatas.map(async (agendaId) => {
        const [marcados, expediente, externos] = await Promise.all([
          /* ── A ocupação PRIMÁRIA: os atendimentos do produto ──
           * Obrigatória, e ela lança se o banco falhar. Devolver lista vazia num erro
           * significaria "o dia inteiro está livre", e a MAISA ofereceria horário
           * vendido — o cliente descobre na cadeira. */
          registro.listarJanela(t, { agendaId, janela }),
          negocio.expediente(t, agendaId),
          /* ── E o calendário externo, ADITIVO ──
           * Traz o compromisso que não nasceu na MAISA: o almoço, o médico, o encaixe
           * que o dono marcou no celular. "Almoço" tem que bloquear horário igual a um
           * atendimento — filtrar por `maisa` presente faria a MAISA oferecer justamente
           * os horários que o dono reservou para não ser incomodado.
           *
           * Dentro de um `catch` que devolve `[]`: quem não conectou calendário nenhum
           * — a maioria — não pode ficar sem resposta. Antes esta chamada era a única
           * fonte, e `PrecisaReconectar` fazia a ferramenta MAIS CHAMADA pelo agente
           * estourar em toda tentativa. */
          agenda.listar({ tenant: t, agendaId }, janela).catch((e) => {
            console.error(`[oferecerHorarios] sem calendário externo para ${agendaId} — seguindo`, e);
            return [];
          }),
        ]);

        /* Sem deduplicar por `evento_id` de propósito: o atendimento que está nos dois
         * lados ocupa o MESMO intervalo, e `vagasDoDia` só pergunta "este horário colide
         * com algum destes?". Intervalo repetido não muda a resposta, e o filtro custaria
         * um `Set` por agenda no caminho quente. */
        const ocupados: Ocupado[] = [
          ...marcados,
          ...externos.map((e) => ({ data: e.data, inicio: e.inicio, fim: e.fim })),
        ];

        return { agendaId, expediente, ocupados };
      }),
    );

    /* ── 4. varrer dia a dia, parando quando já há resposta suficiente ── */
    const resultado: VagasDoDia[] = [];
    const instante = agora();

    for (let i = 0; i < dias && resultado.length < MAX_DIAS_COM_VAGA; i++) {
      const data = somarDias(p.de, i);

      for (const a of porAgenda) {
        const horarios = vagasDoDia({
          data,
          expediente: a.expediente ?? undefined,
          duracaoMin,
          ocupados: a.ocupados,
          agora: instante,
        });
        if (horarios.length === 0) continue;
        resultado.push({ data, agendaId: a.agendaId, horarios: espalhar(horarios, porDia) });
      }
    }

    return { duracaoMin, servicoNome: servico.nome, dias: resultado };
  };
}
