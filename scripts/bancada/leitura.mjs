// leitura.mjs — a tela antes, durante e depois de as leituras voltarem (T3 e T4 do backlog do front).
//
// uso: node leitura.mjs <tela> <saida-prefixo> [desktop|mobile] [opções]
//   --atraso=<ms>          segura /api/agenda, /api/conversas, /api/contatos, /api/canal, /api/assistente e /api/horarios
//   --canal=conectado|desconectado|falha|real     (padrão: real, que no demo é login_necessario)
//   --ativa=false          o interruptor da MAISA volta desligado
//   --agenda=vazia|cheia|erro|real                (padrão: real)
//   --conversas=vazia|cheia|erro|real             (padrão: real, que no demo é [])
//   --contatos=pessoal|negocio|vazio|erro|real    (padrão: real, que no demo é login_necessario)
//   --erro                 todas as leituras acima falham (ok:false, status "erro")
//   --clicar=<texto>       depois de tudo voltar, clica no primeiro botão com esse texto e fotografa de novo
//
// Imprime, em cada instante da amostra (150, 600, 1200 ms e depois do atraso), quais frases
// PROIBIDAS antes de saber estão visíveis, e o texto do cabeçalho. Fotografa o fim.
import { chromium, posicionais, bandeiras } from "./_comum.mjs";

const [tela, pre, modo = "desktop"] = posicionais(); const flags = bandeiras();
const opt = (k, pad) => (flags.find((f) => f.startsWith(`--${k}=`)) ?? `=${pad}`).split("=")[1];
const has = (f) => flags.includes(f);
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const atraso = Number(opt("atraso", "0"));
const tudoFalha = has("--erro");

const PROIBIDAS = [
  "Nenhum atendimento", "0 atendimentos", "Nada marcado", "Dia livre", "Nada pendente",
  "só do negócio", "Seus contatos ainda não estão aqui", "Conectar WhatsApp", "Conectar o WhatsApp",
  "no ar", "Atendendo", "Assistente ativa", "responde automaticamente", "resolvendo tudo sozinha",
];

const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const eventos = ["Ana Beatriz Moura", "Carlos Henrique Duarte", "Juliana Paes"].map((n, i) => ({
  eventoId: "ev" + i, data: hoje, inicio: 9 + i, fim: 10 + i, duracao: 60, recorrente: false, aguardandoResposta: false,
  maisa: { profissionalId: "pr1", clienteId: "", clienteNome: n, clienteTel: "5511999990000", servicoId: "sv1", servicoNome: "Atendimento padrão", servicoValor: 180 },
}));
const canalDe = (status) => ({ status, instancia: "demo", numero: status === "conectado" ? "5511994294906" : null, conectadoEm: null, telefoneDono: null });
const falha = { ok: false, status: "erro", info: "Sem conexão" };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
const espera = () => (atraso ? new Promise((x) => setTimeout(x, atraso)) : null);

async function servir(r, escolha, montar) {
  if (r.request().method() !== "GET") return r.continue();
  await espera();
  if (tudoFalha) return r.fulfill({ json: falha });
  if (escolha === "real") return r.continue();
  if (escolha === "erro" || escolha === "falha") return r.fulfill({ json: falha });
  return r.fulfill({ json: montar(escolha) });
}

await page.route("**/api/canal", (r) => servir(r, opt("canal", "real"), (c) => ({ ok: true, status: "ok", canal: canalDe(c), faltando: [] })));
await page.route("**/api/agenda?*", (r) => servir(r, opt("agenda", "real"), (c) => ({ ok: true, de: hoje, ate: hoje, eventos: c === "cheia" ? eventos : [] })));
await page.route("**/api/conversas", (r) => servir(r, opt("conversas", "real"), (c) => ({
  ok: true, status: "ok",
  conversas: c === "cheia" ? [{ id: "1", nome: "Renata Souza", telefone: "5511911110001", atualizadaEm: new Date().toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Consigo remarcar?" } }] : [],
})));
await page.route("**/api/contatos", (r) => servir(r, opt("contatos", "real"), (c) => ({
  ok: true, status: "ok", modo: c === "pessoal" ? "pessoal" : "negocio",
  contatos: c === "vazio" ? [] : [{ telefone: "5511911110001", nome: "Renata Souza", cliente: false }],
})));
await page.route("**/api/assistente", async (r) => {
  if (r.request().method() !== "GET") return r.continue();
  await espera();
  if (tudoFalha) return r.fulfill({ json: falha });
  const resp = await r.fetch();
  const j = await resp.json();
  if (opt("ativa", "true") === "false" && j.assistente) j.assistente.ativa = false;
  r.fulfill({ json: j });
});
await page.route("**/api/horarios", async (r) => {
  if (r.request().method() !== "GET") return r.continue();
  await espera();
  if (tudoFalha) return r.fulfill({ json: falha });
  r.continue();
});

const url = tela.startsWith("/") ? `http://localhost:3200${tela}` : `http://localhost:3200/?tela=${tela}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

async function amostra(rotulo) {
  const r = await page.evaluate((proibidas) => {
    const txt = document.body.innerText;
    const cab = document.querySelector("header")?.innerText.replace(/\s+/g, " ").trim() ?? "";
    const achou = proibidas.filter((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(txt));
    const tentar = [...document.querySelectorAll("button")].filter((b) => /Tentar de novo/.test(b.innerText)).length;
    const ocupado = document.querySelectorAll("[aria-busy=true]").length;
    const entrar = [...document.querySelectorAll("button")].filter((b) => b.innerText.trim() === "Entrar").length;
    const falhas = [...document.querySelectorAll("[role=status]")].map((e) => e.innerText.split("\n")[0]).filter(Boolean).slice(0, 4);
    return { achou, tentar, entrar, ocupado, falhas, cab: cab.slice(0, 120) };
  }, PROIBIDAS);
  console.log(`${rotulo.padEnd(10)} t=${String(Date.now() - t0).padStart(5)}ms  proibidas=${JSON.stringify(r.achou)}  tentar=${r.tentar}  entrar=${r.entrar}  aria-busy=${r.ocupado}  falhas=${JSON.stringify(r.falhas)}  cabeçalho="${r.cab}"`);
}

for (const ms of [150, 600, 1200]) {
  const falta = ms - (Date.now() - t0);
  if (falta > 0) await page.waitForTimeout(falta);
  await amostra(`${ms}ms`);
}
if (atraso) await page.waitForTimeout(Math.max(0, atraso + 1500 - (Date.now() - t0)));
else await page.waitForTimeout(1500);
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(600);
await amostra("depois");
await page.screenshot({ path: `${pre}.png` });

const clicar = opt("clicar", "");
if (clicar) {
  await page.getByRole("button", { name: clicar }).first().click();
  await page.waitForTimeout(700);
  await amostra("clicou");
  await page.screenshot({ path: `${pre}-clicou.png` });
}
await browser.close();
console.log("ok", pre);
