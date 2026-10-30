/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — receber do cliente pelo Pix na chave do profissional (27/10/2026).
 *
 * ★ Pedido do Bruno, vindo do Smiller. O que cada coisa é está em `dominio/recebimentos.ts`; aqui
 * fica a ordem das coisas:
 *
 *   1 · a rotina (`CobrarAtendimentos`, de 5 em 5 minutos, pelo pg_cron da 038): o atendimento
 *       que acabou vira um recebimento, que pergunta ao dono ou manda o Pix direto; quem paga
 *       "por mês" ganha o Pix do mês no dia do recibo; e a pergunta "já está pago?" vai ao
 *       WhatsApp do dono, uma por vez.
 *   2 · a conversa (o agente chama, sem passar pelo modelo): o comprovante que o cliente manda,
 *       o CPF que a MAISA pediu e o "1"/"2" do dono.
 *   3 · o painel: os ajustes, o "Mandar Pix", a decisão e a conferência do comprovante.
 *   4 · depois de pago (`quitar`): a confirmação ao cliente e o documento que a MAISA já emite,
 *       pelo caminho que `caminhoDaNota` escolhe. Um pagamento, um documento: é a unidade que a
 *       Receita pede para o recibo ("na data do pagamento"), e a nota leva só o que foi pago.
 *
 * ── ⚠️ NADA AQUI MANDA MENSAGEM DIRETO ──
 *
 * Tudo vai pela fila de envios (`origem: cobranca`): uma por vez por negócio, espaçada, com o
 * "digitando…" da rotina. A exceção é a resposta ao comprovante e ao dono, que o agente manda na
 * própria conversa, no ritmo dela.
 *
 * ── O QUE VEM DEPOIS DA DECISÃO RODA COMO ROTINA ──
 *
 * A decisão é de quem decidiu: a transição grava o ator do painel (ou do agente), e a função do
 * banco confere que o negócio é dele. O que vem depois (o Pix na fila, a conversa anotada, o
 * pedido de CPF, o recibo ou a nota) roda num contexto de sistema, como o recibo automático: quem
 * age ali é a MAISA, e as claims da nota e do recibo e as anotações do recebimento são de service
 * role. Rodando com a sessão do dono, a RLS (que só deixa ler) engoliria a anotação do CPF pedido
 * sem erro, e a resposta do cliente nunca acharia o pedido.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  AbrirContaDeRecebimentos, CobrarAtendimentos, ConfirmarComprovante, DecidirRecebimento, DescartarComprovante,
  DocumentoDoPagamento, EmitirNota, EmitirRecibo, GuardarCpfDaConversa, LerRecebimentos, MandarPix, ReceberAvisoDePagamento,
  ReceberComprovante, ResponderAoDono, ResultadoDosRecebimentos, SalvarConfigDeRecebimentos, TemPixEmAberto,
} from "../portas/entrada/casos-de-uso";
import type { DadosDoTitular, ProvedorDeRecebimentos } from "../portas/saida/provedor-de-recebimentos";
import type { FilaDeEnvios } from "../portas/saida/fila-de-envios";
import type { LeitorDeComprovanteDePagamento } from "../portas/saida/leitor-de-comprovante-de-pagamento";
import type { RepositorioHistorico } from "../portas/saida/memoria-cliente";
import type { RepositorioCanal } from "../portas/saida/repositorio-canal";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RepositorioRecebimentos } from "../portas/saida/repositorio-recebimentos";
import { faltaParaEmitirRecibo } from "../dominio/checklist-recibo";
import { cpfValido, emailPlausivel, soDigitos } from "../dominio/clientes";
import { chaveDe } from "../dominio/contatos";
import { DadoInvalido, NaoConfigurado, NaoEncontrado } from "../dominio/erros";
import { caminhoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { chavePix, cnpjValido, ehTipoDeChave, pixCopiaECola, PIX_CIDADE_MAX, PIX_NOME_MAX, textoDoPix, type TipoDeChavePix } from "../dominio/pix";
import {
  AGRADECIMENTO_DO_CPF, avisoDeComprovanteAoDono, codigoNaConversa, conferirCodigoDoPix, COMPROVANTE_REPETIDO, confirmacaoDoPagamento,
  conferirRecebedor, cpfNaMensagem, decisaoDoDono, descricaoDoRecebimento, ehDepoisDoAtendimento,
  avisoDePagamentoForaDeHoraAoDono, identificadorDoRecebimento, janelaDepoisDoAtendimento, mensagensDaCobranca, mensagensDoPix,
  pedidoDeCpf, perguntaAoDono, resumoParaANota,
  perguntaValendo, pixFaltando, respostaAoComprovante, respostaAoDono, soOCpf, sugerirRecebimento,
  type AtendimentoACobrar, type ConfigDeRecebimentos, type MotivoDoCpf, type Recebimento,
} from "../dominio/recebimentos";
import { corteDoRecibo, diaDoReciboAlcancado, mesQueOReciboFecha, numeroDaDona, ULTIMO_DIA_DO_MES } from "../dominio/recibo-automatico";
import { ehUuid } from "../dominio/agenda";
import { rotuloDoAtor, type ContextoTenant } from "../dominio/tenant";
import { hojeISO, mesDe, somarDias, somarMeses } from "../dominio/tempo";

export type DepsRecebimentos = {
  recebimentos: RepositorioRecebimentos;
  leitor: LeitorDeComprovanteDePagamento;
  fila: FilaDeEnvios;
  /** Para a mensagem do Pix entrar na conversa do cliente: se ele responder, a MAISA sabe do quê. */
  historico: RepositorioHistorico;
  /** O CPF da ficha, e guardar o que o cliente mandou. */
  negocio: RepositorioNegocio;
  /** O caminho do documento e o CPF ou CNPJ do profissional, para conferir o comprovante. */
  fiscal: RepositorioFiscal;
  /** O número de avisos do dono (`telefoneDono`) e o número conectado. */
  canalDoNegocio: RepositorioCanal;
  emitirRecibo: EmitirRecibo;
  emitirNota: EmitirNota;
  novoId: () => string;
  /** Esvaziar a fila logo depois de enfileirar, em segundo plano. Sem ele, sai no próximo tique. */
  drenar?: (t: ContextoTenant) => void;
  /** A opção B (o Asaas), atrás de flag. Sem ele, ou desligado, tudo é o Pix estático. */
  provedor?: ProvedorDeRecebimentos;
  /** Só o teste troca. */
  relogio?: () => number;
};

const SISTEMA = { tipo: "sistema", rotina: "recebimentos" } as const;
const contextoDeSistema = (tenantId: string): ContextoTenant => ({ tenantId, usuarioId: "", ator: SISTEMA });
const comoSistema = (t: ContextoTenant): ContextoTenant => ({ ...t, ator: SISTEMA });

const DIA_MS = 24 * 60 * 60_000;

/** O que dizer quando a chave não é do tipo escolhido. */
const CHAVE_DO_TIPO: Record<TipoDeChavePix, string> = {
  cpf: "um CPF válido",
  cnpj: "um CNPJ válido",
  telefone: "um celular com DDD",
  email: "um e-mail",
  aleatoria: "uma chave aleatória (letras, números e tracinhos, como o banco mostra)",
};

const porCriacao = (a: Recebimento, b: Recebimento) => (a.criadoEm < b.criadoEm ? -1 : 1);

const TIPOS_DE_EMPRESA = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const;

/** O formulário de abrir conta, conferido antes de ir ao provedor: o que ele recusaria, em português. */
export function titularConferido(d: DadosDoTitular): DadosDoTitular {
  const documento = soDigitos(d.documento);
  const pf = documento.length === 11;
  if (pf ? !cpfValido(documento) : !(documento.length === 14 && cnpjValido(documento))) {
    throw new DadoInvalido("Confira o CPF ou o CNPJ.", "documento");
  }
  if ((d.nome ?? "").trim().length < 3) throw new DadoInvalido(pf ? "Diga o seu nome completo." : "Diga a razão social.", "nome");
  if (!emailPlausivel((d.email ?? "").trim())) throw new DadoInvalido("Confira o e-mail.", "email");
  const celular = soDigitos(d.celular).replace(/^55(?=\d{10,11}$)/, "");
  if (celular.length < 10 || celular.length > 11) throw new DadoInvalido("O celular precisa do DDD.", "celular");
  if (soDigitos(d.cep).length !== 8) throw new DadoInvalido("O CEP tem 8 números.", "cep");
  for (const [campo, frase] of [["endereco", "a rua"], ["numero", "o número"], ["bairro", "o bairro"]] as const) {
    if (!String(d[campo] ?? "").trim()) throw new DadoInvalido(`Falta ${frase}.`, campo);
  }
  if (!(Number(d.faturamentoMensal) > 0)) throw new DadoInvalido("Diga quanto entra por mês, mais ou menos.", "faturamentoMensal");
  if (pf && !/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento ?? "")) throw new DadoInvalido("Falta a data de nascimento.", "nascimento");
  if (!pf && !(TIPOS_DE_EMPRESA as readonly string[]).includes(d.tipoDeEmpresa ?? "")) {
    throw new DadoInvalido("Escolha o tipo da empresa.", "tipoDeEmpresa");
  }
  return {
    ...d,
    documento,
    nome: d.nome.trim(),
    email: d.email.trim(),
    celular,
    cep: soDigitos(d.cep),
    faturamentoMensal: Number(d.faturamentoMensal),
    nascimento: pf ? d.nascimento : null,
    tipoDeEmpresa: pf ? null : d.tipoDeEmpresa,
  };
}

export function criarRecebimentos(deps: DepsRecebimentos) {
  const agora = () => (deps.relogio ?? Date.now)();
  const agoraISO = () => new Date(agora()).toISOString();

  /** Põe na fila e, quando for conversa com o cliente, anota na thread dele. */
  async function enfileirar(t: ContextoTenant, para: string, textos: string[], naConversa?: string[]) {
    await deps.fila.enfileirar(t, [{ para, textos, origem: "cobranca" }]);
    deps.drenar?.(t);
    if (naConversa?.length) await deps.historico.anexar(t, para, naConversa.map((txt) => ({ de: "bot" as const, txt })));
  }

  async function configPronta(t: ContextoTenant): Promise<ConfigDeRecebimentos> {
    const c = await deps.recebimentos.config(t);
    const falta = pixFaltando(c);
    if (falta.length) throw new NaoConfigurado(falta);
    return c;
  }

  async function mandarOPix(t: ContextoTenant, r: Recebimento, c: ConfigDeRecebimentos): Promise<void> {
    const codigo = pixCopiaECola({ chave: c.chave!, nome: c.nome, cidade: c.cidade, valor: r.valor, identificador: r.identificador });
    const [texto, cod] = mensagensDoPix({ nome: r.nome, valor: r.valor, descricao: r.descricao, codigo });
    await enfileirar(t, r.telefone, [texto, cod], [texto, codigoNaConversa(r.valor)]);
  }

  /**
   * A cobrança sai pelo Asaas quando a opção B está ligada, a conta do negócio aprovada e a ficha tem
   * CPF. Sem CPF, a MAISA pede uma vez e a cobrança espera a resposta (Bruno, 27/10/2026: "pergunta
   * uma vez, salva, e depois consegue ficar enviando"). Fora isso (opção B desligada, sem ficha, o
   * CPF pedido e não respondido, ou o dono apertando "Mandar Pix" de novo), o Pix estático.
   */
  async function mandarCobranca(t: ContextoTenant, r: Recebimento, c: ConfigDeRecebimentos, o: { pixDireto?: boolean } = {}): Promise<void> {
    const provedor = deps.provedor;
    if (!o.pixDireto && provedor?.disponivel() && (await provedor.conta(t).catch(() => null))?.situacao === "aprovada") {
      const cliente = r.clienteId ? await deps.negocio.cliente(t, r.clienteId).catch(() => null) : null;
      if (cliente && cpfValido(cliente.cpf)) {
        /* Só a emissão no `try`: se o Asaas falhar, o cliente recebe o Pix estático em vez de nada. Uma
         * falha depois de emitir (gravar, enfileirar) não pode virar Pix estático: seria cobrar duas vezes. */
        const cobranca = await provedor
          .emitir(t, {
            referencia: r.id,
            valor: r.valor,
            vencimento: somarDias(hojeISO(agora()), 3),
            descricao: r.descricao,
            pagador: { nome: cliente.nome, documento: soDigitos(cliente.cpf), telefone: r.telefone, referencia: cliente.id },
          })
          .catch((e) => {
            console.warn(`[aplicacao/recebimentos] ${t.tenantId}: o Asaas não emitiu a cobrança ${r.id}, vai o Pix estático: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          });
        if (cobranca) {
          await deps.recebimentos.anotar(t, r.id, { cobranca: { idExterno: cobranca.idExterno, link: cobranca.link } });
          const mensagens = mensagensDaCobranca({ nome: r.nome, valor: r.valor, descricao: r.descricao, link: cobranca.link, pix: cobranca.pixCopiaECola });
          await enfileirar(t, r.telefone, mensagens, cobranca.pixCopiaECola ? [mensagens[0], codigoNaConversa(r.valor)] : mensagens);
          return;
        }
      } else if (cliente && !r.cpfPedidoEm) {
        await pedirCpf(t, r, "cobranca");
        return;
      }
    }
    await mandarOPix(t, r, c);
  }

  /**
   * A mesma cobrança, de novo. A do Asaas vai com o mesmo link (não se emite outra); a que esperava o
   * CPF, e o dono apertou, vai no Pix estático; o resto, o mesmo Pix.
   */
  async function reenviar(t: ContextoTenant, r: Recebimento, c: ConfigDeRecebimentos): Promise<void> {
    if (r.meio === "asaas" && r.link) {
      const mensagens = mensagensDaCobranca({ nome: r.nome, valor: r.valor, descricao: r.descricao, link: r.link, pix: null });
      await enfileirar(t, r.telefone, mensagens, mensagens);
      return;
    }
    await mandarCobranca(t, r, c, { pixDireto: Boolean(r.cpfPedidoEm) });
  }

  /**
   * A cobrança do Asaas que não vale mais (paga por outro caminho, ou "não cobrar") sai do ar, para o
   * cliente não pagar duas vezes pelo link que ainda tem. Falha aqui é log: a decisão já está gravada.
   */
  async function retirarDoProvedor(t: ContextoTenant, r: Recebimento): Promise<void> {
    if (r.meio !== "asaas" || !r.idExterno || !deps.provedor) return;
    await deps.provedor.cancelar(t, r.idExterno).catch((e) => {
      console.warn(`[aplicacao/recebimentos] ${t.tenantId}: a cobrança ${r.idExterno} continua no Asaas: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  function criarRecebimento(t: ContextoTenant, atendimentos: AtendimentoACobrar[], situacao: "perguntar" | "aberto") {
    const id = deps.novoId();
    return deps.recebimentos.criar(t, {
      id,
      identificador: identificadorDoRecebimento(id),
      situacao,
      descricao: descricaoDoRecebimento(atendimentos),
      atendimentoIds: atendimentos.map((a) => a.id),
    });
  }

  /**
   * O WhatsApp do dono que NOTIFICA: o número de avisos, quando é outro que não o conectado.
   *
   * Quando a MAISA roda no próprio número do barbeiro (o caso comum), mandar "para ele" é a
   * conversa dele consigo mesmo: aparece como enviada por ele, sem notificação, e a resposta dele
   * ali chega como `fromMe`, que a entrada descarta. Aí a pergunta fica só no painel, até existir
   * uma conta da MAISA que fale com os profissionais (pedido do Bruno, 27/10/2026).
   */
  async function whatsDoDono(t: ContextoTenant): Promise<string | null> {
    const canal = await deps.canalDoNegocio.ler(t).catch(() => null);
    const dono = canal?.telefoneDono ?? null;
    return dono && chaveDe(dono) && chaveDe(dono) !== chaveDe(canal?.numero) ? dono : null;
  }

  /** A próxima pergunta "já está pago?", se nenhuma estiver valendo. Uma por vez: ver `PERGUNTA_VALE_MS`. */
  async function perguntarAoDono(t: ContextoTenant): Promise<boolean> {
    const dono = await whatsDoDono(t);
    if (!dono) return false;
    const rs = await deps.recebimentos.emAberto(t);
    if (perguntaValendo(rs, agora())) return false;
    const proxima = rs.filter((r) => r.situacao === "perguntar" && !r.perguntadoEm).sort(porCriacao)[0];
    if (!proxima) return false;
    /* Anota antes de enfileirar: a rodada seguinte não pergunta a mesma. */
    await deps.recebimentos.anotar(t, proxima.id, { perguntadoEm: agoraISO() });
    await enfileirar(t, dono, [perguntaAoDono(proxima)]);
    return true;
  }

  /* ───────────── 4 · depois de pago ───────────── */

  async function pedirCpf(t: ContextoTenant, r: Recebimento, motivo: MotivoDoCpf): Promise<DocumentoDoPagamento> {
    if (r.cpfPedidoEm) return { tipo: "pediu_cpf" };
    /* Pergunta UMA vez (Bruno, 27/10/2026): se já pediu a esta pessoa e ela não respondeu, este
     * pagamento só entra na espera. Quando o CPF chegar, saem os documentos de todos. */
    const jaPediu = (await deps.recebimentos.esperandoCpf(t, r.telefone)).length > 0;
    await deps.recebimentos.anotar(t, r.id, { cpfPedidoEm: agoraISO() });
    if (!jaPediu) {
      const texto = pedidoDeCpf(motivo);
      await enfileirar(t, r.telefone, [texto], [texto]);
    }
    return { tipo: "pediu_cpf" };
  }

  /** O documento que a MAISA já emite para este negócio, só dos atendimentos deste pagamento.
   *  `t` já é o contexto de sistema (ver o cabeçalho). */
  async function emitirDocumento(t: ContextoTenant, r: Recebimento, podePedirCpf: boolean): Promise<DocumentoDoPagamento> {
    const hoje = hojeISO(agora());
    const config = await deps.fiscal.ler(t).catch(() => null);
    if (!config || !r.clienteId) return { tipo: "nenhum" };
    const caminho = caminhoDaNota(config, hoje);
    const recibo = caminho === "recibo_saude";
    /* Quem não terminou de ligar o recibo ou a nota na MAISA não emite por ela: o pagamento fica
     * registrado, e os atendimentos seguem na lista do que falta emitir, como hoje. */
    if ((recibo ? faltaParaEmitirRecibo(config, hoje) : fiscalFaltando(config, hoje)).length) return { tipo: "nenhum" };

    const cliente = await deps.negocio.cliente(t, r.clienteId).catch(() => null);
    if (!cliente) return { tipo: "nenhum" };
    if (!cpfValido(cliente.cpf)) return podePedirCpf ? pedirCpf(t, r, recibo ? "recibo" : "nota") : { tipo: "nenhum" };

    try {
      if (recibo) {
        await deps.emitirRecibo(t, { itens: r.atendimentoIds.map((id) => ({ fonte: "atendimento" as const, id })) });
        return { tipo: "recibo" };
      }
      const resumo = resumoParaANota(await deps.recebimentos.atendimentosDoRecebimento(t, r.id).catch(() => []));
      await deps.emitirNota(t, { clienteId: r.clienteId, atendimentoIds: r.atendimentoIds, ...(resumo ? { resumo } : {}) });
      return { tipo: "nota" };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn(`[aplicacao/recebimentos] ${t.tenantId}: pago, mas o documento do recebimento ${r.id} não saiu: ${motivo}`);
      return { tipo: "falhou", motivo };
    }
  }

  /** O cliente fica sabendo (quando o Pix tinha ido para ele), e o documento sai. */
  async function quitar(t: ContextoTenant, r: Recebimento, avisarCliente: boolean): Promise<DocumentoDoPagamento> {
    if (avisarCliente) {
      const texto = confirmacaoDoPagamento(r.valor);
      await enfileirar(t, r.telefone, [texto], [texto]);
    }
    return emitirDocumento(t, r, true);
  }

  /* ───────────── 3 · o painel ───────────── */

  const decidir: DecidirRecebimento = async (t, p) => {
    if (!["pagou", "pix", "nao_cobrar"].includes(p.decisao)) throw new DadoInvalido("Escolha: já pagou, mandar o Pix ou não cobrar.", "decisao");
    const por = rotuloDoAtor(t.ator);
    const jaFoi = () => new DadoInvalido("Esta cobrança já foi decidida. Atualize a tela.");

    if (p.decisao === "pix") {
      const c = await configPronta(t);
      /* Já em aberto: é o "Mandar de novo" da tela. */
      const atual = await deps.recebimentos.porId(t, p.id);
      if (atual?.situacao === "aberto") {
        await reenviar(comoSistema(t), atual, c);
        return { recebimento: atual, documento: { tipo: "nenhum" } };
      }
      const r = await deps.recebimentos.mudar(t, p.id, { de: ["perguntar"], para: "aberto", por });
      if (!r) throw jaFoi();
      await mandarCobranca(comoSistema(t), r, c);
      return { recebimento: r, documento: { tipo: "nenhum" } };
    }

    if (p.decisao === "pagou") {
      const antes = await deps.recebimentos.porId(t, p.id);
      if (!antes) throw new NaoEncontrado("Cobrança não encontrada.");
      /* Com o Pix já mandado, "pagou" é o dono vendo o dinheiro no banco, sem comprovante. Sem Pix,
       * é o pagamento na hora, em dinheiro ou cartão, e o cliente não precisa de mensagem. */
      const pixFoi = antes.situacao === "aberto";
      const r = await deps.recebimentos.mudar(t, p.id, { de: ["perguntar", "aberto"], para: "pago", forma: pixFoi ? "pix" : "na_hora", por });
      if (!r) throw jaFoi();
      await retirarDoProvedor(comoSistema(t), r);
      return { recebimento: r, documento: await quitar(comoSistema(t), r, pixFoi) };
    }

    const r = await deps.recebimentos.mudar(t, p.id, { de: ["perguntar", "aberto"], para: "cancelado", por });
    if (!r) throw jaFoi();
    await retirarDoProvedor(comoSistema(t), r);
    return { recebimento: r, documento: { tipo: "nenhum" } };
  };

  const mandarPix: MandarPix = async (t, p) => {
    const c = await configPronta(t);
    const a = await deps.recebimentos.atendimentoPorAg(t, p.maisaAg);
    if (!a) throw new NaoEncontrado("Atendimento não encontrado.");

    if (a.recebimentoId) {
      const r = await deps.recebimentos.porId(t, a.recebimentoId);
      if (r?.situacao === "pago") throw new DadoInvalido("Este atendimento já está pago.");
      if (r?.situacao === "perguntar") return (await decidir(t, { id: r.id, decisao: "pix" })).recebimento;
      /* Já em aberto: manda de novo. É o "o cliente pediu o código outra vez". */
      if (r?.situacao === "aberto") {
        await reenviar(comoSistema(t), r, c);
        return r;
      }
    }

    if (!a.telefone) throw new DadoInvalido("Este atendimento não tem telefone para mandar o Pix.", "telefone");
    if (!(a.valor > 0)) throw new DadoInvalido("Este atendimento não tem valor. Ponha o valor e tente de novo.", "valor");
    const r = await criarRecebimento(t, [a], "aberto");
    if (!r) throw new DadoInvalido("Este atendimento acabou de entrar numa cobrança. Atualize a tela.");
    await mandarCobranca(comoSistema(t), r, c);
    return r;
  };

  const confirmarComprovante: ConfirmarComprovante = async (t, p) => {
    const comprovante = (await deps.recebimentos.comprovantes(t, { situacao: "a_conferir" })).find((c) => c.id === p.id);
    if (!comprovante) throw new DadoInvalido("Este comprovante já foi conferido. Atualize a tela.");
    const alvo = p.recebimentoId || comprovante.recebimentoId;
    if (!alvo) throw new DadoInvalido("Escolha qual cobrança este comprovante paga.", "recebimentoId");
    const r = await deps.recebimentos.confirmarComprovante(t, { id: p.id, recebimentoId: alvo, por: rotuloDoAtor(t.ator) });
    await retirarDoProvedor(comoSistema(t), r);
    return { recebimento: r, documento: await quitar(comoSistema(t), r, true) };
  };

  const descartarComprovante: DescartarComprovante = async (t, p) => {
    const motivo = (p.motivo ?? "").trim();
    if (!motivo) throw new DadoInvalido("Diga por que o comprovante foi descartado.", "motivo");
    const descartou = await deps.recebimentos.descartarComprovante(t, { id: p.id, motivo, por: rotuloDoAtor(t.ator) });
    if (!descartou) throw new DadoInvalido("Este comprovante já foi conferido. Atualize a tela.");
  };

  const lerRecebimentos: LerRecebimentos = async (t) => {
    const provedor = deps.provedor?.disponivel() ? deps.provedor : null;
    const [config, emAberto, comprovantes, recebidos, conta] = await Promise.all([
      deps.recebimentos.config(t),
      deps.recebimentos.emAberto(t),
      deps.recebimentos.comprovantes(t, { situacao: "a_conferir" }),
      deps.recebimentos.pagos(t, { desde: new Date(agora() - 30 * DIA_MS).toISOString() }),
      /* Conferida a cada leitura enquanto não foi aprovada: é a tela que mostra o que falta enviar. */
      provedor ? provedor.conta(t, { conferir: true }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      config,
      faltando: pixFaltando(config),
      paraDecidir: emAberto.filter((r) => r.situacao === "perguntar"),
      abertos: emAberto.filter((r) => r.situacao === "aberto"),
      comprovantes,
      recebidos,
      asaas: { disponivel: Boolean(provedor), conta },
    };
  };

  const salvarConfig: SalvarConfigDeRecebimentos = async (t, p) => {
    const bruta = (p.chave ?? "").trim();
    const tipo = p.tipoDaChave || null;
    if (tipo !== null && !ehTipoDeChave(tipo)) throw new DadoInvalido("Escolha o tipo da chave Pix.", "tipoDaChave");

    let chave: string | null = null;
    if (bruta) {
      if (!tipo) throw new DadoInvalido("Escolha o tipo da chave Pix.", "tipoDaChave");
      chave = chavePix(tipo, bruta);
      if (!chave) throw new DadoInvalido(`Essa chave não é ${CHAVE_DO_TIPO[tipo]}. Confira e tente de novo.`, "chave");
    }
    const nome = textoDoPix(p.nome, PIX_NOME_MAX) || null;
    if (chave && !nome) throw new DadoInvalido("Diga o nome de quem recebe, como aparece no banco.", "nome");
    if (!ehDepoisDoAtendimento(p.depoisDoAtendimento)) {
      throw new DadoInvalido("Escolha o que a MAISA faz depois do atendimento.", "depoisDoAtendimento");
    }

    /* Sem chave, nada é cobrado: o "depois do atendimento" desliga junto. Ligar de novo marca a
     * hora, e só o que acabar depois dela entra na cobrança sozinha. */
    const depois = chave ? p.depoisDoAtendimento : "desligado";
    const antes = await deps.recebimentos.config(t);
    const ligadoEm =
      depois === "desligado" ? null : antes.depoisDoAtendimento !== "desligado" && antes.ligadoEm ? antes.ligadoEm : agoraISO();

    const config: ConfigDeRecebimentos = {
      tipoDaChave: chave ? tipo : null,
      chave,
      nome,
      cidade: textoDoPix(p.cidade, PIX_CIDADE_MAX) || null,
      depoisDoAtendimento: depois,
      ligadoEm,
    };
    await deps.recebimentos.salvarConfig(t, config);
    return config;
  };

  /* ───────────── a opção B: a subconta e o aviso ───────────── */

  const abrirContaDeRecebimentos: AbrirContaDeRecebimentos = async (t, d) => {
    const provedor = deps.provedor;
    if (!provedor?.disponivel()) throw new NaoConfigurado(["RECEBIMENTOS_ASAAS", "ASAAS_PLATAFORMA_CHAVE"]);
    if (pixFaltando(await deps.recebimentos.config(t)).length) {
      throw new DadoInvalido("Ligue o Pix primeiro, aqui em Recebimentos. A conta para cartão e boleto vem depois.");
    }
    return provedor.abrirConta(t, titularConferido(d));
  };

  const receberAvisoDePagamento: ReceberAvisoDePagamento = async (t, corpo) => {
    const evento = deps.provedor?.lerEvento(corpo) ?? null;
    /* A referência é o id do recebimento. Outra coisa (uma cobrança criada à mão no Asaas) não é nossa:
     * ir ao banco com ela dava erro de uuid, a rota respondia erro e a fila de avisos do Asaas parava. */
    if (!evento || evento.tipo === "ignorado" || !evento.referencia || !ehUuid(evento.referencia)) return { status: "ignorado" };
    const r = await deps.recebimentos.porId(t, evento.referencia);
    if (!r) return { status: "ignorado" };
    if (evento.tipo === "paga") {
      const pago = await deps.recebimentos.mudar(t, r.id, { de: ["perguntar", "aberto"], para: "pago", forma: "asaas", por: "Asaas" });
      if (!pago) {
        /* O cliente pagou pelo link uma cobrança que já estava fechada: o dinheiro entrou, e o dono
         * precisa saber. A mesma cobrança paga pelo Asaas duas vezes (o aviso reentregue) não avisa. */
        if (!(r.situacao === "pago" && r.forma === "asaas")) {
          const dono = numeroDaDona(await deps.canalDoNegocio.ler(t).catch(() => null));
          if (dono) await enfileirar(comoSistema(t), dono, [avisoDePagamentoForaDeHoraAoDono(r)]).catch(() => {});
        }
        return { status: "ja_estava" };
      }
      return { status: "pago", documento: await quitar(comoSistema(t), pago, true) };
    }
    if (evento.tipo === "cancelada") {
      const cancelado = await deps.recebimentos.mudar(t, r.id, { de: ["aberto"], para: "cancelado", por: "Asaas" });
      return { status: cancelado ? "cancelado" : "ja_estava" };
    }
    /* Estorno: o dinheiro voltou ao cliente pelo Asaas. O recibo ou a nota já saíram; desfazer é
     * decisão do dono, e ela fica no painel do Asaas. */
    return { status: "ignorado" };
  };

  /* ───────────── 2 · a conversa ───────────── */

  const temPixEmAberto: TemPixEmAberto = async (t, telefone) =>
    (await deps.recebimentos.emAberto(t, { telefone })).some((r) => r.situacao === "aberto");

  const receberComprovante: ReceberComprovante = async (t, p) => {
    const abertos = (await deps.recebimentos.emAberto(t, { telefone: p.telefone })).filter((r) => r.situacao === "aberto");
    /* Só lê quem tem Pix em aberto: foto de quem não deve nada é foto, e não vale a chamada. */
    if (!abertos.length) return null;
    const dados = await deps.leitor.ler(t, p.arquivo);
    if (!dados || !(dados.valor && dados.valor > 0)) return null;

    const [config, fiscal] = await Promise.all([deps.recebimentos.config(t), deps.fiscal.ler(t).catch(() => null)]);
    const conferencia = conferirRecebedor(dados, {
      tipoDaChave: config.tipoDaChave,
      chave: config.chave,
      documento: fiscal?.prestadorCpf || fiscal?.cnpj || null,
    });
    const sugerido = sugerirRecebimento(dados, abertos);
    const { repetido } = await deps.recebimentos.registrarComprovante(t, {
      ...dados,
      telefone: p.telefone,
      recebimentoId: sugerido?.id ?? null,
      conferencia,
      mensagemId: p.mensagemId ?? null,
    });
    if (repetido) return { resposta: COMPROVANTE_REPETIDO };

    /* O dono fica sabendo. Vai para o número de avisos ou, sem ele, para a conversa dele consigo
     * mesmo (`numeroDaDona`), como o recibo "primeiro para mim": lá não notifica, mas fica escrito.
     * O lugar de conferir é o painel. */
    const canal = await deps.canalDoNegocio.ler(t).catch(() => null);
    const dono = numeroDaDona(canal);
    if (dono) {
      const codigo = conferirCodigoDoPix(dados, { recebidoEm: agoraISO(), cobrancaEnviadaEm: sugerido?.criadoEm ?? null });
      const aviso = avisoDeComprovanteAoDono({ nome: sugerido?.nome ?? abertos[0].nome, telefone: p.telefone, valor: dados.valor, conferencia, codigo });
      await enfileirar(t, dono, [aviso]).catch(() => {});
    }
    return { resposta: respostaAoComprovante(dados.valor) };
  };

  const guardarCpf: GuardarCpfDaConversa = async (t, p) => {
    const esperando = await deps.recebimentos.esperandoCpf(t, p.telefone);
    if (!esperando.length) return null;
    const cpf = cpfNaMensagem(p.texto);
    if (!cpf) return null;

    const cliente = await deps.negocio.cliente(t, esperando[0].clienteId!);
    if (!cliente) return null;
    await deps.negocio.atualizarCliente(t, { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone, cpf });
    /* O que esperava o CPF: o documento de quem já pagou, e a cobrança do Asaas que ainda não saiu. */
    const config = await deps.recebimentos.config(t);
    for (const r of esperando) {
      if (r.situacao === "pago") await emitirDocumento(comoSistema(t), r, false);
      else if (!r.idExterno && !pixFaltando(config).length) {
        await mandarCobranca(comoSistema(t), r, config).catch((e) => {
          console.warn(`[aplicacao/recebimentos] ${t.tenantId}: o CPF chegou, mas a cobrança ${r.id} não saiu: ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    }
    return { resposta: soOCpf(p.texto) ? AGRADECIMENTO_DO_CPF : null };
  };

  const responderAoDono: ResponderAoDono = async (t, p) => {
    const dono = await whatsDoDono(t);
    if (!dono || chaveDe(dono) !== chaveDe(p.telefone)) return null;
    const decisao = decisaoDoDono(p.texto);
    if (!decisao) return null;
    const pergunta = perguntaValendo(await deps.recebimentos.emAberto(t), agora());
    if (!pergunta) return null;
    try {
      const { recebimento } = await decidir(t, { id: pergunta.id, decisao });
      return { resposta: respostaAoDono(decisao, recebimento) };
    } catch (e) {
      /* Decidida no painel enquanto ele digitava: a mensagem segue como qualquer outra. */
      if (e instanceof DadoInvalido) return null;
      throw e;
    }
  };

  /* ───────────── 1 · a rotina ───────────── */

  async function cobrarDoNegocio(tenantId: string, quando: number, r: ResultadoDosRecebimentos): Promise<void> {
    const t = contextoDeSistema(tenantId);
    const c = await deps.recebimentos.config(t);
    if (pixFaltando(c).length) return;
    r.negocios++;

    /* Um item que falha vai para o relatório, e a rodada segue com o próximo: sem isso, uma pessoa
     * sem telefone derrubava a cobrança do negócio inteiro a cada tique. */
    const cadaUm = async (oQue: string, fazer: () => Promise<void>) => {
      try {
        await fazer();
      } catch (e) {
        r.falhas.push({ tenantId, motivo: `${oQue}: ${e instanceof Error ? e.message : String(e)}` });
      }
    };

    /* Depois de cada atendimento: pergunta ao dono, ou manda o Pix direto. */
    if (c.depoisDoAtendimento !== "desligado") {
      const janela = janelaDepoisDoAtendimento(quando, c.ligadoEm);
      for (const a of janela ? await deps.recebimentos.atendimentosQueAcabaram(t, janela) : []) {
        await cadaUm(`atendimento ${a.id}`, async () => {
          const novo = await criarRecebimento(t, [a], c.depoisDoAtendimento === "perguntar" ? "perguntar" : "aberto");
          if (novo?.situacao === "aberto") {
            await mandarCobranca(t, novo, c);
            r.pix++;
          }
        });
      }
    }

    /* Por mês: no dia do recibo da ficha, o Pix das sessões do mês que o recibo fecha. */
    const hoje = hojeISO(quando);
    for (const pessoa of await deps.recebimentos.clientesPorMes(t)) {
      const data = diaDoReciboAlcancado(pessoa.diaRecibo, hoje);
      if (!data) continue;
      /* O dia 31 fecha o próprio mês até a véspera (`corteDoRecibo`): no dia, a sessão dele ainda não
       * aconteceu. Nos dias de folga seguintes ela entra, num Pix dela, como no recibo automático. Sem
       * isso, a sessão do último dia nunca era cobrada. */
      const ate = pessoa.diaRecibo >= ULTIMO_DIA_DO_MES && hoje > data
        ? `${somarMeses(mesDe(data), 1)}-01`
        : corteDoRecibo(pessoa.diaRecibo, data);
      await cadaUm(`mês de ${pessoa.clienteId}`, async () => {
        const sessoes = await deps.recebimentos.sessoesDoMes(t, {
          clienteId: pessoa.clienteId,
          desde: `${mesQueOReciboFecha(pessoa.diaRecibo, data)}-01`,
          ate,
        });
        if (!sessoes.length) return;
        const novo = await criarRecebimento(t, sessoes, "aberto");
        if (novo) {
          await mandarCobranca(t, novo, c);
          r.pix++;
        }
      });
    }

    if (await perguntarAoDono(t)) r.perguntas++;
  }

  const cobrarAtendimentos: CobrarAtendimentos = async (quando) => {
    const r: ResultadoDosRecebimentos = { negocios: 0, pix: 0, perguntas: 0, falhas: [] };
    const negocios = await deps.recebimentos.negociosComRecebimento();
    /* Em paralelo, e um negócio que falha não derruba os outros, como os lembretes. */
    await Promise.all(
      negocios.map((tenantId) =>
        cobrarDoNegocio(tenantId, quando.getTime(), r).catch((e) => {
          r.falhas.push({ tenantId, motivo: e instanceof Error ? e.message : String(e) });
        }),
      ),
    );
    return r;
  };

  return {
    cobrarAtendimentos,
    abrirContaDeRecebimentos,
    receberAvisoDePagamento,
    lerRecebimentos,
    salvarConfig,
    mandarPix,
    decidir,
    confirmarComprovante,
    descartarComprovante,
    temPixEmAberto,
    receberComprovante,
    guardarCpf,
    responderAoDono,
  };
}

export type CasosDeRecebimentos = ReturnType<typeof criarRecebimentos>;
