/* ─────────────────────────────────────────────────────────────────────────────
 * Cliente HTTP da Evolution API (v2). ⚠️ SÓ SERVIDOR.
 * Doc: https://doc.evolution-api.com/v2/  ·  Auth: header `apikey: <token>`
 *
 * Todas as rotas terminam com o nome da instância no PATH:
 *   POST /message/sendText/{instancia}
 *   POST /chat/sendPresence/{instancia}
 *   GET  /instance/connectionState/{instancia}
 *
 * Este arquivo faz duas coisas e nada além: fala HTTP e traduz falha da Evolution para
 * erro de domínio. Quem decide o que mandar é `canal-evolution.ts`.
 *
 * A TRADUÇÃO DE ERRO É A PARTE QUE IMPORTA. `LimiteDoProvedor` significa, no vocabulário
 * do `dominio/erros.ts`, "transitório, pergunte de novo" — e o agente confia nisso: ao
 * receber esse erro numa ferramenta, ele CHAMA DE NOVO (ver `comoFrase` em
 * `entrada/whatsapp/ferramentas.ts`). Classificar um envio como transitório quando ele
 * pode ter sido entregue faria o cliente receber a mesma mensagem duas vezes. Por isso
 * o critério aqui é "a Evolution disse que não processou", nunca "deu ruim".
 * ────────────────────────────────────────────────────────────────────────────── */

import {
  ErroDeDominio, FalhaDoProvedor, LimiteDoProvedor, NaoConfigurado, PrecisaReconectar,
} from "@/nucleo/dominio/erros";
import { EVOLUTION, evolutionFaltando, isEvolutionConfigured } from "./config";

export type RespostaCrua = { status: number; data: any };

/**
 * A Evolution reporta erro em três formatos diferentes, dependendo de onde ele nasceu
 * (validação do DTO, exceção do controller, erro do Baileys). Procuramos nos três
 * porque a mensagem dela costuma ser a única pista útil — "Bad Request" sozinho não
 * distingue "número não existe no WhatsApp" de "instância desconectada".
 */
function mensagemDeErro(data: any, status: number): string {
  const bruta =
    data?.response?.message ?? data?.message ?? data?.error ?? data?.response?.error ?? null;

  const texto = Array.isArray(bruta)
    ? bruta.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("; ")
    : typeof bruta === "string"
      ? bruta
      : bruta
        ? JSON.stringify(bruta)
        : "";

  return texto || `Evolution respondeu ${status} sem detalhe.`;
}

/**
 * Chamada crua: devolve status e corpo, e **só lança em falha de rede**.
 *
 * Existe separada de `exigir()` porque a rota de diagnóstico precisa MOSTRAR o 401 em
 * vez de virar uma exceção — quando o problema é a credencial, o texto da Evolution é
 * exatamente o que a pessoa precisa ler.
 */
export async function chamar(
  caminho: string,
  opts: {
    metodo?: "GET" | "POST" | "PUT" | "DELETE"; corpo?: unknown; timeoutMs?: number;
    /** Qual credencial usar. Omitido = o token da INSTÂNCIA (o padrão: mandar mensagem).
     *  As rotas de `/instance/*` passam o GLOBAL — ver o bloco de administração no fim. */
    chave?: string;
  } = {},
): Promise<RespostaCrua> {
  if (!isEvolutionConfigured) throw new NaoConfigurado(evolutionFaltando());

  const { metodo = "POST", corpo, timeoutMs = EVOLUTION.timeoutMs } = opts;

  /* AbortController em vez de `AbortSignal.timeout`: o `clearTimeout` no `finally`
   * garante que o timer não segure o event loop depois de a resposta chegar — numa
   * função serverless, timer pendente é invocação que não encerra. */
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${EVOLUTION.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        apikey: opts.chave || EVOLUTION.apiKey,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ac.signal,
      // Nunca cachear: são chamadas de efeito. O Next cacheia fetch por padrão no
      // App Router, e um POST de mensagem servido do cache seria uma mensagem não enviada.
      cache: "no-store",
    });

    /* ⚠️ CONFERIR QUE A RESPOSTA É JSON, e não só que o status foi 200.
     *
     * Isto não é paranoia — foi um erro real na primeira configuração: a
     * `EVOLUTION_API_URL` apontava para o serviço do **n8n** no mesmo Easypanel (o
     * projeto tem os dois). O n8n devolve o HTML do frontend dele para qualquer caminho
     * desconhecido, com **HTTP 200**. Sem esta checagem, `res.json()` falhava, virava
     * `{}`, o status 200 dizia "deu certo", e a rota de diagnóstico informava
     * `estado: "desconhecido"` — a única mensagem que NÃO ajuda a descobrir que o
     * problema era a URL do serviço errado.
     *
     * Vale para qualquer intermediário que responda HTML: página de login de proxy,
     * captive portal, tela de erro de CDN. Todos dão 200 e nenhum é a Evolution. */
    const tipo = res.headers.get("content-type") ?? "";
    const cru = await res.text();

    if (!tipo.includes("json")) {
      const parece = /n8n/i.test(cru) ? " (a resposta parece ser do n8n)" : "";
      throw new FalhaDoProvedor(
        `${EVOLUTION.baseUrl} respondeu "${tipo || "sem content-type"}" em vez de JSON${parece}. ` +
          `Isso não é um servidor Evolution: confira se EVOLUTION_API_URL é o domínio do serviço da Evolution ` +
          `(Easypanel → serviço evolution-api → Domains), e não de outro serviço do mesmo projeto.`,
      );
    }

    let data: any = {};
    try {
      data = cru ? JSON.parse(cru) : {};
    } catch {
      throw new FalhaDoProvedor(`A Evolution respondeu JSON inválido (${res.status}): ${cru.slice(0, 200)}`);
    }

    return { status: res.status, data };
  } catch (e) {
    /* Erro de domínio que nasceu ACIMA (resposta não-JSON, JSON inválido) passa direto.
     * Sem esta linha, o `catch` de rede engoliria a mensagem específica — "isso não é um
     * servidor Evolution" — e a substituiria por "não foi possível falar com a
     * Evolution", que descreve o sintoma errado e manda procurar no lugar errado. */
    if (e instanceof ErroDeDominio) throw e;

    /* Timeout e queda de rede caem aqui, e os dois são AMBÍGUOS: a mensagem pode ter
     * sido entregue e só a resposta ter se perdido. `FalhaDoProvedor` (terminal) e não
     * `LimiteDoProvedor` (transitório) exatamente por isso — ver o cabeçalho. */
    const abortou = e instanceof Error && e.name === "AbortError";
    throw new FalhaDoProvedor(
      abortou
        ? `A Evolution não respondeu em ${timeoutMs}ms. A mensagem pode ter sido enviada — não repita automaticamente.`
        : `Não foi possível falar com a Evolution em ${EVOLUTION.baseUrl}.`,
      e,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Status HTTP que significam "não processei" — os únicos seguros para repetir. */
export function ehTransitorio(status: number): boolean {
  // 429: recusou por cota, não entregou.
  // 502/503/504: o proxy respondeu, a Evolution não recebeu.
  // 500 fica FORA de propósito: erro dentro da Evolution pode ser depois do envio.
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Chamada que exige sucesso: devolve o corpo ou lança erro de domínio.
 *
 * O mapeamento de status é decisão de produto disfarçada de código:
 *   401/403 → `NaoConfigurado`: credencial errada não se resolve tentando de novo, e
 *             não é "reconectar o WhatsApp" — é variável de ambiente errada.
 *   404     → `PrecisaReconectar`: a instância não existe no servidor. A ação que
 *             resolve é humana (recriar/reconectar), e é o mesmo status que a agenda
 *             do Google usa para pedir a mesma coisa — a UI já sabe oferecer o botão.
 */
export async function exigir(
  caminho: string,
  opts: {
    metodo?: "GET" | "POST" | "PUT" | "DELETE"; corpo?: unknown; timeoutMs?: number; chave?: string;
  } = {},
): Promise<any> {
  const { status, data } = await chamar(caminho, opts);
  if (status >= 200 && status < 300) return data;

  const msg = mensagemDeErro(data, status);

  if (status === 401 || status === 403) {
    throw new NaoConfigurado([`EVOLUTION_API_KEY (a Evolution recusou: ${msg})`]);
  }
  if (status === 404) {
    throw new PrecisaReconectar(
      `A instância "${EVOLUTION.instancia}" não existe nesse servidor Evolution (ou o caminho ${caminho} não existe nessa versão).`,
    );
  }
  if (ehTransitorio(status)) {
    throw new LimiteDoProvedor(`A Evolution está indisponível no momento (${status}): ${msg}`);
  }

  /* ⚠️ INSTÂNCIA NÃO PAREADA. Medido contra a Evolution 2.3.7: com a instância em
   * `state: "close"`, o `sendText` responde **HTTP 500** com
   * `{"response":{"message":"Connection Closed"}}`.
   *
   * 500 sugere "erro interno deles", mas não é: é o WhatsApp desconectado, e o conserto é
   * HUMANO — alguém tem que ler o QR Code no manager. É a definição de
   * `PrecisaReconectar` (ver `dominio/erros.ts`), e classificar assim tem dois efeitos
   * concretos: a rota de diagnóstico passa a responder 409 `status: "reconectar"` (que a
   * UI já sabe tratar com um botão, em vez de 502 "erro"), e o agente avisa o DONO em vez
   * de dizer ao cliente que deu problema técnico.
   *
   * Casamos pelo texto, não pelo 500 puro: um 500 de verdade da Evolution não deve virar
   * "reconecte", ou o dono passa a ler QR Code para resolver bug de servidor. */
  if (/connection closed|connection lost|not connected|close(d)? state/i.test(msg)) {
    throw new PrecisaReconectar(
      `A instância "${EVOLUTION.instancia}" não está conectada ao WhatsApp ("${msg}"). ` +
        `Abra ${EVOLUTION.baseUrl}/manager, entre na instância e leia o QR Code.`,
    );
  }

  throw new FalhaDoProvedor(`Evolution ${status}: ${msg}`);
}

/* ───────────────────────────── as chamadas que usamos ─────────────────────────────
 * Só quatro. Cada endpoint a mais é superfície que alguém tem que manter alinhada com
 * uma API que muda de versão em versão — e a MAISA conversa por texto. */

const inst = () => encodeURIComponent(EVOLUTION.instancia);

/**
 * Manda texto. `number` é DDI+DDD+número em DÍGITOS PUROS ("5511988887777"): a Evolution
 * acrescenta o `@s.whatsapp.net`. Mandar o JID pronto funciona em algumas versões e
 * falha silenciosamente em outras — dígitos é o formato documentado.
 *
 * `delay` pausa o envio DENTRO da Evolution (ela segura a requisição). É o que dá ritmo
 * de conversa às bolhas; ver `canal-evolution.ts`.
 */
export function enviarTexto(p: { numero: string; texto: string; delayMs?: number; instancia?: string }): Promise<any> {
  /* `instancia` opcional e não obrigatória: `escalar` e as rotas de diagnóstico ainda
   * mandam pela instância do ambiente, e forçar o argumento aqui obrigaria cada um deles
   * a resolver um inquilino que eles não têm. Quem ENTREGA MENSAGEM DE CLIENTE sempre
   * passa — ver `canal-evolution.ts`, onde a omissão é proibida por construção. */
  return exigir(`/message/sendText/${p.instancia ? encodeURIComponent(p.instancia) : inst()}`, {
    corpo: {
      number: p.numero,
      text: p.texto,
      ...(p.delayMs ? { delay: p.delayMs } : {}),
      /* Sem prévia de link, sempre. A prévia depende de a Evolution baixar a URL, o que
       * atrasa o envio, e num agendamento a única URL que aparece é o Meet — cuja prévia
       * é uma caixa cinza sem informação. */
      linkPreview: false,
    },
  });
}

/**
 * Manda UM arquivo, com legenda (01/10/2026: o PDF do recibo).
 *
 * `POST /message/sendMedia/{instância}`, corpo PLANO como o do texto (é a forma da v2; o
 * `mediaMessage` aninhado era da v1). Conferido no `SendMediaDto` da Evolution: `mediatype`,
 * `mimetype`, `caption`, `fileName` e `media`, que aceita URL ou base64. Mandamos URL, curta, que
 * a Evolution baixa na hora: o PDF não passa pelo corpo da requisição nem fica no nosso log.
 *
 * Prazo maior que o do texto: a Evolution segura a resposta enquanto baixa o arquivo.
 */
export function enviarDocumento(p: {
  numero: string; url: string; nomeDoArquivo: string; legenda: string; instancia?: string; mimetype?: string;
}): Promise<any> {
  return exigir(`/message/sendMedia/${p.instancia ? encodeURIComponent(p.instancia) : inst()}`, {
    corpo: {
      number: p.numero,
      mediatype: "document",
      mimetype: p.mimetype ?? "application/pdf",
      media: p.url,
      fileName: p.nomeDoArquivo,
      caption: p.legenda,
    },
    timeoutMs: Math.max(EVOLUTION.timeoutMs, 30_000),
  });
}

/**
 * "digitando…" por `delayMs`. Disponível, mas fora do caminho normal de envio — ver a
 * nota em `canal-evolution.ts` sobre por que o ritmo vem do `delay` do sendText.
 *
 * Corpo PLANO. Em versões antigas a doc mostrava tudo dentro de `options`, e é erro
 * conhecido (evolution-api#1107): mandar aninhado devolve 400 de validação.
 */
export function sinalizarDigitando(p: { numero: string; delayMs: number }): Promise<any> {
  return exigir(`/chat/sendPresence/${inst()}`, {
    corpo: { number: p.numero, delay: p.delayMs, presence: "composing" },
  });
}

/** Estado do pareamento: `open` (conectado), `connecting`, `close`. */
export async function estadoDaInstancia(): Promise<{ estado: string; cru: any }> {
  const data = await exigir(`/instance/connectionState/${inst()}`, { metodo: "GET" });
  return { estado: String(data?.instance?.state ?? data?.state ?? "desconhecido"), cru: data };
}

/**
 * Aponta o webhook da instância para o nosso app. Chamada de OPERAÇÃO, não de conversa:
 * roda uma vez por instância (ou quando a URL do app muda).
 *
 * `headers.apikey` é o que faz a autenticação da nossa rota funcionar: a Evolution
 * repassa esses headers em cada POST, então ela passa a provar quem é (ver o header
 * `apikey` conferido em `app/api/whatsapp/route.ts`).
 *
 * `events` com UM item de propósito. Assinar tudo faz a Evolution nos entregar recibo de
 * entrega, "digitando" do cliente e presença — dezenas de POST por conversa, todos
 * descartados, cada um uma invocação paga.
 *
 * ⚠️ O nome do evento aqui é `MESSAGES_UPSERT` (maiúsculo), mas o que chega no corpo do
 * webhook é `messages.upsert` (minúsculo, com ponto). A Evolution é inconsistente nisso
 * — o normalizador aceita as duas grafias.
 */
export function configurarWebhook(p: { url: string; segredo: string }): Promise<any> {
  return exigir(`/webhook/set/${inst()}`, {
    corpo: {
      webhook: {
        enabled: true,
        url: p.url,
        headers: { apikey: p.segredo, "Content-Type": "application/json" },
        /* `byEvents: false` — com `true`, a Evolution acrescenta o nome do evento ao
         * path (`/api/whatsapp/messages-upsert`), e a nossa rota deixaria de existir. */
        byEvents: false,
        /* Não pedimos mídia em base64: a MAISA lê texto, e um áudio de 2 MB embutido no
         * JSON é payload que atravessa a rede para ser descartado. */
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    },
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ADMINISTRAÇÃO DE INSTÂNCIA — criar, apagar, consultar POR NOME.
 *
 * Tudo acima nesta arquivo opera em `inst()`, o nome que vem de `EVOLUTION_INSTANCIA`.
 * Isso é a v1 monoinquilino: uma env global significa um WhatsApp para todos os
 * assinantes. As funções abaixo recebem o nome como ARGUMENTO, e é por elas que passa o
 * provisionamento por inquilino.
 *
 * ⚠️ ESTAS EXIGEM O TOKEN GLOBAL da Evolution, não o da instância. Hoje as duas coisas
 * são a mesma variável (`EVOLUTION_API_KEY`) porque a chave configurada é global — dá
 * para conferir chamando `/instance/fetchInstances`: só o token global lista o servidor
 * inteiro. Funciona, e é uma dívida registrada: enquanto for uma variável só, um
 * vazamento do que manda mensagem também apaga instância alheia. Separar é criar
 * `EVOLUTION_API_KEY_GLOBAL` e usar essa só aqui.
 * ────────────────────────────────────────────────────────────────────────────── */

const enc = (instancia: string) => encodeURIComponent(instancia);

/**
 * Estado E dono da instância, na mesma chamada.
 *
 * `/instance/connectionState` (acima) devolve só o estado — por isso a coluna `numero`
 * ficava `null` para sempre. `/instance/fetchInstances` devolve `ownerJid`, que é o
 * único lugar onde o número pareado existe: o dono aponta a câmera para um QR e nunca
 * digita o telefone.
 *
 * ⚠️ ACHA PELO NOME, NUNCA PEGA `[0]`.
 *
 * O parâmetro `?instanceName=` é um filtro do servidor, e servidor filtra quando quer:
 * versões diferentes da Evolution o ignoram e devolvem TODAS as instâncias. Num servidor
 * compartilhado — que é o caso aqui — confiar no primeiro item devolveria o número de
 * OUTRO negócio para dentro do nosso `integracoes_whatsapp`. Seria vazamento entre
 * inquilinos por um índice de array, e apareceria na tela como um telefone errado que
 * ninguém sabe explicar.
 *
 * `chamar` e não `exigir`: instância inexistente devolve 404, e aqui isso NÃO é erro — é
 * a resposta "essa instância não existe", que é exatamente o que se quer saber antes de
 * criar. `exigir` viraria `PrecisaReconectar`, e o fluxo de um cliente novo começaria
 * pedindo para reconectar algo que nunca existiu.
 */
export async function instanciaPorNome(
  instancia: string,
): Promise<{ estado: string; ownerJid: string | null }> {
  const { status, data } = await chamar(`/instance/fetchInstances?instanceName=${enc(instancia)}`, {
    metodo: "GET",
    chave: EVOLUTION.apiKeyGlobal,
  });
  if (status === 404) return { estado: "close", ownerJid: null };
  if (status < 200 || status >= 300) return { estado: "desconhecido", ownerJid: null };

  /* A Evolution já devolveu as três formas em versões diferentes: array na raiz, `{
   * instances: [...] }`, e objeto único. Ler as três é mais barato que amarrar o produto
   * a uma versão do servidor — mesma decisão de `criarInstancia` com o QR. */
  const bruto: unknown = Array.isArray(data) ? data : (data?.instances ?? data);
  const lista: Record<string, unknown>[] = Array.isArray(bruto)
    ? (bruto as Record<string, unknown>[])
    : bruto && typeof bruto === "object"
      ? [bruto as Record<string, unknown>]
      : [];

  const achada = lista
    .map((i) => (i.instance && typeof i.instance === "object" ? (i.instance as Record<string, unknown>) : i))
    .find((i) => String(i.name ?? i.instanceName ?? "") === instancia);

  /* Não achou o nome: trata como inexistente, e NÃO como "desconhecido com o dado de
   * alguém". Falha fechada — o pior resultado aqui é o certo. */
  if (!achada) return { estado: "close", ownerJid: null };

  return {
    estado: String(achada.connectionStatus ?? achada.state ?? "desconhecido"),
    ownerJid: (achada.ownerJid as string | undefined) ?? (achada.owner as string | undefined) ?? null,
  };
}

/**
 * Cria a instância e devolve o QR em base64.
 *
 * `qrcode: true` faz a Evolution já devolver o código no corpo da criação, em vez de
 * exigir um segundo GET em `/instance/connect`. Um passo a menos é uma janela a menos
 * entre "instância criada" e "QR na tela" — e é nessa janela que o código expira.
 */
export type Emissao = { qrcode: string | null; codigo: string | null };

/** O QR de um corpo da Evolution, já normalizado para `data:` — ou `null`. */
function qrDe(data: any): string | null {
  /* A Evolution mudou o formato entre versões: umas devolvem `qrcode.base64`, outras
   * `qrcode.code`, outras `base64` na raiz. Ler as três é mais barato que amarrar o
   * produto a uma versão do servidor. */
  const bruto = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode?.code ?? null;
  if (!bruto || typeof bruto !== "string") return null;
  /* Normaliza para data-URL: algumas versões devolvem com o prefixo, outras sem, e a
   * tela não pode ter um `if` para isso. */
  return bruto.startsWith("data:") ? bruto : `data:image/png;base64,${bruto}`;
}

/**
 * O código de pareamento de um corpo da Evolution — os 8 caracteres do WhatsApp.
 *
 * ⚠️ VALIDA O FORMATO, e não é frescura. A Evolution devolve `pairingCode: null` quando
 * a versão do Baileys não suporta o recurso, e já foi vista devolvendo string vazia. Os
 * dois passariam por um `?? null` e chegariam à tela como "seu código é: " — o dono
 * ficaria olhando um campo vazio sem nada para digitar. Melhor `null`, que a tela sabe
 * traduzir para "não consegui gerar o código, use o QR".
 */
function codigoDe(data: any): string | null {
  const bruto = data?.qrcode?.pairingCode ?? data?.pairingCode ?? null;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim().toUpperCase();
  /* O WhatsApp emite 8 caracteres alfanuméricos. O hífen do meio ("WZYE-H1YY") aparece em
   * algumas versões e é enfeite de exibição — quem decide como mostrar é a tela. */
  const so = limpo.replace(/[^A-Z0-9]/g, "");
  return so.length === 8 ? so : null;
}

/**
 * Cria a instância e devolve o que serve para parear: o QR, ou o código de 8 caracteres.
 *
 * `qrcode: true` faz a Evolution já devolver o código no corpo da criação, em vez de
 * exigir um segundo GET em `/instance/connect`. Um passo a menos é uma janela a menos
 * entre "instância criada" e "QR na tela" — e é nessa janela que o código expira.
 *
 * ── `numero`, E POR QUE ELE NÃO DISPENSA O `qrcode: true` ──
 *
 * Com `number` no corpo, a Evolution pede ao Baileys um `pairingCode` em vez de esperar
 * uma câmera. Mas mantemos `qrcode: true` de propósito: nas versões em que o pairing code
 * falha (Baileys o suporta de forma desigual, e a falha é silenciosa — vem `null`), o QR
 * do mesmo corpo é o que salva o pareamento. Pedir os dois custa uma chamada só; pedir só
 * o código e receber `null` deixaria o dono sem nenhum caminho.
 */
export async function criarInstancia(p: {
  instancia: string; urlWebhook: string; segredo: string; numero?: string;
}): Promise<Emissao> {
  const data = await exigir(`/instance/create`, {
    chave: EVOLUTION.apiKeyGlobal,
    corpo: {
      instanceName: p.instancia,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...(p.numero ? { number: p.numero } : {}),
      /* O webhook vai JUNTO da criação, e não numa chamada seguinte. Separar produz a
       * falha mais cara do produto: o cliente pareia, vê "conectado", manda "oi" e
       * ninguém responde — porque as mensagens estão indo para lugar nenhum. */
      webhook: {
        url: p.urlWebhook,
        byEvents: false,
        base64: false,
        headers: { apikey: p.segredo, "Content-Type": "application/json" },
        events: ["MESSAGES_UPSERT"],
      },
    },
  });

  return { qrcode: qrDe(data), codigo: p.numero ? codigoDe(data) : null };
}

/**
 * Segunda tentativa de código, pelo endpoint que existe só para isso.
 *
 * ⚠️ EXISTE PORQUE O `/instance/create` NÃO É CONFIÁVEL PARA O CÓDIGO. Medido contra a
 * doc da v2: `number` no corpo da criação funciona em algumas versões e é ignorado em
 * outras, que devolvem o QR e `pairingCode` ausente. `GET /instance/connect?number=` é o
 * caminho documentado do recurso, e ele funciona sobre uma instância que já existe — por
 * isso é o SEGUNDO passo, não o primeiro.
 *
 * Silencioso em qualquer falha, e isso é a decisão: quem chama já tem um QR válido na mão
 * (ver `criarInstancia`). Transformar "não consegui o código" em exceção destruiria um
 * pareamento que ia funcionar pelo outro caminho — trocaria uma inconveniência por um
 * cliente sem WhatsApp.
 */
export async function pedirCodigoDePareamento(instancia: string, numero: string): Promise<string | null> {
  try {
    const { status, data } = await chamar(`/instance/connect/${enc(instancia)}?number=${encodeURIComponent(numero)}`, {
      metodo: "GET",
      chave: EVOLUTION.apiKeyGlobal,
    });
    if (status < 200 || status >= 300) return null;
    return codigoDe(data);
  } catch {
    return null;
  }
}

/** Apaga a instância. Silencioso se ela já não existe — apagar o que não há é sucesso. */
export async function apagarInstancia(instancia: string): Promise<void> {
  const { status } = await chamar(`/instance/delete/${enc(instancia)}`, { metodo: "DELETE", chave: EVOLUTION.apiKeyGlobal });
  if (status === 404) return;
  if (status >= 200 && status < 300) return;
  /* Logout antes de delete é exigido por algumas versões quando a instância está `open`.
   * Tenta uma vez e reavalia; se ainda falhar, deixa `exigir` traduzir o erro. */
  await chamar(`/instance/logout/${enc(instancia)}`, { metodo: "DELETE", chave: EVOLUTION.apiKeyGlobal });
  const segunda = await chamar(`/instance/delete/${enc(instancia)}`, { metodo: "DELETE", chave: EVOLUTION.apiKeyGlobal });
  if (segunda.status === 404 || (segunda.status >= 200 && segunda.status < 300)) return;
  await exigir(`/instance/delete/${enc(instancia)}`, { metodo: "DELETE", chave: EVOLUTION.apiKeyGlobal });
}

/** Aponta o webhook de UMA instância nomeada. Igual a `configurarWebhook`, sem a env global. */
export function configurarWebhookDe(p: { instancia: string; url: string; segredo: string }): Promise<any> {
  return exigir(`/webhook/set/${enc(p.instancia)}`, {
    chave: EVOLUTION.apiKeyGlobal,
    corpo: {
      webhook: {
        enabled: true,
        url: p.url,
        headers: { apikey: p.segredo, "Content-Type": "application/json" },
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    },
  });
}
