/* ─────────────────────────────────────────────────────────────────────────────
 * DOMÍNIO — o "pronto para emitir?", e a honestidade sobre o que a gente NÃO sabe.
 *
 * ★ ELE EXISTE PORQUE O e-CAC RECUSA EM VOCABULÁRIO DE RECEITA, DEPOIS DA VIAGEM.
 *
 * Os quatro erros que a análise devolveu em 21/08/2026 foram:
 *
 *   Código Ocupação ........ "Ocupação não cadastrada."
 *   Registro Profissional .. "Registro profissional não informado pelo conselho profissional."
 *   CPF Titular Pagamento .. "Titular do pagamento inválido."
 *   CPF Beneficiário ....... "Beneficiário do serviço inválido."
 *
 * Os dois últimos eram nossos — CPF que não fecha no dígito — e `cpfValido` resolveu. Os dois
 * primeiros **não são consertáveis daqui**: a Receita os lê do cadastro DELA no Carnê-Leão Web,
 * não do nosso arquivo. Mandar o CRP no campo 16 não muda: o cruzamento é CPF ↔ base do
 * conselho, não "o número foi digitado".
 *
 * ── ⚠️ TRÊS ESTADOS, E O TERCEIRO É O QUE FAZ ISTO VALER ──
 *
 * `pronto` e `falta` a gente calcula. `nao_da_para_saber` é o que está do outro lado do muro:
 * se ela configurou o Carnê-Leão deste ano, se o conselho mandou a base para a Receita.
 *
 * Um checkbox verde ali seria mentira — e mentira caríssima, porque ela sairia da tela achando
 * que está tudo certo e descobriria no e-CAC, sozinha, em vocabulário de Receita. Então o item
 * aparece como "só você sabe", com o link e as palavras exatas dos botões que ela vai ver.
 *
 * ── ⚠️ O CRP BLOQUEIA, DESDE 25/09/2026 ──
 *
 * Até aqui ele não bloqueava, e o motivo era do caminho do ARQUIVO: o campo 16 do CSV aceita
 * vazio (manual 2.1, pergunta 25). Só que o produto não emite mais por arquivo: emite pela
 * Rebots, e o `/issuers` de lá **exige** `registration` para habilitar a emitente
 * (`EmitirRecibos.tsx`, que já bloqueava). A tela Fiscal bloqueava, o Documento fiscal dizia
 * "não bloqueia" e mandava de volta: laço (06 P0-4 da auditoria do front). A regra agora é uma
 * só, `faltaParaEmitirRecibo`, e as frases dizem "obrigatório para emitir".
 * ────────────────────────────────────────────────────────────────────────────── */

import { procuracaoAVencer, representacao, type ConfigFiscal } from "./fiscal";
import { rotuloBR } from "./tempo";
import { CODIGO_OCUPACAO, type OcupacaoSaude } from "./recibo-saude";
import { soDigitos } from "./clientes";

/**
 * O Carnê-Leão — pelo login COM CÓDIGO DE SERVIÇO, que é o único formato que sobrevive à
 * autenticação.
 *
 * ★ QUATRO URLS FORAM MEDIDAS EM 24/08/2026, E O QUE AS SEPARA É UM PARÂMETRO. Hop a hop:
 *
 *   /carneleao/escrituracao          → 302 → /autenticacao/login                   ✗
 *   /carneleao/demonstrativo         → 302 → /autenticacao/login                   ✗
 *   /ecac/                           → 302 → /autenticacao/login                   ✗
 *   /autenticacao/login/index/10028  → 302 → servicos.receitafederal.gov.br/login
 *                                             ?redirectUrl=…/login.aspx?sistema=10028   ✓
 *
 * ⚠️ **AS TRÊS PRIMEIRAS CAEM NUM LOGIN SEM PARÂMETRO DE RETORNO.** O destino é descartado: ela
 * entra e chega na home do e-CAC, tendo que achar o caminho sozinha. Não adianta apontar para
 * uma tela "mais funda" — `/demonstrativo` e `/escrituracao` morrem no mesmo lugar que `/ecac/`.
 *
 * A quarta carrega `redirectUrl` **e** `sistema=10028` até o SSO de verdade
 * (`servicos.receitafederal.gov.br`, host diferente do portal), e o destino atravessa o login.
 *
 * ★ O `10028` É O SERVIÇO, NÃO ENFEITE — e não foi adivinhado: é o que o botão *Iniciar* da
 * página oficial do Carnê-Leão no gov.br usa. "Limpar" a URL tirando o código é exatamente o
 * que quebrou naquela manhã. O sintoma de tirar é ela cair na home logada e não achar nada; o
 * pior visto naquele dia foi terminar em `/autenticacao/Login/Logout` — a tela de SAIR — depois
 * de tentar entrar pelo login sem código.
 */
export const LINK_CARNE_LEAO = "https://cav.receita.fazenda.gov.br/autenticacao/login/index/10028";

/**
 * A mesma porta, pela página pública do gov.br — é dela que o código de serviço saiu. Não
 * pertence ao portal autenticado: não expira, não desloga e não redireciona. É a saída para
 * quando o login trava.
 */
export const LINK_ECAC_SERVICO = "https://www.gov.br/pt-br/servicos/apurar-carne-leao";

/**
 * Onde a cliente autoriza a MAISA.
 *
 * ★ ESTA URL JÁ ESTEVE ERRADA, E O ERRO É INSTRUTIVO. Por algumas horas em 24/08/2026 ela era
 * `/autenticacao/login/index/51`, tirada da página oficial do gov.br. O `51` existe e funciona —
 * mas leva às procurações do **e-Processo**, que é outro sistema, e a própria tela avisa que ali
 * só aparecem as autorizações do serviço "Processos Digitais".
 *
 * Ou seja: o link não quebrava, ele levava ao lugar quase certo. Esse é o pior tipo de erro de
 * navegação, porque a pessoa chega numa tela plausível, não acha o que precisa e conclui que
 * ela é que não entendeu.
 *
 * Esta URL foi percorrida à mão em 25/08/2026, até criar uma autorização de verdade.
 */
export const LINK_PROCURACAO = "https://servicos.receitafederal.gov.br/servico/autorizacoes/minhas-autorizacoes";

/**
 * O serviço que a autorização precisa conceder — nome e código, **lidos na tela**.
 *
 * ⚠️ O NOME LEVA HÍFEN, NÃO TRAVESSÃO. A primeira versão daqui escrevia "IRPF – Carnê Leão Web"
 * copiando a FAQ de um conselho profissional. A tela usa `-`. Parece implicância, mas a
 * instrução manda a pessoa **buscar** por esse texto: um travessão colado num campo de busca não
 * encontra nada, e ela conclui que a permissão não existe.
 *
 * O código é o que não muda quando a Receita reescrever o rótulo.
 */
export const PERMISSAO_CARNE_LEAO = "IRPF - Carnê Leão Web";
export const PERMISSAO_CARNE_LEAO_CODIGO = "00204";

/**
 * O rótulo INTEIRO, do jeito que aparece na caixa de seleção.
 *
 * ⚠️ A lista mostra `IRPF - Carnê Leão Web (Cód. 00204)`, com o código entre parênteses no mesmo
 * texto. A instrução dizia o nome e o código separados, em ordem diferente da tela ("… (cód.
 * 00204)"), e conferir vira comparação de duas strings parecidas em vez de reconhecimento. A
 * pessoa está marcando uma caixa numa lista de dezenas: ou o texto bate letra por letra, ou ela
 * marca a de cima. Confirmado no tutorial da Rebots em 25/08/2026.
 */
export const PERMISSAO_CARNE_LEAO_NA_TELA =
  `${PERMISSAO_CARNE_LEAO} (Cód. ${PERMISSAO_CARNE_LEAO_CODIGO})`;

/**
 * O que buscar no campo de busca da lista de serviços.
 *
 * ⚠️ "carne" E NÃO "carn". Parece a mesma coisa e não é: o tutorial da Rebots usa `carne`, e é o
 * que está verificado. Mandar digitar um pedaço a menos foi economia sem motivo — se a busca da
 * Receita exigir palavra inteira, "carn" volta vazio e ela conclui que a permissão não existe.
 */
export const BUSCA_CARNE_LEAO = "carne";

/**
 * Quem a cliente autoriza — o e-CNPJ da conta que assina pelos inquilinos.
 *
 * ⚠️ ISTO É O PADRÃO, NÃO A VERDADE DE CADA INQUILINO. Quem manda é
 * `ConfigFiscal.procuradorDocumento`, gravado por tenant: uma cliente pode ter autorizado o
 * contador dela, e os passos têm que mostrar o documento DELE. A constante serve para os lugares
 * onde não existe inquilino — a página pública `/autorizar`, que é justamente a que se manda por
 * WhatsApp para alguém que ainda não entrou no app.
 *
 * É a conta da Poli Júnior ("Junior Poli Estudos"), a mesma que guarda o certificado A1.
 */
export const PROCURADOR_PADRAO = "62025689000166";

/** A página pública do gov.br. Fora do portal logado: não expira nem desloga. */
export const LINK_PROCURACAO_SERVICO =
  "https://www.gov.br/pt-br/servicos/cadastrar-ou-cancelar-procuracao-para-acesso-ao-e-cac";

/** O e-mail da Receita para o caso em que tudo está certo e ainda recusa. Fonte: CRP-MG. */
export const EMAIL_RECEITA_SAUDE = "receitasaude.cofis@rfb.gov.br";

export type EstadoDoItem =
  /** A gente confere e está certo. */
  | "pronto"
  /** A gente confere e falta. Acionável aqui dentro. */
  | "falta"
  /**
   * ⚠️ ESTÁ DO OUTRO LADO DO MURO. Não é "não checamos ainda": é impossível checar daqui.
   * O item vira instrução, nunca selo verde.
   */
  | "nao_da_para_saber"
  /**
   * ★ A BOLA ESTÁ COM A GENTE, e por isso ele NÃO conta como pendência dela.
   *
   * Sem este estado, "falta a MAISA aceitar sua autorização" apareceria no contador de coisas
   * que ELA precisa resolver — e ela iria procurar, na tela dela, um botão que não existe do
   * lado dela. Cobrar do cliente uma tarefa nossa é o jeito mais rápido de perder a confiança
   * que a tela toda existe para construir.
   */
  | "com_a_gente";

export type ItemDoChecklist = {
  id: "cpf" | "profissao" | "registro" | "procuracao" | "carne_leao" | "ensaio";
  titulo: string;
  /** Uma frase em português de gente. Vai na tela como está. */
  detalhe: string;
  estado: EstadoDoItem;
  link?: { url: string; rotulo: string };
  /**
   * A saída quando o deep link não abre — porque ela não está logada, ou porque a Receita mudou
   * a rota. Sem isto, link quebrado numa tela fiscal vira "não funciona" em vez de "faça login".
   */
  linkAlternativo?: { url: string; rotulo: string };
  /** O que clicar do outro lado, com os nomes dos botões que ela VAI VER na tela. */
  passos?: string[];
  /**
   * A ressalva que NÃO é um passo — e por isso não entra na lista numerada.
   *
   * ⚠️ Existe porque "se você usa certificado digital, o Assinador Serpro precisa estar aberto"
   * é verdade para uma minoria e falso para a maioria (conta gov.br prata/ouro assina sozinha).
   * Enfiado como passo 12, ele manda todo mundo instalar um programa que quase ninguém precisa;
   * omitido, quem usa certificado clica em "Assinar", nada acontece, e não há o que procurar.
   */
  aviso?: string;
};

/**
 * Nome da profissão como ela aparece na lista do Carnê-Leão.
 *
 * ⚠️ EXPORTADO PARA A TELA ESCOLHER DAQUI, e não manter a sua própria lista. São seis, fechadas
 * pela Receita (IN 2.240/2024) — duas listas divergindo dariam um rótulo na tela e outro no
 * arquivo, para o mesmo código. Ver `CODIGO_OCUPACAO`.
 */
export const NOME_DA_OCUPACAO: Record<OcupacaoSaude, string> = {
  medico: "Médico",
  odontologo: "Cirurgião-dentista",
  fonoaudiologo: "Fonoaudiólogo",
  fisioterapeuta: "Fisioterapeuta",
  terapeuta_ocupacional: "Terapeuta ocupacional",
  psicologo: "Psicólogo",
};

/**
 * Como o conselho da profissão se chama — para a frase falar a língua dela.
 *
 * Exportado pelo mesmo motivo de `NOME_DA_OCUPACAO`: o rótulo do campo na tela muda enquanto
 * ela escolhe a profissão, e não dá para ler do checklist (que reflete o que está SALVO).
 */
export const CONSELHO: Record<OcupacaoSaude, string> = {
  medico: "CRM",
  odontologo: "CRO",
  fonoaudiologo: "CRFa",
  fisioterapeuta: "CREFITO",
  terapeuta_ocupacional: "CREFITO",
  psicologo: "CRP",
};

/** 000.000.000-00 ou 00.000.000/0000-00 — o documento como ela vai conferir na tela do e-CAC. */
function documentoFormatado(d: string): string {
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Os passos da outorga, com os nomes que estão na tela — percorridos à mão em 25/08/2026 e
 * conferidos contra o tutorial da Rebots.
 *
 * ── ★ UMA AÇÃO POR PASSO, E FOI UMA RECLAMAÇÃO QUE IMPÔS ISSO ──
 *
 * Bruno, 25/08/2026: *"achei que faltou clareza no tutorial da receita, talvez devemos reformular
 * para manter 100% de clareza, e objetividade"*.
 *
 * A versão anterior tinha seis passos, e três defeitos que só aparecem quando alguém tenta seguir:
 *
 *   1. **A ORDEM ESTAVA ERRADA.** "Escolha a validade" era o passo 5, depois dos serviços. Na
 *      tela, a validade fica na PRIMEIRA etapa, ao lado da pessoa autorizada. Quem seguisse a
 *      lista chegava ao fim procurando um campo que já tinha passado.
 *   2. **O CAMPO TINHA OUTRO NOME.** A instrução dizia `Em "Pessoa"`; a tela diz "Quem", e o campo
 *      se chama "Pessoa Autorizada". Nome que não bate é nome que se procura.
 *   3. **UM PASSO CARREGAVA CINCO CLIQUES** — abrir "Selecionar Serviços", buscar, marcar,
 *      "Confirmar", "Avançar" — numa linha só. Instrução assim não se segue, se decifra.
 *
 * Agora é uma ação por linha, na ordem da tela, com o texto do botão entre aspas. Ficou mais
 * longo e mais curto de fazer, que é a troca certa: ninguém lê isto por prazer, lê enquanto
 * clica.
 *
 * ⚠️ A PERMISSÃO É O PASSO QUE TODO MUNDO ERRA. A lista tem dezenas de serviços e um atalho
 * "Todos" logo acima; marcar o errado gera uma autorização **válida que não serve**, e a
 * descoberta acontece na primeira emissão, dias depois. Por isso o passo manda **buscar** em vez
 * de rolar: o campo de busca reduz a lista a uma linha, e some a chance de errar.
 *
 * ★ "NÃO MARQUE TODOS" É REGRA DE SEGURANÇA, NÃO DE BUROCRACIA. Com "Todos", a cliente entrega à
 * MAISA poder sobre declaração, dívida, parcelamento e pagamento dela — por até cinco anos. A
 * gente precisa de um serviço; pedir o resto é guardar um risco que não nos serve para nada.
 *
 * Exportado porque o onboarding e a renovação pedem o mesmo ato, e duas listas divergindo dariam
 * instruções diferentes para a mesma coisa.
 */
export function passosDaProcuracao(procurador: string): string[] {
  return [
    /* O nível fica colado no passo 1 e não vira passo próprio: não é uma ação, é a condição para
     * ESTA ação. Quem tem conta bronze descobre aqui, antes de clicar, e não na tela de erro. */
    "Entre com a sua conta gov.br — precisa ser nível prata ou ouro",
    'Clique em "+ Nova Autorização"',
    `Em "Pessoa Autorizada", digite ${documentoFormatado(procurador)}`,
    'Em "Validade", escolha até quando vale — o máximo é 5 anos',
    'Clique em "Avançar"',
    'Clique em "Selecionar Serviços"',
    `Digite "${BUSCA_CARNE_LEAO}" na busca`,
    /* O rótulo inteiro, igualzinho ao da caixa — ela está comparando texto numa lista de dezenas.
     * E o "Todos" vem colado no mesmo passo porque é aqui, com o dedo no mouse, que se erra. */
    `Marque só "${PERMISSAO_CARNE_LEAO_NA_TELA}" — nunca a opção "Todos"`,
    'Clique em "Confirmar"',
    'Clique em "Avançar"',
    `Confira que aparece "${PERMISSAO_CARNE_LEAO_NA_TELA}" e clique em "Assinar"`,
  ];
}

/**
 * A ressalva de quem assina com certificado digital.
 *
 * ⚠️ VERIFICADO NOS DOIS SENTIDOS em 25/08/2026: a página oficial do gov.br diz que conta **prata
 * ou ouro basta** para cadastrar a autorização — nenhum programa a instalar. O tutorial da Rebots
 * trata o Assinador Serpro como "requisito essencial" porque o fluxo deles é por certificado.
 *
 * As duas coisas são verdade, e é por isso que isto não é um passo: como passo 12, manda a maioria
 * instalar um programa que ela não precisa; omitido, quem usa certificado clica em "Assinar",
 * **nada acontece**, e não existe nada na tela para procurar.
 */
export const AVISO_ASSINADOR =
  "Se você assinar com certificado digital em vez da conta gov.br, o Assinador Serpro precisa "
  + "estar aberto e atualizado no computador — senão o botão \"Assinar\" não conclui.";

/**
 * O código do app gov.br, que é onde a Regina parou (09/09/2026).
 *
 * Medido com conta ouro: o "Assinar" pede um código de 6 dígitos que **só existe dentro do app**
 * — não vai por SMS, e-mail nem push. "Pode pedir" e não "pede" porque ainda não se mediu se é
 * sempre ou só com a verificação em duas etapas ligada. Quem descobre isso na hora de assinar,
 * sem o app instalado, desiste no último passo.
 */
export const AVISO_CODIGO_DO_APP =
  "Na hora de \"Assinar\", a Receita pode pedir um código de 6 dígitos. Ele só existe no "
  + "aplicativo gov.br do seu celular — não chega por SMS nem por e-mail. Deixe o celular à mão.";

export function checklistDoRecibo(c: ConfigFiscal, hoje: string): ItemDoChecklist[] {
  const ano = hoje.slice(0, 4);
  const ocupacao = c.ocupacaoSaude;
  const conselho = ocupacao ? CONSELHO[ocupacao] : "conselho";
  const profissao = ocupacao ? NOME_DA_OCUPACAO[ocupacao] : null;
  const codigo = ocupacao ? CODIGO_OCUPACAO[ocupacao] : null;
  const registro = (c.registroProfissional ?? "").trim();

  const itens: ItemDoChecklist[] = [];

  itens.push({
    id: "cpf",
    titulo: "Seu CPF",
    estado: soDigitos(c.prestadorCpf ?? "").length === 11 ? "pronto" : "falta",
    detalhe: soDigitos(c.prestadorCpf ?? "").length === 11
      /* O CPF do arquivo tem que ser o MESMO que acessa o Carnê-Leão. É o erro mais silencioso
       * possível: tudo passa, e a Receita recusa o arquivo inteiro sem dizer por quê. */
      ? "Tem que ser o mesmo CPF com que você entra no gov.br."
      : "Sem ele não há arquivo — é o CPF de quem emite o recibo.",
  });

  itens.push({
    id: "profissao",
    titulo: "Sua profissão",
    estado: ocupacao ? "pronto" : "falta",
    detalhe: ocupacao
      ? `${profissao} — código ${codigo} no arquivo da Receita.`
      : "A Receita só aceita recibo de saúde de seis profissões, e o código muda por profissão.",
  });

  itens.push({
    id: "registro",
    titulo: `Seu ${conselho}`,
    estado: registro ? "pronto" : "falta",
    detalhe: registro
      ? `${registro} — vai no arquivo, e é o que a Receita cruza com a base do ${conselho}.`
      /* ⚠️ "Obrigatório para emitir" na frase: é o que a Rebots exige para habilitar a emitente,
       * e a tela Fiscal bloqueia sem ele. Ver o cabeçalho e `faltaParaEmitirRecibo`. */
      : `O registro no conselho é obrigatório para emitir. É também o que a Receita confere contra o ${conselho}.`,
  });

  /* ── ★ A PROCURAÇÃO, QUANDO EXISTE ──
   *
   * Vem antes do Carnê-Leão de propósito: para quem outorgou, este é o item que descreve o
   * produto que ela comprou, e o de baixo vira "a MAISA cuida". Para quem não outorgou, ele
   * não existe e nada muda. */
  const rep = representacao(c, hoje);
  /* As duas saídas e a ressalva andam juntas: quem mostra os passos da outorga precisa das três,
   * e esquecer uma delas num dos ramos daria instruções diferentes para o mesmo ato. */
  const saidas = {
    link: { url: LINK_PROCURACAO, rotulo: "Abrir no site da Receita" },
    linkAlternativo: { url: LINK_PROCURACAO_SERVICO, rotulo: "Travou no login? Entre pelo gov.br" },
    aviso: AVISO_ASSINADOR,
  };

  /* ⚠️ NA TELA SE CHAMA "AUTORIZAÇÃO DE ACESSO", e no código continua `procuracao`. A Receita
   * renomeou — o menu do e-CAC hoje diz "Autorizações de Acesso (Procurações)", com o nome velho
   * entre parênteses. O texto que a cliente lê tem que bater com o botão que ela vai clicar; o
   * nome interno não importa para ela. */
  if (rep.modo === "vencida") {
    itens.push({
      id: "procuracao",
      titulo: "Sua autorização de acesso venceu",
      /* `falta`, e não `nao_da_para_saber`: isto a gente sabe, é acionável, e sem ele a emissão
       * para. É a única pendência deste checklist que faz o botão deixar de funcionar. */
      estado: "falta",
      detalhe:
        `Venceu em ${rotuloBR(rep.ate)}. Enquanto não for renovada, a MAISA não consegue emitir `
        + `no seu nome e os recibos ficam parados. Renovar leva um minuto e é você quem faz — a `
        + `Receita exige que a autorização venha de você.`,
      ...saidas,
      passos: passosDaProcuracao(rep.procurador),
    });
  } else if (rep.modo === "aguardando_aceite") {
    itens.push({
      id: "procuracao",
      titulo: "Sua autorização está com a gente",
      /* ★ `com_a_gente`, e é o ponto do estado: ela já fez tudo. Marcar `falta` mandaria a
       * cliente procurar, na tela dela, um botão que só existe do nosso lado. */
      estado: "com_a_gente",
      detalhe:
        "Você autorizou a MAISA no site da Receita — essa parte está feita. Falta a gente "
        + "confirmar do nosso lado, e é o que estamos fazendo. **Você não precisa fazer mais "
        + "nada**; avisamos quando os recibos puderem sair.",
    });
  } else if (rep.modo === "representada") {
    const aVencer = procuracaoAVencer(rep);
    itens.push({
      id: "procuracao",
      titulo: aVencer ? "Sua autorização está para vencer" : "Sua autorização de acesso",
      estado: aVencer ? "falta" : "pronto",
      detalhe: rep.ate
        ? (aVencer
          ? `Vale até ${rotuloBR(rep.ate)} — faltam ${rep.diasParaVencer} dias. Renove antes de `
            + `vencer: depois disso a emissão para até você autorizar de novo.`
          : `A MAISA emite seus recibos no seu nome, com a autorização que você deu no site da `
            + `Receita. Vale até ${rotuloBR(rep.ate)}.`)
        : "A MAISA emite seus recibos no seu nome, com a autorização que você deu no site da "
          + "Receita. Você não pôs prazo, então ela vale até você cancelar.",
      ...(aVencer ? { ...saidas, passos: passosDaProcuracao(rep.procurador) } : {}),
    });
  }

  /* ── ★ O ITEM QUE A GENTE NÃO PODE FINGIR QUE SABE ── */
  itens.push({
    id: "carne_leao",
    titulo: `Cadastro no Carnê-Leão de ${ano}`,
    estado: "nao_da_para_saber",
    detalhe:
      `Isto fica no site da Receita, não aqui — só você consegue ver. **O cadastro é por ano**: `
      + `quem fez em ${Number(ano) - 1} e não refez está de fora. É daqui que vêm os dois erros `
      + `que mais aparecem, "Ocupação não cadastrada" e "Registro profissional não informado `
      + `pelo conselho".`,
    link: { url: LINK_CARNE_LEAO, rotulo: "Abrir meu Carnê-Leão" },
    linkAlternativo: { url: LINK_ECAC_SERVICO, rotulo: "Travou no login? Entre pelo gov.br" },
    /* Os nomes dos botões são os que aparecem na tela dela. Instrução que não usa as mesmas
     * palavras do site é instrução que faz a pessoa desistir no meio.
     *
     * ★ O PASSO DE NAVEGAÇÃO É CONDICIONAL, e a condição é o que a gente não consegue verificar:
     * com `sistema=10028` ela DEVE cair dentro do Carnê-Leão, mas o que acontece depois do login
     * não se mede sem sessão. Afirmar que cai seria mentir se não cair; mandar navegar sempre
     * faria ela procurar um menu que já não está na frente dela. Então a frase cobre os dois — e
     * fica num passo SÓ DELA, em vez de pendurada no fim do passo de entrar. Condicional escondida
     * dentro de outra instrução é o jeito mais barato de perder alguém no meio da lista.
     *
     * ⚠️ Uma ação por passo, desde 25/08/2026. "Em Identificação → Ocupações, escolha X, digite o
     * CRP e clique em Adicionar" eram quatro coisas numa linha — e a seta `→` obrigava a decifrar
     * uma navegação que nenhum botão da tela desenha assim. */
    passos: [
      "Entre com a sua conta gov.br — é a mesma do Meu INSS",
      'Se não abrir o Carnê-Leão, clique em "Declarações e Demonstrativos" e depois em "Acessar Carnê-Leão"',
      'Abra "Configurações" e marque que você é trabalhador autônomo',
      'Abra "Identificação" e vá em "Ocupações"',
      `Escolha "${profissao ?? "sua profissão"}" na lista`,
      `Digite o seu ${conselho}`,
      'Clique em "Adicionar"',
      'Clique em "Salvar Identificação"',
    ],
  });

  itens.push({
    id: "ensaio",
    titulo: "Testar sem emitir nada",
    estado: "nao_da_para_saber",
    detalhe:
      "O e-CAC tem uma conferência que **aponta os erros sem emitir recibo nenhum** — de graça e "
      + "quantas vezes você quiser. Vale sempre fazer antes: se voltar sem erro, aí sim importe.",
    link: { url: LINK_CARNE_LEAO, rotulo: "Abrir meu Carnê-Leão" },
    linkAlternativo: { url: LINK_ECAC_SERVICO, rotulo: "Travou no login? Entre pelo gov.br" },
    passos: [
      "Entre com a sua conta gov.br",
      'Se não abrir o Carnê-Leão, clique em "Declarações e Demonstrativos" e depois em "Acessar Carnê-Leão"',
      'Clique em "Importar Escrituração"',
      "Escolha o arquivo que a MAISA gerou",
      'Clique em "Analisar Arquivo"',
      /* O último passo nomeia o verbo que a tela inteira depende de não confundir: a MAISA gera,
       * a IMPORTAÇÃO emite. "Importe de verdade" não dizia o que a importação faz. */
      'Voltou sem erro? Aí sim clique em "Importar" — é a importação que emite os recibos',
    ],
  });

  return itens;
}

/**
 * Falta algo que a gente consegue consertar aqui dentro?
 *
 * Só conta `falta`. Os `nao_da_para_saber` nunca somam — senão o aviso ficaria aceso para
 * sempre, e aviso que nunca apaga é aviso que ninguém lê.
 */
export function faltaNoChecklist(itens: ItemDoChecklist[]): number {
  return itens.filter((i) => i.estado === "falta").length;
}

/**
 * ★ OS ITENS QUE SÃO DADO NOSSO — e a razão de a lista existir é uma reclamação.
 *
 * Bruno, 25/08/2026: *"na mesma pagina temos nota fiscal, recibos, cadastro de dados etc. NN
 * está legal e até eu que sei do que se trata estou CONFUSO"*.
 *
 * O checklist misturava dois assuntos numa lista só. "Seu CPF" é um campo que a gente guarda e
 * que se conserta num formulário daqui; "Cadastro no Carnê-Leão" é uma tela do site da Receita
 * que ninguém aqui alcança. Enfileirados com o mesmo desenho, os dois viravam a mesma coisa: uma
 * lista de coisas erradas sem dizer QUEM resolve cada uma.
 *
 * Partido, cada metade ganha o desenho da sua natureza — formulário de um lado, instrução do
 * outro — e o contador de pendências para de somar peras com maçãs.
 */
const ITENS_MEUS_DADOS: ItemDoChecklist["id"][] = ["cpf", "profissao", "registro"];

/**
 * Parte o checklist nos dois assuntos.
 *
 * ⚠️ A REGRA É POR `id`, e não por `estado`. Tentador seria "o que é `falta` vai para o
 * formulário" — só que a autorização vencida também é `falta` e não se resolve com um campo:
 * resolve-se no site da Receita. Estado diz o que está errado; `id` diz de quem é a bola.
 */
export function partesDoChecklist(itens: ItemDoChecklist[]): {
  meusDados: ItemDoChecklist[];
  noEcac: ItemDoChecklist[];
} {
  return {
    meusDados: itens.filter((i) => ITENS_MEUS_DADOS.includes(i.id)),
    noEcac: itens.filter((i) => !ITENS_MEUS_DADOS.includes(i.id)),
  };
}

/**
 * O que fazer quando o e-CAC recusa mesmo com tudo em ordem.
 *
 * A escada existe porque o último degrau é real e quase ninguém sabe dele: há um e-mail da
 * Cofis para exatamente este caso. Sem isto, a profissional com registro ativo, cadastro em dia
 * e recusa persistente não tem para onde ir — e conclui que o produto está quebrado.
 */
export function seAindaRecusar(ocupacao: OcupacaoSaude | null): string[] {
  const conselho = ocupacao ? CONSELHO[ocupacao] : "seu conselho";
  return [
    `Confira se o cadastro no Carnê-Leão é deste ano — ele não se renova sozinho.`,
    `Se estiver, ligue no ${conselho}: pode ser que o registro não tenha ido na base que eles`
    + ` mandam para a Receita, que é atualizada uma vez por mês.`,
    `Registro ativo há mais de 30 dias, cadastro em dia e ainda recusando: escreva para`
    + ` ${EMAIL_RECEITA_SAUDE}. É o canal da Receita para este caso específico.`,
  ];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ O QUE IMPEDE A MAISA DE EMITIR O RECIBO — UMA REGRA SÓ (25/09/2026, 1A.13).
 *
 * A tela Fiscal, o Documento fiscal e o cartão de dados davam três respostas para a mesma
 * pergunta (06 P0-3 e P0-4 da auditoria do front): a Fiscal bloqueava sem CRP, o cartão dizia
 * "não bloqueia", e ninguém olhava a autorização — vencida em 01/09, o botão "Emitir 11
 * recibos" aceso, e os 11 voltavam recusados um por um.
 *
 * Soma o que `fiscalFaltando` pede (CPF e profissão), o registro no conselho, e a autorização
 * de acesso quando ela não vale: `vencida` (é dela renovar) e `aguardando_aceite` (é nosso
 * aceitar, e por isso `quem: "nos"`: a tela não manda ela procurar um botão que não existe do
 * lado dela).
 *
 * ⚠️ `propria` (sem procurador) NÃO entra, e é decisão de 25/09/2026 com pergunta aberta: os
 * casos de uso (`aplicacao/recibos.ts`, `recibo-unitario.ts`) não recusam sem representação, e
 * nenhuma leitura daqui diz se o canal recusa. Bloquear seria inventar regra; o Bruno decide.
 * ────────────────────────────────────────────────────────────────────────────── */

export type FaltaDoRecibo = {
  id: "cpf" | "profissao" | "registro" | "autorizacao";
  /** Uma frase de gente, pronta para ir ao lado do botão desligado. */
  frase: string;
  /** De quem é a bola. `nos` = ela não tem o que fazer. */
  quem: "voce" | "nos";
};

export function faltaParaEmitirRecibo(c: ConfigFiscal, hoje: string): FaltaDoRecibo[] {
  const falta: FaltaDoRecibo[] = [];
  const conselho = c.ocupacaoSaude ? CONSELHO[c.ocupacaoSaude] : "registro no conselho";
  if (soDigitos(c.prestadorCpf ?? "").length !== 11) falta.push({ id: "cpf", quem: "voce", frase: "Falta o seu CPF." });
  if (!c.ocupacaoSaude) falta.push({ id: "profissao", quem: "voce", frase: "Falta a sua profissão." });
  if (!(c.registroProfissional ?? "").trim()) {
    falta.push({ id: "registro", quem: "voce", frase: `Falta o seu ${conselho}: o registro no conselho é obrigatório para emitir.` });
  }
  const rep = representacao(c, hoje);
  if (rep.modo === "vencida") {
    falta.push({ id: "autorizacao", quem: "voce", frase: `Sua autorização venceu em ${rotuloBR(rep.ate)}.` });
  } else if (rep.modo === "aguardando_aceite") {
    falta.push({ id: "autorizacao", quem: "nos", frase: "Sua autorização está com a gente: falta a MAISA confirmar. Você não precisa fazer nada." });
  }
  return falta;
}

/** A parte da falta que se resolve num formulário daqui (CPF, profissão, registro). */
export function faltaNosDados(faltas: FaltaDoRecibo[]): FaltaDoRecibo[] {
  return faltas.filter((f) => f.id !== "autorizacao");
}
