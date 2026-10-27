/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — as notas, em memória.
 *
 * ★ ELE EXISTE PARA A CLAIM SER EXERCITÁVEL SEM BANCO. A garantia que importa nesta porta —
 * "clicar duas vezes não emite duas notas" — é a coisa mais fácil de quebrar num refactor e a
 * mais cara de descobrir em produção. Aqui ela roda no `/laboratorio`, de graça.
 *
 * A lista de partida vem dos MESMOS fixtures das outras telas (`clientes.ts`), e não de um
 * array próprio: com dados inventados, afinar a tela de faturamento seria afinar contra
 * números que não batem com a agenda que a tela ao lado mostra.
 *
 * ⚠️ MUTÁVEL, e o limite é o mesmo dos outros demos: vive enquanto o processo viver. Serve
 * para o clique surtir efeito na sessão; não serve para nada mais.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { NotaAberta, RepositorioNotas } from "@/nucleo/portas/saida/repositorio-notas";
import type { AFaturar, NotaGravada, ResultadoDeNota, StatusNota } from "@/nucleo/dominio/fiscal";
import { CLIENTES } from "./clientes";

/** O que ainda não foi faturado, por cliente. É o equivalente demo de `v_a_faturar`. */
let pendentes: AFaturar[] = CLIENTES
  .filter((c) => c.valor > 0)
  .map((c) => ({
    clienteId: c.id,
    nome: c.nome,
    cpf: c.cpf?.replace(/\D/g, "") || null,
    atendimentos: c.atendimentos || 1,
    valor: c.valor,
    servico: null,
    desde: "2026-08-01",
    ate: "2026-08-17",
    competencia: "2026-08-01",
    teste: c.teste === true,
  }));

let gravadas: NotaGravada[] = [];
let sequencia = 0;

const statusDoResultado = (r: ResultadoDeNota): StatusNota => {
  switch (r.status) {
    case "autorizado": return "emitida";
    case "cancelado": return "cancelada";
    case "erro": return "erro";
    case "simulado": return "emitida";
    default: return "processando";
  }
};

export const notasDemo: RepositorioNotas = {
  async aFaturar(): Promise<AFaturar[]> {
    return pendentes.map((p) => ({ ...p }));
  },

  async abrir(_t, p): Promise<NotaAberta | null> {
    const i = pendentes.findIndex((x) => x.clienteId === p.clienteId);
    /* ⚠️ AQUI ESTÁ A CLAIM. Some da lista de pendentes ANTES de qualquer outra coisa — é o
     * que faz o segundo clique receber `null` e não uma segunda nota. Um `find` sem o
     * `splice` passaria nos testes de caminho feliz e falharia exatamente no duplo clique. */
    if (i < 0) return null;
    const [alvo] = pendentes.splice(i, 1);

    const id = `nota-demo-${++sequencia}`;
    gravadas = [
      {
        id, ref: p.ref, status: "pendente", clienteId: alvo.clienteId, tomadorNome: alvo.nome,
        valor: alvo.valor, competencia: alvo.competencia, ambiente: p.ambiente,
        simulada: false,
      },
      ...gravadas,
    ];

    /* Com a lista (a nota de um pagamento), o demo não tem atendimento por atendimento: prende o
     * cliente inteiro, como sempre, e conta só os pedidos. É a aproximação de quem não tem banco. */
    return {
      id,
      ref: p.ref,
      valor: alvo.valor,
      atendimentos: p.atendimentoIds?.length ?? alvo.atendimentos,
      competencia: alvo.competencia,
      discriminacao: p.discriminacao,
      tomador: { nome: alvo.nome, cpf: alvo.cpf, email: null, telefone: null },
    };
  },

  async concluir(_t, notaId, r): Promise<void> {
    gravadas = gravadas.map((n) =>
      n.id === notaId
        ? {
          ...n,
          status: statusDoResultado(r),
          numero: r.numero,
          pdf: r.pdf,
          erro: r.erros?.[0]?.mensagem,
          simulada: r.simulado === true,
          data: r.status === "autorizado" || r.status === "simulado" ? "2026-08-17" : n.data,
        }
        : n);
  },

  async reabrir(_t, notaId, novaRef): Promise<void> {
    gravadas = gravadas.map((n) =>
      n.id === notaId ? { ...n, ref: novaRef, status: "pendente" as StatusNota, erro: undefined } : n);
  },

  async listar(): Promise<NotaGravada[]> {
    return gravadas.map((n) => ({ ...n }));
  },

  async porRef(_t, ref): Promise<NotaGravada | null> {
    return gravadas.find((n) => n.ref === ref) ?? null;
  },
};
