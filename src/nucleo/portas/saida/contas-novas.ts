/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — as contas que acabaram de nascer em `auth.users` (22/10/2026).
 *
 * Existe para o aviso de cadastro novo (`aplicacao/aviso-de-cadastro.ts`): o trigger do banco
 * manda só o id da conta, e é por aqui que o servidor relê o resto. Nada do payload além do id é
 * levado em conta.
 *
 * ⚠️ SEM `ContextoTenant`, como `FilaDeLembretes` e `AgendaDeRecibos`. Uma conta recém-criada
 * ainda não tem negócio (o `/assinar` cria o negócio DEPOIS do `signUp`), então não há inquilino
 * para dizer. O LIMITE desta porta:
 *   · lê UMA conta, pelo id, e devolve só os campos de `ContaNova` — e-mail, data, o que o
 *     `/assinar` gravou no metadata e o nome do negócio, se ele já existir. Nada de senha, token
 *     ou do metadata inteiro;
 *   · a única escrita é a marca de "já avisado" daquela conta, que não é dado de negócio nenhum.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContaNova } from "../../dominio/aviso-de-cadastro";

export interface ContasNovas {
  /** A conta, ou `null` se o id não existe em `auth.users`. */
  ler(id: string): Promise<ContaNova | null>;

  /**
   * Grava "o aviso desta conta saiu em `quando`". É a trava contra o segundo e-mail: quem lê
   * `avisadaEm` preenchido não manda de novo. Durável (sobrevive a deploy e a outra instância).
   */
  marcarAvisada(id: string, quando: string): Promise<void>;

  /** Desfaz a marca, para um envio que falhou inteiro poder ser tentado de novo. */
  desmarcarAvisada(id: string): Promise<void>;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
