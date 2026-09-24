// clientes-audit.mjs — fotografa Clientes/Contatos com estado (gaveta, formulário, 200 clientes, 400 contatos).
import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = process.argv[2];
const NOMES = ["Ana","Bruno","Carla","Diego","Elisa","Fábio","Gabriela","Heitor","Isabela","João","Karina","Lucas","Marina","Nicolas","Olívia","Paulo","Quésia","Rafael","Sofia","Tiago"];
const SOBRE = ["Silva","Souza","Oliveira","Santos","Lima","Pereira","Costa","Rodrigues","Almeida","Nascimento"];
function muitos(base, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = base[i % base.length];
    out.push({ ...b, id: `clx${i}`, nome: `${NOMES[i % 20]} ${SOBRE[Math.floor(i / 20) % 10]}`, telefone: i % 7 === 0 ? "" : `(11) 9${String(80000000 + i * 137).slice(0,4)}-${String(1000 + i).slice(-4)}`, cpf: i % 3 === 0 ? "" : b.cpf, ativo: i % 9 !== 0, atendimentos: i % 5, valor: (i % 5) * 150 });
  }
  return out;
}
function contatos(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ chave: String(90000000 + i * 211).slice(-8), nome: i % 4 === 0 ? null : `${NOMES[i % 20]} ${SOBRE[i % 10]}`, cliente: i % 11 === 0 ? true : i % 13 === 0 ? false : null });
  return out;
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function shot(nome, vp, prep, { cad200 = false, cont = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  if (cad200) {
    await page.route("**/api/cadastro*", async (route) => {
      const r = await route.fetch(); const d = await r.json();
      d.clientes = muitos(d.clientes, 200);
      await route.fulfill({ response: r, json: d });
    });
  }
  if (cont) {
    await page.route("**/api/contatos*", async (route) => {
      if (route.request().method() !== "GET") return route.fulfill({ json: { ok: true, status: "ok", pedidos: 1, mudados: 1 } });
      await route.fulfill({ json: { ok: true, status: "ok", modo: cont.modo, contatos: contatos(cont.n) } });
    });
  }
  const tela = prep.tela ?? "clientes";
  await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  if (prep.fn) await prep.fn(page);
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) out.push({ cls: String(el.className).slice(0, 30), visivel: el.clientHeight, total: el.scrollHeight });
    }
    const dlg = document.querySelector('[role="dialog"]');
    const r = dlg?.getBoundingClientRect();
    return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, dialogo: r ? { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) } : null,
      cartoes: document.querySelectorAll("button.m-exp").length };
  });
  console.log(nome, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/${nome}.png` });
  await ctx.close();
}
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const abrirMariana = async (p) => { await p.locator("button.m-exp").first().click(); };
const rolarGaveta = async (p) => { await p.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const r = [...d.querySelectorAll("div")].find((x) => getComputedStyle(x).overflowY === "auto"); if (r) r.scrollTop = 99999; }); };
const novo = async (p) => { await p.getByRole("button", { name: /Novo cliente/ }).first().click(); };
const hover = async (p) => { await p.locator("button.m-exp").first().hover(); };
const paleta = async (p) => { await p.keyboard.press("Meta+k"); await p.keyboard.type("Mari"); };
await shot("gaveta-cliente-desktop", D, { fn: abrirMariana });
await shot("gaveta-cliente-desktop-rolada", D, { fn: async (p) => { await abrirMariana(p); await rolarGaveta(p); } });
await shot("gaveta-cliente-mobile", M, { fn: abrirMariana });
await shot("gaveta-cliente-mobile-rolada", M, { fn: async (p) => { await abrirMariana(p); await rolarGaveta(p); } });
await shot("novo-cliente-desktop", D, { fn: novo });
await shot("novo-cliente-mobile", M, { fn: novo });
await shot("hover-cartao-desktop", D, { fn: hover });
await shot("paleta-desktop", D, { fn: paleta });
await shot("clientes-200-desktop", D, {}, { cad200: true });
await shot("clientes-200-mobile", M, {}, { cad200: true });
await shot("contatos-400-pessoal-desktop", D, { tela: "contatos" }, { cont: { modo: "pessoal", n: 400 } });
await shot("contatos-400-pessoal-mobile", M, { tela: "contatos" }, { cont: { modo: "pessoal", n: 400 } });
await shot("contatos-400-negocio-mobile", M, { tela: "contatos" }, { cont: { modo: "negocio", n: 400 } });
await shot("contatos-lote-confirmar-desktop", D, { tela: "contatos", fn: async (p) => { await p.getByRole("button", { name: "Atende", exact: true }).first().click(); } }, { cont: { modo: "pessoal", n: 400 } });
await shot("ajustes-apos-trazer-contatos-desktop", D, { tela: "contatos", fn: async (p) => { await p.getByRole("button", { name: /Trazer meus contatos/ }).click(); } });
await browser.close();
