/* ─────────────────────────────────────────────────────────────────────────────
 * DOMÍNIO — o recibo emitido UM POR UM, e o seu ciclo de vida.
 *
 * ★ É O IRMÃO DO LOTE, E A DIFERENÇA QUE IMPORTA É QUEM APERTA O BOTÃO.
 *
 * No lote (`recibo-saude.ts`) a MAISA monta um CSV e **uma pessoa** o importa no e-CAC. Aqui a
 * emissão sai por um canal programático — nossa automação sob procuração, ou um terceiro — e
 * volta com a **chave do recibo e o PDF oficial**, que o lote nunca devolve.
 *
 * Os dois caminhos dividem o domínio (`PagamentoRecebido`, `CODIGO_OCUPACAO`, o CPF do
 * emissor) e dividem **o mesmo lastro**: um pagamento que saiu por um canal não pode sair pelo
 * outro. Quem garante isso é o livro-razão no banco, não este arquivo — mas é este arquivo que
 * nomeia os estados que o livro-razão guarda.
 *
 * ── ⚠️ O ESTADO PERIGOSO É `pendente`, E ELE NÃO É UM ESTADO DE ESPERA ──
 *
 * É um estado de **ignorância**. A emissão é assíncrona em todo canal conhecido: a chamada
 * volta "registrado" e o resultado chega depois, por callback. Entre os dois instantes, a
 * verdade sobre o documento está fora do nosso alcance.
 *
 * Cair para o próximo canal da cascata a partir de `pendente` é a receita para emitir o mesmo
 * recibo duas vezes — e recibo duplicado se cancela **um por um, em dez dias** (art. 7º da IN
 * RFB 2.240/2024), depois de o paciente já ter visto os dois. Por isso `podeTentarOutroCanal`
 * é função pura, com teste, em vez de um `if` no meio do adaptador da cascata.
 *
 * ── POR QUE NÃO EXISTE `cancelado` COMO DESFECHO DE FALHA ──
 *
 * `cancelado` é um ato deliberado sobre um recibo que EXISTIU. Falha de emissão é `recusado`.
 * Confundir os dois faria a tela dizer "cancelado" para um documento que nunca foi emitido — e
 * "cancelei o recibo do paciente" é uma frase com consequência fiscal.
 *
 * ⚠️ Mas `cancelado` É um desfecho de CALLBACK, e isso é diferente de ser desfecho de falha. O
 * cancelamento é assíncrono como a emissão: pedimos, e o canal confirma depois. Até 25/08/2026
 * o `DesfechoDeRecibo` não admitia `cancelado`, e a consequência era pior que um estado
 * faltando — o callback de cancelamento chegava com `success: true` e era lido como **emissão
 * bem-sucedida**. A tela dizia "emitido" para um documento que acabara de deixar de existir.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { OcupacaoSaude } from "./recibo-saude";

/**
 * Por onde o recibo saiu.
 *
 * ⚠️ FICA GRAVADO NA LINHA, e não é telemetria: quando um canal quebra, é por ele que se acha
 * o que precisa ser reconciliado. Sem isso, descobrir "quais recibos saíram pela automação
 * naquela terça" é ler log.
 */
export type CanalDeEmissao = "automacao" | "rebots" | "lote_csv";

/**
 * Onde o recibo está.
 *
 * `pendente`  — mandamos e não sabemos. **Ignorância, não espera.** Ver o cabeçalho
 * `emitido`   — existe, tem chave, e o paciente já pode vê-lo
 * `recusado`  — o canal respondeu que não emitiu. Só daqui é seguro tentar de novo
 * `cancelado` — existiu e foi cancelado de propósito. Nunca é desfecho de falha
 */
export type SituacaoDoRecibo = "pendente" | "emitido" | "recusado" | "cancelado";

/** Uma linha do livro-razão. É ela que impede o mesmo pagamento de sair duas vezes. */
/**
 * ★ O QUE ACONTECEU COM A MENSAGEM AO PACIENTE.
 *
 * ⚠️ `desligado` É UM ESTADO, e não a ausência dele. Sem essa distinção, "não avisamos" e
 * "tentamos e não deu" seriam a mesma coisa na tela — e são opostos: um é escolha do dono, o outro
 * é um paciente que ficou sem saber. Foi essa confusão que fez 19 falhas passarem despercebidas em
 * 26/08/2026 (ver a migração 025).
 */
/* `enviado_ao_dono` (01/10/2026, migração 032): a mensagem saiu, mas para a dona, pronta para ela
 * encaminhar ("primeiro para mim"). Contá-la como `enviado` diria que o paciente soube. */
export type DesfechoDoAviso = "enviado" | "enviado_ao_dono" | "sem_telefone" | "falhou" | "desligado";

export type ReciboEmitido = {
  id: string;
  canal: CanalDeEmissao;
  situacao: SituacaoDoRecibo;
  /** O que o canal devolveu na hora de aceitar o pedido. Serve para reconciliar. */
  protocolo: string | null;
  /** A chave do recibo na Receita. Só existe em `emitido`. */
  chave: string | null;
  /**
   * ⚠️ O LINK DO CANAL, E ELE VALE CINCO MINUTOS. Medido no sandbox da Rebots em 25/08/2026:
   * presigned S3 com `X-Amz-Expires=300`. A frase anterior aqui dizia 48h — estava errada, e o
   * erro fazia a tela oferecer por dois dias um botão que morreu em cinco minutos.
   *
   * Serve para auditoria ("o canal mandou mesmo o arquivo?"), não para a dona baixar. Quem
   * entrega o PDF é o `comprovanteCaminho`.
   */
  pdfUrl: string | null;
  pdfExpiraEm: string | null;
  /**
   * A NOSSA cópia do PDF. `null` quando o canal não mandou arquivo, ou quando a cópia falhou.
   *
   * ★ EXISTE PORQUE A JANELA É DE CINCO MINUTOS E NÃO HÁ CONSULTA. A API do canal não tem um
   * único GET: passada a janela do callback, o PDF não é recuperável por nenhuma chamada. Ou a
   * cópia acontece ali, ou o documento só existe no e-CAC.
   *
   * ⚠️ É caminho no nosso bucket privado, **nunca uma URL pronta**. O link se assina na hora do
   * download e expira — ver `023_recibo_numero_e_comprovante.sql`, que escreve os limites em que
   * essa guarda é aceitável.
   */
  comprovanteCaminho: string | null;
  /** `null` = ainda não se aplica. Aviso só existe para recibo `emitido` — ver `DesfechoDoAviso`. */
  aviso: DesfechoDoAviso | null;
  /** A frase do canal quando recusou. Vai para a tela — tem que ser legível. */
  erro: string | null;
  criadoEm: string;
  emitidoEm: string | null;
};

/**
 * Dá para tentar outro canal?
 *
 * ★ A FUNÇÃO MAIS IMPORTANTE DESTE ARQUIVO, e ela responde `false` no caso que parece mais
 * inofensivo. `pendente` é justamente onde a tentação de "tenta pelo outro" aparece — a tela
 * está travada, o cliente esperando — e é exatamente onde tentar duplica o documento.
 *
 * A saída de `pendente` não é a cascata: é a reconciliação. Perguntar ao canal o que
 * aconteceu, gravar, e só então decidir.
 */
export function podeTentarOutroCanal(r: Pick<ReciboEmitido, "situacao">): boolean {
  return r.situacao === "recusado";
}

/**
 * Este pagamento já está resolvido, do ponto de vista de emitir?
 *
 * `pendente` conta como resolvido de propósito: enquanto não se sabe, ninguém emite nada em
 * cima. É a mesma leitura da claim do lote — a linha sai da lista ANTES de o mundo externo
 * responder, e volta só se a resposta for negativa.
 */
export function estaResolvido(r: Pick<ReciboEmitido, "situacao">): boolean {
  return r.situacao === "pendente" || r.situacao === "emitido" || r.situacao === "cancelado";
}

/**
 * Faz tempo demais que está `pendente`?
 *
 * ⚠️ NÃO SERVE PARA DESISTIR — serve para chamar a reconciliação. Um `pendente` de duas horas
 * não é um recibo perdido, é um recibo cujo callback pode ter se perdido. Tratar como recusa
 * emitiria o segundo.
 *
 * Quinze minutos porque é a folga de qualquer callback razoável: a Rebots documenta retenção de
 * 48h para o resultado, e nossa automação responde em segundos.
 */
export const MINUTOS_ATE_RECONCILIAR = 15;

export function precisaReconciliar(
  r: Pick<ReciboEmitido, "situacao" | "criadoEm">,
  agora: Date,
): boolean {
  if (r.situacao !== "pendente") return false;
  const nascido = Date.parse(r.criadoEm);
  if (Number.isNaN(nascido)) return false;
  return agora.getTime() - nascido >= MINUTOS_ATE_RECONCILIAR * 60_000;
}

/**
 * O PDF ainda dá para baixar?
 *
 * Duas fontes, e a ordem entre elas importa: **a nossa cópia primeiro.** O link do canal vale
 * cinco minutos, então na prática ele só está vivo para quem estiver olhando a tela no instante
 * exato do callback. Perguntar por ele antes faria a resposta certa depender de sorte.
 *
 * ⚠️ Consequência para a tela: o botão de baixar tem que **desaparecer**, não dar 404. Link morto
 * numa tela fiscal faz o dono achar que perdeu o documento — e ele não perdeu, o documento está
 * no e-CAC dele.
 */
export function pdfDisponivel(
  r: Pick<ReciboEmitido, "pdfUrl" | "pdfExpiraEm" | "comprovanteCaminho">,
  agora: Date,
): boolean {
  /* A cópia não expira sozinha: quem a apaga é rotina de expurgo, e não existe nenhuma. */
  if (r.comprovanteCaminho) return true;
  if (!r.pdfUrl) return false;
  if (!r.pdfExpiraEm) return true;
  const expira = Date.parse(r.pdfExpiraEm);
  if (Number.isNaN(expira)) return true;
  return expira > agora.getTime();
}

/**
 * Quem emite, do ponto de vista do canal unitário.
 *
 * ⚠️ NÃO CARREGA CERTIFICADO NEM SENHA, pela mesma regra de `EmissorFiscal`: a credencial vive
 * no adaptador e não atravessa o núcleo. O que o núcleo sabe é **quem** é o profissional; como
 * provar que somos procurador dele é problema de quem implementa.
 */
export type EmissorCredenciado = {
  cpf: string;
  ocupacao: OcupacaoSaude;
  /** O registro no conselho. A Receita recusa se o conselho não o reportou a ela. */
  registroProfissional: string | null;
};

/**
 * O pedido de um recibo.
 *
 * Espelha o payload do `POST /receipts` da Rebots de propósito — é o contrato que a gente adota
 * como nosso, para trocar de canal ser trocar de adaptador. Ver o mapa de tarefas.
 */
export type PedidoDeRecibo = {
  /**
   * O id da nossa linha do razão, para o canal usar como chave de idempotência.
   *
   * ★ ELE ENCURTA A JANELA PERIGOSA A ZERO, e isso foi descoberto lendo a doc da Rebots: o
   * `receipt_id` do `POST /receipts` é campo que **nós** mandamos, e o callback o devolve. Ou
   * seja, o protocolo é conhecido ANTES da chamada — não existe o intervalo entre "o canal
   * aceitou" e "gravei o protocolo", que é justamente o intervalo que produz o `pendente` sem
   * protocolo (ver `precisaDeOlhoHumano`).
   *
   * Canal que não tenha chave de idempotência simplesmente ignora este campo e devolve o
   * protocolo dele. Aí a janela volta a existir, e a linha nasce reconciliável só depois.
   *
   * ⚠️ É UM INTEIRO EM FORMA DE TEXTO — o `numero` da linha do razão, não o `id`. A primeira
   * versão mandava o `id`, que é `uuid`, e a Rebots recusa com `RECEIPT_ERROR_024 invalid
   * literal for int()`: **nenhuma emissão passava**. Medido no sandbox em 25/08/2026.
   *
   * O tipo continua `string` porque o núcleo não deve herdar a aritmética de um fornecedor, e
   * porque inteiro-como-texto é o menor denominador comum entre os canais: quem quer `int`
   * converte, quem quer texto opaco aceita o texto. O contrário não vale — um canal que exige
   * `int` não tem como aceitar uuid.
   */
  referencia: string;
  /** Data do pagamento, ISO. O manual manda emitir na data em que o dinheiro entrou. */
  dataPagamento: string;
  valor: number;
  /** Texto fixo por data. ⚠️ **Nunca o nome do serviço** — ver `descricaoPadrao`. */
  descricao: string;
  cpfPagador: string;
  cpfBeneficiario: string;
};

/** O que o canal devolve ao aceitar o pedido. A emissão em si chega depois, por callback. */
export type ReciboAceito = {
  protocolo: string;
  /**
   * ⚠️ QUASE SEMPRE `pendente`, e a tela não pode fingir o contrário. Um canal que emita de
   * forma sincrônica pode devolver `emitido` com chave — mas nenhum dos conhecidos faz isso.
   */
  situacao: Extract<SituacaoDoRecibo, "pendente" | "emitido">;
  chave: string | null;
};

/**
 * O que chega no callback. É isto que fecha a linha do livro-razão.
 *
 * ⚠️ `cancelado` ENTRA AQUI, e não entrava antes de 25/08/2026. O cancelamento é assíncrono como
 * a emissão: o canal confirma por callback, com `success: true` — e sem este estado no tipo, a
 * confirmação de que o documento deixou de existir era gravada como "emitido".
 */
export type DesfechoDeRecibo = {
  protocolo: string;
  situacao: Extract<SituacaoDoRecibo, "emitido" | "recusado" | "cancelado">;
  chave: string | null;
  pdfUrl: string | null;
  pdfExpiraEm: string | null;
  /** A nossa cópia, quando deu para fazer. Ver `ReciboEmitido.comprovanteCaminho`. */
  comprovanteCaminho: string | null;
  erro: string | null;
};

/**
 * Este pendente precisa de gente olhando?
 *
 * ★ É O ESTADO QUE NINGUÉM PLANEJA, e é o único deste domínio sem resposta automática.
 *
 * A linha do razão nasce ANTES da chamada ao canal (é isso que impede o pagamento de ficar
 * livre com a emissão já em voo). Se o processo morrer entre criar a linha e gravar o protocolo,
 * sobra um `pendente` que diz "trancei este pagamento" e não diz o que houve com ele — **não há
 * protocolo para perguntar ao canal**.
 *
 * Irreconciliável por definição. E as duas saídas automáticas são as duas erradas:
 *
 *   soltar  → devolve à fila um pagamento cujo recibo TALVEZ exista. O mês seguinte emite o
 *             segundo, e o paciente recebe dois documentos do mesmo atendimento.
 *   ignorar → o pagamento desaparece do faturamento para sempre, sem erro em log nenhum.
 *
 * Então a resposta é uma terceira: **mostrar**. Uma linha na tela dizendo "este eu não sei",
 * com data e valor, para alguém conferir no e-CAC — que é o único lugar onde a verdade está.
 * Vale mais que qualquer palpite nosso.
 */
export function precisaDeOlhoHumano(
  r: Pick<ReciboEmitido, "situacao" | "protocolo">,
): boolean {
  return r.situacao === "pendente" && !r.protocolo;
}
