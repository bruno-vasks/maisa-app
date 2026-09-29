/* ─────────────────────────────────────────────────────────────────────────────
 * O NOME DO NEGÓCIO SAI NA VOZ DA MAISA.
 *
 * Este arquivo existe por causa de 14/08/2026: o primeiro lembrete de verdade chegou no
 * WhatsApp dizendo "…do seu horário hoje às 18:00, no bruno.vaskevicius". O nome viera de
 * SQL escrito à mão três dias antes, e ninguém tinha visto porque NENHUMA TELA ESCREVIA
 * ESSE CAMPO — o único caminho de escrita era `criar_negocio()`, no instante da criação.
 *
 * O que se testa aqui, então, não é "validação de string". É que este campo — que entra
 * no prompt do agente a CADA mensagem e no texto de todo lembrete — tem teto, tem chão, e
 * devolve o que o repositório gravou em vez do que a tela mandou.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it, vi } from "vitest";
import {
  criarAjustarCliente, criarCadastrarCliente, criarAjustarNegocio, criarAjustarProfissional, criarAjustarServico,
} from "./cadastro";
import { FOTO_MAX, NOME_NEGOCIO_MAX } from "../dominio/negocio";
import { DURACAO_MAX, DURACAO_MIN, NOME_SERVICO_MAX, PRECO_MAX } from "../dominio/catalogo";
import { NOME_CLIENTE_MAX } from "../dominio/clientes";
import { DadoInvalido } from "../dominio/erros";
import type { ContextoTenant } from "../dominio/tenant";
import type { Negocio } from "../dominio/negocio";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";

const T: ContextoTenant = { tenantId: "t-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };

const NEGOCIO: Negocio = {
  nome: "Barbearia do Zé",
  plano: "Profissional",
  precoPlano: 149.9,
  proximaCobranca: "05/09/2026",
  cartao: "Cartão final 4417",
  conversasPlano: "Ilimitadas",
};

/** Só o que este caso de uso toca. O resto da porta não participa da decisão. */
function repo(sobre: Partial<RepositorioNegocio> = {}) {
  return {
    renomear: vi.fn(async (_t: ContextoTenant, nome: string) => ({ ...NEGOCIO, nome })),
    trocarFoto: vi.fn(async (_t: ContextoTenant, foto: string | null) => ({ ...NEGOCIO, foto })),
    ...sobre,
  } as unknown as RepositorioNegocio & { renomear: ReturnType<typeof vi.fn>; trocarFoto: ReturnType<typeof vi.fn> };
}

describe("a foto do negócio", () => {
  const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("grava só a foto, sem mexer no nome", async () => {
    const r = repo();
    const negocio = await criarAjustarNegocio({ negocio: r })(T, { foto: FOTO });
    expect(r.trocarFoto).toHaveBeenCalledWith(T, FOTO);
    expect(r.renomear).not.toHaveBeenCalled();
    expect(negocio.foto).toBe(FOTO);
  });

  it("null remove a foto", async () => {
    const r = repo();
    await criarAjustarNegocio({ negocio: r })(T, { foto: null });
    expect(r.trocarFoto).toHaveBeenCalledWith(T, null);
  });

  it("recusa o que não é imagem em base64, e o que passa do teto", async () => {
    const r = repo();
    const ajustar = criarAjustarNegocio({ negocio: r });
    await expect(ajustar(T, { foto: "https://exemplo.com/foto.jpg" })).rejects.toThrow(DadoInvalido);
    await expect(ajustar(T, { foto: "data:image/svg+xml;base64,PHN2Zz4=" })).rejects.toThrow(DadoInvalido);
    await expect(ajustar(T, { foto: "data:image/jpeg;base64," + "A".repeat(FOTO_MAX) })).rejects.toThrow(DadoInvalido);
    expect(r.trocarFoto).not.toHaveBeenCalled();
  });

  it("chamada sem nome nem foto é recusada, não aceita calada", async () => {
    const r = repo();
    await expect(criarAjustarNegocio({ negocio: r })(T, {})).rejects.toThrow(DadoInvalido);
  });
});

describe("renomear o negócio", () => {
  it("grava o nome e devolve o negócio inteiro", async () => {
    const r = repo();
    const negocio = await criarAjustarNegocio({ negocio: r })(T, { nome: "Studio Aurora" });

    expect(r.renomear).toHaveBeenCalledWith(T, "Studio Aurora");
    /* O negócio INTEIRO, e não só o nome: a sidebar do painel pinta plano e cobrança da
     * mesma resposta, e uma segunda ida ao servidor para buscá-los seria um piscar. */
    expect(negocio).toEqual({ ...NEGOCIO, nome: "Studio Aurora" });
  });

  it("colapsa espaço antes de gravar", async () => {
    const r = repo();
    /* Sem isto o agente se apresentaria como "assistente de Barbearia   do  Zé" — o
     * espaço extra é invisível num campo de formulário e não é no meio de uma frase. */
    await criarAjustarNegocio({ negocio: r })(T, { nome: "  Barbearia   do  Zé  " });
    expect(r.renomear).toHaveBeenCalledWith(T, "Barbearia do Zé");
  });

  it("recusa nome vazio com a frase do campo em branco, não a do mínimo", async () => {
    const r = repo();
    const ajustar = criarAjustarNegocio({ negocio: r });

    /* A distinção importa: "precisa de 2 caracteres" manda a pessoa olhar o que digitou,
     * quando o problema é que ela apagou tudo. */
    await expect(ajustar(T, { nome: "   " })).rejects.toThrow(DadoInvalido);
    await expect(ajustar(T, { nome: "" })).rejects.toThrow(/precisa de um nome/i);
    expect(r.renomear).not.toHaveBeenCalled();
  });

  it("recusa nome de um caractere — o mesmo chão do check no banco", async () => {
    const r = repo();
    await expect(criarAjustarNegocio({ negocio: r })(T, { nome: "Z" })).rejects.toThrow(DadoInvalido);
    expect(r.renomear).not.toHaveBeenCalled();
  });

  it("recusa nome longo demais — ele é pago em token a cada mensagem", async () => {
    const r = repo();
    const enorme = "a".repeat(NOME_NEGOCIO_MAX + 1);

    /* O teto não é estética. Este texto entra inteiro no prompt do agente em TODA
     * mensagem daquele inquilino, e um campo de cadastro sem limite é também o lugar
     * óbvio para alguém escrever instrução dentro do nome. */
    await expect(criarAjustarNegocio({ negocio: r })(T, { nome: enorme })).rejects.toThrow(/passa de/i);
    expect(r.renomear).not.toHaveBeenCalled();
  });

  it("aceita exatamente o teto", async () => {
    const r = repo();
    const noLimite = "a".repeat(NOME_NEGOCIO_MAX);
    await criarAjustarNegocio({ negocio: r })(T, { nome: noLimite });
    expect(r.renomear).toHaveBeenCalledWith(T, noLimite);
  });

  it("o erro aponta o campo `nome`, senão a tela não sabe onde pintar", async () => {
    const r = repo();
    /* `respostas.ts` traduz `campo` em `status`, e o store casa esse status string por
     * string. Erro sem campo vira `payload_invalido` genérico e a tela não destaca nada. */
    await expect(criarAjustarNegocio({ negocio: r })(T, { nome: "" })).rejects.toMatchObject({
      campo: "nome",
    });
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * O CATÁLOGO — a escrita que a tela fingia ter.
 *
 * Até 15/08/2026 `criarServico` e `editarServico` (`store.tsx`) mexiam em
 * `svcNovos`/`svcEdit` — estado do NAVEGADOR. O dono ajustava o preço do Corte, via a
 * lista mudar, dava F5, e o preço voltava. Sem rota, sem porta, sem erro.
 *
 * O que se prova aqui é o que essa história ensinou a desconfiar: que o que se grava é o
 * que se pediu, e que o que NÃO pode ser gravado é recusado com uma frase, não com um 500
 * vindo de um `check` do Postgres.
 * ────────────────────────────────────────────────────────────────────────────── */

const SERVICO = {
  id: "sv-1",
  nome: "Corte",
  categoria: "Recorrente" as const,
  preco: 60,
  duracao: 30,
  profissionalIds: ["pr-1"],
  ativo: true,
};

function repoServico(sobre: Partial<RepositorioNegocio> = {}) {
  return {
    salvarServico: vi.fn(async (_t: ContextoTenant, r: Record<string, unknown>) => ({
      ...SERVICO,
      ...r,
    })),
    salvarProfissional: vi.fn(async (_t: ContextoTenant, r: Record<string, unknown>) => ({
      id: "pr-1",
      nome: "Zé",
      papel: "Atendimento geral",
      atendimentosMes: 0,
      avaliacao: 0,
      comissao: 0,
      desde: "ago/2026",
      servicoIds: [],
      ativo: true,
      horario: "Seg–Sáb 09–19",
      folga: "domingo",
      expediente: { folga: [6], de: 9, ate: 19 },
      ...r,
    })),
    ...sobre,
  } as unknown as RepositorioNegocio & Record<string, ReturnType<typeof vi.fn>>;
}

const base = { nome: "Corte", categoria: "Recorrente" as const, preco: 60, duracao: 30 };

describe("ajustar um serviço", () => {
  it("sem id é criar; com id é editar aquela linha", async () => {
    const r = repoServico();
    const ajustar = criarAjustarServico({ negocio: r });

    await ajustar(T, base);
    expect(r.salvarServico).toHaveBeenLastCalledWith(T, expect.not.objectContaining({ id: expect.anything() }));

    await ajustar(T, { ...base, id: "sv-7" });
    expect(r.salvarServico).toHaveBeenLastCalledWith(T, expect.objectContaining({ id: "sv-7" }));
  });

  it("colapsa espaço no nome, senão 'Corte  ' e 'Corte' viram dois serviços", async () => {
    const r = repoServico();
    await criarAjustarServico({ negocio: r })(T, { ...base, nome: "  Corte   Social " });
    expect(r.salvarServico).toHaveBeenCalledWith(T, expect.objectContaining({ nome: "Corte Social" }));
  });

  /* ⚠️ `Number("")` é 0. Sem tratar, um campo de preço APAGADO viraria serviço grátis —
   * gravado, sem erro, e descoberto quando a MAISA anunciar "sai por R$ 0,00". */
  it.each([["", "vazio"], ["   ", "só espaço"], ["abc", "texto"], [null, "nulo"]] as const)(
    "recusa preço %s (%s) em vez de gravar zero",
    async (preco, _rotulo) => {
      const r = repoServico();
      await expect(
        criarAjustarServico({ negocio: r })(T, { ...base, preco: preco as never }),
      ).rejects.toThrow(DadoInvalido);
      expect(r.salvarServico).not.toHaveBeenCalled();
    },
  );

  it("aceita vírgula decimal — é assim que se digita preço no Brasil", async () => {
    const r = repoServico();
    await criarAjustarServico({ negocio: r })(T, { ...base, preco: "59,90" as never });
    expect(r.salvarServico).toHaveBeenCalledWith(T, expect.objectContaining({ preco: 59.9 }));
  });

  it("zero é preço válido — serviço de cortesia existe", async () => {
    const r = repoServico();
    await criarAjustarServico({ negocio: r })(T, { ...base, preco: 0 });
    expect(r.salvarServico).toHaveBeenCalledWith(T, expect.objectContaining({ preco: 0 }));
  });

  it("recusa preço acima do teto de teclado", async () => {
    const r = repoServico();
    /* O teto da coluna é 99.999.999,99 e não protege de nada. Este pega quem digita
     * 20000 querendo R$ 200,00 — centavos colados. */
    await expect(
      criarAjustarServico({ negocio: r })(T, { ...base, preco: PRECO_MAX + 1 }),
    ).rejects.toThrow(/alto demais/i);
  });

  it.each([
    [DURACAO_MIN - 1, "abaixo do mínimo"],
    [DURACAO_MAX + 1, "acima do máximo"],
  ])("recusa duração %i (%s) com frase, não com check_violation", async (duracao) => {
    const r = repoServico();
    await expect(
      criarAjustarServico({ negocio: r })(T, { ...base, duracao }),
    ).rejects.toThrow(DadoInvalido);
    expect(r.salvarServico).not.toHaveBeenCalled();
  });

  /* A coluna é `integer`. Arredondar aqui em silêncio gravaria uma duração que ninguém
   * pediu; mandar `45.5` para um `integer` é erro do Postgres, não arredondamento. */
  it("recusa duração fracionária em vez de arredondar por conta própria", async () => {
    const r = repoServico();
    await expect(
      criarAjustarServico({ negocio: r })(T, { ...base, duracao: 45.5 }),
    ).rejects.toThrow(/minutos inteiros/i);
  });

  it("recusa categoria inventada — o banco só conhece três", async () => {
    const r = repoServico();
    await expect(
      criarAjustarServico({ negocio: r })(T, { ...base, categoria: "Promoção" as never }),
    ).rejects.toMatchObject({ campo: "categoria" });
  });

  it.each([["   ", "em branco"], ["---", "só pontuação"]])(
    "recusa nome %s (%s)",
    async (nome) => {
      const r = repoServico();
      await expect(criarAjustarServico({ negocio: r })(T, { ...base, nome })).rejects.toMatchObject({
        campo: "nome",
      });
    },
  );

  it("recusa nome longo demais", async () => {
    const r = repoServico();
    await expect(
      criarAjustarServico({ negocio: r })(T, { ...base, nome: "a".repeat(NOME_SERVICO_MAX + 1) }),
    ).rejects.toThrow(/passa de/i);
  });

  /* Ausente na criação tem que significar "nasce ativo", e não `undefined` gravado —
   * senão o serviço que o dono acabou de cadastrar não aparece na lista dele. */
  it("não manda `ativo` quando ninguém pediu, para o default do banco valer", async () => {
    const r = repoServico();
    await criarAjustarServico({ negocio: r })(T, base);
    expect(r.salvarServico).toHaveBeenCalledWith(
      T,
      expect.not.objectContaining({ ativo: expect.anything() }),
    );
  });

  it("desativar passa `ativo: false` adiante — é como se aposenta um serviço", async () => {
    const r = repoServico();
    await criarAjustarServico({ negocio: r })(T, { ...base, id: "sv-1", ativo: false });
    expect(r.salvarServico).toHaveBeenCalledWith(T, expect.objectContaining({ ativo: false }));
  });
});

describe("ajustar quem atende", () => {
  it("grava o nome colapsado", async () => {
    const r = repoServico();
    await criarAjustarProfissional({ negocio: r })(T, { nome: "  José   da Silva " });
    expect(r.salvarProfissional).toHaveBeenCalledWith(T, expect.objectContaining({ nome: "José da Silva" }));
  });

  /* ⚠️ O caso real: `criar_negocio()` adivinha o nome do primeiro profissional a partir do
   * e-mail, e um negócio de verdade ficou com um profissional chamado
   * `bruno.vaskevicius` — nome que a MAISA fala ao confirmar "com quem?". */
  it("consegue corrigir o nome que o provisionamento adivinhou", async () => {
    const r = repoServico();
    await criarAjustarProfissional({ negocio: r })(T, { id: "pr-1", nome: "Bruno Vaskevicius" });
    expect(r.salvarProfissional).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ id: "pr-1", nome: "Bruno Vaskevicius" }),
    );
  });

  /* Uma letra é digitação interrompida. É o `check` da coluna
   * (`length(btrim(nome)) between 2 and 120`) dito antes de chegar lá. */
  it("recusa nome de uma letra — profissional é pessoa", async () => {
    const r = repoServico();
    await expect(criarAjustarProfissional({ negocio: r })(T, { nome: "J" })).rejects.toThrow(DadoInvalido);
    expect(r.salvarProfissional).not.toHaveBeenCalled();
  });

  /* Sem isto, um campo que o dono abriu e fechou viraria uma função chamada "" na tela de
   * Equipe — a mesma regra que `provisionar.ts` já aplica ao profissional inicial. */
  it("papel em branco é o mesmo que não ter mandado", async () => {
    const r = repoServico();
    await criarAjustarProfissional({ negocio: r })(T, { nome: "Zé", papel: "   " });
    expect(r.salvarProfissional).toHaveBeenCalledWith(
      T,
      expect.not.objectContaining({ papel: expect.anything() }),
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * O CLIENTE — a escrita que não existia nem fingindo.
 *
 * ★ Bruno, 24/08/2026: *"acabei de perceber que é impossível editar clientes pelo front.
 *   não só na aba clientes mas na faturamento também."*
 *
 * O catálogo, pelo menos, tinha um formulário que mentia. Aqui não havia nem isso: a gaveta
 * do cliente era `stats` puro, e o único controle era um liga/desliga que gravava em
 * `db.cliAtivo` — `localStorage`. Duas consequências que estes testes existem para travar:
 *
 *   • **telefone é identidade.** `telefone_chave` é por onde o agente reconhece quem está
 *     falando no WhatsApp, e a coluna NÃO tem `unique`. Dois clientes com a mesma chave
 *     fazem `clientePorTelefone` devolver qualquer um dos dois, em silêncio — a MAISA passa
 *     a atender uma pessoa pelo histórico da outra. É a única leitura-antes-de-escrever
 *     deste arquivo, e é por isso.
 *   • **CPF é o que libera a nota.** Conferido no DÍGITO, não no tamanho: foi assim que o
 *     primeiro lote do Receita Saúde voltou reprovado do e-CAC, em 21/08/2026.
 * ────────────────────────────────────────────────────────────────────────────── */

const CLIENTE = {
  id: "cl-1",
  nome: "Fernanda Rocha",
  telefone: "(11) 98123-4567",
  email: "fe@exemplo.com",
  cpf: "529.982.247-25",
  canal: "Online" as const,
  ativo: true,
  desde: "ago/2026",
  servicoId: "sv-1",
  atendimentos: 3,
  valor: 180,
};

/**
 * `porTelefone` é quem `clientePorTelefone` acha — e o teste do telefone repetido depende
 * dele para provar que a colisão NÃO impede a escrita.
 *
 * Devolve os mocks crus (sem intersecção com `RepositorioNegocio`, ao contrário do
 * `repoServico` acima): a intersecção resolve `atualizarCliente` para o método da interface,
 * e aí `.mock.calls` — que é como se inspeciona QUAIS campos foram enviados — não existe
 * para o TypeScript. O cast fica no `ajustarCliente` logo abaixo, num lugar só.
 */
function repoCliente(porTelefone: typeof CLIENTE | null = null) {
  return {
    clientePorTelefone: vi.fn(async () => porTelefone),
    atualizarCliente: vi.fn(async (_t: ContextoTenant, r: Record<string, unknown>) => ({
      ...CLIENTE,
      ...r,
    })),
  };
}

const ajustarCliente = (r: ReturnType<typeof repoCliente>) =>
  criarAjustarCliente({ negocio: r as unknown as RepositorioNegocio });

const cliBase = { id: "cl-1", nome: "Fernanda Rocha", telefone: "(11) 98123-4567" };

describe("ajustar um cliente", () => {
  it("grava e devolve a linha como o repositório a deixou", async () => {
    const r = repoCliente();
    const cliente = await ajustarCliente(r)(T, { ...cliBase, cpf: "52998224725" });

    /* O CPF chega em dígitos e é gravado MASCARADO: a grafia livre deixaria o mesmo
     * documento com duas caras na coluna. */
    expect(r.atualizarCliente).toHaveBeenCalledWith(T, {
      id: "cl-1", nome: "Fernanda Rocha", telefone: "(11) 98123-4567", cpf: "529.982.247-25",
    });
    expect(cliente.atendimentos).toBe(3);
  });

  it("recusa corpo sem id — este caso de uso não cria cliente", async () => {
    const r = repoCliente();
    /* Criar é `garantirCliente`, que deduplica por telefone. Interpretar id ausente como
     * "cadastre um novo" daria dois caminhos de criação e o mesmo cliente duas vezes. */
    await expect(ajustarCliente(r)(T, { ...cliBase, id: "  " }))
      .rejects.toMatchObject({ campo: "id" });
    expect(r.atualizarCliente).not.toHaveBeenCalled();
  });

  it("NÃO recusa telefone repetido — a família compartilha número, e isso é decisão do repositório", async () => {
    const r = repoCliente({ ...CLIENTE, id: "cl-9", nome: "Marina Alves" });
    /* ⚠️ ESTE TESTE TRAVA UMA VERSÃO ANTERIOR DESTE CÓDIGO, que recusava. A recusa parecia
     * certa e contradizia uma decisão mais velha, escrita no adaptador: a coluna não tem
     * `unique` "de propósito: número repetido acontece em família", e `clientePorTelefone`
     * desempata pelo cadastro mais antigo. Bloquear aqui tornaria impossível editar — nem
     * o nome, nem o liga/desliga — qualquer cliente que divida o número com um parente.
     * Quem avisa da colisão é a gaveta, que vê o cadastro inteiro e não impede nada. */
    await ajustarCliente(r)(T, cliBase);
    expect(r.atualizarCliente).toHaveBeenCalled();
  });

  it("recusa telefone com menos de 8 dígitos, contando DÍGITO e não caractere", async () => {
    const r = repoCliente();
    /* `"(11) 9"` tem seis caracteres de sobra e passaria no `check` do banco, que mede
     * texto. Seis dígitos viram uma `telefone_chave` de seis, que não casa com ninguém. */
    await expect(ajustarCliente(r)(T, { ...cliBase, telefone: "(11) 9" }))
      .rejects.toMatchObject({ campo: "telefone" });
    expect(r.atualizarCliente).not.toHaveBeenCalled();
  });

  it("recusa CPF que não fecha no dígito verificador", async () => {
    const r = repoCliente();
    /* 111.222.333-44 tem onze dígitos e não fecha no módulo 11. Foi exatamente este tipo
     * de CPF que o "Analisar Arquivo" do e-CAC reprovou em 21/08/2026. */
    await expect(ajustarCliente(r)(T, { ...cliBase, cpf: "111.222.333-44" }))
      .rejects.toMatchObject({ campo: "cpf" });
    expect(r.atualizarCliente).not.toHaveBeenCalled();
  });

  it("CPF vazio é apagar, não erro — cliente sem CPF existe", async () => {
    const r = repoCliente();
    await ajustarCliente(r)(T, { ...cliBase, cpf: "" });
    expect(r.atualizarCliente).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cpf: null }));
  });

  it("campo ausente é 'não mexe' — é o que deixa desativar cliente com CPF semeado inválido", async () => {
    const r = repoCliente();
    /* ⚠️ NÃO É DETALHE DE ESTILO. 15 dos 17 clientes de `008_seed_bruno.sql` têm CPF
     * inventado que não fecha no módulo 11. Se um pedido carregasse sempre o cliente
     * inteiro, ligar/desligar qualquer um deles bateria na recusa do CPF — e a frase falaria
     * de dígito verificador para quem só queria tirar alguém do faturamento. */
    await ajustarCliente(r)(T, { ...cliBase, cpf: "52998224725" });
    const [, rascunho] = r.atualizarCliente.mock.calls[0];
    expect("email" in rascunho).toBe(false);
    expect("canal" in rascunho).toBe(false);
    expect("servicoId" in rascunho).toBe(false);
    expect("ativo" in rascunho).toBe(false);
  });

  it("e-mail vazio vira null; e-mail sem domínio é recusado", async () => {
    const r = repoCliente();
    const ajustar = ajustarCliente(r);

    await ajustar(T, { ...cliBase, email: "   " });
    expect(r.atualizarCliente).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: null }));

    await expect(ajustar(T, { ...cliBase, email: "bruno@" })).rejects.toMatchObject({ campo: "email" });
  });

  it("colapsa espaço no nome e recusa nome em branco", async () => {
    const r = repoCliente();
    const ajustar = ajustarCliente(r);

    await ajustar(T, { ...cliBase, nome: "  Fernanda   Rocha " });
    expect(r.atualizarCliente).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nome: "Fernanda Rocha" }),
    );

    await expect(ajustar(T, { ...cliBase, nome: "   " })).rejects.toMatchObject({ campo: "nome" });
  });

  it("recusa nome longo demais — é o teto do check da coluna", async () => {
    const r = repoCliente();
    await expect(ajustarCliente(r)(T, { ...cliBase, nome: "a".repeat(NOME_CLIENTE_MAX + 1) }))
      .rejects.toThrow(DadoInvalido);
    expect(r.atualizarCliente).not.toHaveBeenCalled();
  });

  it("recusa canal inventado — o check da coluna só conhece dois", async () => {
    const r = repoCliente();
    await expect(ajustarCliente(r)(T, { ...cliBase, canal: "Telepatia" as never }))
      .rejects.toMatchObject({ campo: "canal" });
    expect(r.atualizarCliente).not.toHaveBeenCalled();
  });

  it("serviço vazio vira null — a FK é `set null`, então sem serviço habitual é estado válido", async () => {
    const r = repoCliente();
    await ajustarCliente(r)(T, { ...cliBase, servicoId: "" });
    expect(r.atualizarCliente).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ servicoId: null }));
  });

  it("desativar passa `ativo: false` adiante — é como alguém sai do faturamento", async () => {
    const r = repoCliente();
    /* O liga/desliga da gaveta. Antes ele gravava em `db.cliAtivo`: o dono desativava,
     * dava F5, e a pessoa voltava para o fechamento do mês. */
    await ajustarCliente(r)(T, { ...cliBase, ativo: false });
    expect(r.atualizarCliente).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ativo: false }));
  });

  it("desativar não conta como mexer no CPF, mesmo com CPF inválido no cadastro", async () => {
    const r = repoCliente();
    /* O caminho exato do liga/desliga na tela de Clientes, para o cadastro semeado. O
     * pedido não carrega `cpf`, então o bloco do dígito verificador nem roda. */
    await ajustarCliente(r)(T, { ...cliBase, ativo: false });
    const [, rascunho] = r.atualizarCliente.mock.calls[0];
    expect("cpf" in rascunho).toBe(false);
  });
});

describe("cadastrar um cliente pela tela", () => {
  const repo = (porTelefone: typeof CLIENTE | null) => ({
    clientePorTelefone: vi.fn(async () => porTelefone),
    criarCliente: vi.fn(async () => CLIENTE),
  });
  const cadastrar = (r: ReturnType<typeof repo>) =>
    criarCadastrarCliente({ negocio: r as unknown as RepositorioNegocio });

  it("só o nome é obrigatório — o recibo da Rebots pede CPF, não telefone", async () => {
    const r = repo(null);
    const out = await cadastrar(r)(T, { nome: "  Fernanda   Rocha " });
    expect(r.criarCliente).toHaveBeenCalledWith(T, { nome: "Fernanda Rocha", telefone: "", cpf: null });
    /* Sem telefone não há chave de deduplicação para consultar. */
    expect(r.clientePorTelefone).not.toHaveBeenCalled();
    expect(out).toEqual({ cliente: CLIENTE, jaExistia: false });
  });

  it("CPF vai mascarado, e CPF que não fecha no dígito é recusado", async () => {
    const r = repo(null);
    await cadastrar(r)(T, { nome: "Fernanda", cpf: "52998224725" });
    expect(r.criarCliente).toHaveBeenCalledWith(T, { nome: "Fernanda", telefone: "", cpf: "529.982.247-25" });
    await expect(cadastrar(r)(T, { nome: "Fernanda", cpf: "12345678900" })).rejects.toMatchObject({ campo: "cpf" });
  });

  it("telefone que já é de alguém devolve esse alguém, sem criar outro", async () => {
    const r = repo(CLIENTE);
    const out = await cadastrar(r)(T, { nome: "Outra Pessoa", telefone: "11 98123-4567" });
    expect(out.jaExistia).toBe(true);
    expect(r.criarCliente).not.toHaveBeenCalled();
  });

  it("recusa nome vazio e telefone pela metade antes de tocar o banco", async () => {
    const r = repo(null);
    await expect(cadastrar(r)(T, { nome: "  " })).rejects.toMatchObject({ campo: "nome" });
    await expect(cadastrar(r)(T, { nome: "Fernanda", telefone: "123" })).rejects.toMatchObject({ campo: "telefone" });
    expect(r.criarCliente).not.toHaveBeenCalled();
  });
});

describe("editar cliente sem telefone", () => {
  it("aceita telefone vazio — cliente cadastrado só com nome e CPF segue editável", async () => {
    const r = repoCliente();
    await ajustarCliente(r)(T, { ...cliBase, telefone: "" });
    expect(r.atualizarCliente).toHaveBeenCalledWith(T, expect.objectContaining({ telefone: "" }));
  });
});

describe("o valor da sessão na ficha", () => {
  it("grava número, e null volta a valer o do serviço", async () => {
    const r = repoCliente();
    await ajustarCliente(r)(T, { ...cliBase, valorSessao: 150 });
    expect(r.atualizarCliente).toHaveBeenLastCalledWith(T, expect.objectContaining({ valorSessao: 150 }));
    await ajustarCliente(r)(T, { ...cliBase, valorSessao: null });
    expect(r.atualizarCliente).toHaveBeenLastCalledWith(T, expect.objectContaining({ valorSessao: null }));
  });

  it("recusa negativo", async () => {
    await expect(ajustarCliente(repoCliente())(T, { ...cliBase, valorSessao: -5 }))
      .rejects.toMatchObject({ campo: "valorSessao" });
  });
});
