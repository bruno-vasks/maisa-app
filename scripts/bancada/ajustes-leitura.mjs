// ajustes-leitura.mjs — Ajustes da MAISA com as leituras atrasadas (1A.7 do backlog do front).
//
// uso: node ajustes-leitura.mjs <saida-prefixo> [desktop|mobile] [--atraso=2000] [--erro]
//
// Segura `/api/assistente`, `/api/horarios`, `/api/cadastro` e `/api/canal` pelo atraso (ou os
// faz falhar com `--erro`), abre as cinco seções uma a uma e, a 150/600/1200 ms e depois,
// conta os campos editáveis (input, textarea, select e botões de tom/dia/toggle habilitados)
// DENTRO das seções, se algum deles mostra um valor do placeholder ("MAISA", "Seu Negócio",
// "08:00", "20:00") e se "Conectar WhatsApp" está na tela.
import { chromium } from "./_comum.mjs";

const [, , pre, modo = "desktop", ...flags] = process.argv;
const opt = (k, pad) => (flags.find((f) => f.startsWith(`--${k}=`)) ?? `=${pad}`).split("=")[1];
const atraso = Number(opt("atraso", "2000"));
const erro = flags.includes("--erro");
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const segura = async (r) => {
  if (r.request().method() !== "GET") return r.continue();
  await new Promise((x) => setTimeout(x, atraso));
  if (erro) return r.fulfill({ json: { ok: false, status: "erro", info: "Falha simulada." } });
  r.continue();
};
for (const rota of ["**/api/assistente", "**/api/horarios", "**/api/cadastro", "**/api/canal"]) await page.route(rota, segura);

const t0 = Date.now();
await page.goto("http://localhost:3200/?tela=assistente", { waitUntil: "domcontentloaded", timeout: 90000 });

async function amostra(rotulo) {
  const r = await page.evaluate(() => {
    const secoes = [...document.querySelectorAll("button[aria-expanded]")].map((b) => b.parentElement);
    const campos = secoes.flatMap((sec) => [...sec.querySelectorAll("input, textarea, select, button:not([aria-expanded])")])
      .filter((el) => !el.disabled && el.getBoundingClientRect().width > 0 && !/Tentar de novo/.test(el.innerText || ""));
    const valores = campos.map((el) => el.value ?? el.innerText ?? "").join(" | ");
    const placeholder = ["MAISA", "Seu Negócio", "08:00", "20:00"].filter((v) => valores.includes(v));
    return {
      campos: campos.length, placeholder,
      conectar: /Conectar( o)? WhatsApp/.test(document.body.innerText),
      ocupado: document.querySelectorAll("[aria-busy=true]").length,
      falhas: [...document.querySelectorAll("[role=status]")].map((e) => e.innerText.split("\n")[0]).slice(0, 6),
    };
  });
  console.log(`${rotulo.padEnd(8)} t=${String(Date.now() - t0).padStart(5)}ms  campos=${r.campos}  placeholder=${JSON.stringify(r.placeholder)}  conectar=${r.conectar}  aria-busy=${r.ocupado}  falhas=${JSON.stringify(r.falhas)}`);
}

// Abre todas as seções (o acordeão abre uma por vez: amostra depois de cada clique).
async function abrirTodas(rotulo) {
  const botoes = page.locator("button[aria-expanded]");
  const n = await botoes.count();
  for (let i = 0; i < n; i++) { await botoes.nth(i).click().catch(() => {}); await page.waitForTimeout(60); await amostra(`${rotulo}#${i}`); }
}

for (const ms of [150, 600, 1200]) {
  const falta = ms - (Date.now() - t0);
  if (falta > 0) await page.waitForTimeout(falta);
  await amostra(`${ms}ms`);
}
await abrirTodas("antes");
await page.waitForTimeout(Math.max(0, atraso + 1800 - (Date.now() - t0)));
await amostra("depois");
await abrirTodas("depois");
await page.screenshot({ path: `${pre}.png` });
await browser.close();
console.log("ok", pre);
