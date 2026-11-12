/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — os pagamentos que ainda não entraram num lote do Receita Saúde.
 *
 * ★ É A IRMÃ DE `RepositorioNotas`, COM UMA DIFERENÇA QUE MUDA O DESENHO: aqui a emissão
 * acontece FORA da nossa mão. Nós montamos o arquivo; quem emite é o profissional, dentro do
 * e-CAC, importando e assinando. Não existe resposta de provedor para gravar.
 *
 * ── ⚠️ POR QUE A UNIDADE É O ATENDIMENTO, E NÃO O CLIENTE ──
 *
 * `RepositorioNotas.aFaturar` agrega por cliente: uma nota fecha o mês de alguém. O lote do
 * Receita Saúde é o oposto — **uma linha por pagamento**, com a data em que ele aconteceu,
 * porque o manual manda emitir "na data do pagamento" e o plano de saúde pede a data da
 * sessão para reembolsar. Agregar aqui destruiria exatamente o dado pelo qual o paciente quer
 * o recibo.
 *
 * ── A CLAIM, PELO MESMO MOTIVO DE SEMPRE, E COM UMA SAÍDA A MAIS ──
 *
 * `abrirLote` prende os atendimentos ANTES de o arquivo ir para a mão do dono, como
 * `abrir_nota` faz. Sem isso, o arquivo do mês seguinte traria as mesmas sessões e ela
 * emitiria recibo em dobro — que se cancela em dez dias, um por um, e que o paciente já viu.
 *
 * A diferença é que aqui a emissão pode simplesmente NÃO ACONTECER: ela baixa o arquivo e
 * desiste. Daí `descartarLote`, que solta os atendimentos de volta. Em `notas` esse caminho
 * não existe de propósito (nota autorizada não se apaga); aqui ele é obrigatório, senão um
 * arquivo baixado por engano congela o faturamento do mês.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";

/**
 * De onde o pagamento veio.
 *
 * ★ A UNIDADE DO ARQUIVO SEMPRE FOI O PAGAMENTO, e o atendimento é só a fonte mais comum de
 * um. Sessão marcada por fora, pacote pago adiantado, paciente que voltou depois de meses:
 * tudo isso é pagamento recebido sem linha na agenda, e o recibo é obrigatório igual.
 *
 * A `fonte` viaja junto porque é ela que diz QUAL tabela a claim tranca. Um id de avulso
 * mandado como atendimento não trancaria nada — e a linha voltaria a aparecer no mês
 * seguinte, depois de o recibo já ter sido emitido.
 */
export type FontePagamento = "atendimento" | "avulso";

/** Um pagamento recebido, ainda fora de qualquer lote. */
export type PagamentoAFaturar = {
  id: string;
  fonte: FontePagamento;
  /** `null` num avulso de quem não é cadastro — e não obrigar isso é metade do "fluxo fácil". */
  clienteId: string | null;
  nome: string;
  /** CPF de quem foi atendido — o beneficiário do recibo. */
  cpf: string | null;
  /**
   * CPF de quem paga, quando não é o próprio paciente.
   *
   * ★ EXISTE PORQUE O CAMPO EXISTE NO ARQUIVO OFICIAL. Mãe que paga a terapia do filho
   * precisa do recibo no CPF dela — é ela que deduz no IRPF e pede reembolso. `null` significa
   * "paga por si", e o CSV repete o CPF do beneficiário nas duas colunas.
   */
  cpfPagador: string | null;
  /** Data civil do atendimento, em São Paulo. Vira a data do pagamento. */
  data: string;
  valor: number;
  /** Snapshot do serviço prestado — entra na descrição junto com a data. */
  servico: string | null;
  /** Cliente de teste. Fica fora do lote, como fica fora do lote de notas. */
  teste: boolean;
};

/** O que a claim prendeu, separado por fonte. */
export type LoteAberto = {
  id: string;
  competencia: string;
  linhas: number;
  /** Somado pelo banco sobre as linhas presas. Nunca vem de fora — ver `RepositorioNotas`. */
  valor: number;
  atendimentoIds: string[];
  avulsoIds: string[];
};

/** O que se digita para lançar um pagamento que não está na agenda. */
export type RascunhoAvulso = {
  /** Data do pagamento, civil. Nunca no futuro — ver o caso de uso. */
  data: string;
  valor: number;
  nome: string;
  cpf: string;
  /** Quem pagou, quando não é o próprio paciente. */
  cpfPagador?: string | null;
  /** Quando o paciente já é cadastro: nome e CPF passam a vir dele. */
  clienteId?: string | null;
  /** Bilhete do dono para ele mesmo. **Nunca sai no documento.** */
  observacao?: string | null;
};

/**
 * Uma pessoa do lote, para o aviso no WhatsApp.
 *
 * ⚠️ NÃO TRAZ O SERVIÇO, e a ausência é a regra: ver `avisoDeRecibo`. O que a mensagem precisa
 * é data e valor — o que o paciente confere — e nada do que foi tratado.
 */
export type DestinatarioDeRecibo = {
  nome: string | null;
  /** `null` no avulso de quem não é cadastro. Quem chama conta, não falha. */
  telefone: string | null;
  data: string;
  valor: number;
};

export type LoteGravado = {
  id: string;
  competencia: string | null;
  linhas: number;
  valor: number;
  criadoEm: string;
  /**
   * `gerado` — arquivo na mão do dono, atendimentos presos, ninguém importou ainda
   * `importado` — ele confirmou que passou no e-CAC. É o fim da linha
   * `descartado` — desistiu; os atendimentos voltaram para a lista
   *
   * ⚠️ NÃO EXISTE "EMITIDO" AQUI, e a ausência é o ponto: nós não sabemos. Quem sabe é o
   * e-CAC, e ele não nos conta. Chamar `gerado` de `emitido` seria a tela afirmando um fato
   * fiscal que ninguém verificou.
   */
  situacao: "gerado" | "importado" | "descartado";
};

export interface RepositorioRecibos {
  /** Os pagamentos sem lote, do mais antigo para o mais novo (é a ordem do arquivo). */
  pendentes(t: ContextoTenant, p: { ate: string }): Promise<PagamentoAFaturar[]>;

  /**
   * A CLAIM. Cria o lote e prende nele os atendimentos, numa transação só.
   *
   * ⚠️ Devolve `null` quando não sobrou nada para prender — segundo clique ou segunda aba,
   * e não é erro. Quem chama responde "já foi", como em `RepositorioNotas.abrir`.
   */
  abrirLote(t: ContextoTenant, p: {
    atendimentoIds: string[];
    avulsoIds: string[];
    competencia: string;
  }): Promise<LoteAberto | null>;

  /** Lança um pagamento fora da agenda. Devolve a linha já pronta para a lista. */
  lancarAvulso(t: ContextoTenant, p: RascunhoAvulso): Promise<PagamentoAFaturar>;

  /**
   * Apaga um lançamento avulso.
   *
   * ⚠️ SÓ ENQUANTO ELE NÃO ESTÁ EM LOTE. Depois de entrar num arquivo que o dono baixou, o
   * caminho é descartar o lote (que solta a linha) e então apagar — senão apagar aqui deixaria
   * o lote com uma linha a menos do que o CSV que já está no computador dele.
   */
  excluirAvulso(t: ContextoTenant, id: string): Promise<void>;

  /**
   * ★ A SESSÃO QUE NÃO ACONTECEU (12/11/2026, a Regina): o paciente faltou, e a sessão da agenda
   * não pode entrar no recibo do mês, nem no da tela, nem no automático.
   *
   * Marca o atendimento como `cancelado` NA TABELA, e só nela. Não passa pelo Google: cancelar lá
   * apagaria o evento e mandaria ao paciente um e-mail de cancelamento de uma sessão que já passou.
   * `update` e não `delete`, pela mesma regra de `RegistroDeAtendimentos.cancelar`.
   *
   * ⚠️ SÓ ENQUANTO ELA NÃO ESTÁ NUM RECIBO (`recibo_id` e `lote_recibo_id` vazios), decidido no
   * `where` da mesma instrução: o que já saiu se cancela na Receita, não aqui.
   *
   * Devolve a chave do atendimento (`maisaAg`, para a tela tirar da agenda local), ou `null`
   * quando nada mudou: já estava num recibo, já estava cancelado, ou não existe.
   */
  sessaoNaoAconteceu(t: ContextoTenant, atendimentoId: string): Promise<{ maisaAg: string | null } | null>;

  /**
   * O dono confirma que importou no e-CAC. Só muda a situação; nada é solto.
   *
   * ⚠️ DEVOLVE `false` QUANDO NÃO HAVIA NADA PARA MUDAR — segundo clique, segunda aba, ou um
   * lote que já foi descartado. É a mesma claim de sempre, e aqui ela tem uma consequência
   * externa: o aviso no WhatsApp do paciente sai DEPOIS desta transição. Sem o booleano, dois
   * cliques no "Importei" mandariam duas mensagens para a mesma pessoa sobre o mesmo recibo —
   * e mensagem entregue não se apaga.
   */
  confirmarLote(t: ContextoTenant, loteId: string): Promise<boolean>;

  /**
   * Quem entrou no lote, com telefone — para avisar no WhatsApp que o recibo saiu.
   *
   * ★ LÊ O QUE FICOU PRESO NO LOTE, e não a lista de pendentes: depois de `abrirLote` as
   * linhas saíram da `v_a_recibar` de propósito. É a única leitura do produto que pergunta
   * "quem estava naquele arquivo" — e ela existe só por causa do aviso.
   *
   * `telefone` vem `null` no lançamento avulso de quem não é cadastro. Não é erro: o recibo
   * foi emitido igual, e a Receita já notificou o paciente no app dela. Quem chama conta
   * quantos ficaram sem aviso e mostra o número na tela, em vez de falhar o lote inteiro por
   * causa de um telefone que ninguém digitou.
   */
  destinatariosDoLote(t: ContextoTenant, loteId: string): Promise<DestinatarioDeRecibo[]>;

  /** Ele desistiu: solta os atendimentos de volta para a lista. */
  descartarLote(t: ContextoTenant, loteId: string): Promise<void>;

  /** O histórico, mais recente primeiro. */
  listarLotes(t: ContextoTenant): Promise<LoteGravado[]>;
}
