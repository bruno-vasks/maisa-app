/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — a ficha dos leads da casa, em memória (05/11/2026).
 *
 * As mesmas regras da 040, para o dublê não mentir: uma ficha por telefone (pelos 8 últimos
 * dígitos) e por negócio, `registrarContato` nunca apaga o que já existe, e a reserva de uma
 * automática só é de quem a gravou primeiro.
 *
 * `conversas` lê a conversa do `historicoDemo`, o MESMO que o agente escreve em demonstração.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ConversaDoLead, RepositorioDeLeads } from "@/nucleo/portas/saida/repositorio-leads";
import type { Automatica, FichaDeLead } from "@/nucleo/dominio/vendas";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { historicoDemo } from "./memoria";

const FICHAS = new Map<string, FichaDeLead>();
const chave = (tenantId: string, telefone: string) => `${tenantId}:${soDigitos(telefone).slice(-8)}`;

const campo: Record<Automatica, "boasVindasEm" | "lembreteEm" | "retomadaEm"> = {
  boas_vindas: "boasVindasEm",
  lembrete: "lembreteEm",
  retomada: "retomadaEm",
};

function garantir(tenantId: string, telefone: string): FichaDeLead {
  const k = chave(tenantId, telefone);
  let f = FICHAS.get(k);
  if (!f) {
    f = {
      telefone: soDigitos(telefone), nome: null, qualificacao: null, passo: null, plano: null,
      qualificadoEm: null, linkEm: null, boasVindasEm: null, lembreteEm: null, retomadaEm: null,
    };
    FICHAS.set(k, f);
  }
  return f;
}

const copia = (f: FichaDeLead): FichaDeLead => ({ ...f, qualificacao: f.qualificacao ? { ...f.qualificacao } : null });

export const leadsDemo: RepositorioDeLeads = {
  faltando: () => [],

  async ler(t, telefone) {
    const f = FICHAS.get(chave(t.tenantId, telefone));
    return f ? copia(f) : null;
  },

  async registrarContato(t, p) {
    const f = garantir(t.tenantId, p.telefone);
    if (p.nome && !f.nome) f.nome = p.nome;
  },

  async qualificar(t, p) {
    const f = garantir(t.tenantId, p.telefone);
    if (p.nome) f.nome = p.nome;
    f.qualificacao = { ...p.qualificacao };
    f.passo = p.passo;
    f.plano = p.plano;
    f.qualificadoEm = p.em;
  },

  async marcarConversa(t, p) {
    const f = garantir(t.tenantId, p.telefone);
    if (p.nome && !f.nome) f.nome = p.nome;
    f.passo = "conversa";
  },

  async marcarLink(t, p) {
    garantir(t.tenantId, p.telefone).linkEm = p.em;
  },

  async reservarAutomatica(t, p) {
    const f = garantir(t.tenantId, p.telefone);
    if (p.nome && !f.nome) f.nome = p.nome;
    if (f[campo[p.tipo]]) return false;
    f[campo[p.tipo]] = p.em;
    return true;
  },

  async devolverAutomatica(t, p) {
    const f = FICHAS.get(chave(t.tenantId, p.telefone));
    if (f) f[campo[p.tipo]] = null;
  },

  async conversas(t, desde) {
    const prefixo = `${t.tenantId}:`;
    const r: ConversaDoLead[] = [];
    for (const [k, f] of FICHAS) {
      if (!k.startsWith(prefixo)) continue;
      const msgs = await historicoDemo.ler(t, f.telefone, 200);
      const ultima = msgs[msgs.length - 1];
      if (!ultima?.em || ultima.em < desde) continue;
      r.push({ ficha: copia(f), ultimaDe: ultima.de, ultimaEm: ultima.em, clienteFalou: msgs.some((m) => m.de === "cliente") });
    }
    return r;
  },
};

/** Só para teste e bancada: apaga as fichas. */
export function limparLeadsDemo() {
  FICHAS.clear();
}
