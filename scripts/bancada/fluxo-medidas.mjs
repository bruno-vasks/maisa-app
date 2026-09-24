import { chromium, pastaDeFotos } from "./_comum.mjs";
const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const nomes = ["Ana Beatriz Moura","Carlos Henrique Duarte","Juliana Paes Ferreira","Marcos Vinícius Lima","Patrícia Gomes","Rodrigo Albuquerque Neto","Fernanda Siqueira","Thiago Martins","Larissa Campos","Eduardo Pacheco","Beatriz Nogueira","Gustavo Ribeiro","Camila Rocha","Felipe Andrade","Mariana Lopes"];
const eventos = nomes.map((n, i) => ({ eventoId: "ev" + i, data: hoje, inicio: 8 + i * 0.75, fim: 8.75 + i * 0.75, duracao: 45, recorrente: false, aguardandoResposta: i % 3 === 1, maisa: { profissionalId: "pr1", clienteNome: n, clienteTel: "5511999990000", servicoId: "sv1", servicoNome: "x", servicoValor: 100 } }));
const conversas = [{ id: "11110001", nome: "Renata Souza", telefone: "5511911110001", atualizadaEm: new Date().toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Oi, consigo remarcar?" } }];
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const vp of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript(() => localStorage.setItem("maisa.jornada.formado", "1"));
  const page = await ctx.newPage();
  await page.route("**/api/agenda?*", (r) => r.fulfill({ json: { ok: true, de: hoje, ate: hoje, eventos } }));
  await page.route("**/api/conversas", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ok: true, status: "ok", conversas } }) : r.continue());
  await page.goto("http://localhost:3200/?tela=fluxo", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const sz = (sel, txt) => [...document.querySelectorAll(sel)].filter(e => !txt || e.innerText.trim() === txt).slice(0, 1).map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })[0];
    const card = document.querySelector("[role=button][draggable]");
    const nested = card ? card.querySelectorAll("button").length : null;
    const cols = [...document.querySelectorAll("[role=button][draggable]")].slice(0,1).map(c => Math.round(c.getBoundingClientRect().width));
    const nomeEl = card?.querySelector("div > div");
    return { cardW: cols[0], cardH: card && Math.round(card.getBoundingClientRect().height), chegou: sz("button", "Chegou"), jaResolvi: sz("button", "Já resolvi"), botoesDentroDoCartao: nested, docW: document.documentElement.scrollWidth, winW: innerWidth };
  });
  console.log(vp.width + "x" + vp.height, JSON.stringify(m));
  await page.screenshot({ path: `${pastaDeFotos("fluxo")}/medida-${vp.width}.png` });
  await ctx.close();
}
await browser.close();
