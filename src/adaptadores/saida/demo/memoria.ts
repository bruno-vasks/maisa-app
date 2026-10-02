/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — memória, histórico e canal, em MEMÓRIA DE PROCESSO.
 *
 * ⚠️ LIMITAÇÃO DECLARADA, NÃO ESQUECIMENTO. Um `Map` de módulo:
 *   • morre no redeploy — o cliente vira desconhecido de novo;
 *   • não é compartilhado entre instâncias — na Vercel, duas mensagens seguidas podem
 *     cair em lambdas diferentes e a segunda não lembra da primeira.
 *
 * Isso é aceitável para EXERCITAR o agente (é o que faz `npm run dev` responder hoje)
 * e inaceitável em produção. A tabela de verdade já está versionada em
 * `supabase/007_memoria_agente.sql`; o que falta é um `saida/supabase/memoria.ts` e
 * uma linha em `composicao.ts`.
 *
 * Escrevemos o adaptador falso em vez de deixar a porta sem implementação porque
 * porta sem adaptador não roda, e agente que não roda não recebe feedback — e o
 * feedback é a única coisa que ajusta o tom de um agente conversacional.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  ConversaGravada, RepositorioConversas, RepositorioHistorico, RepositorioMemoria,
} from "@/nucleo/portas/saida/memoria-cliente";
import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import type { MemoriaCliente } from "@/nucleo/dominio/memoria";
import type { Msg, PosseDaConversa } from "@/nucleo/dominio/conversas";
import { soDigitos } from "@/nucleo/dominio/clientes";

/* A chave inclui o tenant mesmo havendo um negócio só. Não é cerimônia: é o que faz
 * este adaptador ter o MESMO comportamento observável que o do Supabase vai ter. Um
 * dublê que ignora o inquilino esconde exatamente o bug que o multi-tenant introduz.
 *
 * ⚠️ E POR ISSO ELA REDUZ O TELEFONE AOS 8 ÚLTIMOS DÍGITOS, como `telefone_chave` no banco.
 * Antes a chave era a string crua que chegava, e enquanto só o agente escrevia isso funcionou
 * — ele sempre passa o número inteiro do envelope. O painel passa a CHAVE (é o id da conversa
 * na tela), e num Map cru "5511981234567" e "81234567" são duas conversas: a tela abriria
 * vazia, sem erro nenhum, só no modo demonstração. Dublê que normaliza diferente do original
 * é dublê que esconde bug em vez de revelar. */
const chave = (tenantId: string, telefone: string) =>
  `${tenantId}::${soDigitos(telefone).slice(-8)}`;

const PERFIS = new Map<string, MemoriaCliente>();
const THREADS = new Map<string, Msg[]>();
/** O último número COMPLETO visto para cada chave — o espelho da coluna `telefone` do 009.
 *  É o que o painel usa para responder; de 8 dígitos não se remonta DDD nem DDI. */
const NUMEROS = new Map<string, string>();
const POSSE = new Map<string, PosseDaConversa>();

/** Teto do log em memória. Sem ele, uma conversa longa segura RAM do processo
 *  indefinidamente — e ninguém repara, porque não aparece em lugar nenhum. */
const MAX_GUARDADO = 200;

/** Só o inquilino corrente. O prefixo da chave é a "cláusula where" deste adaptador. */
const doTenant = <V>(m: Map<string, V>, tenantId: string) =>
  Array.from(m.entries()).filter(([k]) => k.startsWith(`${tenantId}::`));

export const memoriaDemo: RepositorioMemoria = {
  async ler(t, telefone) {
    // Cópia defensiva: o núcleo trata memória como imutável, e devolver a referência
    // do Map faria uma mutação acidental "funcionar" aqui e falhar contra o banco.
    const m = PERFIS.get(chave(t.tenantId, telefone));
    return m ? { ...m, historico: [...m.historico] } : null;
  },

  async gravar(t, m) {
    PERFIS.set(chave(t.tenantId, m.telefone), { ...m, historico: [...m.historico] });
  },
};

export const historicoDemo: RepositorioHistorico = {
  async ler(t, telefone, limite) {
    const todas = THREADS.get(chave(t.tenantId, telefone)) ?? [];
    return todas.slice(-limite);
  },

  async anexar(t, telefone, msgs) {
    const k = chave(t.tenantId, telefone);
    const numero = soDigitos(telefone);
    if (numero.length >= 10) NUMEROS.set(k, numero);
    /* `em` é preenchido AQUI porque no banco quem preenche é o default da coluna. Sem isto a
     * tela receberia `undefined` no modo demonstração e mostraria "--:--" em toda bolha — o
     * tipo de diferença entre os dois adaptadores que faz o dublê mentir. */
    const agora = new Date().toISOString();
    const todas = [...(THREADS.get(k) ?? []), ...msgs.map((m) => ({ ...m, em: m.em ?? agora }))];
    THREADS.set(k, todas.slice(-MAX_GUARDADO));
  },

  async conversas(t, limite) {
    return doTenant(THREADS, t.tenantId)
      .map(([k, msgs]) => resumir(t.tenantId, k, msgs))
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
      .slice(0, limite);
  },

  async conversa(t, telefone) {
    const k = chave(t.tenantId, telefone);
    return resumir(t.tenantId, k, THREADS.get(k) ?? []);
  },
};

/** Uma thread do Map → o que a porta promete. O par do `v_conversas` do 009. */
function resumir(tenantId: string, k: string, msgs: Msg[]): ConversaGravada | null {
  const ultima = msgs[msgs.length - 1];
  if (!ultima) return null;
  const telefoneChave = k.slice(tenantId.length + 2);
  const perfil = PERFIS.get(k);
  return {
    telefoneChave,
    telefone: NUMEROS.get(k) ?? "",
    nome: perfil?.nome,
    clienteId: perfil?.clienteId,
    ultima,
    atualizadaEm: ultima.em ?? new Date().toISOString(),
    posse: POSSE.get(k) ?? {},
  };
}

/**
 * Quem conduz, em memória de processo.
 *
 * ⚠️ A LIMITAÇÃO DESTE AQUI MACHUCA MAIS QUE A DOS OUTROS DOIS, e vale saber antes de
 * confiar: assumir uma conversa no painel e perder o estado num redeploy significa a MAISA
 * VOLTANDO A FALAR numa conversa que o dono assumiu. Perder memória é o cliente virar
 * desconhecido; perder posse é o produto quebrar a promessa do botão. Em produção quem serve
 * isto é `saida/supabase/memoria.ts` — este dublê existe para o `/laboratorio` rodar sem banco.
 */
export const conversasDemo: RepositorioConversas = {
  async posse(t, telefone) {
    return POSSE.get(chave(t.tenantId, telefone)) ?? {};
  },

  async marcar(t, telefone, p) {
    const k = chave(t.tenantId, telefone);
    const atual = POSSE.get(k) ?? {};
    const agora = new Date().toISOString();
    POSSE.set(k, {
      // `undefined` é "não mexa" — mesma semântica do adaptador real. Ver `marcar` lá.
      assumidaEm: p.assumida === undefined ? atual.assumidaEm : p.assumida ? agora : null,
      resolvidaEm: p.resolvida === undefined ? atual.resolvidaEm : p.resolvida ? agora : null,
    });
  },
};

/**
 * Dev-only: esquece tudo. Não faz parte de nenhuma porta — é afordância deste
 * adaptador, e por isso não aparece em `RepositorioMemoria`.
 *
 * Serve ao laboratório de conversa, e o que ela destrava é específico: o caminho
 * "cliente que nunca falou com a MAISA" só é testável UMA vez por processo. Sem reset,
 * depois da primeira mensagem você nunca mais vê a saudação de desconhecido — e é
 * justamente ela que decide se a primeira impressão do produto presta.
 */
export function limparDemo() {
  PERFIS.clear();
  THREADS.clear();
  // Os dois novos vão junto: sobrar posse de uma conversa cujas mensagens foram apagadas
  // deixaria a MAISA calada numa thread que, para todos os efeitos, nunca existiu.
  NUMEROS.clear();
  POSSE.clear();
}

/** Para o laboratório mostrar o que a MAISA lembra, sem passar por caso de uso. */
export function espiarMemoriaDemo(tenantId: string) {
  const prefixo = `${tenantId}::`;
  return Array.from(PERFIS.entries())
    .filter(([k]) => k.startsWith(prefixo))
    .map(([, m]) => m);
}

/**
 * O canal de saída de mentira: escreve no log do servidor.
 *
 * A rota devolve as bolhas no corpo da resposta, então dá para conversar com a MAISA
 * por `curl` sem ter Evolution API configurada — é assim que se afina o tom antes de
 * pagar por número. Quando o WhatsApp entrar, isto vira `saida/evolution/canal.ts` e
 * a troca é uma linha em `composicao.ts`.
 */
export const canalDemo: CanalDeMensagens = {
  async enviar(_t, para, textos) {
    for (const txt of textos) console.log(`[MAISA → ${para}] ${txt}`);
  },

  /* O link do PDF não vai para o log: ele abre o recibo de alguém por dez minutos. */
  async enviarDocumento(_t, para, doc) {
    console.log(`[MAISA → ${para}] 📄 ${doc.nomeDoArquivo} · ${doc.legenda}`);
  },

  async escalar(_t, p) {
    // No app de verdade isto entra na fila "Precisa de você" (`dominio/conversas.ts`
    // → ItemFila) e notifica o dono. Enquanto a fila é fixture, um log honesto.
    console.warn(`[MAISA ⚠ escalou ${p.telefone}] ${p.motivo}`);
  },
};
