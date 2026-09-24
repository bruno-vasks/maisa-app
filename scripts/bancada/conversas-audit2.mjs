import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("conversas");
const em = (h) => new Date(Date.parse("2026-09-24T14:00:00-03:00") - h * 3600e3).toISOString();
const conversas = [
  { id: "10000000", nome: "Mariana Souza", telefone: "5511910000000", atualizadaEm: em(0), estado: "espera", ultima: { de: "cliente", txt: "Oi, consigo remarcar?", em: em(0) } },
  { id: "10003333", nome: "Rafael Mendes", telefone: "", atualizadaEm: em(30), estado: "maisa", ultima: { de: "bot", txt: "Confirmado!", em: em(30) } },
];
let thread = Array.from({ length: 24 }, (_, i) => ({ de: i % 2 ? "bot" : "cliente", txt: `Mensagem número ${i + 1} da conversa, um pouco de texto para ocupar espaço.`, em: em(48 - i) }));
const browser = await chromium.launch({ channel: "chrome", headless: true });

// 1) carregando: atrasa a lista 4s
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/conversas**", async (r) => { await new Promise((x) => setTimeout(x, 6000)); r.fulfill({ json: { ok: true, status: "ok", conversas } }); });
  await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/desktop-carregando.png` });
  await page.close();
}
// 2) erro
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/conversas**", (r) => r.fulfill({ status: 500, json: { ok: false, status: "erro" } }));
  await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/desktop-erro.png` });
  await page.close();
}
// 3) sem número + puxão de rolagem no polling
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/conversas**", (r) => {
    const u = new URL(r.request().url()); const tel = u.searchParams.get("telefone");
    if (r.request().method() === "POST") return r.fulfill({ json: { ok: true } });
    if (tel) { const c = conversas.find((x) => x.id === tel); return r.fulfill({ json: { ok: true, status: "ok", conversa: c, msgs: thread } }); }
    return r.fulfill({ json: { ok: true, status: "ok", conversas } });
  });
  await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByText("Rafael Mendes").first().click();
  await page.waitForTimeout(900);
  const href = await page.locator('a[aria-label="Abrir no WhatsApp"]').getAttribute("href");
  const sub = await page.locator('text=conduzindo').first().textContent();
  const ph = await page.locator('input[aria-label="Mensagem"]').getAttribute("placeholder");
  console.log("semnumero", { href, sub, ph });
  await page.screenshot({ path: `${OUT}/desktop-sem-numero.png` });
  // rolar para cima e esperar o polling trazer mensagem nova
  const regiao = page.locator('div[style*="overflow-y: auto"][style*="surface-2"]');
  await regiao.evaluate((el) => { el.scrollTop = 0; });
  const antes = await regiao.evaluate((el) => el.scrollTop);
  thread = [...thread, { de: "cliente", txt: "Nova mensagem chegou", em: em(-0.1) }];
  await page.waitForTimeout(16500);
  const depois = await regiao.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  console.log("puxao", { antes, depois });
  await page.close();
}
await browser.close();
