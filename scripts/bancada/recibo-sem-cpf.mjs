// recibo-sem-cpf.mjs — o grupo "Sem CPF" da emissão de recibos (1C.10), do "Pôr CPF" até a linha voltar.
//
// uso: node recibo-sem-cpf.mjs <saida-prefixo> [desktop|mobile]
//
// Monta o `recibo-cheio` do `fiscal.mjs` (34 pagamentos, 3 sem CPF: Ana Beatriz Moura, Bruno
// Carvalho e Carla Guth), põe os três no cadastro (`/api/cadastro`) e responde o `PUT /api/clientes`
// como o servidor: grava, devolve a ficha, e a próxima leitura de `/api/recibos` já traz o CPF.
// Mede: linhas do grupo, o "Pôr CPF" de cada uma, a gaveta que abre, e depois de pôr o CPF (sem
// recarregar) quantas sobram no grupo e se a pessoa virou linha marcável.
import { chromium } from "./_comum.mjs";
const [, , pre = "recibo-sem-cpf", modo = "desktop"] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const NOMES = ["Ana Beatriz Moura", "Bruno Carvalho", "Carla Guth", "Daniela Ribeiro", "Eduardo Lima", "Fernanda Souza", "Gabriel Rocha", "Helena Martins", "Igor Pereira", "Juliana Alves", "Kátia Nogueira", "Lucas Fernandes", "Mariana Costa", "Nicolas Barros", "Olívia Teixeira", "Paulo Henrique Dias", "Queila Santos", "Rafael Antunes", "Sofia Mendes", "Tiago Araújo", "Úrsula Campos", "Vinícius Prado", "Wagner Reis", "Yasmin Freitas"];
const CPFS_OK = ["52998224725", "11144477735", "12345678909", "98765432100"];
const comCpf = new Map();
function pagamentos() {
  const out = [];
  for (let i = 0; i < 34; i++) {
    /* Os três sem CPF só aparecem uma vez: o resto gira pelos outros 21 nomes. */
    const nome = i < 3 ? NOMES[i] : NOMES[3 + ((i - 3) % (NOMES.length - 3))];
    const cpf = i < 3 ? (comCpf.get(nome) ?? null) : CPFS_OK[i % 4];
    out.push({ id: `p${i}`, fonte: "atendimento", nome, cpf, data: `2026-09-${String((i % 22) + 1).padStart(2, "0")}`, valor: [180, 200, 250, 300][i % 4], podeExcluir: false });
  }
  return out;
}
const cfg = { ambiente: "producao", cnpj: null, razaoSocial: null, codigoMunicipio: null, optanteMei: false, optanteSimples: false, empresaId: null, certificadoValidoAte: null, codigoTributacaoNacional: null, prestadorCpf: "52998224725", ocupacaoSaude: "psicologo", registroProfissional: "CRP 06/123456", procuradorDocumento: "12345678000199", procuracaoValidaAte: "2027-08-25", procuracaoAceitaEm: "2026-08-26", inscricaoMunicipal: null, itemListaServico: null, aliquotaIss: null, codigoTributarioMunicipio: null };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
let leiturasDeRecibos = 0;
await page.route("**/api/fiscal**", (r) => r.request().method() !== "GET" ? r.fulfill({ json: { ok: false, info: "demo" } }) : r.fulfill({ json: { ok: true, status: "ok", provedorFaltando: [], caminho: "recibo_saude", config: cfg, falta: [] } }));
await page.route("**/api/recibos", (r) => { leiturasDeRecibos++; const p = pagamentos(); r.fulfill({ json: { ok: true, pagamentos: p, total: p.filter((x) => x.cpf).reduce((a, x) => a + x.valor, 0), semCpf: p.filter((x) => !x.cpf).length, avisos: { falhou: 0, semTelefone: 0 } } }); });
await page.route("**/api/faturamento", (r) => r.fulfill({ json: { ok: true, aFaturar: [], emitidas: [], ambiente: "producao", falta: [] } }));
await page.route("**/api/cadastro*", async (route) => {
  const r = await route.fetch(); const d = await r.json();
  const base = d.clientes[0];
  d.clientes = [...NOMES.slice(0, 3).map((nome, i) => ({ ...base, id: `sc${i}`, nome, cpf: "", telefone: `(11) 9${i}000-000${i}` })), ...d.clientes];
  await route.fulfill({ response: r, json: d });
});
await page.route("**/api/clientes", async (r) => {
  if (r.request().method() !== "PUT") return r.continue();
  const b = JSON.parse(r.request().postData() || "{}");
  if (b.cpf) comCpf.set(b.nome, b.cpf);
  r.fulfill({ json: { ok: true, cliente: { ...b, email: "", canal: "Online", ativo: true, desde: "set/2026", servicoId: "sv1", atendimentos: 1, valor: 180 } } });
});
await page.goto("http://localhost:3200/?tela=faturamento", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
const grupo = () => page.evaluate(() => {
  const g = document.querySelector('[role="group"][aria-label^="Sem CPF"]');
  const marcaveis = [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.innerText.split("\n")[0]);
  return { rotulo: g?.getAttribute("aria-label") ?? null, linhas: g ? [...g.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")) : [], anaMarcavel: marcaveis.includes("Ana Beatriz Moura"), marcaveis: marcaveis.length };
});
console.log("antes:", JSON.stringify(await grupo()));
const botao = page.getByRole("button", { name: "Pôr o CPF de Ana Beatriz Moura" });
await botao.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${pre}-${modo}-grupo.png` });
await botao.click();
await page.waitForTimeout(700);
const dlg = page.getByRole("dialog");
console.log("gaveta aberta:", await dlg.count(), "texto:", (await dlg.first().innerText()).replace(/\s+/g, " ").slice(0, 300));
const campo = dlg.getByLabel(/^CPF/);
await campo.fill("529.982.247-25");
await campo.blur();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${pre}-${modo}-ficha.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log("depois:", JSON.stringify(await grupo()), "leituras de /api/recibos:", leiturasDeRecibos);
await page.screenshot({ path: `${pre}-${modo}-depois.png` });
await browser.close();
