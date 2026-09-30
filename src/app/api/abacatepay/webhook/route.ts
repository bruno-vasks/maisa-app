import { NextResponse } from "next/server";
import { app, repositorioDeAssinaturas } from "@/composicao";
import {
  assinaturaDoEvento,
  ehPagamentoAvulso,
  ehRelevante,
  idDoPagamentoAvulso,
  lerPagamentoAvulso,
  pistasDeDono,
  verificar,
} from "@/adaptadores/entrada/abacatepay/eventos";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { hojeISO } from "@/nucleo/dominio/tempo";
import { PLANOS } from "@/app/(marketing)/_lib/planos";

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK DA ABACATEPAY — por onde o Pix entra no app.
//
// POST /api/abacatepay/webhook?webhookSecret=…
//
// FINA como a irmã da Stripe: confere, resolve o inquilino, chama o caso de uso. Nenhuma
// regra mora aqui. A tradução está em `entrada/abacatepay/eventos.ts`, e é lá que estão as
// QUATRO decisões que importam — leia o cabeçalho de lá antes de mexer aqui:
//
//   1. o HMAC NÃO autentica (a chave é pública); quem autentica é o `?webhookSecret=`
//   2. não existe releitura na fonte — o corpo do evento é a única verdade
//   3. o inquilino vem do `customer.id` que gravamos na ida, não de `metadata`
//   4. `periodoFim` é calculado por nós
//
// ── A TABELA DE STATUS DE RESPOSTA, QUE É O CONTRATO COM A ABACATEPAY ──
//
// Medido na documentação deles em 21/09/2026, e é DIFERENTE da Stripe — por isso está
// escrito aqui em vez de copiado:
//
//   2xx .............................. entregue, não reentrega
//   5xx, 408, 429, timeout de 30s .... ★ REENTREGA: 7 tentativas em ~18h
//   410 Gone ......................... ⚠️ DESATIVA O WEBHOOK e nunca mais tenta
//   outros 4xx (400, 401, 404) ....... não reentrega
//   3xx .............................. não é seguido; cadastre a URL final
//
// Daí as escolhas abaixo:
//
//   segredo/HMAC inválido ..... 401 · e NÃO reentrega: o corpo não é nosso ou o segredo
//                               está errado, e repetir não conserta nenhum dos dois
//   evento repetido ........... 200 · a reentrega trouxe o que já processamos
//   evento irrelevante ........ 200 · a conta recebe payout, transfer, checkout avulso
//   pagamento de terceiro ..... 200 · acontece de verdade em conta compartilhada
//   falha nossa (banco fora) .. 500 · ★ É AQUI QUE A REENTREGA SALVA. O Supabase cai por
//                               40s, eles voltam em 5s, e a assinatura é gravada. Um 200
//                               aqui perderia o pagamento em silêncio e para sempre.
//
// ⚠️ NUNCA RESPONDER 410. Ele desativa o endpoint no lado deles — e um endpoint de
// pagamento desativado não dá erro em lugar nenhum: as vendas simplesmente param de
// aparecer no app. Nenhum caminho deste arquivo devolve 410, e é de propósito.
//
// ⚠️ ESTA ROTA É PÚBLICA por construção: não há cookie num POST vindo de outro servidor.
// `/api` inteiro já passa pelo middleware sem login (`PUBLIC_PREFIXES` em
// `saida/supabase/sessao.ts`), então NÃO há nada a cadastrar lá — e é justamente por isso
// que a conferência do segredo não é opcional.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* O teto deles é 30s. O nosso processamento é uma escrita no Postgres — cabe folgado.
 * Estourar não é "deu erro", é reentrega — e reentrega de um processamento lento é o mesmo
 * processamento lento, de novo. */
export const maxDuration = 30;

/**
 * Preço em reais → nome do plano.
 *
 * Existe porque o payload da AbacatePay não traz o nome do produto, e `gravar` substitui a
 * linha inteira: sem esta tradução, a primeira renovação apagaria "Profissional" da tela.
 * Ver o ⚠️ em `assinaturaDoEvento`.
 *
 * ⚠️ LÊ A FONTE ÚNICA DE PREÇO (`_lib/planos.ts`), não uma tabela redigitada aqui. É a
 * mesma razão pela qual `api/assinatura/route.ts` também a importa: preço escrito duas
 * vezes divergiu seis vezes neste projeto, e está documentado no cabeçalho de lá.
 */
function planoDoValor(reais: number): string | null {
  const achado = PLANOS.find((p) => Number(p.preco.replace(/[^\d]/g, "")) === reais);
  return achado?.nome ?? null;
}

export async function POST(req: Request) {
  /* ── 1. o corpo CRU ──
   * ⚠️ `req.text()`, nunca `req.json()`. O HMAC é sobre os bytes exatos que chegaram;
   * reserializar reordena chaves e a conferência falha em 100% dos eventos. */
  const cru = await req.text();
  const url = new URL(req.url);

  let evento;
  try {
    evento = verificar(cru, {
      /* ★ O que de fato autentica. Ver a decisão 1 em `entrada/abacatepay/eventos.ts`. */
      segredoDaUrl: url.searchParams.get("webhookSecret"),
      assinatura: req.headers.get("x-webhook-signature"),
    });
  } catch (e) {
    /* 401 e não 400: a chamada não se identificou. E não reentrega, que é o certo —
     * repetir um POST não assinado devolve o mesmo POST não assinado. */
    console.error("[api/abacatepay/webhook] recusado", String(e));
    return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });
  }

  /* ★ O PRÉ-PAGO (29/09/2026): um Pix avulso pago soma um mês. Caminho próprio, com releitura
   * na fonte — ver o bloco do pré-pago no fim de `entrada/abacatepay/eventos.ts`. */
  if (ehPagamentoAvulso(evento.evento)) return pagamentoAvulso(evento.evento, idDoPagamentoAvulso(evento));

  if (!ehRelevante(evento.evento)) {
    return NextResponse.json({ ok: true, ignorado: true, tipo: evento.evento });
  }

  try {
    /* ── 2. já processamos? ──
     * ★ A IDEMPOTÊNCIA É NOSSA AQUI, e é o que substitui a releitura na fonte que a
     * Stripe permite. São até 7 reentregas ao longo de ~18h, todas com o mesmo `id`.
     * Ver a decisão 2 em `entrada/abacatepay/eventos.ts` e a tabela `cobranca_eventos`
     * em `supabase/028_cobranca_provedor.sql`. */
    if (await repositorioDeAssinaturas.eventoJaVisto(evento.id)) {
      return NextResponse.json({ ok: true, ignorado: true, motivo: "evento_repetido" });
    }

    const assinatura = assinaturaDoEvento(evento, planoDoValor);
    const pistas = pistasDeDono(evento);

    /* ── 3. de quem é ──
     * Três pistas, nesta ordem, e nenhuma delas é campo escolhido por quem mandou o POST —
     * o POST inteiro já passou pela conferência do segredo. Ver a decisão 3. */
    const dono =
      pistas.carimbo
      ?? (pistas.clienteId ? await repositorioDeAssinaturas.tenantDoCliente(pistas.clienteId) : null)
      /* ★ O terceiro passo existe por causa de `subscription.payment_failed`, que chega
       * SEM `customer` e sem `checkout` — só com a assinatura. É o evento que avisa que
       * alguém parou de pagar, e sem isto ele seria descartado por falta de dono. */
      ?? (pistas.assinaturaId
        ? await repositorioDeAssinaturas.tenantDaAssinatura(pistas.assinaturaId)
        : null);

    if (!dono) {
      console.warn(
        `[api/abacatepay/webhook] ${evento.evento}: sem inquilino conhecido `
          + `(cliente ${pistas.clienteId ?? "—"}, assinatura ${pistas.assinaturaId ?? "—"}). Ignorado.`,
      );
      /* ⚠️ MARCA MESMO SEM DONO. Pagamento de quem não é nosso acontece de verdade em
       * conta compartilhada, e sem a marca a reentrega o traz de volta por 18 horas
       * enchendo o log. `tenantId: null` é o registro de "reconhecido, não era nosso". */
      await repositorioDeAssinaturas.registrarEvento({
        eventoId: evento.id,
        provedor: "abacatepay",
        tipo: evento.evento,
        tenantId: null,
      });
      return NextResponse.json({ ok: true, ignorado: true, motivo: "inquilino_desconhecido" });
    }

    /* ⚠️ ATOR `sistema`, e é o que destrava a escrita: `contexto-cliente.ts` só escolhe o
     * cliente service_role quando o ator não é `usuario`, e a RLS de `assinaturas` não
     * deixa usuário logado escrever (`003_rls.sql` §3.4). Trocar para `usuario` aqui faria
     * o UPDATE casar zero linhas — e o pagamento sumiria. */
    const contexto: ContextoTenant = {
      tenantId: dono,
      usuarioId: "abacatepay",
      ator: { tipo: "sistema", rotina: "abacatepay:webhook" },
    };

    await app.registrarAssinatura(contexto, assinatura);

    /* ── 4. marca DEPOIS de gravar ──
     * ⚠️ A ORDEM É A DECISÃO. Marcar antes e falhar no meio deixaria o evento como
     * processado com a assinatura no estado antigo — e a reentrega, que existe exatamente
     * para salvar esse caso, passaria a ser descartada. O pagamento se perderia para
     * sempre. Ver o ⚠️ de `registrarEvento` na porta. */
    await repositorioDeAssinaturas.registrarEvento({
      eventoId: evento.id,
      provedor: "abacatepay",
      tipo: evento.evento,
      tenantId: dono,
    });

    console.info(
      `[api/abacatepay/webhook] ${evento.evento} → ${dono}: ${assinatura.plano} `
        + `${assinatura.status} via ${assinatura.metodo ?? "—"}`
        /* ⚠️ `devMode: true` significa PAGAMENTO SIMULADO. O mesmo endpoint atende os dois
         * mundos, então sem esta linha o log de um teste é indistinguível do log de uma
         * venda real — e a pergunta "essa venda entrou mesmo?" não se responde. */
        + (evento.devMode ? "  ⚠️ DEV MODE (pagamento simulado)" : ""),
    );
    return NextResponse.json({ ok: true, status: assinatura.status });
  } catch (e) {
    /* ★ 500 DE PROPÓSITO. Ver a tabela no cabeçalho: é a resposta que faz a AbacatePay
     * tentar de novo, e é a única chance de o pagamento não se perder. */
    console.error(`[api/abacatepay/webhook] falha ao processar ${evento.evento} (${evento.id})`, e);
    return NextResponse.json({ ok: false, erro: "falha_interna" }, { status: 500 });
  }
}

/**
 * `checkout.completed` → um mês a mais para quem pagou.
 *
 * Do corpo do evento só sai o `bill_…`. O resto — se pagou, quanto, de quem é — vem da
 * releitura na API. A tabela de status é a mesma do cabeçalho: falha nossa é 500 (a
 * reentrega salva), o resto é 200.
 */
async function pagamentoAvulso(tipo: string, id: string | null) {
  if (!id) {
    console.warn(`[api/abacatepay/webhook] ${tipo} sem checkout.id — ignorado.`);
    return NextResponse.json({ ok: true, ignorado: true, motivo: "sem_checkout" });
  }

  try {
    const pg = await lerPagamentoAvulso(id);

    /* O evento diz "pago" e a fonte não: ou é um POST forjado, ou o pagamento foi estornado
     * no meio tempo. Nos dois casos, nada a somar. 200 para não reentregar o mesmo engano. */
    if (!pg.pago) {
      console.warn(`[api/abacatepay/webhook] ${id}: o evento diz pago, a API diz que não. Ignorado.`);
      return NextResponse.json({ ok: true, ignorado: true, motivo: "nao_pago_na_fonte" });
    }

    /* Pagamento da conta que não é da MAISA (a conta é da Poli Júnior, e outros produtos podem
     * cobrar por ela). Reconhecido, não é nosso. */
    if (!pg.dono) {
      console.warn(`[api/abacatepay/webhook] ${id}: pago, mas sem carimbo da MAISA. Ignorado.`);
      return NextResponse.json({ ok: true, ignorado: true, motivo: "inquilino_desconhecido" });
    }

    /* ⚠️ ATOR `sistema`, pelo mesmo motivo do caminho da assinatura: é ele que destrava a
     * escrita com service_role, e a RLS de `assinaturas` não deixa usuário logado gravar. */
    const contexto: ContextoTenant = {
      tenantId: pg.dono.tenantId,
      usuarioId: "abacatepay",
      ator: { tipo: "sistema", rotina: "abacatepay:webhook" },
    };

    const nome = PLANOS.find((p) => p.chave === pg.dono?.plano)?.nome ?? "Assinatura";
    const r = await app.registrarPagamentoAvulso(contexto, {
      pagamentoId: pg.pagamentoId,
      plano: nome,
      preco: pg.preco,
      metodo: pg.metodo,
      clienteId: pg.clienteId,
      hoje: hojeISO(),
    });

    console.info(
      `[api/abacatepay/webhook] ${tipo} ${id} → ${pg.dono.tenantId}: `
        + (r.creditado ? `${nome} pago até ${r.assinatura?.periodoFim}` : "já creditado (reentrega)")
        + (pg.devMode ? "  ⚠️ DEV MODE (pagamento simulado)" : ""),
    );
    return NextResponse.json({ ok: true, creditado: r.creditado, ate: r.assinatura?.periodoFim ?? null });
  } catch (e) {
    /* ★ 500: a releitura ou a escrita falharam, e a reentrega deles é a chance de o Pix pago
     * não se perder. */
    console.error(`[api/abacatepay/webhook] falha ao creditar ${id}`, e);
    return NextResponse.json({ ok: false, erro: "falha_interna" }, { status: 500 });
  }
}
