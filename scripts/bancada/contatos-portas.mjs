// contatos-portas.mjs — as portas de "Meus contatos" e o importar ali mesmo (1B.9, 1B.10).
// uso: node contatos-portas.mjs [desktop|mobile] [pasta-de-fotos] [--modo=negocio|pessoal] [--canal=conectado|desconectado]
//
// portas: ⌘K "contatos" e "documento" (desktop), e o botão "Quem a MAISA atende" em Clientes.
// importar: `/api/contatos` começa vazio; o POST (respondido aqui, nada vai à Evolution) devolve
// `{ novos: 374, total: 374, lidos: 1840 }` e o GET seguinte traz 3 contatos. Mede se a tela
// continua em Contatos, se a lista aparece e o que o botão dizia enquanto lia.
import { chromium, posicionais, bandeiras } from "./_comum.mjs";
const [modo = "desktop", pasta] = posicionais(); const flags = bandeiras();
const opt = (k, d) => (flags.find((f) => f.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=")[1];
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const modoDoNumero = opt("modo", "negocio");
const canal = opt("canal", "conectado");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = { vp, modoDoNumero, canal };

const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
let importou = false;
const cheios = [
  { chave: "11111111", nome: "Ana Paula", telefone: "5511911111111", cliente: null },
  { chave: "22222222", nome: "Bruno Lima", telefone: "5511922222222", cliente: null },
  { chave: "33333333", nome: null, telefone: "5511933333333", cliente: null },
];
await page.route("**/api/canal", (r) => r.fulfill({ json: { ok: true, status: "ok", canal: { status: canal, instancia: "demo", numero: canal === "conectado" ? "5511994294906" : null, conectadoEm: null, telefoneDono: null }, faltando: [] } }));
await page.route("**/api/contatos", async (r) => {
  if (r.request().method() === "POST") { await new Promise((ok) => setTimeout(ok, 1200)); importou = true; return r.fulfill({ json: { ok: true, status: "ok", novos: 374, total: 374, lidos: 1840 } }); }
  return r.fulfill({ json: { ok: true, status: "ok", modo: modoDoNumero, contatos: importou ? cheios : [] } });
});

if (modo === "desktop") {
  await page.goto("http://localhost:3200/?tela=fluxo", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(800);
  for (const q of ["contatos", "documento"]) {
    await page.keyboard.press("Meta+k"); await page.waitForTimeout(400);
    await page.fill('[role="dialog"] input', q); await page.waitForTimeout(250);
    out[`busca:${q}`] = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3));
    await page.keyboard.press("Enter"); await page.waitForTimeout(600);
    out[`enter:${q}`] = await page.evaluate(() => document.querySelector("header h1")?.textContent);
  }
}

await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1000);
const porta = page.getByRole("button", { name: "Quem a MAISA atende" });
out.portaEmClientes = await porta.count();
if (out.portaEmClientes) {
  const r = await porta.first().boundingBox();
  out.portaVisivel = !!r && r.y >= 0 && r.y + r.height <= vp.height;
  await porta.first().click(); await page.waitForTimeout(900);
}
out.telaDepoisDaPorta = await page.evaluate(() => document.querySelector("header h1")?.textContent);
if (pasta) await page.screenshot({ path: `${pasta}/contatos-vazio-${modo}-${modoDoNumero}-${canal}.png` });

const botao = page.getByRole("button", { name: /Trazer meus contatos|Conectar WhatsApp/ });
out.botaoDoVazio = await botao.first().textContent().catch(() => null);
if (out.botaoDoVazio?.startsWith("Trazer")) {
  await botao.first().click(); await page.waitForTimeout(300);
  out.durante = await page.evaluate(() => [...document.querySelectorAll("main button")].map((b) => `${b.textContent.trim()}${b.disabled ? " (travado)" : ""}`).filter((t) => /Lendo|Trazer/.test(t)));
  await page.waitForTimeout(2200);
  out.telaDepois = await page.evaluate(() => document.querySelector("header h1")?.textContent);
  out.listaDepois = await page.evaluate(() => ["Ana Paula", "Bruno Lima"].filter((n) => document.body.innerText.includes(n)));
  out.toast = await page.evaluate(() => (document.body.innerText.match(/374 contatos novos[^\n]*/) || [null])[0]);
  if (pasta) await page.screenshot({ path: `${pasta}/contatos-depois-${modo}-${modoDoNumero}.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
