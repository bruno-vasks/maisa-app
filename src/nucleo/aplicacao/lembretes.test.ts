/* ─────────────────────────────────────────────────────────────────────────────
 * A ROTINA DE LEMBRETES — a única coisa do sistema que roda sem ninguém do outro lado.
 *
 * O que mais importa aqui não é o texto: é que UMA falha não derrube as outras, e que
 * cada envio saia com o inquilino DAQUELA linha. Um lembrete saindo pelo WhatsApp do
 * negócio errado seria o vazamento mais visível que este produto pode ter.
 * ────────────────────────────────────────────────────────────────────────────── */

import { beforeEach, describe, expect, it } from "vitest";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { LembretePendente } from "@/nucleo/dominio/lembretes";
import { MAX_HORAS_ANTES } from "@/nucleo/dominio/lembretes";
import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import type { FilaDeLembretes } from "@/nucleo/portas/saida/fila-de-lembretes";
import { criarEnviarLembretes } from "./lembretes";

const AGORA = new Date("2026-08-14T12:00:00Z");

const pendente = (over: Partial<LembretePendente> = {}): LembretePendente => ({
  id: "at-1",
  tenantId: "t1",
  clienteNome: "Maria Aparecida da Silva",
  clienteTel: "5511999990000",
  servicoNome: "Corte",
  inicio: "2026-08-14T18:00:00Z",
  ...over,
});

let fila: LembretePendente[];
let devolvidos: string[];
let janelaPedida: Date | null;
let enviados: { tenantId: string; ator: string; para: string; texto: string }[];
let quebrarPara: Set<string>;

const filaFake: FilaDeLembretes = {
  faltando: () => [],
  async reservar(ate) {
    janelaPedida = ate;
    /* Reservar É consumir: uma segunda chamada não vê o que a primeira levou. É a
     * propriedade que a função SQL garante, e o fake mente se não a imitar. */
    const levados = fila;
    fila = [];
    return levados;
  },
  async devolver(id) { devolvidos.push(id); },
};

const canalFake: CanalDeMensagens = {
  async enviar(t: ContextoTenant, para, textos) {
    if (quebrarPara.has(t.tenantId)) throw new Error("WhatsApp desconectado");
    enviados.push({ tenantId: t.tenantId, ator: t.ator.tipo, para, texto: textos.join(" ") });
  },
  async enviarDocumento() { throw new Error("lembrete não manda arquivo"); },
  async escalar() { /* a rotina nunca escala */ },
};

let consultasDeNegocio = 0;

const negocioFake = {
  async negocio(t: ContextoTenant) {
    consultasDeNegocio++;
    return { nome: `Negócio ${t.tenantId}` };
  },
} as never;

const assistenteFake = {
  async ler() {
    return { assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true }, cfg: {} };
  },
} as never;

const enviar = criarEnviarLembretes({
  fila: filaFake,
  canal: canalFake,
  negocio: negocioFake,
  assistente: assistenteFake,
});

beforeEach(() => {
  fila = [];
  devolvidos = [];
  janelaPedida = null;
  enviados = [];
  quebrarPara = new Set();
  consultasDeNegocio = 0;
});

describe("a janela", () => {
  /* ⚠️ ISTO DEIXOU DE SER A JANELA em 04/09/2026, e o teste mudou junto com o significado.
   *
   * A janela virou por inquilino (`assistente.lembrete_horas`, migração 026) e é avaliada
   * dentro do SQL, porque a varredura é uma só para todos e um número aqui não expressa N
   * réguas. O que a app manda agora é o TETO: "nem olhe atendimento depois disto".
   *
   * O teste continua valendo a pena porque prende a relação entre os dois — se o teto
   * encolhesse para menos que o maior prazo configurável, o inquilino de 1 semana pararia
   * de receber lembrete e nada apontaria para cá. */
  it("pede o teto de antecedência à frente de agora", async () => {
    await enviar(AGORA);
    const esperado = new Date(AGORA.getTime() + MAX_HORAS_ANTES * 3600_000);
    expect(janelaPedida?.toISOString()).toBe(esperado.toISOString());
  });

  it("fila vazia não manda nada e não é erro", async () => {
    const r = await enviar(AGORA);
    expect(r).toEqual({ enviados: 0, falhas: [] });
    expect(enviados).toEqual([]);
  });
});

describe("o envio", () => {
  it("sai com o inquilino da LINHA e com ator sistema", async () => {
    fila = [pendente({ tenantId: "t1" }), pendente({ id: "at-2", tenantId: "t2" })];

    await enviar(AGORA);

    expect(enviados.map((e) => e.tenantId)).toEqual(["t1", "t2"]);
    /* Ator `sistema`, e não `usuario`: ninguém clicou. A auditoria não pode dizer que o
     * dono mandou uma mensagem enquanto ele dormia. */
    expect(enviados.every((e) => e.ator === "sistema")).toBe(true);
  });

  it("manda UMA mensagem, não três bolhas", async () => {
    fila = [pendente()];
    await enviar(AGORA);
    expect(enviados).toHaveLength(1);
  });

  it("consulta a identidade do inquilino uma vez por rodada, não por linha", async () => {
    fila = [pendente({ id: "a" }), pendente({ id: "b" }), pendente({ id: "c" })];

    await enviar(AGORA);

    expect(enviados).toHaveLength(3);
    expect(consultasDeNegocio).toBe(1);
  });
});

describe("falha de um não derruba os outros", () => {
  it("segue a rodada e conta certo", async () => {
    fila = [
      pendente({ id: "ok-1", tenantId: "t1" }),
      pendente({ id: "ruim", tenantId: "quebrado" }),
      pendente({ id: "ok-2", tenantId: "t2" }),
    ];
    quebrarPara.add("quebrado");

    const r = await enviar(AGORA);

    expect(r.enviados).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toMatchObject({ atendimentoId: "ruim", tenantId: "quebrado" });
  });

  /* Sem devolver, a linha fica marcada como enviada para sempre e o lembrete se perde —
   * o cliente não recebe e ninguém fica sabendo. */
  it("devolve a reserva de quem falhou, e só dele", async () => {
    fila = [pendente({ id: "ok" }), pendente({ id: "ruim", tenantId: "quebrado" })];
    quebrarPara.add("quebrado");

    await enviar(AGORA);

    expect(devolvidos).toEqual(["ruim"]);
  });

  it("o motivo do provedor chega inteiro no relatório", async () => {
    fila = [pendente({ tenantId: "quebrado" })];
    quebrarPara.add("quebrado");

    const r = await enviar(AGORA);

    expect(r.falhas[0].motivo).toBe("WhatsApp desconectado");
  });
});
