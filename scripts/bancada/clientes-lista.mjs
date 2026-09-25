// clientes-lista.mjs — Clientes em lista com busca (1C.8), com 200 clientes simulados.
//
// uso: node clientes-lista.mjs <saida-prefixo> [desktop|mobile] [--busca=<texto>] [--toque]
//
// Troca a resposta de `/api/cadastro` por 200 clientes (o gerador do `clientes-audit.mjs`, com a
// Mariana Silva de telefone e CPF conhecidos na posição 0) e imprime a régua do `medir.mjs` mais o
// que o critério pede: linhas no DOM, y da primeira linha, altura de uma linha, e o que cada busca
// do critério acha ("981234567", "Silva", "312.456", "sílva"). `--toque` abre o contexto com
// `hasTouch` e sem hover, para conferir que nada depende de passar o mouse.
import { chromium, medirPagina } from "./_comum.mjs";
const [, , pre = "clientes-lista", modo = "desktop", ...flags] = process.argv;
const val = (k, d) => { const f = flags.find((x) => x.startsWith(`--${k}=`)); return f ? f.split("=").slice(1).join("=") : d; };
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const NOMES = ["Ana","Bruno","Carla","Diego","Elisa","Fábio","Gabriela","Heitor","Isabela","João","Karina","Lucas","Marina","Nicolas","Olívia","Paulo","Quésia","Rafael","Sofia","Tiago"];
const SOBRE = ["Souza","Oliveira","Santos","Lima","Pereira","Costa","Rodrigues","Almeida","Nascimento","Barros"];
function muitos(base, n) {
  const out = [{ ...base[0], id: "clmar", nome: "Mariana Silva", telefone: "(11) 98123-4567", cpf: "312.456.789-01", ativo: true, atendimentos: 4, valor: 600 }];
  for (let i = 1; i < n; i++) {
    const b = base[i % base.length];
    out.push({ ...b, id: `clx${i}`, nome: `${NOMES[i % 20]} ${SOBRE[Math.floor(i / 20) % 10]}`, telefone: i % 7 === 0 ? "" : `(11) 9${String(70000000 + i * 137).slice(0, 4)}-${String(1000 + i).slice(-4)}`, cpf: i % 3 === 0 ? "" : `${String(100 + i).slice(-3)}.${String(200 + i).slice(-3)}.${String(300 + i).slice(-3)}-${String(i % 100).padStart(2, "0")}`, ativo: i % 9 !== 0, atendimentos: i % 5, valor: (i % 5) * 150 });
  }
  return out;
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: flags.includes("--toque"), isMobile: false });
const page = await ctx.newPage();
await page.route("**/api/cadastro*", async (route) => {
  const r = await route.fetch(); const d = await r.json();
  d.clientes = muitos(d.clientes, 200);
  await route.fulfill({ response: r, json: d });
});
await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
const linhas = () => page.evaluate(() => {
  const botoes = [...document.querySelectorAll('main button[aria-label$=", abrir ficha"]')];
  const primeira = botoes[0]?.getBoundingClientRect();
  return { noDOM: botoes.length, primeiraY: primeira ? Math.round(primeira.top) : null, alturaLinha: primeira ? Math.round(primeira.height) : null, nomes: botoes.slice(0, 5).map((b) => b.textContent) };
});
const m = await medirPagina(page, modo);
console.log(JSON.stringify({ tela: "clientes", modo, ...m, linhas: await linhas() }, null, 1));
await page.screenshot({ path: `${pre}-${modo}.png` });
const busca = page.getByRole("searchbox", { name: /Buscar cliente/ });
for (const q of [val("busca", null), "981234567", "Silva", "312.456", "sílva"].filter(Boolean)) {
  await busca.fill(q);
  await page.waitForTimeout(250);
  const l = await linhas();
  console.log(`busca "${q}": ${l.noDOM} linhas`, JSON.stringify(l.nomes));
}
await busca.fill("sílva");
await page.waitForTimeout(250);
await page.screenshot({ path: `${pre}-${modo}-busca.png` });
await busca.fill("");
await page.getByRole("button", { name: /^Todos \(/ }).click();
await page.waitForTimeout(300);
const r = await page.evaluate(() => { const reg = document.querySelector(".m-moldura-regiao"); const alvo = getComputedStyle(document.querySelector(".m-moldura")).overflowY === "auto" ? document.querySelector(".m-moldura") : reg; alvo.scrollTop = 99999; return alvo.className; });
await page.waitForTimeout(300);
const mais = page.getByRole("button", { name: /^Mostrar mais/ });
console.log("Todos:", JSON.stringify(await linhas()), "rolou:", r, "| mostrar mais:", await mais.count() ? await mais.textContent() : "(nenhum)");
await page.screenshot({ path: `${pre}-${modo}-fim.png` });
await browser.close();
