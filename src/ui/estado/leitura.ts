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
import { civilSP } from "@/nucleo/dominio/tempo";

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

/**
 * O atendimento ainda pode furar por falta de confirmação? (1A.5, 02 P1-3)
 *
 * `confirmado` é só a resposta ao convite do Google (sem convidado, é sempre verdadeiro). A marca
 * "a confirmar" aparecia para todo mundo, inclusive para quem já estava sentado na cadeira ou
 * foi embora: a pessoa ligava para cobrar confirmação de quem estava sendo atendido. Agora só
 * vale em "chegando" e antes do horário.
 */
export function semConfirmacao(
  ag: { confirmado: boolean; etapa: string; data: string; inicio: number },
  agora = Date.now(),
): boolean {
  if (ag.confirmado || ag.etapa !== "chegando") return false;
  const c = civilSP(new Date(agora).toISOString());
  if (!c) return true;
  return ag.data > c.data || (ag.data === c.data && ag.inicio > c.hora);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * GRAVOU? O sinal que substitui o botão Salvar dos Ajustes (item 1A.8, 07 P0.5).
 *
 * Ajustes, nome do negócio e semana gravam sozinhos com janela de 500ms, e até 25/09/2026
 * nenhum componente dizia se o servidor aceitou: o único retorno era o toast de falha. O
 * store expõe os três recursos em voo e a última falha de cada um; aqui vira uma frase só.
 *
 * Ordem: gravando ganha (o toque novo é o que o dono está olhando); falha ganha do "Salvo"
 * (um recurso que o banco recusou não fica escondido pelo verde de outro); "Salvo" dura o
 * que o store segura `salvo` (2,2s) e depois some, porque salvo é o normal.
 * ────────────────────────────────────────────────────────────────────────────── */

export type RecursoGravado = "ajustes" | "semana" | "nome";

export type EstadoDaGravacao =
  | { fase: "parada" }
  | { fase: "salvando" }
  | { fase: "salva" }
  | { fase: "falhou"; motivo: string };

export function estadoDaGravacao(p: {
  emVoo: Partial<Record<RecursoGravado, boolean>>;
  falhas: Partial<Record<RecursoGravado, string>>;
  salvo: boolean;
}): EstadoDaGravacao {
  if (Object.values(p.emVoo).some(Boolean)) return { fase: "salvando" };
  const motivo = (["ajustes", "semana", "nome"] as const).map((r) => p.falhas[r]).find(Boolean);
  if (motivo) return { fase: "falhou", motivo };
  if (p.salvo) return { fase: "salva" };
  return { fase: "parada" };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O DIA EM PARTES, pelo relógio (item 1C.6 do backlog do front, 02 P0-1).
 *
 * O quadro de três colunas ordenava por etapa e hora e não lia o relógio: quem não apertava
 * "Chegou" em todo cliente acumulava em "Chegando" o dia inteiro que já passou, e o próximo de
 * verdade (16:15) ficava a 2049px dentro de uma coluna de 691. Aqui o dia se divide pelo agora:
 *   - `atendendo`: quem está em atendimento (é a faixa "Agora");
 *   - `proximo`: o primeiro "chegando" que ainda não passou da tolerância (também na faixa);
 *   - `passaram`: "chegando" cujo horário passou da tolerância sem chegada (o bloco âmbar);
 *   - `depois`: os "chegando" que vêm depois do próximo;
 *   - `feitos`: o que terminou, recolhido numa linha.
 *
 * Tolerância de 15 min: quem marcou 16:15 e chegou 16:25 ainda é "o próximo", não um atraso.
 * ────────────────────────────────────────────────────────────────────────────── */

export const TOLERANCIA_DE_ATRASO_H = 0.25;

export type PartesDoDia<T> = { atendendo: T[]; proximo: T | null; passaram: T[]; depois: T[]; feitos: T[] };

export function partesDoDia<T extends { etapa: string; data: string; inicio: number }>(
  doDia: readonly T[],
  agora = Date.now(),
): PartesDoDia<T> {
  const c = civilSP(new Date(agora).toISOString());
  const porHora = [...doDia].sort((a, b) => a.inicio - b.inicio);
  /* Dia que não é hoje (ou relógio ilegível): nada "passou", tudo vem. */
  const limite = (ag: T) => (!c || ag.data !== c.data ? -Infinity : c.hora - TOLERANCIA_DE_ATRASO_H);
  const chegando = porHora.filter((a) => a.etapa === "chegando");
  const passaram = chegando.filter((a) => a.data === c?.data && a.inicio < limite(a));
  const vem = chegando.filter((a) => !passaram.includes(a));
  return {
    atendendo: porHora.filter((a) => a.etapa === "atendendo"),
    proximo: vem[0] ?? null,
    passaram,
    depois: vem.slice(1),
    feitos: porHora.filter((a) => a.etapa === "feito"),
  };
}
