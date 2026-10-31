"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O CAMPO DO WHATSAPP DE QUEM TEM CONTA — o mesmo no `/cadastro` e no `/whatsapp` (31/10/2026).
 *
 * É o contato da pessoa com a equipe da MAISA, não o número que a MAISA atende (esse é o QR do
 * `/comecar`). A dica diz as duas coisas porque a confusão é a mais provável de todas: quem lê
 * "WhatsApp" logo depois de criar a conta acha que está ligando a secretária. A regra do número
 * mora em `nucleo/dominio/whatsapp-da-conta.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { s } from "@/ui/primitivos";

/** O desenho dos campos das telas de auth, o mesmo do `CampoSenha`. */
export const CAMPO_DE_AUTH =
  "width:100%;border:1px solid var(--border);border-radius:var(--r-painel);padding:13px 14px;" +
  "font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none;font-family:inherit";

export function CampoWhatsapp({
  valor, aoMudar, desabilitado, autoFocus,
}: { valor: string; aoMudar: (v: string) => void; desabilitado?: boolean; autoFocus?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>Seu WhatsApp</span>
      <input
        value={valor} onChange={(e) => aoMudar(e.target.value)}
        required inputMode="tel" autoComplete="tel" autoFocus={autoFocus}
        placeholder="Escreva seu WhatsApp com DDD…" className="m-focus" style={s(CAMPO_DE_AUTH)} disabled={desabilitado}
      />
      <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
        É por ele que a equipe da maisa te ajuda a configurar. Não é o número que a maisa atende.
      </span>
    </label>
  );
}
