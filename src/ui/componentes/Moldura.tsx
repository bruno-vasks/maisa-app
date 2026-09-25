"use client";
/* MAISA — a moldura de uma tela (item T1 do backlog do front, 25/09/2026).
 *
 * Três fatias, e só uma rola:
 *   - `topo`: a contagem (o mês, o total). Parada no desktop; no celular rola embora.
 *   - `cabecalho`: o que diz onde você está e como achar (busca, abas, filtros). Nunca rola.
 *   - a região (os `children`): o diário, a lista, a tabela. É a ÚNICA que rola.
 *   - `pe`: a ação que fecha o caminho ("Emitir 31 recibos"). Nunca rola.
 *
 * Por que existe: a casca já tinha a altura da janela, mas dentro dela o raro (ativação,
 * escolha fiscal, hero de contagem) ocupava o topo e o que se usa todo dia rolava num buraco,
 * ou nem rolava (a tabela do CNPJ, cortada por `overflow:hidden`, 06 P0-1). A moldura decide
 * uma vez o que fica e o que rola, e cada tela só diz o que vai em cada fatia.
 *
 * No celular (≤900px) a moldura inteira é a região que rola, com o cabeçalho e o pé grudados
 * por `position:sticky`. Não há caixa de rolagem dentro de caixa de rolagem (contradição C16).
 * O layout mora em `globals.css` (`.m-moldura*`), porque estilo inline não tem @media.
 *
 * ⚠️ NÃO PONHA `overflow:hidden` NA REGIÃO NEM NA MOLDURA (guarda G15). Item flex com
 * `overflow:hidden` encolhe até caber e esconde o resto, sem barra. CTA cortado é pior que
 * rolagem.
 *
 * ⚠️ Quem quer uma tabela que rola por dentro passa `rolarPorDentro` à `Tabela`: ela cresce até o
 * fim da região e só o corpo dela rola. A região continua podendo rolar, para o caso de um cartão
 * grande acima da tabela não a esmagar (há `min-height` de rede em `.m-tabela-rola`). */

import React from "react";
import { s } from "@/ui/primitivos";
import { DOT, type TomTag } from "./Cartao";

export function Moldura({ topo, cabecalho, pe, children, rotulo }: {
  /** A contagem da tela. No desktop fica parada com o cabeçalho; no celular rola embora, porque
   *  190px grudados no topo de uma tela de 844 são um quarto dela gasto com um número. */
  topo?: React.ReactNode;
  cabecalho?: React.ReactNode;
  pe?: React.ReactNode;
  children: React.ReactNode;
  /** Nome acessível da região que rola, quando o cabeçalho não basta para dizer o que ela é. */
  rotulo?: string;
}) {
  return (
    <div className="m-moldura m-enter">
      {topo && <div className="m-moldura-topo">{topo}</div>}
      {cabecalho && <div className="m-moldura-cab">{cabecalho}</div>}
      <div className="m-moldura-regiao" data-regiao="" role={rotulo ? "region" : undefined} aria-label={rotulo}>
        {children}
      </div>
      {pe && <div className="m-moldura-pe">{pe}</div>}
    </div>
  );
}

/** Um marco da contagem: número em tinta e o que ele conta. A forma do ponto não carrega
 *  sentido sozinha (o rótulo carrega); é só a cor do grupo. */
export type MarcoDaContagem = { n: number | string; label: string; tom: TomTag };

/**
 * A contagem que abre uma tela: rótulo em caixa-alta, o número grande e os marcos numa linha.
 *
 * É o `Hero` sem o cartão e sem o botão: numa moldura, a ação de criar é da casca (T2) e a de
 * fechar o caminho é do `pe` (contradição C3). Sem o cartão ela gasta uma linha, não um bloco.
 */
export function Contagem({ rotulo, valor, sub, marcos }: { rotulo: string; valor: string; sub?: string; marcos?: MarcoDaContagem[] }) {
  return (
    <div style={s("display:flex;align-items:flex-end;gap:10px 28px;flex-wrap:wrap")}>
      <div style={s("min-width:0")}>
        <div style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>{rotulo}</div>
        <div style={s("display:flex;align-items:baseline;gap:10px;margin-top:6px;flex-wrap:wrap")}>
          <span className="n" style={s("font-size:var(--t-data);font-weight:var(--w-emph);letter-spacing:var(--ls-data);line-height:1")}>{valor}</span>
          {sub && <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{sub}</span>}
        </div>
      </div>
      {!!marcos?.length && (
        <div style={s("display:flex;align-items:center;gap:8px 20px;flex-wrap:wrap;padding-bottom:2px")}>
          {marcos.map((m) => (
            <span key={m.label} style={s("display:inline-flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--muted)")}>
              <span aria-hidden style={s(`width:9px;height:9px;border-radius:50%;background:${DOT[m.tom]}`)} />
              <span><span className="n" style={s("font-weight:var(--w-data);color:var(--ink)")}>{m.n}</span> {m.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A ação do `pe`: o botão que fecha o caminho da tela. Um só, e é o primário da tela. */
export type AcaoDoPe = { label: string; onClick: () => void; desabilitada?: boolean; motivo?: string };

/**
 * O pé de uma moldura: o resumo do que vai acontecer à esquerda ("15 notas · R$ 7.600,00") e a
 * ação à direita. Desligada, a ação diz por quê ao lado, em âmbar, ligada por `aria-describedby`.
 * Sem ação, `estado` ocupa o lugar dela ("Mês fechado"), para o pé não mudar de altura.
 */
export function PeDeAcao({ resumo, acao, estado }: { resumo?: React.ReactNode; acao?: AcaoDoPe; estado?: React.ReactNode }) {
  const idMotivo = React.useId();
  return (
    <div style={s("display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;min-height:48px")}>
      {resumo && <div style={s("flex:1 1 180px;min-width:0;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>{resumo}</div>}
      {acao ? (
        <span style={s("margin-left:auto;display:inline-flex;align-items:center;gap:8px 14px;flex-wrap:wrap;justify-content:flex-end")}>
          {acao.motivo && (
            <span id={idMotivo} style={s(`font-size:var(--t-sm);font-weight:var(--w-data);color:${acao.desabilitada ? "var(--warn)" : "var(--ink)"}`)}>{acao.motivo}</span>
          )}
          <button
            type="button"
            onClick={acao.desabilitada ? undefined : acao.onClick}
            disabled={acao.desabilitada}
            aria-describedby={acao.motivo ? idMotivo : undefined}
            className={acao.desabilitada ? "m-focus" : "m-hov-primary m-press m-focus"}
            style={s(`height:48px;padding:0 22px;border:none;border-radius:8px;font-size:var(--t-body);font-weight:var(--w-title);display:inline-flex;align-items:center;gap:10px;white-space:nowrap;${acao.desabilitada ? "background:var(--line);color:var(--muted);cursor:not-allowed" : "background:var(--primary);color:var(--on-primary);cursor:pointer"}`)}
          >
            {acao.label}
          </button>
        </span>
      ) : estado ? (
        <span style={s("margin-left:auto;display:inline-flex;align-items:center")}>{estado}</span>
      ) : null}
    </div>
  );
}
