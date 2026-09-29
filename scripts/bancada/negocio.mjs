// negocio.mjs — o rodapé do rail abre a gaveta "Seu negócio", e a foto sobe (29/09/2026).
// ⚠️ O PATCH é simulado (o demo não tem sessão): o que se mede aqui é a tela, não a gravação.
// uso: node negocio.mjs <foto-de-teste.png>   → fotos em ~/.bancada/fotos/negocio-*.png
import { chromium } from "./_comum.mjs";
const [foto] = process.argv.slice(2);
const OUT = process.env.HOME + "/.bancada/fotos";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
// O demo não tem sessão, e toda escrita volta 401. Aqui o PATCH responde como o servidor responderia.
await p.route("**/api/negocio", async (r) => {
  if (r.request().method() !== "PATCH") return r.continue();
  const { foto } = JSON.parse(r.request().postData() || "{}");
  await r.fulfill({ json: { ok: true, status: "ok", negocio: { nome: "Seu Negócio", plano: "Profissional", precoPlano: 197, proximaCobranca: "—", cartao: "—", conversasPlano: "—", foto } } });
});
await p.goto("http://localhost:3200/?tela=fluxo", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(1200);
const botao = p.getByRole("button", { name: "Seu negócio" });
await botao.hover(); await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/negocio-1-rail.png` });
await botao.click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/negocio-2-gaveta.png` });
if (foto) {
  await p.locator('input[type="file"]').setInputFiles(foto);
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/negocio-3-com-foto.png` });
  const src = await p.locator('[role="dialog"] img').first().getAttribute("src");
  console.log("foto na gaveta:", src ? `${src.slice(0, 30)}… (${src.length} caracteres)` : "NENHUMA");
  await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  await p.mouse.move(700, 400); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/negocio-4-rail-com-foto.png` });
}
await b.close();
console.log("ok");
