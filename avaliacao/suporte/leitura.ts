/* O teste de leitura das boas-vindas: quem recebe as 3 mensagens entende com quem está falando?
 *
 * Um leitor (Haiku, no papel de quem acabou de criar a conta) lê só as bolhas e diz, com as
 * palavras dele, o que entendeu e o que responderia. Um classificador (Sonnet), que não sabe a
 * variante, põe cada leitura numa de três caixas. É uma aproximação: modelo lê com mais atenção
 * que gente no celular, então o número real de confusão é MAIOR que o daqui, nas duas variantes.
 *
 *   npx vite-node -c vitest.config.ts avaliacao/suporte/leitura.ts -- --repeticoes 2 --saida <arquivo> */

import { writeFileSync } from "node:fs";

import { perguntarAoClaude } from "../claude-cli";
import { BOAS_VINDAS } from "./dados";

const LEITORES = [
  { id: "barbeiro", texto: "Você tem uma barbearia, 31 anos. Lê o WhatsApp rápido, entre um corte e outro, sem prestar muita atenção." },
  { id: "psicologa", texto: "Você é psicóloga, 44 anos, atende sozinha. Lê com calma, mas não conhece o app ainda." },
  { id: "salao", texto: "Você tem um salão de beleza, 58 anos, e não tem muita intimidade com tecnologia. Seu sobrinho te ajudou a criar a conta." },
];

const CAIXAS = ["suporte", "minha-maisa", "confuso"] as const;

function argumentos(): Record<string, string> {
  const a = process.argv.slice(2).filter((x) => x !== "--");
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) out[a[i].slice(2)] = a[i + 1]?.startsWith("--") ? "1" : (a[++i] ?? "1");
  return out;
}

async function ler(bolhas: string[], leitor: string) {
  const r = await perguntarAoClaude({
    modelo: "claude-haiku-5-5",
    sistema: `Você faz o papel de uma pessoa de verdade. ${leitor}\n\nVocê acabou de criar sua conta na maisa, um app que promete uma secretária de IA que atende os seus clientes pelo WhatsApp. Responda sempre como essa pessoa, com as palavras dela.`,
    prompt: `Uns minutos depois de criar a conta, chegaram estas mensagens no seu WhatsApp, de um número que você não tem salvo:\n\n${bolhas.map((b) => `> ${b}`).join("\n")}\n\nResponda:\n- entendi: em uma ou duas frases, com as suas palavras, quem está te mandando isso e para que serve esse número.\n- responderia: o que você mandaria de volta agora, do jeito que você escreve no WhatsApp ("" se não responderia nada).`,
    esquema: { type: "object", properties: { entendi: { type: "string" }, responderia: { type: "string" } }, required: ["entendi", "responderia"] },
  });
  return r.estruturado as { entendi: string; responderia: string };
}

async function classificar(l: { entendi: string; responderia: string }) {
  const r = await perguntarAoClaude({
    modelo: "claude-sonnet-5-5",
    sistema: `Você classifica o que uma pessoa entendeu de mensagens de WhatsApp. Contexto que ELA não tinha: as mensagens vieram do número de suporte da empresa maisa, onde a própria assistente de IA da maisa tira dúvidas de quem está configurando a conta. A maisa da pessoa (a que atende os clientes dela) é outra, e atende no WhatsApp da própria pessoa depois que ela conecta o número.

Caixas:
- suporte: entendeu que é o número/suporte/atendimento da empresa maisa, para tirar dúvida ou ajudar a configurar, e não a secretária dela já atendendo os clientes dela.
- minha-maisa: acha que esse número é a secretária DELA (a maisa dela), ou que a maisa já está funcionando para os clientes dela por esse número.
- confuso: não sabe, mistura as duas coisas, ou a frase não deixa decidir.

"testaria_como_cliente" é true quando o que ela responderia é testar como se fosse um cliente do próprio negócio (pedir horário, preço de serviço dela).`,
    prompt: `O que ela entendeu: ${l.entendi}\nO que ela responderia: ${l.responderia || "(nada)"}`,
    esquema: {
      type: "object",
      properties: { caixa: { type: "string", enum: [...CAIXAS] }, testaria_como_cliente: { type: "boolean" }, porque: { type: "string" } },
      required: ["caixa", "testaria_como_cliente", "porque"],
    },
  });
  return r.estruturado as { caixa: (typeof CAIXAS)[number]; testaria_como_cliente: boolean; porque: string };
}

async function principal() {
  const a = argumentos();
  const repeticoes = Number(a.repeticoes ?? 2);
  const trabalhos: Promise<unknown>[] = [];
  const resultados: unknown[] = [];
  const variantes = (a.variantes ?? "antes,depois").split(",") as ("antes" | "depois")[];
  const so = a.versoes ? a.versoes.split(",").map((v) => Number(v) - 1) : null;
  for (const variante of variantes) {
    BOAS_VINDAS[variante].forEach((versao, indice) => {
      if (so && !so.includes(indice)) return;
      for (const leitor of LEITORES) {
        for (let r = 1; r <= repeticoes; r++) {
          const bolhas = versao("");
          trabalhos.push(
            (async () => {
              const leitura = await ler(bolhas, leitor.texto);
              const caixa = await classificar(leitura);
              resultados.push({ variante, versao: indice, leitor: leitor.id, repeticao: r, bolhas, ...leitura, ...caixa });
              console.log(`${variante} v${indice + 1} ${leitor.id}: ${caixa.caixa}${caixa.testaria_como_cliente ? " (testaria como cliente)" : ""}`);
            })().catch((e) => console.error(`${variante} v${indice + 1} ${leitor.id}:`, e)),
          );
        }
      }
    });
  }
  await Promise.all(trabalhos);
  writeFileSync(a.saida, JSON.stringify(resultados, null, 2));
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
