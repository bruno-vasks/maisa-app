"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A JORNADA — o que ainda falta para a MAISA trabalhar sozinha.
 *
 * Vive no topo do `FluxoHoje`, e existe por causa de uma frase que estava certa para o
 * usuário antigo e errada para o novo. O cabeçalho daquela tela diz: *"se ele está vazio, a
 * assistente está fazendo o trabalho. Por isso o estado vazio é comemorativo"*. Verdade —
 * depois que tudo está ligado. Para quem acabou de criar a conta, o mesmo vazio comemora um
 * negócio que ainda não conectou nada, e essa é a primeira tela que a pessoa vê.
 *
 * ── DERIVADO, NUNCA UMA FLAG ──
 *
 * Lê `/api/ativacao`, que pergunta ao BANCO a cada leitura (`dominio/ativacao.ts` explica
 * por quê). Quem conectou o WhatsApp por outro caminho não é obrigado a repetir, e o cartão
 * não dessincroniza.
 *
 * ⚠️ RELÊ AO VOLTAR O FOCO DA ABA. Metade dos passos se cumpre FORA daqui: o consent do
 * Google acontece em outra janela, o QR é lido no celular. Sem esta releitura, a pessoa
 * volta para o painel e o cartão continua dizendo que falta o que ela acabou de fazer — e
 * um checklist que não percebe o próprio progresso é pior do que checklist nenhum.
 *
 * ── O QUE ESTÁ FEITO NÃO É CLICÁVEL ──
 *
 * Só o que falta leva a algum lugar. Um passo cumprido que continua botão convida a refazer
 * — e no caso do WhatsApp, "refazer" significa derrubar a instância pareada.
 *
 * ── UMA LINHA, NÃO UM CARTÃO (25/09/2026, 1C.7, contradição C11) ──
 *
 * Era um cartão de 504px no desktop e 564px no celular acima do dia, por semanas (quem não
 * emite nada nunca fecha "Nota fiscal"), e empurrava a operação para fora da tela: 1 de 15
 * atendimentos visível. Virou uma linha: quantos faltam, qual é o próximo, "Continuar" (o `ir`
 * do primeiro que falta) e "Ver os passos", que abre a lista inteira na gaveta ("jornada",
 * `detalhe.tsx`). O que ela leu mora no store (`st.ativacao`) para a gaveta mostrar o mesmo.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Btn, Icon } from "@/ui/primitivos";
import { useStore, type StoreValue } from "@/ui/estado/store";
import { PASSOS_DE_ATIVACAO, type PassoDeAtivacao } from "@/nucleo/dominio/ativacao";

/**
 * ⚠️ ESTA CHAVE SÓ GUARDA "JÁ TERMINOU UMA VEZ" — nunca o progresso.
 *
 * O progresso continua vindo do banco. O que mora aqui é a decisão de aposentar o cartão:
 * chegou a 100%, ele some e não volta, mesmo que a pessoa depois desconecte alguma coisa.
 *
 * A distinção importa. Guardar o progresso seria a flag que `dominio/ativacao.ts` existe
 * para não ter; guardar "já foi" é preferência de tela — e sem ela o checklist reapareceria
 * no dia em que um token do Google vencesse, cobrando de novo quem já se formou.
 */
const CHAVE_FORMADO = "maisa.jornada.formado";

export type PassoDaJornada = {
  id: PassoDeAtivacao;
  titulo: string;
  /** O que a pessoa ganha — não o que ela tem que fazer. */
  ganho: string;
  icone: string;
  /** Para onde leva quando FALTA. `null` = não há para onde ir (o passo já é a chegada). */
  ir: null | (() => void);
};

export function JornadaDeAtivacao() {
  const st = useStore();
  const { setAtivacao } = st;
  const [formado, setFormado] = useState(true); // pessimista: não pisca antes de saber

  useEffect(() => {
    setFormado(typeof window !== "undefined" && window.localStorage.getItem(CHAVE_FORMADO) === "1");
  }, []);

  const ler = useCallback(() => {
    fetch("/api/ativacao", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.ok) return;
        /* Os passos que valem para ESTE negócio (`passosQueValem`). Quem só emite recibo não vê
         * WhatsApp nem "ver funcionando": cobrar o que não serve é gargalo. */
        setAtivacao({ feitos: d.feitos ?? [], passos: Array.isArray(d.passos) ? d.passos : PASSOS_DE_ATIVACAO });
        /* Grava no momento em que fecha, e não na próxima montagem: quem termina o último
         * passo aqui dentro vê o cartão sumir na hora, e não no próximo F5. */
        if (d.completo && typeof window !== "undefined") {
          window.localStorage.setItem(CHAVE_FORMADO, "1");
          setFormado(true);
        }
      })
      .catch(() => {
        /* Silêncio proposital: este cartão é orientação, não operação. Uma faixa de erro
         * aqui competiria com o painel de "Precisa de você", que é onde mora o que de fato
         * exige ação — e assustaria por causa de um checklist. */
      });
  }, [setAtivacao]);

  useEffect(() => {
    if (formado) return;
    ler();
    /* Ver o ⚠️ do cabeçalho: o Google e o QR acontecem fora desta aba. */
    const aoVoltar = () => { if (document.visibilityState === "visible") ler(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", ler);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", ler);
    };
  }, [formado, ler]);

  const r = resumoDaJornada(st);
  if (formado || !r || r.faltam === 0) return null;
  const seguinte = r.pendentes[0];

  /* ⚠️ UMA LINHA DE 48px, nas duas larguras (1C.7): o texto não quebra, corta com reticências.
   * Ele inteiro é o botão que abre a lista na gaveta; "Continuar" leva ao primeiro que falta. */
  return (
    <section
      aria-label="O que falta para a MAISA atender sozinha"
      style={s("flex-shrink:0;height:48px;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:0 6px 0 4px;border:1px solid var(--border);border-radius:12px;background:var(--surface)")}
    >
      <button
        type="button"
        onClick={() => st.abrir("jornada")}
        aria-label={`${r.faltam === 1 ? "Falta 1 passo" : `Faltam ${r.faltam} passos`} para a MAISA atender sozinha. Ver os passos`}
        className="m-hov-bg m-press m-focus"
        style={s("flex:1;min-width:0;height:40px;display:flex;align-items:center;gap:8px;padding:0 10px;border:none;border-radius:8px;background:transparent;cursor:pointer;text-align:left;color:var(--ink)")}
      >
        <span style={s("flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--t-sm)")}>
          <span style={s("font-weight:var(--w-title)")}>{r.faltam === 1 ? "Falta 1 passo" : `Faltam ${r.faltam} passos`}</span>
          <span style={s("color:var(--muted)")}> para a MAISA atender sozinha.{seguinte ? ` Próximo: ${seguinte.titulo}.` : ""}</span>
        </span>
        <Icon name="chevron-right" size={16} sw={2} style={s("flex-shrink:0;color:var(--muted)")} />
      </button>
      {seguinte?.ir && <Btn variant="secondary" size="sm" onClick={seguinte.ir}>Continuar</Btn>}
    </section>
  );
}

/** Quantos faltam e quais, na ordem dos passos. `null` antes de ler. A gaveta "jornada" usa o mesmo. */
export function resumoDaJornada(st: StoreValue): { total: number; prontos: number; faltam: number; passos: (PassoDaJornada & { feito: boolean })[]; pendentes: PassoDaJornada[] } | null {
  if (!st.ativacao) return null;
  const { feitos, passos: valem } = st.ativacao;
  const passos = passosDaJornada(st).filter((p) => valem.includes(p.id)).map((p) => ({ ...p, feito: feitos.includes(p.id) }));
  const total = valem.length;
  const prontos = feitos.filter((f) => valem.includes(f)).length;
  return { total, prontos, faltam: Math.max(0, total - prontos), passos, pendentes: passos.filter((p) => !p.feito && !!p.ir) };
}

/** Os passos, com o que cada um dá e para onde leva. */
export function passosDaJornada(st: StoreValue): PassoDaJornada[] {
  return [
    {
      id: "negocio_criado", titulo: "Negócio criado", icone: "sparkle",
      ganho: "Sua conta está de pé",
      ir: null,
    },
    {
      id: "catalogo_ajustado", titulo: "Seus preços", icone: "scissors",
      ganho: "É o que a MAISA vai falar para o cliente",
      ir: () => st.irPara("servicos"),
    },
    {
      id: "whatsapp_conectado", titulo: "WhatsApp", icone: "whatsapp",
      ganho: "Sem ele a MAISA não atende ninguém",
      ir: () => st.irPara("assistente"),
    },
    /* "Sua agenda" saiu em 25/09/2026 (1B.15): a MAISA marca sem Google, e o passo deixou de
       ser cobrado. Ver `PASSOS_DE_ATIVACAO`. */
    {
      id: "primeira_conversa", titulo: "Ver funcionando", icone: "chat",
      ganho: "Fale com ela como se fosse seu cliente",
      /* Manda para o wizard, e não para uma tela do painel: a etapa 4 do `/comecar` já é
       * essa conversa, com o agente real e as falas sugeridas. Duplicá-la aqui seria um
       * segundo simulador para manter. */
      ir: () => { window.location.href = "/comecar"; },
    },
    {
      id: "nota_fiscal_ligada", titulo: "Nota fiscal", icone: "receipt",
      /* ★ O ganho aqui é o único que fala de DINHEIRO e de tempo do dono, porque é o único
       * passo que não é setup: é a coisa que o produto faz e a concorrência não. */
      ganho: "Ela emite sozinha depois de cada atendimento",
      ir: () => st.irPara("faturamento"),
    },
  ];
}
