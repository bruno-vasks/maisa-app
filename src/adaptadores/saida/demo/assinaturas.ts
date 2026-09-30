/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — a cobrança, em memória e sem provedor.
 *
 * Duas portas num arquivo porque elas só fazem sentido juntas: o checkout falso grava na
 * memória falsa, e é isso que torna o ciclo inteiro clicável no `/laboratorio` sem conta
 * na Stripe, sem banco e sem cartão.
 *
 * ── ⚠️ O CHECKOUT DEMO "PAGA" NA HORA, E ISSO ESCONDE UM RISCO REAL ──
 *
 * `abrirCheckout` devolve direto a `voltarPara` e marca a assinatura como ativa. É o que
 * faz a tela ser afinável. Mas o mundo real NÃO é assim: lá a volta do navegador não
 * significa pagamento nenhum, e quem confirma é o webhook, depois, por outro caminho.
 *
 * Quem desenhar a tela só contra este demo vai escrever "Pronto, assinatura ativa!" na
 * página de retorno — e em produção essa frase aparece para boleto que ninguém pagou. A
 * página de retorno tem que dizer "recebemos, estamos confirmando". Está escrito aqui
 * porque é aqui que a ilusão nasce.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Assinatura } from "@/nucleo/dominio/assinatura";
import type { Cobranca } from "@/nucleo/portas/saida/cobranca";
import type { RepositorioAssinaturas } from "@/nucleo/portas/saida/repositorio-assinaturas";

/** Daqui a 30 dias, em `YYYY-MM-DD`. */
const daquiUmMes = () =>
  new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

/**
 * ⚠️ MUTÁVEL, com o mesmo limite dos outros demos: vive enquanto a instância viver.
 * Começa em `trial` porque é o estado em que todo negócio nasce (`005_provisionar.sql`),
 * e portanto o estado em que a tela de faturamento mais vai ser vista.
 */
let estado: Assinatura = {
  plano: "Profissional",
  preco: 197,
  moeda: "BRL",
  status: "trial",
  /* `null` porque em `trial` ninguém pagou nada ainda — é o estado em que todo negócio
   * nasce, e o provedor só entra na linha no primeiro checkout. */
  provedor: null,
  clienteId: "cus_demo",
  assinaturaId: null,
  periodoFim: daquiUmMes(),
  trialFim: daquiUmMes(),
  metodo: null,
  cartaoMarca: null,
  cartaoFinal4: null,
};

/** Os eventos "já vistos" desta instância. Mesmo limite dos outros demos: vive na memória.
 *  Existe para o `/laboratorio` poder exercitar a idempotência do webhook sem banco. */
const eventosVistos = new Set<string>();

export const assinaturasDemo: RepositorioAssinaturas = {
  async ler() {
    return { ...estado };
  },
  async gravar(_t, a) {
    estado = { ...a };
  },
  async tenantDoCliente(clienteId) {
    return clienteId === estado.clienteId ? "demo" : null;
  },
  async tenantDaAssinatura(assinaturaId) {
    return assinaturaId === estado.assinaturaId ? "demo" : null;
  },
  async vincularCliente(_t, p) {
    estado = { ...estado, provedor: p.provedor, clienteId: p.clienteId };
  },
  async eventoJaVisto(eventoId) {
    return eventosVistos.has(eventoId);
  },
  async registrarEvento(e) {
    eventosVistos.add(e.eventoId);
  },
  async paraAvisar() {
    /* Um negócio só, como o resto deste demo. `email: null` de propósito: a rotina de avisos
     * rodando sem banco não pode mandar e-mail de verdade para ninguém, e sem destinatário ela
     * conta o item como pulado — que é o que se quer ver no `/laboratorio`. */
    return [{ tenantId: "demo", negocio: "Negócio de demonstração", email: null, assinatura: { ...estado } }];
  },
  faltando: () => [],
};

export const cobrancaDemo: Cobranca = {
  async abrirCheckout(_t, p) {
    estado = {
      ...estado,
      plano: p.plano.charAt(0).toUpperCase() + p.plano.slice(1),
      status: "ativa",
      /* O demo finge ser a AbacatePay e paga por Pix. É a escolha útil: é o caminho NOVO
       * e o que a tela precisa saber desenhar — "Pix" em vez de "Cartão final ····". Um
       * demo que só produz cartão deixaria o caminho de Pix sem nenhuma tela afinada. */
      provedor: "abacatepay",
      /* `null` porque o demo finge o PRÉ-PAGO, que é o modo em produção desde 29/09/2026: cada
       * Pix compra um mês e não há assinatura no provedor. Ver `ehPrePaga` no domínio. */
      assinaturaId: null,
      periodoFim: daquiUmMes(),
      trialFim: null,
      metodo: "pix",
      cartaoMarca: null,
      cartaoFinal4: null,
    };
    return { url: p.voltarPara, clienteId: estado.clienteId };
  },
  async abrirPortal(_t, p) {
    return { url: p.voltarPara };
  },
  async cancelar() {
    /* Grava na hora, diferente do mundo real — onde quem grava é o webhook. É a mesma
     * ilusão do `abrirCheckout` acima, e o ⚠️ do cabeçalho vale igual. */
    estado = { ...estado, status: "cancelada" };
  },
  /* O demo "paga" na hora (ver `abrirCheckout`), então não há Pix pendente para mostrar. */
  async lerPagamento() {
    return null;
  },
  capacidades() {
    /* Espelha a AbacatePay no PRÉ-PAGO, pelo mesmo motivo do `metodo: "pix"` acima: é o
     * conjunto de capacidades que a tela ainda não sabia desenhar. Sem cancelamento porque não
     * há assinatura para cancelar — quem não quer mais, não paga o mês seguinte. */
    return { portal: false, cancelamento: false, pix: true, prepago: true };
  },
  faltando: () => [],
};
