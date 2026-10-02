/* ─────────────────────────────────────────────────────────────────────────────
 * RECEITA SAÚDE — o recibo de quem atende como PESSOA FÍSICA.
 *
 * ★ NÃO É NOTA FISCAL, E ESSA É A DESCOBERTA QUE ESTE ARQUIVO EXISTE PARA GUARDAR.
 *
 * Profissional de saúde pessoa física é obrigado, desde 01/01/2025, a emitir o **Recibo
 * Eletrônico de Serviços de Saúde** no e-CAC / app da Receita Federal — a IN RFB nº 2.240,
 * de 11/12/2024. O recibo em papel (ou em PDF bonito gerado por nós) **perdeu validade
 * fiscal**, e quem não emite paga R$100 por mês-calendário ou fração (art. 4º da mesma IN).
 *
 * Duas consequências que mudam o produto, não só o código:
 *
 *   1. Gerar um "recibo" nosso é PIOR que não fazer nada: não vale, e dá ao cliente a
 *      sensação de estar em dia. O documento tem que nascer dentro do sistema da Receita.
 *   2. Emitir nota fiscal NÃO desobriga do Receita Saúde (pergunta 18 do manual v2.1). Quem
 *      é PF e tem inscrição municipal emite os DOIS. Não são caminhos alternativos.
 *
 * ── ⚠️ O QUE DÁ PARA AUTOMATIZAR, E O QUE NÃO DÁ ──
 *
 * Não existe API. O que existe, desde 11/2025, é **importação em lote por arquivo CSV** no
 * Carnê-Leão (perguntas 24 e 25 do manual): o sistema de gestão gera o arquivo, o
 * profissional entra no e-CAC, importa e assina. A MAISA monta o arquivo a partir da agenda
 * — que é exatamente uma linha por pagamento recebido — e para aí.
 *
 * Vender isso como "emitimos seu recibo" seria mentira. O que a MAISA faz é tirar a
 * digitação dupla: os dados já estão na agenda, e ninguém deveria redigitá-los no e-CAC.
 *
 * ── ★ EXISTE UM ENSAIO GRATUITO, E ELE É O QUE VALIDA ESTE ARQUIVO ──
 *
 * O passo 5 do manual é "Analisar Arquivo": a Receita valida o CSV e devolve **linha, campo
 * e descrição do erro** SEM emitir nada. É o equivalente exato da homologação da nota
 * fiscal — erra-se de graça. Nenhum teste daqui prova que o layout está certo; o que prova
 * é uma análise no e-CAC. É por isso que `CAMPOS_DO_LOTE` é uma lista declarativa: quando a
 * análise reclamar de um campo, o conserto é uma linha, num lugar só.
 *
 * Fonte: manual "Receita Saúde", versão 2.1 (Outubro/2025), perguntas 24 e 25.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * As seis ocupações que o lote aceita, com o código do Carnê-Leão.
 *
 * ⚠️ **A LISTA É FECHADA, E ISSO RECORTA O ICP.** Só estas seis existem no arquivo, e o
 * código tem que ser o da ocupação **cadastrada no Carnê-Leão, com registro ativo**. Duas
 * ausências importantes para quem vende para "terapeutas":
 *
 *   nutricionista .......... não está na lista de ocupações do lote;
 *   terapeuta holístico,
 *   massoterapeuta ......... não são profissionais de saúde para a IN 2.240 — não emitem
 *                            Receita Saúde nenhum, nem em lote nem à mão.
 *
 * Ou seja: a vertical "terapeutas" da MAISA contém gente que este caminho atende (psicóloga,
 * fisioterapeuta, fonoaudióloga, TO) e gente que ele não atende. Perguntar a profissão é
 * inevitável aqui — não há CNPJ de onde derivá-la, que é justamente o caso destes clientes.
 */
export const CODIGO_OCUPACAO = {
  medico: "225",
  odontologo: "226",
  fonoaudiologo: "230",
  fisioterapeuta: "231",
  terapeuta_ocupacional: "232",
  psicologo: "255",
} as const;

export type OcupacaoSaude = keyof typeof CODIGO_OCUPACAO;

/** Rendimento do trabalho não assalariado. Fixo — é o único que cabe em recibo. */
export const CODIGO_RENDIMENTO = "R01.001.001";

/** Teto do arquivo. Acima disso o e-CAC recusa a importação inteira, não a linha. */
export const LIMITE_LINHAS = 1000;

/** Teto da descrição. O que passa é cortado aqui, e não pela Receita. */
export const LIMITE_DESCRICAO = 255;

/**
 * Quem emite. Os três campos vêm da configuração do negócio, e nenhum deles é derivável:
 * não há CNPJ para consultar na Receita quando o prestador é pessoa física.
 */
export type EmissorDeRecibo = {
  /** 11 dígitos. **Tem que ser o mesmo CPF que acessa o Carnê-Leão** — o manual exige. */
  cpf: string;
  ocupacao: OcupacaoSaude;
  /**
   * O registro no conselho (CRP, CREFITO…), até 15 caracteres.
   *
   * Pode ir vazio quando o profissional tem só um registro ativo — e mesmo assim vale
   * preencher: é ele que sai impresso no recibo, e **recibo sem registro é o motivo nº 1 de
   * recusa de reembolso pelo plano de saúde**. O campo é opcional para a Receita e
   * praticamente obrigatório para o paciente.
   */
  registroProfissional: string | null;
};

/**
 * Um pagamento recebido — a unidade do arquivo.
 *
 * ⚠️ A UNIDADE É O PAGAMENTO, NÃO O ATENDIMENTO, e as duas coisas se separam. O manual manda
 * emitir "na data do pagamento", e um pagamento parcelado gera **um recibo por parcela**. Na
 * MAISA as duas datas coincidem (paga-se na sessão), então `dataPagamento` nasce da data do
 * atendimento — mas o tipo guarda a distinção para o dia em que alguém pagar um pacote de
 * dez sessões adiantado. Chamar este campo de "data do atendimento" seria plantar um erro
 * que só aparece nesse dia.
 */
export type PagamentoRecebido = {
  /** ISO (`AAAA-MM-DD`). Convertido para `DD/MM/AAAA` na linha. */
  dataPagamento: string;
  /** Maior que zero. Vai com vírgula decimal e sem separador de milhar. */
  valor: number;
  /** Onde entram as DATAS DAS SESSÕES — é o que o plano de saúde pede no reembolso. */
  descricao: string;
  /** Quem pagou. Mãe que paga a terapia do filho é ela aqui, e o filho no beneficiário. */
  cpfPagador: string;
  /** Quem usufruiu do serviço. */
  cpfBeneficiario: string;
};

/**
 * O LAYOUT, em ordem, como o manual apresenta.
 *
 * ⚠️ **A ORDEM VEIO DA TABELA DO MANUAL, NÃO DO EXEMPLO.** O manual traz um "exemplo de
 * linha" logo abaixo da tabela, e ele é uma IMAGEM — não deu para lê-lo. A tabela é
 * sequencial e completa, então a ordem abaixo é a dela. Isto é o único pedaço deste arquivo
 * que não está confirmado, e a confirmação custa zero: uma análise no e-CAC.
 *
 * Os campos "sempre vazio" ficam na lista de propósito. O CSV é posicional: suprimir um
 * campo vazio desloca todos os seguintes, e o erro que volta fala do campo errado.
 */
export const CAMPOS_DO_LOTE = [
  { nome: "Data do pagamento", formato: "DD/MM/AAAA" },
  { nome: "Código do rendimento", formato: `fixo ${CODIGO_RENDIMENTO}` },
  { nome: "Código da ocupação", formato: "3 dígitos" },
  { nome: "Valor do pagamento", formato: "vírgula decimal, sem separador de milhar" },
  { nome: "Valor da dedução", formato: "sempre vazio" },
  { nome: "Descrição", formato: `até ${LIMITE_DESCRICAO} caracteres` },
  { nome: "Recebido de", formato: "fixo PF" },
  { nome: "CPF do pagador", formato: "11 dígitos" },
  { nome: "CPF do beneficiário", formato: "11 dígitos" },
  { nome: "Ind. CPF não informado", formato: "sempre vazio" },
  { nome: "CNPJ", formato: "sempre vazio" },
  { nome: "Indicador de IRRF", formato: "sempre vazio" },
  { nome: "Valor IRRF", formato: "sempre vazio" },
  { nome: "Indicador de recibo", formato: "fixo S" },
  { nome: "CPF do profissional", formato: "11 dígitos" },
  { nome: "Registro profissional", formato: "até 15 caracteres, pode ser vazio" },
] as const;

import { cpfValido } from "./clientes";
import { MESES } from "./tempo";

const digitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** `2026-08-21` → `21/08/2026`. */
export function dataBrasileira(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * `1234.5` → `"1234,50"`.
 *
 * Vírgula decimal e sem separador de milhar, como o manual pede. `toFixed` antes da troca
 * porque `12.3` tem que virar `12,30`: o campo é monetário, e um valor com uma casa passa
 * pela análise e vira recibo de outro valor.
 */
export function valorBrasileiro(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Descrição limpa: sem `;` (quebraria a coluna), sem quebra de linha, no teto. */
export function descricaoDoRecibo(texto: string): string {
  return texto.replace(/[;\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITE_DESCRICAO);
}

/**
 * Por que esta linha não pode entrar no arquivo. Vazio = pode.
 *
 * ⚠️ OS CPFs SÃO CONFERIDOS NO DÍGITO, e não só no tamanho — ver `cpfValido`. A Receita
 * recusa CPF que não fecha no módulo 11 ("Titular do pagamento inválido"), e ela só diz isso
 * na análise do arquivo, depois. Descobrir aqui é a diferença entre uma frase na tela e uma
 * ida ao portal para nada.
 */
export function linhaFaltando(e: EmissorDeRecibo, p: PagamentoRecebido): string[] {
  const falta: string[] = [];
  if (!cpfValido(e.cpf)) falta.push("o CPF de quem emite");
  if (!cpfValido(p.cpfBeneficiario)) falta.push("um CPF válido de quem foi atendido");
  /* Só reclama do pagador quando ele é OUTRA PESSOA. No caso comum — paga por si — os dois
   * campos carregam o mesmo número, e listar as duas faltas faria a tela dizer "falta um CPF
   * válido de quem pagou, um CPF válido de quem foi atendido" sobre um CPF só. */
  if (digitos(p.cpfPagador) !== digitos(p.cpfBeneficiario) && !cpfValido(p.cpfPagador)) {
    falta.push("um CPF válido de quem pagou");
  }
  if (!(p.valor > 0)) falta.push("um valor maior que zero");
  if (!/^\d{4}-\d{2}-\d{2}/.test(p.dataPagamento)) falta.push("a data do pagamento");
  return falta;
}

/** Uma linha do CSV. Assume `linhaFaltando` vazio — quem monta o lote é que filtra. */
export function linhaDoLote(e: EmissorDeRecibo, p: PagamentoRecebido): string {
  return [
    dataBrasileira(p.dataPagamento),
    CODIGO_RENDIMENTO,
    CODIGO_OCUPACAO[e.ocupacao],
    valorBrasileiro(p.valor),
    "", // valor da dedução — não se aplica a recibo
    descricaoDoRecibo(p.descricao),
    "PF",
    digitos(p.cpfPagador),
    digitos(p.cpfBeneficiario),
    "", // ind. CPF não informado
    "", // CNPJ
    "", // indicador de IRRF
    "", // valor IRRF
    "S",
    digitos(e.cpf),
    (e.registroProfissional ?? "").trim().slice(0, 15),
  ].join(";");
}

export type LoteMontado = {
  /** O arquivo, pronto para salvar como `.csv`. Vazio quando nada entrou. */
  csv: string;
  linhas: number;
  valor: number;
  /**
   * Os pagamentos que entraram — **os mesmos objetos** que foram passados, não copias.
   *
   * ★ EXISTE PARA QUEM CHAMA CONSEGUIR VOLTAR DO CSV PARA A ORIGEM, e a identidade é o ponto.
   * Antes o caso de uso casava a linha recusada com a sessão por uma chave montada à mão
   * (`data + cpf`) — e duas sessões do MESMO paciente NO MESMO DIA (que é banal: duas
   * crianças, ou sessão dupla) colidiam nessa chave. O efeito era trancar a sessão errada, ou
   * trancar uma que não entrou no arquivo. Comparar por referência não tem esse furo.
   */
  entraram: PagamentoRecebido[];
  /**
   * O que ficou de fora, com o motivo em português.
   *
   * ⚠️ EXISTE PARA NÃO TRUNCAR EM SILÊNCIO. Um lote que sai com 8 de 12 pagamentos e não
   * diz nada é pior que um erro: o dono importa, assina, e fica achando que emitiu o mês
   * inteiro. Os quatro que faltam só aparecem quando um paciente cobrar o recibo.
   */
  recusadas: { pagamento: PagamentoRecebido; motivos: string[] }[];
  /** O que sobrou por causa do teto de 1000 linhas. Vai para o próximo arquivo. */
  sobraram: PagamentoRecebido[];
};

/**
 * Monta o arquivo.
 *
 * ⚠️ **ANO ÚNICO POR ARQUIVO.** O manual exige que todos os pagamentos sejam do mesmo ano, e
 * a virada de dezembro é onde isso morde: um lote fechado em janeiro com sessões de dezembro
 * é recusado inteiro. Aqui as linhas de outro ano são RECUSADAS com motivo, e não o arquivo
 * — o mês de janeiro sai, e o dono fica sabendo o que ficou para trás.
 *
 * O ano de referência é o da primeira linha válida, e não o de hoje: quem gera um lote
 * retroativo (a Receita permite, com ajuste do Carnê-Leão) está justamente no caso em que
 * "hoje" é o ano errado.
 */
export function montarLoteCsv(e: EmissorDeRecibo, pagamentos: PagamentoRecebido[]): LoteMontado {
  const recusadas: LoteMontado["recusadas"] = [];
  const validos: PagamentoRecebido[] = [];

  for (const p of pagamentos) {
    const motivos = linhaFaltando(e, p);
    if (motivos.length) recusadas.push({ pagamento: p, motivos });
    else validos.push(p);
  }

  const ano = validos[0]?.dataPagamento.slice(0, 4);
  const doAno: PagamentoRecebido[] = [];
  for (const p of validos) {
    if (ano && p.dataPagamento.slice(0, 4) !== ano) {
      recusadas.push({ pagamento: p, motivos: [`é de ${p.dataPagamento.slice(0, 4)}, e o arquivo é de ${ano}`] });
    } else doAno.push(p);
  }

  const entram = doAno.slice(0, LIMITE_LINHAS);
  const sobraram = doAno.slice(LIMITE_LINHAS);

  return {
    csv: entram.map((p) => linhaDoLote(e, p)).join("\r\n"),
    linhas: entram.length,
    entraram: entram,
    valor: entram.reduce((s, p) => s + p.valor, 0),
    recusadas,
    sobraram,
  };
}

/**
 * O nome do arquivo que o dono vai ver na pasta de downloads.
 *
 * Leva CPF e competência porque ele vai ter um por mês, e "recibos.csv" duplicado sete vezes
 * na pasta de Downloads é o caminho mais curto para importar o mês errado.
 */
export function nomeDoArquivo(cpf: string, competencia: string): string {
  return `receita-saude-${digitos(cpf).slice(0, 11)}-${competencia.slice(0, 7)}.csv`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O AVISO NO WHATSAPP — o que o paciente recebe depois de o lote ser importado.
 *
 * ★ A MAISA NÃO MANDA O RECIBO. MANDA A NOTÍCIA DE QUE ELE EXISTE.
 *
 * A importação em lote no Carnê-Leão Web devolve **dois arquivos: o PDF da lista de erros e
 * o CSV das linhas processadas.** Os PDFs dos recibos não vêm — eles só saem um por um, na
 * tela do e-CAC. Então "emitir o mês inteiro e mandar o PDF de cada paciente" não existe, e
 * não por limite nosso.
 *
 * O que existe, e é melhor: assim que o recibo é emitido, a Receita **notifica o paciente no
 * app dele e joga o recibo na declaração pré-preenchida**. O documento já está onde ele vai
 * precisar. Falta ele SABER — e é exatamente isso que esta mensagem faz.
 *
 * ⚠️ NÃO LEVA O NOME DO SERVIÇO, pelo mesmo motivo de `descricaoPadrao` no caso de uso:
 * "Terapia de casal" numa mensagem de WhatsApp é dado sensível saindo por um campo que
 * ninguém pensou como sigiloso — e aqui é pior, porque a tela do celular fica na mesa.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Uma linha do lote, do ponto de vista de quem vai receber o aviso. */
export type ReciboAvisavel = {
  nome: string | null;
  /** Data do pagamento, ISO. Vira dd/mm na frase. */
  data: string;
  valor: number;
  /** Quantas sessões o recibo junta (01/10/2026). Ausente ou 1 = a frase de uma sessão. */
  sessoes?: number;
};

const soPrimeiroNome = (nome: string | null): string => {
  const limpo = (nome ?? "").trim();
  if (!limpo || limpo === "—") return "";
  return limpo.split(/\s+/)[0];
};

export function avisoDeRecibo(p: {
  recibo: ReciboAvisavel;
  nomeDoNegocio: string;
  nomeDaAssistente: string;
}): string {
  const nome = soPrimeiroNome(p.recibo.nome);
  const ola = nome ? `Oi, ${nome}!` : "Oi!";
  const [, mes, dia] = p.recibo.data.slice(0, 10).split("-");
  const n = p.recibo.sessoes ?? 1;
  /* Um recibo por mês (01/10/2026): "dos seus 4 atendimentos de setembro", sem as datas, que estão
   * no próprio recibo. */
  const doQue = n > 1
    ? `dos seus ${n} atendimentos de ${MESES[Number(mes) - 1]}`
    : `do seu atendimento de ${dia}/${mes}`;

  return (
    `${ola} O recibo ${doQue} (R$ ${valorBrasileiro(p.recibo.valor)}) ` +
    `no ${p.nomeDoNegocio} já foi emitido no Receita Saúde, da Receita Federal. ` +
    /* A parte acionável da frase. Sem ela o paciente responde "me manda o PDF" — e o PDF é
     * justamente o que não temos para dar. */
    `Ele vai aparecer na sua declaração pré-preenchida do Imposto de Renda, ` +
    `então não precisa guardar papel. Qualquer dúvida, me chama por aqui. ` +
    `— ${p.nomeDaAssistente}`
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A CONFIRMAÇÃO PARA O DONO — a mensagem que fecha o mês.
 *
 * ★ ELA NÃO É NOTIFICAÇÃO, É COMPROVANTE. E foi pedida por quem vai usar: *"seria muito show
 * que, assim que eu clicasse que subi os recibos, eu recebesse da MAISA a confirmação."*
 *
 * O porquê é mais forte do que "é legal": fechar o mês fiscal é o momento de maior ansiedade
 * de quem atende como pessoa física — R$100 de multa por mês-calendário não emitido, e nenhuma
 * confirmação de que acabou. A tela diz "pronto" e depois some. **Uma mensagem no WhatsApp
 * fica**: é rolável, encaminhável para o contador, e responde "eu já fiz agosto?" em três
 * meses, quando ninguém lembra.
 *
 * ⚠️ VAI PARA O NÚMERO DO INQUILINO (`Canal.telefoneDono`), nunca para uma env global. Aqui o
 * risco de errar é menor que na escalação — o texto não carrega telefone de paciente — mas
 * carrega **quantos pacientes e quanto faturou**, que é informação de negócio de outra pessoa.
 * ────────────────────────────────────────────────────────────────────────────── */

/** ⚠️ Só agregado. NENHUM nome de paciente, NENHUM CPF: é mensagem, e mensagem se encaminha. */
export type FechamentoParaODono = {
  competencia: string;
  linhas: number;
  valor: number;
  avisados: number;
  semTelefone: number;
};

export function confirmacaoDoLote(p: {
  fechamento: FechamentoParaODono;
  nomeDaAssistente: string;
}): string {
  const f = p.fechamento;
  const [ano, mes] = f.competencia.slice(0, 7).split("-");
  const nome = MESES_LONGOS[Number(mes) - 1] ?? f.competencia.slice(0, 7);

  const partes = [
    `✅ *Recibos de ${nome} lançados*`,
    "",
    `${f.linhas} recibo${f.linhas === 1 ? "" : "s"} · R$ ${valorBrasileiro(f.valor)}`,
  ];

  if (f.avisados > 0) {
    partes.push(`${f.avisados} paciente${f.avisados === 1 ? "" : "s"} avisado${f.avisados === 1 ? "" : "s"} aqui no WhatsApp`);
  }
  /* ⚠️ ACIONÁVEL, e por isso entra na mensagem: são pacientes com recibo emitido e sem aviso, e
   * o conserto é pôr o telefone no cadastro. Omitir faria o número da tela e o da mensagem
   * discordarem — e aí o dono não confia em nenhum dos dois. */
  if (f.semTelefone > 0) {
    partes.push(`⚠️ ${f.semTelefone} sem telefone no cadastro, esse${f.semTelefone === 1 ? "" : "s"} não foi avisado`);
  }

  partes.push(
    "",
    `Guardei o registro de ${nome}/${ano}. O próximo arquivo começa a juntar a partir de agora.`,
    `— ${p.nomeDaAssistente}`,
  );

  return partes.join("\n");
}

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
