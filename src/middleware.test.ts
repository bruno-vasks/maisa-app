/* O que o middleware NÃO vê. Arquivo estático que passa por ele passa pelo login, e quem não está
 * logado recebe o `/login` no lugar do arquivo. Foi o que aconteceu com o vídeo da dobra do
 * `/barbeiro` até 14/11/2026: a capa aparecia, o vídeo nunca, e só para quem não tinha conta. */

import { describe, expect, it } from "vitest";
import { config } from "./middleware";

/* O matcher do Next é um padrão de caminho com o mesmo grupo de regex dentro. */
const passaPeloMiddleware = (caminho: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(caminho));

describe("o matcher do middleware", () => {
  it.each([
    "/dobra-barbearia.mp4",
    "/tutorial/whatsapp-codigo-iphone.mp4",
    "/tutorial/whatsapp-codigo-iphone.jpg",
    "/icon.svg",
    "/_next/static/chunks/main.js",
  ])("deixa o arquivo estático %s de fora", (caminho) => {
    expect(passaPeloMiddleware(caminho)).toBe(false);
  });

  it.each(["/", "/comecar", "/login", "/api/canal", "/lp/maisa/assets/index.js"])(
    "continua cuidando de %s",
    (caminho) => {
      expect(passaPeloMiddleware(caminho)).toBe(true);
    },
  );
});
