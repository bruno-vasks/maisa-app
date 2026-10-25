/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE TESTE PRENDE
 *
 * ★ **AS DUAS OPÇÕES APARECEM.** Esta tela existe para responder uma pergunta — nota fiscal ou
 * recibo? — e ela é a única porta para essa resposta desde 26/08/2026, quando saiu do
 * Faturamento. Se as opções deixarem de renderizar, o dono perde o acesso à decisão inteira e o
 * Faturamento fica travado no bloco "falta configurar", sem caminho.
 *
 * Render por SSR (`renderToStaticMarkup`), sem `jsdom` — ver o cabeçalho de
 * `componentes/EmitirRecibos.test.ts` para o porquê. É smoke: pega token inexistente, import
 * quebrado e estouro no primeiro render, que é o que um redesenho quebra.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreProvider } from "@/ui/estado/store";
import { DocumentoFiscal, escolhaFeita } from "./DocumentoFiscal";

const html = () => renderToStaticMarkup(h(StoreProvider, null, h(DocumentoFiscal)));

describe("DocumentoFiscal", () => {
  it("monta sem estourar", () => {
    expect(html().length).toBeGreaterThan(50);
  });

  it("oferece as duas escolhas, com o nome do documento em cada uma", () => {
    const s = html();
    expect(s).toContain("Tenho CNPJ");
    expect(s).toContain("nota fiscal de servi\u00e7o");
    expect(s).toContain("Atendo como pessoa f\u00edsica");
    expect(s).toContain("Receita Sa\u00fade");
  });

  /* ⚠️ Enquanto ninguém escolheu, nenhuma das duas se marca. Marcar uma por padrão faria a tela
   * afirmar um regime tributário que o dono não escolheu — e o regime decide qual documento sai. */
  it("sem escolha feita, nenhuma das duas vem marcada", () => {
    const s = html();
    expect(s).not.toContain('aria-pressed="true"');
    expect(s.match(/aria-pressed="false"/g)).toHaveLength(2);
  });

  /* 24/10/2026, pedido do Bruno: a tela não explica que nota e recibo são documentos diferentes.
   * O subtítulo já diz "Escolha uma vez" e os dois cartões são a escolha. Antes havia aqui uma
   * frase "você ainda não escolheu — e são documentos diferentes…", e este teste exigia o trecho
   * "ainda não escolheu". */
  it("sem escolha feita, não há frase explicando a diferença nem pedindo para escolher de novo", () => {
    const s = html();
    expect(s).not.toContain("ainda n\u00e3o escolheu");
    expect(s).not.toContain("documentos diferentes");
    expect(s).not.toContain("n\u00e3o gravado");
  });
});

/* ── ★ O TESTE QUE PAGOU CARO ────────────────────────────────────────────────
 *
 * 26/08/2026, 16:46. A tela marcava "Tenho CNPJ" para o Bruno, que nunca escolheu CNPJ. A causa:
 * `atual` era derivado do `caminho`, e `caminhoDaNota` responde `"municipal"` para config vazia —
 * é o padrão de quem ainda não respondeu (o aviso está em `nucleo/dominio/fiscal.ts`).
 *
 * O dano não parou na tela errada. Com um cartão marcado, o OUTRO virou "trocar"; a troca chamava
 * `DELETE /api/fiscal`; e o DELETE apagou o CPF de emitente, a profissão, o registro no conselho e
 * o ambiente de produção que já estavam gravados no banco de produção.
 *
 * ⚠️ Config vazia tem que dar `null`. Este é o caso que importa — os outros dois são o contraste. */
describe("★ escolhaFeita: marcado é o que foi escolhido, nunca o caminho padrão", () => {
  const vazia = { prestadorCpf: null, cnpj: null, empresaId: null };

  it("config vazia = ninguém escolheu", () => {
    expect(escolhaFeita(vazia)).toBe(null);
  });

  it("sem leitura ainda também é null", () => {
    expect(escolhaFeita(null)).toBe(null);
  });

  it("CPF de prestador = recibo", () => {
    expect(escolhaFeita({ ...vazia, prestadorCpf: "11144477735" })).toBe("recibo");
  });

  it("CNPJ = nota", () => {
    expect(escolhaFeita({ ...vazia, cnpj: "12345678000199" })).toBe("nota");
  });

  /* Empresa criada no provedor vale mesmo sem a coluna do CNPJ: ela existe e é cobrada lá. */
  it("empresa criada no emissor = nota", () => {
    expect(escolhaFeita({ ...vazia, empresaId: 4210 })).toBe("nota");
  });

  /* Os dois preenchidos não acontece por caminho normal (o núcleo recusa), mas se acontecer o CPF
   * manda: é ele que escolhe o caminho em `caminhoDaNota`, e divergir daria duas telas em
   * desacordo sobre o mesmo negócio. */
  it("com os dois, o CPF manda — igual ao núcleo", () => {
    expect(escolhaFeita({ prestadorCpf: "11144477735", cnpj: "12345678000199", empresaId: 1 })).toBe("recibo");
  });
});
