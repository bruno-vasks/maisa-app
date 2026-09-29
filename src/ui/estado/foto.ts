/* ─────────────────────────────────────────────────────────────────────────────
 * REDUZIR A FOTO NO NAVEGADOR, ANTES DE SUBIR (29/09/2026).
 *
 * A foto do negócio vai para uma coluna de texto e volta em toda leitura do cadastro (ver
 * `FOTO_MAX` em `dominio/negocio.ts`). Uma foto de celular crua tem 3 a 5 MB; aqui ela vira um
 * quadrado de 256px, recortado no centro, em JPEG, e fica entre 15 e 40 KB. 256 é o dobro do
 * maior tamanho em que o painel a desenha (a gaveta, 64px, em tela retina com folga).
 *
 * Se a qualidade 0,85 passar do teto (foto muito granulada), tenta 0,7 e 0,55 antes de desistir.
 * ────────────────────────────────────────────────────────────────────────────── */

import { FOTO_MAX } from "@/nucleo/dominio/negocio";

export const LADO_DA_FOTO = 256;

export async function reduzirFoto(arquivo: File): Promise<string> {
  const img = await abrir(arquivo);
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  if (!lado) throw new Error("imagem vazia");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LADO_DA_FOTO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  /* Fundo branco: PNG transparente em JPEG viraria preto. */
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
  ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
  for (const q of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= FOTO_MAX) return url;
  }
  throw new Error("foto grande demais");
}

function abrir(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, falhou) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falhou(new Error("não abriu")); };
    img.src = url;
  });
}
