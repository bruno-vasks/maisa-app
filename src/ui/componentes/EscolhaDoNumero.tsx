"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * DE QUEM É ESSE NÚMERO, SEM O STORE: a pergunta e o caderno por `fetch` direto.
 *
 * Nasceu em 25/09/2026 (item 1A.15, 09 P0-3 da auditoria do front) porque a pergunta só existia
 * no painel (`DeQuemEEsseNumero`, nos Ajustes), e o wizard pareava o WhatsApp e seguia sem
 * perguntar. O modo nasce `pessoal` e o caderno nasce vazio: a pessoa terminava com "WhatsApp
 * conectado" e uma MAISA que calava para os clientes salvos no celular dela.
 *
 * ⚠️ ESTE ARQUIVO NÃO CHAMA `useStore(`, e é regra: o `/comecar` roda fora do `StoreProvider`
 * (guarda G13, `guardas/wizard.test.ts`). Quem precisa do store (navegar para Meus contatos) é
 * o `DeQuemEEsseNumero`, que monta estas peças.
 *
 * A regra de quem ela atende é `nucleo/dominio/contatos.ts`; aqui mora só a pergunta.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Icon } from "@/ui/primitivos";
import type { Contato, ModoDoNumero } from "@/nucleo/dominio/contatos";
import { mensagemDaFalha } from "@/ui/falhas";

export const OPCOES_DO_NUMERO: { id: ModoDoNumero; titulo: string; sub: string }[] = [
  {
    id: "pessoal",
    titulo: "É meu número pessoal também",
    sub: "Ela só atende quem você marcar como cliente, e número novo que chega pedindo horário. Cala para todo o resto.",
  },
  {
    id: "negocio",
    titulo: "É só do negócio",
    sub: "Ela atende todo mundo que escrever.",
  },
];

export type CadernoLido = { modo: ModoDoNumero; contatos: Contato[] };
export type FalhaDoCaderno = { frase: string; detalhe?: string; entrar: boolean };

/**
 * Lê e escreve o caderno por `/api/contatos`. Não dá toast: devolve a frase, e quem monta
 * decide onde ela aparece (o painel usa toast; o wizard, a mesma coisa, pelo `Toaster` dele).
 */
export function useCaderno() {
  const [estado, setEstado] = useState<CadernoLido | null>(null);
  const [falha, setFalha] = useState<FalhaDoCaderno | null>(null);
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

  /** Grava o modo. Devolve `null` se o servidor aceitou, ou a frase do motivo. */
  const trocar = useCallback(async (modo: ModoDoNumero): Promise<string | null> => {
    setOcupado("modo");
    /* Otimista, com reversão pela releitura do `finally`: um toque num par de botões que espera
     * o round-trip parece travado. Se o servidor recusar, a releitura devolve o valor real. */
    setEstado((e) => (e ? { ...e, modo } : e));
    try {
      const r = await fetch("/api/contatos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modo }),
      }).then((x) => x.json());
      return r?.ok ? null : (r?.info ?? "Não consegui salvar essa escolha.");
    } catch {
      return "Sem conexão com o servidor.";
    } finally {
      setOcupado(null);
      void ler();
    }
  }, [ler]);

  /** Traz a agenda do WhatsApp. Devolve a frase do resultado, e se deu certo. */
  const importar = useCallback(async (): Promise<{ ok: boolean; frase: string }> => {
    setOcupado("importar");
    try {
      const r = await fetch("/api/contatos", { method: "POST" }).then((x) => x.json());
      if (!r?.ok) return { ok: false, frase: r?.info ?? "Não consegui ler seus contatos." };
      return { ok: true, frase: fraseDoImport(r) };
    } catch {
      return { ok: false, frase: "Sem conexão com o servidor." };
    } finally {
      setOcupado(null);
      void ler();
    }
  }, [ler]);

  return { estado, falha, ocupado, ler, trocar, importar };
}

/**
 * Os TRÊS números, e é deliberado. A agenda do Bruno tem 1.840 entradas e 374 utilizáveis (o
 * resto é grupo ou `@lid` sem telefone). Dizer só "374 importados" faria ele procurar os outros
 * 1.466; dizer os três explica sozinho.
 */
export function fraseDoImport(r: { novos?: number; total?: number; lidos?: number }): string {
  const perdidos = Math.max(0, (r.lidos ?? 0) - (r.total ?? 0));
  return r.novos === 0
    ? `Nada novo: seus ${r.total ?? 0} contatos já estavam aqui`
    : `${r.novos} ${r.novos === 1 ? "contato novo" : "contatos novos"}`
      + (perdidos ? ` · ${perdidos} da sua agenda não têm telefone utilizável` : "");
}

/** Os dois botões. `modo` null = ninguém escolheu ainda (o wizard pergunta sem pré-marcar). */
export function OpcoesDoNumero({ modo, aoEscolher, desligado }: {
  modo: ModoDoNumero | null;
  aoEscolher: (m: ModoDoNumero) => void;
  desligado?: boolean;
}) {
  return (
    <div style={s("display:flex;flex-direction:column;gap:8px")}>
      {OPCOES_DO_NUMERO.map((o) => {
        const ativo = modo === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={desligado ? undefined : () => aoEscolher(o.id)}
            disabled={desligado}
            aria-pressed={ativo}
            className="m-hov-bg m-press m-focus"
            style={s(`display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;font-family:inherit;padding:11px 12px;border-radius:12px;cursor:${desligado ? "wait" : "pointer"};border:1.5px solid ${ativo ? "var(--primary)" : "var(--border)"};background:${ativo ? "var(--primary-soft)" : "var(--surface)"}`)}
          >
            {/* Círculo com ✓ e não só a borda colorida: cor sozinha é o sinal mais frágil que
                existe, e esta escolha decide silêncio. */}
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
  );
}
