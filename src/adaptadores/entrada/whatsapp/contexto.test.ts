import { describe, expect, it } from "vitest";

import { normalizar, textoDoAudio } from "./contexto";

/** Um `messages.upsert` da Evolution v2 com nota de voz, no formato que chega no webhook. */
const audioDaEvolution = (comBase64: boolean) => ({
  event: "messages.upsert",
  instance: "maisa-barbearia",
  data: {
    key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "3EB0C0FFEE" },
    pushName: "Rose",
    messageType: "audioMessage",
    message: {
      audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 7, ptt: true },
      ...(comBase64 ? { base64: "T2dnUwACAAAA" } : {}),
    },
  },
});

describe("áudio no envelope", () => {
  it("chega como mídia de áudio, com o tipo e a chave da mensagem para baixar", () => {
    const e = normalizar(audioDaEvolution(false));
    expect(e).toMatchObject({ de: "5511988887777", texto: "", midia: "audio", conversaId: "3EB0C0FFEE", instancia: "maisa-barbearia" });
    expect(e?.audio).toEqual({ mimetype: "audio/ogg; codecs=opus", base64: undefined });
  });

  it("com webhookBase64 ligado, o conteúdo já vem no envelope", () => {
    expect(normalizar(audioDaEvolution(true))?.audio?.base64).toBe("T2dnUwACAAAA");
  });
});

describe("textoDoAudio", () => {
  it("a transcrição entra marcada como áudio", () => {
    expect(textoDoAudio("queria marcar pra quinta")).toBe("[áudio] queria marcar pra quinta");
  });

  it("sem transcrição, a marca leva o aviso: a MAISA pede para escrever em vez de calar", () => {
    expect(textoDoAudio(null)).toBe("[áudio] (não deu para ouvir)");
  });
});

describe("o que a entrada passa a carregar (27/10/2026)", () => {
  const texto = (extra: Record<string, unknown> = {}) => ({
    event: "messages.upsert",
    instance: "maisa-barbearia",
    data: {
      key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "3EB0AAA" },
      message: { conversation: "tem horário sexta?" },
      ...extra,
    },
  });

  it("a hora em que a pessoa mandou (o WhatsApp conta em segundos) e a chave para o tique azul", () => {
    const e = normalizar(texto({ messageTimestamp: 1_790_000_000 }));
    expect(e).toMatchObject({ origem: "evolution", enviadaEm: 1_790_000_000_000 });
    expect(e?.chave).toEqual({ remoteJid: "5511988887777@s.whatsapp.net", id: "3EB0AAA" });
  });

  it("hora que não é hora vira ausência: a mensagem é tratada como nova", () => {
    expect(normalizar(texto({ messageTimestamp: "ontem" }))?.enviadaEm).toBeUndefined();
    expect(normalizar(texto({ messageTimestamp: 12 }))?.enviadaEm).toBeUndefined();
    expect(normalizar(texto())?.enviadaEm).toBeUndefined();
  });

  it("o formato do curl é teste: a rota espera a resposta para devolver as bolhas", () => {
    expect(normalizar({ de: "5511988887777", texto: "oi" })?.origem).toBe("teste");
  });
});
