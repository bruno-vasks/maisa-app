"use client";
/* MAISA — Conversas.
 *
 * Painel duplo: a lista de quem está falando e a conversa em si. A pergunta que
 * a tela responde não é "quem me mandou mensagem" — é "quem está conduzindo".
 * Daí o ponto de estado em cada linha e o botão único de assumir/devolver.
 *
 * Enquanto a MAISA conduz, o campo de texto fica travado: escrever por cima dela
 * sem assumir criaria duas vozes na mesma conversa. Clicar numa sugestão assume
 * a conversa e já preenche o texto — um gesto, não três.
 *
 * No mobile é uma coisa por vez: lista → conversa, com voltar. */

import React, { useEffect, useRef, useState } from "react";
import { s, Btn, Icon, Monogram } from "@/ui/primitivos";
import { TITULO_PARADA, useAcaoDoStatus } from "@/ui/componentes/StatusDaMaisa";
import { useIsMobile } from "@/ui/useIsMobile";
import * as D from "@/adaptadores/saida/demo";
import { useStore, type AbaConversa } from "@/ui/estado/store";

const ABAS: [AbaConversa, string][] = [
  ["todas", "Todas"], ["espera", "Esperando"], ["maisa", "MAISA"], ["ok", "Resolvidas"],
];

/* Estado nunca é âmbar. O ouro sobre fundo claro dá 1.6:1 — o ponto de 6px simplesmente
   não existia — e pior: `espera` e `voce` usavam a MESMA cor para significados opostos
   ("ela espera você" vs. "você está respondendo"). Agora cada estado tem cor própria:
   pendência = --warn · você no comando = --primary · MAISA no comando = --primary-dark. */
const PONTO: Record<D.EstadoConversa, string> = {
  espera: "var(--warn)",
  voce: "var(--primary)",
  maisa: "var(--primary-dark)",
  ok: "var(--success)",
};

const SITUACAO: Record<D.EstadoConversa, string> = {
  espera: "esperando sua resposta",
  voce: "você está respondendo",
  maisa: "a MAISA está conduzindo",
  ok: "conversa resolvida",
};

/* ───────────────────────────── lista ───────────────────────────── */

function Lista({ onEscolher }: { onEscolher: (id: string) => void }) {
  const st = useStore();
  const acao = useAcaoDoStatus();

  const visiveis = st.conversas.filter((c) => {
    if (st.abaConv === "todas") return true;
    if (st.abaConv === "espera") return c.estado === "espera" || c.estado === "voce";
    return c.estado === st.abaConv;
  });

  return (
    <>
      <div style={s("padding:16px 14px 12px;display:flex;flex-direction:column;gap:12px;flex-shrink:0")}>
        <div style={s("display:flex;gap:4px;padding:3px;border-radius:12px;background:var(--bg)")} role="tablist" aria-label="Filtrar conversas">
          {ABAS.map(([id, label]) => {
            const on = st.abaConv === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                onClick={() => st.setAbaConv(id)}
                className="m-press m-focus"
                style={s(`flex:1;border:none;cursor:pointer;height:34px;border-radius:9px;font-size:var(--t-label);font-weight:var(--w-title);background:${on ? "var(--surface)" : "transparent"};color:${on ? "var(--primary)" : "var(--muted)"};box-shadow:${on ? "0 1px 3px oklch(0.30 0.03 262 / 0.10)" : "none"};transition:var(--tr-ui)`)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={s("flex:1;overflow-y:auto;padding:0 10px 12px;display:flex;flex-direction:column;gap:3px")}>
        {/* TRÊS vazios diferentes, e eles não são intercambiáveis. "Nenhuma conversa" quando o
            servidor recusou seria mentira tranquilizadora — o dono acharia que ninguém escreveu
            e o WhatsApp estaria cheio. "Carregando" quando já carregou seria eterno. */}
        {/* Sem WhatsApp, "quando alguém escrever" é promessa que não se cumpre: ninguém chega.
            O vazio diz o porquê e oferece o único caminho (T3, `StatusDaMaisa.tsx`). */}
        {visiveis.length === 0 && st.conversasCarregadas && !st.conversasErro && st.conversas.length === 0 && st.statusMaisa === "sem_whatsapp" && acao ? (
          <div style={s("padding:36px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center")}>
            <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{TITULO_PARADA.sem_whatsapp}</span>
            <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose)")}>Conecte para as conversas chegarem aqui.</span>
            <Btn variant="secondary" onClick={acao.fazer}>{acao.rotulo}</Btn>
          </div>
        ) : visiveis.length === 0 && (
          <div style={s("padding:36px 14px;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose)")}>
            {st.conversasErro
              ? st.conversasErro
              : !st.conversasCarregadas
                ? "Carregando as conversas…"
                : st.conversas.length === 0
                  ? "Nenhuma conversa ainda. Quando alguém escrever no WhatsApp do negócio, ela aparece aqui."
                  : "Nenhuma conversa neste filtro."}
          </div>
        )}
        {visiveis.map((c) => {
          const e = c.estado;
          const sel = st.convSel === c.id;
          const ultima = c.ultima;
          return (
            <button
              key={c.id}
              onClick={() => onEscolher(c.id)}
              aria-current={sel}
              className="m-hov-bg m-press m-focus"
              style={s(`text-align:left;border:none;cursor:pointer;width:100%;padding:13px 12px;border-radius:16px;display:flex;gap:12px;align-items:center;background:${sel ? "var(--primary-soft)" : "transparent"};transition:var(--tr-ui)`)}
            >
              <Monogram name={c.nome} id={c.id} size={44} radius={14} />
              <span style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:3px")}>
                <span style={s("display:flex;align-items:center;gap:8px")}>
                  <span style={s("flex:1;min-width:0;font-weight:var(--w-title);font-size:var(--t-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{c.nome}</span>
                  {/* hora é DADO, não string de máquina: sai o mono (a altura-x menor fazia 11px
                      parecer menor ainda, e não há coluna para alinhar) e entra .n tabular.
                      Era `c.hora`, uma string escrita no fixture ("10:31"); agora é o instante
                      gravado pelo banco, formatado em SP por `horaDeISO` — o app inteiro
                      atravessa esse fuso num lugar só (ver `dominio/tempo.ts`). */}
                  <span className="n" style={s("flex-shrink:0;font-size:var(--t-micro);font-weight:var(--w-data);color:var(--muted)")}>{D.horaDeISO(c.atualizadaEm)}</span>
                </span>
                <span style={s("display:flex;align-items:center;gap:7px")}>
                  <span style={s(`width:6px;height:6px;flex-shrink:0;border-radius:50%;background:${PONTO[e]}`)} />
                  <span style={s("flex:1;min-width:0;font-size:var(--t-label);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>
                    {ultima ? (ultima.de === "cliente" ? ultima.txt : `Você/MAISA: ${ultima.txt}`) : "—"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ───────────────────────────── conversa ───────────────────────────── */

function Thread({ onVoltar }: { onVoltar?: () => void }) {
  const st = useStore();
  const cv = st.conversaDe(st.convSel);

  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const msgs = st.threadDe(cv?.id ?? "");

  // Rola para a última mensagem ao trocar de conversa ou ao enviar.
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [cv?.id, msgs.length]);
  // Trocar de conversa não deve carregar o rascunho da anterior.
  useEffect(() => { setTexto(""); }, [cv?.id]);

  /* Nenhuma conversa selecionada — e isto agora é um estado NORMAL, não um erro. Com fixture
     havia sempre `CONVERSAS[0]`; com dado real, um negócio no primeiro dia tem zero conversas.
     O `?? CONVERSAS[0]` de antes viraria um crash aqui. */
  if (!cv) {
    return (
      <div style={s("flex:1;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center")}>
        <div style={s("max-width:38ch;font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose)")}>
          {st.conversasErro ?? (st.conversasCarregadas
            ? "Nenhuma conversa por aqui ainda. A primeira mensagem que chegar no WhatsApp do negócio abre esta tela."
            : "Carregando as conversas…")}
        </div>
      </div>
    );
  }

  const estado = cv.estado;
  const daMaisa = estado === "maisa" || estado === "espera";
  const minha = estado === "voce";
  /* Thread anterior ao registro do número completo: dá para ler, não dá para responder daqui.
     O servidor recusa esse envio (ver `criarResponderConversa`), e a tela recusa antes — botão
     que só falha quando clicado é pior que botão desabilitado com o motivo escrito. */
  const semNumero = !cv.telefone;

  const enviar = () => {
    if (!minha || semNumero || st.enviando || !texto.trim()) return;
    st.enviar(cv.id, texto);
    setTexto("");
  };

  return (
    <>
      {/* cabeçalho */}
      <div style={s("flex-shrink:0;padding:14px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);background:var(--surface)")}>
        {onVoltar && (
          <button onClick={onVoltar} aria-label="Voltar" className="m-hov-bg m-press-icon m-focus" style={s("width:38px;height:38px;flex-shrink:0;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center")}>
            <Icon name="chevron-left" size={18} sw={2.2} />
          </button>
        )}
        <Monogram name={cv.nome} id={cv.id} size={44} radius={14} />
        <div style={s("flex:1;min-width:0")}>
          {/* tracking negativo só a partir de 18px — a 16px era ruído, saiu */}
          <div style={s("font-weight:var(--w-title);font-size:var(--t-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{cv.nome}</div>
          <div style={s("display:flex;align-items:center;gap:7px;margin-top:2px")}>
            <span style={s(`width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${PONTO[estado]}`)} />
            <span style={s("font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{SITUACAO[estado]} · {D.telefoneBonito(cv.telefone || cv.id)}</span>
          </div>
        </div>
        <a
          /* O número já vem com DDI do envelope do WhatsApp — o `55` fixo que morava aqui era
             para o telefone escrito à mão do fixture, e com o dado real dobrava o DDI. */
          href={`https://wa.me/${cv.telefone}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir no WhatsApp"
          aria-label="Abrir no WhatsApp"
          className="m-hov-bg m-press-icon m-focus"
          /* --whatsapp (verde escurecido) e não o verde da marca: glifo de traço sobre fundo
             claro; com #25D366 este ícone dava 1.9:1 e era ilegível. */
          style={s("width:40px;height:40px;flex-shrink:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--whatsapp);cursor:pointer;display:flex;align-items:center;justify-content:center")}
        >
          <Icon name="whatsapp" size={18} sw={1.9} />
        </a>
        <button
          onClick={() => (minha ? st.devolver(cv.id) : st.assumir(cv.id))}
          className={`${daMaisa ? "m-hov-primary" : "m-hov-bg"} m-press m-focus`}
          style={s(`height:40px;padding:0 16px;flex-shrink:0;border-radius:12px;font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;white-space:nowrap;${daMaisa ? "border:1px solid var(--primary);background:var(--primary);color:var(--on-primary)" : "border:1px solid var(--border);background:var(--surface);color:var(--muted)"}`)}
        >
          {daMaisa ? "Assumir" : minha ? "Devolver à MAISA" : "Reabrir"}
        </button>
      </div>

      {/* mensagens
          Canvas em --surface-2 (e não --bg): sobre --bg uma bolha branca dava 1.06:1 e não
          existia como objeto — flutuava. Com o fundo tintado, o branco volta a ser papel. */}
      <div style={s("flex:1;min-height:0;overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:14px;background:var(--surface-2)")}>
        {msgs.length === 0 && (
          <div style={s("margin:auto;max-width:34ch;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose)")}>
            {st.threadCarregando ? "Carregando a conversa…" : "Nenhuma mensagem nesta conversa."}
          </div>
        )}
        {msgs.map((m, i) => {
          const meu = m.de !== "cliente";
          /* ⚠️ A tarja de data era um "Hoje" FIXO no topo da conversa — com fixture, todas as
             falas eram de hoje por decreto. Numa thread real ela atravessa dias, e um "Hoje"
             sobre uma mensagem da semana passada não é enfeite errado: é o dono lendo "quero
             remarcar pra quinta" como se tivesse chegado agora. Agora a tarja aparece na
             TROCA de dia, com o dia escrito. */
          const dia = m.em ? D.civilSP(m.em)?.data : undefined;
          const diaAnterior = i > 0 ? (msgs[i - 1].em ? D.civilSP(msgs[i - 1].em!)?.data : undefined) : undefined;
          const abreDia = !!dia && dia !== diaAnterior;
          const bot = m.de === "bot";
          /* Hierarquia invertida. Antes a bolha mais colorida da tela era a do ROBÔ, e cliente e
             "você" eram pixel-idênticas — só o lado e um rótulo em caixa-alta as separavam. Num
             inbox se escaneia por lado e por cor, não por rótulo, e o objeto mais chamativo tem de
             ser o pedido do cliente ou a sua resposta, não a infraestrutura. Agora:
             cliente = branco sólido à esquerda (é o conteúdo) · você = fill --primary à direita (a
             voz de mais peso é a sua) · MAISA = branco com CONTORNO --primary-soft, do seu lado,
             porque ela fala por você — contorno e não fill: ela é infraestrutura, não protagonista. */
          const pele = bot
            ? "background:var(--surface);border:1px solid var(--primary-soft);color:var(--ink)"
            : meu
              ? "background:var(--primary);border:1px solid var(--primary);color:var(--on-primary)"
              : "background:var(--surface);border:1px solid var(--line);color:var(--ink)";
          return (
            <React.Fragment key={i}>
            {abreDia && (
              <div style={s("align-self:center;font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted);background:var(--surface);border:1px solid var(--line);padding:5px 14px;border-radius:999px")}>
                {dia === D.HOJE.iso ? "Hoje" : D.rotuloDia(dia!)}
              </div>
            )}
            {/* 62ch é o teto de legibilidade: 72% da coluna dava ~88ch, acima dos 75ch. */}
            <div className="m-bubble" style={s(`max-width:min(72%, 62ch);align-self:${meu ? "flex-end" : "flex-start"}`)}>
              {/* A fala é o conteúdo da tela: --t-body (16px). Antes estava em 14,5px, MENOR que o
                  nome do contato e igual ao campo de digitação — o texto mais importante da região
                  era o mais miúdo. O raio de 20px fica: é forma de bolha, não de cartão. */}
              {/* Os quatro cantos são declarados um por um, e não `border-radius:20px` seguido de um
                  `border-bottom-…-radius:7px`. Aquela forma misturava shorthand com longhand da MESMA
                  propriedade, e o React reclama disso em todo rerender ("don't mix shorthand and
                  non-shorthand"): na ordem em que ele aplica, o shorthand pode voltar depois e zerar
                  o canto de 7px. Era o único erro de console que sobrava nesta tela. */}
              <div style={s(`padding:11px 15px;border-top-left-radius:20px;border-top-right-radius:20px;border-bottom-right-radius:${meu ? "7px" : "20px"};border-bottom-left-radius:${meu ? "20px" : "7px"};font-size:var(--t-body);line-height:var(--lh-prose);${pele};display:flex;gap:8px;align-items:flex-start`)}>
                {bot && (
                  /* O eyebrow "MAISA"/"VOCÊ" repetido em toda bolha caiu: existia só porque a cor
                     não separava as vozes, e eyebrow por item é cadência de sistema. Fica o glifo
                     dentro da bolha, alinhado à primeira linha — "quem falou" é a tese do produto,
                     mas cabe num sinal de 15px, não num rótulo. */
                  <span role="img" aria-label="Enviada pela MAISA" style={s("display:flex;flex-shrink:0;margin-top:5px")}>
                    <Icon name="bot" size={15} sw={1.9} stroke="var(--primary)" />
                  </span>
                )}
                <span>{m.txt}</span>
              </div>
            </div>
            </React.Fragment>
          );
        })}
        <div ref={fim} />
      </div>

      {/* composer
          ⚠️ A BARRA DE SUGESTÕES SAIU DAQUI. Eram três botões por conversa escritos no fixture
          ("Ver quinta às 10h", "Oferecer 14h") — texto de demonstração ao lado de uma conversa
          real, e um deles prometia horário numa agenda que ele não consultou. Sugestão de
          verdade é uma feature: a MAISA propõe a resposta a partir da conversa e da agenda. Até
          existir, a região não finge que existe. */}
      <div style={s("flex-shrink:0;padding:12px 18px 16px;border-top:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;gap:11px")}>
        <div style={s("display:flex;align-items:center;gap:10px")}>
          {(() => {
            /* Três razões para o campo estar travado, e cada uma pede uma frase diferente. Um
               placeholder genérico ("não é possível escrever") faria o dono procurar bug onde
               há regra. */
            const travado = !minha || semNumero || st.enviando;
            const placeholder = semNumero
              ? "Conversa antiga: o número completo não foi guardado — responda pelo WhatsApp"
              : st.enviando
                ? "Enviando…"
                : minha
                  ? "Escreva uma mensagem…"
                  : "Assuma a conversa para escrever você mesmo";
            return (
              <>
                <input
                  ref={campo}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
                  disabled={travado}
                  placeholder={placeholder}
                  aria-label="Mensagem"
                  className="m-focus"
                  /* --border-field, não --border: esta borda é o único meio de identificar o campo
                     (WCAG 1.4.11 pede 3:1 e --border dava 1.3:1). */
                  style={s(`flex:1;min-width:0;height:46px;padding:0 16px;border-radius:14px;background:${travado ? "var(--bg)" : "var(--surface)"};border:1px solid var(--border-field);font-size:var(--t-sm);color:var(--ink);outline:none;cursor:${travado ? "not-allowed" : "text"}`)}
                />
                <button
                  onClick={enviar}
                  disabled={travado || !texto.trim()}
                  aria-label="Enviar"
                  className="m-hov-primary m-press m-focus"
                  style={s(`width:46px;height:46px;flex-shrink:0;border:none;border-radius:14px;background:var(--primary);color:var(--on-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:${travado || !texto.trim() ? "0.4" : "1"}`)}
                >
                  <Icon name="send" size={19} sw={2} />
                </button>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────── tela ───────────────────────────── */

export default function Conversas() {
  const st = useStore();
  const mobile = useIsMobile();
  const [abertaNoMobile, setAbertaNoMobile] = useState(false);

  // Voltar ao layout de duas colunas cancela o modo "conversa aberta".
  useEffect(() => { if (!mobile) setAbertaNoMobile(false); }, [mobile]);

  if (mobile) {
    return (
      <div className="m-enter" style={s("flex:1;display:flex;flex-direction:column;min-height:0;background:var(--surface)")}>
        {abertaNoMobile
          ? <Thread onVoltar={() => setAbertaNoMobile(false)} />
          : <Lista onEscolher={(id) => { st.selecionarConversa(id); setAbertaNoMobile(true); }} />}
      </div>
    );
  }

  return (
    <div className="m-enter" style={s("flex:1;min-height:0;height:100%;display:grid;grid-template-columns:340px minmax(0,1fr)")}>
      <div style={s("border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;background:var(--surface)")}>
        <Lista onEscolher={st.selecionarConversa} />
      </div>
      <div style={s("display:flex;flex-direction:column;min-height:0;background:var(--bg)")}>
        <Thread />
      </div>
    </div>
  );
}
