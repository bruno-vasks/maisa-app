/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — o lote de recibos do Receita Saúde.
 *
 * ★ O CASO DE USO MAIS BARATO DO PRODUTO FISCAL, e é o que atende mais gente do ICP.
 *
 * Não fala com provedor, não assina nada, não gasta um centavo por linha. Lê os atendimentos
 * sem lote, monta um CSV, prende o que entrou. A emissão acontece depois, no e-CAC, pela mão
 * da profissional — ver `dominio/recibo-saude.ts` para o porquê de não haver API.
 *
 * ── ⚠️ A ORDEM É MONTAR → PRENDER → DEVOLVER, E NÃO PRENDER → MONTAR ──
 *
 * Montar primeiro porque a montagem RECUSA linhas (CPF faltando, valor zero, ano diferente),
 * e só o que entrou no arquivo pode ser prendido. Prender antes faria o atendimento sem CPF
 * do paciente sair da lista de pendências sem estar em recibo nenhum — desaparecendo do
 * radar exatamente no caso em que alguém precisa agir.
 *
 * Depois de prender, o arquivo é remontado com o que a claim confirmou. Nas duas passadas a
 * função é a mesma e pura, então o segundo resultado é o primeiro filtrado — e é o que vai
 * para o disco do dono.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  DesligarReciboSaude, ExcluirPagamentoAvulso, FecharLoteDeRecibos, GerarLoteDeRecibos,
  LancarPagamentoAvulso, LerRecibosPendentes, PagamentoPendente,
} from "../portas/entrada/casos-de-uso";
import type { PagamentoAFaturar, RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { LivroDeRecibos } from "../portas/saida/livro-de-recibos";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { RepositorioAssistente } from "../portas/saida/repositorio-assistente";
import type { RepositorioCanal } from "../portas/saida/repositorio-canal";
import {
  avisoDeRecibo, confirmacaoDoLote, montarLoteCsv, nomeDoArquivo,
  type EmissorDeRecibo, type FechamentoParaODono, type PagamentoRecebido,
} from "../dominio/recibo-saude";
import { caminhoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { cpfValido, soDigitos } from "../dominio/clientes";
import { DadoInvalido, NaoConfigurado } from "../dominio/erros";
import { hojeISO } from "../dominio/tempo";

export type DepsRecibo = {
  recibos: RepositorioRecibos;
  fiscal: RepositorioFiscal;
};

/**
 * A descrição que sai impressa no recibo.
 *
 * ⚠️ **NÃO LEVA DIAGNÓSTICO, NEM NOME DE PACOTE, NEM APELIDO DO SERVIÇO.** O nome que o dono
 * deu ao serviço no catálogo vira texto de documento — e "Terapia de casal" ou "Avaliação
 * TDAH" num recibo é dado sensível saindo por um campo que ninguém pensou como sigiloso.
 * Aqui o texto é fixo por ocupação, e a única coisa variável é a DATA, que é justamente o
 * que o plano de saúde pede para reembolsar.
 */
function descricaoPadrao(data: string): string {
  const [a, m, d] = data.slice(0, 10).split("-");
  return `Atendimento realizado em ${d}/${m}/${a}`;
}

const paraPagamento = (p: PagamentoAFaturar): PagamentoRecebido => ({
  dataPagamento: p.data,
  valor: p.valor,
  descricao: descricaoPadrao(p.data),
  /* `null` = paga por si. O CSV exige os dois CPFs, e repetir é o certo: quem pagou e quem
   * usufruiu são a mesma pessoa. */
  cpfPagador: p.cpfPagador ?? p.cpf ?? "",
  cpfBeneficiario: p.cpf ?? "",
});

export function criarGerarLoteDeRecibos({ recibos, fiscal }: DepsRecibo): GerarLoteDeRecibos {
  return async (t, p) => {
    const config = await fiscal.ler(t);
    const hoje = hojeISO();

    /* Recusa antes de ler a agenda: pedir o CPF de quem emite depois de montar o arquivo
     * seria descobrir no fim o que se sabia no começo. */
    if (caminhoDaNota(config, hoje) !== "recibo_saude") {
      throw new DadoInvalido(
        "Este negócio emite nota fiscal, não recibo do Receita Saúde. O lote é para quem atende como pessoa física.",
        "caminho",
      );
    }
    const falta = fiscalFaltando(config, hoje);
    if (falta.length) throw new NaoConfigurado(falta);

    const emissor: EmissorDeRecibo = {
      cpf: config.prestadorCpf!,
      ocupacao: config.ocupacaoSaude!,
      registroProfissional: config.registroProfissional,
    };

    const ate = p?.ate?.slice(0, 10) || hoje;
    /* Cliente de teste fora, como no lote de notas: um botão de fechar o mês não deve gerar
     * recibo de verdade para o cadastro que existe só para experimentar a tela. */
    const pendentes = (await recibos.pendentes(t, { ate })).filter((x) => !x.teste);

    if (!pendentes.length) {
      throw new DadoInvalido("Nenhum atendimento sem recibo neste período.", "pendentes");
    }

    /* ── 1 · monta para saber o que É ACEITÁVEL ──
     *
     * ⚠️ O MAPA É POR IDENTIDADE DE OBJETO, e antes era por uma chave `data + cpf` montada à
     * mão. Duas sessões do mesmo paciente no mesmo dia — sessão dupla, ou dois irmãos no
     * cadastro de um — colidiam nessa chave, e a claim trancava a linha errada. `montarLoteCsv`
     * devolve os MESMOS objetos que recebeu (`entraram`), então a volta é exata. */
    const origem = new Map<PagamentoRecebido, PagamentoAFaturar>();
    const lista = pendentes.map((x) => {
      const pag = paraPagamento(x);
      origem.set(pag, x);
      return pag;
    });

    const previa = montarLoteCsv(emissor, lista);
    const entram = previa.entraram.map((pag) => origem.get(pag)!).filter(Boolean);

    if (!entram.length) {
      throw new DadoInvalido(
        `Nenhuma sessão pôde entrar no arquivo. ${avisosDe(previa, origem)[0] ?? ""}`.trim(),
        "pendentes",
      );
    }

    /* ── 2 · prende só o que entrou, cada id na sua tabela ──
     * Separar por fonte não é detalhe de implementação: um id de avulso mandado como
     * atendimento não tranca nada, e a linha volta a aparecer depois de o recibo sair. */
    const competencia = `${ate.slice(0, 7)}-01`;
    const lote = await recibos.abrirLote(t, {
      atendimentoIds: entram.filter((x) => x.fonte === "atendimento").map((x) => x.id),
      avulsoIds: entram.filter((x) => x.fonte === "avulso").map((x) => x.id),
      competencia,
    });
    /* `null` = a corrida foi perdida para outra aba. Não é erro — ver a porta. */
    if (!lote) throw new DadoInvalido("Essas sessões já entraram num lote.", "lote");

    /* ── 3 · remonta com o que a claim confirmou ── */
    const confirmados = new Set([...lote.atendimentoIds, ...lote.avulsoIds]);
    const presos = entram.filter((x) => confirmados.has(x.id));
    const final = montarLoteCsv(emissor, presos.map(paraPagamento));

    return {
      loteId: lote.id,
      competencia,
      csv: final.csv,
      arquivo: nomeDoArquivo(emissor.cpf, competencia),
      linhas: final.linhas,
      valor: final.valor,
      avisos: avisosDe(previa, origem),
    };
  };
}

/**
 * As frases do que ficou de fora.
 *
 * Agrupadas por motivo, com os nomes: "Fulana e Ciclana ficaram de fora — falta o CPF de
 * quem foi atendido" é acionável; "3 linhas recusadas" manda o dono adivinhar quais.
 */
function avisosDe(
  lote: ReturnType<typeof montarLoteCsv>,
  origem: Map<PagamentoRecebido, PagamentoAFaturar>,
): string[] {
  const porMotivo = new Map<string, string[]>();

  for (const r of lote.recusadas) {
    const quem = origem.get(r.pagamento);
    const motivo = r.motivos.join(", ");
    porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), quem?.nome ?? "um atendimento"]);
  }

  const avisos = [...porMotivo.entries()].map(([motivo, nomes]) => {
    const unicos = [...new Set(nomes)];
    const lista = unicos.length > 3
      ? `${unicos.slice(0, 3).join(", ")} e mais ${unicos.length - 3}`
      : unicos.length > 1
        ? `${unicos.slice(0, -1).join(", ")} e ${unicos[unicos.length - 1]}`
        : unicos.join("");
    /* Concorda o verbo. Parece frescura e não é: esta frase vai na tela que o dono mostra para
     * um cliente, e "Patrícia Mendes, Sofia Ribeiro ficou de fora" é o tipo de erro que faz
     * alguém desconfiar do resto do produto. */
    const verbo = unicos.length > 1 ? "ficaram" : "ficou";
    return `${lista} ${verbo} de fora — falta ${motivo}.`;
  });

  /* O teto de 1000 linhas do arquivo. Silenciar isto seria o pior truncamento possível: o
   * dono importa 1000 recibos e acha que acabou. */
  if (lote.sobraram.length) {
    avisos.push(
      `${lote.sobraram.length} sessão(ões) ficaram para o próximo arquivo — o limite da Receita é 1000 linhas por importação.`,
    );
  }
  return avisos;
}

/** Do vocabulário da porta de saída para o da tela. Um lugar só, para as duas não divergirem. */
const paraPendente = (x: PagamentoAFaturar): PagamentoPendente => ({
  id: x.id,
  fonte: x.fonte,
  clienteId: x.clienteId,
  cpfPagador: x.cpfPagador,
  nome: x.nome,
  cpf: x.cpf,
  data: x.data,
  valor: x.valor,
  podeExcluir: x.fonte === "avulso",
});

/**
 * O que vai no próximo arquivo.
 *
 * ⚠️ `total` soma só quem TEM CPF, e a diferença é deliberada: é o valor que vai sair no
 * arquivo, não o que foi atendido no mês. Somar tudo faria a tela prometer um número que o
 * CSV não confirma — e o dono só descobriria conferindo linha por linha.
 */
export function criarLerRecibosPendentes(
  { recibos, livro }: Pick<DepsRecibo, "recibos"> & { livro?: LivroDeRecibos },
): LerRecibosPendentes {
  return async (t) => {
    const pendentes = (await recibos.pendentes(t, { ate: hojeISO() })).filter((x) => !x.teste);
    const semCpf = pendentes.filter((x) => !x.cpf).length;

    /* ★ QUANTOS PACIENTES FICARAM SEM SABER. Vem junto porque é a MESMA leitura que a tela já faz —
     * um segundo `fetch` para um número de relatório seria uma tela que pisca duas vezes.
     *
     * ⚠️ Falha macia (`catch → zero`): é informação, não a lista. Perder a contagem não pode
     * esconder o que falta emitir. */
    const avisos = livro
      ? await livro.avisosPendentes(t).catch(() => ({ falhou: 0, semTelefone: 0 }))
      : { falhou: 0, semTelefone: 0 };

    return {
      pagamentos: pendentes.map(paraPendente),
      total: pendentes.filter((x) => x.cpf).reduce((soma, x) => soma + x.valor, 0),
      semCpf,
      avisos,
    };
  };
}

/**
 * Lança um pagamento fora da agenda.
 *
 * ⚠️ EXIGE CPF, e é a única coisa que este formulário exige além do valor. A razão é que o
 * lançamento existe **para virar recibo**: aceitar sem CPF criaria uma linha que nunca entra
 * em arquivo nenhum, aparecendo para sempre na lista com um aviso. O atendimento da agenda é
 * diferente — ele nasce de um agendamento, existe por si, e o CPF chega depois.
 */
export function criarLancarPagamentoAvulso({ recibos, fiscal }: DepsRecibo): LancarPagamentoAvulso {
  return async (t, p) => {
    const hoje = hojeISO();
    const config = await fiscal.ler(t);
    if (caminhoDaNota(config, hoje) !== "recibo_saude") {
      throw new DadoInvalido(
        "Este negócio emite nota fiscal, não recibo do Receita Saúde.",
        "caminho",
      );
    }

    const nome = p.nome?.trim();
    if (!nome) throw new DadoInvalido("Diga de quem é o recibo.", "nome");

    /* Dígito verificador, e não só tamanho: a Receita recusa CPF que não fecha ("Beneficiário
     * do serviço inválido"), e só diz isso na análise do arquivo — depois de o dono já ter ido
     * ao e-CAC. Ver `cpfValido`. */
    const cpf = soDigitos(p.cpf);
    if (!cpfValido(cpf)) throw new DadoInvalido("Esse CPF de quem foi atendido não é válido — confira os dígitos.", "cpf");

    const pagador = soDigitos(p.cpfPagador ?? "");
    if (pagador && !cpfValido(pagador)) {
      throw new DadoInvalido("Esse CPF de quem pagou não é válido — confira os dígitos.", "cpfPagador");
    }

    if (!(p.valor > 0)) throw new DadoInvalido("O valor precisa ser maior que zero.", "valor");

    const data = String(p.data ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new DadoInvalido("Escolha a data do pagamento.", "data");
    /* ⚠️ Nada no futuro. O manual manda emitir na data do PAGAMENTO — data futura é erro de
     * digitação, e barrar aqui é melhor que barrar na claim, onde a linha desapareceria da
     * lista sem explicação. */
    if (data > hoje) throw new DadoInvalido("Não dá para lançar um pagamento que ainda não aconteceu.", "data");

    const linha = await recibos.lancarAvulso(t, {
      data,
      valor: p.valor,
      nome,
      cpf,
      cpfPagador: pagador || null,
      clienteId: p.clienteId ?? null,
      observacao: p.observacao?.trim() || null,
    });
    return paraPendente(linha);
  };
}

export function criarExcluirPagamentoAvulso({ recibos }: Pick<DepsRecibo, "recibos">): ExcluirPagamentoAvulso {
  return async (t, p) => {
    if (!p.id?.trim()) throw new DadoInvalido("Diga qual lançamento.", "id");
    await recibos.excluirAvulso(t, p.id);
  };
}

/**
 * Fecha o lote, e — se pedirem — avisa cada paciente no WhatsApp.
 *
 * ── ⚠️ A ORDEM É CONFIRMAR → LER → MANDAR, E O `false` DO CONFIRMAR É O PORTÃO ──
 *
 * `confirmarLote` só sai de `gerado`. Devolveu `false`, alguém já fechou este lote — segundo
 * clique, segunda aba, ou o F5 depois de uma resposta lenta — e **não se manda nada**. É a
 * mesma claim de `abrirLote`, com a diferença de que a ação externa aqui é irreversível de um
 * jeito que arquivo baixado não é: mensagem entregue não se apaga, e o paciente que recebe
 * dois avisos do mesmo recibo liga para perguntar se foi cobrado duas vezes.
 *
 * O envio vem DEPOIS da transição, nunca antes. Se mandar primeiro e o `update` falhar, o
 * lote volta a parecer aberto — e o próximo clique manda tudo de novo.
 */
export function criarFecharLoteDeRecibos(deps: {
  recibos: RepositorioRecibos;
  canal: CanalDeMensagens;
  negocio: RepositorioNegocio;
  assistente: RepositorioAssistente;
  /* Só para achar o `telefoneDono`. É de onde sai o destino da confirmação — nunca de env. */
  canalRepo: RepositorioCanal;
}): FecharLoteDeRecibos {
  return async (t, p) => {
    if (!p.loteId?.trim()) throw new DadoInvalido("Diga qual lote.", "loteId");

    /* ⚠️ `descartado` SOLTA os atendimentos e `importado` não, e é aqui que a diferença
     * mora. Trocar os dois é o erro caro: soltar depois de importado faz o mês seguinte
     * gerar recibo em dobro para as mesmas sessões. */
    if (p.situacao === "descartado") {
      await deps.recibos.descartarLote(t, p.loteId);
      return { avisados: 0, semTelefone: 0, falhas: 0 };
    }

    const virou = await deps.recibos.confirmarLote(t, p.loteId);
    /* ⚠️ AQUI O EARLY RETURN É SÓ NO `!virou`, e não mais em `!p.avisar`. A primeira versão
     * juntava os dois — e com isso a confirmação para o DONO só saía quando ele também tinha
     * pedido para avisar os pacientes. São duas coisas diferentes: o aviso ao paciente é opt-in
     * porque vai para o WhatsApp de terceiro; a confirmação vai para o número dele mesmo. */
    if (!virou) return { avisados: 0, semTelefone: 0, falhas: 0 };

    /* Sempre lido: é o nome que assina as duas mensagens. */
    const a = await deps.assistente.ler(t);
    const nomeDaAssistente = a?.assistente.nome ?? "MAISA";

    let avisados = 0;
    let semTelefone = 0;
    let falhas = 0;

    if (p.avisar) {
      const destinatarios = await deps.recibos.destinatariosDoLote(t, p.loteId);
      semTelefone = destinatarios.filter((d) => !d.telefone).length;

      /* Nome do negócio fora do laço: a frase é a mesma para todos, e o lote de um mês cheio
       * tem trinta linhas. */
      const nomeDoNegocio = (await deps.negocio.negocio(t)).nome;

      for (const d of destinatarios) {
        if (!d.telefone) continue;
        try {
          await deps.canal.enviar(t, d.telefone, [
            avisoDeRecibo({ recibo: d, nomeDoNegocio, nomeDaAssistente }),
          ]);
          avisados++;
        } catch {
          /* ⚠️ ENGOLE E CONTA. O recibo já foi emitido no e-CAC — propagar o erro faria a tela
           * dizer que o fechamento falhou, e ela clicaria de novo: o `confirmarLote` devolveria
           * `false`, ninguém mais seria avisado, e os 20 que receberam nunca apareceriam num
           * número. Um telefone que mudou de dono não é motivo para o mês parecer roto. */
          falhas++;
        }
      }
    }

    /* ── A CONFIRMAÇÃO PARA O DONO ──
     *
     * ⚠️ POR ÚLTIMO, E FORA DA CONTA DE FALHAS. O lote já está fechado e os pacientes já foram
     * avisados: se esta mensagem não sair, nada do que aconteceu se desfaz. Somá-la a `falhas`
     * faria a tela dizer que N envios de paciente falharam quando o que falhou foi o recibo do
     * próprio dono — e ele clicaria de novo, sem efeito, porque `confirmarLote` já devolveu
     * `false`.
     *
     * ⚠️ OS NÚMEROS VÊM DO LOTE NO BANCO, não da contagem de destinatários. O banco somou na
     * transação que prendeu as linhas; contar aqui daria um número que o CSV não confirma —
     * exatamente o defeito que o `total` de `criarLerRecibosPendentes` evita. */
    const lote = (await deps.recibos.listarLotes(t)).find((l) => l.id === p.loteId);
    if (lote?.competencia) {
      await avisarODono(deps, t, {
        competencia: lote.competencia,
        linhas: lote.linhas,
        valor: lote.valor,
        avisados,
        semTelefone,
      }, nomeDaAssistente).catch(() => {});
    }

    return { avisados, semTelefone, falhas };
  };
}

/**
 * Manda a confirmação para o número do inquilino.
 *
 * Separada porque o caminho de `descartado` não passa por aqui, e porque toda falha aqui é
 * engolida: ver o comentário na chamada.
 */
async function avisarODono(
  deps: { canal: CanalDeMensagens; canalRepo: RepositorioCanal },
  t: Parameters<FecharLoteDeRecibos>[0],
  fechamento: FechamentoParaODono,
  nomeDaAssistente: string,
): Promise<void> {
  const canal = await deps.canalRepo.ler(t);
  /* `null` = o dono ainda não preencheu o "WhatsApp do dono". Estado legítimo, e a tela pede
   * sem bloquear — ver `Canal.telefoneDono`. Aqui simplesmente não há para onde mandar. */
  if (!canal?.telefoneDono) return;

  await deps.canal.enviar(t, canal.telefoneDono, [
    confirmacaoDoLote({ fechamento, nomeDaAssistente }),
  ]);
}


/**
 * Desliga o caminho do recibo — a saída para quem escolheu errado.
 *
 * Não apaga lote nenhum: o histórico do que já foi gerado continua, e é ele que responde
 * "quem importou o quê" se alguém perguntar depois. O que sai é só a configuração de quem
 * emite, e com ela o caminho volta a ser decidido pela pergunta da tela.
 */
export function criarDesligarReciboSaude({ recibos, fiscal }: DepsRecibo): DesligarReciboSaude {
  return async (t) => {
    const lotes = await recibos.listarLotes(t);
    if (lotes.some((l) => l.situacao === "importado")) {
      throw new DadoInvalido(
        "Você já importou recibos no e-CAC com esta configuração. Fale com a gente antes de trocar.",
        "lote",
      );
    }

    const config = await fiscal.salvar(t, {
      prestadorCpf: null,
      ocupacaoSaude: null,
      registroProfissional: null,
      /* ⚠️ A PROCURAÇÃO SAI JUNTO. Desligar o Receita Saúde e deixar o procurador gravado faria
       * o negócio voltar um dia por outro caminho já representado — com uma outorga que
       * ninguém lembra de ter dado, e que talvez nem exista mais no e-CAC. */
      procuradorDocumento: null,
      procuracaoValidaAte: null,
      procuracaoAceitaEm: null,
      /* Volta para homologação junto: `producao` era verdade só porque o recibo não tem
       * ambiente de teste. Deixá-lo aceso faria o próximo caminho — se for o do CNPJ —
       * nascer valendo, e nota fiscal em produção é documento que não se apaga. */
      ambiente: "homologacao",
    });
    const hoje = hojeISO();
    return {
      config,
      caminho: caminhoDaNota(config, hoje),
      falta: fiscalFaltando(config, hoje),
      /* Este caso de uso não fala com provedor nenhum, e a tela que o chama já sabe o que
       * falta no ambiente — repetir aqui exigiria arrastar o cadastro de emissor para uma
       * dependência que não é usada para mais nada. */
      provedorFaltando: [],
    };
  };
}
