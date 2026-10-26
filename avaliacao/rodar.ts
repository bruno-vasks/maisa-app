/* ─────────────────────────────────────────────────────────────────────────────
 * RODAR A BATERIA — `npm run conversas -- --modelo gemini:gemini-3.5-flash-lite`
 *
 * Sobe uma conversa por processo (ver `conversa.ts`), N de cada vez, e junta tudo num
 * relatório em `avaliacao/resultados/<data>-<rótulo>/`. Os processos recebem um
 * ambiente LIMPO, com a chave do Gemini e nada mais: nenhuma conversa de teste pode
 * achar um Supabase de produção no ambiente e escrever nele.
 *
 *   --modelo      gemini:<modelo> | claude:<modelo>      (padrão: gemini:gemini-3.5-flash-lite)
 *   --cenarios    ids separados por vírgula, ou "todos"
 *   --rotulo      nome da rodada no relatório
 *   --paralelo    conversas ao mesmo tempo                (padrão: 5)
 *   --cliente     modelo do cliente simulado              (padrão: claude-haiku-5-5)
 *   --juiz        modelo do juiz, ou "nenhum"             (padrão: claude-sonnet-5-5)
 *   --audio       ignorar | transcrever                   (padrão: ignorar, como produção hoje)
 *   --repeticoes  quantas vezes cada cenário              (padrão: 1)
 *   --env         arquivo de onde ler GEMINI_API_KEY      (padrão: .env.local)
 *   --comparar    pasta de uma rodada anterior, para o antes × depois
 * ────────────────────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CENARIOS } from "./cenarios";
import type { Tarefa } from "./conversa";
import { comparacao, lerResultados, relatorio, resumir } from "./relatorio";

const RAIZ = resolve(__dirname, "..");

function argumentos(): Record<string, string> {
  const a = process.argv.slice(2).filter((x) => x !== "--");
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) out[a[i].slice(2)] = a[i + 1]?.startsWith("--") ? "1" : (a[++i] ?? "1");
  return out;
}

function chaveDoGemini(arquivo: string): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const caminho = resolve(arquivo);
  if (!existsSync(caminho)) throw new Error(`sem GEMINI_API_KEY no ambiente e sem ${caminho}`);
  const linha = readFileSync(caminho, "utf8").split("\n").find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!linha) throw new Error(`${caminho} não tem GEMINI_API_KEY`);
  return linha.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

function rodarUma(tarefa: Tarefa, chave: string, log: string): Promise<boolean> {
  return new Promise((ok) => {
    const filho = spawn(join(RAIZ, "node_modules", ".bin", "vite-node"), ["-c", "vitest.config.ts", "avaliacao/conversa.ts"], {
      cwd: RAIZ,
      env: {
        NODE_ENV: "test",
        /* O que a linha de comando do Claude precisa para achar o login no chaveiro do
         * macOS (sem `USER` ela responde "Not logged in"), e nada do app. */
        ...Object.fromEntries(
          ["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "LANG", "__CF_USER_TEXT_ENCODING", "CLAUDE_BIN"]
            .filter((k) => process.env[k])
            .map((k) => [k, process.env[k]!]),
        ),
        GEMINI_API_KEY: chave,
        AVAL_TAREFA: JSON.stringify(tarefa),
        AVAL_CLAUDE_PARALELO: "2",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    filho.stdout.on("data", (d) => (saida += d));
    filho.stderr.on("data", (d) => (saida += d));
    filho.on("close", (codigo) => {
      writeFileSync(log, saida);
      ok(codigo === 0);
    });
  });
}

async function principal() {
  const a = argumentos();
  const modelo = a.modelo ?? "gemini:gemini-3.5-flash-lite";
  const ids = !a.cenarios || a.cenarios === "todos" ? CENARIOS.map((c) => c.id) : a.cenarios.split(",");
  const rotulo = a.rotulo ?? modelo.replace(/[^a-z0-9.-]+/gi, "-");
  const paralelo = Number(a.paralelo ?? 5);
  const repeticoes = Number(a.repeticoes ?? 1);
  const chave = chaveDoGemini(a.env ?? ".env.local");

  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  const pasta = join(RAIZ, "avaliacao", "resultados", `${carimbo}-${rotulo}`);
  mkdirSync(join(pasta, "logs"), { recursive: true });

  const tarefas: Tarefa[] = ids.flatMap((id) =>
    Array.from({ length: repeticoes }, (_, repeticao) => ({
      cenario: id,
      modelo,
      modeloCliente: a.cliente ?? "claude-haiku-5-5",
      modeloJuiz: a.juiz === "nenhum" ? null : (a.juiz ?? "claude-sonnet-5-5"),
      audio: (a.audio as Tarefa["audio"]) ?? "ignorar",
      saida: join(pasta, `${id}-${repeticao}.json`),
      repeticao,
    })),
  );

  console.log(`${tarefas.length} conversas, ${paralelo} por vez, MAISA = ${modelo} → ${pasta}`);
  const fila = [...tarefas];
  let feitas = 0;
  const falhas: string[] = [];
  await Promise.all(
    Array.from({ length: paralelo }, async () => {
      for (let t = fila.shift(); t; t = fila.shift()) {
        const ok = await rodarUma(t, chave, join(pasta, "logs", `${t.cenario}-${t.repeticao}.log`));
        feitas++;
        if (!ok) falhas.push(`${t.cenario}#${t.repeticao}`);
        console.log(`[${feitas}/${tarefas.length}] ${t.cenario}#${t.repeticao} ${ok ? "ok" : "FALHOU (ver logs/)"}`);
      }
    }),
  );

  const rs = lerResultados(pasta);
  writeFileSync(join(pasta, "resumo.json"), JSON.stringify({ rotulo, modelo, falhas, resumo: resumir(rs) }, null, 2));
  writeFileSync(join(pasta, "relatorio.md"), relatorio(rotulo, rs));
  if (a.comparar) {
    const antes = resolve(a.comparar);
    const rotuloAntes = antes.split("/").pop() ?? "antes";
    writeFileSync(join(pasta, "comparacao.md"), comparacao({ rotulo: rotuloAntes, rs: lerResultados(antes) }, { rotulo, rs }));
  }
  const s = resumir(rs);
  console.log(
    `\nobjetivo ${Math.round(s.objetivoOk * 100)}% · nota ${s.notaGeral.toFixed(2)} · duplicadas ${s.duplicadas} · robô ${s.frasesDeRobo} · 09:00 ${s.horaDeMaquina} · US$ ${s.custoPorConversaUsd.toFixed(4)}/conversa` +
      (falhas.length ? `\nfalharam: ${falhas.join(", ")}` : ""),
  );
  console.log(join(pasta, "relatorio.md"));
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
