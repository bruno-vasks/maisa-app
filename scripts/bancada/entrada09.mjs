// entrada09.mjs: percorre o /comecar do DEMO com as rotas /api mockadas no navegador.
// Nada sai do navegador: page.route intercepta antes da rede. Só leitura do app demo.
import { chromium, pastaDeFotos } from "./_comum.mjs";

const OUT = pastaDeFotos("09-entrada");
const BASE = "http://localhost:3200";
const QR = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#000"/><rect x="20" y="20" width="160" height="160" fill="#fff"/><rect x="50" y="50" width="100" height="100" fill="#000"/></svg>').toString("base64");

const medir = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) out.push({ tag: el.tagName, visivel: el.clientHeight, total: el.scrollHeight });
  }
  const abaixo = [];
  for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top >= innerHeight) abaixo.push(`${el.tagName}:${(el.innerText || el.getAttribute("placeholder") || el.value || "").trim().slice(0, 40)}@${Math.round(r.top)}`);
  }
  const campos = document.querySelectorAll("input, select, textarea").length;
  const botoes = document.querySelectorAll("button, a[href]").length;
  const txt = document.body.innerText.replace(/\s+/g, " ").trim();
  return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, campos, botoes, caracteres: txt.length, travessoes: (txt.match(/—/g) || []).length, abaixoDaDobra: abaixo };
});

async function cenario(nome, modo, mocks, passos = async () => {}) {
  const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, isMobile: modo === "mobile", hasTouch: modo === "mobile" });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));
  for (const [padrao, fn] of Object.entries(mocks)) {
    await page.route(padrao, async (route) => {
      const r = await fn(route.request());
      if (r === undefined) return route.continue();
      return route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.body) });
    });
  }
  await page.goto(`${BASE}/comecar`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  await passos(page);
  await page.waitForTimeout(800);
  const m = await medir(page);
  await page.screenshot({ path: `${OUT}/${nome}-${modo}.png` });
  await page.screenshot({ path: `${OUT}/${nome}-${modo}-full.png`, fullPage: true });
  console.log(JSON.stringify({ nome, modo, ...m, erros }));
  await browser.close();
}

const ok = (body) => ({ status: 200, body: { ok: true, status: "ok", ...body } });
const assistente = (ativa) => () => ok({ assistente: { nome: "MAISA", ativa }, cfg: {} });
const ativacao = (feitos, st = 200) => () => (st === 409 ? { status: 409, body: { ok: false, status: "sem_negocio" } } : ok({ feitos, porcentagem: 0, completo: false }));

const cenarios = [
  ["e1-negocio", { "**/api/ativacao*": ativacao([], 409), "**/api/assistente*": assistente(true) }],
  ["e1-negocio-preenchido", { "**/api/ativacao*": ativacao([], 409), "**/api/assistente*": assistente(true) }, async (p) => {
    await p.fill("input", "Espaço Carla Guth");
    await p.getByText("Consultório ou clínica").click();
    await p.getByText("Ela conversa e marca sozinha").click();
  }],
  ["e2-catalogo", { "**/api/ativacao*": ativacao(["negocio_criado"]) }],
  ["e3-whatsapp", { "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado"]), "**/api/assistente*": assistente(true) }],
  ["e3-whatsapp-qr", {
    "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado"]), "**/api/assistente*": assistente(true),
    "**/api/canal": (req) => req.method() === "POST" ? ok({ pareamento: { status: "pareando", qrcode: QR, codigo: null } }) : ok({ canal: { status: "pareando" } }),
  }, async (p) => { const b = p.getByText("Gerar QR code"); if (await b.count()) await b.click(); }],
  ["e3-whatsapp-codigo", {
    "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado"]), "**/api/assistente*": assistente(true),
    "**/api/canal": (req) => req.method() === "POST" ? ok({ pareamento: { status: "pareando", qrcode: QR, codigo: "WZ4KQ7PD" } }) : ok({ canal: { status: "pareando" } }),
  }, async (p) => {
    const alt = p.getByText("Estou no celular", { exact: false }); if (await alt.count()) await alt.click();
    await p.fill('input[inputmode="tel"]', "11994294906");
    await p.getByText("Receber código").click();
    await p.waitForTimeout(400);
    const conf = p.locator("button", { hasText: /enviar/i }); if (await conf.count()) await conf.first().click();
  }],
  ["e4-sem-cerebro", { "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado"]), "**/api/assistente*": assistente(true), "**/api/canal": () => ok({ canal: { status: "conectado", numero: "5511994294906" } }) }],
  ["e4-falta-agenda", { "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado"]), "**/api/assistente*": assistente(true), "**/api/canal": () => ok({ canal: { status: "conectado", numero: "5511994294906" } }), "**/api/laboratorio": () => ok({ pronto: true, agenda: "google", exemplo: { servico: "Sessão individual", profissional: "Carla" } }) }],
  ["e4-conversa", {
    "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado", "agenda_conectada"]), "**/api/assistente*": assistente(true),
    "**/api/canal": () => ok({ canal: { status: "conectado", numero: "5511994294906" } }),
    "**/api/laboratorio": (req) => req.method() === "POST"
      ? ok({ bolhas: ["Oi! Aqui é a MAISA, assistente do Espaço Carla Guth.", "Tenho quinta às 15h ou sexta às 10h para a sessão individual. Qual fica melhor?"], trilha: [{ ferramenta: "oferecer_horarios", erro: false }] })
      : ok({ pronto: true, agenda: "google", exemplo: { servico: "Sessão individual", profissional: "Carla" } }),
  }, async (p) => { const c = p.locator("button").filter({ hasText: /\?|hor|marcar/i }).first(); if (await c.count()) await c.click(); await p.waitForTimeout(800); }],
  ["e5-fiscal", { "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado"]), "**/api/assistente*": assistente(false), "**/api/fiscal*": () => ok({ falta: ["cnpj"], provedorFaltando: [], config: {} }) }],
  ["e5-fiscal-ligar-agora", { "**/api/ativacao*": ativacao(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado"]), "**/api/assistente*": assistente(false), "**/api/fiscal*": () => ok({ falta: ["cnpj"], provedorFaltando: [], config: {} }) }, async (p) => { await p.getByText("Ligar agora").click(); await p.waitForTimeout(1500); }],
];

const so = process.argv[2];
for (const modo of ["desktop", "mobile"]) {
  for (const [nome, mocks, passos] of cenarios) {
    if (so && !nome.startsWith(so)) continue;
    try { await cenario(nome, modo, mocks, passos); } catch (e) { console.log(JSON.stringify({ nome, modo, falhou: String(e.message).slice(0, 300) })); }
  }
}
