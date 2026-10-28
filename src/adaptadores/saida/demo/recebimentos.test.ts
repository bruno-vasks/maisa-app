/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS — da rotina ao documento, sobre o banco demo.
 *
 * Mora aqui, e não ao lado de `aplicacao/recebimentos.ts`, porque usa o banco demo (as regras da
 * 038 em memória, `recebimentos.ts` ao lado) sobre o registro demo de atendimentos, e o núcleo não
 * importa adaptador nem em teste (`arquitetura.test.ts`). Assim o mesmo arquivo prende as duas
 * coisas: o demo se comporta como o banco, e o caso de uso faz a coisa certa em cima dele.
 *
 * O resto é dublê que anota: a fila, a conversa, a ficha, o fiscal, o canal e os dois emissores. O
 * que se prende é a ordem das coisas: quem recebe o quê, quando, e o que nunca acontece (Pix para
 * quem pagou na hora, recibo antes do pagamento, CPF pedido duas vezes).
 * ────────────────────────────────────────────────────────────────────────────── */

import { beforeEach, describe, expect, it } from "vitest";

import { criarRecebimentos } from "@/nucleo/aplicacao/recebimentos";
import type { ConfigFiscal } from "@/nucleo/dominio/fiscal";
import type { Msg } from "@/nucleo/dominio/conversas";
import type { NovoEnvio } from "@/nucleo/dominio/envios";
import { crc16 } from "@/nucleo/dominio/pix";
import { AGRADECIMENTO_DO_CPF, COMPROVANTE_REPETIDO, type DadosDoComprovante } from "@/nucleo/dominio/recebimentos";
import { atorUsuario, type ContextoTenant } from "@/nucleo/dominio/tenant";

import { CHAVE_DA_PLATAFORMA, criarAsaasFalso } from "@/adaptadores/saida/asaas/asaas-falso";
import { criarClienteAsaas } from "@/adaptadores/saida/asaas/cliente";
import { criarProvedorAsaas, hashDoToken } from "@/adaptadores/saida/asaas/recebimentos-asaas";
import type { ProvedorDeRecebimentos } from "@/nucleo/portas/saida/provedor-de-recebimentos";
import { titularConferido } from "@/nucleo/aplicacao/recebimentos";

import { registroDemo, zerarEspelhoDemo } from "./atendimentos";
import { cofreDeRecebimentosDemo, zerarCofreDeRecebimentosDemo } from "./cofre-de-recebimentos";
import { cpfDaFichaDemo, pagaPorMesDemo, recebimentosDemo, zerarRecebimentosDemo } from "./recebimentos";

const AGORA = Date.parse("2026-10-27T18:00:00-03:00");
const T = "negocio-1";
const t: ContextoTenant = { tenantId: T, usuarioId: "u1", ator: atorUsuario("u1") };
const JOAO = "cliente-joao";
const TEL_JOAO = "5511988887777";
const DONO = "5511955554444";
const CONECTADO = "5511911112222";

let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-aaaa-4bbb-8ccc-${String(seq).padStart(12, "0")}`;

/** Um atendimento que acabou `minutosAtras` minutos antes de AGORA. */
async function atendimento(p: { minutosAtras: number; valor?: number; cliente?: string | null; tel?: string; data?: string; servico?: string }) {
  const fim = new Date(AGORA - p.minutosAtras * 60_000);
  const inicio = new Date(fim.getTime() - 30 * 60_000);
  const maisaAg = uuid();
  await registroDemo.registrar({ ...t, ator: atorUsuario("u1") }, {
    maisaAg,
    agendaId: `agenda-${seq}`,
    clienteId: p.cliente === undefined ? JOAO : p.cliente,
    clienteNome: "João Silva",
    clienteTel: p.tel ?? TEL_JOAO,
    servicoId: null,
    servicoNome: p.servico ?? "Corte",
    servicoValor: p.valor ?? 50,
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
    duracaoMin: 30,
    dataLocal: p.data ?? "2026-10-27",
    horaInicio: 10,
    eventoId: null,
    meetLink: null,
    htmlLink: null,
  });
  return maisaAg;
}

/** Terapeuta pessoa física com o recibo pronto: CPF, profissão, conselho e a MAISA autorizada. */
const FISCAL_PF: ConfigFiscal = {
  ambiente: "producao", cnpj: null, razaoSocial: null, codigoMunicipio: null, optanteMei: false, optanteSimples: false,
  empresaId: null, certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "12345678909", ocupacaoSaude: "psicologo", registroProfissional: "06/12345",
  procuradorDocumento: "11222333000181", procuracaoAceitaEm: "2026-10-01", procuracaoValidaAte: null,
} as unknown as ConfigFiscal;

/** Barbeiro MEI com a nota pronta: CNPJ, município, empresa no emissor, certificado e o código. */
const FISCAL_MEI = {
  prestadorCpf: null, cnpj: "11222333000181", optanteMei: true, codigoMunicipio: "3550308", empresaId: 1,
  certificadoValidoAte: "2027-12-31", codigoTributacaoNacional: "060101", procuradorDocumento: null,
} as unknown as Partial<ConfigFiscal>;

function ambiente(o: {
  dono?: string | null;
  fiscal?: Partial<ConfigFiscal> | null;
  cpfDoCliente?: string;
  leitura?: DadosDoComprovante | null;
  falhaNaNota?: boolean;
  provedor?: ProvedorDeRecebimentos;
} = {}) {
  let agora = AGORA;
  const enviados: { para: string; textos: string[]; tenant: string }[] = [];
  const naConversa: { telefone: string; txt: string }[] = [];
  const recibos: string[][] = [];
  const notas: { clienteId: string; atendimentoIds?: string[]; ator: string }[] = [];
  const cpfs: string[] = [];
  const leituras: number[] = [];
  let cpf = o.cpfDoCliente ?? "";

  const casos = criarRecebimentos({
    recebimentos: recebimentosDemo,
    leitor: { async ler() { leituras.push(1); return o.leitura === undefined ? null : o.leitura; } },
    fila: {
      faltando: () => [],
      async enfileirar(ctx, envios: NovoEnvio[]) { for (const e of envios) enviados.push({ para: e.para, textos: e.textos, tenant: ctx.tenantId }); },
      async negociosComEnvio() { return []; },
      async reservar() { return null; },
      async concluir() {},
      async devolver() { return { desistiu: false }; },
    },
    historico: {
      async anexar(_ctx: ContextoTenant, telefone: string, msgs: Msg[]) { for (const m of msgs) naConversa.push({ telefone, txt: m.txt }); },
    } as never,
    negocio: {
      async cliente(_ctx: ContextoTenant, id: string) { return id === JOAO ? { id, nome: "João Silva", telefone: TEL_JOAO, cpf } : null; },
      async atualizarCliente(_ctx: ContextoTenant, r: { cpf?: string | null }) {
        cpf = r.cpf ?? "";
        cpfs.push(cpf);
        cpfDaFichaDemo(T, JOAO, cpf);
        return {};
      },
    } as never,
    fiscal: { async ler() { return o.fiscal === null ? null : { ...FISCAL_PF, ...o.fiscal }; } } as never,
    canalDoNegocio: {
      async ler() { return { status: "conectado", instancia: "i", numero: CONECTADO, conectadoEm: null, telefoneDono: o.dono === undefined ? DONO : o.dono }; },
    } as never,
    emitirRecibo: async (_ctx, p) => { recibos.push("itens" in p ? p.itens.map((i) => i.id) : [p.id]); return {} as never; },
    emitirNota: async (ctx, p) => {
      if (o.falhaNaNota) throw new Error("Focus fora do ar");
      notas.push({ clienteId: p.clienteId, atendimentoIds: p.atendimentoIds, ator: ctx.ator.tipo });
      return {} as never;
    },
    novoId: uuid,
    relogio: () => agora,
    ...(o.provedor ? { provedor: o.provedor } : {}),
  });

  return {
    casos, enviados, naConversa, recibos, notas, cpfs, leituras,
    passar: (ms: number) => { agora += ms; },
    config: (depois: "desligado" | "perguntar" | "direto" = "direto") =>
      casos.salvarConfig(t, { tipoDaChave: "email", chave: "Ze@Barbearia.com", nome: "José da Barbearia", cidade: "São Paulo", depoisDoAtendimento: depois }),
  };
}

beforeEach(() => {
  zerarRecebimentosDemo();
  zerarEspelhoDemo();
  zerarCofreDeRecebimentosDemo();
});

describe("a rotina, depois do atendimento", () => {
  it("direto: o Pix vai ao cliente em duas mensagens, e o código é um BR Code com o valor", async () => {
    const a = ambiente();
    await a.config("direto");
    a.passar(60 * 60_000); // ligou há uma hora
    await atendimento({ minutosAtras: 10 - 60 });

    const r = await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    expect(r).toMatchObject({ negocios: 1, pix: 1, perguntas: 0, falhas: [] });

    const [pix] = a.enviados;
    expect(pix.para).toBe(TEL_JOAO);
    expect(pix.textos[0]).toBe(
      "Oi, João! Segue o Pix de R$ 50,00 (Corte, 27/10). É só copiar o código da próxima mensagem e colar no app do banco, em Pix copia e cola: o valor já vem preenchido.\n\nDepois, se puder, me manda o comprovante por aqui.",
    );
    const codigo = pix.textos[1];
    expect(codigo).toContain("0116ze@barbearia.com");
    expect(codigo).toContain("540550.00");
    expect(codigo).toContain("5917Jose da Barbearia");
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
    expect(a.naConversa.map((m) => m.txt)).toEqual([pix.textos[0], "[código Pix copia e cola de R$ 50,00]"]);

    /* Rodar de novo não cobra de novo. */
    await a.casos.cobrarAtendimentos(new Date(AGORA + 65 * 60_000));
    expect(a.enviados).toHaveLength(1);
  });

  it("o que acabou antes de ligar a cobrança não é cobrado sozinho", async () => {
    const a = ambiente();
    await atendimento({ minutosAtras: 30 });
    await a.config("direto");
    await a.casos.cobrarAtendimentos(new Date(AGORA + 10 * 60_000));
    expect(a.enviados).toHaveLength(0);
  });

  it("perguntar: nenhum Pix; a pergunta vai ao número de avisos do dono, uma por vez", async () => {
    const a = ambiente();
    await a.config("perguntar");
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    await atendimento({ minutosAtras: 15 - 60, valor: 70 });

    const r = await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    expect(r).toMatchObject({ pix: 0, perguntas: 1 });
    expect(a.enviados).toEqual([
      { para: DONO, tenant: T, textos: ["Acabou o atendimento de João Silva (Corte, 27/10, R$ 50,00). Já está pago?\n\nResponda 1 se já pagou, ou 2 para eu mandar o Pix."] },
    ]);

    /* A segunda espera a primeira ser respondida. */
    await a.casos.cobrarAtendimentos(new Date(AGORA + 65 * 60_000));
    expect(a.enviados).toHaveLength(1);
    const painel = await a.casos.lerRecebimentos(t);
    expect(painel.paraDecidir.map((x) => x.valor)).toEqual([50, 70]);
  });

  it("sem número de avisos (a MAISA no número do próprio barbeiro), a pergunta fica só no painel", async () => {
    const a = ambiente({ dono: CONECTADO });
    await a.config("perguntar");
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    const r = await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    expect(r.perguntas).toBe(0);
    expect(a.enviados).toHaveLength(0);
    expect((await a.casos.lerRecebimentos(t)).paraDecidir).toHaveLength(1);
  });
});

describe("a resposta do dono", () => {
  async function perguntado(o: Parameters<typeof ambiente>[0] = {}) {
    const a = ambiente({ cpfDoCliente: "12345678909", ...o });
    await a.config("perguntar");
    a.passar(60 * 60_000);
    const id = await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    a.enviados.length = 0;
    return { a, id };
  }

  it("2: o Pix vai para o cliente, e o dono recebe a confirmação na conversa", async () => {
    const { a } = await perguntado();
    const r = await a.casos.responderAoDono(t, { telefone: DONO, texto: "2" });
    expect(r).toEqual({ resposta: "Combinado, o Pix vai para João Silva agora." });
    expect(a.enviados.map((e) => e.para)).toEqual([TEL_JOAO]);
    expect(a.recibos).toHaveLength(0);
  });

  it("1: pago na hora. Nenhuma mensagem ao cliente, e o recibo sai dos atendimentos dele", async () => {
    const { a, id } = await perguntado();
    const r = await a.casos.responderAoDono(t, { telefone: "(11) 95555-4444", texto: "já pagou" });
    expect(r).toEqual({ resposta: "Anotado: João Silva já pagou." });
    expect(a.enviados).toHaveLength(0);
    expect(a.recibos).toEqual([[id]]);
    expect((await a.casos.lerRecebimentos(t)).recebidos[0]).toMatchObject({ situacao: "pago", forma: "na_hora" });
  });

  it("MEI: a nota sai só dos atendimentos deste pagamento, como rotina", async () => {
    const { a, id } = await perguntado({ fiscal: FISCAL_MEI });
    await a.casos.responderAoDono(t, { telefone: DONO, texto: "1" });
    expect(a.notas).toEqual([{ clienteId: JOAO, atendimentoIds: [id], ator: "sistema" }]);
  });

  it("de outro número, ou uma frase que não é resposta: segue como mensagem qualquer", async () => {
    const { a } = await perguntado();
    expect(await a.casos.responderAoDono(t, { telefone: TEL_JOAO, texto: "1" })).toBeNull();
    expect(await a.casos.responderAoDono(t, { telefone: DONO, texto: "depois eu vejo" })).toBeNull();
  });
});

describe("o comprovante", () => {
  const LEITURA: DadosDoComprovante = {
    valor: 50, pagoEm: "2026-10-27", recebedorNome: "JOSE DA BARBEARIA", recebedorChave: "ze@barbearia.com",
    recebedorDocumento: null, pagadorNome: "JOAO SILVA", banco: "Nubank", idTransacao: "E1823612020261027", identificador: null,
  };

  async function comPix(o: Parameters<typeof ambiente>[0] = {}) {
    const a = ambiente({ leitura: LEITURA, ...o });
    await a.config("direto");
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    a.enviados.length = 0;
    a.naConversa.length = 0;
    return a;
  }

  it("sem Pix em aberto, nem lê", async () => {
    const a = ambiente({ leitura: LEITURA });
    expect(await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/jpeg" } })).toBeNull();
    expect(a.leituras).toHaveLength(0);
  });

  it("lê, registra para conferir, responde ao cliente e avisa o dono", async () => {
    const a = await comPix();
    expect(await a.casos.temPixEmAberto(t, TEL_JOAO)).toBe(true);
    const r = await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/jpeg" }, mensagemId: "M1" });
    expect(r?.resposta).toBe("Recebi o comprovante de R$ 50,00, obrigada! Assim que for conferido, te confirmo por aqui.");
    expect(a.enviados).toEqual([
      { para: DONO, tenant: T, textos: ["João Silva mandou um comprovante de Pix de R$ 50,00. Confira no extrato e confirme na MAISA, na tela de hoje."] },
    ]);
    const [c] = (await a.casos.lerRecebimentos(t)).comprovantes;
    expect(c).toMatchObject({ valor: 50, conferencia: "confere", situacao: "a_conferir" });
    expect(c.recebimentoId).toBeTruthy();

    /* O mesmo comprovante de novo: nada novo, e a pessoa fica sabendo. */
    expect((await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/jpeg" }, mensagemId: "M2" }))?.resposta).toBe(COMPROVANTE_REPETIDO);
  });

  it("quem recebeu não é o profissional: o aviso ao dono diz", async () => {
    const a = await comPix({ leitura: { ...LEITURA, recebedorChave: "golpe@outro.com" } });
    await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/png" } });
    expect(a.enviados[0].textos[0]).toContain("quem recebeu não parece ser você");
  });

  it("uma foto qualquer: o leitor diz que não é comprovante, e nada acontece", async () => {
    const a = await comPix({ leitura: null });
    expect(await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/png" } })).toBeNull();
    expect((await a.casos.lerRecebimentos(t)).comprovantes).toHaveLength(0);
  });

  it("confirmado: pago em Pix, o cliente fica sabendo e o recibo sai", async () => {
    const a = await comPix({ cpfDoCliente: "12345678909" });
    await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/jpeg" } });
    a.enviados.length = 0;
    const [c] = (await a.casos.lerRecebimentos(t)).comprovantes;
    const r = await a.casos.confirmarComprovante(t, { id: c.id });
    expect(r.recebimento).toMatchObject({ situacao: "pago", forma: "pix" });
    expect(r.documento).toEqual({ tipo: "recibo" });
    expect(a.enviados).toEqual([{ para: TEL_JOAO, tenant: T, textos: ["Pagamento de R$ 50,00 confirmado. Obrigada!"] }]);
    await expect(a.casos.confirmarComprovante(t, { id: c.id })).rejects.toThrow(/já foi conferido/);
  });

  it("descartar pede o motivo", async () => {
    const a = await comPix();
    await a.casos.receberComprovante(t, { telefone: TEL_JOAO, arquivo: { base64: "x", mimetype: "image/jpeg" } });
    const [c] = (await a.casos.lerRecebimentos(t)).comprovantes;
    await expect(a.casos.descartarComprovante(t, { id: c.id, motivo: " " })).rejects.toThrow(/Diga por que/);
    await a.casos.descartarComprovante(t, { id: c.id, motivo: "não é desse cliente" });
    expect((await a.casos.lerRecebimentos(t)).comprovantes).toHaveLength(0);
  });
});

describe("o CPF que faltava", () => {
  it("pede uma vez, guarda quando chega, e o documento sai", async () => {
    const a = ambiente({ cpfDoCliente: "" });
    await a.config("perguntar");
    a.passar(60 * 60_000);
    const id1 = await atendimento({ minutosAtras: 20 - 60 });
    const id2 = await atendimento({ minutosAtras: 15 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    const [p1, p2] = (await a.casos.lerRecebimentos(t)).paraDecidir;
    a.enviados.length = 0;

    expect((await a.casos.decidir(t, { id: p1.id, decisao: "pagou" })).documento).toEqual({ tipo: "pediu_cpf" });
    expect((await a.casos.decidir(t, { id: p2.id, decisao: "pagou" })).documento).toEqual({ tipo: "pediu_cpf" });
    expect(a.enviados).toEqual([{ para: TEL_JOAO, tenant: T, textos: ["Para o recibo sair no seu nome, me manda seu CPF?"] }]);
    expect(a.recibos).toHaveLength(0);

    expect(await a.casos.guardarCpf(t, { telefone: TEL_JOAO, texto: "tem horário amanhã?" })).toBeNull();
    const r = await a.casos.guardarCpf(t, { telefone: TEL_JOAO, texto: "123.456.789-09" });
    expect(r).toEqual({ resposta: AGRADECIMENTO_DO_CPF });
    expect(a.cpfs).toEqual(["12345678909"]);
    expect(a.recibos).toEqual([[id1], [id2]]);
    expect(await a.casos.guardarCpf(t, { telefone: TEL_JOAO, texto: "123.456.789-09" })).toBeNull();
  });

  it("CPF com mais assunto: guarda, e a conversa segue para a MAISA responder o resto", async () => {
    const a = ambiente({ cpfDoCliente: "" });
    await a.config("perguntar");
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    const [p] = (await a.casos.lerRecebimentos(t)).paraDecidir;
    await a.casos.decidir(t, { id: p.id, decisao: "pagou" });
    expect(await a.casos.guardarCpf(t, { telefone: TEL_JOAO, texto: "123.456.789-09. Tem horário amanhã?" })).toEqual({ resposta: null });
    expect(a.cpfs).toEqual(["12345678909"]);
  });
});

describe("o painel", () => {
  it("os ajustes: a chave dentro do tipo, o nome obrigatório, e a hora em que ligou", async () => {
    const a = ambiente();
    await expect(a.casos.salvarConfig(t, { tipoDaChave: "cpf", chave: "123.456.789-00", nome: "Ana", cidade: null, depoisDoAtendimento: "direto" }))
      .rejects.toThrow(/não é um CPF válido/);
    await expect(a.casos.salvarConfig(t, { tipoDaChave: "telefone", chave: "(71) 99999-0000", nome: " ", cidade: null, depoisDoAtendimento: "direto" }))
      .rejects.toThrow(/nome de quem recebe/);
    const c = await a.casos.salvarConfig(t, { tipoDaChave: "telefone", chave: "(71) 99999-0000", nome: "Ana Lúcia", cidade: "Salvador", depoisDoAtendimento: "perguntar" });
    expect(c).toMatchObject({ chave: "+5571999990000", nome: "Ana Lucia", depoisDoAtendimento: "perguntar", ligadoEm: new Date(AGORA).toISOString() });

    a.passar(60_000);
    expect((await a.casos.salvarConfig(t, { ...c, chave: "71999990000", depoisDoAtendimento: "direto" })).ligadoEm).toBe(c.ligadoEm);
    const sem = await a.casos.salvarConfig(t, { tipoDaChave: null, chave: "", nome: null, cidade: null, depoisDoAtendimento: "direto" });
    expect(sem).toMatchObject({ chave: null, depoisDoAtendimento: "desligado", ligadoEm: null });
  });

  it("Mandar Pix: cria e manda; de novo, reenvia o mesmo; pago, recusa", async () => {
    const a = ambiente({ cpfDoCliente: "12345678909" });
    await a.config("desligado");
    const id = await atendimento({ minutosAtras: 60 * 30 });
    const r = await a.casos.mandarPix(t, { maisaAg: id });
    expect(r.situacao).toBe("aberto");
    expect(a.enviados).toHaveLength(1);
    expect((await a.casos.mandarPix(t, { maisaAg: id })).id).toBe(r.id);
    expect(a.enviados).toHaveLength(2);
    expect(a.enviados[1].textos).toEqual(a.enviados[0].textos);

    await a.casos.decidir(t, { id: r.id, decisao: "pagou" });
    await expect(a.casos.mandarPix(t, { maisaAg: id })).rejects.toThrow(/já está pago/);
  });

  it("não cobrar solta o atendimento; sem chave, nada sai", async () => {
    const a = ambiente();
    await a.config("perguntar");
    a.passar(60 * 60_000);
    const id = await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    const [p] = (await a.casos.lerRecebimentos(t)).paraDecidir;
    expect((await a.casos.decidir(t, { id: p.id, decisao: "nao_cobrar" })).recebimento.situacao).toBe("cancelado");
    expect((await a.casos.mandarPix(t, { maisaAg: id })).situacao).toBe("aberto");

    await a.casos.salvarConfig(t, { tipoDaChave: null, chave: null, nome: null, cidade: null, depoisDoAtendimento: "desligado" });
    await expect(a.casos.mandarPix(t, { maisaAg: id })).rejects.toThrow();
  });

  it("a nota que falha não desfaz o pagamento; o motivo volta para a tela", async () => {
    const a = ambiente({ cpfDoCliente: "12345678909", fiscal: FISCAL_MEI, falhaNaNota: true });
    await a.config("perguntar");
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    const [p] = (await a.casos.lerRecebimentos(t)).paraDecidir;
    const r = await a.casos.decidir(t, { id: p.id, decisao: "pagou" });
    expect(r.recebimento.situacao).toBe("pago");
    expect(r.documento).toEqual({ tipo: "falhou", motivo: "Focus fora do ar" });
  });
});

describe("por mês", () => {
  it("no dia do recibo, um Pix com as sessões do mês que ele fecha", async () => {
    const a = ambiente();
    await a.config("desligado");
    await atendimento({ minutosAtras: 60 * 24 * 20, data: "2026-10-07", servico: "Sessão", valor: 150 });
    await atendimento({ minutosAtras: 60 * 24 * 13, data: "2026-10-14", servico: "Sessão", valor: 150 });
    await atendimento({ minutosAtras: 60 * 24 * 40, data: "2026-09-16", servico: "Sessão", valor: 150 });
    pagaPorMesDemo(T, [{ clienteId: JOAO, diaRecibo: 27 }]);

    /* Dia 27 fecha o mês ANTERIOR (`corteDoRecibo`): setembro. */
    const r = await a.casos.cobrarAtendimentos(new Date(AGORA));
    expect(r.pix).toBe(1);
    expect(a.enviados[0].textos[0]).toContain("Segue o Pix de R$ 150,00 (Sessão, 16/09)");

    pagaPorMesDemo(T, [{ clienteId: JOAO, diaRecibo: 31 }]);
    const fim = await a.casos.cobrarAtendimentos(new Date(Date.parse("2026-10-31T09:00:00-03:00")));
    expect(fim.pix).toBe(1);
    expect(a.enviados[1].textos[0]).toContain("Segue o Pix de R$ 300,00 (2 atendimentos de outubro de 2026)");
  });
});

describe("a opção B: o Asaas, atrás de flag", () => {
  const TITULAR = {
    documento: "123.456.789-09", nome: "Ana Lúcia Souza", email: "ana@x.com", celular: "(11) 98888-7777", cep: "01310-100",
    endereco: "Av. Paulista", numero: "1000", bairro: "Bela Vista", faturamentoMensal: 8000, nascimento: "1990-05-10",
  };

  function comAsaas(o: { cpfDoCliente?: string } = {}) {
    const falso = criarAsaasFalso();
    const provedor = criarProvedorAsaas({
      cofre: cofreDeRecebimentosDemo,
      config: {
        ligado: true, ambiente: "sandbox", chavePlataforma: CHAVE_DA_PLATAFORMA, walletPlataforma: null, taxaFixa: 0, taxaPercentual: 0,
        urlDoAviso: "https://maisa.falsa/api/recebimentos/asaas", emailDoAviso: "a@b.com",
      },
      cliente: criarClienteAsaas({ fetch: falso.fetch, base: { sandbox: "https://asaas.falso/v3" } }),
      sortearToken: () => "token-do-aviso",
    });
    return { falso, ...ambiente({ provedor, cpfDoCliente: o.cpfDoCliente ?? "12345678909" }) };
  }

  async function aprovado(a: ReturnType<typeof comAsaas>) {
    await a.config("direto");
    await a.casos.abrirContaDeRecebimentos(t, TITULAR);
    a.falso.aprovar("acc_1");
    expect((await a.casos.lerRecebimentos(t)).asaas).toEqual({ disponivel: true, conta: { situacao: "aprovada", pendencias: [] } });
  }

  it("abrir a conta exige o Pix ligado antes, e confere os campos em português", async () => {
    const a = comAsaas();
    await expect(a.casos.abrirContaDeRecebimentos(t, TITULAR)).rejects.toThrow(/Ligue o Pix primeiro/);
    await a.config("direto");
    await expect(a.casos.abrirContaDeRecebimentos(t, { ...TITULAR, cep: "123" })).rejects.toThrow(/CEP tem 8/);
    expect(() => titularConferido({ ...TITULAR, documento: "111.111.111-11" })).toThrow(/CPF ou o CNPJ/);
    expect(() => titularConferido({ ...TITULAR, documento: "11222333000181", nascimento: null })).toThrow(/tipo da empresa/);
    const conta = await a.casos.abrirContaDeRecebimentos(t, TITULAR);
    expect(conta.situacao).toBe("pendente");
    expect(conta.pendencias[0].link).toContain("onboarding");
  });

  it("conta aprovada e CPF na ficha: a cobrança sai pelo Asaas, e o aviso de pagamento dá baixa e emite o recibo", async () => {
    const a = comAsaas();
    await aprovado(a);
    a.passar(60 * 60_000);
    const id = await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));

    const [cobranca] = a.enviados;
    expect(cobranca.textos[0]).toMatch(/^Oi, João! Segue a cobrança de R\$ 50,00 \(Corte, 27\/10\)\. Dá para pagar por Pix, boleto ou cartão, neste link: https:\/\/asaas\.falso\/i\/pay_/);
    expect(cobranca.textos[1]).toMatch(/^00020126pix-pay_/);
    const [aberto] = (await a.casos.lerRecebimentos(t)).abertos;
    expect(aberto).toMatchObject({ meio: "asaas", idExterno: expect.stringMatching(/^pay_/), link: expect.stringContaining("asaas.falso") });

    const aviso = a.falso.pagar(aberto.idExterno!);
    expect(await cofreDeRecebimentosDemo.negocioDoToken(hashDoToken(aviso.token))).toBe(T);
    const r = await a.casos.receberAvisoDePagamento({ ...t, ator: { tipo: "sistema", rotina: "asaas" } }, aviso.corpo);
    expect(r).toEqual({ status: "pago", documento: { tipo: "recibo" } });
    expect(a.recibos).toEqual([[id]]);
    expect(a.enviados.at(-1)?.textos).toEqual(["Pagamento de R$ 50,00 confirmado. Obrigada!"]);
    expect(await a.casos.receberAvisoDePagamento(t, aviso.corpo)).toEqual({ status: "ja_estava" });
  });

  it("sem CPF: pergunta uma vez antes de cobrar; quando chega, a cobrança sai", async () => {
    const a = comAsaas({ cpfDoCliente: "" });
    await aprovado(a);
    a.passar(60 * 60_000);
    await atendimento({ minutosAtras: 20 - 60 });
    await a.casos.cobrarAtendimentos(new Date(AGORA + 60 * 60_000));
    expect(a.enviados.map((e) => e.textos[0])).toEqual(["Para eu conseguir te mandar a cobrança, preciso do seu CPF. Pode me mandar por aqui?"]);
    expect(Object.keys(a.falso.cobrancas)).toHaveLength(0);

    expect(await a.casos.guardarCpf(t, { telefone: TEL_JOAO, texto: "123.456.789-09" })).toEqual({ resposta: AGRADECIMENTO_DO_CPF });
    expect(Object.keys(a.falso.cobrancas)).toHaveLength(1);
    expect(a.enviados.at(-1)?.textos[1]).toMatch(/^00020126pix-/);
  });

  it("o dono aperta Mandar Pix na cobrança que esperava o CPF: vai o Pix estático", async () => {
    const a = comAsaas({ cpfDoCliente: "" });
    await aprovado(a);
    const id = await atendimento({ minutosAtras: 60 * 30 });
    await a.casos.mandarPix(t, { maisaAg: id });
    expect(a.enviados.at(-1)?.textos[0]).toMatch(/preciso do seu CPF/);
    await a.casos.mandarPix(t, { maisaAg: id });
    expect(a.enviados.at(-1)?.textos[0]).toMatch(/^Oi, João! Segue o Pix de R\$ 50,00/);
    expect(Object.keys(a.falso.cobrancas)).toHaveLength(0);
  });

  it("a cobrança removida no Asaas cancela a nossa; aviso de outro evento é ignorado", async () => {
    const a = comAsaas();
    await aprovado(a);
    const id = await atendimento({ minutosAtras: 60 * 30 });
    const r = await a.casos.mandarPix(t, { maisaAg: id });
    const [aberto] = (await a.casos.lerRecebimentos(t)).abertos;
    expect(await a.casos.receberAvisoDePagamento(t, { event: "PAYMENT_CREATED", payment: { id: aberto.idExterno } })).toEqual({ status: "ignorado" });
    expect(await a.casos.receberAvisoDePagamento(t, { event: "PAYMENT_DELETED", payment: { id: aberto.idExterno, externalReference: r.id } })).toEqual({ status: "cancelado" });
  });
});
