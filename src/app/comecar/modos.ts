/* ─────────────────────────────────────────────────────────────────────────────
 * COMO A MAISA VAI TRABALHAR — o que cada cartão do wizard grava na assistente.
 *
 * ★ MÚLTIPLA ESCOLHA desde 21/10/2026 (pedido do marketing, visto num onboarding real): quem
 * queria a MAISA conversando E emitindo recibo tinha de escolher um só. Os modos agora se
 * somam, e cada campo liga se algum modo marcado pede.
 *
 * `ativa` liga ou cala o agente (`entrada/whatsapp/agente.ts`). Vai SEMPRE explícito: desde
 * 24/09/2026 terapeuta nasce com a MAISA desligada (`atendeNoWhatsAppPorPadrao`), então "ela
 * conversa" precisa ligar, não herdar.
 *
 * `avisarRecibo` só liga com `avisos`: o padrão dele no banco é `false` de propósito — é o
 * único toggle que dispara sem ninguém por perto, do número pessoal do dono. Quem marca o
 * cartão pediu, com todas as letras, no texto dele.
 *
 * `recibos` não grava nada, porque a emissão vale para todo negócio. Marcado sozinho, os três
 * campos que saem pelo WhatsApp ficam desligados, e é isso que tira o WhatsApp da trilha e do
 * cartão de jornada — `usoDoWhatsApp` deriva desses três campos, e não de um "modo" guardado
 * à parte.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Modo = "conversa" | "avisos" | "recibos";

export const ajustesDosModos = (modos: readonly Modo[]) => {
  const conversa = modos.includes("conversa");
  const avisos = modos.includes("avisos");
  return {
    assistente: { ativa: conversa },
    cfg: { lembrete: conversa || avisos, avisarRecibo: avisos },
  };
};

/** Marca ou desmarca um modo, mantendo a ordem em que a pessoa marcou. */
export const alternarModo = (modos: readonly Modo[], m: Modo): Modo[] =>
  modos.includes(m) ? modos.filter((x) => x !== m) : [...modos, m];
