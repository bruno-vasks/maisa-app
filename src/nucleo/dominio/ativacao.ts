/* ─────────────────────────────────────────────────────────────────────────────
 * ATIVAÇÃO — o quanto deste negócio já está de pé.
 *
 * ⚠️ NÃO EXISTE COLUNA `onboarding_step`, E ISSO É A DECISÃO CENTRAL DESTE ARQUIVO.
 *
 * O progresso é DERIVADO do mundo: pergunta-se ao banco se há WhatsApp conectado, se há
 * agenda ligada, se alguém já mandou mensagem. Uma flag de passo seria mais barata de ler
 * e erraria de dois jeitos que a derivação não tem como errar:
 *
 *   • DESSINCRONIZA. O dono conecta o WhatsApp por outro caminho (a tela de ajustes, um
 *     suporte, o próprio wizard interrompido no meio) e a flag continua dizendo que não.
 *   • REPETE. Quem já cadastrou serviço antes de ver o wizard é obrigado a fazer de novo,
 *     porque a flag não sabe que ele fez.
 *
 * O preço é uma consulta por passo, e ele é pequeno perto de um checklist que mente.
 * Veio do `getOnboardingStatus` do Smiller (`onboardingService.ts:59`), que já tinha
 * chegado à mesma conclusão.
 *
 * ── O ÚLTIMO PASSO É USO, NÃO CONFIGURAÇÃO ──
 *
 * `primeira_conversa` não é "está tudo configurado", é "você viu funcionar". É a diferença
 * entre setup completo e ativação de verdade — e é o passo que decide se a pessoa fica.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * Os passos, na ordem em que fazem sentido para quem está começando.
 *
 * ⚠️ A ORDEM É CONTRATO: a tela desenha os cartões nesta sequência, e `porcentagem` conta
 * quantos dos cinco estão feitos. Acrescentar um passo muda a porcentagem de todo mundo —
 * é mudança de produto, não de tipo.
 */
export const PASSOS_DE_ATIVACAO = [
  /** Existe inquilino. Verdadeiro sempre que se consegue perguntar — quem não tem negócio
   *  não chega a esta rota, porque o porteiro barra antes com 409 `sem_negocio`. */
  "negocio_criado",
  /**
   * O dono MEXEU no catálogo semeado — preço, duração, nome, categoria ou o liga/desliga
   * de algum serviço. Sem isso ele está vendendo os cinco chutes de `criar_negocio()`, e
   * é a MAISA que vai anunciar esses valores ao cliente.
   *
   * ⚠️ "Mexeu" e não "passou pela etapa". A distinção custou um conserto: na primeira
   * versão o wizard gravava as cinco linhas ao clicar em continuar, o `atualizado_em` de
   * todas se movia, e este passo acendia para quem não tinha tocado em nada. Medido numa
   * caminhada real em produção em 15/08/2026. Um checklist que se marca sozinho não é
   * checklist — é enfeite que mente. O wizard passou a mandar só o que mudou.
   */
  "catalogo_ajustado",
  /** Há instância pareada. É o passo que separa "configurei" de "a MAISA atende". */
  "whatsapp_conectado",
  /** Alguma agenda do Google ligada. Sem ela a MAISA marca no vazio. */
  "agenda_conectada",
  /** Alguém conversou com a MAISA — a prova de que o conjunto funciona. */
  "primeira_conversa",
  /**
   * A nota fiscal está ligada: CNPJ cadastrado no emissor e certificado dentro da validade.
   *
   * ★ ENTROU EM 17/08/2026 PORQUE É O MAIOR DIFERENCIAL DO PRODUTO — e um diferencial que
   * não aparece no checklist do primeiro dia é um diferencial que o cliente descobre no mês
   * seguinte, se descobrir. Os outros quatro passos entregam "a MAISA marca horário"; este é
   * o que ela faz que ninguém mais faz.
   *
   * ⚠️ ELE MUDA A PORCENTAGEM DE TODO MUNDO, e isso é mudança de produto, não de tipo — a
   * própria regra escrita acima. Quem estava em 100% com quatro passos cai para 83%, e é
   * honesto: aquela pessoa não tem nota fiscal ligada.
   *
   * É o último de propósito. Depende do CNPJ e de um certificado digital, e é o único passo
   * onde o cliente precisa trazer algo de fora — pedir isso antes de a MAISA ter marcado o
   * primeiro horário é cobrar trabalho antes de mostrar valor.
   */
  "nota_fiscal_ligada",
] as const;

export type PassoDeAtivacao = (typeof PASSOS_DE_ATIVACAO)[number];

/**
 * Para que este negócio usa o WhatsApp — e portanto quais passos fazem sentido para ele.
 *
 * ★ ENTROU EM 24/09/2026, e o motivo é gargalo de onboarding. Quem assinou a MAISA só para
 * emitir recibo era obrigado a atravessar "Conectar o WhatsApp" no wizard e depois via o
 * painel cobrando WhatsApp, agenda e "ver funcionando" para sempre, com a barra parada em
 * 50%. Cada passo que não serve para a pessoa é um motivo a mais para ela desistir.
 *
 * Derivado dos ajustes da assistente, nunca guardado à parte (mesmo princípio do
 * cabeçalho): quem liga a MAISA depois ganha os passos de volta sem que ninguém lembre.
 */
export type UsoDoWhatsApp = {
  /** A MAISA responde no WhatsApp (`assistente.ativa`). */
  agente: boolean;
  /** Algo sai pelo WhatsApp: o agente, o lembrete ou o aviso de recibo. */
  whatsapp: boolean;
};

/** Os ajustes que decidem o uso. Uma função para o wizard e o adaptador não divergirem. */
export function usoDoWhatsApp(a: { ativa: boolean; lembrete: boolean; avisarRecibo: boolean }): UsoDoWhatsApp {
  return { agente: a.ativa, whatsapp: a.ativa || a.lembrete || a.avisarRecibo };
}

/**
 * Os passos que valem para este negócio, na ordem canônica.
 *
 * Sem agente, somem "Sua agenda" (é onde ELA olha antes de oferecer horário; o atendimento
 * mora na tabela, não no Google — ADR-0009) e "Ver funcionando" (não há conversa a ver).
 * Sem nada saindo pelo WhatsApp, some também o WhatsApp. Sem `uso`, valem todos — o lado
 * que mostra um passo a mais em vez de esconder um que importa.
 */
export function passosQueValem(uso?: UsoDoWhatsApp): PassoDeAtivacao[] {
  if (!uso) return [...PASSOS_DE_ATIVACAO];
  return PASSOS_DE_ATIVACAO.filter((p) => {
    if (p === "agenda_conectada" || p === "primeira_conversa") return uso.agente;
    if (p === "whatsapp_conectado") return uso.whatsapp;
    return true;
  });
}

export type ProgressoDaAtivacao = {
  feitos: PassoDeAtivacao[];
  /** Os passos que valem para este negócio. Ver `passosQueValem`. */
  passos: PassoDeAtivacao[];
  /** 0–100, inteiro. Quem arredonda é aqui, para tela e teste concordarem. */
  porcentagem: number;
  /** `true` quando não falta nada. A tela usa para esconder o cartão de vez. */
  completo: boolean;
};

/**
 * Monta o progresso a partir do que foi apurado.
 *
 * Existe como função de domínio, e não como três linhas dentro do adaptador, porque a
 * conta da porcentagem tem que ser a MESMA no Supabase e no demo. Duas cópias divergem no
 * dia em que um passo entrar na lista — e o sintoma seria a barra chegando a 100% com um
 * cartão ainda aberto.
 */
export function progressoDe(feitos: readonly PassoDeAtivacao[], uso?: UsoDoWhatsApp): ProgressoDaAtivacao {
  /* Filtra pela lista que vale e deduplica: quem monta o array é um adaptador, e um passo
   * repetido passaria de 100%. Também garante a ORDEM, que é contrato com a tela. Um passo
   * cumprido que não vale (WhatsApp conectado de quem só emite recibo) não conta: a barra
   * mede o que falta para ESTE negócio. */
  const passos = passosQueValem(uso);
  const unicos = passos.filter((p) => feitos.includes(p));
  const porcentagem = Math.round((unicos.length / passos.length) * 100);
  return { feitos: unicos, passos, porcentagem, completo: unicos.length === passos.length };
}
