import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("09-entrada");
const ok = (b) => ({ ok: true, status: "ok", ...b });
for (const modo of ["mobile", "desktop"]) {
  const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: vp, isMobile: modo === "mobile", hasTouch: modo === "mobile" });
  await p.route("**/api/ativacao*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(ok({ feitos: ["negocio_criado", "catalogo_ajustado"] })) }));
  await p.route("**/api/assistente*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(ok({ assistente: { ativa: true } })) }));
  await p.goto("http://localhost:3200/comecar", { waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  const alt = p.getByText("Estou no celular", { exact: false }); if (await alt.count()) await alt.click();
  await p.fill('input[inputmode="tel"]', "11994294906");
  await p.getByText("Receber código").click();
  await p.waitForTimeout(500);
  const num = await p.evaluate(() => { const el = [...document.querySelectorAll("p")].find((e) => e.textContent.includes("+55")); if (!el) return null; const r = el.getBoundingClientRect(); return { texto: el.textContent, altura: Math.round(r.height), largura: Math.round(r.width), linhas: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)) }; });
  console.log(modo, JSON.stringify(num));
  await p.screenshot({ path: `${OUT}/e3-conferir-numero-${modo}.png` });
  await b.close();
}
