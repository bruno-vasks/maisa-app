/* ─────────────────────────────────────────────────────────────────────────────
 * AGENDA — atendimentos, etapas do dia e o que se lê de uma agenda externa.
 *
 * A fonte da verdade dos atendimentos é a TABELA `atendimentos` do produto (ADR-0009). O
 * calendário externo conectado é uma camada ADITIVA: acrescenta o compromisso que nasceu
 * fora da MAISA e, quando não existe ou falha, acrescenta zero.
 *
 * ⚠️ Este cabeçalho dizia o contrário — "a fonte da verdade é a agenda externa… o app não
 * mantém uma segunda lista". O que aquilo protegia continua valendo: duas listas
 * SIMÉTRICAS deixam toda tela sem saber qual é a real. A assimetria é o que sustenta duas
 * fontes — uma manda, a outra soma.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Etapa do dia — as três colunas do kanban. */
export type Etapa = "chegando" | "atendendo" | "feito";

export const ETAPAS: Etapa[] = ["chegando", "atendendo", "feito"];

export type Agendamento = {
  id: string;
  /** Data ISO, "YYYY-MM-DD". Ausente ⇒ hoje. */
  data?: string;
  /** Início em hora decimal: 9.5 = 09:30. */
  inicio: number;
  profissionalId: string;
  servicoId: string;
  clienteId: string;
  /** Confirmou pelo WhatsApp? false ⇒ a MAISA ainda está cobrando. */
  confirmado: boolean;
  etapaInicial: Etapa;
};

/** Atendimento sendo marcado, antes de virar evento de verdade na agenda.
 *  Nasce com horário e profissional (vieram do clique no vago); cliente e serviço faltam. */
export type RascunhoAgendamento = {
  id: string;
  /**
   * uuid cunhado quando o rascunho nasce, e mandado ao servidor na criação.
   *
   * É a chave de IDEMPOTÊNCIA: o servidor procura um evento com esta marca antes de
   * inserir. Nasce na origem do pedido, e não na hora de enviar, justamente para
   * sobreviver a uma falha — "Tentar de novo" reusa a mesma chave e encontra o evento
   * que a primeira tentativa talvez tenha criado, em vez de criar um segundo.
   *
   * Vale igual para o agente de WhatsApp: ele cunha o uuid quando decide marcar, e uma
   * retentativa do modelo não vira dois horários para o mesmo cliente.
   */
  maisaAg: string;
  /** Data ISO em que o clique caiu — com Semana e Mês na tela, o vago já não é sempre hoje. */
  data: string;
  profissionalId: string;
  inicio: number;
  clienteId: string;
  servicoId: string;
  /**
   * O preço DESTE atendimento, como o dono digitou. `""` = o preço do serviço.
   *
   * Existe porque na terapia o valor muda de pessoa para pessoa (tabela social, convênio,
   * pacote), e o catálogo só guarda um. Texto e não número: é o que está no campo,
   * inclusive pela metade ("1" a caminho de "180").
   */
  valor?: string;
  /** 0 = não repete; 1 = toda semana; 2 = a cada 2 semanas; 4 = a cada 4 semanas. */
  cadaSemanas?: number;
  /** Por quantos meses repetir, quando `cadaSemanas > 0`. */
  meses?: number;
  /**
   * Uma chave de idempotência por ocorrência — a primeira é `maisaAg`. Cunhadas no
   * primeiro envio e guardadas aqui, para "Tentar de novo" reencontrar as que já entraram
   * em vez de marcar a série duas vezes. Somem quando a repetição muda.
   */
  chaves?: string[];
};

/** Quantas sessões cabem em `meses`, repetindo a cada `cadaSemanas`. Inclui a primeira. */
export function ocorrenciasDaSerie(cadaSemanas: number, meses: number): number {
  if (!(cadaSemanas > 0) || !(meses > 0)) return 1;
  return Math.max(1, Math.ceil((meses * 30) / (7 * cadaSemanas)));
}

/** Teto de sessões numa série: um ano de semanais. O caso de uso recusa acima disso. */
export const MAX_OCORRENCIAS = 52;

/**
 * O preço que vai no atendimento: o digitado, ou o do serviço quando o campo está vazio.
 * `null` = o que está no campo não é dinheiro, e o botão de marcar trava.
 *
 * Aceita as duas grafias que um brasileiro digita — "180,50" e "1.250,00" com vírgula,
 * "180.50" sem ela. Só com vírgula o ponto é milhar; sem vírgula ele é decimal.
 */
export function valorDoRascunho(r: RascunhoAgendamento, servico?: { preco: number }): number | null {
  const bruto = (r.valor ?? "").trim().replace(/^R\$\s*/, "");
  if (!bruto) return servico?.preco ?? 0;
  return numeroDigitado(bruto);
}

/**
 * O serviço que nasce quando o dono marca pelo PREÇO, sem escolher serviço (Bruno, 28/09/2026:
 * "coloque um preço sem necessariamente ter que colocar um serviço; quando isso acontece,
 * cria-se o serviço nome da pessoa + R$ valor"). Na terapia o preço é da pessoa, não do
 * procedimento, e obrigar a escolher "Atendimento padrão" para depois trocar o valor era
 * pedir a mesma coisa duas vezes.
 *
 * ⚠️ O NOME É A CHAVE DE REUSO: a mesma pessoa pelo mesmo preço cai no serviço que já existe,
 * em vez de empilhar "Ana · R$ 150,00" no catálogo a cada sessão. Mudar o formato aqui faz o
 * catálogo antigo parar de casar e duplicar.
 */
export function nomeDoServicoAvulso(nomeCliente: string, valor: number): string {
  const reais = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${nomeCliente.trim()} · R$ ${reais}`;
}

/**
 * Quanto tempo ocupa na agenda o atendimento marcado sem serviço: a duração que o negócio mais
 * usa nos serviços ativos (o empate fica com a menor), ou 50 minutos, a sessão de terapia, se
 * não houver nenhum. Sem isso a agenda não sabe onde o bloco termina.
 */
export function duracaoPadrao(servicos: { duracao: number; ativo?: boolean }[]): number {
  const conta = new Map<number, number>();
  for (const s of servicos) {
    if (s.ativo === false || !duracaoValida(s.duracao)) continue;
    conta.set(s.duracao, (conta.get(s.duracao) ?? 0) + 1);
  }
  let melhor = 50, vezes = 0;
  for (const [d, n] of conta) if (n > vezes || (n === vezes && d < melhor)) { melhor = d; vezes = n; }
  return melhor;
}

/**
 * O número que a pessoa digitou num campo de preço, duração ou valor: `null` se o que está lá
 * não for número (ou estiver vazio, ou for negativo, ou passar de 100 mil).
 *
 * Mesmas grafias de `valorDoRascunho`, que usa esta: "90,50" e "1.250,00" com vírgula (o ponto
 * é milhar), "90.50" sem ela (o ponto é decimal), "R$ 90" com o prefixo. Duas casas.
 *
 * ⚠️ QUEM CHAMA CONVERTE NO FIM DA DIGITAÇÃO, NUNCA A CADA TECLA. O campo de duração da gaveta
 * de serviço convertia a cada tecla com mínimo de 5: apagar e digitar "30" passava por "3", que
 * virava 5, e o "0" seguinte fazia 50 (08 P0-1). A gaveta guarda o texto e chama isto no blur
 * e no Enter; o mínimo se aplica só na gravação.
 */
export function numeroDigitado(texto: string): number | null {
  const bruto = texto.trim().replace(/^R\$\s*/, "");
  if (!bruto) return null;
  const n = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return Math.round(n * 100) / 100;
}

/* ───────────────────────────── o que volta da agenda externa ───────────────────────────── */

/**
 * Um atendimento da MAISA reconhecido dentro de um evento externo.
 *
 * Os nomes vêm DESNORMALIZADOS de propósito: um serviço criado pelo usuário pode existir
 * só no navegador dele, e sem a cópia o evento voltaria apontando para um id que não
 * resolve — o atendimento simplesmente não renderizaria noutro dispositivo.
 */
export type AtendimentoMarcado = {
  /** O uuid de idempotência (ver RascunhoAgendamento.maisaAg). */
  ag: string;
  profissionalId: string;
  clienteId: string;
  clienteNome: string;
  clienteTel: string;
  servicoId: string;
  servicoNome: string;
  servicoValor: number;
};

/** Um evento já traduzido para a língua da grade: data civil + hora decimal. */
export type EventoDeAgenda = {
  eventoId: string;
  /** "2026-08-06" em horário de São Paulo. */
  data: string;
  /** Hora decimal: 14.5 = 14:30. */
  inicio: number;
  fim: number;
  /** Minutos. */
  duracao: number;
  titulo: string;
  meetLink?: string;
  htmlLink?: string;
  /** Instância de evento recorrente. Renderiza, mas não se arrasta. */
  recorrente: boolean;
  /**
   * Presente só quando o evento foi criado pela MAISA. É o que separa, na MESMA
   * resposta do provedor, o atendimento de cliente do compromisso pessoal — um vira
   * bloco colorido e arrastável, o outro vira bloqueio cinza e intocável.
   */
  maisa?: AtendimentoMarcado;
  /**
   * Algum convidado que não é você ainda não respondeu.
   *
   * É a única fonte REAL de "confirmado" que existe hoje. Como convidar o cliente é
   * opt-in e o padrão é não convidar, na prática quase todo atendimento nasce sem
   * convidados e portanto confirmado — o que é honesto, porque ninguém prometeu nada
   * a ninguém por e-mail.
   */
  aguardandoResposta: boolean;
};

/** O que a criação devolve de volta. */
export type EventoCriado = {
  eventoId: string;
  /** URL do Meet. Ausente quando o provedor ainda não terminou de criar a conferência. */
  meetLink?: string;
  htmlLink?: string;
};

/* ───────────────────────────── invariantes ───────────────────────────── */

/** Hora decimal dentro do dia e em passos de meia hora. */
export const horaValida = (h: number) =>
  Number.isFinite(h) && h >= 0 && h < 24 && Math.round(h * 2) === h * 2;

/** Atendimento de menos de 5 min ou mais de 8 h é dado corrompido, não caso de uso. */
export const duracaoValida = (min: number) => Number.isFinite(min) && min >= 5 && min <= 480;

/** Um uuid v4 canônico — o formato da chave de idempotência. */
export const ehUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Quão longe daqui uma data pode estar. Não é regra de negócio, é sanidade: uma data
 * corrompida não deve plantar evento em 1998 nem em 2200 — lá ninguém olha, e o dono
 * levaria meses para descobrir que tem lixo na agenda.
 *
 * Marcar no PASSADO é permitido de propósito: registrar às 15h o encaixe que entrou às
 * 14h é uso normal de agenda.
 */
export const DIAS_DE_ALCANCE = 366;
