// equipe-criar.mjs — adicionar e renomear profissional pela tela (1B.12), e se sobrevive a F5.
// uso: node equipe-criar.mjs [desktop|mobile] [pasta-de-fotos] [--nome=Ana Teste]
//
// ⚠️ GRAVA NO DEMO (o repositório em memória do `next dev` de :3200, sem banco), e não há como
// apagar profissional: quem rodar deixa a pessoa na equipe do demo até o dev reiniciar. Por isso
// ela nasce com o nome de `--nome` e termina PAUSADA (não recebe agendamento no demo).
import { chromium, posicionais, bandeiras } from "./_comum.mjs";
const [modo = "desktop", pasta] = posicionais(); const flags = bandeiras();
const nome = (flags.find((f) => f.startsWith("--nome=")) || "--nome=Ana Teste").split("=")[1];
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const puts = [];
page.on("request", (r) => { if (r.url().includes("/api/equipe") && r.method() === "PUT") puts.push(r.postData()); });
const ir = async () => { await page.goto("http://localhost:3200/?tela=equipe", { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(1000); };
const naLista = () => page.evaluate((n) => document.querySelector("main").innerText.includes(n), nome);
await ir();
await page.getByRole("button", { name: "Adicionar profissional" }).first().click(); await page.waitForTimeout(400);
await page.getByLabel("Nome").first().fill(nome);
await page.getByLabel("O que faz (opcional)").fill("Atendimento geral");
if (pasta) await page.screenshot({ path: `${pasta}/equipe-form-${modo}.png` });
await page.getByRole("button", { name: "Adicionar", exact: true }).click(); await page.waitForTimeout(1200);
const out = { vp, fichaAberta: await page.locator(`[role=dialog][aria-label="${nome}"]`).count(), naListaAntesDoF5: await naLista() };
await ir();
out.depoisDoF5 = await naLista();
// renomear pela ficha
const novo = `${nome} Souza`;
await page.getByText(nome, { exact: true }).first().click(); await page.waitForTimeout(600);
const campo = page.locator("[role=dialog] input").first();
await campo.fill(novo); await campo.press("Tab"); await page.waitForTimeout(1200);
if (pasta) await page.screenshot({ path: `${pasta}/equipe-ficha-${modo}.png` });
// pausa, para não receber agendamento no demo
await page.locator("[role=dialog] [role=switch]").first().click().catch(() => {}); await page.waitForTimeout(800);
await ir();
out.renomeadoDepoisDoF5 = await page.evaluate((n) => document.querySelector("main").innerText.includes(n), novo);
out.puts = puts;
console.log(JSON.stringify(out, null, 1));
await browser.close();
