/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — onde a memória do cliente fica guardada.
 *
 * Duas portas, e é de propósito que sejam duas: **memória** é o perfil que atravessa
 * conversas (nome, favoritos), **histórico** é o texto da conversa corrente. Elas têm
 * ciclos de vida opostos — o perfil dura anos e é minúsculo, a thread dura horas e
 * cresce a cada mensagem — e vão terminar em tabelas com políticas de retenção
 * diferentes (a LGPD pede que a thread expire; o perfil o cliente pode querer que
 * fique). Uma interface só forçaria os dois a envelhecer juntos.
 *
 * ⚠️ Note o que o histórico NÃO fala: bloco de tool_use, papel de "assistant". Ele fala
 * `Msg` — o tipo que a tela de Conversas já usa. Se a porta falasse a língua do modelo,
 * trocar de modelo (ou de canal) viraria migração de banco, e o núcleo passaria a conhecer
 * um detalhe da Anthropic. O id da mensagem no provedor entra num lugar só, e só na ida:
 * `anexarRecebida`, como chave contra a reentrega. Ele nunca volta na leitura.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { MemoriaCliente } from "../../dominio/memoria";
import type { Msg, PosseDaConversa } from "../../dominio/conversas";

export interface RepositorioMemoria {
  /** `null` quando é a primeira vez que este número aparece. */
  ler(t: ContextoTenant, telefone: string): Promise<MemoriaCliente | null>;
  gravar(t: ContextoTenant, m: MemoriaCliente): Promise<void>;
}

/**
 * Uma conversa como o BANCO a conhece: a última fala, quem é o contato, e o que não dá para
 * derivar. Falta só `estado` — que é `estadoDaConversa()`, e mora no domínio de propósito.
 *
 * Existe porque a lista de conversas do painel não pode ser "leia todas as threads e pegue a
 * última de cada": isso é uma ida ao banco por conversa (N+1) para desenhar uma linha de
 * prévia. O adaptador resolve numa consulta só.
 */
export type ConversaGravada = {
  /** Os 8 últimos dígitos — a identidade da conversa (ver `dominio/conversas.ts`). */
  telefoneChave: string;
  /** Dígitos completos, com DDI. **Vazio** quando a thread é anterior à coluna: sem isso não
   *  se responde, e o painel precisa saber a diferença entre "não sei" e "sei". */
  telefone: string;
  nome?: string;
  clienteId?: string;
  ultima: Msg;
  atualizadaEm: string;
  posse: PosseDaConversa;
};

export interface RepositorioHistorico {
  /**
   * As últimas mensagens desta conversa, mais antiga primeiro.
   *
   * `limite` existe porque quem chama paga por token: o agente manda o histórico
   * inteiro ao modelo a cada mensagem recebida, então uma conversa de 300 turnos
   * sem teto custaria mais que o atendimento vale.
   */
  ler(t: ContextoTenant, telefone: string, limite: number): Promise<Msg[]>;

  /**
   * Acrescenta ao fim. Nunca reescreve o passado — thread é log, não estado.
   *
   * `telefone` vem com os dígitos que quem chama tiver: do webhook vem completo, e é essa
   * forma que precisa sobreviver aqui. A chave de 8 dígitos dá para derivar do número
   * completo; o caminho de volta não existe.
   */
  anexar(t: ContextoTenant, telefone: string, msgs: Msg[]): Promise<void>;

  /**
   * A fala que CHEGOU pelo canal, gravada uma vez só por mensagem (27/10/2026).
   *
   * É `anexar` de uma fala, mais `provedorId`, o id da mensagem no provedor de WhatsApp.
   * Devolve `false` quando essa mensagem já estava gravada: o provedor reentregou o mesmo
   * evento, e quem chama não responde de novo. Sem isto, cada reentrega era a conversa
   * rodando outra vez e o cliente recebendo a resposta em dobro.
   *
   * Falha que não seja a repetição devolve `true` e vai para o log, como em `anexar`:
   * responder uma reentrega é ruim, calar o cliente por um defeito nosso é pior.
   */
  anexarRecebida(t: ContextoTenant, telefone: string, msg: Msg, provedorId: string): Promise<boolean>;

  /**
   * A LISTA DO PAINEL: uma linha por conversa, mais recente primeiro.
   *
   * Mora nesta porta, e não numa terceira, porque lê a mesma coisa que `ler` — a thread. O
   * que muda é o consumidor: `ler` serve ao agente (que paga por token e quer poucas falas
   * de uma conversa), `conversas` serve à tela (que quer uma fala de muitas conversas).
   */
  conversas(t: ContextoTenant, limite: number): Promise<ConversaGravada[]>;

  /**
   * UMA conversa, pelo telefone. `null` se este número nunca falou com o negócio.
   *
   * Não é conveniência: é o que permite responder do painel sem confiar no número que o
   * navegador mandou. Quem responde manda a CHAVE (8 dígitos, que não serve para enviar
   * nada) e o servidor descobre para onde vai — logo só se responde a quem escreveu. Se a
   * rota aceitasse o número completo do corpo, o painel viraria um jeito de mandar WhatsApp
   * para qualquer telefone do Brasil pela instância do dono.
   */
  conversa(t: ContextoTenant, telefone: string): Promise<ConversaGravada | null>;
}

/**
 * PORTA DE SAÍDA — quem conduz cada conversa.
 *
 * A terceira porta deste arquivo, e o critério é o mesmo que separa memória de histórico:
 * ciclo de vida. Perfil dura anos, thread dura horas e só CRESCE, posse muda dez vezes na
 * mesma conversa e sempre por sobrescrita.
 *
 * ⚠️ ELA EXISTE PARA UMA COISA QUE NÃO É A TELA: fazer a MAISA CALAR A BOCA. O botão
 * "Assumir" prometia isso desde o primeiro dia, enquanto o estado morava no `localStorage`
 * do navegador — que o webhook nunca vê. O dono respondia à mão, o cliente respondia de
 * volta, e a MAISA falava por cima: duas vozes na mesma conversa, que é exatamente o que a
 * tela de Conversas foi desenhada para impedir. Estado compartilhado ou promessa quebrada;
 * não havia terceira opção.
 */
export interface RepositorioConversas {
  /** Só o que não é derivável. Vazio (`{}`) para conversa que ninguém tocou. */
  posse(t: ContextoTenant, telefone: string): Promise<PosseDaConversa>;

  /**
   * Assume/devolve e resolve/reabre. `undefined` em um campo é "não mexa nele" — devolver a
   * conversa não deve, de graça, reabrir o que o dono marcou como resolvido.
   */
  marcar(
    t: ContextoTenant,
    telefone: string,
    p: { assumida?: boolean; resolvida?: boolean },
  ): Promise<void>;
}
