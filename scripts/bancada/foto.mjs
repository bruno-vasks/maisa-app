// foto.mjs — fotografa uma tela do app DEMO (porta 3200, sem Supabase, nada vai para produção).
// uso: node foto.mjs <tela> <saida.png> [desktop|mobile] [--full] [--medir]
//   <tela>: id do ?tela= (fluxo, agenda, conversas, clientes, faturamento, maisa, equipe, servicos, mais, contatos, fiscal…)
//           ou um caminho começando com "/" (ex.: /login, /comecar)
//   --full  : fotografa a página inteira (mostra o quanto rola)
//   --medir : imprime JSON com altura do viewport vs. altura rolável de cada contêiner que rola
import { chromium, pastaDeFotos } from "./_comum.mjs";

const [, , tela, saida, modo = "desktop", ...flags] = process.argv;
const full = flags.includes("--full");
const medir = flags.includes("--medir");
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const url = tela.startsWith("/") ? `http://localhost:3200${tela}` : `http://localhost:3200/?tela=${tela}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
if (medir) {
  const m = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
        out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), visivel: el.clientHeight, total: el.scrollHeight });
      }
    }
    return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out };
  });
  console.log(JSON.stringify(m, null, 2));
}
await page.screenshot({ path: saida, fullPage: full });
await browser.close();
console.log("ok", saida);
