/* ─────────────────────────────────────────────────────────────────────────────
 * O DISJUNTOR — quando a conversa deixou de ser conversa.
 *
 * Pedido do Bruno em 27/10/2026. A MAISA fala pela Evolution, um WhatsApp Web não oficial,
 * e o que derruba um número assim é volume. O pior volume possível não vem de cliente
 * nenhum: vem da MAISA presa num laço com OUTRO robô. A resposta automática de uma loja
 * ("Olá! Recebemos sua mensagem…") responde a ela, ela responde de volta, e cada volta são
 * duas ou três mensagens saindo do número do negócio, sem fim, pagando token.
 *
 * O laço com ela mesma já é fechado na entrada (`fromMe` cai fora, ver `contexto.ts`). Este
 * arquivo fecha o laço com os outros, e só olhando a thread: nenhum estado novo, o que
 * conta é o que já está gravado.
 *
 * Duas regras, e qualquer uma desarma:
 *   • a mesma mensagem longa chegando pela TERCEIRA vez em dez minutos. Gente não cola o
 *     mesmo parágrafo três vezes; resposta automática faz isso sempre;
 *   • DOZE respostas da MAISA em dez minutos para a mesma pessoa. Uma conversa de
 *     agendamento de verdade tem de três a oito, espalhadas, e com o "digitando…" (ver
 *     `canal-evolution.ts`) cada resposta leva de 10 a 25 s: doze em dez minutos é alguém
 *     respondendo sem ler. A bancada (`avaliacao/`) para em dez turnos, abaixo da régua.
 *
 * Desarmado, a MAISA para de responder AQUELA pessoa e chama o dono. Volta sozinha quando a
 * janela esvazia; se do outro lado era um robô, ele parou junto, porque só respondia a ela.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Msg } from "@/nucleo/dominio/conversas";

export const JANELA_MS = 10 * 60_000;
export const MAX_RESPOSTAS_NA_JANELA = 12;
const VEZES_DA_MESMA = 3;
/** "oi", "ok" e "??" se repetem em conversa de gente. Abaixo disto, repetir não diz nada. */
const TAMANHO_MINIMO_DA_REPETIDA = 15;

/** Sem `em` (a fala que acabou de chegar ainda não tem), conta como agora. */
const instante = (m: Msg, agora: number) => (m.em ? Date.parse(m.em) : agora);
const normal = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Quantas RESPOSTAS da MAISA (bolhas seguidas contam como uma) terminaram depois de `desde`. */
export function respostasDesde(msgs: Msg[], desde: number, agora: number): number {
  let n = 0;
  for (let i = 0; i < msgs.length; i++) {
    const fimDaResposta = msgs[i].de === "bot" && msgs[i + 1]?.de !== "bot";
    if (fimDaResposta && instante(msgs[i], agora) >= desde) n++;
  }
  return n;
}

/**
 * A conversa virou laço? Devolve o motivo, numa frase que vai para o dono, ou `null`.
 *
 * `msgs` é a thread em ordem, com a fala que acabou de chegar no fim.
 */
export function pareceLaco(msgs: Msg[], agora: number): string | null {
  const desde = agora - JANELA_MS;

  const ultima = msgs[msgs.length - 1];
  if (ultima?.de === "cliente") {
    const essa = normal(ultima.txt);
    if (essa.length >= TAMANHO_MINIMO_DA_REPETIDA) {
      const iguais = msgs.filter((m) => m.de === "cliente" && instante(m, agora) >= desde && normal(m.txt) === essa).length;
      if (iguais >= VEZES_DA_MESMA) {
        return `a mesma mensagem chegou ${iguais} vezes em 10 minutos, o que parece resposta automática de outro robô`;
      }
    }
  }

  const respostas = respostasDesde(msgs, desde, agora);
  if (respostas >= MAX_RESPOSTAS_NA_JANELA) {
    return `a MAISA já respondeu ${respostas} vezes em 10 minutos, rápido demais para ser conversa com gente`;
  }
  return null;
}
