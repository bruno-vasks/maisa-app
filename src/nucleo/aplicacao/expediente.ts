/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — ajustar o expediente de quem atende.
 *
 * O expediente decide o que a Agenda deixa marcar e o que a MAISA oferece no WhatsApp. Até
 * 24/10/2026 nenhuma tela o escrevia: terapeuta nascia com Seg–Sex 09–19, os outros com
 * Seg–Sáb 09–19, e quem atendia às 19h ou 20h não tinha onde corrigir. A MAISA dizia que abria
 * às 8h e a Agenda não deixava marcar às 8h.
 *
 * Ficou de fora de `AjustarProfissional` (e da rota `/api/equipe`) de propósito, e este é o
 * caminho próprio, com a mesma seriedade que `AjustarHorarios` tem para o horário anunciado:
 * quem escreve aqui fecha ou abre a agenda de uma pessoa, e o sintoma de errar é "a MAISA não
 * oferece horário nenhum".
 *
 * ── O QUE ELE RECUSA, E POR QUÊ ──
 *
 *   • Nenhum dia marcado. Sem dia a frase vira "Sem expediente", a MAISA não oferece nada e a
 *     Agenda fica toda cinza. Para parar de receber agendamentos existe "Pausado", em
 *     Disponibilidade, e a mensagem manda para lá.
 *   • Domingo. A Agenda e o Novo atendimento tratam domingo como sempre fechado (`fechado`,
 *     em `dominio/expediente.ts`), enquanto `vagasDoDia` só olha o expediente. Gravar domingo
 *     faria a MAISA marcar um atendimento que o painel esconde. Recusa na entrada, e
 *     `expedienteDosDias` ainda põe o domingo na folga por conta própria.
 *   • Hora fora do passo de meia hora, ou fora da janela que a Agenda desenha (07:00 a 22:00),
 *     e `ate` que não seja depois de `de`. O banco recusaria os dois últimos com um
 *     `check_violation` e um 502; aqui vira a frase de quem pode consertar.
 *
 * ── A FRASE ANDA JUNTO DO NÚMERO ──
 *
 * `horario` e `folga` (o texto da tabela de Equipe) são regravados na mesma escrita. A leitura
 * usa `l.horario ?? frasePorExpediente(l)`: o texto gravado vence o montado, então só o número
 * mudando deixaria a Equipe dizendo "Seg–Sáb 09–19" depois de a agenda mudar.
 *
 * Atendimentos que já estão marcados fora do expediente novo não são tocados: o expediente
 * decide o que se pode marcar daqui para a frente, não o que já foi marcado.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AjustarExpediente } from "../portas/entrada/casos-de-uso";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { Profissional } from "../dominio/catalogo";
import {
  DIAS_DE_ATENDIMENTO,
  HORA_MAX_DO_EXPEDIENTE,
  HORA_MIN_DO_EXPEDIENTE,
  SEM_DIA_DE_ATENDIMENTO,
  expedienteDosDias,
  frasesDoExpediente,
  horaDoExpedienteValida,
} from "../dominio/expediente";
import { hhmm } from "../dominio/tempo";
import { DadoInvalido, NaoEncontrado } from "../dominio/erros";

export function criarAjustarExpediente(deps: { negocio: RepositorioNegocio }): AjustarExpediente {
  return async (t, p): Promise<Profissional> => {
    const profissionalId = String(p?.profissionalId ?? "").trim();
    if (!profissionalId) {
      throw new DadoInvalido("Diga de qual profissional é o expediente.", "profissionalId");
    }

    if (!Array.isArray(p?.dias)) {
      throw new DadoInvalido("Mande os dias de atendimento como uma lista, de 0 (segunda) a 5 (sábado).", "dias");
    }
    for (const d of p.dias) {
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        throw new DadoInvalido("Cada dia vai de 0 (segunda) a 5 (sábado).", "dias");
      }
      if (!DIAS_DE_ATENDIMENTO.includes(d)) {
        throw new DadoInvalido("Domingo fica fechado: a agenda não marca atendimento no domingo.", "dias");
      }
    }
    /* Dia repetido é o mesmo dia: a lista é um conjunto, e recusar `[1, 1, 2]` só daria
     * trabalho a quem chama sem proteger ninguém de nada. */
    const dias = Array.from(new Set(p.dias)).sort((a, b) => a - b);
    if (dias.length === 0) throw new DadoInvalido(SEM_DIA_DE_ATENDIMENTO, "dias");

    /* Número de verdade, e não texto que vira número: `Number("")` é 0, e um campo apagado
     * viraria 00:00. A janela é a da Agenda (ver `HORA_MIN_DO_EXPEDIENTE`). */
    const janela = `Os horários vão das ${hhmm(HORA_MIN_DO_EXPEDIENTE)} às ${hhmm(HORA_MAX_DO_EXPEDIENTE)}, de meia em meia hora.`;
    if (!horaDoExpedienteValida(p.de)) throw new DadoInvalido(janela, "de");
    if (!horaDoExpedienteValida(p.ate)) throw new DadoInvalido(janela, "ate");
    if (p.ate <= p.de) {
      throw new DadoInvalido("O fim do expediente precisa ser depois do começo.", "ate");
    }

    /* Antes de gravar, pela mesma porta que filtra por negócio: id de outro inquilino não
     * resolve aqui. O adaptador confere de novo na escrita (zero linhas é `NaoEncontrado`), e
     * é esta leitura que faz a recusa valer para qualquer adaptador. */
    if (!(await deps.negocio.profissional(t, profissionalId))) {
      throw new NaoEncontrado("Profissional deste negócio");
    }

    const expediente = expedienteDosDias(dias, p.de, p.ate);
    return deps.negocio.salvarExpediente(t, { id: profissionalId, expediente, ...frasesDoExpediente(expediente) });
  };
}
