// casca.mjs — mede a casca (rail/topbar/abas) em várias telas, desktop e mobile.
import { chromium, pastaDeFotos } from "./_comum.mjs";
const OUT = pastaDeFotos("01-casca");
const telas = ["fluxo","conversas","agenda","clientes","faturamento","equipe","servicos","assistente","mais","contatos","fiscal"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const res = {};
for (const modo of ["desktop","mobile"]) {
  const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  for (const t of telas) {
    await page.goto(`http://localhost:3200/?tela=${t}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const r = (el) => el ? el.getBoundingClientRect() : null;
      const header = document.querySelector("header");
      const main = document.querySelector("main");
      const navs = [...document.querySelectorAll("nav")].map(n => ({ label: n.getAttribute("aria-label"), ...JSON.parse(JSON.stringify(r(n))) }));
      const rol = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) rol.push({ cls: String(el.className).slice(0,40), top: Math.round(r(el).top), visivel: el.clientHeight, total: el.scrollHeight });
      }
      const h1 = document.querySelector("h1");
      const sub = header?.querySelector("p");
      const botoesHeader = header ? [...header.querySelectorAll("button")].map(b => b.innerText.trim() || b.getAttribute("aria-label")) : [];
      const hr = r(header), mr = r(main);
      // área útil = abaixo do header até o fim da main (desktop) / até a tabbar (mobile)
      return {
        vw: innerWidth, vh: innerHeight, doc: document.documentElement.scrollHeight,
        header: hr && { top: Math.round(hr.top), h: Math.round(hr.height), w: Math.round(hr.width) },
        main: mr && { top: Math.round(mr.top), h: Math.round(mr.height), left: Math.round(mr.left), w: Math.round(mr.width) },
        navs: navs.map(n => ({ label: n.label, top: Math.round(n.top), h: Math.round(n.height), w: Math.round(n.width) })),
        h1: h1?.innerText, sub: sub?.innerText, botoesHeader,
        rolaveis: rol,
      };
    });
    res[`${modo}:${t}`] = m;
    await page.screenshot({ path: `${OUT}/${t}-${modo[0]}.png` });
  }
  await page.close();
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
