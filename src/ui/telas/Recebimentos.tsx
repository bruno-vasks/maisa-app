"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS: a aba do dinheiro que entra (28/10/2026, refeita em 30/10 e em 04/11/2026).
 *
 * Morava em A MAISA → Receber por Pix. Bruno: "essa parte do pix acho que é importante suficiente
 * para virar uma aba nova na sidebar". Fica no grupo do dinheiro do rail, ao lado de Clientes e
 * Fiscal; no celular, no "Mais", porque a barra de baixo já tem as cinco.
 *
 * ★ 30/10/2026: sem título de seção nem prévia do WhatsApp (*"o resto do aplicativo não tem isso"*,
 * *"está com um pouco de cara de AI sloppy"*), e a ideia do EXTRATO: o trabalho do dono aqui é
 * comparar com o app do banco, então o comprovante aparece como a linha que ele procura no extrato
 * ("Pix recebido de JOÃO… + R$ 50,00"), e os recebidos vêm agrupados por dia, com o total do dia.
 *
 * ★ 04/11/2026, a "versão A" do Smiller (`~/smiller/handoff/maisa-financeiro-versao-a.md`). O
 * Bruno escolheu, numa prévia de três, manter os filtros e o extrato, e reclamou da primeira
 * tentativa: *"os botões não estão tão bem divididos e a hierarquia não está clara, não está claro
 * o objetivo dessa página"*. Entre três desenhos, escolheu a LISTA E DETALHE:
 *
 *   · o número grande muda com o filtro e diz o que a lista embaixo é ("Para conferir R$ 300,00");
 *     a contagem de cada filtro foi para dentro do botão dele, como em Clientes;
 *   · à esquerda, a lista curta: a data (que separa duas cobranças da mesma pessoa), quem, o estado
 *     e o valor; à direita, o item escolhido, com os botões. Só um item tem botões de cada vez;
 *   · cada item tem um botão principal com o verbo ("Confirmar pagamento", "Mandar de novo"), um
 *     com contorno ao lado ("Não entrou", "Já pagou") e o resto no "⋯" (`MaisAcoes`);
 *   · sem os selos "Recebedor confere" e "Código do Pix confere": *"pra que escrever isso"*. O
 *     que confere não muda o que o dono faz; só o que não bate aparece, em âmbar, com o motivo;
 *   · sem subtítulo no detalhe (o banco, "Sessão, 28/10"): o Bruno vetou a linha cinza embaixo do
 *     título duas vezes em 04/11/2026, e pediu a aba igual à coluna de Hoje.
 *
 * No celular a lista ocupa a tela, e tocar num item abre o detalhe no lugar dela.
 *
 * "Configurar", à direita dos filtros, abre os ajustes (`AjustesDoPix`) no lugar da lista, no
 * mesmo desenho de lista e detalhe, sem o número do topo: ele é da lista, não dos ajustes.
 *
 * Sem chave e sem histórico, a tela é só o formulário do Pix: não há o que listar.
 *
 * As ações (decidir, confirmar, descartar), o "⋯" e o formulário moram em
 * `componentes/Recebimentos.tsx`, que a coluna "Precisa de você" de Hoje também usa.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useState } from "react";
import { s, fmt, Btn, Estado, EmptyState, Filtros } from "@/ui/primitivos";
import { Moldura, Contagem, type MarcoDaContagem } from "@/ui/componentes/Moldura";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import {
  AjustesDoPix, ContaDeCartaoEBoleto, FormularioDoPix, MaisAcoes, diasSemPagar, fraseDoDocumento, plural, useComprovante, useDecisao, usePainel, type Painel,
} from "@/ui/componentes/Recebimentos";
import { useIsMobile } from "@/ui/useIsMobile";
import { chaveDe } from "@/nucleo/dominio/contatos";
import { telefoneBonito } from "@/nucleo/dominio/clientes";
import { conferirCodigoDoPix, type ComprovanteDePagamento, type FormaDoPagamento, type Recebimento } from "@/nucleo/dominio/recebimentos";

type Aba = "conferir" | "esperando" | "recebidos";
const ABAS: Aba[] = ["conferir", "esperando", "recebidos"];
const NOME_DA_ABA: Record<Aba, string> = { conferir: "Para conferir", esperando: "Esperando", recebidos: "Recebidos" };
/* No celular os três filtros têm de caber numa linha de 358px; "Para conferir" quebrava a fila. */
const NOME_CURTO: Record<Aba, string> = { ...NOME_DA_ABA, conferir: "Conferir" };

const FORMA: Record<FormaDoPagamento, string> = { pix: "Pix", na_hora: "Na hora", asaas: "Link" };

const LISTA = "display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);flex-shrink:0;overflow:hidden";
const PAINEL = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);padding:18px";
const NOME = "display:block;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
const SUB = "display:block;min-width:0;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)";
const TITULO = "font-size:var(--t-lg);font-weight:var(--w-title);color:var(--ink);line-height:var(--lh-ui);overflow-wrap:anywhere";
const AVISO = "font-size:var(--t-label);color:var(--warn);line-height:var(--lh-ui)";
const CAMPO = "height:40px;padding:0 12px;border-radius:var(--r-controle);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink)";
const borda = (ultima: boolean) => (ultima ? "" : "border-bottom:1px solid var(--line);");

const quem = (x: { nome: string | null; telefone: string }) => x.nome?.trim() || telefoneBonito(x.telefone);
const diaMes = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);

const DIA_MS = 86_400_000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasDesde = (iso: string) => Math.round((inicioDoDia(new Date()) - inicioDoDia(new Date(iso))) / DIA_MS);
const semana = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");

/** A coluna da data na lista: "Hoje 14:37", "Ontem terça", "28/10 quarta". */
function quandoFoi(iso: string): [string, string] {
  const d = new Date(iso);
  const dias = diasDesde(iso);
  if (dias <= 0) return ["Hoje", d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })];
  if (dias === 1) return ["Ontem", semana(d)];
  return [`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, semana(d)];
}

/** O cabeçalho do dia no extrato: "Hoje", "Ontem", "27/10, segunda". */
function nomeDoDia(chave: string): string {
  const [a, m, d] = chave.split("-").map(Number);
  const dia = new Date(a, m - 1, d);
  const dias = Math.round((inicioDoDia(new Date()) - dia.getTime()) / DIA_MS);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}, ${semana(dia)}`;
}

/** AAAA-MM-DD no fuso de quem olha: o dia em que o dinheiro caiu, como o banco mostra. */
function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Um item da lista: o que a linha mostra e o que o detalhe desenha quando ele é o escolhido. */
type Item = {
  id: string;
  quando: string;
  quem: string;
  estado: string;
  atrasado: boolean;
  valor: number | null;
  detalhe: () => React.ReactNode;
};

export default function Recebimentos() {
  const { painel, erro, ler } = usePainel();
  const mobile = useIsMobile();
  const [aba, setAba] = useState<Aba | null>(null);
  const [ajustando, setAjustando] = useState(false);

  if (!painel) {
    return (
      <Moldura rotulo="Recebimentos">
        {erro
          ? <FalhaDeLeitura frase="Não consegui ler os recebimentos." detalhe={erro} tentar={ler} />
          : <Esqueleto linhas={3} altura={72} rotulo="Lendo os recebimentos" />}
      </Moldura>
    );
  }

  const c = painel.config;
  const ligado = Boolean(c.chave);
  const n: Record<Aba, number> = {
    conferir: painel.comprovantes.length + painel.paraDecidir.length,
    esperando: painel.abertos.length,
    recebidos: painel.recebidos.length,
  };

  /* Sem chave e sem nada para mostrar, a tela é o formulário: é a única coisa a fazer aqui. */
  if (!ligado && n.conferir + n.esperando + n.recebidos === 0) {
    return (
      <Moldura rotulo="Ligar o Pix">
        <Ajustes painel={painel} ler={ler} mobile={mobile} />
      </Moldura>
    );
  }

  /* Sem escolha do dono, abre onde há trabalho. */
  const atual: Aba = aba ?? (n.conferir ? "conferir" : n.esperando ? "esperando" : "recebidos");

  /* O número grande é o da lista aberta: é ele que diz para que a tela serve agora. */
  const conferir = itensParaConferir(painel, ler, mobile);
  const esperando = itensEsperando(painel, ler);
  const soma = (xs: { valor: number | null }[]) => xs.reduce((t, x) => t + (x.valor ?? 0), 0);
  const atrasado = esperando.filter((x) => x.atrasado);
  const heroi: Record<Aba, { rotulo: string; valor: number; sub?: string; marcos?: MarcoDaContagem[] }> = {
    conferir: { rotulo: "Para conferir", valor: soma(conferir), sub: n.conferir ? `em ${plural(n.conferir, "pagamento", "pagamentos")}` : undefined },
    esperando: {
      rotulo: "Esperando pagamento",
      valor: soma(esperando),
      sub: n.esperando ? `em ${plural(n.esperando, "cobrança", "cobranças")}` : undefined,
      marcos: atrasado.length ? [{ n: fmt(soma(atrasado)), label: "há mais de um dia sem pagar", tom: "warn" }] : undefined,
    },
    recebidos: {
      rotulo: "Recebido nos últimos 30 dias",
      valor: painel.recebidos.reduce((t, r) => t + r.valor, 0),
      sub: n.recebidos ? `em ${plural(n.recebidos, "pagamento", "pagamentos")}` : undefined,
    },
  };
  const h = heroi[atual];

  /* A contagem no próprio filtro, como em Clientes ("Todos (12)"). Recebidos não conta: é histórico. */
  const nomes = mobile ? NOME_CURTO : NOME_DA_ABA;
  const rotulo = (a: Aba) => (a !== "recebidos" && n[a] ? `${nomes[a]} (${n[a]})` : nomes[a]);
  const filtros = (
    <Filtros
      opcoes={ABAS.map(rotulo)}
      ativo={ajustando ? "" : rotulo(atual)}
      onChange={(v) => {
        setAba(ABAS.find((a) => rotulo(a) === v) ?? "recebidos");
        setAjustando(false);
      }}
    />
  );
  /* "Configurar" à direita dos filtros, como no Smiller (Bruno, 04/11/2026): abre os ajustes no
     lugar da lista, com a chave em uso aberta primeiro. No celular ele desce para
     o fim da lista: é ajuste, e lá em cima gastaria uma linha entre a contagem e os filtros. */
  const configurar = ligado && (
    <Btn variant="secondary" icon="ajustes" onClick={() => setAjustando((x) => !x)}>Configurar</Btn>
  );

  return (
    <Moldura
      rotulo={ajustando ? "Configurar" : NOME_DA_ABA[atual]}
      topo={ajustando ? undefined : <Contagem rotulo={h.rotulo} valor={fmt(h.valor)} sub={h.sub} marcos={h.marcos} />}
      cabecalho={
        mobile ? filtros : (
          <div style={s("display:flex;align-items:center;gap:10px 12px;flex-wrap:wrap")}>
            {filtros}
            {configurar && <span style={s("margin-left:auto")}>{configurar}</span>}
          </div>
        )
      }
    >
      {(ajustando || !ligado) && <Ajustes painel={painel} ler={ler} mobile={mobile} voltar={ligado ? () => setAjustando(false) : undefined} />}
      {!ajustando && atual === "conferir" && (
        <ListaEDetalhe
          key="conferir"
          itens={conferir}
          mobile={mobile}
          vazio={
            <EmptyState
              title="Nada para conferir"
              sub="Quando um cliente mandar o comprovante, ou um atendimento acabar sem você dizer se foi pago, ele aparece aqui."
              semSaida="a saída são os outros dois filtros, logo acima"
            />
          }
        />
      )}
      {!ajustando && atual === "esperando" && (
        <ListaEDetalhe
          key="esperando"
          itens={esperando}
          mobile={mobile}
          vazio={
            <EmptyState
              title="Ninguém com Pix em aberto"
              sub="Toda cobrança que a MAISA manda fica aqui até o pagamento chegar."
              semSaida="a saída são os outros dois filtros, logo acima"
            />
          }
        />
      )}
      {!ajustando && atual === "recebidos" && <Extrato recebidos={painel.recebidos} mobile={mobile} />}
      {mobile && !ajustando && configurar && <span style={s("flex-shrink:0")}>{configurar}</span>}
    </Moldura>
  );
}

/* ───────────────────────────── os itens ───────────────────────────── */

/** O comprovante primeiro (o cliente já pagou, falta você ver), depois o "já está pago?". */
function itensParaConferir(painel: Painel, ler: () => void, mobile: boolean): Item[] {
  return [
    ...painel.comprovantes.map((x): Item => {
      const sugerida = painel.abertos.find((r) => r.id === x.recebimentoId);
      return {
        id: x.id, quando: x.criadoEm, quem: quem(x), estado: "Mandou comprovante", atrasado: false,
        valor: x.valor ?? sugerida?.valor ?? null,
        detalhe: () => <DetalheDoComprovante c={x} abertos={painel.abertos} depois={ler} mobile={mobile} />,
      };
    }),
    ...painel.paraDecidir.map((r): Item => ({
      id: r.id, quando: r.criadoEm, quem: quem(r), estado: "Já está pago?", atrasado: false, valor: r.valor,
      detalhe: () => <DetalheDaPergunta r={r} depois={ler} />,
    })),
  ];
}

/** A cobrança mais antiga primeiro: é a que mais precisa de você. */
function itensEsperando(painel: Painel, ler: () => void): Item[] {
  return [...painel.abertos]
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .map((r): Item => {
      const comComprovante = painel.comprovantes.some((x) => x.recebimentoId === r.id);
      const dias = diasSemPagar(r.criadoEm);
      return {
        id: r.id, quando: r.criadoEm, quem: quem(r),
        estado: comComprovante ? "Mandou comprovante" : dias ? `${plural(dias, "dia", "dias")} sem pagar` : "Esperando",
        atrasado: dias > 0 && !comComprovante,
        valor: r.valor,
        detalhe: () => <DetalheDoAberto r={r} dias={dias} comComprovante={comComprovante} depois={ler} />,
      };
    });
}

/* ───────────────────────────── a lista e o detalhe ───────────────────────────── */

/**
 * À esquerda a lista curta, à direita o escolhido (o primeiro, se o dono não escolheu). No
 * celular, a lista sozinha, e o toque abre o detalhe no lugar dela, com o caminho de volta.
 */
function ListaEDetalhe({ itens, mobile, vazio }: { itens: Item[]; mobile: boolean; vazio: React.ReactNode }) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  if (!itens.length) return <>{vazio}</>;

  if (mobile) {
    const aberto = itens.find((i) => i.id === escolhido);
    if (!aberto) return <Lista itens={itens} escolhido={null} escolher={setEscolhido} mobile />;
    return (
      <div style={s("display:flex;flex-direction:column;gap:10px;flex-shrink:0")}>
        <span><Btn variant="ghost" size="sm" icon="chevron-left" onClick={() => setEscolhido(null)}>Voltar para a lista</Btn></span>
        <div key={aberto.id} style={s(`${PAINEL};display:flex;flex-direction:column;gap:14px`)}>{aberto.detalhe()}</div>
      </div>
    );
  }

  /* Se o escolhido saiu da lista (foi confirmado, por exemplo), o detalhe passa para o primeiro. */
  const atual = itens.find((i) => i.id === escolhido) ?? itens[0];
  return (
    <div style={s("display:grid;grid-template-columns:minmax(300px,420px) minmax(0,1fr);gap:18px;align-items:start;flex-shrink:0")}>
      <Lista itens={itens} escolhido={atual.id} escolher={setEscolhido} mobile={false} />
      <div key={atual.id} style={s("position:sticky;top:0;border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);padding:24px 26px;display:flex;flex-direction:column;gap:14px;min-width:0")}>
        {atual.detalhe()}
      </div>
    </div>
  );
}

function Lista({ itens, escolhido, escolher, mobile }: { itens: Item[]; escolhido: string | null; escolher: (id: string) => void; mobile: boolean }) {
  return (
    <div style={s(LISTA)}>
      {itens.map((i, k) => {
        const on = i.id === escolhido;
        const [dia, hora] = quandoFoi(i.quando);
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => escolher(i.id)}
            aria-current={on ? "true" : undefined}
            className="m-hov-bg m-focus"
            style={s(`border:none;border-left:3px solid ${on ? "var(--primary)" : "transparent"};${borda(k === itens.length - 1)}display:grid;grid-template-columns:58px minmax(0,1fr) auto${mobile ? " 16px" : ""};align-items:center;gap:14px;padding:12px 16px 12px 13px;text-align:left;font-family:inherit;cursor:pointer;background:${on ? "var(--primary-soft)" : "transparent"};color:var(--ink);min-height:60px`)}
          >
            <span style={s("display:flex;flex-direction:column;line-height:1.3")}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{dia}</span>
              <span style={s("font-size:var(--t-label);color:var(--muted)")}>{hora}</span>
            </span>
            <span style={s("min-width:0")}>
              <span style={s(NOME)}>{i.quem}</span>
              <span style={s(`${SUB}${i.atrasado ? ";color:var(--warn)" : ""}`)}>{i.estado}</span>
            </span>
            <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap")}>{i.valor != null ? fmt(i.valor) : "—"}</span>
            {mobile && <span aria-hidden style={s("color:var(--muted);font-size:var(--t-body)")}>›</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── os detalhes ───────────────────────────── */

/**
 * O comprovante, posto ao lado do que o dono vai procurar no banco.
 *
 * A linha "Pix recebido de FULANO, + R$ 50,00" é o centro: é ela que ele acha no extrato, e só
 * então confirma. Só o que não bate (quem recebeu, o valor, o código da transação) aparece, logo
 * embaixo, em âmbar; o que confere não muda o que ele faz, e não se escreve (Bruno, 04/11/2026).
 */
function DetalheDoComprovante({ c, abertos, depois, mobile }: { c: ComprovanteDePagamento; abertos: Recebimento[]; depois: () => void; mobile: boolean }) {
  /* As cobranças em aberto deste telefone, a mais antiga primeiro: com mais de uma, a data é o que
     separa uma da outra (Bruno, 04/11/2026: "diferenciamos pela data"). */
  const doTelefone = abertos.filter((r) => chaveDe(r.telefone) === chaveDe(c.telefone)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const [alvo, setAlvo] = useState(c.recebimentoId ?? doTelefone[0]?.id ?? "");
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { ocupado, agir } = useComprovante(c.id, depois);
  const cobranca = doTelefone.find((r) => r.id === alvo) ?? null;
  const valorDiferente = c.valor != null && cobranca != null && Math.abs(c.valor - cobranca.valor) >= 0.01;
  /* O código da transação contra o banco, a data e a hora da cobrança (`conferirCodigoDoPix`). */
  const codigo = conferirCodigoDoPix(c, { recebidoEm: c.criadoEm, cobrancaEnviadaEm: cobranca?.criadoEm ?? null });

  return (
    <>
      <span style={s(TITULO)}>{quem(c)} mandou um comprovante</span>

      <div style={s("display:flex;flex-direction:column;gap:6px")}>
        <span style={s("font-size:var(--t-label);color:var(--muted)")}>Procure no seu extrato</span>
        <div style={s(`display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;gap:${mobile ? 10 : 14}px;padding:11px 14px;border-radius:var(--r-controle);background:var(--surface-2)`)}>
          <span className="n" style={s("font-size:var(--t-label);color:var(--muted)")}>{diaMes(c.pagoEm) ?? "sem data"}</span>
          <span style={s("min-width:0;font-size:var(--t-sm);overflow-wrap:anywhere")}>
            Pix recebido{c.pagadorNome ? <> de <b style={s("font-weight:var(--w-title)")}>{c.pagadorNome}</b></> : ""}
          </span>
          <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap")}>
            {c.valor != null ? `+ ${fmt(c.valor)}` : "valor ilegível"}
          </span>
        </div>
        {c.conferencia === "nao_confere" && <span style={s(AVISO)}>No comprovante, quem recebeu não parece ser você.</span>}
        {codigo.motivos.map((m) => <span key={m} style={s(AVISO)}>{m}</span>)}
        {valorDiferente && <span style={s(AVISO)}>O comprovante diz {fmt(c.valor!)}, e a cobrança é de {fmt(cobranca!.valor)}.</span>}
      </div>

      <span style={s("height:1px;background:var(--line)")} />

      {doTelefone.length > 1 ? (
        <label style={s("display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:var(--t-sm);color:var(--muted)")}>
          Paga
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)} className="n m-focus" style={s(`${CAMPO};max-width:100%`)}>
            {doTelefone.map((r) => <option key={r.id} value={r.id}>{r.descricao} · {fmt(r.valor)}</option>)}
          </select>
        </label>
      ) : (
        <span style={s("font-size:var(--t-sm);color:var(--muted)")}>
          {cobranca ? <>Paga <span style={s("color:var(--ink)")}>{cobranca.descricao}</span></> : "Este telefone não tem cobrança em aberto."}
        </span>
      )}

      {!descartando ? (
        <span style={s("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
          <Btn
            icon="check"
            disabled={ocupado || !alvo}
            motivo="Sem cobrança em aberto: marque que não entrou, ou mande o Pix primeiro."
            onClick={() => agir({ acao: "confirmar", recebimentoId: alvo }, (r) => fraseDoDocumento(r.documento ?? { tipo: "nenhum" }))}
          >
            Confirmar pagamento
          </Btn>
          <Btn variant="secondary" disabled={ocupado} onClick={() => setDescartando(true)}>Não entrou</Btn>
        </span>
      ) : (
        <div style={s("display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap")}>
          <label style={s("flex:1 1 240px;display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
            O que aconteceu? Fica anotado.
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escreva o motivo…" className="m-focus" style={s(CAMPO)} />
          </label>
          <Btn variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => agir({ acao: "descartar", motivo }, () => "Anotei que o dinheiro não entrou.")}>
            Confirmar que não entrou
          </Btn>
          <Btn variant="ghost" disabled={ocupado} onClick={() => setDescartando(false)}>Voltar</Btn>
        </div>
      )}
    </>
  );
}

/** O atendimento que acabou e espera o dono dizer se foi pago (o barbeiro que recebe na hora). */
function DetalheDaPergunta({ r, depois }: { r: Recebimento; depois: () => void }) {
  const { ocupado, decidir } = useDecisao(r.id, false, depois);
  return (
    <>
      <span style={s(TITULO)}>{quem(r)}: já está pago?</span>
      <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:1")}>{fmt(r.valor)}</span>
      <span style={s("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
        <Btn icon="check" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
        <Btn variant="secondary" icon="send" disabled={ocupado} onClick={() => decidir("pix")}>Mandar Pix</Btn>
        <MaisAcoes disabled={ocupado} acoes={[{ label: "Não cobrar", onClick: () => decidir("nao_cobrar") }]} />
      </span>
    </>
  );
}

/**
 * O Pix que foi e não voltou pago. Passado um dia, "Mandar de novo" vira o principal; antes disso
 * não há o que fazer além de esperar, e nenhum botão grita.
 */
function DetalheDoAberto({ r, dias, comComprovante, depois }: { r: Recebimento; dias: number; comComprovante: boolean; depois: () => void }) {
  const { ocupado, decidir } = useDecisao(r.id, true, depois);
  const cobrar = dias > 0 && !comComprovante;
  const naoCobrar = { label: "Não cobrar", onClick: () => decidir("nao_cobrar") };
  return (
    <>
      <span style={s(TITULO)}>{quem(r)}</span>
      <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:1")}>{fmt(r.valor)}</span>
      {comComprovante
        ? <Estado forma="anel" tom="primary">Mandou comprovante</Estado>
        : dias
          ? <Estado forma="triangulo" tom="warn">{plural(dias, "dia", "dias")} sem pagar</Estado>
          : <Estado forma="anel" tom="primary">Esperando</Estado>}
      <span style={s("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
        {cobrar ? (
          <>
            <Btn icon="send" disabled={ocupado} onClick={() => decidir("pix")}>Mandar de novo</Btn>
            <Btn variant="secondary" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
            <MaisAcoes disabled={ocupado} acoes={[naoCobrar]} />
          </>
        ) : (
          <>
            <Btn variant="secondary" icon="check" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
            <MaisAcoes disabled={ocupado} acoes={[{ label: "Mandar de novo", onClick: () => decidir("pix") }, naoCobrar]} />
          </>
        )}
      </span>
    </>
  );
}

/* ───────────────────────────── os ajustes ───────────────────────────── */

function Ajustes({ painel, ler, voltar, mobile }: { painel: Painel; ler: () => void; voltar?: () => void; mobile: boolean }) {
  /* Ligado, os ajustes são lista e detalhe e vão até a borda; a primeira vez é um formulário, e estreito. */
  return (
    <div style={s(`display:flex;flex-direction:column;gap:14px;${painel.config.chave ? "" : "max-width:680px;"}flex-shrink:0`)}>
      {painel.config.chave
        ? <AjustesDoPix painel={painel} ler={ler} mobile={mobile} />
        : <div style={s(PAINEL)}><FormularioDoPix painel={painel} ler={ler} /></div>}
      {/* A opção B (Asaas), atrás de flag: só com ela ligada na plataforma, e depois do Pix. */}
      {Boolean(painel.config.chave) && painel.asaas.disponivel && (
        <ContaDeCartaoEBoleto conta={painel.asaas.conta} depois={ler} />
      )}
      {/* No celular os filtros, grudados logo acima, já voltam; um segundo "voltar" embaixo do do assunto confundia. */}
      {voltar && !mobile && <span><Btn variant="ghost" size="sm" onClick={voltar}>Voltar para a lista</Btn></span>}
    </div>
  );
}

/* ───────────────────────────── recebidos: o extrato ───────────────────────────── */

function Extrato({ recebidos, mobile }: { recebidos: Recebimento[]; mobile: boolean }) {
  if (!recebidos.length) {
    return (
      <EmptyState
        title="Nada recebido nos últimos 30 dias"
        sub="Cada pagamento confirmado entra aqui, separado por dia, como no extrato do banco."
        semSaida="a saída são os outros dois filtros, logo acima"
      />
    );
  }
  /* Agrupado pelo dia em que o dinheiro caiu, o mais novo em cima, com o total do dia: é assim que
     o app do banco mostra, e é com ele que o dono compara. */
  const dias = new Map<string, Recebimento[]>();
  for (const r of [...recebidos].sort((a, b) => (b.pagoEm ?? b.criadoEm).localeCompare(a.pagoEm ?? a.criadoEm))) {
    const k = chaveDoDia(r.pagoEm ?? r.criadoEm);
    dias.set(k, [...(dias.get(k) ?? []), r]);
  }
  return (
    <>
      {[...dias.entries()].map(([dia, lista]) => (
        <section key={dia} aria-label={nomeDoDia(dia)} style={s("display:flex;flex-direction:column;gap:8px;flex-shrink:0")}>
          <div style={s("display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 2px")}>
            <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>{nomeDoDia(dia)}</span>
            <span className="n" style={s("font-size:var(--t-label);color:var(--muted)")}>{fmt(lista.reduce((soma, r) => soma + r.valor, 0))}</span>
          </div>
          <div style={s(LISTA)}>
            {lista.map((r, i) => (
              <div
                key={r.id}
                style={s(`${borda(i === lista.length - 1)}min-height:56px;padding:9px ${mobile ? "14px" : "18px"};display:grid;grid-template-columns:${mobile ? "minmax(0,1fr) auto" : "minmax(0,1fr) 90px 130px"};align-items:center;gap:${mobile ? "12px" : "16px"}`)}
              >
                <span style={s("min-width:0")}>
                  <span style={s(NOME)}>{quem(r)}</span>
                  <span style={s(SUB)}>{r.descricao}{mobile && r.forma ? ` · ${FORMA[r.forma]}` : ""}</span>
                </span>
                {!mobile && <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{r.forma ? FORMA[r.forma] : "Pago"}</span>}
                <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);text-align:right;white-space:nowrap")}>
                  <span style={s("color:var(--success)")}>+</span> {fmt(r.valor)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
