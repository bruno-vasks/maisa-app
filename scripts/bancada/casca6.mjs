import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("01-casca");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
for (const t of ["contatos","servicos"]) {
  await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  const m = await page.evaluate(() => { const h = document.querySelector("header"); const kids=[...h.children].map(k=>{const r=k.getBoundingClientRect(); return Math.round(r.left)+"-"+Math.round(r.right);}); const p=h.querySelector("p"); return { kids, subCortado: p ? p.scrollWidth > p.clientWidth : null, sub: p?.innerText, busca: Math.round(h.querySelector("button").getBoundingClientRect().width) }; });
  console.log(t, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/${t}-1024.png` });
}
await browser.close();
