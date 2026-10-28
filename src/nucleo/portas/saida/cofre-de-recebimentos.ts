/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — o cofre da subconta de recebimentos (27/10/2026, a opção B).
 *
 * ⚠️ QUEM USA ESTA PORTA É O ADAPTADOR DO PROVEDOR, NUNCA O NÚCLEO. Ela devolve a chave da subconta,
 * que o provedor só mostra uma vez, na criação. Mora em `portas/` para o adaptador do Asaas e o do
 * banco se encontrarem em `composicao.ts` sem um importar o outro; nenhum caso de uso a recebe.
 *
 * No Supabase, a chave vai para o Vault e a tabela guarda só o id do segredo (039).
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { SituacaoDaConta } from "./provedor-de-recebimentos";

export type ContaGuardada = {
  ambiente: "sandbox" | "producao";
  idConta: string;
  walletId: string | null;
  situacao: Exclude<SituacaoDaConta, "sem_conta">;
  /** A chave da subconta. Sai daqui só para o adaptador do provedor. */
  chave: string;
};

export interface CofreDeRecebimentos {
  ler(t: ContextoTenant): Promise<ContaGuardada | null>;
  /** Grava a conta recém-aberta, com o hash do token do aviso. Recusa a segunda conta do mesmo negócio. */
  guardar(t: ContextoTenant, c: ContaGuardada & { hashDoToken: string }): Promise<void>;
  atualizarSituacao(t: ContextoTenant, situacao: ContaGuardada["situacao"]): Promise<void>;
  /**
   * De qual negócio é este aviso. ⚠️ SEM INQUILINO: o aviso chega sem sessão, e o token (pelo hash)
   * é o que diz de quem é. `null`: token desconhecido.
   */
  negocioDoToken(hashDoToken: string): Promise<string | null>;
}
