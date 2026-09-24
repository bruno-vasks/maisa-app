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
