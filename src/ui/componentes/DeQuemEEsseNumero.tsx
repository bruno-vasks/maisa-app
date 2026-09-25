"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * DE QUEM É ESSE NÚMERO — a pergunta que impede a MAISA de falar com o pai do dono.
 *
 * Uma pergunta, dois botões, e ela ganha o lugar dela porque o erro é caro nas duas
 * direções e nenhum sinal a responde sozinho:
 *
 *   • linha do negócio tratada como pessoal → a MAISA cala para os clientes salvos no
 *     celular do barbeiro, que é a maioria deles;
 *   • celular pessoal tratado como linha do negócio → a MAISA oferece horário para a mãe
 *     do dono. Esse é o erro que ele conta para todo mundo.
 *
 * ⚠️ O CADERNO SÓ APARECE NO MODO PESSOAL, e não é economia de pixel. No modo "negócio" o
 * caderno serve para emprestar nome, e isso acontece sozinho — não há nada a decidir. Mostrar
 * "importar contatos" ali convidaria a importar para nada e a achar que aquilo mudava quem
 * ela atende.
 *
 * A regra em si é `nucleo/dominio/contatos.ts` — pura e testada. Esta tela é só a pergunta.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Icon, Btn, toast } from "@/ui/primitivos";
import type { Contato, ModoDoNumero } from "@/nucleo/dominio/contatos";
import { useStore } from "@/ui/estado/store";
import { Esqueleto, FalhaDeLeitura, ENTRAR } from "@/ui/componentes/EstadoDeLeitura";
import { mensagemDaFalha } from "@/ui/falhas";

type Estado = { modo: ModoDoNumero; contatos: Contato[] };

const OPCOES: { id: ModoDoNumero; titulo: string; sub: string }[] = [
  {
    id: "pessoal",
    titulo: "É meu número pessoal também",
    sub: "Ela atende quem você não tem salvo — e quem você marcar como cliente. Cala para o resto da sua agenda.",
  },
  {
    id: "negocio",
    titulo: "É só do negócio",
    sub: "Ela atende todo mundo que escrever.",
  },
];

export function DeQuemEEsseNumero({ compacto }: { compacto?: boolean }) {
  const st = useStore();
  const [estado, setEstado] = useState<Estado | null>(null);
  /* A leitura falhou (24/09/2026, item 1A.6). Antes o cartão SUMIA (`return null`) e a pergunta
   * que impede a MAISA de falar com o pai do dono desaparecia sem uma palavra. */
  const [falha, setFalha] = useState<{ frase: string; detalhe?: string; entrar: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<null | "modo" | "importar">(null);

  const ler = useCallback(async () => {
    setFalha(null);
    try {
      const r = await fetch("/api/contatos", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) { setEstado({ modo: r.modo, contatos: r.contatos ?? [] }); return; }
      setFalha(r?.status === "login_necessario"
        ? { frase: "Entre na sua conta para ver seus contatos.", entrar: true }
        : { frase: "Não consegui ler seus contatos.", detalhe: mensagemDaFalha(r, "") || undefined, entrar: false });
    } catch {
      setFalha({ frase: "Não consegui ler seus contatos.", detalhe: "Sem conexão com o servidor.", entrar: false });
    }
  }, []);

  useEffect(() => { void ler(); }, [ler]);

  const trocar = useCallback(async (modo: ModoDoNumero) => {
    if (ocupado) return;
    setOcupado("modo");
    /* Otimista, com reversão pelo `ler()` do `finally`: a escolha é um toque e a espera de um
     * round-trip num par de botões parece travamento. Se o servidor recusar (não há canal
     * pareado, por exemplo), a releitura devolve o valor de verdade. */
    setEstado((e) => (e ? { ...e, modo } : e));
    try {
      const r = await fetch("/api/contatos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modo }),
      }).then((x) => x.json());
      if (!r?.ok) toast(r?.info ?? "Não consegui salvar essa escolha");
    } catch {
      toast("Sem conexão com o servidor");
    } finally {
      setOcupado(null);
      void ler();
    }
  }, [ocupado, ler]);

  const importar = useCallback(async () => {
    if (ocupado) return;
    setOcupado("importar");
    try {
      const r = await fetch("/api/contatos", { method: "POST" }).then((x) => x.json());
      if (!r?.ok) { toast(r?.info ?? "Não consegui ler seus contatos"); return; }
      /* Os TRÊS números, e é deliberado. A agenda do Bruno tem 1.840 entradas e 374
       * utilizáveis — o resto é grupo ou `@lid` sem telefone. Dizer só "374 importados" faria
       * ele procurar os outros 1.466; dizer os três explica sozinho. */
      const perdidos = Math.max(0, (r.lidos ?? 0) - (r.total ?? 0));
      toast(
        r.novos === 0
          ? `Nada novo — seus ${r.total} contatos já estavam aqui`
          : `${r.novos} ${r.novos === 1 ? "contato" : "contatos"} ${r.novos === 1 ? "novo" : "novos"}`
            + (perdidos ? ` · ${perdidos} da sua agenda não têm telefone utilizável` : ""),
      );
    } catch {
      toast("Sem conexão com o servidor");
    } finally {
      setOcupado(null);
      void ler();
    }
  }, [ocupado, ler]);

  /* Sem leitura, o cartão existe do mesmo jeito: esqueleto enquanto lê, a frase e a saída se
   * falhou. O que já foi lido continua se uma releitura (depois de trocar) falhar. */
  if (!estado) {
    return (
      <section
        aria-label="De quem é esse número"
        style={s(`background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:${compacto ? "14px 15px" : "16px 18px"};display:flex;flex-direction:column;gap:12px`)}
      >
        <h3 style={s("margin:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
          De quem é esse número?
        </h3>
        {falha
          ? <FalhaDeLeitura embutida frase={falha.frase} detalhe={falha.detalhe} tentar={() => void ler()} acao={falha.entrar ? ENTRAR : undefined} />
          : <Esqueleto linhas={2} altura={60} gap={8} rotulo="Lendo de quem é esse número" />}
      </section>
    );
  }

  const clientes = estado.contatos.filter((c) => c.cliente === true).length;
  /* Quantos ainda não têm resposta. Vai no rótulo do botão porque é o número que diz se
   * vale a pena entrar — "3 sem resposta" e "1.837 sem resposta" pedem decisões diferentes. */
  const naoDecididos = estado.contatos.filter((c) => c.cliente == null).length;

  return (
    <section
      aria-label="De quem é esse número"
      style={s(`background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:${compacto ? "14px 15px" : "16px 18px"};display:flex;flex-direction:column;gap:12px`)}
    >
      <div>
        <h3 style={s("margin:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
          De quem é esse número?
        </h3>
        <p style={s("margin:4px 0 0;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
          Decide quem a MAISA atende. Dá para mudar depois.
        </p>
      </div>

      <div style={s("display:flex;flex-direction:column;gap:8px")}>
        {OPCOES.map((o) => {
          const ativo = estado.modo === o.id;
          return (
            <button
              key={o.id}
              onClick={() => void trocar(o.id)}
              aria-pressed={ativo}
              className="m-hov-bg m-press m-focus"
              style={s(`display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;font-family:inherit;padding:11px 12px;border-radius:12px;cursor:pointer;border:1.5px solid ${ativo ? "var(--primary)" : "var(--border)"};background:${ativo ? "var(--primary-soft)" : "var(--surface)"}`)}
            >
              {/* Círculo com ✓ e não só a borda colorida: cor sozinha é o sinal mais frágil
                  que existe, e esta escolha decide silêncio. */}
              <span
                aria-hidden
                style={s(`display:flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0;margin-top:1px;border-radius:99px;border:1.5px solid ${ativo ? "var(--primary)" : "var(--border-field)"};background:${ativo ? "var(--primary)" : "transparent"}`)}
              >
                {ativo && <Icon name="check" size={12} sw={3} stroke="var(--on-primary)" />}
              </span>
              <span style={s("display:flex;flex-direction:column;gap:2px;min-width:0")}>
                <span style={s(`font-size:var(--t-sm);font-weight:var(--w-title);color:${ativo ? "var(--primary-dark)" : "var(--ink)"}`)}>
                  {o.titulo}
                </span>
                <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {estado.modo === "pessoal" && (
        <div style={s("display:flex;flex-direction:column;gap:9px;padding-top:11px;border-top:1px solid var(--line)")}>
          <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
            {estado.contatos.length === 0 ? (
              <>
                Traga sua agenda para ela saber <strong style={s("color:var(--ink)")}>quem não atender</strong> — e
                para chamar seus clientes pelo nome.
              </>
            ) : (
              <>
                <strong style={s("color:var(--ink)")}>{estado.contatos.length}</strong> contatos aqui
                {clientes > 0 && <>, <strong style={s("color:var(--ink)")}>{clientes}</strong> marcados como cliente</>}.
                Ela cala para os outros e atende quem você não tem salvo.
              </>
            )}
          </p>
          <Btn
            variant={estado.contatos.length === 0 ? "primary" : "ghost"}
            icon="download"
            onClick={() => void importar()}
          >
            {ocupado === "importar"
              ? "Lendo sua agenda…"
              : estado.contatos.length === 0 ? "Trazer meus contatos" : "Atualizar meus contatos"}
          </Btn>
          {/* ⚠️ A PORTA QUE FALTAVA (17/08/2026). Este bloco dizia "3 marcados como cliente"
              e parava aí — informava o número e não oferecia o gesto. O relato foi exato:
              "ele diz que isso é possível, mas não diz como fazer, onde fazer". O botão
              existe agora, e só aparece com contatos na casa, porque antes disso a ação
              certa é importar. */}
          {estado.contatos.length > 0 && (
            <Btn variant="secondary" icon="clientes" onClick={() => st.irPara("contatos")}>
              {naoDecididos > 0
                ? `Escolher quem ela atende (${naoDecididos} sem resposta)`
                : "Rever quem ela atende"}
            </Btn>
          )}

          {/* A frase que evita o suporte: importar de novo não desfaz o que foi marcado. */}
          {estado.contatos.length > 0 && (
            <span style={s("font-size:var(--t-micro);color:var(--muted);line-height:1.45")}>
              Atualizar não apaga o que você marcou.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
