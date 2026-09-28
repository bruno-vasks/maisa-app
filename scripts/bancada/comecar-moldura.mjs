// comecar-moldura.mjs — o critério de T1 no wizard, etapa por etapa (2.41 e a correção da Onda 1).
//
// uso: node comecar-moldura.mjs [--pasta=<dir>] [--modo=desktop|mobile|ambos]
//   --pasta   fotografa cada etapa em <dir>/<modo>-<etapa>.png
//
// Abre o `/comecar` do demo (que retoma no catálogo), mede, e anda pelas etapas com "Pular por
// agora". A etapa 1 (negócio) é vista com `/api/ativacao` respondendo 409, que é quem ainda não
// tem negócio. Por etapa: documento/viewport, regiões que rolam, sonda de corte, e o primário
// (o botão com fundo `--primary`) inteiro dentro da janela sem rolar.
// Flags nomeadas de propósito: posicional antes de flag rodava o padrão em silêncio (regressão 7).
import { chromium, medirPagina, VIEWPORTS } from "./_comum.mjs";

const flags = process.argv.slice(2);
const pasta = flags.find((f) => f.startsWith("--pasta="))?.slice(8) ?? "";
const modoArg = flags.find((f) => f.startsWith("--modo="))?.slice(7) ?? "ambos";
const desconhecidas = flags.filter((f) => !/^--(pasta|modo)=/.test(f));
if (desconhecidas.length) { console.error(`flag desconhecida: ${desconhecidas.join(" ")}`); process.exit(2); }

const MODOS = modoArg === "ambos" ? ["desktop", "mobile"] : [modoArg];
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function medir(page, modo, etapa) {
  const m = await medirPagina(page, modo);
  const prim = await page.evaluate(() => {
    const sonda = document.createElement("span");
    sonda.style.background = "var(--primary)";
    document.body.appendChild(sonda);
    const cor = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    return [...document.querySelectorAll("button, a[href]")]
      .filter((b) => getComputedStyle(b).backgroundColor === cor)
      .map((b) => { const r = b.getBoundingClientRect(); return { t: b.innerText.trim().replace(/\s+/g, " ").slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), dentro: r.top >= 0 && r.bottom <= innerHeight }; });
  });
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  const ok = m.documento === m.viewport && m.rolaveis.length <= 1 && m.corte.length === 0 && m.foraDaTela.length === 0 && prim.every((p) => p.dentro);
  console.log(JSON.stringify({ ok, modo, etapa, h1, doc: `${m.documento}/${m.viewport}`, rola: m.rolaveis.map((r) => `${r.tag} ${r.visivel}/${r.total}`), corte: m.corte, fora: m.foraDaTela, primarios: prim }));
  if (pasta) await page.screenshot({ path: `${pasta}/${modo}-${etapa}.png` });
}

for (const modo of MODOS) {
  // etapa 1: quem ainda não tem negócio
  {
    const page = await browser.newPage({ viewport: VIEWPORTS[modo], deviceScaleFactor: 1 });
    await page.route("**/api/ativacao", (r) => r.fulfill({ status: 409, json: { ok: false, status: "sem_negocio" } }));
    await page.goto("http://localhost:3200/comecar", { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1000);
    await medir(page, modo, "negocio");
    await page.close();
  }
  // retomada do demo: catálogo, e daí em diante pulando
  const page = await browser.newPage({ viewport: VIEWPORTS[modo], deviceScaleFactor: 1 });
  await page.goto("http://localhost:3200/comecar", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  const vistas = new Set();
  for (let i = 0; i < 5; i++) {
    const h1 = await page.locator("h1").first().innerText().catch(() => "?");
    if (vistas.has(h1)) break;
    vistas.add(h1);
    await medir(page, modo, `passo${i + 2}`);
    const pular = page.getByRole("button", { name: "Pular por agora" });
    if (!(await pular.count())) break;
    await pular.click();
    await page.waitForTimeout(1200);
  }
  await page.close();
}
await browser.close();
