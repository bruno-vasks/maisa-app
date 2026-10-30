import React from "react";
import { GlassButton } from "../../GlassButton";
import { Maisa } from "./Maisa";
import { Marca } from "./Marca";
import { CTA_ROTULO, FRASE_DOBRA, HREF_PLANOS, SUB_DOBRA, frase } from "./dados";

/* ----------------------------------------------------------------------------
 * A DOBRA DA v3 — um pôster: poeira atrás, a frase no meio, os rostos em volta.
 *
 * ── O QUE MUDOU EM 07/08/2026, E POR QUÊ.
 * Ela era uma RODA de 64 rostos em dois anéis, ocupando a tela inteira, com o texto
 * no oco e um palco pinado de 200svh que desenrolava o anel numa barra conforme a
 * pessoa rolava. O veredito foi: "esteticamente está legal, mas está muito pesada
 * — só uma linha de pessoas + um fundo de partículas".
 *
 * O peso nunca foi o traçado de fundo, e vale registrar porque já se gastou uma
 * volta nisso: em 06/08 a mesma queixa ("pesando MUITO a hero") foi respondida
 * afinando a trilha de 28 fios para 6. Não resolveu, porque o peso eram os SESSENTA
 * E QUATRO CARTÕES DE ROSTO. Agora são catorze, em uma linha.
 *
 * ── A SIMPLIFICAÇÃO É MAIOR DO QUE PARECE, e ela não inventa um estado novo.
 * A barra de rostos no pé já existia: era o estado FINAL do desenrolar. E a página
 * estática já existia também, escrita inteira no bloco `prefers-reduced-motion` do
 * v3.css ("a pista encolhe, o palco para de grudar, a dobra volta a ser o pôster
 * que já era"). O que esta versão faz é PROMOVER esse estado a único. Some com
 * isso: `Roda.tsx`, `Morph.tsx`, `geometria.ts`, `trilha.ts`, o palco pinado, o
 * `--lp3-p` e a travessia.
 *
 * ── A TRAVESSIA MORREU, E ESTAVA PREVISTO POR ESCRITO.
 * Os últimos 16svh do palco passavam por cima do topo da <Telas>, e a barra pousava
 * dentro dela. Sem palco pinado não há o que atravessar — e o próprio v3.css já
 * dizia o que fazer nesse caso, no bloco de movimento reduzido: `margin-top: 0` e
 * o respiro de volta, senão a seção seguinte sobe 16svh por cima de uma dobra
 * parada, que é colisão e não gesto. É exatamente essa regra que subiu para o caso
 * geral.
 *
 * ── A FILA VIROU ÓRBITA EM 08/08/2026, e a frase encolheu junto.
 * O retorno sobre a versão de ontem foi que as imagens podiam PASSAR pela hero,
 * "com uma fila orbitando o texto" (referência: Eye Gallery). A <Fileira> saiu e
 * entrou a <Orbita>: dezesseis rostos numa elipse fechada em volta do miolo, com
 * quem está em cima andando para a direita e quem está embaixo para a esquerda —
 * sem que isso seja configuração nenhuma, é a mesma volta. Ver o porquê de um anel
 * em vez das duas fitas da referência no cabeçalho do Orbita.tsx.
 *
 * NO MESMO PEDIDO, "para reduzir", a manchete perdeu a segunda frase ("Você não
 * quer perder eles.") e a dobra ficou com o inventário mínimo: imagens, uma frase,
 * um botão. É uma troca de peso, não um acréscimo — o texto encolheu na mesma
 * mexida em que as imagens ganharam a tela inteira.
 *
 * ── QUEM É SERVIDOR E QUEM É CLIENTE.
 * Este arquivo e a <Orbita> são Server Components: os dezesseis rostos e a frase
 * saem prontos do HTML, e o anel gira por keyframe de CSS. O único "use client" é
 * a <Particulas>, que possui um canvas e mais nada — nenhuma imagem e nenhum texto
 * atravessa a fronteira servidor→cliente como prop.
 *
 * Sem JavaScript a dobra continua inteira: pôster, anel girando, frase, botão. O
 * que falta é a poeira, que é fundo. Ressalva honesta que continua valendo: a
 * PÁGINA embarca a StickyMobileCta que o <World> monta de graça — escondida por
 * CSS, o que tira a barra da tela mas não tira o bundle.
 * -------------------------------------------------------------------------- */

export function Dobra() {
  return (
    <section className="lp3-dobra">
      {/* ── A FOTO ──
          `<img>` e não `background-image`: assim ela é PRÉ-CARREGÁVEL pelo scanner do
          navegador (que lê o HTML antes do CSS chegar), aceita `fetchPriority` e tem
          tamanho intrínseco declarado. Numa dobra, a imagem É o LCP — servi-la por
          CSS atrasa o único pixel que decide a nota de carregamento da página.

          `<img>` cru e não `next/image`: esta foto é uma só, sempre a mesma, sempre
          cobrindo a tela inteira. Não há srcset a escolher nem recorte a negociar; o
          `next/image` acrescentaria um wrapper e um pipeline para servir o mesmo
          arquivo. (Se um dia entrarem versões por viewport, é aqui que muda.) */}
      <img
        className="lp3-foto"
        src="/dobra-barbearia.jpg"
        alt=""
        width={1536}
        height={1024}
        fetchPriority="high"
        decoding="async"
      />

      {/* ── O VÉU ──
          Clareia o TOPO da foto, não a foto inteira, e é o que garante que a manchete
          navy tenha fundo claro em qualquer recorte. Ver a nota longa no v3.css: ele
          é piso de legibilidade com contraste medido, não filtro de clima. */}
      <div className="lp3-veu" aria-hidden="true" />

      {/* ⚠️ O WORDMARK MUDOU DE ENDEREÇO EM 11/08/2026, e não de dono: ele vinha de
          `../completa/Maisa`, e a pasta `completa/` foi apagada junto com as outras
          LPs de barbeiro. O arquivo veio inteiro para cá (`./Maisa`) porque a v3 e a
          v4 eram os dois únicos consumidores que sobraram — e a v4 já importa desta
          pasta, então a direção da dependência não mudou.
          O motivo de ele ser importado em vez de reescrito continua o mesmo:
          recriá-lo aqui seria mais uma grafia da marca no projeto, e a
          cor pararia de vir de --mk-wordmark — que é exatamente o token que esta
          página redefine para virar azul no tema claro (ver o topo do v3.css). Um
          wordmark com cor escrita à mão teria continuado dourado sobre branco. */}
      <p className="lp3-assinatura">
        <Marca />
      </p>

      <div className="lp3-miolo">
        {/* <h1> porque é a única afirmação da página, e o que a fila ilustra.
            Blocos, não <br>: cada frase continua quebrando internamente se a
            viewport for estreita — o que muda é só que ela não invade a outra. */}
        <h1 className="lp3-frase">
          {FRASE_DOBRA.map((linha, l) => (
            <span key={l} style={{ display: "block" }}>
              {frase(linha).map((p, i) =>
                p.marca ? <Maisa key={i} escala="grande" /> : <React.Fragment key={i}>{p.t}</React.Fragment>,
              )}
            </span>
          ))}
        </h1>

        {/* O SUBTÍTULO ENTROU COM A FOTO. O pôster antigo vivia de uma frase só
            porque dezesseis rostos faziam o resto do trabalho; sem eles, a manchete
            sozinha enuncia o PROBLEMA e não diz a solução. */}
        <p className="lp3-sub">{SUB_DOBRA}</p>

        {/* ⚠️ O DESTINO É `HREF_PLANOS`, NÃO `cfg.rotas.base`. Este botão apontava
            para `/barbeiros/comecar` — OUTRA LP —, o que numa one-pager é vazamento:
            o único alvo da dobra tirava a pessoa da página antes de ela ver o preço.
            A regra e o porquê estão escritos junto da constante, no dados.ts.

            O <GlassButton> com `href` sai como <a>, que é o que este alvo precisa
            ser: ele NAVEGA. A escala não vem do `size` — vem do `font-size` que a
            classe `.lp3-cta` põe no wrap. É por isso que os respiros do vidro são
            em `em`. */}
        <GlassButton href={HREF_PLANOS} size="lg" className="lp3-cta">
          {CTA_ROTULO}
        </GlassButton>
      </div>
    </section>
  );
}
