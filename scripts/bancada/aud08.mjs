import { chromium, pastaDeFotos } from "./_comum.mjs";
const F = pastaDeFotos("08-equipe-servicos-mais");
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function abrir(tela, modo) {
  const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  return page;
}
async function medirGaveta(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const corpo = [...d.children].find((c) => getComputedStyle(c).overflowY === "auto");
    const botoes = [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
    return { top: r.top, h: r.height, w: r.width, corpo: corpo ? { vis: corpo.clientHeight, total: corpo.scrollHeight } : null, botoes, texto: d.innerText.length };
  });
}
for (const modo of ["desktop", "mobile"]) {
  // profissional
  let p = await abrir("equipe", modo);
  await p.locator('button[aria-label*="Rafael"]').first().click();
  await p.waitForTimeout(700);
  console.log("prof", modo, JSON.stringify(await medirGaveta(p)));
  await p.screenshot({ path: `${F}/gaveta-prof-${modo}.png` });
  await p.close();
  // servico
  p = await abrir("servicos", modo);
  await p.locator('button[aria-label*="Atendimento padrão"]').first().click();
  await p.waitForTimeout(700);
  console.log("svc", modo, JSON.stringify(await medirGaveta(p)));
  await p.screenshot({ path: `${F}/gaveta-svc-${modo}.png` });
  await p.close();
  // mais: plano, faq, numeros
  for (const [rot, nome] of [["Plano ", "plano"], ["Perguntas frequentes", "faq"], ["Números do mês", "numeros"]]) {
    p = await abrir("mais", modo);
    await p.locator(`main button:has-text("${rot}")`).first().click();
    await p.waitForTimeout(900);
    console.log(nome, modo, JSON.stringify(await medirGaveta(p)));
    await p.screenshot({ path: `${F}/gaveta-${nome}-${modo}.png` });
    await p.close();
  }
}
// mais mobile full
let p = await abrir("mais", "mobile");
await p.screenshot({ path: `${F}/mais-mobile-full.png`, fullPage: false });
const alturas = await p.evaluate(() => {
  const sc = document.querySelector(".m-enter");
  return [...sc.children].map((c) => ({ txt: c.innerText.slice(0, 30).replace(/\n/g, " | "), top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height) }));
});
console.log("mais-mobile blocos", JSON.stringify(alturas));
await p.close();
p = await abrir("mais", "desktop");
const altD = await p.evaluate(() => {
  const sc = document.querySelector(".m-enter");
  const out = [...sc.children].map((c) => ({ txt: c.innerText.slice(0, 30).replace(/\n/g, " | "), top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height), w: Math.round(c.getBoundingClientRect().width) }));
  const h2 = [...sc.querySelectorAll("h2")].map((h) => { const r = h.getBoundingClientRect(); const p = h.nextElementSibling?.getBoundingClientRect(); return { t: h.textContent, top: Math.round(r.top), h: Math.round(r.height), lh: getComputedStyle(h).lineHeight, pTop: p && Math.round(p.top) }; });
  return { out, h2, sup: document.querySelector('a[href*="wa.me"]')?.href };
});
console.log("mais-desktop blocos", JSON.stringify(altD));
await p.close();
// servicos mobile: onde comeca a lista
p = await abrir("servicos", "mobile");
const svm = await p.evaluate(() => {
  const sc = document.querySelector(".m-enter");
  return [...sc.children].map((c) => ({ txt: c.innerText.slice(0, 25).replace(/\n/g, " | "), top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height) }));
});
console.log("svc-mobile blocos", JSON.stringify(svm));
const novo = await p.getByText("Novo serviço").count();
console.log("botao Novo servico no mobile:", novo);
await p.close();
// equipe mobile: truncamento
p = await abrir("equipe", "mobile");
const trunc = await p.evaluate(() => [...document.querySelectorAll("button span")].filter((e) => e.scrollWidth > e.clientWidth + 1 && e.children.length === 0).map((e) => ({ t: e.textContent, vis: e.clientWidth, total: e.scrollWidth })));
console.log("equipe-mobile truncado", JSON.stringify(trunc));
await p.close();
await browser.close();
