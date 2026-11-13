"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * A MOLDURA DO ONBOARDING CURTO: o formulário e, ao lado, a conversa (13/11/2026).
 *
 * O Bruno escolheu entre três protótipos a "conversa ao lado". A cada pergunta respondida, um
 * cliente pergunta e a maisa responde com o que a pessoa acabou de escrever. O texto é de
 * `previa.ts`.
 *
 * ── DOIS DESENHOS, A MESMA ÁRVORE ──
 *
 *   • No celular, a conversa fica no alto, sobre o fundo cinza, só com a última troca. O
 *     formulário sobe por cima dela como uma folha branca, e o botão fica parado no pé da folha.
 *   • No computador (`globals.css`, a partir de 900px), a tela se divide: o formulário à esquerda,
 *     com o botão logo abaixo dos campos, e a conversa inteira na metade direita.
 *
 * As duas conversas estão no HTML, e o CSS mostra uma de cada vez. Escolher por `useIsMobile`
 * faria a primeira pintura sair com a errada, porque ele só sabe a largura depois de montar.
 *
 * ── O BOTÃO VEM POR PORTAL ──
 *
 * Cada etapa desenha o próprio botão junto do estado que ele usa (`ocupado`, `recado`), e o leva
 * para `refDoPe` com o `NoPe` de `Comecar.tsx`, o mesmo arranjo da `MolduraDeEntrada`. O pé fica
 * DENTRO da coluna que rola, depois do conteúdo: no computador ele segue os campos, e no celular
 * o `position: sticky` o prende no fim da folha.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useRef, useState } from "react";
import { s, Icon } from "@/ui/primitivos";
import { Marca } from "@/ui/componentes/MolduraDeEntrada";

export type Troca = { cliente: string; maisa: string };

/** Quanto a frase nova espera depois da última tecla: o tempo dos três pontinhos aparecerem. */
const ESPERA_DA_FALA_MS = 450;

function Pontinhos() {
  return (
    <span className="m-ob-digitando" aria-label="digitando">
      <i /><i /><i />
    </span>
  );
}

/** A fala da maisa. Quando o texto muda, os três pontinhos aparecem e a frase nova entra depois. */
function FalaDaMaisa({ texto }: { texto: string }) {
  const [mostrado, setMostrado] = useState(texto);
  const [digitando, setDigitando] = useState(!texto);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    setDigitando(true);
    if (!texto) return;
    const id = setTimeout(() => { setMostrado(texto); setDigitando(false); }, ESPERA_DA_FALA_MS);
    return () => clearTimeout(id);
  }, [texto]);

  return <p className="m-ob-bolha m-ob-bolha-maisa">{digitando ? <Pontinhos /> : mostrado}</p>;
}

function Contato({ negocio }: { negocio: string }) {
  return (
    <div className="m-ob-contato">
      <span className="m-ob-av" aria-hidden>m</span>
      <span className="m-ob-contato-nome">
        <b>{negocio.trim() || "Seu negócio"}</b>
        <small>Como a maisa vai responder</small>
      </span>
    </div>
  );
}

export function MolduraDaConversa({
  passo, total, aoVoltar, aoSair, negocio, trocas, chave, refDoPe, children,
}: {
  /** 0 a `total - 1`, para a barra de progresso. */
  passo: number;
  total: number;
  /** Sem ele, não há "Voltar" (a primeira etapa, e a de serviços: o negócio já foi criado). */
  aoVoltar?: () => void;
  aoSair: () => void;
  negocio: string;
  /** Uma troca por etapa já alcançada. A última é a que muda enquanto a pessoa digita. */
  trocas: readonly Troca[];
  /** Muda a cada etapa: a coluna remonta, e a `.m-cascata` da etapa entra de novo. */
  chave: string;
  refDoPe: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const ultima = trocas[trocas.length - 1];
  return (
    <div className="m-ob m-altura-tela">
      <div className="m-ob-esq">
        <header className="m-ob-topo">
          {aoVoltar ? (
            <button type="button" onClick={aoVoltar} className="m-ob-voltar m-focus" aria-label="Voltar">
              <Icon name="chevron-left" size={22} stroke="currentColor" />
              <span>Voltar</span>
            </button>
          ) : <span />}
          <div className="m-ob-marca">
            <Marca />
            <div
              role="progressbar" aria-label="Etapas" aria-valuemin={1} aria-valuemax={total} aria-valuenow={passo + 1}
              aria-valuetext={`Etapa ${passo + 1} de ${total}`} className="m-ob-barra"
            >
              <b style={{ width: `${((passo + 1) / total) * 100}%` }} />
            </div>
          </div>
          <button type="button" onClick={aoSair} aria-label="Sair" title="Sair" className="m-ob-sair m-focus">
            <Icon name="x" size={18} stroke="currentColor" />
          </button>
        </header>

        {/* No celular: só a última troca, no alto. */}
        <section className="m-ob-mini" aria-label="Prévia da conversa">
          <Contato negocio={negocio} />
          {ultima && (
            <>
              <p className="m-ob-bolha m-ob-bolha-cliente">{ultima.cliente}</p>
              <FalaDaMaisa key={`mini-${trocas.length}`} texto={ultima.maisa} />
            </>
          )}
        </section>

        <main className="m-ob-folha">
          <div className="m-ob-col">
            {/* A etapa traz a própria `.m-cascata`; a `key` aqui só faz a coluna remontar a cada etapa. */}
            <div key={chave} style={s("display:flex;flex-direction:column")}>
              {children}
            </div>
            <div ref={refDoPe} className="m-ob-pe" />
          </div>
        </main>
      </div>

      {/* No computador: a conversa inteira, na metade direita. */}
      <aside className="m-ob-lado" aria-label="Prévia da conversa">
        <Contato negocio={negocio} />
        <div className="m-ob-historia">
          {trocas.map((t, i) => (
            <React.Fragment key={i}>
              <p className="m-ob-bolha m-ob-bolha-cliente">{t.cliente}</p>
              {i === trocas.length - 1
                ? <FalaDaMaisa key={`lado-${i}`} texto={t.maisa} />
                : <p className="m-ob-bolha m-ob-bolha-maisa">{t.maisa}</p>}
            </React.Fragment>
          ))}
        </div>
      </aside>
    </div>
  );
}
