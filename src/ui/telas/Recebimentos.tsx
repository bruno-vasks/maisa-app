"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS: a aba do dinheiro que entra (28/10/2026, refeita em 30/10/2026).
 *
 * Morava em A MAISA → Receber por Pix. Bruno: "essa parte do pix acho que é importante suficiente
 * para virar uma aba nova na sidebar". Fica no grupo do dinheiro do rail, ao lado de Clientes e
 * Fiscal; no celular, no "Mais", porque a barra de baixo já tem as cinco.
 *
 * ★ POR QUE FOI REFEITA (Bruno, 30/10/2026): a primeira versão empilhava seções com título e
 * subtítulo ("Receba por Pix, com o valor certo", "O que o cliente recebe") e uma prévia do
 * WhatsApp. *"O resto do aplicativo não tem isso. Não tem texto de título de cada página"*, e
 * *"está com um pouco de cara de AI sloppy"*. Agora ela segue a casa (emenda 5 do maisa-design:
 * um título, o da topbar) e o desenho de Clientes e Faturamento:
 *
 *   · topo: a contagem (o recebido em 30 dias, e quantos esperam o dono);
 *   · cabeçalho: os três filtros e, à direita, a chave Pix em uso, que abre os ajustes;
 *   · região: a lista do filtro.
 *
 * A ideia da tela é o EXTRATO. O trabalho do dono aqui é comparar com o app do banco, então a
 * lista se parece com o que ele vai abrir: os recebidos agrupados por dia, com o total do dia, e
 * o comprovante mostrado como a linha que ele procura no extrato ("Pix recebido de JOÃO…
 * + R$ 50,00"). A prévia da conversa saiu: o dono não decide nada olhando para ela.
 *
 * Sem chave e sem histórico, a tela é só o formulário do Pix: não há o que listar.
 *
 * As ações (decidir, confirmar, descartar) e o formulário moram em `componentes/Recebimentos.tsx`,
 * que a coluna "Precisa de você" de Hoje também usa.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useState } from "react";
import { s, fmt, Btn, Estado, EmptyState, Filtros } from "@/ui/primitivos";
import { Moldura, Contagem } from "@/ui/componentes/Moldura";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import {
  ContaDeCartaoEBoleto, FormularioDoPix, SELO, fraseDoDocumento, useComprovante, useDecisao, usePainel, type Painel,
} from "@/ui/componentes/Recebimentos";
import { useIsMobile } from "@/ui/useIsMobile";
import { chaveDe } from "@/nucleo/dominio/contatos";
import { conferirCodigoDoPix, type ComprovanteDePagamento, type FormaDoPagamento, type Recebimento } from "@/nucleo/dominio/recebimentos";
import type { TipoDeChavePix } from "@/nucleo/dominio/pix";

type Aba = "conferir" | "esperando" | "recebidos";
const ABAS: Aba[] = ["conferir", "esperando", "recebidos"];
const NOME_DA_ABA: Record<Aba, string> = { conferir: "Para conferir", esperando: "Esperando", recebidos: "Recebidos" };
/* No celular os três filtros têm de caber numa linha de 358px; "Para conferir" quebrava a fila. */
const NOME_CURTO: Record<Aba, string> = { ...NOME_DA_ABA, conferir: "Conferir" };

const FORMA: Record<FormaDoPagamento, string> = { pix: "Pix", na_hora: "Na hora", asaas: "Link" };
const TIPO: Record<TipoDeChavePix, string> = { cpf: "CPF", cnpj: "CNPJ", telefone: "Celular", email: "E-mail", aleatoria: "Chave" };

const LISTA = "display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);flex-shrink:0";
const PAINEL = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);padding:18px";
const NOME = "display:block;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
const SUB = "display:block;min-width:0;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-ui)";
const borda = (ultima: boolean) => (ultima ? "" : "border-bottom:1px solid var(--line);");

const quem = (x: { nome: string | null; telefone: string }) => x.nome?.trim() || x.telefone;
const diaMes = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);

const DIA_MS = 86_400_000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "hoje às 14:30", "ontem", "há 3 dias": quanto tempo a cobrança está na rua. */
function haQuanto(iso: string): string {
  const d = new Date(iso);
  const dias = Math.round((inicioDoDia(new Date()) - inicioDoDia(d)) / DIA_MS);
  if (dias <= 0) return `hoje às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** O cabeçalho do dia no extrato: "Hoje", "Ontem", "27/10, segunda". */
function nomeDoDia(chave: string): string {
  const [a, m, d] = chave.split("-").map(Number);
  const dia = new Date(a, m - 1, d);
  const dias = Math.round((inicioDoDia(new Date()) - dia.getTime()) / DIA_MS);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  const semana = dia.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}, ${semana}`;
}

/** AAAA-MM-DD no fuso de quem olha: o dia em que o dinheiro caiu, como o banco mostra. */
function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
        <Ajustes painel={painel} ler={ler} />
      </Moldura>
    );
  }

  /* Sem escolha do dono, abre onde há trabalho. */
  const atual: Aba = aba ?? (n.conferir ? "conferir" : n.esperando ? "esperando" : "recebidos");
  const recebido = painel.recebidos.reduce((soma, r) => soma + r.valor, 0);

  /* Sem a contagem no filtro, ao contrário de Clientes: aqui ela já está nos marcos, logo acima. */
  const nomes = mobile ? NOME_CURTO : NOME_DA_ABA;
  const filtros = (
    <Filtros
      opcoes={ABAS.map((a) => nomes[a])}
      ativo={ajustando ? "" : nomes[atual]}
      onChange={(v) => {
        setAba(ABAS.find((a) => nomes[a] === v) ?? "recebidos");
        setAjustando(false);
      }}
    />
  );
  /* A chave em uso fica à vista: é para ela que todo Pix desta lista foi. Clicar abre os ajustes
     no lugar da lista. No celular ela desce para o fim da lista: é ajuste, e lá em cima gastava
     uma linha inteira entre a contagem e os filtros. */
  const chave = ligado && (
    <Btn variant="ghost" icon="pix" rotulo="Mudar a chave Pix" onClick={() => setAjustando((x) => !x)}>
      <span style={s("display:inline-block;max-width:30ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom")}>
        {c.tipoDaChave ? `${TIPO[c.tipoDaChave]} ` : ""}{c.chave}
      </span>
    </Btn>
  );

  return (
    <Moldura
      rotulo={ajustando ? "Seu Pix" : NOME_DA_ABA[atual]}
      topo={
        <Contagem
          rotulo="Recebido nos últimos 30 dias"
          valor={fmt(recebido)}
          sub={n.recebidos ? `em ${n.recebidos} ${n.recebidos === 1 ? "pagamento" : "pagamentos"}` : undefined}
          marcos={[
            { n: n.conferir, label: "para conferir", tom: "warn" },
            { n: n.esperando, label: "esperando pagamento", tom: "primary" },
          ]}
        />
      }
      cabecalho={
        mobile ? filtros : (
          <div style={s("display:flex;align-items:center;gap:10px 12px;flex-wrap:wrap")}>
            {filtros}
            {chave && <span style={s("margin-left:auto")}>{chave}</span>}
          </div>
        )
      }
    >
      {(ajustando || !ligado) && <Ajustes painel={painel} ler={ler} voltar={ligado ? () => setAjustando(false) : undefined} />}
      {!ajustando && atual === "conferir" && <ParaConferir painel={painel} ler={ler} mobile={mobile} />}
      {!ajustando && atual === "esperando" && <Esperando painel={painel} ler={ler} mobile={mobile} />}
      {!ajustando && atual === "recebidos" && <Extrato recebidos={painel.recebidos} mobile={mobile} />}
      {mobile && !ajustando && chave && <span style={s("flex-shrink:0")}>{chave}</span>}
    </Moldura>
  );
}

/* ───────────────────────────── os ajustes ───────────────────────────── */

function Ajustes({ painel, ler, voltar }: { painel: Painel; ler: () => void; voltar?: () => void }) {
  return (
    <div style={s("display:flex;flex-direction:column;gap:14px;max-width:680px;flex-shrink:0")}>
      <div style={s(PAINEL)}>
        <FormularioDoPix painel={painel} ler={() => { ler(); voltar?.(); }} />
      </div>
      {/* A opção B (Asaas), atrás de flag: só com ela ligada na plataforma, e depois do Pix. */}
      {Boolean(painel.config.chave) && painel.asaas.disponivel && (
        <ContaDeCartaoEBoleto conta={painel.asaas.conta} depois={ler} />
      )}
      {voltar && <span><Btn variant="ghost" size="sm" onClick={voltar}>Voltar para a lista</Btn></span>}
    </div>
  );
}

/* ───────────────────────────── para conferir ───────────────────────────── */

function ParaConferir({ painel, ler, mobile }: { painel: Painel; ler: () => void; mobile: boolean }) {
  const total = painel.comprovantes.length + painel.paraDecidir.length;
  if (!total) {
    return (
      <EmptyState
        title="Nada para conferir"
        sub="Quando um cliente mandar o comprovante, ou um atendimento acabar sem você dizer se foi pago, ele aparece aqui."
        semSaida="a saída são os outros dois filtros, logo acima"
      />
    );
  }
  return (
    <div style={s(LISTA)}>
      {painel.comprovantes.map((x, i) => (
        <LinhaDoComprovante key={x.id} c={x} abertos={painel.abertos} depois={ler} ultima={i === total - 1} />
      ))}
      {painel.paraDecidir.map((r, i) => (
        <LinhaDaPergunta key={r.id} r={r} depois={ler} mobile={mobile} ultima={painel.comprovantes.length + i === total - 1} />
      ))}
    </div>
  );
}

/**
 * O comprovante, posto ao lado do que o dono vai procurar no banco.
 *
 * A linha "Pix recebido de FULANO, + R$ 50,00" é o centro: é ela que ele acha no extrato, e só
 * então confirma. O que a MAISA leu e não bate (quem recebeu, o valor) vem logo embaixo, em âmbar.
 */
function LinhaDoComprovante({ c, abertos, depois, ultima }: { c: ComprovanteDePagamento; abertos: Recebimento[]; depois: () => void; ultima: boolean }) {
  const doTelefone = abertos.filter((r) => chaveDe(r.telefone) === chaveDe(c.telefone));
  const [alvo, setAlvo] = useState(c.recebimentoId ?? doTelefone[0]?.id ?? "");
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { ocupado, agir } = useComprovante(c.id, depois);
  const selo = SELO[c.conferencia];
  const cobranca = doTelefone.find((r) => r.id === alvo) ?? null;
  const valorDiferente = c.valor != null && cobranca != null && Math.abs(c.valor - cobranca.valor) >= 0.01;
  /* O código da transação contra o banco, a data e a hora da cobrança (`conferirCodigoDoPix`). */
  const codigo = conferirCodigoDoPix(c, { recebidoEm: c.criadoEm, cobrancaEnviadaEm: cobranca?.criadoEm ?? null });
  const lido = [c.banco, c.recebedorNome ? `para ${c.recebedorNome}` : null].filter(Boolean).join(" · ");

  return (
    <div style={s(`${borda(ultima)}padding:16px 18px;display:flex;flex-direction:column;gap:12px`)}>
      <div style={s("display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap")}>
        <span style={s("flex:1 1 220px;min-width:0")}>
          <span style={s(NOME)}>{quem(c)} mandou um comprovante</span>
          <span style={s(SUB)}>chegou {haQuanto(c.criadoEm)}{lido ? ` · ${lido}` : ""}</span>
        </span>
        <span style={s("display:flex;flex-wrap:wrap;gap:6px 14px")}>
          <Estado forma={selo.forma} tom={selo.tom}>{selo.texto}</Estado>
          {codigo.situacao === "confere" && <Estado forma="disco" tom="success">Código do Pix confere</Estado>}
          {codigo.situacao === "nao_confere" && <Estado forma="triangulo" tom="warn">Código do Pix não bate</Estado>}
        </span>
      </div>

      <div style={s("display:flex;flex-direction:column;gap:6px;max-width:560px")}>
        <span style={s("font-size:var(--t-label);color:var(--muted)")}>Procure no seu extrato</span>
        <div style={s("display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;gap:14px;padding:11px 14px;border-radius:var(--r-controle);background:var(--surface-2)")}>
          <span className="n" style={s("font-size:var(--t-label);color:var(--muted)")}>{diaMes(c.pagoEm) ?? "sem data"}</span>
          <span style={s("min-width:0;font-size:var(--t-sm);overflow-wrap:anywhere")}>
            Pix recebido{c.pagadorNome ? <> de <b style={s("font-weight:var(--w-title)")}>{c.pagadorNome}</b></> : ""}
          </span>
          <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap")}>
            {c.valor != null ? `+ ${fmt(c.valor)}` : "valor ilegível"}
          </span>
        </div>
        {c.conferencia === "nao_confere" && (
          <span style={s("font-size:var(--t-label);color:var(--warn)")}>No comprovante, quem recebeu não parece ser você.</span>
        )}
        {codigo.motivos.map((m) => (
          <span key={m} style={s("font-size:var(--t-label);color:var(--warn)")}>{m}</span>
        ))}
        {valorDiferente && (
          <span style={s("font-size:var(--t-label);color:var(--warn)")}>
            O comprovante diz {fmt(c.valor!)}, e a cobrança é de {fmt(cobranca!.valor)}.
          </span>
        )}
      </div>

      {!descartando ? (
        <div style={s("display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap")}>
          <span style={s("flex:1 1 220px;min-width:0;font-size:var(--t-sm);color:var(--muted)")}>
            {doTelefone.length > 1 ? (
              <select
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                aria-label="Qual cobrança este comprovante paga"
                className="n m-focus"
                style={s("max-width:100%;height:36px;padding:0 10px;border-radius:var(--r-controle);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink)")}
              >
                {doTelefone.map((r) => <option key={r.id} value={r.id}>Paga {r.descricao} · {fmt(r.valor)}</option>)}
              </select>
            ) : cobranca ? (
              <>Paga <span style={s("color:var(--ink)")}>{cobranca.descricao}</span> · <span className="n">{fmt(cobranca.valor)}</span></>
            ) : (
              "Este telefone não tem cobrança em aberto."
            )}
          </span>
          <Btn
            size="sm"
            variant="secondary"
            icon="check"
            disabled={ocupado || !alvo}
            motivo="Sem cobrança em aberto: descarte, ou mande o Pix primeiro."
            onClick={() => agir({ acao: "confirmar", recebimentoId: alvo }, (r) => fraseDoDocumento(r.documento ?? { tipo: "nenhum" }))}
          >
            Achei, confirmar
          </Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setDescartando(true)}>Descartar</Btn>
        </div>
      ) : (
        <div style={s("display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap")}>
          <label style={s("flex:1 1 240px;display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
            Por que descartar? Fica anotado.
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Escreva o motivo…"
              className="m-focus"
              style={s("height:36px;padding:0 12px;border-radius:var(--r-controle);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink)")}
            />
          </label>
          <Btn size="sm" variant="danger" disabled={ocupado || !motivo.trim()} onClick={() => agir({ acao: "descartar", motivo }, () => "Comprovante descartado.")}>
            Descartar
          </Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setDescartando(false)}>Voltar</Btn>
        </div>
      )}
    </div>
  );
}

/** O atendimento que acabou e espera o dono dizer se foi pago (o barbeiro que recebe na hora). */
function LinhaDaPergunta({ r, depois, mobile, ultima }: { r: Recebimento; depois: () => void; mobile: boolean; ultima: boolean }) {
  const { ocupado, decidir } = useDecisao(r.id, false, depois);
  return (
    <Linha
      ultima={ultima}
      mobile={mobile}
      nome={quem(r)}
      sub={`${r.descricao} · já está pago?`}
      valor={fmt(r.valor)}
      acoes={
        <>
          <Btn size="sm" variant="secondary" icon="check" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir("pix")}>Mandar Pix</Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir("nao_cobrar")}>Não cobrar</Btn>
        </>
      }
    />
  );
}

/* ───────────────────────────── esperando ───────────────────────────── */

function Esperando({ painel, ler, mobile }: { painel: Painel; ler: () => void; mobile: boolean }) {
  if (!painel.abertos.length) {
    return (
      <EmptyState
        title="Ninguém com Pix em aberto"
        sub="Toda cobrança que a MAISA manda fica aqui até o pagamento chegar."
        semSaida="a saída são os outros dois filtros, logo acima"
      />
    );
  }
  /* A mais antiga primeiro: é a que mais precisa de você. */
  const lista = [...painel.abertos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return (
    <div style={s(LISTA)}>
      {lista.map((r, i) => <LinhaDoAberto key={r.id} r={r} depois={ler} mobile={mobile} ultima={i === lista.length - 1} />)}
    </div>
  );
}

function LinhaDoAberto({ r, depois, mobile, ultima }: { r: Recebimento; depois: () => void; mobile: boolean; ultima: boolean }) {
  const { ocupado, decidir } = useDecisao(r.id, true, depois);
  const atrasado = Date.now() - Date.parse(r.criadoEm) > DIA_MS;
  return (
    <Linha
      ultima={ultima}
      mobile={mobile}
      nome={quem(r)}
      sub={`${r.descricao} · ${r.meio === "asaas" ? "link" : "Pix"} enviado ${haQuanto(r.criadoEm)}`}
      marca={atrasado ? <Estado forma="triangulo" tom="warn">Sem pagamento</Estado> : <Estado forma="anel" tom="primary">Esperando</Estado>}
      valor={fmt(r.valor)}
      acoes={
        <>
          <Btn size="sm" variant="secondary" icon="check" disabled={ocupado} onClick={() => decidir("pagou")}>Já pagou</Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir("pix")}>Mandar de novo</Btn>
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir("nao_cobrar")}>Não cobrar</Btn>
        </>
      }
    />
  );
}

/** Uma linha com ações: quem, o quê, o valor numa coluna, e os botões. No celular, os botões descem. */
function Linha({ nome, sub, marca, valor, acoes, mobile, ultima }: {
  nome: string; sub: string; marca?: React.ReactNode; valor: string; acoes: React.ReactNode; mobile: boolean; ultima: boolean;
}) {
  if (mobile) {
    return (
      <div style={s(`${borda(ultima)}padding:14px;display:flex;flex-direction:column;gap:10px`)}>
        <span style={s("display:flex;align-items:baseline;gap:10px")}>
          <span style={s(`${NOME};flex:1`)}>{nome}</span>
          <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{valor}</span>
        </span>
        <span style={s(SUB)}>{sub}</span>
        {marca}
        <span style={s("display:flex;gap:8px;flex-wrap:wrap")}>{acoes}</span>
      </div>
    );
  }
  return (
    <div style={s(`${borda(ultima)}min-height:64px;padding:10px 18px;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.7fr) 110px auto;align-items:center;gap:16px`)}>
      <span style={s("min-width:0")}>
        <span style={s(NOME)}>{nome}</span>
        <span style={s(SUB)}>{sub}</span>
      </span>
      <span>{marca}</span>
      <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-title);text-align:right")}>{valor}</span>
      <span style={s("display:flex;gap:6px;justify-content:flex-end")}>{acoes}</span>
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
