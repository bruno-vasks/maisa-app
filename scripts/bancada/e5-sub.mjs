// e5-sub.mjs: 1B.14. A frase do "Decidir depois" da etapa 5 para cada uso do WhatsApp (agente,
// só lembrete, nada), com /api simulada no navegador. Pula a etapa 4 se a chave do modelo faltar.
import { chromium } from "./_comum.mjs";
for (const [ativa, lembrete] of [[false, false], [false, true], [true, true]]) {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ok = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: "ok", ...body }) });
  await p.route("**/api/ativacao*", (r) => r.fulfill(ok({ feitos: ["negocio_criado", "catalogo_ajustado", "whatsapp_conectado"], porcentagem: 0, completo: false })));
  await p.route("**/api/assistente*", (r) => r.fulfill(ok({ assistente: { nome: "MAISA", ativa }, cfg: { lembrete } })));
  await p.route("**/api/fiscal*", (r) => r.fulfill(ok({ falta: ["cnpj"], provedorFaltando: [], caminho: "municipal", config: { empresaId: null, prestadorCpf: null, cnpj: null } })));
  await p.goto("http://localhost:3200/comecar", { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(1000);
  const pular = p.getByRole("button", { name: "Pular este passo" }); if (await pular.count()) { await pular.click(); await p.waitForTimeout(1000); }
  const sub = await p.getByText("Decidir depois, na tela Fiscal").locator("xpath=following-sibling::span").textContent().catch(() => null);
  console.log(JSON.stringify({ ativa, lembrete, h1: await p.locator("h1").textContent(), sub }));
  await b.close();
}
