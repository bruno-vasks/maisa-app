/* ─────────────────────────────────────────────────────────────────────────────
 * A PESSOA ESTÁ PEDINDO HORÁRIO? — o portão do número novo no modo pessoal.
 *
 * Só roda para quem está fora do caderno E é número novo (ver `dominio/contatos.ts`). É a
 * segunda das duas condições, e a que separa "amiga do Kibe 🥰" de "queria marcar uma
 * sessão". A primeira sozinha não basta: o celular não sincroniza todo o histórico, e um
 * conhecido que não escrevia há anos parece novo.
 *
 * ⚠️ FALHA FECHADA EM TUDO. Resposta que não seja exatamente SIM, texto vazio, recusa,
 * exceção — tudo vira "não". O custo de um "não" errado é um lead que o dono vê na tela de
 * Conversas e responde à mão; o de um "sim" errado é a MAISA no WhatsApp de uma amiga.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ModeloDeConversa } from "../portas/saida/modelo-conversa";

export type DetectarPedidoDeHorario = (mensagensDoCliente: readonly string[]) => Promise<boolean>;

/** Quantas falas recentes entram. O pedido costuma vir na 2ª ou 3ª, depois do "oi". */
const FALAS = 6;

const SISTEMA = [
  "Você é um filtro de segurança, não um assistente. Não converse.",
  "Um número que nunca falou com este profissional escreveu para o WhatsApp PESSOAL dele.",
  "Leia as mensagens e responda com UMA palavra: SIM ou NAO.",
  "",
  "SIM somente se a pessoa pede, sem ambiguidade, para MARCAR, AGENDAR ou REMARCAR um horário,",
  "consulta, sessão ou atendimento — ou pergunta quais horários estão disponíveis para isso.",
  "",
  "NAO para todo o resto, inclusive: cumprimento (\"oi\", \"bom dia\"), apresentação",
  "(\"sou amiga de fulano\"), conversa pessoal, pergunta de preço sem pedido de horário,",
  "dúvida geral, mensagem que pode ser de amigo ou parente, e qualquer caso em que você",
  "não tenha certeza. Na dúvida, NAO.",
].join("\n");

export function criarDetectarPedidoDeHorario(deps: { modelo: () => ModeloDeConversa }): DetectarPedidoDeHorario {
  return async (mensagens) => {
    const falas = mensagens.map((m) => m.trim()).filter(Boolean).slice(-FALAS);
    if (falas.length === 0) return false;

    try {
      const r = await deps.modelo().conversar({
        sistemaEstavel: SISTEMA,
        sistemaVolatil: "Responda só SIM ou NAO.",
        ferramentas: [],
        turnos: [{ papel: "cliente", texto: falas.map((f, i) => `Mensagem ${i + 1}: ${f}`).join("\n") }],
        /* Folga para o pensamento do modelo: com orçamento curto ele pensa até o fim da cota
         * e devolve vazio — e vazio aqui é "não", o que calaria todo lead. Ver `MAX_TOKENS`
         * em `agente.ts`. */
        maxTokens: 1000,
      });
      if (r.recusou) return false;
      return /^\s*SIM\b/i.test(r.texto.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    } catch (e) {
      console.error(`[aplicacao/intencao] classificador falhou — tratando como NÃO: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };
}
