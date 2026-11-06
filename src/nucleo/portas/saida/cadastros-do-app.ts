/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — as contas do app, vistas pela casa (05/11/2026).
 *
 * A maisa da maisa (ver `dominio/vendas.ts`) precisa saber duas coisas que moram fora do negócio
 * dela: quem acabou de criar conta e em que passo cada um parou. É por aqui.
 *
 * ⚠️ SEM `ContextoTenant`, como `ContasNovas`: a pergunta atravessa negócios por natureza ("quem
 * criou conta no app?"). O LIMITE desta porta:
 *   · só LÊ, e só devolve os campos de `CadastroNoApp`: nome e telefone da pessoa, nome e vertical
 *     do negócio, se o WhatsApp está conectado, até quando vai o teste e o pagamento. Nada de
 *     senha, token, e-mail, metadata inteiro, cliente, agenda ou conversa de negócio nenhum;
 *   · quem chama é só a casa (`aplicacao/vendas.ts`), com o inquilino dela vindo da configuração
 *     (`MAISA_NEGOCIO_DA_CASA`), nunca de um pedido.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CadastroNoApp } from "../../dominio/vendas";

export interface CadastrosDoApp {
  /** As contas criadas a partir de `desde` (ISO), da mais nova para a mais velha. */
  recentes(desde: string): Promise<CadastroNoApp[]>;

  /** A conta cujo telefone termina nos mesmos 8 dígitos. `null` = ninguém com esse número. */
  porTelefone(telefone: string): Promise<CadastroNoApp | null>;

  /** O que falta no ambiente para esta porta funcionar. Vazio = pronta. */
  faltando(): string[];
}
