"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A TELA DO PIX — QR Code, copia-e-cola, e o pagamento acompanhado sem a pessoa sair daqui.
 *
 * ── A ORDEM DOS DOIS CÓDIGOS MUDA COM A TELA, E É A DECISÃO QUE MAIS IMPORTA AQUI ──
 *
 * No celular, ninguém escaneia o QR Code da própria tela: o caminho é copiar o código e colar
 * no app do banco. Então no celular o primeiro botão é "Copiar código Pix", e o QR vem depois,
 * menor, para quem tem outro aparelho à mão. No computador é o contrário: o QR é o protagonista,
 * porque o celular do lado é a câmera.
 *
 * ── O ACOMPANHAMENTO ──
 *
 * A tela relê o Pix a cada 3 segundos enquanto ele está pendente, e relê NA HORA quando a aba
 * volta a ficar visível — que é o momento exato em que a pessoa volta do app do banco. Sem isso,
 * ela pagaria e ficaria até 3 segundos olhando um "aguardando" que já não é verdade.
 *
 * ⚠️ "PAGO" AQUI É O QUE A ABACATEPAY DIZ, E NÃO QUE O MÊS JÁ FOI SOMADO. Quem soma é o webhook,
 * segundos depois. A frase de sucesso diz "recebido", não "assinatura ativa" — mesma regra da
 * volta do checkout em `store.tsx`.
 *
 * ⚠️ "POLI JUNIOR" NO BANCO. O recebedor que o app do banco mostra é o titular da conta da
 * AbacatePay, que é a Poli Júnior (medido no Pix de R$ 1 de 29/09/2026). A pessoa espera ler
 * "maisa". Sem avisar antes, é a hora em que ela desiste achando que é golpe.
 * ────────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { s, Icon, fmt } from "@/ui/primitivos";
import { useIsMobile } from "@/ui/useIsMobile";
import { whatsappUrl } from "@/app/(marketing)/_lib/icp";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import type { PagamentoPix } from "@/nucleo/portas/saida/cobranca";
import { destinoDaVolta, horaQueVence, voltaSegura } from "./regras";
import { guardarPix, pixGuardado } from "@/ui/estado/pix";

const NOME_DO_PLANO: Record<string, string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  escala: "Escala",
};

type Leitura =
  | { fase: "carregando" }
  | { fase: "ok"; p: PagamentoPix }
  | { fase: "nao_encontrado" }
  | { fase: "erro" };

const cartao = "background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px";
const primario = (ocupado: boolean) =>
  `display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;border:none;border-radius:var(--r-controle);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${ocupado ? "not-allowed" : "pointer"};opacity:${ocupado ? ".6" : "1"};font-family:inherit`;

function PagarInner() {
  const q = useSearchParams();
  const id = q.get("id") ?? "";
  const volta = voltaSegura(q.get("volta"));
  const celular = useIsMobile();

  const [leitura, setLeitura] = useState<Leitura>({ fase: "carregando" });
  const [copiado, setCopiado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const emVoo = useRef(false);

  const reler = useCallback(async () => {
    if (!id || emVoo.current) return;
    emVoo.current = true;
    try {
      const r = await fetch(`/api/pagamento?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (r.status === 404) { setLeitura({ fase: "nao_encontrado" }); return; }
      const d = (await r.json()) as { ok?: boolean; pagamento?: PagamentoPix };
      /* Uma leitura que falha no meio do acompanhamento não apaga o QR Code da tela: a pessoa
       * pode estar com o banco aberto, pagando. Só o primeiro carregamento vira erro. */
      if (!d.ok || !d.pagamento) { setLeitura((v) => (v.fase === "ok" ? v : { fase: "erro" })); return; }
      setLeitura({ fase: "ok", p: d.pagamento });
    } catch {
      setLeitura((v) => (v.fase === "ok" ? v : { fase: "erro" }));
    } finally {
      emVoo.current = false;
    }
  }, [id]);

  const pendente = leitura.fase === "ok" && leitura.p.status === "pendente";

  useEffect(() => {
    if (!id) { setLeitura({ fase: "nao_encontrado" }); return; }
    /* O Pix que veio da tela anterior desenha na hora; a releitura confirma logo depois. Ver
     * `ui/estado/pix.ts`. */
    const guardado = pixGuardado(id);
    if (guardado) setLeitura({ fase: "ok", p: guardado });
    void reler();
  }, [id, reler]);

  useEffect(() => {
    if (!pendente) return;
    const t = setInterval(() => { void reler(); }, 3_000);
    const aoVoltar = () => { if (document.visibilityState === "visible") void reler(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [pendente, reler]);

  /* Pago: segue sozinho em 4 segundos, para quem pagou pelo celular e voltou para cá. O botão
   * continua lá para quem quer ir antes. */
  const pago = leitura.fase === "ok" && leitura.p.status === "pago";
  useEffect(() => {
    if (!pago) return;
    const t = setTimeout(() => { window.location.href = volta; }, 4_000);
    return () => clearTimeout(t);
  }, [pago, volta]);

  const copiar = useCallback(async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      /* Navegador sem permissão de área de transferência: seleciona o texto do campo, e o
       * "copiar" do próprio sistema resolve. */
      const el = document.getElementById("pix-codigo") as HTMLTextAreaElement | null;
      el?.select();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2_500);
  }, []);

  /* Pix vencido ou cancelado: um novo, do mesmo plano, pelo mesmo `POST` de sempre. */
  const gerarOutro = useCallback(async (plano: string | null) => {
    if (!plano || gerando) return;
    setGerando(true);
    try {
      const r = (await fetch("/api/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plano, destino: destinoDaVolta(volta) }),
      }).then((x) => x.json())) as { ok?: boolean; url?: string; pagamento?: PagamentoPix } | null;
      if (!r?.ok || !r.url) throw new Error("sem url");
      guardarPix(r.pagamento);
      window.location.href = r.url;
    } catch {
      setGerando(false);
      setLeitura({ fase: "erro" });
    }
  }, [gerando, volta]);

  const zap = whatsappUrl("Oi! Estou tentando pagar a maisa por Pix e tenho uma dúvida.");

  return (
    <div style={{ position: "relative", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />

      <div className="m-enter" style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={s("display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;background:var(--nav);border:1px solid var(--nav-line);border-radius:var(--r-painel);box-shadow:0 10px 30px oklch(0.22 0.03 262 / 0.22)")}>
            <span style={{ ...s("font-size:var(--t-data);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line), 0 3px 5px rgba(0,0,0,.22)" }}>maisa</span>
          </div>
        </div>

        {leitura.fase === "carregando" && (
          <div style={s(`${cartao};display:flex;align-items:center;gap:10px;color:var(--muted);font-size:var(--t-sm)`)}>
            <Icon name="clock" size={18} /> Gerando o seu Pix…
          </div>
        )}

        {(leitura.fase === "nao_encontrado" || leitura.fase === "erro") && (
          <div style={s(`${cartao};display:flex;flex-direction:column;gap:12px`)}>
            <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>
              {leitura.fase === "nao_encontrado" ? "Não achamos este Pix" : "Não conseguimos carregar o Pix"}
            </h1>
            <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
              {leitura.fase === "nao_encontrado"
                ? "O link pode ser de outra conta, ou ter sido copiado pela metade. Gere um novo pelo seu plano."
                : "Nada foi cobrado por isso. Tente de novo em instantes."}
            </p>
            <a href="/?tela=mais" className="m-hov-primary m-press m-focus" style={s(`${primario(false)};text-decoration:none`)}>Ir para o meu plano</a>
          </div>
        )}

        {leitura.fase === "ok" && (() => {
          const p = leitura.p;
          const plano = p.plano ? NOME_DO_PLANO[p.plano] ?? p.plano : "maisa";
          const vence = horaQueVence(p.expiraEm);

          const resumo = (
            <div style={s(cartao)}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={s("font-size:var(--t-lg);font-weight:var(--w-title);color:var(--ink)")}>{plano}</span>
                <span style={s("font-variant-numeric:tabular-nums;font-size:var(--t-body);font-weight:var(--w-data);color:var(--ink);white-space:nowrap")}>{fmt(p.valor)}</span>
              </div>
              <p style={s("margin:6px 0 0;font-size:var(--t-label);color:var(--muted)")}>Um mês de maisa. Sem fidelidade: você paga o próximo quando quiser continuar.</p>
            </div>
          );

          if (p.status === "pago") {
            return (
              <>
                {resumo}
                <div role="status" style={s(`${cartao};display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center`)}>
                  <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--success-soft);color:var(--success)")}>
                    <Icon name="check" size={30} />
                  </div>
                  <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Pix recebido</h1>
                  <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>Em instantes o seu plano aparece como ativo. Estamos te levando de volta.</p>
                  <a href={volta} className="m-hov-primary m-press m-focus" style={s(`${primario(false)};text-decoration:none`)}>Continuar</a>
                </div>
              </>
            );
          }

          if (p.status !== "pendente") {
            return (
              <>
                {resumo}
                <div style={s(`${cartao};display:flex;flex-direction:column;gap:12px`)}>
                  <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>
                    {p.status === "expirado" ? "Este Pix venceu" : "Este Pix foi cancelado"}
                  </h1>
                  <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>Nada foi cobrado. Gere um novo e pague em seguida.</p>
                  <button type="button" onClick={() => gerarOutro(p.plano)} disabled={gerando || !p.plano} className="m-hov-primary m-press m-focus" style={s(primario(gerando))}>
                    {gerando ? "Gerando…" : "Gerar um novo Pix"}
                  </button>
                </div>
              </>
            );
          }

          const qr = p.qrCode && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- é um data URL do provedor, não um arquivo nosso */}
              <img src={p.qrCode} alt="QR Code do Pix" width={celular ? 168 : 232} height={celular ? 168 : 232} style={s("border:1px solid var(--border);border-radius:var(--r-painel);background:#fff;padding:8px")} />
              <span style={s("font-size:var(--t-micro);color:var(--muted)")}>{celular ? "Ou escaneie de outro aparelho" : "Aponte a câmera do app do banco"}</span>
            </div>
          );

          const copia = p.copiaECola && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => copiar(p.copiaECola!)} className="m-hov-primary m-press m-focus" style={s(primario(false))}>
                <Icon name={copiado ? "check" : "copy"} size={18} />
                {copiado ? "Código copiado" : "Copiar código Pix"}
              </button>
              <textarea id="pix-codigo" readOnly value={p.copiaECola} rows={2} onFocus={(e) => e.currentTarget.select()} aria-label="Código Pix copia e cola" style={s("width:100%;resize:none;border:1px solid var(--border);border-radius:var(--r-controle);padding:10px 12px;font-variant-numeric:tabular-nums;font-size:var(--t-micro);color:var(--muted);background:var(--bg);line-height:1.4")} />
            </div>
          );

          return (
            <>
              {resumo}
              <div style={s(`${cartao};display:flex;flex-direction:column;gap:16px`)}>
                <div>
                  <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Pague com Pix</h1>
                  <p style={s("margin:4px 0 0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
                    {celular ? "Copie o código e cole no app do seu banco, em Pix Copia e Cola." : "Escaneie o QR Code com o app do seu banco."}
                  </p>
                </div>

                {celular ? <>{copia}{qr}</> : <>{qr}{copia}</>}

                <div style={s("display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px solid var(--border)")}>
                  <span aria-live="polite" style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-label);color:var(--ink-800);font-weight:var(--w-title)")}>
                    <span aria-hidden style={{ ...s("width:8px;height:8px;border-radius:50%;background:var(--primary)"), animation: "mpulse 1.4s ease-in-out infinite" }} />
                    Esperando o pagamento. Esta tela atualiza sozinha.
                  </span>
                  <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
                    No banco, o recebedor aparece como <strong style={s("color:var(--ink-800)")}>Poli Júnior</strong>, a empresa que faz a maisa.
                    {vence ? ` O código vale até ${vence}.` : ""}
                  </span>
                </div>
              </div>
            </>
          );
        })()}

        <a href={zap} target="_blank" rel="noopener noreferrer" className="m-focus" style={s("text-align:center;font-size:var(--t-label);color:var(--muted);text-decoration:none")}>
          Alguma dúvida? <span style={s("color:var(--primary);font-weight:var(--w-title)")}>Chama no WhatsApp</span>
        </a>

        <LinhaLegal />
      </div>
    </div>
  );
}

/* `useSearchParams` obriga a fronteira de Suspense no App Router, como no `/assinar`. */
export default function Pagar() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh" }} />}>
      <PagarInner />
    </Suspense>
  );
}
