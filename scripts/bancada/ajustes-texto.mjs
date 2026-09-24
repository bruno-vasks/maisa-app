import { chromium, pastaDeFotos } from "./_comum.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/api/contatos", (r) => r.fulfill({ json: { ok: true, modo: "pessoal", contatos: [] } }));
await page.route("**/api/canal", (r) => r.fulfill({ json: { ok: true, faltando: [], canal: { status: "conectado", instancia: "x", numero: "5511994294906", conectadoEm: "x", telefoneDono: null } } }));
await page.goto("http://localhost:3200/?tela=assistente", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const main = document.querySelector("main");
  const txt = main.innerText;
  const traco = (txt.match(/—/g) || []).length;
  const blocos = [...main.querySelectorAll("div,section")].filter((e) => { const cs = getComputedStyle(e); const w = e.getBoundingClientRect().width; return w > 800 && cs.borderTopWidth === "1px" && parseFloat(cs.borderTopLeftRadius) >= 12; }).length;
  const quad = [...main.querySelectorAll("span")].filter((e) => { const b = e.getBoundingClientRect(); return b.width === 40 && b.height === 40 && e.querySelector("svg"); }).length;
  const primarios = [...main.querySelectorAll("button")].filter((b) => { const bg = getComputedStyle(b).backgroundColor; return /rgb\((4[0-9]|5[0-9]), (8[0-9]|9[0-9]|1[0-1][0-9]), (1[4-9][0-9])/.test(bg) || /rgb\(\d+, 1[0-3]\d, \d+\)/.test(bg); }).map(b=>b.innerText);
  return { chars: txt.length, traco, blocos, quad, primarios };
});
console.log(JSON.stringify(r));
await browser.close();
