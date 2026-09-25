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

import React, { useCallback } from "react";
import { s, Btn, toast } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { Esqueleto, FalhaDeLeitura, ENTRAR } from "@/ui/componentes/EstadoDeLeitura";
import type { ModoDoNumero } from "@/nucleo/dominio/contatos";
/* A pergunta, os dois botões e a leitura do caderno moram em `EscolhaDoNumero.tsx`, sem store,
 * desde 25/09/2026 (1A.15): o wizard faz a mesma pergunta logo depois de conectar. */
import { OpcoesDoNumero, useCaderno } from "@/ui/componentes/EscolhaDoNumero";

export function DeQuemEEsseNumero({ compacto }: { compacto?: boolean }) {
  const st = useStore();
  /* A leitura falhou (24/09/2026, item 1A.6)? Antes o cartão SUMIA (`return null`) e a pergunta
   * que impede a MAISA de falar com o pai do dono desaparecia sem uma palavra. */
  const { estado, falha, ocupado, ler, trocar: gravarModo, importar: trazer } = useCaderno();

  const trocar = useCallback(async (modo: ModoDoNumero) => {
    if (ocupado) return;
    const erro = await gravarModo(modo);
    if (erro) toast(erro);
  }, [ocupado, gravarModo]);

  const importar = useCallback(async () => {
    if (ocupado) return;
    const r = await trazer();
    toast(r.frase);
  }, [ocupado, trazer]);

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

      <OpcoesDoNumero modo={estado.modo} aoEscolher={(m) => void trocar(m)} />

      {estado.modo === "pessoal" && (
        <div style={s("display:flex;flex-direction:column;gap:9px;padding-top:11px;border-top:1px solid var(--line)")}>
          <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
            {estado.contatos.length === 0 ? (
              <>
                Traga sua agenda para <strong style={s("color:var(--ink)")}>marcar seus clientes</strong> — ela só
                atende quem você marcar, e chama cada um pelo nome.
              </>
            ) : (
              <>
                <strong style={s("color:var(--ink)")}>{estado.contatos.length}</strong> contatos aqui
                {clientes > 0 && <>, <strong style={s("color:var(--ink)")}>{clientes}</strong> marcados como cliente</>}.
                Ela atende só os marcados, e número novo que pede horário.
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
