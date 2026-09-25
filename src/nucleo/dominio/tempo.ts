/* ─────────────────────────────────────────────────────────────────────────────
 * TEMPO — a linguagem de calendário do domínio.
 *
 * O app fala em DATA CIVIL ("2026-08-06") mais HORA DECIMAL (14.5 = 14:30). O mundo
 * lá fora (Google, banco, nota fiscal) fala em INSTANTE com fuso. Este módulo é o
 * único lugar que sabe traduzir entre os dois — e é PURO: nada de Next, React,
 * fetch ou variável de ambiente. Roda igual no servidor, no navegador e, amanhã,
 * dentro do agente de WhatsApp.
 *
 * Por que string ISO e não `Date`: uma `Date` é um INSTANTE, e instante carrega fuso.
 * `new Date("2026-08-06")` é meia-noite UTC, que em São Paulo é dia 5 às 21h — o
 * clássico erro de um dia. "2026-08-06" é uma DATA CIVIL e não tem esse problema.
 * De quebra, comparar duas datas ISO com `<` já é comparação cronológica, e elas
 * servem de chave de Map e de key de React sem conversão.
 * ────────────────────────────────────────────────────────────────────────────── */

export const TZ = "America/Sao_Paulo";

/** Brasil não usa mais horário de verão desde 2019, então o offset é fixo. */
const FUSO = "-03:00";

const p2 = (n: number) => String(n).padStart(2, "0");

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Semana começando na segunda — convenção pt-BR. Domingo é a última coluna. */
export const DOW_CURTO = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
export const DOW_LONGO = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/* A aritmética toda roda em UTC, e isso é proposital: UTC não tem horário de verão,
   então somar 86.400.000 ms é somar exatamente um dia — sempre. Com data local, um
   país com DST faria "somar 1 dia" cair no mesmo dia ou pular dois, duas vezes por ano. */
const emUTC = (data: string) => new Date(`${data}T00:00:00Z`);
const paraISO = (d: Date) => d.toISOString().slice(0, 10);

export const somarDias = (data: string, n: number) =>
  paraISO(new Date(emUTC(data).getTime() + n * 86_400_000));

/** Índice do dia da semana: 0 = segunda … 6 = domingo. */
export const dowDoDia = (data: string) => (emUTC(data).getUTCDay() + 6) % 7;

export const diaDoMes = (data: string) => Number(data.slice(8, 10));
/** "2026-08-06" → "2026-08". */
export const mesDe = (data: string) => data.slice(0, 7);
export const nomeMes = (anoMes: string) => MESES[Number(anoMes.slice(5, 7)) - 1];
export const anoDe = (anoMes: string) => anoMes.slice(0, 4);

/** Dia 0 do mês SEGUINTE é o último do mês pedido — a forma sem tabela de bissexto. */
export const diasNoMes = (anoMes: string) =>
  new Date(Date.UTC(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)), 0)).getUTCDate();

export function somarMeses(anoMes: string, n: number): string {
  const total = Number(anoMes.slice(0, 4)) * 12 + Number(anoMes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${p2((total % 12) + 1)}`;
}

/** Data válida de verdade: "2026-02-31" passa em qualquer regex e é um dia que não existe. */
export const ehDataCivil = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Distância em dias entre duas datas civis (b − a). */
export const diasEntre = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/* ───────────────────────────── rótulos ───────────────────────────── */

/** "6 de agosto" */
export const rotuloDia = (data: string) => `${diaDoMes(data)} de ${nomeMes(mesDe(data))}`;
/** "quinta, 6 de agosto" */
export const rotuloLongo = (data: string) => `${DOW_LONGO[dowDoDia(data)]}, ${rotuloDia(data)}`;
/** "06/08/2026" — formato de documento (a nota fiscal usa este). */
export const rotuloBR = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/**
 * "2026-09-24" (ou "2026-09") → "setembro de 2026". O mês que a tela diz.
 *
 * Nasceu em 25/09/2026 (T5 do backlog do front) para matar `D.PERIODO`, o "Junho de 2026"
 * escrito à mão que o painel mostrava em setembro em dez lugares. Minúsculo, como o pt-BR
 * escreve mês no meio da frase; quem abre frase com ele capitaliza.
 */
export function rotuloDoMes(iso: string): string {
  return `${nomeMes(mesDe(iso))} de ${anoDe(iso)}`;
}

/**
 * O mês de um fechamento, a partir das competências que o servidor devolveu (contradição C12:
 * quem tem competência do servidor passa a competência; sem nenhuma, vale o mês de `hoje`).
 * Duas ou mais: "agosto a setembro de 2026" (ou com os dois anos, se virou o ano), porque
 * pendência de mês passado é o caso normal de quem emite por lote, e dizer só o último mês
 * esconderia o anterior.
 */
export function rotuloDaCompetencia(competencias: readonly string[], hoje: string): string {
  const meses = [...new Set(competencias.filter((c) => /^\d{4}-\d{2}/.test(c)).map(mesDe))].sort();
  if (meses.length === 0) return rotuloDoMes(hoje);
  const [de, ate] = [meses[0], meses[meses.length - 1]];
  if (de === ate) return rotuloDoMes(de);
  return anoDe(de) === anoDe(ate)
    ? `${nomeMes(de)} a ${rotuloDoMes(ate)}`
    : `${rotuloDoMes(de)} a ${rotuloDoMes(ate)}`;
}

/** Hora decimal → "HH:MM". 9.5 → "09:30". */
export const hhmm = (v: number) => {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${p2(h)}:${p2(m)}`;
};

/* ───────────────────────────── hoje ───────────────────────────── */

/**
 * Hoje em São Paulo, "YYYY-MM-DD".
 *
 * O navegador roda em BRT e a Vercel em UTC; sem correção os dois discordariam sobre
 * qual é o dia entre 21h e meia-noite — e discordar do fuso é justamente o que quebra
 * a hidratação do React. Deslocamos o instante e lemos com getters UTC, então os dois
 * chegam ao mesmo dia civil. Brasil não usa horário de verão desde 2019 ⇒ -3 fixo.
 */
export function hojeISO(agora = Date.now()): string {
  return new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * "Hoje".
 *
 * GETTERS, não valores. Um `const HOJE = {...}` é avaliado uma vez, na carga do
 * módulo — e no servidor o módulo fica em memória entre requisições, então "hoje"
 * congelaria na data do deploy e a agenda destacaria o dia errado para sempre. Com
 * getter, cada leitura pergunta de novo.
 */
export const HOJE = {
  /** "2026-08-06" — a identidade do dia em todo o app. */
  get iso() { return hojeISO(); },
  /** "quinta, 6 de agosto" */
  get label() { return rotuloLongo(hojeISO()); },
  /** "QUI" */
  get dow() { return DOW_CURTO[dowDoDia(hojeISO())]; },
  /** "06/08/2026" */
  get data() { return rotuloBR(hojeISO()); },
};

/* ───────────────────────────── semana e mês ───────────────────────────── */

/** Os seis dias úteis (seg–sáb) da semana de uma data. Atravessa a virada de mês. */
export function semanaDoDia(data: string): string[] {
  const segunda = somarDias(data, -dowDoDia(data));
  return Array.from({ length: 6 }, (_, i) => somarDias(segunda, i));
}

/** Célula da grade de mês. `noMes: false` são os dias vizinhos que fecham as semanas. */
export type CelulaMes = { chave: string; data: string; noMes: boolean };

/** A grade inteira, em múltiplos de 7 — sempre semanas completas, de segunda a domingo. */
export function celulasDoMes(anoMes: string): CelulaMes[] {
  const primeiro = `${anoMes}-01`;
  const antes = dowDoDia(primeiro);
  const inicio = somarDias(primeiro, -antes);
  const total = Math.ceil((antes + diasNoMes(anoMes)) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const data = somarDias(inicio, i);
    // chave = a própria data: `c${i}` fazia o React reaproveitar o nó da célula 12 de
    // agosto como célula 12 de setembro, e a animação do contador vazava entre meses.
    return { chave: data, data, noMes: mesDe(data) === anoMes };
  });
}

/** Uma janela fechada de datas civis. É o que se pede a uma agenda externa. */
export type Janela = { de: string; ate: string };

/**
 * Primeira e última data DESENHADAS na grade de um mês — os vizinhos que completam as
 * semanas entram.
 *
 * É também a janela que a Agenda busca no Google, e uma janela só serve às três visões.
 * O motivo é geométrico: a grade cobre semanas inteiras, então a semana de QUALQUER dia
 * do mês cabe dentro dela — inclusive a que atravessa a virada. Trocar de visão não
 * dispara request nenhum.
 */
export function janelaDoMes(anoMes: string): Janela {
  const c = celulasDoMes(anoMes);
  return { de: c[0].data, ate: c[c.length - 1].data };
}

/* ───────────────────────────── data civil ⇄ instante ─────────────────────────────
 * A fronteira com quem fala em instante. Antes isto morava dentro do adaptador do
 * Google (`lib/google/datas.ts`), e era o lugar errado por dois motivos: a gaveta
 * mostra a data do evento ANTES de criá-lo (ou seja, o navegador precisa da mesma
 * conta), e o agente de WhatsApp vai precisar dela sem nunca falar HTTP com o Google. */

/**
 * Data civil + hora decimal → instante ISO com offset explícito de São Paulo.
 * Ex.: ("2026-08-07", 14.5) → "2026-08-07T14:30:00-03:00".
 *
 * Montado como string, e não via `Date.toISOString()`: assim o horário é exatamente
 * o que está escrito na tela, sem depender do fuso do processo que gerou.
 */
export function instanteISO(data: string, horaDecimal: number): string {
  const h = Math.floor(horaDecimal);
  const m = Math.round((horaDecimal - h) * 60);
  return `${data}T${p2(h)}:${p2(m)}:00${FUSO}`;
}

/**
 * O caminho de volta: instante → data civil e hora decimal de São Paulo.
 *
 * Via `Intl`, e não por regex no texto. O Google devolve o `dateTime` no fuso que
 * quiser — o da agenda, UTC (`…17:30:00Z`), o de quem criou o evento — e ler os
 * dígitos depois do "T" trataria 17:30Z como 17:30, três horas de deslocamento em
 * silêncio. Pedimos `timeZone=America/Sao_Paulo` na listagem, mas isso é um pedido;
 * esta função é a garantia.
 */
const RELOGIO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export function civilSP(iso: string): { data: string; hora: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const p: Record<string, string> = {};
  for (const parte of RELOGIO.formatToParts(new Date(ms))) p[parte.type] = parte.value;
  // `% 24` porque com hour12:false o ICU escreve meia-noite como "24" em algumas
  // versões — e "24:00" viraria uma hora decimal fora do dia.
  const hora = (Number(p.hour) % 24) + Number(p.minute) / 60;
  return { data: `${p.year}-${p.month}-${p.day}`, hora };
}

/** "quinta, 6 de agosto" a partir do instante gravado. */
export function rotuloDeISO(iso: string): string {
  const c = civilSP(iso);
  return c ? rotuloLongo(c.data) : "data indisponível";
}

/** "14:30" a partir do instante gravado, já em horário de São Paulo. */
export function horaDeISO(iso: string): string {
  const c = civilSP(iso);
  return c ? hhmm(c.hora) : "--:--";
}

/**
 * Data/hora ATUAL em São Paulo, em ISO com offset.
 *
 * `new Date().toISOString()` seria UTC e, depois das 21h em SP, já estaria no dia
 * seguinte — a prefeitura rejeita nota com "emissão superior à data de hoje".
 */
export function agoraSP(): string {
  const c = civilSP(new Date().toISOString());
  if (!c) return new Date().toISOString();
  const h = Math.floor(c.hora);
  const m = Math.floor((c.hora - h) * 60);
  const s = new Date().getUTCSeconds();
  return `${c.data}T${p2(h)}:${p2(m)}:${p2(s)}${FUSO}`;
}
