/* Roda o ensaio da conta oficial: cada cenário nas duas variantes (antes e depois), uma conversa
 * por processo, N ao mesmo tempo.
 *
 *   npx vite-node -c vitest.config.ts avaliacao/suporte/rodar.ts -- --paralelo 4 --repeticoes 1
 *     --cenarios   ids separados por vírgula (padrão: todos)
 *     --variantes  antes,depois (padrão: as duas)
 *     --rotulo     nome da pasta da rodada
 *
 * O ambiente dos processos é limpo, como no `../rodar.ts`: só o que o Claude Code precisa para
 * achar o login e a chave do Gemini para o embedding das respostas prontas, com teto. Nada de
 * Supabase nem Evolution. */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CENARIOS_SUPORTE } from "./cenarios";

const RAIZ = resolve(__dirname, "..", "..");

function argumentos(): Record<string, string> {
  const a = process.argv.slice(2).filter((x) => x !== "--");
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) out[a[i].slice(2)] = a[i + 1]?.startsWith("--") ? "1" : (a[++i] ?? "1");
  return out;
}

function chaveDoGemini(): string {
  const linha = readFileSync(join(RAIZ, ".env.local"), "utf8").split("\n").find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!linha) throw new Error(".env.local sem GEMINI_API_KEY");
  return linha.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

async function principal() {
  const a = argumentos();
  const ids = a.cenarios ? a.cenarios.split(",") : CENARIOS_SUPORTE.map((c) => c.id);
  const variantes = (a.variantes ?? "antes,depois").split(",") as ("antes" | "depois")[];
  const repeticoes = Number(a.repeticoes ?? 1);
  const paralelo = Number(a.paralelo ?? 4);
  const pasta = join(RAIZ, "avaliacao", "resultados", a.rotulo ?? `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-suporte`);
  mkdirSync(pasta, { recursive: true });
  const contagem = join(tmpdir(), "maisa-avaliacao-embeddings.contagem");
  if (existsSync(contagem)) rmSync(contagem);

  const tarefas = ids.flatMap((cenario) =>
    variantes.flatMap((variante) =>
      Array.from({ length: repeticoes }, (_, r) => ({
        cenario,
        variante,
        modelo: "claude:claude-sonnet-5-5",
        modeloCliente: "claude-haiku-5-5",
        modeloJuiz: "claude-sonnet-5-5",
        repeticao: r + 1,
        saida: join(pasta, `${cenario}--${variante}--${r + 1}.json`),
      })),
    ),
  );

  const chave = chaveDoGemini();
  let proxima = 0;
  let feitas = 0;
  async function trabalhador() {
    while (proxima < tarefas.length) {
      const t = tarefas[proxima++];
      if (existsSync(t.saida)) {
        feitas++;
        continue;
      }
      const ok = await new Promise<boolean>((fim) => {
        const filho = spawn(join(RAIZ, "node_modules", ".bin", "vite-node"), ["-c", "vitest.config.ts", "avaliacao/suporte/conversa.ts"], {
          cwd: RAIZ,
          env: {
            NODE_ENV: "test",
            ...Object.fromEntries(
              ["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "LANG", "__CF_USER_TEXT_ENCODING", "CLAUDE_BIN"]
                .filter((k) => process.env[k])
                .map((k) => [k, process.env[k]!]),
            ),
            GEMINI_API_KEY: chave,
            AVAL_EMBEDDING_TETO: a.teto ?? "250",
            AVAL_CLAUDE_PARALELO: "3",
            AVAL_TAREFA: JSON.stringify(t),
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let log = "";
        filho.stdout.on("data", (d) => (log += d));
        filho.stderr.on("data", (d) => (log += d));
        filho.on("close", (codigo) => {
          writeFileSync(t.saida.replace(/\.json$/, ".log"), log);
          fim(codigo === 0);
        });
      });
      feitas++;
      console.log(`${ok ? "✓" : "✗"} ${feitas}/${tarefas.length} ${t.cenario} · ${t.variante} · ${t.repeticao}`);
    }
  }
  await Promise.all(Array.from({ length: paralelo }, trabalhador));
  const usados = existsSync(contagem) ? readFileSync(contagem, "utf8").length : 0;
  console.log(`pasta: ${pasta}\nembeddings do Gemini nesta rodada: ${usados}`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
