#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# O VÍDEO DO CAMINHO NO WHATSAPP DO IPHONE, a partir da gravação de tela crua.
#
#   bash scripts/tutorial-whatsapp/gerar.sh ~/Downloads/ScreenRecording_….MP4
#
# Grava `public/tutorial/whatsapp-codigo-iphone.mp4` e a capa `.jpg`. Quem mostra é o
# `CaminhoNoWhatsApp`, em `src/ui/componentes/Pareamento.tsx`.
#
# ⚠️ OS TEMPOS E AS POSIÇÕES SÃO DA GRAVAÇÃO DE 13/11/2026 (888×1920, 60 fps, 18,5 s). Uma
# gravação nova pede medir de novo: os quadros a cada 0,25 s mostram quando cada toque acontece.
# Os segundos dos passos (`passos` do `TUTORIAL`, no Pareamento) vêm desta mesma linha do tempo.
#
# O que o comando faz, e por quê:
#   • corta de 3,3 s a 14,8 s. Antes de 3,3 s aparece a aba Comunidades, com o nome dos grupos, as
#     mensagens e o telefone de outra pessoa; depois de 14,8 s a tela do código fica parada;
#   • borra a foto e o nome do perfil, o rostinho na aba Você e a lista de aparelhos conectados.
#     Enquanto o cartão do Face ID está por cima da lista, borra só em volta dele;
#   • põe um círculo branco (`toque.png`) em cada toque, porque a gravação do iPhone não mostra o
#     dedo: Você (0,1 s), Dispositivos conectados (1,45 s), Conectar dispositivo (4,05 s),
#     Conectar com número de telefone (6,9 s); e contorna as 8 caixas do código (`campo.png`) no fim;
#   • sai sem áudio, em H.264 com 444 px de largura (o dobro do que a tela mostra, para a tela
#     cheia continuar legível), com o índice no começo do arquivo para tocar antes de baixar tudo.
#
# Os dois PNG foram desenhados em SVG e salvos com fundo transparente.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ORIGEM="${1:?passe o caminho da gravação de tela}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
SAIDA="$AQUI/../../public/tutorial"
D=11.5

mkdir -p "$SAIDA"
ffmpeg -v error -y -ss 3.3 -t "$D" -i "$ORIGEM" \
  -loop 1 -framerate 30 -t "$D" -i "$AQUI/toque.png" \
  -loop 1 -framerate 30 -t "$D" -i "$AQUI/campo.png" \
  -filter_complex "
  [0:v]fps=30,scale=444:960:flags=lanczos,setsar=1,split=8[b0][b1][b2][b3][b4][b5][b6][b7];
  [b1]crop=180:247:132:98,boxblur=luma_radius=22:luma_power=3[foto];
  [b2]crop=444:247:0:98,boxblur=luma_radius=22:luma_power=3[faixa];
  [b3]crop=44:44:377:866,boxblur=luma_radius=10:luma_power=3[avatar];
  [b4]crop=412:142:16:466,boxblur=luma_radius=22:luma_power=3[lista];
  [b5]crop=120:142:16:466,boxblur=luma_radius=22:luma_power=3[esq];
  [b6]crop=122:142:306:466,boxblur=luma_radius=22:luma_power=3[dir];
  [b7]crop=412:36:16:572,boxblur=luma_radius=8:luma_power=4[baixo];
  [b0][foto]overlay=132:98:enable='between(t,0,2.9)'[o1];
  [o1][faixa]overlay=0:98:enable='between(t,2.9,3.3)'[o2];
  [o2][avatar]overlay=377:866:enable='between(t,0,6.1)'[o3];
  [o3][lista]overlay=16:466:enable='between(t,2.9,5.54)'[o4a];
  [o4a][esq]overlay=16:466:enable='between(t,5.54,5.9)'[o4b];
  [o4b][dir]overlay=306:466:enable='between(t,5.54,5.9)'[o4c];
  [o4c][baixo]overlay=16:572:enable='between(t,5.54,5.9)'[o4];
  [1:v]format=rgba,split=4[t1][t2][t3][t4];
  [t1]fade=t=in:st=0.15:d=0.2:alpha=1,fade=t=out:st=1.0:d=0.2:alpha=1[r1];
  [t2]fade=t=in:st=1.5:d=0.2:alpha=1,fade=t=out:st=2.6:d=0.2:alpha=1[r2];
  [t3]fade=t=in:st=4.1:d=0.2:alpha=1,fade=t=out:st=5.25:d=0.2:alpha=1[r3];
  [t4]fade=t=in:st=6.95:d=0.2:alpha=1,fade=t=out:st=7.85:d=0.2:alpha=1[r4];
  [2:v]format=rgba,fade=t=in:st=9.0:d=0.25:alpha=1[cx];
  [o4][r1]overlay=361:855:enable='between(t,0.1,1.25)'[p1];
  [p1][r2]overlay=162:740:enable='between(t,1.45,2.85)'[p2];
  [p2][r3]overlay=184:328:enable='between(t,4.05,5.5)'[p3];
  [p3][r4]overlay=184:842:enable='between(t,6.9,8.1)'[p4];
  [p4][cx]overlay=24:309:enable='gte(t,8.95)',format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 24 -profile:v high -movflags +faststart \
  "$SAIDA/whatsapp-codigo-iphone.mp4"

ffmpeg -v error -y -i "$SAIDA/whatsapp-codigo-iphone.mp4" -frames:v 1 -q:v 4 "$SAIDA/whatsapp-codigo-iphone.jpg"
echo "pronto: $SAIDA/whatsapp-codigo-iphone.mp4"
