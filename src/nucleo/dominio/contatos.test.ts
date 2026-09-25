/* ─────────────────────────────────────────────────────────────────────────────
 * A MAISA NÃO PODE FALAR COM O PAI DO DONO — E NÃO PODE CALAR PARA UM CLIENTE NOVO.
 *
 * As duas metades desta regra falham em direções opostas, e as duas são caras:
 *
 *   • responder um contato pessoal = a MAISA oferecendo horário para a família de quem
 *     comprou o produto. Custa a confiança, e não tem desfazer;
 *   • calar para um número desconhecido = o lead perdido em silêncio.
 *
 * ★ Desde 24/09/2026 o segundo erro é o aceito no número pessoal: fora do caderno, só
 * número novo pedindo horário. Ver o cabeçalho de `contatos.ts`.
 *
 * Nenhum teste de integração pega isso: os dois caminhos devolvem "nada aconteceu" visto de
 * fora. É função pura justamente para poder ser interrogada aqui.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  JANELA_NUMERO_NOVO_MS, MODO_PADRAO, chaveDe, ehModoDoNumero, ehNumeroNovo, motivoDoSilencio, podeResponder,
  type Contato,
} from "./contatos";

const pai: Contato = { chave: "94294906", nome: "Pai", cliente: null };
const clienteSalvo: Contato = { chave: "97654321", nome: "Fernanda", cliente: true };
const naoCliente: Contato = { chave: "91112222", nome: "Dentista", cliente: false };

const base = { numeroNovo: false, querMarcar: false };

describe("quem a MAISA atende", () => {
  describe("no número só do negócio", () => {
    const modo = "negocio" as const;

    /* Aqui não há vida pessoal para proteger, e o caderno serve só para emprestar nome. */
    it("responde todo mundo, inclusive quem está nos contatos", () => {
      expect(podeResponder({ ...base, modo, contato: pai })).toBe(true);
      expect(podeResponder({ ...base, modo, contato: naoCliente })).toBe(true);
      expect(podeResponder({ ...base, modo, contato: null })).toBe(true);
    });
  });

  describe("no número que também é pessoal", () => {
    const modo = "pessoal" as const;

    it("NÃO responde um contato salvo que ninguém marcou como cliente", () => {
      expect(podeResponder({ ...base, modo, contato: pai })).toBe(false);
    });

    it("não responde quem foi marcado como não-cliente — nem se ele pedir horário", () => {
      expect(podeResponder({ modo, contato: naoCliente, numeroNovo: true, querMarcar: true })).toBe(false);
    });

    it("responde contato marcado como cliente", () => {
      expect(podeResponder({ ...base, modo, contato: clienteSalvo })).toBe(true);
    });

    /* ★ 24/09/2026, Psicologia Regina. As três pessoas não estavam no caderno (95% da agenda
     * dela é `@lid`, sem telefone), já conversavam com ela havia meses, e a MAISA respondeu
     * as três. Nenhuma das duas condições valia. */
    it("★ NÃO responde quem está fora do caderno mas já conversava com o dono", () => {
      expect(podeResponder({ modo, contato: null, numeroNovo: false, querMarcar: true })).toBe(false);
      expect(podeResponder({ modo, contato: null, numeroNovo: false, querMarcar: false })).toBe(false);
    });

    it("★ NÃO responde número novo que não está pedindo horário", () => {
      expect(podeResponder({ modo, contato: null, numeroNovo: true, querMarcar: false })).toBe(false);
    });

    it("responde número novo que pede horário — é o lead", () => {
      expect(podeResponder({ modo, contato: null, numeroNovo: true, querMarcar: true })).toBe(true);
    });
  });

  it("o padrão é `pessoal` — o modo que erra para o lado barato", () => {
    expect(MODO_PADRAO).toBe("pessoal");
  });

  it("modo inventado não passa pela porta", () => {
    expect(ehModoDoNumero("negocio")).toBe(true);
    expect(ehModoDoNumero("pessoal")).toBe(true);
    expect(ehModoDoNumero("todos")).toBe(false);
    expect(ehModoDoNumero(undefined)).toBe(false);
    expect(ehModoDoNumero("")).toBe(false);
  });
});

describe("número novo", () => {
  const agora = new Date("2026-09-24T20:00:00Z");
  const vazio = { jaEscreveramParaEle: false, maisAntiga: null };

  it("conversa vazia é número novo", () => {
    expect(ehNumeroNovo({ rastro: vazio, anteriores: [], agora })).toBe(true);
  });

  /* A Bia: 21 mensagens no WhatsApp da Regina, a primeira em 16/07. */
  it("★ histórico antigo no WhatsApp não é número novo", () => {
    const rastro = { jaEscreveramParaEle: false, maisAntiga: "2026-07-16T16:00:00Z" };
    expect(ehNumeroNovo({ rastro, anteriores: [], agora })).toBe(false);
  });

  it("se o dono (ou a MAISA) já escreveu para ele, não é novo", () => {
    expect(ehNumeroNovo({ rastro: { jaEscreveramParaEle: true, maisAntiga: null }, anteriores: [], agora })).toBe(false);
  });

  it("resposta na thread da MAISA também conta", () => {
    expect(ehNumeroNovo({ rastro: vazio, anteriores: [{ de: "bot" }], agora })).toBe(false);
    expect(ehNumeroNovo({ rastro: vazio, anteriores: [{ de: "voce" }], agora })).toBe(false);
  });

  /* O lead manda "oi" e só depois pede. O "oi" não pode transformá-lo em conhecido. */
  it("quem mandou 'oi' há pouco continua novo", () => {
    const rastro = { jaEscreveramParaEle: false, maisAntiga: "2026-09-24T19:55:00Z" };
    expect(ehNumeroNovo({ rastro, anteriores: [{ de: "cliente", em: "2026-09-24T19:55:00Z" }], agora })).toBe(true);
  });

  it("a janela vale para a thread da MAISA também", () => {
    const antes = new Date(agora.getTime() - JANELA_NUMERO_NOVO_MS - 60_000).toISOString();
    expect(ehNumeroNovo({ rastro: vazio, anteriores: [{ de: "cliente", em: antes }], agora })).toBe(false);
  });
});

describe("o motivo do silêncio", () => {
  it("é nulo quando ela pode responder", () => {
    expect(motivoDoSilencio({ modo: "pessoal", contato: null, numeroNovo: true, querMarcar: true })).toBeNull();
    expect(motivoDoSilencio({ ...base, modo: "negocio", contato: pai })).toBeNull();
  });

  it("diz o nome de quem foi calado, quando sabe", () => {
    expect(motivoDoSilencio({ ...base, modo: "pessoal", contato: pai })).toContain("Pai");
  });

  it("sem nome, ainda explica a regra", () => {
    const m = motivoDoSilencio({ ...base, modo: "pessoal", contato: { chave: "1", nome: null, cliente: null } });
    expect(m).toContain("contatos");
  });

  it("separa 'já conversava' de 'não pediu horário'", () => {
    expect(motivoDoSilencio({ ...base, modo: "pessoal", contato: null })).toContain("já conversava");
    expect(motivoDoSilencio({ modo: "pessoal", contato: null, numeroNovo: true, querMarcar: false })).toContain("pedido claro");
  });
});

describe("a chave de casamento", () => {
  /* O mesmo telefone chega de três formas — com e sem DDI, com e sem o nono dígito. Oito
   * dígitos é a normalização que `clientes.telefone_chave` já usa; divergir aqui faria o
   * caderno nunca casar com quem escreve. */
  it("junta as escritas do mesmo número", () => {
    const esperado = "94294906";
    expect(chaveDe("5511994294906")).toBe(esperado);
    expect(chaveDe("11994294906")).toBe(esperado);
    expect(chaveDe("(11) 99429-4906")).toBe(esperado);
    expect(chaveDe("+55 11 99429 4906")).toBe(esperado);
    expect(chaveDe("994294906")).toBe(esperado);
  });

  /* ⚠️ Chave vazia NÃO é chave. Se `""` valesse, duas pessoas sem telefone legível casariam
   * entre si — e no modo pessoal isso calaria a MAISA para um desconhecido, que é justamente
   * o lead. Quem chama trata `""` como "não sei quem é". */
  it("o que não tem 8 dígitos volta vazio, não truncado", () => {
    expect(chaveDe("1234567")).toBe("");
    expect(chaveDe("")).toBe("");
    expect(chaveDe(null)).toBe("");
    expect(chaveDe(undefined)).toBe("");
    expect(chaveDe("sem número nenhum")).toBe("");
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * ★ 24/08/2026 — O CADERNO VAZIO — CONTINUA COBERTO, SEM TRAVA PRÓPRIA.
 *
 * O dono conectou o número pessoal sem importar a agenda e a MAISA respondeu conhecidos. A
 * trava de "caderno vazio cala" existia só porque fora do caderno era "responde". Com a regra
 * de 24/09 (fora do caderno só número novo pedindo horário), caderno vazio ou incompleto
 * deixou de ser perigoso — e o incompleto, que era o caso real da Regina, a trava não pegava.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("★ caderno vazio ou incompleto", () => {
  it("quem já conversava com o dono não é atendido só por estar fora do caderno", () => {
    expect(podeResponder({ modo: "pessoal", contato: null, numeroNovo: false, querMarcar: false })).toBe(false);
    expect(podeResponder({ modo: "pessoal", contato: null, numeroNovo: false, querMarcar: true })).toBe(false);
  });
});
