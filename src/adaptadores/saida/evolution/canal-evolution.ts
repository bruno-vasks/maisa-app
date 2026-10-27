/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a porta `CanalDeMensagens` cumprida pela Evolution API.
 *
 * É o irmão de saída do `entrada/whatsapp/`: um recebe a fala do cliente, este devolve.
 * Substitui o `canalDemo` (que escrevia no log) com uma linha em `composicao.ts`.
 *
 * A porta fala em LISTA de textos, não em texto (ver `portas/saida/canal-mensagens.ts`),
 * e este arquivo é onde essa decisão se paga: cada item vira uma bolha, com pausa entre
 * elas. Bolha é o que separa conversa de notificação.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import { FalhaDoProvedor, LimiteDoProvedor } from "@/nucleo/dominio/erros";
import { soDigitos } from "@/nucleo/dominio/clientes";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

import { EVOLUTION } from "./config";
import { enviarDocumento, enviarTexto } from "./cliente";

/* ───────────────────────────── o número ─────────────────────────────
 * A Evolution quer DDI+DDD+número em dígitos puros. O telefone chega aqui de duas
 * origens que não combinam: do webhook vem "5511988887777" (já limpo), e do cadastro
 * vem "(11) 98123-4567" — escrito por gente. Normalizar aqui, num lugar só, é o que
 * evita a classe de bug mais chata desta integração: a mensagem "envia com sucesso"
 * (a Evolution aceita) e nunca chega em ninguém. */

/**
 * Telefone em qualquer grafia → o formato que a Evolution aceita.
 *
 * O DDI é acrescentado por DEDUÇÃO quando o número tem cara de brasileiro (10 dígitos
 * com fixo, 11 com celular). É uma suposição, e ela está aqui em vez de espalhada: se um
 * dia a MAISA atender fora do Brasil, é esta função que muda.
 *
 * Devolve "" quando não dá para deduzir nada — e quem chama trata isso como falha, em
 * vez de mandar para um número inventado.
 */
export function paraNumeroWhats(v: string): string {
  // Aceita JID inteiro por conveniência ("5511...@s.whatsapp.net", com ou sem :device).
  const d = soDigitos(v.split("@")[0]?.split(":")[0] ?? "");

  if (d.length === 10 || d.length === 11) return `55${d}`;          // sem DDI
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d; // com DDI
  if (d.length >= 11 && d.length <= 15) return d;                   // outro país, respeita
  return "";
}

/* ───────────────────────────── o ritmo ─────────────────────────────
 * Quanto tempo o "digitando…" aparece antes de cada bolha, e quanto se espera entre uma
 * pessoa e outra. Muda com QUEM está mandando, e por isso é escolhido em `composicao.ts`,
 * uma instância do canal por ritmo:
 *
 *   • "conversa" — a MAISA respondendo o cliente. Digita TODAS as bolhas, a primeira
 *     também, proporcional ao tamanho: ~1,5 palavra por segundo, sorteado entre 1,3 e 1,8
 *     a cada bolha. Pedido do Bruno em 27/10/2026, e o motivo é o banimento: pela
 *     Evolution a MAISA é um WhatsApp Web não oficial, e resposta instantânea, várias
 *     bolhas no mesmo segundo, sempre no mesmo compasso, é o desenho de robô. Até aqui a
 *     primeira bolha saía sem "digitando…" nenhum e as seguintes a ~10 palavras/s.
 *   • "rotina" — o lembrete que parte sem ninguém ter escrito. Digita pouco (o texto é
 *     pronto) e ESPAÇA as pessoas: duas mensagens da mesma instância para pessoas
 *     diferentes nunca saem com menos de 3 a 7 s entre elas. Cem lembretes em trinta
 *     segundos é o padrão de disparo em massa.
 *   • "direto" — o que já existia: a primeira bolha na hora, as outras com pausa curta. É
 *     a resposta que o DONO escreveu no painel (ele já digitou; segurar a mensagem dele é
 *     a tela travada) e os avisos para o próprio dono.
 *
 * Por que não mais devagar, se gente digita no celular a ~0,6 palavra/s: uma resposta de
 * três bolhas levaria mais de um minuto, e o cliente desiste antes. Não há evidência pública de que o WhatsApp meça velocidade de digitação;
 * o que tira a cara de robô é o "digitando…" existir, durar conforme o tamanho e variar.
 *
 * ⚠️ O TETO DA RESPOSTA (18 s) ENTRA NA CONTA DO AGENTE. `ORCAMENTO_DO_TURNO_MS`, em
 * `entrada/whatsapp/agente.ts`, conta com ele dentro do teto da função. Subir um
 * sem rever o outro é turno cortado no meio do envio. */

export type Ritmo = "conversa" | "rotina" | "direto";

type Compasso = {
  /** Milissegundos de "digitando…" por caractere, sorteado a cada bolha entre os dois. */
  msPorCaractere: [number, number];
  minimoMs: number;
  maximoMs: number;
  /** Teto da resposta inteira: passou, todas as bolhas encolhem na mesma proporção. */
  tetoMs: number;
  /** Pausa entre uma bolha entregue e o "digitando…" da seguinte. */
  entreBolhasMs: [number, number];
  /** Intervalo mínimo entre mensagens para pessoas DIFERENTES pela mesma instância. */
  entrePessoasMs: [number, number] | null;
};

const COMPASSOS: Record<Exclude<Ritmo, "direto">, Compasso> = {
  /* 95–130 ms por caractere ≈ 7,7–10,5 caracteres/s ≈ 1,3–1,8 palavra/s (6 caracteres por
   * palavra, contando o espaço). "Oi, tudo bem?" digita ~1,5 s; uma bolha de 90 caracteres,
   * ~10 s. */
  conversa: { msPorCaractere: [95, 130], minimoMs: 1_400, maximoMs: 10_000, tetoMs: 18_000, entreBolhasMs: [400, 1_100], entrePessoasMs: null },
  rotina: { msPorCaractere: [95, 130], minimoMs: 1_400, maximoMs: 4_000, tetoMs: 4_000, entreBolhasMs: [400, 1_100], entrePessoasMs: [3_000, 7_000] },
};

const sortearEntre = ([a, b]: [number, number], sorteio: () => number) => Math.round(a + (b - a) * sorteio());

/** O ritmo "direto", como era: a primeira bolha sem pausa, as outras com 400 ms a 2 s. */
const pausaDireta = (txt: string, indice: number) => (indice === 0 ? 0 : Math.min(2_000, Math.max(400, txt.length * 18)));

/**
 * Quantos milissegundos de "digitando…" cada bolha recebe. Pura: o sorteio entra por
 * argumento para o teste fixar.
 */
export function esperasDeDigitacao(bolhas: string[], ritmo: Ritmo, sorteio: () => number = Math.random): number[] {
  if (ritmo === "direto") return bolhas.map(pausaDireta);
  const c = COMPASSOS[ritmo];
  const cruas = bolhas.map((b) =>
    Math.min(c.maximoMs, Math.max(c.minimoMs, b.length * sortearEntre(c.msPorCaractere, sorteio))),
  );
  const soma = cruas.reduce((a, b) => a + b, 0);
  const fator = soma > c.tetoMs ? c.tetoMs / soma : 1;
  return cruas.map((ms) => Math.round(ms * fator));
}

/** O que fica de fora do "digitando…" na conta do prazo: a ida à Evolution, por bolha, e uma
 *  folga para o turno ainda gravar e fechar. */
const IDA_POR_BOLHA_MS = 1_500;
const FOLGA_DO_PRAZO_MS = 3_000;

/**
 * Encolhe a digitação para caber até `prazo`, na mesma proporção em todas as bolhas. É a
 * rede de segurança do orçamento do agente: um turno que pensou demais ainda entrega a
 * resposta inteira, só que digitada mais depressa, em vez de ser cortado pela plataforma
 * no meio da segunda bolha.
 */
export function caberNoPrazo(esperas: number[], prazo: number | undefined, agora: number): number[] {
  if (prazo === undefined) return esperas;
  const sobra = prazo - agora - FOLGA_DO_PRAZO_MS - IDA_POR_BOLHA_MS * esperas.length;
  const soma = esperas.reduce((a, b) => a + b, 0);
  if (soma <= sobra) return esperas;
  const fator = Math.max(0, sobra) / soma;
  return esperas.map((ms) => Math.floor(ms * fator));
}

/* ── a vez de cada pessoa ──
 * Por instância, NESTE processo: quando foi a última mensagem e para quem. Só o ritmo
 * "rotina" espera por ela; os outros só anotam. Vale dentro de uma execução (a rotina manda
 * em série, na mesma função), que é onde a rajada de lembretes acontece. */
const ultimaPorInstancia = new Map<string, { numero: string; em: number }>();

async function esperarAVez(instancia: string, numero: string, compasso: Compasso, sorteio: () => number) {
  const ultima = ultimaPorInstancia.get(instancia);
  if (!compasso.entrePessoasMs || !ultima || ultima.numero === numero) return;
  const falta = ultima.em + sortearEntre(compasso.entrePessoasMs, sorteio) - Date.now();
  if (falta > 0) await dormir(falta);
}

/* ───────────────────────────── uma segunda chance ─────────────────────────────
 * Só `LimiteDoProvedor`, e só uma vez.
 *
 * Aquele erro tem um significado preciso, montado em `cliente.ts`: a Evolution disse que
 * NÃO processou (429, 502, 503, 504). Nesses casos repetir é seguro e é a diferença
 * entre o cliente receber a resposta e ficar no vácuo por um soluço de rede.
 *
 * Tudo o mais (timeout, 500, número inexistente) é `FalhaDoProvedor` e passa direto: pode
 * ter sido entregue, e mensagem duplicada num WhatsApp de cliente é um erro que ele VÊ.
 * Uma tentativa só porque, se a segunda também falhar, a terceira não muda nada — só
 * aumenta o tempo que a rota do webhook fica pendurada. */

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ESPERA_RETENTATIVA = 700;

async function comSegundaChance<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (e) {
    if (!(e instanceof LimiteDoProvedor)) throw e;
    await dormir(ESPERA_RETENTATIVA);
    return acao();
  }
}

/* ───────────────────────────── o canal ─────────────────────────────
 * O `ContextoTenant` PASSOU A SER USADO em 13/08/2026. O comentário que estava aqui
 * prometia isto: "quando `integracoes_whatsapp` estiver povoada, é dele que sairá qual
 * instância atende cada negócio — e a assinatura já pede o contexto para que essa
 * mudança não chegue até aqui como quebra". Chegou, e não quebrou: a porta não mudou.
 *
 * ── POR QUE VIROU FÁBRICA ──
 *
 * Resolver "qual instância é deste inquilino" é ler `integracoes_whatsapp`, e isso é
 * trabalho de OUTRO adaptador. Importá-lo daqui seria adaptador conhecendo adaptador —
 * a única costura que este repositório não faz, porque é por ela que um hexágono vira
 * bola de barro. Então o resolvedor entra por argumento, e quem casa os dois é
 * `composicao.ts`, como sempre.
 *
 * ⚠️ FALHA FECHADA. Inquilino sem instância própria NÃO cai na env global. Cair seria o
 * pior defeito imaginável neste produto: a mensagem do cliente de um negócio sairia pelo
 * WhatsApp de outro — com o número, o nome e o histórico errados, para um terceiro que
 * não tem nada a ver. Melhor não entregar e gritar. */

export type ResolvedorDeInstancia = (t: ContextoTenant) => Promise<string>;

/* ───────────────────────────── um aviso por cliente ─────────────────────────────
 * O dono é chamado UMA vez por cliente a cada 10 minutos, neste processo. Escalar acontece
 * nos caminhos de falha, e falha costuma se repetir: com a cota do modelo esgotada, cada
 * mensagem do mesmo cliente virava um 🔔 novo, todos iguais, no WhatsApp do dono, saindo
 * do número do negócio. O primeiro aviso já leva o dono à conversa; os seguintes só
 * engordam o volume que o WhatsApp vê. */
const AVISO_REPETIDO_MS = 10 * 60_000;
const avisadosEm = new Map<string, number>();

export function criarCanalEvolution(deps: {
  instanciaDe: ResolvedorDeInstancia;
  /** Para quem escalar, NESTE inquilino. Ver o ⚠️ dentro de `escalar`. */
  donoDe: (t: ContextoTenant) => Promise<string | null>;
  /** Ver "o ritmo", acima. Sem ele, "direto": o comportamento de antes de 27/10/2026. */
  ritmo?: Ritmo;
  /** Até quando (ms desde 1970) a execução pode durar, quando a plataforma diz. Ver
   *  `caberNoPrazo`. Quem sabe disso é a plataforma, e por isso entra por aqui. */
  prazo?: () => number | undefined;
  /** Só para o teste fixar o sorteio. */
  sorteio?: () => number;
}): CanalDeMensagens {
  const ritmo = deps.ritmo ?? "direto";
  const sorteio = deps.sorteio ?? Math.random;
  return {
  /**
   * Envia na ordem, uma bolha por chamada.
   *
   * SEQUENCIAL, nunca em paralelo: `Promise.all` entregaria as bolhas fora de ordem
   * (a segunda é mais curta, chega antes), e uma resposta fora de ordem no WhatsApp lê
   * como bot quebrado — que é exatamente o que as bolhas existem para evitar.
   *
   * O contrato da porta diz que uma falha no meio não desfaz as anteriores, então
   * lançamos e deixamos o que já foi entregue entregue. Não há transação em cima de
   * mensagem lida por um humano, e simulá-la seria pior que assumir isso.
   */
  async enviar(t, para, textos) {
    if (textos.length === 0) return;

    /* Resolve ANTES de validar o telefone e antes do laço: se o inquilino não tem canal,
     * nada deve ser enviado — nem a primeira bolha. Resolver dentro do laço mandaria a
     * primeira e falharia na segunda, deixando o cliente com meia resposta. */
    const instancia = await deps.instanciaDe(t);

    const numero = paraNumeroWhats(para);
    if (!numero) {
      throw new FalhaDoProvedor(`Telefone "${para}" não virou número de WhatsApp válido — nada foi enviado.`);
    }

    const bolhas = textos.map((x) => x.trim()).filter(Boolean);
    if (bolhas.length === 0) return;
    if (ritmo !== "direto") await esperarAVez(instancia, numero, COMPASSOS[ritmo], sorteio);
    const esperas = caberNoPrazo(esperasDeDigitacao(bolhas, ritmo, sorteio), deps.prazo?.(), Date.now());

    try {
      for (let i = 0; i < bolhas.length; i++) {
        if (i > 0 && ritmo !== "direto") await dormir(sortearEntre(COMPASSOS[ritmo].entreBolhasMs, sorteio));

        /* O `delay` é o "digitando…", e roda DENTRO da Evolution: conferido no código da
         * 2.3.7, ela manda a presença `composing`, espera, manda `paused` e só então envia —
         * segurando a nossa requisição esse tempo todo (o prazo do `enviarTexto` já soma o
         * `delay`). Uma chamada por bolha, em vez de presença + envio separados. */
        const texto = bolhas[i];
        await comSegundaChance(() => enviarTexto({ instancia, numero, texto, delayMs: esperas[i] }));
      }
    } finally {
      ultimaPorInstancia.set(instancia, { numero, em: Date.now() });
    }
  },

  /**
   * Manda um arquivo com legenda (o PDF do recibo). Mesmas regras do `enviar`: a instância é do
   * inquilino, sem cair na env, e número que não vira WhatsApp não manda nada.
   *
   * ⚠️ SEM SEGUNDA CHANCE, ao contrário do texto: a Evolution segura a resposta enquanto baixa o
   * arquivo, e um "indisponível" no meio disso pode ter entregado. Documento fiscal duplicado no
   * WhatsApp do paciente é pior que um aviso que a tela conta como "não foi".
   */
  async enviarDocumento(t, para, doc) {
    const instancia = await deps.instanciaDe(t);
    const numero = paraNumeroWhats(para);
    if (!numero) {
      throw new FalhaDoProvedor(`Telefone "${para}" não virou número de WhatsApp válido — nada foi enviado.`);
    }
    await enviarDocumento({ instancia, numero, url: doc.url, nomeDoArquivo: doc.nomeDoArquivo, legenda: doc.legenda });
  },

  /**
   * Chama o dono. Nunca lança — e essa é a regra mais importante deste arquivo.
   *
   * `escalar` é chamado justamente nos caminhos de FALHA do agente (modelo recusou, loop
   * girou sem resposta, ferramenta desistiu). Uma exceção aqui substituiria o problema
   * original por um erro de notificação, e o log mostraria a falha errada — enquanto o
   * cliente, do outro lado, continua sem ninguém.
   */
  async escalar(t, p) {
    const cliente = paraNumeroWhats(p.telefone);
    const aviso =
      `🔔 *MAISA precisa de você*\n\n` +
      `Cliente: +${cliente || soDigitos(p.telefone)}\n` +
      `Motivo: ${p.motivo}\n\n` +
      // Link tocável: o dono abre a conversa e assume, sem procurar o contato na lista.
      `Assumir: https://wa.me/${cliente || soDigitos(p.telefone)}`;

    /* ── ⚠️ O DESTINO VEM DO INQUILINO, NUNCA MAIS DO AMBIENTE ──
     *
     * Até 17/08/2026 este aviso ia para `MAISA_WHATSAPP_DONO`, uma env global. Como ele
     * carrega o TELEFONE DO CLIENTE FINAL e o motivo da conversa, isso significava
     * entregar o número do cliente da barbearia do Zé no WhatsApp de outra pessoa — um
     * vazamento entre inquilinos que nenhuma auditoria de RLS pegaria, porque o dado nunca
     * passa pelo banco no caminho da entrega.
     *
     * E o Zé nunca era avisado: toda conversa que a MAISA não resolvesse morria com o
     * cliente esperando e o dono sem saber que havia alguém esperando.
     *
     * A env sobrou como fallback SÓ FORA DE PRODUÇÃO, para o `curl` de desenvolvimento
     * continuar exercitando o caminho sem precisar de linha no banco. Em produção ela é
     * ignorada de propósito: um fallback global aqui é exatamente o defeito que este
     * bloco existe para não ter. */
    const doInquilino = await deps.donoDe(t).catch(() => null);
    const emDesenvolvimento = process.env.NODE_ENV !== "production";
    const destino = doInquilino || (emDesenvolvimento ? EVOLUTION.dono : "");

    if (!destino) {
      console.warn(
        `[evolution/escalar ${p.telefone}] ${p.motivo} — este negócio não tem "WhatsApp do dono" ` +
        `preenchido (integracoes_whatsapp.telefone_dono), ninguém avisado.`,
      );
      return;
    }

    const numeroDono = paraNumeroWhats(destino);
    if (!numeroDono) {
      console.warn(`[evolution/escalar] "${destino}" não é número válido. ${p.motivo}`);
      return;
    }

    let chave = "";
    try {
      /* Também pela instância do inquilino: o dono precisa receber o aviso NO MESMO
       * número em que a conversa está acontecendo, senão ele abre o WhatsApp errado para
       * assumir. Se resolver falhar, o `catch` já garante que escalar nunca lança. */
      const instancia = await deps.instanciaDe(t);

      /* Ver "um aviso por cliente", acima. Marcado ANTES de enviar, para dois turnos ao mesmo
       * tempo não mandarem dois; desmarcado no `catch`, para um aviso que falhou não calar
       * o próximo. */
      chave = `${instancia}|${numeroDono}|${cliente || soDigitos(p.telefone)}`;
      const agora = Date.now();
      for (const [k, em] of avisadosEm) if (agora - em > AVISO_REPETIDO_MS) avisadosEm.delete(k);
      if (avisadosEm.has(chave)) {
        console.info(`[evolution/escalar ${p.telefone}] o dono já foi avisado deste cliente há pouco; sem aviso novo: ${p.motivo}`);
        return;
      }
      avisadosEm.set(chave, agora);

      await enviarTexto({ instancia, numero: numeroDono, texto: aviso });
    } catch (e) {
      if (chave) avisadosEm.delete(chave);
      console.error(`[evolution/escalar ${p.telefone}] não conseguiu avisar o dono: ${p.motivo}`, e);
    }
  },
  };
}
