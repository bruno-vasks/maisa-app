/* ─────────────────────────────────────────────────────────────────────────────
 * O AVISO DA NOTA FISCAL NO WHATSAPP DE QUEM EMITE (15/10/2026).
 *
 * Quando a nota sai, o PDF vai para o WhatsApp do dono, com esta legenda, para ele conferir e
 * encaminhar ao cliente. É o "primeiro para mim" do recibo (`recibo-automatico.ts`) sem a
 * segunda metade: aqui NÃO há envio direto ao cliente, de propósito — nota fiscal sai no CNPJ do
 * dono, e quem decide se ela vai, e quando, é ele.
 * ────────────────────────────────────────────────────────────────────────────── */

import { valorBrasileiro } from "./recibo-saude";

export type NotaAvisavel = {
  numero: string | null;
  tomadorNome: string | null;
  valor: number;
};

export function avisoDeNotaAoDono(n: NotaAvisavel): string {
  const quem = (n.tomadorNome ?? "").trim() || "um cliente sem nome no cadastro";
  const qual = n.numero ? `Nota fiscal nº ${n.numero}` : "Nota fiscal";
  return `${qual} emitida para ${quem}, R$ ${valorBrasileiro(n.valor)}. O PDF está aqui, pronto para você encaminhar.`;
}

/** O nome do arquivo na conversa: de quem e qual nota, como o do recibo. */
export function nomeDoPdfDaNota(n: NotaAvisavel): string {
  const quem = (n.tomadorNome ?? "").trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ") || "cliente";
  return `Nota fiscal ${n.numero ? `${n.numero} ` : ""}${quem}.pdf`;
}
