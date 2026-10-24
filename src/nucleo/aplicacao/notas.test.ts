/* ─────────────────────────────────────────────────────────────────────────────
 * NOTA FISCAL DUPLICADA — o defeito que estes testes existem para não deixar voltar.
 *
 * Emitir duas vezes o mesmo serviço gera dois documentos fiscais. Nota autorizada **não se
 * apaga**: cancela-se na prefeitura, com justificativa, e há cidade que não aceita
 * cancelamento por webservice nenhum. O erro não é um bug que se conserta com um deploy — é
 * papel na mão do cliente e do contador dele.
 *
 * Até 17/08/2026 isso era alcançável em três cliques: o "já emitiu" morava no `localStorage`
 * por cliente, então trocar de navegador ressuscitava o botão. Era teórico só porque nenhum
 * inquilino conseguia emitir de verdade — o 014 destravou a emissão, e destravou isto junto.
 *
 * ── E O SEGUNDO DEFEITO, QUE ERA PIOR ──
 *
 * `PedidoDeEmissao` recebia `valor`, `discriminacao` e `tomador` do NAVEGADOR. Um POST forjado
 * emitia documento fiscal de qualquer valor, para qualquer CPF, sob o CNPJ do dono.
 * ────────────────────────────────────────────────────────────────────────────── */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotaAberta, RepositorioNotas } from "../portas/saida/repositorio-notas";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { EmissorFiscal } from "../portas/saida/emissor-fiscal";
import type { AFaturar, ConfigFiscal, NotaGravada } from "../dominio/fiscal";
import type { ContextoTenant } from "../dominio/tenant";
import { DadoInvalido, NaoConfigurado, NaoEncontrado } from "../dominio/erros";
import { criarCancelarNota, criarConsultarNota, criarEmitirNota, criarLerFaturamento } from "./notas";

const t: ContextoTenant = { tenantId: "neg-1", usuarioId: "u-1", ator: { tipo: "usuario", id: "u-1" } };

/** Um MEI pronto para emitir — o resto dos testes assume que o fiscal não é o problema. */
const CONFIG_PRONTA: ConfigFiscal = {
  ambiente: "homologacao",
  cnpj: "12345678000123",
  razaoSocial: "BARBEARIA TESTE MEI",
  codigoMunicipio: "3550308",
  optanteMei: true,
  optanteSimples: false,
  empresaId: 9001,
  certificadoValidoAte: "2099-01-01",
  codigoTributacaoNacional: "060101",
  prestadorCpf: null,
  ocupacaoSaude: null,
  registroProfissional: null,
  procuradorDocumento: null,
  procuracaoValidaAte: null,
  procuracaoAceitaEm: null,
  inscricaoMunicipal: null,
  itemListaServico: null,
  aliquotaIss: null,
  codigoTributarioMunicipio: null,
};

const FERNANDA: AFaturar = {
  clienteId: "cl-1",
  nome: "Fernanda",
  cpf: "12345678909",
  atendimentos: 3,
  valor: 210,
  servico: "Corte de cabelo",
  desde: "2026-08-03",
  ate: "2026-08-15",
  competencia: "2026-08-01",
  teste: false,
};

/**
 * Um repositório de notas com a CLAIM DE VERDADE — a lista de pendentes encolhe.
 *
 * ⚠️ É o detalhe que faz estes testes valerem. Um dublê que só devolvesse `NotaAberta` sempre
 * passaria no caminho feliz e não pegaria o duplo clique, que é o caso que custa dinheiro.
 */
function repoNotas(pendentes: AFaturar[] = [FERNANDA]) {
  let fila = [...pendentes];
  let seq = 0;
  const gravadas: NotaGravada[] = [];
  const concluidas: { notaId: string; status: string }[] = [];

  const r: RepositorioNotas = {
    async aFaturar() { return fila.map((f) => ({ ...f })); },
    async abrir(_t, p): Promise<NotaAberta | null> {
      const i = fila.findIndex((f) => f.clienteId === p.clienteId);
      if (i < 0) return null;
      const [alvo] = fila.splice(i, 1);
      const id = `nota-${++seq}`;
      gravadas.push({ id, ref: p.ref, status: "pendente", clienteId: alvo.clienteId, tomadorNome: alvo.nome, valor: alvo.valor, competencia: alvo.competencia, ambiente: p.ambiente });
      return {
        id, ref: p.ref, valor: alvo.valor, atendimentos: alvo.atendimentos,
        competencia: alvo.competencia, discriminacao: p.discriminacao,
        tomador: { nome: alvo.nome, cpf: alvo.cpf, email: null, telefone: null },
      };
    },
    async concluir(_t, notaId, res) { concluidas.push({ notaId, status: res.status }); },
    async reabrir() { /* não exercitado aqui */ },
    async listar() { return gravadas.map((g) => ({ ...g })); },
    async porRef(_t, ref) { return gravadas.find((g) => g.ref === ref) ?? null; },
  };
  return { r, concluidas, gravadas, fila: () => fila };
}

function repoFiscal(config: ConfigFiscal = CONFIG_PRONTA): RepositorioFiscal {
  return { async ler() { return { ...config }; }, async salvar() { return { ...config }; } };
}

function emissorQue(resposta: Parameters<EmissorFiscal["emitir"]>[2] extends never ? never : any = { status: "processando" }) {
  return {
    emitir: vi.fn(async (_t: any, _c: any, p: any) => ({ ...resposta, ref: p.ref })),
    consultar: vi.fn(async (_t: any, _c: any, ref: string) => ({ status: "autorizado" as const, ref, numero: "42" })),
    cancelar: vi.fn(async (_t: any, _c: any, ref: string) => ({ status: "cancelado" as const, ref })),
  } as unknown as EmissorFiscal & { emitir: any; consultar: any; cancelar: any };
}

const ids = () => { let n = 0; return () => `id${++n}0000000`; };

describe("emitir nota", () => {
  let notas: ReturnType<typeof repoNotas>;
  beforeEach(() => { notas = repoNotas(); });

  /* ⚠️ O TESTE QUE PROTEGE PAPEL NA MÃO DO CLIENTE. */
  it("clicar duas vezes NÃO emite duas notas", async () => {
    const emissor = emissorQue();
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids() });

    const primeira = await emitir(t, { clienteId: "cl-1" });
    const segunda = await emitir(t, { clienteId: "cl-1" });

    expect(primeira.status).toBe("processando");
    /* ⚠️ `ja_faturado`, e NÃO erro. Erro faria o dono clicar de novo procurando entender — e é
     * justamente o clique que a claim existe para tornar inofensivo. */
    expect(segunda.status).toBe("ja_faturado");
    expect(emissor.emitir).toHaveBeenCalledTimes(1);
  });

  /* A OUTRA metade da proteção, e ela não é redundante com a de cima.
   *
   * Aquela cobre o clique repetido em sequência (o cliente já saiu de `aFaturar`). Esta cobre a
   * CORRIDA: duas requisições que passaram pela checagem no mesmo instante, e o
   * `for update skip locked` do banco deu a claim a uma só. A perdedora recebe `null` de
   * `abrir` com o cliente ainda listado como pendente — e não pode emitir. */
  it("perder a corrida da claim também devolve `ja_faturado`, e não emite", async () => {
    const emissor = emissorQue();
    const perdedora: RepositorioNotas = { ...notas.r, abrir: async () => null };
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: perdedora, novoId: ids() });

    expect((await emitir(t, { clienteId: "cl-1" })).status).toBe("ja_faturado");
    expect(emissor.emitir).not.toHaveBeenCalled();
  });

  /* ⚠️ O valor NÃO vem de quem pediu. É a claim que soma, sobre as linhas que prendeu. */
  it("o valor e o tomador vêm da claim, nunca do pedido", async () => {
    const emissor = emissorQue();
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids() });

    await emitir(t, { clienteId: "cl-1" });

    const pedido = emissor.emitir.mock.calls[0][2];
    expect(pedido.valor).toBe(210);
    expect(pedido.tomador.cpf).toBe("12345678909");
    /* A discriminação usa o serviço do SNAPSHOT do atendimento, não o catálogo de hoje: o dono
     * pode ter renomeado o serviço depois, e a nota tem que dizer o que foi prestado. */
    expect(pedido.discriminacao).toBe("Corte de cabelo — 3 atendimentos · 08/2026");
  });

  it("grava o desfecho na nota aberta, inclusive quando dá erro", async () => {
    const emissor = emissorQue({ status: "erro", erros: [{ mensagem: "Código de Serviço inexistente" }] });
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids() });

    const r = await emitir(t, { clienteId: "cl-1" });

    expect(r.status).toBe("erro");
    expect(notas.concluidas).toEqual([{ notaId: "nota-1", status: "erro" }]);
    /* ⚠️ E o cliente NÃO volta para "a faturar": os atendimentos ficam presos à nota que
     * falhou. É isso que faz a retentativa reaproveitar a mesma nota em vez de abrir a
     * segunda — soltar aqui reabriria a porta da duplicação. */
    expect(notas.fila()).toHaveLength(0);
  });

  describe("as recusas, e todas ANTES de abrir a nota", () => {
    /* Abrir e só então descobrir que falta dado fiscal deixaria uma nota `erro` no histórico
     * com atendimentos presos — trabalho para desfazer por causa de checagem que cabia antes. */
    it("fiscal incompleto recusa sem abrir nada", async () => {
      const emissor = emissorQue();
      const semCertificado = { ...CONFIG_PRONTA, certificadoValidoAte: null };
      const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(semCertificado), notas: notas.r, novoId: ids() });

      await expect(emitir(t, { clienteId: "cl-1" })).rejects.toBeInstanceOf(NaoConfigurado);
      expect(notas.gravadas).toHaveLength(0);
      expect(emissor.emitir).not.toHaveBeenCalled();
    });

    it("cliente sem CPF recusa com o nome dele na frase", async () => {
      const semCpf = repoNotas([{ ...FERNANDA, cpf: null }]);
      const emitir = criarEmitirNota({ emissor: emissorQue(), fiscal: repoFiscal(), notas: semCpf.r, novoId: ids() });

      await expect(emitir(t, { clienteId: "cl-1" })).rejects.toThrow(/Fernanda/);
      expect(semCpf.gravadas).toHaveLength(0);
    });

    it("cliente sem atendimento pendente não abre nota", async () => {
      const emitir = criarEmitirNota({ emissor: emissorQue(), fiscal: repoFiscal(), notas: notas.r, novoId: ids() });
      await expect(emitir(t, { clienteId: "cl-999" })).rejects.toBeInstanceOf(NaoEncontrado);
    });

    it("sem clienteId nem chega ao banco", async () => {
      const emitir = criarEmitirNota({ emissor: emissorQue(), fiscal: repoFiscal(), notas: notas.r, novoId: ids() });
      await expect(emitir(t, { clienteId: "" })).rejects.toBeInstanceOf(DadoInvalido);
    });
  });
});

describe("consultar e cancelar", () => {
  /* ⚠️ ESTE É UM FURO DE ISOLAMENTO, e não organização. A consulta na Focus é autenticada pelo
   * token da EMPRESA deste inquilino — mas ela responde sobre qualquer `ref` que aquela empresa
   * emitiu. Sem conferir que a ref é nossa, uma ref conhecida devolveria número, PDF e o nome
   * do tomador de outro negócio que compartilhe a empresa. */
  it("recusam ref que não é deste inquilino", async () => {
    const notas = repoNotas();
    const emissor = emissorQue();
    const consultar = criarConsultarNota({ emissor, fiscal: repoFiscal(), notas: notas.r });
    const cancelar = criarCancelarNota({ emissor, fiscal: repoFiscal(), notas: notas.r });

    await expect(consultar(t, "maisa-de-outro-1234")).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(cancelar(t, { ref: "maisa-de-outro-1234" })).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emissor.consultar).not.toHaveBeenCalled();
    expect(emissor.cancelar).not.toHaveBeenCalled();
  });

  it("consultar grava o status novo na nossa nota", async () => {
    const notas = repoNotas();
    const emissor = emissorQue();
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids() });
    const consultar = criarConsultarNota({ emissor, fiscal: repoFiscal(), notas: notas.r });

    const r = await emitir(t, { clienteId: "cl-1" });
    await consultar(t, r.ref);

    expect(notas.concluidas.at(-1)).toEqual({ notaId: "nota-1", status: "autorizado" });
  });

  /* ⚠️ Cancelar NÃO devolve o cliente para "a faturar". Às vezes é o que o dono quer, às vezes é
   * exatamente o que ele não quer (cancelou porque o serviço não aconteceu) — e não há como
   * distinguir aqui. O erro caro é o segundo: emitir nota de serviço não prestado. */
  it("cancelar não devolve os atendimentos para a fila", async () => {
    const notas = repoNotas();
    const emissor = emissorQue();
    const emitir = criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids() });
    const cancelar = criarCancelarNota({ emissor, fiscal: repoFiscal(), notas: notas.r });

    const r = await emitir(t, { clienteId: "cl-1" });
    await cancelar(t, { ref: r.ref });

    expect(notas.fila()).toHaveLength(0);
  });
});

describe("ler o faturamento", () => {
  it("junta o que falta, o que saiu e o que impede de emitir", async () => {
    const notas = repoNotas();
    const ler = criarLerFaturamento({ notas: notas.r, fiscal: repoFiscal() });

    const f = await ler(t);
    expect(f.aFaturar).toHaveLength(1);
    expect(f.aFaturar[0].valor).toBe(210);
    expect(f.ambiente).toBe("homologacao");
    expect(f.falta).toEqual([]);
  });

  /* A tela precisa saber ANTES de mostrar o botão. Sem isso o dono clica em "emitir as 12
   * pendentes" e recebe doze erros de configuração em sequência. */
  it("diz o que falta no fiscal, para a tela não oferecer um botão que vai falhar", async () => {
    const notas = repoNotas();
    const ler = criarLerFaturamento({ notas: notas.r, fiscal: repoFiscal({ ...CONFIG_PRONTA, empresaId: null }) });

    expect((await ler(t)).falta).toContain("cadastrar o CNPJ no emissor");
  });
});

/* ── O PDF NO WHATSAPP DE QUEM EMITE (15/10/2026) ──
 *
 * A nota que sai vai em PDF para o dono conferir e encaminhar. Três coisas que não podem mudar:
 * vai para o DONO e nunca para o cliente; não vai de novo a cada consulta da tela; e uma
 * mensagem que falha não desfaz a nota nem vira erro. */
describe("aviso da nota no WhatsApp do dono", () => {
  function avisoCom(canalDoDono: { telefoneDono: string | null; numero: string | null } | null, falha = false) {
    const enviarDocumento = vi.fn(async () => { if (falha) throw new Error("canal fora do ar"); });
    return {
      enviarDocumento,
      aviso: {
        canal: { enviar: vi.fn(), enviarDocumento, escalar: vi.fn() },
        canalDoNegocio: { ler: async () => canalDoDono },
      } as any,
    };
  }

  it("nota que sai com PDF vai para o número do dono, com nº, tomador e valor na legenda", async () => {
    const notas = repoNotas();
    const { aviso, enviarDocumento } = avisoCom({ telefoneDono: "5511999990000", numero: "5511888880000" });
    const emissor = emissorQue({ status: "simulado", simulado: true, numero: "000123", pdf: "https://app/api/nf/pdf/x?a=y" });
    await criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids(), aviso })(t, { clienteId: "cl-1" });

    expect(enviarDocumento).toHaveBeenCalledTimes(1);
    const [, para, doc] = enviarDocumento.mock.calls[0] as any[];
    expect(para).toBe("5511999990000");
    expect(doc.url).toBe("https://app/api/nf/pdf/x?a=y");
    expect(doc.legenda).toContain("nº 000123");
    expect(doc.legenda).toContain("Fernanda");
    expect(doc.legenda).toContain("R$ 210,00");
  });

  it("sem PDF, ou ainda processando, não manda nada", async () => {
    for (const resposta of [{ status: "simulado", simulado: true }, { status: "processando", pdf: "https://x" }]) {
      const { aviso, enviarDocumento } = avisoCom({ telefoneDono: "5511999990000", numero: null });
      await criarEmitirNota({ emissor: emissorQue(resposta), fiscal: repoFiscal(), notas: repoNotas().r, novoId: ids(), aviso })(t, { clienteId: "cl-1" });
      expect(enviarDocumento).not.toHaveBeenCalled();
    }
  });

  it("o canal falhar não desfaz a nota nem vira erro", async () => {
    const notas = repoNotas();
    const { aviso } = avisoCom({ telefoneDono: "5511999990000", numero: null }, true);
    const emissor = emissorQue({ status: "autorizado", numero: "9", pdf: "https://x" });
    const r = await criarEmitirNota({ emissor, fiscal: repoFiscal(), notas: notas.r, novoId: ids(), aviso })(t, { clienteId: "cl-1" });
    expect(r.status).toBe("autorizado");
    expect(notas.concluidas).toHaveLength(1);
  });

  it("consultar uma nota que JÁ estava emitida não manda o PDF de novo", async () => {
    const notas = repoNotas();
    notas.gravadas.push({ id: "n-1", ref: "ref-1", status: "emitida", clienteId: "cl-1", tomadorNome: "Fernanda", valor: 210, competencia: null, ambiente: "homologacao", pdf: "https://x" } as any);
    const { aviso, enviarDocumento } = avisoCom({ telefoneDono: "5511999990000", numero: null });
    const emissor = emissorQue();
    emissor.consultar.mockResolvedValue({ status: "autorizado", ref: "ref-1", numero: "42", pdf: "https://x" });
    await criarConsultarNota({ emissor, fiscal: repoFiscal(), notas: notas.r, aviso })(t, "ref-1");
    expect(enviarDocumento).not.toHaveBeenCalled();
  });

  it("a consulta da simulada não apaga o número e o PDF que ela ganhou na emissão", async () => {
    const notas = repoNotas();
    notas.gravadas.push({ id: "n-1", ref: "ref-1", status: "emitida", numero: "000123", pdf: "https://x", clienteId: "cl-1", tomadorNome: "Fernanda", valor: 210, competencia: null, ambiente: "homologacao" } as any);
    const emissor = emissorQue();
    emissor.consultar.mockResolvedValue({ status: "simulado", ref: "ref-1", simulado: true });
    const r = await criarConsultarNota({ emissor, fiscal: repoFiscal(), notas: notas.r })(t, "ref-1");
    expect(r.numero).toBe("000123");
    expect(r.pdf).toBe("https://x");
  });
});
