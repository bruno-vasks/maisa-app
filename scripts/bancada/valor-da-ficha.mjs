// valor-da-ficha.mjs — o valor digitado na ficha chega ao "Marcar horário"? (01/10/2026, a Regina)
// uso: node valor-da-ficha.mjs [--banco=ok|sem030] [--espera=0|2500] [pasta-de-fotos]
//
// A Regina digitou o valor da sessão na ficha de uma paciente, tocou "Marcar horário" e o
// "Valor desta sessão" veio vazio. O demo não grava (sem sessão, toda escrita é 401), então o
// PUT de `/api/clientes` é respondido aqui, de dois jeitos:
//   --banco=ok      grava, como depois da 030 (devolve o cliente com o valor)
//   --banco=sem030  recusa, como o banco de produção até a 030 rodar
// `--espera` é quanto tempo se passa entre sair do campo e tocar o botão: 0 é o toque direto,
// 2500 deixa a gravação (que espera a digitação acabar) ir e voltar antes.
import { chromium, posicionais, bandeiras } from "./_comum.mjs";
const [pasta] = posicionais(); const flags = bandeiras();
const opt = (k, d) => (flags.find((f) => f.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=")[1];
const banco = opt("banco", "ok");
const espera = Number(opt("espera", "0"));

const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
const cl = base.clientes.find((c) => c.ativo !== false && c.valorSessao == null) ?? base.clientes[0];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const puts = [];
await page.route("**/api/clientes", (r) => {
  if (r.request().method() !== "PUT") return r.continue();
  const corpo = JSON.parse(r.request().postData() ?? "{}");
  puts.push(corpo);
  if (banco === "sem030") return r.fulfill({ status: 502, json: { ok: false, status: "erro", info: "O valor da sessão ainda não fica guardado na ficha. Por enquanto, ponha o valor na hora de marcar." } });
  return r.fulfill({ json: { ok: true, status: "ok", cliente: { ...cl, ...corpo } } });
});
const toasts = [];
await page.exposeFunction("__toast", (t) => toasts.push(t));
await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.evaluate(() => new MutationObserver(() => {
  for (const el of document.querySelectorAll('[role=status], [aria-live]')) {
    const t = el.textContent?.trim(); if (t && !window.__vistos?.has(t)) { (window.__vistos ??= new Set()).add(t); window.__toast(t); }
  }
}).observe(document.body, { subtree: true, childList: true, characterData: true }));
await page.waitForTimeout(800);
await page.getByText(cl.nome, { exact: true }).first().click();
await page.waitForTimeout(600);

const campoFicha = page.locator('[role=dialog] label:has(> span:text-is("Valor da sessão")) input');
await campoFicha.click();
await campoFicha.fill("180");
// O toque no botão é o que tira o foco do campo, como no dedo da Regina.
if (espera) { await page.locator('[role=dialog]').getByText("Ficha", { exact: true }).first().click(); await page.waitForTimeout(espera); }
await page.locator('[role=dialog] button', { hasText: "Marcar horário" }).first().click();
await page.waitForTimeout(700);

const campoRascunho = page.locator('[role=dialog] label:has(> span:text-is("Valor desta sessão")) input');
const out = {
  cliente: cl.nome, banco, espera,
  noRascunho: await campoRascunho.inputValue().catch(() => "(campo não achado)"),
  puts: puts.map((p) => ({ valorSessao: p.valorSessao })),
  toasts,
};
if (pasta) await page.screenshot({ path: `${pasta}/valor-da-ficha-${banco}-${espera}.png` });
console.log(JSON.stringify(out));
await browser.close();
