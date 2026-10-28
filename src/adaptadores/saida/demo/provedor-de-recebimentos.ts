/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o provedor de recebimentos desligado (27/10/2026).
 *
 * É o que roda sem a flag `RECEBIMENTOS_ASAAS`: `disponivel()` diz que não, a tela não oferece
 * "Ativar", e a cobrança vai pelo Pix estático, como se a opção B não existisse. Abrir conta ou
 * emitir aqui é pedir o que a plataforma não ligou: `NaoConfigurado`, com o que falta.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ProvedorDeRecebimentos } from "@/nucleo/portas/saida/provedor-de-recebimentos";
import { NaoConfigurado } from "@/nucleo/dominio/erros";

const DESLIGADO = ["RECEBIMENTOS_ASAAS", "ASAAS_PLATAFORMA_CHAVE"];

export const provedorDeRecebimentosDemo: ProvedorDeRecebimentos = {
  disponivel: () => false,
  async conta() {
    return { situacao: "sem_conta", pendencias: [] };
  },
  async abrirConta() {
    throw new NaoConfigurado(DESLIGADO);
  },
  async emitir() {
    throw new NaoConfigurado(DESLIGADO);
  },
  async cancelar() {},
  lerEvento: () => null,
};
