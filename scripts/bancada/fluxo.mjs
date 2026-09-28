// fluxo.mjs — fotografa o Fluxo com dia cheio (15 atendimentos) interceptando /api/agenda e /api/conversas.
// uso: node fluxo.mjs <saida-prefixo> [desktop|mobile] [--formado] [--vazio] [--gaveta] [--full] [--erroagenda] [--lento]
import { chromium, pastaDeFotos, posicionais, bandeiras } from "./_comum.mjs";
const [pre, modo = "desktop"] = posicionais(); const flags = bandeiras();
const has = (f) => flags.includes(f);
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const nomes = ["Ana Beatriz Moura","Carlos Henrique Duarte","Juliana Paes Ferreira","Marcos Vinícius Lima","Patrícia Gomes","Rodrigo Albuquerque Neto","Fernanda Siqueira","Thiago Martins","Larissa Campos","Eduardo Pacheco","Beatriz Nogueira","Gustavo Ribeiro","Camila Rocha","Felipe Andrade","Mariana Lopes"];
const eventos = has("--vazio") ? [] : nomes.map((n, i) => {
  const ini = 8 + i * 0.75;
  return { eventoId: "ev" + i, data: hoje, inicio: ini, fim: ini + 0.75, duracao: 45, recorrente: false,
    aguardandoResposta: i % 3 === 1,
    maisa: { profissionalId: "pr1", clienteId: "", clienteNome: n, clienteTel: "5511999990000", servicoId: "sv1", servicoNome: i % 2 ? "Sessão de terapia individual (50 min)" : "Atendimento padrão", servicoValor: 100 } };
});
const conversas = has("--vazio") ? [] : [
  { id: "11110001", nome: "Renata Souza", telefone: "5511911110001", atualizadaEm: new Date().toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Oi, consigo remarcar a sessão de amanhã pra sexta de manhã?" } },
  { id: "11110002", nome: "+55 11 98888-0002", telefone: "5511988880002", atualizadaEm: new Date().toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Quanto custa o pacote de 4 sessões? Aceita convênio?" } },
  { id: "11110003", nome: "Paulo Mendes", telefone: "5511911110003", atualizadaEm: new Date().toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Vou me atrasar uns 15 minutos, tudo bem?" } },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
if (has("--formado")) await ctx.addInitScript(() => localStorage.setItem("maisa.jornada.formado", "1"));
const page = await ctx.newPage();
await page.route("**/api/agenda?*", async (r) => {
  if (has("--lento")) await new Promise((x) => setTimeout(x, 4000));
  if (has("--erroagenda")) return r.fulfill({ json: { ok: false, status: "erro", info: "Sem conexão" } });
  r.fulfill({ json: { ok: true, de: hoje, ate: hoje, eventos } });
});
await page.route("**/api/conversas", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ok: true, status: "ok", conversas } }) : r.continue());
await page.goto("http://localhost:3200/?tela=fluxo", { waitUntil: has("--lento") ? "domcontentloaded" : "networkidle", timeout: 90000 });
await page.waitForTimeout(has("--lento") ? 1200 : 1800);
const m = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4)
      out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), visivel: el.clientHeight, total: el.scrollHeight, top: Math.round(el.getBoundingClientRect().top) });
  }
  const btns = [...document.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.top < innerHeight && r.bottom > 0; }).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 30));
  const cartoes = [...document.querySelectorAll("[role=button][draggable], [role=button]")].filter(e=>e.getAttribute("aria-label")?.includes(":")).map((e) => { const r = e.getBoundingClientRect(); return { l: e.getAttribute("aria-label").slice(0,40), top: Math.round(r.top), h: Math.round(r.height), visivel: r.top < innerHeight && r.bottom <= innerHeight }; });
  return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, botoesVisiveis: btns, cartoes, texto: document.body.innerText.length };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: pre + ".png" });
if (has("--full")) {
  // expande a região rolável para ver tudo
  await page.evaluate(() => { for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) { el.style.overflow = "visible"; el.style.height = "auto"; el.style.maxHeight = "none"; el.style.flex = "none"; } } document.querySelectorAll("*").forEach(e=>{ if (getComputedStyle(e).overflow==="hidden" && e.tagName!=="SPAN") {} }); });
  await page.screenshot({ path: pre + "-full.png", fullPage: true });
}
if (has("--gaveta")) {
  await page.locator("[role=button][draggable]").first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: pre + "-gaveta.png" });
  const t = await page.evaluate(() => [...document.querySelectorAll("button")].filter(b=>{const r=b.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0}).map(b=>(b.innerText||b.getAttribute("aria-label")||"").trim().slice(0,40)));
  console.log("GAVETA botoes:", JSON.stringify(t));
}
await browser.close();
