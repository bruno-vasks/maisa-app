"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS NA TELA (27/10/2026) — o cliente pagando o negócio pelo Pix na chave de sempre.
 *
 * As peças, e onde cada uma aparece:
 *   · a aba Recebimentos (`telas/Recebimentos.tsx`, 28/10/2026: Bruno, "importante o suficiente
 *     para virar uma aba nova") desenha as próprias linhas, em forma de extrato, e usa daqui as
 *     ações (`useDecisao`, `useComprovante`), o "⋯" (`MaisAcoes`), os ajustes e o Asaas;
 *   · `PagamentosParaDecidir` — também na coluna "Precisa de você" da tela de hoje: o atendimento
 *     que acabou e espera "já está pago?", o comprovante que o cliente mandou e o Pix sem pagamento
 *     há um dia. Sem nada esperando, não desenha nada;
 *   · `mandarPixDoAtendimento` — o "Mandar Pix" da gaveta do atendimento: manda o Pix dele, ou o
 *     mesmo de novo.
 *
 * Cada uma lê `/api/recebimentos` sozinha, como o lote do Receita Saúde: é dado que só elas usam,
 * e o store não precisa carregar isso para quem não liga o Pix.
 *
 * ⚠️ NADA AQUI DÁ BAIXA SOZINHO. "Confirmar" é o dono dizendo que viu o dinheiro no extrato; a
 * tela só põe o que a MAISA leu ao lado, para ele comparar.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { s, Btn, Estado, IconBtn, toast } from "@/ui/primitivos";
import { mensagemDaFalha } from "@/ui/falhas";
import { TIPOS_DE_CHAVE, tipoProvavel, type TipoDeChavePix } from "@/nucleo/dominio/pix";
import { conferirCodigoDoPix, type ComprovanteDePagamento, type DepoisDoAtendimento, type Recebimento } from "@/nucleo/dominio/recebimentos";
import { chaveDe } from "@/nucleo/dominio/contatos";
import { telefoneBonito } from "@/nucleo/dominio/clientes";
import type { DocumentoDoPagamento, PainelDeRecebimentos } from "@/nucleo/portas/entrada/casos-de-uso";
import type { ContaDeRecebimentos } from "@/nucleo/portas/saida/provedor-de-recebimentos";

const CAMPO =
  "font-family:inherit;font-size:var(--t-sm);padding:10px 12px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--bg);color:var(--ink);width:100%;box-sizing:border-box";
const ROTULO = "display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)";
const CARTAO = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--bg);padding:14px;display:flex;flex-direction:column;gap:10px";

const reais = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);

const NOME_DO_TIPO: Record<TipoDeChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  telefone: "Celular",
  email: "E-mail",
  aleatoria: "Chave aleatória",
};

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

/* ───────────────────────────── a leitura ───────────────────────────── */

export type Painel = PainelDeRecebimentos;

/** Lê o painel, de novo a cada minuto e ao voltar para a aba. Sem sessão (demo), fica `null`. */
export function usePainel() {
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

/** "Já pagou", "Mandar o Pix" e "Não cobrar" de uma cobrança. `aberto`: o Pix já foi, e o aviso
 *  diz "de novo" em vez de "agora". Os cartões de Hoje e as linhas da aba usam o mesmo. */
export function useDecisao(id: string, aberto: boolean, depois: () => void) {
  const [ocupado, setOcupado] = useState(false);
  const decidir = async (decisao: "pagou" | "pix" | "nao_cobrar") => {
    setOcupado(true);
    try {
      const resp = await postar("/api/recebimentos/decidir", { id, decisao }, "Não consegui registrar.");
      toast(decisao === "pix"
        ? (aberto ? "A cobrança vai de novo para o cliente." : "O Pix vai para o cliente agora.")
        : decisao === "nao_cobrar"
          ? (aberto ? "Cobrança cancelada." : "Sem cobrança para este atendimento.")
          : fraseDoDocumento(resp.documento));
      depois();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, decidir };
}

/** Confirmar ou descartar um comprovante. */
export function useComprovante(id: string, depois: () => void) {
  const [ocupado, setOcupado] = useState(false);
  const agir = async (corpo: Record<string, unknown>, ok: (r: { documento?: DocumentoDoPagamento }) => string) => {
    setOcupado(true);
    try {
      const r = await postar("/api/recebimentos/comprovante", { id, ...corpo }, "Não consegui registrar.");
      toast(ok(r));
      depois();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, agir };
}

/**
 * O "⋯" de um item: as ações que não são a principal nem a do lado (versão A, 04/11/2026: um botão
 * com o verbo, um discreto, e o resto aqui). Fecha ao clicar fora, no Esc e ao escolher.
 */
export function MaisAcoes({ acoes, disabled, abreParaEsquerda }: {
  acoes: { label: string; onClick: () => void }[];
  disabled?: boolean;
  /** O "⋯" encostado na borda direita (a coluna de Hoje): o menu cresce para dentro, senão a borda o corta. */
  abreParaEsquerda?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  if (!acoes.length) return null;
  return (
    <span ref={caixa} style={s("position:relative;display:inline-flex")}>
      <IconBtn icon="dots" title="Mais ações" disabled={disabled} onClick={() => setAberto((x) => !x)} />
      {aberto && (
        <div
          role="menu"
          className="m-reveal"
          style={s(`position:absolute;${abreParaEsquerda ? "right:0" : "left:0"};top:calc(100% + 6px);z-index:5;min-width:200px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-pop);padding:6px;display:flex;flex-direction:column`)}
        >
          {acoes.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => { setAberto(false); a.onClick(); }}
              className="m-hov-bg m-focus"
              style={s("text-align:left;border:none;background:transparent;padding:9px 10px;border-radius:var(--r-controle);font-family:inherit;font-size:var(--t-sm);color:var(--ink);cursor:pointer;white-space:nowrap")}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ───────────────────────────── o que espera o dono ───────────────────────────── */

const DIA_MS = 24 * 60 * 60_000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Há quantos dias o Pix foi e não voltou pago, em dias do calendário. 0 enquanto não passou um dia
 * inteiro: até lá não há o que cobrar. A aba e a coluna de Hoje contam igual.
 */
export function diasSemPagar(iso: string): number {
  if (Date.now() - Date.parse(iso) <= DIA_MS) return 0;
  return Math.max(1, Math.round((inicioDoDia(new Date()) - inicioDoDia(new Date(iso))) / DIA_MS));
}

/**
 * A coluna "Precisa de você" de Hoje: os mesmos itens da aba, com os mesmos botões (versão A,
 * 04/11/2026). O comprovante, o "já está pago?" e o Pix há mais de um dia sem pagamento, que vem
 * para cá sozinho. O Pix que já tem comprovante esperando não entra de novo como atrasado: o
 * comprovante é o item, e ele já está aqui.
 */
export function PagamentosParaDecidir() {
  const { painel, ler } = usePainel();
  const comComprovante = new Set((painel?.comprovantes ?? []).map((c) => c.recebimentoId));
  const atrasados = (painel?.abertos ?? []).filter((r) => diasSemPagar(r.criadoEm) > 0 && !comComprovante.has(r.id));
  if (!painel || (!painel.paraDecidir.length && !painel.comprovantes.length && !atrasados.length)) return null;
  return (
    <section aria-label="Pagamentos" style={s("display:flex;flex-direction:column;gap:10px")}>
      <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-body);font-weight:var(--w-title)")}>
        Pagamentos
        <span className="n" style={s("font-weight:var(--w-data);color:var(--warn)")}>{painel.paraDecidir.length + painel.comprovantes.length + atrasados.length}</span>
      </span>
      {painel.comprovantes.map((c) => (
        <CartaoDoComprovante key={c.id} c={c} abertos={painel.abertos} depois={ler} />
      ))}
      {painel.paraDecidir.map((r) => (
        <CartaoDaPergunta key={r.id} r={r} depois={ler} />
      ))}
      {atrasados.map((r) => (
        <CartaoDoAberto key={r.id} r={r} depois={ler} />
      ))}
    </section>
  );
}

/**
 * O topo do cartão: a frase e o valor na mesma linha, como na lista da aba. Sem a linha cinza
 * embaixo (Bruno, 04/11/2026, de novo: *"não gostei dos subtítulos, não acho que faz sentido"*):
 * o que ela dizia (o serviço, o banco, a data) mora na aba, e aqui não muda o que o dono faz.
 */
function Topo({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <span style={s("display:flex;align-items:baseline;gap:12px")}>
      <span style={s("flex:1;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title);line-height:var(--lh-ui)")}>{titulo}</span>
      {valor != null && <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap")}>{reais(valor)}</span>}
    </span>
  );
}

const AVISO = "font-size:var(--t-label);color:var(--warn);line-height:var(--lh-ui)";
const BOTOES = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";

/**
 * O Pix que foi e não voltou pago. Sem esta saída ele ficava em aberto para sempre: a sessão fora do
 * recibo automático, e toda imagem desse cliente indo para o leitor.
 */
export function CartaoDoAberto({ r, depois }: { r: Recebimento; depois: () => void }) {
  const { ocupado, decidir } = useDecisao(r.id, true, depois);
  const dias = diasSemPagar(r.criadoEm);
  return (
    <div style={s(CARTAO)}>
      <Topo titulo={`${r.nome?.trim() || telefoneBonito(r.telefone)} está há ${plural(dias, "dia", "dias")} sem pagar`} valor={r.valor} />
      <div style={s(BOTOES)}>
        <Btn size="sm" disabled={ocupado} onClick={() => decidir("pix")}>Mandar de novo</Btn>
        <Btn size="sm" variant="secondary" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
        <span style={s("margin-left:auto")}><MaisAcoes abreParaEsquerda disabled={ocupado} acoes={[{ label: "Não cobrar", onClick: () => decidir("nao_cobrar") }]} /></span>
      </div>
    </div>
  );
}

export function CartaoDaPergunta({ r, depois }: { r: Recebimento; depois: () => void }) {
  const { ocupado, decidir } = useDecisao(r.id, false, depois);
  return (
    <div style={s(CARTAO)}>
      <Topo titulo={`${r.nome?.trim() || telefoneBonito(r.telefone)}: já está pago?`} valor={r.valor} />
      <div style={s(BOTOES)}>
        <Btn size="sm" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
        <Btn size="sm" variant="secondary" disabled={ocupado} onClick={() => decidir("pix")}>Mandar Pix</Btn>
        <span style={s("margin-left:auto")}><MaisAcoes abreParaEsquerda disabled={ocupado} acoes={[{ label: "Não cobrar", onClick: () => decidir("nao_cobrar") }]} /></span>
      </div>
    </div>
  );
}

/**
 * O comprovante na coluna estreita: sem a linha do extrato da aba, então a frase do extrato fica
 * colada no botão (nenhum pagamento é confirmado só pela imagem). Do que a MAISA conferiu, só o
 * que não bate aparece, em âmbar; o que confere não muda o que o dono faz.
 */
export function CartaoDoComprovante({ c, abertos, depois }: { c: ComprovanteDePagamento; abertos: Recebimento[]; depois: () => void }) {
  /* As cobranças em aberto deste telefone, a mais antiga primeiro: com mais de uma, a data separa
   * uma da outra, e o dono escolhe qual o comprovante paga. */
  const doTelefone = abertos.filter((r) => chaveDe(r.telefone) === chaveDe(c.telefone)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const [alvo, setAlvo] = useState(c.recebimentoId ?? doTelefone[0]?.id ?? "");
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { ocupado, agir } = useComprovante(c.id, depois);
  const cobranca = doTelefone.find((r) => r.id === alvo) ?? null;
  const valorDiferente = c.valor != null && cobranca != null && Math.abs(c.valor - cobranca.valor) >= 0.01;
  const codigo = conferirCodigoDoPix(c, { recebidoEm: c.criadoEm, cobrancaEnviadaEm: cobranca?.criadoEm ?? null });

  return (
    <div style={s(CARTAO)}>
      <Topo titulo={`${c.nome?.trim() || telefoneBonito(c.telefone)} mandou um comprovante`} valor={c.valor} />
      {c.conferencia === "nao_confere" && <span style={s(AVISO)}>No comprovante, quem recebeu não parece ser você.</span>}
      {codigo.motivos.map((m) => <span key={m} style={s(AVISO)}>{m}</span>)}
      {valorDiferente && <span style={s(AVISO)}>O comprovante diz {reais(c.valor)}, e a cobrança é de {reais(cobranca!.valor)}.</span>}
      {doTelefone.length > 1 && (
        <label style={s(ROTULO)}>
          Paga
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)} className="n m-focus" style={s(CAMPO)}>
            {doTelefone.map((r) => <option key={r.id} value={r.id}>{r.descricao} · {reais(r.valor)}</option>)}
          </select>
        </label>
      )}
      {!descartando ? (
        <>
          <span style={s("font-size:var(--t-label);color:var(--ink)")}>Veja no extrato do banco se o dinheiro entrou.</span>
          <div style={s(BOTOES)}>
            <Btn
              size="sm"
              disabled={ocupado || !alvo}
              motivo="Este telefone não tem cobrança em aberto: marque que não entrou, ou mande o Pix primeiro."
              onClick={() => agir({ acao: "confirmar", recebimentoId: alvo }, (r) => fraseDoDocumento(r.documento ?? { tipo: "nenhum" }))}
            >
              Confirmar pagamento
            </Btn>
            <Btn size="sm" variant="secondary" disabled={ocupado} onClick={() => setDescartando(true)}>Não entrou</Btn>
          </div>
        </>
      ) : (
        <div style={s("display:grid;gap:8px")}>
          <label style={s(ROTULO)}>
            O que aconteceu? Fica anotado.
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escreva o motivo…" className="n m-focus" style={s(CAMPO)} />
          </label>
          <div style={s(BOTOES)}>
            <Btn size="sm" variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => agir({ acao: "descartar", motivo }, () => "Anotei que o dinheiro não entrou.")}>
              Confirmar que não entrou
            </Btn>
            <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setDescartando(false)}>Voltar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── os ajustes ───────────────────────────── */

/** "Celular (11) 98765-4321": a chave como o dono a reconhece, sem o +55 colado. */
export const chaveNaTela = (tipo: TipoDeChavePix | null, chave: string | null) =>
  `${tipo ? `${NOME_CURTO_DO_TIPO[tipo]} ` : ""}${tipo === "telefone" ? telefoneBonito(chave) : (chave ?? "")}`;

const NOME_CURTO_DO_TIPO: Record<TipoDeChavePix, string> = { ...NOME_DO_TIPO, aleatoria: "Chave" };

/* As descrições ficam só onde dizem o que o título não diz (Bruno, 04/11/2026: nada de texto que
   repete o que a tela já mostra). */
const DEPOIS: { valor: DepoisDoAtendimento; titulo: string; desc?: string }[] = [
  { valor: "perguntar", titulo: "Me perguntar se já pagou", desc: "Se ainda não pagou, eu mando o Pix." },
  { valor: "direto", titulo: "Mandar o Pix direto" },
  { valor: "desligado", titulo: "Não mandar sozinha", desc: "O Pix só sai quando você aperta \"Mandar Pix\" no atendimento." },
];

type CamposDoPix = { tipo: TipoDeChavePix | ""; chave: string; nome: string; cidade: string };
const camposDe = (c: Painel["config"]): CamposDoPix => ({ tipo: c.tipoDaChave ?? "", chave: c.chave ?? "", nome: c.nome ?? "", cidade: c.cidade ?? "" });

/** Grava a configuração inteira: a rota recebe tudo junto, então cada bloco manda o que não mexeu também. */
async function gravarPix(corpo: { tipoDaChave: TipoDeChavePix | null; chave: string | null; nome: string | null; cidade: string | null; depoisDoAtendimento: DepoisDoAtendimento }) {
  const r = await fetch("/api/recebimentos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((x) => x.json());
  if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui salvar."));
}

/** O tipo, a chave, o nome e a cidade. O tipo provável só é sugerido ao colar, sem escolher por cima. */
function CamposDaChave({ v, mudar }: { v: CamposDoPix; mudar: (p: Partial<CamposDoPix>) => void }) {
  const colar = (chave: string) => {
    /* Onze dígitos que podem ser CPF ou celular ficam sem sugestão: ver `tipoProvavel`. */
    const provavel = v.tipo ? null : tipoProvavel(chave);
    mudar(provavel ? { chave, tipo: provavel } : { chave });
  };
  return (
    <>
      <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
        <label style={s(`${ROTULO};flex:1;min-width:150px`)}>
          Tipo da chave
          <select value={v.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoDeChavePix | "" })} className="n m-focus" style={s(CAMPO)}>
            <option value="">Escolha…</option>
            {TIPOS_DE_CHAVE.map((t) => <option key={t} value={t}>{NOME_DO_TIPO[t]}</option>)}
          </select>
        </label>
        <label style={s(`${ROTULO};flex:2;min-width:200px`)}>
          Sua chave Pix
          <input value={v.chave} onChange={(e) => colar(e.target.value)} placeholder="Cole a chave como está no banco…" className="n m-focus" style={s(CAMPO)} />
        </label>
      </div>
      <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
        <label style={s(`${ROTULO};flex:2;min-width:200px`)}>
          Nome de quem recebe
          <input value={v.nome} maxLength={40} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Como aparece no banco…" className="n m-focus" style={s(CAMPO)} />
        </label>
        <label style={s(`${ROTULO};flex:1;min-width:130px`)}>
          Cidade
          <input value={v.cidade} maxLength={30} onChange={(e) => mudar({ cidade: e.target.value })} placeholder="Opcional…" className="n m-focus" style={s(CAMPO)} />
        </label>
      </div>
    </>
  );
}

function OpcoesDoDepois({ depois, mudar }: { depois: DepoisDoAtendimento; mudar: (d: DepoisDoAtendimento) => void }) {
  return (
    <div role="radiogroup" aria-label="Quando o atendimento acaba" style={s("display:grid;gap:8px")}>
      {DEPOIS.map((o) => (
        <label key={o.valor} style={s(`display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--r-controle);border:1px solid ${depois === o.valor ? "var(--primary)" : "var(--border)"};cursor:pointer`)}>
          <input type="radio" name="depois-do-atendimento" checked={depois === o.valor} onChange={() => mudar(o.valor)} style={s("margin-top:3px")} />
          <span style={s("display:grid;gap:2px")}>
            <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{o.titulo}</span>
            {o.desc && <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>{o.desc}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** A primeira vez: a chave e o que fazer quando o atendimento acaba, num formulário só. */
export function FormularioDoPix({ painel, ler }: { painel: Painel; ler: () => void }) {
  const [v, setV] = useState<CamposDoPix>(() => camposDe(painel.config));
  const [depois, setDepois] = useState<DepoisDoAtendimento>(painel.config.chave ? painel.config.depoisDoAtendimento : "perguntar");
  const [ocupado, setOcupado] = useState(false);
  /* Sem a nota "a pergunta vai para o número que recebe os avisos": o Bruno a tirou em 30/10/2026
     ("não precisa"). Para onde a pergunta vai está em `whatsDoDono`. */
  const ligar = async () => {
    setOcupado(true);
    try {
      await gravarPix({ tipoDaChave: v.tipo || null, chave: v.chave, nome: v.nome, cidade: v.cidade, depoisDoAtendimento: depois });
      toast("Pronto: a MAISA já pode mandar o Pix.");
      ler();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div style={s("display:flex;flex-direction:column;gap:14px")}>
      <CamposDaChave v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} />
      <fieldset style={s("border:none;margin:0;padding:0;display:grid;gap:8px")}>
        <legend style={s("font-size:var(--t-label);color:var(--muted);margin-bottom:6px")}>Quando o atendimento acaba</legend>
        <OpcoesDoDepois depois={depois} mudar={setDepois} />
      </fieldset>
      <span><Btn disabled={ocupado || !v.chave.trim()} motivo="Cole a sua chave Pix primeiro." onClick={ligar}>Ligar o Pix</Btn></span>
    </div>
  );
}

/**
 * Os ajustes do Pix ligado (04/11/2026), no mesmo desenho da aba, que o Bruno escolheu numa
 * prévia de três: à esquerda os assuntos, à direita o escolhido, já para editar. Sem a linha de
 * estado embaixo de cada assunto e sem o título repetido no detalhe (*"não precisa dos subtítulos
 * novamente"*): o detalhe mostra o que está gravado, e o assunto marcado na lista diz qual é. No
 * celular, a lista sozinha, e o toque abre o assunto no lugar dela.
 */
const ASSUNTOS = [
  { id: "chave", titulo: "Sua chave Pix" },
  { id: "depois", titulo: "Quando o atendimento acaba" },
] as const;
type Assunto = (typeof ASSUNTOS)[number]["id"];

export function AjustesDoPix({ painel, ler, mobile }: { painel: Painel; ler: () => void; mobile: boolean }) {
  const [escolhido, setEscolhido] = useState<Assunto | null>(mobile ? null : "chave");
  const detalhe = (a: Assunto) => (a === "chave"
    ? <EditarChave key={`chave-${painel.config.chave}`} painel={painel} ler={ler} />
    : <EditarDepois key={`depois-${painel.config.depoisDoAtendimento}`} painel={painel} ler={ler} />);
  const lista = (
    <div style={s("display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);overflow:hidden;flex-shrink:0")}>
      {ASSUNTOS.map((a, k) => {
        const on = a.id === escolhido;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setEscolhido(a.id)}
            aria-current={on ? "true" : undefined}
            className="m-hov-bg m-focus"
            style={s(`border:none;border-left:3px solid ${on ? "var(--primary)" : "transparent"};${k === ASSUNTOS.length - 1 ? "" : "border-bottom:1px solid var(--line);"}display:flex;align-items:center;gap:12px;padding:12px 16px 12px 13px;min-height:56px;text-align:left;font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);cursor:pointer;background:${on ? "var(--primary-soft)" : "transparent"}`)}
          >
            <span style={s("flex:1;min-width:0")}>{a.titulo}</span>
            <span aria-hidden style={s("color:var(--muted)")}>›</span>
          </button>
        );
      })}
    </div>
  );
  const PAINEL_DO_ASSUNTO = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);display:flex;flex-direction:column;gap:14px;min-width:0";

  if (mobile) {
    if (!escolhido) return lista;
    return (
      <div style={s("display:flex;flex-direction:column;gap:10px;flex-shrink:0")}>
        <span><Btn variant="ghost" size="sm" icon="chevron-left" onClick={() => setEscolhido(null)}>{ASSUNTOS.find((a) => a.id === escolhido)!.titulo}</Btn></span>
        <div style={s(`${PAINEL_DO_ASSUNTO};padding:18px`)}>{detalhe(escolhido)}</div>
      </div>
    );
  }
  const atual = escolhido ?? "chave";
  return (
    <div style={s("display:grid;grid-template-columns:minmax(300px,420px) minmax(0,1fr);gap:18px;align-items:start;flex-shrink:0")}>
      {lista}
      <div key={atual} style={s(`${PAINEL_DO_ASSUNTO};padding:24px 26px`)}>{detalhe(atual)}</div>
    </div>
  );
}

/** A chave, editável direto. "Cancelar" só aparece com algo mudado, e volta ao que está gravado. */
function EditarChave({ painel, ler }: { painel: Painel; ler: () => void }) {
  const gravado = camposDe(painel.config);
  const [v, setV] = useState<CamposDoPix>(gravado);
  const [ocupado, setOcupado] = useState(false);
  const mudou = (Object.keys(gravado) as (keyof CamposDoPix)[]).some((k) => v[k] !== gravado[k]);
  const gravar = async (desligar: boolean) => {
    setOcupado(true);
    try {
      await gravarPix(desligar
        ? { tipoDaChave: null, chave: null, nome: null, cidade: null, depoisDoAtendimento: "desligado" }
        : { tipoDaChave: v.tipo || null, chave: v.chave, nome: v.nome, cidade: v.cidade, depoisDoAtendimento: painel.config.depoisDoAtendimento });
      toast(desligar ? "O Pix foi desligado." : "Chave salva.");
      ler();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <>
      <CamposDaChave v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} />
      <div style={s("display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        <Btn disabled={ocupado || !v.chave.trim()} motivo="Cole a sua chave Pix primeiro." onClick={() => gravar(false)}>Salvar a chave</Btn>
        {mudou && <Btn variant="ghost" disabled={ocupado} onClick={() => setV(gravado)}>Cancelar</Btn>}
        <span style={s("margin-left:auto")}><Btn variant="ghost" disabled={ocupado} onClick={() => gravar(true)}>Desligar o Pix</Btn></span>
      </div>
    </>
  );
}

function EditarDepois({ painel, ler }: { painel: Painel; ler: () => void }) {
  const c = painel.config;
  const [depois, setDepois] = useState<DepoisDoAtendimento>(c.depoisDoAtendimento);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setOcupado(true);
    try {
      await gravarPix({ tipoDaChave: c.tipoDaChave, chave: c.chave, nome: c.nome, cidade: c.cidade, depoisDoAtendimento: depois });
      toast("Salvo.");
      ler();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <>
      <OpcoesDoDepois depois={depois} mudar={setDepois} />
      <div style={s("display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        <Btn disabled={ocupado} onClick={salvar}>Salvar</Btn>
        {depois !== c.depoisDoAtendimento && <Btn variant="ghost" disabled={ocupado} onClick={() => setDepois(c.depoisDoAtendimento)}>Cancelar</Btn>}
      </div>
    </>
  );
}

/* ───────────────────────────── a opção B: cartão e boleto ───────────────────────────── */

const TITULAR_VAZIO = {
  documento: "", nome: "", email: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  faturamentoMensal: "", nascimento: "", tipoDeEmpresa: "",
};

const TIPOS_DE_EMPRESA: { valor: string; rotulo: string }[] = [
  { valor: "MEI", rotulo: "MEI" },
  { valor: "LIMITED", rotulo: "Limitada (LTDA)" },
  { valor: "INDIVIDUAL", rotulo: "Individual (EI ou SLU)" },
  { valor: "ASSOCIATION", rotulo: "Associação" },
];

/**
 * "Ativar recebimentos": a subconta no Asaas, no nome do profissional, sem ele ver o Asaas. Os textos
 * vieram da tela do Smiller (`CobrancaBancaria.tsx`), escrita para quem não é técnico.
 */
export function ContaDeCartaoEBoleto({ conta, depois }: { conta: ContaDeRecebimentos | null; depois: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [d, setD] = useState(TITULAR_VAZIO);
  const [ocupado, setOcupado] = useState(false);
  const situacao = conta?.situacao ?? "sem_conta";
  const pf = d.documento.replace(/\D/g, "").length <= 11;
  const põe = (campo: keyof typeof TITULAR_VAZIO, v: string) => setD((a) => ({ ...a, [campo]: v }));

  const abrir = async () => {
    setOcupado(true);
    try {
      await postar("/api/recebimentos/conta", d, "Não consegui abrir a conta.");
      toast("Conta aberta. Agora falta enviar os documentos.");
      setAbrindo(false);
      setD(TITULAR_VAZIO);
      depois();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui abrir a conta.");
    } finally {
      setOcupado(false);
    }
  };

  const campo = (rotulo: string, chave: keyof typeof TITULAR_VAZIO, dica: string, extra = "", tipo = "text") => (
    <label style={s(`${ROTULO}${extra}`)}>
      {rotulo}
      <input type={tipo} value={d[chave]} onChange={(e) => põe(chave, e.target.value)} placeholder={dica} className="n m-focus" style={s(CAMPO)} />
    </label>
  );

  return (
    <div style={s(`${CARTAO};gap:12px`)}>
      <span style={s("display:flex;align-items:center;gap:10px")}>
        <span style={s("flex:1;font-size:var(--t-sm);font-weight:var(--w-title)")}>Cartão e boleto, com a confirmação sozinha</span>
        {situacao === "aprovada" && <Estado forma="disco" tom="success">Aprovada</Estado>}
        {situacao === "em_analise" && <Estado forma="anel" tom="neutral">Em análise</Estado>}
        {situacao === "pendente" && <Estado forma="triangulo" tom="warn">Falta enviar documentos</Estado>}
        {situacao === "recusada" && <Estado forma="triangulo" tom="warn">Não aprovada</Estado>}
      </span>

      {situacao === "sem_conta" && !abrindo && (
        <>
          <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-ui)")}>
            Com uma conta de recebimentos, a cobrança vai com um link onde o cliente paga por Pix, boleto ou cartão, e o
            pagamento é confirmado sozinho, sem comprovante. O dinheiro cai numa conta no seu nome.
          </span>
          <span><Btn variant="secondary" onClick={() => setAbrindo(true)}>Ativar recebimentos</Btn></span>
        </>
      )}

      {situacao === "sem_conta" && abrindo && (
        <div style={s("display:grid;gap:9px")}>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            {campo("CPF ou CNPJ", "documento", "Escreva o documento…", ";flex:1;min-width:160px")}
            {campo(pf ? "Nome completo" : "Razão social", "nome", "Como está no documento…", ";flex:2;min-width:200px")}
          </div>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            {campo("E-mail", "email", "Escreva o e-mail…", ";flex:2;min-width:200px", "email")}
            {campo("Celular", "celular", "Com DDD…", ";flex:1;min-width:150px")}
          </div>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            {campo("CEP", "cep", "Escreva o CEP…", ";flex:1;min-width:110px")}
            {campo("Rua", "endereco", "Sem o número…", ";flex:3;min-width:200px")}
          </div>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            {campo("Número", "numero", "Escreva o número…", ";flex:1;min-width:90px")}
            {campo("Complemento", "complemento", "Opcional…", ";flex:1;min-width:120px")}
            {campo("Bairro", "bairro", "Escreva o bairro…", ";flex:2;min-width:150px")}
          </div>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            {campo("Quanto entra por mês, mais ou menos", "faturamentoMensal", "Em reais…", ";flex:1;min-width:160px")}
            {pf
              ? campo("Data de nascimento", "nascimento", "Escolha a data…", ";flex:1;min-width:150px", "date")
              : (
                <label style={s(`${ROTULO};flex:1;min-width:150px`)}>
                  Tipo da empresa
                  <select value={d.tipoDeEmpresa} onChange={(e) => põe("tipoDeEmpresa", e.target.value)} className="n m-focus" style={s(CAMPO)}>
                    <option value="">Escolha…</option>
                    {TIPOS_DE_EMPRESA.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
                  </select>
                </label>
              )}
          </div>
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)")}>
            Depois de abrir, o Asaas pede um documento com foto e uma selfie, por um link que aparece aqui.
          </span>
          <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
            <Btn disabled={ocupado} onClick={abrir}>{ocupado ? "Abrindo…" : "Abrir minha conta"}</Btn>
            <Btn variant="ghost" disabled={ocupado} onClick={() => setAbrindo(false)}>Voltar</Btn>
          </div>
        </div>
      )}

      {situacao === "pendente" && (
        <div style={s("display:grid;gap:8px")}>
          {(conta?.pendencias ?? []).map((p, i) => (
            <span key={i} style={s("display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:var(--t-sm)")}>
              {p.titulo}
              {p.link && (
                <a href={p.link} target="_blank" rel="noopener noreferrer" className="m-focus" style={s("color:var(--primary-dark);font-weight:var(--w-title)")}>
                  Enviar agora
                </a>
              )}
            </span>
          ))}
        </div>
      )}
      {situacao === "em_analise" && (
        <span style={s("font-size:var(--t-sm);color:var(--muted)")}>Os documentos chegaram. O Asaas costuma responder em até 2 dias úteis.</span>
      )}
      {situacao === "aprovada" && (
        <span style={s("font-size:var(--t-sm);color:var(--muted)")}>
          As cobranças já saem com o link de Pix, boleto e cartão. Para quem não tem CPF na ficha, a MAISA pede antes de cobrar.
        </span>
      )}
      {situacao === "recusada" && (
        <span style={s("font-size:var(--t-sm);color:var(--muted)")}>O Asaas não aprovou a conta. O Pix continua funcionando; fale com o suporte da MAISA.</span>
      )}
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
