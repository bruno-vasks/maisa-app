/* ─────────────────────────────────────────────────────────────────────────────
 * O NÚMERO QUE A CONFERÊNCIA MOSTRA.
 *
 * Este teste existe por causa do modo de falha da tela de conferência, que é pior que o
 * defeito que ela conserta: mostrar bonito um número que o domínio vai RECUSAR. Aí a pessoa
 * lê "+55 (11) 9942-906", confirma, e o pedido nem sai — a confirmação virou uma tela que
 * dá confiança errada.
 *
 * A garantia provada aqui é uma só: `telefoneParaConferir` devolve texto exatamente quando
 * `numeroParaPareamento` aceita, e `null` quando ele recusa. Uma máscara própria, escrita
 * "só para exibir", quebraria isso na primeira divergência de regra.
 *
 * ⚠️ Ambiente `node` (ver `vitest.config.ts`) e o arquivo importado é `.tsx`. Funciona porque
 * a função é pura e nada do módulo toca DOM na carga — os `window` do `primitivos` vivem
 * dentro de hooks. Se um dia isto quebrar, a resposta é mover a função para um `.ts` puro, e
 * não ligar `jsdom` por causa de uma formatação de telefone.
 * ───────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { passoNoVideo, telefoneParaConferir } from "./Pareamento";
import { numeroParaPareamento } from "@/nucleo/dominio/canal";

describe("telefoneParaConferir", () => {
  it("celular com DDD sai no formato que a pessoa reconhece, com o DDI à mostra", () => {
    /* O DDI aparece porque é ele que sai daqui para o provedor. Sem o `+55` na tela, a
     * conferência esconde justamente a parte que a tela acrescentou sozinha. */
    expect(telefoneParaConferir("11994294906")).toBe("+55 (11) 99429-4906");
  });

  it("fixo de 10 dígitos também", () => {
    expect(telefoneParaConferir("1132515000")).toBe("+55 (11) 3251-5000");
  });

  it("número que já vem com o 55 não ganha um segundo", () => {
    expect(telefoneParaConferir("5511994294906")).toBe("+55 (11) 99429-4906");
  });

  it("pontuação não muda nada — quem lê dígitos é o domínio", () => {
    expect(telefoneParaConferir("(11) 99429-4906")).toBe("+55 (11) 99429-4906");
  });

  it("estrangeiro com DDI sai cru, e isso é melhor que uma máscara errada", () => {
    expect(telefoneParaConferir("351912345678")).toBe("+351912345678");
  });

  describe("devolve null exatamente quando o domínio recusaria", () => {
    /* É ESTE o teste que justifica o arquivo. Cada entrada aqui passa pelas duas funções, e
     * a asserção é sobre a CONCORDÂNCIA entre elas — não sobre o texto de saída. */
    const entradas = [
      "", "1", "119", "119942949", // curtos
      "11994294906", "1132515000", "5511994294906", "351912345678", // válidos
      "1199429490612345678", // longo além do E.164
    ];

    for (const bruto of entradas) {
      it(`"${bruto}"`, () => {
        const aceito = numeroParaPareamento(bruto) !== null;
        expect(telefoneParaConferir(bruto) !== null).toBe(aceito);
      });
    }
  });
});

/* O passo que acende ao lado do vídeo do iPhone. Errar aqui é a lista dizer "Conectar
 * dispositivo" enquanto o vídeo mostra outra tela, que é pior que não acender nada. */
describe("passoNoVideo", () => {
  const passos = [0, 1.4, 3.3, 6.9];
  it.each([
    [0, 0], [1.39, 0], [1.4, 1], [3.2, 1], [3.3, 2], [6.89, 2], [6.9, 3], [11.5, 3],
  ])("aos %ss o vídeo está no passo %i", (segundo, passo) => {
    expect(passoNoVideo(passos, segundo)).toBe(passo);
  });
});
