/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS — o negócio recebendo do cliente dele (27/10/2026).
 *
 * ★ PEDIDO DO BRUNO, vindo do Smiller (`~/smiller/handoff/maisa-recebimentos.md`): quem usa a
 * MAISA (barbeiro, terapeuta autônoma) não é técnico, não abre conta em gateway e não gera chave
 * de API. Cobrar o cliente e saber se ele pagou era manual.
 *
 * ⚠️ NÃO É A ASSINATURA. `assinatura.ts` e a porta `cobranca.ts` são o negócio pagando a MAISA.
 * Aqui o dinheiro vai do cliente para o negócio, na chave Pix dele, e nunca passa por nós.
 *
 * ── O QUE FICA "EM ABERTO" ──
 *
 * A MAISA não sabia se um atendimento foi pago: `atendimentos` só tem `marcado` ou `cancelado`, e
 * o recibo e a nota supõem a sessão paga. O "em aberto" é um RECEBIMENTO: um Pix que a MAISA
 * mandou (ou vai mandar) e ninguém confirmou. Ele cobre um ou mais atendimentos (um no barbeiro,
 * o mês inteiro no pacote da terapeuta), e é a única estrutura nova: não há parcelas.
 *
 *   perguntar → acabou o atendimento, e o dono ainda não disse se o cliente pagou na hora
 *   aberto    → o Pix foi para o cliente; falta o pagamento
 *   pago      → confirmado: o dono conferiu o comprovante no extrato, ou disse "já pagou"
 *   cancelado → o dono disse que não é para cobrar
 *
 * ── QUANDO O PIX SAI: AJUSTE, NUNCA VERTICAL ──
 *
 * `negocio.ts` proíbe `if (vertical)`. O momento é ajuste do negócio (`depoisDoAtendimento`) e da
 * ficha (`ComoPaga`):
 *   · por atendimento: logo depois do fim, perguntando antes ao dono ou mandando direto. O
 *     "perguntar" é a resposta do Bruno ao barbeiro cujo cliente paga na hora, em dinheiro: o
 *     Pix chegando depois seria cobrar quem já pagou;
 *   · por mês (pacote da terapeuta): no dia do recibo da ficha, com as sessões do mês;
 *   · não cobrar: convênio, quem paga por fora.
 *
 * ── ⚠️ NENHUMA BAIXA POR IMAGEM ──
 *
 * Comprovante se falsifica. A MAISA lê, sugere a cobrança e diz se quem recebeu parece ser o
 * profissional; quem confirma é ele, no extrato. Só então sai o recibo ou a nota.
 *
 * ── AS MENSAGENS SÃO TEMPLATE ──
 *
 * Pelo mesmo motivo do lembrete (`lembretes.ts`): saem sozinhas, sem ninguém revisando, e uma
 * delas carrega dinheiro. O modelo não escreve nenhuma.
 * ────────────────────────────────────────────────────────────────────────────── */

import { primeiroNome } from "./catalogo";
import { cpfValido, soDigitos } from "./clientes";
import { instituicaoDoIspb, lerIdFimAFim, mesmaInstituicao, PIX_NOME_MAX, textoDoPix, type TipoDeChavePix } from "./pix";
import { valorBrasileiro } from "./recibo-saude";
import { mesDe, rotuloDoMes } from "./tempo";

/* ───────────────────────────── os ajustes ───────────────────────────── */

/** Depois de cada atendimento, o que a MAISA faz com o pagamento. Ajuste do negócio. */
export const DEPOIS_DO_ATENDIMENTO = ["desligado", "perguntar", "direto"] as const;
export type DepoisDoAtendimento = (typeof DEPOIS_DO_ATENDIMENTO)[number];
export const ehDepoisDoAtendimento = (v: unknown): v is DepoisDoAtendimento =>
  typeof v === "string" && (DEPOIS_DO_ATENDIMENTO as readonly string[]).includes(v);

/**
 * Como cada cliente paga. Ajuste da ficha.
 *
 *   padrao     → segue o `depoisDoAtendimento` do negócio
 *   por_mes    → um Pix por mês, no dia do recibo da ficha (`dia_recibo`), com as sessões do mês;
 *                o recibo só sai quando o pagamento for confirmado
 *   nao_cobrar → a MAISA nunca manda Pix para essa pessoa
 */
export const COMO_PAGA = ["padrao", "por_mes", "nao_cobrar"] as const;
export type ComoPaga = (typeof COMO_PAGA)[number];
export const ehComoPaga = (v: unknown): v is ComoPaga =>
  typeof v === "string" && (COMO_PAGA as readonly string[]).includes(v);

export type ConfigDeRecebimentos = {
  tipoDaChave: TipoDeChavePix | null;
  /** A chave como o Pix a conhece (`chavePix`). É assim que ela fica gravada. */
  chave: string | null;
  /** Quem recebe, como sai no código: sem acento, até 25. */
  nome: string | null;
  cidade: string | null;
  depoisDoAtendimento: DepoisDoAtendimento;
  /**
   * Desde quando a cobrança depois do atendimento está ligada. Atendimento que acabou antes disso
   * nunca é cobrado sozinho: ligar o Pix não pode virar um Pix para cada cliente da semana.
   */
  ligadoEm: string | null;
};

export const RECEBIMENTOS_DESLIGADOS: ConfigDeRecebimentos = {
  tipoDaChave: null,
  chave: null,
  nome: null,
  cidade: null,
  depoisDoAtendimento: "desligado",
  ligadoEm: null,
};

/** O que falta para a MAISA conseguir montar um Pix, em português. Vazio = pode. */
export function pixFaltando(c: ConfigDeRecebimentos): string[] {
  const falta: string[] = [];
  if (!c.chave || !c.tipoDaChave) falta.push("a chave Pix");
  if (!textoDoPix(c.nome, PIX_NOME_MAX)) falta.push("o nome de quem recebe");
  return falta;
}

/* ───────────────────────────── o recebimento ───────────────────────────── */

export type SituacaoDoRecebimento = "perguntar" | "aberto" | "pago" | "cancelado";

/**
 * Como o pagamento foi confirmado: pelo comprovante do Pix, "pagou na hora" (dinheiro, cartão),
 * ou pela página do Asaas, que avisa sozinho (a opção B, atrás de flag).
 */
export type FormaDoPagamento = "pix" | "na_hora" | "asaas";

/** Por onde a cobrança saiu: o Pix estático na chave do profissional, ou a página do Asaas. */
export type MeioDaCobranca = "pix" | "asaas";

export type Recebimento = {
  id: string;
  /** `null` quando o atendimento foi marcado sem ficha. Sem ficha não há CPF para guardar. */
  clienteId: string | null;
  telefone: string;
  nome: string | null;
  valor: number;
  /** Para a tela: "Corte · 27/10", "4 atendimentos de outubro de 2026". */
  descricao: string;
  /** O identificador do Pix (`identificadorDoRecebimento`). Volta no comprovante, às vezes. */
  identificador: string;
  situacao: SituacaoDoRecebimento;
  forma: FormaDoPagamento | null;
  /** `asaas` quando a cobrança saiu pela página do Asaas (039). Sem a 039, sempre `pix`. */
  meio: MeioDaCobranca;
  /** A cobrança lá fora e a página de pagamento, quando o meio é `asaas`. */
  idExterno: string | null;
  link: string | null;
  atendimentoIds: string[];
  criadoEm: string;
  /** Quando a pergunta "já pagou?" foi para o WhatsApp do dono. `null`: não foi (ou só no painel). */
  perguntadoEm: string | null;
  pagoEm: string | null;
  /** Quando a MAISA pediu o CPF ao cliente por causa deste recebimento. Pede uma vez só. */
  cpfPedidoEm: string | null;
};

/** Um atendimento que acabou e ainda não está em recebimento nenhum. */
export type AtendimentoACobrar = {
  id: string;
  clienteId: string | null;
  nome: string;
  telefone: string | null;
  servico: string;
  valor: number;
  /** Data civil, ISO. */
  data: string;
  /** O instante em que acabou, ISO. */
  fim: string;
  comoPaga: ComoPaga;
};

/** O prefixo que separa um Pix da MAISA de qualquer outro no comprovante. */
export const PREFIXO_DO_IDENTIFICADOR = "MAISA";

/** "MAISA" + os 20 primeiros caracteres do id, sem traço: 25, o teto do campo. */
export function identificadorDoRecebimento(id: string): string {
  return (PREFIXO_DO_IDENTIFICADOR + id.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).slice(0, 25);
}

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/**
 * O que o recebimento cobra, numa frase que serve à tela e à mensagem do Pix ("Segue o Pix de
 * R$ 50,00 (Corte, 27/10)"): "Corte, 27/10" ou "4 atendimentos de outubro de 2026".
 */
export function descricaoDoRecebimento(atendimentos: Pick<AtendimentoACobrar, "servico" | "data">[]): string {
  if (atendimentos.length === 1) return `${atendimentos[0].servico}, ${diaMes(atendimentos[0].data)}`;
  const mes = mesDe(atendimentos.reduce((a, b) => (a.data > b.data ? a : b)).data);
  return `${atendimentos.length} atendimentos de ${rotuloDoMes(mes)}`;
}

/** O serviço mais frequente e o mês do último atendimento: a discriminação da nota de um pagamento. */
export function resumoParaANota(atendimentos: Pick<AtendimentoACobrar, "servico" | "data">[]): { servico: string | null; competencia: string } | null {
  if (!atendimentos.length) return null;
  const vezes: Record<string, number> = {};
  for (const a of atendimentos) vezes[a.servico] = (vezes[a.servico] ?? 0) + 1;
  const servico = Object.keys(vezes).sort((a, b) => vezes[b] - vezes[a])[0] ?? null;
  const ultima = atendimentos.reduce((a, b) => (a.data > b.data ? a : b)).data;
  return { servico, competencia: `${mesDe(ultima)}-01` };
}

/* ───────────────────────────── quando ───────────────────────────── */

/** Quanto depois do fim a MAISA age. A rotina roda de 5 em 5 minutos, então na prática são 5 a 10. */
export const ESPERA_DEPOIS_DO_FIM_MS = 5 * 60_000;

/** Atendimento que acabou há mais que isto não é cobrado sozinho: a rotina que ficou parada um dia
 *  não pode acordar mandando Pix de ontem. O botão "Mandar Pix" continua valendo. */
export const JANELA_DE_COBRANCA_MS = 12 * 60 * 60_000;

/**
 * Os atendimentos cujo FIM cai nesta janela entram na cobrança depois do atendimento. `null` quando
 * não há janela: a cobrança nunca foi ligada.
 */
export function janelaDepoisDoAtendimento(agora: number, ligadoEm: string | null): { desde: string; ate: string } | null {
  const ligado = ligadoEm ? Date.parse(ligadoEm) : NaN;
  if (!Number.isFinite(ligado)) return null;
  const desde = Math.max(agora - JANELA_DE_COBRANCA_MS, ligado);
  const ate = agora - ESPERA_DEPOIS_DO_FIM_MS;
  return desde < ate ? { desde: new Date(desde).toISOString(), ate: new Date(ate).toISOString() } : null;
}

/**
 * Quanto uma pergunta ao dono espera resposta antes de a próxima ir.
 *
 * Uma pergunta por vez no WhatsApp dele: com duas abertas, um "1" sozinho não diz de quem é. A que
 * passou disso continua no painel, respondível; só deixa de segurar a fila.
 */
export const PERGUNTA_VALE_MS = 2 * 60 * 60_000;

/** A pergunta que ainda está valendo no WhatsApp do dono, se houver. */
export function perguntaValendo<T extends Pick<Recebimento, "situacao" | "perguntadoEm">>(rs: T[], agora: number): T | null {
  const valendo = rs.filter(
    (r) => r.situacao === "perguntar" && r.perguntadoEm && agora - Date.parse(r.perguntadoEm) < PERGUNTA_VALE_MS,
  );
  return valendo.sort((a, b) => (a.perguntadoEm! < b.perguntadoEm! ? 1 : -1))[0] ?? null;
}

/* ───────────────────────────── o que as pessoas respondem ───────────────────────────── */

/* As marcas de acento do NFD (U+0300 a U+036F), montadas por código. Ver `pix.ts`. */
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const simples = (t: string) =>
  t.normalize("NFD").replace(ACENTOS, "").toLowerCase().replace(/[^a-z0-9?]+/g, " ").trim();

export type DecisaoDoDono = "pagou" | "pix";

const PAGOU = new Set(["1", "sim", "s", "pagou", "ja pagou", "pago", "ja", "ja pago", "ta pago", "esta pago", "pagou sim", "ja pagou sim"]);
const PIX = new Set(["2", "pix", "manda", "mandar", "manda o pix", "mandar o pix", "manda pix", "pode mandar", "nao", "n", "nao pagou", "ainda nao", "nao pagou ainda"]);

/**
 * A resposta do dono à pergunta "já está pago?". Só a frase inteira conta: "não sei se pagou" não é
 * "não". Fora da lista, `null`, e a mensagem segue o caminho de qualquer outra.
 */
export function decisaoDoDono(texto: string): DecisaoDoDono | null {
  const t = simples(texto).replace(/\?/g, "").trim();
  if (PAGOU.has(t)) return "pagou";
  if (PIX.has(t)) return "pix";
  return null;
}

/**
 * O CPF que a pessoa mandou, se ela mandou exatamente um válido. Dois CPFs diferentes na mesma
 * mensagem, ou nenhum que passe no dígito verificador, é `null`: guardar o errado sai no recibo.
 */
export function cpfNaMensagem(texto: string): string | null {
  const achados: string[] = [];
  /* `(^|\D)` em vez de lookbehind: o `target` do projeto é ES2017 (ver `arquitetura.test.ts`). */
  const re = /(^|\D)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?=\D|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const d = soDigitos(m[2]);
    if (cpfValido(d) && !achados.includes(d)) achados.push(d);
  }
  return achados.length === 1 ? achados[0] : null;
}

const PALAVRAS_DO_CPF = new Set(["meu", "o", "e", "eh", "cpf", "segue", "aqui", "ta", "esta", "numero", "n", "ai", "pronto", "obrigado", "obrigada", "ok"]);

/** A mensagem era só o CPF? Com pergunta ou assunto a mais, a conversa segue para a MAISA responder. */
export function soOCpf(texto: string): boolean {
  if (texto.includes("?")) return false;
  const resto = simples(texto.replace(/[\d.\-/]/g, " ")).split(" ").filter((p) => p && !PALAVRAS_DO_CPF.has(p));
  return resto.join("").length <= 12;
}

/* ───────────────────────────── o comprovante ───────────────────────────── */

/** A imagem ou o PDF que o cliente mandou no WhatsApp, como o canal entrega. */
export type ArquivoRecebido = { base64: string; mimetype: string };

/** O que se lê num comprovante. Campo que não aparece fica `null`, nunca inventado. */
export type DadosDoComprovante = {
  valor: number | null;
  /** AAAA-MM-DD. */
  pagoEm: string | null;
  recebedorNome: string | null;
  recebedorChave: string | null;
  /** Como aparece, mesmo mascarado: "***.456.789-**". */
  recebedorDocumento: string | null;
  pagadorNome: string | null;
  banco: string | null;
  /** O id fim a fim do Pix (E…), ou o código de autenticação. É o que impede o mesmo comprovante duas vezes. */
  idTransacao: string | null;
  identificador: string | null;
};

/** Quem recebeu no comprovante é o profissional? */
export type Conferencia = "confere" | "nao_confere" | "sem_como_saber";

export type SituacaoDoComprovante = "a_conferir" | "confirmado" | "descartado";

export type ComprovanteDePagamento = DadosDoComprovante & {
  id: string;
  telefone: string;
  /** O nome de quem mandou, quando é cliente. Para a tela. */
  nome: string | null;
  /** A cobrança que a MAISA sugeriu (`sugerirRecebimento`). O dono pode escolher outra. */
  recebimentoId: string | null;
  conferencia: Conferencia;
  situacao: SituacaoDoComprovante;
  criadoEm: string;
};

const MASCARA = /[*xX•●]/;

/** Dígito ou `null` (mascarado), na ordem em que aparecem. Pontuação some. */
function posicoes(bruto: string): (string | null)[] {
  const saida: (string | null)[] = [];
  for (const c of bruto) {
    if (c >= "0" && c <= "9") saida.push(c);
    else if (MASCARA.test(c)) saida.push(null);
  }
  return saida;
}

/**
 * O documento lido bate com o nosso? `null` quando não dá para dizer.
 *
 * Os bancos mascaram o CPF de quem recebe ("***.456.789-**", regra do Banco Central). O Smiller
 * procura uma sequência de 8 dígitos dentro do documento, e com seis visíveis ele nunca concluía
 * nada para quem recebe no CPF, que é a terapeuta. Aqui a máscara é comparada posição a posição.
 */
export function documentoConfere(lido: string | null, nosso: string | null): boolean | null {
  if (!lido || !nosso) return null;
  const p = posicoes(lido);
  if (p.length === nosso.length && p.some((c) => c === null)) {
    if (p.filter((c) => c !== null).length < 5) return null;
    return p.every((c, i) => c === null || c === nosso[i]);
  }
  const d = soDigitos(lido);
  return d.length >= 8 ? nosso.includes(d) : null;
}

function chaveConfere(lida: string | null, tipo: TipoDeChavePix | null, nossa: string | null): boolean | null {
  const l = (lida ?? "").trim().toLowerCase();
  if (!l || !tipo || !nossa) return null;
  if (tipo === "email" || tipo === "aleatoria") return MASCARA.test(l) ? null : l === nossa;
  /* CPF, CNPJ e celular: pelos dígitos. O celular gravado é "+55…"; o lido pode vir sem o país. */
  const nossos = tipo === "telefone" ? soDigitos(nossa).slice(2) : nossa;
  if (MASCARA.test(l)) return documentoConfere(l, nossos);
  const d = soDigitos(l);
  return (tipo === "telefone" && d.length >= 12 && d.startsWith("55") ? d.slice(2) : d) === nossos;
}

/**
 * Quem recebeu é o profissional? Pela chave lida ou pelo documento (o do fiscal, ou a própria
 * chave quando ela é CPF ou CNPJ). Qualquer um que bata confere; nenhum batendo, com algo para
 * comparar, não confere; nada para comparar, não dá para saber.
 */
export function conferirRecebedor(
  lido: Pick<DadosDoComprovante, "recebedorChave" | "recebedorDocumento">,
  nosso: { tipoDaChave: TipoDeChavePix | null; chave: string | null; documento: string | null },
): Conferencia {
  const docDaChave = nosso.tipoDaChave === "cpf" || nosso.tipoDaChave === "cnpj" ? nosso.chave : null;
  const resultados = [
    chaveConfere(lido.recebedorChave, nosso.tipoDaChave, nosso.chave),
    documentoConfere(lido.recebedorDocumento, nosso.documento),
    documentoConfere(lido.recebedorDocumento, docDaChave),
  ];
  if (resultados.includes(true)) return "confere";
  if (resultados.includes(false)) return "nao_confere";
  return "sem_como_saber";
}

/** O que o código da transação diz do comprovante. Os motivos já são as frases da tela e do aviso. */
export type ConferenciaDoCodigo = { situacao: Conferencia; motivos: string[] };

const HORA_MS = 3_600_000;
/** O Pix aceita o código com até 12 h de diferença do processamento (ver `lerIdFimAFim`). */
const FOLGA_DO_CODIGO_MS = 12 * HORA_MS;
/** Antes disto da cobrança, o Pix não é desta cobrança: as 12 h da janela depois do atendimento
 *  (o cliente que pagou na chave ao sair), mais a folga do código, mais um respiro. */
const ANTES_DA_COBRANCA_MS = 36 * HORA_MS;

/** AAAA-MM-DD → DD/MM/AAAA. */
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * O código da transação (o id fim a fim, `E…`) bate com o resto do comprovante?
 *
 * Três coisas que um comprovante editado ou reaproveitado costuma errar, todas com folga, porque a
 * hora do código pode estar até 12 h fora (ver `lerIdFimAFim` em `pix.ts`):
 *   · o banco: o ISPB do código é de outra instituição que a escrita no comprovante;
 *   · a data: mais de um dia entre a data do código e a escrita;
 *   · o tempo: o Pix é de muito antes de a cobrança sair (comprovante antigo), ou de depois de o
 *     comprovante chegar (impossível).
 *
 * `confere` só quando o banco ou a data foram comparados e bateram: as contas de tempo só acham
 * problema, não confirmam nada. Sem código no formato do Pix, ou sem banco e data para comparar,
 * `sem_como_saber`. Nada aqui recusa: quem decide é o dono, no extrato.
 */
export function conferirCodigoDoPix(
  lido: Pick<DadosDoComprovante, "idTransacao" | "banco" | "pagoEm">,
  quando: { recebidoEm: string; cobrancaEnviadaEm?: string | null },
): ConferenciaDoCodigo {
  const id = lerIdFimAFim(lido.idTransacao);
  if (!id) return { situacao: "sem_como_saber", motivos: [] };
  const motivos: string[] = [];
  let comparou = false;

  const banco = mesmaInstituicao(id.ispb, lido.banco);
  if (banco === false) motivos.push(`O código da transação é de outra instituição: ${instituicaoDoIspb(id.ispb)!.nome}, e não ${lido.banco}.`);
  if (banco !== null) comparou = true;

  /* A data do código no horário de Brasília, que é o do comprovante. */
  const diaDoCodigo = new Date(id.em.getTime() - 3 * HORA_MS).toISOString().slice(0, 10);
  if (lido.pagoEm) {
    comparou = true;
    const dias = Math.abs(Date.parse(diaDoCodigo) - Date.parse(lido.pagoEm)) / (24 * HORA_MS);
    if (dias > 1) motivos.push(`O código da transação é de ${dataBR(diaDoCodigo)}, e o comprovante diz ${dataBR(lido.pagoEm)}.`);
  }

  const chegou = Date.parse(quando.recebidoEm);
  if (Number.isFinite(chegou)) {
    if (id.em.getTime() > chegou + FOLGA_DO_CODIGO_MS) motivos.push("O código da transação é de depois de o comprovante chegar.");
  }
  const cobrado = quando.cobrancaEnviadaEm ? Date.parse(quando.cobrancaEnviadaEm) : NaN;
  if (Number.isFinite(cobrado)) {
    if (id.em.getTime() < cobrado - ANTES_DA_COBRANCA_MS) {
      motivos.push(`O Pix do comprovante é de ${dataBR(diaDoCodigo)}, antes desta cobrança. Pode ser um comprovante antigo.`);
    }
  }

  if (motivos.length) return { situacao: "nao_confere", motivos };
  return { situacao: comparou ? "confere" : "sem_como_saber", motivos };
}

/**
 * Qual cobrança o comprovante paga: a do identificador, se o Pix saiu daqui e o banco o mostrou;
 * senão a mais antiga em aberto com o mesmo valor. Nenhuma: o dono escolhe na tela.
 */
export function sugerirRecebimento<T extends Pick<Recebimento, "identificador" | "valor" | "criadoEm">>(
  dados: Pick<DadosDoComprovante, "valor" | "identificador">,
  abertos: T[],
): T | null {
  const id = (dados.identificador ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (id.startsWith(PREFIXO_DO_IDENTIFICADOR)) {
    const pelo = abertos.find((r) => r.identificador === id);
    if (pelo) return pelo;
  }
  if (dados.valor == null) return null;
  return [...abertos]
    .filter((r) => Math.abs(r.valor - dados.valor!) < 0.005)
    .sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1))[0] ?? null;
}

/* ───────────────────────────── as mensagens ───────────────────────────── */

const reais = (v: number) => `R$ ${valorBrasileiro(v)}`;
const ola = (nome: string | null) => (nome?.trim() ? `Oi, ${primeiroNome(nome.trim())}!` : "Oi!");

/**
 * As duas mensagens do Pix: a explicação, e o código SOZINHO na seguinte, para o cliente copiar
 * inteiro com um toque. Junto do texto, o "copiar" do WhatsApp pega o parágrafo todo.
 */
export function mensagensDoPix(p: { nome: string | null; valor: number; descricao: string; codigo: string }): [string, string] {
  return [
    `${ola(p.nome)} Segue o Pix de ${reais(p.valor)} (${p.descricao}). É só copiar o código da próxima mensagem e colar no app do banco, em Pix copia e cola: o valor já vem preenchido.\n\nDepois, se puder, me manda o comprovante por aqui.`,
    p.codigo,
  ];
}

/** O que entra na conversa no lugar do código: o código é para o banco, não para a thread. */
export const codigoNaConversa = (valor: number) => `[código Pix copia e cola de ${reais(valor)}]`;

export function respostaAoComprovante(valor: number | null): string {
  const de = valor ? ` de ${reais(valor)}` : "";
  return `Recebi o comprovante${de}, obrigada! Assim que for conferido, te confirmo por aqui.`;
}

/** O mesmo comprovante de novo (a mesma transação Pix): nada muda, e a pessoa fica sabendo. */
export const COMPROVANTE_REPETIDO = "Esse comprovante já tinha chegado, obrigada! Assim que for conferido, te confirmo por aqui.";

export const confirmacaoDoPagamento = (valor: number) => `Pagamento de ${reais(valor)} confirmado. Obrigada!`;

/**
 * Para que o CPF vai servir. É a primeira coisa que a pessoa quer saber antes de mandar.
 * `cobranca` é a opção B: o Asaas não emite cobrança sem o documento de quem paga, e a MAISA
 * pergunta antes de mandar (Bruno, 27/10/2026: "pergunta uma vez, e depois consegue ficar enviando").
 */
export type MotivoDoCpf = "recibo" | "nota" | "cobranca";

export function pedidoDeCpf(motivo: MotivoDoCpf): string {
  if (motivo === "cobranca") return "Para eu conseguir te mandar a cobrança, preciso do seu CPF. Pode me mandar por aqui?";
  return motivo === "recibo"
    ? "Para o recibo sair no seu nome, me manda seu CPF?"
    : "Para a nota fiscal sair no seu nome, me manda seu CPF?";
}

/**
 * A cobrança pela página do Asaas: o link, onde dá para pagar por Pix, boleto ou cartão, e o Pix
 * copia e cola SOZINHO na mensagem seguinte, quando o Asaas o devolveu.
 */
export function mensagensDaCobranca(p: { nome: string | null; valor: number; descricao: string; link: string; pix: string | null }): string[] {
  const texto =
    `${ola(p.nome)} Segue a cobrança de ${reais(p.valor)} (${p.descricao}). Dá para pagar por Pix, boleto ou cartão, neste link: ${p.link}` +
    (p.pix ? "\n\nSe preferir o Pix, o código vai na próxima mensagem." : "");
  return p.pix ? [texto, p.pix] : [texto];
}

export const AGRADECIMENTO_DO_CPF = "Obrigada, anotei!";

export function perguntaAoDono(r: Pick<Recebimento, "nome" | "descricao" | "valor" | "telefone">): string {
  const quem = r.nome?.trim() || r.telefone;
  return `Acabou o atendimento de ${quem} (${r.descricao}, ${reais(r.valor)}). Já está pago?\n\nResponda 1 se já pagou, ou 2 para eu mandar o Pix.`;
}

export function respostaAoDono(decisao: DecisaoDoDono, r: Pick<Recebimento, "nome" | "telefone">): string {
  const quem = r.nome?.trim() || r.telefone;
  return decisao === "pagou" ? `Anotado: ${quem} já pagou.` : `Combinado, o Pix vai para ${quem} agora.`;
}

/** O cliente pagou pelo Asaas uma cobrança que já estava paga ou cancelada: dinheiro em dobro, talvez. */
export function avisoDePagamentoForaDeHoraAoDono(r: Pick<Recebimento, "nome" | "telefone" | "valor" | "situacao">): string {
  const quem = r.nome?.trim() || r.telefone;
  const estava = r.situacao === "pago" ? "já estava paga" : "tinha sido cancelada";
  return `${quem} pagou pelo link do Asaas uma cobrança de ${reais(r.valor)} que ${estava}. Confira no Asaas: talvez seja o caso de devolver.`;
}

export function avisoDeComprovanteAoDono(p: {
  nome: string | null; telefone: string; valor: number | null; conferencia: Conferencia; codigo?: ConferenciaDoCodigo;
}): string {
  const quem = p.nome?.trim() || p.telefone;
  const de = p.valor ? ` de ${reais(p.valor)}` : "";
  const alertas = [
    ...(p.conferencia === "nao_confere" ? ["No comprovante, quem recebeu não parece ser você."] : []),
    ...(p.codigo?.motivos ?? []),
  ];
  const alerta = alertas.length ? `\n\nAtenção: ${alertas.join(" ")}` : "";
  return `${quem} mandou um comprovante de Pix${de}. Confira no extrato e confirme na MAISA, na tela de hoje.${alerta}`;
}
