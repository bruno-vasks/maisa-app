/* ─────────────────────────────────────────────────────────────────────────────
 * TRANSCRIÇÃO — o áudio do cliente vira texto antes de chegar à MAISA.
 *
 * No Brasil, áudio é como muita gente manda mensagem. Até 26/10/2026 a MAISA respondia
 * áudio com silêncio (ver a dívida no `entrada/whatsapp/LEIA-ME.md`). O Bruno escolheu a
 * saída das três que estavam na mesa: transcrever e responder como se ela tivesse lido.
 *
 * O Gemini entende áudio direto (`inlineData`), inclusive o OGG/Opus que o WhatsApp
 * grava, então não há conversão no caminho. Mesmo REST sem SDK do `modelo-gemini.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import { FalhaDoProvedor, LimiteDoProvedor, NaoConfigurado } from "@/nucleo/dominio/erros";
import { GEMINI, geminiFaltando, isGeminiConfigured } from "./config";

/** O modelo que ouve. Barato de propósito: transcrever é a tarefa mais simples do turno. */
const MODELO_DE_TRANSCRICAO = (process.env.GEMINI_MODELO_TRANSCRICAO ?? "").trim() || "gemini-3.5-flash-lite";

/** Áudio de WhatsApp acima disto é conversa longa, não pedido de horário. Base64 de 1 min
 *  de Opus a 24 kbps tem uns 240 KB; 4 MB cobre áudio de vários minutos. */
const MAX_BASE64 = 4_000_000;

const INSTRUCAO =
  "Transcreva exatamente o que a pessoa fala neste áudio de WhatsApp, em português do Brasil. " +
  "Só a transcrição, sem comentário, sem aspas e sem marcar quem fala. " +
  "Se não houver fala compreensível, responda apenas: (inaudível)";

/**
 * O texto falado no áudio, ou `null` quando não há fala que dê para entender.
 *
 * Lança os mesmos erros do resto do adaptador (`LimiteDoProvedor`, `FalhaDoProvedor`):
 * quem chama decide o que dizer ao cliente quando o áudio não pôde ser ouvido.
 */
export async function transcreverAudio(audio: { base64: string; mimetype: string }): Promise<string | null> {
  if (!isGeminiConfigured) throw new NaoConfigurado(geminiFaltando());
  if (audio.base64.length > MAX_BASE64) return null;

  /* "audio/ogg; codecs=opus" é como o WhatsApp descreve a nota de voz. O Gemini quer só o
   * tipo, sem parâmetro. */
  const mimeType = audio.mimetype.split(";")[0].trim() || "audio/ogg";

  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), GEMINI.timeoutMs);
  let resposta: Response;
  try {
    resposta = await fetch(`${GEMINI.base}/models/${MODELO_DE_TRANSCRICAO}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI.chave },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: audio.base64 } }, { text: INSTRUCAO }] }],
        generationConfig: { maxOutputTokens: 1500 },
      }),
      signal: controle.signal,
    });
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    throw abortou ? new LimiteDoProvedor("O Gemini demorou demais para transcrever.") : new FalhaDoProvedor("Não deu para falar com o Gemini.", e);
  } finally {
    clearTimeout(alarme);
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    if (resposta.status === 429 || resposta.status >= 500) throw new LimiteDoProvedor(`Gemini indisponível (${resposta.status}).`);
    throw new FalhaDoProvedor(`Gemini recusou a transcrição (${resposta.status}): ${texto.slice(0, 300)}`);
  }

  let dados: any;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new FalhaDoProvedor("Resposta do Gemini não era JSON.", e);
  }
  const partes: any[] = dados?.candidates?.[0]?.content?.parts ?? [];
  const falado = partes
    .filter((p) => !p?.thought && typeof p?.text === "string")
    .map((p) => p.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!falado || /^\(?inaud[ií]vel\)?\.?$/i.test(falado)) return null;
  return falado;
}
