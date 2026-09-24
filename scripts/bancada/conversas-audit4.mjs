import { chromium, pastaDeFotos } from "./_comum.mjs";
const em = "2026-09-24T13:00:00-03:00";
const conversas = [{ id: "10000000", nome: "Mariana Albuquerque de Souza Figueiredo", telefone: "5511910000000", atualizadaEm: em, estado: "voce", ultima: { de: "voce", txt: "ok", em } }];
const msgs = Array.from({ length: 12 }, (_, i) => ({ de: i % 2 ? "bot" : "cliente", txt: "texto de exemplo para ocupar", em }));
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.route("**/api/conversas**", (r) => {
    const tel = new URL(r.request().url()).searchParams.get("telefone");
    return r.fulfill({ json: tel ? { ok: true, status: "ok", conversa: conversas[0], msgs } : { ok: true, status: "ok", conversas } });
  });
  await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (vp.width < 500) { await page.getByText("Mariana Albuquerque").first().click(); await page.waitForTimeout(800); }
  const r = await page.evaluate(() => {
    const box = (el) => el && (({ top, bottom, height, width }) => ({ top: Math.round(top), bottom: Math.round(bottom), h: Math.round(height), w: Math.round(width) }))(el.getBoundingClientRect());
    const campo = document.querySelector('input[aria-label="Mensagem"]');
    const composer = campo?.closest('div[style*="border-top"]');
    const back = document.querySelector('button[aria-label="Voltar"]');
    const cab = (back || document.querySelector('a[aria-label="Abrir no WhatsApp"]'))?.parentElement;
    const nav = document.querySelector("nav");
    const tabs = document.querySelector('[role="tablist"]');
    const tab = document.querySelector('[role="tab"]');
    return { composer: box(composer), cabecalhoThread: box(cab), nav: box(nav), tabs: box(tabs), tab: box(tab) };
  });
  console.log(vp.width, JSON.stringify(r));
  await page.close();
}
await browser.close();
