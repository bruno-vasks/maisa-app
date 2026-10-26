/* ─────────────────────────────────────────────────────────────────────────────
 * CLAUDE PELA LINHA DE COMANDO — o Claude Code desta máquina, sem chave de API.
 *
 * Serve três papéis na avaliação: o cliente simulado, o juiz e, quando se quer
 * comparar, a própria MAISA (`modelo-claude-cli.ts`). Usa a conta logada no Claude
 * Code; por isso não existe em produção e não deve existir: é ferramenta de bancada.
 *
 * As bandeiras que importam, e por quê:
 *   • `--safe-mode` desliga hooks, CLAUDE.md, MCP e skills SEM desligar o login.
 *     (`--bare` também desliga, mas só aceita ANTHROPIC_API_KEY.) Sem isto, cada
 *     chamada dispararia os hooks da máquina, como os que escrevem num painel.
 *   • `--system-prompt` SUBSTITUI o prompt do Claude Code. O modelo recebe só o que
 *     mandamos, que é o que torna a comparação com a API honesta.
 *   • `--tools ""` tira todas as ferramentas. Ninguém aqui deve ler disco nem rodar
 *     comando.
 *   • `--no-session-persistence` não grava a sessão em disco: são centenas por rodada.
 *   • `--json-schema` devolve `structured_output` validado. O custo vem em
 *     `total_cost_usd`, a preço de tabela da API.
 * ────────────────────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** O binário: `CLAUDE_BIN`, o do PATH, ou o que vem dentro da extensão do VS Code. */
export function binarioDoClaude(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const ext = join(homedir(), ".vscode", "extensions");
  if (existsSync(ext)) {
    const versoes = readdirSync(ext).filter((d) => d.startsWith("anthropic.claude-code-")).sort().reverse();
    for (const v of versoes) {
      const b = join(ext, v, "resources", "native-binary", "claude");
      if (existsSync(b)) return b;
    }
  }
  return "claude";
}

export type ChamadaAoClaude = {
  modelo: string;
  sistema: string;
  /** Vai pelo stdin: conversa longa estoura o limite de argumento do sistema. */
  prompt: string;
  esquema?: object;
  esforco?: "low" | "medium" | "high";
  timeoutMs?: number;
};

export type RespostaDoClaude = {
  texto: string;
  estruturado: unknown;
  custoUsd: number;
  ms: number;
  tokens: { entrada: number; saida: number; cacheLido: number; cacheCriado: number };
};

/* Um semáforo por processo. Cada chamada é um processo do Claude Code; deixar 30
 * subirem juntos derruba a máquina e esbarra no limite da conta. */
let ativos = 0;
const fila: (() => void)[] = [];
const LIMITE = Number(process.env.AVAL_CLAUDE_PARALELO ?? 4);

async function vez<T>(f: () => Promise<T>): Promise<T> {
  if (ativos >= LIMITE) await new Promise<void>((r) => fila.push(r));
  ativos++;
  try {
    return await f();
  } finally {
    ativos--;
    fila.shift()?.();
  }
}

function umaVez(p: ChamadaAoClaude): Promise<RespostaDoClaude> {
  const args = [
    "-p", "--safe-mode", "--no-session-persistence",
    "--tools", "",
    "--model", p.modelo,
    "--output-format", "json",
    "--system-prompt", p.sistema,
    ...(p.esquema ? ["--json-schema", JSON.stringify(p.esquema)] : []),
    ...(p.esforco ? ["--effort", p.esforco] : []),
  ];
  const inicio = Date.now();

  return new Promise((resolve, reject) => {
    /* `cwd` numa pasta vazia: mesmo com `--safe-mode`, nada do repositório deve parecer
     * contexto para quem está fazendo papel de cliente. */
    const filho = spawn(binarioDoClaude(), args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const alarme = setTimeout(() => filho.kill("SIGKILL"), p.timeoutMs ?? 240_000);
    filho.stdout.on("data", (d) => (out += d));
    filho.stderr.on("data", (d) => (err += d));
    filho.on("error", reject);
    filho.on("close", (codigo) => {
      clearTimeout(alarme);
      let j: any;
      try {
        j = JSON.parse(out);
      } catch {
        return reject(new Error(`claude saiu com ${codigo} sem JSON: ${(err || out).slice(0, 400)}`));
      }
      if (j.is_error) return reject(new Error(`claude: ${String(j.result ?? j.subtype).slice(0, 400)}`));
      const u = j.usage ?? {};
      resolve({
        texto: String(j.result ?? ""),
        estruturado: j.structured_output,
        custoUsd: Number(j.total_cost_usd ?? 0),
        ms: Date.now() - inicio,
        tokens: {
          entrada: Number(u.input_tokens ?? 0),
          saida: Number(u.output_tokens ?? 0),
          cacheLido: Number(u.cache_read_input_tokens ?? 0),
          cacheCriado: Number(u.cache_creation_input_tokens ?? 0),
        },
      });
    });
    filho.stdin.end(p.prompt);
  });
}

/** Uma chamada, com duas novas tentativas: o limite de taxa da conta aparece como erro. */
export async function perguntarAoClaude(p: ChamadaAoClaude): Promise<RespostaDoClaude> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await vez(() => umaVez(p));
      if (p.esquema && (r.estruturado === undefined || r.estruturado === null)) {
        throw new Error(`sem structured_output: ${r.texto.slice(0, 200)}`);
      }
      return r;
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, 4000 * (tentativa + 1)));
    }
  }
  throw ultimo;
}
