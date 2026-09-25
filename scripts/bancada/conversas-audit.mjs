// conversas-audit.mjs — fotografa Conversas com 30 conversas falsas (interceptadas no navegador).
// Nada sai do navegador: GET e POST de /api/conversas são respondidos aqui.
import { chromium, pastaDeFotos } from "./_comum.mjs";

const OUT = pastaDeFotos("conversas");

const nomes = ["Mariana Albuquerque de Souza Figueiredo", "João Pedro", "Carla Guth", "Rafael Mendes", "Beatriz Lima", "5511987654321", "Lucas Oliveira", "Fernanda Castro", "Thiago Rocha", "Juliana Prado", "Pedro Henrique", "Aline Martins", "Gustavo Nunes", "Camila Ribeiro", "Diego Alves", "Larissa Teixeira", "Bruno Costa", "Patrícia Gomes", "Renato Dias", "Vanessa Moreira", "Felipe Araújo", "Natália Freitas", "Rodrigo Barros", "Isabela Cardoso", "André Pinto", "Sofia Ramos", "Marcelo Duarte", "Tatiane Lopes", "Eduardo Vieira", "Priscila Farias"];
const estados = ["espera", "voce", "maisa", "maisa", "ok", "espera", "maisa", "ok", "maisa", "espera"];
const agora = Date.parse("2026-09-24T14:00:00-03:00");
const conversas = nomes.map((nome, i) => {
  const id = String(10000000 + i * 1111);
  const em = new Date(agora - i * 7 * 3600e3).toISOString(); // espalha por ~9 dias
  const e = estados[i % estados.length];
  const ultima = e === "espera"
    ? { de: "cliente", txt: "Oi, consigo remarcar pra quinta de manhã? Surgiu um imprevisto aqui", em }
    : e === "voce" ? { de: "voce", txt: "Claro, te encaixo às 10h", em } : { de: "bot", txt: "Perfeito! Seu horário está confirmado para amanhã às 15h.", em };
  return { id, nome, telefone: i === 3 ? "" : `55119${id}`, atualizadaEm: em, estado: e, ultima };
});

const thread = [
  { de: "cliente", txt: "Boa tarde! Queria marcar uma sessão", em: "2026-09-21T15:02:00-03:00" },
  { de: "bot", txt: "Boa tarde! Claro. Tenho terça às 14h ou quarta às 10h. Qual prefere?", em: "2026-09-21T15:02:20-03:00" },
  { de: "cliente", txt: "Terça às 14h", em: "2026-09-21T15:05:00-03:00" },
  { de: "bot", txt: "Marcado: terça, 22/09, às 14h. Te mando um lembrete 3h antes.", em: "2026-09-21T15:05:10-03:00" },
  { de: "cliente", txt: "Obrigada!", em: "2026-09-21T15:06:00-03:00" },
  { de: "bot", txt: "Lembrete: sua sessão é hoje às 14h. Responda SIM para confirmar.", em: "2026-09-22T11:00:00-03:00" },
  { de: "cliente", txt: "SIM", em: "2026-09-22T11:20:00-03:00" },
  { de: "cliente", txt: "Oi, consigo remarcar pra quinta de manhã? Surgiu um imprevisto aqui no trabalho e não vou conseguir sair a tempo. Se não der, pode ser sexta à tarde também, qualquer horário depois das 15h.", em: "2026-09-24T13:40:00-03:00" },
  { de: "bot", txt: "Vou verificar com a profissional e já te retorno.", em: "2026-09-24T13:40:30-03:00" },
  { de: "cliente", txt: "Ok, fico no aguardo", em: "2026-09-24T13:45:00-03:00" },
];

const alvo = process.argv[2] || "all";

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function abrir(vp, estadoForcado) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const lista = conversas.map((c, i) => (i === 0 && estadoForcado ? { ...c, estado: estadoForcado } : c));
  await page.route("**/api/conversas**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") return route.fulfill({ json: { ok: true, status: "ok" } });
    const u = new URL(req.url());
    const tel = u.searchParams.get("telefone");
    if (tel) {
      const c = lista.find((x) => x.id === tel) ?? lista[0];
      return route.fulfill({ json: { ok: true, status: "ok", conversa: c, msgs: c.id === lista[0].id ? thread : thread.slice(0, 4) } });
    }
    return route.fulfill({ json: { ok: true, status: "ok", conversas: lista } });
  });
  await page.goto("http://localhost:3200/?tela=conversas", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  return page;
}

async function medir(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
        out.push({ tag: el.tagName, visivel: el.clientHeight, total: el.scrollHeight });
      }
    }
    const linhas = [...document.querySelectorAll('button[aria-current]')];
    const linhaH = linhas[0]?.getBoundingClientRect().height;
    const nome = [...document.querySelectorAll("div")].find((d) => d.textContent === "Mariana Albuquerque de Souza Figueiredo" && d.children.length === 0);
    const campo = document.querySelector('input[aria-label="Mensagem"]');
    const btns = [...document.querySelectorAll("button")].filter((b) => /Assumir|Devolver|Reabrir/.test(b.textContent || ""));
    return {
      viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out,
      linhas: linhas.length, linhaH,
      nomeLargura: nome?.getBoundingClientRect().width,
      campo: campo && { top: campo.getBoundingClientRect().top, bottom: campo.getBoundingClientRect().bottom, w: campo.getBoundingClientRect().width, placeholder: campo.placeholder, disabled: campo.disabled },
      botaoPosse: btns.map((b) => ({ txt: b.textContent, w: b.getBoundingClientRect().width })),
    };
  });
}

const casos = [
  ["desktop-cheio-espera", { width: 1440, height: 900 }, undefined, false],
  ["desktop-cheio-voce", { width: 1440, height: 900 }, "voce", false],
  ["desktop-1280", { width: 1280, height: 800 }, undefined, false],
  ["mobile-lista-cheia", { width: 390, height: 844 }, undefined, false],
  ["mobile-thread-espera", { width: 390, height: 844 }, undefined, true],
  ["mobile-thread-voce", { width: 390, height: 844 }, "voce", true],
  ["mobile375-thread-voce", { width: 375, height: 667 }, "voce", true],
];

for (const [nome, vp, est, abreThread] of casos) {
  if (alvo !== "all" && alvo !== nome) continue;
  const page = await abrir(vp, est);
  if (abreThread) {
    await page.locator('button[aria-current]').first().click();
    await page.waitForTimeout(900);
  }
  console.log(nome, JSON.stringify(await medir(page)));
  await page.screenshot({ path: `${OUT}/${nome}.png` });
  await page.close();
}

// `cabecalho` (1B.6): o nome da thread nos quatro estados, a 375 e a 390. Pedido: ≥ 180px.
if (alvo === "cabecalho") {
  for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    for (const est of ["espera", "voce", "maisa", "ok"]) {
      const page = await abrir(vp, est);
      await page.locator('button[aria-current]').first().click();
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => { const n = document.querySelector("[data-nome-da-conversa]"); const r = n?.getBoundingClientRect(); return { nome: r && Math.round(r.width), linhas: r && Math.round(r.height / 20), posse: [...document.querySelectorAll("button")].filter((b) => /^(Assumir|Devolver à MAISA|Reabrir)$/.test(b.textContent.trim())).map((b) => Math.round(b.getBoundingClientRect().top)) }; });
      console.log(`cabecalho ${vp.width} ${est}`, JSON.stringify(m));
      if (est === "voce") await page.screenshot({ path: `${OUT}/cabecalho-${vp.width}-${est}.png` });
      await page.close();
    }
  }
}

// `whatsapp` (1B.7): numa conversa que a MAISA conduz, ⋯ → "Abrir no WhatsApp". Registra a ordem
// entre o POST `assumir` e o `window.open` (interceptado: nada abre de verdade).
if (alvo === "whatsapp") {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await abrir(vp, "maisa");
    const ordem = [];
    await page.exposeFunction("__abriu", (url) => ordem.push(`open ${url}`));
    await page.evaluate(() => { window.open = (u) => { window.__abriu(String(u)); return null; }; });
    page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/conversas")) ordem.push(`POST ${r.postData()}`); });
    await page.locator('button[aria-current]').first().click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/whatsapp-menu-${vp.width}.png` });
    await page.getByRole("menuitem", { name: "Abrir no WhatsApp" }).click();
    await page.waitForTimeout(1200);
    console.log(`whatsapp ${vp.width}`, JSON.stringify(ordem));
    await page.close();
  }
}

// semNumero: abrir a conversa 4 (Rafael, sem telefone), nas duas larguras (1B.8)
if (alvo === "all" || alvo === "semnumero") {
  for (const vp of [{ width: 390, height: 844 }]) {
    const page = await abrir(vp);
    await page.locator('button[aria-current]').nth(3).click();
    await page.waitForTimeout(900);
    console.log(`semnumero ${vp.width}`, JSON.stringify(await page.evaluate(() => ({ waVazio: document.querySelectorAll('a[href="https://wa.me/"]').length, waQualquer: document.querySelectorAll('a[href^="https://wa.me"]').length, incompleto: document.body.innerText.includes("Número incompleto"), composer: !!document.querySelector('input[aria-label="Mensagem"]'), linha: document.body.innerText.includes("Procure o contato no seu WhatsApp") }))));
    await page.screenshot({ path: `${OUT}/sem-numero-${vp.width}.png` });
    await page.close();
  }
  const page = await abrir({ width: 1440, height: 900 });
  // `main`: no desktop o item ativo do rail também tem `aria-current`, e contava como a 1ª linha.
  await page.locator('main button[aria-current]').nth(3).click();
  await page.waitForTimeout(900);
  const href = await page.evaluate(() => ({ nome: document.querySelector("[data-nome-da-conversa]")?.textContent, waVazio: document.querySelectorAll('a[href="https://wa.me/"]').length, incompleto: document.body.innerText.includes("Número incompleto"), composer: !!document.querySelector('input[aria-label="Mensagem"]'), linha: document.body.innerText.includes("Procure o contato no seu WhatsApp") }));
  console.log("semnumero 1440", JSON.stringify(href), JSON.stringify(await medir(page)));
  await page.screenshot({ path: `${OUT}/desktop-sem-numero.png` });
  // filtro Esperando
  await page.getByRole("tab", { name: "Esperando" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-aba-esperando.png` });
  await page.close();
}
await browser.close();
