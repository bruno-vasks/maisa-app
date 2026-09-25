import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("01-casca");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const out = {};
for (const t of ["agenda","servicos","fluxo","clientes","equipe","faturamento"]) {
  await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  out[t] = await page.evaluate(() => {
    const bs = [...document.querySelectorAll("button, a")].map(b => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\n/g," ")).filter(Boolean);
    return { marcarVago: document.querySelectorAll('button[aria-label^="Marcar atendimento"]').length, criar: bs.filter(x => /novo|marcar|emitir|criar|adicionar|lançar|encaixar/i.test(x)) };
  });
}
// paleta bbox mobile e desktop
await page.goto(`http://localhost:3200/?tela=fluxo`, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
await page.click('button[aria-label="Buscar"]'); await page.waitForTimeout(600);
out.paletaMobile = await page.evaluate(() => { const r = document.querySelector('[role="dialog"]').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth, transform: getComputedStyle(document.querySelector('[role="dialog"]')).transform }; });
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(`http://localhost:3200/?tela=fluxo`, { waitUntil: "networkidle" }); await p2.waitForTimeout(800);
await p2.keyboard.press("Meta+k"); await p2.waitForTimeout(600);
out.paletaDesktop = await p2.evaluate(() => { const d=document.querySelector('[role="dialog"]'); const r = d.getBoundingClientRect(); const lista=d.children[1]; return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth, listaVis: lista.clientHeight, listaTot: lista.scrollHeight }; });
// busca por "contatos" e "documento"
for (const q of ["contatos","documento","recibo","sair","novo cliente","marcar"]) {
  await p2.fill('[role="dialog"] input', q); await p2.waitForTimeout(200);
  out["busca:"+q] = await p2.evaluate(() => document.querySelector('[role="dialog"]').innerText.replace(/\n/g," | ").slice(0,160));
}
// tab: foco inicial gaveta, esc
console.log(JSON.stringify(out, null, 1));
await browser.close();
