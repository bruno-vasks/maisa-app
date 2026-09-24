import { chromium, pastaDeFotos } from "./_comum.mjs";
const F = pastaDeFotos("ajustes");
const [, , modo = "desktop", cenario = "real"] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
if (cenario !== "real") {
  await page.route("**/api/contatos", (r) => r.fulfill({ json: { ok: true, modo: "pessoal", contatos: [] } }));
  await page.route("**/api/canal", (r) => r.request().method() === "GET"
    ? r.fulfill({ json: { ok: true, faltando: [], canal: { status: "conectado", instancia: "x", numero: "5511994294906", conectadoEm: "2026-09-01", telefoneDono: null } } })
    : r.continue());
  await page.route("**/api/faqs", (r) => r.request().method() === "GET"
    ? r.fulfill({ json: { ok: true, faqs: [
        { id: "1", pergunta: "Vocês têm estacionamento?", resposta: "Temos convênio com o estacionamento da esquina, 2h grátis.", usos: 12 },
        { id: "2", pergunta: "Aceitam cartão?", resposta: "Aceitamos débito, crédito e Pix.", usos: 4 },
        { id: "3", pergunta: "Qual a política de atraso?", resposta: "Toleramos 15 minutos. Depois disso, a sessão é reduzida.", usos: 0 },
      ] } })
    : r.continue());
}
await page.goto("http://localhost:3200/?tela=assistente", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
const tag = `${modo}-${cenario}`;
const medir = async (rot) => {
  const m = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) out.push({ visivel: el.clientHeight, total: el.scrollHeight, top: Math.round(el.getBoundingClientRect().top) });
    }
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; };
    const inputs = [...document.querySelectorAll("input,textarea,select")].map((e) => { const r = e.getBoundingClientRect(); return { ph: e.getAttribute("placeholder") || e.getAttribute("aria-label") || e.value?.slice(0, 20), w: Math.round(r.width), top: Math.round(r.top) }; });
    const secoes = [...document.querySelectorAll("button[aria-expanded]")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.innerText.split("\n")[0], top: Math.round(r.top), aberta: b.getAttribute("aria-expanded") }; });
    const deQuem = box('section[aria-label="De quem é esse número"]');
    const pills = [...document.querySelectorAll("*")].filter((e) => { const cs = getComputedStyle(e); return parseFloat(cs.borderTopLeftRadius) >= 99 && e.getBoundingClientRect().width > 0; }).map((e) => ({ tag: e.tagName, txt: e.innerText?.slice(0, 20), clica: e.tagName === "BUTTON" || !!e.closest("button") }));
    return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, deQuem, secoes, inputs, pills };
  });
  console.log(rot, JSON.stringify(m));
};
await medir("inicial");
await page.screenshot({ path: `${F}/${tag}-0-inicial.png` });
// rolar a região inteira em telas
const rolar = async (nome) => {
  const alturas = await page.evaluate(() => { const els = [...document.querySelectorAll("div")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 300); const e = els[0]; if (!e) return null; e.setAttribute("data-rolo", "1"); return { v: e.clientHeight, t: e.scrollHeight }; });
  if (!alturas) return;
  let i = 1;
  for (let y = alturas.v; y < alturas.t; y += alturas.v) {
    await page.evaluate((y) => { document.querySelector("[data-rolo]").scrollTop = y; }, y);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${F}/${tag}-${nome}-rolado${i++}.png` });
  }
  await page.evaluate(() => { document.querySelector("[data-rolo]").scrollTop = 0; });
};
await rolar("personalidade");
for (const s of ["Horário de atendimento", "Agendamentos", "Dúvidas frequentes", "Comportamento"]) {
  await page.locator("button[aria-expanded]", { hasText: s }).first().click();
  await page.waitForTimeout(700);
  // rolar até o botão da seção
  await page.locator("button[aria-expanded]", { hasText: s }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const slug = s.split(" ")[0].normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase();
  await medir(slug);
  await page.screenshot({ path: `${F}/${tag}-${slug}.png` });
}
// fecha tudo
await page.locator("button[aria-expanded=true]").first().click();
await page.waitForTimeout(600);
await page.evaluate(() => { const e = document.querySelector("[data-rolo]"); if (e) e.scrollTop = 0; });
await medir("fechado");
await page.screenshot({ path: `${F}/${tag}-tudo-fechado.png` });
await browser.close();
