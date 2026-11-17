/* O juiz do ensaio da conta oficial. Não sabe se a conversa é do antes ou do depois.
 *
 * A régua mede o que o Bruno pediu em 17/11/2026: a pessoa entende com quem fala (o suporte
 * da maisa, atendido pela própria maisa, e não a maisa dela); a dúvida de configuração sai
 * resolvida, com o caminho no app; o Bruno, quando aparece, é apresentado como o especialista.
 * A referência de fatos é a mesma para as duas variantes. */

import { perguntarAoClaude } from "../claude-cli";
import type { CenarioSuporte } from "./cenarios";
import type { Fala } from "./cliente";
import { REFERENCIA } from "./dados";

const REGUA = `Você avalia uma conversa de WhatsApp entre uma pessoa e o número oficial da maisa, um app de secretária de IA para negócios com hora marcada (barbearias, salões, consultórios).

Quem responde nesse número é a própria maisa, uma assistente de IA. Esse número é o suporte da maisa: atende quem quer conhecer o produto ou está configurando a conta. Ele NÃO é a maisa da pessoa: a maisa de cada cliente atende no WhatsApp do próprio cliente, com os serviços e horários dele, depois que ele conecta o número no app.

As primeiras mensagens marcadas como (boas-vindas automáticas) foram mandadas sozinhas, logo depois que a pessoa criou a conta. Elas contam para o critério "papel".

Dê nota de 1 a 5 em cada critério. 5 é o que uma ótima pessoa do suporte faria. 3 é "funcionou com defeito visível". 1 é "atrapalhou".

- papel: ao fim da conversa, a pessoa sabe com quem está falando e que a maisa DELA é outra coisa, no número dela? Se a pessoa se confundiu (por exemplo, pediu o preço de um serviço do próprio negócio), a maisa percebeu e explicou? Não penalize por não repetir a explicação quando a pessoa nunca se confundiu e as boas-vindas já deixaram claro.
- resolveu: a pessoa saiu com o que precisava? Para dúvida de configuração: o caminho certo no app, com os nomes que o app mostra (confira na referência). Para quem quer falar com alguém: a conversa marcada. "Vou confirmar com o Bruno" quando a resposta existia na referência vale no máximo 2. Fato errado sobre o app vale no máximo 2.
- bruno: se o Bruno aparece na conversa, a pessoa sabe quem ele é (o especialista da maisa) e o que acontece na conversa com ele? null se o Bruno não aparece.
- humano: soa como uma pessoa no WhatsApp? Mensagens curtas, uma pergunta por vez, sem frase de robô, sem repetir.

Em "erros", liste cada frase da maisa com fato errado sobre o app ou sobre a maisa, comparando com a referência. Lista vazia se não houver.

## Referência (o que é verdade sobre o app)
${REFERENCIA}`;

function transcrito(falas: Fala[]): string {
  return falas
    .map((f) => `[${f.de === "cliente" ? "pessoa" : "maisa"}]${f.boasVindas ? " (boas-vindas automáticas)" : ""} ${f.texto}`)
    .join("\n");
}

export type NotaSuporte = {
  papel: { nota: number; porque: string };
  resolveu: { nota: number; porque: string };
  bruno: { nota: number | null; porque: string };
  humano: { nota: number; porque: string };
  erros: string[];
  resumo: string;
};

export async function julgar(c: CenarioSuporte, falas: Fala[], marcou: string, modelo: string): Promise<NotaSuporte> {
  const nota = { type: "integer", minimum: 1, maximum: 5 };
  const criterio = { type: "object", properties: { nota, porque: { type: "string" } }, required: ["nota", "porque"] };
  const r = await perguntarAoClaude({
    modelo,
    sistema: REGUA,
    prompt: `## Quando
Agora é ${new Date(c.relogio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} (horário de Brasília), no começo da conversa. "Amanhã" e "hoje" contam a partir daí.

## A pessoa
${c.persona}
O que ela quer: ${c.objetivo}
O que deveria acontecer: ${c.esperado}

## A conversa
${transcrito(falas)}

## O que ficou marcado na agenda
${marcou || "nada"}

Avalie.`,
    esquema: {
      type: "object",
      properties: {
        papel: criterio,
        resolveu: criterio,
        bruno: { type: "object", properties: { nota: { type: ["integer", "null"], minimum: 1, maximum: 5 }, porque: { type: "string" } }, required: ["nota", "porque"] },
        humano: criterio,
        erros: { type: "array", items: { type: "string" } },
        resumo: { type: "string" },
      },
      required: ["papel", "resolveu", "bruno", "humano", "erros", "resumo"],
    },
  });
  return r.estruturado as NotaSuporte;
}
