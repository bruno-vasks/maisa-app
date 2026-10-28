/* ─────────────────────────────────────────────────────────────────────────────
 * O CLIENTE HTTP DO ASAAS — reaproveitado do Smiller (27/10/2026).
 *
 * Veio de `smiller/.../_shared/cobranca/asaas.ts`, que foi escrito para atravessar produto: só
 * `fetch`, e a conta (ambiente e chave) passada em cada chamada. Aqui ele é peça INTERNA do
 * adaptador: o núcleo nunca vê chave nenhuma, e quem implementa a porta da MAISA
 * (`ProvedorDeRecebimentos`) é `recebimentos-asaas.ts`, que acha a chave no cofre.
 *
 * Ficaram de fora o "validar chave própria" e o "alterar cobrança" do Smiller: na MAISA a conta é
 * sempre a subconta que a plataforma abre (o profissional não vê o Asaas), e a cobrança do
 * atendimento não muda de valor depois de sair.
 *
 * Doc: https://docs.asaas.com/reference. As decisões que valem lembrar (todas do Smiller, e todas
 * confirmadas lá contra o sandbox ou a documentação):
 *   · `billingType: UNDEFINED`: o cliente escolhe na página do Asaas (Pix, boleto ou cartão);
 *   · `notificationDisabled`: quem avisa o cliente é a MAISA, pelo WhatsApp. Com o Asaas
 *     mandando e-mail e SMS junto, a cobrança chega dobrada;
 *   · o cliente do Asaas é achado pelo CPF antes de criar: um cadastro por documento;
 *   · o Pix copia e cola é buscado depois, e falha nele não derruba a emissão (o link basta);
 *   · a chave da subconta só vem na resposta da criação (`accessToken.apiKey`). Sem o modelo
 *     BaaS habilitado no acordo com o Asaas, ela pode não vir, e isso é dito em vez de fingido;
 *   · o aviso de pagamento vem em fila sequencial: quem recebe responde 200 para o que não é com
 *     ele, senão a fila da conta para;
 *   · reconectar muda o token do aviso: o antigo, da mesma URL, sai antes de entrar o novo.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Ambiente = "sandbox" | "producao";

/** A conta no Asaas, para uma chamada. A chave nunca sai do adaptador. */
export type ContaAsaas = { ambiente: Ambiente; chave: string };

export type DadosDoTitular = {
  /** CPF (11) ou CNPJ (14), só dígitos. */
  documento: string;
  /** Nome completo (CPF) ou razão social (CNPJ). */
  nome: string;
  email: string;
  /** Celular com DDD. */
  celular: string;
  cep: string;
  /** Rua, sem o número. */
  endereco: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  /** Faturamento mensal aproximado, em reais. O Asaas exige. */
  faturamentoMensal: number;
  /** AAAA-MM-DD. Só para CPF. */
  nascimento?: string | null;
  /** Só para CNPJ. */
  tipoDeEmpresa?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION" | null;
};

export type ContaAberta = { chave: string; idConta: string; walletId: string | null };

export type SituacaoAsaas = "pendente" | "em_analise" | "aprovada" | "recusada";
export type Pendencia = { titulo: string; link: string | null };

export type PedidoAsaas = {
  /** Nossa chave da cobrança (o id do recebimento). Volta no aviso de pagamento. */
  referencia: string;
  valor: number;
  /** AAAA-MM-DD. O Asaas recusa vencimento no passado. */
  vencimento: string;
  descricao: string;
  pagador: { nome: string; documento: string; telefone: string | null; referencia: string };
  /** Parte que vai para a carteira da plataforma (split). Sem isto, nada é repartido. */
  taxaDaPlataforma?: { walletId: string; fixo?: number; percentual?: number } | null;
};

export type CobrancaAsaas = { idExterno: string; link: string; pixCopiaECola: string | null };

export type EventoAsaas =
  | { tipo: "paga"; idExterno: string; referencia: string | null; valorPago: number; pagoEm: string }
  | { tipo: "estornada" | "cancelada"; idExterno: string; referencia: string | null }
  | { tipo: "ignorado"; evento: string };

/** Erro do Asaas com a frase dele, para a tela mostrar o motivo de verdade. */
export class FalhaNoAsaas extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = "FalhaNoAsaas";
  }
}

const BASE: Record<Ambiente, string> = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  producao: "https://api.asaas.com/v3",
};

/** Os eventos que mudam alguma coisa aqui. O resto é aceito e ignorado. */
export const EVENTOS_ASSINADOS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_REFUNDED", "PAYMENT_DELETED"] as const;

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
/** Telefone sem o 55 do país: o Asaas quer DDD + número. */
const semPais = (v: string | null | undefined) => soDigitos(v).replace(/^55(?=\d{10,11}$)/, "");

type Taxa = NonNullable<PedidoAsaas["taxaDaPlataforma"]>;
const temTaxa = (t: PedidoAsaas["taxaDaPlataforma"]): t is Taxa => !!t && !!t.walletId && !!(t.fixo || t.percentual);

/** `base` troca a URL de um ambiente (o teste contra um Asaas falso). Em produção, ninguém passa. */
export function criarClienteAsaas(opcoes: { fetch?: typeof fetch; base?: Partial<Record<Ambiente, string>> } = {}) {
  const f: typeof fetch = opcoes.fetch ?? ((...a) => fetch(...a));
  const bases = { ...BASE, ...opcoes.base };

  async function chamar<T>(conta: ContaAsaas, metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await f(`${bases[conta.ambiente]}${caminho}`, {
        method: metodo,
        headers: { access_token: conta.chave, "Content-Type": "application/json", "User-Agent": "maisa" },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
    } catch (e) {
      throw new FalhaNoAsaas(`Não foi possível falar com o Asaas: ${String(e)}`);
    }
    const texto = await res.text();
    let dados: any = {};
    try {
      dados = texto ? JSON.parse(texto) : {};
    } catch {
      dados = {};
    }
    if (!res.ok) {
      if (res.status === 401) throw new FalhaNoAsaas("O Asaas recusou a chave de API (confira a chave e o ambiente).", 401);
      const motivo = Array.isArray(dados?.errors) ? dados.errors.map((e: any) => e?.description).filter(Boolean).join(" ") : "";
      throw new FalhaNoAsaas(motivo || `O Asaas respondeu ${res.status}.`, res.status);
    }
    return dados as T;
  }

  async function clienteDe(conta: ContaAsaas, p: PedidoAsaas["pagador"]): Promise<string> {
    const documento = soDigitos(p.documento);
    const achados = await chamar<{ data?: { id: string; deleted?: boolean }[] }>(conta, "GET", `/customers?cpfCnpj=${documento}&limit=1`);
    const existente = achados.data?.find((c) => !c.deleted);
    if (existente) return existente.id;
    const telefone = semPais(p.telefone);
    const criado = await chamar<{ id: string }>(conta, "POST", "/customers", {
      name: p.nome,
      cpfCnpj: documento,
      ...(telefone ? { mobilePhone: telefone } : {}),
      externalReference: p.referencia,
      notificationDisabled: true,
    });
    return criado.id;
  }

  return {
    /** Pede ao Asaas para avisar os pagamentos nesta URL, com este token no cabeçalho. */
    async registrarAviso(conta: ContaAsaas, aviso: { url: string; token: string; email: string }): Promise<void> {
      const atuais = await chamar<{ data?: { id: string; url?: string }[] }>(conta, "GET", "/webhooks");
      for (const w of atuais.data ?? []) {
        if (w.url === aviso.url) await chamar(conta, "DELETE", `/webhooks/${encodeURIComponent(w.id)}`);
      }
      await chamar(conta, "POST", "/webhooks", {
        name: "MAISA — baixa automática",
        url: aviso.url,
        email: aviso.email,
        enabled: true,
        interrupted: false,
        authToken: aviso.token,
        sendType: "SEQUENTIALLY",
        events: EVENTOS_ASSINADOS,
      });
    },

    async emitir(conta: ContaAsaas, pedido: PedidoAsaas): Promise<CobrancaAsaas> {
      const customer = await clienteDe(conta, pedido.pagador);
      const taxa = pedido.taxaDaPlataforma;
      const cobranca = await chamar<{ id: string; invoiceUrl: string }>(conta, "POST", "/payments", {
        customer,
        billingType: "UNDEFINED",
        value: pedido.valor,
        dueDate: pedido.vencimento,
        description: pedido.descricao.slice(0, 500),
        externalReference: pedido.referencia,
        ...(temTaxa(taxa)
          ? {
              split: [{
                walletId: taxa.walletId,
                ...(taxa.fixo ? { fixedValue: taxa.fixo } : {}),
                ...(taxa.percentual ? { percentualValue: taxa.percentual } : {}),
              }],
            }
          : {}),
      });
      const pix = await chamar<{ payload?: string }>(conta, "GET", `/payments/${cobranca.id}/pixQrCode`).catch(() => null);
      return { idExterno: cobranca.id, link: cobranca.invoiceUrl, pixCopiaECola: pix?.payload ?? null };
    },

    async cancelar(conta: ContaAsaas, idExterno: string): Promise<void> {
      try {
        await chamar(conta, "DELETE", `/payments/${encodeURIComponent(idExterno)}`);
      } catch (e) {
        /* Já removida no painel do Asaas: o que se queria já aconteceu. */
        if (e instanceof FalhaNoAsaas && e.status === 404) return;
        throw e;
      }
    },

    /** Abre a subconta no documento do profissional, com a chave da PLATAFORMA. */
    async abrirConta(plataforma: ContaAsaas, d: DadosDoTitular): Promise<ContaAberta> {
      const documento = soDigitos(d.documento);
      const criada = await chamar<{ id?: string; walletId?: string; accessToken?: { apiKey?: string } }>(plataforma, "POST", "/accounts", {
        name: d.nome,
        email: d.email,
        cpfCnpj: documento,
        mobilePhone: semPais(d.celular),
        incomeValue: d.faturamentoMensal,
        address: d.endereco,
        addressNumber: d.numero,
        province: d.bairro,
        postalCode: soDigitos(d.cep),
        ...(d.complemento ? { complement: d.complemento } : {}),
        /* Data de nascimento só para pessoa física; tipo da empresa, só para jurídica. */
        ...(documento.length === 11 && d.nascimento ? { birthDate: d.nascimento } : {}),
        ...(documento.length === 14 && d.tipoDeEmpresa ? { companyType: d.tipoDeEmpresa } : {}),
      });
      if (!criada.id) throw new FalhaNoAsaas("O Asaas não confirmou a abertura da conta.");
      const chave = criada.accessToken?.apiKey;
      if (!chave) {
        throw new FalhaNoAsaas(
          `A conta foi criada no Asaas (${criada.id}), mas ele não liberou a chave de API. Isso depende do acordo BaaS da plataforma com o Asaas.`,
        );
      }
      return { chave, idConta: criada.id, walletId: criada.walletId ?? null };
    },

    /** Em que pé está a subconta e o que falta enviar, com a chave DELA. */
    async situacaoDaConta(conta: ContaAsaas): Promise<{ situacao: SituacaoAsaas; pendencias: Pendencia[] }> {
      const st = await chamar<{ commercialInfo?: string; bankAccountInfo?: string; documentation?: string; general?: string }>(conta, "GET", "/myAccount/status");
      if (st.general === "APPROVED") return { situacao: "aprovada", pendencias: [] };
      if (st.general === "REJECTED" || st.commercialInfo === "REJECTED" || st.bankAccountInfo === "REJECTED") {
        return { situacao: "recusada", pendencias: [] };
      }
      const faltaDocumento = st.documentation === "PENDING" || st.documentation === "REJECTED";
      if (!faltaDocumento) return { situacao: "em_analise", pendencias: [] };

      /* Os documentos pendentes só aparecem uns 15 s depois da abertura. */
      let pendencias: Pendencia[] = [];
      try {
        const docs = await chamar<{ data?: { status?: string; type?: string; description?: string; onboardingUrl?: string | null }[] }>(conta, "GET", "/myAccount/documents");
        pendencias = (docs.data ?? [])
          .filter((x) => x.status !== "APPROVED" && x.status !== "AWAITING_APPROVAL")
          .map((x) => ({
            titulo: x.type === "CUSTOM" && x.description ? x.description : "Enviar documento de identificação e selfie do responsável",
            link: x.onboardingUrl ?? null,
          }));
      } catch {
        /* Sem a lista, vale o recado geral; a situação continua valendo. */
      }
      if (!pendencias.length) pendencias = [{ titulo: "Ativar a conta e enviar os documentos pelo e-mail que o Asaas mandou", link: null }];
      return { situacao: "pendente", pendencias };
    },

    /** Traduz o corpo do aviso. Não confere autenticidade: isso é de quem recebe o HTTP. */
    lerEvento(corpo: unknown): EventoAsaas | null {
      const c = corpo as { event?: unknown; payment?: Record<string, any> } | null;
      if (!c || typeof c.event !== "string") return null;
      const p = c.payment;
      if (!p || typeof p.id !== "string") return { tipo: "ignorado", evento: c.event };
      const referencia = typeof p.externalReference === "string" ? p.externalReference : null;
      switch (c.event) {
        case "PAYMENT_RECEIVED":
        case "PAYMENT_CONFIRMED":
          return {
            tipo: "paga",
            idExterno: p.id,
            referencia,
            valorPago: Number(p.value),
            pagoEm: String(p.clientPaymentDate || p.paymentDate || p.confirmedDate || "").slice(0, 10),
          };
        case "PAYMENT_REFUNDED":
          return { tipo: "estornada", idExterno: p.id, referencia };
        case "PAYMENT_DELETED":
          return { tipo: "cancelada", idExterno: p.id, referencia };
        default:
          return { tipo: "ignorado", evento: c.event };
      }
    },
  };
}

export type ClienteAsaas = ReturnType<typeof criarClienteAsaas>;
