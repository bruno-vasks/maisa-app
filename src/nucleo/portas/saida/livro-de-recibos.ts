/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — o livro-razão da emissão unitária. DDL em `supabase/020_recibo_unitario.sql`.
 *
 * ★ ELE NASCEU PORT SEPARADO EM VEZ DE CRESCER O `RepositorioRecibos`, e a razão é a regra do
 * `CLAUDE.md`: mudar uma porta muda todos os adaptadores dela de uma vez. Aquela tem dois
 * adaptadores e três dublês de teste. Este custa um demo — que a guarda exige de qualquer jeito
 * — e não toca em nada que já funciona.
 *
 * A invariante de "um pagamento sai por UM canal" **não mora aqui**: mora no banco, na
 * `v_a_recibar` (que exclui `lote_recibo_id` e `recibo_id`) e nas duas funções. Então separar os
 * ports não separou a invariante — que era a única objeção real.
 *
 * ── ⚠️ TRÊS ESTADOS DE ESCRITA, E A ORDEM ENTRE ELES É A GARANTIA ──
 *
 *   `abrir`              tranca o pagamento e cria a linha    ANTES de falar com o canal
 *   `registrarProtocolo` grava o que o canal devolveu          DEPOIS de ele aceitar
 *   `fechar`             grava o desfecho                      quando o callback chega
 *
 * Inverter os dois primeiros abre uma janela em que o pagamento está livre e a emissão já saiu.
 * Dois cliques nessa janela emitem dois recibos, e **nenhum dos dois aparece como duplicata no
 * banco** — cada um com sua linha, cada um convencido de ser o primeiro.
 *
 * ── ⚠️ O ESTADO QUE NINGUÉM PLANEJA: `pendente` SEM PROTOCOLO ──
 *
 * Entre `abrir` e `registrarProtocolo` o processo pode morrer. Sobra uma linha que diz "trancei
 * este pagamento" e não diz o que aconteceu com ele — não há protocolo para perguntar ao canal.
 *
 * Isso é irreconciliável por definição, e a resposta certa é **mostrar para um humano**, não
 * adivinhar. Soltar seria emitir de novo por cima de um recibo que talvez exista; deixar quieto
 * seria um pagamento que desaparece do faturamento para sempre. Ver `precisaDeOlhoHumano`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { DesfechoDoAviso } from "../../dominio/recibo-unitario";
import type { ContextoTenant } from "../../dominio/tenant";
import type {
  CanalDeEmissao, DesfechoDeRecibo, ReciboEmitido,
} from "../../dominio/recibo-unitario";
import type { FontePagamento } from "./repositorio-recibos";

/** O que a claim devolve. `valor` vem do BANCO — ver o porquê no método. */
export type ReciboAberto = {
  id: string;
  /**
   * O protocolo, quando o canal exige inteiro.
   *
   * ★ SAI DA MESMA TRANSAÇÃO QUE PRENDEU O PAGAMENTO, e é isso que importa: pedir o número
   * depois, ao adaptador, faria o protocolo existir só quando o canal já tivesse aceitado — de
   * volta à janela do `pendente` sem protocolo que esta porta existe para fechar.
   *
   * Inteiro porque a Rebots recusa uuid no `receipt_id` (`RECEIPT_ERROR_024`), medido no sandbox
   * em 25/08/2026. Ver `PedidoDeRecibo.referencia`.
   */
  numero: number;
  valor: number;
};

/** Para quem vai o aviso de um recibo — ver `LivroDeRecibos.destinatario`. */
export type DestinatarioDoRecibo = {
  nome: string | null;
  /** `null` quando não há para onde mandar. Quem chama conta, não falha. */
  telefone: string | null;
  /** Data do pagamento, ISO. É ela que vira dd/mm na mensagem. Num recibo que junta sessões, a
   *  da última. */
  data: string;
  /** A soma, num recibo que junta sessões. */
  valor: number;
  /** Quantas sessões o recibo leva (01/10/2026). 1 = o recibo de uma sessão, como era. */
  sessoes: number;
};

export interface LivroDeRecibos {
  /**
   * A CLAIM. Tranca o pagamento e cria a linha do razão, na mesma transação.
   *
   * ⚠️ Devolve `null` quando o pagamento já está preso — por um lote, por outro recibo, ou por
   * um segundo clique. **Não é erro**: quem chama responde "já foi", como em
   * `RepositorioRecibos.abrirLote`.
   *
   * `valor` vem do banco e nunca de quem chama, pelo mesmo motivo de `abrir_nota`: tela aberta
   * há dez minutos manda total velho, e total velho aqui vira **documento fiscal de valor
   * errado**, que só se conserta cancelando.
   */
  abrir(t: ContextoTenant, p: {
    /** Um ou mais pagamentos DA MESMA PESSOA, no mesmo mês (01/10/2026: um recibo por mês). Mais
     *  de um é TUDO OU NADA: se um já estiver preso, nenhum é preso. Ver `abrir_recibo_agrupado`. */
    itens: { fonte: FontePagamento; id: string }[];
    canal: CanalDeEmissao;
  }): Promise<ReciboAberto | null>;

  /**
   * Grava o protocolo que o canal devolveu ao aceitar.
   *
   * É o que torna a linha reconciliável: sem protocolo não há o que perguntar ao canal. Chamar
   * o mais rápido possível depois de `emitir` não é otimização, é a diferença entre um pendente
   * resolvível e um que precisa de gente.
   */
  registrarProtocolo(t: ContextoTenant, p: { reciboId: string; protocolo: string }): Promise<void>;

  /**
   * Grava o desfecho — vindo do callback ou da reconciliação.
   *
   * ⚠️ **IDEMPOTENTE.** Devolve `null` quando não havia nada para mudar. O mesmo callback
   * entregue duas vezes é rotina em qualquer webhook; e o callback pode chegar no instante em
   * que a reconciliação está perguntando a mesma coisa. Sem esta guarda, os dois caminhos
   * disparariam duas vezes o que vem depois — inclusive o aviso ao paciente.
   *
   * ── ⚠️ DE ONDE ELE ACEITA SAIR, E POR QUE NÃO É SÓ `pendente` ──
   *
   *   `pendente` → `emitido` · `recusado`     o desfecho da emissão
   *   `emitido`  → `cancelado`                o desfecho do cancelamento
   *
   * A segunda linha faltava até 25/08/2026, e a falta tinha uma consequência silenciosa: quando
   * o canal confirmasse um cancelamento, a linha já não estaria `pendente` — estaria `emitido` —
   * então `fechar` não acharia nada, devolveria `null`, e a rota responderia "já fechado". O
   * cancelamento seria perdido, e a tela seguiria dizendo "emitido" para um documento que não
   * existe mais.
   *
   * Qualquer outra transição continua não existindo. `recusado` → `emitido` inventaria um
   * documento; `cancelado` → qualquer coisa reescreveria um ato fiscal já consumado.
   */
  fechar(t: ContextoTenant, d: DesfechoDeRecibo): Promise<ReciboEmitido | null>;

  /**
   * Recusa o PEDIDO e solta o pagamento, numa coisa só.
   *
   * ★ EXISTE PORQUE `fechar` BUSCA POR PROTOCOLO, E AQUI AINDA NÃO HÁ PROTOCOLO. Este é o
   * caminho de quando o canal recusa o pedido na hora — dado inválido, emissor não habilitado —
   * antes de devolver qualquer identificador. A primeira versão passava o nosso `reciboId` no
   * lugar do protocolo e não casava com nada: a linha ficava `pendente` para sempre e o
   * pagamento, trancado, desaparecia do faturamento por causa de um CPF digitado errado.
   *
   * ⚠️ RECUSA DO PEDIDO ≠ RECUSA DA RECEITA. Aqui **nada foi emitido**, e por isso devolver o
   * pagamento à lista é seguro. A recusa da Receita chega minutos depois, no callback, e passa
   * por `fechar`.
   *
   * As duas coisas são um método só porque nunca acontecem separadas — e separá-las deixaria
   * existir o estado "recusado mas ainda trancado", que não quer dizer nada.
   */
  descartar(t: ContextoTenant, p: { reciboId: string; erro: string }): Promise<void>;

  /**
   * Solta o pagamento de volta para a lista.
   *
   * ⚠️ **SÓ A PARTIR DE `recusado`** — a função no banco recusa o resto, e é de propósito.
   * Soltar um `pendente` devolve à fila um pagamento cujo recibo pode existir; soltar um
   * `emitido` faz o lote do mês seguinte emitir o segundo. `false` = não soltou.
   */
  soltar(t: ContextoTenant, reciboId: string): Promise<boolean>;

  /**
   * Por protocolo — porque o callback chega falando o idioma do canal, não o nosso.
   *
   * `null` quando não existe, e a rota do callback trata isso como **404 e não como erro**: um
   * POST com protocolo desconhecido é ruído, tentativa de terceiro, ou reentrega de algo que já
   * foi apagado. Nada disso é motivo para 500.
   */
  porProtocolo(t: ContextoTenant, p: {
    canal: CanalDeEmissao;
    protocolo: string;
  }): Promise<ReciboEmitido | null>;

  /**
   * Os `pendente` nascidos antes de `antesDe` — a fila da reconciliação.
   *
   * Inclui os **sem protocolo**, de propósito: são justamente os que precisam de olho humano, e
   * omiti-los aqui os tornaria invisíveis para sempre.
   */
  pendentes(t: ContextoTenant, p: { antesDe: string }): Promise<ReciboEmitido[]>;

  /** O histórico, mais recente primeiro. Para a tela. */
  listar(t: ContextoTenant, p?: { limite?: number }): Promise<ReciboEmitido[]>;

  /**
   * ★ QUEM AVISAR quando este recibo sair — nome, telefone, data e valor do pagamento.
   *
   * O livro-razão guarda o desfecho, não a pessoa: `ReciboEmitido` tem protocolo e chave, e nada
   * de nome. Quem tem nome é o PAGAMENTO que a linha trancou, e é ele que esta consulta alcança
   * (o atendimento, ou o avulso), passando pelo cadastro para chegar ao telefone.
   *
   * ⚠️ `null` = ninguém a avisar, e isso NÃO é erro. O avulso de quem não é cadastro não tem
   * telefone; um pagamento apagado depois não tem nada. Quem chama não manda mensagem e segue —
   * o recibo já existe, e falhar aqui faria a rota do callback pedir reentrega de algo gravado.
   *
   * ⚠️ E `telefone` pode ser `null` com o resto preenchido: cliente cadastrado sem telefone. Mesma
   * distinção de `DestinatarioDeRecibo` no lote, e pelo mesmo motivo — quem chama conta, não falha.
   */
  destinatario(t: ContextoTenant, reciboId: string): Promise<DestinatarioDoRecibo | null>;

  /**
   * ★ GRAVA O QUE ACONTECEU COM A MENSAGEM AO PACIENTE.
   *
   * ⚠️ ESCREVE RELATÓRIO, NUNCA DESFECHO FISCAL. Falhar aqui não pode mudar o estado do recibo —
   * o documento já existe, e "não consegui anotar que avisei" não desemite nada. Quem chama engole.
   *
   * Existe porque o aviso engole o erro por desenho, e o que ele engolia não aparecia em lugar
   * nenhum: 19 mensagens falharam em 26/08/2026 e ninguém soube. Ver a migração 025.
   */
  registrarAviso(t: ContextoTenant, p: { reciboId: string; desfecho: DesfechoDoAviso }): Promise<void>;

  /**
   * Quantos pacientes NÃO foram avisados — o número que a tela mostra.
   *
   * ⚠️ Só `falhou` e `sem_telefone`, porque só esses dois pedem ação de alguém: um telefone para
   * conferir, uma ficha para completar. `enviado` e `desligado` não são pendência.
   */
  avisosPendentes(t: ContextoTenant): Promise<{ falhou: number; semTelefone: number }>;
}
