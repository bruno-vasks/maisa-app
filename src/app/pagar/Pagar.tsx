"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A TELA DO PIX — QR Code, copia-e-cola, e o pagamento acompanhado sem a pessoa sair daqui.
 *
 * ── O DESENHO: SPLIT NAVY (09/10/2026) ──
 *
 * Escolhido por Bruno entre três variações (`01 App — Telas e Features/(C) 2026-10-09 — Checkout
 * — 3 variações.html`). À esquerda, em navy, o que está sendo comprado: plano, preço e os números
 * do plano, que vêm de `_lib/planos.ts`. À direita, só o pagamento. No celular, o navy vira um
 * cabeçalho curto e o pagamento vem logo abaixo.
 *
 * ⚠️ POUCO TEXTO É REQUISITO, NÃO GOSTO. Bruno cortou, um por um: a instrução de como pagar Pix
 * ("espera-se que o usuário saiba"), o subtítulo das abas, o "a tela confirma sozinha", a frase
 * sobre a Poli Júnior (virou só "Recebedor: Poli Júnior", ao lado do preço) e a validade do
 * código. Depois pediu de volta UMA instrução, que diz como pagar e não o passo a passo: "Pague
 * com o QR Code ou com o Pix Copia e Cola". Antes de acrescentar outra frase aqui, a pergunta é se
 * ela muda o que a pessoa faz.
 *
 * Layout por media query, e não por `useIsMobile`: o hook devolve "desktop" no primeiro render, e
 * o split piscaria no celular, que é onde o anúncio abre.
 *
 * ── PIX | CARTÃO ──
 *
 * A aba "Cartão" só existe quando `GET /api/assinatura` diz `capacidades.cartao`. O cartão é uma
 * compra avulsa de um mês na página da AbacatePay (`abrirCartao` em `cobranca-avulsa.ts`), e NÃO
 * renova sozinho: a recorrência da loja está bloqueada. Por isso a aba não promete renovação.
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
 * "maisa". O nome tem de estar na tela antes de ela abrir o banco; uma frase explicando, não.
 *
 * ── O TESTE NA CONVERSA (09/10/2026) ──
 *
 * Quem veio do funil (a volta é o `/comecar`) e não quer pagar ainda pode pedir um teste. Pedir é
 * mandar uma mensagem pronta no WhatsApp, com o link que a equipe abre para liberar (ver
 * `api/teste/pedido`). É SECUNDÁRIO de propósito, um link e não um botão: com o mesmo peso do
 * Pix, ele roubaria a compra. Quem paga de dentro do app não vê a opção: já teve o teste dele.
 *
 * O link do WhatsApp é montado ANTES do clique. Um `window.open` depois de um `await` é bloqueado
 * pelo Safari do iPhone, que é onde o anúncio abre.
 * ────────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { s, Icon } from "@/ui/primitivos";
import { whatsappUrl } from "@/app/(marketing)/_lib/icp";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { PLANOS } from "@/app/(marketing)/_lib/planos";
import type { PagamentoPix } from "@/nucleo/portas/saida/cobranca";
import { destinoDaVolta, voltaSegura } from "./regras";
import { guardarPix, pixGuardado } from "@/ui/estado/pix";


type Leitura =
  | { fase: "carregando" }
  | { fase: "ok"; p: PagamentoPix }
  | { fase: "nao_encontrado" }
  | { fase: "erro" };

const cartao = "background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px";
const primario = (ocupado: boolean) =>
  `display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:52px;border:none;border-radius:var(--r-controle);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${ocupado ? "not-allowed" : "pointer"};opacity:${ocupado ? ".6" : "1"};font-family:inherit`;
const secundario =
  "display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:48px;border:1px solid var(--border);border-radius:var(--r-controle);background:var(--surface);color:var(--ink);font-weight:var(--w-title);font-size:var(--t-sm);cursor:pointer;font-family:inherit";

/** "R$ 197", ou "R$ 197,50" quando há centavos. O preço é o do Pix, que é o cobrado. */
const reais = (v: number) =>
  `R$ ${Number.isInteger(v) ? v : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A largura do toggle, e do que vem embaixo dele: o QR fica sob "Pix", o botão sob "Cartão". */
const COLUNA = 580;

/* O layout por media query. Ver o cabeçalho: o hook piscaria. */
const CSS = `
.pg{min-height:100dvh;display:grid;grid-template-columns:5fr 6fr;background:var(--surface)}
.pg-navy{background:var(--nav);color:#fff;padding:48px clamp(32px,5vw,72px);display:flex;flex-direction:column;gap:28px}
.pg-pag{padding:48px clamp(28px,5vw,80px);display:flex;flex-direction:column;gap:20px;max-width:640px;width:100%}
.pg-specs{display:grid;gap:9px}
.pg-desk{display:flex}
.pg-duas{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:0 4px;align-items:center}
.pg-cel{display:none}
@media (max-width:900px){
  .pg{grid-template-columns:1fr;align-content:start}
  .pg-navy{padding:20px 20px 22px;gap:14px}
  .pg-pag{padding:20px;gap:16px}
  .pg-specs,.pg-desk,.pg-duas{display:none}
  .pg-cel{display:flex}
}`;

function PagarInner() {
  const q = useSearchParams();
  const id = q.get("id") ?? "";
  const volta = voltaSegura(q.get("volta"));

  const [leitura, setLeitura] = useState<Leitura>({ fase: "carregando" });
  const [copiado, setCopiado] = useState(false);
  /* O código cru só aparece se a área de transferência falhar: é o único caso em que a pessoa
   * precisa vê-lo. */
  const [semClipboard, setSemClipboard] = useState(false);
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
      setSemClipboard(true);
      return;
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

  const zap = whatsappUrl("Oi! Estou tentando pagar a maisa e tenho uma dúvida.");

  /* Pix | Cartão. A aba só aparece quando o provedor aceita cartão; ver o cabeçalho. */
  const [aceitaCartao, setAceitaCartao] = useState(false);
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [indoCartao, setIndoCartao] = useState(false);
  const [falhaCartao, setFalhaCartao] = useState(false);
  useEffect(() => {
    fetch("/api/assinatura", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { capacidades?: { cartao?: boolean } }) => setAceitaCartao(d?.capacidades?.cartao === true))
      .catch(() => {});
  }, []);
  const pagarNoCartao = useCallback(async (plano: string | null) => {
    if (!plano || indoCartao) return;
    setIndoCartao(true);
    setFalhaCartao(false);
    try {
      const r = (await fetch("/api/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plano, destino: destinoDaVolta(volta), metodo: "cartao" }),
      }).then((x) => x.json())) as { ok?: boolean; url?: string } | null;
      if (!r?.ok || !r.url) throw new Error("sem url");
      window.location.href = r.url;
    } catch {
      setIndoCartao(false);
      setFalhaCartao(true);
    }
  }, [indoCartao, volta]);

  /* O teste na conversa: só para quem veio do funil. Ver o cabeçalho. */
  const doFunil = destinoDaVolta(volta) === "onboarding";
  const [pedido, setPedido] = useState<{ negocio: string; link: string } | null>(null);
  const [pediuTeste, setPediuTeste] = useState(false);
  const temPix = leitura.fase === "ok";
  useEffect(() => {
    if (!doFunil || !temPix) return;
    fetch("/api/teste/pedido", { method: "POST", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; negocio?: string; link?: string }) => {
        if (d?.ok && d.link) setPedido({ negocio: d.negocio ?? "", link: d.link });
      })
      /* Sem o link, a mensagem sai sem ele: a equipe acha a pessoa pelo `npm run leads`. */
      .catch(() => {});
  }, [doFunil, temPix]);
  const zapTeste = whatsappUrl(
    pedido
      ? `Oi! Quero testar a maisa antes de assinar.\nNegócio: ${pedido.negocio}\nLiberar o teste: ${pedido.link}`
      : "Oi! Acabei de criar minha conta e quero testar a maisa antes de assinar.",
  );

  const plano = leitura.fase === "ok" ? PLANOS.find((x) => x.chave === leitura.p.plano) ?? null : null;

  /* O "testar antes", ou a dúvida de sempre para quem paga de dentro do app. */
  const saida = doFunil && leitura.fase === "ok" && leitura.p.status !== "pago"
    ? pediuTeste
      ? (
        <div role="status" style={s("display:flex;flex-direction:column;gap:6px;font-size:var(--t-sm);line-height:1.5")}>
          <strong style={s("font-weight:var(--w-title)")}>Pedido enviado no WhatsApp</strong>
          <a href="/comecar" className="m-focus" style={s("color:inherit;font-weight:var(--w-title)")}>Configurar a maisa enquanto isso →</a>
        </div>
      )
      : (
        <a href={zapTeste} target="_blank" rel="noopener noreferrer" onClick={() => setPediuTeste(true)} className="m-focus" style={s("display:block;font-size:var(--t-sm);line-height:1.5;color:inherit;text-decoration:none")}>
          Quer testar antes? <strong style={s("font-weight:var(--w-title);text-decoration:underline")}>7 dias grátis no WhatsApp</strong>
        </a>
      )
    : (
      <a href={zap} target="_blank" rel="noopener noreferrer" className="m-focus" style={s("font-size:var(--t-sm);color:inherit;text-decoration:none")}>
        Alguma dúvida? <strong style={s("font-weight:var(--w-title);text-decoration:underline")}>Chama no WhatsApp</strong>
      </a>
    );

  /* Os estados sem Pix para mostrar ocupam o lugar do pagamento. */
  const semPix = (titulo: string, texto: string, acao: React.ReactNode) => (
    <div style={s(`${cartao};display:flex;flex-direction:column;gap:12px`)}>
      <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>{titulo}</h1>
      <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>{texto}</p>
      {acao}
    </div>
  );

  let pagamento: React.ReactNode;
  if (leitura.fase === "carregando") {
    pagamento = (
      <div style={s("display:flex;align-items:center;gap:10px;color:var(--muted);font-size:var(--t-sm)")}>
        <Icon name="clock" size={18} /> Gerando o seu Pix…
      </div>
    );
  } else if (leitura.fase !== "ok") {
    pagamento = semPix(
      leitura.fase === "nao_encontrado" ? "Não achamos este Pix" : "Não conseguimos carregar o Pix",
      leitura.fase === "nao_encontrado" ? "Gere um novo pelo seu plano." : "Nada foi cobrado. Tente de novo em instantes.",
      <a href="/?tela=mais" className="m-hov-primary m-press m-focus" style={s(`${primario(false)};text-decoration:none`)}>Ir para o meu plano</a>,
    );
  } else if (leitura.p.status === "pago") {
    pagamento = (
      <div role="status" style={s("display:flex;flex-direction:column;align-items:flex-start;gap:14px")}>
        <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--success-soft);color:var(--success)")}>
          <Icon name="check" size={30} />
        </div>
        <h1 style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Pix recebido</h1>
        <a href={volta} className="m-hov-primary m-press m-focus" style={s(`${primario(false)};text-decoration:none`)}>Continuar</a>
      </div>
    );
  } else if (leitura.p.status !== "pendente") {
    const p = leitura.p;
    pagamento = semPix(
      p.status === "expirado" ? "Este Pix venceu" : "Este Pix foi cancelado",
      "Nada foi cobrado.",
      <button type="button" onClick={() => gerarOutro(p.plano)} disabled={gerando || !p.plano} className="m-hov-primary m-press m-focus" style={s(primario(gerando))}>
        {gerando ? "Gerando…" : "Gerar um novo Pix"}
      </button>,
    );
  } else {
    const p = leitura.p;
    const botaoCopiar = (estilo: string) => p.copiaECola && (
      <button type="button" onClick={() => copiar(p.copiaECola!)} className="m-hov-primary m-press m-focus" style={s(estilo)}>
        <Icon name={copiado ? "check" : "copy"} size={18} />
        {copiado ? "Código copiado" : "Copiar código Pix"}
      </button>
    );
    const img = (tam: number | "metade") => p.qrCode && (
      // eslint-disable-next-line @next/next/no-img-element -- é um data URL do provedor, não um arquivo nosso
      <img src={p.qrCode} alt="QR Code do Pix" width={tam === "metade" ? 270 : tam} height={tam === "metade" ? 270 : tam}
        style={s(`border:1px solid var(--border);border-radius:var(--r-painel);background:#fff;padding:8px;flex:none;box-sizing:border-box${tam === "metade" ? ";width:100%;height:auto;aspect-ratio:1" : ""}`)} />
    );
    /* A única instrução que ficou (09/10/2026, Bruno): COMO pagar, não o passo a passo. */
    const instrucao = (texto: string, classe: string) => (
      <p className={classe} style={s("margin:0;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>{texto}</p>
    );

    pagamento = (
      <>
        {aceitaCartao && (
          <div role="tablist" aria-label="Forma de pagamento" style={s(`display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border:1px solid var(--border);border-radius:var(--r-controle);background:var(--bg);max-width:${COLUNA}px`)}>
            {(["pix", "cartao"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={metodo === m} onClick={() => setMetodo(m)} className="m-focus" style={s(`height:42px;border:none;border-radius:var(--r-painel);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;background:${metodo === m ? "var(--surface)" : "transparent"};color:${metodo === m ? "var(--ink)" : "var(--muted)"};box-shadow:${metodo === m ? "0 0 0 1px var(--border)" : "none"}`)}>
                {m === "pix" ? "Pix" : "Cartão"}
              </button>
            ))}
          </div>
        )}

        {metodo === "cartao" && aceitaCartao ? (
          <div style={s(`display:flex;flex-direction:column;gap:10px;max-width:${COLUNA}px`)}>
            <button type="button" onClick={() => pagarNoCartao(p.plano)} disabled={indoCartao} className="m-hov-primary m-press m-focus" style={s(primario(indoCartao))}>
              {indoCartao ? "Abrindo…" : `Pagar ${reais(p.valor)} no cartão`}
            </button>
            {falhaCartao && <p role="alert" style={s("margin:0;font-size:var(--t-label);color:var(--danger)")}>O cartão não abriu agora. Tente de novo, ou pague por Pix.</p>}
          </div>
        ) : (
          <>
            {/* Desktop: o QR é o protagonista, o celular do lado é a câmera. QR sob "Pix", botão sob
                "Cartão": as duas metades do toggle continuam embaixo dele. */}
            {instrucao("Pague com o QR Code ou com o Pix Copia e Cola", "pg-desk")}
            <div className="pg-duas" style={{ maxWidth: COLUNA }}>
              {img("metade")}
              <div style={{ padding: "0 0 0 18px" }}>{botaoCopiar(secundario)}</div>
            </div>
            {/* Celular: ninguém escaneia a própria tela. Copiar primeiro; o QR, para outro aparelho. */}
            <div className="pg-cel" style={{ flexDirection: "column", gap: 12 }}>
              {instrucao("Pague com Pix Copia e Cola ou QR\u00a0Code", "")}
              {botaoCopiar(primario(false))}
              {p.qrCode && (
                <details>
                  <summary className="m-focus" style={s("cursor:pointer;font-size:var(--t-sm);color:var(--primary);font-weight:var(--w-title)")}>Mostrar QR Code</summary>
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>{img(180)}</div>
                </details>
              )}
            </div>
            {semClipboard && p.copiaECola && (
              <textarea readOnly value={p.copiaECola} rows={3} autoFocus onFocus={(e) => e.currentTarget.select()} aria-label="Código Pix" style={s("width:100%;max-width:520px;resize:none;border:1px solid var(--border);border-radius:var(--r-controle);padding:10px 12px;font-size:var(--t-micro);color:var(--muted);background:var(--bg);line-height:1.4")} />
            )}
            <span aria-live="polite" style={s("display:flex;align-items:center;gap:9px;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink-800)")}>
              <span aria-hidden style={{ ...s("width:9px;height:9px;border-radius:50%;background:var(--primary);flex:none"), animation: "mpulse 1.4s ease-in-out infinite" }} />
              Esperando o pagamento
            </span>
          </>
        )}
      </>
    );
  }

  const cinza = "oklch(0.82 0.03 262)";
  return (
    <main className="pg">
      <style>{CSS}</style>

      <section className="pg-navy">
        <span style={s("font-size:var(--t-lg);font-weight:var(--w-emph);color:var(--warm);line-height:1")}>maisa</span>
        {leitura.fase === "ok" && (
          <div>
            <div style={{ ...s("font-size:var(--t-sm)"), color: cinza }}>Plano {plano?.nome ?? "maisa"}</div>
            <div style={s("margin-top:8px;font-size:var(--t-data);font-weight:var(--w-emph);line-height:1;font-variant-numeric:tabular-nums")}>
              {reais(leitura.p.valor)}<span style={{ ...s("font-size:var(--t-sm);font-weight:var(--w-data)"), color: cinza }}> /mês</span>
            </div>
            <div style={{ ...s("margin-top:10px;font-size:var(--t-label)"), color: cinza }}>Recebedor: <strong style={s("color:#fff;font-weight:var(--w-title)")}>Poli Júnior</strong></div>
          </div>
        )}
        {plano && (
          <div className="pg-specs" style={{ ...s("padding-top:20px;border-top:1px solid var(--nav-line);font-size:var(--t-sm)"), color: "oklch(0.86 0.02 262)" }}>
            {[...plano.specs, { rotulo: "Fidelidade", valor: "nenhuma" }].map((sp) => (
              <div key={sp.rotulo} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span>{sp.rotulo}</span>
                <strong style={s("color:#fff;font-weight:var(--w-data);font-variant-numeric:tabular-nums;white-space:nowrap")}>{sp.valor}</strong>
              </div>
            ))}
          </div>
        )}
        {/* No desktop, o teste mora no navy, longe do botão de pagar. */}
        <div className="pg-desk" style={s("margin-top:auto;padding:16px 18px;border:1px solid var(--nav-line);border-radius:var(--r-painel);color:var(--warm)")}>{saida}</div>
      </section>

      <section className="pg-pag m-enter">
        {pendente && <h1 className="pg-desk" style={s("margin:0;font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Pagamento</h1>}
        {pagamento}
        <div className="pg-cel" style={s("color:var(--muted);padding-top:12px;border-top:1px solid var(--line)")}>{saida}</div>
        <div style={{ marginTop: "auto", paddingTop: 12 }}><LinhaLegal /></div>
      </section>
    </main>
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
