// recibo-destino.mjs — "para onde vai o recibo" e o "Dia do recibo" da ficha (01/10/2026, a Regina).
// uso: node recibo-destino.mjs [desktop|mobile] [pasta-de-fotos]
//
// O demo não tem Supabase, então `/api/fiscal` e `/api/recibos` são simulados como uma psicóloga
// com tudo preenchido (caminho `recibo_saude`), e as escritas (`PATCH /api/assistente`,
// `PUT /api/clientes`) são respondidas aqui e registradas. Mede três coisas:
//   1 · a escolha aparece no canto de cima da tela de recibos, com a frase do destino;
//   2 · tocar "Primeiro para mim" manda UM pedido com as duas chaves, e "Para o paciente" depois
//       manda só o que muda;
//   3 · a ficha do cliente tem "Dia do recibo", e escolher "Todo dia 5" manda `diaRecibo: 5`.
import { chromium, posicionais } from "./_comum.mjs";
const [modo = "desktop", pasta] = posicionais();
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const config = {
  ambiente: "producao", cnpj: null, razaoSocial: null, codigoMunicipio: null, optanteMei: false, optanteSimples: false,
  empresaId: null, certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "52998224725", ocupacaoSaude: "psicologo", registroProfissional: "CRP 06/123456",
  procuradorDocumento: "12345678000199", procuracaoValidaAte: "2027-08-25", procuracaoAceitaEm: "2026-08-26",
  inscricaoMunicipal: null, itemListaServico: null, aliquotaIss: null, codigoTributarioMunicipio: null,
};
const pagamentos = [
  { id: "p1", fonte: "atendimento", nome: "Ana Beatriz Moura", cpf: "52998224725", data: "2026-09-16", valor: 180, podeExcluir: false },
  { id: "p2", fonte: "atendimento", nome: "Bruno Carvalho", cpf: "11144477735", data: "2026-09-18", valor: 200, podeExcluir: false },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
let cfg = { confirmar: true, lembrete: true, remarcar: true, encaminhar: true, precoCatalogo: true, pix: false, encaixe: false, avisarRecibo: false, reciboPrimeiroParaMim: false };
const patches = [];
const puts = [];
await page.route("**/api/fiscal**", (r) => r.fulfill({ json: { ok: true, status: "ok", provedorFaltando: [], caminho: "recibo_saude", config, falta: [] } }));
await page.route("**/api/recibos", (r) => r.fulfill({ json: { ok: true, pagamentos, total: 380, semCpf: 0, avisos: { falhou: 0, semTelefone: 0 } } }));
await page.route("**/api/assistente", async (r) => {
  if (r.request().method() === "PATCH") {
    const corpo = JSON.parse(r.request().postData() ?? "{}");
    patches.push(corpo);
    cfg = { ...cfg, ...(corpo.cfg ?? {}) };
    return r.fulfill({ json: { ok: true, status: "ok", assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 }, cfg } });
  }
  return r.fulfill({ json: { ok: true, status: "ok", assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true, lembreteHoras: 3 }, cfg } });
});

const out = { modo };
const grupo = '[role=radiogroup][aria-label="Para onde vai o recibo"]';
const ler = () => page.evaluate((sel) => {
  const g = document.querySelector(sel);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const marcado = g.querySelector("[aria-checked=true]")?.textContent ?? null;
  const frase = g.parentElement?.querySelector(":scope > span")?.textContent ?? null;
  return { x: Math.round(r.left), y: Math.round(r.top), direita: Math.round(innerWidth - r.right), marcado, frase };
}, grupo);

await page.goto("http://localhost:3200/?tela=faturamento", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
out.antes = await ler();
if (pasta) await page.screenshot({ path: `${pasta}/destino-${modo}-antes.png` });

await page.locator(`${grupo} [role=radio]`, { hasText: "Primeiro para mim" }).click();
await page.waitForTimeout(1600);
out.depoisDeMim = await ler();
out.fraseNoCta = await page.evaluate(() => [...document.querySelectorAll("span")].map((s) => s.textContent).find((t) => t?.startsWith("Quando a Receita confirmar")) ?? null);
if (pasta) await page.screenshot({ path: `${pasta}/destino-${modo}-mim.png` });

await page.locator(`${grupo} [role=radio]`, { hasText: "Para o paciente" }).click();
await page.waitForTimeout(1600);
out.depoisDePaciente = await ler();
out.patches = [...patches];

await page.route("**/api/clientes", (r) => {
  if (r.request().method() !== "PUT") return r.continue();
  const corpo = JSON.parse(r.request().postData() ?? "{}");
  puts.push(corpo);
  return r.fulfill({ json: { ok: true, status: "ok", cliente: null } });
});
await page.goto("http://localhost:3200/?tela=clientes", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
const cl = base.clientes.find((c) => c.ativo !== false) ?? base.clientes[0];
await page.getByText(cl.nome, { exact: true }).first().click();
await page.waitForTimeout(700);
const campo = page.locator('[role=dialog] label:has(> span:text-is("Dia do recibo")) select');
out.ficha = { temCampo: (await campo.count()) > 0 };
if (out.ficha.temCampo) {
  await campo.selectOption("5");
  await page.waitForTimeout(1500);
  out.ficha.dica = await page.locator('[role=dialog] label:has(> span:text-is("Dia do recibo")) > span').last().textContent();
  out.ficha.puts = puts.map((p) => ({ diaRecibo: p.diaRecibo }));
  await campo.scrollIntoViewIfNeeded();
  if (pasta) await page.screenshot({ path: `${pasta}/dia-do-recibo-${modo}.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
