/* ─────────────────────────────────────────────────────────────────────────────
 * O MEDIDOR — quanto a MAISA gastou e quanto demorou, por conversa.
 *
 * O Gemini não devolve custo pela porta `ModeloDeConversa` (e não deveria: custo não é
 * assunto do agente). Então a medição escuta o `fetch` do processo e lê o
 * `usageMetadata` de cada resposta do `generateContent`. Cada conversa roda no próprio
 * processo, então "o processo" e "a conversa" são a mesma coisa aqui.
 *
 * Preço por 1M de tokens, em US$. ⚠️ Confira antes de decidir com base nisto: tabela de
 * preço muda, e o relatório só multiplica.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Medicao = { usd: number; ms: number; entrada: number; saida: number; chamadas: number };

export type Medidor = {
  somar(m: Omit<Medicao, "chamadas">): void;
  total(): Medicao;
};

export function criarMedidor(): Medidor {
  const t: Medicao = { usd: 0, ms: 0, entrada: 0, saida: 0, chamadas: 0 };
  return {
    somar(m) {
      t.usd += m.usd;
      t.ms += m.ms;
      t.entrada += m.entrada;
      t.saida += m.saida;
      t.chamadas += 1;
    },
    total: () => ({ ...t }),
  };
}

/** [entrada, entrada em cache, saída] por 1M de tokens. O pensamento é cobrado como saída. */
export const PRECO_GEMINI: Record<string, [number, number, number]> = {
  "gemini-3.5-flash-lite": [0.3, 0.03, 2.5],
  "gemini-3.6-flash": [1.5, 0.15, 7.5],
};

/** Escuta o `fetch` e soma o uso de cada `generateContent` do Gemini no medidor. */
export function medirGemini(medidor: Medidor) {
  const original = globalThis.fetch;
  globalThis.fetch = async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const inicio = Date.now();
    const r = await original(entrada, init);
    const m = url.match(/models\/([^:]+):generateContent/);
    if (!m) return r;
    try {
      const j = await r.clone().json();
      const u = j?.usageMetadata ?? {};
      const entradaT = Number(u.promptTokenCount ?? 0);
      const cache = Number(u.cachedContentTokenCount ?? 0);
      const saida = Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0);
      const [pe, pc, ps] = PRECO_GEMINI[m[1]] ?? [NaN, NaN, NaN];
      medidor.somar({
        usd: ((entradaT - cache) * pe + cache * pc + saida * ps) / 1e6,
        ms: Date.now() - inicio,
        entrada: entradaT,
        saida,
      });
    } catch {
      /* Resposta sem JSON é falha do provedor; quem trata é o adaptador. */
    }
    return r;
  };
}
