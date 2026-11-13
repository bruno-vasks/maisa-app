/* ─────────────────────────────────────────────────────────────────────────────
 * A PRÉVIA DA CONVERSA: o que a maisa diria a um cliente com o que a pessoa acabou de escrever.
 *
 * Nasceu em 13/11/2026, com o onboarding curto. Entre três jeitos de mostrar a conversa, o Bruno
 * escolheu a "conversa ao lado": a cada pergunta respondida, a tela mostra um cliente perguntando
 * e a maisa respondendo com aquela informação ("é exatamente o que eu tava esperando").
 *
 * ⚠️ É ILUSTRAÇÃO, NÃO O AGENTE. O texto sai daqui, sem modelo nenhum, porque precisa mudar a cada
 * tecla. Por isso as frases são poucas, fixas e curtas. O agente de verdade fala com as próprias
 * palavras, a partir das mesmas informações.
 *
 * Funções puras, testadas em `previa.test.ts`. Vazio (`""`) quer dizer "ainda não há o que dizer",
 * e a tela mostra os três pontinhos.
 * ────────────────────────────────────────────────────────────────────────────── */

export type ServicoDaPrevia = { nome: string; duracao: number; preco: number | null };

/** O que o cliente pergunta em cada etapa. A ordem é a das etapas do wizard. */
export const PERGUNTAS_DO_CLIENTE = ["Oi, boa tarde!", "Quanto fica?", "Tem horário essa semana?"] as const;

/** Segunda (0) a sábado (5), a mesma convenção do expediente (`AjustarExpediente`). */
export const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DIAS_FALADOS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** "a", "a e b", "a, b e c". */
export const lista = (itens: readonly string[]): string =>
  itens.length <= 1 ? itens[0] ?? "" : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/** Com espaço que não quebra: "R$" e o número nunca ficam em linhas diferentes no balão. */
export const reais = (n: number): string =>
  `R$\u00a0${n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** 45 → "45 minutos", 60 → "1 hora", 90 → "1h30", 120 → "2 horas". */
export function duracaoFalada(min: number): string {
  if (min < 60) return `${min} minutos`;
  if (min === 60) return "1 hora";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h} horas`;
}

/** 9 → "9h", 9.5 → "9h30". */
export const horaFalada = (h: number): string => (h % 1 ? `${Math.floor(h)}h30` : `${h}h`);

/** [0..4] → "de segunda a sexta"; [5] → "aos sábados"; [0, 2, 4] → "segunda, quarta e sexta". */
export function diasFalados(dias: readonly number[]): string {
  const d = [...new Set(dias)].filter((x) => x >= 0 && x <= 5).sort((a, b) => a - b);
  if (d.length === 0) return "";
  if (d.length === 1) return d[0] === 5 ? "aos sábados" : `às ${DIAS_FALADOS[d[0]]}s`;
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (seguidos && d.length >= 3) return `de ${DIAS_FALADOS[d[0]]} a ${DIAS_FALADOS[d[d.length - 1]]}`;
  return lista(d.map((x) => DIAS_FALADOS[x]));
}

/** Etapa 1: como ela se apresenta. */
export function falaDoNegocio(negocio: string, nome: string): string {
  const neg = negocio.trim();
  const quem = nome.trim();
  if (!neg && !quem) return "";
  const oi = neg ? `Oi! Aqui é a maisa, do ${neg}.` : "Oi! Aqui é a maisa.";
  return quem ? `${oi} Quer marcar um horário com ${quem}?` : oi;
}

/** Etapa 2: o preço, quando perguntam. Três serviços no máximo, como numa conversa de verdade. */
export function falaDosServicos(servicos: readonly ServicoDaPrevia[]): string {
  const svs = servicos.filter((s) => s.nome.trim());
  if (svs.length === 0) return "";
  if (svs.length === 1) {
    const s = svs[0];
    return `${s.nome.trim()} ${s.preco ? `sai por ${reais(s.preco)} e ` : ""}leva ${duracaoFalada(s.duracao)}.`;
  }
  const itens = svs.slice(0, 3).map((s) => `${s.nome.trim().toLowerCase()}${s.preco ? ` (${reais(s.preco)})` : ""}`);
  return `Temos ${lista(itens)}${svs.length > 3 ? ", entre outros" : ""}.`;
}

/** Etapa 3: quando atende. */
export function falaDoHorario(nome: string, dias: readonly number[], de: number, ate: number): string {
  const quando = diasFalados(dias);
  if (!quando || ate <= de) return "";
  const quem = nome.trim();
  return `${quem ? `${quem} atende` : "Atendemos"} ${quando}, das ${horaFalada(de)} às ${horaFalada(ate)}. Qual dia fica melhor?`;
}

/** "59,90", "59.90" ou "1.200" → número; "0" vale (o serviço gratuito, que o cadastro aceita); vazio ou
 *  texto que não é número → `null`. */
export function precoDigitado(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  /* Com vírgula, o ponto é milhar. Sem vírgula, "1.200" (grupos de três) também é milhar; "59.90" é decimal. */
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
