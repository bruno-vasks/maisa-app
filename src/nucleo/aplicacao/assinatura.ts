/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — a cobrança.
 *
 * Cinco, e a assimetria entre eles é a coisa a entender antes de mexer:
 *
 *   · `abrirCheckout` ........ humano na tela, sessão autenticada, síncrono
 *   · `abrirPortal` .......... idem — e só existe em provedor que TEM portal
 *   · `cancelarAssinatura` ... idem — e só existe em provedor que NÃO tem portal
 *   · `lerAssinatura` ........ humano na tela, sessão autenticada, síncrono
 *   · `registrarAssinatura` .. ninguém na tela, sem sessão, disparado pelo provedor
 *
 * Os dois do meio são exclusivos entre si de propósito: a Stripe cancela pelo portal
 * hospedado dela, a AbacatePay não tem portal e cancela por API. A tela pergunta
 * `capacidades()` antes de desenhar o botão — ver `portas/saida/cobranca.ts`.
 *
 * E, desde 29/09/2026, os três do PRÉ-PAGO no fim do arquivo (`registrarPagamentoAvulso`,
 * `acessoDoNegocio`, `avisarVencimentos`): cada Pix compra um mês, e o corte vem da data.
 *
 * O terceiro é o que decide o desenho. Ele não pode confiar em nada que veio no pedido —
 * o pedido é um POST de um servidor que não é nosso. O que o torna confiável é a
 * assinatura criptográfica conferida no adaptador de entrada ANTES de chegar aqui.
 * Aqui dentro a regra vale igual à de qualquer outra porta: o `ContextoTenant` já é
 * verdade quando entra.
 * ────────────────────────────────────────────────────────────────────────────── */

import { DadoInvalido, NaoEncontrado, NaoSuportado } from "../dominio/erros";
import {
  acessoLiberado, avisoDoDia, creditarUmMes, ehChaveDePlano, fimDoAcesso, liberarTeste, textoDoAviso,
} from "../dominio/assinatura";
import type { Assinatura, Provedor } from "../dominio/assinatura";
import type {
  AbrirCheckout,
  AbrirPortalDeCobranca,
  AcessoDoNegocio,
  AvisarVencimentos,
  CancelarAssinatura,
  LerAssinatura,
  LerPagamento,
  LerSituacaoDoTeste,
  LiberarTeste,
  RegistrarAssinatura,
  RegistrarPagamentoAvulso,
  ResultadoDosAvisos,
  SituacaoDoTeste,
} from "../portas/entrada/casos-de-uso";
import type { Cobranca } from "../portas/saida/cobranca";
import type { Correio } from "../portas/saida/correio";
import type { RepositorioAssinaturas } from "../portas/saida/repositorio-assinaturas";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";

export function criarAbrirCheckout(deps: {
  cobranca: Cobranca;
  assinaturas: RepositorioAssinaturas;
  /** Qual gateway o `cobranca` acima é. Vai para a coluna `assinaturas.provedor`. */
  provedor: Provedor;
}): AbrirCheckout {
  return async (t, p) => {
    /* A chave do plano chega do corpo do request (o clique da tela), então é entrada
     * não confiável como qualquer outra. Validar aqui e não no adaptador porque "que
     * planos existem" é domínio: o provedor aceitaria alegremente um preço de outro
     * produto se a gente mandasse o id errado. */
    if (!ehChaveDePlano(p.plano)) {
      throw new DadoInvalido(`Plano desconhecido: ${String(p.plano)}.`, "plano");
    }

    /* ★ O CLIENTE QUE JÁ EXISTE. Sem esta leitura, quem desistiu na primeira tentativa
     * e voltou vira duas fichas no provedor — e duas fichas podem carregar duas
     * assinaturas ativas do MESMO negócio, cobrando duas vezes. A leitura é barata
     * (uma linha por chave primária) e acontece uma vez por clique em "assinar". */
    /* Cartão pedido a um provedor que não aceita é recusado aqui, com nome: lá ele derrubaria o
     * checkout inteiro (ver `CapacidadesDeCobranca.cartao`). */
    if (p.metodo === "cartao" && !deps.cobranca.capacidades().cartao) {
      throw new NaoSuportado("Pagamento com cartão", deps.provedor === "stripe" ? "Stripe" : "AbacatePay");
    }

    const atual = await deps.assinaturas.ler(t);
    const aberto = await deps.cobranca.abrirCheckout(t, {
      ...p,
      clienteId: atual?.clienteId ?? null,
    });

    /* ★ O CLIENTE É GRAVADO NA IDA, ANTES DE QUALQUER PAGAMENTO.
     *
     * É o que permite ao webhook da AbacatePay saber de quem é o primeiro pagamento:
     * nenhum payload de evento de assinatura deles carrega `metadata`, e o único
     * identificador nosso que sempre volta é `customer.id`. Se ele não estiver na tabela
     * quando o evento chegar, o dinheiro entra sem dono — e isso acontece justamente na
     * primeira venda de cada inquilino.
     *
     * Na Stripe `clienteId` volta `undefined` (ela cria o cliente só na conclusão do
     * checkout) e este bloco não faz nada — o carimbo `metadata.tenant_id` já resolve lá.
     *
     * ⚠️ NÃO GRAVA STATUS, PLANO NEM PREÇO. `vincularCliente` escreve duas colunas e não
     * tem parâmetro para uma terceira. Esta chamada roda numa sessão de usuário logado, e
     * um caminho capaz de escrever status a partir daí seria o fim da garantia da RLS
     * ("dono nenhum se dá desconto", `003_rls.sql` §3.4).
     *
     * Só grava se mudou: reabrir o checkout com o mesmo cliente é o caso comum (a pessoa
     * desistiu e voltou), e uma escrita por clique encheria a auditoria de linhas iguais. */
    if (aberto.clienteId && aberto.clienteId !== atual?.clienteId) {
      await deps.assinaturas.vincularCliente(t, {
        provedor: deps.provedor,
        clienteId: aberto.clienteId,
      });
    }

    return aberto;
  };
}

/**
 * Cancelar, quando o provedor não tem portal para a pessoa fazer isso sozinha.
 *
 * ⚠️ NÃO GRAVA O CANCELAMENTO. Só pede ao provedor. Quem grava é o webhook, ao receber
 * `subscription.cancelled` — é a mesma regra de `registrarAssinatura`, e pelo mesmo
 * motivo: o dono da verdade é externo. Gravar aqui criaria duas verdades que divergem no
 * primeiro cancelamento que a API aceita e o evento não entrega (ou o contrário).
 *
 * A consequência é visível na tela e é correta: por alguns segundos depois do clique, o
 * plano continua aparecendo como ativo. É melhor do que a alternativa — dizer "cancelado"
 * e a cobrança do mês seguinte entrar porque a API recusou e ninguém olhou.
 */
export function criarCancelarAssinatura(deps: {
  cobranca: Cobranca;
  assinaturas: RepositorioAssinaturas;
}): CancelarAssinatura {
  return async (t) => {
    const atual = await deps.assinaturas.ler(t);
    /* Erro de domínio e não 500: "você não tem assinatura para cancelar" é uma frase que
     * a tela sabe dizer. Acontece de verdade com quem está em `trial`. */
    if (!atual?.assinaturaId) throw new NaoEncontrado("assinatura ativa deste negócio");

    await deps.cobranca.cancelar(t, { assinaturaId: atual.assinaturaId });
  };
}

export function criarAbrirPortalDeCobranca(deps: {
  cobranca: Cobranca;
  assinaturas: RepositorioAssinaturas;
}): AbrirPortalDeCobranca {
  return async (t, p) => {
    const atual = await deps.assinaturas.ler(t);
    /* Portal de quem nunca pagou não existe: a Stripe recusa `customer` nulo, e a
     * recusa dela chega como 400 genérico. Um erro de domínio aqui deixa a tela dizer
     * "você ainda não tem assinatura" em vez de "erro ao abrir o portal". */
    if (!atual?.clienteId) throw new NaoEncontrado("cliente de cobrança deste negócio");
    return deps.cobranca.abrirPortal(t, { ...p, clienteId: atual.clienteId });
  };
}

export function criarLerAssinatura(deps: { assinaturas: RepositorioAssinaturas }): LerAssinatura {
  return async (t) => deps.assinaturas.ler(t);
}

/**
 * O webhook, já traduzido e já autenticado.
 *
 * ⚠️ NÃO DECIDE NADA — grava o que o provedor afirmou. É de propósito, e é o mesmo
 * princípio do `ReconciliarRecibos`: quando o dono da verdade é externo, inventar regra
 * local produz duas verdades que divergem no dia em que alguém mexe pelo painel do
 * provedor. Cancelamento feito lá dentro chega aqui como evento, e este arquivo escreve.
 *
 * A única regra que sobra é a que `statusDaStripe`/`statusDaAbacatePay` carregam: estado
 * desconhecido não libera o produto.
 */
export function criarRegistrarAssinatura(deps: {
  assinaturas: RepositorioAssinaturas;
}): RegistrarAssinatura {
  return async (t, a: Assinatura) => {
    await deps.assinaturas.gravar(t, a);
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O PRÉ-PAGO (29/09/2026) — cada Pix compra um mês. As regras estão em `dominio/assinatura.ts`;
 * aqui fica só a ordem das coisas.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * O Pix de `/pagar`. Quem garante que é deste negócio é o adaptador, relendo o carimbo na
 * fonte — ver `Cobranca.lerPagamento`. Id vazio ou torto nem chega ao provedor.
 */
export function criarLerPagamento(deps: { cobranca: Cobranca }): LerPagamento {
  return async (t, id) => {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id ?? "")) return null;
    return deps.cobranca.lerPagamento(t, id);
  };
}

/**
 * ★ Um Pix confirmado soma um mês.
 *
 * ⚠️ A ORDEM É A MESMA DO WEBHOOK RECORRENTE, E PELO MESMO MOTIVO: confere se já viu, grava,
 * e só então marca. Marcar antes e falhar no meio deixaria o pagamento como visto com a linha
 * no estado antigo — e a reentrega, que existe para salvar esse caso, seria descartada. A
 * pessoa pagou e a MAISA seguiria pausada.
 *
 * ⚠️ JANELA ACEITA: duas entregas SIMULTÂNEAS do mesmo pagamento passam as duas pelo
 * `eventoJaVisto` antes de qualquer uma marcar, e somam dois meses. Exige a reentrega deles
 * chegar enquanto a primeira ainda está sendo gravada — a primeira reentrega é 5s depois, e a
 * gravação leva milissegundos. O erro, se acontecer, é um mês a favor do cliente.
 */
export function criarRegistrarPagamentoAvulso(deps: {
  assinaturas: RepositorioAssinaturas;
  provedor: Provedor;
}): RegistrarPagamentoAvulso {
  return async (t, p) => {
    if (await deps.assinaturas.eventoJaVisto(p.pagamentoId)) {
      return { creditado: false, assinatura: null };
    }

    const atual = await deps.assinaturas.ler(t);
    const nova = creditarUmMes(atual, {
      hoje: p.hoje,
      plano: p.plano,
      preco: p.preco,
      provedor: deps.provedor,
      metodo: p.metodo,
      clienteId: p.clienteId,
    });

    await deps.assinaturas.gravar(t, nova);
    await deps.assinaturas.registrarEvento({
      eventoId: p.pagamentoId,
      provedor: deps.provedor,
      tipo: "pagamento_avulso",
      tenantId: t.tenantId,
    });

    return { creditado: true, assinatura: nova };
  };
}

/**
 * ★ Este negócio pode usar a MAISA hoje?
 *
 * Sem linha de assinatura, libera. Todo negócio nasce com uma (`005_provisionar.sql`), então a
 * ausência é defeito nosso, e defeito nosso não cala o cliente de ninguém.
 */
export function criarAcessoDoNegocio(deps: { assinaturas: RepositorioAssinaturas }): AcessoDoNegocio {
  return async (t, hoje) => {
    const a = await deps.assinaturas.ler(t);
    if (!a) return { liberado: true, fim: null };
    return { liberado: acessoLiberado(a, hoje), fim: fimDoAcesso(a) };
  };
}

/**
 * ★ A rotina diária: manda o aviso de quem vence daqui a 3 dias, amanhã, hoje, ou venceu ontem.
 *
 * Não grava nada e não corta nada — ver o limite em `portas/entrada/casos-de-uso.ts`. Um e-mail
 * que falhou é contado e a rodada segue; um negócio que falha não derruba o aviso dos outros.
 */
export function criarAvisarVencimentos(deps: {
  assinaturas: RepositorioAssinaturas;
  correio: Correio;
  /** Para onde o e-mail manda pagar. Absoluta: é lida fora do app, no cliente de e-mail. */
  linkDePagamento: string;
}): AvisarVencimentos {
  return async (hoje) => {
    const r: ResultadoDosAvisos = { enviados: 0, semEmail: 0, falhas: [] };

    for (const item of await deps.assinaturas.paraAvisar()) {
      const aviso = avisoDoDia(item.assinatura, hoje);
      if (!aviso) continue;
      if (!item.email) { r.semEmail++; continue; }

      const { assunto, texto } = textoDoAviso(aviso, {
        negocio: item.negocio,
        emTeste: item.assinatura.status === "trial",
        link: deps.linkDePagamento,
      });

      try {
        await deps.correio.enviar({ para: item.email, assunto, texto });
        r.enviados++;
      } catch (e) {
        r.falhas.push({ tenantId: item.tenantId, motivo: String((e as Error)?.message ?? e) });
      }
    }

    return r;
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O TESTE NA CONVERSA (09/10/2026) — a equipe abre o teste de quem pediu pelo WhatsApp. A regra
 * está em `dominio/assinatura.ts`; aqui, a leitura que a tela da equipe mostra antes do clique, e
 * o clique.
 * ────────────────────────────────────────────────────────────────────────────── */

function situacao(negocio: string, a: Assinatura | null, hoje: string): SituacaoDoTeste {
  if (!a) return { negocio, situacao: "fechado", fim: null };
  const fim = fimDoAcesso(a);
  if (!acessoLiberado(a, hoje)) return { negocio, situacao: "fechado", fim };
  return { negocio, situacao: a.status === "ativa" ? "pago" : "em_teste", fim };
}

export function criarLerSituacaoDoTeste(deps: {
  assinaturas: RepositorioAssinaturas;
  negocio: RepositorioNegocio;
}): LerSituacaoDoTeste {
  return async (t, hoje) => {
    const [a, n] = await Promise.all([deps.assinaturas.ler(t), deps.negocio.negocio(t)]);
    return situacao(n.nome, a, hoje);
  };
}

export function criarLiberarTeste(deps: {
  assinaturas: RepositorioAssinaturas;
  negocio: RepositorioNegocio;
}): LiberarTeste {
  return async (t, hoje) => {
    const [a, n] = await Promise.all([deps.assinaturas.ler(t), deps.negocio.negocio(t)]);
    /* Todo negócio nasce com linha de assinatura. Sem ela não há o que estender, e criar uma aqui
     * seria um segundo lugar onde assinatura nasce. */
    if (!a) throw new NaoEncontrado("assinatura deste negócio");

    const nova = liberarTeste(a, hoje);
    if (!nova) {
      throw new DadoInvalido(`${n.nome} já tem um mês pago valendo. Não há teste para liberar.`, "assinatura");
    }

    await deps.assinaturas.gravar(t, nova);
    return situacao(n.nome, nova, hoje);
  };
}
