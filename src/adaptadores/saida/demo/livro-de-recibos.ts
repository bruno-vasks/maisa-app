/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — o livro-razão da emissão unitária, em memória.
 *
 * ★ ELE EXISTE PARA A CLAIM SER EXERCITÁVEL SEM BANCO, e a claim aqui é a que evita documento
 * fiscal duplicado. As garantias que este demo tem que reproduzir, e que não se conferem lendo
 * o código:
 *
 *   `abrir` duas vezes no mesmo pagamento .... arquivo na primeira, `null` na segunda
 *   `fechar` duas vezes no mesmo protocolo ... muda na primeira, `null` na segunda
 *   `soltar` a partir de `pendente` .......... `false`, e o pagamento NÃO volta
 *   `soltar` a partir de `recusado` .......... `true`, e o pagamento volta
 *
 * ⚠️ O `presos` DEVOLVE PARA O `recibosDemo`. Os dois demos falam do mesmo pagamento: um cuida
 * da lista do lote, o outro do razão unitário. Se este soltar sem avisar aquele, o pagamento
 * fica invisível nos dois — que é exatamente o bug que a `v_a_recibar` do 020 evita no banco.
 *
 * ⚠️ MUTÁVEL, com o limite dos outros demos: vive enquanto o processo viver.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { LivroDeRecibos, ReciboAberto, DestinatarioDoRecibo } from "@/nucleo/portas/saida/livro-de-recibos";
import type { DesfechoDeRecibo, ReciboEmitido } from "@/nucleo/dominio/recibo-unitario";
import type { FontePagamento } from "@/nucleo/portas/saida/repositorio-recibos";

/* `pagamentos` é lista desde 01/10/2026: um recibo por mês junta várias sessões. */
type Linha = ReciboEmitido & { pagamentos: { fonte: FontePagamento; id: string }[]; valor: number };

let linhas: Linha[] = [];
let sequencia = 0;

/**
 * Quanto vale cada pagamento, na visão do demo.
 *
 * ⚠️ O VALOR VEM DAQUI E NÃO DE QUEM CHAMA, igual no banco. Aceitar o valor do chamador faria o
 * demo passar num teste que o Postgres reprova — e o motivo de o banco somar é que tela aberta
 * há dez minutos manda total velho, que aqui viraria recibo de valor errado.
 */
const VALOR_PADRAO = 250;
const valores = new Map<string, number>();

/** Registra quanto vale um pagamento, para o teste poder exercitar valor diferente. */
export function definirValorDemo(pagamentoId: string, valor: number): void {
  valores.set(pagamentoId, valor);
}

export function limparLivroDemo(): void {
  linhas = [];
  valores.clear();
  sequencia = 0;
}

/** O que o razão prendeu. Serve ao demo do lote, para os dois não brigarem pelo pagamento. */
export function pagamentosPresosNoDemo(): string[] {
  return linhas.filter((l) => l.situacao !== "recusado").flatMap((l) => l.pagamentos.map((x) => x.id));
}

const semInternos = (l: Linha): ReciboEmitido => {
  const { pagamentos: _p, valor: _v, ...limpo } = l;
  return limpo;
};

export const livroDeRecibosDemo: LivroDeRecibos = {
  async abrir(_t, p): Promise<ReciboAberto | null> {
    /* A claim: um pagamento já preso não se prende de novo. `recusado` não conta como preso —
     * ele foi solto, e é o único estado do qual se pode tentar outra vez. */
    /* Tudo ou nada, como a `abrir_recibo_agrupado`: uma presa e nenhuma é presa. */
    const pedidos = new Set(p.itens.map((x) => x.id));
    const preso = linhas.some((l) => l.situacao !== "recusado" && l.pagamentos.some((x) => pedidos.has(x.id)));
    if (preso || pedidos.size === 0) return null;

    const numero = ++sequencia;
    const id = `rec-demo-${numero}`;
    const valor = [...pedidos].reduce((s, x) => s + (valores.get(x) ?? VALOR_PADRAO), 0);

    linhas = [
      {
        id,
        canal: p.canal,
        situacao: "pendente",
        protocolo: null,
        chave: null,
        pdfUrl: null,
        pdfExpiraEm: null,
        comprovanteCaminho: null,
        aviso: null,
        erro: null,
        criadoEm: new Date().toISOString(),
        emitidoEm: null,
        pagamentos: p.itens.map((x) => ({ fonte: x.fonte, id: x.id })),
        valor,
      },
      ...linhas,
    ];

    /* ★ O `numero` SAI DA MESMA CHAMADA que prendeu, como no banco. É ele que faz o protocolo
     * existir antes de qualquer conversa com o canal — ver `ReciboAberto.numero`. */
    return { id, numero, valor };
  },

  async registrarProtocolo(_t, p): Promise<void> {
    linhas = linhas.map((l) => (l.id === p.reciboId ? { ...l, protocolo: p.protocolo } : l));
  },

  async fechar(_t, d: DesfechoDeRecibo): Promise<ReciboEmitido | null> {
    const alvo = linhas.find((l) => l.protocolo === d.protocolo);
    if (!alvo) return null;

    /* ⚠️ DUAS TRANSIÇÕES, E SÓ ESTAS DUAS. `pendente` → emitido/recusado é o desfecho da
     * emissão; `emitido` → `cancelado` é o desfecho do cancelamento, que chega quando a linha
     * já não é `pendente` — e sem esta segunda regra o cancelamento se perdia calado, deixando
     * a tela dizer "emitido" para um documento que deixou de existir. Ver a porta.
     *
     * `null` nos outros casos é a idempotência: reentrega de webhook é rotina, e a reconciliação
     * pode estar perguntando a mesma coisa no mesmo instante. */
    const permitido = d.situacao === "cancelado"
      ? alvo.situacao === "emitido"
      : alvo.situacao === "pendente";
    if (!permitido) return null;

    const fechada: Linha = {
      ...alvo,
      situacao: d.situacao,
      chave: d.chave,
      pdfUrl: d.pdfUrl,
      pdfExpiraEm: d.pdfExpiraEm,
      /* Não apaga a cópia que já existia: um cancelamento não chega com arquivo, e zerar o
       * caminho aqui perderia o comprovante da emissão que de fato aconteceu. */
      comprovanteCaminho: d.comprovanteCaminho ?? alvo.comprovanteCaminho,
      erro: d.erro,
      emitidoEm: d.situacao === "emitido" ? new Date().toISOString() : alvo.emitidoEm,
    };
    linhas = linhas.map((l) => (l.id === alvo.id ? fechada : l));
    return semInternos(fechada);
  },

  async descartar(_t, p): Promise<void> {
    /* Marca e solta na mesma passada — no banco é uma transação, aqui é uma atribuição. O que
     * importa é o estado final: `recusado`, que é o único do qual `pagamentosPresosNoDemo` não
     * considera o pagamento preso. */
    linhas = linhas.map((l) =>
      l.id === p.reciboId && l.situacao === "pendente"
        ? { ...l, situacao: "recusado" as const, erro: p.erro }
        : l);
  },

  async soltar(_t, reciboId): Promise<boolean> {
    const alvo = linhas.find((l) => l.id === reciboId);
    /* ⚠️ `recusado` E SÓ. Soltar um `pendente` devolve à fila um pagamento cujo recibo pode
     * existir; soltar um `emitido` faz o mês seguinte emitir o segundo. */
    if (!alvo || alvo.situacao !== "recusado") return false;
    /* A linha do razão FICA — é histórico. O que sai é o vínculo com o pagamento, e no demo
     * isso é o `pagamentosPresosNoDemo` deixar de listá-lo (ele já filtra `recusado`). */
    return true;
  },

  async porProtocolo(_t, p): Promise<ReciboEmitido | null> {
    const alvo = linhas.find((l) => l.canal === p.canal && l.protocolo === p.protocolo);
    return alvo ? semInternos(alvo) : null;
  },

  async pendentes(_t, p): Promise<ReciboEmitido[]> {
    /* Inclui os SEM protocolo de propósito: são os que precisam de olho humano, e omiti-los
     * aqui os tornaria invisíveis para sempre. Ver `precisaDeOlhoHumano`. */
    return linhas
      .filter((l) => l.situacao === "pendente" && l.criadoEm < p.antesDe)
      .map(semInternos);
  },

  async listar(_t, p): Promise<ReciboEmitido[]> {
    return linhas.slice(0, p?.limite ?? 50).map(semInternos);
  },

  async avisosPendentes(): Promise<{ falhou: number; semTelefone: number }> {
    return {
      falhou: linhas.filter((l) => l.aviso === "falhou").length,
      semTelefone: linhas.filter((l) => l.aviso === "sem_telefone").length,
    };
  },

  async registrarAviso(_t, p): Promise<void> {
    const l = linhas.find((x) => x.id === p.reciboId);
    if (l) l.aviso = p.desfecho;
  },

  /**
   * Quem avisar, na versão de mentira.
   *
   * ⚠️ TELEFONE `null` DE PROPÓSITO no padrão. O demo roda em ambiente sem Supabase, e o caminho
   * que ele precisa exercitar é o de NÃO ter para onde mandar — que é o caso comum de verdade (o
   * avulso de quem não é cadastro). Quem quiser o outro caminho usa `porADemoTerTelefone`.
   */
  async destinatario(_t, reciboId): Promise<DestinatarioDoRecibo | null> {
    const l = linhas.find((x) => x.id === reciboId);
    if (!l) return null;
    return {
      nome: `Cliente ${l.pagamentos[0]?.id ?? ""}`,
      telefone: telefoneDoDemo,
      data: l.criadoEm.slice(0, 10),
      valor: l.valor,
      sessoes: l.pagamentos.length,
    };
  },
};

/** O telefone que o demo devolve em `destinatario`. `null` = ninguém a avisar. */
let telefoneDoDemo: string | null = null;

/** Liga o caminho "tem telefone" no demo. Só para teste — ver o ⚠️ de `destinatario`. */
export function porADemoTerTelefone(tel: string | null): void {
  telefoneDoDemo = tel;
}
