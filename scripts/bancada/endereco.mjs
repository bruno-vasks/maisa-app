// endereco.mjs — T9: a URL espelha o lugar e o F5 volta para ele (1C.3).
// uso: node scripts/bancada/endereco.mjs [desktop|mobile]
// Para cada tela: abre pela URL, confere o título, F5, confere de novo. Depois: lixo cai no Fluxo,
// o apelido `faturamento` abre o Fiscal, um recorte (`?secao=`) sobrevive ao F5, navegar pela casca
// reescreve a URL, uma gaveta aberta volta aberta, e voltar do navegador segue a URL.
import { chromium, VIEWPORTS } from "./_comum.mjs";

const modo = process.argv[2] === "mobile" ? "mobile" : "desktop";
const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "fiscal", "equipe", "servicos", "assistente", "contatos", "mais"];
const B = "http://localhost:3200";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: VIEWPORTS[modo], deviceScaleFactor: 1 });
const titulo = () => page.evaluate(() => (document.querySelector("header h1")?.innerText ?? "").trim());
const busca = () => page.evaluate(() => location.search);
const espera = (ms = 1200) => page.waitForTimeout(ms);
const out = [];

for (const t of TELAS) {
  await page.goto(`${B}/?tela=${t}`, { waitUntil: "networkidle", timeout: 90000 }); await espera();
  const antes = await titulo(); const url1 = await busca();
  await page.reload({ waitUntil: "networkidle" }); await espera();
  out.push({ caso: `F5 em ${t}`, antes, depois: await titulo(), url: url1, urlDepois: await busca() });
}

await page.goto(`${B}/?tela=xyz`, { waitUntil: "networkidle" }); await espera();
out.push({ caso: "?tela=xyz", titulo: await titulo(), url: await busca() });

await page.goto(`${B}/?tela=faturamento`, { waitUntil: "networkidle" }); await espera();
out.push({ caso: "?tela=faturamento", titulo: await titulo(), url: await busca() });

await page.goto(`${B}/?tela=fiscal&secao=autorizacao`, { waitUntil: "networkidle" }); await espera();
const u1 = await busca(); await page.reload({ waitUntil: "networkidle" }); await espera();
out.push({ caso: "recorte + F5", url: u1, urlDepois: await busca(), titulo: await titulo() });

// Navegar pela casca reescreve a URL.
await page.goto(`${B}/`, { waitUntil: "networkidle" }); await espera();
const irPelaCasca = async (rotulo) => {
  const l = page.getByRole(modo === "mobile" ? "button" : "button", { name: new RegExp(`^${rotulo}`) }).first();
  if (await l.count()) { await l.click(); await espera(800); return true; }
  return false;
};
const clicou = await irPelaCasca("Agenda");
out.push({ caso: "clicar Agenda na casca", clicou, url: await busca(), titulo: await titulo() });
await page.reload({ waitUntil: "networkidle" }); await espera();
out.push({ caso: "… e F5", url: await busca(), titulo: await titulo() });

// Gaveta aberta sobrevive ao F5: primeiro cliente da lista.
await page.goto(`${B}/?tela=clientes`, { waitUntil: "networkidle" }); await espera();
const qual = page.getByRole("button", { name: /^Mariana Alves,/ }).first();
await qual.click(); await espera(800);
const uG = await busca(); const dialogo = await page.locator("[role=dialog]").count();
await page.reload({ waitUntil: "networkidle" }); await espera(1800);
out.push({ caso: "gaveta + F5", url: uG, gavetaAntes: dialogo, gavetaDepois: await page.locator("[role=dialog]").count(), urlDepois: await busca() });

// Filtro de Clientes sobrevive ao F5.
await page.goto(`${B}/?tela=clientes`, { waitUntil: "networkidle" }); await espera();
await page.getByRole("button", { name: "Todos", exact: true }).first().click(); await espera(500);
const uF = await busca(); await page.reload({ waitUntil: "networkidle" }); await espera();
out.push({ caso: "filtro + F5", url: uF, urlDepois: await busca(), ligado: await page.getByRole("button", { name: "Todos", exact: true }).first().getAttribute("aria-pressed") });

// Voltar do navegador segue a URL (entrada empurrada à mão).
await page.goto(`${B}/?tela=agenda`, { waitUntil: "networkidle" }); await espera();
await page.evaluate(() => { history.pushState({}, "", "/?tela=servicos"); dispatchEvent(new PopStateEvent("popstate")); }); await espera(600);
const tS = await titulo();
await page.goBack(); await espera(800);
out.push({ caso: "popstate", depoisDoPush: tS, depoisDoVoltar: await titulo(), url: await busca() });

for (const o of out) console.log(JSON.stringify(o));
await browser.close();
