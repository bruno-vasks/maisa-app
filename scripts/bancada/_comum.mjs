// _comum.mjs — o que todo script da bancada precisa: o Chromium e a pasta onde cuspir foto.
//
// ⚠️ O PLAYWRIGHT NÃO É DEPENDÊNCIA DO PROJETO, de propósito. O CI roda `npm ci` em toda
// branch, e o Playwright traria centenas de MB de navegador para uma suíte que não abre
// navegador nenhum (vitest em ambiente `node`). A bancada roda na máquina de quem mede, contra
// o demo em :3200, e usa o Chrome instalado (`channel: "chrome"`), então basta o pacote.
//
// Onde ele é procurado, na ordem:
//   1. na pasta de `BANCADA_PLAYWRIGHT` (uma pasta com `node_modules/playwright`), e
//   2. no `node_modules` do projeto, se um dia alguém instalar.
// Instalar à parte, uma vez:  npm i playwright@1.55 --prefix ~/.bancada
// e rodar com:                BANCADA_PLAYWRIGHT=~/.bancada node scripts/bancada/foto.mjs fluxo x.png
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function carregarPlaywright() {
  const lugares = [];
  if (process.env.BANCADA_PLAYWRIGHT) lugares.push(join(resolve(process.env.BANCADA_PLAYWRIGHT), "_.js"));
  lugares.push(fileURLToPath(import.meta.url));
  for (const lugar of lugares) {
    const req = createRequire(lugar);
    for (const nome of ["playwright", "playwright-core"]) {
      try { return req(nome); } catch { /* tenta o próximo */ }
    }
  }
  console.error(
    "A bancada não achou o Playwright.\n" +
    "Instale à parte (não entra no package.json):  npm i playwright@1.55 --prefix ~/.bancada\n" +
    "e rode com  BANCADA_PLAYWRIGHT=~/.bancada node scripts/bancada/<script>.mjs …",
  );
  process.exit(2);
}

export const { chromium } = carregarPlaywright();

/** Pasta de saída de um script que fotografa em lote. `BANCADA_FOTOS` manda; senão, `.bancada-fotos/` na raiz (ignorada pelo git). */
export function pastaDeFotos(sub) {
  const dir = join(process.env.BANCADA_FOTOS ? resolve(process.env.BANCADA_FOTOS) : join(RAIZ, ".bancada-fotos"), sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

/** A régua de `medir.mjs` (G18), para qualquer script que já abriu a página com os cenários
 *  simulados medir do mesmo jeito: documento, rolagens, sonda de corte, primários na dobra… */
export async function medirPagina(page, modo) {
  return page.evaluate((modo) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const rot = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 48);
    const todos = [...document.querySelectorAll("body *")];

    const rolaveis = [];
    const corte = [];
    for (const el of todos) {
      const cs = getComputedStyle(el);
      if (!vis(el)) continue;
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
        rolaveis.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), visivel: el.clientHeight, total: el.scrollHeight, fracao: +(el.clientHeight / el.scrollHeight).toFixed(2) });
      }
      // Texto com reticências tem overflow:hidden e não é corte: só conta caixa de verdade (>= 40px).
      if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && el.clientHeight >= 40 && el.scrollHeight > el.clientHeight + 1) {
        corte.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), visivel: el.clientHeight, total: el.scrollHeight });
      }
    }

    // Cor do --primary resolvida pelo navegador, para comparar com o fundo computado.
    const sonda = document.createElement("span");
    sonda.style.background = "var(--primary)";
    document.body.appendChild(sonda);
    const primaria = getComputedStyle(sonda).backgroundColor;
    sonda.remove();

    const clicaveis = [...document.querySelectorAll("button, a[href], [role=button], [role=switch], [role=tab], input, select, textarea")].filter(vis);
    const foraDaTela = clicaveis
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.right > innerWidth + 0.5 || r.left < -0.5)
      .map(({ b, r }) => ({ t: rot(b), left: Math.round(r.left), right: Math.round(r.right) }));
    const primariosNaDobra = clicaveis
      .filter((b) => getComputedStyle(b).backgroundColor === primaria)
      .filter((b) => { const r = b.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })
      .map(rot);
    const alvosPequenos = modo === "mobile"
      ? clicaveis
          .filter((b) => !["INPUT", "SELECT", "TEXTAREA"].includes(b.tagName))
          .map((b) => ({ t: rot(b), r: b.getBoundingClientRect() }))
          .filter(({ r }) => r.height < 44 || r.width < 44)
          .map(({ t, r }) => `${t || "(sem rótulo)"} ${Math.round(r.width)}x${Math.round(r.height)}`)
      : [];

    const pilulasMudas = todos
      .filter(vis)
      // Pílula é raio >= meia altura (o Badge usa 20px, não 999px) e mais larga que alta.
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > r.height + 4 && r.height > 0 && parseFloat(getComputedStyle(el).borderTopLeftRadius) >= r.height / 2 - 0.5; })
      // Muda = não é ela o controle. Pílula DENTRO de uma linha clicável (o "no catálogo" da
      // tabela de Serviços) conta: quem clica é a linha, e a pílula promete um clique próprio.
      .filter((el) => { const c = el.closest("button, a, [role=button], [role=switch], [role=tab], label"); return !c || c.getBoundingClientRect().width > el.getBoundingClientRect().width + 8; })
      // Contagem dentro de controle (o número do rail, o ponto da aba) é a exceção da emenda 1.
      .filter((el) => { const tx = (el.innerText || "").trim(); return tx && !/^\d+$/.test(tx); })
      .map((el) => (el.innerText || "").trim().slice(0, 30));

    const main = document.querySelector("main") ?? document.body;
    const texto = main.innerText.replace(/\s+/g, " ").trim();
    const header = document.querySelector("header");
    return {
      viewport: innerHeight,
      documento: document.documentElement.scrollHeight,
      larguraJanela: innerWidth,
      larguraDoc: document.documentElement.scrollWidth,
      rolaveis,
      corte,
      foraDaTela,
      primariosNaDobra,
      pilulasMudas,
      alvosPequenos,
      caracteres: texto.length,
      travessoes: (texto.match(/—/g) || []).length,
      header: header ? { altura: Math.round(header.getBoundingClientRect().height), temSubtitulo: !!header.querySelector("p") } : null,
    };
  }, modo);
}
