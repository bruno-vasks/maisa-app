/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ A ORDEM: prende o pagamento ANTES de falar com o canal. O teste que amarra isso registra a
 * sequência de chamadas e exige `abrir` antes de `emitir`. Inverter os dois abre uma janela em
 * que o pagamento está livre e a emissão já saiu — e dois cliques nessa janela produzem dois
 * recibos que **nenhum banco reconhece como duplicata**, porque cada um tem sua própria linha.
 *
 * E o que a reconciliação NÃO pode fazer: transformar "não sei" em "recusado". O canal
 * respondendo `null` é ambíguo de propósito, e tem que continuar ambíguo — tratar como recusa
 * libera a cascata, e se o pedido tinha chegado, sai o segundo recibo.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  criarEmitirRecibo, criarFecharReciboDoCallback, criarReconciliarRecibos,
} from "./recibo-unitario";
import type { GuardaDeComprovante } from "../portas/saida/guarda-de-comprovante";
import type { ConfigFiscal } from "../dominio/fiscal";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { LivroDeRecibos, ReciboAberto } from "../portas/saida/livro-de-recibos";
import type { EmissorDeReciboSaude } from "../portas/saida/emissor-recibo";
import type { PagamentoAFaturar, RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import type {
  DesfechoDeRecibo, ReciboAceito, ReciboEmitido,
} from "../dominio/recibo-unitario";
import type { ContextoTenant } from "../dominio/tenant";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RepositorioAssistente } from "../portas/saida/repositorio-assistente";
import { DadoInvalido } from "../dominio/erros";

const t: ContextoTenant = { tenantId: "t1", usuarioId: "u1", ator: { tipo: "usuario", id: "u1" } };

const carla: ConfigFiscal = {
  ambiente: "producao",
  cnpj: null, razaoSocial: null, codigoMunicipio: null,
  optanteMei: false, optanteSimples: false, empresaId: null,
  certificadoValidoAte: null, codigoTributacaoNacional: null,
  prestadorCpf: "12345678909",
  ocupacaoSaude: "psicologo",
  registroProfissional: "CRP 06/123456",
  procuradorDocumento: null,
  procuracaoValidaAte: null,
  procuracaoAceitaEm: null,
  inscricaoMunicipal: null, itemListaServico: null,
  aliquotaIss: null, codigoTributarioMunicipio: null,
};

const fiscalDe = (c: ConfigFiscal): RepositorioFiscal => ({
  async ler() { return c; },
  async salvar() { return c; },
});

const sessao = (over: Partial<PagamentoAFaturar> = {}): PagamentoAFaturar => ({
  id: "at1", fonte: "atendimento", clienteId: "cl1",
  nome: "Mariana Alves", cpf: "98765432100", cpfPagador: null,
  data: "2026-08-14", valor: 250, servico: "Sessão", teste: false,
  ...over,
});

/** Um ambiente de teste com espião de SEQUÊNCIA — é a sequência que este arquivo protege. */
function ambiente(p: {
  pendentes?: PagamentoAFaturar[];
  /** O que a claim devolve. `null` = já preso. */
  aberto?: ReciboAberto | null;
  /** `emitir` estoura? Simula recusa do PEDIDO, não da Receita. */
  emitirQuebra?: string;
  /** O que o canal responde em `consultar`. `undefined` = devolve null. */
  desfecho?: DesfechoDeRecibo | null;
  /** As linhas que a reconciliação vai encontrar. */
  pendentesDoLivro?: ReciboEmitido[];
  /** `fechar` devolve null = o callback chegou primeiro. */
  fecharDevolveNull?: boolean;
  /** A cópia do PDF falha — bucket recusando, ou os cinco minutos da URL passaram. */
  guardaFalha?: boolean;
  /** O canal usa a NOSSA referência como protocolo (é o caso da Rebots). */
  protocoloNosso?: boolean;
  /** O interruptor `avisarRecibo` do inquilino. Padrão desligado, como no banco (024). */
  avisarRecibo?: boolean;
  /** Telefone de quem foi atendido. `null` = ninguém para avisar. */
  telefoneDoPaciente?: string | null;
  /** O canal de mensagens estoura — telefone que mudou de dono, WhatsApp fora do ar. */
  envioQuebra?: boolean;
  /** `cadastrarEmissor` estoura — canal fora do ar, ou recusando a profissional. */
  cadastroQuebra?: Error;
  /** A configuração fiscal lida. Padrão: a Carla, completa. */
  config?: ConfigFiscal;
} = {}) {
  const ordem: string[] = [];
  const protocolos: { reciboId: string; protocolo: string }[] = [];
  const descartados: { reciboId: string; erro: string }[] = [];
  const soltos: string[] = [];
  const fechados: DesfechoDeRecibo[] = [];
  const consultados: string[] = [];
  const avisosAnotados: string[] = [];
  let pedidoEmitido: { valor: number; cpfBeneficiario: string; cpfPagador: string; descricao: string } | null = null;

  const livro: LivroDeRecibos = {
    async abrir() {
      ordem.push("abrir");
      /* ⚠️ `numero` É O PROTOCOLO. Sai da claim porque tem que existir antes da conversa com o
       * canal — ver `ReciboAberto.numero`. */
      return p.aberto === undefined ? { id: "rec1", numero: 1042, valor: 250 } : p.aberto;
    },
    async registrarProtocolo(_t, x) { ordem.push("registrarProtocolo"); protocolos.push(x); },
    async fechar(_t, d) {
      ordem.push("fechar");
      fechados.push(d);
      if (p.fecharDevolveNull) return null;
      return {
        id: "rec1", canal: "automacao", situacao: d.situacao,
        protocolo: d.protocolo, chave: d.chave, pdfUrl: d.pdfUrl,
        pdfExpiraEm: d.pdfExpiraEm, comprovanteCaminho: d.comprovanteCaminho, aviso: null, erro: d.erro,
        criadoEm: "2026-08-24T10:00:00-03:00", emitidoEm: null,
      };
    },
    async descartar(_t, x) { ordem.push("descartar"); descartados.push(x); },
    async soltar(_t, id) { ordem.push("soltar"); soltos.push(id); return true; },
    async avisosPendentes() { return { falhou: 0, semTelefone: 0 }; },
    async registrarAviso(_t, x) { ordem.push("registrarAviso"); avisosAnotados.push(x.desfecho); },
    async destinatario() {
      ordem.push("destinatario");
      return {
        nome: "Patrícia Mendes",
        telefone: p.telefoneDoPaciente === undefined ? "11999990000" : p.telefoneDoPaciente,
        data: "2026-08-07",
        valor: 250,
      };
    },
    async porProtocolo() { return null; },
    async pendentes() { return p.pendentesDoLivro ?? []; },
    async listar() { return []; },
  };

  const emissor: EmissorDeReciboSaude = {
    canal: "automacao",
    protocoloEhNossaReferencia: p.protocoloNosso === true,
    async cadastrarEmissor() {
      ordem.push("cadastrarEmissor");
      if (p.cadastroQuebra) throw p.cadastroQuebra;
    },
    async emitir(_t, _e, pedido): Promise<ReciboAceito> {
      ordem.push("emitir");
      pedidoEmitido = pedido;
      if (p.emitirQuebra) throw new Error(p.emitirQuebra);
      return { protocolo: "prot-1", situacao: "pendente", chave: null };
    },
    async consultar(_t, prot) {
      ordem.push("consultar");
      consultados.push(prot);
      return p.desfecho ?? null;
    },
    async cancelar() {},
  };

  /* A guarda do comprovante: registra o que foi pedido e obedece `guardaFalha`. O caminho de
   * falha é o que importa mais neste port — ver `fecharReciboDoCallback`. */
  const arquivados: { protocolo: string; urlTemporaria: string }[] = [];
  const guarda: GuardaDeComprovante = {
    async arquivar(_t, x) {
      ordem.push("arquivar");
      arquivados.push(x);
      if (p.guardaFalha) return null;
      return { caminho: `t1/${x.protocolo}.pdf`, bytes: 2048 };
    },
    async linkParaBaixar() { return null; },
  };

  /* ── as três portas do aviso ao paciente ── */
  const enviadas: { para: string; textos: string[] }[] = [];
  const canal = {
    async enviar(_t: unknown, para: string, textos: string[]) {
      ordem.push("enviar");
      if (p.envioQuebra) throw new Error("o WhatsApp recusou");
      enviadas.push({ para, textos });
    },
    async escalar() {},
  } as unknown as CanalDeMensagens;

  const negocio = { async negocio() { return { nome: "Consultório Carla Guth" }; } } as unknown as RepositorioNegocio;

  const assistente = {
    async ler() {
      return {
        assistente: { nome: "MAISA", tom: "amigável", saudacao: "", ativa: true },
        cfg: {
          confirmar: true, lembrete: true, remarcar: true, encaminhar: true,
          precoCatalogo: true, pix: false, encaixe: false,
          avisarRecibo: p.avisarRecibo === true,
        },
      };
    },
    async salvar() { throw new Error("não usado"); },
  } as unknown as RepositorioAssistente;

  const recibos = {
    async pendentes() { return p.pendentes ?? [sessao()]; },
  } as unknown as RepositorioRecibos;

  return {
    emitir: criarEmitirRecibo({ livro, emissor, recibos, fiscal: fiscalDe(p.config ?? carla), guarda }),
    reconciliar: criarReconciliarRecibos({ livro, emissor }),
    fecharDoCallback: criarFecharReciboDoCallback({ livro, guarda, aviso: { canal, negocio, assistente } }),
    /* Sem as portas do aviso: é o mesmo caso de uso de antes, e tem que continuar mudo. */
    fecharSemAviso: criarFecharReciboDoCallback({ livro, guarda }),
    ordem, protocolos, descartados, soltos, fechados, consultados, arquivados, enviadas, avisosAnotados,
    get pedido() { return pedidoEmitido; },
  };
}

const linha = (over: Partial<ReciboEmitido> = {}): ReciboEmitido => ({
  id: "rec1", canal: "automacao", situacao: "pendente",
  protocolo: "prot-1", chave: null, pdfUrl: null, pdfExpiraEm: null,
  comprovanteCaminho: null, aviso: null,
  erro: null, criadoEm: "2026-08-24T10:00:00-03:00", emitidoEm: null,
  ...over,
});

/** Um desfecho de callback, com os campos que o canal manda. */
const desfechoDe = (over: Partial<DesfechoDeRecibo> = {}): DesfechoDeRecibo => ({
  protocolo: "1042", situacao: "emitido", chave: "REC-9",
  pdfUrl: "https://s3/f/1.pdf?X-Amz-Expires=300",
  pdfExpiraEm: "2026-08-24T12:05:00-03:00",
  comprovanteCaminho: null, erro: null,
  ...over,
});

describe("emitirRecibo", () => {
  /* ★ O TESTE QUE PROTEGE A GARANTIA INTEIRA. */
  it("prende o pagamento ANTES de falar com o canal", async () => {
    const a = ambiente();
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.ordem).toEqual(["cadastrarEmissor", "abrir", "emitir", "registrarProtocolo"]);
    expect(a.ordem.indexOf("abrir")).toBeLessThan(a.ordem.indexOf("emitir"));
  });

  /* ★ A REDE DE QUEM SALVOU ANTES DE 29/09/2026: o onboarding não habilitava ninguém no canal, e
   * a emissão é o único lugar por onde toda profissional passa. Antes de prender, porque falhar
   * aqui não pode trancar pagamento nenhum. */
  it("habilita a profissional no canal antes de prender o pagamento", async () => {
    const a = ambiente();
    await a.emitir(t, { fonte: "atendimento", id: "at1" });
    expect(a.ordem.indexOf("cadastrarEmissor")).toBeLessThan(a.ordem.indexOf("abrir"));
  });

  it("canal recusando a habilitação não prende o pagamento", async () => {
    const a = ambiente({ cadastroQuebra: new DadoInvalido("CPF em formato inválido", "rebots") });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" })).rejects.toThrow(/CPF em formato/);
    expect(a.ordem).toEqual(["cadastrarEmissor"]);
  });

  /* O canal recusa criar emissor sem registro, em inglês. A tela já bloqueia; a regra no núcleo é
   * para quem não passou pela tela. */
  it("sem registro no conselho, recusa antes de falar com o canal", async () => {
    const a = ambiente({ config: { ...carla, registroProfissional: "  " } });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/registro no conselho/);
    expect(a.ordem).toEqual([]);
  });

  it("termina em `pendente`, com protocolo gravado", async () => {
    const a = ambiente();
    const r = await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(r.situacao).toBe("pendente");
    expect(r.protocolo).toBe("prot-1");
    expect(a.protocolos).toEqual([{ reciboId: "rec1", protocolo: "prot-1" }]);
  });

  /* ⚠️ O valor é o que a CLAIM devolveu, não o que a lista de pendentes dizia. Tela aberta há
   * dez minutos manda total velho, e total velho aqui vira documento fiscal de valor errado. */
  it("usa o valor do banco, não o da tela", async () => {
    const a = ambiente({
      pendentes: [sessao({ valor: 999 })],
      aberto: { id: "rec1", numero: 1042, valor: 250 },
    });
    const r = await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(r.valor).toBe(250);
    expect(a.pedido?.valor).toBe(250);
  });

  /* A claim devolvendo `null` é o segundo clique, ou o lote que chegou primeiro. */
  it("pagamento já preso não emite de novo", async () => {
    const a = ambiente({ aberto: null });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/já entrou num recibo ou num lote/i);

    expect(a.ordem).toEqual(["cadastrarEmissor", "abrir"]);
  });

  /* ⚠️ Recusa do PEDIDO solta o pagamento — nada foi emitido. Sem isso, um CPF digitado errado
   * trancaria o pagamento para sempre e ele sairia do faturamento sem erro nenhum. */
  it("recusa do pedido descarta a linha e devolve o pagamento", async () => {
    const a = ambiente({ emitirQuebra: "CPF do beneficiário não é válido." });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" })).rejects.toThrow(/CPF/);

    expect(a.ordem).toEqual(["cadastrarEmissor", "abrir", "emitir", "descartar"]);
    expect(a.descartados).toEqual([
      { reciboId: "rec1", erro: "CPF do beneficiário não é válido." },
    ]);
  });

  /* ★ O BUG QUE ESTE TESTE EXISTE PARA IMPEDIR DE VOLTAR: a primeira versão chamava `fechar`
   * com o nosso `reciboId` no lugar do protocolo. `fechar` busca POR PROTOCOLO — não casava com
   * nada, a linha ficava `pendente` para sempre, e o pagamento sumia do faturamento. */
  it("no caminho de erro não chama `fechar`, que buscaria por protocolo inexistente", async () => {
    const a = ambiente({ emitirQuebra: "qualquer" });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" })).rejects.toThrow();

    expect(a.ordem).not.toContain("fechar");
    expect(a.fechados).toEqual([]);
  });

  it("pagamento fora da lista não emite", async () => {
    const a = ambiente({ pendentes: [sessao({ id: "outro" })] });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/não está na lista/i);
    expect(a.ordem).toEqual([]);
  });

  it("cliente de teste não gera recibo de verdade", async () => {
    const a = ambiente({ pendentes: [sessao({ teste: true })] });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/demonstração/i);
  });

  it("sem CPF válido, recusa antes de prender", async () => {
    const a = ambiente({ pendentes: [sessao({ cpf: null })] });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/Falta o CPF de Mariana Alves/);
    expect(a.ordem).toEqual([]);
  });

  /* A descrição é fixa por data. "Sessão" está no fixture e não pode aparecer no documento. */
  it("a descrição não leva o nome do serviço", async () => {
    const a = ambiente({ pendentes: [sessao({ servico: "Terapia de casal" })] });
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.pedido?.descricao).toBe("Atendimento realizado em 14/08/2026");
    expect(a.pedido?.descricao).not.toMatch(/terapia/i);
  });

  /* Mãe paga a terapia do filho: o pagador é ela, o beneficiário é ele. */
  it("pagador diferente vai nos dois campos certos", async () => {
    const a = ambiente({ pendentes: [sessao({ cpf: "98765432100", cpfPagador: "12345678909" })] });
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.pedido?.cpfBeneficiario).toBe("98765432100");
    expect(a.pedido?.cpfPagador).toBe("12345678909");
  });

  it("sem pagador, repete o CPF do beneficiário nos dois campos", async () => {
    const a = ambiente();
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.pedido?.cpfPagador).toBe(a.pedido?.cpfBeneficiario);
  });

  it("negócio de CNPJ não usa este caminho", async () => {
    const cnpj: ConfigFiscal = { ...carla, prestadorCpf: null, ocupacaoSaude: null, optanteMei: true, cnpj: "11222333000181" };
    const livro = {} as LivroDeRecibos;
    const emissor = { canal: "automacao" } as EmissorDeReciboSaude;
    const recibos = { async pendentes() { return []; } } as unknown as RepositorioRecibos;
    const guarda = {} as GuardaDeComprovante;
    const emitir = criarEmitirRecibo({ livro, emissor, recibos, fiscal: fiscalDe(cnpj), guarda });

    await expect(emitir(t, { fonte: "atendimento", id: "at1" }))
      .rejects.toThrow(/nota fiscal, não recibo/i);
  });
});

describe("reconciliarRecibos", () => {
  const agora = new Date("2026-08-24T12:00:00-03:00");

  it("pergunta ao canal e grava `emitido`", async () => {
    const a = ambiente({
      pendentesDoLivro: [linha()],
      desfecho: {
        protocolo: "prot-1", situacao: "emitido", chave: "REC-9",
        pdfUrl: "https://x/9.pdf", pdfExpiraEm: "2026-08-26T00:00:00-03:00",
        comprovanteCaminho: null, erro: null,
      },
    });
    const r = await a.reconciliar(t, agora);

    expect(a.consultados).toEqual(["prot-1"]);
    expect(r).toEqual({ olhados: 1, emitidos: 1, recusados: 0, aindaPendentes: 0, semProtocolo: 0 });
  });

  /* Recusa CONFIRMADA pelo canal é a única transição que devolve o pagamento para a lista. */
  it("recusa confirmada solta o pagamento", async () => {
    const a = ambiente({
      pendentesDoLivro: [linha()],
      desfecho: {
        protocolo: "prot-1", situacao: "recusado", chave: null,
        pdfUrl: null, pdfExpiraEm: null, comprovanteCaminho: null,
        erro: "Ocupação não cadastrada.",
      },
    });
    const r = await a.reconciliar(t, agora);

    expect(r.recusados).toBe(1);
    expect(a.soltos).toEqual(["rec1"]);
  });

  /* ★ O TESTE MAIS IMPORTANTE DESTE describe. `null` do canal é ambíguo — "não conheço esse
   * protocolo" ou "ainda processando" — e tratar como recusa liberaria a cascata. Se o pedido
   * tinha chegado, sai o segundo recibo. */
  it("canal que responde `null` NÃO vira recusa", async () => {
    const a = ambiente({ pendentesDoLivro: [linha()], desfecho: null });
    const r = await a.reconciliar(t, agora);

    expect(r).toEqual({ olhados: 1, emitidos: 0, recusados: 0, aindaPendentes: 1, semProtocolo: 0 });
    expect(a.soltos).toEqual([]);
    expect(a.fechados).toEqual([]);
  });

  /* ⚠️ Irreconciliável: sem protocolo não há o que perguntar. Conta, não consulta, não solta. */
  it("pendente sem protocolo é contado para olho humano, e nada mais", async () => {
    const a = ambiente({ pendentesDoLivro: [linha({ protocolo: null })] });
    const r = await a.reconciliar(t, agora);

    expect(r.semProtocolo).toBe(1);
    expect(r.olhados).toBe(0);
    expect(a.consultados).toEqual([]);
    expect(a.soltos).toEqual([]);
  });

  /* Novo demais: o callback ainda pode chegar, e consulta paga não responde nada que o webhook
   * não fosse responder de graça. */
  it("pendente recente não gasta consulta", async () => {
    const a = ambiente({
      pendentesDoLivro: [linha({ criadoEm: "2026-08-24T11:59:00-03:00" })],
    });
    const r = await a.reconciliar(t, agora);

    expect(r.aindaPendentes).toBe(1);
    expect(r.olhados).toBe(0);
    expect(a.consultados).toEqual([]);
  });

  /* A corrida normal entre webhook e reconciliação. `fechar` devolvendo `null` significa que o
   * callback fechou primeiro — não é erro, e não pode contar como emitido nem recusado. */
  it("callback que chegou primeiro não é contado duas vezes", async () => {
    const a = ambiente({
      pendentesDoLivro: [linha()],
      fecharDevolveNull: true,
      desfecho: {
        protocolo: "prot-1", situacao: "emitido", chave: "REC-9",
        pdfUrl: null, pdfExpiraEm: null, comprovanteCaminho: null, erro: null,
      },
    });
    const r = await a.reconciliar(t, agora);

    expect(r.olhados).toBe(1);
    expect(r.emitidos).toBe(0);
    expect(r.recusados).toBe(0);
  });

  it("nada pendente, nada a fazer", async () => {
    const a = ambiente({ pendentesDoLivro: [] });
    expect(await a.reconciliar(t, agora)).toEqual({
      olhados: 0, emitidos: 0, recusados: 0, aindaPendentes: 0, semProtocolo: 0,
    });
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * FECHAR PELO CALLBACK — o caso de uso que saiu do `route.ts`.
 *
 * ★ ELE EXISTE POR UM MOTIVO CONCRETO: os três defeitos do callback (corpo fora do envelope,
 * cancelamento lido como emissão, PDF tratado como se durasse 48h) moraram numa rota, onde
 * nenhum teste de domínio chegava. Regra de negócio em `route.ts` é regra sem rede de proteção.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("fecharReciboDoCallback", () => {
  /* ★ A ORDEM É A GARANTIA. A URL do comprovante vale CINCO MINUTOS e a API do canal não tem
   * consulta: se a cópia não acontecer antes de qualquer coisa que possa demorar, o arquivo
   * simplesmente não existe mais. "Arquivo depois" não é uma opção. */
  it("arquiva o comprovante ANTES de gravar o desfecho", async () => {
    const c = ambiente();
    await c.fecharDoCallback(t, desfechoDe());

    /* `registrarAviso` fecha a fila: mesmo com o interruptor desligado, o desfecho `desligado` é
       anotado — ver `DesfechoDoAviso`. */
    expect(c.ordem).toEqual(["arquivar", "fechar", "registrarAviso"]);
    expect(c.arquivados[0].urlTemporaria).toBe("https://s3/f/1.pdf?X-Amz-Expires=300");
  });

  it("grava o caminho da nossa cópia na linha do razão", async () => {
    const c = ambiente();
    const r = await c.fecharDoCallback(t, desfechoDe());

    expect(c.fechados[0].comprovanteCaminho).toBe("t1/1042.pdf");
    expect(r).toEqual({ desfecho: "emitido", comprovanteGuardado: true });
  });

  /* ★ O TESTE QUE MAIS IMPORTA DESTE BLOCO. Perder o PDF é ruim; perder o desfecho é
   * irreversível, porque não há a quem perguntar de novo. Se a cópia impedisse a gravação, o
   * callback voltaria erro, o canal reentregaria, e a linha ficaria `pendente` para sempre por
   * causa de um bucket que falta criar. */
  it("cópia que falha NÃO impede o desfecho de ser gravado", async () => {
    const c = ambiente({ guardaFalha: true });
    const r = await c.fecharDoCallback(t, desfechoDe());

    /* `registrarAviso` fecha a fila: mesmo com o interruptor desligado, o desfecho `desligado` é
       anotado — ver `DesfechoDoAviso`. */
    expect(c.ordem).toEqual(["arquivar", "fechar", "registrarAviso"]);
    expect(c.fechados[0].situacao).toBe("emitido");
    expect(c.fechados[0].comprovanteCaminho).toBeNull();
    expect(r).toEqual({ desfecho: "emitido", comprovanteGuardado: false });
  });

  /* Recusa não tem arquivo para guardar. Chamar a guarda aqui gastaria uma ida à rede para
   * baixar um PDF que não existe. */
  it("recusa não tenta arquivar nada", async () => {
    const c = ambiente();
    await c.fecharDoCallback(t, desfechoDe({
      situacao: "recusado", chave: null, pdfUrl: null, pdfExpiraEm: null, erro: "não emitiu",
    }));

    expect(c.ordem).not.toContain("arquivar");
  });

  /* ⚠️ A ÚNICA TRANSIÇÃO QUE REABRE A PORTA DA CASCATA, e é por isso que ela mora aqui e não na
   * rota: `podeTentarOutroCanal` só responde `true` para `recusado`. */
  it("recusa confirmada solta o pagamento de volta para a lista", async () => {
    const c = ambiente();
    const r = await c.fecharDoCallback(t, desfechoDe({
      situacao: "recusado", chave: null, pdfUrl: null, pdfExpiraEm: null, erro: "não emitiu",
    }));

    expect(c.soltos).toEqual(["rec1"]);
    expect(r.desfecho).toBe("recusado");
  });

  it("emitido NÃO solta o pagamento — o documento existe", async () => {
    const c = ambiente();
    await c.fecharDoCallback(t, desfechoDe());
    expect(c.soltos).toEqual([]);
  });

  /* ⚠️ DÍVIDA DECLARADA, e o teste existe para ela não virar surpresa: cancelar não devolve o
   * pagamento para a lista. `soltar_recibo_unitario` só aceita `recusado`, de propósito — e
   * afrouxar isso é exatamente como se emite o segundo recibo. */
  it("cancelado não solta o pagamento, e isso é decisão", async () => {
    const c = ambiente();
    const r = await c.fecharDoCallback(t, desfechoDe({
      situacao: "cancelado", pdfUrl: null, pdfExpiraEm: null,
    }));

    expect(r.desfecho).toBe("cancelado");
    expect(c.soltos).toEqual([]);
  });

  /* `null` do `fechar` = reentrega de webhook, ou a reconciliação chegou primeiro. Responder erro
   * aqui faria o canal reentregar de novo — um laço que só termina quando ele desiste. */
  it("linha já fechada devolve `ja_fechado`, e não erro", async () => {
    const c = ambiente({ fecharDevolveNull: true });
    const r = await c.fecharDoCallback(t, desfechoDe());

    expect(r).toEqual({ desfecho: "ja_fechado", comprovanteGuardado: false });
    expect(c.soltos).toEqual([]);
  });

  /* Se o desfecho já vem com caminho (outro canal, ou uma reconciliação que arquivou), não baixa
   * de novo: seria uma ida à rede para reescrever o mesmo arquivo. */
  it("desfecho que já traz caminho não é baixado outra vez", async () => {
    const c = ambiente();
    await c.fecharDoCallback(t, desfechoDe({ comprovanteCaminho: "t1/ja-tinha.pdf" }));

    expect(c.ordem).toEqual(["fechar", "registrarAviso"]);
    expect(c.fechados[0].comprovanteCaminho).toBe("t1/ja-tinha.pdf");
  });
});


/* ── ★ A CORRIDA DO CALLBACK ──────────────────────────────────────────────────
 *
 * 26/08/2026, sandbox da Rebots, recibo nº 56: o callback foi entregue, a nossa rota respondeu
 * **404 protocolo_desconhecido**, e a linha ficou `pendente` para sempre.
 *
 * A causa não era a rota. O protocolo era gravado DEPOIS da chamada ao canal — e a Rebots dispara
 * o callback de forma síncrona, dentro do próprio `POST /receipts`. Ou seja: o aviso chegou numa
 * janela em que a linha existia mas não tinha protocolo, e `tenantDoProtocolo` procura por ele.
 *
 * ⚠️ E NÃO É PROBLEMA DE SANDBOX. Em produção a janela é menor, não inexistente — e como a API
 * deles não tem consulta, um `pendente` que perdeu o callback não tem NENHUMA saída automática.
 *
 * A correção é possível porque, nesse canal, o protocolo é a nossa referência: dá para gravar
 * antes de falar com o mundo. É o que estes testes prendem. */
describe("★ protocolo gravado antes da chamada, quando é a nossa referência", () => {
  it("registrarProtocolo vem ANTES de emitir", async () => {
    const a = ambiente({ protocoloNosso: true });
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    const iRegistro = a.ordem.indexOf("registrarProtocolo");
    const iEmitir = a.ordem.indexOf("emitir");
    expect(iRegistro).toBeGreaterThanOrEqual(0);
    expect(iRegistro).toBeLessThan(iEmitir);
  });

  /* O valor gravado antes é o `numero` da linha — o mesmo que vai no `receipt_id`. */
  it("o protocolo gravado é o número da linha", async () => {
    const a = ambiente({ protocoloNosso: true });
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.protocolos[0]).toEqual({ reciboId: "rec1", protocolo: "1042" });
  });

  /* ⚠️ Canal que cunha o protocolo próprio NÃO pode ter escrita antes: não há o que escrever, e
   * inventar um valor faria a rota de callback casar a linha errada. */
  it("canal com protocolo próprio não grava antes", async () => {
    const a = ambiente();
    await a.emitir(t, { fonte: "atendimento", id: "at1" });

    expect(a.ordem.indexOf("registrarProtocolo")).toBeGreaterThan(a.ordem.indexOf("emitir"));
    expect(a.protocolos).toEqual([{ reciboId: "rec1", protocolo: "prot-1" }]);
  });

  /* Recusa do PEDIDO com o protocolo já gravado continua soltando o pagamento: nada foi emitido,
   * e a linha vira `recusado` — agora com protocolo, o que é inofensivo (nenhum callback vem para
   * um pedido que o canal recusou na hora). */
  it("recusa do canal ainda descarta a linha", async () => {
    const a = ambiente({ protocoloNosso: true, emitirQuebra: "CPF do beneficiário inválido." });
    await expect(a.emitir(t, { fonte: "atendimento", id: "at1" })).rejects.toThrow();

    expect(a.descartados).toHaveLength(1);
  });
});


/* ── ★ O AVISO AO PACIENTE ────────────────────────────────────────────────────
 *
 * A MAISA manda uma mensagem quando o recibo sai. É a primeira coisa neste domínio que fala com um
 * TERCEIRO — não com o dono — e sai do WhatsApp pessoal de quem a usa.
 *
 * ⚠️ Por isso três coisas são travadas aqui, e nenhuma é detalhe:
 *
 *   · **É opt-in.** `avisarRecibo` nasce `false` no banco (024). Sem ele, silêncio.
 *   · **Só quando o recibo EXISTE.** Recusa e cancelamento não viram mensagem.
 *   · **Nunca derruba a gravação.** A rota do callback responde 200 para o canal descartar o
 *     desfecho; um erro de envio virando exceção faria a rota responder 500, o canal reentregaria,
 *     e a mesma pessoa receberia a mensagem de novo — ou o laço não terminaria. */
describe("★ avisar o paciente quando o recibo sai", () => {
  it("com o interruptor ligado, manda a notícia para quem foi atendido", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe());

    expect(a.enviadas).toHaveLength(1);
    expect(a.enviadas[0].para).toBe("11999990000");
    /* A frase é a do domínio (`avisoDeRecibo`), a mesma do lote — uma notícia, uma voz. */
    expect(a.enviadas[0].textos[0]).toContain("Patrícia");
    expect(a.enviadas[0].textos[0]).toContain("Receita Saúde");
  });

  /* ★ O PADRÃO É NÃO FALAR. */
  it("com o interruptor desligado, não manda nada", async () => {
    const a = ambiente({ avisarRecibo: false });
    await a.fecharDoCallback(t, desfechoDe());

    expect(a.enviadas).toEqual([]);
  });

  it("sem as portas do aviso, o caso de uso continua mudo", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharSemAviso(t, desfechoDe());

    expect(a.enviadas).toEqual([]);
  });

  /* ⚠️ Recusa não é notícia para o paciente: é problema de dado, e quem resolve é o dono. */
  it("recibo recusado não vira mensagem", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe({ situacao: "recusado", chave: null, erro: "CPF inválido" }));

    expect(a.enviadas).toEqual([]);
  });

  /* Cancelamento o dono já sabe — foi ele quem pediu. */
  it("cancelamento não vira mensagem", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe({ situacao: "cancelado" }));

    expect(a.enviadas).toEqual([]);
  });

  /* ★ REENTREGA NÃO MANDA DUAS MENSAGENS. `fechar` devolve `null` quando a linha já não estava na
   * situação de partida, e é isso que corta o caminho antes do aviso. Sem esta garantia, um
   * callback reentregue (que a doc deles prevê) mandaria a mesma notícia de novo. */
  it("callback reentregue não avisa de novo", async () => {
    const a = ambiente({ avisarRecibo: true, fecharDevolveNull: true });
    await a.fecharDoCallback(t, desfechoDe());

    expect(a.enviadas).toEqual([]);
  });

  it("sem telefone, ninguém é avisado — e não é erro", async () => {
    const a = ambiente({ avisarRecibo: true, telefoneDoPaciente: null });
    const r = await a.fecharDoCallback(t, desfechoDe());

    expect(a.enviadas).toEqual([]);
    expect(r.desfecho).toBe("emitido");
  });

  /* ★ O TESTE QUE PROTEGE O 200 DA ROTA. */
  it("⚠️ falha no envio NÃO derruba o fechamento", async () => {
    const a = ambiente({ avisarRecibo: true, envioQuebra: true });
    const r = await a.fecharDoCallback(t, desfechoDe());

    expect(r.desfecho).toBe("emitido");
    expect(a.fechados).toHaveLength(1);
  });

  /* A ordem importa: a mensagem promete um recibo, e a promessa só é verdade depois de gravado. */
  it("avisa DEPOIS de gravar o desfecho", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe());

    expect(a.ordem.indexOf("fechar")).toBeLessThan(a.ordem.indexOf("enviar"));
  });
});


/* ── ★ O DESFECHO DO AVISO VIRA DADO ─────────────────────────────────────────
 *
 * 26/08/2026: 20 recibos emitidos, 1 mensagem entregue, 19 recusadas pelo WhatsApp (`exists:
 * false`). O sistema agiu certo — mas as 19 falhas foram idênticas a 19 sucessos, e o dono só
 * percebeu porque contou.
 *
 * ⚠️ O erro continua ENGOLIDO: o recibo já existe, e mensagem que não sai não desemite documento
 * fiscal. O que muda é que o QUE aconteceu vira coluna (025). Engolir sem anotar é esconder. */
describe("★ o desfecho do aviso é anotado", () => {
  it("enviado", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe());
    expect(a.avisosAnotados).toEqual(["enviado"]);
  });

  it("sem telefone vira `sem_telefone`, não `falhou`", async () => {
    const a = ambiente({ avisarRecibo: true, telefoneDoPaciente: null });
    await a.fecharDoCallback(t, desfechoDe());
    expect(a.avisosAnotados).toEqual(["sem_telefone"]);
  });

  it("canal recusando vira `falhou`", async () => {
    const a = ambiente({ avisarRecibo: true, envioQuebra: true });
    await a.fecharDoCallback(t, desfechoDe());
    expect(a.avisosAnotados).toEqual(["falhou"]);
  });

  /* ★ `desligado` NÃO É `null` NEM `falhou`. "Ele não quis" e "tentamos e não deu" são opostos:
   * um é escolha, o outro é um paciente que ficou sem saber. */
  it("interruptor desligado vira `desligado`", async () => {
    const a = ambiente({ avisarRecibo: false });
    await a.fecharDoCallback(t, desfechoDe());
    expect(a.avisosAnotados).toEqual(["desligado"]);
  });

  it("recusado e cancelado não anotam nada — aviso só existe para emitido", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe({ situacao: "recusado", chave: null }));
    await a.fecharDoCallback(t, desfechoDe({ situacao: "cancelado" }));
    expect(a.avisosAnotados).toEqual([]);
  });

  /* ⚠️ Anotar é a ÚLTIMA coisa: depois de gravar o desfecho fiscal e depois de tentar mandar. */
  it("anota depois de fechar e depois de enviar", async () => {
    const a = ambiente({ avisarRecibo: true });
    await a.fecharDoCallback(t, desfechoDe());
    expect(a.ordem.indexOf("fechar")).toBeLessThan(a.ordem.indexOf("registrarAviso"));
    expect(a.ordem.indexOf("enviar")).toBeLessThan(a.ordem.indexOf("registrarAviso"));
  });
});
