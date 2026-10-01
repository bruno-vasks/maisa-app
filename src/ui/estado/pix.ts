/* ─────────────────────────────────────────────────────────────────────────────
 * O PIX QUE ACABOU DE NASCER, DE UMA TELA PARA A OUTRA (30/09/2026).
 *
 * `POST /api/assinatura` devolve o Pix junto da URL de `/pagar`. Quem clicou guarda aqui, e
 * `/pagar` desenha com ele na primeira pintura, em vez de reler na AbacatePay o que acabou de
 * ser criado. Medido no funil de produção: era 2 dos 10 segundos até o QR Code.
 *
 * `sessionStorage`, e não a URL: o copia-e-cola tem ~150 caracteres e o QR Code é uma imagem em
 * base64 de kilobytes. E morre com a aba, que é o tempo de vida certo para um Pix pendente.
 *
 * ⚠️ É SÓ A PRIMEIRA PINTURA. A tela relê na fonte em seguida e a cada 3s; o status que vale é o
 * da AbacatePay, nunca o daqui.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { PagamentoPix } from "@/nucleo/portas/saida/cobranca";

const CHAVE = (id: string) => `maisa:pix:${id}`;

export function guardarPix(p: PagamentoPix | undefined | null): void {
  if (!p?.id) return;
  try { sessionStorage.setItem(CHAVE(p.id), JSON.stringify(p)); } catch { /* aba anônima cheia: a tela relê, só demora mais */ }
}

export function pixGuardado(id: string): PagamentoPix | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE(id));
    const p = bruto ? (JSON.parse(bruto) as PagamentoPix) : null;
    return p && p.id === id && p.status === "pendente" ? p : null;
  } catch {
    return null;
  }
}
