"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A TELA DA EQUIPE — um negócio, a situação dele, e um botão.
 *
 * Pensada para o celular de quem responde o WhatsApp: abre do link da mensagem, mostra de quem é
 * o pedido, libera com um toque e devolve uma mensagem pronta para colar na conversa.
 * ────────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { s, Icon } from "@/ui/primitivos";

type Situacao = { negocio: string; situacao: "pago" | "em_teste" | "fechado"; fim: string | null };

type Tela =
  | { fase: "carregando" }
  | { fase: "ok"; v: Situacao; liberado: boolean }
  | { fase: "barrado"; status: string; usuarioId?: string }
  | { fase: "erro"; info: string };

const cartao = "background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px;display:flex;flex-direction:column;gap:12px";
const primario = (ocupado: boolean) =>
  `display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;border:none;border-radius:var(--r-controle);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${ocupado ? "not-allowed" : "pointer"};opacity:${ocupado ? ".6" : "1"};font-family:inherit`;
const secundario =
  "display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:46px;border:1px solid var(--border);border-radius:var(--r-controle);background:var(--surface);color:var(--ink);font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;font-family:inherit";

/** "16/10". */
const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function frase(v: Situacao): string {
  if (v.situacao === "pago") return `Já pagou: tem a maisa até ${dia(v.fim)}. Não há teste para liberar.`;
  if (v.situacao === "em_teste") return `Em teste até ${dia(v.fim)}. Liberar de novo conta sete dias a partir de hoje.`;
  return "Sem acesso hoje. Liberar dá sete dias de teste a partir de hoje.";
}

export default function Liberar({ pedido }: { pedido: string }) {
  const [tela, setTela] = useState<Tela>({ fase: "carregando" });
  const [indo, setIndo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const ler = useCallback(async (r: Response, liberado: boolean) => {
    const d = (await r.json().catch(() => null)) as (Situacao & { ok?: boolean; status?: string; info?: string; usuarioId?: string }) | null;
    if (r.status === 401 || r.status === 403) { setTela({ fase: "barrado", status: d?.status ?? "", usuarioId: d?.usuarioId }); return; }
    if (!d?.ok) { setTela({ fase: "erro", info: d?.info ?? "Não deu para ler este pedido agora." }); return; }
    setTela({ fase: "ok", v: { negocio: d.negocio, situacao: d.situacao, fim: d.fim }, liberado });
  }, []);

  useEffect(() => {
    fetch(`/api/teste/liberar?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" })
      .then((r) => ler(r, false))
      .catch(() => setTela({ fase: "erro", info: "Sem conexão. Tente de novo." }));
  }, [pedido, ler]);

  const liberar = useCallback(async () => {
    setIndo(true);
    try {
      const r = await fetch("/api/teste/liberar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido }),
      });
      await ler(r, true);
    } catch {
      setTela({ fase: "erro", info: "Sem conexão. Nada foi liberado." });
    } finally {
      setIndo(false);
    }
  }, [pedido, ler]);

  const mensagem = tela.fase === "ok"
    ? `Pronto, liberei o seu teste da maisa até ${dia(tela.v.fim)}! Pode seguir a configuração por aqui: ${typeof window === "undefined" ? "" : window.location.origin}/comecar`
    : "";

  const copiar = useCallback(async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2_500); } catch { /* sem permissão: o texto está na tela */ }
  }, [mensagem]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg)" }}>
      <div className="m-enter" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--muted);text-transform:uppercase;letter-spacing:.06em")}>Equipe maisa · liberar teste</span>

        {tela.fase === "carregando" && (
          <div style={s(`${cartao};flex-direction:row;align-items:center;color:var(--muted);font-size:var(--t-sm)`)}>
            <Icon name="clock" size={18} /> Lendo o pedido…
          </div>
        )}

        {tela.fase === "barrado" && (
          <div style={s(cartao)}>
            <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Só a equipe libera teste</h1>
            <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
              {tela.status === "equipe_nao_configurada"
                ? "Ninguém está na equipe ainda: falta a variável MAISA_EQUIPE no ambiente."
                : "Esta conta não está na lista da equipe."}
            </p>
            {tela.usuarioId && (
              <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
                O id desta conta é <strong style={s("color:var(--ink);word-break:break-all")}>{tela.usuarioId}</strong>. É ele que vai em MAISA_EQUIPE.
              </p>
            )}
          </div>
        )}

        {tela.fase === "erro" && (
          <div style={s(cartao)}>
            <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Não deu</h1>
            <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>{tela.info}</p>
          </div>
        )}

        {tela.fase === "ok" && (
          <div style={s(cartao)}>
            <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>{tela.v.negocio}</h1>
            {tela.liberado ? (
              <>
                <p role="status" style={s("margin:0;display:flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--success);font-weight:var(--w-title)")}>
                  <Icon name="check" size={18} /> Teste liberado até {dia(tela.v.fim)}.
                </p>
                <p style={s("margin:0;font-size:var(--t-sm);color:var(--ink-800);line-height:1.5;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-controle);padding:12px")}>{mensagem}</p>
                <button type="button" onClick={copiar} className="m-hov-primary m-press m-focus" style={s(primario(false))}>
                  <Icon name={copiado ? "check" : "copy"} size={18} /> {copiado ? "Mensagem copiada" : "Copiar mensagem para a conversa"}
                </button>
              </>
            ) : (
              <>
                <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>{frase(tela.v)}</p>
                {tela.v.situacao !== "pago" && (
                  <button type="button" onClick={liberar} disabled={indo} className="m-hov-primary m-press m-focus" style={s(primario(indo))}>
                    {indo ? "Liberando…" : "Liberar 7 dias de teste"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tela.fase === "ok" && tela.liberado && (
          <a href="/" className="m-focus" style={s(`${secundario};text-decoration:none`)}>Voltar ao app</a>
        )}
      </div>
    </div>
  );
}
