// medir.mjs — a régua de layout da bancada (guarda G18 do backlog do front). Não é CI e não
// reprova nada: mede e imprime, para quem mexeu colar o número no PR.
//
// uso: node scripts/bancada/medir.mjs <tela|/rota> [desktop|mobile] [--foto saida.png]
//      node scripts/bancada/medir.mjs --lote <pasta>      (as 11 telas + 5 rotas, nas duas larguras)
//
// O que sai, por tela:
//   documento/viewport ... a página inteira cabe na janela? (T1: documento === viewport)
//   larguraDoc ........... docW > winW é rolagem lateral, sempre defeito
//   rolaveis ............. contêineres que rolam de fato, com a fração visível
//   corte ................ a "sonda de corte": overflow:hidden com conteúdo maior que a caixa
//                          (foi o que escondeu a tabela do CNPJ). Tem que voltar vazia
//   foraDaTela ........... botão com right > innerWidth ou left < 0
//   primariosNaDobra ..... botões com fundo --primary visíveis sem rolar (T2: no máximo 1)
//   pilulasMudas ......... raio >= meia altura em algo que não clica (T10: pílula é controle)
//   alvosPequenos ........ alvos < 44px (só conta no celular)
//   caracteres, travessoes texto visível em <main> e quantos "—" há nele
//   header ............... altura do cabeçalho e se ainda há <p> de subtítulo (T8)
import { chromium, VIEWPORTS, medirPagina } from "./_comum.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TELAS = ["fluxo", "conversas", "agenda", "clientes", "faturamento", "fiscal", "equipe", "servicos", "assistente", "contatos", "mais"];
const ROTAS_DE_ENTRADA = ["/login", "/cadastro", "/esqueci", "/nova-senha", "/comecar"];

const url = (tela) => (tela.startsWith("/") ? `http://localhost:3200${tela}` : `http://localhost:3200/?tela=${tela}`);

async function abrir(browser, tela, modo) {
  const page = await browser.newPage({ viewport: VIEWPORTS[modo], deviceScaleFactor: 1 });
  await page.goto(url(tela), { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  return page;
}

const [, , alvo, ...resto] = process.argv;
if (!alvo) {
  console.error("uso: node scripts/bancada/medir.mjs <tela|/rota> [desktop|mobile] [--foto saida.png]\n     node scripts/bancada/medir.mjs --lote <pasta>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
if (alvo === "--lote") {
  const pasta = resto[0];
  if (!pasta) { console.error("--lote pede a pasta de saída"); process.exit(1); }
  mkdirSync(pasta, { recursive: true });
  const tudo = {};
  for (const tela of [...TELAS, ...ROTAS_DE_ENTRADA]) {
    for (const modo of ["desktop", "mobile"]) {
      const nome = `${tela.replace(/^\//, "")}-${modo}`;
      const page = await abrir(browser, tela, modo);
      tudo[nome] = await medirPagina(page, modo);
      await page.screenshot({ path: join(pasta, `${nome}.png`) });
      await page.close();
      const m = tudo[nome];
      console.log(`${nome.padEnd(22)} doc ${m.documento}/${m.viewport}  rolam ${m.rolaveis.length}  corte ${m.corte.length}  primários ${m.primariosNaDobra.length}  pílulas ${m.pilulasMudas.length}  travessões ${m.travessoes}`);
    }
  }
  writeFileSync(join(pasta, "medidas.json"), JSON.stringify(tudo, null, 2));
  console.log("ok", join(pasta, "medidas.json"));
} else {
  const modo = resto.find((x) => x === "desktop" || x === "mobile") ?? "desktop";
  const i = resto.indexOf("--foto");
  const page = await abrir(browser, alvo, modo);
  console.log(JSON.stringify(await medirPagina(page, modo), null, 2));
  if (i >= 0 && resto[i + 1]) await page.screenshot({ path: resto[i + 1] });
}
await browser.close();
