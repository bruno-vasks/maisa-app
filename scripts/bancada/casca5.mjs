// Simula o rodapé da gaveta de ATENDIMENTO (detalhe.tsx:849-900): clona o botão real do rodapé
// com os rótulos que a gaveta monta para um atendimento de hoje com Meet e conversa.
import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("01-casca");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};
for (const [modo, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`http://localhost:3200/?tela=clientes`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  await page.getByText("Mariana Alves").first().click(); await page.waitForTimeout(600);
  for (const [nome, rotulos] of [["hoje-sem-meet", ["Dar chegada", "Cancelar atendimento", "Abrir conversa"]], ["hoje-com-meet", ["Dar chegada", "Enviar link no WhatsApp", "Abrir no Google Calendar", "Cancelar atendimento", "Abrir conversa"]]]) {
    out[`${modo}:${nome}`] = await page.evaluate((rotulos) => {
      const d = document.querySelector('[role="dialog"]');
      const rodape = d.lastElementChild;
      const modelo = rodape.querySelector("button");
      rodape.innerHTML = "";
      rotulos.forEach((t, i) => { const b = modelo.cloneNode(true); b.innerText = t; if (i > 0) { b.style.flex = "0 1 auto"; b.style.background = "var(--surface)"; b.style.color = "var(--muted)"; b.style.border = "1px solid var(--border)"; } if (/Cancelar/.test(t)) { b.style.background = "var(--danger-soft)"; b.style.color = "var(--danger)"; } rodape.appendChild(b); });
      const lim = rodape.getBoundingClientRect();
      return { larguraRodape: Math.round(lim.width), scrollW: rodape.scrollWidth, botoes: [...rodape.children].map(b => { const r = b.getBoundingClientRect(); return `${b.innerText}: ${Math.round(r.left)}-${Math.round(r.right)}${r.right > innerWidth || r.right > lim.right + 1 ? " (CORTADO)" : ""}`; }) };
    }, rotulos);
    await page.screenshot({ path: `${OUT}/gaveta-rodape-${nome}-${modo}.png` });
  }
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
