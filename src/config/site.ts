/* ─────────────────────────────────────────────────────────────────────────────
 * O SITE — `maisasecretary.com.br` servido por este app (24/10/2026).
 *
 * Até 24/10/2026 o domínio raiz era o site do Skip: a LP tradicional da Maisa e um painel
 * antigo, de outro projeto Supabase. A LP foi refeita (`lp/maisa/`, fonte em
 * `~/Desktop/maisa-lp`) e passa a morar aqui, em `/lp/maisa/`. Quando o domínio raiz for
 * apontado para a Vercel deste projeto, esta função decide o que cada pedido nele vira:
 *
 *   `/`                 → reescrita para `/lp/maisa/index.html` (a URL fica `/`)
 *   `/lp/maisa/…`       → servido como está (os assets da própria LP)
 *   `/api`, `/auth`     → servido como está (mesmo motivo do `SEM_TROCA_DE_HOST`)
 *   caminhos do Skip    → o equivalente no app (`/signup` vira o teste grátis)
 *   qualquer outro      → o mesmo caminho no host do app
 *
 * Sem isto, o middleware mandaria `/` para o `/login` (a raiz não é pública: ela é o app),
 * e a LP nunca apareceria no domínio dela.
 *
 * ⚠️ INERTE ATÉ O DNS MUDAR. Nenhum pedido chega com estes hosts enquanto o domínio aponta
 * para o Skip. `MAISA_HOSTS_SITE` (lista por vírgula) sobrescreve a lista; vazia desliga.
 *
 * ⚠️ RODA NO EDGE, como `endereco.ts`: nada de `node:`, nada de SDK.
 * ────────────────────────────────────────────────────────────────────────────── */

import { URL_CANONICA } from "./endereco";

/** Onde a LP tradicional mora no app. O `index.html` dela usa este prefixo nos assets. */
export const CAMINHO_DA_LP = "/lp/maisa";

const APP_PADRAO = "https://app.maisasecretary.com.br";

export const HOSTS_SITE: string[] = (() => {
  const cru = process.env.MAISA_HOSTS_SITE;
  const lista = cru === undefined ? ["maisasecretary.com.br", "www.maisasecretary.com.br"] : cru.split(",");
  return lista
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0])
    .filter(Boolean);
})();

/** Os caminhos do site do Skip que podem estar em link salvo, anúncio ou e-mail antigo. */
const DO_SKIP: Record<string, string> = {
  "/signup": "/assinar/profissional?teste=1&icp=generico",
  "/forgot-password": "/esqueci",
  "/update-password": "/nova-senha",
};

const debaixo = (caminho: string, prefixo: string): boolean =>
  caminho === prefixo || caminho.startsWith(prefixo + "/");

export type RotaDoSite =
  | { tipo: "reescrever"; destino: string }
  | { tipo: "redirecionar"; destino: string };

/** O que fazer com um pedido no host do site, ou `null` para seguir o fluxo normal. */
export function rotaDoSite(p: {
  host: string | null | undefined;
  caminho: string;
  busca: string;
  metodo: string;
}): RotaDoSite | null {
  const atual = (p.host ?? "").toLowerCase().split(":")[0];
  if (!atual || !HOSTS_SITE.includes(atual)) return null;
  if (p.metodo !== "GET" && p.metodo !== "HEAD") return null;

  if (p.caminho === "/" || p.caminho === "") {
    return { tipo: "reescrever", destino: `${CAMINHO_DA_LP}/index.html` };
  }
  if (debaixo(p.caminho, CAMINHO_DA_LP) || debaixo(p.caminho, "/api") || debaixo(p.caminho, "/auth")) {
    return null;
  }

  const app = URL_CANONICA || APP_PADRAO;
  if (debaixo(p.caminho, "/dashboard")) return { tipo: "redirecionar", destino: `${app}/` };

  const doSkip = DO_SKIP[p.caminho];
  if (doSkip) {
    // A campanha do link antigo segue junto: `?utm_source=…` não pode morrer no desvio.
    const [caminho, fixa] = doSkip.split("?");
    const q = new URLSearchParams(fixa ?? "");
    new URLSearchParams(p.busca).forEach((v, k) => q.set(k, v));
    const busca = q.toString();
    return { tipo: "redirecionar", destino: `${app}${caminho}${busca ? `?${busca}` : ""}` };
  }

  return { tipo: "redirecionar", destino: `${app}${p.caminho}${p.busca}` };
}
