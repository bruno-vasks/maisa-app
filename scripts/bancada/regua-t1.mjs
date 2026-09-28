// regua-t1.mjs — o critério de T1 (1C.1) de uma vez: as 11 telas e as rotas de entrada, nas duas
// larguras, pela régua do `medir.mjs` (`medirPagina`). Uma linha por tela: documento/viewport,
// quantas regiões rolam (e quais), a sonda de corte, clicáveis fora da tela e os primários na dobra.
//
// uso: node regua-t1.mjs [pasta-das-fotos]   (sem pasta, não fotografa)
// Exceções declaradas em T1: Conversas e Fluxo podem ter 2 regiões (uma por coluna).
import { chromium, medirPagina, VIEWPORTS, posicionais } from "./_comum.mjs";
const [pasta] = posicionais();
const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "equipe", "servicos", "assistente", "contatos", "mais", "fiscal"];
const ENTRADA = ["/login", "/cadastro", "/esqueci", "/nova-senha", "/comecar"]; // as 5 rotas de entrada do §7 (a /nova-senha faltava)
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const modo of ["desktop", "mobile"]) {
  for (const t of [...TELAS, ...ENTRADA]) {
    const page = await browser.newPage({ viewport: VIEWPORTS[modo], deviceScaleFactor: 1 });
    const url = t.startsWith("/") ? `http://localhost:3200${t}` : `http://localhost:3200/?tela=${t}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1200);
    const m = await medirPagina(page, modo);
    const limite = ["fluxo", "conversas"].includes(t) && modo === "desktop" ? 2 : 1;
    const ok = m.documento === m.viewport && m.rolaveis.length <= limite && m.corte.length === 0 && m.foraDaTela.length === 0;
    console.log(JSON.stringify({ ok, modo, t, final: new URL(page.url()).pathname + new URL(page.url()).search, doc: `${m.documento}/${m.viewport}`, larg: `${m.larguraDoc}/${m.larguraJanela}`, rola: m.rolaveis.map((r) => `${r.cls.split(" ")[0] || r.tag} ${r.visivel}/${r.total}`), corte: m.corte, fora: m.foraDaTela, primarios: m.primariosNaDobra }));
    if (pasta) await page.screenshot({ path: `${pasta}/${modo}-${t.replace(/\//g, "") || "raiz"}.png` });
    await page.close();
  }
}
await browser.close();
