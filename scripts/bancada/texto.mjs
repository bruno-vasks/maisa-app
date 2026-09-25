// texto.mjs — o que uma tela DIZ, contado. Para critérios de copy ("nenhum X", "diz Y").
//
// uso: node texto.mjs <tela> <saida-sem-ext> [desktop|mobile] [--clicar=<texto>]... [--procura=<re>]... [--espera=1500]
//
// Abre `?tela=<tela>` no demo (:3200), clica em cada `--clicar` na ordem (por texto visível),
// e para cada `--procura` (expressão regular, sem barras) diz quantas vezes aparece no texto
// visível da página inteira, rail e gaveta incluídos. Lista também os `href` de `wa.me`.
import { chromium } from "./_comum.mjs";

const [, , tela, saida, modo = "desktop", ...flags] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const lista = (k) => flags.filter((f) => f.startsWith(`--${k}=`)).map((f) => f.slice(k.length + 3));
const espera = Number(lista("espera")[0] ?? 1500);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(espera);
for (const c of lista("clicar")) {
  // Por texto visível, ou pelo nome acessível (o "＋" do celular só tem `aria-label`).
  await page.getByText(c, { exact: false }).or(page.getByRole("button", { name: c, exact: true })).first().click();
  await page.waitForTimeout(800);
}
const r = await page.evaluate((procuras) => {
  const texto = document.body.innerText;
  return {
    contagens: Object.fromEntries(procuras.map((p) => [p, (texto.match(new RegExp(p, "gi")) || []).length])),
    wa: [...document.querySelectorAll('a[href*="wa.me"]')].map((a) => a.getAttribute("href")),
  };
}, lista("procura"));
console.log(JSON.stringify(r));
await page.screenshot({ path: `${saida}.png` });
await browser.close();
