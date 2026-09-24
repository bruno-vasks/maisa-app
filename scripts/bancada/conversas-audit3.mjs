import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("conversas");
const em = "2026-09-24T13:00:00-03:00";
const conversas = [{ id: "10000000", nome: "Mariana Souza", telefone: "5511910000000", atualizadaEm: em, estado: "maisa", ultima: { de: "bot", txt: "Tenho estes horários", em } }];
const msgs = [
  { de: "cliente", txt: "Quais horários tem amanhã?", em },
  { de: "bot", txt: "Tenho estes horários amanhã:\n\n1. 09:00\n2. 10:30\n3. 14:00\n\nQual prefere?", em },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/api/conversas**", (r) => {
  const tel = new URL(r.request().url()).searchParams.get("telefone");
  return r.fulfill({ json: tel ? { ok: true, status: "ok", conversa: conversas[0], msgs } : { ok: true, status: "ok", conversas } });
});
await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/desktop-quebra-de-linha.png`, clip: { x: 445, y: 85, width: 995, height: 300 } });
await browser.close();
