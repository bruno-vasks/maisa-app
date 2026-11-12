/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — o lote do Receita Saúde, em memória.
 *
 * ★ ELE EXISTE PARA A CLAIM SER EXERCITÁVEL SEM BANCO. É a garantia que não se confere
 * lendo o código: gerar duas vezes tem que dar arquivo na primeira e "já foi" na segunda;
 * descartar tem que devolver as linhas — **das duas fontes**, atendimento e avulso.
 *
 * ⚠️ Os pagamentos saem dos MESMOS fixtures de clientes das outras telas. Inventar uma lista
 * própria faria a tela de recibos mostrar gente que a agenda ao lado não conhece.
 *
 * ⚠️ MUTÁVEL, com o limite dos outros demos: vive enquanto o processo viver.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  DestinatarioDeRecibo, LoteAberto, LoteGravado, PagamentoAFaturar, RascunhoAvulso,
  RepositorioRecibos,
} from "@/nucleo/portas/saida/repositorio-recibos";
import { CLIENTES } from "./clientes";

/** Telefone por cliente, para o aviso. Avulso sem cadastro não acha nada aqui — e é o ponto. */
const TELEFONE_POR_CLIENTE = new Map(CLIENTES.map((c) => [c.id, c.telefone]));

/** Três quintas de agosto de 2026 — o mês que o resto da demonstração usa. */
const DIAS = ["2026-08-06", "2026-08-13", "2026-08-20"];

const so = (v?: string | null) => (v ?? "").replace(/\D/g, "") || null;

/**
 * CPFs que FECHAM no módulo 11, e por que eles não vêm de `CLIENTES`.
 *
 * ⚠️ Os CPFs dos fixtures são decorativos — bonitos na tela de Clientes e inválidos no dígito
 * verificador. Desde que `linhaFaltando` confere o dígito (21/08/2026, depois de a Receita
 * recusar "Beneficiário do serviço inválido"), usá-los aqui deixaria TODAS as linhas de fora e
 * o demo pararia de exercitar a claim — que é a única razão de ele existir.
 *
 * Trocar os fixtures não é opção: eles aparecem nas fotos do produto que a LP usa.
 */
const CPFS_VALIDOS = ["12345678909", "98765432100", "54573908889", "11144477735", "52998224725", "15350946056"];

let pendentes: PagamentoAFaturar[] = CLIENTES
  .filter((c) => c.ativo && c.valor > 0)
  .slice(0, 6)
  .flatMap((c, i) =>
    DIAS.map((data, j) => ({
      id: `at-${c.id}-${j}`,
      fonte: "atendimento" as const,
      clienteId: c.id,
      nome: c.nome,
      cpf: CPFS_VALIDOS[i % CPFS_VALIDOS.length],
      /* ★ Um pagador diferente, de propósito: é o desenho que a tela precisa suportar (mãe
       * paga a terapia do filho) e o que ninguém lembra de exercitar. */
      cpfPagador: i === 2 ? "12345678909" : null,
      data,
      valor: 250,
      servico: null,
      teste: c.teste === true,
    })),
  );

/** Guarda o que cada lote prendeu, para o descarte saber o que devolver. */
const presos = new Map<string, PagamentoAFaturar[]>();
let lotes: LoteGravado[] = [];
let sequencia = 0;

export const recibosDemo: RepositorioRecibos = {
  async pendentes(_t, p): Promise<PagamentoAFaturar[]> {
    return pendentes
      .filter((x) => x.data <= p.ate)
      .sort((a, b) => a.data.localeCompare(b.data));
  },

  async abrirLote(_t, p): Promise<LoteAberto | null> {
    /* A claim: só entra o que ainda está na lista. Segunda chamada com os mesmos ids encontra
     * zero e devolve `null` — o "já foi" da porta, que não é erro. */
    const pedidos = new Set([...p.atendimentoIds, ...p.avulsoIds]);
    const linhas = pendentes.filter((x) => pedidos.has(x.id));
    if (!linhas.length) return null;

    pendentes = pendentes.filter((x) => !pedidos.has(x.id));

    const id = `lote-demo-${++sequencia}`;
    presos.set(id, linhas);
    const valor = linhas.reduce((soma, x) => soma + x.valor, 0);

    lotes = [
      {
        id,
        competencia: p.competencia,
        linhas: linhas.length,
        valor,
        criadoEm: `${p.competencia.slice(0, 7)}-28T12:00:00-03:00`,
        situacao: "gerado",
      },
      ...lotes,
    ];

    return {
      id,
      competencia: p.competencia,
      linhas: linhas.length,
      valor,
      atendimentoIds: linhas.filter((x) => x.fonte === "atendimento").map((x) => x.id),
      avulsoIds: linhas.filter((x) => x.fonte === "avulso").map((x) => x.id),
    };
  },

  async confirmarLote(_t, loteId): Promise<boolean> {
    /* ⚠️ SÓ SAI DE `gerado`, e o booleano é o que impede o segundo aviso no WhatsApp. O demo
     * existe justamente para isso ser exercitável sem banco: confirmar duas vezes tem que
     * devolver `true` e depois `false`. */
    const alvo = lotes.find((l) => l.id === loteId);
    if (!alvo || alvo.situacao !== "gerado") return false;

    lotes = lotes.map((l) => (l.id === loteId ? { ...l, situacao: "importado" } : l));
    /* ⚠️ `presos` FICA. Antes este método apagava a entrada, e apagar aqui deixaria o aviso
     * sem destinatário nenhum — no banco as linhas continuam com `lote_recibo_id` depois de
     * importadas, e é delas que sai a lista de quem avisar. */
    return true;
  },

  async destinatariosDoLote(_t, loteId): Promise<DestinatarioDeRecibo[]> {
    return (presos.get(loteId) ?? []).map((x) => ({
      nome: x.nome,
      /* ★ O ÚLTIMO FICA SEM TELEFONE, de propósito: é o caso do avulso de quem não é cadastro,
       * e é o número que a tela mostra como "sem aviso". Sem isso o demo nunca exercitaria o
       * caminho em que o recibo sai e a mensagem não. */
      telefone: TELEFONE_POR_CLIENTE.get(x.clienteId ?? "") ?? null,
      data: x.data,
      valor: x.valor,
    }));
  },

  async descartarLote(_t, loteId): Promise<void> {
    /* Devolve as linhas exatamente como saíram — inclusive as avulsas, que no 018 ficavam
     * presas a um lote descartado e desapareciam para sempre, sem erro nenhum. */
    pendentes = [...pendentes, ...(presos.get(loteId) ?? [])]
      .sort((a, b) => a.data.localeCompare(b.data));
    presos.delete(loteId);
    lotes = lotes.map((l) => (l.id === loteId ? { ...l, situacao: "descartado" } : l));
  },

  async lancarAvulso(_t, p: RascunhoAvulso): Promise<PagamentoAFaturar> {
    const linha: PagamentoAFaturar = {
      id: `av-demo-${++sequencia}`,
      fonte: "avulso",
      clienteId: p.clienteId ?? null,
      nome: p.nome,
      cpf: so(p.cpf),
      cpfPagador: so(p.cpfPagador),
      data: p.data,
      servico: null,
      valor: p.valor,
      teste: false,
    };
    pendentes = [...pendentes, linha].sort((a, b) => a.data.localeCompare(b.data));
    return linha;
  },

  async excluirAvulso(_t, id): Promise<void> {
    /* Só o que está na lista — o que já entrou em lote não está aqui, e é essa a regra. */
    pendentes = pendentes.filter((x) => !(x.id === id && x.fonte === "avulso"));
  },

  async sessaoNaoAconteceu(_t, atendimentoId): Promise<{ maisaAg: string | null } | null> {
    /* Só o que está na lista, como `excluirAvulso`: fora dela já está num recibo ou não existe. */
    const achou = pendentes.some((x) => x.id === atendimentoId && x.fonte === "atendimento");
    if (!achou) return null;
    pendentes = pendentes.filter((x) => !(x.id === atendimentoId && x.fonte === "atendimento"));
    return { maisaAg: null };
  },

  async listarLotes(): Promise<LoteGravado[]> {
    return [...lotes];
  },
};
