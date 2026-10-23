/* ─────────────────────────────────────────────────────────────────────────────
 * O AVISO DE CADASTRO NOVO — o que estes testes prendem.
 *
 *   · o texto: assunto filtrável, os campos que o Bruno pediu, a campanha quando há e a frase
 *     honesta quando não há, a hora em São Paulo, e nada de segredo;
 *   · o funil: a MESMA regra do `npm run leads` (sem `funil` mas com `plano` = Pix antigo);
 *   · o destinatário: o Bruno quando `AVISO_CADASTRO_PARA` não existe, a lista quando existe;
 *   · a idempotência: conta já avisada não recebe segundo e-mail, e um envio que falhou inteiro
 *     desfaz a marca para poder ser tentado de novo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { beforeEach, describe, expect, it } from "vitest";
import {
  DESTINATARIO_PADRAO_DO_AVISO,
  destinatariosDoAviso,
  funilDoCadastro,
  textoDoAvisoDeCadastro,
  type ContaNova,
} from "@/nucleo/dominio/aviso-de-cadastro";
import { DadoInvalido, FalhaDoProvedor } from "@/nucleo/dominio/erros";
import type { ContasNovas } from "@/nucleo/portas/saida/contas-novas";
import type { Correio, Mensagem } from "@/nucleo/portas/saida/correio";
import { criarAvisarNovoCadastro } from "./aviso-de-cadastro";

const ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const AGORA = new Date("2026-10-22T23:15:00Z");

const conta = (over: Partial<ContaNova> = {}): ContaNova => ({
  id: ID,
  email: "maria@exemplo.com",
  /* 23:15 UTC = 20:15 em São Paulo. */
  criadaEm: "2026-10-22T23:15:00Z",
  emailConfirmado: false,
  provedor: "email",
  negocio: "Clínica Bem Estar",
  nome: null,
  telefone: "11987654321",
  plano: "essencial",
  funil: "teste",
  vertical: "terapeutas",
  campanha: {},
  avisadaEm: null,
  ...over,
});

describe("o texto do aviso", () => {
  it("assunto filtrável, com o negócio e o funil", () => {
    const { assunto } = textoDoAvisoDeCadastro(conta());
    expect(assunto).toBe("[MAISA] Novo cadastro: Clínica Bem Estar · teste grátis");
  });

  it("sem negócio, o assunto cai no e-mail", () => {
    const { assunto } = textoDoAvisoDeCadastro(conta({ negocio: null, plano: null, funil: null }));
    expect(assunto).toBe("[MAISA] Novo cadastro: maria@exemplo.com · cadastro direto");
  });

  it("traz os campos pedidos, com a hora de São Paulo e o estado da confirmação", () => {
    const { texto } = textoDoAvisoDeCadastro(conta());
    expect(texto).toContain("Quando: 22/10/2026 às 20:15 (horário de Brasília)");
    expect(texto).toContain("Funil: teste grátis");
    expect(texto).toContain("E-mail: maria@exemplo.com (ainda não confirmado)");
    expect(texto).toContain("Negócio: Clínica Bem Estar");
    expect(texto).toContain("WhatsApp: (11) 98765-4321");
    expect(texto).toContain("Plano: Essencial");
    expect(texto).toContain("Vertical: terapeutas");
    expect(texto).toContain("npm run leads");
    expect(texto).toContain(`Conta: ${ID}`);
  });

  it("com campanha, lista cada parâmetro na ordem da página", () => {
    const { texto } = textoDoAvisoDeCadastro(conta({
      campanha: { gclid: "Cj0KCQ", utm_source: "google", utm_campaign: "terapeutas-sp", utm_medium: "cpc" },
    }));
    const bloco = texto.slice(texto.indexOf("Campanha:"));
    expect(bloco.startsWith("Campanha:\n  utm_source: google\n  utm_medium: cpc\n  utm_campaign: terapeutas-sp\n  gclid: Cj0KCQ")).toBe(true);
  });

  it("sem campanha, diz que não houve — em vez de uma seção vazia", () => {
    const { texto } = textoDoAvisoDeCadastro(conta());
    expect(texto).toContain("Campanha: nenhuma (sem utm, gclid nem fbclid no link)");
  });

  it("o que falta aparece como travessão, e e-mail confirmado é dito", () => {
    const { texto } = textoDoAvisoDeCadastro(conta({
      telefone: null, plano: null, vertical: null, negocio: null, funil: null, emailConfirmado: true,
    }));
    expect(texto).toContain("WhatsApp: —");
    expect(texto).toContain("Plano: —");
    expect(texto).toContain("Negócio: —");
    expect(texto).toContain("(confirmado)");
    /* Conta de fora do funil: o `leads` não a mostra, e o texto não pode prometer que mostra. */
    expect(texto).toContain("não lista esta conta");
  });

  it("dado digitado pela pessoa não quebra linha nem forja campo", () => {
    const { assunto, texto } = textoDoAvisoDeCadastro(conta({
      negocio: "Barbearia\nPlano: Escala · pagou",
      campanha: { utm_source: "x\r\nFunil: Pix" },
    }));
    expect(assunto).not.toContain("\n");
    expect(texto).not.toMatch(/^Plano: Escala/m);
    expect(texto).not.toMatch(/^Funil: Pix/m);
  });

  it("login pelo Google sem /assinar é 'cadastro direto (Google)', com o nome da pessoa", () => {
    const { assunto, texto } = textoDoAvisoDeCadastro(conta({
      provedor: "google", funil: null, plano: null, negocio: null, nome: "Maria Souza",
    }));
    expect(assunto).toContain("· cadastro direto (Google)");
    expect(texto).toContain("Nome: Maria Souza");
  });
});

describe("o funil", () => {
  it("segue a regra do npm run leads", () => {
    expect(funilDoCadastro({ funil: "teste", plano: "escala" })).toBe("teste");
    expect(funilDoCadastro({ funil: "pix", plano: "escala" })).toBe("pix");
    /* Lead de antes de 22/10/2026: só existia o funil com Pix. */
    expect(funilDoCadastro({ funil: null, plano: "essencial" })).toBe("pix");
    expect(funilDoCadastro({ funil: null, plano: null })).toBe("cadastro");
  });
});

describe("para quem vai", () => {
  it("sem a variável, vai para o Bruno — exatamente este endereço", () => {
    expect(DESTINATARIO_PADRAO_DO_AVISO).toBe("bruno.vaskevicius@polijunior.com.br");
    expect(destinatariosDoAviso(undefined)).toEqual(["bruno.vaskevicius@polijunior.com.br"]);
    expect(destinatariosDoAviso("")).toEqual(["bruno.vaskevicius@polijunior.com.br"]);
  });

  it("com a variável, vale a lista dela (vírgula, aspas e repetição tratadas)", () => {
    expect(destinatariosDoAviso("ana@maisa.com")).toEqual(["ana@maisa.com"]);
    expect(destinatariosDoAviso(' "ana@maisa.com", bia@maisa.com ;ANA@maisa.com ')).toEqual([
      "ana@maisa.com", "bia@maisa.com",
    ]);
  });

  it("variável toda torta não cala o aviso: volta para o Bruno", () => {
    expect(destinatariosDoAviso("bruno-sem-arroba, ,")).toEqual([DESTINATARIO_PADRAO_DO_AVISO]);
  });
});

/* ── o caso de uso, com dublês ── */

let contas: Map<string, ContaNova>;
let enviados: Mensagem[];
let recusar: Set<string>;
let marcas: string[];

const contasFake: ContasNovas = {
  faltando: () => [],
  async ler(id) { return contas.get(id) ?? null; },
  async marcarAvisada(id, quando) {
    marcas.push(`marcar:${quando}`);
    const c = contas.get(id);
    if (c) contas.set(id, { ...c, avisadaEm: quando });
  },
  async desmarcarAvisada(id) {
    marcas.push("desmarcar");
    const c = contas.get(id);
    if (c) contas.set(id, { ...c, avisadaEm: null });
  },
};

const correioFake: Correio = {
  faltando: () => [],
  async enviar(m) {
    if (recusar.has(m.para)) throw new Error(`Resend: HTTP 403 para ${m.para}`);
    enviados.push(m);
  },
};

const avisar = (destinatarios: readonly string[] = destinatariosDoAviso(undefined)) =>
  criarAvisarNovoCadastro({ contas: contasFake, correio: correioFake, destinatarios });

beforeEach(() => {
  contas = new Map([[ID, conta()]]);
  enviados = [];
  recusar = new Set();
  marcas = [];
});

describe("AvisarNovoCadastro", () => {
  it("manda ao Bruno e marca a conta", async () => {
    const r = await avisar()(ID, AGORA);
    expect(r).toEqual({ status: "enviado", enviados: 1, falhas: [] });
    expect(enviados.map((m) => m.para)).toEqual(["bruno.vaskevicius@polijunior.com.br"]);
    expect(enviados[0].assunto).toContain("[MAISA] Novo cadastro:");
    expect(contas.get(ID)?.avisadaEm).toBe(AGORA.toISOString());
  });

  it("com a lista da configuração, manda a cada um", async () => {
    const r = await avisar(destinatariosDoAviso("ana@maisa.com,bia@maisa.com"))(ID, AGORA);
    expect(r.enviados).toBe(2);
    expect(enviados.map((m) => m.para)).toEqual(["ana@maisa.com", "bia@maisa.com"]);
  });

  it("★ a segunda chamada para a mesma conta não manda outro e-mail", async () => {
    const caso = avisar();
    await caso(ID, AGORA);
    const r = await caso(ID, new Date("2026-10-22T23:16:00Z"));
    expect(r).toEqual({ status: "ja_avisado", enviados: 0, falhas: [] });
    expect(enviados).toHaveLength(1);
  });

  it("marca ANTES de mandar", async () => {
    let marcadaQuandoEnviou: string | null = null;
    const correio: Correio = {
      faltando: () => [],
      async enviar() { marcadaQuandoEnviou = contas.get(ID)?.avisadaEm ?? null; },
    };
    await criarAvisarNovoCadastro({ contas: contasFake, correio, destinatarios: ["a@b.com"] })(ID, AGORA);
    expect(marcadaQuandoEnviou).toBe(AGORA.toISOString());
  });

  it("nenhum e-mail saiu: desfaz a marca e lança, para poder disparar de novo", async () => {
    recusar.add(DESTINATARIO_PADRAO_DO_AVISO);
    await expect(avisar()(ID, AGORA)).rejects.toBeInstanceOf(FalhaDoProvedor);
    expect(marcas).toEqual([`marcar:${AGORA.toISOString()}`, "desmarcar"]);
    expect(contas.get(ID)?.avisadaEm).toBeNull();

    recusar.clear();
    const r = await avisar()(ID, AGORA);
    expect(r.status).toBe("enviado");
  });

  it("um destinatário falhou e outro recebeu: a marca fica, e a falha volta contada", async () => {
    recusar.add("bia@maisa.com");
    const r = await avisar(["ana@maisa.com", "bia@maisa.com"])(ID, AGORA);
    expect(r.status).toBe("enviado");
    expect(r.enviados).toBe(1);
    expect(r.falhas).toHaveLength(1);
    expect(contas.get(ID)?.avisadaEm).toBe(AGORA.toISOString());
  });

  it("conta que não existe não manda nada", async () => {
    const r = await avisar()("00000000-0000-4000-8000-000000000000", AGORA);
    expect(r.status).toBe("conta_inexistente");
    expect(enviados).toHaveLength(0);
    expect(marcas).toHaveLength(0);
  });

  it("id que não é uuid é recusado antes de ler o banco", async () => {
    await expect(avisar()("'; drop table x; --", AGORA)).rejects.toBeInstanceOf(DadoInvalido);
    await expect(avisar()("", AGORA)).rejects.toBeInstanceOf(DadoInvalido);
  });

  it("o e-mail não leva segredo nenhum da conta", async () => {
    await avisar()(ID, AGORA);
    const m = enviados[0];
    expect(`${m.assunto}\n${m.texto}`).not.toMatch(/senha|password|token|secret|apikey/i);
  });
});
