/* Julga de novo as conversas já gravadas, com a régua e a referência de agora, sem rodar a
 * conversa outra vez. A nota anterior fica em `notaAnterior`.
 *
 *   npx vite-node -c vitest.config.ts avaliacao/suporte/rejulgar.ts -- <pasta> [<pasta>...] */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cenarioSuporte } from "./cenarios";
import { julgar } from "./juiz";

async function principal() {
  const pastas = process.argv.slice(2).filter((x) => x !== "--");
  const arquivos = pastas.flatMap((p) => readdirSync(p).filter((f) => f.endsWith(".json") && f.includes("--")).map((f) => join(p, f)));
  let feitos = 0;
  await Promise.all(
    arquivos.map(async (arq) => {
      const r = JSON.parse(readFileSync(arq, "utf8"));
      const nota = await julgar(cenarioSuporte(r.cenario), r.falas, r.marcou, "claude-sonnet-5-5");
      writeFileSync(arq, JSON.stringify({ ...r, notaAnterior: r.notaAnterior ?? r.nota, nota }, null, 2));
      console.log(`${++feitos}/${arquivos.length} ${arq.split("/").slice(-2).join("/")}`);
    }),
  );
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
