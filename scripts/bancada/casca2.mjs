import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("01-casca");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const medirGaveta = (page) => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const filhos = [...d.children].map(c => ({ h: Math.round(c.getBoundingClientRect().height), top: Math.round(c.getBoundingClientRect().top), scroll: c.scrollHeight, client: c.clientHeight }));
  const botoes = [...d.querySelectorAll("button")].map(b => { const br=b.getBoundingClientRect(); return { t: (b.innerText||b.getAttribute("aria-label")||"").trim().slice(0,40), top: Math.round(br.top), w: Math.round(br.width), vis: br.bottom <= innerHeight }; });
  const campos = [...d.querySelectorAll("input,select,textarea")].map(i => { const ir=i.getBoundingClientRect(); return { top: Math.round(ir.top), w: Math.round(ir.width), vis: ir.bottom <= r.bottom }; });
  const rotulos = [...d.querySelectorAll("div")].filter(x => getComputedStyle(x).textTransform==="uppercase" && x.children.length===0).map(x => x.innerText + "@" + Math.round(x.getBoundingClientRect().top));
  return { vh: innerHeight, dialog: { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }, filhos, botoes, ncampos: campos.length, camposVisiveis: campos.filter(c=>c.vis).length, larguraCampo: campos[0]?.w, rotulos, texto: d.innerText.length };
});
const out = {};
for (const modo of ["desktop","mobile"]) {
  const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const m = modo[0];
  const ir = async (t) => { await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(1200); };
  // rail aberto (desktop)
  if (modo === "desktop") {
    await ir("fluxo");
    await page.hover('nav[aria-label="Navegação principal"]');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/rail-aberto-d.png` });
  }
  // paleta
  await ir("fluxo");
  if (modo === "desktop") await page.keyboard.press("Meta+k"); else await page.click('button[aria-label="Buscar"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/paleta-vazia-${m}.png` });
  await page.keyboard.type("novo");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/paleta-novo-${m}.png` });
  out[`${m}:paleta-novo`] = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText);
  await page.keyboard.press("Control+a"); await page.keyboard.type("ma");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/paleta-ma-${m}.png` });
  out[`${m}:paleta-ma`] = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText);
  // gaveta cliente
  await ir("clientes");
  await page.getByText("Mariana Alves").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/gaveta-cliente-${m}.png` });
  out[`${m}:gaveta-cliente`] = await medirGaveta(page);
  // gaveta serviço
  await ir("servicos");
  await page.getByText("Atendimento padrão").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/gaveta-servico-${m}.png` });
  out[`${m}:gaveta-servico`] = await medirGaveta(page);
  // gaveta profissional
  await ir("equipe");
  const card = page.locator('main [role="button"], main button').filter({ hasNotText: /Novo|Buscar/ });
  const nomes = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(e=>e.children.length===0 && /^[A-ZÁÉ][a-zá-ú]+ [A-ZÁÉ]/.test(e.innerText||"")).slice(0,5).map(e=>e.innerText));
  out[`${m}:equipe-nomes`] = nomes;
  if (nomes[0]) { await page.getByText(nomes[0], { exact: true }).first().click(); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/gaveta-profissional-${m}.png` }); out[`${m}:gaveta-prof`] = await medirGaveta(page); }
  // agenda: clicar num vago
  await ir("agenda");
  const vago = page.locator('button[aria-label^="Marcar atendimento"]').first();
  if (await vago.count()) { await vago.click({ force: true }); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/gaveta-novo-atendimento-${m}.png` }); out[`${m}:gaveta-novo`] = await medirGaveta(page); }
  else { const b = page.getByRole("button", { name: /Marcar/ }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/gaveta-novo-atendimento-${m}.png` }); out[`${m}:gaveta-novo`] = await medirGaveta(page);} }
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
