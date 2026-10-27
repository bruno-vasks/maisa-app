/* ─────────────────────────────────────────────────────────────────────────────
 * DOMÍNIO — a mensagem que espera a vez de sair (27/10/2026).
 *
 * Mensagem que parte sem ninguém ter escrito (o aviso do recibo, o PDF dele) não sai na
 * hora: entra numa fila e sai uma de cada vez por negócio, com espaço entre uma pessoa e
 * outra. Pela Evolution, a MAISA é um WhatsApp Web não oficial, e trinta mensagens para
 * trinta pessoas no mesmo minuto é o desenho de disparo em massa que derruba o número.
 * Ver `aplicacao/fila-de-envios.ts` e a migração 036.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { DesfechoDoAviso } from "./recibo-unitario";

export type DocumentoNaFila = {
  /** Onde a NOSSA cópia mora (`comprovantes-recibo`). O link sai na hora de enviar. */
  caminho?: string;
  /** O link do canal de emissão, que vale cinco minutos: a segunda opção, quando a cópia não
   *  existe ou o link dela não sai. */
  url?: string;
  nomeDoArquivo: string;
  legenda: string;
};

export type NovoEnvio = {
  para: string;
  /** Bolhas de texto, nesta ordem. Vão antes do documento, quando há documento. */
  textos: string[];
  documento?: DocumentoNaFila;
  origem: "lote_de_recibos" | "recibo";
  /** O recibo cujo aviso isto é, e o desfecho a gravar nele quando sair. */
  recibo?: { id: string; desfechoAoEnviar: Extract<DesfechoDoAviso, "enviado" | "enviado_ao_dono"> };
};

export type EnvioNaFila = NovoEnvio & {
  id: string;
  tenantId: string;
  criadoEm: string;
  tentativas: number;
};

/** Tentativas por algo passageiro (WhatsApp desconectado, provedor fora) antes de desistir. A
 *  fila espaça cada uma: 2, 4, 6, 8 minutos depois. */
export const MAX_TENTATIVAS = 5;

/** O link do canal de emissão vale 5 minutos (medido; ver `ReciboEmitido.pdfUrl`). Com 4, já
 *  não se confia nele, e o aviso sai só em texto. */
export const VALIDADE_DO_LINK_MS = 4 * 60_000;

/** O link do canal de emissão (`documento.url`) ainda vale. Ele vence em cinco minutos. */
export const linkDoCanalValido = (e: EnvioNaFila, agora: number): boolean =>
  !!e.documento?.url && agora - Date.parse(e.criadoEm) <= VALIDADE_DO_LINK_MS;
