import React from "react";
import { GlassButton } from "../../GlassButton";
import { Maisa } from "../v3/Maisa";
import { Marca } from "../v3/Marca";
import { CTA_ROTULO, FRASE_DOBRA, HREF_PLANOS, SUB_DOBRA, frase } from "../v3/dados";
import { VideoDobra } from "./VideoDobra";

/* ----------------------------------------------------------------------------
 * A DOBRA DA v4 — a v3 inteira, com a foto trocada por vídeo.
 *
 * ⚠️ LEIA O Dobra.tsx DA v3 ANTES DE MEXER AQUI. Este arquivo é uma cópia dele com
 * UMA troca, e todas as decisões que ele documenta continuam de pé: por que a
 * camada de fundo é um elemento no HTML e não `background-image`, por que o véu
 * clareia só o topo, por que o wordmark é importado de `../v3/Maisa` em vez
 * de reescrito, por que o <h1> é bloco e não <br>, e por que o botão aponta para
 * `HREF_PLANOS` e não para outra LP. Nada disso mudou — repetir aqui só criaria
 * duas versões do mesmo texto para saírem de sincronia depois.
 *
 * ── O QUE MUDA, E SÓ ISSO.
 * A `<img className="lp3-foto">` virou `<VideoDobra>`, que renderiza um <video> com
 * A MESMA CLASSE `lp3-foto`. Isso é de propósito: o enquadramento do fundo (o
 * `inset: 0`, o `object-fit: cover` e o `object-position: 62% 50%` que decide qual
 * pedaço sobrevive num recorte estreito) é a mesma regra de posicionamento, e ela já
 * está escrita e comentada no v3.css. Duplicá-la num seletor novo seria assinar duas
 * vezes a mesma decisão. O que a v4 acrescenta vive em `.lp4-video`, no v4.css, e
 * cabe em poucas linhas.
 *
 * ── O TEXTO É O MESMO, IMPORTADO E NÃO COPIADO.
 * `FRASE_DOBRA`, `SUB_DOBRA`, `CTA_ROTULO` e `HREF_PLANOS` vêm do `../v3/dados`. A v4
 * não tem dados.ts próprio e não deve ganhar um enquanto a promessa for a mesma: um
 * segundo arquivo de textos é o jeito mais rápido de a v4 passar a prometer um preço
 * e a v3 outro sem ninguém perceber.
 *
 * ⚠️ O VÉU FOI MEDIDO CONTRA A FOTO, NÃO CONTRA O VÍDEO. A rampa do `.lp3-veu`
 * (branco 0,76 → 0 em 56%) foi calibrada nos tons da foto da barbearia. O vídeo tem
 * os tons dele e eles MUDAM ao longo da reprodução — o que passou na régua no quadro
 * 1 pode reprovar no quadro 200. É a única conta da v3 que a troca de camada
 * invalida, e por isso ela é refeita em `.claude/mede-video-dobra.mjs`, que amostra o
 * vídeo quadro a quadro por trás de cada elemento de texto. O resultado e o que ele
 * obrigou a mudar estão no cabeçalho do v4.css.
 * -------------------------------------------------------------------------- */

export function Dobra() {
  return (
    <section className="lp3-dobra lp4-dobra">
      {/* ── A CAMADA DE FUNDO ──
          Onde a v3 tem uma <img>, aqui está o vídeo. Ele reaproveita `lp3-foto`
          (enquadramento) e acrescenta `lp4-video`.

          O `poster` é a FOTO DA v3, e isso resolve três coisas de uma vez: é o
          primeiro pixel da página (o LCP, que vídeo nenhum pontua), é o que fica na
          tela em movimento reduzido, e é a rede para quem bloqueia mídia. O
          cabeçalho do VideoDobra.tsx desenvolve cada uma. */}
      <VideoDobra
        className="lp3-foto lp4-video"
        src="/dobra-barbearia.mp4"
        poster="/dobra-barbearia-video.jpg"
      />

      {/* ── O VÉU ── piso de legibilidade, idêntico ao da v3 (ver ⚠️ acima). */}
      <div className="lp3-veu" aria-hidden="true" />

      <p className="lp3-assinatura">
        <Marca />
      </p>

      <div className="lp3-miolo">
        <h1 className="lp3-frase">
          {FRASE_DOBRA.map((linha, l) => (
            <span key={l} style={{ display: "block" }}>
              {frase(linha).map((p, i) =>
                p.marca ? <Maisa key={i} escala="grande" /> : <React.Fragment key={i}>{p.t}</React.Fragment>,
              )}
            </span>
          ))}
        </h1>

        <p className="lp3-sub">{SUB_DOBRA}</p>

        <GlassButton href={HREF_PLANOS} size="lg" className="lp3-cta">
          {CTA_ROTULO}
        </GlassButton>
      </div>
    </section>
  );
}
