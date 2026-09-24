// aud08b.mjs — digita 30, 45 e "90,50" nos campos da gaveta de serviço e confere o que fica.
// O defeito (08 P0-1): o campo convertia a cada tecla com mínimo de 5, e "30" virava 50.
// Lê o valor DIGITANDO (ainda no campo) e DEPOIS DE SAIR (Tab), que é quando a gaveta grava.
// Critério do item T7: fica 30, 45 e 90,5. Restaura o serviço no fim.
import { chromium, pastaDeFotos } from "./_comum.mjs";
const F = pastaDeFotos("08-equipe-servicos-mais");
const modo = process.argv[2] === "mobile" ? "mobile" : "desktop";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
await page.goto(`http://localhost:3200/?tela=servicos`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator('button[aria-label*="Consulta inicial"]').first().click();
await page.waitForTimeout(600);
const dlg = page.locator('[role="dialog"]');
const dur = dlg.locator("input").nth(2);
const preco = dlg.locator("input").nth(1);
const antes = [await preco.inputValue(), await dur.inputValue()];
console.log("antes", ...antes);
const digitar = async (campo, txt) => {
  await campo.click(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type(txt, { delay: 80 });
  const digitando = await campo.inputValue();
  await page.keyboard.press("Tab"); await page.waitForTimeout(250);
  return [digitando, await campo.inputValue()];
};
const r30 = await digitar(dur, "30");
console.log("duracao digitando 30 ->", r30[0], "| depois de sair ->", r30[1]);
const r45 = await digitar(dur, "45");
console.log("duracao digitando 45 ->", r45[0], "| depois de sair ->", r45[1]);
const r90 = await digitar(preco, "90,50");
console.log("preco digitando 90,50 ->", r90[0], "| depois de sair ->", r90[1]);
const rLixo = await digitar(dur, "abc");
console.log("duracao digitando abc ->", rLixo[0], "| depois de sair ->", rLixo[1], "(texto que não é número não grava)");
await page.screenshot({ path: `${F}/gaveta-svc-digitacao-${modo}.png` });
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
// restaura
await digitar(dur, antes[1]); await digitar(preco, antes[0]);
await page.waitForTimeout(1500);
console.log("restaurado", await preco.inputValue(), await dur.inputValue());
await browser.close();
