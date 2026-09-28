// titulo-celular.mjs — o título do cabeçalho do celular cabe inteiro nas 11 telas?
// (regressão 1 da verificação da Onda 1: "Quem a MA…" a 390).
//
// uso: node titulo-celular.mjs [--canal=real|desconectado|conectado] [--largura=390] [--pasta=<dir>]
//   --canal   `desconectado` é o pior caso ("Sem WhatsApp" é o status curto mais largo)
// Uma linha por tela: o texto, a largura da caixa, a largura do texto e `cabe`.
import { chromium } from "./_comum.mjs";

const flags = process.argv.slice(2);
const opt = (k, pad) => flags.find((f) => f.startsWith(`--${k}=`))?.slice(k.length + 3) ?? pad;
const desconhecidas = flags.filter((f) => !/^--(canal|largura|pasta)=/.test(f));
if (desconhecidas.length) { console.error(`flag desconhecida: ${desconhecidas.join(" ")}`); process.exit(2); }
const canal = opt("canal", "desconectado");
const largura = Number(opt("largura", "390"));
const pasta = opt("pasta", "");

const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "equipe", "servicos", "assistente", "contatos", "mais", "fiscal"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
let falhas = 0;
for (const t of TELAS) {
  const page = await browser.newPage({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 1 });
  if (canal !== "real") {
    await page.route("**/api/canal", (r) => r.request().method() !== "GET" ? r.continue() : r.fulfill({ json: {
      ok: true, status: "ok", faltando: [],
      canal: { status: canal, instancia: "demo", numero: canal === "conectado" ? "5511994294906" : null, conectadoEm: null, telefoneDono: null },
    } }));
  }
  await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const h = document.querySelector("header h1");
    if (!h) return null;
    const status = [...document.querySelectorAll("header button")].find((b) => /^MAISA:/.test(b.getAttribute("aria-label") ?? ""));
    return { texto: h.innerText, caixa: h.clientWidth, texto_px: h.scrollWidth, status: status?.innerText.trim() ?? "(conferindo)" };
  });
  const cabe = !!r && r.texto_px <= r.caixa;
  if (!cabe) falhas++;
  console.log(JSON.stringify({ t, cabe, ...r }));
  if (pasta) await page.screenshot({ path: `${pasta}/titulo-${t}.png`, clip: { x: 0, y: 0, width: largura, height: 120 } });
  await page.close();
}
await browser.close();
console.log(falhas ? `${falhas} título(s) cortado(s)` : "todos cabem");
