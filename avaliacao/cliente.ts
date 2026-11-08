/* ─────────────────────────────────────────────────────────────────────────────
 * O CLIENTE SIMULADO — uma pessoa escrevendo para a MAISA pelo WhatsApp.
 *
 * Recebe só a persona, o objetivo e o que apareceu na tela dele. Não vê ferramenta,
 * agenda, nem a nota do juiz. Pode mandar várias mensagens seguidas (a rajada é o jeito
 * mais comum de escrever no WhatsApp) e decide sozinho quando a conversa acabou.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Cenario } from "./cenarios";
import { perguntarAoClaude } from "./claude-cli";

/** O que aparece na tela do cliente, na ordem em que chegou. */
export type Fala = { de: "cliente" | "maisa"; texto: string; ms: number; rajada: number; audio?: boolean };

export type ProximaRajada = { mensagens: string[]; fim: boolean };

function sistema(c: Cenario, nomeDoNegocio: string): string {
  return `Você vai fazer o papel de uma pessoa de verdade conversando pelo WhatsApp com a atendente de "${nomeDoNegocio}". Você é o CLIENTE, não a atendente.

## Quem você é
${c.persona}

## O que você quer e como reage
${c.objetivo}

## Como escrever
- Escreva exatamente como essa pessoa escreve no WhatsApp: a mesma ortografia, pontuação, abreviação e emoji (ou a falta deles).
- Mensagens curtas. Você pode mandar de 1 a 3 mensagens seguidas; cada mensagem é um item da lista.
- Responda ao que a atendente disse, como essa pessoa responderia. Não entregue tudo de uma vez se ela não faria isso.
- Não seja mais educado nem mais organizado do que a pessoa é.
- Se a atendente perguntar algo que você sabe, responda. Se perguntar algo que não está aqui, invente uma resposta plausível e coerente com a pessoa.
- Se a atendente não respondeu nada, reaja como a pessoa reagiria ("?", "oi??") e, se continuar sem resposta, desista.
- Se o que você queria já foi resolvido (horário confirmado, cancelamento feito, dúvida respondida) ou se você desistiu, encerre com "fim": true. Pode mandar uma última mensagem curta ("obg", "valeu") ou nenhuma.
- Nunca diga que isto é uma simulação ou um teste.${c.audio ? `

## Você manda ÁUDIO
Cada item da lista é um áudio. Escreva o que você FALA, do jeito falado (com "é que", "então", "tipo"), sem emoji. No máximo um áudio por vez.` : ""}`;
}

function tela(falas: Fala[]): string {
  if (!falas.length) return "(a conversa ainda não começou)";
  const linhas = falas.map((f) => `[${f.de === "cliente" ? "você" : "atendente"}]${f.audio ? " (áudio)" : ""} ${f.texto}`);
  const ultima = falas[falas.length - 1];
  const semResposta = ultima.de === "cliente" ? "\n\n(a atendente ainda não respondeu às suas últimas mensagens)" : "";
  return `${linhas.join("\n")}${semResposta}`;
}

export async function proximaRajada(c: Cenario, nomeDoNegocio: string, falas: Fala[], modelo: string): Promise<ProximaRajada> {
  const r = await perguntarAoClaude({
    modelo,
    sistema: sistema(c, nomeDoNegocio),
    prompt: `A conversa até agora, como aparece no seu WhatsApp:\n\n${tela(falas)}\n\nEscreva a sua próxima mensagem (ou mensagens).`,
    esquema: {
      type: "object",
      properties: {
        mensagens: { type: "array", items: { type: "string" } },
        fim: { type: "boolean" },
      },
      required: ["mensagens", "fim"],
    },
  });
  const s = r.estruturado as ProximaRajada;
  return { mensagens: (s.mensagens ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 4), fim: !!s.fim };
}
