"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O STATUS DA MAISA, NA TELA. Um lugar só para os rótulos e as frases.
 *
 * A regra é de `nucleo/dominio/status-da-maisa.ts`; aqui mora o que a pessoa lê. Até
 * 24/09/2026 cada tela escrevia o seu: "MAISA no ar" na topbar, "Assistente ativa · responde
 * automaticamente" nos Ajustes, "resolvendo tudo sozinha" no Fluxo, todos olhando só o
 * interruptor. Com o WhatsApp desconectado, as três mentiam juntas.
 *
 * ⚠️ O GUARDA G11 (`guardas/status.test.ts`) reprova "no ar", "Atendendo", "Assistente ativa",
 * "responde automaticamente" e "resolvendo tudo sozinha" em qualquer outro arquivo da tela.
 * Precisa dizer o status? Importe daqui.
 *
 * ── AS TRÊS PEÇAS ──
 *
 *   `StatusDaMaisa` ..... o status curto e clicável da casca (topbar e cabeçalho do celular).
 *                         Abre um menu com a única ação que cabe no estado: pausar, voltar a
 *                         atender ou conectar o WhatsApp.
 *   `LinhaDeStatus` ..... a linha dos Ajustes: marca, rótulo, a consequência, e o interruptor
 *                         (desligado de verdade, com o motivo, quando não há WhatsApp).
 *   `ROTULO`, `FRASE` ... para quem precisa só do texto (vazio do Fluxo e de Conversas).
 *
 * `conferindo` é esqueleto SEM TEXTO e sem botão (contradição C10 do backlog do front): dizer
 * "no ar" ou "Conectar" por dois segundos é a mesma mentira, mais curta.
 *
 * Sem pulso: o ponto que pulsava dizia "vivo" para uma assistente que não respondia ninguém,
 * e movimento contínuo num canto da tela é ruído que se aprende a ignorar.
 * ────────────────────────────────────────────────────────────────────────────── */

import React from "react";
import { s, Toggle, type FormaDeEstado } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import type { StatusDaMaisa as Status } from "@/nucleo/dominio/status-da-maisa";

type Conhecido = Exclude<Status, "conferindo">;

export const ROTULO: Record<Conhecido, string> = {
  atendendo: "Atendendo",
  pausada: "Pausada",
  sem_whatsapp: "WhatsApp desconectado",
};

/** O cabeçalho do celular tem 390px para título, status, busca e marca. */
const ROTULO_CURTO: Record<Conhecido, string> = {
  atendendo: "Atendendo",
  pausada: "Pausada",
  sem_whatsapp: "Sem WhatsApp",
};

/** A consequência, não o mecanismo. */
export const FRASE: Record<Conhecido, string> = {
  atendendo: "A MAISA responde seus clientes sozinha e chama você quando precisar. No número pessoal, só cliente marcado e número novo pedindo horário.",
  pausada: "As mensagens ficam esperando você responder.",
  sem_whatsapp: "A MAISA não responde ninguém até o WhatsApp conectar.",
};

const FORMA: Record<Conhecido, FormaDeEstado> = {
  atendendo: "disco",
  pausada: "anel",
  sem_whatsapp: "triangulo",
};

/* Cor da marca por fundo. Sobre `--nav`, `--success` e `--warn` dão 2,1:1 e 2,4:1; o verde de
 * marca do WhatsApp dá 7,3:1 e o âmbar é pendência (emenda 2 do maisa-design), que é o que
 * "sem WhatsApp" é. Sobre fundo claro, os tons de estado de sempre. */
const COR: Record<"nav" | "claro", Record<Conhecido, string>> = {
  nav: { atendendo: "var(--whatsapp-mark)", pausada: "var(--nav-soft)", sem_whatsapp: "var(--warm)" },
  claro: { atendendo: "var(--success)", pausada: "var(--muted)", sem_whatsapp: "var(--warn)" },
};

function Marca({ forma, cor }: { forma: FormaDeEstado; cor: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={s("flex-shrink:0")}>
      {forma === "disco" && <circle cx="5" cy="5" r="4.5" fill={cor} />}
      {forma === "anel" && <circle cx="5" cy="5" r="3.75" fill="none" stroke={cor} strokeWidth="1.5" />}
      {forma === "triangulo" && <path d="M5 .6 9.6 9.2H.4Z" fill={cor} />}
    </svg>
  );
}

/** O esqueleto do `conferindo`: do tamanho do rótulo, sem uma letra. */
function Conferindo({ sobre, largura = 96 }: { sobre: "nav" | "claro"; largura?: number }) {
  return (
    <span
      aria-busy="true"
      aria-label="Conferindo o status da MAISA"
      style={s(`display:inline-block;width:${largura}px;height:12px;border-radius:6px;background:${sobre === "nav" ? "var(--nav-active)" : "var(--line)"}`)}
    />
  );
}

/** Quando a MAISA não está respondendo, o título do vazio que depende dela (a fila do Fluxo,
 *  a lista de Conversas). */
export const TITULO_PARADA: Record<"pausada" | "sem_whatsapp", string> = {
  pausada: "A MAISA está pausada",
  sem_whatsapp: "O WhatsApp está desconectado",
};

/**
 * A única ação que cabe no estado, e ela é o verbo do estado: pausar quem atende, religar quem
 * está pausada, conectar quem não tem canal. Sem WhatsApp, religar o interruptor não mudaria
 * nada do lado do cliente, e por isso não é oferecido. `null` enquanto confere.
 */
export function useAcaoDoStatus(): { rotulo: string; fazer: () => void } | null {
  const st = useStore();
  switch (st.statusMaisa) {
    case "atendendo": return { rotulo: "Pausar a MAISA", fazer: () => st.setAssistente({ ativa: false }) };
    case "pausada": return { rotulo: "Voltar a atender", fazer: () => st.setAssistente({ ativa: true }) };
    case "sem_whatsapp": return { rotulo: "Conectar o WhatsApp", fazer: () => st.irPara("assistente", "whatsapp") };
    default: return null;
  }
}

/* ───────────────────────────── o status da casca ───────────────────────────── */

export function StatusDaMaisa({ sobre, curto }: { sobre: "nav" | "claro"; curto?: boolean }) {
  const st = useStore();
  const status = st.statusMaisa;
  const acao = useAcaoDoStatus();
  const [aberto, setAberto] = React.useState(false);
  const caixa = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  if (status === "conferindo" || !acao) return <Conferindo sobre={sobre} largura={curto ? 72 : 96} />;

  const tinta = sobre === "nav" ? "var(--nav-soft)" : "var(--ink)";
  const rotulo = (curto ? ROTULO_CURTO : ROTULO)[status];

  return (
    <span ref={caixa} style={s("position:relative;display:inline-flex")}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label={`MAISA: ${ROTULO[status]}`}
        className="m-press m-focus"
        style={s(`display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 6px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:var(--t-label);font-weight:var(--w-data);color:${tinta};white-space:nowrap`)}
      >
        <Marca forma={FORMA[status]} cor={COR[sobre][status]} />
        {rotulo}
      </button>
      {aberto && (
        <span
          role="menu"
          style={s("position:absolute;top:calc(100% + 4px);right:0;z-index:60;min-width:240px;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-pop);color:var(--ink)")}
        >
          <span style={s("font-size:var(--t-sm);line-height:var(--lh-ui);white-space:normal")}>{FRASE[status]}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAberto(false); acao.fazer(); }}
            className="m-hov-primary m-press m-focus"
            style={s("height:44px;border:none;border-radius:8px;background:var(--primary);color:var(--on-primary);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer")}
          >
            {acao.rotulo}
          </button>
        </span>
      )}
    </span>
  );
}

/* ───────────────────────────── a linha dos Ajustes ───────────────────────────── */

export function LinhaDeStatus({ gravacao }: { gravacao?: React.ReactNode }) {
  const st = useStore();
  const status = st.statusMaisa;
  const idMotivo = React.useId();

  if (status === "conferindo") {
    return (
      <div style={s("flex-shrink:0;display:flex;align-items:center;gap:14px;min-height:56px;padding:6px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--border)")}>
        <span aria-busy="true" style={s("flex:1;min-width:0;display:flex")}><Conferindo sobre="claro" largura={180} /></span>
        {gravacao}
      </div>
    );
  }

  const semCanal = status === "sem_whatsapp";
  return (
    <div style={s("flex-shrink:0;display:flex;align-items:center;gap:14px;min-height:56px;padding:6px 8px 6px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--border)")}>
      <Marca forma={FORMA[status]} cor={COR.claro[status]} />
      <span style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px")}>
        {/* O sinal de gravação mora na linha do rótulo, e não ao lado do interruptor: a 390px
            ele espremia a frase numa coluna de 100px e a linha ia a 391px de altura. */}
        <span style={s("display:flex;align-items:center;flex-wrap:wrap;column-gap:12px;row-gap:2px")}>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{ROTULO[status]}</span>
          {gravacao}
        </span>
        <span id={idMotivo} style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>{FRASE[status]}</span>
      </span>
      <Toggle
        on={st.assistente.ativa && !semCanal}
        onChange={(v) => st.setAssistente({ ativa: v })}
        rotulo="MAISA respondendo no WhatsApp"
        disabled={semCanal}
        descritoPor={semCanal ? idMotivo : undefined}
      />
    </div>
  );
}
