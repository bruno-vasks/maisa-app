/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — emitir um recibo, e reconciliar o que ficou sem resposta.
 *
 * ★ SÃO DOIS, E O SEGUNDO EXISTE PORQUE O PRIMEIRO NÃO PODE SABER SE DEU CERTO.
 *
 * A emissão é assíncrona em todo canal conhecido: a chamada volta "registrado" e o desfecho
 * chega depois, por callback. Então `emitirRecibo` termina em `pendente` — e `pendente` é
 * ignorância, não espera. Quem resolve a ignorância é `reconciliarRecibos`, perguntando ao
 * canal o que aconteceu.
 *
 * ── ⚠️ A ORDEM DENTRO DE `emitirRecibo` É A GARANTIA INTEIRA ──
 *
 *   1 · prende o pagamento e cria a linha do razão    ← ANTES de falar com o canal
 *   2 · chama o canal
 *   3 · grava o protocolo
 *
 * Inverter 1 e 2 abre uma janela em que o pagamento está livre e a emissão já saiu. Dois cliques
 * nessa janela emitem dois recibos, e **nenhum aparece como duplicata no banco** — cada um com
 * sua linha, cada um convencido de ser o primeiro. Recibo duplicado se cancela um por um, em
 * dez dias, e o paciente já viu os dois.
 *
 * O custo dessa ordem é o estado do meio: se o processo morrer entre 1 e 3, sobra um `pendente`
 * sem protocolo — irreconciliável, porque não há o que perguntar. Isso não é bug, é o preço, e
 * a resposta é `precisaDeOlhoHumano` mostrar a linha em vez de a gente adivinhar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  EmitirRecibo, FecharReciboDoCallback, ReciboFechado, ReciboLancado,
  ReconciliarRecibos, ResultadoDaReconciliacao,
} from "../portas/entrada/casos-de-uso";
import type { GuardaDeComprovante } from "../portas/saida/guarda-de-comprovante";
import type { LivroDeRecibos } from "../portas/saida/livro-de-recibos";
import type { ContextoTenant } from "../dominio/tenant";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RepositorioAssistente } from "../portas/saida/repositorio-assistente";
import type { RepositorioCanal } from "../portas/saida/repositorio-canal";
import { cabecalhoParaADona, nomeDoPdf, numeroDaDona } from "../dominio/recibo-automatico";
/* A frase é a MESMA do caminho do lote, de propósito: dois textos para a mesma notícia dariam
 * duas MAISAs. Ver `avisoDeRecibo` — inclusive a parte que explica a pré-preenchida, que existe
 * para o paciente não responder "me manda o PDF". */
import { avisoDeRecibo } from "../dominio/recibo-saude";
import type { DesfechoDoAviso } from "../dominio/recibo-unitario";
import type { EmissorDeReciboSaude } from "../portas/saida/emissor-recibo";
import type { RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import {
  precisaDeOlhoHumano, precisaReconciliar,
  type EmissorCredenciado, type PedidoDeRecibo,
} from "../dominio/recibo-unitario";
import { caminhoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { DadoInvalido, NaoConfigurado } from "../dominio/erros";
import { cpfValido } from "../dominio/clientes";
import { hojeISO, mesDe } from "../dominio/tempo";
import { descricaoDasSessoes } from "../dominio/recibos-do-mes";

export type DepsReciboUnitario = {
  livro: LivroDeRecibos;
  emissor: EmissorDeReciboSaude;
  recibos: RepositorioRecibos;
  fiscal: RepositorioFiscal;
  /** Só o fechamento usa. Ver `criarFecharReciboDoCallback`. */
  guarda: GuardaDeComprovante;
};

/* A descrição que sai no documento é `descricaoDasSessoes` (`dominio/recibos-do-mes.ts`).
 *
 * ⚠️ TEXTO FIXO POR DATA, e a regra é a mesma do lote: **nunca o nome do serviço**. "Terapia de
 * casal" ou "Avaliação TDAH" num recibo é dado sensível saindo por um campo que ninguém pensou
 * como sigiloso. A única coisa variável são as datas, que é justamente o que o plano de saúde pede
 * para reembolsar. */

/** Teto de sessões num recibo: um mês inteiro, todo dia. Acima disso o pedido é torto. */
const SESSOES_MAX = 31;

export function criarEmitirRecibo(deps: DepsReciboUnitario): EmitirRecibo {
  return async (t, p): Promise<ReciboLancado> => {
    const hoje = hojeISO();
    const config = await deps.fiscal.ler(t);

    /* Recusa antes de prender nada: descobrir no fim o que se sabia no começo deixaria o
     * pagamento trancado por um recibo que nunca foi tentado. */
    if (caminhoDaNota(config, hoje) !== "recibo_saude") {
      throw new DadoInvalido(
        "Este negócio emite nota fiscal, não recibo do Receita Saúde.",
        "caminho",
      );
    }
    const falta = fiscalFaltando(config, hoje);
    if (falta.length) throw new NaoConfigurado(falta);
    /* O arquivo do e-CAC sai sem registro; o recibo unitário não — o canal recusa habilitar quem
     * não tem, e a frase dele chega em inglês. É a mesma regra de `faltaParaEmitirRecibo`, que a
     * tela já aplica: aqui ela vale também para quem não passou pela tela. */
    if (!config.registroProfissional?.trim()) {
      throw new DadoInvalido("Falta o seu registro no conselho — sem ele o recibo não sai.", "registro");
    }

    const emissor: EmissorCredenciado = {
      cpf: config.prestadorCpf!,
      ocupacao: config.ocupacaoSaude!,
      registroProfissional: config.registroProfissional,
    };

    /* Os dados do pagamento saem da lista de pendentes, não do corpo do request. É a mesma
     * regra de `/api/nf/emitir`, que aceitava `valor` e `tomador` de fora até 17/08/2026 — e
     * com isso um POST forjado emitia documento fiscal de qualquer valor para qualquer CPF. */
    /* ── ★ UM OU VÁRIOS (01/10/2026: um recibo por mês) ──
     * Vários pagamentos num recibo só exigem que sejam UMA pessoa, UM pagador e UM mês: o recibo
     * tem um beneficiário e um pagador, e a renda entra no Carnê-Leão pelo mês. Quem decide como
     * agrupar é quem chama (`juntarEmRecibos`); aqui se recusa o que não pode ir junto. */
    const pedidos = "itens" in p ? p.itens : [p];
    if (pedidos.length === 0 || pedidos.length > SESSOES_MAX) {
      throw new DadoInvalido(`Um recibo leva de 1 a ${SESSOES_MAX} sessões.`, "itens");
    }
    const pendentes = await deps.recibos.pendentes(t, { ate: hoje });
    const alvos = pedidos.map((q) => pendentes.find((x) => x.id === q.id && x.fonte === q.fonte));
    if (alvos.some((x) => !x)) {
      throw new DadoInvalido(
        pedidos.length === 1
          ? "Este pagamento não está na lista do que falta emitir. Ele já saiu, ou está num lote."
          : "Uma das sessões já não está na lista do que falta emitir. Ela já saiu, ou está num lote.",
        "id",
      );
    }
    const todos = alvos as NonNullable<(typeof alvos)[number]>[];
    const alvo = todos.reduce((a, b) => (b.data > a.data ? b : a));
    if (todos.some((x) => x.teste)) {
      throw new DadoInvalido(
        "Este é o cliente de demonstração. Recibo de verdade para cadastro de teste não.",
        "teste",
      );
    }
    if (todos.length > 1) {
      const um = (f: (x: (typeof todos)[number]) => string) => new Set(todos.map(f)).size === 1;
      if (!todos.every((x) => x.clienteId) || !um((x) => x.clienteId!) || !um((x) => x.cpf ?? "") || !um((x) => x.cpfPagador ?? "")) {
        throw new DadoInvalido("Só sessões da mesma pessoa, com o mesmo pagador, vão num recibo só.", "itens");
      }
      if (!um((x) => mesDe(x.data))) {
        throw new DadoInvalido("Sessões de meses diferentes não vão no mesmo recibo.", "itens");
      }
    }

    const cpfBeneficiario = alvo.cpf ?? "";
    /* Dígito verificador aqui também: a Receita recusa com "Beneficiário do serviço inválido" e
     * só conta isso depois, no callback — quando o pagamento já está trancado. */
    if (!cpfValido(cpfBeneficiario)) {
      throw new DadoInvalido(
        `Falta o CPF de ${alvo.nome} — sem ele a Receita recusa o recibo.`,
        "cpf",
      );
    }
    const cpfPagador = alvo.cpfPagador ?? cpfBeneficiario;
    if (!cpfValido(cpfPagador)) {
      throw new DadoInvalido("O CPF de quem pagou não é válido.", "cpfPagador");
    }

    /* ── 0.5 · habilita no canal, ANTES de prender ──
     *
     * O onboarding já habilita ao salvar (`criarLigarReciboSaude`), mas ele deixa passar canal
     * fora do ar — e quem salvou antes de 29/09/2026 nunca foi habilitado. A porta promete
     * idempotência, então repetir aqui é a rede que não depende de ninguém lembrar. Antes do
     * `abrir` porque, se falhar, nenhum pagamento fica trancado por um recibo que nem saiu. */
    await deps.emissor.cadastrarEmissor(t, emissor);

    /* ── 1 · PRENDE ANTES DE FALAR COM O MUNDO ── */
    const aberto = await deps.livro.abrir(t, {
      itens: todos.map((x) => ({ fonte: x.fonte, id: x.id })),
      canal: deps.emissor.canal,
    });
    /* `null` = outra aba prendeu primeiro, ou já saiu. NÃO é erro — ver a porta. Com várias, é
     * tudo ou nada: nenhuma ficou presa. */
    if (!aberto) {
      throw new DadoInvalido(
        todos.length === 1 ? "Este pagamento já entrou num recibo ou num lote." : "Uma das sessões já entrou num recibo ou num lote. Nenhuma foi presa.",
        "id",
      );
    }

    const pedido: PedidoDeRecibo = {
      /* ⚠️ O `numero` DA LINHA, NÃO O `id`. Os dois nascem na mesma transação, e a diferença é
       * de tipo: o `id` é uuid, e a Rebots recusa uuid no `receipt_id` com `RECEIPT_ERROR_024`
       * — medido no sandbox em 25/08/2026, quando NENHUMA emissão passava. Ver `referencia`. */
      referencia: String(aberto.numero),
      dataPagamento: alvo.data,
      /* ⚠️ O VALOR É O DO BANCO (`aberto.valor`), não o da linha que a tela leu. A claim o
       * devolveu somado na mesma transação em que prendeu — tela velha manda total velho, e
       * total velho aqui vira documento fiscal de valor errado. */
      valor: aberto.valor,
      /* A data do recibo é a da ÚLTIMA sessão (`alvo`): ver o cabeçalho de `recibos-do-mes.ts`. */
      descricao: descricaoDasSessoes(todos.map((x) => x.data)),
      cpfPagador,
      cpfBeneficiario,
    };

    /* ── ★ 1.5 · o protocolo ANTES da chamada, quando ele é a nossa referência ──
     *
     * ⚠️ ISTO NÃO É OTIMIZAÇÃO, É UMA CORRIDA FECHADA. O callback pode chegar **durante** o passo
     * 2: o sandbox da Rebots dispara de forma síncrona dentro do `POST /receipts`, e em produção
     * basta o canal ser rápido. A rota de callback acha a linha pelo protocolo — se ele ainda não
     * estiver gravado, ela responde 404 e o desfecho se perde. Como a API deles não tem consulta
     * (`consultar` devolve `null`), esse `pendente` não tem mais saída automática nenhuma.
     *
     * Medido em 26/08/2026: recibo nº 56, callback entregue, 404, linha `pendente` para sempre.
     *
     * Só vale para canal cujo protocolo é a nossa referência (ver a porta). */
    if (deps.emissor.protocoloEhNossaReferencia) {
      await deps.livro.registrarProtocolo(t, { reciboId: aberto.id, protocolo: pedido.referencia });
    }

    /* ── 2 · chama o canal ── */
    let aceito;
    try {
      aceito = await deps.emissor.emitir(t, emissor, pedido);
    } catch (e) {
      /* ⚠️ RECUSA DO PEDIDO SOLTA O PAGAMENTO; recusa da RECEITA não passa por aqui — ela chega
       * no callback. A diferença importa: o canal dizer "dado inválido" significa que **nada foi
       * emitido**, e aí devolver a linha para a lista é seguro e é o certo. Deixá-la trancada
       * faria o pagamento desaparecer do faturamento por causa de um CPF digitado errado.
       *
       * ⚠️ `descartar` E NÃO `fechar`: aqui ainda não existe protocolo, e `fechar` busca por
       * protocolo. A primeira versão deste bloco passava `aberto.id` no lugar dele — não casava
       * com nada, a linha ficava `pendente` para sempre e o pagamento sumia do faturamento. */
      await deps.livro.descartar(t, {
        reciboId: aberto.id,
        erro: e instanceof Error ? e.message : String(e),
      }).catch(() => {});
      throw e;
    }

    /* ── 3 · grava o protocolo que o canal devolveu ──
     * É ele que torna a linha reconciliável. Para canal cujo protocolo é a nossa referência isto é
     * reescrever o mesmo valor (ver o passo 1.5) — e é de propósito: o valor que MANDA é o que o
     * canal respondeu, e a escrita é idempotente. Para os outros, é aqui que ele nasce, e entre o
     * passo 2 e este a linha é um `pendente` sem protocolo. */
    await deps.livro.registrarProtocolo(t, {
      reciboId: aberto.id,
      protocolo: aceito.protocolo,
    });

    return {
      reciboId: aberto.id,
      canal: deps.emissor.canal,
      situacao: aceito.situacao,
      protocolo: aceito.protocolo,
      valor: aberto.valor,
      nome: alvo.nome,
      data: alvo.data,
      sessoes: todos.length,
    };
  };
}

/**
 * Pergunta ao canal o que aconteceu com os pendentes vencidos.
 *
 * ★ É O QUE TORNA A CASCATA SEGURA. Sem isto, um `pendente` velho só tem duas saídas, e as duas
 * são erradas: cair para o próximo canal (emite o segundo recibo) ou ficar pendurado para sempre
 * (o pagamento desaparece do faturamento).
 *
 * ⚠️ NÃO DECIDE NADA SOZINHA — só grava o que o canal respondeu. A decisão de tentar outro canal
 * é de quem lê o resultado, e ela só é permitida a partir de `recusado`. Ver
 * `podeTentarOutroCanal`.
 */
export function criarReconciliarRecibos(
  deps: Pick<DepsReciboUnitario, "livro" | "emissor">,
): ReconciliarRecibos {
  return async (t, agora = new Date()): Promise<ResultadoDaReconciliacao> => {
    const antesDe = new Date(agora.getTime() - 1).toISOString();
    const pendentes = await deps.livro.pendentes(t, { antesDe });

    const r: ResultadoDaReconciliacao = {
      olhados: 0, emitidos: 0, recusados: 0, aindaPendentes: 0, semProtocolo: 0,
    };

    for (const linha of pendentes) {
      /* ⚠️ IRRECONCILIÁVEL: sem protocolo não há o que perguntar. Conta e segue — quem mostra é
       * a tela, porque a verdade está no e-CAC e só uma pessoa pode ir olhar lá. */
      if (precisaDeOlhoHumano(linha)) {
        r.semProtocolo++;
        continue;
      }
      /* Novo demais: o callback ainda pode chegar. Perguntar aqui custa consulta paga e não
       * responde nada que o webhook não fosse responder de graça. */
      if (!precisaReconciliar(linha, agora)) {
        r.aindaPendentes++;
        continue;
      }

      r.olhados++;
      const desfecho = await deps.emissor.consultar(t, linha.protocolo!);

      /* `null` do canal é ambíguo de propósito e tem que continuar ambíguo aqui: pode ser "não
       * conheço esse protocolo" (o pedido não chegou) ou "ainda processando". Tratar como recusa
       * liberaria a cascata — e se era o primeiro caso, ótimo; se era o segundo, sai o segundo
       * recibo. Fica pendente, e a próxima rodada pergunta de novo. */
      if (!desfecho) {
        r.aindaPendentes++;
        continue;
      }

      const fechada = await deps.livro.fechar(t, desfecho);
      /* `null` = o callback chegou primeiro, no meio desta volta. Não é erro, é a corrida
       * normal entre webhook e reconciliação — e é justamente por ela que `fechar` é idempotente. */
      if (!fechada) continue;

      if (fechada.situacao === "emitido") r.emitidos++;
      else if (fechada.situacao === "recusado") {
        r.recusados++;
        /* Recusa confirmada pelo canal: aqui, e só aqui, é seguro devolver o pagamento para a
         * lista. É a única transição que reabre a porta da cascata. */
        await deps.livro.soltar(t, fechada.id).catch(() => {});
      }
    }

    return r;
  };
}

/**
 * Fecha a linha do razão com o que o canal respondeu — o caminho do CALLBACK.
 *
 * ★ ELE SAIU DA ROTA, E ISSO NÃO FOI ARRUMAÇÃO. A rota decidia: gravava, e se o desfecho fosse
 * recusa, soltava o pagamento. Isso é regra de negócio — "recusa devolve o pagamento para a
 * lista" é a única transição que reabre a porta da cascata — e regra de negócio em `route.ts` é
 * regra que nenhum teste de domínio alcança. Foi exatamente onde os três defeitos do callback
 * moraram sem ninguém ver.
 *
 * ── ⚠️ A ORDEM: ARQUIVA O PDF ANTES DE GRAVAR, E O MOTIVO É UM RELÓGIO ──
 *
 * A URL do comprovante vale cinco minutos e a API do canal não tem consulta. Então a cópia tem
 * que acontecer **dentro desta chamada**, antes de qualquer coisa que possa demorar ou falhar.
 * "Arquivo depois" não existe: depois o arquivo não está mais lá.
 *
 * O custo dessa ordem é uma reentrega baixar de novo (ou tentar, e achar a URL vencida) antes de
 * descobrir que não havia o que gravar. É uma chamada perdida e uma linha de log — barato
 * comparado a ler o razão antes de cada gravação só para economizá-la.
 *
 * ⚠️ E A CÓPIA NUNCA IMPEDE A GRAVAÇÃO. `arquivar` devolve `null` em vez de lançar, por contrato
 * (ver a porta). Se a cópia falhar, o recibo fecha sem comprovante: perder o PDF é ruim, perder
 * o desfecho é irreversível — não há a quem perguntar de novo.
 */
/**
 * ★ AVISAR O PACIENTE — as três portas que só existem para a mensagem.
 *
 * Opcional de propósito: sem elas o caso de uso fecha o recibo e não fala com ninguém, que é
 * exatamente o comportamento de antes. Quem monta decide se este canal tem voz.
 */
export type DepsDeAviso = {
  canal: CanalDeMensagens;
  negocio: RepositorioNegocio;
  assistente: RepositorioAssistente;
  /** Só para achar o número da dona, no "primeiro para mim" (01/10/2026). Ver `numeroDaDona`. */
  canalDoNegocio: RepositorioCanal;
};

export function criarFecharReciboDoCallback(
  deps: Pick<DepsReciboUnitario, "livro" | "guarda"> & { aviso?: DepsDeAviso },
): FecharReciboDoCallback {
  return async (t, d): Promise<ReciboFechado> => {
    /* ── 1 · a cópia, enquanto a janela está aberta ── */
    let comprovanteCaminho = d.comprovanteCaminho;
    if (!comprovanteCaminho && d.situacao === "emitido" && d.pdfUrl) {
      const guardado = await deps.guarda.arquivar(t, {
        protocolo: d.protocolo,
        urlTemporaria: d.pdfUrl,
      });
      comprovanteCaminho = guardado?.caminho ?? null;
    }

    /* ── 2 · o desfecho, que é o dado que não pode se perder ── */
    const fechada = await deps.livro.fechar(t, { ...d, comprovanteCaminho });

    /* `null` = a linha já não estava na situação de partida. É reentrega, ou a reconciliação
     * chegou primeiro. Não é erro, e quem chama responde 200: pedir reentrega de algo já gravado
     * é um laço que só termina quando o canal desiste. */
    if (!fechada) return { desfecho: "ja_fechado", comprovanteGuardado: false };

    /* ── 3 · recusa confirmada devolve o pagamento para a lista ──
     * ⚠️ É A ÚNICA TRANSIÇÃO QUE REABRE A PORTA DA CASCATA, e por isso está aqui e não na rota.
     * `emitido` não solta (o documento existe) e `cancelado` também não — ver o comentário
     * abaixo, que é dívida declarada, não esquecimento. */
    if (fechada.situacao === "recusado") {
      await deps.livro.soltar(t, fechada.id).catch(() => {});
    }

    /* ⚠️ DÍVIDA DECLARADA: `cancelado` DEIXA O PAGAMENTO TRANCADO. Cancelar um recibo faz o
     * documento deixar de existir, então em teoria o pagamento devia voltar para a lista — mas
     * `soltar_recibo_unitario` só aceita `recusado`, de propósito, e afrouxar isso é como se
     * emite o segundo recibo. Enquanto ninguém decidir o fluxo "cancelou, e agora?", o pagamento
     * fica fora da lista e a linha do razão mostra o cancelamento. Preferível ao contrário. */

    /* ⚠️ `pendente` NÃO É DESFECHO, e o tipo de `ReciboEmitido.situacao` não sabe disso — ele
     * carrega os quatro estados. Um `fechar` bem-sucedido só devolve os três de saída; o `?:`
     * existe para o compilador, e o `pendente` que ele cobre é impossível por construção. Se um
     * dia deixar de ser, o lugar de descobrir é aqui e não na tela. */
    const desfecho = fechada.situacao === "pendente" ? "ja_fechado" : fechada.situacao;

    /* ── 4 · o aviso ao paciente, por último e sem poder atrapalhar ──
     *
     * ★ SÓ AQUI DENTRO, e a posição é o desenho: chega depois de `fechar` ter devolvido uma linha,
     * o que garante três coisas de uma vez.
     *
     *   1 · **O recibo existe.** Avisar antes de gravar seria prometer documento que talvez não
     *       tenha saído.
     *   2 · **A transição aconteceu.** `fechar` devolve `null` em reentrega (a linha já não estava
     *       na situação de partida), e o `return` lá em cima corta o caminho — então um callback
     *       entregue duas vezes NÃO manda duas mensagens para a mesma pessoa.
     *   3 · **Nada aqui pode derrubar o 200.** A rota responde 200 para o canal descartar o
     *       desfecho; se este bloco estourasse, ela responderia 500, o canal reentregaria, e o
     *       recibo já gravado viraria uma segunda mensagem — ou pior, um laço.
     *
     * ⚠️ SÓ `emitido`. Recusa e cancelamento não são notícia boa nem acionável para o paciente: a
     * primeira é problema de dado que o dono resolve, e a segunda ele já sabe (foi ele quem pediu).
     */
    if (deps.aviso && fechada.situacao === "emitido") {
      /* ⚠️ O DESFECHO DO AVISO É ANOTADO, e essa é a diferença entre engolir e esconder. O erro
       * continua engolido — o recibo já existe, e mensagem que não sai não desemite nada — mas o
       * QUE aconteceu vira dado. Antes, 19 falhas de envio ficavam idênticas a 19 sucessos, e o
       * dono só descobria contando (26/08/2026). Ver a migração 025. */
      const desfechoDoAviso = await avisarPaciente(deps.aviso, deps.livro, deps.guarda, t, fechada.id, {
        caminho: comprovanteCaminho ?? fechada.comprovanteCaminho ?? null,
        urlDoCanal: d.pdfUrl ?? null,
      })
        .catch((): DesfechoDoAviso => "falhou");
      await deps.livro.registrarAviso(t, { reciboId: fechada.id, desfecho: desfechoDoAviso })
        .catch(() => {});
    }

    return { desfecho, comprovanteGuardado: Boolean(comprovanteCaminho) };
  };
}

/**
 * Manda a notícia do recibo para quem foi atendido, ou para a dona, se ela pediu para ver antes.
 *
 * ⚠️ NUNCA LANÇA — quem chama já a envolve num `catch`, e este `try` de dentro é o segundo cinto.
 * O recibo está gravado; uma mensagem que não sai não pode desfazer isso nem virar erro na rota.
 *
 * ⚠️ E É OPT-IN, no interruptor `avisarRecibo` (migração 024, padrão `false`). A mensagem vai para
 * o WhatsApp de um terceiro e sai do número pessoal de quem usa a MAISA — ligar por padrão faria o
 * primeiro fechamento de mês depois de um deploy surpreender trinta pacientes.
 *
 * ★ "PRIMEIRO PARA MIM" (`reciboPrimeiroParaMim`, 01/10/2026, a Regina): a mesma mensagem que o
 * paciente receberia vai para a dona, com uma linha antes dizendo de quem é, para ela conferir e
 * encaminhar. O telefone do paciente deixa de ser condição: quem decide se ele recebe é ela.
 */
/** Validade do link do PDF que o canal baixa. Ele baixa na hora; dez minutos é folga, não prazo. */
const PDF_VALE_SEGUNDOS = 600;

async function avisarPaciente(
  aviso: DepsDeAviso,
  livro: DepsReciboUnitario["livro"],
  guarda: GuardaDeComprovante,
  t: ContextoTenant,
  reciboId: string,
  pdf: { caminho: string | null; urlDoCanal: string | null },
): Promise<DesfechoDoAviso> {
  try {
    const ajustes = await aviso.assistente.ler(t);
    /* ⚠️ `desligado` E NÃO `null`: "ele não quis" e "tentamos e não deu" são opostos, e a tela
     * precisa saber qual é. Ver `DesfechoDoAviso`. */
    if (!ajustes?.cfg.avisarRecibo) return "desligado";

    const quem = await livro.destinatario(t, reciboId);
    if (!quem) return "sem_telefone";

    const recibo = { nome: quem.nome, data: quem.data, valor: quem.valor, sessoes: quem.sessoes };
    const nomeDoNegocio = (await aviso.negocio.negocio(t)).nome;
    const aoPaciente = avisoDeRecibo({
      recibo,
      nomeDoNegocio,
      nomeDaAssistente: ajustes.assistente.nome ?? "MAISA",
    });

    /* ── ★ O PDF VAI JUNTO (01/10/2026, Bruno: "é onde mora o valor do produto") ──
     * O documento sai como arquivo, com a mensagem na legenda: uma bolha só, e quem encaminha leva
     * as duas coisas. O link é da NOSSA cópia (`comprovantes-recibo`), gerado agora e curto; sem
     * cópia, o link do canal, que ainda vale nos cinco minutos do callback. Sem nenhum dos dois, só
     * a mensagem, como era. */
    const urlDoPdf = (pdf.caminho
      ? await guarda.linkParaBaixar(t, { caminho: pdf.caminho, segundos: PDF_VALE_SEGUNDOS }).catch(() => null)
      : null) ?? pdf.urlDoCanal;
    const mandar = async (para: string, antes: string[]) => {
      if (urlDoPdf) {
        if (antes.length) await aviso.canal.enviar(t, para, antes);
        await aviso.canal.enviarDocumento(t, para, { url: urlDoPdf, nomeDoArquivo: nomeDoPdf(recibo), legenda: aoPaciente });
      } else {
        await aviso.canal.enviar(t, para, [...antes, aoPaciente]);
      }
    };

    if (ajustes.cfg.reciboPrimeiroParaMim) {
      /* Sem número de avisos E sem WhatsApp conectado não há "mim" para onde mandar: é o mesmo
       * caso do paciente sem telefone, e a tela conta igual. */
      const dona = numeroDaDona(await aviso.canalDoNegocio.ler(t));
      if (!dona) return "sem_telefone";
      /* A linha dela vai numa bolha à parte, ANTES: no arquivo (ou na bolha seguinte) fica só o
       * que é para o paciente, e o encaminhar não leva junto o "Recibo emitido: …". */
      await mandar(dona, [cabecalhoParaADona(recibo, Boolean(quem.telefone))]);
      return "enviado_ao_dono";
    }

    /* Sem telefone não há o que fazer, e não é erro: o avulso de quem não é cadastro nasce assim.
     * Ver `DestinatarioDoRecibo` — quem chama conta, não falha. */
    if (!quem.telefone) return "sem_telefone";
    await mandar(quem.telefone, []);
    return "enviado";
  } catch {
    /* Engole o erro, guarda o fato. Telefone que mudou de dono, canal fora do ar, número que não
     * existe no WhatsApp: nenhum desses é motivo para o recibo emitido parecer roto — mas todos
     * são motivo para o dono saber. */
    return "falhou";
  }
}
