// ajustes-gravacao.mjs — o sinal de gravação dos Ajustes (1A.8 do backlog do front).
//
// uso: node ajustes-gravacao.mjs <saida-prefixo> [desktop|mobile] [--falha] [--lento=800]
//
// Simula o WhatsApp conectado (senão o interruptor mestre fica desligado de propósito), muda o
// interruptor "MAISA respondendo no WhatsApp" e amostra a linha de status a cada 100ms: quando
// aparece "Salvando…", quando aparece "Salvo" e quando some. `--falha` faz o `PATCH
// /api/assistente` devolver `ok:false`; aí clica em "Tentar de novo" e conta os PATCH.
// `--lento` segura o PATCH (padrão 300ms) para o "Salvando…" ser visto.
//
// ⚠️ Sem `--falha` o PATCH vai de verdade para o demo (:3200, memória do servidor, sem banco),
// e o script desfaz a mudança no fim.
import { chromium } from "./_comum.mjs";

const [, , pre, modo = "desktop", ...flags] = process.argv;
const falha = flags.includes("--falha");
const lento = Number((flags.find((f) => f.startsWith("--lento=")) ?? "=300").split("=")[1]);
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
await page.route("**/api/canal", (r) => r.request().method() === "GET"
  ? r.fulfill({ json: { ok: true, faltando: [], canal: { status: "conectado", instancia: "x", numero: "5511994294906", conectadoEm: "2026-09-01", telefoneDono: null } } })
  : r.continue());
let patches = 0;
await page.route("**/api/assistente", async (r) => {
  if (r.request().method() !== "PATCH") return r.continue();
  patches++;
  await new Promise((x) => setTimeout(x, lento));
  if (falha) return r.fulfill({ json: { ok: false, status: "erro", info: "Falha simulada." } });
  r.continue();
});

await page.goto("http://localhost:3200/?tela=assistente", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
const chave = page.locator('button[role=switch][aria-label="MAISA respondendo no WhatsApp"]').first();
const linha = () => page.evaluate(() => {
  const sw = document.querySelector('button[role=switch][aria-label="MAISA respondendo no WhatsApp"]');
  const caixa = sw?.parentElement;
  const vivo = caixa?.querySelector("[aria-live]");
  const r = vivo?.getBoundingClientRect();
  const t = caixa?.getBoundingClientRect();
  return {
    texto: vivo?.innerText.replace(/\n/g, " ") ?? "",
    ligado: sw?.getAttribute("aria-checked"),
    caixa: t ? { w: Math.round(t.width), h: Math.round(t.height), right: Math.round(t.right) } : null,
    sinal: r ? { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) } : null,
    vw: innerWidth,
  };
});

async function acompanhar(rotulo, ms = 3200) {
  const t0 = Date.now();
  const marcos = [];
  let ultimo = null;
  let foto = false;
  while (Date.now() - t0 < ms) {
    const l = await linha();
    if (l.texto !== ultimo) { marcos.push(`${Date.now() - t0}ms "${l.texto}"`); ultimo = l.texto; }
    if (!foto && l.texto && !/Salvando/.test(l.texto)) { await page.screenshot({ path: `${pre}-${rotulo}.png` }); foto = true; console.log(rotulo, "medidas", JSON.stringify(l)); }
    await page.waitForTimeout(100);
  }
  console.log(rotulo, marcos.join("  →  "));
}

const antes = await linha();
console.log("inicial", JSON.stringify(antes));
await chave.click();
await acompanhar("mudou");
if (falha) {
  await page.getByRole("button", { name: "Tentar de novo" }).first().click();
  await acompanhar("tentou");
  console.log("PATCH enviados:", patches, " interruptor:", (await linha()).ligado);
} else {
  await chave.click();
  await page.waitForTimeout(1500);
  console.log("desfeito, PATCH enviados:", patches);
}
await browser.close();
