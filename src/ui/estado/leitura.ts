/* ─────────────────────────────────────────────────────────────────────────────
 * CARREGANDO NÃO É VAZIO. As derivações puras de cada tela, num lugar só.
 *
 * Até 24/09/2026 cada tela derivava do array: `[]` virava "Nenhum atendimento", "Dia livre",
 * "Nada pendente", "Seus contatos ainda não estão aqui", tanto faz se a leitura tinha voltado,
 * falhado ou nem saído. A tela afirmava antes de saber (T4 do backlog do front).
 *
 * A regra é uma só, e é o que o guarda G12 (`guardas/leitura.test.ts`) cobra de cada função:
 *
 *   · `carregando` nunca devolve `vazio` nem CTA de vazio;
 *   · `erro` nunca devolve `vazio`, e a tela desenha a frase e "Tentar de novo";
 *   · dado já lido continua na tela durante a releitura (⚠️ `Agenda.tsx`, faixa de aviso:
 *     apagar o que se sabe para mostrar que se está relendo é trocar um problema por dois).
 *
 * O modelo é o `vocabulario()`/`falhou` do Fiscal (`telas/Grades.tsx`) e o `leituraDaTela`
 * de `componentes/EmitirRecibos.tsx`, que já separavam os três casos e têm teste.
 *
 * Sem React aqui: função pura, testada no ambiente `node`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { StatusDaMaisa } from "@/nucleo/dominio/status-da-maisa";

/** O que uma leitura pode ser. `frase` é o que a tela escreve; o botão é sempre "Tentar de novo". */
export type Leitura<T> =
  | { fase: "carregando" }
  | { fase: "erro"; frase: string }
  | { fase: "ok"; dado: T };

/** O que a tela desenha a partir de uma leitura de lista. */
export type EstadoDaLista = "carregando" | "erro" | "vazio" | "cheio";

/** A leitura da agenda como o store a guarda (`LeituraAgenda`), só o que importa aqui. */
export type LeituraDaAgenda = { status: string; jaLeu: boolean; info?: string };

/** A frase do erro da agenda. A leitura é da TABELA desde o ADR-0009, não só do Google. */
export const FRASE_ERRO_AGENDA = "Não consegui ler a sua agenda.";

/**
 * O dia da agenda (Fluxo, lista do dia da Agenda).
 *
 * `jaLeu` separa "vazio" de "ainda não sei": o estado nasce `nao_conectado` com `jaLeu:false`
 * e só uma leitura bem-sucedida o vira. Erro depois de uma leitura boa mantém o que foi lido
 * (vazio ou cheio) e a tela acende a faixa de aviso por cima.
 */
export function estadoDoDia(agenda: LeituraDaAgenda, quantos: number): EstadoDaLista {
  if (quantos > 0) return "cheio";
  if (agenda.jaLeu) return "vazio";
  if (agenda.status === "erro" || agenda.status === "reconectar") return "erro";
  return "carregando";
}

/** A agenda falhou e a tela precisa dizer, mesmo tendo o que mostrar? */
export function agendaComErro(agenda: LeituraDaAgenda): boolean {
  return agenda.status === "erro" || agenda.status === "reconectar";
}

/**
 * "Precisa de você", do Fluxo. Três leituras respondem juntas: as conversas (o que espera
 * resposta), a agenda (quem ainda não confirmou) e o status da MAISA.
 *
 * ⚠️ "Nada pendente" só com as duas leituras de volta, sem erro, e a MAISA atendendo. Fila
 * vazia com a MAISA pausada ou sem WhatsApp não é "tudo resolvido": é ninguém respondendo, e a
 * tela diz isso (`sem_maisa`).
 */
export type EstadoDaFila = EstadoDaLista | "sem_maisa";

export function estadoDaFila(p: {
  itens: number;
  conversas: { carregadas: boolean; erro: string | null };
  agenda: LeituraDaAgenda;
  status: StatusDaMaisa;
}): EstadoDaFila {
  if (p.itens > 0) return "cheio";
  if (p.conversas.erro && !p.conversas.carregadas) return "erro";
  const dia = estadoDoDia(p.agenda, 0);
  if (dia === "erro") return "erro";
  if (!p.conversas.carregadas || dia === "carregando" || p.status === "conferindo") return "carregando";
  if (p.status !== "atendendo") return "sem_maisa";
  return "vazio";
}

/**
 * Meus contatos. `modo` nasce `null` (não sabemos de quem é o número) e a lista nasce
 * `null` (não lemos). Leitura que falhou não vira `[]`.
 */
export function estadoDosContatos(p: { lidos: number | null; erro: string | null }): EstadoDaLista {
  if (p.lidos !== null && p.lidos > 0) return "cheio";
  if (p.erro) return "erro";
  if (p.lidos === null) return "carregando";
  return "vazio";
}
