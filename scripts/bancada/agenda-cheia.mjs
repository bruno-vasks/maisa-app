// agenda-cheia.mjs — Agenda com dado simulado (intercepta /api/cadastro, /api/agenda, /api/google/status).
// uso: node agenda-cheia.mjs <cenario> <saida.png> [desktop|mobile|WxH] [--equipe] [--google=ok|nao] [--falha=<pid>] [--full]
import { chromium, pastaDeFotos } from "./_comum.mjs";
const [, , cenario, saida, modo = "desktop", ...flags] = process.argv;
const equipe = flags.includes("--equipe");
const full = flags.includes("--full");
const g = (flags.find(f => f.startsWith("--google=")) || "--google=cfg").split("=")[1];
let vp = modo === "mobile" ? { width: 390, height: 844 } : modo === "desktop" ? { width: 1440, height: 900 } : { width: +modo.split("x")[0], height: +modo.split("x")[1] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
if (equipe) {
  base.profissionais.push(
    { ...base.profissionais[0], id: "pr2", nome: "Diego Souza", expediente: { folga: [0], de: 10, ate: 20 } },
    { ...base.profissionais[0], id: "pr3", nome: "Léo Martins", expediente: { folga: [6], de: 9, ate: 18 } },
  );
  base.agendas = ["pr1", "pr2", "pr3"];
}
const cl = base.clientes; const sv = base.servicos;
const dias = ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-26"];
const eventos = []; let n = 0;
const horas = [9, 9.5, 10.5, 11, 13, 14, 14.5, 15.5, 16, 17, 18];
for (const d of dias) {
  const qtd = d === "2026-09-24" ? 11 : 6 + (n % 3);
  for (let i = 0; i < qtd; i++) {
    const h = horas[(i * 7 + n) % horas.length] ; const pid = base.agendas[i % base.agendas.length];
    const s = sv[i % 6]; const c = cl[(i + n) % cl.length];
    eventos.push({ eventoId: `ev${n++}`, data: d, inicio: h, fim: h + s.duracao / 60, duracao: s.duracao, titulo: "x",
      meetLink: i % 4 === 0 ? "https://meet.google.com/abc-defg-hij" : undefined, htmlLink: i % 4 === 0 ? "https://calendar.google.com" : undefined,
      recorrente: false, aguardandoResposta: i % 5 === 1,
      maisa: { ag: `m${n}`, profissionalId: pid, clienteId: c.id, clienteNome: c.nome, clienteTel: c.telefone, servicoId: s.id, servicoNome: s.nome, servicoValor: s.preco } });
  }
}
// dedupe same pid/day/hour
const seen = new Set(); const ev2 = eventos.filter(e => { const k = e.data + e.maisa.profissionalId + e.inicio; if (seen.has(k)) return false; seen.add(k); return true; });
ev2.push({ eventoId: "gx1", data: "2026-09-24", inicio: 12, fim: 13, duracao: 60, titulo: "Almoço com a Carla", recorrente: false });
await page.route("**/api/cadastro", r => r.fulfill({ json: base }));
// Um GET por agenda (1A.4): a resposta traz só os eventos DAQUELE pid, e o compromisso do Google
// (gx1) é da agenda do dono. `--falha=<pid>` faz a leitura dessa agenda voltar com erro.
const falha = (flags.find(f => f.startsWith("--falha=")) || "").split("=")[1];
const gets = [];
await page.route("**/api/agenda?*", r => { const u = new URL(r.request().url()); const pid = u.searchParams.get("pid"); gets.push(`${pid} ${u.searchParams.get("de")}..${u.searchParams.get("ate")}`);
  if (pid === falha) return r.fulfill({ json: { ok: false, status: "erro", info: "Falha simulada." } });
  const dele = ev2.filter(e => e.maisa ? e.maisa.profissionalId === pid : pid === base.agendas[0]);
  r.fulfill({ json: { ok: true, status: "ok", de: u.searchParams.get("de"), ate: u.searchParams.get("ate"), eventos: dele } }); });
if (g === "ok") await page.route("**/api/google/status", r => r.fulfill({ json: { status: "ok", conexoes: [{ profissionalId: "pr1", googleEmail: "rafael@gmail.com" }] } }));
if (g === "nao") await page.route("**/api/google/status", r => r.fulfill({ json: { status: "ok", conexoes: [] } }));
await page.goto("http://localhost:3200/?tela=agenda", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
const clicar = async (txt) => { await page.getByRole("tab", { name: txt }).click(); await page.waitForTimeout(700); };
if (cenario === "semana") await clicar("Semana");
if (cenario === "mes") await clicar("Mês");
if (cenario === "atendimento") { await page.locator('[role=button][aria-label^="' + ev2.find(e=>e.data==="2026-09-24"&&e.meetLink).maisa.clienteNome + '"]').first().click().catch(async()=>{ await page.locator("button", { hasText: ev2.find(e=>e.data==="2026-09-24"&&e.meetLink).maisa.clienteNome }).first().click(); }); await page.waitForTimeout(800); }
if (cenario === "cancelar") { await page.locator('[role=button][aria-label*="Atendimento padrão"]').first().click().catch(async()=>{ await page.locator("button", { hasText: "Atendimento padrão" }).first().click(); }); await page.waitForTimeout(600); await page.getByRole("button", { name: "Cancelar atendimento" }).click(); await page.waitForTimeout(500); }
if (cenario === "marcar") { if (vp.width > 800) await page.getByRole("button", { name: "Marcar" }).first().click(); else await page.locator('[aria-label^="Marcar atendimento"]').first().click(); await page.waitForTimeout(800); }
if (cenario === "marcar-serie") { await page.getByRole("button", { name: "Marcar" }).first().click(); await page.waitForTimeout(600);
  const sels = page.locator('[role=dialog] select'); await sels.nth(0).selectOption({ index: 2 }); await sels.nth(1).selectOption({ index: 1 }); await sels.nth(2).selectOption("1"); await page.waitForTimeout(600); }
const m = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) out.push({ tag: el.tagName, visivel: el.clientHeight, total: el.scrollHeight, top: Math.round(el.getBoundingClientRect().top), scrollTop: el.scrollTop, w: el.clientWidth });
  }
  const dlg = document.querySelector("[role=dialog]");
  let rodape = null;
  if (dlg) { const bs = [...dlg.querySelectorAll("button")].filter(b => b.parentElement === dlg.lastElementChild); rodape = bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, x: Math.round(r.x), w: Math.round(r.width), direita: Math.round(r.right) }; }); rodape = { dialogo: dlg.getBoundingClientRect().toJSON(), botoes: rodape, scrollW: dlg.lastElementChild.scrollWidth, clientW: dlg.lastElementChild.clientWidth }; }
  const regua = [...document.querySelectorAll(".n")].filter(e => /^\d\d:00$/.test(e.textContent.trim())).map(e => ({ h: e.textContent.trim(), y: Math.round(e.getBoundingClientRect().top) })).filter(x => x.y > 0 && x.y < innerHeight);
  const blocos = [...document.querySelectorAll('[role=button][aria-label]')].map(e => { const r = e.getBoundingClientRect(); return { l: e.getAttribute("aria-label").slice(0, 40), y: Math.round(r.top), h: Math.round(r.height), x: Math.round(r.x), w: Math.round(r.width) }; }).slice(0, 40);
  const bloqueios = [...document.querySelectorAll('[role=button][aria-label]')].filter(e => /Almoço com a Carla/.test(e.getAttribute("aria-label"))).length;
  const vagos = [...document.querySelectorAll('[aria-label^="Marcar atendimento"]')].map(e => e.getAttribute("aria-label").split(" com ").pop());
  const vagosPorPessoa = vagos.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, horasVisiveis: regua, rodape, blocos, bloqueiosAlmoco: bloqueios, vagosPorPessoa };
});
m.getsAgenda = gets;
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: saida, fullPage: full });
await browser.close();
