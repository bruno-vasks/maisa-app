/* ─────────────────────────────────────────────────────────────────────────────
 * A MAISA ESTÁ ATENDENDO? Uma resposta só, derivada de duas leituras.
 *
 * Até 24/09/2026 cada lugar respondia do seu jeito. A topbar pulsava "MAISA no ar" olhando só
 * `assistente.ativa`; os Ajustes diziam "Assistente ativa · responde automaticamente" em verde
 * com a faixa logo abaixo dizendo "WhatsApp não conectado"; o Fluxo dizia "resolvendo tudo
 * sozinha" para uma conta que nunca conectou o WhatsApp. Três telas, duas respostas opostas na
 * mesma dobra (auditoria do front, T3 do backlog).
 *
 * A pergunta tem DUAS metades e as duas precisam ser verdade: o interruptor ligado E o canal
 * conectado. Interruptor ligado com o WhatsApp caído é silêncio do lado do cliente, igual a
 * pausada.
 *
 * ── OS QUATRO ESTADOS ──
 *
 *   conferindo ... alguma das duas leituras ainda não voltou. A tela desenha esqueleto, sem
 *                  texto e sem botão: chutar "no ar" ou "Conectar" por dois segundos é a
 *                  mesma mentira, mais curta.
 *   atendendo .... ligada e conectada.
 *   pausada ...... conectada e desligada. As mensagens esperam o dono.
 *   sem_whatsapp . o canal não está conectado (desconectado, pareando, ou a leitura FALHOU).
 *                  Vence o interruptor: desligado ou ligado, ela não responde ninguém.
 *
 * ⚠️ LEITURA DO CANAL QUE FALHOU É `sem_whatsapp`, NÃO `conferindo`. Mesmo padrão seguro de
 * `statusDeEstadoEvolution`: dizer "conectado" sem prova faz o dono ir embora achando que
 * terminou. Quem chama passa `"desconectado"` quando a leitura falhou; a frase do erro fica
 * com a tela.
 *
 * O quinto estado, `calada` (modo pessoal com o caderno vazio), entra quando o painel passar a
 * ler `/api/contatos` (Onda 2 do backlog).
 *
 * Os RÓTULOS não moram aqui (regra do domínio: nada de apresentação). Moram em
 * `ui/componentes/StatusDaMaisa.tsx`, e o guarda G11 reprova quem os escrever em outro lugar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { StatusDoCanal } from "./canal";

export type StatusDaMaisa = "conferindo" | "atendendo" | "pausada" | "sem_whatsapp";

export function statusDaMaisa(p: {
  /** O interruptor mestre. `null` = os ajustes ainda não voltaram do servidor. */
  ativa: boolean | null;
  /** O canal. `null` = a leitura ainda não voltou. Leitura que falhou chega como `"desconectado"`. */
  canal: StatusDoCanal | null;
}): StatusDaMaisa {
  if (p.canal !== null && p.canal !== "conectado") return "sem_whatsapp";
  if (p.canal === null || p.ativa === null) return "conferindo";
  return p.ativa ? "atendendo" : "pausada";
}
