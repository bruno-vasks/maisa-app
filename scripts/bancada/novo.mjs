// novo.mjs — o slot de ação e o "Novo" da casca (T2), nas 11 telas.
// uso: node novo.mjs [desktop|mobile] [pasta-de-fotos]
//
// Para cada tela: o rótulo do slot (a ação de criar declarada no mapa `TELA`), quantos botões com
// fundo --primary aparecem sem rolar (T2 pede no máximo 1), e quantos cliques até a gaveta
// "Novo atendimento" abrir, pelo caminho mais curto que a tela oferece:
//   desktop: "Novo" → "Marcar atendimento" (ou o slot, onde ele já é marcar);
//   celular: o "＋" quando ele marca; o "＋" que abre o menu "Novo"; ou a aba Agenda e o "＋".
// Lê o rascunho aberto (dia, hora, com quem) para conferir que nasceu num vago de verdade.
// Nada é gravado: a gaveta é fechada com "Descartar" antes de seguir.
import { chromium, posicionais } from "./_comum.mjs";
const [modo = "desktop", pasta] = posicionais();
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "fiscal", "equipe", "servicos", "assistente", "contatos", "mais"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};
for (const tela of TELAS) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  const antes = await page.evaluate(() => {
    const sonda = document.createElement("div"); sonda.style.background = "var(--primary)"; document.body.appendChild(sonda);
    const azul = getComputedStyle(sonda).backgroundColor; sonda.remove();
    const vis = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const primarios = [...document.querySelectorAll("button, a")].filter((b) => getComputedStyle(b).backgroundColor === azul && vis(b.getBoundingClientRect()))
      .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "));
    // O "＋" do celular é o ÚLTIMO botão do cabeçalho. `button[aria-label]:last-child` casava com
    // o status da MAISA, que é o último filho do próprio invólucro (regressão 7, 28/09/2026).
    const mais = [...document.querySelectorAll("header button[aria-label]")].filter((b) => !/^MAISA:/.test(b.getAttribute("aria-label"))).pop();
    return { primarios, maisDoCelular: mais?.getAttribute("aria-label") ?? null };
  });
  let cliques = 0;
  const clicar = async (loc) => { await loc.click(); cliques++; await page.waitForTimeout(500); };
  if (modo === "mobile") {
    const mais = page.locator("header").getByRole("button", { name: /^(Marcar atendimento|Encaixar cliente|Novo|Novo cliente|Novo serviço|Adicionar profissional)$/ });
    const rotulo = await mais.getAttribute("aria-label");
    if (rotulo === "Marcar atendimento" || rotulo === "Encaixar cliente") await clicar(mais);
    else if (rotulo === "Novo") { await clicar(mais); await clicar(page.getByRole("menuitem", { name: "Marcar atendimento" })); }
    else { await clicar(page.getByRole("button", { name: "Agenda", exact: true })); await clicar(page.locator("header").getByRole("button", { name: "Marcar atendimento" })); }
  } else {
    await clicar(page.getByRole("button", { name: "Novo", exact: true }));
    await clicar(page.getByRole("menuitem", { name: "Marcar atendimento" }));
  }
  const dlg = page.locator('[role=dialog][aria-label="Novo atendimento"]');
  const aberto = await dlg.count();
  const rascunho = aberto ? await dlg.evaluate((d) => [...d.querySelectorAll("select")].map((s) => s.selectedOptions[0]?.textContent).join(" · ") + " | " + d.querySelector("p")?.textContent) : null;
  if (pasta && (tela === "fluxo" || tela === "clientes")) await page.screenshot({ path: `${pasta}/novo-${tela}-${modo}.png` });
  out[tela] = { ...antes, cliques, aberto: !!aberto, rascunho };
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
