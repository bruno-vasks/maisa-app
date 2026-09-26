// ajustes-moldura.mjs — os Ajustes em recortes (1C.11 a 1C.13): linha de status, navegação,
// recorte que rola e preview derivado.
//
// uso: node ajustes-moldura.mjs <saida-prefixo> [desktop|mobile] [cheio|desconectado] [--secao=horarios] [--sabado]
//
// `cheio`: canal conectado (5511994294906), modo pessoal, três respostas prontas, ajustes e horário
// lidos (as rotas do demo respondem o placeholder; aqui respondem como o servidor). `desconectado`:
// idem com o canal caído. `--secao=` abre o recorte pela URL. `--sabado` muda o sábado para 10:00 a
// 14:00 pela tela e mede a fala do preview antes e depois, no mesmo quadro (requestAnimationFrame).
// Imprime a régua do `medir.mjs` mais: a linha de status, o recorte (altura visível), os 7 dias
// dentro do recorte, "De quem é" no DOM, as falas do preview e, no celular, os retângulos do
// título, do número e dos botões da faixa do WhatsApp (sobreposição).
import { chromium, medirPagina } from "./_comum.mjs";
const [, , pre = "ajustes-moldura", modo = "desktop", cenario = "cheio", ...flags] = process.argv;
const val = (k, d) => { const f = flags.find((x) => x.startsWith(`--${k}=`)); return f ? f.split("=")[1] : d; };
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const conectado = cenario !== "desconectado";
const semana = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, aberto: dow <= 5, de: dow <= 5 ? (dow === 5 ? "09:00" : "08:00") : null, ate: dow <= 5 ? (dow === 5 ? "13:00" : "20:00") : null }));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
await page.route("**/api/contatos*", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ok: true, status: "ok", modo: "pessoal", contatos: [] } }) : r.fulfill({ json: { ok: true } }));
await page.route("**/api/canal*", (r) => r.request().method() === "GET"
  ? r.fulfill({ json: { ok: true, faltando: [], canal: { status: conectado ? "conectado" : "desconectado", instancia: "x", numero: conectado ? "5511994294906" : null, conectadoEm: "2026-09-01", telefoneDono: null } } })
  : r.fulfill({ json: { ok: false, info: "bancada" } }));
await page.route("**/api/faqs*", (r) => r.request().method() === "GET"
  ? r.fulfill({ json: { ok: true, faqs: [
      { id: "1", pergunta: "Vocês têm estacionamento?", resposta: "Temos convênio com o estacionamento da esquina, 2h grátis.", usos: 12 },
      { id: "2", pergunta: "Aceitam cartão?", resposta: "Aceitamos débito, crédito e Pix.", usos: 4 },
      { id: "3", pergunta: "Qual a política de atraso?", resposta: "Toleramos 15 minutos. Depois disso, a sessão é reduzida.", usos: 0 },
    ] } })
  : r.fulfill({ json: { ok: true } }));
await page.route("**/api/horarios*", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ok: true, semana } }) : r.fulfill({ json: { ok: true, semana: JSON.parse(r.request().postData() || "{}").semana ?? semana } }));
await page.route("**/api/assistente*", (r) => r.request().method() === "GET"
  ? r.fulfill({ json: { ok: true, assistente: { nome: "Lia", tom: "profissional", saudacao: "Olá!", ativa: true, lembreteHoras: 3 }, cfg: { confirmar: true, lembrete: true, remarcar: true, encaminhar: true, precoCatalogo: true, pix: false, encaixe: false, avisarRecibo: false } } })
  : r.fulfill({ json: { ok: true } }));
const secao = val("secao", null);
await page.goto(`http://localhost:3200/?tela=assistente${secao ? `&secao=${secao}` : ""}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
const medir = () => page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width) }; };
  const recorte = document.querySelector("main section[aria-label]:not([aria-label='De quem é esse número'])");
  const dias = [...document.querySelectorAll('[role="switch"][aria-label$="atende"]')].map((d) => d.getBoundingClientRect());
  const rr = recorte?.getBoundingClientRect();
  const diasVisiveis = rr ? dias.filter((d) => d.top >= rr.top && d.bottom <= rr.bottom).length : dias.filter((d) => d.top >= 0 && d.bottom <= innerHeight).length;
  const falas = [...document.querySelectorAll(".m-bubble")].map((b) => b.childNodes[0]?.textContent);
  const canal = document.querySelector(".m-canal");
  const tit = canal?.querySelector(".m-canal-linha > span:nth-child(2)");
  const botoes = canal ? [...canal.querySelectorAll(".m-canal-acoes button")].map(r) : [];
  const t = r(tit);
  const sobrepoe = t ? botoes.filter((b) => !(b.left >= t.right || b.right <= t.left || b.top >= t.bottom || b.bottom <= t.top)).length : null;
  return {
    status: r(document.querySelector('main [role="switch"][aria-label="MAISA respondendo no WhatsApp"]')?.closest("div")),
    recorte: recorte ? { titulo: recorte.getAttribute("aria-label"), ...r(recorte), visivel: recorte.clientHeight, total: recorte.scrollHeight } : null,
    navAtual: document.querySelector('nav[aria-label="Seções dos ajustes"] [aria-current]')?.textContent ?? null,
    dias: dias.length, diasVisiveis,
    deQuemNoDOM: !!document.querySelector('section[aria-label="De quem é esse número"]'),
    falas,
    canal: canal ? { titulo: tit?.innerText, tituloRet: t, botoes, sobrepoe } : null,
    url: location.search,
  };
});
const m = await medirPagina(page, modo);
// `SONDA=1`: quem corta, com o estilo inline dele e o do pai.
if (process.env.SONDA) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); return (cs.overflowY === "hidden" || cs.overflowY === "clip") && el.clientHeight >= 40 && el.scrollHeight > el.clientHeight + 1; }).map((el) => `${el.tagName}.${el.className} ${el.getAttribute("style")?.slice(0, 120)} | filhos: ${[...el.children].map((c) => `${c.tagName}.${c.className}:${Math.round(c.getBoundingClientRect().height)}`).join(", ")}`).join("\n")));
console.log(JSON.stringify({ modo, cenario, documento: m.documento, viewport: m.viewport, larguraDoc: m.larguraDoc, rolaveis: m.rolaveis, corte: m.corte, foraDaTela: m.foraDaTela, primariosNaDobra: m.primariosNaDobra, alvosPequenos: m.alvosPequenos, travessoes: m.travessoes, ...(await medir()) }, null, 1));
await page.screenshot({ path: `${pre}-${modo}-${cenario}${secao ? `-${secao}` : ""}.png` });
if (flags.includes("--sabado")) {
  const r = await page.evaluate(async () => {
    const fala = () => [...document.querySelectorAll(".m-bubble")].map((b) => b.childNodes[0]?.textContent).join(" | ");
    const antes = fala();
    const de = document.querySelector('input[aria-label="Sábado — abre às"]');
    const ate = document.querySelector('input[aria-label="Sábado — fecha às"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(de, "10:00"); de.dispatchEvent(new Event("input", { bubbles: true }));
    set.call(ate, "14:00"); ate.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((ok) => requestAnimationFrame(() => ok()));
    return { antes, depois: fala() };
  });
  console.log("sábado:", JSON.stringify(r));
  await page.screenshot({ path: `${pre}-${modo}-${cenario}-sabado.png` });
}
await browser.close();
