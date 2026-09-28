"use client";
/* MAISA — o shell do app.
 *
 * Desktop: rail navy de 76px que abre para 244px no hover (CSS, sem re-render) +
 * uma topbar navy dentro do cartão de conteúdo. O rail é absoluto sobre um
 * espaçador, então expandir sobrepõe o conteúdo em vez de empurrá-lo.
 *
 * Mobile: cabeçalho com data e título + 5 abas fixas embaixo. O rail de 9 itens
 * não caberia, então "Mais" agrupa Faturamento, Equipe, Serviços e A MAISA — e a
 * aba fica acesa quando você está em qualquer uma delas.
 *
 * ⚠️ UM SLOT DE AÇÃO, E ELE GUARDA O "CRIAR" DA TELA (25/09/2026, T2 do backlog do front).
 * Cada tela punha o botão num lugar (a topbar, o hero, a barra do calendário) e o celular
 * ficava sem nenhum: não dava para marcar atendimento nem criar serviço pelo telefone. Agora
 * a tela DECLARA a ação no mapa `TELA` (`acao`) e a casca a desenha no canto da topbar e como
 * "＋" de 44px no cabeçalho do celular. Emitir não é criar: o "Emitir" do Fiscal fica na tela,
 * no fim do caminho (contradição C3). Tela sem ação não ganha botão; o "＋" do celular vira o
 * menu "Novo", que existe também na topbar. A cor é `--primary`: o ouro deixou de ser ação (C4). */

import React, { useEffect, useState } from "react";
import { s, Icon, Monogram, Toaster, ConfirmDialog, fmt } from "@/ui/primitivos";
import { useLayout } from "@/ui/useIsMobile";
import * as D from "@/adaptadores/saida/demo";
import { useStore, type TelaId } from "@/ui/estado/store";
import UserMenu from "./UserMenu";
import Gaveta from "./Gaveta";
import Paleta from "./Paleta";
import FluxoHoje from "../telas/FluxoHoje";
import Conversas from "../telas/Conversas";
import Agenda from "../telas/Agenda";
import AMaisa from "../telas/AMaisa";
import Contatos from "../telas/Contatos";
import { Clientes, Faturamento, Equipe, Servicos, Mais } from "../telas/Grades";
import { ProgressoDeEmissao } from "./ProgressoDeEmissao";
import { ENTRAR } from "@/ui/componentes/EstadoDeLeitura";
import { StatusDaMaisa } from "./StatusDaMaisa";
import { DocumentoFiscal } from "../telas/DocumentoFiscal";
import { EncaixeDaLateral } from "./Lateral";

/* ───────────────────────────── mapa de telas ───────────────────────────── */

/* ⚠️ SEM SUBTÍTULO (24/09/2026, item T8 do backlog do front). Cada tela tinha um `sub` embaixo
 * do título, na topbar: "A MAISA responde; você entra quando precisa", "Quem vem e quando — no
 * dia, na semana ou no mês", "Uma seção por vez — o preview segue você". Justificativa de
 * design escrita para quem usa, com travessão, repetindo o que a tela já mostra, e o do Fiscal
 * dizia "Junho de 2026" em setembro (`D.PERIODO`). Regra 3 do texto de tela: um título, não
 * título + subtítulo (emenda 5 do `maisa-design`). O guarda `subtitulo.test.ts` reprova a volta. */
/** A ação de criar de uma tela, no slot da casca. `peso` diz se o botão é cheio (primário) ou não. */
type AcaoDaTela = { rotulo: string; icone: string; onClick: () => void; peso: "primario" | "secundario" };
type St = ReturnType<typeof useStore>;

/* ⚠️ `tituloCelular` (28/09/2026, regressão 1 da verificação da Onda 1). No cabeçalho de 56px do
 * celular o título divide 390px com o status curto, a lupa e o "＋": sobram 135px com "Sem
 * WhatsApp". "Documento fiscal" (173px), "Ajustes da MAISA" (178) e "Quem a MAISA atende" (225)
 * saíam cortados ("Quem a MA…"). O título curto é o nome da tela sem o complemento; a reticência
 * continua como rede, não como plano. Título novo no celular: medir antes de pôr aqui. */
const TELA: Record<TelaId, { rotulo: string; titulo: string; tituloCelular?: string; icone: string; Comp: React.ComponentType; acao?: (st: St) => AcaoDaTela | null }> = {
  /* "Encaixar cliente", secundário: o primário do dia é o "Chegou"/"Concluir" do próprio Fluxo
     (contradição C15). Abre o rascunho no próximo vago de verdade. */
  fluxo: {
    rotulo: "Fluxo de hoje", titulo: "Fluxo de hoje", icone: "flow", Comp: FluxoHoje,
    acao: (st) => ({ rotulo: "Encaixar cliente", icone: "plus", peso: "secundario", onClick: () => st.novoAgendamento(null) }),
  },
  conversas: { rotulo: "Conversas", titulo: "Conversas", icone: "chat", Comp: Conversas },
  /* No dia que a Agenda está mostrando, a partir de agora: é o "Marcar" que morava na barra do
     calendário, e não existia no celular (03 P0-1). */
  agenda: {
    rotulo: "Agenda", titulo: "Agenda", icone: "calendar", Comp: Agenda,
    acao: (st) => ({ rotulo: "Marcar atendimento", icone: "plus", peso: "primario", onClick: () => st.novoAgendamento(null, { dia: st.diaSel }) }),
  },
  /* Sem ação antes de ler: a tela ainda é esqueleto, e o formulário abriria sobre nada. */
  clientes: {
    rotulo: "Clientes", titulo: "Clientes", icone: "clientes", Comp: Clientes,
    acao: (st) => (st.cadastroCarregado ? { rotulo: "Novo cliente", icone: "plus", peso: "primario", onClick: () => st.pedirNovo("cliente") } : null),
  },
  /* ⚠️ O ID CONTINUA `faturamento`, O RÓTULO VIROU "Fiscal" (Bruno, 26/08/2026: *"que vamos
     renomear para fiscal"*). O id é contrato com o link profundo (`?tela=faturamento`), com o
     `localStorage` de quem já usa e com os testes — renomeá-lo quebraria link já compartilhado
     para trocar uma palavra na tela. */
  faturamento: { rotulo: "Fiscal", titulo: "Fiscal", icone: "receipt", Comp: Faturamento },
  // Fora do rail, como `contatos`: escolher entre nota fiscal e recibo é decisão de uma vez só.
  // Chega-se por "Mais" e pelo link "Documento fiscal" no próprio Faturamento.
  fiscal: { rotulo: "Documento fiscal", titulo: "Documento fiscal", tituloCelular: "Documento", icone: "config", Comp: DocumentoFiscal },
  equipe: {
    rotulo: "Equipe", titulo: "Equipe", icone: "equipe", Comp: Equipe,
    acao: (st) => (st.cadastroCarregado ? { rotulo: "Adicionar profissional", icone: "plus", peso: "primario", onClick: () => st.pedirNovo("profissional") } : null),
  },
  /* Catálogo sem "novo serviço" é relatório, não catálogo. */
  servicos: {
    rotulo: "Serviços", titulo: "Serviços", icone: "tag", Comp: Servicos,
    acao: (st) => ({ rotulo: "Novo serviço", icone: "plus", peso: "primario", onClick: st.criarServico }),
  },
  assistente: { rotulo: "A MAISA", titulo: "Ajustes da MAISA", tituloCelular: "Ajustes", icone: "bot", Comp: AMaisa },
  // Fora do rail e das abas de propósito: é tarefa de configuração que se faz uma vez, e um
  // ícone permanente na barra competiria com as telas do dia a dia. Chega-se aqui pelo
  // cartão "De quem é esse número" (Ajustes da MAISA) e pelos atalhos do "Mais" — que é
  // exatamente o caminho que a pessoa já percorre quando decide mexer nisso.
  contatos: { rotulo: "Meus contatos", titulo: "Quem a MAISA atende", tituloCelular: "Contatos", icone: "clientes", Comp: Contatos },
  mais: { rotulo: "Mais", titulo: "Mais", icone: "dots", Comp: Mais },
};

/** Grupos do rail — separados por hairline: o dia, o dinheiro, a configuração. */
const GRUPOS: TelaId[][] = [
  ["fluxo", "conversas", "agenda"],
  ["clientes", "faturamento"],
  ["equipe", "servicos", "assistente", "mais"],
];

/** Abas do mobile e quais telas cada uma representa. */
const ABAS: { id: TelaId; rotulo: string; cobre: TelaId[] }[] = [
  { id: "fluxo", rotulo: "Hoje", cobre: ["fluxo"] },
  { id: "conversas", rotulo: "Conversas", cobre: ["conversas"] },
  { id: "agenda", rotulo: "Agenda", cobre: ["agenda"] },
  { id: "clientes", rotulo: "Clientes", cobre: ["clientes"] },
  { id: "mais", rotulo: "Mais", cobre: ["mais", "faturamento", "fiscal", "equipe", "servicos", "assistente", "contatos"] },
];

/* ───────────────────────────── contadores ─────────────────────────────
 * Os badges do rail existem para uma coisa: dizer o que exige você sem que você
 * precise entrar na tela. Então contam pendência, não volume. */

function usePendencias() {
  const st = useStore();
  /* Do store, não do fixture: `D.CONVERSAS` era uma lista de seis, então este badge contava
     pendência inventada. Agora conta conversa real esperando resposta — e o estado vem do
     servidor, o mesmo que a MAISA lê para decidir se responde. */
  const conversas = st.conversas.filter((c) => c.estado === "espera" || c.estado === "voce").length;
  const notas = st.fechamento.filter((c) => {
    const stt = st.notaDe(c.id).status;
    return stt === "pendente" || stt === "processando" || stt === "erro";
  }).length;
  return { conversas, notas, fila: st.fila.length };
}

/* ───────────────────────────── rail (desktop) ───────────────────────────── */

function ItemRail({ id, badge }: { id: TelaId; badge?: number }) {
  const st = useStore();
  const t = TELA[id];
  const on = st.tela === id;
  return (
    <button
      onClick={() => st.irPara(id)}
      title={t.rotulo}
      aria-current={on ? "page" : undefined}
      className="m-nav-item m-press m-focus"
      style={s(`width:100%;height:46px;flex-shrink:0;border:none;border-radius:var(--r-painel);cursor:pointer;display:flex;align-items:center;gap:12px;padding:0 15px;position:relative;background:${on ? "var(--nav-active)" : "transparent"}`)}
    >
      {/* barra de tela ativa — some junto com o hover, não pisca.
          Era dourada. Não pode ser: no rail o ouro já significa "isto pede você" (ponto e badge de
          pendência, e o CTA da topbar). Duas mensagens na mesma cor é nenhuma mensagem — seleção
          passa a --nav-soft, que sobre --nav dá 8.8:1 e não briga com o ouro. */}
      <span style={s(`position:absolute;left:-12px;top:13px;width:3px;height:20px;border-radius:2px;background:${on ? "var(--nav-soft)" : "transparent"}`)} />
      <span style={s("flex-shrink:0;display:flex;position:relative")}>
        <Icon name={t.icone} size={21} sw={1.9} stroke={on ? "var(--nav-ink)" : "var(--nav-muted)"} />
        {/* ponto de pendência: ouro FICA aqui — sobre --nav dá 7.3:1, e pendência é chamado à ação
            (o mesmo recado do botão dourado da topbar), não estado decorativo. --warn daria 2.4:1
            neste fundo, invisível num ponto de 8px. */}
        {!!badge && (
          <span style={s("position:absolute;top:-3px;right:-4px;min-width:8px;height:8px;border-radius:999px;background:var(--warm)")} />
        )}
      </span>
      {/* Rótulo na voz da sidebar (Alegreya Sans). O peso agora TAMBÉM marca a tela ativa —
          antes só a cor fazia isso, e cor sozinha é o sinal mais frágil que existe. */}
      <span className="m-rail-label" style={s(`flex:1;text-align:left;font-family:var(--font-nav);font-size:var(--t-nav);font-weight:${on ? "var(--w-nav-on)" : "var(--w-nav)"};color:${on ? "var(--nav-ink)" : "var(--nav-muted)"}`)}>
        {t.rotulo}
      </span>
      {/* badge de contagem: sem mono (é número que muda, não string de máquina) — .n dá os
          tabulares, e --w-data (500) porque contagem é DADO, não título. */}
      {!!badge && (
        <span className="m-rail-label n" style={s("flex-shrink:0;min-width:21px;height:21px;padding:0 7px;border-radius:999px;background:var(--warm);color:var(--warm-ink);font-size:var(--t-micro);font-weight:var(--w-data);display:flex;align-items:center;justify-content:center")}>
          {badge}
        </span>
      )}
    </button>
  );
}

function Rail() {
  const st = useStore();
  const p = usePendencias();
  const badge: Partial<Record<TelaId, number>> = { conversas: p.conversas, faturamento: p.notas };

  /* O rail abre no hover (CSS) e na navegação por TECLADO (esta classe). Antes as duas intenções
     estavam num `:has(:focus-visible)` só, e o resultado era o rail preso aberto depois de um
     clique de mouse, cobrindo o título da tela. Aqui a distinção é explícita: só entra em `is-nav`
     quem chegou por tecla, e sai no primeiro movimento de ponteiro ou ao perder o foco. */
  const [porTeclado, setPorTeclado] = useState(false);

  return (
    <div
      style={s("width:76px;flex-shrink:0;position:relative;z-index:30")}
      onPointerDown={() => setPorTeclado(false)}
    >
      <nav
        aria-label="Navegação principal"
        className={`m-rail${porTeclado ? " is-nav" : ""}`}
        onKeyDown={(e) => { if (e.key === "Tab" || e.key.startsWith("Arrow")) setPorTeclado(true); }}
        onFocus={(e) => { if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) setPorTeclado(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPorTeclado(false); }}
        onPointerMove={() => { if (porTeclado) setPorTeclado(false); }}
        /* Colado na borda e na tela (Bruno, 28/09/2026: "junte a sidebar da tela principal, não
           deixe mais esse fundo vazio"). Até aqui o rail e o main flutuavam, cada um com sombra,
           separados por um vão de 14px de fundo vazio. Sem sombra parado: a sombra só aparece
           com o rail ABERTO, quando ele passa por cima da tela (ver `.m-rail` no globals.css). */
        style={s("position:absolute;top:0;bottom:0;left:0;background:var(--nav);border-radius:var(--r-casca);display:flex;flex-direction:column;padding:18px 12px;gap:4px;overflow:hidden")}
      >
        <div style={s("display:flex;align-items:center;gap:12px;padding-left:3px;margin-bottom:14px;flex-shrink:0")}>
          {/* o "m" é a marca em forma de selo, mas não é o wordmark: --w-emph é reservado a três
              lugares no app e aqui ele cabe no título (600). Fica na Plex Sans de propósito — a
              Jakarta só existe para o logotipo escrito. */}
          <span style={s("width:40px;height:40px;flex-shrink:0;border-radius:var(--r-painel);background:var(--nav-active);display:flex;align-items:center;justify-content:center;color:var(--warm);font-weight:var(--w-title);font-size:var(--t-title);line-height:1")}>m</span>
          {/* wordmark: único --w-emph deste arquivo, e o único ponto do app onde a Jakarta entra */}
          <span className="m-rail-label" style={s("font-family:var(--font-jakarta), system-ui, sans-serif;font-size:var(--t-lg);font-weight:var(--w-emph);letter-spacing:var(--ls-lg);color:var(--warm)")}>maisa</span>
        </div>

        {GRUPOS.map((grupo, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={s("height:1px;flex-shrink:0;background:var(--nav-line);margin:12px 3px")} />}
            {grupo.map((id) => <ItemRail key={id} id={id} badge={badge[id]} />)}
          </React.Fragment>
        ))}

        <div style={s("margin-top:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0")}>
          <div style={s("display:flex;align-items:center;gap:12px;padding-left:3px")}>
            <Monogram name={st.cadastro.negocio.nome} id={st.cadastro.negocio.nome} size={40} radius={13} />
            <span className="m-rail-label" style={s("min-width:0;line-height:1.3")}>
              {/* nome do negócio e plano: também na voz da sidebar — é a identidade de quem usa,
                  não dado de tarefa. Peso 700 porque a Alegreya não tem 600. */}
              {/* ⚠️ Nome e plano só depois de ler (25/09/2026, T4/T5 e contradição C6): o cadastro
                  nasce com o fixture de propósito, e o rail o exibia como verdade ("Seu Negócio",
                  "Plano Profissional"). O plano é o da assinatura, a mesma fonte da gaveta. */}
              {st.cadastroCarregado
                ? <span style={s("display:block;font-family:var(--font-nav);font-size:var(--t-sm);font-weight:var(--w-nav-on);color:var(--nav-ink)")}>{st.cadastro.negocio.nome}</span>
                : <span aria-hidden style={s("display:block;width:110px;height:12px;margin:3px 0;border-radius:var(--r-controle);background:var(--nav-active)")} />}
              {st.assinatura.status === "ok" && st.assinatura.assinatura
                ? <span style={s("display:block;font-family:var(--font-nav);font-size:var(--t-label);font-weight:var(--w-nav);color:var(--nav-soft)")}>Plano {st.assinatura.assinatura.plano}</span>
                : st.assinatura.status === "carregando"
                  ? <span aria-hidden style={s("display:block;width:80px;height:10px;margin:4px 0;border-radius:var(--r-controle);background:var(--nav-active)")} />
                  : null}
            </span>
          </div>
          <div className="m-rail-label"><UserMenu /></div>
        </div>
      </nav>
    </div>
  );
}

/* ───────────────────────────── confirmação do lote fiscal ─────────────────────────────
 * Emitir NFS-e em lote é irreversível, tem prazo legal para cancelamento e sai do navegador para
 * a prefeitura. Disparava direto, dos DOIS botões, sem nenhuma pergunta — e o ConfirmDialog já
 * existia em ui.tsx, sem uso. Diz quantas e quanto, porque é a pergunta que o usuário faria. */
function ConfirmaLote() {
  const st = useStore();
  const n = st.emitiveis.length;
  const valor = st.emitiveis.reduce((a, c) => a + c.valor, 0);
  return (
    <ConfirmDialog
      open={st.loteAberto}
      title={n === 1 ? "Emitir 1 nota fiscal?" : `Emitir ${n} notas fiscais?`}
      message={`Total de ${fmt(valor)}. As notas vão para a prefeitura e não dá para desfazer em lote. Cancelar depois é uma a uma, e tem prazo.`}
      confirmText={n === 1 ? "Emitir a nota" : `Emitir as ${n}`}
      cancelText="Agora não"
      onConfirm={st.confirmarLote}
      onCancel={st.fecharLote}
    />
  );
}

/* ───────────────────────────── o slot e o "Novo" ─────────────────────────────
 * Saíram daqui o "Emitir N notas" dourado do Fiscal (o botão de emitir mora na tela, onde
 * `vocabulario()` decide se ele existe) e o "Resolver N pendências" do Fluxo (a fila já está na
 * própria tela, e âmbar não é ação). "assistente" e "mais" nunca tiveram: os ajustes gravam
 * sozinhos, e o suporte tem o botão dele na tela. */

/** Os três "criar" que valem de qualquer lugar (T2). "Novo serviço" leva à tela, onde ele nasce
 *  e a gaveta abre (contradição C17); o de cliente abre o formulário da tela de Clientes. */
function itensDoNovo(st: St): { rotulo: string; onClick: () => void }[] {
  return [
    { rotulo: "Marcar atendimento", onClick: () => st.novoAgendamento(null, st.tela === "agenda" ? { dia: st.diaSel } : undefined) },
    { rotulo: "Novo cliente", onClick: () => { st.irPara("clientes"); st.pedirNovo("cliente"); } },
    { rotulo: "Novo serviço", onClick: () => { st.irPara("servicos"); st.criarServico(); } },
  ];
}

/** O menu "Novo". `gatilho` desenha o botão que abre (a topbar e o "＋" do celular são diferentes). */
function MenuNovo({ gatilho, alinhar = "direita" }: { gatilho: (p: { aberto: boolean; alternar: () => void }) => React.ReactNode; alinhar?: "direita" }) {
  const st = useStore();
  const [aberto, setAberto] = useState(false);
  const caixa = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <div ref={caixa} style={s("position:relative;flex-shrink:0")}>
      {gatilho({ aberto, alternar: () => setAberto((v) => !v) })}
      {aberto && (
        <div
          role="menu"
          aria-label="Novo"
          className="m-reveal"
          style={s(`position:absolute;top:calc(100% + 8px);${alinhar === "direita" ? "right:0" : "left:0"};z-index:60;min-width:230px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-pop);padding:6px;display:flex;flex-direction:column`)}
        >
          {itensDoNovo(st).map((it) => (
            <button
              key={it.rotulo}
              type="button"
              role="menuitem"
              onClick={() => { setAberto(false); it.onClick(); }}
              className="m-hov-bg m-focus"
              style={s("min-height:44px;padding:0 12px;border:none;border-radius:var(--r-controle);background:transparent;text-align:left;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:10px")}
            >
              <Icon name="plus" size={16} sw={2.2} stroke="var(--primary)" />
              {it.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** O slot, na topbar (clara). Primário = `--primary` cheio; secundário = contorno. */
function AcaoDaTopbar() {
  const st = useStore();
  const a = TELA[st.tela].acao?.(st) ?? null;
  if (!a) return null;
  const cor = a.peso === "primario"
    ? "border:1px solid var(--primary);background:var(--primary);color:var(--on-primary)"
    : "border:1px solid var(--border);background:var(--surface);color:var(--ink)";
  return (
    <button
      type="button"
      onClick={a.onClick}
      className={`${a.peso === "primario" ? "m-hov-primary" : "m-hov-bg"} m-press m-focus`}
      style={s(`height:36px;padding:0 14px;border-radius:var(--r-controle);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;${cor}`)}
    >
      <Icon name={a.icone} size={16} sw={2.3} />
      {a.rotulo}
    </button>
  );
}

/** O "Novo" da topbar: contorno, para não disputar com o slot. */
function NovoDaTopbar() {
  return (
    <MenuNovo
      gatilho={({ aberto, alternar }) => (
        <button
          type="button"
          onClick={alternar}
          aria-haspopup="menu"
          aria-expanded={aberto}
          className="m-hov-bg m-press m-focus"
          style={s("height:36px;padding:0 10px 0 12px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")}
        >
          Novo
          <Icon name="chevron-down" size={15} sw={2.2} />
        </button>
      )}
    />
  );
}

/** O "＋" do celular: a ação da tela, ou o menu "Novo" onde a tela não tem ação. 44px. */
function MaisDoCelular() {
  const st = useStore();
  const a = TELA[st.tela].acao?.(st) ?? null;
  /* Cheio só quando é o primário da tela; o "Encaixar" do Fluxo e o menu "Novo" são contorno,
     para a dobra ter um primário só (e a tela o dela, quando tiver). */
  const cheio = a?.peso === "primario";
  const estilo = s(`width:44px;height:44px;border-radius:var(--r-controle);cursor:pointer;display:flex;align-items:center;justify-content:center;${cheio ? "border:1px solid var(--primary);background:var(--primary);color:var(--on-primary)" : "border:1px solid var(--border);background:var(--surface);color:var(--primary)"}`);
  if (a) {
    return (
      <button type="button" onClick={a.onClick} aria-label={a.rotulo} title={a.rotulo} className={`${cheio ? "m-hov-primary" : "m-hov-bg"} m-press-icon m-focus`} style={estilo}>
        <Icon name="plus" size={20} sw={2.3} />
      </button>
    );
  }
  return (
    <MenuNovo
      gatilho={({ aberto, alternar }) => (
        <button type="button" onClick={alternar} aria-label="Novo" aria-haspopup="menu" aria-expanded={aberto} className="m-hov-bg m-press-icon m-focus" style={estilo}>
          <Icon name="plus" size={20} sw={2.3} />
        </button>
      )}
    />
  );
}

/* ───────────────────────────── topbar (desktop) ───────────────────────────── */

/**
 * O aviso de que a tela está mostrando PLACEHOLDER, não o negócio de verdade.
 *
 * Existe porque o store, quando `/api/cadastro` falha, mantém o fixture na tela (ver
 * `CADASTRO_INICIAL` em `estado/store.tsx` para o porquê dessa escolha). Sem este aviso a
 * escolha seria indefensável: o rail escreveria "Seu Negócio · Plano Profissional", a tela
 * de Clientes anunciaria "de 17 cadastrados" com nomes inventados, e o Faturamento
 * ofereceria emitir nota com CPF de fixture — tudo com cara de dado real.
 *
 * Fica na Topbar, e não numa tela: o cadastro alimenta TODAS elas, então o aviso precisa
 * viajar junto com a casca. Vermelho e no topo de propósito — é para incomodar.
 */
function AvisoCadastro({ celular }: { celular?: boolean }) {
  const st = useStore();
  if (!st.cadastroErro) return null;

  return (
    <div
      role="status"
      style={s(
        `flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px ${celular ? 16 : 24}px;` +
        "background:var(--danger-soft);color:var(--danger);border-bottom:1px solid var(--danger)",
      )}
    >
      <Icon name="alert" size={15} style={s("flex-shrink:0")} />
      <span style={s("font-size:var(--t-label);font-weight:var(--w-title)")}>
        {st.cadastroErro} Os dados abaixo são de exemplo, não do seu negócio.
      </span>
    </div>
  );
}

/**
 * O mesmo aviso, para os ajustes da MAISA.
 *
 * Separado de `AvisoCadastro` porque as duas falhas são independentes e dizem coisas
 * diferentes: o cadastro falhar significa "os números na tela são inventados"; os ajustes
 * falharem significa "o que você está lendo aqui pode não ser o que a MAISA usa no
 * WhatsApp do seu cliente". A segunda é pior e não pode ficar escondida atrás da primeira.
 *
 * ⚠️ ISTO FALTAVA, e a falta apareceu no primeiro teste real: com a conta sem negócio, o
 * `PATCH` voltava 409, o store guardava a frase certa ("Esta conta ainda não tem um
 * negócio criado") e a tela mostrava um toast genérico dizendo "não foi possível salvar".
 * A informação existia e não chegava a ninguém — que é o mesmo defeito que o `ajustesErro`
 * foi criado para não ter.
 */
function AvisoAjustes({ celular }: { celular?: boolean }) {
  const st = useStore();
  if (!st.ajustesErro) return null;

  return (
    <div
      role="status"
      style={s(
        `flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px ${celular ? 16 : 24}px;` +
        "background:var(--danger-soft);color:var(--danger);border-bottom:1px solid var(--danger)",
      )}
    >
      <Icon name="alert" size={15} style={s("flex-shrink:0")} />
      <span style={s("flex:1;min-width:0;font-size:var(--t-label);font-weight:var(--w-title)")}>
        {st.ajustesErro} Os ajustes da MAISA abaixo podem não ser os que ela está usando.
      </span>
      {/* Erro tem saída (T4, 28/09/2026): a faixa era a única frase de falha dos Ajustes no celular
          e não oferecia nada. Sessão acabada: entrar; o resto: ler de novo. */}
      <button
        type="button"
        onClick={st.ajustesPrecisaEntrar ? ENTRAR.fazer : st.recarregarAjustes}
        className="m-press m-focus"
        style={s("flex-shrink:0;min-height:44px;padding:0 12px;border:1px solid var(--danger);border-radius:var(--r-controle);background:var(--surface);color:var(--danger);font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);cursor:pointer")}
      >
        {st.ajustesPrecisaEntrar ? ENTRAR.rotulo : "Tentar de novo"}
      </button>
    </div>
  );
}

function Topbar({ onBuscar }: { onBuscar: () => void }) {
  const st = useStore();
  const t = TELA[st.tela];

  return (
    /* 56px: sem o subtítulo, a topbar é uma linha só (título, busca, status, ação).
       ⚠️ CLARA desde 28/09/2026, com a linha fina embaixo: navy, ela formava um L com o rail e
       cruzava a janela por cima da coluna lateral. Só o rail é escuro. A altura e a linha são as
       mesmas do `CabecalhoDaLateral`, para os dois terminarem juntos. */
    <header style={s("height:56px;flex-shrink:0;display:flex;align-items:center;gap:18px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--line)")}>
      <h1 style={s("min-width:0;margin:0;font-size:var(--t-title);font-weight:var(--w-title);letter-spacing:var(--ls-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)")}>{t.titulo}</h1>

      <button
        onClick={onBuscar}
        className="m-press m-focus"
        style={s("flex:1;max-width:360px;min-width:0;margin-left:10px;display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;border-radius:var(--r-controle);background:var(--bg);border:1px solid var(--border);color:var(--muted);cursor:pointer;text-align:left")}
      >
        <Icon name="search" size={17} sw={1.9} />
        <span style={s("flex:1;min-width:0;font-size:var(--t-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>Buscar cliente, conversa ou tela</span>
        {/* ⌘K é string de máquina — um dos poucos lugares onde o mono sobrevive. Peso de dado (500):
            é a tecla literal, não um título. */}
        <span style={s("flex-shrink:0;font-family:var(--font-mono);font-size:var(--t-micro);font-weight:var(--w-data);padding:3px 7px;border-radius:var(--r-controle);background:var(--surface);border:1px solid var(--border)")}>⌘K</span>
      </button>

      <div style={s("margin-left:auto;display:flex;align-items:center;gap:14px;flex-shrink:0")}>
        {/* O status vem de `statusDaMaisa` (interruptor E canal), nunca de `assistente.ativa`
            sozinho: até 24/09/2026 aqui pulsava "no ar" com o WhatsApp desconectado. Rótulos e
            cores por fundo moram em `StatusDaMaisa.tsx`. */}
        <StatusDaMaisa sobre="claro" />
        <NovoDaTopbar />
        <AcaoDaTopbar />
      </div>
    </header>
  );
}

/* ───────────────────────────── tab bar (mobile) ───────────────────────────── */

function TabBar() {
  const st = useStore();
  const p = usePendencias();
  const pontos: Partial<Record<TelaId, number>> = { conversas: p.conversas, fluxo: p.fila };

  return (
    <nav
      aria-label="Navegação principal"
      style={{
        /* 6px em cima e 8px embaixo (eram 8 e 10): com o cabeçalho de 56px, o cromo inteiro fica em
           128px de 844 (T11 pede ≤ 130; eram 162). */
        ...s("flex-shrink:0;background:var(--surface);border-top:1px solid var(--border);padding:6px 6px 0;display:grid;grid-template-columns:repeat(5,1fr);gap:2px"),
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      {ABAS.map((aba) => {
        const on = aba.cobre.includes(st.tela);
        const cor = on ? "var(--primary)" : "var(--muted)";
        return (
          <button
            key={aba.id}
            onClick={() => st.irPara(aba.id)}
            aria-current={on ? "page" : undefined}
            className="m-press m-focus"
            style={s(`border:none;background:${on ? "var(--primary-soft)" : "transparent"};border-radius:var(--r-painel);padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;position:relative`)}
          >
            <Icon name={TELA[aba.id].icone} size={21} sw={1.9} stroke={cor} />
            {/* mesma voz do rail: a tab bar É a navegação no mobile, então a fonte da sidebar vale
                aqui também. Peso marca a aba ativa, como no rail. */}
            <span style={s(`font-family:var(--font-nav);font-size:var(--t-label);font-weight:${on ? "var(--w-nav-on)" : "var(--w-nav)"};color:${cor}`)}>{aba.rotulo}</span>
            {/* aqui o ponto de pendência NÃO pode ser o ouro do rail: a tab bar é --surface, e sobre
                fundo claro o âmbar dá 1.6:1 (desaparece). Mesmo recado, substrato oposto → --warn. */}
            {!!pontos[aba.id] && (
              <span style={s("position:absolute;top:6px;right:22%;width:7px;height:7px;border-radius:50%;background:var(--warn)")} />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ───────────────────────────── shell ───────────────────────────── */

export default function AppShell() {
  const st = useStore();
  const layout = useLayout();
  const mobile = layout === "celular";
  const [paleta, setPaleta] = useState(false);
  const [encaixe, setEncaixe] = useState<HTMLDivElement | null>(null);
  const Ativa = TELA[st.tela].Comp;

  // ⌘K / Ctrl+K em qualquer lugar. Ignora quando o foco está num campo, senão
  // o atalho roubaria o "k" de quem está digitando uma saudação.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* O quadro antes de saber a largura: só o fundo. Ver `useLayout` (T11): pintar o painel de
     mesa aqui mostrava o rail por um quadro no celular. */
  if (layout === null) {
    return <div className="m-altura-tela" style={s("background:var(--bg)")} />;
  }

  if (mobile) {
    const cheia = st.telaCheia;
    return (
      /* ⚠️ `m-altura-tela` e não `height:100vh` (G9): no Safari do iPhone `100vh` é a janela com a
         barra de endereço recolhida, e com ela à mostra as abas iam para trás dela. */
      <div className="m-altura-tela" style={{
        ...s("display:flex;flex-direction:column;overflow:hidden;background:var(--bg)"),
        paddingTop: "env(safe-area-inset-top)",
      }}>
        {/* ⚠️ CABEÇALHO DE 56px (T11, 25/09/2026): título, status curto, lupa e o "＋". A data saiu:
            Hoje e Agenda já a escrevem, e nas outras telas ela era uma linha de 86px que não
            servia a nada. Cromo total (cabeçalho + abas) ≤ 130px de 844. */}
        {!cheia && (
        <header style={s("flex-shrink:0;height:56px;padding:0 12px 0 16px;display:flex;align-items:center;justify-content:space-between;gap:10px")}>
          <h1 style={s("min-width:0;font-size:var(--t-title);font-weight:var(--w-title);letter-spacing:var(--ls-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{TELA[st.tela].tituloCelular ?? TELA[st.tela].titulo}</h1>
          <div style={s("display:flex;align-items:center;gap:8px;flex-shrink:0")}>
            {/* O celular não tinha status nenhum: quem só usa o app pelo telefone nunca sabia se
                a MAISA estava respondendo. Curto, porque divide 390px com título e busca. */}
            <StatusDaMaisa sobre="claro" curto />
            <button
              onClick={() => setPaleta(true)}
              aria-label="Buscar"
              className="m-hov-bg m-press-icon m-focus"
              style={s("width:44px;height:44px;border:1px solid var(--border);border-radius:var(--r-controle);background:var(--surface);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center")}
            >
              <Icon name="search" size={18} sw={1.9} />
            </button>
            <MaisDoCelular />
            {/* O selo "m" saiu em 24/09/2026: não clicava, e os 46px dele eram o que faltava para o
                status caber sem cortar o título ("Ajustes da ..."). A conta no celular é o 2.4. */}
          </div>
        </header>
        )}

        {/* ⚠️ Os avisos também no celular (25/09/2026, 1A.11, 01 P0-5), e pelo mesmo motivo do
            desktop FORA do `key={st.tela}`: dentro dele remontariam a cada troca de aba. Até aqui
            o celular mostrava o fixture como dado do negócio sem uma palavra. */}
        <AvisoCadastro celular />
        <AvisoAjustes celular />
        <main key={st.tela} style={s("flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden")}>
          <Ativa />
        </main>

        {!cheia && <TabBar />}
        <Gaveta />
        <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
        <Toaster />
        <ConfirmaLote />
        <ProgressoDeEmissao />
      </div>
    );
  }

  return (
    <div className="m-altura-tela" style={s("display:flex;overflow:hidden;background:var(--bg)")}>
      <Rail />
      {/* Colunas de altura inteira (28/09/2026): a topbar fica só em cima da coluna principal, e a
          coluna lateral da tela (`<Lateral>`) sobe até o topo ao lado dela, com cabeçalho da mesma
          altura. Ver o porquê em `Lateral.tsx`. */}
      <EncaixeDaLateral.Provider value={encaixe}>
        <main style={s("flex:1;min-width:0;display:flex;flex-direction:column;border-radius:var(--r-casca);overflow:hidden;background:var(--bg)")}>
          <Topbar onBuscar={() => setPaleta(true)} />
          {/* Acima do conteúdo e FORA do `key={st.tela}`: o aviso vale para todas as telas e
              não deve remontar (nem piscar) a cada troca de tela. */}
          <AvisoCadastro />
          <AvisoAjustes />
          <div key={st.tela} style={s("flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden")}>
            <Ativa />
          </div>
        </main>
      </EncaixeDaLateral.Provider>
      <div ref={setEncaixe} style={s("display:flex;flex-shrink:0;min-height:0")} />
      <Gaveta />
      <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
      <Toaster />
      <ConfirmaLote />
      {/* ⚠️ AQUI, E NÃO DENTRO DA TELA. Ver `ProgressoDeEmissao`: montado na tela de emissão, sair
          da tela desmontaria o placar de uma emissão que continua correndo. */}
      <ProgressoDeEmissao />
    </div>
  );
}
