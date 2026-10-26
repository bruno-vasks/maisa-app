/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — `ModeloDeConversa` servido pelo Gemini.
 *
 * REST com `fetch`, sem SDK. Duas razões:
 *   • uma dependência a menos num app que já carrega Next, Supabase e o SDK da
 *     Anthropic — e o que precisamos aqui é UM endpoint;
 *   • assinatura de SDK é coisa que se adivinha errado. O formato do wire está
 *     documentado e foi verificado contra a API de verdade antes de escrever isto.
 *
 * Todo o vocabulário do Gemini morre neste arquivo: `contents`, `parts`,
 * `functionCall`, `finishReason`, `SAFETY`. Quem chama recebe `RespostaDoModelo`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  ChamadaDeFerramenta, DefinicaoDeFerramenta, ModeloDeConversa, PedidoAoModelo,
  RespostaDoModelo, TurnoDeConversa,
} from "@/nucleo/portas/saida/modelo-conversa";
import { FalhaDoProvedor, LimiteDoProvedor, NaoConfigurado } from "@/nucleo/dominio/erros";
import { GEMINI, geminiFaltando, isGeminiConfigured } from "./config";

/* ───────────────────────────── formato do wire ───────────────────────────── */

type Parte =
  | { text: string }
  /**
   * `thoughtSignature` é o estado cifrado de raciocínio do Gemini 3. Ele vem junto da
   * chamada e TEM que voltar intacto no turno seguinte: sem ele a API responde 400
   * ("Function call is missing a thought_signature"), e o agente morre na primeira
   * consulta de agenda. Ver `ChamadaDeFerramenta.estadoOpaco`.
   */
  | { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

type Conteudo = { role: "user" | "model"; parts: Parte[] };

/**
 * JSON Schema → o subconjunto de OpenAPI que o Gemini aceita.
 *
 * A diferença é só a CAIXA do tipo: `"string"` vira `"STRING"`. Versões recentes da
 * API toleram minúscula, versões antigas recusam — e como o `GEMINI_BASE_URL` pode
 * apontar para um proxy ou uma versão fixada, mandar a forma canônica é de graça.
 */
const TIPOS: Record<string, string> = {
  string: "STRING",
  integer: "INTEGER",
  number: "NUMBER",
  boolean: "BOOLEAN",
};

function declaracao(f: DefinicaoDeFerramenta) {
  /* Ferramenta sem argumento (`meus_horarios`) vai SEM o campo `parameters`. Mandar
   * `{type:"OBJECT", properties:{}}` faz a API recusar a declaração inteira — e o
   * sintoma é o modelo simplesmente nunca chamar aquela ferramenta, que é muito mais
   * difícil de diagnosticar que um erro. */
  if (!f.parametros || Object.keys(f.parametros.properties).length === 0) {
    return { name: f.nome, description: f.descricao };
  }

  const properties: Record<string, { type: string; description?: string }> = {};
  for (const [chave, campo] of Object.entries(f.parametros.properties)) {
    properties[chave] = { type: TIPOS[campo.type] ?? "STRING", description: campo.description };
  }

  return {
    name: f.nome,
    description: f.descricao,
    parameters: { type: "OBJECT", properties, required: f.parametros.required ?? [] },
  };
}

/** Turnos do domínio → `contents` do Gemini.
 *
 *  Note o `role: "user"` no resultado de ferramenta: é contraintuitivo (não foi o
 *  usuário que escreveu aquilo) e é o que a API espera. A Anthropic usa o mesmo
 *  arranjo por baixo; é convenção dos dois, não bug nosso. */
function paraContents(turnos: TurnoDeConversa[]): Conteudo[] {
  const out: Conteudo[] = [];

  for (const t of turnos) {
    if (t.papel === "cliente") {
      out.push({ role: "user", parts: [{ text: t.texto }] });
    } else if (t.papel === "assistente") {
      out.push({ role: "model", parts: [{ text: t.texto }] });
    } else if (t.papel === "assistente_ferramentas") {
      const parts: Parte[] = [];
      if (t.texto?.trim()) parts.push({ text: t.texto });
      for (const c of t.chamadas) {
        /* A assinatura volta EXATAMENTE como veio, na mesma parte da chamada. Não é
         * opcional: sem ela o Gemini 3 recusa o turno inteiro com 400. */
        parts.push({
          functionCall: { name: c.nome, args: c.argumentos, id: c.id },
          thoughtSignature: c.estadoOpaco,
        });
      }
      out.push({ role: "model", parts });
    } else {
      out.push({
        role: "user",
        parts: t.resultados.map((r) => ({
          functionResponse: {
            name: r.nome,
            // O id da chamada volta junto: com ferramentas em paralelo, casar só por
            // nome é ambíguo — duas consultas de agenda no mesmo turno têm o mesmo nome.
            id: r.id,
            // `response` tem que ser objeto. `erro` viaja junto porque o Gemini não tem
            // equivalente do `is_error` da Anthropic — sem isto, o modelo lê uma recusa
            // ("esse horário não foi ofertado") como se fosse fato consumado.
            response: { resultado: r.texto, erro: r.erro },
          },
        })),
      });
    }
  }

  return out;
}

/** Motivos de parada que são RECUSA, não falha. Não se resolvem tentando de novo. */
const RECUSAS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/**
 * O adaptador para um modelo do Gemini. Fábrica para que a bancada de avaliação
 * (`avaliacao/`) compare modelos no mesmo processo; o app usa `modeloGemini`, logo
 * abaixo, com o modelo do ambiente.
 */
export function criarModeloGemini(modelo: string = GEMINI.modelo): ModeloDeConversa {
  return {
    nome: `gemini:${modelo}`,

    async conversar(p: PedidoAoModelo): Promise<RespostaDoModelo> {
      if (!isGeminiConfigured) throw new NaoConfigurado(geminiFaltando());

      const corpo = {
        /* As duas partes do sistema viram dois `parts` do MESMO systemInstruction, na
         * ordem estável → volátil. A ordem é o que importa: o cache de prompt do Gemini
         * (implícito, sem configuração) casa prefixo, então a data de hoje precisa vir
         * depois do catálogo, ou nada antes dela é reaproveitado. */
        systemInstruction: { parts: [{ text: p.sistemaEstavel }, { text: p.sistemaVolatil }] },
        contents: paraContents(p.turnos),
        tools: p.ferramentas.length ? [{ functionDeclarations: p.ferramentas.map(declaracao) }] : undefined,
        generationConfig: {
          maxOutputTokens: p.maxTokens,
          /* `thinkingConfig` fica de FORA de propósito.
           *
           * Dá para zerar o orçamento de pensamento e economizar — e foi exatamente isso
           * que se mostrou perigoso no equivalente da Anthropic: com pensamento
           * desligado, o modelo às vezes escreve a chamada de ferramenta como texto
           * visível. O turno "dá certo", a ferramenta nunca roda, e o cliente recebe a
           * intenção em vez do agendamento. Num canal onde ele não vê que algo falhou,
           * é o pior modo de falha possível — e economia nenhuma paga isso. */
        },
      };

      /* Timeout explícito. `fetch` não tem um, e uma requisição pendurada segura o
       * runtime até o teto da plataforma — cobrando tempo de execução sem resposta. */
      const controle = new AbortController();
      const alarme = setTimeout(() => controle.abort(), GEMINI.timeoutMs);

      let resposta: Response;
      try {
        resposta = await fetch(`${GEMINI.base}/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": GEMINI.chave },
          body: JSON.stringify(corpo),
          signal: controle.signal,
        });
      } catch (e) {
        const abortou = e instanceof Error && e.name === "AbortError";
        // Timeout é transitório: `LimiteDoProvedor` já significa "pergunte de novo daqui
        // a pouco" para quem chama, e reusar o tipo evita inventar um erro novo.
        throw abortou
          ? new LimiteDoProvedor("O Gemini demorou demais para responder.")
          : new FalhaDoProvedor("Não deu para falar com o Gemini.", e);
      } finally {
        clearTimeout(alarme);
      }

      const texto = await resposta.text();

      if (!resposta.ok) {
        /* 429 e 5xx são transitórios e merecem tipo próprio — quem chama espera em vez
         * de dizer ao cliente que deu erro. O resto (400 de schema, 403 de chave
         * revogada) é nosso e não melhora com retentativa.
         *
         * A mensagem do Google entra truncada no log: ela é longa e, em 400 de
         * ferramenta, é o único lugar que diz QUAL campo do schema ele não aceitou. */
        const detalhe = texto.slice(0, 400);
        if (resposta.status === 429 || resposta.status >= 500) {
          throw new LimiteDoProvedor(`Gemini indisponível (${resposta.status}).`);
        }
        throw new FalhaDoProvedor(`Gemini recusou a requisição (${resposta.status}): ${detalhe}`);
      }

      let dados: any;
      try {
        dados = JSON.parse(texto);
      } catch (e) {
        throw new FalhaDoProvedor("Resposta do Gemini não era JSON.", e);
      }

      /* Recusa em DOIS lugares, e os dois acontecem:
       *   • `promptFeedback.blockReason` — barrou a ENTRADA, não há candidato nenhum;
       *   • `finishReason` do candidato — barrou a SAÍDA no meio.
       * Checar só um deixa o outro virar "resposta vazia", que o loop confundiria com
       * "o modelo não teve nada a dizer". */
      const candidato = dados?.candidates?.[0];
      const razao = String(candidato?.finishReason ?? "");
      const recusou = Boolean(dados?.promptFeedback?.blockReason) || RECUSAS.has(razao);
      if (recusou) return { texto: "", chamadas: [], recusou: true };

      const partes: any[] = candidato?.content?.parts ?? [];
      const chamadas: ChamadaDeFerramenta[] = [];
      const pedacos: string[] = [];

      // Índice explícito: o `target` do projeto não permite iterar `.entries()` sem
      // `downlevelIteration`, e mudar o tsconfig por causa de um laço seria mexer na
      // compilação de todo o app para resolver um detalhe local.
      for (let i = 0; i < partes.length; i++) {
        const parte = partes[i];
        // `thought: true` marca resumo de raciocínio. Não é fala para o cliente — se
        // vazasse para as bolhas, a MAISA mandaria o rascunho dela no WhatsApp.
        if (parte?.thought) continue;

        if (typeof parte?.text === "string" && parte.text.trim()) pedacos.push(parte.text);

        if (parte?.functionCall?.name) {
          chamadas.push({
            // O Gemini manda um id próprio da chamada. Quando vier, é ele que vale;
            // o fallback cobre versões antigas da API, que correlacionavam só por nome.
            id: String(parte.functionCall.id ?? `${parte.functionCall.name}-${i}`),
            nome: String(parte.functionCall.name),
            argumentos: (parte.functionCall.args ?? {}) as Record<string, unknown>,
            // Guardado para voltar intacto no próximo turno. Ver `estadoOpaco` na porta.
            estadoOpaco: typeof parte.thoughtSignature === "string" ? parte.thoughtSignature : undefined,
          });
        }
      }

      /* MAX_TOKENS sem texto e sem chamada é a armadilha silenciosa deste provedor: com
       * pensamento ligado, o orçamento pode acabar DENTRO do raciocínio, e a resposta
       * volta 200 com `parts` vazio. Sem este aviso, o sintoma no laboratório é a MAISA
       * ficando muda sem nenhuma pista de por quê. */
      if (razao === "MAX_TOKENS" && !pedacos.length && !chamadas.length) {
        console.warn("[gemini] MAX_TOKENS antes de produzir saída — suba maxTokens do agente.");
      }

      return { texto: pedacos.join("\n\n").trim(), chamadas, recusou: false };
    },
  };
}

export const modeloGemini: ModeloDeConversa = criarModeloGemini();
