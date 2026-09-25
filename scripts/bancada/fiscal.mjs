// fiscal.mjs — fotografa a tela Fiscal / Documento fiscal do DEMO com as rotas /api/fiscal,
// /api/recibos e /api/faturamento interceptadas (o demo não tem Supabase; nada sai daqui).
// uso: node fiscal.mjs <cenario> <saida-sem-ext> [desktop|mobile]
// `COMPETENCIA=2026-08-01,2026-09-01` reparte essas competências entre as linhas de /api/faturamento
// (sem ela, a competência vem vazia e a tela usa o mês de hoje).
import { chromium, pastaDeFotos } from "./_comum.mjs";

const [, , cenario, saida, modo = "desktop"] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const NOMES = ["Ana Beatriz Moura", "Bruno Carvalho", "Carla Guth", "Daniela Ribeiro", "Eduardo Lima", "Fernanda Souza", "Gabriel Rocha", "Helena Martins", "Igor Pereira", "Juliana Alves", "Kátia Nogueira", "Lucas Fernandes", "Mariana Costa", "Nicolas Barros", "Olívia Teixeira", "Paulo Henrique Dias", "Queila Santos", "Rafael Antunes", "Sofia Mendes", "Tiago Araújo", "Úrsula Campos", "Vinícius Prado", "Wagner Reis", "Yasmin Freitas"];
const CPFS_OK = ["52998224725", "11144477735", "12345678909", "98765432100"];

function pagamentos(n, semCpf = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const nome = NOMES[i % NOMES.length];
    const cpf = i < semCpf ? null : CPFS_OK[i % CPFS_OK.length];
    out.push({ id: `p${i}`, fonte: i % 7 === 3 ? "avulso" : "atendimento", nome, cpf, data: `2026-09-${String((i % 22) + 1).padStart(2, "0")}`, valor: [180, 200, 250, 300][i % 4], podeExcluir: i % 7 === 3 });
  }
  return out;
}

const cfgBase = {
  ambiente: "producao", cnpj: null, razaoSocial: null, codigoMunicipio: null, optanteMei: false, optanteSimples: false,
  empresaId: null, certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "52998224725", ocupacaoSaude: "psicologo", registroProfissional: "CRP 06/123456",
  procuradorDocumento: "12345678000199", procuracaoValidaAte: "2027-08-25", procuracaoAceitaEm: "2026-08-26",
  inscricaoMunicipal: null, itemListaServico: null, aliquotaIss: null, codigoTributarioMunicipio: null,
};

const C = {
  "recibo-cheio": { fiscal: { caminho: "recibo_saude", config: cfgBase, falta: [] }, pend: pagamentos(34, 3), avisos: { falhou: 2, semTelefone: 1 } },
  "recibo-poucos": { fiscal: { caminho: "recibo_saude", config: cfgBase, falta: [] }, pend: pagamentos(5, 0) },
  "recibo-vazio": { fiscal: { caminho: "recibo_saude", config: cfgBase, falta: [] }, pend: [] },
  "recibo-sem-registro": { fiscal: { caminho: "recibo_saude", config: { ...cfgBase, registroProfissional: null }, falta: [] }, pend: pagamentos(12, 1) },
  "recibo-procuracao-vencida": { fiscal: { caminho: "recibo_saude", config: { ...cfgBase, procuracaoValidaAte: "2026-09-01" }, falta: [] }, pend: pagamentos(12, 1) },
  "cnpj": { fiscal: { caminho: "municipal", config: { ...cfgBase, prestadorCpf: null, ocupacaoSaude: null, registroProfissional: null, cnpj: "12345678000199", razaoSocial: "Barbearia do Zé LTDA", empresaId: 77, certificadoValidoAte: "2027-05-01", codigoMunicipio: "3550308", inscricaoMunicipal: "123" }, falta: [] }, fat: 16 },
  "cnpj-sem-cert": { fiscal: { caminho: "municipal", config: { ...cfgBase, prestadorCpf: null, ocupacaoSaude: null, registroProfissional: null, cnpj: "12345678000199", razaoSocial: "Barbearia do Zé LTDA", empresaId: 77, certificadoValidoAte: null, codigoMunicipio: "3550308", inscricaoMunicipal: "123" }, falta: ["o certificado digital da empresa"] }, fat: 16 },
  "nada-com-atend": { fiscal: { caminho: "municipal", config: { ...cfgBase, prestadorCpf: null, ocupacaoSaude: null, registroProfissional: null, procuradorDocumento: null, procuracaoValidaAte: null, procuracaoAceitaEm: null }, falta: ["o CNPJ de quem emite"] }, fat: 14 },
  "nada": { fiscal: { caminho: "municipal", config: { ...cfgBase, prestadorCpf: null, ocupacaoSaude: null, registroProfissional: null, procuradorDocumento: null, procuracaoValidaAte: null, procuracaoAceitaEm: null }, falta: ["o CNPJ de quem emite"] }, fat: 0 },
};

const base = cenario.replace(/\+.*$/, "");
const acoes = cenario.includes("+") ? cenario.split("+").slice(1) : [];
const sc = C[base];
if (!sc) { console.error("cenário desconhecido", base, Object.keys(C)); process.exit(1); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
await page.route("**/api/fiscal**", (r) => {
  if (r.request().method() !== "GET") return r.fulfill({ json: { ok: false, info: "demo" } });
  r.fulfill({ json: { ok: true, status: "ok", provedorFaltando: [], ...sc.fiscal } });
});
await page.route("**/api/recibos", (r) => {
  const p = sc.pend ?? [];
  const semCpf = p.filter((x) => !x.cpf).length;
  r.fulfill({ json: { ok: true, pagamentos: p, total: p.filter((x) => x.cpf).reduce((a, x) => a + x.valor, 0), semCpf, avisos: sc.avisos ?? { falhou: 0, semTelefone: 0 } } });
});
await page.route("**/api/faturamento", (r) => {
  const n = sc.fat ?? 0;
  const aFaturar = [];
  for (let i = 0; i < n; i++) aFaturar.push({ clienteId: `c${i}`, nome: NOMES[i], valor: 200 * ((i % 4) + 1), atendimentos: (i % 4) + 1, cpf: i === 2 ? null : CPFS_OK[i % 4], teste: false, servico: "Corte + barba", competencia: (process.env.COMPETENCIA ?? "").split(",")[i % Math.max(1, (process.env.COMPETENCIA ?? "").split(",").length)] });
  const emitidas = [{ clienteId: "c1", status: "emitida", numero: "0412", data: "02/09/2026", valor: 400, tomadorNome: NOMES[1] }, { clienteId: "c4", status: "erro", erro: "Prefeitura recusou: CPF do tomador inválido", valor: 200 }];
  r.fulfill({ json: { ok: true, aFaturar, emitidas, ambiente: "producao", falta: [] } });
});

const tela = acoes.includes("doc") ? "fiscal" : "faturamento";
await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);

for (const a of acoes) {
  if (a === "doc") continue;
  const [verbo, ...resto] = a.split(":");
  const txt = resto.join(":");
  if (verbo === "clicar") { await page.getByText(txt, { exact: false }).first().click(); await page.waitForTimeout(700); }
  if (verbo === "botao") { await page.getByRole("button", { name: txt }).first().click(); await page.waitForTimeout(700); }
  if (verbo === "roda") { await page.mouse.move(760, 700); for (let i=0;i<10;i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(80); } await page.waitForTimeout(400); }
  if (verbo === "rolar") { await page.evaluate(() => { for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) el.scrollTop = el.scrollHeight; } }); await page.waitForTimeout(400); }
}

if (process.env.SONDA) { console.log(await page.evaluate(() => { const out=[]; for (const el of document.querySelectorAll("main *, main")) { const cs=getComputedStyle(el); if (el.scrollHeight > el.clientHeight + 4 && cs.overflowY!=="visible") out.push(el.tagName+" ."+String(el.className).slice(0,30)+" ov="+cs.overflowY+" vis="+el.clientHeight+" tot="+el.scrollHeight); } return out.slice(0,12).join("\n"); })); }
const m = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
      out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), visivel: el.clientHeight, total: el.scrollHeight });
    }
  }
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const main = document.querySelector("main") ?? document.body;
  const botoes = [...main.querySelectorAll("button, a")].filter(vis).map((b) => {
    const r = b.getBoundingClientRect();
    return { t: (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 50), y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), bg: getComputedStyle(b).backgroundColor };
  }).filter((b) => b.t);
  const campos = [...main.querySelectorAll("input, select, textarea")].filter(vis).map((i) => { const r = i.getBoundingClientRect(); return { ph: i.placeholder || i.type, y: Math.round(r.top), w: Math.round(r.width) }; });
  const texto = main.innerText.replace(/\s+/g, " ").trim();
  const tracos = (texto.match(/—/g) || []).length;
  return { viewport: innerHeight, documento: document.documentElement.scrollHeight, rolaveis: out, botoes, campos, caracteres: texto.length, travessoes: tracos };
});
const lista = m.botoes.filter((b) => !/R\$/.test(b.t) || b.t.length < 20);
console.log(JSON.stringify({ viewport: m.viewport, documento: m.documento, rolaveis: m.rolaveis, caracteres: m.caracteres, travessoes: m.travessoes, nLinhasLista: m.botoes.length - lista.length }));
console.log("BOTOES: " + lista.map((b) => `[${b.t.replace(/\n/g, " ")}]@${b.y}${b.y + b.h > m.viewport ? "(ABAIXO)" : ""} ${b.w}x${b.h}`).join(" | "));
console.log("CAMPOS: " + m.campos.map((c) => `${c.ph}@${c.y} w${c.w}`).join(" | "));
await page.screenshot({ path: `${saida}.png` });
await page.screenshot({ path: `${saida}-full.png`, fullPage: true });
// página inteira não mostra conteúdo interno de região que rola; expande para ver tudo
await page.evaluate(() => { for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll|hidden)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) { el.style.overflow = "visible"; el.style.height = "auto"; el.style.maxHeight = "none"; el.style.flex = "none"; } } document.documentElement.style.height = "auto"; document.body.style.height = "auto"; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${saida}-expandido.png`, fullPage: true });
await browser.close();
