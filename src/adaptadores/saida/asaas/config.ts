/* ─────────────────────────────────────────────────────────────────────────────
 * ASAAS — configuração da PLATAFORMA (27/10/2026). ⚠️ SÓ SERVIDOR.
 *
 * A opção B dos recebimentos fica ATRÁS DE FLAG: sem `RECEBIMENTOS_ASAAS=1` e a chave da conta da
 * plataforma, o provedor diz `disponivel() === false`, a tela não oferece "Ativar" e nada muda. Ligar
 * só quando o acordo com o Asaas existir (o modelo BaaS habilitado; ver o LEIA-ME desta pasta).
 *
 *   RECEBIMENTOS_ASAAS                 `1` liga
 *   ASAAS_PLATAFORMA_CHAVE             a chave da conta da plataforma (precisa ser CNPJ)
 *   ASAAS_PLATAFORMA_AMBIENTE          `sandbox` (padrão) ou `producao`; vale para as subcontas novas
 *   ASAAS_PLATAFORMA_WALLET_ID         a carteira da plataforma, para a taxa (opcional)
 *   ASAAS_PLATAFORMA_TAXA_FIXA         taxa por cobrança, em reais (opcional)
 *   ASAAS_PLATAFORMA_TAXA_PERCENTUAL   ou em % do valor líquido (opcional)
 *   ASAAS_URL_DO_AVISO                 onde o Asaas avisa os pagamentos: …/api/recebimentos/asaas
 *   ASAAS_EMAIL_DO_AVISO               para onde o Asaas escreve quando o aviso falha
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Ambiente } from "./cliente";

const numero = (v: string | undefined) => {
  const n = Number((v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const ASAAS = {
  ligado: (process.env.RECEBIMENTOS_ASAAS ?? "").trim() === "1",
  ambiente: ((process.env.ASAAS_PLATAFORMA_AMBIENTE ?? "").trim() === "producao" ? "producao" : "sandbox") as Ambiente,
  chavePlataforma: (process.env.ASAAS_PLATAFORMA_CHAVE ?? "").trim(),
  walletPlataforma: (process.env.ASAAS_PLATAFORMA_WALLET_ID ?? "").trim() || null,
  taxaFixa: numero(process.env.ASAAS_PLATAFORMA_TAXA_FIXA),
  taxaPercentual: numero(process.env.ASAAS_PLATAFORMA_TAXA_PERCENTUAL),
  urlDoAviso: (process.env.ASAAS_URL_DO_AVISO ?? "").trim(),
  emailDoAviso: (process.env.ASAAS_EMAIL_DO_AVISO ?? "").trim(),
};

export type ConfigAsaas = typeof ASAAS;

export const isAsaasConfigured = ASAAS.ligado && Boolean(ASAAS.chavePlataforma);
