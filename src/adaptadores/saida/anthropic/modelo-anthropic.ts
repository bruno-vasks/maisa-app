/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — `ModeloDeConversa` servido pela Anthropic.
 *
 * Era o corpo do `agente.ts` até o Gemini entrar. Ficou guardado, e voltou a responder em
 * 30/10/2026: com `ANTHROPIC_API_KEY` no ambiente, a conversa é daqui, e o Gemini fica com o
 * áudio, a busca nas respostas prontas e a leitura de comprovante (`composicao.ts`).
 *
 * Fábrica, e não constante exportada: `new Anthropic()` estoura sem credencial, e
 * `composicao.ts` é importado por toda rota de API. Só quem escolhe este adaptador
 * paga por construí-lo.
 * ────────────────────────────────────────────────────────────────────────────── */

import Anthropic from "@anthropic-ai/sdk";

import type {
  ChamadaDeFerramenta, ModeloDeConversa, PedidoAoModelo, RespostaDoModelo, TurnoDeConversa,
} from "@/nucleo/portas/saida/modelo-conversa";

/**
 * ⚠️ Modelo fixo no código, e de propósito: trocar o modelo INVALIDA o cache de prompt
 * (cache é por modelo), então ele não pode variar por requisição sem jogar fora o
 * desconto do prefixo estável. Mudança de modelo é deploy, não configuração.
 *
 * Sonnet 5.5 (30/10/2026): a bancada de 26/10 mediu o Sonnet contra o Opus e o Opus não ganhou;
 * o Bruno pediu qualidade antes de custo, e o Sonnet é as duas coisas aqui.
 */
export const MODELO_ANTHROPIC = "claude-sonnet-5-5";

/**
 * `effort: "low"` — decisão de produto embutida numa string. Cada segundo é o cliente
 * olhando "digitando..." no WhatsApp, e a parte difícil aqui não é raciocínio: é seguir
 * instrução e chamar a ferramenta certa. Se a MAISA se perder, o degrau é `medium`. No
 * Sonnet 5.5 os níveis foram recalibrados, e `low` é o ponto de partida indicado para conversa.
 *
 * Pensamento fica LIGADO (adaptativo): com ele desligado o modelo às vezes escreve a chamada
 * de ferramenta como texto visível — o turno "dá certo", a ferramenta nunca roda, e o cliente
 * recebe a intenção em vez do agendamento. No Sonnet 5.5, `disabled` nem é aceito (400).
 */
const ESFORCO = "low" as const;

/**
 * Recusa do modelo vai para outro modelo, no servidor, sem o cliente esperar de novo. No Sonnet
 * 5.5 isso só cobre as recusas de `cyber` e `frontier_llm`, que uma secretária quase não vê; as
 * outras continuam voltando como `recusou`, e o agente trata.
 */
const FALLBACK = "server-side-fallback-2026-07-01" as const;

/**
 * O histórico no formato da Anthropic.
 *
 * O turno com ferramentas volta EXATAMENTE como o modelo o escreveu (raciocínio incluso),
 * quando `estadoOpaco` o carrega: é a regra da Anthropic para o raciocínio continuar entre um
 * passo e o seguinte do mesmo turno. Só existe dentro do laço de uma mensagem (`agente.ts` não
 * guarda turno de ferramenta), onde o prompt e as ferramentas não mudam; por isso o bloco
 * devolvido nunca encontra um histórico editado.
 */
export function paraMensagens(turnos: TurnoDeConversa[]): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];

  for (const t of turnos) {
    if (t.papel === "cliente") {
      msgs.push({ role: "user", content: t.texto });
    } else if (t.papel === "assistente") {
      msgs.push({ role: "assistant", content: t.texto });
    } else if (t.papel === "assistente_ferramentas") {
      const original = conteudoOriginal(t.chamadas[0]?.estadoOpaco);
      if (original) {
        msgs.push({ role: "assistant", content: original });
        continue;
      }
      const blocos: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (t.texto?.trim()) blocos.push({ type: "text", text: t.texto });
      for (const c of t.chamadas) {
        blocos.push({ type: "tool_use", id: c.id, name: c.nome, input: c.argumentos });
      }
      msgs.push({ role: "assistant", content: blocos });
    } else {
      /* TODOS os resultados numa única mensagem de usuário. Espalhar em várias ensina o
       * modelo a parar de pedir ferramentas em paralelo. */
      msgs.push({
        role: "user",
        content: t.resultados.map<Anthropic.Beta.BetaToolResultBlockParam>((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.texto,
          is_error: r.erro,
        })),
      });
    }
  }

  // A primeira mensagem tem que ser do usuário, ou a API recusa o request.
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  return msgs;
}

/** O conteúdo que o modelo devolveu, guardado inteiro em `estadoOpaco`. Lixo, ou o estado de
 *  outro provedor (o `thoughtSignature` do Gemini é texto solto), vira `null`. */
function conteudoOriginal(estado: string | undefined): Anthropic.Beta.BetaContentBlockParam[] | null {
  if (!estado?.startsWith("[")) return null;
  try {
    const blocos = JSON.parse(estado);
    return Array.isArray(blocos) && blocos.length ? (blocos as Anthropic.Beta.BetaContentBlockParam[]) : null;
  } catch {
    return null;
  }
}

/** O que o adaptador usa do cliente: só a criação de mensagem. O teste passa um falso. */
type ClienteAnthropic = { beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } } };

export function criarModeloAnthropic(cliente: ClienteAnthropic = new Anthropic()): ModeloDeConversa {
  return {
    nome: `anthropic:${MODELO_ANTHROPIC}`,

    async conversar(p: PedidoAoModelo): Promise<RespostaDoModelo> {
      const resposta = await cliente.beta.messages.create({
        model: MODELO_ANTHROPIC,
        max_tokens: p.maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort: ESFORCO },
        betas: [FALLBACK],
        fallbacks: "default",
        system: [
          /* O breakpoint no bloco estável cacheia ele E as ferramentas, que renderizam
           * antes. O volátil (data de hoje, memória do cliente) vem depois e fica fora
           * — se a data estivesse no topo, o prefixo mudaria à meia-noite e o catálogo
           * inteiro seria reprocessado a preço cheio a cada mensagem. */
          { type: "text", text: p.sistemaEstavel, cache_control: { type: "ephemeral" } },
          { type: "text", text: p.sistemaVolatil },
        ],
        tools: p.ferramentas.map((f) => ({
          name: f.nome,
          description: f.descricao,
          input_schema: (f.parametros ?? { type: "object", properties: {} }) as Anthropic.Beta.BetaTool.InputSchema,
        })),
        messages: paraMensagens(p.turnos),
      });

      /* Recusa dos classificadores (a de todos, se o fallback também recusou): HTTP 200,
       * `content` vazio ou parcial. Não é erro de código e não se resolve tentando de novo. */
      if (resposta.stop_reason === "refusal") return { texto: "", chamadas: [], recusou: true };

      const texto = resposta.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n")
        .trim();

      /* O turno inteiro, para voltar igual no próximo passo (ver `paraMensagens`). Se outro
       * modelo terminou a resposta (fallback), ela volta reconstruída: o bloco de troca de
       * modelo tem regras próprias de eco, e reconstruir é o que este adaptador sempre fez. */
      const trocouDeModelo = resposta.content.some((b) => b.type === "fallback");
      const estado = trocouDeModelo ? undefined : JSON.stringify(resposta.content);

      const chamadas: ChamadaDeFerramenta[] = resposta.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
        .map((b, i) => ({
          id: b.id,
          nome: b.name,
          argumentos: (b.input ?? {}) as Record<string, unknown>,
          ...(i === 0 && estado ? { estadoOpaco: estado } : {}),
        }));

      return { texto, chamadas, recusou: false };
    },
  };
}
