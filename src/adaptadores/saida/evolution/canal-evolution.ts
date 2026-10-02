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
 * Quanto a MAISA "demora para digitar" cada bolha. Proporcional ao tamanho, com teto
 * curto: o cliente está olhando a tela esperando, e cada milissegundo aqui é latência
 * que a rota do webhook segura. Realismo perfeito seria ~5s por bolha — e ninguém
 * espera 5s por educação. */

const MS_POR_CHAR = 18;
const PAUSA_MIN = 400;
const PAUSA_MAX = 2000;

const pausaPara = (txt: string) => Math.min(PAUSA_MAX, Math.max(PAUSA_MIN, txt.length * MS_POR_CHAR));

/**
 * A PRIMEIRA bolha sai sem pausa nenhuma, e isso é deliberado: o cliente já esperou o
 * modelo pensar (alguns segundos), então uma pausa "para parecer humano" antes da
 * primeira resposta só soma em cima de uma espera que já existiu.
 */
const pausaDaBolha = (txt: string, indice: number) => (indice === 0 ? 0 : pausaPara(txt));

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

export function criarCanalEvolution(deps: {
  instanciaDe: ResolvedorDeInstancia;
  /** Para quem escalar, NESTE inquilino. Ver o ⚠️ dentro de `escalar`. */
  donoDe: (t: ContextoTenant) => Promise<string | null>;
}): CanalDeMensagens {
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

    for (let i = 0; i < textos.length; i++) {
      const texto = textos[i].trim();
      if (!texto) continue;

      /* O `delay` é executado DENTRO da Evolution: ela segura a requisição e só então
       * despacha. Preferido a dormir aqui porque a pausa acontece do lado que também
       * controla a presença — e porque um `sleep` nosso é tempo de função serverless
       * comprado para não fazer nada.
       *
       * Se o "digitando…" não aparecer na sua versão da Evolution, a peça que liga é
       * `sinalizarDigitando()` no cliente; o ritmo das bolhas já funciona sem ela. */
      await comSegundaChance(() => enviarTexto({ instancia, numero, texto, delayMs: pausaDaBolha(texto, i) }));
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

    try {
      /* Também pela instância do inquilino: o dono precisa receber o aviso NO MESMO
       * número em que a conversa está acontecendo, senão ele abre o WhatsApp errado para
       * assumir. Se resolver falhar, o `catch` já garante que escalar nunca lança. */
      const instancia = await deps.instanciaDe(t);
      await enviarTexto({ instancia, numero: numeroDono, texto: aviso });
    } catch (e) {
      console.error(`[evolution/escalar ${p.telefone}] não conseguiu avisar o dono: ${p.motivo}`, e);
    }
  },
  };
}
