/* ─────────────────────────────────────────────────────────────────────────────
 * CONVERSAS — o WhatsApp, do ponto de vista do domínio.
 *
 * Este arquivo dizia "hoje só existe como demonstração: o WhatsApp não está integrado, e
 * as threads são fixtures". Não mais. A tela de Conversas lê a MESMA thread que o agente
 * escreve (`mensagens_agente`), e a promessa que estava aqui — "quando a integração entrar,
 * o adaptador traduz a mensagem que chegou para `Msg` e o resto do app não muda de forma" —
 * é o que de fato aconteceu: `Msg` não mudou uma linha.
 *
 * ⚠️ A IDENTIDADE DE UMA CONVERSA É O TELEFONE, não um id sorteado.
 *
 * Era `cv1`, `cv2` — id de fixture. Não existe "id da conversa" no WhatsApp: existe um
 * número que fala com o negócio, e tudo que ele já disse. Se a conversa tivesse id próprio,
 * a segunda mensagem do mesmo número precisaria descobrir a qual conversa pertence, e a
 * resposta certa seria sempre "à do telefone dele". O id É o telefone.
 *
 * Mais precisamente: os 8 últimos dígitos (`telefone_chave`). É a normalização que casa o
 * "(11) 98123-4567" que alguém digitou no cadastro com o "5511981234567" que o webhook
 * entregou — DDI e nono dígito são justamente o que varia entre as duas grafias do MESMO
 * número. Ver `soDigitos` em `clientes.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * Quem está com a bola.
 *
 * ⚠️ TRÊS DESTES QUATRO SÃO DERIVADOS — ver `estadoDaConversa` no fim do arquivo. Nada no
 * banco guarda "estado": guardar o resultado de um cálculo que depende da última mensagem
 * criaria uma segunda verdade, e ela passaria a mentir no instante seguinte ao próximo "oi".
 *
 *   maisa  — a MAISA respondeu por último e está conduzindo sozinha
 *   espera — o cliente falou e ninguém respondeu: é a sua vez (a MAISA escalou, ou está
 *            desligada, ou você assumiu e ainda não respondeu)
 *   voce   — você assumiu; a MAISA está calada aqui até devolver
 *   ok     — você marcou como resolvida, e nada novo chegou desde então
 */
export type EstadoConversa = "maisa" | "espera" | "voce" | "ok";

/**
 * Uma conversa de WhatsApp, do jeito que a tela precisa dela: sem a thread inteira.
 *
 * A lista mostra 6, 40, 200 conversas — carregar todas as mensagens de todas elas para
 * exibir uma prévia de uma linha é o tipo de leitura que funciona no primeiro mês e derruba
 * a tela no sexto. Daí `ultima`: a última fala vem junto da linha da conversa, e a thread
 * completa só é buscada quando alguém abre.
 */
export type Conversa = {
  /** Os 8 últimos dígitos do telefone. Ver o cabeçalho: a identidade é o número. */
  id: string;
  /** Preenchido quando o número casa com alguém do cadastro. Lead não tem. */
  clienteId?: string;
  /** Nome da memória do agente, ou do cadastro, ou o telefone formatado. Nunca "Cliente #4". */
  nome: string;
  /**
   * Como se escreve para esta pessoa: dígitos completos, com DDI.
   *
   * ⚠️ Pode vir VAZIO, e a tela tem que respeitar isso: threads gravadas antes de o número
   * completo ser guardado (ver `supabase/009_conversas_painel.sql`) não têm como recuperá-lo,
   * e mandar mensagem para 8 dígitos é mandar para um número inventado. Vazio = leitura só.
   */
  telefone: string;
  /** Instante da última mensagem, em ISO. A tela formata — domínio não decide "10:31". */
  atualizadaEm: string;
  estado: EstadoConversa;
  /** A última fala da thread, para a lista não precisar dela inteira. */
  ultima?: Msg;
};

/**
 * Uma fala. É o tipo que a tela de Conversas desenha E o que o agente replaya para o modelo
 * — de propósito: enquanto a porta do histórico falar isto, trocar de provedor de IA não é
 * migração de banco (ver `portas/saida/memoria-cliente.ts`).
 *
 *   cliente — quem escreveu do outro lado
 *   bot     — a MAISA
 *   voce    — o dono, respondendo à mão pelo painel
 */
export type Msg = {
  de: "cliente" | "bot" | "voce";
  txt: string;
  /** Instante em ISO. Opcional porque quem ESCREVE não precisa saber a hora: o banco põe. */
  em?: string;
};

/** O que o dia tem de decisão pendente. `alvo` é o id que a Gaveta abre. */
export type ItemFila = { id: string; alvo: string; titulo: string; tag: string; msg: string };

export type Faq = { id: string; pergunta: string; resposta: string; usos: number };

/* ───────────────────────────── a regra ───────────────────────────── */

/** O que sobrou de uma conversa depois de tirar o que é derivável. Vem do banco. */
export type PosseDaConversa = {
  /** Quando o dono assumiu. `null`/ausente = a MAISA responde. */
  assumidaEm?: string | null;
  /** Quando o dono marcou como resolvida. */
  resolvidaEm?: string | null;
};

/**
 * QUEM ESTÁ COM A BOLA — a única definição de estado do app.
 *
 * Função pura, no domínio, porque a regra é o produto: é ela que decide o que ganha ponto
 * âmbar na lista, o que conta badge no rail e o que entra na fila "Precisa de você". Antes
 * `estado` era um campo escrito à mão no fixture, e o app tinha três versões da mesma
 * pergunta — a tela olhava o campo, o rail olhava o `localStorage`, e o agente não olhava
 * nada. Uma função, um lugar.
 *
 * A ordem das decisões é a ordem da consequência:
 *
 *   1. ASSUMIDA vence tudo — é a única que muda o comportamento do AGENTE (ele se cala). Se
 *      "resolvida" viesse antes, uma conversa assumida e marcada como resolvida apareceria
 *      como `ok`, e o dono não veria que ainda está com ele.
 *   2. RESOLVIDA vence enquanto nada novo chegou depois dela, e é por isso que a função
 *      recebe `atualizadaEm`. A alternativa era o adaptador apagar `resolvida_em` a cada
 *      mensagem nova, o que faria gravar uma fala mexer em duas tabelas por causa de uma
 *      regra que ninguém veria no código. Comparando as duas datas, "resolvi e o cliente
 *      voltou a escrever" desfaz o resolvido sozinho, sem escrita nenhuma.
 *
 *      ⚠️ Vem ANTES de "quem falou por último" desde 24/10/2026. Antes o item de baixo
 *      rodava primeiro e `cliente` era `espera` sem exceção, então "Já resolvi" na fila
 *      "Precisa de você" gravava `resolvida_em`, mostrava "Conversa resolvida" e a conversa
 *      continuava em `espera`: o botão dizia que resolveu e não resolvia, e a aba
 *      "Resolvidas" nunca tinha nada. Resolver não muda quem conduz: a MAISA decide se
 *      responde por `assumida_em` (ver `agente.ts`), não por este estado.
 *   3. Depois quem falou por último. `cliente` é `espera`: a MAISA responde em segundos,
 *      então uma fala do cliente que continua sendo a última significa que ela NÃO
 *      respondeu — escalou, está desligada, ou quebrou. É a conversa mais urgente que
 *      existe no painel, e o fixture antigo não tinha como representá-la. A única exceção é
 *      o item 2: o dono olhou essa fala e marcou como resolvida depois dela.
 */
export function estadoDaConversa(p: {
  ultimoAutor?: Msg["de"];
  /** Instante da última mensagem, em ISO. Sem ele, `resolvida` não tem com o que competir. */
  atualizadaEm?: string;
  posse?: PosseDaConversa;
}): EstadoConversa {
  if (p.posse?.assumidaEm) return "voce";
  if (p.posse?.resolvidaEm && depoisOuIgual(p.posse.resolvidaEm, p.atualizadaEm)) return "ok";
  if (p.ultimoAutor === "cliente") return "espera";

  /* Não é `ultimoAutor === "voce" ? "voce" : "maisa"`, e a diferença é um bug de verdade:
   * "quem falou por último" NÃO é "quem conduz". Depois de o dono responder à mão e DEVOLVER a
   * conversa, a última fala continua sendo dele para sempre (até o cliente escrever) — e a tela
   * ficaria em `voce`, com o botão oferecendo "Devolver à MAISA" para uma conversa já devolvida,
   * e o composer aberto para escrever numa conversa que a MAISA voltou a atender.
   *
   * Posse é `assumida_em`, e só ela. Se não está assumida e o cliente não está esperando, a bola
   * é da MAISA — inclusive quando a última fala foi do dono. */
  return "maisa";
}

/**
 * `a >= b`, comparando INSTANTES e não strings.
 *
 * Comparar ISO como texto é a armadilha clássica desta função: o Supabase devolve
 * `2026-08-12T13:00:00+00:00` e o resto do app escreve `2026-08-12T10:00:00-03:00` (ver
 * `agoraSP`). São o MESMO instante, e `"2"` > `"1"` diria que um é depois do outro.
 *
 * Data ilegível devolve `false` — na dúvida, a conversa NÃO está resolvida. Errar para o
 * lado de mostrar pendência custa um clique; errar para o outro esconde a conversa.
 */
function depoisOuIgual(a: string, b?: string): boolean {
  if (!b) return true;
  const [x, y] = [Date.parse(a), Date.parse(b)];
  return Number.isFinite(x) && Number.isFinite(y) ? x >= y : false;
}
