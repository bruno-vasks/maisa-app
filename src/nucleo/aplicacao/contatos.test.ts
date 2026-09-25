/* ─────────────────────────────────────────────────────────────────────────────
 * A COSTURA DO CADERNO — e, desde 24/09/2026, uma decisão que FALHA FECHADA.
 *
 * A regra de quem a MAISA atende é pura e está testada em `dominio/contatos.test.ts`. O que
 * se prova aqui é o comportamento quando os DADOS dela não chegam, e a ordem em que eles são
 * pedidos (banco → WhatsApp → modelo), que é custo.
 *
 * Até 24/09 isto falhava aberto, para uma migração pendente não emudecer o produto. Caiu
 * quando a MAISA respondeu três pessoas da vida pessoal de uma cliente: no número pessoal,
 * falar por engano é o erro caro.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it, vi } from "vitest";
import {
  criarAvaliarAtendimento, criarDefinirModoDoNumero, criarImportarContatos, criarMarcarContato,
  criarMarcarContatos,
} from "./contatos";
import type { RepositorioContatos } from "../portas/saida/repositorio-contatos";
import type { ContatosDoCanal } from "../portas/saida/contatos-do-canal";
import type { ContextoTenant } from "../dominio/tenant";
import type { ModoDoNumero } from "../dominio/contatos";
import type { HistoricoDoCanal } from "../portas/saida/historico-do-canal";
import type { PedidoDeAtendimento } from "../portas/entrada/casos-de-uso";
import { DadoInvalido } from "../dominio/erros";

const t: ContextoTenant = { tenantId: "n1", usuarioId: "u1", ator: { tipo: "usuario", id: "u1" } };

function repo(over: Partial<RepositorioContatos> = {}): RepositorioContatos {
  return {
    ler: async () => null,
    /* Padrão `false` = caderno com gente. O vazio é a exceção, e quem testa a trava diz. */
    estaVazio: async () => false,
    listar: async () => [],
    salvarLote: async (_t, c) => ({ novos: c.length, total: c.length }),
    marcar: async () => {},
    marcarVarios: async (_t, p) => p.chaves.length,
    modo: async () => "pessoal" as ModoDoNumero,
    definirModo: async () => {},
    ...over,
  };
}

const provedor = (over: Partial<ContatosDoCanal> = {}): ContatosDoCanal => ({
  faltando: () => [],
  listar: async () => [],
  ...over,
});

const pedido = (texto = "oi", over: Partial<PedidoDeAtendimento> = {}): PedidoDeAtendimento => ({
  telefone: "5511994294906", anteriores: [], texto, ...over,
});
const semRastro: HistoricoDoCanal = { rastro: async () => ({ jaEscreveramParaEle: false, maisAntiga: null }) };
const nuncaChamar = async () => { throw new Error("não deveria perguntar"); };

function avaliador(over: {
  contatos?: Partial<RepositorioContatos>;
  canal?: HistoricoDoCanal;
  pedeHorario?: (m: readonly string[]) => Promise<boolean>;
} = {}) {
  return criarAvaliarAtendimento({
    contatos: repo(over.contatos),
    canal: over.canal ?? semRastro,
    pedeHorario: over.pedeHorario ?? (async () => false),
    agora: () => new Date("2026-09-24T20:00:00Z"),
  });
}

describe("avaliar se a MAISA atende", () => {
  /* ★ Desde 24/09/2026 falha FECHADA. A aposta antiga (falar por engano é raro e barato)
   * caiu com 30 mensagens para três pessoas da vida pessoal de uma terapeuta. */
  it("★ FALHA FECHADA quando o banco não responde", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const avaliar = avaliador({
      contatos: {
        ler: async () => { throw new Error('relation "public.contatos" does not exist'); },
        modo: async () => { throw new Error('column "modo" does not exist'); },
      },
    });

    const r = await avaliar(t, pedido());
    expect(r.pode).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it("★ FALHA FECHADA quando a Evolution não responde", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const avaliar = avaliador({
      canal: { rastro: async () => { throw new Error("timeout"); } },
      pedeHorario: async () => true,
    });
    expect((await avaliar(t, pedido("quero marcar"))).pode).toBe(false);
    erro.mockRestore();
  });

  it("modo nulo cai no padrão, que protege a vida pessoal", async () => {
    const avaliar = avaliador({
      contatos: { modo: async () => null, ler: async () => ({ chave: "94294906", nome: "Pai", cliente: null }) },
    });
    const r = await avaliar(t, pedido());
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("Pai");
  });

  it("devolve o nome do caderno junto com o sim", async () => {
    const avaliar = avaliador({
      contatos: { modo: async () => "negocio", ler: async () => ({ chave: "94294906", nome: "Fernanda", cliente: null }) },
    });
    await expect(avaliar(t, pedido())).resolves.toEqual({ pode: true, motivo: null, nome: "Fernanda" });
  });

  /* A ordem é custo: negócio e caderno decidem sem ir à Evolution nem ao modelo. */
  it("no caderno, não consulta WhatsApp nem modelo", async () => {
    const avaliar = avaliador({
      contatos: { ler: async () => ({ chave: "94294906", nome: "Fernanda", cliente: true }) },
      canal: { rastro: nuncaChamar },
      pedeHorario: nuncaChamar,
    });
    expect((await avaliar(t, pedido())).pode).toBe(true);
  });

  it("com histórico antigo, cala sem perguntar ao modelo", async () => {
    const avaliar = avaliador({
      canal: { rastro: async () => ({ jaEscreveramParaEle: false, maisAntiga: "2026-07-16T16:00:00Z" }) },
      pedeHorario: nuncaChamar,
    });
    const r = await avaliar(t, pedido("quero marcar uma sessão"));
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("já conversava");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O CASO DA REGINA, 24/09/2026, REPRODUZIDO.
 *
 * Caderno com 39 contatos, todos "não atender". Quem escreveu não estava entre eles.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("★ número pessoal, fora do caderno", () => {
  it("amiga que já conversava com a dona: cala", async () => {
    const avaliar = avaliador({
      canal: { rastro: async () => ({ jaEscreveramParaEle: true, maisAntiga: null }) },
      pedeHorario: nuncaChamar,
    });
    expect((await avaliar(t, pedido("Amiga do Kibe 🥰"))).pode).toBe(false);
  });

  it("número novo que só cumprimenta: cala", async () => {
    const avaliar = avaliador({ pedeHorario: async () => false });
    const r = await avaliar(t, pedido("oi, tudo bem?"));
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("pedido claro");
  });

  it("número novo pedindo horário: atende e vira cliente no caderno", async () => {
    const marcar = vi.fn(async () => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    let vistas: readonly string[] = [];
    const avaliar = avaliador({
      contatos: { marcar },
      pedeHorario: async (m) => { vistas = m; return true; },
    });

    const r = await avaliar(t, pedido("queria marcar uma sessão", {
      anteriores: [{ de: "cliente", txt: "oi", em: "2026-09-24T19:58:00Z" }],
    }));

    expect(r.pode).toBe(true);
    /* O classificador vê a conversa de chegada inteira, não só a última fala. */
    expect(vistas).toEqual(["oi", "queria marcar uma sessão"]);
    /* Sem isto, a segunda mensagem dela já não seria de número novo e a MAISA emudeceria
     * no meio da marcação. */
    expect(marcar).toHaveBeenCalledWith(t, expect.objectContaining({ chave: "94294906", cliente: true }));
    info.mockRestore();
  });

  it("sem telefone legível, cala", async () => {
    const avaliar = avaliador({ pedeHorario: async () => true });
    expect((await avaliar(t, pedido("quero marcar", { telefone: "123" }))).pode).toBe(false);
  });
});

describe("importar contatos", () => {
  /* ⚠️ Sem isto, um upsert em lote com chave repetida estoura no Postgres com
   * "ON CONFLICT DO UPDATE command cannot affect row a second time" — e a importação inteira
   * falha por causa de um número salvo duas vezes na agenda, o que é banal. */
  it("deduplica o mesmo número escrito de formas diferentes", async () => {
    let gravados: readonly { chave: string; nome: string | null }[] = [];
    const importar = criarImportarContatos({
      contatos: repo({ salvarLote: async (_t, c) => { gravados = c; return { novos: c.length, total: c.length }; } }),
      provedor: provedor({
        listar: async () => [
          { telefone: "5511994294906", nome: null },
          { telefone: "11994294906", nome: "Pai" },
          { telefone: "(11) 99429-4906", nome: null },
        ],
      }),
    });

    const r = await importar(t);
    expect(gravados).toHaveLength(1);
    /* Prefere quem TEM nome: entre duas linhas do mesmo número, a útil é a que ela pode usar
     * para cumprimentar. */
    expect(gravados[0].nome).toBe("Pai");
    /* `lidos` é 3 e `total` é 1 — a diferença é o que a tela mostra para ninguém sair
     * procurando os contatos que "não importaram". */
    expect(r.lidos).toBe(3);
    expect(r.total).toBe(1);
  });

  it("descarta o que não tem telefone utilizável", async () => {
    let gravados: readonly unknown[] = [];
    const importar = criarImportarContatos({
      contatos: repo({ salvarLote: async (_t, c) => { gravados = c; return { novos: 0, total: 0 }; } }),
      provedor: provedor({ listar: async () => [{ telefone: "123", nome: "Curto" }, { telefone: "", nome: "Vazio" }] }),
    });
    await importar(t);
    expect(gravados).toEqual([]);
  });

  it("recusa com frase quando o provedor não está configurado", async () => {
    const importar = criarImportarContatos({
      contatos: repo(),
      provedor: provedor({ faltando: () => ["EVOLUTION_API_URL"] }),
    });
    await expect(importar(t)).rejects.toBeInstanceOf(DadoInvalido);
    await expect(importar(t)).rejects.toThrow(/EVOLUTION_API_URL/);
  });

  it("agenda vazia não é erro", async () => {
    const importar = criarImportarContatos({ contatos: repo(), provedor: provedor({ listar: async () => [] }) });
    await expect(importar(t)).resolves.toEqual({ novos: 0, total: 0, lidos: 0 });
  });
});

describe("marcar e trocar o modo", () => {
  it("telefone inválido é recusado no núcleo, não no banco", async () => {
    const marcar = criarMarcarContato({ contatos: repo() });
    await expect(marcar(t, { telefone: "abc", cliente: true })).rejects.toBeInstanceOf(DadoInvalido);
  });

  /* O ternário atravessa a camada inteira: `null` é "nunca disse" e `false` é "disse que
   * não". Colapsar em boolean apagaria a distinção que a coluna existe para guardar. */
  it("preserva `null` como terceiro estado", async () => {
    const vistos: (boolean | null)[] = [];
    const marcar = criarMarcarContato({ contatos: repo({ marcar: async (_t, p) => { vistos.push(p.cliente); } }) });
    await marcar(t, { telefone: "5511994294906", cliente: null });
    await marcar(t, { telefone: "5511994294906", cliente: false });
    await marcar(t, { telefone: "5511994294906", cliente: true });
    expect(vistos).toEqual([null, false, true]);
  });

  it("modo inventado vira DadoInvalido, não 500", async () => {
    const definir = criarDefinirModoDoNumero({ contatos: repo() });
    await expect(definir(t, "todos" as ModoDoNumero)).rejects.toBeInstanceOf(DadoInvalido);
  });

  it("os dois modos válidos passam", async () => {
    const vistos: ModoDoNumero[] = [];
    const definir = criarDefinirModoDoNumero({ contatos: repo({ definirModo: async (_t, m) => { vistos.push(m); } }) });
    await definir(t, "negocio");
    await definir(t, "pessoal");
    expect(vistos).toEqual(["negocio", "pessoal"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * MARCAR EM LOTE — a ação mais perigosa desta tela, e por isso a mais guardada.
 *
 * Ela muda o comportamento da MAISA com centenas de pessoas de uma vez. No modo pessoal
 * isso é mil telefones da agenda do dono passando a receber resposta automática de uma
 * barbearia — ou, no sentido contrário, o silêncio caindo sobre clientes de verdade.
 * ────────────────────────────────────────────────────────────────────────────── */
describe("marcarContatos", () => {
  it("normaliza as chaves antes de mandar ao repositório", async () => {
    let recebidas: string[] = [];
    const marcar = criarMarcarContatos({
      contatos: repo({ marcarVarios: async (_t, p) => { recebidas = p.chaves; return p.chaves.length; } }),
    });

    await marcar(t, { chaves: ["+55 (11) 99429-4906", "1194294906"], cliente: true });

    /* Os dois viram os 8 últimos dígitos — que é a chave real. Sem normalizar, o `.in()`
     * do banco não casaria linha nenhuma e a tela diria "0 marcados" sem explicar. */
    expect(recebidas).toEqual(["94294906"]);
  });

  /* Repetido inflaria `pedidos` e faria a comparação com `mudados` acusar uma recusa que
   * não houve — e a tela avisaria "parte não foi salva" sobre uma escrita perfeita. */
  it("não conta a mesma pessoa duas vezes", async () => {
    const marcar = criarMarcarContatos({ contatos: repo() });

    const r = await marcar(t, { chaves: ["11994294906", "994294906", "94294906"], cliente: false });

    expect(r.pedidos).toBe(1);
  });

  /* "0 marcados" depois de um clique parece botão quebrado, e o dono clica de novo. */
  it("lista vazia é erro, não sucesso silencioso", async () => {
    const marcar = criarMarcarContatos({ contatos: repo() });

    await expect(marcar(t, { chaves: [], cliente: true })).rejects.toBeInstanceOf(DadoInvalido);
  });

  it("lista só de lixo também é erro", async () => {
    const marcar = criarMarcarContatos({ contatos: repo() });

    await expect(marcar(t, { chaves: ["abc", "12", ""], cliente: null })).rejects.toBeInstanceOf(DadoInvalido);
  });

  /* RLS recusa em SILÊNCIO: sem erro e sem linha. Devolver os dois números é o que permite
   * à tela dizer a verdade quando a escrita não pegou. */
  it("devolve pedidos e mudados separados, para a tela poder desconfiar", async () => {
    const marcar = criarMarcarContatos({ contatos: repo({ marcarVarios: async () => 1 }) });

    const r = await marcar(t, { chaves: ["11994294906", "11988887777"], cliente: true });

    expect(r).toEqual({ pedidos: 2, mudados: 1 });
  });

  it("desmarcar em lote é `cliente: null`, e chega assim no repositório", async () => {
    let recebido: boolean | null | undefined;
    const marcar = criarMarcarContatos({
      contatos: repo({ marcarVarios: async (_t, p) => { recebido = p.cliente; return 1; } }),
    });

    await marcar(t, { chaves: ["11994294906"], cliente: null });

    expect(recebido).toBeNull();
  });
});
