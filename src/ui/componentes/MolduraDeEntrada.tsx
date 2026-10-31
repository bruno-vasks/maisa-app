"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A MOLDURA DAS TELAS DE ENTRADA — `/cadastro`, `/whatsapp` e `/comecar` (31/10/2026).
 *
 * Pedido do Bruno, com o cadastro da Wise como referência: uma pergunta por tela, a barra de
 * etapas no topo e nada em volta dos campos. Antes cada rota desenhava o próprio cartão
 * (`/cadastro` com degradê e caixa, o wizard com a trilha de bolinhas dentro da coluna), e a
 * pessoa passava de uma para a outra sem saber que era o mesmo caminho.
 *
 * Três faixas, e só a do meio rola: o topo (a marca, o progresso e o X de sair), o conteúdo e o
 * pé. É a
 * regra da moldura do wizard de 28/09/2026 (T1 e 2.41): o documento tem a altura da janela, e o
 * primário que fecha a etapa fica no pé, parado, mesmo quando o catálogo é comprido.
 *
 * ⚠️ O PÉ TEM DUAS VAGAS, NESTA ORDEM: o elemento de `refDoPe` e depois `pe`. O wizard desenha o
 * primário de cada etapa junto do estado que ele usa e o manda por portal (`NoPe`, em
 * `app/comecar/Comecar.tsx`) para a primeira; o "Pular por agora" vai em `pe`, embaixo. Numa vaga
 * só, o "Pular" ficava EM CIMA do "Salvar e continuar" no catálogo, porque o portal da etapa monta
 * depois da leitura e o nó entra por último (medido em 31/10/2026). As telas curtas (`/cadastro`,
 * `/whatsapp`) põem o botão no próprio conteúdo e não têm pé.
 *
 * ★ O TOPO FLUTUA, SEM DIVISÃO (Bruno, 31/10/2026, na terceira versão). A primeira tinha a caixa
 * azul-marinho com a marca, as cinco etapas com nome e "Sair" numa barra; a segunda, a marca e
 * "Sair" numa linha com a barra de progresso de ponta a ponta embaixo. As duas ele vetou: queria
 * "algo mais flutuante e discreto, sem essas divisões claras", e escolheu entre três versões
 * desenhadas a "marca no centro". Ficou: "maisa" centralizada, uma barrinha de 96px embaixo dela
 * com o progresso, e o X de sair solto no canto. Nenhuma linha separa o topo do conteúdo.
 *
 * ⚠️ A BARRINHA NÃO TEM TEXTO NA TELA, mas tem para o leitor de tela (`aria-valuetext`, "Etapa 2
 * de 5"). Ela não depende só da cor: é o comprimento preenchido que diz quanto falta.
 * ────────────────────────────────────────────────────────────────────────────── */

import type React from "react";
import { s, Icon } from "@/ui/primitivos";

export type EtapaDaEntrada = { id: string; rotulo: string };

/** O wordmark: "maisa" em minúscula e o ponto âmbar, que é decorativo (o âmbar é marca, emenda 2). */
function Marca() {
  return (
    <span style={s("display:inline-flex;align-items:center;gap:5px")}>
      <span style={s("font-size:var(--t-lg);font-weight:var(--w-emph);color:var(--nav);line-height:1")}>maisa</span>
      <span aria-hidden style={s("width:7px;height:7px;border-radius:2px;background:var(--warm);transform:translateY(4px)")} />
    </span>
  );
}

export function MolduraDeEntrada({
  etapas, atual, aoSair, largura = 440, pe, refDoPe, chave, children,
}: {
  etapas?: readonly EtapaDaEntrada[];
  atual?: string;
  /** Sem ele, o topo não tem o X de sair (quem ainda não tem conta não tem do que sair). */
  aoSair?: () => void;
  /** Largura da coluna, em px. 440 para formulário; mais para as telas com duas colunas. */
  largura?: number;
  pe?: React.ReactNode;
  refDoPe?: (el: HTMLDivElement | null) => void;
  /** Muda a cada tela (a etapa, o passo do cadastro). A coluna remonta e os filhos entram de novo
   *  em cascata (`.m-cascata`, emenda 7): sem a troca, a segunda tela aparecia parada. */
  chave?: string;
  children: React.ReactNode;
}) {
  const temPe = pe !== undefined || refDoPe !== undefined;
  const i = etapas ? etapas.findIndex((e) => e.id === atual) : -1;
  const total = etapas?.length ?? 0;
  return (
    <div className="m-altura-tela" style={s("display:flex;flex-direction:column;background:var(--surface);overflow:hidden")}>
      <header style={s("flex-shrink:0;position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 16px 6px")}>
        <Marca />
        {i >= 0 && (
          <div
            role="progressbar" aria-label="Etapas" aria-valuemin={1} aria-valuemax={total} aria-valuenow={i + 1}
            aria-valuetext={`Etapa ${i + 1} de ${total}`}
            style={s("width:96px;height:3px;border-radius:2px;background:var(--line);overflow:hidden")}
          >
            <div className="m-progresso" style={s(`height:100%;width:${((i + 1) / total) * 100}%;border-radius:2px;background:var(--primary)`)} />
          </div>
        )}
        {aoSair && (
          <button
            type="button" onClick={aoSair} aria-label="Sair" title="Sair" className="m-hov-bg m-focus"
            style={s("position:absolute;top:10px;right:10px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--r-controle);background:none;cursor:pointer")}
          >
            <Icon name="x" size={18} stroke="var(--muted)" />
          </button>
        )}
      </header>

      <main style={s("flex:1;min-height:0;overflow-y:auto")}>
        <div key={chave} className="m-cascata" style={s(`max-width:${largura}px;margin:0 auto;padding:32px 16px 24px;display:flex;flex-direction:column;gap:22px`)}>
          {children}
        </div>
      </main>

      {temPe && (
        <div style={s("flex-shrink:0;padding:10px 16px 14px")}>
          <div style={s(`max-width:${largura}px;margin:0 auto;display:flex;flex-direction:column;gap:6px`)}>
            <div ref={refDoPe} style={s("display:flex;flex-direction:column;gap:6px")} />
            {pe}
          </div>
        </div>
      )}
    </div>
  );
}

/** O título da tela de entrada: um só, sem subtítulo (emenda 5 do `maisa-design`). */
export function TituloDaEntrada({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={s("margin:0;text-align:center;font-size:var(--t-title);line-height:1.25;font-weight:var(--w-title);color:var(--ink)")}>
      {children}
    </h1>
  );
}

/** "Voltar", "Pular por agora": a ação que não é o caminho principal, sem caixa. */
export function AcaoDiscreta({ children, onClick, desligada }: { children: React.ReactNode; onClick: () => void; desligada?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={desligada} className="m-focus"
      style={s(`align-self:center;min-height:44px;padding:0 12px;border:none;background:none;font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--muted);cursor:${desligada ? "not-allowed" : "pointer"}`)}
    >
      {children}
    </button>
  );
}
