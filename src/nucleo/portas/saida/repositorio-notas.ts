/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — as notas emitidas, e o que falta emitir.
 *
 * ★ ESTA PORTA EXISTE PARA IMPEDIR NOTA FISCAL DUPLICADA.
 *
 * Antes dela, "já emitiu" morava no `localStorage` do navegador, mapeado por cliente. Trocar
 * de aparelho ressuscitava o botão de emitir, e clicar emitia o SEGUNDO documento fiscal para
 * o mesmo serviço. Nota autorizada não se apaga: cancela-se na prefeitura, com justificativa,
 * e há cidade que não aceita cancelamento por webservice nenhum.
 *
 * ── ⚠️ A ORDEM É `abrir` → EMITIR → `concluir`, E PARECE INVERTIDA ──
 *
 * `abrir` marca os atendimentos ANTES de a nota existir na prefeitura. A alternativa — emitir
 * primeiro e marcar depois — deixa, numa falha entre as duas coisas, uma nota autorizada lá
 * com os atendimentos ainda "a faturar" aqui. A próxima tentativa emitiria a segunda, e
 * ninguém saberia até o cliente receber duas notas.
 *
 * Marcando primeiro, a falha deixa uma nota `erro` com os atendimentos presos a ela: visível
 * na tela, retentável, e sem reabrir a porta da duplicação. É a mesma escolha de
 * `reservar_lembretes()` (`supabase/010`), que marca `lembrete_em` antes de mandar a mensagem
 * pelo mesmo motivo — e o comentário de lá diz o que acontece quando se inverte.
 *
 * ── O QUE ESTA PORTA NÃO ACEITA ──
 *
 * **Valor.** Nem em `abrir`, nem em lugar nenhum. Quem soma é o banco, sobre as linhas que
 * acabou de prender. Receber o total de fora significa que uma tela aberta há dez minutos
 * emite nota com valor que não corresponde ao que foi marcado — e que um POST forjado emite
 * qualquer valor, para qualquer CPF, sob o CNPJ do dono. Era exatamente o que
 * `/api/nf/emitir` aceitava até 17/08/2026.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { AFaturar, AmbienteFiscal, NotaGravada, ResultadoDeNota } from "../../dominio/fiscal";

/** O que a claim conseguiu prender. */
export type NotaAberta = {
  id: string;
  ref: string;
  /** Somado pelo banco sobre os atendimentos presos. Nunca vem de fora. */
  valor: number;
  atendimentos: number;
  competencia: string | null;
  discriminacao: string;
  /** Snapshot do tomador, copiado na abertura — a nota não muda se o cadastro mudar. */
  tomador: { nome: string | null; cpf: string | null; email: string | null; telefone: string | null };
};

export interface RepositorioNotas {
  /**
   * O que falta emitir, por cliente: atendimentos **já prestados** e ainda sem nota.
   *
   * ⚠️ "Já prestados" é `inicio < agora`, e não `etapa = 'feito'`. `etapa` é o kanban que o
   * dono arrasta à mão; amarrar faturamento a isso faria quem não arrasta nunca faturar. Já
   * "o horário começou e ninguém cancelou" é sinal que existe sozinho.
   *
   * Inclui o cliente de teste fiscal com `teste: true` — quem decide tirá-lo do lote é a
   * aplicação, porque em produção ele emite uma nota REAL e um botão de fechar o mês não
   * deveria disparar isso sem alguém pedir.
   */
  aFaturar(t: ContextoTenant): Promise<AFaturar[]>;

  /**
   * A CLAIM. Cria a nota e prende nela os atendimentos daquele cliente, numa transação só.
   *
   * ⚠️ Devolve `null` quando não havia nada a faturar — e isso NÃO é erro. É o duplo clique,
   * ou a segunda aba, chegando depois da primeira. Quem chama responde "já foi", nunca
   * "falhou": um erro aqui faria o dono clicar de novo.
   *
   * Quem implementa em Postgres usa `for update skip locked`, para a segunda transação
   * enxergar zero em vez de esperar e emitir a nota seguinte.
   */
  abrir(t: ContextoTenant, p: {
    clienteId: string;
    /** Cunhada pelo caso de uso. A Focus recusa `ref` repetida. */
    ref: string;
    ambiente: AmbienteFiscal;
    discriminacao: string;
    /**
     * Só estes atendimentos (27/10/2026): a nota de um pagamento confirmado, e não a do mês. Em
     * Postgres é `abrir_nota_dos_atendimentos` (038), a mesma claim com a lista. Ausente = todos
     * os do cliente sem nota, como sempre.
     */
    atendimentoIds?: string[];
  }): Promise<NotaAberta | null>;

  /**
   * Grava o desfecho da emissão na nota já aberta.
   *
   * ⚠️ NUNCA solta os atendimentos, nem quando o resultado é `erro`. Eles ficam presos à nota
   * que falhou — é isso que faz a retentativa reaproveitar a mesma nota em vez de abrir uma
   * segunda. Soltar seria devolver o cliente à lista de "a faturar" com uma nota dele já em
   * voo na prefeitura.
   */
  concluir(t: ContextoTenant, notaId: string, r: ResultadoDeNota): Promise<void>;

  /**
   * Reabre uma nota que deu erro, com `ref` nova, mantendo os atendimentos presos.
   *
   * `ref` nova e não a mesma: se a prefeitura chegou a aceitar antes de rejeitar, a antiga
   * está queimada no provedor e reusá-la devolve "referência duplicada" — erro que não tem
   * nada a ver com o problema real e manda procurar no lugar errado.
   */
  reabrir(t: ContextoTenant, notaId: string, novaRef: string): Promise<void>;

  /** As notas do inquilino, mais recentes primeiro. É o histórico que a tela mostra. */
  listar(t: ContextoTenant): Promise<NotaGravada[]>;

  /** Uma nota pela referência do provedor. `null` quando não é nossa. */
  porRef(t: ContextoTenant, ref: string): Promise<NotaGravada | null>;
}
