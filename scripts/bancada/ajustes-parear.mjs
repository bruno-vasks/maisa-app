import { chromium, pastaDeFotos } from "./_comum.mjs";
const F = pastaDeFotos("ajustes");
const [, , modo = "mobile"] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
let st = "desconectado";
await page.route("**/api/contatos", (r) => r.fulfill({ json: { ok: true, modo: "negocio", contatos: [] } }));
await page.route("**/api/canal", (r) => {
  if (r.request().method() === "POST") { st = "pareando"; return r.fulfill({ json: { ok: true, pareamento: { status: "pareando", codigo: "K7QX2M9P", qrcode: null } } }); }
  return r.fulfill({ json: { ok: true, faltando: [], canal: { status: st, instancia: "x", numero: null, conectadoEm: null, telefoneDono: null } } });
});
await page.goto("http://localhost:3200/?tela=assistente", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
const med = async (rot) => console.log(rot, JSON.stringify(await page.evaluate(() => { const o = []; for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) o.push({ v: el.clientHeight, t: el.scrollHeight, top: Math.round(el.getBoundingClientRect().top) }); } return o; })));
await page.screenshot({ path: `${F}/${modo}-parear-0.png` }); await med("0");
if (modo === "desktop") await page.getByText("Estou no celular").click();
await page.waitForTimeout(300);
await page.locator('input[placeholder="(11) 99999-9999"]').first().fill("11994294906");
await page.waitForTimeout(300);
await page.screenshot({ path: `${F}/${modo}-parear-1-digitado.png` }); await med("1");
await page.getByText("Receber código").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${F}/${modo}-parear-2-conferir.png` }); await med("2");
const btns = await page.locator("button").allInnerTexts(); console.log(btns.filter(b=>b.trim()).slice(0,40).join(" | "));
await browser.close();
