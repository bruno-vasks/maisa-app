/* ─────────────────────────────────────────────────────────────────────────────
 * FISCAL — a nota do mês, no vocabulário do app.
 *
 * Estes estados são NOSSOS, não da Focus NFe. O adaptador traduz o vocabulário da
 * prefeitura ("processando_autorizacao", "erro_autorizacao") para cá — é o que
 * permite trocar de emissor sem que nenhuma tela perceba.
 *
 *   pendente     — fechado no mês, nota ainda não enviada
 *   processando  — enviada à prefeitura, aguardando número (assíncrono)
 *   emitida      — autorizada; tem número, e pdf quando a emissão foi real
 *   cancelada    — autorizada e depois cancelada
 *   erro         — a prefeitura ou o emissor rejeitou; `erro` traz o motivo
 * ────────────────────────────────────────────────────────────────────────────── */

import { soDigitos } from "./clientes";
import { diasEntre } from "./tempo";
import type { OcupacaoSaude } from "./recibo-saude";

export type StatusNota = "pendente" | "processando" | "emitida" | "cancelada" | "erro";

export type Nota = {
  status: StatusNota;
  numero?: string;
  data?: string;
  /** Chave da emissão no provedor — necessária para consultar status e cancelar. */
  ref?: string;
  pdf?: string;
  erro?: string;
  /** Nota que saiu sem token do emissor (número gerado localmente). */
  simulada?: boolean;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE FALTA FATURAR — e por que a unidade é o ATENDIMENTO, não o cliente.
 *
 * ★ A RECLAMAÇÃO DO BRUNO (14/08/2026), que este tipo existe para resolver:
 *   "a lógica da página de faturamento está errada. ela deve ser diretamente atrelada à tela
 *    de agendamentos, e deve ser totalmente calculada com base no tanto de agendamentos que
 *    foram feitos desde a última emissão de notas. além disso, ela deve contabilizar os casos
 *    em que uma única pessoa teve a nota emitida, e tirar essa pessoa da emissão em massa."
 *
 * Antes o "já emitiu" morava no `localStorage`, mapeado POR CLIENTE — não por período. Três
 * consequências, todas medidas lendo o código: trocar de navegador ressuscitava o botão; quem
 * teve nota em agosto nunca mais aparecia como pendente; e a soma vinha do total da
 * competência, então emitir duas vezes no mês cobrava o mês inteiro nas duas.
 *
 * Agora a pergunta é `atendimentos.nota_id is null`, e ela responde as DUAS metades da
 * reclamação de uma vez: já significa "desde a última emissão", e já exclui quem tem nota.
 * ────────────────────────────────────────────────────────────────────────────── */

export type AFaturar = {
  clienteId: string;
  nome: string;
  /** Documento do tomador. Vazio bloqueia a emissão — a prefeitura exige. */
  cpf: string | null;
  /** Quantos atendimentos já prestados estão sem nota. Nunca zero. */
  atendimentos: number;
  valor: number;
  /** O serviço mais frequente do período — é o que vai na discriminação. */
  servico: string | null;
  /** Do primeiro ao último atendimento sem nota, em data civil. */
  desde: string;
  ate: string;
  competencia: string;
  /** Cliente de teste fiscal. Fica fora do lote — ver `RepositorioNotas.aFaturar`. */
  teste: boolean;
};

/** Uma nota como está no banco. */
export type NotaGravada = Nota & {
  id: string;
  clienteId: string | null;
  /**
   * O nome de quem recebeu, como estava NA EMISSÃO.
   *
   * ⚠️ Vem do snapshot da nota, e não de um join com `clientes`. Nota fiscal autorizada é
   * documento imutável: ela não pode passar a mostrar outro nome porque alguém corrigiu o
   * cadastro depois. É a mesma razão de `notas` não ter FK para `clientes`.
   */
  tomadorNome: string | null;
  valor: number;
  competencia: string | null;
  ambiente: AmbienteFiscal | null;
};

/**
 * O texto que a prefeitura IMPRIME no documento.
 *
 * Mora no núcleo, e não na tela, porque foi na tela que ele já saiu errado uma vez: o store
 * montava a frase com um nome de serviço do catálogo VIVO, e a nota saía com o nome que o
 * dono tinha acabado de trocar — descrevendo um serviço diferente do que foi prestado.
 *
 * Aqui a fonte é o snapshot do atendimento (`AFaturar.servico`), que não muda depois.
 */
export function discriminacaoDaNota(a: Pick<AFaturar, "servico" | "atendimentos" | "competencia">): string {
  const quantos = `${a.atendimentos} ${a.atendimentos === 1 ? "atendimento" : "atendimentos"}`;
  const mes = a.competencia ? a.competencia.slice(0, 7).split("-").reverse().join("/") : "";
  /* "Corte de cabelo — 3 atendimentos · 08/2026". Serviço separado por travessão, período
   * por ponto médio: é o formato que já estava saindo nas notas, e mudá-lo mudaria o texto
   * de documentos futuros sem motivo. */
  const cabeca = [a.servico?.trim() || "Prestação de serviço", quantos].join(" — ");
  return mes ? `${cabeca} · ${mes}` : cabeca;
}

/** Quem recebe a nota. */
export type Tomador = {
  nome?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
};

export type PedidoDeNota = {
  /** Chave idempotente da emissão, cunhada por quem pede. */
  ref: string;
  valor: number;
  discriminacao: string;
  tomador: Tomador;
};

/** O que o emissor devolve, já no nosso vocabulário. */
export type ResultadoDeNota = {
  status:
    | "processando" | "autorizado" | "cancelado" | "erro" | "simulado"
    /**
     * ⚠️ NÃO É ERRO, e é por isso que tem nome próprio.
     *
     * A claim (`RepositorioNotas.abrir`) não encontrou atendimento sem nota: outra aba, ou o
     * segundo clique, chegou primeiro e já prendeu tudo. Tratar isso como `erro` faria o dono
     * clicar de novo procurando entender — e é justamente o clique que a claim existe para
     * tornar inofensivo. A tela mostra "já faturado" e recarrega a lista.
     */
    | "ja_faturado";
  ref: string;
  numero?: string;
  url?: string;
  pdf?: string;
  xml?: string;
  erros?: { mensagem: string }[];

  /* ── ⚠️ ESTES DOIS DESCEM PARA CÁ, e antes eram getters da porta `EmissorFiscal` ──
   *
   * `emissor.ambiente` e `emissor.simulado` eram propriedades do EMISSOR, sem inquilino:
   * uma resposta só, para todo mundo. Isso já era falso antes de existir o segundo
   * cliente, porque o ambiente é escolha de cada negócio — um pode estar testando em
   * homologação enquanto o outro fatura de verdade.
   *
   * O modo de falha era a mentira mais cara possível numa tela fiscal: a rota respondia
   * `ambiente: "homologacao"` (o do env) para uma nota que saiu em PRODUÇÃO, e o dono
   * lia "isto é teste" sobre um documento com validade fiscal.
   *
   * Aqui eles não podem divergir: descrevem a emissão que acabou de acontecer. */

  /** Onde esta nota saiu. `homologacao` não tem efeito fiscal. */
  ambiente?: AmbienteFiscal;
  /** Saiu sem emissor de verdade — fluxo inteiro exercitado, documento nenhum criado. */
  simulado?: boolean;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * QUEM EMITE — a configuração fiscal de um inquilino.
 *
 * ★ O CAMINHO DE EMISSÃO É DECIDIDO POR `optanteMei`, E NÃO É PERGUNTA DE TELA.
 *
 *   "Para MEI a emissão via Ambiente Nacional é obrigatória, independente do município,
 *    desde setembro de 2023."   — guia dos municípios da NFS-e Nacional, Focus NFe (2026)
 *
 * O ICP da MAISA — barbeiro, terapeuta autônomo — é quase todo MEI. O caminho municipal,
 * para o qual `config_fiscal` foi desenhada em 002, **não vale para a maioria**. E errar
 * não dá erro na emissão: dá 202 "processando" e uma recusa da Receita minutos depois.
 *
 * `optanteMei` vem da consulta de CNPJ (Receita, via Focus). O dono digita 14 dígitos e
 * não responde mais nada — é a razão de este tipo existir em vez de um formulário.
 * ────────────────────────────────────────────────────────────────────────────── */

export type AmbienteFiscal = "homologacao" | "producao";

/**
 * O que a Receita sabe sobre um CNPJ.
 *
 * ★ É ESTE TIPO QUE TIRA SETE PERGUNTAS DO ONBOARDING. Razão social, município, CNAE e
 * regime vêm dos 14 dígitos — ninguém digita endereço, e ninguém é perguntado se é MEI.
 *
 * Mora no DOMÍNIO e não na porta do provedor porque não é vocabulário de provedor: é o
 * cadastro público de uma empresa brasileira. Qualquer emissor que trocássemos devolveria
 * as mesmas coisas, porque a fonte é a mesma Receita.
 */
export type CadastroDoCnpj = {
  cnpj: string;
  razaoSocial: string | null;
  /** "ativa", "baixada"… Nota não sai de CNPJ que não está ativo. */
  situacao: string | null;
  cnae: string | null;
  /** ⚠️ Escolhe o caminho de emissão — ver `caminhoDaNota`. */
  optanteMei: boolean;
  optanteSimples: boolean;
  /** IBGE, 7 dígitos. */
  codigoMunicipio: string | null;
  municipio: string | null;
  uf: string | null;
};

/** Por qual caminho a nota sai. Derivado, nunca escolhido à mão — ver `caminhoDaNota`. */
/**
 * Quem a Receita vai ver emitindo.
 *
 * ⚠️ REVOGAÇÃO NÃO APARECE AQUI, e não tem como aparecer: o e-CAC não avisa ninguém quando uma
 * procuração é cancelada, e não há o que consultar de fora. A gente só descobre quando a
 * emissão falha. Por isso o vencimento — que é a parte **previsível** — não pode ser
 * desperdiçado: é o único aviso que dá para dar antes do prejuízo.
 */
export type Representacao =
  /** Ela mesma entra no e-CAC. Continua válido, e é o padrão de quem não outorgou nada. */
  | { modo: "propria" }
  /**
   * ★ ELA JÁ FEZ A PARTE DELA. A bola está com a gente — falta aceitar na aba *Recebidas*.
   *
   * ⚠️ NÃO É `representada`. Enquanto não aceitarmos, a Receita recusa a troca de perfil com
   * "pendente de aprovação", e a emissão não sai. Tratar como representada faria a tela
   * prometer um botão que falha — e o cliente esperando uma emissão que nunca começou.
   */
  | { modo: "aguardando_aceite"; procurador: string; ate: string | null }
  /** Nós emitimos por ela. `ate: null` = outorgada sem prazo. */
  | { modo: "representada"; procurador: string; ate: string | null; diasParaVencer: number | null }
  /**
   * ★ VENCEU — E ISSO NÃO PODE VIRAR `propria` EM SILÊNCIO. Cair para o modo próprio faria a
   * tela voltar a mandá-la ao e-CAC sozinha, mudando o produto que ela comprou por causa de uma
   * data, sem ninguém dizer nada. O estado existe para a tela conseguir falar "venceu".
   */
  | { modo: "vencida"; procurador: string; ate: string };

/**
 * Quantos dias antes do vencimento a tela começa a cobrar a renovação.
 *
 * ⚠️ TRINTA, E NÃO TRÊS. Reoutorgar depende DELA: logar no gov.br, achar o menu, marcar a
 * permissão certa. Avisar em cima da hora é um mês de recibos parados esperando uma pessoa que
 * não trabalha para nós — e o mês do Receita Saúde tem prazo.
 */
export const AVISO_PROCURACAO_DIAS = 30;

export function representacao(c: ConfigFiscal, hoje: string): Representacao {
  const procurador = soDigitos(c.procuradorDocumento ?? "");
  if (!procurador) return { modo: "propria" };

  const ate = c.procuracaoValidaAte;
  /* Vencida vem ANTES do aceite: uma outorga que venceu sem a gente aceitar está morta de duas
   * formas, e a frase útil é a do vencimento — aceitar não ressuscita. */
  if (ate && ate < hoje) return { modo: "vencida", procurador, ate };

  if (!c.procuracaoAceitaEm) return { modo: "aguardando_aceite", procurador, ate };

  return {
    modo: "representada",
    procurador,
    ate,
    diasParaVencer: ate ? diasEntre(hoje, ate) : null,
  };
}

/** Vence em breve? Só existe para quem está representada COM prazo. */
export function procuracaoAVencer(r: Representacao): boolean {
  return r.modo === "representada"
    && r.diasParaVencer !== null
    && r.diasParaVencer <= AVISO_PROCURACAO_DIAS;
}

export type CaminhoFiscal =
  /** DPS no Ambiente Nacional. MEI sempre; Simples a partir de 01/11/2026. */
  | "nacional"
  /** NFS-e no formato da prefeitura. Só até a virada — ver `VIRADA_SIMPLES_NACIONAL`. */
  | "municipal"
  /**
   * ★ NÃO É NOTA FISCAL. Recibo Eletrônico de Serviços de Saúde ("Receita Saúde"), que é o
   * documento de quem atende como PESSOA FÍSICA — psicóloga, fisioterapeuta, fonoaudióloga,
   * TO. Obrigatório desde 01/01/2025 (IN RFB 2.240/2024), emitido dentro do e-CAC, e a
   * automação possível é um CSV em lote. Ver `dominio/recibo-saude.ts`.
   */
  | "recibo_saude";

/**
 * O dia em que ME/EPP do Simples deixa de emitir pela prefeitura.
 *
 * ★ **Resolução CGSN nº 191, de 04/08/2026**: a partir de 01/11/2026 a emissão passa a ser
 * pelo Emissor Nacional (web ou API), com transição até 31/12/2026 e CBS/IBS em 01/2027. A
 * data anterior era setembro e foi prorrogada — por isso é constante com nome, e não um
 * literal escondido dentro de um `if`.
 *
 * ⚠️ Isto dá prazo de validade ao caminho municipal. Em São Paulo o efeito é maior do que
 * trocar de layout: a capital aderiu ao ADN em 12/2025 **mantendo o emissor próprio**, então
 * para ME paulistana a virada é troca de SISTEMA. Nada a fazer no código antes da data — o
 * que não podia acontecer é a data existir só na cabeça de quem leu a notícia.
 */
export const VIRADA_SIMPLES_NACIONAL = "2026-11-01";

export type ConfigFiscal = {
  ambiente: AmbienteFiscal;
  /** Só dígitos, 14. `null` enquanto o dono não ligou a nota fiscal. */
  cnpj: string | null;
  razaoSocial: string | null;
  /** IBGE, 7 dígitos. */
  codigoMunicipio: string | null;
  optanteMei: boolean;
  optanteSimples: boolean;
  /** O `id` da empresa na Focus. `null` = ela ainda não foi cadastrada lá. */
  empresaId: number | null;
  /** Vencimento do certificado A1. `null` = nenhum certificado subiu. */
  certificadoValidoAte: string | null;

  /* ── caminho nacional ── */
  codigoTributacaoNacional: string | null;

  /* ── caminho do recibo (prestador pessoa física) ──
   *
   * ⚠️ NENHUM DOS TRÊS É DERIVÁVEL. Os campos do caminho fiscal saem dos 14 dígitos do CNPJ
   * consultados na Receita; aqui não há CNPJ para consultar — é o próprio caso. Então são as
   * três únicas perguntas deste caminho, e em troca ele não pede certificado digital. */

  /** Só dígitos, 11. **É a presença dele que escolhe o caminho** — ver `caminhoDaNota`. */
  prestadorCpf: string | null;
  /** Uma das seis ocupações que o lote do Carnê-Leão aceita. */
  ocupacaoSaude: OcupacaoSaude | null;
  /**
   * CRP, CREFITO, CRFa… até 15 caracteres.
   *
   * **Não entra em `fiscalFaltando`**, e isso vale só para o ARQUIVO: o lote do e-CAC aceita
   * vazio quando o profissional tem um registro ativo só. Para o recibo unitário ele é
   * obrigatório: o canal de emissão recusa habilitar quem não tem, e `criarEmitirRecibo` e
   * `faltaParaEmitirRecibo` bloqueiam sem ele (25–29/09/2026). A frase "o domínio não impede",
   * que morava aqui, era do tempo em que só existia o arquivo.
   */
  registroProfissional: string | null;

  /* ── ★ representação: quem entra no e-CAC por ela ──
   *
   * A procuração eletrônica do e-CAC, com a permissão **"IRPF – Carnê Leão Web"**, autoriza um
   * terceiro a *"emitir, consultar, cancelar e alterar seus recibos"*. É o que transforma o
   * Receita Saúde de "ela aprende o portal" em "ela aperta um botão": entramos com credencial
   * NOSSA e trocamos de perfil, que é o fluxo normal de contador. Ela outorga com gov.br prata
   * ou ouro — certificado é nosso, não dela.
   *
   * ⚠️ É A ÚNICA PEÇA DESTA ARQUITETURA QUE VENCE E DEPENDE DAS MÃOS DELA. Certificado,
   * servidor e código são nossos; reoutorgar exige ela, logada no gov.br. */

  /** CPF ou CNPJ de quem emite por ela, só dígitos. `null` = ela mesma emite. */
  procuradorDocumento: string | null;
  /** Data civil do fim da procuração. `null` = outorgada sem prazo — o e-CAC permite. */
  procuracaoValidaAte: string | null;
  /**
   * Quando NÓS aceitamos a autorização. `null` = ela outorgou e a bola está do nosso lado.
   *
   * ★ ESTE CAMPO EXISTE PORQUE A RECEITA MUDOU A REGRA. A autorização nasce "Em Análise" e só
   * passa a valer depois que o procurador **confirma que assume a função**, na aba *Recebidas*
   * de "Minhas Autorizações de Acesso". Descoberto na tela, em 25/08/2026.
   *
   * Parece burocracia a mais e é o contrário: como o aceite é nosso, a gente sabe o instante
   * exato em que a emissão passou a ser possível — sem adivinhar se a cliente fez certo. E é o
   * momento de conferir se ela marcou o serviço certo, antes de prometer que funciona.
   */
  procuracaoAceitaEm: string | null;

  /* ── caminho municipal ── */
  inscricaoMunicipal: string | null;
  itemListaServico: string | null;
  aliquotaIss: number | null;
  codigoTributarioMunicipio: string | null;
};

/**
 * Por onde o documento deste negócio tem que sair.
 *
 * ★ A ORDEM DAS TRÊS PERGUNTAS É O CONTEÚDO DA FUNÇÃO:
 *
 *   tem CPF de prestador? → `recibo_saude`. Quem atende como pessoa física não emite nota
 *                           fiscal de jeito nenhum; emite o Receita Saúde. Vem primeiro
 *                           porque não é regime tributário, é outro documento.
 *   é MEI? .............. → `nacional`, obrigatório desde 09/2023 independente do município.
 *   é Simples, e já virou? → `nacional` (CGSN 191/2026).
 *   resto ............... → `municipal`.
 *
 * ⚠️ NÃO É "SEM CNPJ → RECIBO". Inquilino que ainda não digitou o CNPJ tem os dois campos
 * nulos, e ele não é pessoa física: é alguém no meio do onboarding. Derivar o caminho da
 * AUSÊNCIA de CNPJ faria a tela pedir CPF e profissão a um barbeiro MEI que só não terminou
 * de preencher. Quem escolhe é a presença de `prestadorCpf`, que só existe se alguém disse
 * "atendo como pessoa física".
 */
export function caminhoDaNota(
  c: Pick<ConfigFiscal, "prestadorCpf" | "optanteMei" | "optanteSimples">,
  hoje: string,
): CaminhoFiscal {
  if (c.prestadorCpf) return "recibo_saude";
  if (c.optanteMei) return "nacional";
  if (c.optanteSimples && hoje >= VIRADA_SIMPLES_NACIONAL) return "nacional";
  return "municipal";
}

/**
 * O que ainda falta para emitir de verdade — em português, para a tela.
 *
 * ⚠️ ESPELHA `fiscal_configurado()` do 014, e a duplicação é deliberada: o banco responde
 * para a view `v_negocio` (que a tela lê de uma vez) e esta função responde a frase. O que
 * NÃO pode divergir é o conjunto de condições, e é isso que o teste ao lado prende.
 *
 * Vazio = dá para emitir.
 */
export function fiscalFaltando(c: ConfigFiscal, hoje: string): string[] {
  const falta: string[] = [];
  const caminho = caminhoDaNota(c, hoje);

  /* ★ O CAMINHO DO RECIBO NÃO PEDE NADA DO QUE OS OUTROS DOIS PEDEM, e essa é a notícia:
   * sem CNPJ, sem município, sem empresa cadastrada no emissor e — o que importa — **sem
   * certificado digital**, que era o único passo do onboarding fiscal dependendo de o
   * cliente trazer um arquivo de fora. Duas linhas de dado e ele está pronto.
   *
   * Sai cedo de propósito: as checagens abaixo pediriam o CNPJ de quem, por definição, não
   * tem um. */
  if (caminho === "recibo_saude") {
    if (soDigitos(c.prestadorCpf ?? "").length !== 11) falta.push("o CPF de quem atende");
    if (!c.ocupacaoSaude) falta.push("a profissão registrada no conselho");
    return falta;
  }

  if (!c.cnpj) falta.push("o CNPJ de quem emite");
  if (!c.codigoMunicipio) falta.push("o município do CNPJ");
  if (!c.empresaId) falta.push("cadastrar o CNPJ no emissor");

  /* O certificado é o que assina, e é o único passo que depende do cliente trazer algo.
   * Vencido conta como ausente: a assinatura falha e a mensagem da Receita não diz
   * "venceu ontem" — ela fala de assinatura inválida, que manda procurar no lugar errado. */
  if (!c.certificadoValidoAte) falta.push("o certificado digital da empresa");
  else if (c.certificadoValidoAte < hoje) falta.push("renovar o certificado digital (venceu)");

  if (caminho === "nacional") {
    if (!c.codigoTributacaoNacional) falta.push("o código do serviço");
  } else {
    if (!c.inscricaoMunicipal) falta.push("a inscrição municipal");
    if (!c.itemListaServico) falta.push("o código do serviço na prefeitura");
  }

  return falta;
}
