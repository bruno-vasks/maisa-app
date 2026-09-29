"use client";
/* MAISA — Fluxo de hoje.
 *
 * A tela que abre o app. Responde "quem agora?" e "o que precisa de mim?":
 *   • a faixa AGORA: quem está em atendimento e o próximo, com o único primário da tela
 *   • a lista do dia, por hora, em linhas de 56px: os que passaram sem chegada (âmbar), os que
 *     vêm, e os feitos recolhidos numa linha
 *   • "Precisa de você": o que a MAISA NÃO resolveu sozinha
 *
 * ── POR QUE NÃO É MAIS UM QUADRO (25/09/2026, 1C.6, 02 P0-1) ──
 *
 * Era um kanban de três colunas (Chegando → Em atendimento → Feito), arrastável, ordenado por
 * etapa e hora, que não lia o relógio. Quem não apertava "Chegou" em todo cliente acumulava em
 * "Chegando" o dia que já tinha passado, e às 16h o próximo de verdade era o 12º cartão de uma
 * coluna que mostrava 4 (1, com a jornada aberta). Agora o dia se divide pelo agora
 * (`partesDoDia`, `estado/leitura.ts`, com teste), e o arrastar saiu: o botão faz o mesmo
 * movimento, que é sempre para frente, e funciona no toque.
 *
 * Um estado só para Fluxo e Agenda: o botão mexe no MESMO `st.agendamentos` que a Agenda lê.
 *
 * ⚠️ Esta lista é dos ATENDIMENTOS DE CLIENTE, e só deles. Os compromissos lidos da agenda do
 * Google (dentista, almoço, reunião) aparecem na Agenda, em cinza, e não aqui: "Chegou" não é
 * uma frase que se possa dizer sobre eles. Por isso o estado vazio menciona quantos são: sem
 * essa linha, um dia vazio com agenda cheia lê como "a MAISA não está enxergando meu calendário".
 *
 * ── ENQUADRAMENTO ──
 *
 * Desktop: a coluna do dia é uma `Moldura` (jornada e faixa Agora no cabeçalho, que não rola; a
 * lista é a região, e abre rolada até agora) e a fila é a outra coluna, com a própria rolagem.
 * Duas regiões, uma por coluna, como em Conversas (exceção declarada de T1).
 * Celular: a página rola, na ordem Agora → fila (até 3 linhas e "Ver todas") → dia. */

import React, { useEffect, useRef, useState } from "react";
import { Lateral, CabecalhoDaLateral } from "@/ui/componentes/Lateral";
import { s, Icon, Monogram, Btn, EmptyState, Estado, fmt } from "@/ui/primitivos";
import { useIsMobile } from "@/ui/useIsMobile";
import { partesDoDia, semConfirmacao } from "@/ui/estado/leitura";
import * as D from "@/adaptadores/saida/demo";
import { useStore, type AgendamentoVivo } from "@/ui/estado/store";
import { JornadaDeAtivacao } from "@/ui/componentes/JornadaDeAtivacao";
import { Moldura } from "@/ui/componentes/Moldura";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import { FRASE, TITULO_PARADA, useAcaoDoStatus } from "@/ui/componentes/StatusDaMaisa";
import { estadoDaFila, estadoDoDia, FRASE_ERRO_AGENDA } from "@/ui/estado/leitura";

/* O verbo que avança cada etapa. "Feito" não avança: é o fim. */
const VERBO: Record<D.Etapa, string | null> = { chegando: "Chegou", atendendo: "Concluir", feito: null };

/** Mostrar de quem é o atendimento só quando há mais de uma pessoa atendendo (02 #13): no
 *  negócio de um profissional só, o monograma repetido em toda linha não diz nada. */
function useComEquipe(): boolean {
  const st = useStore();
  return st.cadastro.profissionais.filter((p) => p.ativo).length > 1;
}

/* ───────────────────────────── a faixa Agora ───────────────────────────── */

function LinhaDaFaixa({ ag, rotulo, primaria, mobile }: { ag: AgendamentoVivo; rotulo: string; primaria: boolean; mobile: boolean }) {
  const st = useStore();
  const equipe = useComEquipe();
  const verbo = VERBO[ag.etapa];
  const alvo = mobile ? 48 : 44;
  return (
    <div style={s(`display:flex;align-items:center;gap:${mobile ? "10px 12px" : "16px"};flex-wrap:${mobile ? "wrap" : "nowrap"}`)}>
      <button
        type="button"
        onClick={() => st.abrir(ag.id)}
        aria-label={`${ag.cliente.nome}, ${D.hhmm(ag.inicio)}, ${ag.servico.nome}`}
        className="m-hov-bg m-press m-focus"
        style={s("flex:1 1 220px;min-width:0;display:flex;align-items:center;gap:14px;border:none;background:transparent;border-radius:var(--r-controle);padding:4px 6px;margin:-4px -6px;text-align:left;cursor:pointer;color:var(--ink)")}
      >
        <span className="n" style={s("font-size:var(--t-title);font-weight:var(--w-emph);line-height:1;min-width:64px")}>{D.hhmm(ag.inicio)}</span>
        <span style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:3px")}>
          <span style={s("font-size:var(--t-body);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{ag.cliente.nome}</span>
          <span style={s("display:flex;align-items:center;gap:10px;min-width:0")}>
            <span style={s("font-size:var(--t-sm);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")}>{ag.servico.nome}</span>
            <Estado forma={ag.etapa === "atendendo" ? "disco" : "anel"} tom={ag.etapa === "atendendo" ? "primary" : "neutral"}>{rotulo}</Estado>
            {semConfirmacao(ag) && <Estado forma="triangulo" tom="warn">sem confirmação</Estado>}
          </span>
        </span>
        {equipe && <span title={ag.profissional.nome}><Monogram name={ag.profissional.nome} id={ag.profissionalId} size={28} radius={8} /></span>}
      </button>
      {verbo && (
        <button
          type="button"
          onClick={() => st.avancarEtapa(ag.id)}
          className={`${primaria ? "m-hov-primary" : "m-hov-bg"} m-press m-focus`}
          style={s(`height:${alvo}px;padding:0 20px;border-radius:var(--r-controle);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;white-space:nowrap;${mobile ? "flex:1 1 100%;" : "flex-shrink:0;min-width:120px;"}${primaria ? "border:none;background:var(--primary);color:var(--on-primary)" : "border:1px solid var(--border);background:var(--surface);color:var(--ink)"}`)}
        >
          {verbo}
        </button>
      )}
    </div>
  );
}

function FaixaAgora({ atendendo, proximo, mobile }: { atendendo: AgendamentoVivo[]; proximo: AgendamentoVivo | null; mobile: boolean }) {
  /* Um primário só: o "Concluir" de quem está em atendimento, senão o "Chegou" do próximo. */
  const linhas = [
    ...atendendo.map((ag) => ({ ag, rotulo: "em atendimento" })),
    ...(proximo ? [{ ag: proximo, rotulo: "próximo" }] : []),
  ];
  return (
    <section
      aria-label="Agora"
      style={s(`flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:${mobile ? "12px 14px 14px" : "14px 18px 16px"};display:flex;flex-direction:column;gap:14px`)}
    >
      <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>Agora</span>
      {linhas.length ? (
        linhas.map((l, i) => <LinhaDaFaixa key={l.ag.id} ag={l.ag} rotulo={l.rotulo} primaria={i === 0} mobile={mobile} />)
      ) : (
        <span style={s("font-size:var(--t-body);font-weight:var(--w-title)")}>Ninguém mais por hoje.</span>
      )}
    </section>
  );
}

/* ───────────────────────────── a lista do dia ───────────────────────────── */

/** Uma linha do dia, 56px. O nome abre a gaveta; a ação é irmã, nunca botão dentro de botão. */
function LinhaDoDia({ ag }: { ag: AgendamentoVivo }) {
  const st = useStore();
  const equipe = useComEquipe();
  const verbo = VERBO[ag.etapa];
  return (
    <div style={s("min-height:56px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line)")}>
      <button
        type="button"
        onClick={() => st.abrir(ag.id)}
        aria-label={`${ag.cliente.nome}, ${D.hhmm(ag.inicio)}, ${ag.servico.nome}`}
        className="m-hov-bg m-press m-focus"
        style={s("flex:1;min-width:0;min-height:56px;display:flex;align-items:center;gap:14px;border:none;background:transparent;border-radius:var(--r-controle);padding:0 8px;text-align:left;cursor:pointer;color:var(--ink)")}
      >
        <span className="n" style={s("font-size:var(--t-body);font-weight:var(--w-data);min-width:46px")}>{D.hhmm(ag.inicio)}</span>
        <span style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:1px")}>
          {/* Nome longo quebra em até duas linhas em vez de virar "Rodrigo Albuquer…" a 390px. */}
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere")}>{ag.cliente.nome}</span>
          {/* ⚠️ A marca mora na linha do serviço, não ao lado do nome (28/09/2026, regressão 3 da
              verificação da Onda 1): a 390px, "sem confirmação" e o "Chegou" deixavam "Felipe …"
              do nome. O nome fica com a largura inteira; sem espaço, a marca desce para a linha de
              baixo (`flex-wrap`) e nem o serviço corta. */}
          <span style={s("display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;min-width:0")}>
            <span style={s("min-width:0;font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{ag.servico.nome}</span>
            {semConfirmacao(ag) && <span style={s("flex-shrink:0;display:flex")}><Estado forma="triangulo" tom="warn">sem confirmação</Estado></span>}
            {ag.etapa === "feito" && <span style={s("flex-shrink:0;display:flex")}><Estado forma="disco" tom="success">feito</Estado></span>}
          </span>
        </span>
        {equipe && <span title={ag.profissional.nome}><Monogram name={ag.profissional.nome} id={ag.profissionalId} size={24} radius={6} /></span>}
      </button>
      {verbo && (
        <button
          type="button"
          onClick={() => st.avancarEtapa(ag.id)}
          className="m-hov-bg m-press m-focus"
          style={s("flex-shrink:0;height:44px;min-width:88px;padding:0 14px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:var(--r-controle);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;white-space:nowrap")}
        >
          {verbo}
        </button>
      )}
    </div>
  );
}

/** O título do grupo gruda no topo da região enquanto o grupo passa: a lista abre rolada até
 *  agora, e sem isso as linhas âmbar apareciam sem dizer o que são. */
function TituloDoGrupo({ children, n, tom }: { children: React.ReactNode; n: number; tom?: "warn" }) {
  return (
    <div data-titulo-grupo="" className="m-grudado" style={s(`display:flex;align-items:center;gap:8px;padding:0 8px;min-height:36px;background:${tom === "warn" ? "var(--warn-soft)" : "var(--bg)"}`)}>
      {tom === "warn" && <Icon name="alert" size={15} style={s("color:var(--warn)")} />}
      <span style={s(`font-size:var(--t-sm);font-weight:var(--w-title);color:${tom === "warn" ? "var(--warn)" : "var(--ink)"}`)}>{children}</span>
      <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-data);color:var(--muted)")}>{n}</span>
    </div>
  );
}

/** A lista do dia. `ancora` marca o fim do que vem, para a região abrir rolada até agora. */
function ListaDoDia({ passaram, depois, feitos, ancora, proximosPrimeiro }: {
  passaram: AgendamentoVivo[]; depois: AgendamentoVivo[]; feitos: AgendamentoVivo[];
  ancora?: React.Ref<HTMLDivElement>;
  /** No celular "A seguir" vem antes de "Passaram sem chegada": a página rola do topo, e onze
   *  linhas do que passou empurravam o que vem para a quarta tela. No desktop a ordem é a da
   *  hora e a região abre rolada até agora. */
  proximosPrimeiro?: boolean;
}) {
  const [verFeitos, setVerFeitos] = useState(false);
  /* O total só quando toda sessão trouxe o valor: somar metade e chamar de "hoje" seria o número
   * inventado que 1A.5 tirou da gaveta. */
  const valores = feitos.map((a) => a.valor);
  const total = valores.length && valores.every((v) => v != null) ? valores.reduce<number>((t, v) => t + (v ?? 0), 0) : null;
  const blocoPassaram = passaram.length ? (
    <section aria-label="Passaram sem chegada" style={s("background:var(--warn-soft);border-radius:var(--r-painel);padding:4px 8px")}>
      <TituloDoGrupo n={passaram.length} tom="warn">Passaram sem chegada</TituloDoGrupo>
      {passaram.map((ag) => <LinhaDoDia key={ag.id} ag={ag} />)}
    </section>
  ) : null;
  return (
    <div style={s("display:flex;flex-direction:column;gap:18px")}>
      {!proximosPrimeiro && blocoPassaram}
      {!!depois.length && (
        <section aria-label="A seguir">
          <TituloDoGrupo n={depois.length}>A seguir</TituloDoGrupo>
          {depois.map((ag) => <LinhaDoDia key={ag.id} ag={ag} />)}
        </section>
      )}
      {/* Sem altura e sem gap próprio: é só o ponto "agora" da lista, para a região abrir nele. */}
      <div ref={ancora} aria-hidden style={s("margin-top:-18px")} />
      {proximosPrimeiro && blocoPassaram}
      {!!feitos.length && (
        <section aria-label="Feitos hoje">
          <button
            type="button"
            onClick={() => setVerFeitos((v) => !v)}
            aria-expanded={verFeitos}
            className="m-hov-bg m-press m-focus"
            style={s("width:100%;min-height:48px;display:flex;align-items:center;gap:10px;border:none;background:transparent;border-radius:var(--r-controle);padding:0 8px;cursor:pointer;color:var(--ink);text-align:left")}
          >
            <span style={s("flex:1;font-size:var(--t-sm);font-weight:var(--w-title)")}>
              <span className="n">{feitos.length}</span> {feitos.length === 1 ? "feito" : "feitos"} hoje{total != null && <span className="n" style={s("color:var(--muted);font-weight:var(--w-data)")}> · {fmt(total)}</span>}
            </span>
            <Icon name="chevron-down" size={16} style={s(`transform:rotate(${verFeitos ? 180 : 0}deg)`)} />
          </button>
          {verFeitos && feitos.map((ag) => <LinhaDoDia key={ag.id} ag={ag} />)}
        </section>
      )}
    </div>
  );
}

/* ───────────────────────────── painel da fila ───────────────────────────── */

function PrecisaDeVoce() {
  const st = useStore();
  const fila = st.fila;
  const acao = useAcaoDoStatus();
  /* ⚠️ "Nada pendente" é uma AFIRMAÇÃO, e só vale com as duas leituras de volta (conversas e
   * agenda), sem erro, e com a MAISA atendendo de verdade. Até 24/09/2026 era só
   * `fila.length === 0`: a tela dizia "resolvendo tudo sozinha" num demo sem WhatsApp e antes de
   * qualquer leitura voltar. Ver `estadoDaFila`. */
  const estado = estadoDaFila({
    itens: fila.length,
    conversas: { carregadas: st.conversasCarregadas, erro: st.conversasErro },
    agenda: st.leituraAgenda,
    status: st.statusMaisa,
  });
  const tentar = () => { st.recarregarConversas(); st.recarregarAgenda(); };

  return (
    <>
      <CabecalhoDaLateral>
        <span style={s("font-size:var(--t-body);font-weight:var(--w-title)")}>Precisa de você</span>
        {fila.length > 0 && <span className="n" style={s("font-size:var(--t-body);font-weight:var(--w-data);color:var(--warn)")}>{fila.length}</span>}
      </CabecalhoDaLateral>

      <div style={s("flex:1;min-height:0;overflow-y:auto;position:relative;padding:14px;display:flex;flex-direction:column;gap:10px")}>
        {estado === "carregando" ? (
          <Esqueleto linhas={2} altura={96} rotulo="Lendo o que precisa de você" />
        ) : estado === "erro" ? (
          <FalhaDeLeitura
            compacta
            frase="Não consegui ler o que precisa de você."
            detalhe={st.conversasErro ?? st.leituraAgenda.info}
            tentar={tentar}
          />
        ) : estado === "sem_maisa" ? (
          <div style={s("padding:16px 6px;display:flex;flex-direction:column;align-items:flex-start;gap:10px")}>
            <span style={s("font-size:var(--t-body);font-weight:var(--w-title)")}>
              {TITULO_PARADA[st.statusMaisa === "pausada" ? "pausada" : "sem_whatsapp"]}
            </span>
            <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-ui)")}>
              {FRASE[st.statusMaisa === "pausada" ? "pausada" : "sem_whatsapp"]}
            </span>
            {acao && <Btn variant="secondary" onClick={acao.fazer}>{acao.rotulo}</Btn>}
          </div>
        ) : estado === "vazio" ? (
          <div style={s("padding:16px 6px;display:flex;flex-direction:column;align-items:flex-start;gap:6px")}>
            <span style={s("font-size:var(--t-body);font-weight:var(--w-title)")}>Nada pendente</span>
            <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-ui)")}>
              Ninguém está esperando resposta.
            </span>
          </div>
        ) : fila.map((f) => (
          <div
            key={f.id}
            style={s("border:1px solid var(--border);border-radius:var(--r-painel);background:var(--bg);display:flex;flex-direction:column")}
          >
            <button
              onClick={() => st.abrir(f.alvo)}
              className="m-press m-focus m-lift"
              style={s("text-align:left;border:none;background:transparent;padding:14px 14px 10px;display:flex;flex-direction:column;gap:8px;cursor:pointer;border-radius:var(--r-painel)")}
            >
              <span style={s("display:flex;align-items:center;gap:10px;width:100%")}>
                <span style={s("flex:1;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{f.titulo}</span>
                <Estado forma="triangulo" tom="warn">{f.tag}</Estado>
              </span>
              <span style={s("font-size:var(--t-sm);line-height:var(--lh-prose);color:var(--muted);text-align:left")}>{f.msg}</span>
            </button>
            <div style={s("display:flex;justify-content:flex-end;padding:0 12px 10px")}>
              <button
                onClick={() => st.resolverFila(f.alvo)}
                className="m-hov-bg m-press m-focus"
                style={s("border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:var(--r-controle);font-size:var(--t-label);font-weight:var(--w-title);padding:6px 12px;cursor:pointer")}
              >
                Já resolvi
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** No celular a fila vem resumida (02 P0-3): até três linhas de 64px e "Ver todas", que abre a
 *  fila inteira na gaveta ("fila", `detalhe.tsx`). Antes ela vinha inteira antes do dia, com
 *  ~157px por item, e o primeiro atendimento ficava a 1441px do topo. */
const FILA_NO_CELULAR = 3;
function FilaResumida() {
  const st = useStore();
  const fila = st.fila;
  if (!fila.length) return null;
  return (
    <section aria-label="Precisa de você" style={s("flex-shrink:0;display:flex;flex-direction:column")}>
      <div style={s("display:flex;align-items:center;gap:8px;min-height:44px")}>
        <span style={s("font-size:var(--t-body);font-weight:var(--w-title)")}>Precisa de você</span>
        <span className="n" style={s("font-size:var(--t-body);font-weight:var(--w-data);color:var(--warn)")}>{fila.length}</span>
        {fila.length > FILA_NO_CELULAR && (
          <button
            type="button"
            onClick={() => st.abrir("fila")}
            className="m-hov-bg m-press m-focus"
            style={s("margin-left:auto;height:44px;padding:0 10px;border:none;background:transparent;border-radius:var(--r-controle);color:var(--primary-dark);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer")}
          >
            Ver todas
          </button>
        )}
      </div>
      {fila.slice(0, FILA_NO_CELULAR).map((f) => (
        <div key={f.id} style={s("min-height:64px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)")}>
          <button
            type="button"
            onClick={() => st.abrir(f.alvo)}
            className="m-hov-bg m-press m-focus"
            style={s("flex:1;min-width:0;min-height:64px;display:flex;flex-direction:column;justify-content:center;gap:3px;border:none;background:transparent;border-radius:var(--r-controle);padding:0 4px;text-align:left;cursor:pointer;color:var(--ink)")}
          >
            <span style={s("display:flex;align-items:center;gap:8px;min-width:0")}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")}>{f.titulo}</span>
              <Estado forma="triangulo" tom="warn">{f.tag}</Estado>
            </span>
            <span style={s("font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{f.msg}</span>
          </button>
          <button
            type="button"
            onClick={() => st.resolverFila(f.alvo)}
            className="m-hov-bg m-press m-focus"
            style={s("flex-shrink:0;height:44px;padding:0 12px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:var(--r-controle);font-size:var(--t-label);font-weight:var(--w-title);cursor:pointer;white-space:nowrap")}
          >
            Já resolvi
          </button>
        </div>
      ))}
    </section>
  );
}

/* ───────────────────────────── tela ───────────────────────────── */

export default function FluxoHoje() {
  const st = useStore();
  const mobile = useIsMobile();

  // `st.agendamentos` é a JANELA visível da Agenda (a Agenda ganhou Semana e Mês). O Fluxo é de
  // hoje e continua sendo: sem este recorte a lista encheria com trinta dias.
  // O store garante que hoje está sempre na lista, mesmo com a Agenda aberta em outro mês.
  const doDia = st.agendamentosDoDia(D.HOJE.iso);
  const partes = partesDoDia(doDia);

  /* O dia sem nenhum atendimento é o estado NORMAL de um app recém-aberto, e esta é a tela de
   * entrada. O vazio diz o que está acontecendo, quantos compromissos o Google tem hoje, e para
   * onde ir. */
  const bloqHoje = st.bloqueiosDoDia(D.HOJE.iso);
  /* ⚠️ O vazio só depois da leitura. Antes, `doDia` vazio era "Nenhum atendimento marcado" no
   * primeiro quadro, antes de `/api/agenda` voltar, e para sempre quando ela falhava. */
  const dia = estadoDoDia(st.leituraAgenda, doDia.length);
  const antesDoDia = dia === "carregando"
    ? <Esqueleto linhas={5} altura={56} rotulo="Lendo a agenda de hoje" />
    : dia === "erro"
      ? <FalhaDeLeitura frase={FRASE_ERRO_AGENDA} detalhe={st.leituraAgenda.info} tentar={st.recarregarAgenda} />
      : null;
  const vazio = (
    <EmptyState
      title="Nenhum atendimento marcado para hoje"
      sub={
        bloqHoje.length
          ? `Sua agenda do Google tem ${bloqHoje.length} ${bloqHoje.length === 1 ? "compromisso" : "compromissos"} hoje, em cinza na Agenda. Aqui entram só os atendimentos de cliente.`
          : "Marque um horário na Agenda e ele aparece aqui."
      }
      action={<Btn icon="calendar" onClick={() => st.irPara("agenda")}>Abrir a Agenda</Btn>}
    />
  );

  /* A lista abre rolada até agora (02 #5): o fim do que vem encosta no pé da região, e o que
   * passou por último fica logo acima. Só no desktop (no celular a página é que rola, e a ordem
   * já põe o Agora em cima). A região muda de altura depois da montagem (a jornada chega com
   * `/api/ativacao`, a faixa Agora cresce com quem entra em atendimento), então o alinhamento se
   * refaz a cada mudança de tamanho, até a pessoa rolar com a mão: daí a rolagem é dela. */
  const ancora = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobile || dia !== "cheio") return;
    const regiao = ancora.current?.closest<HTMLElement>("[data-regiao]");
    if (!regiao) return;
    let minha = false;
    let dela = false;
    const alinhar = () => {
      const el = ancora.current;
      if (dela || !el) return;
      const topo = regiao.getBoundingClientRect().top - regiao.scrollTop;
      const noConteudo = (b: DOMRect) => ({ top: b.top - topo, bottom: b.bottom - topo });
      const fim = noConteudo(el.getBoundingClientRect()).bottom;
      let alvo = Math.max(0, Math.round(fim - regiao.clientHeight + 24));
      /* Linha cortada pelo título grudado (regressão 2, 28/09/2026): a abertura parava com
       * "Rodrigo Albuquerque Neto" pela metade embaixo de "Passaram sem chegada". Na rolagem alvo,
       * o título de um grupo que começa acima do topo gruda de `alvo` a `alvo + altura`; a linha
       * que atravessa essa borda passa inteira para baixo dele, ou aparece inteira. Conta feita nas posições do fluxo
       * (o sticky não as move), antes de rolar: uma escrita só, e o `aoRolar` não se confunde. */
      for (const h of regiao.querySelectorAll<HTMLElement>("[data-titulo-grupo]")) {
        const grupo = noConteudo(h.parentElement!.getBoundingClientRect());
        const altura = h.getBoundingClientRect().height;
        if (!(grupo.top < alvo && grupo.bottom > alvo + altura)) continue;
        const borda = alvo + altura;
        const cortada = [...h.parentElement!.children].slice(1)
          .map((l) => noConteudo(l.getBoundingClientRect()))
          .find((b) => b.top < borda - 1 && b.bottom > borda + 1);
        if (!cortada) continue;
        /* Para baixo quando cabe; no fim da lista (a rolagem já está no máximo, o caso das 16h
         * com o dia cheio) sobe até a linha aparecer inteira logo abaixo do título. */
        const max = regiao.scrollHeight - regiao.clientHeight;
        alvo = cortada.bottom - altura <= max ? Math.ceil(cortada.bottom - altura) : Math.max(0, Math.floor(cortada.top - altura));
      }
      if (Math.abs(regiao.scrollTop - alvo) < 2) return;
      minha = true;
      regiao.scrollTop = alvo;
    };
    const aoRolar = () => { if (minha) { minha = false; return; } dela = true; };
    alinhar();
    const ro = new ResizeObserver(alinhar);
    ro.observe(regiao);
    regiao.addEventListener("scroll", aoRolar, { passive: true });
    return () => { ro.disconnect(); regiao.removeEventListener("scroll", aoRolar); };
  }, [mobile, dia]);

  const lista = dia === "cheio"
    ? <ListaDoDia passaram={partes.passaram} depois={partes.depois} feitos={partes.feitos} ancora={ancora} />
    : antesDoDia ?? vazio;
  const agora = dia === "cheio" ? <FaixaAgora atendendo={partes.atendendo} proximo={partes.proximo} mobile={mobile} /> : null;

  if (mobile) {
    return (
      <Moldura rotulo="Hoje">
        {/* Some sozinha aos 100%. Uma linha: a lista inteira é a gaveta "jornada". */}
        <JornadaDeAtivacao />
        {agora}
        <FilaResumida />
        {dia === "cheio" ? <ListaDoDia passaram={partes.passaram} depois={partes.depois} feitos={partes.feitos} proximosPrimeiro /> : lista}
      </Moldura>
    );
  }

  /* ⚠️ `minmax(0,1fr)` na linha e `min-height:0` em toda a cadeia até a região: sem eles a
   * coluna cresce até o tamanho da lista e nada rola (a região precisa de altura para rolar). */
  /* A coluna "Precisa de você" é a `<Lateral>` da casca desde 28/09/2026: sobe até o topo, ao
   * lado da topbar, com cabeçalho da mesma altura (ver `Lateral.tsx`). */
  return (
    <>
      <Moldura
        rotulo="Atendimentos de hoje"
        cabecalho={<><JornadaDeAtivacao />{agora}</>}
      >
        {lista}
      </Moldura>
      <Lateral rotulo="Precisa de você">
        <PrecisaDeVoce />
      </Lateral>
    </>
  );
}
