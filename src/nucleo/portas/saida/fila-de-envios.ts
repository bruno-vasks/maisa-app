/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — a fila de envios (27/10/2026).
 *
 * A mensagem que sai sem ninguém ter escrito espera aqui a vez dela. Ver `dominio/envios.ts`
 * para o porquê, e a migração 036 para a regra da vez.
 *
 * ── A VEZ É DE QUEM GUARDA A FILA ──
 *
 * `reservar` só entrega uma mensagem de um negócio se nenhuma outra dele estiver saindo e se
 * a última que saiu tem pelo menos `espacoMs`. A regra mora no adaptador (no banco, de
 * verdade) porque cada retorno da Receita chega numa requisição própria, possivelmente noutra
 * instância da Vercel: um "espera 5 s" no processo não vê os outros. Reservar não é ler; ver
 * `fila-de-lembretes.ts`.
 *
 * ── O LIMITE DO QUE ATRAVESSA NEGÓCIOS ──
 *
 * `negociosComEnvio` é o único método sem `ContextoTenant`, e devolve só ids. É a pergunta
 * da rotina ("quem tem mensagem esperando?"), que não tem sessão nem dono. Tudo o que vem
 * depois é por negócio, com o `ContextoTenant` dele: reservar, concluir, devolver.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { EnvioNaFila, NovoEnvio } from "../../dominio/envios";

export interface FilaDeEnvios {
  /** Põe na fila, na ordem. Lança se não conseguir: quem enfileira manda direto, como antes
   *  da fila existir (é o caso de a migração 036 ainda não ter rodado). */
  enfileirar(t: ContextoTenant, envios: NovoEnvio[]): Promise<void>;

  /** Os negócios com mensagem vencida esperando. Só ids. Ver o limite no cabeçalho. */
  negociosComEnvio(): Promise<string[]>;

  /** A próxima mensagem deste negócio, se a vez dela chegou. `null` = nada a mandar agora. */
  reservar(t: ContextoTenant, espacoMs: number): Promise<EnvioNaFila | null>;

  /** Saiu. O conteúdo some da fila. */
  concluir(t: ContextoTenant, id: string): Promise<void>;

  /**
   * Não saiu. `desistir` quando a falha pode ter entregado (mandar de novo seria a pessoa
   * recebendo duas vezes); senão, a fila tenta de novo mais tarde, até desistir sozinha.
   * Devolve se desistiu. Não lança: quem chama já está tratando um erro.
   */
  devolver(t: ContextoTenant, id: string, p: { erro: string; desistir: boolean }): Promise<{ desistiu: boolean }>;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
