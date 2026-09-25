/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — o caderno de nomes em memória.
 *
 * Existe pela mesma razão dos irmãos (`demo/agenda.ts`, `demo/canal.ts`): sem ele, um
 * ambiente sem banco não consegue exercitar a decisão que mais importa deste pedaço — "a
 * MAISA pode falar com esta pessoa?" — e o único caminho que não precisa de infra (o
 * `/laboratorio`) deixaria de testar justamente o guardrail novo.
 *
 * ⚠️ MEMÓRIA DE PROCESSO: morre no redeploy e não é compartilhada entre instâncias. Serve
 * para desenvolvimento e para o demo aberto. Quem tem banco usa `saida/supabase/contatos.ts`.
 *
 * O caderno de partida tem PAI e MÃE de propósito. É o caso que deu origem ao desenho — o
 * número pareado é o celular pessoal do dono, e a MAISA não pode oferecer horário para a
 * família dele. Com o modo `pessoal` (o padrão) e este fixture, o comportamento certo é
 * verificável no `/laboratorio`: escreva do número da Mariana e ela atende; do número do Pai
 * e ela cala.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { RascunhoDeContato, RepositorioContatos } from "@/nucleo/portas/saida/repositorio-contatos";
import type { ContatoDoProvedor, ContatosDoCanal } from "@/nucleo/portas/saida/contatos-do-canal";
import type { HistoricoDoCanal } from "@/nucleo/portas/saida/historico-do-canal";
import type { Contato, ModoDoNumero } from "@/nucleo/dominio/contatos";
import { MODO_PADRAO, chaveDe } from "@/nucleo/dominio/contatos";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

/** Chave: `tenantId`. Valor: o caderno daquele inquilino. */
const CADERNO = new Map<string, Map<string, Contato & { telefone: string | null }>>();
const MODOS = new Map<string, ModoDoNumero>();

/** A agenda que o "provedor" conhece — o que uma importação traria. */
const AGENDA_DO_PROVEDOR: ContatoDoProvedor[] = [
  { telefone: "5511994294906", nome: "Pai" },
  { telefone: "5511987651234", nome: "Mãe" },
  { telefone: "5511981234567", nome: "Mariana Alves" },
  { telefone: "5511999881122", nome: "Dentista Dr. Souza" },
  /* Sem nome de propósito: a agenda de todo mundo tem números salvos sem etiqueta, e a tela
   * precisa desenhar isso sem parecer defeito. */
  { telefone: "5511970001111", nome: null },
];

function caderno(tenantId: string) {
  let c = CADERNO.get(tenantId);
  if (!c) {
    c = new Map();
    /* Semeia com PAI e MÃE, e nada marcado como cliente: é o estado em que o guardrail
     * REALMENTE cala alguém, que é o que precisa ser exercitável sem configurar nada. */
    for (const nome of ["Pai", "Mãe"]) {
      const p = AGENDA_DO_PROVEDOR.find((x) => x.nome === nome)!;
      c.set(chaveDe(p.telefone), { chave: chaveDe(p.telefone), nome: p.nome, cliente: null, telefone: p.telefone });
    }
    CADERNO.set(tenantId, c);
  }
  return c;
}

export const contatosDemo: RepositorioContatos = {
  async ler(t: ContextoTenant, chave: string) {
    if (!chave) return null;
    const achado = caderno(t.tenantId).get(chave);
    return achado ? { chave: achado.chave, nome: achado.nome, cliente: achado.cliente } : null;
  },

  async estaVazio(t: ContextoTenant) {
    /* No demo o caderno começa vazio, e isso não é descuido: é o estado que causou o
     * incidente de 24/08/2026, e o laboratório tem que conseguir reproduzi-lo. */
    return caderno(t.tenantId).size === 0;
  },

  async listar(t: ContextoTenant) {
    return [...caderno(t.tenantId).values()]
      .map((c) => ({ chave: c.chave, nome: c.nome, cliente: c.cliente }))
      .sort((a, b) => Number(b.cliente === true) - Number(a.cliente === true) || (a.nome ?? "").localeCompare(b.nome ?? ""));
  },

  async salvarLote(t: ContextoTenant, contatos: readonly RascunhoDeContato[]) {
    const c = caderno(t.tenantId);
    let novos = 0;
    for (const r of contatos) {
      if (!r.chave) continue;
      const antes = c.get(r.chave);
      if (!antes) novos += 1;
      /* Preserva `cliente` — a mesma invariante que o adaptador do Supabase escreve em voz
       * alta: reimportar não pode apagar o que o dono decidiu à mão. */
      c.set(r.chave, { chave: r.chave, nome: r.nome ?? antes?.nome ?? null, telefone: r.telefone, cliente: antes?.cliente ?? null });
    }
    return { novos, total: c.size };
  },

  async marcar(t: ContextoTenant, p) {
    const c = caderno(t.tenantId);
    const antes = c.get(p.chave);
    c.set(p.chave, {
      chave: p.chave,
      nome: p.nome ?? antes?.nome ?? null,
      telefone: p.telefone ?? antes?.telefone ?? null,
      cliente: p.cliente,
    });
  },

  async marcarVarios(t: ContextoTenant, p) {
    const c = caderno(t.tenantId);
    let mudadas = 0;
    for (const chave of p.chaves) {
      const antes = c.get(chave);
      /* Só conta o que EXISTE, espelhando o `update` do Supabase: lá uma chave inventada
       * não casa linha nenhuma e não entra na contagem. Se aqui ela criasse contato, a
       * demonstração passaria a validar um comportamento que a produção não tem. */
      if (!antes) continue;
      c.set(chave, { ...antes, cliente: p.cliente });
      mudadas += 1;
    }
    return mudadas;
  },

  async modo(t: ContextoTenant) {
    return MODOS.get(t.tenantId) ?? MODO_PADRAO;
  },

  async definirModo(t: ContextoTenant, modo: ModoDoNumero) {
    MODOS.set(t.tenantId, modo);
  },
};

export const contatosDoCanalDemo: ContatosDoCanal = {
  faltando: () => [],
  async listar() {
    return AGENDA_DO_PROVEDOR;
  },
};

/** Para o `/laboratorio` voltar ao estado limpo — o mesmo espírito de `limparDemo`. */
export function limparContatosDemo(): void {
  CADERNO.clear();
  MODOS.clear();
}

/**
 * O rastro de mentira: toda conversa é vazia. Só existe para o ambiente sem Evolution
 * conseguir exercitar a decisão — e "vazia" aqui ainda passa pelo portão da intenção.
 */
export const historicoDoCanalDemo: HistoricoDoCanal = {
  async rastro() {
    return { jaEscreveramParaEle: false, maisAntiga: null };
  },
};
