/* ─────────────────────────────────────────────────────────────────────────────
 * ASSINATURA — o que a MAISA cobra, em linguagem de domínio.
 *
 * ⚠️ PREÇO NÃO MORA AQUI, E ISSO É A DECISÃO CENTRAL DESTE ARQUIVO.
 *
 * O produto já tem uma fonte única de preço — `app/(marketing)/_lib/planos.ts` — e ela
 * nasceu exatamente para matar seis preços digitados em quatro arquivos. Copiar `R$ 197`
 * para cá seria reabrir o buraco pelo lado do núcleo, com o agravante de que o valor
 * REALMENTE cobrado passa a ser um terceiro número: o do objeto Price no provedor.
 *
 * Então a divisão é:
 *   · a CHAVE do plano ....... aqui (é conceito de domínio: existe sem provedor nenhum)
 *   · o preço EXIBIDO ........ `_lib/planos.ts` (é copy de landing page)
 *   · o preço COBRADO ........ o provedor, e o webhook grava o que ele disser
 *
 * O núcleo nunca afirma quanto custa. Ele registra quanto foi cobrado.
 *
 * O núcleo também não importa `_lib/planos.ts`: aquilo vive em `app/`, e a seta
 * apontaria para fora do hexágono. A ponte é `assinatura.test.ts`, que lê os dois e
 * reprova se as chaves divergirem — garantia por teste, não por boa vontade.
 * ────────────────────────────────────────────────────────────────────────────── */

import { diaDoMes, diasEntre, diasNoMes, ehDataCivil, mesDe, rotuloDia, somarDias, somarMeses } from "./tempo";

/** Os três planos. Mesma chave usada em `_lib/planos.ts` e no `metadata.plano` do provedor. */
export type ChaveDePlano = "essencial" | "profissional" | "escala";

export const PLANOS: readonly ChaveDePlano[] = ["essencial", "profissional", "escala"] as const;

export function ehChaveDePlano(x: unknown): x is ChaveDePlano {
  return typeof x === "string" && (PLANOS as readonly string[]).includes(x);
}

/**
 * Os quatro estados que a tela sabe desenhar. São os mesmos do `check` da coluna
 * `assinaturas.status` (`002_multitenant.sql`) — um quinto valor aqui viraria erro de
 * constraint no INSERT, horas depois, dentro do webhook, onde ninguém está olhando.
 */
export type StatusAssinatura = "trial" | "ativa" | "inadimplente" | "cancelada";

/**
 * Quem está cobrando. Espelha o `check` da coluna `assinaturas.provedor` (028).
 *
 * `null` é o estado de quem nunca pagou: o inquilino nasce em `trial`
 * (`005_provisionar.sql`) sem conta em gateway nenhum.
 */
export type Provedor = "stripe" | "abacatepay";

/**
 * Como esta pessoa paga. Espelha o `check` de `assinaturas.metodo` (028).
 *
 * ⚠️ EXISTE PORQUE A TELA ESTAVA MENTINDO. `cartaoMarca`/`cartaoFinal4` eram as duas
 * únicas pistas de forma de pagamento, e quem paga por Pix não tem nenhuma das duas —
 * ficava indistinguível de um cartão que o provedor não informou, e a tela escrevia
 * "Cartão final ····" para quem nunca usou cartão.
 *
 * Sem cedilha de propósito: é valor que atravessa driver, JSON e comparação de string.
 * O rótulo com acento é da UI.
 */
export type MetodoDePagamento = "pix" | "cartao";

/** O que a MAISA sabe sobre a cobrança de um inquilino. Espelha a tabela `assinaturas`. */
export type Assinatura = {
  plano: string;
  /** Em reais, como o provedor cobrou. `null` enquanto ninguém pagou nada. */
  preco: number | null;
  moeda: string;
  status: StatusAssinatura;
  /** Qual gateway carrega esta linha. `null` = ninguém pagou ainda. */
  provedor: Provedor | null;
  /** Ids do provedor. Guardados para reconciliar, nunca para exibir. */
  clienteId: string | null;
  assinaturaId: string | null;
  /**
   * Vira o "próxima cobrança" da tela. ISO `YYYY-MM-DD`.
   *
   * ⚠️ NA ABACATEPAY ESTE CAMPO É CALCULADO POR NÓS, não informado. O objeto de
   * assinatura deles não tem campo de fim de período nenhum — medido em 21/09/2026, a
   * busca por `nextBilling`/`periodEnd`/`currentPeriod` na documentação inteira não
   * retorna nada. `entrada/abacatepay/eventos.ts` deriva de `frequency` + a data do
   * último pagamento. Na Stripe o valor é dela, e vem do ITEM da assinatura.
   */
  periodoFim: string | null;
  trialFim: string | null;
  /** Pix ou cartão. `null` enquanto ninguém pagou. */
  metodo: MetodoDePagamento | null;
  /** O "Cartão final 4417". Nunca o número. Sempre `null` quando `metodo` é `pix`. */
  cartaoMarca: string | null;
  cartaoFinal4: string | null;
};

/**
 * Status da Stripe → o nosso.
 *
 * ⚠️ O DESCONHECIDO CAI EM `inadimplente`, NÃO EM `ativa`. É a única escolha segura:
 * a Stripe acrescenta status novo sem avisar (`paused` apareceu assim), e um `default`
 * permissivo entregaria o produto de graça a um estado que ninguém leu ainda. Errar para
 * o lado restritivo gera um chamado de suporte; errar para o outro gera um vazamento de
 * receita que só aparece no fechamento do mês.
 *
 * `incomplete` é o caso brasileiro que mais vai acontecer: boleto emitido e ainda não
 * pago. Não é inadimplência moral, mas é ausência de pagamento — e para efeito de acesso
 * as duas coisas são a mesma.
 *
 * Chamava-se `statusDoProvedor` até a AbacatePay entrar. O nome genérico prometia servir
 * para qualquer gateway, e `statusDaAbacatePay` logo abaixo é a prova de que não serve:
 * os dois vocabulários não têm nem o mesmo formato de entrada.
 */
export function statusDaStripe(bruto: string): StatusAssinatura {
  switch (bruto) {
    case "trialing":
      return "trial";
    case "active":
      return "ativa";
    case "canceled":
    case "incomplete_expired":
      return "cancelada";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "inadimplente";
    default:
      return "inadimplente";
  }
}

/**
 * Status da AbacatePay → o nosso.
 *
 * ── ⚠️ POR QUE ESTA FUNÇÃO RECEBE O EVENTO, E A DA STRIPE NÃO ──
 *
 * Porque na AbacatePay **o status da assinatura não conta a inadimplência.** Medido nos
 * payloads documentados em 21/09/2026: o objeto `subscription` tem exatamente dois
 * estados de vida — `ACTIVE` e `CANCELLED` — e no evento `subscription.payment_failed`
 * ele continua vindo `ACTIVE`. A cobrança do ciclo falhou, o dinheiro não entrou, e o
 * campo que deveria dizer isso diz "ativa".
 *
 * Quem traduzir só o campo `status` vai liberar o produto para quem parou de pagar, e vai
 * fazer isso sem erro em lugar nenhum — o mesmo modo de falha que o `default` permissivo
 * da Stripe teria, por um caminho diferente. Então a notícia está no TIPO DO EVENTO, e é
 * por isso que ele entra como parâmetro.
 *
 * A retentativa deles é automática (`retryPolicy`, 3 tentativas por padrão). Enquanto ela
 * corre, a assinatura fica `inadimplente` aqui: é ausência de pagamento, e para efeito de
 * acesso ausência de pagamento é uma só. Se uma tentativa passar, chega
 * `subscription.renewed` e a linha volta para `ativa` sozinha.
 *
 * ⚠️ `CANCELLED` NA ABACATEPAY É IMEDIATO. Não existe "cancela ao fim do período pago"
 * como na Stripe — a documentação é explícita ("o cliente perde o acesso imediatamente",
 * `cancelPolicy: NOW`). Por isso `cancelada` aqui significa acesso encerrado agora, e não
 * acesso até `periodoFim`.
 */
export function statusDaAbacatePay(e: {
  /** `subscription.status` do payload: `ACTIVE` ou `CANCELLED`. */
  status: string;
  /** O evento que trouxe a notícia — `subscription.renewed`, `…payment_failed`, etc. */
  evento: string;
  /** `trialEndsAt` ainda no futuro. A AbacatePay não tem status de trial. */
  emTrial?: boolean;
}): StatusAssinatura {
  /* ★ PRIMEIRO O EVENTO, DEPOIS O CAMPO. A ordem é a decisão: `payment_failed` chega com
   * `status: "ACTIVE"`, então conferir o campo antes devolveria `ativa` e a função
   * inteira perderia o propósito. */
  if (e.evento === "subscription.payment_failed") return "inadimplente";

  switch (e.status) {
    case "CANCELLED":
      return "cancelada";
    case "ACTIVE":
      /* Trial é derivado, não informado: a assinatura com trial nasce `ACTIVE` e o que a
       * distingue é `trialEndsAt` no futuro. Ver `subscription.trial_started`. */
      return e.emTrial ? "trial" : "ativa";
    default:
      /* Mesma regra da Stripe, e pela mesma razão: status que ninguém leu ainda não
       * libera o produto. `PENDING`, `EXPIRED` e `REFUNDED` existem no vocabulário de
       * CHECKOUT deles e podem vazar para cá numa mudança de payload — e os três
       * significam "não há pagamento vigente". */
      return "inadimplente";
  }
}

/**
 * O STATUS dá direito a usar o produto? Só o status — a data fica com `acessoLiberado`.
 *
 * ⚠️ NÃO É A PERGUNTA DO CORTE. Um trial que acabou há um mês continua `trial` na tabela
 * (ninguém reescreve a linha quando o prazo passa), e esta função diria "liberada". Quem
 * decide se a MAISA responde hoje é `acessoLiberado`, que olha o status E o fim do período.
 */
export function liberada(a: Pick<Assinatura, "status">): boolean {
  return a.status === "trial" || a.status === "ativa";
}

/**
 * `frequency` da AbacatePay → dias, para calcular o `periodoFim` que eles não informam.
 *
 * ⚠️ MÊS APROXIMADO POR 30 DIAS, E ISSO É ERRO ACEITO. A alternativa honesta seria somar
 * um mês de calendário, mas o campo alimenta o "próxima cobrança" da tela — informação de
 * orientação, não de cobrança. Quem cobra é a AbacatePay, no dia que ela decidir. Errar
 * em um ou dois dias num texto de tela é barato; parecer preciso e estar errado é que
 * custa, e é por isso que este comentário existe em vez de um `date-fns`.
 */
export function diasDoCiclo(frequency: string): number | null {
  switch (frequency) {
    case "WEEKLY":
      return 7;
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 90;
    case "SEMIANNUALLY":
      return 182;
    case "ANNUALLY":
      return 365;
    default:
      /* `null` e não um palpite: sem ciclo conhecido, a tela mostra "—", que é verdade.
       * Um default de 30 dias inventaria uma data de cobrança para um ciclo que ninguém
       * leu ainda. */
      return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O PRÉ-PAGO — cada Pix compra um mês (29/09/2026).
 *
 * A recorrência da AbacatePay está bloqueada na conta: Pix Automático e cartão, medidos em
 * produção em 29/09/2026 (ver `saida/abacatepay/LEIA-ME.md`). O Pix AVULSO cobra. Então o mês
 * passou a ser vendido como um pacote: a pessoa paga, ganha um mês de calendário, e antes de
 * acabar recebe o aviso para pagar o próximo. Decisão do Bruno no mesmo dia.
 *
 * Isso muda quem guarda o relógio. Na assinatura recorrente o provedor cobra sozinho e avisa
 * por webhook quando falha. Aqui ninguém cobra sozinho: o fim do período é a única verdade, e
 * ela mora na nossa tabela (`periodo_fim`). Por isso as funções abaixo são domínio, e não
 * detalhe de adaptador — são elas que decidem se a MAISA responde hoje.
 *
 * Todas recebem `hoje` como argumento (`YYYY-MM-DD` de São Paulo, ver `tempo.ts`). Quem sabe
 * que dia é hoje é quem chama; é o que torna o corte testável sem mexer no relógio.
 * ────────────────────────────────────────────────────────────────────────────── */

type Vigencia = Pick<Assinatura, "status" | "trialFim" | "periodoFim">;

/**
 * O último dia em que este negócio pode usar a MAISA. `null` = não há data para cortar.
 *
 * O dia é INCLUSIVO: `periodoFim = 2026-10-30` quer dizer que no dia 30 ela ainda responde, e
 * no 31 não. É o mesmo dia em que o aviso diz "vence hoje".
 */
export function fimDoAcesso(a: Vigencia): string | null {
  if (a.status === "trial") return a.trialFim;
  if (a.status === "ativa") return a.periodoFim;
  return null;
}

/**
 * ★ Esta assinatura dá direito a usar a MAISA HOJE? É a pergunta do corte.
 *
 * `liberada` olha só o status. Esta olha também a data, porque no pré-pago o status não
 * muda sozinho: quem pagou em setembro continua `ativa` na tabela em novembro, e só o
 * `periodoFim` sabe que acabou.
 *
 * ⚠️ SEM DATA, NÃO CORTA. `ativa` com `periodoFim` nulo é o que a Stripe grava quando o item
 * da assinatura não traz o fim do período, e trial sem `trialFim` é linha semeada à mão.
 * Cortar ali seria calar um cliente que paga por falta de um campo que nunca esteve lá. O
 * caso restritivo continua sendo o do STATUS: `inadimplente` e `cancelada` não passam.
 */
export function acessoLiberado(a: Vigencia, hoje: string): boolean {
  if (!liberada(a)) return false;
  const fim = fimDoAcesso(a);
  if (!fim || !ehDataCivil(fim)) return true;
  return hoje <= fim;
}

/** Quantos dias faltam para o acesso acabar. `0` = hoje é o último dia; negativo = acabou. */
export function diasParaVencer(a: Vigencia, hoje: string): number | null {
  const fim = fimDoAcesso(a);
  if (!liberada(a) || !fim || !ehDataCivil(fim)) return null;
  return diasEntre(hoje, fim);
}

/**
 * A mesma data, um mês de calendário depois. `2026-01-31` → `2026-02-28`.
 *
 * Mês de calendário e não 30 dias, ao contrário de `diasDoCiclo`: aqui a data é a que corta o
 * acesso, e não um texto de orientação. Pagar no dia 10 e vencer no dia 9 do mês seguinte
 * seria cobrar 12 meses e entregar menos. O dia que não existe no mês seguinte cai no último.
 */
export function somarUmMes(data: string): string {
  const anoMes = somarMeses(mesDe(data), 1);
  const dia = Math.min(diaDoMes(data), diasNoMes(anoMes));
  return `${anoMes}-${String(dia).padStart(2, "0")}`;
}

/**
 * Esta linha é pré-paga, ou seja, alguém TEM de pagar antes de acabar?
 *
 * Trial é, por definição: ninguém pagou nada, e o fim do teste é o primeiro vencimento. `ativa`
 * sem `assinaturaId` também: é um mês comprado por Pix avulso, sem assinatura no provedor que
 * cobre sozinha. Quem tem assinatura recorrente (Stripe, ou AbacatePay no dia em que liberar)
 * NÃO recebe aviso de vencimento, porque o provedor cobra sem ninguém pedir. Mandar "pague até
 * sexta" para quem tem débito automático é o jeito mais rápido de gerar pagamento em dobro.
 */
export function ehPrePaga(a: Pick<Assinatura, "status" | "assinaturaId">): boolean {
  return a.status === "trial" || (a.status === "ativa" && !a.assinaturaId);
}

/**
 * ★ Um pagamento avulso confirmado → a linha com mais um mês.
 *
 * A base é o fim do que já está pago, e não o dia do pagamento. Quem paga três dias antes de
 * vencer não perde três dias, e quem paga atrasado começa a contar de hoje (os dias em que a
 * MAISA ficou pausada não são cobrados).
 *
 * ⚠️ O TESTE GRÁTIS CONTINUA VALENDO. Quem paga no quinto dia de um teste de 14 ganha o mês a
 * partir do fim do teste, não do dia do pagamento. É decisão: o funil da LP cobra na hora do
 * cadastro, e sem isto pagar cedo seria perder o teste — o incentivo contrário ao que se quer.
 *
 * Não confere se o pagamento é repetido. Isso é da porta (`eventoJaVisto`), e o caso de uso
 * faz antes de chamar aqui: esta função sempre soma, e somar duas vezes é dar dois meses.
 */
export function creditarUmMes(
  atual: Assinatura | null,
  p: {
    hoje: string;
    plano: string;
    /** Em reais, o que o provedor cobrou. */
    preco: number;
    provedor: Provedor;
    metodo: MetodoDePagamento | null;
    clienteId: string | null;
  },
): Assinatura {
  const fim = atual && acessoLiberado(atual, p.hoje) ? fimDoAcesso(atual) : null;
  const base = fim && fim > p.hoje ? fim : p.hoje;

  return {
    plano: p.plano,
    preco: p.preco,
    moeda: "BRL",
    status: "ativa",
    provedor: p.provedor,
    clienteId: p.clienteId ?? atual?.clienteId ?? null,
    /* `null` de propósito: não existe assinatura no provedor, só pagamentos. É o que faz
     * `ehPrePaga` reconhecer a linha, e o que impede a tela de oferecer um portal que não há. */
    assinaturaId: null,
    periodoFim: somarUmMes(base),
    trialFim: atual?.trialFim ?? null,
    metodo: p.metodo,
    cartaoMarca: null,
    cartaoFinal4: null,
  };
}

/**
 * O aviso que sai HOJE para este negócio, se sair algum.
 *
 * Quatro dias no calendário: três dias antes, um dia antes, no último dia e no dia seguinte
 * (quando a MAISA já pausou). Nos outros dias, nada. A rotina roda uma vez por dia, então cada
 * aviso sai uma vez, sem tabela de "já avisei" — se a rotina rodar duas vezes no mesmo dia, sai
 * duas vezes, e o custo aceito é um e-mail repetido.
 */
export type AvisoDeVencimento =
  | { tipo: "faltam"; dias: number; fim: string }
  | { tipo: "vence_hoje"; fim: string }
  | { tipo: "pausou"; fim: string };

export function avisoDoDia(a: Assinatura, hoje: string): AvisoDeVencimento | null {
  if (!ehPrePaga(a)) return null;
  const fim = fimDoAcesso(a);
  if (!fim || !ehDataCivil(fim)) return null;

  const d = diasEntre(hoje, fim);
  if (d === 3 || d === 1) return { tipo: "faltam", dias: d, fim };
  if (d === 0) return { tipo: "vence_hoje", fim };
  if (d === -1) return { tipo: "pausou", fim };
  return null;
}

/**
 * O e-mail do aviso, em texto. Puro, para o texto ser testado sem rede.
 *
 * ⚠️ NÃO DIZ O PREÇO. `assinaturas.preco` de quem está em teste é o `149.90` que o
 * `005_provisionar.sql` semeou, valor de plano nenhum. O preço certo aparece na página de
 * pagamento, que lê a fonte única. Um número errado num e-mail de cobrança é pior que número
 * nenhum.
 */
export function textoDoAviso(
  aviso: AvisoDeVencimento,
  p: { negocio: string; emTeste: boolean; link: string },
): { assunto: string; texto: string } {
  const oQue = p.emTeste ? "Seu teste grátis da MAISA" : "O mês pago da sua MAISA";
  const dia = rotuloDia(aviso.fim);
  const pagar = `Para ela continuar respondendo seus clientes no WhatsApp, pague o próximo mês por Pix:\n${p.link}`;
  const rodape = "\n\nSe você já pagou, pode ignorar este e-mail: a confirmação chega em alguns minutos.";

  switch (aviso.tipo) {
    case "faltam": {
      const quando = aviso.dias === 1 ? "amanhã" : `em ${aviso.dias} dias`;
      return {
        assunto: `Sua MAISA vence ${quando}`,
        texto: `Oi! ${oQue} (${p.negocio}) vai até ${dia}.\n\n${pagar}${rodape}`,
      };
    }
    case "vence_hoje":
      return {
        assunto: "Sua MAISA vence hoje",
        texto: `Oi! Hoje, ${dia}, é o último dia de ${p.emTeste ? "teste" : "acesso pago"} da MAISA do ${p.negocio}. `
          + `A partir de amanhã ela para de responder até o pagamento entrar.\n\n${pagar}${rodape}`,
      };
    case "pausou":
      return {
        assunto: "Sua MAISA pausou",
        texto: `Oi! A MAISA do ${p.negocio} parou de responder seus clientes: o acesso acabou em ${dia}.\n\n`
          + `Pague por Pix e ela volta na hora, sem perder nada do que você configurou:\n${p.link}${rodape}`,
      };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O TESTE NA CONVERSA (09/10/2026) — o teste grátis do funil pago passa por uma pessoa.
 *
 * Todo negócio nasce com 14 dias de teste (`005_provisionar.sql`). Até aqui isso valia também
 * para quem vinha do anúncio, preenchia o `/assinar` e largava o Pix: a conta ficava com duas
 * semanas de MAISA de graça, em silêncio, e ninguém sabia que havia alguém testando. Bruno
 * decidiu que, no funil pago, o teste só existe depois de uma conversa no WhatsApp. É ali que se
 * descobre se a pessoa conseguiu configurar, o que ela esperava e o que faltou.
 *
 * Então quem nasce pelo `/assinar` nasce com o teste FECHADO, e a equipe abre com
 * `liberarTeste` quando a conversa acontece.
 *
 * ⚠️ NÃO É UM STATUS NOVO, DE PROPÓSITO. O `check` da coluna conhece quatro, e migração aqui roda
 * à mão: um deploy que gravasse um quinto valor antes de alguém rodar o SQL recusaria o cadastro
 * inteiro, e o sintoma seria zero venda. Teste fechado é um `trial` que acaba no dia do cadastro,
 * coisa que o corte, os avisos e o pagamento já sabem tratar.
 *
 * O `/cadastro` NÃO passa por aqui: segue com 14 dias abertos, que é o que a tela dele promete.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Quantos dias a equipe libera de uma vez. */
export const DIAS_DO_TESTE_LIBERADO = 7;

/**
 * O teste do funil pago: acaba no dia do cadastro.
 *
 * Hoje, e não ontem. Ontem cortaria na hora, mas a tela do plano diria "seu teste acabou em
 * [ontem]" para quem se cadastrou hoje. Com hoje, toda frase do app continua verdadeira, e quem
 * paga ganha exatamente um mês contado de hoje: `creditarUmMes` só soma o teste que acaba DEPOIS
 * de hoje.
 *
 * Custo aceito: quem larga o Pix e termina a configuração no mesmo dia tem a MAISA até a
 * meia-noite. No dia seguinte sai o aviso de "pausou", com o link do Pix, e esse e-mail funciona
 * como recuperação de quem abandonou.
 *
 * Só mexe em `trial`. Uma linha que já é outra coisa (alguém pagou entre o cadastro e esta
 * chamada) passa intacta.
 */
export function fecharTeste(a: Assinatura, hoje: string): Assinatura {
  if (a.status !== "trial") return a;
  return { ...a, trialFim: hoje, periodoFim: hoje };
}

/**
 * A equipe liberou o teste: `DIAS_DO_TESTE_LIBERADO` contados de hoje.
 *
 * `null` quando não há o que liberar: o negócio tem um mês pago valendo, e transformá-lo em
 * teste trocaria o fim do que foi pago pelo fim do teste.
 *
 * Nunca encurta. Um teste que já vai além de sete dias (os 14 do `/cadastro`) fica como está.
 * Liberar de novo um teste já liberado recomeça a contagem de hoje, que é como a equipe estende.
 */
export function liberarTeste(a: Assinatura, hoje: string): Assinatura | null {
  if (a.status === "ativa" && acessoLiberado(a, hoje)) return null;
  const novo = somarDias(hoje, DIAS_DO_TESTE_LIBERADO);
  const atual = a.status === "trial" && a.trialFim && ehDataCivil(a.trialFim) ? a.trialFim : null;
  const fim = atual && atual > novo ? atual : novo;
  return { ...a, status: "trial", trialFim: fim, periodoFim: fim };
}
