/* ─────────────────────────────────────────────────────────────────────────────
 * O RECIBO AUTOMÁTICO — o dia de cada paciente, e para quem a notícia vai.
 *
 * ★ PEDIDO DA REGINA (01/10/2026), a primeira usuária: *"receber os recibos automaticamente,
 * num dia fixo do mês, e escolher o dia que cada paciente gostaria de receber"*, e *"escolher se
 * o recibo vai direto para o paciente ou primeiro para mim"*.
 *
 * As duas coisas são independentes, e é por isso que moram em lugares diferentes:
 *
 *   · o DIA é da pessoa atendida (`Cliente.diaRecibo`, migração 032). Ele decide QUANDO a MAISA
 *     emite sozinha. Vazio = nunca sozinha; a dona continua emitindo pela tela quando quiser;
 *   · o DESTINO é do negócio (`avisarRecibo` + `reciboPrimeiroParaMim`, nos ajustes). Ele decide
 *     para quem vai a mensagem de "seu recibo saiu", e vale para todo recibo, automático ou não.
 *
 * ── ⚠️ A MAISA NÃO MANDA O PDF ──
 *
 * Manda a notícia, pelo mesmo motivo de `avisoDeRecibo`: o recibo já está no app da Receita do
 * paciente e na declaração pré-preenchida dele. No "primeiro para mim", a dona recebe a mesma
 * mensagem que o paciente receberia, pronta para encaminhar, com uma linha antes dizendo de quem é.
 * ────────────────────────────────────────────────────────────────────────────── */

import { diasEntre, diasNoMes, mesDe, rotuloBR, somarMeses } from "./tempo";
import { valorBrasileiro, type ReciboAvisavel } from "./recibo-saude";

/**
 * Quantos dias a rotina ainda atende um dia de recibo que passou: o próprio dia e os dois seguintes.
 *
 * Existe porque a rotina roda uma vez por dia (o cron da Vercel, no plano Hobby) e pode não rodar,
 * ou rodar e não dar conta de todos dentro do tempo da função. Sem a folga, um dia perdido seria
 * um mês inteiro sem recibo automático. Repetir não emite duas vezes: o que já entrou num recibo
 * sai da lista de pendentes (`abrir_recibo_unitario` prende o pagamento antes de falar com a Receita).
 */
export const FOLGA_DO_RECIBO_AUTOMATICO = 3;

/** O dia de recibo vindo de fora: `null` (não emite sozinha) ou um inteiro de 1 a 31. */
export function diaDoReciboValido(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31);
}

/** A data do recibo naquele mês: o dia escolhido, ou o último dia do mês, se ele for mais curto. */
export function diaDoReciboNoMes(dia: number, anoMes: string): string {
  return `${anoMes}-${String(Math.min(dia, diasNoMes(anoMes))).padStart(2, "0")}`;
}

/**
 * O dia de recibo que a rotina deve atender `hoje`, ou `null`.
 *
 * Olha o mês corrente E o anterior: o dia 31 de outubro cai no 31, mas o de setembro cai no 30, e a
 * folga do dia 30 de setembro atravessa para 1º e 2 de outubro.
 */
export function diaDoReciboAlcancado(dia: number, hoje: string): string | null {
  for (const anoMes of [mesDe(hoje), somarMeses(mesDe(hoje), -1)]) {
    const data = diaDoReciboNoMes(dia, anoMes);
    const atraso = diasEntre(data, hoje);
    if (atraso >= 0 && atraso < FOLGA_DO_RECIBO_AUTOMATICO) return data;
  }
  return null;
}

/** O próximo dia em que o recibo sai, contando hoje. É o que a ficha da pessoa mostra. */
export function proximoDiaDoRecibo(dia: number, hoje: string): string {
  const neste = diaDoReciboNoMes(dia, mesDe(hoje));
  return neste >= hoje ? neste : diaDoReciboNoMes(dia, somarMeses(mesDe(hoje), 1));
}

/**
 * Para onde vai o "primeiro para mim".
 *
 * O número de avisos (`telefoneDono`, a tela "Quem a MAISA chama quando precisa de ajuda"), e, sem
 * ele, o próprio número conectado. A MAISA roda no WhatsApp pessoal da dona na maioria dos casos, e
 * aí "para mim" é a conversa dela consigo mesma, que todo WhatsApp tem. A Regina não preencheu o
 * número de avisos (medido em 01/10/2026): sem esta segunda opção, o recibo dela não iria a lugar
 * nenhum.
 *
 * ⚠️ Não há laço: o que a MAISA manda volta pelo webhook como `fromMe` vindo da web, e é descartado
 * em `whatsapp/contexto.ts` mesmo com o modo de teste ligado.
 */
export function numeroDaDona(canal: { telefoneDono: string | null; numero: string | null } | null): string | null {
  return canal?.telefoneDono || canal?.numero || null;
}

/**
 * A linha que vai ANTES do aviso, quando ele vai para a dona: de quem é o recibo.
 *
 * Nome inteiro, e não só o primeiro como no aviso ao paciente: aqui quem lê é a dona, e duas Anas
 * na agenda são o caso comum. Sem o nome do serviço, pelo mesmo motivo de `avisoDeRecibo`.
 */
export function cabecalhoParaADona(recibo: ReciboAvisavel, temTelefone: boolean): string {
  const quem = (recibo.nome ?? "").trim() || "um paciente sem nome no cadastro";
  return (
    `Recibo emitido: ${quem}, atendimento de ${rotuloBR(recibo.data.slice(0, 10))}, R$ ${valorBrasileiro(recibo.valor)}. ` +
    (temTelefone
      ? "A mensagem abaixo está pronta para você encaminhar."
      : "Não há telefone no cadastro dessa pessoa; a mensagem abaixo está pronta, se quiser mandar por outro caminho.")
  );
}
