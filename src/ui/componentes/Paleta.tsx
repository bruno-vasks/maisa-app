"use client";
/* MAISA — paleta de comando (⌘K / Ctrl+K).
 *
 * O topo do app mostra um campo de busca. Um campo que não busca seria promessa
 * quebrada, então ele é real: encontra cliente, conversa, serviço, profissional e
 * tela, e leva direto ao lugar — abrindo a gaveta quando o destino é uma ficha.
 *
 * Num app onde todo detalhe vive em gaveta, isto é o atalho que evita 3 cliques
 * (ir na tela → achar o cartão → abrir). */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { s, Icon, Monogram, fmt } from "@/ui/primitivos";
import * as D from "@/adaptadores/saida/demo";
import { useStore, type TelaId } from "@/ui/estado/store";

type Item = {
  chave: string;
  titulo: string;
  sub: string;
  grupo: string;
  seed?: string;
  icone?: string;
  executar: () => void;
};

/** Ignora acento e caixa: "vinicius" acha "Vinícius". */
const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const TELAS_BUSCA: [TelaId, string, string, string][] = [
  ["fluxo", "Fluxo de hoje", "O quadro do dia", "flow"],
  ["conversas", "Conversas", "Quem está falando com a MAISA", "chat"],
  ["agenda", "Agenda", "A grade do dia", "calendar"],
  ["clientes", "Clientes", "Quem você atende", "clientes"],
  /* "Faturamento" fica como palavra buscável: quem já usava o app procura por ela, e a busca não
     tem por que punir o nome antigo de uma tela. */
  ["faturamento", "Fiscal", "Recibos e notas do mês · faturamento", "receipt"],
  ["equipe", "Equipe", "Quem atende e quando", "equipe"],
  ["servicos", "Serviços", "Catálogo e preços", "tag"],
  ["assistente", "A MAISA", "Ajustes da assistente", "bot"],
  ["mais", "Mais", "Plano, FAQ e números", "dots"],
];

export default function Paleta({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const st = useStore();
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const itens = useMemo<Item[]>(() => {
    const ir = (t: TelaId) => () => { st.irPara(t); fechar(); };
    const abrir = (id: string, tela: TelaId) => () => { st.irPara(tela); st.abrir(id); fechar(); };

    return [
      ...TELAS_BUSCA.map(([id, titulo, sub, icone]) => ({
        chave: `tela-${id}`, titulo, sub, grupo: "Telas", icone, executar: ir(id),
      })),
      ...st.cadastro.clientes.map((c) => ({
        chave: c.id, titulo: c.nome, grupo: "Clientes", seed: c.id,
        sub: c.telefone ? `${st.nomeServico(c.servicoId)} · ${c.telefone}` : st.nomeServico(c.servicoId),
        executar: abrir(c.id, "clientes"),
      })),
      // st.conversas, não D.CONVERSAS: a busca acha quem escreveu de verdade — inclusive quem
      // não está no cadastro, que é justamente quem é difícil de achar no app.
      ...st.conversas.map((c) => ({
        chave: `cv-${c.id}`, titulo: c.nome, grupo: "Conversas", seed: c.id,
        sub: `conversa · ${D.telefoneBonito(c.telefone || c.id)}`,
        executar: () => { st.selecionarConversa(c.id); st.irPara("conversas"); fechar(); },
      })),
      // st.servicos, não D.SERVICOS: um serviço que o usuário criou também se procura por aqui,
      // e um que ele renomeou tem que se achar pelo nome NOVO — é o nome que ele lembra.
      ...st.servicos.map((sv) => ({
        chave: sv.id, titulo: sv.nome, grupo: "Serviços", icone: "tag",
        sub: `${fmt(sv.preco)} · ${sv.duracao} min`,
        executar: abrir(sv.id, "servicos"),
      })),
      ...st.cadastro.profissionais.map((p) => ({
        chave: p.id, titulo: p.nome, grupo: "Equipe", seed: p.id,
        sub: p.papel,
        executar: abrir(p.id, "equipe"),
      })),
    ];
  }, [st, fechar]);

  const filtrados = useMemo(() => {
    const q = normal(busca.trim());
    if (!q) return itens.filter((i) => i.grupo === "Telas");
    return itens.filter((i) => normal(i.titulo).includes(q) || normal(i.sub).includes(q)).slice(0, 24);
  }, [busca, itens]);

  // Reabrir sempre começa limpo — a paleta é de ida, não guarda sessão.
  useEffect(() => {
    if (aberta) { setBusca(""); setCursor(0); campo.current?.focus(); }
  }, [aberta]);

  useEffect(() => { setCursor(0); }, [busca]);

  // Mantém o item destacado visível ao navegar com as setas.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[data-ativo="1"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!aberta) return null;

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { fechar(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtrados.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); filtrados[cursor]?.executar(); }
  };

  let grupoAtual = "";

  return (
    <>
      <div
        onClick={fechar}
        style={{ ...s("position:fixed;inset:0;z-index:90;background:oklch(0.22 0.03 262 / 0.38)"), backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "mfade .18s ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        onKeyDown={teclado}
        /* ⚠️ CENTRADA SEM `transform`. Era `left:50%` + `translateX(-50%)`, e a animação
           `m-reveal` (keyframe `mrise`, que anima `transform`) apagava o translate durante e
           depois da entrada: a busca abria com a borda esquerda no meio da tela e metade dela
           para fora, nas duas larguras (01 P0-3). `left:0;right:0` + `margin-inline:auto` centra
           sem disputar a propriedade com a animação. A altura mora na classe `.m-paleta`
           (globals.css), onde `dvh` tem o `vh` de reserva. */
        className="m-reveal m-paleta"
        style={s("position:fixed;left:0;right:0;margin-inline:auto;z-index:91;width:min(560px, calc(100% - 32px));background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-pop);display:flex;flex-direction:column;overflow:hidden")}
      >
        <div style={s("display:flex;align-items:center;gap:11px;padding:0 16px;height:56px;border-bottom:1px solid var(--line);flex-shrink:0")}>
          <Icon name="search" size={18} sw={1.9} stroke="var(--muted)" />
          <input
            ref={campo}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, conversa, serviço ou tela…"
            aria-label="Buscar"
            style={s("flex:1;min-width:0;border:none;background:transparent;font-size:var(--t-body);color:var(--ink);outline:none")}
          />
          <button
            onClick={fechar}
            aria-label="Fechar busca"
            className="m-hov-bg m-press-icon m-focus"
            /* mono FICA aqui: "esc" é a tecla literal, string de máquina — o único papel que
               sobrou para o monoespaçado depois da troca de fonte. */
            style={s("flex-shrink:0;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--muted);font-family:var(--font-mono);font-size:var(--t-micro);font-weight:var(--w-data);padding:4px 8px;cursor:pointer")}
          >
            esc
          </button>
        </div>

        <div ref={listaRef} style={s("flex:1;overflow-y:auto;padding:8px")}>
          {filtrados.length === 0 && (
            <div style={s("padding:36px 16px;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
              Nada encontrado para “{busca}”.
            </div>
          )}
          {filtrados.map((i, n) => {
            const novoGrupo = i.grupo !== grupoAtual;
            grupoAtual = i.grupo;
            const ativo = n === cursor;
            return (
              <React.Fragment key={i.chave}>
                {novoGrupo && (
                  <div style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted);padding:10px 10px 6px")}>
                    {i.grupo}
                  </div>
                )}
                <button
                  data-ativo={ativo ? "1" : "0"}
                  onMouseEnter={() => setCursor(n)}
                  onClick={i.executar}
                  style={s(`width:100%;display:flex;align-items:center;gap:11px;padding:9px 10px;border:none;border-radius:12px;cursor:pointer;text-align:left;background:${ativo ? "var(--primary-soft)" : "transparent"};transition:background-color 100ms linear`)}
                >
                  {i.seed
                    ? <Monogram name={i.titulo} id={i.seed} size={32} radius={10} />
                    : <span style={s(`width:32px;height:32px;flex-shrink:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${ativo ? "var(--surface)" : "var(--bg)"};color:var(--primary-dark)`)}><Icon name={i.icone ?? "arrow-right"} size={16} /></span>}
                  <span style={s("flex:1;min-width:0")}>
                    <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{i.titulo}</span>
                    <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{i.sub}</span>
                  </span>
                  {ativo && <Icon name="arrow-right" size={16} sw={2} stroke="var(--primary)" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
