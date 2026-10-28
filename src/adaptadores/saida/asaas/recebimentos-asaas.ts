/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o Asaas cumprindo `ProvedorDeRecebimentos` (27/10/2026, a opção B).
 *
 * Junta três coisas: o cliente HTTP (`cliente.ts`, do Smiller), a configuração da plataforma
 * (`config.ts`) e o cofre da subconta (`CofreDeRecebimentos`, que `composicao.ts` entrega pronto:
 * este arquivo não importa o banco).
 *
 * ── ABRIR A CONTA, NA ORDEM QUE O SMILLER APRENDEU ──
 *
 *   1 · `POST /accounts` com a chave da PLATAFORMA. A chave da subconta vem só nesta resposta;
 *   2 · ela vai para o cofre ANTES de qualquer outra chamada, com o hash do token do aviso;
 *   3 · só então o aviso de pagamento é cadastrado, com a chave da subconta. Se isso falhar, a conta
 *       continua salva com o aviso por cadastrar, e a próxima conferência da conta (a tela confere a
 *       cada leitura) tenta de novo, com um token novo: o antigo não se guarda, só o hash.
 *
 * O token do aviso é sorteado aqui e só o hash é guardado: é o que acha o negócio quando o aviso
 * chega (`hashDoToken`, usado também por quem recebe o HTTP).
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHash, randomBytes } from "crypto";
import type { CofreDeRecebimentos } from "@/nucleo/portas/saida/cofre-de-recebimentos";
import type { ContaDeRecebimentos, ProvedorDeRecebimentos } from "@/nucleo/portas/saida/provedor-de-recebimentos";
import { DadoInvalido, FalhaDoProvedor } from "@/nucleo/dominio/erros";
import { criarClienteAsaas, FalhaNoAsaas, type ClienteAsaas } from "./cliente";
import { ASAAS, type ConfigAsaas } from "./config";

/** sha256 do token, em hexadecimal. O que o banco guarda e o que o aviso procura. */
export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A recusa do Asaas por dado (4xx) vira frase de tela; o resto é falha do provedor. */
function traduzir(e: unknown): Error {
  if (e instanceof FalhaNoAsaas && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 401) {
    return new DadoInvalido(e.message);
  }
  if (e instanceof FalhaNoAsaas) return new FalhaDoProvedor(e.message, e);
  return e instanceof Error ? e : new Error(String(e));
}

export function criarProvedorAsaas(deps: {
  cofre: CofreDeRecebimentos;
  config?: ConfigAsaas;
  cliente?: ClienteAsaas;
  /** O token do aviso. Só o teste troca. */
  sortearToken?: () => string;
}): ProvedorDeRecebimentos {
  const config = deps.config ?? ASAAS;
  const asaas = deps.cliente ?? criarClienteAsaas();
  const sortear = deps.sortearToken ?? (() => randomBytes(24).toString("hex"));
  const plataforma = () => ({ ambiente: config.ambiente, chave: config.chavePlataforma });

  /** Cadastra o aviso de pagamento com um token novo e guarda o hash dele. Lança se o Asaas recusar. */
  async function cadastrarAviso(t: Parameters<ProvedorDeRecebimentos["conta"]>[0], conta: { ambiente: typeof config.ambiente; chave: string }) {
    const token = sortear();
    await asaas.registrarAviso(conta, { url: config.urlDoAviso, token, email: config.emailDoAviso || "avisos@maisasecretary.com.br" });
    await deps.cofre.trocarToken(t, hashDoToken(token));
  }

  return {
    /* Sem a URL do aviso, a cobrança sairia e nunca seria confirmada: não liga. */
    disponivel: () => config.ligado && Boolean(config.chavePlataforma) && Boolean(config.urlDoAviso),

    async conta(t, p): Promise<ContaDeRecebimentos> {
      const guardada = await deps.cofre.ler(t);
      if (!guardada) return { situacao: "sem_conta", pendencias: [] };
      /* O aviso que não foi cadastrado na abertura (Asaas fora, URL errada) é tentado de novo aqui. */
      if (p?.conferir && !guardada.avisoCadastrado) {
        await cadastrarAviso(t, { ambiente: guardada.ambiente, chave: guardada.chave }).catch((e) => {
          console.error(`[asaas/recebimentos] ${t.tenantId}: o aviso de pagamento ainda não foi cadastrado`, e);
        });
      }
      /* Aprovada e recusada não mudam mais sozinhas: não vale a chamada. */
      if (!p?.conferir || guardada.situacao === "aprovada" || guardada.situacao === "recusada") {
        return { situacao: guardada.situacao, pendencias: [] };
      }
      try {
        const st = await asaas.situacaoDaConta({ ambiente: guardada.ambiente, chave: guardada.chave });
        if (st.situacao !== guardada.situacao) await deps.cofre.atualizarSituacao(t, st.situacao);
        return st;
      } catch (e) {
        throw traduzir(e);
      }
    },

    async abrirConta(t, dados) {
      if (await deps.cofre.ler(t)) throw new DadoInvalido("Este negócio já tem conta de recebimentos aberta.");
      let aberta;
      try {
        aberta = await asaas.abrirConta(plataforma(), dados);
      } catch (e) {
        throw traduzir(e);
      }
      /* ANTES de qualquer outra chamada: a chave não volta mais. O hash guardado aqui é de um token
       * que ninguém tem; o do aviso entra em `cadastrarAviso`, logo abaixo. */
      await deps.cofre.guardar(t, {
        ambiente: config.ambiente, idConta: aberta.idConta, walletId: aberta.walletId, situacao: "pendente",
        avisoCadastrado: false, chave: aberta.chave, hashDoToken: hashDoToken(sortear()),
      });
      const conta = { ambiente: config.ambiente, chave: aberta.chave };
      await cadastrarAviso(t, conta).catch((e) => {
        console.error(`[asaas/recebimentos] ${t.tenantId}: conta ${aberta.idConta} aberta, mas o aviso de pagamento não foi cadastrado (a conferência tenta de novo)`, e);
      });
      /* Os documentos pendentes só aparecem uns 15 s depois: a primeira conferência pode vir sem eles. */
      const st = await asaas.situacaoDaConta(conta).catch(() => null);
      return st ?? { situacao: "pendente", pendencias: [] };
    },

    async emitir(t, pedido) {
      const guardada = await deps.cofre.ler(t);
      if (!guardada || guardada.situacao !== "aprovada") throw new DadoInvalido("A conta de recebimentos ainda não foi aprovada.");
      /* Taxa fixa maior ou igual ao valor faria o Asaas recusar a cobrança inteira: aí vai sem taxa. */
      const taxa =
        config.walletPlataforma && (config.taxaPercentual || (config.taxaFixa && config.taxaFixa < pedido.valor))
          ? { walletId: config.walletPlataforma, ...(config.taxaFixa < pedido.valor ? { fixo: config.taxaFixa } : {}), percentual: config.taxaPercentual }
          : null;
      try {
        return await asaas.emitir({ ambiente: guardada.ambiente, chave: guardada.chave }, { ...pedido, taxaDaPlataforma: taxa });
      } catch (e) {
        throw traduzir(e);
      }
    },

    async cancelar(t, idExterno) {
      const guardada = await deps.cofre.ler(t);
      if (!guardada) return;
      try {
        await asaas.cancelar({ ambiente: guardada.ambiente, chave: guardada.chave }, idExterno);
      } catch (e) {
        throw traduzir(e);
      }
    },

    lerEvento: (corpo) => asaas.lerEvento(corpo),
  };
}
