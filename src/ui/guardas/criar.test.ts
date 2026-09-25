/* ─────────────────────────────────────────────────────────────────────────────
 * G7 · UM LUGAR PARA A AÇÃO DE CRIAR.
 *
 * Até 25/09/2026 cada tela punha o "criar" num lugar: "Novo cliente" no hero de Clientes,
 * "Marcar" na barra do calendário (só no desktop), "Novo serviço" dourado na topbar, e o
 * celular não tinha nenhum. Item T2 do backlog do front: a tela DECLARA a ação no mapa `TELA`
 * da casca, e a casca desenha no slot (topbar e "＋" do celular) e no menu "Novo".
 *
 * Reprova o rótulo de criar escrito como texto de tela fora da lista fechada abaixo, que diz
 * onde cada um pode aparecer e por quê. Um botão "Novo cliente" num cabeçalho de tela é o
 * segundo lugar da mesma ação, e o começo de voltar a ter um por tela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { arquivosDeTela, arvore, ler, linhaDe, textoDoNo, trechoDe, visitar } from "./fonte";

const ROTULOS = ["Novo cliente", "Novo serviço", "Marcar atendimento", "Adicionar profissional", "Encaixar cliente"] as const;

/** `arquivo → rótulos permitidos ali`, com o motivo. Lista fechada. */
const ONDE: Record<string, { rotulos: readonly string[]; motivo: string }> = {
  "src/ui/componentes/AppShell.tsx": { rotulos: ROTULOS, motivo: "o mapa `TELA` (slot) e o menu \"Novo\"" },
  "src/ui/detalhe.tsx": { rotulos: ["Marcar atendimento"], motivo: "o botão que confirma o rascunho, na gaveta \"Novo atendimento\"" },
  "src/ui/telas/Agenda.tsx": { rotulos: ["Marcar atendimento"], motivo: "o vazio do dia no celular, que sem ele não tinha saída (03 P0-1)" },
  "src/ui/estado/store.tsx": { rotulos: ["Novo serviço"], motivo: "o nome com que o serviço criado nasce (`criarServico`), não um botão" },
};

function varrer() {
  const achados: { arquivo: string; linha: number; rotulo: string; trecho: string }[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    if (!ROTULOS.some((r) => fonte.includes(r))) continue;
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      const texto = textoDoNo(no)?.trim();
      if (!texto) return;
      const rotulo = ROTULOS.find((r) => texto === r);
      if (!rotulo) return;
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, rotulo, trecho: trechoDe(fonte, linha) });
    });
  }
  return achados;
}

describe("G7 · um lugar para criar", () => {
  it("rótulo de criar só no slot, no menu \"Novo\" e nos pontos da lista", () => {
    const fora = varrer()
      .filter((a) => !ONDE[a.arquivo]?.rotulos.includes(a.rotulo))
      .map((a) => `${a.arquivo}:${a.linha}  "${a.rotulo}"  ${a.trecho}`);
    expect(fora, "Declare a ação no mapa `TELA` de AppShell.tsx (T2) em vez de desenhar outro botão").toEqual([]);
  });

  it("o instrumento acha os cinco rótulos na casca (senão está olhando o vazio)", () => {
    const naCasca = new Set(varrer().filter((a) => a.arquivo === "src/ui/componentes/AppShell.tsx").map((a) => a.rotulo));
    expect([...naCasca].sort()).toEqual([...ROTULOS].sort());
  });

  it("toda entrada da lista ainda tem o rótulo (lista sem folga)", () => {
    const achados = varrer();
    const sobra = Object.entries(ONDE).flatMap(([arquivo, { rotulos }]) =>
      rotulos.filter((r) => !achados.some((a) => a.arquivo === arquivo && a.rotulo === r)).map((r) => `${arquivo}: "${r}"`));
    expect(sobra, "tire da lista o que não está mais lá").toEqual([]);
  });
});
