/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — os recebimentos em memória, com as mesmas regras da 038.
 *
 * Um atendimento ativo em uma cobrança só, a transição com guarda, a mesma transação Pix uma vez
 * só, e o comprovante confirmado junto com o pagamento. Se ele divergir do banco, os testes que o
 * usam mentem: as regras estão conferidas em `recebimentos.test.ts`, ao lado.
 *
 * Os atendimentos vêm do registro demo (`atendimentos.ts`, o espelho do laboratório), com o
 * `maisaAg` no papel do id. O demo não tem pacote mensal: `clientesPorMes` volta vazio, a não ser
 * que o teste diga quem paga por mês (`pagaPorMesDemo`).
 *
 * ⚠️ Não é banco: morre no fim do processo e não é compartilhado entre instâncias.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ClientePorMes, RepositorioRecebimentos } from "@/nucleo/portas/saida/repositorio-recebimentos";
import {
  RECEBIMENTOS_DESLIGADOS, type AtendimentoACobrar, type ComprovanteDePagamento, type ConfigDeRecebimentos,
  type Recebimento,
} from "@/nucleo/dominio/recebimentos";
import { DadoInvalido } from "@/nucleo/dominio/erros";
import { chaveDe } from "@/nucleo/dominio/contatos";
import { espelhoDemo, type EspelhoEmMemoria } from "./atendimentos";

const CONFIG: Record<string, ConfigDeRecebimentos> = {};
let RECEBIMENTOS: (Recebimento & { tenantId: string })[] = [];
/** atendimento → recebimento ativo, por negócio. */
let ATIVOS: Record<string, string> = {};
let COMPROVANTES: (ComprovanteDePagamento & { tenantId: string; mensagemId: string | null })[] = [];
let POR_MES: Record<string, ClientePorMes[]> = {};
/** O CPF de quem a ficha demo tem, para `esperandoCpf`. O teste diz. */
let CPFS: Record<string, string> = {};

const chave = (tenantId: string, id: string) => `${tenantId}|${id}`;

function paraCobrar(a: EspelhoEmMemoria): AtendimentoACobrar {
  return {
    id: a.maisaAg,
    clienteId: a.clienteId,
    nome: a.clienteNome,
    telefone: a.clienteTel || null,
    servico: a.servicoNome,
    valor: a.servicoValor,
    data: a.dataLocal,
    fim: a.fimISO,
    comoPaga: (a.clienteId && POR_MES_DE(a.tenantId, a.clienteId)) ? "por_mes" : "padrao",
  };
}

const POR_MES_DE = (tenantId: string, clienteId: string) => (POR_MES[tenantId] ?? []).some((c) => c.clienteId === clienteId);
const daqui = (tenantId: string) => RECEBIMENTOS.filter((r) => r.tenantId === tenantId);
const semTenant = ({ tenantId: _t, ...r }: Recebimento & { tenantId: string }): Recebimento => r;

export const recebimentosDemo: RepositorioRecebimentos = {
  async config(t) {
    return CONFIG[t.tenantId] ?? RECEBIMENTOS_DESLIGADOS;
  },

  async salvarConfig(t, c) {
    CONFIG[t.tenantId] = { ...c };
  },

  async negociosComRecebimento() {
    return Object.keys(CONFIG).filter((id) => CONFIG[id].chave);
  },

  async atendimentosQueAcabaram(t, janela) {
    return espelhoDemo(t.tenantId)
      .filter((a) => a.situacao === "marcado" && a.fimISO > janela.desde && a.fimISO <= janela.ate)
      .filter((a) => a.servicoValor > 0 && a.clienteTel && !ATIVOS[chave(t.tenantId, a.maisaAg)])
      .map(paraCobrar)
      .filter((a) => a.comoPaga === "padrao");
  },

  async clientesPorMes(t) {
    return POR_MES[t.tenantId] ?? [];
  },

  async sessoesDoMes(t, p) {
    return espelhoDemo(t.tenantId)
      .filter((a) => a.clienteId === p.clienteId && a.situacao === "marcado" && a.servicoValor > 0)
      .filter((a) => a.dataLocal >= p.desde && a.dataLocal < p.ate && Date.parse(a.inicioISO) < Date.now())
      .filter((a) => !ATIVOS[chave(t.tenantId, a.maisaAg)])
      .map(paraCobrar);
  },

  async atendimentoPorAg(t, maisaAg) {
    const a = espelhoDemo(t.tenantId).find((x) => x.maisaAg === maisaAg);
    return a && a.situacao === "marcado" ? { ...paraCobrar(a), recebimentoId: ATIVOS[chave(t.tenantId, maisaAg)] ?? null } : null;
  },

  async atendimentosEmCobranca(t) {
    const abertos = new Set(daqui(t.tenantId).filter((r) => r.situacao === "perguntar" || r.situacao === "aberto").map((r) => r.id));
    return Object.keys(ATIVOS)
      .filter((k) => k.startsWith(`${t.tenantId}|`) && abertos.has(ATIVOS[k]))
      .map((k) => k.slice(t.tenantId.length + 1));
  },

  async criar(t, novo) {
    const linhas = espelhoDemo(t.tenantId).filter((a) => novo.atendimentoIds.includes(a.maisaAg) && a.situacao === "marcado");
    if (!linhas.length || linhas.length !== novo.atendimentoIds.length) throw new DadoInvalido("Atendimento que não é deste negócio, ou cancelado.");
    if (new Set(linhas.map((a) => a.clienteId ?? "")).size > 1) throw new DadoInvalido("Um recebimento é de uma pessoa só.");
    const telefone = linhas.find((a) => a.clienteTel)?.clienteTel;
    if (!telefone) throw new DadoInvalido("Atendimento sem telefone: não há para onde mandar o Pix.");
    const valor = linhas.reduce((s, a) => s + a.servicoValor, 0);
    if (valor <= 0) throw new DadoInvalido("Atendimento sem valor.");
    if (linhas.some((a) => ATIVOS[chave(t.tenantId, a.maisaAg)]) || daqui(t.tenantId).some((r) => r.id === novo.id)) return null;

    const r: Recebimento & { tenantId: string } = {
      tenantId: t.tenantId,
      id: novo.id,
      clienteId: linhas[0].clienteId,
      telefone,
      nome: linhas[0].clienteNome,
      valor: Math.round(valor * 100) / 100,
      descricao: novo.descricao,
      identificador: novo.identificador,
      situacao: novo.situacao,
      forma: null,
      meio: "pix",
      idExterno: null,
      link: null,
      atendimentoIds: [...novo.atendimentoIds],
      criadoEm: new Date().toISOString(),
      perguntadoEm: null,
      pagoEm: null,
      cpfPedidoEm: null,
    };
    RECEBIMENTOS.push(r);
    for (const a of linhas) ATIVOS[chave(t.tenantId, a.maisaAg)] = r.id;
    return semTenant(r);
  },

  async porId(t, id) {
    const r = daqui(t.tenantId).find((x) => x.id === id);
    return r ? semTenant(r) : null;
  },

  async emAberto(t, p) {
    return daqui(t.tenantId)
      .filter((r) => r.situacao === "perguntar" || r.situacao === "aberto")
      .filter((r) => !p?.telefone || chaveDe(r.telefone) === chaveDe(p.telefone))
      .sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1))
      .map(semTenant);
  },

  async pagos(t, p) {
    return daqui(t.tenantId)
      .filter((r) => r.situacao === "pago" && (r.pagoEm ?? "") >= p.desde)
      .sort((a, b) => ((a.pagoEm ?? "") < (b.pagoEm ?? "") ? 1 : -1))
      .map(semTenant);
  },

  async mudar(t, id, p) {
    const r = daqui(t.tenantId).find((x) => x.id === id);
    if (!r || !p.de.includes(r.situacao)) return null;
    r.situacao = p.para;
    if (p.para === "pago") {
      r.forma = p.forma ?? null;
      r.pagoEm = new Date().toISOString();
    } else {
      r.pagoEm = null;
    }
    if (p.para === "cancelado") for (const a of r.atendimentoIds) delete ATIVOS[chave(t.tenantId, a)];
    return semTenant(r);
  },

  async anotar(t, id, p) {
    const r = daqui(t.tenantId).find((x) => x.id === id);
    if (!r) return;
    if (p.perguntadoEm) r.perguntadoEm = p.perguntadoEm;
    if (p.cpfPedidoEm) r.cpfPedidoEm = p.cpfPedidoEm;
    if (p.cobranca) Object.assign(r, { meio: "asaas", idExterno: p.cobranca.idExterno, link: p.cobranca.link });
  },

  async esperandoCpf(t, telefone) {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    return daqui(t.tenantId)
      .filter((r) => (r.situacao === "pago" || r.situacao === "aberto") && r.cpfPedidoEm && r.cpfPedidoEm >= desde && r.clienteId)
      .filter((r) => chaveDe(r.telefone) === chaveDe(telefone) && !CPFS[chave(t.tenantId, r.clienteId!)])
      .map(semTenant);
  },

  async registrarComprovante(t, c) {
    const repetido = COMPROVANTES.some(
      (x) => x.tenantId === t.tenantId && ((c.idTransacao && x.idTransacao === c.idTransacao) || (c.mensagemId && x.mensagemId === c.mensagemId)),
    );
    if (repetido) return { id: null, repetido: true };
    const id = `comprovante-demo-${COMPROVANTES.length + 1}`;
    const nome = c.recebimentoId ? daqui(t.tenantId).find((r) => r.id === c.recebimentoId)?.nome ?? null : null;
    COMPROVANTES.push({ ...c, id, tenantId: t.tenantId, nome, situacao: "a_conferir", criadoEm: new Date().toISOString() });
    return { id, repetido: false };
  },

  async comprovantes(t, p) {
    return COMPROVANTES.filter((c) => c.tenantId === t.tenantId && c.situacao === p.situacao).map(
      ({ tenantId: _t, mensagemId: _m, ...c }) => c,
    );
  },

  async confirmarComprovante(t, p) {
    const c = COMPROVANTES.find((x) => x.tenantId === t.tenantId && x.id === p.id);
    if (!c) throw new DadoInvalido("Comprovante não encontrado.");
    if (c.situacao !== "a_conferir") throw new DadoInvalido("Este comprovante já foi conferido.");
    const r = daqui(t.tenantId).find((x) => x.id === p.recebimentoId);
    if (!r || (r.situacao !== "perguntar" && r.situacao !== "aberto")) throw new DadoInvalido("Esta cobrança não está mais em aberto.");
    r.situacao = "pago";
    r.forma = "pix";
    r.pagoEm = new Date().toISOString();
    c.situacao = "confirmado";
    c.recebimentoId = r.id;
    return semTenant(r);
  },

  async descartarComprovante(t, p) {
    if (!p.motivo.trim()) throw new DadoInvalido("Diga por que o comprovante foi descartado.");
    const c = COMPROVANTES.find((x) => x.tenantId === t.tenantId && x.id === p.id && x.situacao === "a_conferir");
    if (!c) return false;
    c.situacao = "descartado";
    return true;
  },
};

/** Quem paga "por mês" no demo, e o CPF que a ficha demo tem. Só o teste chama. */
export function pagaPorMesDemo(tenantId: string, pessoas: ClientePorMes[]): void {
  POR_MES[tenantId] = pessoas;
}

export function cpfDaFichaDemo(tenantId: string, clienteId: string, cpf: string): void {
  CPFS[chave(tenantId, clienteId)] = cpf;
}

/** Zera tudo. Só o teste chama. */
export function zerarRecebimentosDemo(): void {
  for (const k of Object.keys(CONFIG)) delete CONFIG[k];
  RECEBIMENTOS = [];
  ATIVOS = {};
  COMPROVANTES = [];
  POR_MES = {};
  CPFS = {};
}
