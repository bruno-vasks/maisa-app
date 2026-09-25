"use client";
import React from "react";

/* ---------- helper de estilo: string CSS → React.CSSProperties ---------- */
export function s(css: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    if (prop.startsWith("--")) o[prop] = val;
    else o[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return o as React.CSSProperties;
}

/* ---------- helpers ---------- */
export const fmt = (n: number) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtK = (n: number) => n >= 1000 ? "R$ " + (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k" : fmt(n);
export const initials = (nome: string) => {
  const p = nome.replace(/\s+e\s+/i, " ").split(" ").filter(Boolean);
  return (((p[0] || "")[0] || "") + ((p[1] || "")[0] || "")).toUpperCase();
};

// Paleta de avatar — FILL CLARO com iniciais em --ink, e não fundo escuro com iniciais brancas.
// A versão anterior eram 16 hex crus (fora do sistema OKLCH, imunes a reskin de token) com as
// iniciais em branco 93%: medido no ponto médio do degradê, os 8 pares davam de 2.11:1 a 4.17:1 —
// os OITO reprovavam AA. E as luminâncias eram vizinhas, com dois pares quase idênticos, então o
// recurso de reconhecimento não reconhecia ninguém.
// Agora: L fixo ~0.865 (contraste uniforme, 11.2-11.7:1 contra --ink) e o MATIZ é o que distingue —
// oito matizes espaçados, o que faz o avatar finalmente cumprir a função dele.
const PALETTE: string[] = [
  "oklch(0.86 0.055 262)", // azul da marca
  "oklch(0.87 0.060 78)",  // dourado da marca
  "oklch(0.86 0.055 200)", // ciano
  "oklch(0.87 0.050 320)", // malva
  "oklch(0.86 0.055 152)", // verde
  "oklch(0.87 0.055 30)",  // coral
  "oklch(0.86 0.050 100)", // oliva
  "oklch(0.87 0.055 240)", // índigo
];
export function avatar(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/* ---------- iconografia autoral (inline SVG, traço, currentColor) ---------- */
const ICONS: Record<string, React.ReactNode> = {
  // navegação
  config: (<><circle cx="12" cy="12" r="3.1" /><path d="M12 3.4v2.3M12 18.3v2.3M20.6 12h-2.3M5.7 12H3.4M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>),
  equipe: (<><circle cx="9" cy="8.2" r="3.2" /><path d="M3.2 19.4c0-3.2 2.6-5 5.8-5s5.8 1.8 5.8 5" /><path d="M16.4 5.7a3 3 0 0 1 .1 5.4" /><path d="M17.6 14.7c2 .5 3.4 2.1 3.4 4.5" /></>),
  scissors: (<><circle cx="6" cy="6.2" r="2.6" /><circle cx="6" cy="17.8" r="2.6" /><path d="M8.3 7.9 20 18M20 6 8.3 16.1M11 12l2.2-1.9" /></>),
  faq: (<><path d="M4 5.4A1.8 1.8 0 0 1 5.8 3.6H11a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h5.2A1.8 1.8 0 0 1 20 5.4V18a1.4 1.4 0 0 1-1.4 1.4H13a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H5.4A1.4 1.4 0 0 1 4 18Z" /><path d="M12 4.1v15.3" /></>),
  marketing: (<><path d="M3.5 10.4v3.2a1 1 0 0 0 1 1H7l9 4V5.4l-9 4H4.5a1 1 0 0 0-1 1Z" /><path d="m8 15.5 1.3 4.5" /><path d="M18.5 9.5a3.3 3.3 0 0 1 0 5" /></>),
  card: (<><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M3 9.6h18" /><path d="M6.5 14.5h4.5" /></>),
  receipt: (<><path d="M5 20.5V5.2A1.7 1.7 0 0 1 6.7 3.5h10.6A1.7 1.7 0 0 1 19 5.2V20.5l-2.33-1.6-2.34 1.6-2.33-1.6-2.34 1.6-2.33-1.6-2.33 1.6Z" /><path d="M8.5 8.4h7M8.5 11.8h4.5" /></>),
  dashboard: (<><rect x="3" y="4.4" width="18" height="15.2" rx="3.3" /><path d="M3 9.4h18" /><path d="M6.6 15.8l2.3-2.6 2 1.6 2.4-3.2 2 2.5 1.5-1.1" /></>),
  chat: (<><path d="M5.5 4.5h13A2.5 2.5 0 0 1 21 7v6.5A2.5 2.5 0 0 1 18.5 16H12l-4.5 3.5V16H5.5A2.5 2.5 0 0 1 3 13.5V7A2.5 2.5 0 0 1 5.5 4.5Z" /><path d="M8 9h8M8 12h5" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="3.2" /><path d="M3 9.5h18" /><path d="M8 3v3.4M16 3v3.4" /><circle cx="12" cy="14.8" r="1.7" /></>),
  // comuns
  plus: (<path d="M12 5v14M5 12h14" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  check: (<path d="m20 6-11 11-5-5" />),
  x: (<path d="M18 6 6 18M6 6l12 12" />),
  "chevron-left": (<path d="m15 18-6-6 6-6" />),
  "chevron-right": (<path d="m9 18 6-6-6-6" />),
  "chevron-down": (<path d="m6 9 6 6 6-6" />),
  edit: (<><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" /><path d="M14.4 6.6l3 3" /></>),
  trash: (<><path d="M4 6.5h16M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" /><path d="M18 6.5l-.9 12.2A1.6 1.6 0 0 1 15.5 20h-7a1.6 1.6 0 0 1-1.6-1.3L6 6.5" /><path d="M10 10.5v5M14 10.5v5" /></>),
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 7.5v5l3 2" /></>),
  whatsapp: (<><path d="M4 19.8 5.1 16A7.9 7.9 0 1 1 8.2 19l-4.2.8Z" /><path d="M9.4 8.8c.2-.5.5-.5.75-.48.24.02.38.03.55.42.13.32.46 1.14.5 1.22.04.09.07.2.01.32-.06.12-.1.19-.19.29l-.28.33c-.1.1-.19.2-.09.38.1.19.48.82 1.05 1.33.74.66 1.37.87 1.56.97.19.1.31.08.42-.05.12-.14.48-.57.6-.77.13-.19.25-.16.42-.1.17.07 1.1.53 1.3.62" /></>),
  sparkle: (<><path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6Z" /><path d="M18.6 15.4l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z" /><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" /></>),
  filter: (<path d="M4 6h16M7 12h10M10 18h4" />),
  dots: (<><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>),
  "arrow-right": (<path d="M5 12h14M13 6l6 6-6 6" />),
  "arrow-up-right": (<path d="M7 17 17 7M8 7h9v9" />),
  phone: (<path d="M6.5 4.5h3l1.2 4-2 1.3a12 12 0 0 0 5.5 5.5l1.3-2 4 1.2v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 6.1 1.5 1.5 0 0 1 6.5 4.5Z" />),
  star: (<path d="M12 3.8l2.5 5 5.5.8-4 3.9.95 5.5L12 16.9 7.1 19l.95-5.5-4-3.9 5.5-.8Z" />),
  bot: (<><rect x="4.5" y="8" width="15" height="10.5" rx="3.2" /><path d="M12 5v3" /><circle cx="12" cy="4.1" r="1.1" /><path d="M3.2 12.5v3M20.8 12.5v3" /><circle cx="9.4" cy="13" r="1.05" /><circle cx="14.6" cy="13" r="1.05" /><path d="M9.6 16h4.8" /></>),
  user: (<><circle cx="12" cy="8" r="3.4" /><path d="M5 19.5c0-3.4 3-5.5 7-5.5s7 2.1 7 5.5" /></>),
  send: (<><path d="M20 4 9.5 14.5" /><path d="M20 4 13.5 20l-4-7.5-7.5-4Z" /></>),
  "trending-up": (<><path d="M4 15.5 10 9l3.5 3.5L20 6" /><path d="M15.5 6H20v4.5" /></>),
  "trending-down": (<><path d="M4 8.5 10 15l3.5-3.5L20 18" /><path d="M15.5 18H20v-4.5" /></>),
  "arrow-up": (<path d="M12 19V5M6 11l6-6 6 6" />),
  "arrow-down": (<path d="M12 5v14M6 13l6 6 6-6" />),
  tag: (<><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" /><circle cx="8" cy="8" r="1.5" /></>),
  "calendar-check": (<><rect x="3" y="5" width="18" height="16" rx="3.2" /><path d="M3 9.5h18M8 3v3M16 3v3" /><path d="m9.5 15 2 2 3.5-3.5" /></>),
  copy: (<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>),
  image: (<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.7" /><path d="m4 17 5-4.5 4 3 3-2.5 4 3.5" /></>),
  link: (<><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></>),
  pin: (<><path d="M12 21s6.5-5.4 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.6 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2.3" /></>),
  gift: (<><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M3 9h18M12 9v11M12 9S9.5 4 7.5 5.5 9.5 9 12 9ZM12 9s2.5-5 4.5-3.5S14.5 9 12 9Z" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14 4.5L20 16" /><path d="M20 20v-4h-4" /></>),
  download: (<><path d="M12 4v11M8 11l4 4 4-4" /><path d="M5 19h14" /></>),
  play: (<path d="M7 5l12 7-12 7Z" />),
  moon: (<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />),
  target: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>),
  // nav da repaginada
  flow: (<><rect x="3" y="4.5" width="5.5" height="15" rx="2" /><rect x="10.5" y="4.5" width="5.5" height="9" rx="2" /><rect x="18" y="4.5" width="3" height="12" rx="1.5" /></>),
  clientes: (<><rect x="3.2" y="4.5" width="17.6" height="15" rx="3" /><circle cx="9" cy="10.4" r="2.1" /><path d="M5.8 16.2c0-1.8 1.5-2.8 3.2-2.8s3.2 1 3.2 2.8" /><path d="M15 9.8h3.4M15 12.6h3.4" /></>),
  alert: (<><path d="M12 8.4v4.4" /><circle cx="12" cy="16.4" r="1" /><path d="M10.3 4.2 3.4 17.4a1.8 1.8 0 0 0 1.6 2.6h14a1.8 1.8 0 0 0 1.6-2.6L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" /></>),
  undo: (<><path d="M4 9h11a5 5 0 0 1 0 10h-3" /><path d="m8 5-4 4 4 4" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  // profissões (ícone de "serviços" por área)
  heart: (<path d="M12 20.3s-6.8-4.1-6.8-9.1A3.7 3.7 0 0 1 12 8.3a3.7 3.7 0 0 1 6.8 2.9c0 5-6.8 9.1-6.8 9.1Z" />),
  tooth: (<path d="M8 3.5c-2 0-3.3 1.5-3.3 3.7 0 1.3.4 2.3.8 3.8.5 2 .5 6 1.9 6 1.2 0 1.1-3.4 2.3-3.4s1.1 3.4 2.3 3.4c1.4 0 1.4-4 1.9-6 .4-1.5.8-2.5.8-3.8C16.3 5 15 3.5 13 3.5c-1 0-1.5.6-2.5.6S9 3.5 8 3.5Z" />),
  stethoscope: (<><path d="M6 3.5v4.3a3.8 3.8 0 0 0 7.6 0V3.5" /><path d="M9.8 15.4a5 5 0 0 0 5 5 3.9 3.9 0 0 0 3.9-3.9v-1.7" /><circle cx="18.7" cy="12.7" r="2" /></>),
  /* O olho do campo de senha (`ui/componentes/CampoSenha.tsx`). O par existe porque um
     ícone só, mudando de cor, não diz se a senha está visível AGORA ou se o clique vai
     revelá-la — e é a única informação que esse botão precisa passar. */
  eye: (<><path d="M2.5 12S6 5.6 12 5.6 21.5 12 21.5 12 18 18.4 12 18.4 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>),
  "eye-off": (<><path d="M10.7 6.2A7.9 7.9 0 0 1 12 6.1c6 0 9.5 5.9 9.5 5.9a17.6 17.6 0 0 1-2.5 3.3" /><path d="M6.7 7.7A16.8 16.8 0 0 0 2.5 12S6 17.9 12 17.9a8.7 8.7 0 0 0 3.4-.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3.5 3.5l17 17" /></>),
};

/* ⚠️ NOME FORA DO REGISTRO DESENHA NADA, e não um sparkle. Até 24/09/2026 o fallback era
   `ICONS.sparkle`: o login pedia `name="lock"`, que nunca existiu, e mostrava uma estrelinha
   de "IA" no botão Entrar. Um buraco é honesto; um ícone errado passa por decisão de design.
   Nome literal é conferido pelo guarda G5 (`src/ui/guardas/icones.test.ts`). */
export function Icon({ name, size = 20, sw = 1.8, stroke = "currentColor", style }: { name: string; size?: number; sw?: number; stroke?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      {ICONS[name] ?? null}
    </svg>
  );
}

/* ---------- primitivas ---------- */
export function Card({ children, style, onClick, hover, pad = 20, radius = 16, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; hover?: boolean; pad?: number; radius?: number; className?: string }) {
  return (
    <div onClick={onClick} className={[hover ? "m-card-hov" : "", className].join(" ").trim()} style={{ ...s(`background:var(--surface);border:1px solid var(--border);border-radius:${radius}px;box-shadow:var(--shadow-card);padding:${pad}px${hover ? "" : ";transition:transform var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out)"}`), ...(onClick ? { cursor: "pointer" } : {}), ...(style || {}) }}>
      {children}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "whats";
const BTN_VAR: Record<BtnVariant, string> = {
  primary: "border:none;background:var(--primary);color:var(--on-primary)",
  secondary: "border:1px solid var(--border);background:var(--surface);color:var(--ink)",
  ghost: "border:none;background:transparent;color:var(--muted)",
  danger: "border:1px solid var(--danger-soft);background:var(--danger-soft);color:var(--danger)",
  // --whatsapp (escurecido) e não o verde da marca: com #25D366 o branco dava 1.98:1
  whats: "border:none;background:var(--whatsapp);color:var(--on-primary)",
};
/* Botão desligado: fundo --line e texto --muted, não opacidade (texto a 42% reprovava o
   contraste e lia como "carregando"). O desligado não tem hover nem press. */
const BTN_DESLIGADO = "border:none;background:var(--line);color:var(--muted);cursor:not-allowed";

/**
 * O botão do app.
 *
 * ⚠️ `type="button"` POR PADRÃO. O HTML faz de todo `<button>` sem tipo um `submit`, e dentro
 * de um `<form>` qualquer clique enviava o formulário: foi por isso que o "Novo cliente" de
 * Clientes virou `<div>` (Grades.tsx). Quem quer enviar passa `type="submit"`.
 *
 * ⚠️ `disabled` É DE VERDADE, e com motivo. Botão que parece ligado e não faz nada ensina a
 * ignorar botões; botão desligado sem dizer por quê deixa a pessoa sem saída. `motivo` sai
 * escrito ao lado (e fica ligado ao botão por `aria-describedby`), no tamanho de rótulo.
 * Desligado sem `motivo` é permitido só quando a razão já está escrita logo acima, na tela.
 */
export function Btn({ variant = "primary", icon, children, onClick, style, full, size = "md", type = "button", disabled, motivo, rotulo }: {
  variant?: BtnVariant; icon?: string; children?: React.ReactNode; onClick?: () => void; style?: React.CSSProperties;
  full?: boolean; size?: "sm" | "md"; type?: "button" | "submit" | "reset";
  disabled?: boolean;
  /** Por que está desligado. Só aparece com `disabled`. */
  motivo?: string;
  /** Nome acessível, quando o texto visível não basta (botão só de ícone, "＋"). */
  rotulo?: string;
}) {
  const idMotivo = React.useId();
  const pad = size === "sm" ? "8px 13px" : "10px 17px";
  const hov = disabled ? "" : variant === "primary" ? "m-hov-primary m-press" : variant === "whats" ? "m-hov-bright m-press" : "m-hov-bg m-press";
  const cor = disabled ? BTN_DESLIGADO : `cursor:pointer;${BTN_VAR[variant]}`;
  const botao = (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={rotulo}
      aria-describedby={disabled && motivo ? idMotivo : undefined}
      className={`${hov} m-focus`.trim()}
      style={{ ...s(`display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;font-weight:var(--w-title);font-size:var(--t-sm);white-space:nowrap;padding:${pad};${full ? "width:100%;" : ""}${cor}`), ...(style || {}) }}
    >
      {icon && <Icon name={icon} size={16} sw={2} />}
      {children}
    </button>
  );
  if (!disabled || !motivo) return botao;
  return (
    <span style={s(`display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;${full ? "width:100%;" : ""}`)}>
      {botao}
      <span id={idMotivo} style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>{motivo}</span>
    </span>
  );
}

/** Botão só de ícone. `size="sm"` (30px) existe para barras densas — a de navegação do calendário
 *  ficava alta demais com os 34px do padrão, e a alternativa era a Agenda desenhar o botão à mão e
 *  o app passar a ter duas geometrias de botão-ícone para manter em sincronia. `disabled` idem: o
 *  ‹ › do calendário precisa desligar na visão de Mês. */
export function IconBtn({ icon, onClick, tone = "neutral", title, size = "md", disabled }: { icon: string; onClick?: () => void; tone?: "neutral" | "danger" | "primary"; title?: string; size?: "sm" | "md"; disabled?: boolean }) {
  const c = tone === "danger" ? "color:var(--danger)" : tone === "primary" ? "color:var(--primary)" : "color:var(--muted)";
  const px = size === "sm" ? 30 : 34;
  const off = disabled ? "opacity:.42;cursor:not-allowed" : "cursor:pointer";
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled} className="m-hov-bg m-press-icon m-focus" style={s(`width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:${size === "sm" ? 8 : 9}px;background:var(--surface);${off};${c}`)}>
      <Icon name={icon} size={size === "sm" ? 15 : 16} sw={2} />
    </button>
  );
}

type Tone = "success" | "warn" | "primary" | "danger" | "neutral" | "warm";
const TONES: Record<Tone, [string, string]> = {
  success: ["var(--success-soft)", "var(--success)"],
  warn: ["var(--warn-soft)", "var(--warn)"],
  primary: ["var(--primary-soft)", "var(--primary-dark)"],
  danger: ["var(--danger-soft)", "var(--danger)"],
  neutral: ["var(--line)", "var(--muted)"],
  warm: ["var(--warm-soft)", "var(--warn)"],
};
export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  const [bg, fg] = TONES[tone];
  return (
    <span style={s(`display:inline-flex;align-items:center;gap:6px;font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-micro);padding:3px 10px;border-radius:20px;background:${bg};color:${fg}`)}>
      {dot && <span style={s(`width:6px;height:6px;border-radius:50%;background:${fg}`)} />}
      {children}
    </span>
  );
}

/* Chip informativo — leitura, não ação. Usado no resumo dos cartões e na Gaveta.
   `tone` primary marca o que está ligado/selecionado. */
export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "primary" }) {
  const cor = tone === "primary"
    ? "background:var(--primary-soft);color:var(--primary-dark);border-color:var(--primary-soft)"
    : "background:var(--bg);color:var(--muted);border-color:var(--line)";
  return (
    <span style={s(`display:inline-flex;align-items:center;padding:5px 11px;border-radius:999px;font-size:var(--t-label);font-weight:var(--w-data);letter-spacing:var(--ls-label);white-space:nowrap;border:1px solid;${cor}`)}>
      {children}
    </span>
  );
}

/* Barra de filtro por chip — um estado só, sempre visível (nada de dropdown escondendo o filtro ativo). */
/* O filtro ligado é tinta, não fill (25/09/2026, T2): com fundo `--primary` ele disputava com
 * a ação de criar da tela, e a regra é um primário por dobra. Seleção é estado; o fill é ação. */
export function Filtros({ opcoes, ativo, onChange }: { opcoes: string[]; ativo: string; onChange: (v: string) => void }) {
  return (
    <div style={s("display:flex;gap:8px;flex-wrap:wrap")} role="group" aria-label="Filtrar">
      {opcoes.map((o) => {
        const on = o === ativo;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={on}
            className="m-press m-focus m-hov-prim-border"
            style={s(`font-size:var(--t-sm);font-weight:var(--w-title);padding:8px 16px;border-radius:999px;cursor:pointer;white-space:nowrap;border:1px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"};color:${on ? "var(--primary-dark)" : "var(--muted)"}`)}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// outline:none + classe .m-focus => mesmo anel de foco (:focus-visible) dos botões
// --border-field, não --border: este contorno é o ÚNICO meio de identificar o campo, então cai no
// escopo da WCAG 1.4.11 e precisa de 3:1 real. Com --border dava 1.3:1 — o campo era invisível.
// --t-body (16px) e não --t-sm: abaixo de 16px o Safari do iOS dá zoom ao focar o campo, e o
// usuário perde o enquadramento da tela no meio do preenchimento.
const INPUT ="width:100%;border:1px solid var(--border-field);border-radius:10px;padding:10px 13px;font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, className, ...rest } = props;
  return <input {...rest} className={["m-focus", className].filter(Boolean).join(" ")} style={{ ...s(INPUT), ...(style || {}) }} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, className, ...rest } = props;
  return <textarea {...rest} className={["m-focus", className].filter(Boolean).join(" ")} style={{ ...s(INPUT + ";resize:vertical;min-height:92px;line-height:1.55"), ...(style || {}) }} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, className, children, ...rest } = props;
  return <select {...rest} className={["m-focus", className].filter(Boolean).join(" ")} style={{ ...s(INPUT + ";cursor:pointer;appearance:none"), ...(style || {}) }}>{children}</select>;
}
export function Field({ label, hint, children, style }: { label?: string; hint?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ ...s("display:flex;flex-direction:column;gap:6px"), ...(style || {}) }}>
      {label && <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-label);color:var(--muted)")}>{label}</span>}
      {children}
      {hint && <span style={s("font-size:var(--t-micro);color:var(--muted)")}>{hint}</span>}
    </label>
  );
}

/* role="switch" + aria-checked: sem isso o leitor de tela anuncia só "botão", e os 7 toggles de dia
 * de A MAISA saem como "botão, botão, botão…" sem dizer que dia é nem se está ligado.
 * `rotulo` é obrigatório na prática — passe o título da linha que o toggle controla.
 * A área de TOQUE vai a 44px por padding transparente, mantendo o trilho em 26px: 44×26 reprovava
 * o mínimo de 44pt, e no mobile há 14 deles empilhados. */
/* `disabled` é de verdade, como no `Btn`: o interruptor mestre da MAISA fica desligado sem
 * WhatsApp (ligar não a faria responder ninguém), e o motivo mora ao lado, escrito pela tela. */
export function Toggle({ on, onChange, rotulo, disabled, descritoPor }: { on: boolean; onChange?: (v: boolean) => void; rotulo?: string; disabled?: boolean; descritoPor?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={rotulo}
      aria-describedby={descritoPor}
      disabled={disabled}
      onClick={disabled ? undefined : () => onChange?.(!on)}
      className={disabled ? "m-focus" : "m-hov-bright m-focus"}
      style={s(`width:44px;height:44px;flex-shrink:0;border:none;background:transparent;cursor:${disabled ? "not-allowed" : "pointer"};padding:9px 0;display:flex;align-items:center;justify-content:center`)}
    >
      <span style={s(`width:44px;height:26px;border-radius:20px;padding:3px;display:flex;justify-content:flex-start;background:${disabled ? "var(--line)" : on ? "var(--primary)" : "var(--border)"};transition:background .18s var(--ease-out)`)}>
        <span className="m-knob" style={s(`width:20px;height:20px;border-radius:50%;background:var(--on-primary);box-shadow:0 1px 3px oklch(0.22 0.03 262 / 0.25);transform:translateX(${on ? 18 : 0}px)`)} />
      </span>
    </button>
  );
}

export function Monogram({ name, id, size = 44, radius = 13 }: { name: string; id?: string; size?: number; radius?: number }) {
  const fill = avatar(id || name);
  // Fill sólido. A "trama de tapete" que existia aqui eram dois repeating-linear-gradient
  // diagonais — listrado decorativo, defeito nomeado — e ainda por cima invisível a 44px.
  // <span>, não <div>: o monograma aparece dentro de <button> (cartões da grade,
  // linhas da gaveta) e <div> ali é HTML inválido. display:flex mantém o desenho.
  return (
    <span
      style={s(
        `width:${size}px;height:${size}px;border-radius:${radius}px;flex-shrink:0;` +
        `display:flex;align-items:center;justify-content:center;` +
        `color:var(--ink);font-weight:var(--w-title);font-size:${Math.round(size * 0.34)}px;` +
        `letter-spacing:0.01em;background:${fill}`
      )}
    >
      {initials(name)}
    </span>
  );
}

export function StatTile({ label, value, sub, icon, tone = "primary" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: string; tone?: Tone }) {
  const [bg, fg] = TONES[tone];
  return (
    <Card pad={18} style={s("display:flex;flex-direction:column;gap:12px")}>
      <div style={s("display:flex;align-items:center;justify-content:space-between;gap:8px")}>
        <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-label);color:var(--muted)")}>{label}</span>
        {icon && <span style={s(`width:34px;height:34px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${bg};color:${fg}`)}><Icon name={icon} size={18} /></span>}
      </div>
      {/* numeral herói: um dos três lugares em que 700 sobrevive. Sem mono — os dígitos da Plex
          Sans já são tabulares, e mono num numeral de display lia como terminal, não como dinheiro. */}
      <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:var(--lh-tight)")}>{value}</span>
      {sub && <span style={s("font-size:var(--t-label);color:var(--muted)")}>{sub}</span>}
    </Card>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={s("display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap")}>
      <div>
        <h2 style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg)")}>{title}</h2>
        {sub && <p style={s("font-size:var(--t-sm);color:var(--muted);margin-top:2px")}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Todo vazio tem saída, ou diz no código por que não tem. */
type SaidaDoVazio =
  | { action: React.ReactNode; semSaida?: never }
  /** Por que este vazio não oferece botão (a saída está logo ao lado, ou é o fim do caminho). Não aparece na tela. */
  | { semSaida: string; action?: never };

/**
 * O estado vazio.
 *
 * ⚠️ SEM ÍCONE EM QUADRADO E SEM SPARKLE. O quadrado azul de 52px com um ícone dentro, em cima
 * de todo vazio, era o carimbo de template que a auditoria de 24/09/2026 pediu para tirar
 * (emenda 3 do maisa-design). O vazio é um título que afirma, uma frase do que fazer, e a
 * saída.
 *
 * ⚠️ `action` É OBRIGATÓRIA, ou `semSaida` com o motivo. Vazio sem porta é a tela dizendo
 * "vá em Ajustes" sem abrir Ajustes. O tipo reprova no `npm run typecheck` quem esquecer.
 */
export function EmptyState({ title, sub, action }: { title: string; sub?: string } & SaidaDoVazio) {
  return (
    <div style={s("display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 24px;gap:10px;color:var(--muted)")}>
      <span style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg);color:var(--ink);max-width:40ch")}>{title}</span>
      {sub && <span style={s("font-size:var(--t-sm);max-width:52ch;line-height:var(--lh-prose)")}>{sub}</span>}
      {action && <span style={s("margin-top:6px")}>{action}</span>}
    </div>
  );
}

/* ---------- Estado: status que não clica ----------
 * Pílula promete clique (emenda 1 do maisa-design). Status que só informa é uma marca de
 * FORMA mais o rótulo em tinta: a forma carrega o sentido junto com a cor, porque cor sozinha
 * é o sinal mais frágil que existe (daltônico, sol na tela, impressão).
 *
 *   disco ...... cheio: feito, confirmado, no ar
 *   anel ....... vazado: esperando, ainda não aconteceu
 *   triangulo .. pede atenção: falta algo, deu erro
 *
 * `width:fit-content` de propósito: dentro de uma coluna flex o span esticaria até a borda e
 * voltaria a parecer uma faixa. Status editável numa lista é `Toggle`; contagem dentro de um
 * controle é `Badge`. */
export type FormaDeEstado = "disco" | "anel" | "triangulo";
const COR_DO_ESTADO: Record<Exclude<Tone, "warm">, string> = {
  success: "var(--success)", warn: "var(--warn)", danger: "var(--danger)", primary: "var(--primary)", neutral: "var(--muted)",
};
export function Estado({ forma, tom = "neutral", children }: { forma: FormaDeEstado; tom?: Exclude<Tone, "warm">; children: React.ReactNode }) {
  const cor = COR_DO_ESTADO[tom];
  return (
    <span style={s("display:inline-flex;align-items:center;gap:7px;width:fit-content;max-width:100%;font-size:var(--t-label);font-weight:var(--w-data);color:var(--ink);line-height:var(--lh-ui)")}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={s("flex-shrink:0")}>
        {forma === "disco" && <circle cx="5" cy="5" r="4.5" fill={cor} />}
        {forma === "anel" && <circle cx="5" cy="5" r="3.75" fill="none" stroke={cor} strokeWidth="1.5" />}
        {forma === "triangulo" && <path d="M5 .6 9.6 9.2H.4Z" fill={cor} />}
      </svg>
      <span style={s("min-width:0")}>{children}</span>
    </span>
  );
}

/* ---------- Tabela: conteúdo tabular servido como tabela ----------
 * Serviços, Faturamento, Equipe e Mais eram grades de cartões idênticos — o ban "identical card
 * grids" — para conteúdo que é intrinsecamente uma tabela. O custo real não era estético: com
 * valores alinhados à direita DENTRO de cada cartão, e cartões de largura diferente, os números
 * nunca formavam coluna, então "qual é o meu serviço mais caro?" exigia varredura em zigue-zague.
 *
 * A grade de cartões continua certa onde a unidade é uma PESSOA com rosto (Clientes), e no mobile,
 * onde 6 colunas não caberiam — quem escolhe é a tela, passando `mobile`.
 *
 * Ordenação é local ao componente: é estado de visualização, não decisão do usuário que mereça
 * persistir. Colunas numéricas alinham à direita e recebem `.n` (tabular-nums). */
export type Coluna<T> = {
  chave: string;
  label: string;
  /** Conteúdo da célula. */
  celula: (linha: T) => React.ReactNode;
  /** Valor para ordenar. Ausente = coluna não ordenável. */
  ordenar?: (linha: T) => string | number;
  /** Números alinham à direita e ganham numerais tabulares. */
  num?: boolean;
  /** Some abaixo de ~1100px de largura útil. */
  secundaria?: boolean;
  largura?: string;
};

export function Tabela<T>({ colunas, linhas, chaveDe, onLinha, rotuloLinha, estreita }: {
  colunas: Coluna<T>[];
  linhas: T[];
  chaveDe: (l: T) => string;
  onLinha?: (l: T) => void;
  /** Nome acessível da linha — a linha é um botão, precisa dizer o que abre. */
  rotuloLinha?: (l: T) => string;
  /** Esconde as colunas secundárias (viewport apertado). */
  estreita?: boolean;
}) {
  const [ord, setOrd] = React.useState<{ chave: string; desc: boolean } | null>(null);
  const cols = colunas.filter((c) => !estreita || !c.secundaria);

  const dados = React.useMemo(() => {
    if (!ord) return linhas;
    const col = colunas.find((c) => c.chave === ord.chave);
    if (!col?.ordenar) return linhas;
    const f = col.ordenar;
    return [...linhas].sort((a, b) => {
      const x = f(a), y = f(b);
      const n = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return ord.desc ? -n : n;
    });
  }, [linhas, ord, colunas]);

  const grid = cols.map((c) => c.largura ?? "minmax(0,1fr)").join(" ");

  return (
    <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden")}>
      {/* cabeçalho */}
      <div role="row" style={s(`display:grid;grid-template-columns:${grid};gap:16px;padding:0 18px;border-bottom:1px solid var(--line);background:var(--surface-2)`)}>
        {cols.map((c) => {
          const ativa = ord?.chave === c.chave;
          const conteudo = (
            <>
              {c.label}
              {c.ordenar && (
                <span aria-hidden style={s(`display:inline-block;margin-left:5px;opacity:${ativa ? "1" : "0.35"}`)}>
                  {ativa && ord.desc ? "↓" : "↑"}
                </span>
              )}
            </>
          );
          const base = `font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-label);color:var(--muted);padding:11px 0;text-align:${c.num ? "right" : "left"}`;
          return c.ordenar ? (
            <button
              key={c.chave}
              onClick={() => setOrd((o) => (o?.chave === c.chave ? { chave: c.chave, desc: !o.desc } : { chave: c.chave, desc: false }))}
              aria-sort={ativa ? (ord.desc ? "descending" : "ascending") : "none"}
              className="m-focus"
              style={s(`${base};border:none;background:transparent;cursor:pointer;font-family:inherit`)}
            >
              {conteudo}
            </button>
          ) : (
            <span key={c.chave} style={s(base)}>{conteudo}</span>
          );
        })}
      </div>

      {/* linhas */}
      {dados.map((l, i) => {
        const conteudo = cols.map((c) => (
          <span
            key={c.chave}
            className={c.num ? "n" : undefined}
            style={s(`min-width:0;font-size:var(--t-sm);padding:13px 0;display:flex;align-items:center;gap:8px;${c.num ? "justify-content:flex-end;font-weight:var(--w-data)" : ""}`)}
          >
            {c.celula(l)}
          </span>
        ));
        // Bordas SÓ em propriedades não-shorthand: misturar `border:none` com `border-bottom` no
        // mesmo elemento faz o React reclamar e pode dar bug de estilo ao reordenar (ele remove
        // uma e depois a outra). Aqui cada lado é declarado por si.
        const linhaBase = `display:grid;grid-template-columns:${grid};gap:16px;padding:0 18px;text-align:left;width:100%;background:transparent;border-top-width:0;border-left-width:0;border-right-width:0;border-style:solid;border-color:var(--line);border-bottom-width:${i < dados.length - 1 ? "1px" : "0"};`;
        return onLinha ? (
          <button
            key={chaveDe(l)}
            onClick={() => onLinha(l)}
            aria-label={rotuloLinha?.(l)}
            className="m-hov-bg m-focus"
            style={s(`${linhaBase}cursor:pointer;font-family:inherit;color:inherit`)}
          >
            {conteudo}
          </button>
        ) : (
          <div key={chaveDe(l)} style={s(linhaBase)}>{conteudo}</div>
        );
      })}
    </div>
  );
}

/** Nome + monograma numa célula — o par que aparece em quase toda primeira coluna. */
export function CelulaNome({ nome, seed, sub }: { nome: string; seed?: string; sub?: string }) {
  return (
    <>
      {seed && <Monogram name={nome} id={seed} size={28} radius={9} />}
      <span style={s("min-width:0;display:flex;flex-direction:column;line-height:1.25")}>
        <span style={s("font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{nome}</span>
        {sub && <span style={s("font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{sub}</span>}
      </span>
    </>
  );
}

export function Divider({ vertical, style }: { vertical?: boolean; style?: React.CSSProperties }) {
  return <div style={{ ...s(vertical ? "width:1px;align-self:stretch;background:var(--line)" : "height:1px;width:100%;background:var(--line)"), ...(style || {}) }} />;
}

/* container padrão de tela — 28px de respiro, largura fluida */
export function Screen({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="m-enter" style={{ ...s("padding:28px"), ...(style || {}) }}>{children}</div>;
}

/* ---------- toast: feedback leve para ações (evita botão "morto") ----------
 * Aceita uma AÇÃO opcional — é onde vive o "Desfazer". Sem isso, as ações irreversíveis do app
 * (mover cartão, remarcar por arrasto, resolver item da fila) não tinham volta nenhuma: um
 * arrasto errado era permanente e silencioso.
 * Toast com ação vive mais tempo (7s): 2,4s não dá para ler e decidir. */
export type ToastAcao = { label: string; onClick: () => void };
let toastListeners: ((m: string, a?: ToastAcao) => void)[] = [];
let toastSeq = 0;
export function toast(msg: string, acao?: ToastAcao) {
  toastListeners.forEach((l) => l(msg, acao));
}
export function Toaster() {
  const [items, setItems] = React.useState<{ id: number; msg: string; acao?: ToastAcao }[]>([]);
  React.useEffect(() => {
    const l = (msg: string, acao?: ToastAcao) => {
      const id = ++toastSeq;
      setItems((x) => [...x, { id, msg, acao }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), acao ? 7000 : 2400);
    };
    toastListeners.push(l);
    return () => {
      toastListeners = toastListeners.filter((x) => x !== l);
    };
  }, []);
  const dispensar = (id: number) => setItems((x) => x.filter((i) => i.id !== id));
  // z-index 95: entra na escala que o app já tem (8 · 30 · 70 · 80 · 81 · 90 · 91) em vez do
  // 9999 que estava aqui — o toast fica acima da Paleta (91) e abaixo de nada.
  return (
    <div role="status" aria-live="polite" style={{ ...s("position:fixed;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:95;pointer-events:none"), bottom: "max(26px, calc(env(safe-area-inset-bottom) + 14px))" }}>
      {items.map((i) => (
        // pointer-events:auto só no toast COM ação — o container é inerte de propósito, mas um
        // "Desfazer" que não dá para clicar seria pior que não ter.
        <div key={i.id} className="m-pop" style={s(`display:flex;align-items:center;gap:9px;background:var(--ink);color:var(--surface);font-size:var(--t-sm);font-weight:var(--w-data);padding:11px 18px;border-radius:12px;box-shadow:var(--shadow-pop)${i.acao ? ";pointer-events:auto" : ""}`)}>
          <Icon name="check" size={16} sw={2.4} stroke="var(--surface)" />
          {i.msg}
          {i.acao && (
            <button
              onClick={() => { i.acao!.onClick(); dispensar(i.id); }}
              className="m-press m-focus"
              /* --nav-soft: azul claro da marca sobre o navy do toast (--ink), >9:1 */
              style={s("margin-left:5px;border:none;background:transparent;color:var(--nav-soft);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;padding:2px 4px;text-decoration:underline;text-underline-offset:3px")}
            >
              {i.acao.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- ConfirmDialog: confirmação reutilizável no idioma visual do app ----------
   Modelado nos modais de Faturamento/Pacientes: backdrop escuro (mfade) + card central
   var(--surface) (mrise). Esc/backdrop chamam onCancel. prefers-reduced-motion respeitado
   pela regra global (@media reduce zera as durações das animações inline). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const danger = tone === "danger";
  const confirmVar = danger ? "background:var(--danger);color:var(--on-primary)" : "background:var(--primary);color:var(--on-primary)";
  const confirmHov = danger ? "m-hov-bright" : "m-hov-primary";

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      /* backdrop igual ao da Gaveta e da Paleta — antes eram dois pretos de modal diferentes */
      style={{ ...s("position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:28px;background:oklch(0.22 0.03 262 / 0.38)"), backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "mfade .2s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        /* sem borda: com --shadow-pop a borda de 1px formaria o par ghost-card banido */
        style={{ ...s("position:relative;width:420px;max-width:92vw;background:var(--surface);border-radius:16px;box-shadow:var(--shadow-pop);padding:24px"), animation: "mrise .25s var(--ease-out)" }}
      >
        <button
          onClick={onCancel}
          title={cancelText}
          aria-label={cancelText}
          className="m-hov-bg m-press-icon m-focus"
          style={s("position:absolute;top:14px;right:14px;width:30px;height:30px;border:none;border-radius:8px;background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted)")}
        >
          <Icon name="x" size={16} sw={2.2} />
        </button>
        <h2 style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg);padding-right:34px")}>{title}</h2>
        {message && <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose);margin-top:8px")}>{message}</p>}
        <div style={s("display:flex;justify-content:flex-end;gap:10px;margin-top:22px")}>
          <button
            onClick={onCancel}
            className="m-hov-bg m-press m-focus"
            style={s("border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:10px;font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;padding:10px 17px")}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${confirmHov} m-press m-focus`}
            style={s(`border:none;border-radius:10px;font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;padding:10px 17px;${confirmVar}`)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
