"use client";
/* MAISA — Agenda.
 *
 * A forma vem do calendário do Psico Manager: UM cartão de calendário com a barra
 * de navegação dentro dele (‹ · Hoje · › · rótulo do período · seletor de visão ·
 * ação primária) e um TRILHO de 340px à direita resumindo o período visível. O
 * token `--rail-side` já existia em globals.css descrevendo exatamente esse
 * layout ("Agenda/Calendário: conteúdo + trilho direito") e nunca tinha sido
 * usado por ninguém; agora é.
 *
 * A lógica de interação vem do InteractiveCalendar (ln-dev7/visualize-booking):
 *  • o contador de atendimentos do dia MORFA de selo de canto para disco central
 *    quando o mouse entra na célula — é um `layoutId` compartilhado entre os dois,
 *    então o motion interpola posição e tamanho em vez de trocar um pelo outro;
 *  • passar o mouse num dia FAZ AQUELE DIA SUBIR ao topo do trilho, com as linhas
 *    reordenando por `layout`. É o `sortedDays` do original: o calendário e a
 *    lista são duas vistas do mesmo hover;
 *  • o seletor de visão tem o indicador que DESLIZA por baixo dos rótulos, e não
 *    um fundo que pisca de um botão para o outro.
 *
 * O que NÃO veio do Psico Manager, de propósito:
 *  • a faixa `border-left:3px` colorida no bloco. É ban explícito do sistema
 *    ("nunca borda colorida só de um lado"); aqui o estado é tint de fundo +
 *    aresta inteira, como já era;
 *  • o creme e o papel. globals.css conta que essa paleta veio deste mesmo Psico
 *    Manager e SAIU — o navy é o sistema agora. Só a estrutura atravessou.
 *
 * Três coisas que o calendário de origem não tem e que ficam:
 *  • arrastar remarca de verdade — e agora atravessa o dia, não só a hora e o
 *    profissional;
 *  • passo de 30 min: cada hora tem duas zonas de soltura;
 *  • blocos sobrepostos escalonam para a direita em vez de um cobrir o outro. */

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { s, Icon, Monogram, Btn, IconBtn, Badge, EmptyState, Estado } from "@/ui/primitivos";
import { useIsMobile } from "@/ui/useIsMobile";
import { semConfirmacao } from "@/ui/estado/leitura";
import * as D from "@/adaptadores/saida/demo";
import { useStore, type AgendamentoVivo, type Bloqueio } from "@/ui/estado/store";
import { agendaComErro, FRASE_ERRO_AGENDA } from "@/ui/estado/leitura";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";

/** Janela DESENHADA na grade: 07:00 → 22:00, linha de 1h.
 *
 *  Era 09–19, a faixa do expediente. Deixou de servir quando a agenda passou a mostrar
 *  a agenda REAL do Google: um compromisso pessoal às 08:00 renderizava com `top`
 *  negativo, ou seja, por cima do cabeçalho das colunas. A grade desenha mais do que o
 *  expediente e marca visualmente o que está fora dele (ver `Vagos`).
 *
 *  Mora AQUI, e não no domínio, porque é geometria de tela: o expediente de verdade
 *  (quem atende, quando) é `D.EXPEDIENTE`. */
const AGENDA_INICIO = 7;
const AGENDA_HORAS = 15;

const LINHA = 64;   // altura de 1 hora, em px
const PASSO = 0.5;  // granularidade de remarcação, em horas
const CEL_MES = 84; // altura MÍNIMA da célula do mês — a linha cresce para preencher o cartão

type Visao = "dia" | "semana" | "mes";

const VISOES: [Visao, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
const SEG_W = 78; // largura fixa do segmento — é o que deixa o indicador deslizar por cálculo

/** Aparência do bloco conforme onde o atendimento está no dia.
 *  A semântica estava INVERTIDA: "atendendo" usava a cor de aviso (--warn-soft/--warm) e o
 *  não-confirmado — que é o aviso de verdade, porque é quem pode não aparecer — ficava em
 *  --surface neutro, com o âmbar como único portador do estado. E o âmbar sobre superfície clara
 *  dá 1,66:1: era um estado invisível. Agora "em atendimento" é atividade (primário) e
 *  "não confirmado" é aviso (warn). O âmbar saiu: ele tem dois empregos no app, marca e ação
 *  primária, e estado não é um deles. */
function tomDoBloco(ag: AgendamentoVivo): { bg: string; ac: string; fg: string } {
  if (ag.etapa === "feito") return { bg: "var(--success-soft)", ac: "var(--success)", fg: "var(--success)" };
  if (ag.etapa === "atendendo") return { bg: "var(--primary-soft)", ac: "var(--primary)", fg: "var(--primary-dark)" };
  if (semConfirmacao(ag)) return { bg: "var(--warn-soft)", ac: "var(--warn)", fg: "var(--warn)" };
  return { bg: "var(--surface-2)", ac: "var(--border)", fg: "var(--ink)" };
}

/** Só o que a grade precisa saber para empilhar: quando começa e quando acaba. */
type Ocupa = { id: string; inicio: number; fim: number };

/** Quantos blocos anteriores da coluna ainda estão em curso — define o recuo.
 *
 *  Recebe atendimentos E bloqueios juntos, de propósito: o dentista das 15h e o cliente
 *  das 15h são a MESMA pessoa em dois lugares, e escalonar cada lista por conta própria
 *  desenharia os dois no mesmo x, um cobrindo o outro. É justamente o conflito que a
 *  agenda existe para mostrar. */
function escalonar(blocos: Ocupa[]): Map<string, number> {
  const ordem = new Map<string, number>();
  const anteriores: Ocupa[] = [];
  for (const b of [...blocos].sort((x, y) => x.inicio - y.inicio)) {
    ordem.set(b.id, anteriores.filter((a) => a.fim > b.inicio).length);
    anteriores.push(b);
  }
  return ordem;
}

/* ───────────────────────────── peças compartilhadas ───────────────────────────── */

/** Régua de horas da esquerda. Uma só, para Dia e Semana não divergirem em altura. */
function Regua() {
  const horas = Array.from({ length: AGENDA_HORAS }, (_, i) => AGENDA_INICIO + i);
  return (
    <div style={s("display:flex;flex-direction:column")}>
      {horas.map((h) => (
        <div key={h} className="n" style={s(`height:${LINHA}px;font-size:var(--t-micro);color:var(--muted);text-align:right;padding-right:12px`)}>
          {D.hhmm(h)}
        </div>
      ))}
    </div>
  );
}

/** Os horários vagos de uma coluna — um a cada 30 min.
 *
 *  São <button> e não <div>: as 20 zonas só aceitavam `onDrop`, então MARCAR um horário — a ação
 *  nº1 de uma agenda — não existia em lugar nenhum do app. Clicar num vago abre a gaveta com dia,
 *  hora e profissional já resolvidos pelo próprio clique. Como <button>, também entram na ordem de
 *  Tab: é o único caminho de teclado que esta grade tem.
 *
 *  ⚠️ Aqui havia `onDragOver`/`onDrop` — remarcar arrastando. Saíram na fatia 4, quando o
 *  atendimento virou o próprio evento do Google: remarcar passou a ser PATCH numa agenda
 *  real e precisa da fila de escrita serializada que a fatia 5 traz. Enquanto isso, nada
 *  na tela promete que dá para arrastar. */
function Vagos({ data, profissionalId, chaveCol }: { data: string; profissionalId?: string; chaveCol: string }) {
  const st = useStore();
  const faltam = st.leituraAgenda.faltam ?? [];
  const fatias = AGENDA_HORAS / PASSO;
  return (
    <>
      {Array.from({ length: fatias }, (_, i) => {
        const inicio = AGENDA_INICIO + i * PASSO;
        const chave = `${chaveCol}@${inicio}`;
        const horaCheia = i % 2 === 0;
        // Na coluna de um PROFISSIONAL (visão de Dia) quem marca é ele. Na coluna de um DIA
        // (visão de Semana) o clique tem que ESCOLHER alguém — antes caía sempre em
        // COLUNAS_AGENDA[0], então toda marcação da semana ia para o Rafael, inclusive num
        // horário em que ele já tinha ido embora, e Diego e Léo eram inagendáveis por ali.
        // Agenda cuja leitura falhou não entra na escolha: o horário dela não foi lido (1A.4).
        const dono = profissionalId ?? st.cadastro.agendas.find((pid) => !faltam.includes(pid) && st.podeComecarEm(pid, data, inicio));
        const livre = !!dono && st.podeComecarEm(dono, data, inicio);
        const risco = s(`width:100%;height:${LINHA * PASSO}px;padding:0;border:none;border-bottom:1px ${horaCheia ? "dotted" : "solid"} var(--line)`);

        // Fora do expediente de todo mundo: faixa cinza, sem clique. Um clique aqui criaria
        // um atendimento sem ninguém para atender.
        //
        // A faixa é maior desde que a grade abriu para 07–22 para caber a agenda real: as
        // duas horas antes das 9 e as três depois das 19 ficam nesse cinza. É o desenho do
        // expediente aparecendo, e é o que impede o compromisso das 8h de renderizar fora
        // da grade.
        if (!livre) {
          return <div key={chave} style={{ ...risco, background: "var(--surface-2)", opacity: 0.5 }} />;
        }

        return (
          <button
            key={chave}
            onClick={() => st.novoAgendamento({ profissionalId: dono, inicio, data })}
            aria-label={`Marcar atendimento em ${D.rotuloDia(data)} às ${D.hhmm(inicio)} com ${D.primeiroNome(st.nomeDoProfissional(dono))}`}
            className="m-focus m-hov-bg"
            style={{ ...risco, background: "transparent", cursor: "pointer", transition: "background-color var(--dur-fast) var(--ease-out)" }}
          />
        );
      })}
    </>
  );
}

/** Um atendimento posicionado na grade de tempo.
 *
 *  ⚠️ Não é `draggable` desde a fatia 4. Ele deixou de ser um registro local e passou a ser
 *  o evento do Google: mover o bloco é PATCH numa agenda real, o que exige a fila de
 *  escrita da fatia 5. Um `draggable` que não escreve seria pior que a ausência dele — a
 *  tela mostraria o bloco no horário novo e o Google continuaria com o antigo, calado. */
function Bloco({ ag, recuo, mostrarProf }: { ag: AgendamentoVivo; recuo: number; mostrarProf?: boolean }) {
  const st = useStore();
  const tom = tomDoBloco(ag);
  const alto = ag.duracao >= 40;
  return (
    <div
      onClick={() => st.abrir(ag.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); st.abrir(ag.id); } }}
      aria-label={`${ag.cliente.nome}, ${D.hhmm(ag.inicio)}, ${ag.servico.nome}, ${D.primeiroNome(ag.profissional.nome)}`}
      className="m-focus m-lift"
      style={{
        // borda COMPLETA na cor do tom, não faixa lateral: `border-left:3px` como acento colorido
        // é ban explícito, e o elemento acumulava dois (side-stripe + ghost-card). O estado agora
        // vem do tint de fundo + a aresta inteira.
        ...s(`position:absolute;border-radius:12px;padding:8px 11px;overflow:hidden;cursor:pointer;background:${tom.bg};border:1px solid ${tom.ac};box-shadow:var(--shadow-card)`),
        top: (ag.inicio - AGENDA_INICIO) * LINHA + 3,
        height: Math.max((ag.duracao / 60) * LINHA - 6, 42),
        left: 6 + recuo * 12,
        right: 6,
        zIndex: 5 + recuo,
      }}
    >
      <div style={s(`font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${tom.fg};line-height:1.25`)}>
        {ag.cliente.nome}
      </div>
      {alto && (
        <div className="n" style={s(`font-size:var(--t-micro);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${tom.fg};opacity:.85;margin-top:1px`)}>
          {D.hhmm(ag.inicio)} · {mostrarProf ? D.primeiroNome(ag.profissional.nome) : ag.servico.nome}
        </div>
      )}
    </div>
  );
}

/**
 * Um compromisso do Google que não é atendimento da MAISA.
 *
 * Cinza, hachurado e SEM `draggable`. As três coisas dizem o mesmo: isto veio de fora e
 * não se mexe daqui. Arrastar faria PATCH no compromisso pessoal de alguém — o dentista,
 * o almoço, a reunião de outra empresa —, e um app de agenda de clientes não tem esse
 * direito. Ele ocupa o horário porque o horário está de fato ocupado; a MAISA precisa
 * saber disso para não oferecer as 15h que já têm dono.
 */
function BlocoBloqueio({ b, recuo }: { b: Bloqueio; recuo: number }) {
  const st = useStore();
  const alto = b.duracao >= 40;
  return (
    <div
      onClick={() => st.abrir(b.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); st.abrir(b.id); } }}
      aria-label={`${b.titulo}, ${D.hhmm(b.inicio)}, compromisso da sua agenda do Google`}
      className="m-focus"
      style={{
        ...s("position:absolute;border-radius:12px;padding:8px 11px;overflow:hidden;cursor:pointer;border:1px dashed var(--border);color:var(--muted)"),
        // Hachura diagonal em vez de cor cheia. A paleta do app já gasta cinza cheio em
        // "fora do expediente" e em "pausado"; a listra é a única marca que diz "de outra
        // fonte" sem inventar uma sétima cor de estado.
        background:
          "repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 6px, var(--bg) 6px, var(--bg) 12px)",
        top: (b.inicio - AGENDA_INICIO) * LINHA + 3,
        height: Math.max((b.duracao / 60) * LINHA - 6, 36),
        left: 6 + recuo * 12,
        right: 6,
        zIndex: 4 + recuo,
      }}
    >
      <div style={s("display:flex;align-items:center;gap:5px;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25")}>
        <Icon name="pin" size={12} sw={2} />
        <span style={s("overflow:hidden;text-overflow:ellipsis")}>{b.titulo}</span>
      </div>
      {alto && (
        <div className="n" style={s("font-size:var(--t-micro);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85;margin-top:1px")}>
          {D.hhmm(b.inicio)} · sua agenda
        </div>
      )}
    </div>
  );
}

/** Cabeçalho de uma coluna-dia (Semana). */
function CabecalhoDia({ data, onClick }: { data: string; onClick: () => void }) {
  const hoje = data === D.HOJE.iso;
  const dow = D.dowDoDia(data);
  return (
    <button
      onClick={onClick}
      aria-label={`Ver ${D.rotuloLongo(data)}`}
      className="m-hov-bg m-focus"
      style={s(`display:flex;flex-direction:column;align-items:center;gap:1px;padding:9px 4px;border:none;border-left:1px solid var(--line);background:${hoje ? "var(--primary-soft)" : "transparent"};cursor:pointer`)}
    >
      <span style={s(`font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);color:${hoje ? "var(--primary-dark)" : "var(--muted)"}`)}>
        {D.DOW_CURTO[dow]}
      </span>
      <span className="n" style={s(`font-size:var(--t-lg);font-weight:var(--w-emph);letter-spacing:var(--ls-lg);color:${hoje ? "var(--primary)" : "var(--ink)"}`)}>{D.diaDoMes(data)}</span>
    </button>
  );
}

/* ───────────────────────────── visão: dia ─────────────────────────────
 * Hora × profissional, que é a pergunta que o dono faz olhando o dia de hoje:
 * quem está livre agora. */

function GradeDia({ data }: { data: string }) {
  const st = useStore();
  const doDia = st.agendamentosDoDia(data);
  const bloqueios = st.bloqueiosDoDia(data);
  const faltam = st.leituraAgenda.faltam ?? [];
  const colunas = `58px repeat(${Math.max(st.cadastro.agendas.length, 1)},minmax(0,1fr))`;

  return (
    <div style={s("flex:1;min-height:0;overflow-y:auto;padding:0 16px 16px")}>
      <div style={s(`display:grid;grid-template-columns:${colunas};position:sticky;top:0;background:var(--surface);z-index:8;padding-top:12px`)}>
        <div />
        {st.cadastro.agendas.map((pid) => {
          // `agendas` e `profissionais` têm que andar juntos; se divergirem, pular a coluna
          // em vez de estourar num `!` que só existe no compilador.
          const p = st.profissionalDe(pid);
          if (!p) return <div key={pid} />;
          const on = st.profAtivo(pid);
          // Folga do dia visível — coisa diferente de "pausado", que é você ter desligado a pessoa
          // no app. Sem esta marca uma coluna em dia de folga lia como o horário mais vazio da
          // casa, e a tela de Equipe, na mesma sessão, dizia que era folga.
          const folga = !st.atendeNoDia(pid, data);
          const semLeitura = faltam.includes(pid);
          return (
            <div key={pid} style={s(`display:flex;align-items:center;gap:9px;padding:0 10px 12px;opacity:${on && !folga ? "1" : "0.55"}`)}>
              <Monogram name={p.nome} id={pid} size={28} radius={9} />
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{D.primeiroNome(p.nome)}</span>
              {semLeitura
                ? <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);color:var(--danger);white-space:nowrap;flex-shrink:0")}>sem leitura</span>
                : folga
                ? <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);color:var(--muted);background:var(--line);padding:2px 7px;border-radius:999px;flex-shrink:0")}>folga</span>
                : !on && <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);color:var(--muted);background:var(--line);padding:2px 7px;border-radius:999px;flex-shrink:0")}>pausado</span>}
            </div>
          );
        })}
      </div>

      <div style={s(`display:grid;grid-template-columns:${colunas}`)}>
        <Regua />
        {st.cadastro.agendas.map((pid) => {
          const blocos = doDia.filter((a) => a.profissionalId === pid);
          /* O bloqueio é da agenda de quem o tem (item 1A.4): o almoço do dono ocupava as três
           * colunas, e a MAISA oferecia o horário do Diego como se estivesse tomado. */
          const meus = bloqueios.filter((b) => b.profissionalId === pid);
          // Escalonamento sobre a lista JUNTA — ver o comentário de `escalonar`.
          const recuo = escalonar([...blocos, ...meus]);
          /* Agenda que não voltou não desenha vago: "livre" sem ter perguntado é a mentira que
           * este item existe para tirar. O que já foi lido dela continua. */
          const semLeitura = faltam.includes(pid);
          return (
            // `overflow:hidden` é rede de segurança: a grade desenha 07–22, mas nada impede
            // um evento às 05:00 na agenda real, e um bloco com `top` negativo escaparia
            // por cima do cabeçalho fixo das colunas.
            <div key={pid} style={s("position:relative;border-left:1px solid var(--line);overflow:hidden")}>
              {!semLeitura && <Vagos data={data} profissionalId={pid} chaveCol={`${data}:${pid}`} />}
              {meus.map((b) => <BlocoBloqueio key={b.id} b={b} recuo={recuo.get(b.id) ?? 0} />)}
              {blocos.map((ag) => <Bloco key={ag.id} ag={ag} recuo={recuo.get(ag.id) ?? 0} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── visão: semana ─────────────────────────────
 * Hora × dia, seg–sáb. Domingo não entra: a casa não abre, e uma coluna vazia
 * fixa custaria 1/7 da largura para não dizer nada.
 * Aqui a coluna é o DIA, então o bloco mostra o profissional no lugar do
 * serviço — é a informação que muda de coluna para coluna. */

function GradeSemana({ data, onAbrirDia }: { data: string; onAbrirDia: (d: string) => void }) {
  const st = useStore();
  const dias = D.semanaDoDia(data);
  const colunas = `52px repeat(${dias.length},minmax(0,1fr))`;

  return (
    <div style={s("flex:1;min-height:0;overflow-y:auto;padding:0 16px 16px")}>
      <div style={s(`display:grid;grid-template-columns:${colunas};position:sticky;top:0;background:var(--surface);z-index:8;padding-top:6px;border-bottom:1px solid var(--line)`)}>
        <div />
        {dias.map((d) => <CabecalhoDia key={d} data={d} onClick={() => onAbrirDia(d)} />)}
      </div>

      <div style={s(`display:grid;grid-template-columns:${colunas}`)}>
        <Regua />
        {dias.map((d) => {
          const blocos = st.agendamentosDoDia(d);
          const bloqueios = st.bloqueiosDoDia(d);
          const recuo = escalonar([...blocos, ...bloqueios]);
          const hoje = d === D.HOJE.iso;
          return (
            <div key={d} style={s(`position:relative;border-left:1px solid var(--line);overflow:hidden;background:${hoje ? "var(--primary-soft)" : "transparent"}`)}>
              <Vagos data={d} chaveCol={`sem:${d}`} />
              {bloqueios.map((b) => <BlocoBloqueio key={b.id} b={b} recuo={recuo.get(b.id) ?? 0} />)}
              {blocos.map((ag) => <Bloco key={ag.id} ag={ag} recuo={recuo.get(ag.id) ?? 0} mostrarProf />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── visão: mês ─────────────────────────────
 * Aqui mora a lógica do InteractiveCalendar. Cada célula carrega o contador do
 * dia num `layoutId`; ao entrar o mouse, o MESMO nó é remontado no centro da
 * célula, maior — o motion interpola o caminho entre as duas posições. É o
 * gesto que o componente de origem existe para fazer, e é o que transforma uma
 * grade de números numa coisa que responde. */

function CelulaMes({
  data, noMes, qtd, aberto, onHover, onAbrir, reduzido,
}: {
  data: string;
  /** Dia de outro mês, ali só para a semana fechar em sete colunas. */
  noMes: boolean;
  qtd: number;
  aberto: boolean;
  onHover: (d: string | null) => void;
  onAbrir: () => void;
  reduzido: boolean;
}) {
  const dia = D.diaDoMes(data);

  // Vizinho de outro mês: existe para a grade fechar em sete colunas, e não recebe foco.
  // Continua mostrando o número — sem ele a última semana de agosto ficava com três
  // quadrados anônimos e dava para achar que o mês tinha buraco.
  if (!noMes) {
    return (
      <div aria-hidden style={s("height:100%;border-radius:12px;background:var(--surface-2);opacity:.4;padding:8px")}>
        <span className="n" style={s("font-size:var(--t-label);color:var(--muted)")}>{dia}</span>
      </div>
    );
  }

  const domingo = D.fechado(data);
  const hoje = data === D.HOJE.iso;
  const passado = data < D.HOJE.iso;

  if (domingo) {
    return (
      <div style={s("height:100%;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);padding:8px;display:flex;flex-direction:column;gap:4px;opacity:.6")}>
        <span className="n" style={s("font-size:var(--t-label);font-weight:var(--w-data);color:var(--muted)")}>{dia}</span>
        <span style={s("font-size:var(--t-micro);color:var(--muted);margin-top:auto")}>fechado</span>
      </div>
    );
  }

  return (
    <motion.button
      onMouseEnter={() => onHover(data)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(data)}
      onBlur={() => onHover(null)}
      onClick={onAbrir}
      // "compromissos" e não "atendimentos": a contagem soma os bloqueios do Google, e
      // chamar o dentista de atendimento seria o rótulo mentindo sobre o próprio número.
      aria-label={`${D.rotuloLongo(data)}: ${qtd === 1 ? "1 compromisso" : `${qtd} compromissos`}`}
      // `.m-lift` em vez de um `whileHover` com sombra escrita à mão: a classe já existe em
      // globals.css com esses valores, e um `border:1px` acompanhado de sombra larga inventada
      // aqui seria o "ghost-card" que o próprio arquivo bane.
      className="m-focus m-lift"
      style={{
        ...s("position:relative;height:100%;border-radius:12px;padding:8px;text-align:left;cursor:pointer;overflow:hidden;display:block;width:100%"),
        border: `1px solid ${hoje ? "var(--primary)" : "var(--border)"}`,
        background: hoje ? "var(--primary-soft)" : "var(--surface)",
        opacity: passado ? 0.72 : 1,
      }}
    >
      <span className="n" style={s(`font-size:var(--t-label);font-weight:${hoje ? "var(--w-emph)" : "var(--w-data)"};color:${hoje ? "var(--primary)" : "var(--ink)"}`)}>
        {dia}
      </span>

      {qtd > 0 && !aberto && (
        <motion.span
          layoutId={`dia-${data}-contagem`}
          className="n"
          style={{
            ...s("position:absolute;right:8px;bottom:8px;display:flex;align-items:center;justify-content:center;font-weight:var(--w-title);color:var(--on-primary);background:var(--primary)"),
            width: 22, height: 22, borderRadius: 999, fontSize: "var(--t-micro)",
          }}
          transition={{ duration: reduzido ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {qtd}
        </motion.span>
      )}

      {/* Sem AnimatePresence: os dois selos são exclusivos (`aberto` / `!aberto`) e trocam no MESMO
          commit, que é exatamente o que o layoutId precisa para interpolar. Envolver este em
          AnimatePresence adiaria a remoção do outro e deixaria o mesmo layoutId montado duas vezes
          — aí o motion escolhe um líder qualquer e o selo pisca em vez de voltar para o canto. */}
      {qtd > 0 && aberto && (
        <span style={s("position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none")}>
          <motion.span
            layoutId={`dia-${data}-contagem`}
            className="n"
            style={{
              ...s("display:flex;align-items:center;justify-content:center;font-weight:var(--w-title);color:var(--on-primary);background:var(--primary)"),
              width: 42, height: 42, borderRadius: 999, fontSize: "var(--t-body)",
            }}
            transition={{ duration: reduzido ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {qtd}
          </motion.span>
        </span>
      )}

      {qtd === 0 && (
        <span style={s("position:absolute;left:8px;bottom:8px;font-size:var(--t-micro);color:var(--muted)")}>livre</span>
      )}
    </motion.button>
  );
}

function GradeMes({ mes, onHover, aberto, onAbrirDia }: { mes: string; onHover: (d: string | null) => void; aberto: string | null; onAbrirDia: (d: string) => void }) {
  const st = useStore();
  const reduzido = !!useReducedMotion();
  // Recalcular a lista a cada hover seria lixo puro — mas as deps precisam ter o MÊS.
  // Estavam vazias, e o efeito era mudo: navegar de mês repintava o mês velho, com os
  // números certos do mês novo por cima. Só apareceu quando passou a existir navegação.
  const celulas = React.useMemo(() => D.celulasDoMes(mes), [mes]);

  return (
    // As linhas dividem a altura disponível (`grid-auto-rows: minmax(84px,1fr)`) em vez de terem
    // altura fixa: com 96px cravados sobrava um terço do cartão em branco embaixo, e um mês que
    // não preenche o próprio cartão lê como se faltasse conteúdo.
    <div style={s("flex:1;min-height:0;display:flex;flex-direction:column;padding:0 16px 16px;overflow-y:auto")}>
      <div style={s("display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;flex-shrink:0;padding:10px 0 8px")}>
        {D.DOW_CURTO.map((d) => (
          <span key={d} style={s("text-align:center;font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);color:var(--muted)")}>{d}</span>
        ))}
      </div>
      <div style={{ ...s("flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px"), gridAutoRows: `minmax(${CEL_MES}px, 1fr)` }}>
        {celulas.map((c) => (
          <CelulaMes
            key={c.chave}
            data={c.data}
            noMes={c.noMes}
            // Bloqueio do Google conta junto: o número da célula responde "quão cheio está
            // esse dia", e um dia com quatro compromissos pessoais não está livre.
            qtd={st.agendamentosDoDia(c.data).length + st.bloqueiosDoDia(c.data).length}
            aberto={c.data === aberto}
            onHover={onHover}
            onAbrir={() => onAbrirDia(c.data)}
            reduzido={reduzido}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── trilho da direita ─────────────────────────────
 * A outra metade da lógica do InteractiveCalendar: o dia sob o mouse SOBE para o
 * topo, e as linhas reordenam por `layout` em vez de sumir e reaparecer. Sem
 * isso a lista seria só um resumo; com isso ela é a segunda vista do mesmo hover. */

function Trilho({ dias, destaque, rotulo, lida, falhou }: { dias: string[]; destaque: string | null; rotulo: string; lida: boolean; falhou: boolean }) {
  const st = useStore();
  const reduzido = !!useReducedMotion();
  // A dependência é a FUNÇÃO, não o `st` inteiro: `st` troca de identidade a cada aba, filtro,
  // gaveta e — pior aqui — a cada `alvoSolta` durante um arrasto, o que refazia o agrupamento do
  // mês inteiro a cada meia hora que o mouse cruzava. `agendamentosDoDia` só muda quando os
  // atendimentos mudam.
  const { agendamentosDoDia } = st;

  // O dia sob o mouse vai para o topo. É o `sortedDays` do InteractiveCalendar: um `sort` estável
  // que só promove o destacado, para o resto da lista não embaralhar junto.
  const { ordenados, total } = React.useMemo(() => {
    const grupos = dias
      .map((d) => ({ dia: d, itens: agendamentosDoDia(d) }))
      .filter((g) => g.itens.length > 0);
    const ord = destaque === null
      ? grupos
      : [...grupos].sort((a, b) => (a.dia === destaque ? -1 : b.dia === destaque ? 1 : 0));
    return { ordenados: ord, total: grupos.reduce((n, g) => n + g.itens.length, 0) };
  }, [destaque, dias, agendamentosDoDia]);

  return (
    <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card);padding:18px;display:flex;flex-direction:column;min-height:0;max-height:100%")}>
      <h2 style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg)")}>Quem vem</h2>
      <span style={s("font-size:var(--t-label);color:var(--muted);margin-top:2px")}>{rotulo}</span>

      {/* Sem leitura, sem contagem: "0 atendimentos" antes de ler é a mesma mentira do "Dia livre". */}
      {/* Com a leitura falhada, nada: a frase e o "Tentar de novo" estão na grade ao lado, e
          esqueleto aqui ficaria cinza para sempre. */}
      {!lida ? (falhou ? null : <div style={s("margin-top:12px")}><Esqueleto linhas={3} altura={40} rotulo="Lendo quem vem" /></div>) : <>
      <div style={s("display:flex;align-items:baseline;gap:8px;margin-top:12px")}>
        <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:var(--lh-tight)")}>{total}</span>
        <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{total === 1 ? "atendimento" : "atendimentos"}</span>
      </div>

      <div style={s("height:1px;background:var(--line);margin:14px 0")} />

      <div style={s("display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-height:0;flex:1;margin:0 -6px;padding:0 6px")}>
        {ordenados.map((g) => {
          const marcado = g.dia === destaque;
          return (
            <motion.div
              key={g.dia}
              layout={!reduzido}
              transition={{ duration: reduzido ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={s("display:flex;flex-direction:column;gap:6px")}
            >
              <div style={s("display:flex;align-items:center;gap:8px;padding:0 2px")}>
                <span style={s(`font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);color:${marcado ? "var(--primary)" : "var(--muted)"}`)}>
                  {D.DOW_CURTO[D.dowDoDia(g.dia)]}
                </span>
                <span className="n" style={s(`font-size:var(--t-sm);font-weight:var(--w-data);color:${marcado ? "var(--primary)" : "var(--ink)"}`)}>{D.diaDoMes(g.dia)}</span>
                {g.dia === D.HOJE.iso && <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);color:var(--primary-dark);background:var(--primary-soft);padding:2px 8px;border-radius:999px")}>hoje</span>}
                <span className="n" style={s("font-size:var(--t-micro);color:var(--muted);margin-left:auto")}>{g.itens.length}</span>
              </div>

              {g.itens.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => st.abrir(ag.id)}
                  // O nome acessível não sai sozinho do conteúdo: o Monogram vem antes e o leitor
                  // anunciava as iniciais. Escrito, o item diz quem, quando e com quem.
                  aria-label={`${ag.cliente.nome}, ${D.rotuloDia(g.dia)} às ${D.hhmm(ag.inicio)}, ${ag.servico.nome}, ${D.primeiroNome(ag.profissional.nome)}`}
                  className="m-hov-bg m-press m-focus"
                  style={s("display:flex;align-items:center;gap:10px;text-align:left;padding:7px 8px;border:none;border-radius:12px;background:transparent;cursor:pointer;width:100%")}
                >
                  <Monogram name={ag.cliente.nome} id={ag.cliente.id} size={30} radius={10} />
                  <span style={s("flex:1;min-width:0")}>
                    <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{ag.cliente.nome}</span>
                    <span style={s("display:block;font-size:var(--t-micro);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px")}>
                      {ag.servico.nome} · {D.primeiroNome(ag.profissional.nome)}
                    </span>
                  </span>
                  <span className="n" style={s(`flex-shrink:0;font-size:var(--t-label);font-weight:var(--w-data);color:${semConfirmacao(ag) ? "var(--warn)" : "var(--muted)"}`)}>
                    {D.hhmm(ag.inicio)}
                  </span>
                </button>
              ))}
            </motion.div>
          );
        })}

        {!ordenados.length && (
          <div style={s("font-size:var(--t-sm);color:var(--muted);text-align:center;padding:22px 8px")}>
            Nada marcado no período. A MAISA avisa aqui assim que alguém chamar no WhatsApp.
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

/* ───────────────────────────── barra do calendário ───────────────────────────── */

function Seletor({ visoes, visao, onTrocar, reduzido }: { visoes: [Visao, string][]; visao: Visao; onTrocar: (v: Visao) => void; reduzido: boolean }) {
  const i = visoes.findIndex(([v]) => v === visao);
  return (
    // O indicador DESLIZA por baixo dos rótulos (é o toggle do InteractiveCalendar). Por isso os
    // segmentos têm largura fixa: sem ela o deslocamento dependeria da métrica da fonte, e o
    // indicador pararia meio pixel fora do rótulo em qualquer fallback de família.
    <div role="tablist" aria-label="Visão do calendário" style={s("position:relative;display:flex;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:3px;flex-shrink:0")}>
      <motion.span
        aria-hidden
        animate={{ x: Math.max(i, 0) * SEG_W }}
        transition={{ duration: reduzido ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{ ...s("position:absolute;top:3px;left:3px;background:var(--primary)"), width: SEG_W, height: "calc(100% - 6px)", borderRadius: 7 }}
      />
      {visoes.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === visao}
          onClick={() => onTrocar(v)}
          className="m-focus"
          style={{ ...s(`position:relative;z-index:1;border:none;background:transparent;cursor:pointer;padding:6px 0;font-size:var(--t-label);font-weight:var(--w-title);color:${v === visao ? "var(--on-primary)" : "var(--muted)"};transition:color var(--dur-fast) var(--ease-out)`), width: SEG_W }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────────── mobile ─────────────────────────────
 * A grade sai: arrastar não existe no toque e seis colunas num celular são
 * ilegíveis. Vira linha do tempo do dia escolhido. */

/** Trechos livres do dia, para a lista do celular: meias-horas vagas seguidas viram UMA linha
 *  ("14:30 livre, até 16:00"), com a primeira agenda que tem aquele começo. Sem isso o celular
 *  não tinha onde tocar para marcar (03 P0-1); com uma linha por meia hora, 18 linhas de "livre"
 *  empurrariam os atendimentos para fora da tela. Só agendas lidas (1A.4) e nada no passado. */
function trechosLivres(data: string, agendas: string[], faltam: string[], vagasDe: (pid: string, data: string, min: number) => number[]) {
  const porHora = new Map<number, string>();
  for (const pid of agendas) {
    if (faltam.includes(pid)) continue;
    for (const h of vagasDe(pid, data, 30)) if (!porHora.has(h)) porHora.set(h, pid);
  }
  const horas = [...porHora.keys()].sort((a, b) => a - b);
  const trechos: { inicio: number; fim: number; pid: string }[] = [];
  for (const h of horas) {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && Math.abs(ultimo.fim - h) < 1e-6) ultimo.fim = h + PASSO;
    else trechos.push({ inicio: h, fim: h + PASSO, pid: porHora.get(h)! });
  }
  return trechos;
}

function LinhaDoTempo({ data }: { data: string }) {
  const st = useStore();
  const itens = st.agendamentosDoDia(data);
  const bloqueios = st.bloqueiosDoDia(data);
  const livres = trechosLivres(data, st.cadastro.agendas, st.leituraAgenda.faltam ?? [], st.vagasDe);
  const hoje = data === D.HOJE.iso;
  if (!itens.length && !bloqueios.length && !livres.length) {
    /* ⚠️ Saiu "A MAISA marca sozinha pelo WhatsApp" (03 P0-1): é falso para quem escolheu agenda
       fixa (`assistente.ativa = false`), e o vazio não tinha saída. */
    return (
      <EmptyState
        title={hoje ? "Nada marcado hoje" : `Nada em ${D.rotuloDia(data)}`}
        sub="Ninguém de expediente com horário livre neste dia."
        action={<Btn icon="plus" onClick={() => st.novoAgendamento(null, { dia: data })}>Marcar atendimento</Btn>}
      />
    );
  }

  /* A lista é POR HORA, e intercala os três: compromisso do Google, atendimento e trecho livre. */
  type Linha =
    | { tipo: "bloq"; inicio: number; b: Bloqueio }
    | { tipo: "ag"; inicio: number; ag: AgendamentoVivo }
    | { tipo: "livre"; inicio: number; fim: number; pid: string };
  const linhas: Linha[] = [
    ...bloqueios.map((b) => ({ tipo: "bloq" as const, inicio: b.inicio, b })),
    ...itens.map((ag) => ({ tipo: "ag" as const, inicio: ag.inicio, ag })),
    ...livres.map((l) => ({ tipo: "livre" as const, ...l })),
  ].sort((x, y) => x.inicio - y.inicio);

  return (
    <div style={s("display:flex;flex-direction:column;gap:10px;padding:16px")}>
      {linhas.map((l) => {
        if (l.tipo === "livre") {
          const quem = st.cadastro.agendas.length > 1 ? ` com ${D.primeiroNome(st.nomeDoProfissional(l.pid))}` : "";
          return (
            <button
              key={`livre@${l.inicio}`}
              type="button"
              onClick={() => st.novoAgendamento({ profissionalId: l.pid, inicio: l.inicio, data })}
              aria-label={`Marcar atendimento em ${D.rotuloDia(data)} às ${D.hhmm(l.inicio)}${quem}`}
              className="m-hov-bg m-press m-focus"
              style={s("display:flex;align-items:center;gap:12px;text-align:left;min-height:48px;padding:10px 14px;border-radius:12px;background:transparent;border:1px dashed var(--border-field);cursor:pointer;color:var(--primary-dark)")}
            >
              <span className="n" style={s("flex-shrink:0;width:44px;text-align:center;font-size:var(--t-sm);font-weight:var(--w-data)")}>{D.hhmm(l.inicio)}</span>
              <span style={s("flex:1;min-width:0;font-size:var(--t-sm);font-weight:var(--w-title)")}>
                livre{l.fim - l.inicio > PASSO ? `, até ${D.hhmm(l.fim)}` : ""}{quem}
              </span>
              <Icon name="plus" size={18} sw={2.2} />
            </button>
          );
        }
        if (l.tipo === "bloq") {
          const b = l.b;
          return (
            <button
              key={b.id}
              onClick={() => st.abrir(b.id)}
              className="m-press m-focus"
              style={s("display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;background:var(--surface-2);border:1px dashed var(--border);color:var(--muted);cursor:pointer")}
            >
              <span style={s("flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;width:44px")}>
                <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-data)")}>{D.hhmm(b.inicio)}</span>
                <span className="n" style={s("font-size:var(--t-micro)")}>{b.duracao}min</span>
              </span>
              <span style={s("flex:1;min-width:0")}>
                <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{b.titulo}</span>
                <span style={s("display:block;font-size:var(--t-label);margin-top:2px")}>sua agenda do Google</span>
              </span>
              <Icon name="pin" size={16} sw={2} />
            </button>
          );
        }
        const ag = l.ag;
        const tom = tomDoBloco(ag);
        return (
          <button
            key={ag.id}
            onClick={() => st.abrir(ag.id)}
            className="m-press m-focus"
            style={s(`display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;background:${tom.bg};border:1px solid ${tom.ac};cursor:pointer;box-shadow:var(--shadow-card)`)}
          >
            <span style={s("flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;width:44px")}>
              <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-data)")}>{D.hhmm(ag.inicio)}</span>
              <span className="n" style={s("font-size:var(--t-micro);color:var(--muted)")}>{ag.duracao}min</span>
            </span>
            <span style={s("flex:1;min-width:0")}>
              <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{ag.cliente.nome}</span>
              <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>
                {ag.servico.nome} · {D.primeiroNome(ag.profissional.nome)}
              </span>
            </span>
            {/* Marca, não pílula: não clica (T7). Só em "chegando" e antes da hora (1A.5). */}
            {semConfirmacao(ag) && <span style={s("flex-shrink:0")}><Estado forma="triangulo" tom="warn">sem confirmação</Estado></span>}
            <Monogram name={ag.profissional.nome} id={ag.profissionalId} size={30} radius={10} />
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── o estado da leitura ─────────────────────────────
 * Uma faixa DENTRO do cartão, entre a barra e a grade — nunca um toast.
 *
 * Toast é para uma ação sua que terminou; ele aparece por três segundos num canto e
 * some. Aqui o problema é a grade inteira, ele persiste enquanto persistir, e o
 * usuário precisa poder lê-lo depois de ter olhado para outra coisa. Uma grade vazia
 * calada AFIRMA "você não tem nada" — e essa afirmação pode ser falsa. */

function AvisoAgenda() {
  const st = useStore();
  const a = st.leituraAgenda;

  /* ⚠️ A FAIXA DE ERRO NÃO DEPENDE MAIS DO GOOGLE (24/09/2026). Havia aqui um
   * `if (st.google.status !== "ok") return null` no topo: sem credencial do Google no
   * ambiente, a leitura da TABELA podia falhar calada e a grade dizia "Dia livre". Desde o
   * ADR-0009 a agenda é da tabela; só o convite para conectar é do Google, e ele agora olha a
   * CONEXÃO (`googleDe`), não o estado da leitura.
   *
   * Antes da primeira leitura boa, o erro não é faixa: é a tela inteira (`FalhaDeLeitura` no
   * lugar da grade), porque não há o que manter na tela. Faixa é para quando há. */
  if (!a.jaLeu) return null;
  // "carregando" e "limite" não ganham faixa: a primeira é passageira e a segunda se
  // resolve sozinha. Faixa é para o que exige uma decisão de quem está olhando.
  if (a.status === "limite" || a.status === "carregando") return null;
  const convidarGoogle = a.status === "ok" && st.google.status === "ok" && !!st.pidAgenda && !st.googleDe(st.pidAgenda);
  if (a.status === "ok" && !convidarGoogle) return null;

  const faixa = (tom: "warn" | "muted", texto: string, acao?: { label: string; onClick: () => void }) => (
    <div style={s(`flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);background:${tom === "warn" ? "var(--warn-soft)" : "var(--surface-2)"};font-size:var(--t-label);color:${tom === "warn" ? "var(--warn)" : "var(--muted)"}`)}>
      <Icon name={tom === "warn" ? "alert" : "calendar"} size={15} sw={1.9} />
      <span style={s("flex:1;min-width:0")}>{texto}</span>
      {acao && (
        <Btn variant="secondary" size="sm" onClick={acao.onClick} style={{ height: 28, padding: "0 11px", borderRadius: 8 }}>
          {acao.label}
        </Btn>
      )}
    </div>
  );

  /* ⚠️ AQUI DIZIA "Os atendimentos abaixo são de exemplo", e era mentira nas duas pontas:
   * a grade já não tinha fixture nenhum (ela vem de `atendimentos`, que o store zerava) e
   * a agenda nunca precisou do Google para existir. Quem lia isso concluía que o produto
   * não estava funcionando — e agia como se não estivesse.
   *
   * O convite continua, porque conectar tem valor de verdade: é o que traz o compromisso
   * que nasceu FORA da MAISA. Só que agora é oferta, não pré-requisito. */
  if (convidarGoogle) {
    return faixa(
      "muted",
      "Conecte o Google Calendar para ver aqui também os compromissos que você marca por fora.",
      { label: "Conectar", onClick: () => { if (st.pidAgenda) st.conectarGoogle(st.pidAgenda); } },
    );
  }

  if (a.status === "reconectar") {
    // O que já foi lido CONTINUA na tela. Apagar a grade porque o token venceu somaria
    // um segundo problema — "sumiu tudo" — ao primeiro, que era só uma reautorização.
    return faixa(
      "warn",
      "O acesso à agenda do Google expirou. O que está na tela pode estar desatualizado.",
      { label: "Reconectar", onClick: () => { if (st.pidAgenda) st.conectarGoogle(st.pidAgenda); } },
    );
  }

  return faixa("warn", `${FRASE_ERRO_AGENDA} O que está na tela pode estar desatualizado.`, {
    label: "Tentar de novo",
    onClick: st.recarregarAgenda,
  });
}

/* ───────────────────────────── tela ───────────────────────────── */

/** Título das setas por visão — [anterior, próximo]. */
const PASSO_ROTULO: Record<Visao, [string, string]> = {
  dia: ["Dia anterior", "Próximo dia"],
  semana: ["Semana anterior", "Próxima semana"],
  mes: ["Mês anterior", "Próximo mês"],
};

export default function Agenda() {
  const mobile = useIsMobile();
  const reduzido = !!useReducedMotion();
  const st = useStore();
  const [escolhida, setVisao] = React.useState<Visao>("dia");
  const [destaque, setDestaque] = React.useState<string | null>(null);

  // No celular a Semana sai do seletor: seis colunas de blocos posicionados a 375px não se leem,
  // e um controle que troca a visão para outra coisa ilegível é um controle morto. Mês FICA — a
  // grade de contadores é justamente a visão que cabe num celular. `escolhida` vs `visao` existe
  // porque o usuário pode estar em Semana e girar o aparelho: a visão cai para Dia sozinha em vez
  // de renderizar uma tela que o seletor já não sabe apontar.
  const visoes = mobile ? VISOES.filter(([v]) => v !== "semana") : VISOES;
  const visao: Visao = mobile && escolhida === "semana" ? "dia" : escolhida;

  const dia = st.diaSel;
  const hoje = dia === D.HOJE.iso;
  const lida = st.leituraAgenda.jaLeu;
  const falhou = !lida && agendaComErro(st.leituraAgenda);
  const mes = D.mesDe(dia);

  // Os dias que a visão atual cobre. É a mesma lista para a grade e para o trilho — o resumo da
  // direita não pode falar de um período diferente do que está desenhado à esquerda.
  const visiveis = React.useMemo<string[]>(() => {
    if (visao === "dia") return [dia];
    if (visao === "semana") return D.semanaDoDia(dia);
    return D.celulasDoMes(mes).filter((c) => c.noMes && !D.fechado(c.data)).map((c) => c.data);
  }, [visao, dia, mes]);

  const rotulo =
    visao === "dia" ? `${D.rotuloDia(dia)} de ${D.anoDe(mes)}`
    : visao === "semana" ? `${D.rotuloDia(visiveis[0])} – ${D.rotuloDia(visiveis[visiveis.length - 1])}`
    : `${D.nomeMes(mes)} de ${D.anoDe(mes)}`;

  /** Abre um dia específico. Trocar `diaSel` NÃO basta: em Semana e em Mês nada na tela é
   *  desenhado a partir do dia selecionado, então clicar numa célula do mês mudava o estado e não
   *  mudava um pixel — um controle que promete "quinta 23: 5 atendimentos" e não abre nada.
   *  Clicar num dia agora desce para ele. */
  const abrirDia = (d: string) => { st.verDia(d); setVisao("dia"); };

  /** ‹ e › andam no PASSO DA VISÃO: um dia, uma semana ou um mês.
   *
   *  O mês agora NAVEGA. Ele desabilitava porque só existia julho/2026 no protótipo — com
   *  datas reais, um par de setas mortas seria só um controle quebrado. E as três visões
   *  atravessam a virada de mês sem caso especial: a aritmética é de calendário, não de
   *  "dia do mês entre 1 e 31". */
  const navegar = (dir: number) => {
    if (visao === "mes") {
      const outro = D.somarMeses(mes, dir);
      // Cai no dia 1 do mês vizinho; se for domingo, anda até o próximo dia aberto.
      let alvo = `${outro}-01`;
      while (D.fechado(alvo)) alvo = D.somarDias(alvo, 1);
      st.verDia(alvo);
      return;
    }
    if (visao === "semana") {
      // Ancorado na SEMANA, não no dia: senão andar a partir de um sábado pularia dias.
      st.verDia(D.somarDias(dia, -D.dowDoDia(dia) + dir * 7));
      return;
    }
    // pula domingo: clicar › no sábado tem que cair na segunda, não numa tela "fechado"
    let alvo = D.somarDias(dia, dir);
    while (D.fechado(alvo)) alvo = D.somarDias(alvo, dir);
    st.verDia(alvo);
  };

  const calendario = (
    <section style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-card);overflow:hidden;display:flex;flex-direction:column;min-height:0")}>
      <div style={s("flex-shrink:0;display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap")}>
        <div style={s("display:flex;align-items:center;gap:4px")}>
          <IconBtn icon="chevron-left" size="sm" onClick={() => navegar(-1)} title={PASSO_ROTULO[visao][0]} />
          <Btn variant="secondary" size="sm" onClick={() => abrirDia(D.HOJE.iso)} style={{ height: 30, padding: "0 12px", borderRadius: 8 }}>Hoje</Btn>
          <IconBtn icon="chevron-right" size="sm" onClick={() => navegar(1)} title={PASSO_ROTULO[visao][1]} />
        </div>

        <span style={s("font-size:var(--t-body);font-weight:var(--w-title);letter-spacing:var(--ls-body)")}>{rotulo}</span>
        {!hoje && visao !== "mes" && <Badge>hoje é {D.rotuloDia(D.HOJE.iso)}</Badge>}

        <div style={s("margin-left:auto;display:flex;align-items:center;gap:10px")}>
          {/* O "Marcar" que morava aqui foi para o slot da casca (T2, contradição C2): "Marcar
              atendimento" no canto da topbar e no "＋" do celular, o mesmo lugar nas duas
              larguras. Esta barra fica só com navegação. */}
          <Seletor visoes={visoes} visao={visao} onTrocar={setVisao} reduzido={reduzido} />
        </div>
      </div>

      <AvisoAgenda />

      {/* ⚠️ ANTES DA PRIMEIRA LEITURA, NENHUMA GRADE (24/09/2026). A grade vazia afirma "Dia
          livre", "livre" em cada célula do mês e "0 atendimentos" no trilho, e fazia isso antes
          de `/api/agenda` voltar e para sempre quando ela falhava. Ver `estadoDoDia`. */}
      {!lida ? (
        falhou
          ? <FalhaDeLeitura frase={FRASE_ERRO_AGENDA} detalhe={st.leituraAgenda.info} tentar={st.recarregarAgenda} />
          : <div style={s("padding:16px")}><Esqueleto linhas={mobile ? 4 : 6} altura={mobile ? 72 : 56} rotulo="Lendo a sua agenda" /></div>
      ) : visao === "mes" ? (
        <GradeMes mes={mes} onHover={setDestaque} aberto={destaque} onAbrirDia={abrirDia} />
      ) : mobile ? (
        // Sem `overflow-y` próprio: no celular quem rola é a PÁGINA. Com scroll interno o cartão
        // ficava preso na altura da viewport e cortava o terceiro atendimento no meio.
        <LinhaDoTempo data={dia} />
      ) : visao === "dia" ? (
        <GradeDia data={dia} />
      ) : (
        <GradeSemana data={dia} onAbrirDia={abrirDia} />
      )}

      {!mobile && visao !== "mes" && (
        <div style={s("flex-shrink:0;display:flex;align-items:center;gap:8px;padding:9px 16px;border-top:1px solid var(--line);font-size:var(--t-label);color:var(--muted)")}>
          <Icon name="clock" size={15} sw={1.9} />
          {/* Já dizia "arraste para remarcar". Parou de ser verdade quando o atendimento
              virou o evento do Google — ver o comentário em Bloco. Uma barra que promete
              um gesto que não existe é pior que uma barra com menos texto. */}
          clique num vago para marcar · remarcar, por enquanto, é no Google Calendar
        </div>
      )}
    </section>
  );

  // No celular, em Dia, o trilho seria a MESMA lista que a linha do tempo logo acima — os mesmos
  // nomes, nas mesmas horas, duas vezes na mesma rolagem. Ele só ganha função quando a grade não
  // mostra nomes: no Mês.
  const comTrilho = !mobile || visao === "mes";

  return (
    <div
      className="m-enter"
      style={{
        ...s(`flex:1;min-height:0;height:100%;display:grid;grid-template-columns:${comTrilho ? "var(--rail-side)" : "minmax(0,1fr)"};gap:16px;padding:16px 20px 20px;background:var(--bg);overflow-y:auto;align-content:start`),
        // No desktop a linha ocupa a altura da tela e cada cartão rola por dentro — é o que faz a
        // grade de horas ficar sob a barra fixa. No celular isso vira uma armadilha: a linha
        // travava em 614px e o cartão, que é `overflow:hidden`, cortava o atendimento das 15:30 no
        // meio, sem barra de rolagem nenhuma. `max-content` devolve a rolagem para a PÁGINA.
        gridAutoRows: mobile ? "max-content" : undefined,
      }}
    >
      {calendario}
      {comTrilho && <Trilho dias={visiveis} destaque={destaque} rotulo={rotulo} lida={lida} falhou={falhou} />}
    </div>
  );
}
