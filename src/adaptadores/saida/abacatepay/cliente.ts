/* ─────────────────────────────────────────────────────────────────────────────
 * O CLIENTE HTTP DA ABACATEPAY. ⚠️ SÓ SERVIDOR.
 *
 * ── POR QUE `fetch` À MÃO E NÃO O SDK OFICIAL ──
 *
 * Eles publicam SDK para Node. Não entra aqui, e o motivo não é gosto:
 *
 *   1. **A superfície que usamos é minúscula.** Cinco endpoints: criar produto, listar
 *      produto, criar cliente, criar checkout de assinatura, cancelar. Uma dependência
 *      nova no `package.json` para cinco POSTs é dívida de atualização permanente em
 *      troca de nada.
 *   2. **O `next build` é o que decide.** Rota da Vercel com `runtime = "nodejs"` já tem
 *      `fetch` global. SDK arrasta bundle e, às vezes, um `node:https` que o Edge recusa —
 *      e esta pasta pode acabar chamada de um contexto Edge sem ninguém reparar.
 *   3. **⚠️ O ENVELOPE DELES EXIGE DESEMBRULHO PRÓPRIO DE QUALQUER FORMA.** Ver abaixo.
 *
 * O contraste com a Stripe é de propósito: lá o SDK entra (`saida/stripe/cliente.ts`)
 * porque a superfície é grande, os tipos são bons e a conferência de HMAC vem dele. Aqui
 * nenhuma das três coisas se aplica.
 *
 * ── ★ O ERRO VEM COM HTTP 200, E É A ARMADILHA CENTRAL DESTA INTEGRAÇÃO ──
 *
 * Toda resposta da AbacatePay é `{ data, error, success }`. A consequência é que
 * `response.ok` **não significa que deu certo**: dá para receber 200 com
 * `{ data: null, error: "...", success: false }`.
 *
 * Quem escrever `const { data } = await r.json()` e seguir recebe `undefined` e continua
 * o fluxo. No caminho do checkout isso produz o defeito mais caro possível: `url`
 * `undefined`, a tela manda o navegador para `about:blank#undefined`, e o cliente que ia
 * pagar R$ 197 vê uma página branca. Sem erro em log nenhum.
 *
 * É por isso que TODA chamada passa por `chamar()`, e é por isso que ela lança em vez de
 * devolver um resultado que alguém pode ignorar.
 * ────────────────────────────────────────────────────────────────────────────── */

import {
  FalhaDoProvedor, LimiteDoProvedor, NaoConfigurado, NaoSuportado, PrecisaReconectar,
} from "@/nucleo/dominio/erros";
import { BASE, CHAVE, faltando } from "./config";

/** O envelope. Igual em todos os endpoints. */
type Envelope<T> = { data: T | null; error: string | null; success?: boolean };

/**
 * Quantas vezes insistir. Dois, o mesmo padrão da casa em integração de pagamento
 * (`saida/stripe/cliente.ts`): o suficiente para atravessar um blip de rede, pouco o
 * bastante para não empilhar atrás do teto da função na Vercel.
 */
const TENTATIVAS = 2;

/**
 * Teto por tentativa. 8s vezes 3 tentativas = 24s, que cabe no `maxDuration = 30` das
 * rotas desta integração com folga para a escrita no Postgres depois.
 *
 * ⚠️ SEM ISTO A ROTA MORRE DE TIMEOUT DA VERCEL EM VEZ DE DEVOLVER ERRO. `fetch` sem
 * `AbortSignal` espera para sempre; a função é morta de fora, e o que a tela recebe é um
 * 504 da plataforma — sem log nosso, sem mensagem, sem pista de qual provedor travou.
 */
const TETO_MS = 8_000;

/** Só o que não é culpa do pedido. Repetir um 400 devolve o mesmo 400. */
const VALE_REPETIR = (s: number) => s === 408 || s === 429 || s >= 500;

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma chamada à API, já desembrulhada e já com o erro virado exceção.
 *
 * Devolve `T` ou lança. Nunca devolve `undefined` disfarçado de sucesso — é o ponto
 * inteiro deste arquivo.
 */
export async function chamar<T>(
  caminho: `/${string}`,
  init?: { metodo?: "GET" | "POST"; corpo?: unknown; busca?: Record<string, string> },
): Promise<T> {
  if (!CHAVE) throw new NaoConfigurado(faltando());

  const url = new URL(`${BASE}${caminho}`);
  /* A query string entrou em 29/09/2026, e com os dois usos que a pediram: achar o produto
   * por `externalId` (`/products/get`) e reler o pagamento na fonte (`/checkouts/get`).
   * Só leitura — nenhum POST desta integração leva filtro, e é bom que continue assim: filtro
   * num POST de pagamento é onde alguém acaba mudando o que se cobra. */
  for (const [k, v] of Object.entries(init?.busca ?? {})) url.searchParams.set(k, v);

  const metodo = init?.metodo ?? (init?.corpo === undefined ? "GET" : "POST");

  let ultimaFalha: unknown;

  for (let tentativa = 0; tentativa <= TENTATIVAS; tentativa++) {
    /* Backoff antes da 2ª e 3ª voltas. Linear e curto de propósito: o objetivo é
     * atravessar um blip, não esperar o provedor voltar de uma queda. */
    if (tentativa > 0) await dorme(300 * tentativa);

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${CHAVE}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: init?.corpo === undefined ? undefined : JSON.stringify(init.corpo),
        signal: AbortSignal.timeout(TETO_MS),
        /* A resposta de um POST de pagamento não pode ser servida de cache em nenhuma
         * circunstância. O Next intercepta `fetch` e cacheia por padrão em alguns
         * contextos de build — e um checkout cacheado devolveria a MESMA url de pagamento
         * para dois clientes diferentes. */
        cache: "no-store",
      });
    } catch (e) {
      /* Rede, DNS, TLS ou o teto de 8s. Todos valem repetir. */
      ultimaFalha = e;
      continue;
    }

    const texto = await resposta.text();

    if (!resposta.ok) {
      if (VALE_REPETIR(resposta.status) && tentativa < TENTATIVAS) {
        ultimaFalha = new Error(`HTTP ${resposta.status}: ${texto.slice(0, 200)}`);
        continue;
      }
      throw erroDeHttp(caminho, resposta.status, texto);
    }

    /* ── o desembrulho ──
     * Chegar aqui significa HTTP 2xx. NÃO significa sucesso. Ver o cabeçalho. */
    let envelope: Envelope<T>;
    try {
      envelope = JSON.parse(texto) as Envelope<T>;
    } catch {
      /* 200 com corpo que não é JSON: quase sempre página de erro de um proxy no meio.
       * Vale repetir — a próxima tentativa pode pegar outro nó. */
      ultimaFalha = new Error(`resposta não-JSON: ${texto.slice(0, 200)}`);
      if (tentativa < TENTATIVAS) continue;
      throw new FalhaDoProvedor(`AbacatePay ${caminho}: resposta não é JSON.`, ultimaFalha);
    }

    /* ★ O `error` DENTRO DO 200. Regra de negócio recusada (produto inexistente, método
     * de pagamento não habilitado na conta, assinatura já cancelada) chega assim. NÃO
     * vale repetir: o pedido é que está errado, e a segunda tentativa recebe o mesmo
     * texto. */
    if (envelope.error) {
      throw erroDeNegocio(caminho, envelope.error);
    }

    /* `success: false` sem `error` preenchido não está documentado, mas o campo existe no
     * envelope — e campo que existe um dia vem. Tratar como falha é a escolha segura:
     * seguir com `data` nulo produziria a url `undefined` do cabeçalho. */
    if (envelope.success === false) {
      throw new FalhaDoProvedor(`AbacatePay ${caminho}: success=false sem mensagem de erro.`);
    }

    if (envelope.data === null || envelope.data === undefined) {
      throw new FalhaDoProvedor(`AbacatePay ${caminho}: respondeu 200 com data vazio.`);
    }

    return envelope.data;
  }

  throw new FalhaDoProvedor(
    `AbacatePay ${caminho}: falhou em ${TENTATIVAS + 1} tentativas.`,
    ultimaFalha,
  );
}

/**
 * A mensagem de erro que veio DENTRO do 200 → erro de domínio.
 *
 * ── ★ POR QUE A CAPACIDADE DA LOJA MERECE ERRO PRÓPRIO ──
 *
 * Porque é o erro que a gente REALMENTE encontrou, e porque ele não tem conserto em
 * código nenhum. Medido em 21/09/2026 contra a loja de sandbox:
 *
 *   "PIX Automático is not available for this store"
 *   "CARD is not available for this store"
 *
 * Um `FalhaDoProvedor` genérico viraria 502 na tela — "falha ao falar com o serviço",
 * que é exatamente a mensagem errada: o serviço respondeu na hora e disse o que faltava.
 * Quem visse isso iria procurar rede, chave, produto e timeout, nessa ordem, e não acharia
 * nada — porque o que falta é um recurso da CONTA, que só o suporte deles liga.
 *
 * `NaoSuportado` é a classe certa: "o provedor ligado hoje não faz isto, e nenhuma
 * configuração muda isso". Vira 501, e a mensagem diz o que fazer.
 */
function erroDeNegocio(caminho: string, mensagem: string): Error {
  if (/is not available for this store/i.test(mensagem)) {
    const metodo = /^(\S+(?:\s+\S+)?)\s+is not available/i.exec(mensagem)?.[1] ?? "o método";
    return new NaoSuportado(
      `${metodo} — a loja da AbacatePay não tem esse meio de pagamento habilitado. `
        + "Peça a habilitação em ajuda@abacatepay.com e ajuste ABACATEPAY_METODOS. "
        + "⚠️ a lista de `methods` é CONJUNÇÃO: pedir um método não habilitado recusa o "
        + "pedido inteiro, mesmo que os outros estejam ligados",
      "AbacatePay",
    );
  }

  return new FalhaDoProvedor(`AbacatePay ${caminho}: ${mensagem}`);
}

/**
 * Status HTTP → erro de domínio.
 *
 * A tradução importa porque a tela faz coisa diferente com cada um: 429 ela espera e
 * tenta de novo sozinha, 401 é um chamado para quem cuida do ambiente, e o resto é
 * "tente de novo". Um `Error` genérico transformaria os três no mesmo 502.
 */
function erroDeHttp(caminho: string, status: number, corpo: string): Error {
  const pedaco = corpo.slice(0, 300);

  if (status === 429) return new LimiteDoProvedor();

  /* ⚠️ 401 e 403 NÃO são a mesma coisa nesta API, e confundi-los custa uma tarde.
   *   · 401 = chave ausente, errada ou revogada
   *   · 403 = a chave é válida e NÃO TEM A PERMISSÃO daquele recurso
   * O 403 é o que acontece com quem criou a chave no painel sem marcar `CHECKOUT:CREATE`
   * — a lista de permissões desta integração está no `LEIA-ME.md`. A mensagem tem de
   * dizer qual dos dois é, senão a investigação começa rotacionando a chave à toa. */
  if (status === 401) {
    return new PrecisaReconectar(
      "A AbacatePay recusou a chave de API (401). Ela está errada, vazia ou foi revogada "
        + "no painel. Confira ABACATEPAY_API_KEY.",
    );
  }
  if (status === 403) {
    return new PrecisaReconectar(
      "A chave da AbacatePay é válida mas não tem permissão para esta operação (403). "
        + `Falta o escopo do recurso em ${caminho} — ver as permissões no LEIA-ME.`,
    );
  }

  return new FalhaDoProvedor(`AbacatePay ${caminho}: HTTP ${status}. ${pedaco}`);
}
