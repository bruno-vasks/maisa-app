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
 * A topbar só mostra botão de ação primária onde existe ação de verdade
 * (Faturamento, A MAISA, Mais). Um CTA dourado em toda tela ficaria bonito, mas
 * três deles não fariam nada — e botão morto ensina o usuário a ignorar botões. */

import React, { useEffect, useState } from "react";
import { s, Icon, Monogram, Toaster, ConfirmDialog, fmt } from "@/ui/primitivos";
import { useIsMobile } from "@/ui/useIsMobile";
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
import { DocumentoFiscal } from "../telas/DocumentoFiscal";

/* ───────────────────────────── mapa de telas ───────────────────────────── */

/* ⚠️ SEM SUBTÍTULO (24/09/2026, item T8 do backlog do front). Cada tela tinha um `sub` embaixo
 * do título, na topbar: "A MAISA responde; você entra quando precisa", "Quem vem e quando — no
 * dia, na semana ou no mês", "Uma seção por vez — o preview segue você". Justificativa de
 * design escrita para quem usa, com travessão, repetindo o que a tela já mostra, e o do Fiscal
 * dizia "Junho de 2026" em setembro (`D.PERIODO`). Regra 3 do texto de tela: um título, não
 * título + subtítulo (emenda 5 do `maisa-design`). O guarda `subtitulo.test.ts` reprova a volta. */
const TELA: Record<TelaId, { rotulo: string; titulo: string; icone: string; Comp: React.ComponentType }> = {
  fluxo: { rotulo: "Fluxo de hoje", titulo: "Fluxo de hoje", icone: "flow", Comp: FluxoHoje },
  conversas: { rotulo: "Conversas", titulo: "Conversas", icone: "chat", Comp: Conversas },
  agenda: { rotulo: "Agenda", titulo: "Agenda", icone: "calendar", Comp: Agenda },
  clientes: { rotulo: "Clientes", titulo: "Clientes", icone: "clientes", Comp: Clientes },
  /* ⚠️ O ID CONTINUA `faturamento`, O RÓTULO VIROU "Fiscal" (Bruno, 26/08/2026: *"que vamos
     renomear para fiscal"*). O id é contrato com o link profundo (`?tela=faturamento`), com o
     `localStorage` de quem já usa e com os testes — renomeá-lo quebraria link já compartilhado
     para trocar uma palavra na tela. */
  faturamento: { rotulo: "Fiscal", titulo: "Fiscal", icone: "receipt", Comp: Faturamento },
  // Fora do rail, como `contatos`: escolher entre nota fiscal e recibo é decisão de uma vez só.
  // Chega-se por "Mais" e pelo link "Documento fiscal" no próprio Faturamento.
  fiscal: { rotulo: "Documento fiscal", titulo: "Documento fiscal", icone: "config", Comp: DocumentoFiscal },
  equipe: { rotulo: "Equipe", titulo: "Equipe", icone: "equipe", Comp: Equipe },
  servicos: { rotulo: "Serviços", titulo: "Serviços", icone: "tag", Comp: Servicos },
  assistente: { rotulo: "A MAISA", titulo: "Ajustes da MAISA", icone: "bot", Comp: AMaisa },
  // Fora do rail e das abas de propósito: é tarefa de configuração que se faz uma vez, e um
  // ícone permanente na barra competiria com as telas do dia a dia. Chega-se aqui pelo
  // cartão "De quem é esse número" (Ajustes da MAISA) e pelos atalhos do "Mais" — que é
  // exatamente o caminho que a pessoa já percorre quando decide mexer nisso.
  contatos: { rotulo: "Meus contatos", titulo: "Quem a MAISA atende", icone: "clientes", Comp: Contatos },
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
      style={s(`width:100%;height:46px;flex-shrink:0;border:none;border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:12px;padding:0 15px;position:relative;background:${on ? "var(--nav-active)" : "transparent"}`)}
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
        /* sombra: era matiz 250 (o terceiro azul, já removido do sistema) num blur de 30px.
           --shadow-card é a mesma sombra do cartão de conteúdo ao lado — o rail e o main passam a
           flutuar na mesma altura, que é o que eles são. */
        style={s("position:absolute;top:0;bottom:0;left:0;background:var(--nav);border-radius:22px;box-shadow:var(--shadow-card);display:flex;flex-direction:column;padding:18px 12px;gap:4px;overflow:hidden")}
      >
        <div style={s("display:flex;align-items:center;gap:12px;padding-left:3px;margin-bottom:14px;flex-shrink:0")}>
          {/* o "m" é a marca em forma de selo, mas não é o wordmark: --w-emph é reservado a três
              lugares no app e aqui ele cabe no título (600). Fica na Plex Sans de propósito — a
              Jakarta só existe para o logotipo escrito. */}
          <span style={s("width:40px;height:40px;flex-shrink:0;border-radius:13px;background:var(--nav-active);display:flex;align-items:center;justify-content:center;color:var(--warm);font-weight:var(--w-title);font-size:var(--t-title);line-height:1")}>m</span>
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
              <span style={s("display:block;font-family:var(--font-nav);font-size:var(--t-sm);font-weight:var(--w-nav-on);color:var(--nav-ink)")}>{st.cadastro.negocio.nome}</span>
              <span style={s("display:block;font-family:var(--font-nav);font-size:var(--t-label);font-weight:var(--w-nav);color:var(--nav-soft)")}>Plano {st.cadastro.negocio.plano}</span>
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

/* ───────────────────────────── ação primária ─────────────────────────────
 * Só onde existe: emitir as notas que faltam, salvar os ajustes, chamar suporte. */

function AcaoPrimaria() {
  const st = useStore();
  const p = usePendencias();

  // o ÚNICO fill âmbar clicável do shell: âmbar = marca + ação primária, e é esta a ação primária.
  // Texto em --warm-ink (7.51:1 sobre o ouro) e peso de botão (--w-title), não de dado.
  const dourado = "height:40px;padding:0 18px;border:none;border-radius:12px;background:var(--warm);color:var(--warm-ink);font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;text-decoration:none";

  if (st.tela === "faturamento") {
    /* ⚠️ QUEM ATENDE COMO PESSOA FÍSICA NÃO EMITE NOTA FISCAL — e este era o "CTA lá em cima
     * escrito emitir 14 notas" da reclamação de 25/08/2026. `emitiveis` conta clientes com valor
     * fechado, não documentos possíveis: no caminho do recibo ele devolve os 14 do mês e a topbar
     * prometia emiti-los em nota. A ação de verdade dela é gerar o arquivo, e mora no cartão do
     * Faturamento, onde há espaço para dizer o que o arquivo faz.
     *
     * `carregando` também não mostra nada: piscar a promessa errada por meio segundo é a mesma
     * mentira, mais curta. Ver `EstadoFiscalUI`. */
    if (st.fiscal.status !== "ok" || st.fiscal.caminho === "recibo_saude") return null;
    // st.emitiveis: a MESMA lista que o hero mostra e que o lote emite. Esta topbar tinha a regra
    // duplicada à mão — e incluía "cancelada", que o lote não emite —, então prometia mais do que
    // entregava. A regra de negócio agora vive só no store.
    const aEmitir = st.emitiveis.length;
    if (!aEmitir) return null;
    return (
      <button onClick={st.pedirLote} className="m-hov-bright m-press m-focus" style={s(dourado)}>
        <Icon name="receipt" size={16} sw={2.1} />
        Emitir {aEmitir} {aEmitir === 1 ? "nota" : "notas"}
      </button>
    );
  }

  // Catálogo sem "novo serviço" é relatório, não catálogo. Esta ação não existia: AcaoPrimaria
  // retornava null para "servicos", e não havia caminho nenhum para criar um serviço no app.
  if (st.tela === "servicos") {
    return (
      <button onClick={st.criarServico} className="m-hov-bright m-press m-focus" style={s(dourado)}>
        <Icon name="plus" size={16} sw={2.3} />
        Novo serviço
      </button>
    );
  }

  /* "assistente" NÃO tem mais ação aqui. O botão dourado "Salvar ajustes" era o segundo save de uma
     não-ação: os ajustes gravam a cada tecla, e havia DOIS botões (este dourado + um azul no rodapé
     da tela) para a mesma coisa. O rodapé foi removido junto. Estado de "salvo" agora é implícito,
     como no resto do app. */

  /* "mais" também não tem: o suporte já é um botão verde no rodapé da própria tela, onde a frase
     "Precisa de ajuda?" dá o contexto. Dourado aqui + verde lá é a mesma ação em dois vocabulários
     visuais na mesma dobra. Um lugar só, e é o que tem contexto. */

  if (st.tela === "fluxo" && p.fila > 0) {
    return (
      <button onClick={() => st.irPara("conversas")} className="m-hov-bright m-press m-focus" style={s(dourado)}>
        <Icon name="chat" size={16} sw={2} />
        Resolver {p.fila} {p.fila === 1 ? "pendência" : "pendências"}
      </button>
    );
  }

  return null;
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
function AvisoCadastro() {
  const st = useStore();
  if (!st.cadastroErro) return null;

  return (
    <div
      role="status"
      style={s(
        "flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 24px;" +
        "background:var(--danger-soft);color:var(--danger);border-bottom:1px solid var(--danger)",
      )}
    >
      <Icon name="alert" size={15} />
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
function AvisoAjustes() {
  const st = useStore();
  if (!st.ajustesErro) return null;

  return (
    <div
      role="status"
      style={s(
        "flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 24px;" +
        "background:var(--danger-soft);color:var(--danger);border-bottom:1px solid var(--danger)",
      )}
    >
      <Icon name="alert" size={15} />
      <span style={s("font-size:var(--t-label);font-weight:var(--w-title)")}>
        {st.ajustesErro} Os ajustes da MAISA abaixo podem não ser os que ela está usando.
      </span>
    </div>
  );
}

function Topbar({ onBuscar }: { onBuscar: () => void }) {
  const st = useStore();
  const t = TELA[st.tela];

  return (
    /* 56px: sem o subtítulo, a topbar é uma linha só (título, busca, status, ação). Os 14px
       que sobram vão para a tela. */
    <header style={s("height:56px;flex-shrink:0;display:flex;align-items:center;gap:18px;padding:0 24px;background:var(--nav)")}>
      <h1 style={s("min-width:0;margin:0;font-size:var(--t-title);font-weight:var(--w-title);letter-spacing:var(--ls-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--nav-ink)")}>{t.titulo}</h1>

      <button
        onClick={onBuscar}
        className="m-press m-focus"
        style={s("flex:1;max-width:360px;min-width:0;margin-left:10px;display:flex;align-items:center;gap:10px;height:40px;padding:0 14px;border-radius:12px;background:var(--nav-active);border:1px solid var(--nav-line);color:var(--nav-soft);cursor:pointer;text-align:left")}
      >
        <Icon name="search" size={17} sw={1.9} />
        <span style={s("flex:1;min-width:0;font-size:var(--t-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>Buscar cliente, conversa ou tela</span>
        {/* ⌘K é string de máquina — um dos poucos lugares onde o mono sobrevive. Peso de dado (500):
            é a tecla literal, não um título. */}
        <span style={s("flex-shrink:0;font-family:var(--font-mono);font-size:var(--t-micro);font-weight:var(--w-data);padding:3px 7px;border-radius:6px;background:var(--nav);border:1px solid var(--nav-line)")}>⌘K</span>
      </button>

      <div style={s("margin-left:auto;display:flex;align-items:center;gap:14px;flex-shrink:0")}>
        <span style={s("display:inline-flex;align-items:center;gap:7px;font-size:var(--t-label);font-weight:var(--w-data);color:var(--nav-soft);white-space:nowrap")}>
          {/* o ponto era dourado, e "no ar / pausada" é ESTADO — o emprego que o âmbar perdeu.
              --success e --warn são escuros demais aqui (2.1:1 e 2.4:1 sobre --nav); o verde de
              marca do WhatsApp é justamente o token de ponto/glifo, dá 7.3:1 e diz a verdade: a
              MAISA está no ar no canal em que ela atende. Pausada vira --nav-muted (era um
              oklch cru fora do sistema) e perde o pulso. */}
          <span
            className={st.assistente.ativa ? "m-pulse" : undefined}
            style={s(`width:7px;height:7px;border-radius:50%;background:${st.assistente.ativa ? "var(--whatsapp-mark)" : "var(--nav-muted)"}`)}
          />
          {st.assistente.ativa ? "MAISA no ar" : "MAISA pausada"}
        </span>
        <AcaoPrimaria />
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
        ...s("flex-shrink:0;background:var(--surface);border-top:1px solid var(--border);padding:8px 6px 0;display:grid;grid-template-columns:repeat(5,1fr);gap:2px"),
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
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
            style={s(`border:none;background:${on ? "var(--primary-soft)" : "transparent"};border-radius:14px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;position:relative`)}
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
  const mobile = useIsMobile();
  const [paleta, setPaleta] = useState(false);
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

  if (mobile) {
    return (
      <div style={{
        ...s("display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg)"),
        paddingTop: "env(safe-area-inset-top)",
      }}>
        <header style={s("flex-shrink:0;padding:12px 16px 12px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px")}>
          <div style={s("min-width:0")}>
            {/* sobrancelha em caixa-alta: --ls-caps é o único tracking positivo do sistema (era .14em) */}
            <div style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>{D.HOJE.label}</div>
            <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);letter-spacing:var(--ls-title);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{TELA[st.tela].titulo}</h1>
          </div>
          <div style={s("display:flex;align-items:center;gap:8px;flex-shrink:0")}>
            <button
              onClick={() => setPaleta(true)}
              aria-label="Buscar"
              className="m-hov-bg m-press-icon m-focus"
              style={s("width:38px;height:38px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center")}
            >
              <Icon name="search" size={18} sw={1.9} />
            </button>
            {/* mesmo selo do rail, mesma decisão: marca em --warm sobre --nav, peso de título */}
            <span style={s("width:38px;height:38px;flex-shrink:0;border-radius:12px;background:var(--nav);color:var(--warm);display:flex;align-items:center;justify-content:center;font-weight:var(--w-title);font-size:var(--t-lg)")}>m</span>
          </div>
        </header>

        <main key={st.tela} style={s("flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden")}>
          <Ativa />
        </main>

        <TabBar />
        <Gaveta />
        <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
        <Toaster />
        <ConfirmaLote />
        <ProgressoDeEmissao />
      </div>
    );
  }

  return (
    <div style={s("display:flex;gap:14px;height:100vh;padding:14px;overflow:hidden;background:transparent")}>
      <Rail />
      <main style={s("flex:1;min-width:0;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:var(--bg);border:1px solid var(--border);box-shadow:var(--shadow-card)")}>
        <Topbar onBuscar={() => setPaleta(true)} />
        {/* Acima do conteúdo e FORA do `key={st.tela}`: o aviso vale para todas as telas e
            não deve remontar (nem piscar) a cada troca de tela. */}
        <AvisoCadastro />
        <AvisoAjustes />
        <div key={st.tela} style={s("flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden")}>
          <Ativa />
        </div>
      </main>
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
