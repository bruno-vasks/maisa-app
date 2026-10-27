/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — os recebimentos: o Pix que a MAISA mandou e os comprovantes que voltaram.
 *
 * Ver `dominio/recebimentos.ts` para o que é um recebimento e por que ele existe. Esta porta
 * guarda; as regras (qual cobrança o comprovante paga, quem recebeu, quando perguntar) são do
 * domínio, puras, e o caso de uso as aplica antes de chamar aqui.
 *
 * ── O QUE PRECISA SER ATÔMICO, E POR ISSO MORA AQUI ──
 *
 *   • `criar` prende os atendimentos numa transação com o recebimento: um atendimento ativo em
 *     uma cobrança só. A rotina e o botão "Mandar Pix" ao mesmo tempo não cobram duas vezes.
 *   • `mudar` tem guarda: só muda quem está numa das situações esperadas. O "1" no WhatsApp e o
 *     clique no painel ao mesmo tempo dão uma decisão, não duas.
 *   • `confirmarComprovante` paga o recebimento e confirma o comprovante juntos.
 *   • `registrarComprovante` recusa a mesma transação Pix (e a mesma mensagem) duas vezes.
 *
 * O VALOR NUNCA VEM DE QUEM CHAMA. `criar` soma os atendimentos no banco, como `abrir_nota`:
 * um pedido forjado não escolhe quanto o cliente vai pagar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type {
  AtendimentoACobrar, ComprovanteDePagamento, Conferencia, ConfigDeRecebimentos, DadosDoComprovante,
  FormaDoPagamento, Recebimento, SituacaoDoComprovante, SituacaoDoRecebimento,
} from "../../dominio/recebimentos";

export type NovoRecebimento = {
  /** Cunhado pelo caso de uso: o identificador do Pix sai dele antes de a linha existir. */
  id: string;
  identificador: string;
  situacao: "perguntar" | "aberto";
  descricao: string;
  /** Todos da mesma pessoa. O banco recusa misturar. */
  atendimentoIds: string[];
};

export type NovoComprovante = DadosDoComprovante & {
  telefone: string;
  recebimentoId: string | null;
  conferencia: Conferencia;
  /** O id da mensagem no WhatsApp: a reentrega do mesmo evento não registra duas vezes. */
  mensagemId: string | null;
};

/** Quem paga "por mês" e tem dia de recibo: é no dia dele que o Pix do mês sai. */
export type ClientePorMes = { clienteId: string; diaRecibo: number };

export interface RepositorioRecebimentos {
  /** Os ajustes. Sem linha, `RECEBIMENTOS_DESLIGADOS`. */
  config(t: ContextoTenant): Promise<ConfigDeRecebimentos>;
  salvarConfig(t: ContextoTenant, c: ConfigDeRecebimentos): Promise<void>;

  /**
   * Os negócios com chave Pix configurada. ⚠️ SEM INQUILINO, como `negociosComEnvio` da fila: é a
   * rotina perguntando por quem passar. Só service role.
   */
  negociosComRecebimento(): Promise<string[]>;

  /** Atendimentos que acabaram na janela, com valor e telefone, de quem segue o padrão do negócio,
   *  e que não estão em cobrança nenhuma. A janela vem de `janelaDepoisDoAtendimento`. */
  atendimentosQueAcabaram(t: ContextoTenant, janela: { desde: string; ate: string }): Promise<AtendimentoACobrar[]>;
  clientesPorMes(t: ContextoTenant): Promise<ClientePorMes[]>;
  /** As sessões de `desde` (inclusive) a `ate` (exclusive) desta pessoa, fora de cobrança. */
  sessoesDoMes(t: ContextoTenant, p: { clienteId: string; desde: string; ate: string }): Promise<AtendimentoACobrar[]>;
  /** Um atendimento, para o botão "Mandar Pix", com a cobrança ativa em que ele já está, se estiver. */
  atendimento(t: ContextoTenant, id: string): Promise<(AtendimentoACobrar & { recebimentoId: string | null }) | null>;
  /** Os atendimentos em cobrança que ainda não foi paga. O recibo automático não os emite antes do pagamento. */
  atendimentosEmCobranca(t: ContextoTenant): Promise<string[]>;

  /**
   * Cria e prende os atendimentos. `null` quando um deles já está em outra cobrança ativa: quem
   * chama entende "já foi", não erro. Lança `DadoInvalido` quando o pedido não faz sentido
   * (atendimento de outro negócio, cancelado, sem telefone, sem valor, duas pessoas).
   */
  criar(t: ContextoTenant, r: NovoRecebimento): Promise<Recebimento | null>;
  porId(t: ContextoTenant, id: string): Promise<Recebimento | null>;
  /** `perguntar` e `aberto`, mais antigos primeiro. Com telefone, só os dele. */
  emAberto(t: ContextoTenant, p?: { telefone?: string }): Promise<Recebimento[]>;
  /** Pagos desde o instante dado, mais recentes primeiro. É o "recebidos" da tela. */
  pagos(t: ContextoTenant, p: { desde: string }): Promise<Recebimento[]>;

  /** A transição, com guarda. `null`: não estava em nenhuma de `de` (outra decisão chegou antes). */
  mudar(t: ContextoTenant, id: string, p: {
    de: SituacaoDoRecebimento[];
    para: SituacaoDoRecebimento;
    forma?: FormaDoPagamento;
    /** Quem decidiu, para o histórico (`rotuloDoAtor`). */
    por: string;
  }): Promise<Recebimento | null>;
  /** Quando a pergunta foi ao WhatsApp do dono, ou quando o CPF foi pedido ao cliente. */
  anotar(t: ContextoTenant, id: string, p: { perguntadoEm?: string; cpfPedidoEm?: string }): Promise<void>;
  /** Os pagos deste telefone esperando o CPF para o documento sair: pediu, e a ficha ainda não tem. */
  esperandoCpf(t: ContextoTenant, telefone: string): Promise<Recebimento[]>;

  /** Registra o que foi lido. `repetido`: a mesma transação ou a mesma mensagem já estava lá. */
  registrarComprovante(t: ContextoTenant, c: NovoComprovante): Promise<{ id: string | null; repetido: boolean }>;
  comprovantes(t: ContextoTenant, p: { situacao: SituacaoDoComprovante }): Promise<ComprovanteDePagamento[]>;
  /** Confirma o comprovante e paga o recebimento, juntos. Lança `DadoInvalido` com o motivo. */
  confirmarComprovante(t: ContextoTenant, p: { id: string; recebimentoId: string; por: string }): Promise<Recebimento>;
  /** `false` quando já tinha sido conferido. Lança `DadoInvalido` sem motivo. */
  descartarComprovante(t: ContextoTenant, p: { id: string; motivo: string; por: string }): Promise<boolean>;
}
