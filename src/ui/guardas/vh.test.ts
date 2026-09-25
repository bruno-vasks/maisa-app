/* ─────────────────────────────────────────────────────────────────────────────
 * G9 · SEM `vh` CONGELADO.
 *
 * No Safari do iPhone, `100vh` é a altura da janela COM a barra de endereço recolhida. Com a
 * barra à mostra, a casca fica mais alta que a tela e a barra de abas vai para trás dela: o
 * dono não acha "Hoje" nem "Agenda". `dvh` acompanha a barra (item T11 do backlog do front).
 *
 * Reprova `<número>vh` em texto de código do painel e das rotas de entrada. Passa a linha que
 * também traz `dvh`: é o par de reserva declarado (`vh` para navegador antigo, `dvh` por
 * cima), e é a única forma aceita.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

const VH = /\b\d+(\.\d+)?vh\b/;

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!VH.test(fonte)) continue;
    const linhas = fonte.split("\n");
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      const texto = textoDoNo(no);
      if (texto === null || !VH.test(texto)) return;
      const linha = linhaDe(sf, no);
      if ((linhas[linha - 1] ?? "").includes("dvh")) return; // par de reserva declarado
      achados.push({ arquivo, linha, trecho: trechoDe(fonte, linha) });
    });
  }
  return achados;
}

/** 24/09/2026. Paga o 1C.4 (T11): casca, gaveta e busca em `dvh` com reserva. */
const DIVIDA: Divida = {
  "src/app/cadastro/page.tsx": [2, "24/09/2026 · fundo da entrada; o 3.4 refaz o fundo chapado"],
  "src/app/comecar/Comecar.tsx": [2, "24/09/2026 · moldura do wizard (2.41)"],
  "src/app/esqueci/page.tsx": [1, "24/09/2026 · fundo da entrada (3.4)"],
  "src/app/login/page.tsx": [2, "24/09/2026 · fundo da entrada (3.4)"],
  "src/app/nova-senha/page.tsx": [1, "24/09/2026 · fundo da entrada (3.4)"],
  "src/ui/componentes/AppShell.tsx": [2, "24/09/2026 · altura da casca nas duas larguras (1C.4, T11)"],
};

describe("G9 · sem vh congelado", () => {
  it("nenhum `vh` novo no painel e nas rotas de entrada", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Altura em `vh`: no iPhone a barra do Safari esconde o fim da tela. Use `dvh` (com `vh` de reserva na mesma linha).", problemas, achados)).toEqual([]);
  });

  it("o instrumento distingue vh de dvh e de vw", () => {
    expect(VH.test("height:100vh")).toBe(true);
    expect(VH.test("top: 12vh")).toBe(true);
    expect(VH.test("height:100dvh")).toBe(false);
    expect(VH.test("max-width:92vw")).toBe(false);
    expect(VH.test("min(520px, 70.5vh)")).toBe(true);
  });
});
