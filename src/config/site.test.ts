/* ─────────────────────────────────────────────────────────────────────────────
 * O DOMÍNIO RAIZ MOSTRA A LP, E NÃO ENGOLE O RESTO DO APP.
 *
 * `rotaDoSite` só age nos hosts do site. O que mais importa provar: o host do app não é
 * tocado, `/api` e `/auth` nunca trocam de host, e os links antigos do Skip caem em algum
 * lugar que existe, levando a campanha junto.
 *
 * ⚠️ MANIPULA `process.env` E REIMPORTA O MÓDULO, como `endereco.test.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { afterEach, describe, expect, it, vi } from "vitest";

const APP = "https://app.maisasecretary.com.br";
const VARIAVEIS = ["MAISA_PUBLIC_URL", "MAISA_HOSTS_SITE", "VERCEL_PROJECT_PRODUCTION_URL"];

async function comEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of VARIAVEIS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  return import("./site");
}

const emProducao = () => comEnv({ MAISA_PUBLIC_URL: APP });

const pedido = (p: { host?: string; caminho?: string; busca?: string; metodo?: string }) => ({
  host: p.host ?? "maisasecretary.com.br",
  caminho: p.caminho ?? "/",
  busca: p.busca ?? "",
  metodo: p.metodo ?? "GET",
});

afterEach(() => {
  for (const k of VARIAVEIS) delete process.env[k];
  vi.resetModules();
});

describe("a raiz do site é a LP", () => {
  it("/ é reescrita para o index da LP, sem mudar a URL", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({}))).toEqual({ tipo: "reescrever", destino: "/lp/maisa/index.html" });
  });

  it("www e host com porta e caixa alta também", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ host: "www.maisasecretary.com.br" }))?.tipo).toBe("reescrever");
    expect(rotaDoSite(pedido({ host: "MaisaSecretary.com.br:443" }))?.tipo).toBe("reescrever");
  });

  it("os assets da LP são servidos como estão", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ caminho: "/lp/maisa/assets/index-abc.js" }))).toBeNull();
    expect(rotaDoSite(pedido({ caminho: "/lp/maisa" }))).toBeNull();
  });
});

describe("o resto do site vai para o app", () => {
  it("/signup do Skip vira o teste grátis, levando a campanha", async () => {
    const { rotaDoSite } = await emProducao();
    const r = rotaDoSite(pedido({ caminho: "/signup", busca: "?utm_source=google&gclid=X" }));
    expect(r?.tipo).toBe("redirecionar");
    const url = new URL(r!.destino);
    expect(url.origin + url.pathname).toBe(`${APP}/assinar/profissional`);
    expect(url.searchParams.get("teste")).toBe("1");
    expect(url.searchParams.get("icp")).toBe("generico");
    expect(url.searchParams.get("utm_source")).toBe("google");
    expect(url.searchParams.get("gclid")).toBe("X");
  });

  it("o painel antigo cai no app, e as telas de senha nas equivalentes", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ caminho: "/dashboard/overview" }))?.destino).toBe(`${APP}/`);
    expect(rotaDoSite(pedido({ caminho: "/forgot-password" }))?.destino).toBe(`${APP}/esqueci`);
    expect(rotaDoSite(pedido({ caminho: "/update-password" }))?.destino).toBe(`${APP}/nova-senha`);
  });

  it("qualquer outro caminho vai para o mesmo caminho no app, com a query", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ caminho: "/login", busca: "?x=1" }))?.destino).toBe(`${APP}/login?x=1`);
  });

  it("sem URL canônica configurada, usa o domínio do app mesmo assim", async () => {
    const { rotaDoSite } = await comEnv({});
    expect(rotaDoSite(pedido({ caminho: "/login" }))?.destino).toBe(`${APP}/login`);
  });
});

describe("o que a regra do site NUNCA toca", () => {
  it("o host do app, o .vercel.app e o localhost", async () => {
    const { rotaDoSite } = await emProducao();
    for (const host of ["app.maisasecretary.com.br", "maisa-app-sooty.vercel.app", "localhost:3100"]) {
      expect(rotaDoSite(pedido({ host }))).toBeNull();
    }
  });

  it("/api e /auth ficam no host em que chegaram", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ caminho: "/api/interno/novo-cadastro" }))).toBeNull();
    expect(rotaDoSite(pedido({ caminho: "/auth/callback", busca: "?code=1" }))).toBeNull();
  });

  it("método que escreve não é desviado", async () => {
    const { rotaDoSite } = await emProducao();
    expect(rotaDoSite(pedido({ metodo: "POST", caminho: "/signup" }))).toBeNull();
  });

  it("MAISA_HOSTS_SITE vazia desliga a regra", async () => {
    const { rotaDoSite } = await comEnv({ MAISA_PUBLIC_URL: APP, MAISA_HOSTS_SITE: "" });
    expect(rotaDoSite(pedido({}))).toBeNull();
  });
});
