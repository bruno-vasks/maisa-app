/* ─────────────────────────────────────────────────────────────────────────────
 * DOMÍNIO — a maisa vendendo a própria maisa (05/11/2026).
 *
 * Os leads da maisa chegavam no WhatsApp pessoal do Bruno, pelos botões das LPs, e ele
 * respondia à mão. Agora um negócio do próprio app, "a casa" (`MAISA_NEGOCIO_DA_CASA`), atende
 * esses leads com o MESMO agente que atende os clientes dos assinantes, num número só dele e com
 * outro objetivo: entender quem é a pessoa e levá-la ao teste grátis ou a uma conversa com o Bruno.
 *
 * Aqui fica só o que é regra e cabe sem mundo: o próximo passo de cada lead, o plano que cabe no
 * volume dele, o link do teste, a etapa em que o cadastro parou, quando uma mensagem automática
 * pode sair e o texto dela. Quem usa: `aplicacao/vendas.ts` e a persona de vendas do agente.
 *
 * ── AS DECISÕES DO BRUNO (05/11/2026) ──
 *   • número novo, só da maisa, em modo "só do negócio" — nunca o celular pessoal dele;
 *   • quem atende sozinho recebe o link do teste; equipe de 2 ou mais, ou quem pedir, conversa
 *     com ele (`proximoPasso`);
 *   • três mensagens automáticas, uma de cada por pessoa e nunca as 11 contas antigas do funil:
 *     boas-vindas a quem cria conta, um lembrete a quem travou no meio e uma retomada a quem
 *     conversou pela LP e parou de responder.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Vertical } from "./negocio";
import { civilSP, dowDoDia, rotuloLongo } from "./tempo";

/* ───────────────────────────── o que se vende ───────────────────────────── */

export type ChaveDoPlano = "essencial" | "profissional" | "escala";

/**
 * Um plano como a vendedora fala dele. Os números vêm de `_lib/planos.ts`, a fonte única de
 * preço do produto, e chegam aqui pela `composicao.ts`: este arquivo não redigita preço.
 */
export type PlanoAVenda = {
  chave: ChaveDoPlano;
  nome: string;
  /** Como a LP escreve: "R$ 197". */
  preco: string;
  /** A cota do plano. É ela que separa um plano do outro. */
  agendamentosPorMes: number;
  /** "R$ 0,28", por agendamento acima da cota. */
  excedente: string;
};

/** Os planos que se assinam sozinhos pelo `/assinar`. O Escala é "sob proposta" e não tem página. */
export const AUTOATENDIDOS: readonly ChaveDoPlano[] = ["essencial", "profissional"];

/** O teste grátis, em dias. É o que o `/assinar?teste=1` dá e o que as LPs prometem. */
export const DIAS_DE_TESTE = 14;

/** Semanas num mês, para passar "atendimentos por semana" para a cota mensal. */
const SEMANAS_NO_MES = 4.3;

/**
 * O menor plano cuja cota cobre o volume. `null` quando a pessoa não disse o volume: aí a
 * vendedora não sugere plano nenhum, em vez de chutar.
 */
export function planoPeloVolume(porSemana: number | null, planos: readonly PlanoAVenda[]): PlanoAVenda | null {
  if (porSemana === null || !Number.isFinite(porSemana) || porSemana <= 0 || planos.length === 0) return null;
  const porMes = porSemana * SEMANAS_NO_MES;
  const ordenados = [...planos].sort((a, b) => a.agendamentosPorMes - b.agendamentosPorMes);
  return ordenados.find((p) => p.agendamentosPorMes >= porMes) ?? ordenados[ordenados.length - 1];
}

/* ───────────────────────────── o lead ───────────────────────────── */

/** O que a maisa descobre conversando. Tudo pode faltar: o lead responde o que quiser. */
export type Qualificacao = {
  /** Como a pessoa disse: "psicóloga", "barbearia", "nutricionista". */
  profissao: string | null;
  vertical: Vertical;
  /** Quantas pessoas atendem, contando a própria. 1 = sozinha. */
  equipe: number | null;
  atendimentosPorSemana: number | null;
  /** Como marca hoje: "pelo WhatsApp, à mão", "Google Agenda", "caderno". */
  comoMarcaHoje: string | null;
  /**
   * O que a fez procurar a maisa, ou o que mais pesa hoje: "recibo do Receita Saúde", "cobrar
   * pelo Pix", "nota fiscal", "parar de responder agenda à noite". Pedido do Bruno (06/11/2026):
   * muitas vezes o motivo do contato não é a agenda, e é isto que ele quer ler no resumo.
   */
  interesse: string | null;
  /** A pessoa pediu para falar com alguém, ou ficou com uma dúvida que a maisa não resolveu. */
  pediuConversa: boolean;
};

export type ProximoPasso = "teste" | "conversa";

/** A partir de quantas pessoas atendendo o lead conversa com o Bruno. Decisão dele, 05/11/2026. */
export const EQUIPE_QUE_CONVERSA = 2;

/**
 * Teste ou conversa. Fica em código, e não no prompt, porque é regra de venda: o modelo descobre
 * os fatos, e quem decide o caminho é isto.
 *
 * Equipe desconhecida conta como "sozinha". A persona manda perguntar antes de registrar, e
 * quem pula a pergunta ("só me manda o link") pediu o teste com as próprias palavras.
 */
export function proximoPasso(q: Pick<Qualificacao, "equipe" | "pediuConversa">): ProximoPasso {
  if (q.pediuConversa) return "conversa";
  if (q.equipe !== null && q.equipe >= EQUIPE_QUE_CONVERSA) return "conversa";
  return "teste";
}

/** Tudo o que a casa guarda de um lead. Uma linha por telefone. */
export type FichaDeLead = {
  telefone: string;
  nome: string | null;
  qualificacao: Qualificacao | null;
  passo: ProximoPasso | null;
  plano: ChaveDoPlano | null;
  /** Quando cada coisa aconteceu. `null` = ainda não aconteceu. */
  qualificadoEm: string | null;
  linkEm: string | null;
  boasVindasEm: string | null;
  lembreteEm: string | null;
  retomadaEm: string | null;
};

/**
 * O link do teste grátis, montado aqui e nunca pelo modelo. Um link escrito pelo modelo sai
 * plausível e quebrado (sem o `?teste=1`, com o plano errado), e o lead cai no Pix em vez do
 * teste. A campanha marca a venda como da maisa, para o `npm run leads` saber de onde veio.
 */
export function linkDoTeste(p: { base: string; vertical: Vertical; plano: ChaveDoPlano | null }): string {
  const plano = p.plano && AUTOATENDIDOS.includes(p.plano) ? p.plano : "profissional";
  const q = new URLSearchParams({
    teste: "1",
    icp: p.vertical,
    utm_source: "whatsapp",
    utm_medium: "maisa",
    utm_campaign: "maisa-da-maisa",
  });
  return `${p.base.replace(/\/+$/, "")}/assinar/${plano}?${q.toString()}`;
}

/**
 * O link que abre o app na gaveta "Meu plano", onde fica o botão de pagar (o mesmo do aviso de
 * vencimento). Para quem já tem conta e quer assinar. Pedido do Bruno (06/11/2026): "ela pode até
 * mandar o link do nosso produto no WhatsApp, do pagamento". Montado aqui, como o do teste.
 */
export function linkDoPagamento(base: string): string {
  return `${base.replace(/\/+$/, "")}/?tela=mais&abrir=plano`;
}

/** "Fernanda · psicóloga · sozinha · ~25 atendimentos/semana". O que faltar não aparece. */
function perfilEmUmaLinha(nome: string | null, q: Qualificacao | null): string {
  const partes = [nome ?? "sem nome"];
  if (q?.profissao) partes.push(q.profissao);
  if (q?.equipe === 1) partes.push("sozinha");
  else if (q?.equipe) partes.push(`equipe de ${q.equipe}`);
  if (q?.atendimentosPorSemana) partes.push(`~${q.atendimentosPorSemana} atendimentos/semana`);
  return partes.join(" · ");
}

/**
 * O aviso que o Bruno recebe no WhatsApp dele quando um lead é qualificado. Curto, com o link que
 * abre a conversa: ele lê no celular e decide se entra.
 */
export function resumoParaOVendedor(p: {
  nome: string | null;
  telefone: string;
  qualificacao: Qualificacao;
  passo: ProximoPasso;
  plano: PlanoAVenda | null;
}): string {
  const linhas = ["🟢 *Lead da maisa*", "", perfilEmUmaLinha(p.nome, p.qualificacao)];
  if (p.qualificacao.interesse) linhas.push(`Quer: ${p.qualificacao.interesse}`);
  if (p.qualificacao.comoMarcaHoje) linhas.push(`Hoje marca: ${p.qualificacao.comoMarcaHoje}`);
  linhas.push(
    p.passo === "teste"
      ? `Próximo passo: link do teste${p.plano ? ` (${p.plano.nome})` : ""}`
      : `Próximo passo: conversa com você${p.qualificacao.pediuConversa ? " (pediu para falar com alguém)" : ""}`,
  );
  linhas.push("", `Conversa: https://wa.me/${p.telefone.replace(/\D/g, "")}`);
  return linhas.join("\n");
}

/**
 * O aviso de conversa marcada (05/11/2026). Sai sempre que a casa marca 15 minutos com o Bruno,
 * mesmo que o modelo não tenha registrado o lead antes: na bancada, quem pediu "quero falar com
 * uma pessoa" foi direto para a agenda, e o Bruno nunca soube.
 */
export function resumoDaConversaMarcada(p: { nome: string | null; telefone: string; quando: string; qualificacao: Qualificacao | null }): string {
  return [
    "📅 *Conversa marcada*",
    "",
    perfilEmUmaLinha(p.nome, p.qualificacao),
    p.quando,
    "",
    `Conversa: https://wa.me/${p.telefone.replace(/\D/g, "")}`,
  ].join("\n");
}

/* ───────────────────────────── o cadastro no app ───────────────────────────── */

/** Uma conta do app vista pela casa. Só o que a venda precisa; nada de senha nem metadata inteiro. */
export type CadastroNoApp = {
  contaId: string;
  /** Nome da PESSOA, quando o cadastro pediu. */
  nome: string | null;
  /** Só dígitos, como o cadastro gravou. */
  telefone: string | null;
  criadaEm: string;
  emailConfirmado: boolean;
  /** Nome do negócio, se ele já nasceu. */
  negocio: string | null;
  vertical: Vertical | null;
  /** O WhatsApp do negócio. `null` = nunca tentou conectar. */
  whatsapp: "conectado" | "pareando" | "desconectado" | null;
  /** Último dia do teste, `YYYY-MM-DD`. */
  testeAte: string | null;
  /** Até quando está pago, `YYYY-MM-DD`. `null` = nunca pagou. */
  pagoAte: string | null;
};

export type EtapaDoCadastro =
  | "confirmar_email"
  | "criar_negocio"
  | "conectar_whatsapp"
  | "em_teste"
  | "teste_acabou"
  | "cliente";

/** Onde a pessoa está. `hoje` é a data civil de São Paulo, comparada como texto. */
export function etapaDoCadastro(c: CadastroNoApp, hoje: string): EtapaDoCadastro {
  if (c.pagoAte && hoje <= c.pagoAte) return "cliente";
  if (!c.negocio) return c.emailConfirmado ? "criar_negocio" : "confirmar_email";
  if (c.whatsapp !== "conectado") return "conectar_whatsapp";
  if (c.testeAte && hoje <= c.testeAte) return "em_teste";
  return "teste_acabou";
}

/** As etapas em que a pessoa parou no meio e um lembrete ajuda. */
export const ETAPAS_TRAVADAS: readonly EtapaDoCadastro[] = ["confirmar_email", "criar_negocio", "conectar_whatsapp"];

/**
 * A etapa em uma frase, para a vendedora saber com quem fala antes de a pessoa explicar. Entra
 * no prompt da conversa (a parte que muda a cada mensagem).
 */
export function cadastroEmTexto(c: CadastroNoApp, hoje: string): string {
  const criou = civilSP(c.criadaEm)?.data ?? c.criadaEm.slice(0, 10);
  const quando = criou === hoje ? "hoje" : `em ${rotuloLongo(criou)}`;
  switch (etapaDoCadastro(c, hoje)) {
    case "confirmar_email":
      return `criou a conta ${quando} e ainda não confirmou o e-mail.`;
    case "criar_negocio":
      return `criou a conta ${quando} e parou antes de criar o negócio.`;
    case "conectar_whatsapp":
      return c.whatsapp === "pareando"
        ? `criou o negócio "${c.negocio}" ${quando} e parou na leitura do QR do WhatsApp.`
        : `criou o negócio "${c.negocio}" ${quando} e ainda não conectou o WhatsApp.`;
    case "em_teste":
      return `está no teste grátis até ${rotuloLongo(c.testeAte!)}, com o WhatsApp conectado.`;
    case "teste_acabou":
      return `o teste grátis acabou${c.testeAte ? ` em ${rotuloLongo(c.testeAte)}` : ""} e não assinou.`;
    case "cliente":
      return `já é cliente, com o plano pago até ${rotuloLongo(c.pagoAte!)}.`;
  }
}

/* ───────────────────────────── as mensagens automáticas ───────────────────────────── */

export type Automatica = "boas_vindas" | "lembrete" | "retomada";

/**
 * Quando cada uma pode sair, contado a partir do fato que a dispara (conta criada, última fala
 * da maisa). Antes do começo é cedo; depois do fim, a mensagem já não faz sentido e não sai.
 *
 * Boas-vindas: de 3 minutos a 3 horas depois do cadastro. Os 3 minutos dão tempo de a pessoa
 * chegar à tela do WhatsApp (o `/cadastro` pede o número numa segunda tela); as 3 horas evitam
 * "acabou de criar sua conta" para quem criou ontem.
 */
export const JANELAS_MS: Record<Automatica, { de: number; ate: number }> = {
  boas_vindas: { de: 3 * 60_000, ate: 3 * 3_600_000 },
  lembrete: { de: 24 * 3_600_000, ate: 72 * 3_600_000 },
  retomada: { de: 24 * 3_600_000, ate: 72 * 3_600_000 },
};

export const dentroDaJanela = (tipo: Automatica, desdeISO: string, agora: number): boolean => {
  const desde = Date.parse(desdeISO);
  if (!Number.isFinite(desde)) return false;
  const passou = agora - desde;
  return passou >= JANELAS_MS[tipo].de && passou <= JANELAS_MS[tipo].ate;
};

/**
 * Horário de mandar mensagem que ninguém pediu, em São Paulo.
 *
 * Boas-vindas sai de 8h às 22h, qualquer dia: a pessoa acabou de criar a conta, está acordada e
 * com o app aberto. Lembrete e retomada só de segunda a sábado, das 9h às 19h: são para quem
 * parou, e chegam como mensagem de empresa, não como resposta.
 */
export function horarioDeMandar(tipo: Automatica, agora: number): boolean {
  const c = civilSP(new Date(agora).toISOString());
  if (!c) return false;
  if (tipo === "boas_vindas") return c.hora >= 8 && c.hora < 22;
  const domingo = dowDoDia(c.data) === 6;
  return !domingo && c.hora >= 9 && c.hora < 19;
}

const primeiroNome = (nome: string | null | undefined): string | null => {
  const n = (nome ?? "").trim().split(/\s+/)[0];
  return n ? n[0].toUpperCase() + n.slice(1) : null;
};

const oi = (nome: string | null | undefined) => {
  const n = primeiroNome(nome);
  return n ? `Oi, ${n}!` : "Oi!";
};

/**
 * Os textos. Cada item é uma bolha. Fixos, e não escritos pelo modelo: saem sem ninguém ter
 * escrito, e o Bruno aprova a frase uma vez em vez de torcer a cada envio.
 */
/** Quem a casa oferece para a conversa. O nome está no texto fixo, e não no cadastro, porque
 *  quem aprova a frase é ele. */
export const VENDEDOR_DA_CASA = "Bruno";

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora de São Paulo. */
export function saudacaoDoPeriodo(agora: number): string {
  const hora = civilSP(new Date(agora).toISOString())?.hora ?? 12;
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/**
 * A boas-vindas, no molde da que o Bruno mandava à mão (05/11/2026): cumprimenta, diz que viu a
 * conta, oferece ajuda e a conversa com ele, e termina numa PERGUNTA. A pergunta é o ponto: é ela
 * que faz a pessoa responder, e a resposta abre a conversa em que a maisa conhece o negócio dela.
 */
export function textoDeBoasVindas(nome: string | null, agora: number): string[] {
  const n = primeiroNome(nome);
  return [
    `${saudacaoDoPeriodo(agora)}${n ? `, ${n}` : ""}! Tudo certo?`,
    "Aqui é a maisa. Vi que você criou sua conta na nossa plataforma!",
    `Se tiver qualquer dúvida no processo, me chama aqui que eu te ajudo. Se preferir, também marco uma conversa rápida com o ${VENDEDOR_DA_CASA} pra te mostrar como funciona.`,
    "O que está achando até agora?",
  ];
}

/** `null` para etapa em que não há o que lembrar. */
export function textoDeLembrete(nome: string | null, etapa: EtapaDoCadastro): string[] | null {
  switch (etapa) {
    case "confirmar_email":
      return [`${oi(nome)} Aqui é a maisa.`, "Sua conta ainda está esperando a confirmação do e-mail. Se ele não chegou, me fala que eu te ajudo."];
    case "criar_negocio":
      return [`${oi(nome)} Aqui é a maisa.`, "Vi que sua conta ficou parada antes de criar o negócio. Quer ajuda para terminar? Leva uns 5 minutos."];
    case "conectar_whatsapp":
      return [`${oi(nome)} Aqui é a maisa.`, "Falta só conectar o seu WhatsApp para eu começar a atender os seus clientes. Quer que eu te ajude agora?"];
    default:
      return null;
  }
}

export function textoDeRetomada(nome: string | null, jaMandouLink: boolean): string[] {
  return jaMandouLink
    ? [`${oi(nome)} Conseguiu começar o teste? Se travar em algum passo, me chama aqui.`]
    : [`${oi(nome)} Ficou alguma dúvida sobre a maisa? Se quiser, te mando o link para testar ${DIAS_DE_TESTE} dias grátis.`];
}
