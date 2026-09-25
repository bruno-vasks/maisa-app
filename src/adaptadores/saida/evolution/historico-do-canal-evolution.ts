/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o que o WhatsApp do dono já viu de um número. ⚠️ SÓ SERVIDOR.
 *
 * `POST /chat/findMessages/{instancia}`. A Evolution guarda o histórico que o celular
 * sincronizou ao parear — medido em 24/09/2026 na instância da Regina: conversas desde
 * julho, dois meses antes de a MAISA existir ali. É essa memória que diz "número novo".
 *
 * ── ⚠️ O QUE O ENDPOINT FAZ E NÃO FAZ (medido em 24/09/2026) ──
 *
 *   • `where.key.fromMe: true` FILTRA. `fromMe: false` é ignorado (volta tudo).
 *   • `where.messageTimestamp` com gte/lte é IGNORADO — não dá para pedir "mais antigas".
 *   • `limit` é ignorado; a página padrão é 50, mais nova primeiro.
 *   • `offset` é o tamanho da página: com `offset: 1`, `pages` = total e a página N é a
 *     N-ésima mais nova. Por isso a mais antiga é `page: total`.
 *
 * Então são até três idas: quantas o dono/MAISA mandaram, quantas existem, e a última
 * página. A terceira só acontece se as duas primeiras ainda não decidiram.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { HistoricoDoCanal } from "@/nucleo/portas/saida/historico-do-canal";
import type { RastroNoCanal } from "@/nucleo/dominio/contatos";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { EVOLUTION } from "./config";
import { exigir } from "./cliente";

/** Caminho quente: o cliente está esperando. Estourar aqui cala a MAISA, que é o seguro. */
const TIMEOUT_MS = 8_000;

type Pagina = { total: number; timestamps: number[] };

function lerPagina(cru: any): Pagina {
  const m = cru?.messages ?? cru;
  const registros: any[] = Array.isArray(m?.records) ? m.records : [];
  const total = Number(m?.total);
  /* Sem `total` numérico a resposta não é a que foi medida — lançar em vez de supor zero,
   * porque zero é "número novo", e número novo libera a MAISA. */
  if (!Number.isFinite(total)) throw new Error("findMessages respondeu sem `messages.total`");
  return { total, timestamps: registros.map((r) => Number(r?.messageTimestamp)).filter(Number.isFinite) };
}

export function criarHistoricoDoCanalEvolution(deps: {
  /** A MESMA resolução de instância do canal. Ver `contatos-evolution.ts`. */
  instanciaDe: (t: ContextoTenant) => Promise<string>;
}): HistoricoDoCanal {
  return {
    async rastro(t, p): Promise<RastroNoCanal> {
      const instancia = await deps.instanciaDe(t);
      const buscar = async (where: Record<string, unknown>, page = 1) =>
        lerPagina(await exigir(`/chat/findMessages/${encodeURIComponent(instancia)}`, {
          metodo: "POST",
          corpo: { where, offset: 1, page },
          chave: EVOLUTION.apiKeyGlobal || undefined,
          timeoutMs: TIMEOUT_MS,
        }));

      /* O telefone e, quando veio, o `@lid`: a conversa pode morar sob qualquer dos dois. */
      const jids = [...new Set([`${p.telefone}@s.whatsapp.net`, p.jid].filter((j): j is string => !!j))];

      let maisAntiga: number | null = null;
      for (const remoteJid of jids) {
        const [meus, todos] = await Promise.all([
          buscar({ key: { remoteJid, fromMe: true } }),
          buscar({ key: { remoteJid } }),
        ]);
        if (meus.total > 0) return { jaEscreveramParaEle: true, maisAntiga: null };
        if (todos.total === 0) continue;

        const ultima = todos.total === 1 ? todos : await buscar({ key: { remoteJid } }, todos.total);
        const menor = Math.min(...ultima.timestamps);
        if (Number.isFinite(menor) && (maisAntiga === null || menor < maisAntiga)) maisAntiga = menor;
      }

      return {
        jaEscreveramParaEle: false,
        /* A Evolution conta em SEGUNDOS. */
        maisAntiga: maisAntiga === null ? null : new Date(maisAntiga * 1000).toISOString(),
      };
    },
  };
}
