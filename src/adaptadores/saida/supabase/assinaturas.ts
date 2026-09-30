/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — a assinatura, no Postgres. ⚠️ SÓ SERVIDOR.
 *
 * Tabela `assinaturas` (DDL em `supabase/002_multitenant.sql` §11; RLS em
 * `supabase/003_rls.sql` §3.4 — os arquivos são a verdade, não esta prosa).
 *
 * ── ⚠️ A ESCRITA SÓ FUNCIONA COM SERVICE_ROLE, E ISSO É A RLS FAZENDO O TRABALHO DELA ──
 *
 * `003_rls.sql` §3.4 concede SELECT a dono e gestor e **nenhuma política de INSERT ou
 * UPDATE a ninguém logado**. O comentário de lá diz o porquê em cinco palavras: "dono
 * nenhum se dá desconto".
 *
 * Consequência prática: `gravar` só passa quando o `ContextoTenant` tem ator `sistema`
 * (é o que faz `contexto-cliente.ts` escolher o cliente service_role). Chamar `gravar`
 * a partir de uma sessão de usuário não explode — **não escreve e não reclama**, porque
 * um UPDATE que não casa nenhuma linha por RLS é um sucesso com zero linhas. Por isso a
 * verificação explícita abaixo: melhor um erro alto do que uma cobrança que sumiu.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Assinatura, MetodoDePagamento, Provedor } from "@/nucleo/dominio/assinatura";
import type { ParaAvisar, RepositorioAssinaturas } from "@/nucleo/portas/saida/repositorio-assinaturas";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { adminFaltando, createAdminClient, isAdminConfigured } from "./admin";
import { clienteDoContexto } from "./contexto-cliente";

const TABELA = "assinaturas";

/** A tabela de eventos já processados (028). Existe porque a AbacatePay não tem `GET`
 *  por id de assinatura — ver a porta. */
const TABELA_EVENTOS = "cobranca_eventos";

const COLUNAS =
  "plano, preco, moeda, status, provedor, metodo, provedor_cliente_id, "
  + "provedor_assinatura_id, periodo_fim, trial_fim, cartao_marca, cartao_final4";

type Linha = {
  plano: string | null;
  preco: number | string | null;
  moeda: string | null;
  status: string | null;
  provedor: string | null;
  metodo: string | null;
  provedor_cliente_id: string | null;
  provedor_assinatura_id: string | null;
  periodo_fim: string | null;
  trial_fim: string | null;
  cartao_marca: string | null;
  cartao_final4: string | null;
};

const STATUS = ["trial", "ativa", "inadimplente", "cancelada"] as const;
const PROVEDORES = ["stripe", "abacatepay"] as const;
const METODOS = ["pix", "cartao"] as const;

/** Valor fora do `check` da coluna vira `null` em vez de atravessar como string torta.
 *  Só acontece se alguém alterar a constraint sem passar por aqui. */
const naLista = <T extends string>(lista: readonly T[], v: string | null): T | null =>
  (lista as readonly string[]).includes(v ?? "") ? (v as T) : null;

function paraDominio(l: Linha): Assinatura {
  return {
    plano: l.plano ?? "—",
    /* `numeric` volta como string do driver quando passa da precisão de `double`. */
    preco: l.preco === null ? null : Number(l.preco),
    moeda: l.moeda ?? "BRL",
    /* Status fora da lista vira `inadimplente`, pela mesma razão do `statusDoProvedor`:
     * desconhecido nunca libera. Aqui só acontece se alguém alterar o `check` da coluna. */
    status: (STATUS as readonly string[]).includes(l.status ?? "")
      ? (l.status as Assinatura["status"])
      : "inadimplente",
    provedor: naLista<Provedor>(PROVEDORES, l.provedor),
    clienteId: l.provedor_cliente_id,
    assinaturaId: l.provedor_assinatura_id,
    periodoFim: l.periodo_fim,
    trialFim: l.trial_fim,
    metodo: naLista<MetodoDePagamento>(METODOS, l.metodo),
    cartaoMarca: l.cartao_marca,
    cartaoFinal4: l.cartao_final4,
  };
}

export const assinaturasSupabase: RepositorioAssinaturas = {
  async paraAvisar(): Promise<ParaAvisar[]> {
    /* ⚠️ CROSS-TENANT POR CONSTRUÇÃO, como `tenantDoCliente`: é a rotina diária perguntando
     * "quem vence?", e não há sessão nem inquilino. Service role explícito, e nenhum parâmetro
     * por onde escolher de quem ler. Ver a porta. */
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from(TABELA)
      .select(`tenant_id, ${COLUNAS}`)
      .in("status", ["trial", "ativa"]);
    if (error) throw new Error(`assinaturas.paraAvisar: ${error.message}`);

    const linhas = (data ?? []) as unknown as (Linha & { tenant_id: string })[];
    if (!linhas.length) return [];
    const ids = linhas.map((l) => l.tenant_id);

    /* O nome do negócio e o DONO, em duas leituras e não uma por linha: a rotina roda uma vez
     * por dia sobre todos os negócios, e N+1 aqui é N idas ao banco a cada manhã. */
    const [negocios, donos] = await Promise.all([
      admin.from("negocios").select("id, nome").in("id", ids),
      admin.from("membros").select("tenant_id, user_id").eq("papel", "dono").in("tenant_id", ids),
    ]);
    if (negocios.error) throw new Error(`assinaturas.paraAvisar (negocios): ${negocios.error.message}`);
    if (donos.error) throw new Error(`assinaturas.paraAvisar (membros): ${donos.error.message}`);

    const nomeDe = new Map((negocios.data ?? []).map((n: { id: string; nome: string }) => [n.id, n.nome]));
    const donoDe = new Map<string, string>();
    for (const m of (donos.data ?? []) as { tenant_id: string; user_id: string }[]) {
      /* Um dono por negócio é o que o provisionamento cria. Se um dia houver dois, o primeiro
       * basta: o aviso é para alguém que pode pagar, não para todos. */
      if (!donoDe.has(m.tenant_id)) donoDe.set(m.tenant_id, m.user_id);
    }

    /* O e-mail mora em `auth.users`, que o PostgREST não expõe. Uma chamada por dono à API de
     * admin; falha num dono vira `email: null` para ele, e não derruba o aviso dos outros. */
    const emailDe = new Map<string, string | null>();
    await Promise.all([...new Set(donoDe.values())].map(async (uid) => {
      const { data: u, error: e } = await admin.auth.admin.getUserById(uid);
      emailDe.set(uid, e ? null : u.user?.email ?? null);
    }));

    return linhas.map((l) => {
      const uid = donoDe.get(l.tenant_id);
      return {
        tenantId: l.tenant_id,
        negocio: nomeDe.get(l.tenant_id) ?? "seu negócio",
        email: uid ? emailDe.get(uid) ?? null : null,
        assinatura: paraDominio(l),
      };
    });
  },

  async ler(t: ContextoTenant): Promise<Assinatura | null> {
    const { data, error } = await clienteDoContexto(t)
      .from(TABELA)
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .maybeSingle();

    if (error) throw new Error(`assinaturas.ler: ${error.message}`);
    return data ? paraDominio(data as unknown as Linha) : null;
  },

  async gravar(t: ContextoTenant, a: Assinatura): Promise<void> {
    const { data, error } = await clienteDoContexto(t)
      .from(TABELA)
      .update({
        plano: a.plano,
        preco: a.preco,
        moeda: a.moeda,
        status: a.status,
        provedor: a.provedor,
        metodo: a.metodo,
        provedor_cliente_id: a.clienteId,
        provedor_assinatura_id: a.assinaturaId,
        periodo_fim: a.periodoFim,
        trial_fim: a.trialFim,
        cartao_marca: a.cartaoMarca,
        cartao_final4: a.cartaoFinal4,
        /* Existe a coluna `cancelada_em` e ela fica de fora de propósito: quem sabe a
         * data do cancelamento é o provedor, e ela chega em `periodo_fim`. Uma segunda
         * data escrita por nós divergiria da dele no primeiro cancelamento agendado. */
      })
      .eq("tenant_id", t.tenantId)
      .select("tenant_id");

    if (error) throw new Error(`assinaturas.gravar: ${error.message}`);

    /* ⚠️ ZERO LINHAS É FALHA, NÃO SUCESSO VAZIO. Dois caminhos chegam aqui, e os dois
     * são graves: o inquilino não existe (pagamento órfão) ou a RLS barrou a escrita
     * (ator errado). Sem este erro, o webhook devolve 200, a Stripe marca entregue, e a
     * assinatura fica com o estado antigo para sempre — sem log, sem reentrega. */
    if (!data || data.length === 0) {
      throw new Error(
        `assinaturas.gravar: nenhuma linha atualizada para o inquilino ${t.tenantId}. `
          + "Ou o negócio não existe, ou a escrita rodou sem service_role (ver RLS §3.4).",
      );
    }
  },

  async tenantDoCliente(clienteId: string): Promise<string | null> {
    /* ⚠️ A ÚNICA CONSULTA DO REPOSITÓRIO SEM `ContextoTenant`, e por construção: a
     * pergunta é "de QUEM é este cliente?". Ela atravessa inquilinos porque a resposta
     * ainda não é conhecida — é o mesmo arranjo de `integracoes_whatsapp.instancia` em
     * `entrada/whatsapp/contexto.ts`.
     *
     * O que a torna segura é o filtro: casa por `provedor_cliente_id`, que é UNIQUE na
     * tabela e é dado que nós gravamos. Não há parâmetro por onde escolher inquilino. */
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);

    const { data, error } = await createAdminClient()
      .from(TABELA)
      .select("tenant_id")
      .eq("provedor_cliente_id", clienteId)
      .maybeSingle();

    if (error) throw new Error(`assinaturas.tenantDoCliente: ${error.message}`);
    return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  },

  async tenantDaAssinatura(assinaturaId: string): Promise<string | null> {
    /* Irmão do de cima, e cross-tenant pelo mesmo motivo: a pergunta é "de QUEM é esta
     * assinatura?", e a resposta ainda não é conhecida. Casa por `provedor_assinatura_id`,
     * que é UNIQUE e é dado que nós gravamos.
     *
     * ⚠️ EXISTE POR CAUSA DE UM EVENTO SÓ: `subscription.payment_failed` da AbacatePay
     * chega sem `customer` e sem `checkout`. É o evento que avisa que alguém parou de
     * pagar, e este é o único caminho de resolução que resta para ele. */
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);

    const { data, error } = await createAdminClient()
      .from(TABELA)
      .select("tenant_id")
      .eq("provedor_assinatura_id", assinaturaId)
      .maybeSingle();

    if (error) throw new Error(`assinaturas.tenantDaAssinatura: ${error.message}`);
    return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  },

  async vincularCliente(t: ContextoTenant, p: { provedor: Provedor; clienteId: string }) {
    /* ⚠️ SERVICE_ROLE EXPLÍCITO, e não `clienteDoContexto(t)`.
     *
     * Esta chamada roda dentro da sessão do USUÁRIO (é o clique em "assinar"), e a RLS de
     * `assinaturas` não tem política de UPDATE para ninguém logado — um UPDATE por
     * `clienteDoContexto` casaria zero linhas e voltaria SEM ERRO, porque zero linhas por
     * RLS é um sucesso vazio no Postgres. O `cust_…` nunca seria gravado, e o primeiro
     * pagamento chegaria sem dono.
     *
     * O que mantém a garantia da RLS ("dono nenhum se dá desconto", `003_rls.sql` §3.4)
     * não é o cliente usado — é o CONJUNTO DE COLUNAS: duas, e nenhuma delas é `status`,
     * `plano` ou `preco`. A assinatura da função não tem por onde pedir uma terceira. */
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);

    const { data, error } = await createAdminClient()
      .from(TABELA)
      .update({ provedor: p.provedor, provedor_cliente_id: p.clienteId })
      .eq("tenant_id", t.tenantId)
      .select("tenant_id");

    if (error) throw new Error(`assinaturas.vincularCliente: ${error.message}`);

    /* Zero linhas aqui é o inquilino não existir — e seguir para o checkout sem o vínculo
     * gravado significa receber o pagamento e não ter a quem creditar. Melhor barrar o
     * clique agora do que descobrir depois do Pix pago. */
    if (!data || data.length === 0) {
      throw new Error(
        `assinaturas.vincularCliente: nenhuma linha para o inquilino ${t.tenantId}. `
          + "O negócio não existe, e o checkout não pode abrir sem vínculo de cobrança.",
      );
    }
  },

  async eventoJaVisto(eventoId: string): Promise<boolean> {
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);

    const { data, error } = await createAdminClient()
      .from(TABELA_EVENTOS)
      .select("id")
      .eq("id", eventoId)
      .maybeSingle();

    if (error) throw new Error(`assinaturas.eventoJaVisto: ${error.message}`);
    return data !== null;
  },

  async registrarEvento(e): Promise<void> {
    if (!isAdminConfigured) throw new Error(`falta ${adminFaltando().join(", ")}`);

    /* `upsert` e não `insert`: duas entregas do mesmo evento podem chegar em paralelo e
     * atravessar o `eventoJaVisto` as duas (a checagem e a escrita não são atômicas). Com
     * `insert`, a segunda estouraria por violação de PK — e o `catch` da rota devolveria
     * 500, pedindo uma reentrega de algo que JÁ foi processado com sucesso.
     *
     * `ignoreDuplicates` porque a primeira linha é a verdade: ela tem o `tenant_id` que a
     * corrida resolveu primeiro, e sobrescrever não acrescenta nada. */
    const { error } = await createAdminClient()
      .from(TABELA_EVENTOS)
      .upsert(
        { id: e.eventoId, provedor: e.provedor, tipo: e.tipo, tenant_id: e.tenantId },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (error) throw new Error(`assinaturas.registrarEvento: ${error.message}`);
  },

  faltando: adminFaltando,
};
