/* ─────────────────────────────────────────────────────────────────────────────
 * O ASAAS FALSO — um `fetch` com estado, para os testes (27/10/2026).
 *
 * O par do `smiller/.localdb/dev/subconta/asaas-falso.mjs`, sem servidor: responde como a API v3
 * nas rotas que o adaptador usa. Subconta só com a chave da plataforma; situação e documentos pela
 * chave da subconta; `semChave` (a resposta sem `apiKey`, como sem o acordo BaaS) e `baas` (com ou
 * sem link de envio de documento) mudam o comportamento; `aprovar`, `enviarDocumentos` e `pagar`
 * fazem o papel do titular e do cliente. Só o teste importa.
 * ────────────────────────────────────────────────────────────────────────────── */

export const CHAVE_DA_PLATAFORMA = "$aact_plataforma";

type Conta = { id: string; chave: string; status: Record<string, string> };

export function criarAsaasFalso(opcoes: { semChave?: boolean; baas?: boolean } = {}) {
  const config = { semChave: false, baas: true, ...opcoes };
  const contas: Conta[] = [];
  const clientes: { id: string; dono: string; cpfCnpj: string }[] = [];
  const cobrancas: Record<string, any> = {};
  const webhooks: { id: string; dono: string; url: string; authToken: string }[] = [];
  const registro: string[] = [];
  let n = 0;

  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

  const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const c = u.pathname.replace(/^\/api/, "").replace(/^\/v3/, "");
    const metodo = init?.method ?? "GET";
    const chave = new Headers(init?.headers).get("access_token") ?? "";
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    registro.push(`${metodo} ${c}`);

    if (c === "/accounts" && metodo === "POST") {
      if (chave !== CHAVE_DA_PLATAFORMA) return json({}, 401);
      for (const campo of ["name", "email", "cpfCnpj", "mobilePhone", "incomeValue", "address", "addressNumber", "province", "postalCode"]) {
        if (!corpo[campo]) return json({ errors: [{ description: `O campo ${campo} é obrigatório.` }] }, 400);
      }
      if (!/^\d{8}$/.test(corpo.postalCode)) return json({ errors: [{ description: "O CEP informado é inválido." }] }, 400);
      const conta: Conta = {
        id: `acc_${++n}`,
        chave: `$aact_sub_${n}`,
        status: { commercialInfo: "PENDING", bankAccountInfo: "PENDING", documentation: "PENDING", general: "PENDING" },
      };
      contas.push(conta);
      return json({ id: conta.id, walletId: `wal_${n}`, accessToken: config.semChave ? { id: "tk" } : { id: "tk", apiKey: conta.chave } });
    }

    const dona = contas.find((x) => x.chave === chave);
    if (!dona) return json({}, 401);

    if (c === "/myAccount/status") return json(dona.status);
    if (c === "/myAccount/documents") {
      const enviado = dona.status.documentation !== "PENDING";
      return json({ data: enviado ? [] : [{ id: `doc_${dona.id}`, status: "NOT_SENT", type: "IDENTIFICATION", ...(config.baas ? { onboardingUrl: `https://asaas.falso/onboarding/${dona.id}` } : {}) }] });
    }
    if (c === "/webhooks" && metodo === "GET") return json({ data: webhooks.filter((w) => w.dono === chave) });
    if (c === "/webhooks" && metodo === "POST") {
      const w = { id: `wh_${++n}`, dono: chave, url: corpo.url, authToken: corpo.authToken };
      webhooks.push(w);
      return json(w);
    }
    const apagar = c.match(/^\/webhooks\/(.+)$/);
    if (apagar && metodo === "DELETE") {
      const i = webhooks.findIndex((w) => w.id === apagar[1]);
      if (i >= 0) webhooks.splice(i, 1);
      return json({ deleted: true });
    }
    if (c === "/customers" && metodo === "GET") {
      return json({ data: clientes.filter((x) => x.dono === chave && x.cpfCnpj === u.searchParams.get("cpfCnpj")) });
    }
    if (c === "/customers" && metodo === "POST") {
      const cli = { id: `cus_${++n}`, dono: chave, cpfCnpj: corpo.cpfCnpj };
      clientes.push(cli);
      return json(cli);
    }
    if (c === "/payments" && metodo === "POST") {
      const id = `pay_${++n}`;
      cobrancas[id] = { ...corpo, id, dono: chave, status: "PENDING", invoiceUrl: `https://asaas.falso/i/${id}` };
      return json(cobrancas[id]);
    }
    const pix = c.match(/^\/payments\/([^/]+)\/pixQrCode$/);
    if (pix) return cobrancas[pix[1]] ? json({ payload: `00020126pix-${pix[1]}` }) : json({}, 404);
    const pay = c.match(/^\/payments\/([^/]+)$/);
    if (pay && metodo === "DELETE") {
      if (!cobrancas[pay[1]]) return json({}, 404);
      delete cobrancas[pay[1]];
      return json({ deleted: true });
    }
    return json({ errors: [{ description: `rota falsa sem resposta: ${metodo} ${c}` }] }, 404);
  }) as typeof fetch;

  return {
    fetch: fetchFalso,
    registro,
    contas,
    cobrancas,
    webhooks,
    /** O titular mandou os documentos (a conta vai para análise). */
    enviarDocumentos(idConta: string) {
      Object.assign(contas.find((c) => c.id === idConta)!.status, { documentation: "AWAITING_APPROVAL", general: "AWAITING_APPROVAL" });
    },
    aprovar(idConta: string) {
      Object.assign(contas.find((c) => c.id === idConta)!.status, { commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED", general: "APPROVED" });
    },
    /** O cliente pagou: o aviso que o Asaas mandaria, e para onde, com o token. */
    pagar(idCobranca: string) {
      const p = cobrancas[idCobranca];
      const w = [...webhooks].reverse().find((x) => x.dono === p.dono)!;
      return {
        url: w.url,
        token: w.authToken,
        corpo: { event: "PAYMENT_RECEIVED", payment: { id: p.id, externalReference: p.externalReference, value: p.value, billingType: "PIX", clientPaymentDate: "2026-10-27" } },
      };
    },
  };
}
