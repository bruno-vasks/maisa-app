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
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Icon } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
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

type Passo = {
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
  const [feitos, setFeitos] = useState<PassoDeAtivacao[] | null>(null);
  /** Os passos que valem para ESTE negócio (`passosQueValem`). Quem só emite recibo não vê
   *  WhatsApp, agenda nem "ver funcionando" — cobrar o que não serve é gargalo. */
  const [valem, setValem] = useState<readonly PassoDeAtivacao[]>(PASSOS_DE_ATIVACAO);
  const [formado, setFormado] = useState(true); // pessimista: não pisca antes de saber

  useEffect(() => {
    setFormado(typeof window !== "undefined" && window.localStorage.getItem(CHAVE_FORMADO) === "1");
  }, []);

  const ler = useCallback(() => {
    fetch("/api/ativacao", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.ok) return;
        const f: PassoDeAtivacao[] = d.feitos ?? [];
        setFeitos(f);
        if (Array.isArray(d.passos)) setValem(d.passos);
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
  }, []);

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

  const PASSOS: Passo[] = [
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
    {
      id: "agenda_conectada", titulo: "Sua agenda", icone: "calendar",
      ganho: "É onde ela olha antes de oferecer horário",
      ir: () => st.irPara("mais"),
    },
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

  if (formado || feitos === null) return null;

  const total = valem.length;
  const prontos = feitos.length;
  const pct = Math.round((prontos / total) * 100);
  if (prontos >= total) return null;

  const faltam = total - prontos;

  return (
    <section
      aria-label="O que falta para a MAISA trabalhar sozinha"
      style={s("flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--shadow-card)")}
    >
      <div style={s("display:flex;align-items:baseline;gap:10px;flex-wrap:wrap")}>
        <h2 style={s("margin:0;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>
          Falta pouco para ela trabalhar sozinha
        </h2>
        <span className="n" style={s("margin-left:auto;font-size:var(--t-label);color:var(--muted)")}>
          {prontos} de {total}
        </span>
      </div>

      {/* Barra com `aria-valuenow`: a porcentagem é a informação, e ela não pode existir
          só como largura de um retângulo. */}
      <div
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${pct}% concluído`}
        style={s("height:6px;border-radius:99px;background:var(--line);overflow:hidden")}
      >
        <span style={s(`display:block;height:100%;width:${pct}%;background:var(--primary);border-radius:99px;transition:width var(--dur-slow,.4s) var(--ease-out,ease)`)} />
      </div>

      <div style={s("display:flex;flex-direction:column;gap:8px")}>
        {PASSOS.filter((p) => valem.includes(p.id)).map((p) => {
          const feito = feitos.includes(p.id);
          const clicavel = !feito && !!p.ir;

          const corpo = (
            <>
              <span
                aria-hidden
                style={s(`display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;border-radius:99px;background:${feito ? "var(--success-soft)" : "var(--primary-soft)"}`)}
              >
                <Icon
                  name={feito ? "check" : p.icone} size={15} sw={feito ? 2.6 : 2}
                  stroke={feito ? "var(--success)" : "var(--primary-dark)"}
                />
              </span>
              <span style={s("display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left")}>
                <span style={s(`font-size:var(--t-sm);font-weight:var(--w-title);color:${feito ? "var(--muted)" : "var(--ink)"}`)}>
                  {p.titulo}
                </span>
                {/* O ganho some quando o passo está feito: quem já conectou não precisa ser
                    convencido de novo, e a linha extra só empurra para baixo o que falta. */}
                {!feito && (
                  <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.4")}>{p.ganho}</span>
                )}
              </span>
              {clicavel && (
                <span aria-hidden style={s("margin-left:auto;display:flex;flex-shrink:0")}>
                  <Icon name="chevron-right" size={16} sw={2} stroke="var(--muted)" />
                </span>
              )}
            </>
          );

          const pele = `display:flex;align-items:center;gap:11px;width:100%;padding:9px 10px;border-radius:12px;border:1px solid ${feito ? "transparent" : "var(--border)"};background:${feito ? "transparent" : "var(--surface)"};font-family:inherit;text-align:left`;

          /* Feito vira `<div>`, não um `<button disabled>`: leitor de tela anuncia botão
             desabilitado como algo que deveria funcionar e não funciona. Aqui não há ação
             nenhuma a oferecer — o passo terminou. */
          return clicavel ? (
            <button key={p.id} onClick={p.ir!} className="m-hov-bg m-press m-focus" style={s(`${pele};cursor:pointer`)}>
              {corpo}
            </button>
          ) : (
            <div key={p.id} style={s(pele)}>{corpo}</div>
          );
        })}
      </div>

      <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
        {faltam === 1
          ? "Falta um passo. Depois dele este quadro some — e não volta."
          : `Faltam ${faltam} passos. Nada aqui trava o app: dá para usar do jeito que está.`}
      </p>
    </section>
  );
}
