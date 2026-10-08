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
 * ── O PDF VAI JUNTO (desde 01/10/2026) ──
 *
 * Quando o canal devolve o comprovante, a MAISA manda o PDF (`nomeDoPdf`) com a notícia de
 * `avisoDeRecibo` como legenda; sem PDF, manda só a notícia. No "primeiro para mim", a dona recebe
 * o mesmo que o paciente receberia, pronto para encaminhar, com uma linha antes dizendo de quem é.
 *
 * ── ★ UM MÊS POR RECIBO (08/10/2026) ──
 *
 * O dia diz QUANDO; `corteDoRecibo` diz QUAIS sessões. Dia 31 é "o último dia do mês" e fecha o
 * próprio mês; qualquer outro dia fecha o mês anterior. Ver `corteDoRecibo`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { diasEntre, diasNoMes, mesDe, nomeMes, rotuloBR, rotuloDoMes, somarMeses } from "./tempo";
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

/** O dia que a ficha mostra como "Último dia do mês" (Bruno, 08/10/2026: "dia 31 quer dizer sempre o último dia do mês"). */
export const ULTIMO_DIA_DO_MES = 31;

/**
 * Até quando, SEM incluir, entram as sessões no recibo que sai em `dataDoRecibo`.
 *
 * Dia 31 fecha o próprio mês: entram as sessões dele até a véspera. Qualquer outro dia fecha o
 * mês ANTERIOR: entram só os meses que já acabaram.
 *
 * ★ Até 08/10/2026 entrava "tudo até a véspera", e com um recibo por mês isso partia o mês ao
 * meio. Dia 10: em 10 de novembro saíam DOIS recibos (10 a 31 de outubro, e 1º a 9 de novembro),
 * e outubro já tinha tido um em 10 de outubro. Quem escolhe dia 10 paga ou reembolsa o mês
 * fechado nesse dia; quem quer o mês corrente no fim dele escolhe o último dia.
 *
 * ⚠️ O 29 e o 30 NÃO são "último dia", mesmo quando caem nele (o 30 de novembro): a regra mudaria
 * de mês para mês e o mesmo paciente receberia dois meses juntos num e nada no outro.
 *
 * ⚠️ O preço do último dia: a rotina roda às 9h, então a sessão do PRÓPRIO último dia ainda não
 * aconteceu e fica para a rodada do mês seguinte, num recibo dela sozinha (meses diferentes nunca
 * vão juntos). Mudar isso pede rodar a rotina à noite, e aí a mensagem chega ao paciente à noite.
 */
export function corteDoRecibo(dia: number, dataDoRecibo: string): string {
  return dia >= ULTIMO_DIA_DO_MES ? dataDoRecibo : `${mesDe(dataDoRecibo)}-01`;
}

/** O mês (AAAA-MM) que o recibo de `dataDoRecibo` fecha. É o que a ficha diz ao lado do próximo dia. */
export function mesQueOReciboFecha(dia: number, dataDoRecibo: string): string {
  return dia >= ULTIMO_DIA_DO_MES ? mesDe(dataDoRecibo) : somarMeses(mesDe(dataDoRecibo), -1);
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
  const n = recibo.sessoes ?? 1;
  const doQue = n > 1
    ? `${n} atendimentos de ${rotuloDoMes(recibo.data.slice(0, 10))}`
    : `atendimento de ${rotuloBR(recibo.data.slice(0, 10))}`;
  return (
    `Recibo emitido: ${quem}, ${doQue}, R$ ${valorBrasileiro(recibo.valor)}. ` +
    (temTelefone
      ? "O recibo e a mensagem abaixo estão prontos para você encaminhar."
      : "Não há telefone no cadastro dessa pessoa; o recibo e a mensagem abaixo estão prontos, se quiser mandar por outro caminho.")
  );
}

/**
 * O nome do arquivo do PDF no WhatsApp (01/10/2026). É o que a pessoa vê na conversa e na pasta de
 * downloads, então diz de quem e de quando, e nada do serviço.
 */
export function nomeDoPdf(recibo: ReciboAvisavel): string {
  const quem = (recibo.nome ?? "").trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ") || "paciente";
  const ano = recibo.data.slice(0, 4);
  const quando = (recibo.sessoes ?? 1) > 1
    ? `${nomeMes(mesDe(recibo.data))} ${ano}`
    : rotuloBR(recibo.data.slice(0, 10)).replace(/\//g, "-");
  return `Recibo ${quem} ${quando}.pdf`;
}
