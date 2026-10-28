"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS NA TELA (27/10/2026) — o cliente pagando o negócio pelo Pix na chave de sempre.
 *
 * Três peças, cada uma onde o dono já olha:
 *   · `PagamentosParaDecidir` — na coluna "Precisa de você" da tela de hoje: o atendimento que
 *     acabou e espera "já está pago?", e o comprovante que o cliente mandou, esperando o dono
 *     conferir no extrato. Sem nada esperando, não desenha nada;
 *   · `AjustesDeRecebimentos` — em A MAISA → Receber por Pix: a chave, o nome, a cidade e o que
 *     fazer depois de cada atendimento;
 *   · `mandarPixDoAtendimento` — o "Mandar Pix" da gaveta do atendimento: manda o Pix dele, ou o
 *     mesmo de novo.
 *
 * Cada uma lê `/api/recebimentos` sozinha, como o lote do Receita Saúde: é dado que só elas usam,
 * e o store não precisa carregar isso para quem não liga o Pix.
 *
 * ⚠️ NADA AQUI DÁ BAIXA SOZINHO. "Confirmar" é o dono dizendo que viu o dinheiro no extrato; a
 * tela só põe o que a MAISA leu ao lado, para ele comparar.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Btn, Estado, toast } from "@/ui/primitivos";
import { mensagemDaFalha } from "@/ui/falhas";
import { TIPOS_DE_CHAVE, tipoProvavel, type TipoDeChavePix } from "@/nucleo/dominio/pix";
import type { ComprovanteDePagamento, Conferencia, DepoisDoAtendimento, Recebimento } from "@/nucleo/dominio/recebimentos";
import { chaveDe } from "@/nucleo/dominio/contatos";
import type { DocumentoDoPagamento, PainelDeRecebimentos } from "@/nucleo/portas/entrada/casos-de-uso";

const CAMPO =
  "font-family:inherit;font-size:var(--t-sm);padding:10px 12px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--bg);color:var(--ink);width:100%;box-sizing:border-box";
const ROTULO = "display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)";
const CARTAO = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--bg);padding:14px;display:flex;flex-direction:column;gap:10px";

const reais = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);
const diaMes = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);

const NOME_DO_TIPO: Record<TipoDeChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  telefone: "Celular",
  email: "E-mail",
  aleatoria: "Chave aleatória",
};

const DEPOIS: { valor: DepoisDoAtendimento; titulo: string; desc: string }[] = [
  { valor: "perguntar", titulo: "Me perguntar se já pagou", desc: "Quando o atendimento acaba, a MAISA pergunta. Se ainda não pagou, ela manda o Pix." },
  { valor: "direto", titulo: "Mandar o Pix direto", desc: "Quando o atendimento acaba, o cliente recebe o Pix com o valor certo." },
  { valor: "desligado", titulo: "Não mandar sozinha", desc: "O Pix só sai quando você aperta \"Mandar Pix\" no atendimento." },
];

/** O que aconteceu com o documento, na frase do aviso. */
export function fraseDoDocumento(d: DocumentoDoPagamento): string {
  switch (d.tipo) {
    case "recibo": return "Pago. O recibo foi pedido à Receita.";
    case "nota": return "Pago. A nota fiscal foi pedida.";
    case "pediu_cpf": return "Pago. Pedi o CPF ao cliente: o documento sai quando ele mandar.";
    case "falhou": return `Pago, mas o documento não saiu: ${d.motivo}`;
    default: return "Pago.";
  }
}

const SELO: Record<Conferencia, { forma: "disco" | "triangulo" | "anel"; tom: "success" | "warn" | "neutral"; texto: string }> = {
  confere: { forma: "disco", tom: "success", texto: "Recebedor confere" },
  nao_confere: { forma: "triangulo", tom: "warn", texto: "Recebedor não confere" },
  sem_como_saber: { forma: "anel", tom: "neutral", texto: "Confira no extrato" },
};

/* ───────────────────────────── a leitura ───────────────────────────── */

type Painel = PainelDeRecebimentos;

/** Lê o painel, de novo a cada minuto e ao voltar para a aba. Sem sessão (demo), fica `null`. */
function usePainel() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/recebimentos", { cache: "no-store" }).then((x) => x.json());
      if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui ler os recebimentos."));
      setPainel(r as Painel);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler os recebimentos.");
    }
  }, []);
  useEffect(() => {
    ler();
    const vez = setInterval(ler, 60_000);
    const aoVoltar = () => { if (document.visibilityState === "visible") ler(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(vez); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [ler]);
  return { painel, erro, ler };
}

async function postar(url: string, corpo: unknown, padrao: string) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((x) => x.json());
  if (!r?.ok) throw new Error(mensagemDaFalha(r, padrao));
  return r;
}

/* ───────────────────────────── o que espera o dono ───────────────────────────── */

export function PagamentosParaDecidir() {
  const { painel, ler } = usePainel();
  if (!painel || (!painel.paraDecidir.length && !painel.comprovantes.length)) return null;
  return (
    <section aria-label="Pagamentos" style={s("display:flex;flex-direction:column;gap:10px")}>
      <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-body);font-weight:var(--w-title)")}>
        Pagamentos
        <span className="n" style={s("font-weight:var(--w-data);color:var(--warn)")}>{painel.paraDecidir.length + painel.comprovantes.length}</span>
      </span>
      {painel.comprovantes.map((c) => (
        <CartaoDoComprovante key={c.id} c={c} abertos={painel.abertos} depois={ler} />
      ))}
      {painel.paraDecidir.map((r) => (
        <CartaoDaPergunta key={r.id} r={r} depois={ler} />
      ))}
    </section>
  );
}

function CartaoDaPergunta({ r, depois }: { r: Recebimento; depois: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const decidir = async (decisao: "pagou" | "pix" | "nao_cobrar") => {
    setOcupado(true);
    try {
      const resp = await postar("/api/recebimentos/decidir", { id: r.id, decisao }, "Não consegui registrar.");
      toast(decisao === "pix" ? "O Pix vai para o cliente agora." : decisao === "nao_cobrar" ? "Sem cobrança para este atendimento." : fraseDoDocumento(resp.documento));
      depois();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div style={s(CARTAO)}>
      <span style={s("display:flex;flex-direction:column;gap:3px")}>
        <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{r.nome?.trim() || r.telefone}</span>
        <span style={s("font-size:var(--t-label);color:var(--muted)")}>{r.descricao} · {reais(r.valor)}</span>
      </span>
      <span style={s("font-size:var(--t-sm)")}>Já está pago?</span>
      <div style={s("display:flex;gap:8px;flex-wrap:wrap")}>
        <Btn size="sm" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
        <Btn size="sm" variant="secondary" disabled={ocupado} onClick={() => decidir("pix")}>Mandar Pix</Btn>
        <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir("nao_cobrar")}>Não cobrar</Btn>
      </div>
    </div>
  );
}

function CartaoDoComprovante({ c, abertos, depois }: { c: ComprovanteDePagamento; abertos: Recebimento[]; depois: () => void }) {
  /* As cobranças em aberto deste telefone: se a MAISA não achou qual o comprovante paga, o dono
   * escolhe entre elas. */
  const doTelefone = abertos.filter((r) => chaveDe(r.telefone) === chaveDe(c.telefone));
  const [alvo, setAlvo] = useState(c.recebimentoId ?? doTelefone[0]?.id ?? "");
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const selo = SELO[c.conferencia];

  const agir = async (corpo: Record<string, unknown>, ok: (r: { documento?: DocumentoDoPagamento }) => string) => {
    setOcupado(true);
    try {
      const r = await postar("/api/recebimentos/comprovante", { id: c.id, ...corpo }, "Não consegui registrar.");
      toast(ok(r));
      depois();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setOcupado(false);
    }
  };

  const detalhes = [c.banco, diaMes(c.pagoEm), c.recebedorNome ? `para ${c.recebedorNome}` : null].filter(Boolean).join(" · ");

  return (
    <div style={s(CARTAO)}>
      <span style={s("display:flex;align-items:center;gap:10px")}>
        <span style={s("flex:1;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title)")}>
          {(c.nome?.trim() || c.telefone)} mandou um comprovante de {reais(c.valor)}
        </span>
        <Estado forma={selo.forma} tom={selo.tom}>{selo.texto}</Estado>
      </span>
      {detalhes && <span style={s("font-size:var(--t-label);color:var(--muted)")}>{detalhes}</span>}
      {c.conferencia === "nao_confere" && (
        <span style={s("font-size:var(--t-label);color:var(--warn)")}>
          No comprovante, quem recebeu não parece ser você. Confira no extrato antes de confirmar.
        </span>
      )}
      {!c.recebimentoId && doTelefone.length > 1 && (
        <label style={s(ROTULO)}>
          Qual cobrança ele paga?
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)} className="n m-focus" style={s(CAMPO)}>
            {doTelefone.map((r) => <option key={r.id} value={r.id}>{r.descricao} · {reais(r.valor)}</option>)}
          </select>
        </label>
      )}
      {!descartando ? (
        <div style={s("display:flex;gap:8px;flex-wrap:wrap")}>
          <Btn
            size="sm"
            disabled={ocupado || !alvo}
            motivo="Este telefone não tem cobrança em aberto: descarte, ou mande o Pix primeiro."
            onClick={() => agir({ acao: "confirmar", recebimentoId: alvo }, (r) => fraseDoDocumento(r.documento ?? { tipo: "nenhum" }))}
          >
            Vi no extrato, confirmar
          </Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setDescartando(true)}>Descartar</Btn>
        </div>
      ) : (
        <div style={s("display:grid;gap:8px")}>
          <label style={s(ROTULO)}>
            Por que descartar? Fica anotado, para quando você procurar.
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Escreva o motivo…"
              className="n m-focus"
              style={s(CAMPO)}
            />
          </label>
          <div style={s("display:flex;gap:8px;flex-wrap:wrap")}>
            <Btn size="sm" variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => agir({ acao: "descartar", motivo }, () => "Comprovante descartado.")}>
              Descartar
            </Btn>
            <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setDescartando(false)}>Voltar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── os ajustes ───────────────────────────── */

export function AjustesDeRecebimentos() {
  const { painel, erro, ler } = usePainel();
  const [tipo, setTipo] = useState<TipoDeChavePix | "">("");
  const [chave, setChave] = useState("");
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [depois, setDepois] = useState<DepoisDoAtendimento>("perguntar");
  const [lido, setLido] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  /* Preenche uma vez, com o que está gravado. Depois disso o formulário é do dono. */
  useEffect(() => {
    if (!painel || lido) return;
    const c = painel.config;
    setTipo(c.tipoDaChave ?? "");
    setChave(c.chave ?? "");
    setNome(c.nome ?? "");
    setCidade(c.cidade ?? "");
    setDepois(c.chave ? c.depoisDoAtendimento : "perguntar");
    setLido(true);
  }, [painel, lido]);

  if (!painel) {
    return erro
      ? <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{erro}</span>
      : <span style={s("font-size:var(--t-sm);color:var(--muted)")}>Lendo…</span>;
  }

  const colar = (v: string) => {
    setChave(v);
    /* Sugere o tipo ao colar, sem escolher por cima de quem já escolheu. Onze dígitos que podem
     * ser CPF ou celular ficam sem sugestão: ver `tipoProvavel`. */
    if (!tipo) {
      const provavel = tipoProvavel(v);
      if (provavel) setTipo(provavel);
    }
  };

  const salvar = async (desligar = false) => {
    setOcupado(true);
    try {
      const r = await fetch("/api/recebimentos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(desligar
          ? { tipoDaChave: null, chave: null, nome: null, cidade: null, depoisDoAtendimento: "desligado" }
          : { tipoDaChave: tipo || null, chave, nome, cidade, depoisDoAtendimento: depois }),
      }).then((x) => x.json());
      if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui salvar."));
      setLido(false);
      toast(desligar ? "O Pix foi desligado." : "Pronto: a MAISA já pode mandar o Pix.");
      ler();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setOcupado(false);
    }
  };

  const ligado = Boolean(painel.config.chave);

  return (
    <div style={s("display:flex;flex-direction:column;gap:14px")}>
      <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-ui)")}>
        O cliente recebe um Pix com o valor certo, e o dinheiro cai direto na sua conta. Quando ele mandar o
        comprovante, você confere no extrato e confirma em Hoje. Aí sai o recibo ou a nota, se a MAISA já emite
        para você.
      </span>

      <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
        <label style={s(`${ROTULO};flex:1;min-width:150px`)}>
          Tipo da chave
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeChavePix | "")} className="n m-focus" style={s(CAMPO)}>
            <option value="">Escolha…</option>
            {TIPOS_DE_CHAVE.map((t) => <option key={t} value={t}>{NOME_DO_TIPO[t]}</option>)}
          </select>
        </label>
        <label style={s(`${ROTULO};flex:2;min-width:200px`)}>
          Sua chave Pix
          <input value={chave} onChange={(e) => colar(e.target.value)} placeholder="Cole a chave como está no banco…" className="n m-focus" style={s(CAMPO)} />
        </label>
      </div>

      <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
        <label style={s(`${ROTULO};flex:2;min-width:200px`)}>
          Nome de quem recebe
          <input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} placeholder="Como aparece no banco…" className="n m-focus" style={s(CAMPO)} />
        </label>
        <label style={s(`${ROTULO};flex:1;min-width:130px`)}>
          Cidade
          <input value={cidade} maxLength={30} onChange={(e) => setCidade(e.target.value)} placeholder="Opcional…" className="n m-focus" style={s(CAMPO)} />
        </label>
      </div>

      <fieldset style={s("border:none;margin:0;padding:0;display:grid;gap:8px")}>
        <legend style={s("font-size:var(--t-label);color:var(--muted);margin-bottom:6px")}>Quando o atendimento acaba</legend>
        {DEPOIS.map((o) => (
          <label key={o.valor} style={s(`display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--r-controle);border:1px solid ${depois === o.valor ? "var(--primary)" : "var(--border)"};cursor:pointer`)}>
            <input type="radio" name="depois-do-atendimento" checked={depois === o.valor} onChange={() => setDepois(o.valor)} style={s("margin-top:3px")} />
            <span style={s("display:grid;gap:2px")}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{o.titulo}</span>
              <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>{o.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {depois === "perguntar" && (
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>
          A pergunta vai para o número que recebe os avisos (A MAISA → WhatsApp e número), e você responde 1 ou 2.
          Sem esse número, ela aparece só aqui no painel, em Hoje.
        </span>
      )}

      <div style={s("display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        <Btn disabled={ocupado || !chave.trim()} motivo="Cole a sua chave Pix primeiro." onClick={() => salvar()}>
          {ligado ? "Salvar" : "Ligar o Pix"}
        </Btn>
        {ligado && <Btn variant="ghost" disabled={ocupado} onClick={() => salvar(true)}>Desligar</Btn>}
      </div>
    </div>
  );
}

/* ───────────────────────────── no atendimento ───────────────────────────── */

/** Manda o Pix do atendimento e diz o que aconteceu. É o "Mandar Pix" da gaveta (`detalhe.tsx`). */
export async function mandarPixDoAtendimento(maisaAg: string): Promise<void> {
  try {
    await postar("/api/recebimentos/pix", { maisaAg }, "Não consegui mandar o Pix.");
    toast("O Pix vai para o cliente agora.");
  } catch (e) {
    toast(e instanceof Error ? e.message : "Não consegui mandar o Pix.");
  }
}
