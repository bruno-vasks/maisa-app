/* ─────────────────────────────────────────────────────────────────────────────
 * G11 · O STATUS DA MAISA TEM UM LUGAR SÓ.
 *
 * Em 24/09/2026 três telas diziam se a MAISA estava respondendo, cada uma do seu jeito e
 * todas olhando só o interruptor: "MAISA no ar" na topbar, "Assistente ativa · A MAISA
 * responde no WhatsApp automaticamente" nos Ajustes, "resolvendo tudo sozinha" no Fluxo. Com o
 * WhatsApp desconectado, as três mentiam.
 *
 * A tabela-verdade da regra está em `nucleo/dominio/status-da-maisa.test.ts`. Este guarda
 * cuida da outra metade: as frases que AFIRMAM o status só existem em
 * `ui/componentes/StatusDaMaisa.tsx`, que as deriva de `st.statusMaisa`. Quem escrever "no
 * ar" noutra tela está derivando o status por conta própria, e é assim que ele volta a mentir.
 *
 * Pelo parser: o comentário que conta a história ("a topbar dizia no ar") é trivia e passa.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

const DONO = "src/ui/componentes/StatusDaMaisa.tsx";

/** "no ar" pede fronteira de palavra ("no arquivo" passa). "Atendendo" é o RÓTULO, com
 *  maiúscula e sozinho: `"atendendo"` minúsculo é a etapa do quadro e o id do status, e
 *  "3 atendendo" na tabela de serviços conta profissionais. */
const PROIBIDAS: RegExp[] = [
  /\bno ar\b/i,
  /(^|[^\p{L}])Atendendo\b/u,
  /assistente ativa/i,
  /responde automaticamente/i,
  /no whatsapp automaticamente/i,
  /resolvendo tudo sozinha/i,
];

function afirmacoes(sf: ts.SourceFile): ts.Node[] {
  const achados: ts.Node[] = [];
  visitar(sf, (no) => {
    const texto = textoDoNo(no);
    if (texto !== null && PROIBIDAS.some((r) => r.test(texto))) achados.push(no);
  });
  return achados;
}

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    if (arquivo === DONO || arquivo.startsWith("src/ui/guardas/")) continue;
    const fonte = ler(arquivo);
    const sf = arvore(arquivo, fonte);
    for (const no of afirmacoes(sf)) {
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    }
  }
  return achados;
}

/**
 * 24/09/2026. O "no ar" das FAQ ("12 respostas no ar") não fala do status, mas diz a mesma
 * coisa sem saber: são as `D.FAQS` de fixture, e saem com elas no 1A.10.
 */
/* Zerada em 25/09/2026: as duas dívidas eram as "respostas no ar" das `D.FAQS`, que saíram
 * da tela no 1A.10. */
const DIVIDA: Divida = {};

describe("G11 · status da MAISA num lugar só", () => {
  it("só StatusDaMaisa.tsx afirma se a MAISA está no ar", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Status da MAISA escrito fora de StatusDaMaisa.tsx (T3 do backlog do front).", problemas, achados)).toEqual([]);
  });

  it("o instrumento acha o que deve e ignora comentário e palavra vizinha", () => {
    const sf = arvore(
      "amostra.tsx",
      [
        "// a topbar dizia MAISA no ar com o WhatsApp caído",
        'const a = "MAISA no ar";',
        "const b = <span>Assistente ativa</span>;",
        'const c = "vai no arquivo";',
        'const d = `Atendendo ${n}`;',
      ].join("\n"),
    );
    expect(afirmacoes(sf).map((n) => n.getText(sf))).toEqual(['"MAISA no ar"', "Assistente ativa", "`Atendendo ${"]);
  });

  it("o dono existe e escreve os rótulos", () => {
    const fonte = ler(DONO);
    expect(fonte).toContain('atendendo: "Atendendo"');
    expect(fonte).toContain("st.statusMaisa");
  });
});
