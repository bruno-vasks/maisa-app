/* ─────────────────────────────────────────────────────────────────────────────
 * BOLHAS — transformar a saída do modelo em mensagens de WhatsApp.
 *
 * O problema que este arquivo resolve é o que denuncia um bot na primeira frase: o
 * BLOCO. Um modelo, solto, responde com parágrafo + lista com marcadores + fecho
 * educado, tudo numa mensagem só. Gente não faz isso. Gente manda "Bom dia!", depois
 * "Como posso te ajudar?", em duas bolhas.
 *
 * O prompt pede isso (ver `persona.ts`); ESTE arquivo garante. A diferença importa:
 * instrução em prompt é probabilidade, e num canal onde o cliente vê o resultado cru
 * a exceção aparece. Aqui o teto é código.
 *
 * Também é o lugar da tradução de formatação: WhatsApp não é Markdown. `**negrito**`
 * aparece literalmente com os asteriscos duplos, e `### Título` aparece com as
 * cerquilhas — o modelo escreve Markdown por hábito, e o cliente lê o hábito.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Quantas bolhas por resposta. Três já é muito para um turno de conversa; quatro é
 *  o bot despejando. O prompt pede duas. */
export const MAX_BOLHAS = 3;

/** Tamanho de uma bolha. ~320 caracteres é o que cabe na tela do celular sem o
 *  cliente ter que rolar — e rolar para ler o bot é o momento em que ele desiste. */
export const MAX_CHARS = 320;

/** Teto do que ACEITAMOS do cliente. Não é sobre grosseria: é superfície de injeção
 *  de prompt e de custo. Mensagem de WhatsApp de 4000 caracteres é colagem. */
export const MAX_ENTRADA = 1500;

/**
 * Markdown → o que o WhatsApp de fato renderiza.
 *
 * WhatsApp usa `*asterisco simples*` para negrito e `_underscore_` para itálico, e
 * ignora o resto. Convertemos o que tem equivalente e removemos o que não tem, em
 * vez de deixar passar: um `#` sobrando faz a MAISA parecer quebrada, o que é pior
 * que texto sem ênfase.
 */
function paraWhatsapp(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "*$1*")     // **negrito** → *negrito*
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1") // código não faz sentido aqui
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")    // títulos: só o texto
    .replace(/^\s*[-*+]\s+/gm, "• ")       // marcador que o WhatsApp não faz
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2") // link Markdown → texto + URL crua
    .trim();
}

/**
 * Hora e dinheiro como se escreve numa conversa: "09:00" → "9h", "14:30" → "14h30",
 * "R$ 50.00" → "R$ 50".
 *
 * O prompt pede e as ferramentas já entregam a hora falada (`horaFalada`), mas o modelo
 * copia o formato de onde estiver olhando (a grade do negócio, por exemplo, é "08:00–20:00")
 * — e "09:00" é a marca mais visível de que quem responde é um sistema. Aqui é garantia.
 */
export function comoSeFala(s: string): string {
  return s
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)h?\b/g, (_, h: string, m: string) => `${Number(h)}h${m === "00" ? "" : m}`)
    .replace(/R\$\s?(\d+)\.(\d{2})\b/g, (_, r: string, c: string) => (c === "00" ? `R$ ${r}` : `R$ ${r},${c}`));
}

/* ───────────────────────────── a fala inventada ─────────────────────────────
 * O modelo às vezes continua a conversa sozinho: responde, escreve "Cliente: pode ser às
 * 15h" e responde a isso também ("Ótimo, marcado!") sem o cliente ter dito nada nem a
 * agenda ter sido tocada. É a MAISA conversando consigo mesma, e o cliente leria as duas
 * partes. Pedido do Bruno em 27/10/2026: "nunca alucinar e responder ela mesma".
 *
 * Aqui é garantia, como o resto do arquivo: da primeira linha com rótulo de quem fala em
 * diante, nada sai. O rótulo dela na ABERTURA ("maisa: Oi!") só é tirado. "Cliente: Ana"
 * dentro de uma ficha (outra linha "Serviço: corte" ao lado) é resumo, não fala, e fica. */

const ROTULO_DELA = /^\s*[*_]*\s*(maisa|assistente|assistant|secret[áa]ria)\s*[*_]*\s*:\s*/i;
const ROTULO_DO_CLIENTE = /^\s*[*_]*\s*(cliente|usu[áa]rio|user|human[oa]?|voc[êe])\s*[*_]*\s*:/i;
const LINHA_DE_FICHA = /^\s*[*_]*\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,20}[*_]*\s*:\s*\S/;

export function semFalaInventada(texto: string): string {
  const linhas = texto.split("\n");
  linhas[0] = linhas[0].replace(ROTULO_DELA, "");
  /* Linha de ficha é "Serviço: corte"; rótulo de quem fala não conta como ficha, senão
   * "Cliente: …" colado em "MAISA: …" protegeria a fala inventada. */
  const ehFicha = (l?: string) => l !== undefined && LINHA_DE_FICHA.test(l) && !ROTULO_DELA.test(l) && !ROTULO_DO_CLIENTE.test(l);
  const naFicha = (i: number) => ehFicha(linhas[i - 1]) || ehFicha(linhas[i + 1]);
  const corte = linhas.findIndex(
    (l, i) => i > 0 && (ROTULO_DELA.test(l) || (ROTULO_DO_CLIENTE.test(l) && !naFicha(i))),
  );
  return (corte === -1 ? linhas : linhas.slice(0, corte)).join("\n").trim();
}

/** Quebra num limite de FRASE, não de caractere. Cortar no meio de "quinta às
 *  15h" produziria duas bolhas sem sentido nenhuma das duas. */
function porFrase(texto: string, limite: number): string[] {
  if (texto.length <= limite) return [texto];

  const partes: string[] = [];
  let atual = "";

  // Mantém o pontuador junto da frase que ele fecha.
  for (const frase of texto.split(/(?<=[.!?…])\s+/)) {
    if (atual && (atual + " " + frase).length > limite) {
      partes.push(atual);
      atual = frase;
    } else {
      atual = atual ? `${atual} ${frase}` : frase;
    }
  }
  if (atual) partes.push(atual);

  // Uma frase única e gigantesca (sem pontuação) ainda estoura: corta na força.
  return partes.flatMap((p) =>
    p.length <= limite ? [p] : (p.match(new RegExp(`.{1,${limite}}(\\s|$)`, "g")) ?? [p]).map((s) => s.trim()),
  );
}

/**
 * O texto do modelo virado em lista de bolhas.
 *
 * A convenção é LINHA EM BRANCO = nova bolha. Escolhida porque é a única separação
 * que um modelo produz naturalmente ao ser instruído a "escrever mensagens curtas
 * separadas" — pedir um marcador inventado (`---`, `<msg>`) funciona 95% das vezes e,
 * nos outros 5%, o cliente lê o marcador.
 */
export function bolhas(texto: string): string[] {
  const brutas = comoSeFala(paraWhatsapp(semFalaInventada(texto)))
    .split(/\n\s*\n+/)
    .flatMap((b) => porFrase(b.replace(/\n+/g, " ").trim(), MAX_CHARS))
    .filter((b) => b.length > 0);

  if (brutas.length === 0) return [];
  if (brutas.length <= MAX_BOLHAS) return brutas;

  /* Estourou o teto: junta o excedente na ÚLTIMA bolha em vez de descartar.
   *
   * Descartar perderia conteúdo — e o pedaço cortado costuma ser justamente a
   * pergunta final ("qual fica melhor?"), sem a qual a conversa morre. Uma última
   * bolha longa é um sintoma visível de prompt mal calibrado; conteúdo sumindo em
   * silêncio não é. Preferimos o sintoma. */
  const primeiras = brutas.slice(0, MAX_BOLHAS - 1);
  return [...primeiras, brutas.slice(MAX_BOLHAS - 1).join(" ")];
}

/** Higieniza o que chegou do cliente antes de virar prompt. Trunca em vez de recusar:
 *  o cliente que colou um texto enorme ainda merece resposta. */
export const limparEntrada = (texto: string): string =>
  texto.replace(/\s+/g, " ").trim().slice(0, MAX_ENTRADA);
