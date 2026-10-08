/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM
 *
 * ★ QUE A GENTE NÃO PINTA DE VERDE O QUE NÃO SABE. O cadastro no Carnê-Leão e a base que o
 * conselho manda para a Receita estão do outro lado do muro — nenhuma configuração nossa muda
 * o estado deles, e nenhuma leitura nossa os alcança.
 *
 * Um selo verde ali seria mentira caríssima: ela sairia da tela achando que está tudo certo e
 * descobriria no e-CAC, sozinha, em vocabulário de Receita. Por isso `nao_da_para_saber` é
 * inatingível por configuração — e há teste que tenta e falha de propósito.
 *
 * E, desde 25/09/2026, que o CRP BLOQUEIA a emissão pela MAISA: a Rebots exige o registro para
 * habilitar a emitente (ver o cabeçalho de `checklist-recibo.ts` e `faltaParaEmitirRecibo`).
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  EMAIL_RECEITA_SAUDE, LINK_CARNE_LEAO, LINK_ECAC_SERVICO, LINK_PROCURACAO,
  passosDaProcuracao,
  AVISO_ASSINADOR,
  checklistDoRecibo, faltaNoChecklist, partesDoChecklist, seAindaRecusar,
  faltaParaEmitirRecibo, faltaNosDados,
} from "./checklist-recibo";
import type { ConfigFiscal } from "./fiscal";

const HOJE = "2026-08-24";

const carla = (over: Partial<ConfigFiscal> = {}): ConfigFiscal => ({
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
  ...over,
});

const item = (c: ConfigFiscal, id: string) =>
  checklistDoRecibo(c, HOJE).find((i) => i.id === id)!;

describe("o que a gente consegue conferir", () => {
  it("tudo preenchido: CPF, profissão e registro ficam prontos", async () => {
    const itens = checklistDoRecibo(carla(), HOJE);
    const nossos = itens.filter((i) => ["cpf", "profissao", "registro"].includes(i.id));

    expect(nossos.map((i) => i.estado)).toEqual(["pronto", "pronto", "pronto"]);
    expect(faltaNoChecklist(itens)).toBe(0);
  });

  it("CPF torto vira `falta`", () => {
    expect(item(carla({ prestadorCpf: "123" }), "cpf").estado).toBe("falta");
  });

  it("sem profissão, `falta` — e o código só aparece quando há profissão", () => {
    expect(item(carla({ ocupacaoSaude: null }), "profissao").estado).toBe("falta");
    expect(item(carla(), "profissao").detalhe).toContain("255");
  });

  /* ★ MUDOU DE PROPÓSITO EM 25/09/2026: a frase dizia "Não bloqueia gerar" enquanto a tela
   * Fiscal bloqueava, e ela andava em círculo. Agora as duas dizem a mesma coisa. */
  it("sem registro é `falta`, e a frase diz que é obrigatório para emitir", () => {
    const i = item(carla({ registroProfissional: null }), "registro");
    expect(i.estado).toBe("falta");
    expect(i.detalhe).toContain("obrigatório para emitir");
  });
});

describe("★ o que está do outro lado do muro", () => {
  /* O TESTE QUE JUSTIFICA O ARQUIVO. */
  it("Carnê-Leão e ensaio NUNCA ficam prontos, por mais que se configure", () => {
    const completa = carla({ registroProfissional: "CRP 06/123456" });
    const doOutroLado = checklistDoRecibo(completa, HOJE)
      .filter((i) => ["carne_leao", "ensaio"].includes(i.id));

    expect(doOutroLado.map((i) => i.estado)).toEqual(["nao_da_para_saber", "nao_da_para_saber"]);
  });

  /* Aviso que nunca apaga é aviso que ninguém lê: o contador de pendências ignora o que é
   * impossível saber. */
  it("`nao_da_para_saber` não conta como pendência", () => {
    expect(faltaNoChecklist(checklistDoRecibo(carla(), HOJE))).toBe(0);
  });

  /* O cadastro é por ano-calendário, e é a causa nº 1 dos dois erros. A frase tem que dizer o
   * ano — "renove o cadastro" sem número faz a pessoa achar que já fez. */
  it("o item do Carnê-Leão nomeia o ano e o ano anterior", () => {
    const i = item(carla(), "carne_leao");
    expect(i.titulo).toContain("2026");
    expect(i.detalhe).toContain("2025");
    expect(i.detalhe).toContain("por ano");
  });

  /* Os dois erros do e-CAC citados com as palavras dele: é assim que ela liga o que leu lá com
   * o que a MAISA disse aqui. */
  it("cita os dois erros do e-CAC com as palavras da Receita", () => {
    const d = item(carla(), "carne_leao").detalhe;
    expect(d).toContain("Ocupação não cadastrada");
    expect(d).toContain("Registro profissional não informado pelo conselho");
  });

  /* ⚠️ Instrução que não usa as palavras dos botões do site é instrução que faz desistir no
   * meio. Estes são os nomes que aparecem na tela dela. */
  it("os passos usam os nomes dos botões do e-CAC", () => {
    const passos = (item(carla(), "carne_leao").passos ?? []).join(" | ");
    expect(passos).toContain("trabalhador autônomo");
    expect(passos).toContain("Ocupações");
    expect(passos).toContain("Salvar Identificação");
    expect(passos).toContain("Psicólogo");
    expect(passos).toContain("CRP");
  });

  /* ★ ESTE TESTE JÁ AFIRMOU O CONTRÁRIO, POR ALGUMAS HORAS EM 24/08/2026: ele exigia que a
   * navegação NÃO aparecesse, porque o link era deep link e supostamente caía dentro do
   * Carnê-Leão. Aí alguém mediu o que o servidor responde:
   *
   *   /carneleao/escrituracao → 302 → /autenticacao/login   (sem retorno)
   *   /ecac/                  → 302 → /autenticacao/login   (a MESMA URL)
   *
   * O 302 não carrega o destino, então ela sempre desemboca na home logada. O teste de antes
   * prendia uma omissão que deixava a pessoa parada olhando um portal inteiro. */
  it("manda navegar até o Carnê-Leão, porque o link para na home logada", () => {
    const passos = (item(carla(), "carne_leao").passos ?? []).join(" | ");
    expect(passos).toContain("Declarações e Demonstrativos");
    expect(passos).toContain("Acessar Carnê-Leão");
  });

  /* O login vem primeiro e é nomeado pelo que ela reconhece. "Conta gov.br" é abstrato; "a mesma
   * do Meu INSS" é a senha que ela já digitou alguma vez. */
  it("o primeiro passo é entrar, e diz qual conta é", () => {
    const passos = item(carla(), "carne_leao").passos ?? [];
    expect(passos[0]).toContain("gov.br");
    expect(passos[0]).toContain("Meu INSS");
  });

  /* O ensaio também começa navegando — ele parte do mesmo lugar.
   *
   * ⚠️ A NAVEGAÇÃO GANHOU PASSO PRÓPRIO em 25/08/2026. Antes ela vinha pendurada no fim do passo
   * de entrar ("Entre com o gov.br — se não cair no Carnê-Leão, …"), e condicional escondida
   * dentro de outra instrução é onde se perde quem está seguindo a lista com o dedo. */
  it("o ensaio começa navegando, não no botão de importar", () => {
    const passos = (item(carla(), "ensaio").passos ?? []);
    expect(passos[1]).toContain("Acessar Carnê-Leão");
    expect(passos).toContain('Clique em "Importar Escrituração"');
  });

  /* ⚠️ O sintoma real, visto em 24/08/2026: ela clicou, foi para o login, tentou entrar e parou
   * em `/autenticacao/Login/Logout` — a tela de SAIR. A saída alternativa existe para esse
   * beco, e o rótulo tem que descrever o beco, não um genérico "não abriu". */
  it("todo link do portal tem uma saída fora do portal", () => {
    for (const id of ["carne_leao", "ensaio"]) {
      const i = item(carla(), id);
      expect(i.link?.url).toBe(LINK_CARNE_LEAO);
      expect(i.linkAlternativo?.url).toBe(LINK_ECAC_SERVICO);
      expect(i.linkAlternativo?.rotulo).toContain("login");
    }
  });

  /* ★ O TESTE QUE PRENDE O PARÂMETRO, e é o único deste arquivo cuja ausência custaria a viagem
   * inteira. Medido em 24/08/2026:
   *
   *   /carneleao/escrituracao   → 302 → /autenticacao/login                      destino perdido
   *   /carneleao/demonstrativo  → 302 → /autenticacao/login                      destino perdido
   *   /ecac/                    → 302 → /autenticacao/login                      destino perdido
   *   …/login/index/10028       → 302 → …/login?redirectUrl=…&sistema=10028      destino atravessa
   *
   * Apontar para uma tela "mais funda" NÃO ajuda: as três primeiras morrem no mesmo login. O que
   * carrega o destino é o código de serviço — e é ele que alguém "limpando" a URL apagaria. */
  it("o link leva o código do serviço, senão o login descarta o destino", () => {
    expect(LINK_CARNE_LEAO).toContain("/autenticacao/login/index/");
    expect(LINK_CARNE_LEAO).toContain("10028");
  });

  /* ★ NENHUM LINK APONTA PARA DENTRO DO PORTAL AUTENTICADO. Rota interna do e-CAC não se
   * verifica sem sessão — todas respondem 302 para o login — e, medido, ela não encurta nada:
   * o redirect descarta o destino. Um deep link aqui é custo sem benefício. */
  it("aponta para a porta da frente, e nunca para uma rota interna", () => {
    expect(LINK_CARNE_LEAO).toBe("https://cav.receita.fazenda.gov.br/autenticacao/login/index/10028");

    const urls = checklistDoRecibo(carla(), HOJE)
      .flatMap((i) => [i.link?.url, i.linkAlternativo?.url])
      .filter(Boolean) as string[];

    for (const u of urls) expect(u).not.toMatch(/carneleao|identificacao|configuracoes|www3\./);
  });

  it("o ensaio explica que não emite nada", () => {
    const i = item(carla(), "ensaio");
    expect(i.detalhe).toContain("sem emitir recibo nenhum");
    expect((i.passos ?? []).join(" | ")).toContain("Analisar Arquivo");
  });
});

describe("a profissão muda o vocabulário", () => {
  it("fisioterapeuta fala CREFITO, não CRP", () => {
    const i = item(carla({ ocupacaoSaude: "fisioterapeuta" }), "registro");
    expect(i.titulo).toBe("Seu CREFITO");
    expect(item(carla({ ocupacaoSaude: "fisioterapeuta" }), "profissao").detalhe).toContain("231");
  });

  it("fonoaudióloga fala CRFa", () => {
    expect(item(carla({ ocupacaoSaude: "fonoaudiologo" }), "registro").titulo).toBe("Seu CRFa");
  });

  /* Sem profissão escolhida, a frase não pode inventar um conselho. */
  it("sem profissão, o título não chuta conselho", () => {
    expect(item(carla({ ocupacaoSaude: null }), "registro").titulo).toBe("Seu conselho");
  });
});

describe("a escada de quando recusa mesmo com tudo certo", () => {
  /* O último degrau é real e quase ninguém sabe dele. Sem isso, a profissional com registro
   * ativo e recusa persistente conclui que o produto está quebrado. */
  it("termina no e-mail da Cofis", () => {
    const passos = seAindaRecusar("psicologo");
    expect(passos).toHaveLength(3);
    expect(passos[2]).toContain(EMAIL_RECEITA_SAUDE);
    expect(passos[1]).toContain("CRP");
    expect(passos[0]).toContain("deste ano");
  });

  it("fala do conselho certo por profissão", () => {
    expect(seAindaRecusar("terapeuta_ocupacional")[1]).toContain("CREFITO");
    expect(seAindaRecusar(null)[1]).toContain("seu conselho");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * A PROCURAÇÃO NO CHECKLIST
 *
 * ★ DOIS DETALHES DECIDEM SE A OUTORGA FUNCIONA, E OS DOIS SÃO INVISÍVEIS NUMA REVISÃO VISUAL:
 *
 *   1. A permissão marcada tem que ser **"IRPF – Carnê Leão Web"**. A tela do e-CAC lista
 *      dezenas de serviços; marcar outro gera uma procuração válida que NÃO SERVE — e a
 *      descoberta acontece na primeira emissão, dias depois, com a Receita recusando.
 *
 *   2. O link é o serviço **51**, não o 10028 do Carnê-Leão. Reaproveitar o outro levaria ela
 *      para a escrituração, com um passo a passo falando de um menu que não está na tela.
 * ───────────────────────────────────────────────────────────────────────────── */


const PJ = "62025689000166";
/* Aceite preenchido: aqui o assunto é o depois. O antes tem teste próprio. */
const comProcuracao = (ate: string | null) =>
  carla({ procuradorDocumento: PJ, procuracaoValidaAte: ate, procuracaoAceitaEm: "2026-08-20" });

describe("★ a procuração", () => {
  it("sem outorga, o item não existe", () => {
    expect(checklistDoRecibo(carla(), HOJE).find((i) => i.id === "procuracao")).toBeUndefined();
  });

  /* ★ O ESTADO QUE NÃO PODE COBRAR DELA. Ela já fez a parte dela; o botão que falta é nosso.
   * Se isto virasse `falta`, o contador diria "1 item para você preencher" e ela procuraria, na
   * tela dela, algo que não existe do lado dela. */
  it("outorgada e sem o nosso aceite: fica com a gente, e não conta como pendência dela", () => {
    const c = carla({ procuradorDocumento: PJ, procuracaoValidaAte: "2027-05-12" });
    const i = item(c, "procuracao");

    expect(i.estado).toBe("com_a_gente");
    expect(i.detalhe).toContain("não precisa fazer mais nada");
    /* Sem passos e sem link: não há o que ela clicar. */
    expect(i.passos).toBeUndefined();
    expect(faltaNoChecklist(checklistDoRecibo(c, HOJE))).toBe(0);
  });

  it("outorgada e no prazo, fica pronta e diz até quando", () => {
    const i = item(comProcuracao("2027-05-12"), "procuracao");
    expect(i.estado).toBe("pronto");
    expect(i.detalhe).toContain("12/05/2027");
    /* Sem prazo apertado não há por que mostrar o passo a passo — é ruído sobre algo resolvido. */
    expect(i.passos).toBeUndefined();
  });

  it("sem prazo, explica que vale até ela cancelar", () => {
    const i = item(comProcuracao(null), "procuracao");
    expect(i.estado).toBe("pronto");
    expect(i.detalhe).toContain("até você cancelar");
  });

  /* Trinta dias antes vira pendência COM instrução: é o único aviso possível antes de parar. */
  it("a vencer vira pendência e traz os passos", () => {
    const i = item(comProcuracao("2026-09-10"), "procuracao");
    expect(i.estado).toBe("falta");
    expect(i.titulo).toContain("para vencer");
    expect(i.passos?.length).toBeGreaterThan(0);
  });

  /* ⚠️ A ÚNICA PENDÊNCIA DESTE CHECKLIST QUE FAZ O BOTÃO PARAR DE FUNCIONAR. */
  it("vencida diz a data e que a emissão parou", () => {
    const i = item(comProcuracao("2026-08-01"), "procuracao");
    expect(i.estado).toBe("falta");
    expect(i.detalhe).toContain("01/08/2026");
    expect(i.detalhe).toContain("não consegue emitir");
  });
});

describe("★ os onze cliques da outorga", () => {
  /* O TESTE QUE JUSTIFICA A FUNÇÃO. Ver o cabeçalho. */
  /* ⚠️ HÍFEN, NÃO TRAVESSÃO — e este teste já afirmou o contrário. A primeira versão copiava a
   * FAQ de um conselho, que escreve "–". A tela usa "-", e o passo manda a pessoa DIGITAR na
   * busca: um travessão colado num campo de busca não encontra nada, e ela conclui que a
   * permissão não existe. Visto na tela em 25/08/2026. */
  it("nomeia a permissão com hífen, e traz o código", () => {
    const p = passosDaProcuracao(PJ).join(" | ");
    expect(p).toContain("IRPF - Carnê Leão Web");
    expect(p).not.toContain("IRPF – Carnê Leão Web");
    expect(p).toContain("00204");
  });

  /* ★ "Todos" é um atalho na mesma tela, e marcá-lo entrega poder sobre declaração, dívida e
   * pagamento da cliente por até cinco anos. O passo tem que desaconselhar em voz alta. */
  it("desaconselha a opção Todos", () => {
    expect(passosDaProcuracao(PJ).join(" | ")).toContain('nunca a opção "Todos"');
  });

  /* Buscar em vez de rolar: a lista tem dezenas de serviços e a busca reduz a uma linha.
   *
   * ⚠️ "carne", NÃO "carn". O tutorial da Rebots usa a palavra inteira, e é o que está
   * verificado — cortar uma letra foi economia sem motivo numa busca cujo comportamento a gente
   * não controla. Se ela voltar vazia, a conclusão da cliente é que a permissão não existe. */
  it("manda buscar, e diz o que digitar", () => {
    expect(passosDaProcuracao(PJ).join(" | ")).toContain('Digite "carne" na busca');
  });

  /* ★ O RÓTULO INTEIRO, IGUAL AO DA CAIXA. Ela está comparando texto numa lista de dezenas de
   * serviços: `IRPF - Carnê Leão Web (Cód. 00204)` se reconhece de relance; nome e código
   * separados, em ordem diferente da tela, viram conferência de duas strings parecidas. */
  it("marcar e conferir usam o rótulo exato da tela", () => {
    const p = passosDaProcuracao(PJ);
    const marcar = p.find((x) => x.startsWith("Marque"));
    const conferir = p.find((x) => x.includes("Assinar"));
    expect(marcar).toContain('"IRPF - Carnê Leão Web (Cód. 00204)"');
    expect(conferir).toContain('"IRPF - Carnê Leão Web (Cód. 00204)"');
  });

  /* ★ UMA AÇÃO POR PASSO — a reclamação do Bruno em 25/08/2026, virada em regra.
   *
   * O passo que mais errava carregava CINCO cliques ("Em Serviços, digite … e marque só … — não
   * use Todos"). O teste não consegue julgar clareza, mas consegue prender o sintoma: passo que
   * manda clicar duas vezes tem dois "Clique em". */
  it("nenhum passo empilha dois cliques", () => {
    for (const passo of passosDaProcuracao(PJ)) {
      expect(passo.match(/Clique em/g)?.length ?? 0).toBeLessThan(2);
    }
  });

  /* ⚠️ A ORDEM ESTAVA ERRADA ATÉ 25/08/2026: "escolha a validade" era o quinto passo, DEPOIS dos
   * serviços. Na tela a validade fica na primeira etapa, ao lado da pessoa autorizada — quem
   * seguisse a lista chegava ao fim procurando um campo que já tinha passado. */
  it("a validade vem antes dos serviços, como na tela", () => {
    const p = passosDaProcuracao(PJ);
    const validade = p.findIndex((x) => x.includes("Validade"));
    const servicos = p.findIndex((x) => x.includes("Selecionar Serviços"));
    expect(validade).toBeGreaterThan(-1);
    expect(validade).toBeLessThan(servicos);
  });

  /* O campo se chama "Pessoa Autorizada" e a etapa se chama "Quem". A instrução dizia `Em
   * "Pessoa"` — nome que não bate é nome que se procura. */
  it("nomeia o campo como a tela o nomeia", () => {
    expect(passosDaProcuracao(PJ).join(" | ")).toContain('Em "Pessoa Autorizada"');
  });

  it("mostra o documento formatado, do jeito que ela vai conferir na tela", () => {
    expect(passosDaProcuracao(PJ).join(" | ")).toContain("62.025.689/0001-66");
    expect(passosDaProcuracao("12345678909").join(" | ")).toContain("123.456.789-09");
  });

  it("o nível da conta gov.br está no primeiro passo — prata ou ouro", () => {
    const p = passosDaProcuracao(PJ);
    expect(p[0]).toContain("prata");
    expect(p[0]).toContain("ouro");
  });

  /* ★ O link é 51. Se um dia alguém "unificar" com o do Carnê-Leão, isto quebra aqui. */
  /* ★ ESTE TESTE JÁ PRENDEU A URL ERRADA. Ele exigia `/autenticacao/login/index/51`, tirada da
   * página oficial do gov.br — e o 51 existe, funciona, e leva às procurações do **e-Processo**,
   * que é outro sistema. O link não quebrava: levava ao lugar quase certo, que é pior, porque a
   * pessoa chega numa tela plausível e conclui que ela é que não entendeu.
   *
   * A URL de agora foi percorrida à mão até criar uma autorização de verdade. */
  it("o link é o de Autorizações de Acesso, e não o do e-Processo nem o do Carnê-Leão", () => {
    expect(LINK_PROCURACAO)
      .toBe("https://servicos.receitafederal.gov.br/servico/autorizacoes/minhas-autorizacoes");
    expect(LINK_PROCURACAO).not.toBe(LINK_CARNE_LEAO);
    expect(LINK_PROCURACAO).not.toContain("eprocesso");
    expect(LINK_PROCURACAO).not.toContain("index/51");
    expect(item(comProcuracao("2026-08-01"), "procuracao").link?.url).toBe(LINK_PROCURACAO);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
 * ★ OS DOIS ASSUNTOS DO CHECKLIST
 *
 * Bruno, 25/08/2026: *"na mesma pagina temos nota fiscal, recibos, cadastro de dados etc. NN está
 * legal e até eu que sei do que se trata estou CONFUSO"*.
 *
 * "Seu CPF" é um campo que a gente guarda e conserta num formulário; "Cadastro no Carnê-Leão" é
 * uma tela do site da Receita que ninguém aqui alcança. Enfileirados com o mesmo desenho, os dois
 * viravam a mesma coisa: uma lista de coisas erradas sem dizer de quem é a bola.
 * ═══════════════════════════════════════════════════════════════════════════════ */

describe("★ o checklist parte em dois: o que é campo e o que é instrução", () => {
  const partes = (c: ConfigFiscal) => partesDoChecklist(checklistDoRecibo(c, HOJE));

  it("os três campos vão para 'meus dados'", () => {
    expect(partes(carla()).meusDados.map((i) => i.id)).toEqual(["cpf", "profissao", "registro"]);
  });

  it("o que mora no site da Receita vai para o outro lado", () => {
    expect(partes(carla()).noEcac.map((i) => i.id)).toEqual(["carne_leao", "ensaio"]);
  });

  /* Nenhum item pode sumir na partição: um checklist que perde uma linha no caminho é pior que
   * um checklist confuso — a pendência some da tela e ninguém a resolve. */
  it("junta tudo de volta, sem perder nem duplicar", () => {
    const inteiro = checklistDoRecibo(carla({ procuradorDocumento: PJ }), HOJE);
    const { meusDados, noEcac } = partesDoChecklist(inteiro);
    expect([...meusDados, ...noEcac].map((i) => i.id).sort()).toEqual(inteiro.map((i) => i.id).sort());
  });

  /* ⚠️ O TESTE QUE PRENDE A REGRA CERTA. Tentador seria partir por `estado`: "o que é `falta` vai
   * para o formulário". A autorização vencida também é `falta` e NÃO se resolve com um campo —
   * resolve-se no site da Receita. Estado diz o que está errado; `id` diz de quem é a bola. */
  it("autorização vencida é 'falta' e mesmo assim fica do lado do e-CAC", () => {
    const c = carla({ procuradorDocumento: PJ, procuracaoValidaAte: "2026-01-01", procuracaoAceitaEm: "2025-06-01" });
    const { meusDados, noEcac } = partesDoChecklist(checklistDoRecibo(c, HOJE));

    expect(noEcac.find((i) => i.id === "procuracao")?.estado).toBe("falta");
    expect(meusDados.some((i) => i.id === "procuracao")).toBe(false);
    /* E o contador do formulário continua limpo: os campos dela estão todos preenchidos. */
    expect(faltaNoChecklist(meusDados)).toBe(0);
  });

  /* O registro continua preenchido em `carla()`, então são DOIS — e o número importa: é ele que
   * pinta o bloco de âmbar e escreve "Preencher meus dados" em vez de "Corrigir". */
  it("sem CPF e sem profissão, a pendência é toda do formulário", () => {
    const { meusDados, noEcac } = partes(carla({ prestadorCpf: null, ocupacaoSaude: null }));
    expect(faltaNoChecklist(meusDados)).toBe(2);
    expect(faltaNoChecklist(noEcac)).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
 * ★ O ASSINADOR SERPRO É RESSALVA, NUNCA PASSO
 *
 * Verificado nos dois sentidos em 25/08/2026: a página oficial do gov.br diz que conta prata ou
 * ouro **basta** para cadastrar a autorização; o tutorial da Rebots chama o Assinador Serpro de
 * "requisito essencial" porque o fluxo deles é por certificado digital. As duas coisas são
 * verdade, para públicos diferentes.
 *
 * Como passo 12, ele manda a maioria instalar um programa que não vai usar — e um passo que não
 * se aplica é o que faz alguém abandonar a lista no meio. Omitido, quem assina com certificado
 * clica em "Assinar", **nada acontece**, e não existe nada na tela para procurar.
 * ═══════════════════════════════════════════════════════════════════════════════ */

describe("★ a ressalva do certificado fica fora da lista numerada", () => {
  const outorga = (c: ConfigFiscal) =>
    checklistDoRecibo(c, HOJE).find((i) => i.id === "procuracao");

  const vencida = carla({
    procuradorDocumento: PJ, procuracaoValidaAte: "2026-01-01", procuracaoAceitaEm: "2025-06-01",
  });

  it("o item que mostra os passos também carrega o aviso", () => {
    const i = outorga(vencida);
    expect(i?.passos?.length).toBeGreaterThan(0);
    expect(i?.aviso).toBe(AVISO_ASSINADOR);
  });

  /* O TESTE QUE JUSTIFICA O CAMPO: se um dia alguém "simplificar" jogando o aviso na lista, a
   * instrução volta a mandar todo mundo abrir o Assinador. */
  it("nenhum passo fala do Assinador", () => {
    expect(passosDaProcuracao(PJ).join(" | ")).not.toContain("Assinador");
  });

  it("o aviso diz o que trava, e não só o que instalar", () => {
    expect(AVISO_ASSINADOR).toContain("certificado digital");
    expect(AVISO_ASSINADOR).toContain("Assinar");
  });

  /* Quem não outorgou não tem item nenhum — e portanto nenhum aviso sobre assinar coisa alguma. */
  it("sem procuração, o item não existe", () => {
    expect(outorga(carla())).toBeUndefined();
  });
});

describe("★ faltaParaEmitirRecibo: uma regra só para a Fiscal e o Documento fiscal (1A.13)", () => {
  const ids = (c: ConfigFiscal) => faltaParaEmitirRecibo(c, HOJE).map((f) => f.id);

  /* Era "não bloqueia, decisão aberta" até 08/10/2026: sem a autorização a Rebots não entra no
   * Carnê-Leão dela, e em modo teste o canal fingia sucesso. Ver o cabeçalho da função. */
  it("dados certos mas sem procurador: falta autorizar, e a bola é dela", () => {
    const f = faltaParaEmitirRecibo(carla(), HOJE);
    expect(f.map((x) => [x.id, x.quem])).toEqual([["autorizacao", "voce"]]);
    expect(f[0].frase).toContain("autorizar a MAISA");
    expect(faltaNosDados(f)).toEqual([]);
  });

  it("CPF, profissão e registro, cada um na sua frase", () => {
    expect(ids(carla({ prestadorCpf: null, ocupacaoSaude: null, registroProfissional: "  " }))).toEqual(["cpf", "profissao", "registro", "autorizacao"]);
    expect(faltaParaEmitirRecibo(carla({ registroProfissional: null }), HOJE)[0].frase).toContain("CRP");
  });

  it("autorização vencida bloqueia, com a data, e a bola é dela", () => {
    const f = faltaParaEmitirRecibo(carla({ procuradorDocumento: "62025689000166", procuracaoValidaAte: "2026-08-01", procuracaoAceitaEm: "2026-01-10" }), HOJE);
    expect(f).toEqual([{ id: "autorizacao", quem: "voce", frase: "Sua autorização venceu em 01/08/2026." }]);
  });

  it("autorização esperando o nosso aceite bloqueia, e a bola é nossa", () => {
    const f = faltaParaEmitirRecibo(carla({ procuradorDocumento: "62025689000166", procuracaoValidaAte: "2027-08-01", procuracaoAceitaEm: null }), HOJE);
    expect(f.map((x) => [x.id, x.quem])).toEqual([["autorizacao", "nos"]]);
  });

  it("representada e válida: não bloqueia", () => {
    expect(ids(carla({ procuradorDocumento: "62025689000166", procuracaoValidaAte: "2027-08-01", procuracaoAceitaEm: "2026-08-02" }))).toEqual([]);
  });

  it("faltaNosDados separa o que se resolve num formulário", () => {
    const f = faltaParaEmitirRecibo(carla({ registroProfissional: null, procuradorDocumento: "62025689000166", procuracaoValidaAte: "2026-08-01", procuracaoAceitaEm: "2026-01-10" }), HOJE);
    expect(faltaNosDados(f).map((x) => x.id)).toEqual(["registro"]);
  });
});
