/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE DEMONSTRAÇÃO — a fila de envios, em memória.
 *
 * As mesmas regras da 036, para o dublê não mentir: uma por vez por negócio, espaço desde a
 * última que saiu, reserva de mais de 10 minutos volta a valer, conteúdo apagado quando sai
 * ou desiste, e cada negócio só enxerga a própria fila.
 * ────────────────────────────────────────────────────────────────────────────── */

import { randomUUID } from "crypto";

import type { FilaDeEnvios } from "@/nucleo/portas/saida/fila-de-envios";
import { MAX_TENTATIVAS, type EnvioNaFila } from "@/nucleo/dominio/envios";

type Linha = EnvioNaFila & {
  enviarApos: number;
  reservadoEm?: number;
  enviadoEm?: number;
  desistidoEm?: number;
  erro?: string;
};

const FILA: Linha[] = [];
const RESERVA_VENCE_MS = 10 * 60_000;

const reservaViva = (l: Linha, agora: number) => l.reservadoEm !== undefined && agora - l.reservadoEm < RESERVA_VENCE_MS;
const esperando = (l: Linha) => l.enviadoEm === undefined && l.desistidoEm === undefined;

export const filaDeEnviosDemo: FilaDeEnvios = {
  faltando: () => [],

  async enfileirar(t, envios) {
    const agora = Date.now();
    for (const e of envios) {
      FILA.push({ ...e, id: randomUUID(), tenantId: t.tenantId, criadoEm: new Date(agora).toISOString(), tentativas: 0, enviarApos: agora });
    }
  },

  async negociosComEnvio() {
    const agora = Date.now();
    return [...new Set(FILA.filter((l) => esperando(l) && l.enviarApos <= agora && !reservaViva(l, agora)).map((l) => l.tenantId))];
  },

  async reservar(t, espacoMs) {
    const agora = Date.now();
    const doNegocio = FILA.filter((l) => l.tenantId === t.tenantId);
    if (doNegocio.some((l) => esperando(l) && reservaViva(l, agora))) return null;
    if (doNegocio.some((l) => l.enviadoEm !== undefined && agora - l.enviadoEm < espacoMs)) return null;
    const proxima = doNegocio
      .filter((l) => esperando(l) && l.enviarApos <= agora && !reservaViva(l, agora))
      .sort((a, b) => a.enviarApos - b.enviarApos || a.criadoEm.localeCompare(b.criadoEm))[0];
    if (!proxima) return null;
    proxima.reservadoEm = agora;
    proxima.tentativas++;
    const { enviarApos: _a, reservadoEm: _r, enviadoEm: _e, desistidoEm: _d, erro: _x, ...envio } = proxima;
    return { ...envio, textos: [...envio.textos] };
  },

  async concluir(t, id) {
    const l = FILA.find((x) => x.id === id && x.tenantId === t.tenantId);
    if (!l) return;
    Object.assign(l, { enviadoEm: Date.now(), reservadoEm: undefined, erro: undefined, textos: [], documento: undefined });
  },

  async devolver(t, id, p) {
    const l = FILA.find((x) => x.id === id && x.tenantId === t.tenantId);
    if (!l) return { desistiu: false };
    const desistiu = p.desistir || l.tentativas >= MAX_TENTATIVAS;
    Object.assign(l, {
      reservadoEm: undefined,
      erro: p.erro.slice(0, 500),
      enviarApos: Date.now() + 2 * l.tentativas * 60_000,
      ...(desistiu ? { desistidoEm: Date.now(), textos: [], documento: undefined } : {}),
    });
    return { desistiu };
  },
};
