// ficha-responde.mjs — a ficha do cliente diz se a MAISA responde a ele (1B.11, 05 P0-2).
// uso: node ficha-responde.mjs [desktop|mobile] [pasta-de-fotos] [--modo=pessoal|negocio] [--marca=null|false|true|fora]
//
// `/api/contatos` é simulado: no modo pessoal, a primeira cliente do cadastro está no caderno com a
// marcação de `--marca` (`fora` = não está no caderno). O PATCH é respondido aqui e registrado.
// Abre a ficha, lê a faixa fixa sob o cabeçalho, toca "Responder a …" se houver e lê de novo.
import { chromium } from "./_comum.mjs";
const [, , modo = "desktop", pasta, ...flags] = process.argv;
const opt = (k, d) => (flags.find((f) => f.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=")[1];
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const modoDoNumero = opt("modo", "pessoal");
const marca = opt("marca", "null");
const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
const cl = base.clientes[0];
const chave = cl.telefone.replace(/\D/g, "").slice(-8);
const contatos = marca === "fora" ? [] : [{ chave, nome: cl.nome, telefone: `55${cl.telefone.replace(/\D/g, "")}`, cliente: marca === "null" ? null : marca === "true" }];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const patches = [];
await page.route("**/api/contatos", (r) => {
  if (r.request().method() === "PATCH") { patches.push(r.request().postData()); return r.fulfill({ json: { ok: true, status: "ok" } }); }
  return r.fulfill({ json: { ok: true, status: "ok", modo: modoDoNumero, contatos } });
});
await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1000);
await page.getByText(cl.nome, { exact: true }).first().click();
await page.waitForTimeout(700);
const faixa = () => page.evaluate(() => {
  const f = document.querySelector('[role=dialog] [role=status]');
  const b = f?.querySelector("button");
  return f ? { texto: f.innerText.replace(/\s+/g, " ").trim(), botao: b?.textContent ?? null, top: Math.round(f.getBoundingClientRect().top) } : null;
});
const out = { vp, modoDoNumero, marca, antes: await faixa() };
if (pasta) await page.screenshot({ path: `${pasta}/ficha-${modo}-${modoDoNumero}-${marca}.png` });
const botao = page.locator('[role=dialog] [role=status] button');
if (await botao.count()) {
  await botao.first().click(); await page.waitForTimeout(700);
  out.depois = await faixa();
  out.patches = patches;
  if (pasta) await page.screenshot({ path: `${pasta}/ficha-${modo}-${modoDoNumero}-${marca}-depois.png` });
}
console.log(JSON.stringify(out));
await browser.close();
