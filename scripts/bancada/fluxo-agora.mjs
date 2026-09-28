// fluxo-agora.mjs — o Fluxo em lista (1C.6 e 1C.7) com o relógio parado numa hora do dia.
//
// uso: node fluxo-agora.mjs <saida-prefixo> [desktop|mobile|1024] [--hora=16] [--formado] [--atendendo] [--feitos=N] [--clicar=<nome>]
//
// Monta o dia cheio do `fluxo.mjs` (15 atendimentos de 45 min, 08:00 a 18:30, 3 conversas em espera),
// com a jornada aberta (4 de 5 faltando) salvo `--formado`, e para o relógio da página em `--hora`
// (`page.clock.setFixedTime`: os timers seguem, só o Date.now congela). `--atendendo` põe o das 15:30
// em atendimento; `--feitos=N` marca os N primeiros como feitos (o aparelho guarda a etapa, então é
// localStorage). Imprime a régua do `medir.mjs` mais o que o critério pede: a faixa Agora, o próximo,
// o "Chegou" dele, linhas visíveis, a jornada.
import { chromium, medirPagina, posicionais, bandeiras } from "./_comum.mjs";
const [pre = "fluxo-agora", modo = "desktop"] = posicionais(); const flags = bandeiras();
const has = (f) => flags.includes(f);
const val = (k, d) => { const f = flags.find((x) => x.startsWith(`--${k}=`)); return f ? f.split("=")[1] : d; };
const vp = modo === "mobile" ? { width: 390, height: 844 } : modo === "1024" ? { width: 1024, height: 768 } : { width: 1440, height: 900 };
const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const hora = Number(val("hora", "16"));
const feitos = Number(val("feitos", "0"));
const nomes = ["Ana Beatriz Moura","Carlos Henrique Duarte","Juliana Paes Ferreira","Marcos Vinícius Lima","Patrícia Gomes","Rodrigo Albuquerque Neto","Fernanda Siqueira","Thiago Martins","Larissa Campos","Eduardo Pacheco","Beatriz Nogueira","Gustavo Ribeiro","Camila Rocha","Felipe Andrade","Mariana Lopes"];
const eventos = nomes.map((n, i) => {
  const ini = 8 + i * 0.75;
  return { eventoId: "ev" + i, data: hoje, inicio: ini, fim: ini + 0.75, duracao: 45, recorrente: false,
    aguardandoResposta: i % 3 === 1,
    maisa: { profissionalId: "pr1", clienteId: "", clienteNome: n, clienteTel: "5511999990000", servicoId: "sv1", servicoNome: i % 2 ? "Sessão de terapia individual (50 min)" : "Atendimento padrão", servicoValor: 100 } };
});
const agoraISO = new Date(Date.parse(`${hoje}T${String(Math.floor(hora)).padStart(2, "0")}:${String(Math.round((hora % 1) * 60)).padStart(2, "0")}:00-03:00`));
const conversas = [
  { id: "11110001", nome: "Renata Souza", telefone: "5511911110001", atualizadaEm: agoraISO.toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Oi, consigo remarcar a sessão de amanhã pra sexta de manhã?" } },
  { id: "11110002", nome: "+55 11 98888-0002", telefone: "5511988880002", atualizadaEm: agoraISO.toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Quanto custa o pacote de 4 sessões? Aceita convênio?" } },
  { id: "11110003", nome: "Paulo Mendes", telefone: "5511911110003", atualizadaEm: agoraISO.toISOString(), estado: "espera", ultima: { de: "cliente", txt: "Vou me atrasar uns 15 minutos, tudo bem?" } },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
if (has("--formado")) await ctx.addInitScript(() => localStorage.setItem("maisa.jornada.formado", "1"));
const page = await ctx.newPage();
await page.clock.setFixedTime(agoraISO);
await page.route("**/api/agenda?*", (r) => r.fulfill({ json: { ok: true, de: hoje, ate: hoje, eventos } }));
await page.route("**/api/conversas", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ok: true, status: "ok", conversas } }) : r.continue());
await page.route("**/api/ativacao*", (r) => r.fulfill({ json: { ok: true, completo: false, feitos: ["negocio_criado"], passos: ["negocio_criado", "catalogo_ajustado", "whatsapp_conectado", "primeira_conversa", "nota_fiscal_ligada"] } }));
await page.goto("http://localhost:3200/?tela=fluxo", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
// Etapas pelos botões da própria tela, que é o gesto de verdade (a ação é a irmã do nome).
async function avancar(nome, vezes) {
  for (let k = 0; k < vezes; k++) {
    const b = page.locator(`button[aria-label^="${nome},"]`).first().locator("xpath=following-sibling::button[1]");
    if (await b.count()) { await b.click(); await page.waitForTimeout(150); }
  }
}
for (let i = 0; i < feitos; i++) await avancar(nomes[i], 2);
if (has("--atendendo")) await avancar("Beatriz Nogueira", 1);
if (feitos || has("--atendendo")) { await page.mouse.move(1, 1); await page.waitForTimeout(7000); } // os toasts de "Desfazer" somem
const regua = await medirPagina(page, modo === "mobile" ? "mobile" : "desktop");
const extra = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  const faixa = document.querySelector('section[aria-label="Agora"]');
  const jornada = document.querySelector('section[aria-label^="O que falta"]');
  const gustavo = [...document.querySelectorAll("button[aria-label]")].find((b) => b.getAttribute("aria-label").startsWith("Gustavo Ribeiro,"));
  const chegouDoProximo = faixa ? [...faixa.querySelectorAll("button")].find((b) => /^(Chegou|Concluir)$/.test(b.innerText.trim())) : null;
  const linhas = [...document.querySelectorAll('main button[aria-label*=", "]')].filter((b) => !faixa?.contains(b) && b.getBoundingClientRect().height >= 50);
  const visiveis = linhas.filter((b) => { const x = b.getBoundingClientRect(); const reg = b.closest("[data-regiao]")?.getBoundingClientRect(); return x.top >= (reg?.top ?? 0) - 1 && x.bottom <= Math.min(innerHeight, reg?.bottom ?? innerHeight) + 1; });
  const feitosLinha = document.querySelector('section[aria-label="Feitos hoje"] > button');
  const botaoDentroDeBotao = document.querySelectorAll("main [role=button] button, main button button").length;
  return {
    faixa: r(faixa), jornada: r(jornada), gustavo: r(gustavo), gustavoNaFaixa: !!(gustavo && faixa?.contains(gustavo)),
    acaoDoProximo: chegouDoProximo ? { t: chegouDoProximo.innerText.trim(), ...r(chegouDoProximo) } : null,
    linhasVisiveis: visiveis.map((b) => b.getAttribute("aria-label").split(",").slice(0, 2).join(",")),
    feitosFechado: r(feitosLinha),
    passaram: document.querySelectorAll('section[aria-label="Passaram sem chegada"] button[aria-label]').length,
    botaoDentroDeBotao,
    // Regressão 2 da verificação (28/09/2026): o título do grupo grudado tem de encostar no topo da
    // região (nada do grupo aparecendo acima dele) e não pode cortar uma linha ao meio na abertura.
    grudados: (() => {
      const reg = document.querySelector("[data-regiao]");
      if (!reg) return [];
      const rr = reg.getBoundingClientRect();
      return [...reg.querySelectorAll("[data-titulo-grupo]")].map((h) => {
        const hb = h.getBoundingClientRect();
        const sec = h.parentElement.getBoundingClientRect();
        const grudado = hb.top - sec.top > 6; // o grupo tem 4px de padding: acima disso, o título saiu do lugar
        const linhas = [...h.parentElement.querySelectorAll("button[aria-label]")].filter((b) => b.getBoundingClientRect().height >= 50);
        const cortadas = grudado ? linhas.filter((b) => { const x = b.getBoundingClientRect(); return x.top < hb.bottom - 1 && x.bottom > hb.bottom + 1; }).map((b) => b.getAttribute("aria-label").split(",")[0]) : [];
        return { t: h.innerText.replace(/\s+/g, " ").trim(), grudado, folgaAcima: Math.round(hb.top - rr.top), cortadas };
      });
    })(),
  };
});
console.log(JSON.stringify({ ...regua, ...extra }, null, 1));
await page.screenshot({ path: pre + ".png" });
// `--clicar=<nome acessível>`: toca o botão e fotografa a gaveta que abrir (a fila, a jornada).
const clicar = val("clicar", null);
if (clicar) {
  await page.getByRole("button", { name: clicar }).first().click();
  await page.waitForTimeout(900);
  const dlg = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); return d ? d.innerText.replace(/\s+/g, " ").slice(0, 400) : null; });
  console.log("GAVETA", JSON.stringify(dlg), "URL", page.url());
  await page.screenshot({ path: pre + "-clique.png" });
}
await browser.close();
