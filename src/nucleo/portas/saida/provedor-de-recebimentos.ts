/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — o provedor de recebimentos: a subconta no nome do profissional (27/10/2026).
 *
 * A opção B do pedido vindo do Smiller, ATRÁS DE FLAG. A conta da PLATAFORMA no provedor (o Asaas)
 * abre uma subconta no CPF ou CNPJ do profissional, sem ele ver o provedor; a cobrança vira uma
 * página com Pix, boleto e cartão, e o aviso de pagamento dá a baixa sozinho.
 *
 * ── O QUE NÃO PASSA POR AQUI: A CHAVE ──
 *
 * A porta do Smiller recebe a chave da conta em cada chamada. Aqui ela recebe o negócio, e quem
 * acha a chave é o adaptador, no cofre (`CofreDeRecebimentos`): o núcleo nunca vê segredo, como
 * com o token da Focus.
 *
 * ── O QUE AINDA NÃO ESTÁ GARANTIDO (e por isso a flag) ──
 *
 * Fora do período de avaliação (60 dias, 10 subcontas), a chave da subconta só vem com o modelo BaaS
 * habilitado no acordo com o Asaas; também não se sabe se o split para a conta da plataforma é
 * aceito, nem como o profissional saca. Ver `smiller/wt-pix/docs/financeiro.md`, seção 4b.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";

export type SituacaoDaConta = "sem_conta" | "pendente" | "em_analise" | "aprovada" | "recusada";

export type ContaDeRecebimentos = {
  situacao: SituacaoDaConta;
  /** O que falta o profissional fazer, em frase de tela, com o link de envio quando há. */
  pendencias: { titulo: string; link: string | null }[];
};

/** Quem a subconta vai representar: o profissional. */
export type DadosDoTitular = {
  /** CPF (11) ou CNPJ (14), só dígitos. */
  documento: string;
  nome: string;
  email: string;
  celular: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  /** Faturamento mensal aproximado, em reais. O provedor exige. */
  faturamentoMensal: number;
  /** AAAA-MM-DD. Só para CPF. */
  nascimento?: string | null;
  /** Só para CNPJ. */
  tipoDeEmpresa?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION" | null;
};

export type PedidoDeCobranca = {
  /** O id do recebimento. Volta no aviso de pagamento. */
  referencia: string;
  valor: number;
  /** AAAA-MM-DD. O provedor recusa vencimento no passado. */
  vencimento: string;
  descricao: string;
  pagador: { nome: string; documento: string; telefone: string | null; referencia: string };
};

export type CobrancaNoProvedor = { idExterno: string; link: string; pixCopiaECola: string | null };

/** O aviso do provedor, no nosso vocabulário. */
export type EventoDePagamento =
  | { tipo: "paga"; idExterno: string; referencia: string | null; valorPago: number; pagoEm: string }
  | { tipo: "estornada" | "cancelada"; idExterno: string; referencia: string | null }
  | { tipo: "ignorado"; evento: string };

export interface ProvedorDeRecebimentos {
  /** Ligado na plataforma: a flag e a conta da plataforma configuradas. Sem isso, a opção B não existe. */
  disponivel(): boolean;
  /**
   * A conta deste negócio. `sem_conta` antes de abrir. Sem `conferir`, a situação guardada (é o que a
   * cobrança consulta, e não custa chamada); com `conferir`, pergunta ao provedor e guarda.
   */
  conta(t: ContextoTenant, p?: { conferir?: boolean }): Promise<ContaDeRecebimentos>;
  /** Abre a subconta. Lança `DadoInvalido` com a frase do provedor quando ele recusa os dados. */
  abrirConta(t: ContextoTenant, dados: DadosDoTitular): Promise<ContaDeRecebimentos>;
  /** Só com a conta aprovada. */
  emitir(t: ContextoTenant, pedido: PedidoDeCobranca): Promise<CobrancaNoProvedor>;
  cancelar(t: ContextoTenant, idExterno: string): Promise<void>;
  /** Traduz o corpo do aviso. Não confere autenticidade: o token é conferido antes, por quem recebe o HTTP. */
  lerEvento(corpo: unknown): EventoDePagamento | null;
}
