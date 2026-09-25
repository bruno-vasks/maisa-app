// gaveta.mjs — o rodapé da gaveta com as ações reais (T6): cabe no painel? o destrutivo pede dois toques?
// uso: node gaveta.mjs <atendimento|servico|cliente|profissional> <saida.png> [desktop|mobile|WxH]
//
// `atendimento`: o de hoje com Meet e Google de uma cliente que tem conversa (as cinco ações que
// cortavam a 390 e a 680: Dar chegada, Abrir conversa, Enviar link, Abrir no Google, Cancelar).
// Mede os botões contra a borda do painel, abre "Mais ações", toca em "Cancelar atendimento" e diz
// se "Não dá para desfazer" está na tela sem rolar. `servico`: conta botões com fundo --primary e
// toca UMA vez em "Excluir serviço" (os DELETE são contados, e respondidos aqui, nunca no demo).
// Nada sai do navegador: cadastro, agenda, Google, conversas e o DELETE são simulados.
import { chromium } from "./_comum.mjs";
const [, , cenario = "atendimento", saida = "/tmp/gaveta.png", modo = "desktop"] = process.argv;
const vp = modo === "mobile" ? { width: 390, height: 844 } : modo === "desktop" ? { width: 1440, height: 900 } : { width: +modo.split("x")[0], height: +modo.split("x")[1] };
const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

const base = await (await fetch("http://localhost:3200/api/cadastro")).json();
const cl = base.clientes[0]; const sv = base.servicos[0];
const ev = { eventoId: "ev-hoje", data: HOJE, inicio: 21, fim: 21 + sv.duracao / 60, duracao: sv.duracao, titulo: "x",
  meetLink: "https://meet.google.com/abc-defg-hij", htmlLink: "https://calendar.google.com", recorrente: false,
  maisa: { ag: "m1", profissionalId: base.agendas[0], clienteId: cl.id, clienteNome: cl.nome, clienteTel: cl.telefone, servicoId: sv.id, servicoNome: sv.nome, servicoValor: sv.preco } };
const conversa = { id: "10001111", nome: cl.nome, telefone: "5511910001111", clienteId: cl.id, atualizadaEm: new Date().toISOString(), estado: "maisa", ultima: { de: "cliente", txt: "oi", em: new Date().toISOString() } };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const deletes = [];
await page.route("**/api/cadastro", (r) => r.fulfill({ json: base }));
await page.route("**/api/agenda?*", (r) => { const u = new URL(r.request().url()); r.fulfill({ json: { ok: true, status: "ok", de: u.searchParams.get("de"), ate: u.searchParams.get("ate"), eventos: [ev] } }); });
await page.route("**/api/google/status", (r) => r.fulfill({ json: { status: "ok", conexoes: [{ profissionalId: base.agendas[0], googleEmail: "rafael@gmail.com" }] } }));
await page.route("**/api/conversas**", (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, status: "ok", conversas: [conversa], conversa, msgs: [] } }));
await page.route("**/api/servicos**", (r) => { if (r.request().method() === "DELETE") { deletes.push(r.request().url()); return r.fulfill({ json: { ok: true } }); } return r.continue(); });

const tela = { atendimento: "agenda", servico: "servicos", cliente: "clientes", profissional: "equipe" }[cenario];
await page.goto(`http://localhost:3200/?tela=${tela}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
if (cenario === "atendimento") await page.locator(`[aria-label^="${cl.nome}"], button:has-text("${cl.nome}")`).first().click();
if (cenario === "servico") await page.getByText(sv.nome, { exact: true }).first().click();
if (cenario === "cliente") await page.getByText(cl.nome, { exact: true }).first().click();
if (cenario === "profissional") await page.getByText(base.profissionais[0].nome, { exact: true }).first().click();
await page.waitForTimeout(700);

const medir = () => page.evaluate(() => {
  const dlg = document.querySelector("[role=dialog]");
  if (!dlg) return null;
  const sonda = document.createElement("div"); sonda.style.background = "var(--primary)"; document.body.appendChild(sonda);
  const azul = getComputedStyle(sonda).backgroundColor; sonda.remove();
  const lim = dlg.getBoundingClientRect();
  const botoes = [...dlg.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim() || b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), direita: Math.round(r.right), cortado: r.right > lim.right + 1 || r.right > innerWidth || r.left < lim.left - 1, azul: getComputedStyle(b).backgroundColor === azul }; });
  const fechar = dlg.querySelector('button[aria-label="Fechar"]'); const fr = fechar?.getBoundingClientRect();
  const av = [...dlg.querySelectorAll("*")].find((e) => e.children.length === 0 && /Não dá para desfazer/.test(e.textContent));
  const ar = av?.getBoundingClientRect();
  const rolavel = [...dlg.querySelectorAll("*")].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  return {
    painel: { left: Math.round(lim.left), right: Math.round(lim.right), top: Math.round(lim.top), bottom: Math.round(lim.bottom) },
    botoes, cortados: botoes.filter((b) => b.cortado).length, azuis: botoes.filter((b) => b.azul).map((b) => b.t),
    fechar: fr ? { w: Math.round(fr.width), h: Math.round(fr.height), visivel: fr.top >= 0 && fr.bottom <= innerHeight } : null,
    alca: [...dlg.querySelectorAll("span")].some((s) => s.style.width === "42px" && s.style.height === "5px"),
    avisoDePerigo: ar ? { top: Math.round(ar.top), bottom: Math.round(ar.bottom), visivel: ar.top >= lim.top && ar.bottom <= Math.min(lim.bottom, innerHeight), dentroDaRolagem: !!rolavel?.contains(av), scrollTop: rolavel?.scrollTop ?? 0 } : null,
  };
});

const out = { cenario, vp, antes: await medir() };
const destrutivo = { atendimento: "Cancelar atendimento", servico: "Excluir serviço", cliente: "Tirar de atendimento" }[cenario];
if (destrutivo) {
  await page.getByRole("button", { name: "Mais ações" }).click(); await page.waitForTimeout(300);
  out.menu = await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: Math.round(r.height), dentro: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }));
  await page.screenshot({ path: saida.replace(/\.png$/, "-menu.png") });
  await page.getByRole("menuitem", { name: destrutivo }).click(); await page.waitForTimeout(400);
  out.depoisDeUmToque = await medir();
  out.deletesDepoisDeUmToque = deletes.length;
  out.dialogoAindaAberto = await page.locator("[role=dialog]").count();
}
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: saida });
await browser.close();
