// recibo-por-mes.mjs — um recibo por mês na tela de emitir e na ficha (01/10/2026, Bruno).
// uso: node recibo-por-mes.mjs [desktop|mobile] [pasta-de-fotos]
//
// Simula uma psicóloga com tudo preenchido e pendentes de DUAS pessoas do cadastro do demo: a
// primeira com 3 sessões em setembro, a segunda com 2 (no demo toda ficha vem com "1 por mês").
// Atrasa as fichas e registra o botão enquanto elas não chegam (tem que estar travado). Mede o
// número grande, o botão e a prévia (têm que contar RECIBOS, não sessões), toca "Emitir"
// e registra o corpo de cada `POST /api/recibos/emitir` (respondido aqui, nada sai). Depois abre a
// ficha da primeira, troca "Recibos por mês" para "Um por sessão" e registra o `PUT`.
import { chromium, posicionais } from "./_comum.mjs";
const [modo = "desktop", pasta] = posicionais();
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
const [a, b] = base.clientes.filter((c) => c.ativo !== false);
const CPFS = ["52998224725", "11144477735"];
const sessao = (cl, i, cpf, dia) => ({ id: `${cl.id}-s${i}`, fonte: "atendimento", clienteId: cl.id, cpfPagador: null, nome: cl.nome, cpf, data: `2026-09-${dia}`, valor: 180, podeExcluir: false });
const pagamentos = [
  sessao(a, 1, CPFS[0], "02"), sessao(a, 2, CPFS[0], "09"), sessao(a, 3, CPFS[0], "16"),
  sessao(b, 1, CPFS[1], "03"), sessao(b, 2, CPFS[1], "10"),
];
const config = {
  ambiente: "producao", cnpj: null, razaoSocial: null, codigoMunicipio: null, optanteMei: false, optanteSimples: false,
  empresaId: null, certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "52998224725", ocupacaoSaude: "psicologo", registroProfissional: "CRP 06/123456",
  procuradorDocumento: "12345678000199", procuracaoValidaAte: "2027-08-25", procuracaoAceitaEm: "2026-08-26",
  inscricaoMunicipal: null, itemListaServico: null, aliquotaIss: null, codigoTributarioMunicipio: null,
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const emitidos = [];
const puts = [];
await page.route("**/api/fiscal**", (r) => r.fulfill({ json: { ok: true, status: "ok", provedorFaltando: [], caminho: "recibo_saude", config, falta: [] } }));
await page.route("**/api/recibos", (r) => r.fulfill({ json: { ok: true, pagamentos, total: 900, semCpf: 0, avisos: { falhou: 0, semTelefone: 0 } } }));
await page.route("**/api/recibos/emitir", (r) => {
  emitidos.push(JSON.parse(r.request().postData() ?? "{}"));
  return r.fulfill({ json: { ok: true, reciboId: "r", canal: "rebots", situacao: "pendente", protocolo: "1", valor: 0, sessoes: 1, nome: "x", data: "2026-09-16" } });
});
await page.route("**/api/clientes", (r) => {
  if (r.request().method() !== "PUT") return r.continue();
  puts.push(JSON.parse(r.request().postData() ?? "{}"));
  return r.fulfill({ json: { ok: true, status: "ok", cliente: null } });
});

/* Atrasa `/api/cadastro` em 3s para medir o primeiro segundo: antes das fichas, o botão tem que
 * estar travado, e não contando um recibo por sessão. */
await page.route("**/api/cadastro", async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); return r.continue(); });
await page.goto("http://localhost:3200/?tela=faturamento", { waitUntil: "domcontentloaded", timeout: 90000 });
/* Os estados do botão, na ordem, enquanto as fichas chegam. Medido em 01/10/2026:
 * ["Lendo as fichas… (travado)", "Emitir 2 recibos"]. Antes da trava, "Emitir 5 recibos" aparecia. */
const texto0 = [];
for (let i = 0; i < 16; i++) {
  const b = await page.evaluate(() => [...document.querySelectorAll("button")].map((x) => `${x.textContent?.trim()}${x.disabled ? " (travado)" : ""}`).find((t) => /^(Emitir|Lendo|Nada)/.test(t)) ?? null);
  if (b && texto0[texto0.length - 1] !== b) texto0.push(b);
  await page.waitForTimeout(500);
}
const texto = (re) => page.evaluate((src) => [...document.querySelectorAll("button, span, strong")].map((e) => e.textContent?.trim() ?? "").find((t) => new RegExp(src).test(t)) ?? null, re.source);
const out = {
  modo,
  antesDasFichas: texto0,
  botao: await texto(/^Emitir \d+ recibos?$/),
  previa: await texto(/sessões, /),
};
if (pasta) await page.screenshot({ path: `${pasta}/por-mes-${modo}.png` });
if (modo === "desktop") {
  await page.getByRole("button", { name: /^Emitir \d+ recibos?$/ }).click();
  await page.waitForTimeout(2500);
  out.pedidos = emitidos.map((e) => (e.itens ? e.itens.map((i) => i.id) : [e.id]));
}

await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
await page.getByText(a.nome, { exact: true }).first().click();
await page.waitForTimeout(700);
const campo = page.locator('[role=dialog] label:has(> span:text-is("Recibos por mês")) select');
out.ficha = { temCampo: (await campo.count()) > 0 };
if (out.ficha.temCampo) {
  out.ficha.antes = await campo.evaluate((s) => s.options[s.selectedIndex].text);
  await campo.selectOption("0");
  await page.waitForTimeout(1500);
  out.ficha.dica = await page.locator('[role=dialog] label:has(> span:text-is("Recibos por mês")) > span').last().textContent();
  out.ficha.puts = puts.map((p) => ({ recibosPorMes: p.recibosPorMes }));
  await campo.scrollIntoViewIfNeeded();
  if (pasta) await page.screenshot({ path: `${pasta}/por-mes-ficha-${modo}.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
