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

/* ---------- iconografia autoral (inline SVG, currentColor) ----------
   Regra e medidas em `docs/icones.md` (a espec; emenda só com medição que a justifique).
   Grade 24 com área viva 20×20, traço único de 1.5 no 24px, rx 1.5 em todo retângulo, retas a
   0/45/90°, coordenadas em múltiplos de 0.25. Nada de estrelinha, robô ou "cara de IA".
   Os 10 da navegação têm par CHEIO (mesma caixa de tinta, detalhes vazados): o item ATIVO do
   rail e da barra de abas desenha o cheio, o inativo a linha, como no iOS e no Instagram. Ícone
   de botão, aviso ou ação não tem cheio.
   Os nomes são contrato com as telas e com o guarda G5. Três deles ficaram com nome antigo e
   desenho novo: `bot` é o fone de atendimento (a MAISA é a secretária que atende, não um robô),
   `documento` é a folha de canto dobrado (era `config`, e não havia tela de ajustes atrás dele),
   `negocio` é a fachada de loja (era `sparkle`, que saiu do app). */
const ICONS: Record<string, React.ReactNode> = {
  // navegação (os 10 com variante cheia)
  flow: (<><circle cx="5.5" cy="12" r="2.5"/><path d="M3 5.5H21M11 12H21M3 18.5H21"/></>),
  chat: (<><path d="M4.5 4H19.5A1.5 1.5 0 0 1 21 5.5V15A1.5 1.5 0 0 1 19.5 16.5H11L7.5 20V16.5H4.5A1.5 1.5 0 0 1 3 15V5.5A1.5 1.5 0 0 1 4.5 4Z"/><path d="M7.5 8.5H16.5M7.5 12H13.5"/></>),
  calendar: (<><rect x="4" y="5" width="16" height="15.5" rx="1.5"/><path d="M4 9.5H20"/><path d="M8 3V6.5M16 3V6.5"/><circle cx="16" cy="15.5" r="0.75"/></>),
  clientes: (<><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 3V21"/><circle cx="13.5" cy="9" r="1.75"/><path d="M11 16.5A2.5 2.5 0 0 1 16 16.5"/></>),
  receipt: (<><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3H17.5A1.5 1.5 0 0 1 19 4.5V21L17.25 19.25L15.5 21L13.75 19.25L12 21L10.25 19.25L8.5 21L6.75 19.25L5 21Z"/><path d="M8 8.5H16M8 12H12"/></>),
  documento: (<><path d="M6.5 3H15L19 7V19.5A1.5 1.5 0 0 1 17.5 21H6.5A1.5 1.5 0 0 1 5 19.5V4.5A1.5 1.5 0 0 1 6.5 3Z"/><path d="M15 3V7H19"/><path d="M8 12H16M8 15.5H12"/></>),
  equipe: (<><circle cx="8.5" cy="10" r="2.5"/><path d="M3.5 20.5A5 5 0 0 1 13.5 20.5"/><circle cx="15.5" cy="5.5" r="2.5"/><path d="M14 11.25A5 5 0 0 1 20.5 16"/></>),
  tag: (<><path d="M3 3H11L20.5 12.5A1.5 1.5 0 0 1 20.5 14.5L14.5 20.5A1.5 1.5 0 0 1 12.5 20.5L3 11Z"/><circle cx="8" cy="8" r="1.5"/></>),
  bot: (<><path d="M5 11A7 7 0 0 1 19 11"/><rect x="3" y="11" width="4" height="6" rx="1.5"/><rect x="17" y="11" width="4" height="6" rx="1.5"/><path d="M19 17A3 3 0 0 1 16 20H13"/><circle cx="13" cy="20" r="0.25"/></>),
  dots: (<><circle cx="6" cy="12" r="0.75"/><circle cx="12" cy="12" r="0.75"/><circle cx="18" cy="12" r="0.75"/></>),
  // botões, avisos e ações (só linha)
  alert: (<><path d="M12 3.75L21 19.25H3Z"/><path d="M12 10V12.5"/><circle cx="12" cy="15.75" r="0.25"/></>),
  "arrow-right": (<path d="M4.5 12H19.5M13.5 6L19.5 12L13.5 18"/>),
  bell: (<><path d="M5 16H19L17.5 14.5V10.5A5.5 5.5 0 0 0 6.5 10.5V14.5Z"/><path d="M12 3V5"/><path d="M10 19A2.5 2.5 0 0 0 14 19"/></>),
  "calendar-check": (<><rect x="4" y="5" width="16" height="15.5" rx="1.5"/><path d="M4 9.5H20"/><path d="M8 3V6.5M16 3V6.5"/><path d="M8.25 15L10.75 17.5L15.75 12.5"/></>),
  card: (<><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9.5H21"/><path d="M6.5 15.5H11"/></>),
  check: (<path d="M5 12.5L9.5 17L19 7.5"/>),
  "chevron-down": (<path d="M6 9 L12 15 L18 9"/>),
  "chevron-left": (<path d="M15 6 L9 12 L15 18"/>),
  "chevron-right": (<path d="M9 6 L15 12 L9 18"/>),
  clock: (<><circle cx="12" cy="12" r="9"/><path d="M12 6V12H16"/></>),
  copy: (<><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16"/></>),
  download: (<><path d="M12 4 V15"/><path d="M8 11 L12 15 L16 11"/><path d="M4 15.5 V17.5 A1.5 1.5 0 0 0 5.5 19 H18.5 A1.5 1.5 0 0 0 20 17.5 V15.5"/></>),
  edit: (<><path d="M3.5 20.5V18L17.75 3.75A2 2 0 0 1 20.25 6.25L6 20.5Z"/><path d="M15.5 6L18 8.5"/></>),
  eye: (<><path d="M2.75 12A10 10 0 0 1 21.25 12A10 10 0 0 1 2.75 12Z"/><circle cx="12" cy="12" r="3"/></>),
  "eye-off": (<><path d="M13.75 18A10 10 0 0 1 2.75 12A10 10 0 0 1 4.75 9"/><path d="M10.25 6A10 10 0 0 1 21.25 12A10 10 0 0 1 19.25 15"/><path d="M4 4L20 20"/></>),
  faq: (<><path d="M4.5 4H19.5A1.5 1.5 0 0 1 21 5.5V15A1.5 1.5 0 0 1 19.5 16.5H11L7.5 20V16.5H4.5A1.5 1.5 0 0 1 3 15V5.5A1.5 1.5 0 0 1 4.5 4Z"/><path d="M10 8.5A2 2 0 1 1 12 10.5"/><circle cx="12" cy="13.75" r="0.25"/></>),
  filter: (<path d="M3 8.5H21M6 12H18M9 15.5H15"/>),
  link: (<><path d="M10.75 13.25A3.5 3.5 0 0 1 10.75 8.25L15 4A3.5 3.5 0 0 1 20 9L17.25 11.75"/><path d="M13.25 10.75A3.5 3.5 0 0 1 13.25 15.75L9 20A3.5 3.5 0 0 1 4 15L6.75 12.25"/></>),
  negocio: (<><rect x="4" y="4.5" width="16" height="4.5" rx="1.5"/><path d="M9.25 4.5V9M14.75 4.5V9"/><path d="M5.5 9V18A1.5 1.5 0 0 0 7 19.5H17A1.5 1.5 0 0 0 18.5 18V9"/><path d="M10 19.5V15.5A1.5 1.5 0 0 1 11.5 14H12.5A1.5 1.5 0 0 1 14 15.5V19.5"/></>),
  phone: (<><rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 18H14"/></>),
  pin: (<><path d="M8.5 8.5V4.5A1.5 1.5 0 0 1 10 3H14A1.5 1.5 0 0 1 15.5 4.5V8.5L19 12H5Z"/><path d="M12 12V21"/></>),
  plus: (<path d="M12 5 V19 M5 12 H19"/>),
  refresh: (<><path d="M12 19.25A7.25 7.25 0 0 1 6.75 7"/><path d="M2.75 7H6.75V11"/><path d="M12 4.75A7.25 7.25 0 0 1 17.25 17"/><path d="M21.25 17H17.25V13"/></>),
  scissors: (<><circle cx="6" cy="7.5" r="3"/><circle cx="6" cy="16.5" r="3"/><path d="M8.5 9L20.75 16"/><path d="M8.5 15L10.75 13.75M16.75 10.25L20.75 8"/></>),
  search: (<><circle cx="11" cy="11" r="7"/><path d="M16 16L20.5 20.5"/></>),
  send: (<><path d="M21 3L3 8L11.5 12.5L16 21Z"/><path d="M21 3L11.5 12.5"/></>),
  stethoscope: (<><path d="M4 3V8A3.5 3.5 0 0 0 11 8V3"/><path d="M7.5 11.5V15.5A5 5 0 0 0 17.5 15.5V14"/><circle cx="17.5" cy="11" r="3"/></>),
  target: (<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="0.75"/></>),
  trash: (<><path d="M5 6H19"/><path d="M9.5 6V4.5A1.5 1.5 0 0 1 11 3H13A1.5 1.5 0 0 1 14.5 4.5V6"/><path d="M6.5 6V19.5A1.5 1.5 0 0 0 8 21H16A1.5 1.5 0 0 0 17.5 19.5V6"/><path d="M10 10V17M14 10V17"/></>),
  undo: (<><path d="M8 5L4 9L8 13"/><path d="M4 9H15A5 5 0 0 1 15 19H8"/></>),
  user: (<><circle cx="12" cy="7" r="3.5"/><path d="M5 20.5A7 7 0 0 1 19 20.5"/></>),
  whatsapp: (<><path d="M4.5 16A8.5 8.5 0 1 1 8 19.5H4.5Z"/><path d="M12 9H9A6 6 0 0 0 15 15V12"/></>),
  x: (<path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5"/>),
};

const CHEIOS: Record<string, React.ReactNode> = {
  flow: (<><circle cx="5.5" cy="12" r="3.25"/><rect x="2.25" y="4.75" width="19.5" height="1.5" rx="0.75"/><rect x="10.25" y="11.25" width="11.5" height="1.5" rx="0.75"/><rect x="2.25" y="17.75" width="19.5" height="1.5" rx="0.75"/></>),
  chat: (<path fillRule="evenodd" d="M4.5 3.25H19.5A2.25 2.25 0 0 1 21.75 5.5V15A2.25 2.25 0 0 1 19.5 17.25H11.25L8 20.5A0.75 0.75 0 0 1 6.75 20V17.25H4.5A2.25 2.25 0 0 1 2.25 15V5.5A2.25 2.25 0 0 1 4.5 3.25ZM7.5 7.75H16.5A0.75 0.75 0 0 1 16.5 9.25H7.5A0.75 0.75 0 0 1 7.5 7.75ZM7.5 11.25H13.5A0.75 0.75 0 0 1 13.5 12.75H7.5A0.75 0.75 0 0 1 7.5 11.25Z"/>),
  calendar: (<><path fillRule="evenodd" d="M5.5 4.25H18.5A2.25 2.25 0 0 1 20.75 6.5V19A2.25 2.25 0 0 1 18.5 21.25H5.5A2.25 2.25 0 0 1 3.25 19V6.5A2.25 2.25 0 0 1 5.5 4.25ZM4.75 10.25H19.25V8.75H4.75ZM16 14A1.5 1.5 0 1 0 16 17A1.5 1.5 0 1 0 16 14Z"/><rect x="7.25" y="2.25" width="1.5" height="4" rx="0.75"/><rect x="15.25" y="2.25" width="1.5" height="4" rx="0.75"/></>),
  clientes: (<path fillRule="evenodd" d="M6.5 2.25H17.5A2.25 2.25 0 0 1 19.75 4.5V19.5A2.25 2.25 0 0 1 17.5 21.75H6.5A2.25 2.25 0 0 1 4.25 19.5V4.5A2.25 2.25 0 0 1 6.5 2.25ZM7.25 3.75V20.25H8.75V3.75ZM13.5 6.5A2.5 2.5 0 1 0 13.5 11.5A2.5 2.5 0 1 0 13.5 6.5ZM10.25 16.5A3.25 3.25 0 0 1 16.75 16.5A0.75 0.75 0 0 1 15.25 16.5A1.75 1.75 0 0 0 11.75 16.5A0.75 0.75 0 0 1 10.25 16.5Z"/>),
  receipt: (<path fillRule="evenodd" d="M6.5 2.25H17.5A2.25 2.25 0 0 1 19.75 4.5V21A0.75 0.75 0 0 1 18.5 21.5L17.25 20.25L16 21.5A0.75 0.75 0 0 1 15 21.5L13.75 20.25L12.5 21.5A0.75 0.75 0 0 1 11.5 21.5L10.25 20.25L9 21.5A0.75 0.75 0 0 1 8 21.5L6.75 20.25L5.5 21.5A0.75 0.75 0 0 1 4.25 21V4.5A2.25 2.25 0 0 1 6.5 2.25ZM8 7.75H16A0.75 0.75 0 0 1 16 9.25H8A0.75 0.75 0 0 1 8 7.75ZM8 11.25H12A0.75 0.75 0 0 1 12 12.75H8A0.75 0.75 0 0 1 8 11.25Z"/>),
  documento: (<path fillRule="evenodd" d="M6.5 2.25H14.25V7A0.75 0.75 0 0 0 15 7.75H19.75V19.5A2.25 2.25 0 0 1 17.5 21.75H6.5A2.25 2.25 0 0 1 4.25 19.5V4.5A2.25 2.25 0 0 1 6.5 2.25ZM15.75 2.75L19.25 6.25H15.75ZM8 11.25H16A0.75 0.75 0 0 1 16 12.75H8A0.75 0.75 0 0 1 8 11.25ZM8 14.75H12A0.75 0.75 0 0 1 12 16.25H8A0.75 0.75 0 0 1 8 14.75Z"/>),
  equipe: (<><circle cx="8.5" cy="10" r="3.25"/><path d="M2.75 20.5A5.75 5.75 0 0 1 14.25 20.5A0.75 0.75 0 0 1 13.5 21.25H3.5A0.75 0.75 0 0 1 2.75 20.5Z"/><circle cx="15.5" cy="5.5" r="3.25"/><path d="M21.25 16A5.75 5.75 0 0 0 13.75 10.5A0.75 0.75 0 0 0 13.25 11A4.75 4.75 0 0 1 11.5 13.75A7.25 7.25 0 0 1 14.75 16.75H20.5A0.75 0.75 0 0 0 21.25 16Z"/></>),
  tag: (<path fillRule="evenodd" d="M3 2.25H11A0.75 0.75 0 0 1 11.5 2.5L21 12A2.25 2.25 0 0 1 21 15L15 21A2.25 2.25 0 0 1 12 21L2.5 11.5A0.75 0.75 0 0 1 2.25 11V3A0.75 0.75 0 0 1 3 2.25ZM8 5.75A2.25 2.25 0 1 0 8 10.25A2.25 2.25 0 1 0 8 5.75Z"/>),
  bot: (<><path d="M4.25 11A7.75 7.75 0 0 1 19.75 11H18.25A6.25 6.25 0 0 0 5.75 11Z"/><rect x="2.25" y="10.25" width="5.5" height="7.5" rx="2.25"/><rect x="16.25" y="10.25" width="5.5" height="7.5" rx="2.25"/><path d="M19.75 17A3.75 3.75 0 0 1 16 20.75H13V19.25H16A2.25 2.25 0 0 0 18.25 17Z"/><circle cx="13" cy="20" r="1"/></>),
  dots: (<><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></>),
};

/* O traço acompanha o tamanho para que a linha renderizada fique entre 1.3 e 1.5px (espec 1.3):
   ≥20px → 1.5 · 17–19px → 1.75 · ≤16px → 2. Os vãos de 1.5 foram medidos para aguentar o 2.
   `sw` explícito só para exceção medida. */
const traco = (size: number) => (size >= 20 ? 1.5 : size >= 17 ? 1.75 : 2);

/* ⚠️ NOME FORA DO REGISTRO DESENHA NADA, e não um sparkle. Até 24/09/2026 o fallback era
   `ICONS.sparkle`: o login pedia `name="lock"`, que nunca existiu, e mostrava uma estrelinha
   de "IA" no botão Entrar. Um buraco é honesto; um ícone errado passa por decisão de design.
   Nome literal é conferido pelo guarda G5 (`src/ui/guardas/icones.test.ts`).
   `cheio` sem variante cheia cai na linha: pedir o ativo de um ícone de ação não quebra nada. */
export function Icon({ name, size = 20, sw, cheio = false, stroke = "currentColor", style }: { name: string; size?: number; sw?: number; cheio?: boolean; stroke?: string; style?: React.CSSProperties }) {
  const solido = cheio ? CHEIOS[name] : undefined;
  if (solido) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={stroke} stroke="none" style={style} aria-hidden>
        {solido}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw ?? traco(size)} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
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
      style={{ ...s(`display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--r-controle);font-weight:var(--w-title);font-size:var(--t-sm);white-space:nowrap;padding:${pad};${full ? "width:100%;" : ""}${cor}`), ...(style || {}) }}
    >
      {icon && <Icon name={icon} size={16} />}
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
      <Icon name={icon} size={size === "sm" ? 15 : 16} />
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
    <span style={s(`display:inline-flex;align-items:center;gap:6px;font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-micro);padding:3px 10px;border-radius:var(--r-painel);background:${bg};color:${fg}`)}>
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
            className="m-press m-focus m-hov-prim-border m-filtro"
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
const INPUT ="width:100%;border:1px solid var(--border-field);border-radius:var(--r-controle);padding:10px 13px;font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none";
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
        {icon && <span style={s(`width:34px;height:34px;border-radius:var(--r-controle);flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${bg};color:${fg}`)}><Icon name={icon} size={18} /></span>}
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

/**
 * O estado de uma linha pelo TOM, sem pílula (28/09/2026). A emenda 1 do `maisa-design` diz que
 * pílula é controle, e o limite medido é `pilulasMudas = 0`: "no catálogo", "ativo", "a emitir",
 * "Falta configurar" eram pílulas que não clicam. Forma + rótulo, como o `Estado`: ok é disco,
 * pendência e erro são triângulo, em andamento ou desligado é anel.
 */
const FORMA_DO_TOM: Record<Exclude<Tone, "warm">, FormaDeEstado> = {
  success: "disco", warn: "triangulo", danger: "triangulo", primary: "anel", neutral: "anel",
};
export function EstadoDoTom({ tom, children }: { tom: Exclude<Tone, "warm">; children: React.ReactNode }) {
  return <Estado forma={FORMA_DO_TOM[tom]} tom={tom}>{children}</Estado>;
}

/* ---------- Tabela: conteúdo tabular servido como tabela ----------
 * Serviços, Faturamento, Equipe e Mais eram grades de cartões idênticos — o ban "identical card
 * grids" — para conteúdo que é intrinsecamente uma tabela. O custo real não era estético: com
 * valores alinhados à direita DENTRO de cada cartão, e cartões de largura diferente, os números
 * nunca formavam coluna, então "qual é o meu serviço mais caro?" exigia varredura em zigue-zague.
 *
 * Clientes também saiu da grade em 25/09/2026 (1C.8): com 200 pessoas, cartão com o telefone
 * atrás do hover não serve para achar ninguém; virou lista de linhas com busca. No mobile, onde 6
 * colunas não caberiam, quem escolhe o desenho é a tela, passando `mobile`.
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

export function Tabela<T>({ colunas, linhas, chaveDe, onLinha, rotuloLinha, estreita, rolarPorDentro }: {
  colunas: Coluna<T>[];
  linhas: T[];
  chaveDe: (l: T) => string;
  onLinha?: (l: T) => void;
  /** Nome acessível da linha — a linha é um botão, precisa dizer o que abre. */
  rotuloLinha?: (l: T) => string;
  /** Esconde as colunas secundárias (viewport apertado). */
  estreita?: boolean;
  /**
   * A tabela É a região que rola da `Moldura` (T1, 25/09/2026): cresce até o fim da faixa, o
   * cabeçalho fica parado e só o corpo rola. Sem isso ela tem a altura do conteúdo e quem rola é
   * a região. No celular não rola por dentro (a moldura inteira rola). CSS em `.m-tabela-rola`.
   */
  rolarPorDentro?: boolean;
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
    /* ⚠️ SEM `overflow:hidden` NO INVÓLUCRO (24/09/2026, 06 P0-1). Era ele que arredondava os
       cantos, e era ele que cortava: filho flex com `overflow:hidden` tem altura mínima 0, então a
       tabela encolhia até caber na tela e 8 dos 16 clientes do fechamento do CNPJ não existiam,
       sem barra de rolagem. Agora quem arredonda é cada fatia (cabeçalho em cima, corpo embaixo). */
    <div className={rolarPorDentro ? "m-tabela-rola" : undefined} style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel)")}>
      {/* cabeçalho */}
      <div role="row" style={s(`flex-shrink:0;display:grid;grid-template-columns:${grid};gap:16px;padding:0 18px;border-bottom:1px solid var(--line);background:var(--surface-2);border-radius:var(--r-painel) var(--r-painel) 0 0`)}>
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

      {/* linhas. Quem arredonda o hover da última é a própria linha (raio embaixo), não um
          recorte no corpo: recorte aqui voltaria a ser o que corta (guarda G15). */}
      <div className="m-tabela-corpo" style={s("border-radius:0 0 var(--r-painel) var(--r-painel)")}>
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
        const linhaBase = `display:grid;grid-template-columns:${grid};gap:16px;padding:0 18px;text-align:left;width:100%;background:transparent;border-top-width:0;border-left-width:0;border-right-width:0;border-style:solid;border-color:var(--line);border-bottom-width:${i < dados.length - 1 ? "1px" : "0"};${i === dados.length - 1 ? "border-radius:0 0 var(--r-painel) var(--r-painel);" : ""}`;
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
        <div key={i.id} className="m-pop" style={s(`display:flex;align-items:center;gap:9px;background:var(--ink);color:var(--surface);font-size:var(--t-sm);font-weight:var(--w-data);padding:11px 18px;border-radius:var(--r-painel);box-shadow:var(--shadow-pop)${i.acao ? ";pointer-events:auto" : ""}`)}>
          <Icon name="check" size={16} stroke="var(--surface)" />
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
        style={{ ...s("position:relative;width:420px;max-width:92vw;background:var(--surface);border-radius:var(--r-painel);box-shadow:var(--shadow-pop);padding:24px"), animation: "mrise .25s var(--ease-out)" }}
      >
        <button
          onClick={onCancel}
          title={cancelText}
          aria-label={cancelText}
          className="m-hov-bg m-press-icon m-focus"
          style={s("position:absolute;top:14px;right:14px;width:30px;height:30px;border:none;border-radius:var(--r-controle);background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted)")}
        >
          <Icon name="x" size={16} />
        </button>
        <h2 style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg);padding-right:34px")}>{title}</h2>
        {message && <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose);margin-top:8px")}>{message}</p>}
        <div style={s("display:flex;justify-content:flex-end;gap:10px;margin-top:22px")}>
          <button
            onClick={onCancel}
            className="m-hov-bg m-press m-focus"
            style={s("border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:var(--r-controle);font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;padding:10px 17px")}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${confirmHov} m-press m-focus`}
            style={s(`border:none;border-radius:var(--r-controle);font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;padding:10px 17px;${confirmVar}`)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
