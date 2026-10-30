"use client";

import { useEffect, useRef } from "react";

/* ----------------------------------------------------------------------------
 * <VideoDobra> — o pôster da v4 é filmado. Mesmo lugar, mesmo recorte e mesmo véu
 * da foto da v3; o que muda é que a camada de fundo agora se move.
 *
 * ⚠️ POR QUE ISTO É UM CLIENT COMPONENT NUM ARQUIVO SÓ, E O RESTO DA DOBRA NÃO.
 * A <Dobra> continua Server Component: manchete, subtítulo e botão saem prontos do
 * HTML. A fronteira servidor→cliente passa AQUI e só aqui, e o que atravessa são
 * três strings (src, poster, className) — nenhum texto da página e nenhuma imagem.
 * É a mesma disciplina que a v3 aplicava à <Particulas>.
 *
 * ── O CORTE: DURAÇÃO MENOS DOIS SEGUNDOS.
 * O arquivo entregue tem 10,006s e os dois últimos segundos não entram na LP. Isso
 * está escrito como REGRA (`duration - CORTE_FINAL`) e não como o número 8,006 —
 * assim, se o vídeo for trocado por outra tomada, o corte continua valendo sem que
 * ninguém precise lembrar de recalcular a constante. O número cru só aparece como
 * rede de segurança para o caso de `duration` vir NaN antes dos metadados.
 *
 * ⚠️ O CORTE É DE REPRODUÇÃO, NÃO DE ARQUIVO. O .mp4 em /public continua com 10s;
 * quem para aos 8s é este componente. A alternativa — reencodar o arquivo — não
 * estava disponível (não há ffmpeg nesta máquina) e, francamente, seria pior por
 * dois motivos: reencodar H.264 perde qualidade, e o corte deixaria de ser uma
 * decisão legível no código para virar um fato opaco dentro de um binário. O custo
 * é ~540KB de vídeo baixado que nunca é visto; se isso pesar, aí sim vale cortar o
 * arquivo de verdade (ver a nota no fim deste bloco).
 *
 * ── POR QUE NÃO O ATRIBUTO `loop`.
 * O `loop` nativo reinicia no FIM do arquivo — 10s — que é exatamente o que o corte
 * existe para evitar. Sem ele, o rebobinar é nosso: quando o relógio passa do corte,
 * `currentTime = 0`. O salto para zero é barato porque zero é sempre keyframe (não
 * há decodificação a recuperar) e porque `preload="auto"` já trouxe o arquivo
 * inteiro — o seek nunca vai à rede.
 *
 * ── COMO O RELÓGIO É LIDO, E POR QUE NÃO COM `timeupdate`.
 * O `timeupdate` dispara a cada ~250ms, o que deixaria até um quarto de segundo do
 * trecho proibido aparecer antes do corte. `requestVideoFrameCallback` dispara a
 * cada QUADRO EXIBIDO — a precisão vira 1/30s e o corte cai onde foi pedido. Onde
 * ele não existe (Firefox, hoje), o fallback é `requestAnimationFrame`, que é preso
 * ao quadro da tela e erra por igual pouco. O `timeupdate` fica só como terceira
 * rede, para o caso de os dois laços serem suspensos pelo navegador.
 *
 * ── ELE PARA QUANDO SAI DA TELA, e isso não é zelo gratuito.
 * A v3 MATOU a órbita e as partículas por custo de quadro — o perfil de 08/08 acusou
 * a dobra como 41% do travamento, justamente porque ela continuava animando enquanto
 * a pessoa lia a seção de baixo. Um vídeo em tela cheia decodificando fora de vista
 * repetiria o mesmo erro com outro nome. O IntersectionObserver pausa quando a dobra
 * sai e retoma quando ela volta.
 *
 * ── MOVIMENTO REDUZIDO: O PÔSTER VOLTA A SER FOTO.
 * Com `prefers-reduced-motion: reduce` o vídeo não toca e o que fica na tela é o
 * `poster` — `/dobra-barbearia-video.jpg`, a foto que a v3 usava até 30/10/2026. Não é um degradê inventado
 * para a ocasião: é literalmente a dobra da v3, que já passou pela régua de
 * contraste. A preferência é reavaliada em tempo real (o listener), porque quem a
 * liga no meio da sessão espera que a página obedeça na hora.
 *
 * ── O `poster` TAMBÉM É O LCP, e é por isso que ele não é opcional.
 * Vídeo não conta como candidato a Largest Contentful Paint; a imagem de pôster
 * conta. Sem ela, a dobra passaria a marcar LCP pela manchete (texto), e o primeiro
 * quadro seria uma tela vazia esperando o mp4. Com ela, o primeiro pixel é o mesmo
 * de antes, chega na mesma hora, e o vídeo entra por cima quando estiver pronto.
 *
 * SE UM DIA HOUVER FFMPEG NESTA MÁQUINA, o comando que torna o corte físico é:
 *   ffmpeg -i video_brunao.mp4 -t 8 -an -c:v copy -movflags +faststart dobra-barbearia.mp4
 * (`-an` derruba de quebra a trilha de áudio, que num hero mudo é peso morto.)
 * Feito isso, este componente continua correto — `duration - 2` de um arquivo já
 * cortado simplesmente nunca é alcançado, e o `loop` nativo poderia substituí-lo.
 * -------------------------------------------------------------------------- */

/** Quantos segundos do fim do arquivo não entram na LP. */
const CORTE_FINAL = 2;

/** Usado só enquanto `duration` não chegou. É a duração conhecida do arquivo
 *  entregue (10,006s) menos o corte. */
const FIM_PRESUMIDO = 8.006;

/* `requestVideoFrameCallback` ainda não está no lib.dom do TypeScript em uso. */
type VideoComQuadro = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export function VideoDobra({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current as VideoComQuadro | null;
    if (!v) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let vivo = true;
    let idQuadro = 0;
    let idRaf = 0;
    let visivel = true;

    const fim = () => {
      const d = v.duration;
      return Number.isFinite(d) && d > CORTE_FINAL ? d - CORTE_FINAL : FIM_PRESUMIDO;
    };

    /* Tocar pode ser recusado (política de autoplay). A recusa não é erro nosso e
       não deve subir como unhandled rejection — o pôster segue na tela. */
    const tocar = () => void v.play().catch(() => {});

    const rebobinar = () => {
      v.currentTime = 0;
      if (!v.paused) return;
      tocar();
    };

    const conferir = () => {
      if (!vivo) return;
      if (v.currentTime >= fim()) rebobinar();
    };

    /* ── os dois laços; só um roda por vez ── */
    const porQuadro = () => {
      if (!vivo) return;
      conferir();
      idQuadro = v.requestVideoFrameCallback!(porQuadro);
    };
    const porRaf = () => {
      if (!vivo) return;
      conferir();
      idRaf = requestAnimationFrame(porRaf);
    };
    const ligarLaco = () => {
      if (typeof v.requestVideoFrameCallback === "function") idQuadro = v.requestVideoFrameCallback(porQuadro);
      else idRaf = requestAnimationFrame(porRaf);
    };
    const desligarLaco = () => {
      if (idQuadro && typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(idQuadro);
      if (idRaf) cancelAnimationFrame(idRaf);
      idQuadro = 0;
      idRaf = 0;
    };

    /* ── quem manda tocar ou parar ── */
    const sincronizar = () => {
      if (!vivo) return;
      if (mq.matches) {
        v.pause();
        v.currentTime = 0; /* volta ao quadro que casa com o poster */
        desligarLaco();
        return;
      }
      if (visivel) {
        tocar();
        if (!idQuadro && !idRaf) ligarLaco();
      } else {
        v.pause();
        desligarLaco();
      }
    };

    const observador = new IntersectionObserver(
      ([e]) => {
        visivel = e.isIntersecting;
        sincronizar();
      },
      /* Um fio de dobra visível já basta para valer a pena manter tocando: assim o
         vídeo não fica ligando e desligando em quem rola devagar na fronteira. */
      { threshold: 0.01 },
    );
    observador.observe(v);

    v.addEventListener("timeupdate", conferir); /* terceira rede */
    v.addEventListener("ended", rebobinar); /* se o corte falhar, não morre parado */
    v.addEventListener("loadedmetadata", sincronizar);
    mq.addEventListener("change", sincronizar);

    sincronizar();

    return () => {
      vivo = false;
      desligarLaco();
      observador.disconnect();
      v.removeEventListener("timeupdate", conferir);
      v.removeEventListener("ended", rebobinar);
      v.removeEventListener("loadedmetadata", sincronizar);
      mq.removeEventListener("change", sincronizar);
    };
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      /* `muted` e `playsInline` não são preferência: sem os dois o autoplay é
         recusado no desktop e o iOS abre o vídeo em tela cheia por cima da LP. */
      muted
      playsInline
      autoPlay
      /* SEM `loop` — o rebobinar é do useEffect, no corte, não no fim do arquivo. */
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      /* Decorativo: é o fundo do pôster, como a foto era. Quem usa leitor de tela
         recebe a manchete, que é onde a informação está. */
      role="presentation"
      disablePictureInPicture
      controls={false}
    />
  );
}
