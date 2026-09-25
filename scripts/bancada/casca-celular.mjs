// casca-celular.mjs — T11 (1C.4): a casca do celular.
// uso: node scripts/bancada/casca-celular.mjs [WxH]   (padrão 390x844)
// Mede, em cada tela: altura do cabeçalho, das abas e o cromo somado (≤ 130px); e, desde o
// primeiro quadro, se o rail do desktop chegou a existir no DOM (um MutationObserver instalado
// antes de qualquer script da página anota). Depois abre uma conversa e mede a tela cheia:
// cabeçalho e abas fora, a thread com a altura que sobra; "voltar" devolve os dois.
import { chromium } from "./_comum.mjs";

const [w, h] = (process.argv[2] ?? "390x844").split("x").map(Number);
const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "fiscal", "equipe", "servicos", "assistente", "contatos", "mais"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  window.__railVisto = 0;
  const olhar = () => { if (document.querySelector('.m-rail')) window.__railVisto++; };
  new MutationObserver(olhar).observe(document, { childList: true, subtree: true });
});
const out = [];
for (const t of TELAS) {
  await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(900);
  out.push(await page.evaluate((t) => {
    const hd = document.querySelector("header"); const ab = document.querySelector('nav[aria-label="Navegação principal"]:not(.m-rail)');
    const hh = hd ? Math.round(hd.getBoundingClientRect().height) : 0; const ah = ab ? Math.round(ab.getBoundingClientRect().height) : 0;
    return { tela: t, header: hh, abas: ah, cromo: hh + ah, titulo: hd?.querySelector("h1")?.innerText, railVisto: window.__railVisto, docH: document.documentElement.scrollHeight, winH: innerHeight };
  }, t));
}
for (const o of out) console.log(JSON.stringify(o));

// Três conversas simuladas (o demo não tem nenhuma); respondidas no navegador.
const em = new Date().toISOString();
const conversas = ["Mariana Albuquerque", "João Pedro", "Carla Guth"].map((nome, i) => ({ id: String(10000000 + i), nome, telefone: `5511910000${i}`, atualizadaEm: em, estado: "maisa", ultima: { de: "bot", txt: "Marcado para amanhã às 15h.", em } }));
const msgs = Array.from({ length: 14 }, (_, i) => ({ de: i % 2 ? "bot" : "cliente", txt: `Mensagem ${i + 1}`, em }));
await page.route("**/api/conversas**", (r) => {
  if (r.request().method() !== "GET") return r.fulfill({ json: { ok: true, status: "ok" } });
  const id = new URL(r.request().url()).searchParams.get("id");
  return r.fulfill({ json: id ? { ok: true, status: "ok", conversa: conversas.find((c) => c.id === id) ?? conversas[0], msgs } : { ok: true, status: "ok", conversas } });
});
await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle" }); await page.waitForTimeout(900);
await page.getByText("Mariana Albuquerque").first().click(); await page.waitForTimeout(900);
const cheia = await page.evaluate(() => ({ header: !!document.querySelector("header"), abas: !!document.querySelector('nav[aria-label="Navegação principal"]:not(.m-rail)'), main: Math.round(document.querySelector("main")?.getBoundingClientRect().height ?? 0) }));
console.log(JSON.stringify({ caso: "conversa aberta", ...cheia }));
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
const voltar = page.getByRole("button", { name: /Voltar/ }).first();
if (await voltar.count()) { await voltar.click(); await page.waitForTimeout(600); }
console.log(JSON.stringify({ caso: "depois do voltar", header: !!(await page.$("header")), abas: !!(await page.$('nav[aria-label="Navegação principal"]')) }));
await browser.close();
