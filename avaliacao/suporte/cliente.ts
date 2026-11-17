/* O lead simulado do ensaio da conta oficial.
 *
 * Diferente de `../cliente.ts` em um ponto, e é o ponto do ensaio: aquele diz ao modelo o nome
 * do negócio com quem ele fala ("a atendente de Barbearia do Zé"). Aqui isso entregaria a
 * resposta. Quem recebeu as boas-vindas não sabe de quem é o número; o que ele entende tem que
 * sair só do que apareceu na tela. */

import { perguntarAoClaude } from "../claude-cli";
import type { CenarioSuporte } from "./cenarios";

export type Fala = { de: "cliente" | "maisa"; texto: string; ms: number; rajada: number; boasVindas?: boolean };

function sistema(c: CenarioSuporte): string {
  return `Você vai fazer o papel de uma pessoa de verdade conversando pelo WhatsApp com um número. Você é a PESSOA, não quem responde do outro lado.

## Quem você é
${c.persona}

## O que você quer e como reage
${c.objetivo}

## Como escrever
- Escreva exatamente como essa pessoa escreve no WhatsApp: a mesma ortografia, pontuação, abreviação e emoji (ou a falta deles).
- Mensagens curtas. Você pode mandar de 1 a 3 mensagens seguidas; cada mensagem é um item da lista.
- Responda ao que o outro lado disse, como essa pessoa responderia. Não entregue tudo de uma vez se ela não faria isso.
- Não seja mais educado nem mais organizado do que a pessoa é.
- Você só sabe o que está escrito aqui e o que apareceu na tela. Se não entendeu quem está do outro lado, aja de acordo com o que você ACHA, sem pedir explicação que a pessoa não pediria.
- Se o outro lado não respondeu nada, reaja como a pessoa reagiria ("?", "oi??") e, se continuar sem resposta, desista.
- Quando o que você queria se resolveu, ou se desistiu, encerre com "fim": true. Pode mandar uma última mensagem curta ("obg", "valeu") ou nenhuma.
- Nunca diga que isto é uma simulação ou um teste.`;
}

function tela(falas: Fala[]): string {
  if (!falas.length) return "(a conversa ainda não começou)";
  const linhas = falas.map((f) => `[${f.de === "cliente" ? "você" : "o outro lado"}] ${f.texto}`);
  const ultima = falas[falas.length - 1];
  const semResposta = ultima.de === "cliente" ? "\n\n(o outro lado ainda não respondeu às suas últimas mensagens)" : "";
  return `${linhas.join("\n")}${semResposta}`;
}

export async function proximaRajada(c: CenarioSuporte, falas: Fala[], modelo: string): Promise<{ mensagens: string[]; fim: boolean }> {
  const r = await perguntarAoClaude({
    modelo,
    sistema: sistema(c),
    prompt: `A conversa até agora, como aparece no seu WhatsApp:\n\n${tela(falas)}\n\nEscreva a sua próxima mensagem (ou mensagens).`,
    esquema: {
      type: "object",
      properties: { mensagens: { type: "array", items: { type: "string" } }, fim: { type: "boolean" } },
      required: ["mensagens", "fim"],
    },
  });
  const s = r.estruturado as { mensagens?: string[]; fim?: boolean };
  return { mensagens: (s.mensagens ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 4), fim: !!s.fim };
}
