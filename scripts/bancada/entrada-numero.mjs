// entrada-numero.mjs — o wizard pergunta de quem é o número e diz por que a MAISA calou (1A.15).
//
// uso: node entrada-numero.mjs <saida-prefixo> [desktop|mobile] [pergunta|calada]
//
// `pergunta`: etapa 3 com o pareamento voltando `conectado` na hora; conta se "Continuar" existe
//   antes de escolher, escolhe "É meu número pessoal também", conta os PATCH /api/contatos (e o
//   corpo), clica em "Trazer meus contatos" (POST devolve 374 de 1840) e confere o "Continuar".
// `calada`: etapa 4 com o laboratório devolvendo `bolhas: []` e um `motivo`; manda uma mensagem
//   e mostra o que a tela escreveu.
// Tudo por `page.route`: nada sai do navegador.
import { chromium, posicionais } from "./_comum.mjs";

const [pre, modo = "desktop", caso = "pergunta"] = posicionais();
const vp = modo === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, isMobile: modo === "mobile", hasTouch: modo === "mobile" });
const erros = [];
page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));
const ok = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: "ok", ...body }) });
const rota = (p, fn) => page.route(p, async (r) => { const x = await fn(r.request()); return x === undefined ? r.continue() : r.fulfill(x); });

const patches = [];
const feitos = caso === "pergunta" ? ["negocio_criado", "catalogo_ajustado"] : ["negocio_criado", "catalogo_ajustado", "whatsapp_conectado", "agenda_conectada"];
await rota("**/api/ativacao*", () => ok({ feitos, porcentagem: 0, completo: false }));
await rota("**/api/assistente*", () => ok({ assistente: { nome: "MAISA", ativa: true }, cfg: {} }));
await rota("**/api/contatos", (req) => {
  if (req.method() === "PATCH") { patches.push(req.postData()); return ok({ modo: JSON.parse(req.postData() || "{}").modo }); }
  if (req.method() === "POST") return ok({ novos: 374, total: 374, lidos: 1840 });
  return ok({ modo: "pessoal", contatos: [] });
});
if (caso === "pergunta") {
  await rota("**/api/canal", (req) => req.method() === "POST"
    ? ok({ pareamento: { status: "conectado", numero: "5511994294906" } })
    : ok({ canal: { status: "desconectado" } }));
} else {
  await rota("**/api/canal", () => ok({ canal: { status: "conectado", numero: "5511994294906" } }));
  await rota("**/api/laboratorio", (req) => req.method() === "POST"
    ? ok({ bolhas: [], escalou: false, motivo: "Número novo, mas a mensagem não é um pedido claro de horário. No seu número pessoal a MAISA só entra quando a pessoa quer marcar.", trilha: [] })
    : ok({ pronto: true, agenda: "tabela", exemplo: { servico: "Sessão individual", profissional: "Carla" } }));
}

await page.goto("http://localhost:3200/comecar", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
const conta = (re) => page.evaluate((re) => [...document.querySelectorAll("button")].filter((b) => new RegExp(re).test(b.innerText) && b.getBoundingClientRect().width > 0).length, re);

if (caso === "pergunta") {
  const gerar = page.getByText("Gerar QR code");
  if (await gerar.count()) await gerar.first().click();
  else {
    /* No celular o caminho padrão é o código: número, "Receber código", confirmar. */
    await page.fill('input[inputmode="tel"]', "11994294906");
    await page.getByText("Receber código").click();
    await page.waitForTimeout(400);
    const conf = page.locator("button", { hasText: /enviar/i });
    if (await conf.count()) await conf.first().click();
  }
  await page.waitForTimeout(1200);
  console.log("conectado:", await page.getByText("WhatsApp conectado").count(), " Continuar antes de escolher:", await conta("^Continuar$"), " pergunta:", await page.getByText("De quem é esse número?").count());
  await page.screenshot({ path: `${pre}-1-pergunta.png` });
  await page.getByText("É meu número pessoal também").click();
  await page.waitForTimeout(900);
  console.log("PATCH /api/contatos:", patches.length, patches.join(" "), " Continuar:", await conta("^Continuar$"), " Trazer:", await conta("Trazer meus contatos"));
  await page.screenshot({ path: `${pre}-2-pessoal.png` });
  await page.getByText("Trazer meus contatos").click();
  await page.waitForTimeout(900);
  console.log("depois de trazer:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[role=status]")].map((e) => e.innerText))));
  await page.screenshot({ path: `${pre}-3-trouxe.png`, fullPage: true });
} else {
  const campo = page.locator("textarea, input[type=text], input:not([type])").last();
  await campo.fill("oi, tudo bem?");
  await campo.press("Enter");
  await page.waitForTimeout(1500);
  const falas = await page.evaluate(() => document.body.innerText.split("\n").filter((l) => /calada|oi, tudo bem/i.test(l)));
  console.log("falas:", JSON.stringify(falas));
  await page.screenshot({ path: `${pre}-calada.png` });
}
console.log("erros:", JSON.stringify(erros));
await browser.close();
