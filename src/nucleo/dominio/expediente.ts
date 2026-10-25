/* ─────────────────────────────────────────────────────────────────────────────
 * EXPEDIENTE — quando o negócio abre, em dado ESTRUTURADO.
 *
 * O `horario`/`folga` do profissional são frases para o dono ler ("Seg–Sáb 09–19",
 * "folga domingo"); o calendário precisa do NÚMERO. Sem isto a Agenda marcava gente em
 * dia de folga e fora do horário — e a tela de Equipe, na mesma sessão, desmentia a
 * Agenda. Se os dois divergirem, é ESTE que manda: mantenha o par junto.
 *
 * É também o que o agente de WhatsApp vai consultar antes de oferecer um horário. Por
 * isso as funções são puras e recebem o expediente como argumento: elas não sabem de
 * onde ele veio (fixture hoje, tabela por inquilino amanhã).
 * ────────────────────────────────────────────────────────────────────────────── */

import { DOW_LONGO, dowDoDia, hhmm } from "./tempo";

export type Expediente = {
  /** Índices de dia da semana em que não se atende. 0 = segunda … 6 = domingo. */
  folga: number[];
  /** Hora decimal de abertura e de fechamento. */
  de: number;
  ate: number;
};

/** Trabalha nesse dia? */
export const atendeNoDia = (e: Expediente | undefined, data: string) =>
  !!e && !e.folga.includes(dowDoDia(data));

/** Pode COMEÇAR um atendimento aí — dia de trabalho e hora dentro do expediente. */
export const podeComecarEm = (e: Expediente | undefined, data: string, inicio: number) =>
  !!e && atendeNoDia(e, data) && inicio >= e.de && inicio < e.ate;

/** Domingo, na convenção deste arquivo: 0 = segunda … 6 = domingo. */
const DOMINGO = 6;

/** Domingo a casa não abre. A coluna existe só para o mês ter sete colunas. */
export const fechado = (data: string) => dowDoDia(data) === DOMINGO;

/* ─────────────────────────────────────────────────────────────────────────────
 * EDITAR O EXPEDIENTE (24/10/2026) — o que a ficha do profissional pode mudar.
 *
 * Até esta data nenhuma tela escrevia o expediente: terapeuta nascia com Seg–Sex 09–19, os
 * outros com Seg–Sáb 09–19, e quem atendia às 19h ou 20h não tinha onde corrigir. O modelo
 * continua sendo `Expediente`, UMA faixa contínua que vale para todos os dias que se atende.
 * Não há horário por dia, nem almoço: o banco não guarda.
 *
 * ── DOMINGO FICA DE FORA ──
 *
 * `fechado` acima é a regra da casa: a Agenda e o Novo atendimento tratam domingo como sempre
 * fechado, e por isso um atendimento marcado num domingo não apareceria em tela nenhuma. Já
 * `vagasDoDia` só olha o expediente. Se a ficha deixasse ligar o domingo, a MAISA marcaria no
 * WhatsApp um atendimento que o painel esconde. Daí os dias que se escolhem serem os seis de
 * `DIAS_DE_ATENDIMENTO`, e `expedienteDosDias` pôr o domingo na folga SEMPRE.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Os dias em que se pode atender: segunda (0) a sábado (5). */
export const DIAS_DE_ATENDIMENTO: readonly number[] = [0, 1, 2, 3, 4, 5];

/**
 * A janela de horas que o expediente aceita: das 07:00 às 22:00, de meia em meia hora.
 *
 * ⚠️ É a janela que a grade da Agenda DESENHA (`AGENDA_INICIO` e `AGENDA_HORAS`, em
 * `ui/telas/Agenda.tsx`, e há teste que confere os dois lados). Mais largo que isto e a MAISA
 * ofereceria um horário que a Agenda não mostra. Mais estreito que o `check` do banco
 * (0 a 24) de propósito.
 */
export const HORA_MIN_DO_EXPEDIENTE = 7;
export const HORA_MAX_DO_EXPEDIENTE = 22;

/** As opções de "das" e "até": 07:00, 07:30 … 22:00. */
export const HORAS_DO_EXPEDIENTE: readonly number[] = Array.from(
  { length: (HORA_MAX_DO_EXPEDIENTE - HORA_MIN_DO_EXPEDIENTE) * 2 + 1 },
  (_, i) => HORA_MIN_DO_EXPEDIENTE + i / 2,
);

export const horaDoExpedienteValida = (h: unknown): h is number =>
  typeof h === "number" && HORAS_DO_EXPEDIENTE.includes(h);

/** A frase do caso de uso e da tela quando o último dia é desligado. */
export const SEM_DIA_DE_ATENDIMENTO =
  "Marque ao menos um dia de atendimento. Para parar de receber agendamentos, use Pausado em Disponibilidade.";

/** Os dias de segunda a sábado em que este expediente atende. */
export const diasQueAtende = (e: Expediente): number[] =>
  DIAS_DE_ATENDIMENTO.filter((d) => !e.folga.includes(d));

/**
 * O expediente de quem atende nos `dias` (0 a 5), das `de` às `ate`.
 *
 * A folga é o que sobra, e o domingo entra nela mesmo que alguém o passe em `dias`: quem
 * chama já recusou o 6, e esta é a segunda trava, a que vale se alguém esquecer a primeira.
 */
export function expedienteDosDias(dias: readonly number[], de: number, ate: number): Expediente {
  const folga = [0, 1, 2, 3, 4, 5, DOMINGO].filter((d) => d === DOMINGO || !dias.includes(d));
  return { folga, de, ate };
}

/* ── a frase, a partir do número ──
 *
 * `Profissional.horario` e `.folga` são o texto que o dono lê na tabela de Equipe, e o banco
 * os guarda ao lado do número (`profissionais.horario`/`.folga`). A leitura prefere o texto
 * gravado, então quem muda o número tem de regravar o texto junto, senão a Equipe segue
 * dizendo "Seg–Sáb 09–19" depois de a agenda mudar. Moram aqui, e não no adaptador do
 * banco, porque os dois adaptadores (banco e demonstração) precisam da mesma frase. */

const SIGLAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** 9 vira "09" e 9,5 vira "09:30". */
const horaCurta = (h: number): string => {
  const inteira = Math.floor(h);
  const min = Math.round((h - inteira) * 60);
  return min === 0 ? String(inteira).padStart(2, "0") : hhmm(h);
};

/** "Seg–Sáb 09–19". Dias seguidos viram faixa; com buraco no meio, lista: "Seg, Qua, Sex 09–19". */
export function fraseDoHorario(e: Expediente): string {
  const atende = [0, 1, 2, 3, 4, 5, 6].filter((d) => !e.folga.includes(d));
  if (atende.length === 0) return "Sem expediente";
  const faixa = `${horaCurta(e.de)}–${horaCurta(e.ate)}`;
  const seguido = atende.every((d, i) => i === 0 || d === atende[i - 1] + 1);
  const dias = seguido && atende.length > 1
    ? `${SIGLAS[atende[0]]}–${SIGLAS[atende[atende.length - 1]]}`
    : atende.map((d) => SIGLAS[d]).join(", ");
  return `${dias} ${faixa}`;
}

/** "domingo", "sábado e domingo", "segunda, quarta e domingo". */
export function fraseDeFolga(folga: readonly number[]): string {
  if (folga.length === 0) return "sem folga fixa";
  const nomes = [...folga].sort((a, b) => a - b).map((d) => DOW_LONGO[d] ?? "?");
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** As duas frases do par, para gravar junto do número. */
export const frasesDoExpediente = (e: Expediente): { horario: string; folga: string } => ({
  horario: fraseDoHorario(e),
  folga: fraseDeFolga(e.folga),
});
