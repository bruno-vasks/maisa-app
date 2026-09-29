/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — ler e ajustar o cadastro do negócio.
 *
 * O que o painel precisa antes de desenhar a primeira tela: quem eu sou, quem atende, o
 * que eu vendo, quem são meus clientes, e quais agendas eu posso operar.
 *
 * Curto de propósito. Não há regra nova aqui — a regra é a `agendasPermitidas`, que já
 * mora no repositório porque é allowlist de autorização e não pode ser recalculada por
 * quem consome. O valor deste arquivo é OUTRO: ele é o lugar onde as telas param de
 * importar `adaptadores/saida/demo` e passam a pedir ao app. Enquanto a leitura era um
 * `import * as D`, cada tela carregava a decisão de onde o dado vem — e por isso trocar
 * fixture por banco era 166 pontos de mudança em 8 arquivos em vez de uma linha em
 * `composicao.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  AjustarCliente,
  CadastrarCliente,
  AjustarNegocio,
  AjustarProfissional,
  AjustarServico,
  CadastroDoNegocio,
  LerCadastro,
  RemoverServico,
} from "../portas/entrada/casos-de-uso";
import type { RepositorioNegocio } from "../portas/saida/repositorio-negocio";
import type { Negocio } from "../dominio/negocio";
import type { Profissional, Servico } from "../dominio/catalogo";
import type { Cliente } from "../dominio/clientes";
import {
  EMAIL_MAX,
  NOME_CLIENTE_MAX,
  NOME_CLIENTE_MIN,
  TELEFONE_MIN_DIGITOS,
  cpfMascarado,
  cpfValido,
  emailPlausivel,
  soDigitos,
} from "../dominio/clientes";
import { NOME_NEGOCIO_MAX, NOME_NEGOCIO_MIN, fotoAceitavel, normalizarNomeDoNegocio } from "../dominio/negocio";
import {
  DURACAO_MAX,
  DURACAO_MIN,
  NOME_PROFISSIONAL_MAX,
  NOME_PROFISSIONAL_MIN,
  NOME_SERVICO_MAX,
  PAPEL_MAX,
  PRECO_MAX,
  ehCategoria,
} from "../dominio/catalogo";
import { colapsarEspaco, temConteudo } from "../dominio/texto";
import { DadoInvalido } from "../dominio/erros";

export function criarLerCadastro(deps: { negocio: RepositorioNegocio }): LerCadastro {
  return async (t): Promise<CadastroDoNegocio> => {
    /* Em paralelo: cinco leituras independentes, nenhuma ordem entre elas e nenhuma
     * transação a respeitar. Em série a latência delas soma, e isto está no caminho da
     * primeira pintura do painel. */
    const [negocio, profissionais, servicos, clientes, agendas] = await Promise.all([
      deps.negocio.negocio(t),
      deps.negocio.profissionais(t),
      deps.negocio.servicos(t),
      deps.negocio.clientes(t),
      deps.negocio.agendasPermitidas(t),
    ]);

    return { negocio, profissionais, servicos, clientes, agendas };
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * AJUSTAR O NEGÓCIO — o nome e, desde 29/09/2026, a foto.
 *
 * ⚠️ Este campo entra no PROMPT do agente a cada mensagem e no texto do lembrete. É por
 * isso que ele valida aqui em vez de deixar o banco reclamar: o `check` de
 * `provisionar_negocio` só cobre o mínimo de 2 caracteres, e não existe teto nenhum na
 * coluna. Sem esta função, `{"nome":"<mil caracteres>"}` seria aceito, gravado, e viraria
 * token pago em toda mensagem daquele inquilino — além de ser o lugar óbvio para escrever
 * instrução dentro de um campo de cadastro.
 *
 * O nome vazio tem tratamento PRÓPRIO, e não cai no mínimo de 2: quem apaga o campo
 * inteiro está tentando limpar, não digitando errado, e a frase precisa dizer isso.
 * Devolver "precisa de 2 caracteres" para um campo em branco manda procurar o problema
 * no que se digitou, quando o problema é o que não se digitou.
 * ────────────────────────────────────────────────────────────────────────────── */
export function criarAjustarNegocio(deps: { negocio: RepositorioNegocio }): AjustarNegocio {
  return async (t, p): Promise<Negocio> => {
    /* A foto (29/09/2026) anda sozinha: a gaveta "Seu negócio" troca a foto sem mandar o nome,
     * e o campo de nome sem mandar a foto. Os dois juntos gravam os dois. */
    if (p?.foto !== undefined) {
      if (p.foto !== null && !fotoAceitavel(p.foto)) {
        throw new DadoInvalido("A foto precisa ser uma imagem JPEG, PNG ou WebP de até 150 KB.", "foto");
      }
      if (p.nome === undefined) return deps.negocio.trocarFoto(t, p.foto);
    }
    if (p?.nome === undefined) throw new DadoInvalido("Nada para mudar.", "nome");

    const nome = normalizarNomeDoNegocio(p.nome);

    if (!nome) {
      throw new DadoInvalido("O negócio precisa de um nome — ele aparece no WhatsApp do cliente.", "nome");
    }
    if (nome.length < NOME_NEGOCIO_MIN) {
      throw new DadoInvalido(`O nome precisa de pelo menos ${NOME_NEGOCIO_MIN} caracteres.`, "nome");
    }
    if (nome.length > NOME_NEGOCIO_MAX) {
      throw new DadoInvalido(`O nome passa de ${NOME_NEGOCIO_MAX} caracteres.`, "nome");
    }

    if (p.foto !== undefined) await deps.negocio.trocarFoto(t, p.foto);
    return deps.negocio.renomear(t, nome);
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * AJUSTAR O CATÁLOGO — serviço e quem atende.
 *
 * A validação mora aqui, e não na rota, por dois motivos concretos:
 *
 * 1. O WIZARD E A TELA DE SERVIÇOS SÃO O MESMO CAMINHO. Regra escrita na rota valeria só
 *    para quem entra por HTTP — e o onboarding, um script de venda assistida e um futuro
 *    import de planilha precisam da mesma recusa.
 * 2. O BANCO JÁ RECUSA, MAS RECUSA FEIO. `duracao between 5 and 480` levanta
 *    `check_violation`, que vira 500 genérico. "O atendimento precisa durar pelo menos 5
 *    minutos" é a mesma regra dita para quem pode consertá-la.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * Aceita número ou string, porque é isto que chega de um `<input type="number">`.
 *
 * ⚠️ NÃO USA `Number()` NEM `parseFloat` DIRETO. `Number("")` é 0 — então um campo de
 * preço apagado viraria serviço grátis, gravado, sem erro. E `parseFloat("12abc")` é 12,
 * o que aceita lixo colado. Aqui, o que não for número inteiro de verdade vira `null`, e
 * quem chama decide a frase.
 *
 * Vírgula decimal é convertida: quem digita preço no Brasil digita "59,90", e recusar
 * isso seria ensinar o dono a formatar número para o banco de dados.
 */
function numeroOuNulo(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function criarAjustarServico(deps: { negocio: RepositorioNegocio }): AjustarServico {
  return async (t, p): Promise<Servico> => {
    const nome = colapsarEspaco(p?.nome);

    if (!temConteudo(nome)) {
      throw new DadoInvalido("Diga o nome do serviço.", "nome");
    }
    if (nome.length > NOME_SERVICO_MAX) {
      throw new DadoInvalido(`O nome passa de ${NOME_SERVICO_MAX} caracteres.`, "nome");
    }

    if (!ehCategoria(p?.categoria)) {
      throw new DadoInvalido("Escolha se é Recorrente, Pacote ou Extra.", "categoria");
    }

    const preco = numeroOuNulo(p?.preco);
    if (preco === null) {
      throw new DadoInvalido("Diga quanto custa — use 0 se for gratuito.", "preco");
    }
    if (preco < 0) {
      throw new DadoInvalido("O preço não pode ser negativo.", "preco");
    }
    if (preco > PRECO_MAX) {
      /* O teto real da coluna é 99.999.999,99. Este é o de TECLADO: quem digita 20000
       * querendo R$ 200,00 precisa ouvir agora, não quando a MAISA anunciar o preço. */
      throw new DadoInvalido("Confira o preço — esse valor parece alto demais.", "preco");
    }

    const duracao = numeroOuNulo(p?.duracao);
    if (duracao === null) {
      throw new DadoInvalido("Diga quantos minutos dura o atendimento.", "duracao");
    }
    if (!Number.isInteger(duracao)) {
      /* A coluna é `integer`. Meia hora e meia (`45.5`) não existe na grade, que anda de
       * 30 em 30 — e um `numeric` mandado para `integer` é erro do Postgres, não
       * arredondamento. Arredondar aqui em silêncio gravaria uma duração que ninguém
       * pediu. */
      throw new DadoInvalido("A duração é em minutos inteiros.", "duracao");
    }
    if (duracao < DURACAO_MIN || duracao > DURACAO_MAX) {
      throw new DadoInvalido(
        `A duração precisa ficar entre ${DURACAO_MIN} minutos e ${DURACAO_MAX / 60} horas.`,
        "duracao",
      );
    }

    return deps.negocio.salvarServico(t, {
      ...(p.id ? { id: p.id } : {}),
      nome,
      categoria: p.categoria,
      preco,
      duracao,
      ...(p.ativo === undefined ? {} : { ativo: p.ativo }),
    });
  };
}

export function criarRemoverServico(deps: { negocio: RepositorioNegocio }): RemoverServico {
  return async (t, id): Promise<void> => {
    /* Recusa antes de tocar o banco, igual ao `RemoverFaq`. Um `delete` com id vazio é
     * pedido malformado, não "não achei" — e no PostgREST um filtro vazio é justamente o
     * tipo de coisa que se quer barrar antes, não depois. */
    if (!String(id ?? "").trim()) {
      throw new DadoInvalido("Diga qual serviço apagar.", "id");
    }
    return deps.negocio.removerServico(t, id.trim());
  };
}

export function criarAjustarProfissional(deps: {
  negocio: RepositorioNegocio;
}): AjustarProfissional {
  return async (t, p): Promise<Profissional> => {
    const nome = colapsarEspaco(p?.nome);

    /* ⚠️ O MÍNIMO É 2, E NÃO 1 COMO O DO SERVIÇO. É o `check` da coluna
     * (`length(btrim(nome)) between 2 and 120`), e existe porque profissional é PESSOA:
     * uma letra é digitação interrompida, enquanto um serviço pode legitimamente se
     * chamar "X". */
    if (!temConteudo(nome) || nome.length < NOME_PROFISSIONAL_MIN) {
      throw new DadoInvalido("Diga o nome de quem atende.", "nome");
    }
    if (nome.length > NOME_PROFISSIONAL_MAX) {
      throw new DadoInvalido(`O nome passa de ${NOME_PROFISSIONAL_MAX} caracteres.`, "nome");
    }

    const papel = p?.papel === undefined ? undefined : colapsarEspaco(p.papel);
    if (papel !== undefined && papel.length > PAPEL_MAX) {
      throw new DadoInvalido(`A função passa de ${PAPEL_MAX} caracteres.`, "papel");
    }

    return deps.negocio.salvarProfissional(t, {
      ...(p.id ? { id: p.id } : {}),
      nome,
      /* Vazio depois de colapsar é o mesmo que não ter mandado — senão um campo que o
       * dono abriu e fechou viraria uma função chamada "" na tela de Equipe. Mesma regra
       * do `profissional` em `provisionar.ts`. */
      ...(papel ? { papel } : {}),
      ...(p.ativo === undefined ? {} : { ativo: p.ativo }),
    });
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * AJUSTAR UM CLIENTE — o terceiro par de escrita do `lerCadastro`.
 *
 * ★ A RECLAMAÇÃO DO BRUNO (24/08/2026) QUE ESTE BLOCO EXISTE PARA CONSERTAR:
 *   *"acabei de perceber que é impossível editar clientes pelo front. não só na aba
 *    clientes mas na faturamento também. quero poder, toda vez que clicar em um cliente,
 *    editar ele."*
 *
 * Ele estava certo, e o buraco tinha a forma de sempre: existia tabela, existia RLS
 * (`clientes` está no grupo uniforme do `003_rls.sql`), existiam duas telas que abriam a
 * gaveta do cliente — e não existia caminho entre elas. O único controle era um
 * liga/desliga que gravava em `db.cliAtivo`, no `localStorage`: o dono tirava alguém do
 * faturamento, via a lista mudar, dava F5, e a pessoa voltava.
 *
 * ── DOIS CAMPOS SÃO MAIS QUE CADASTRO ──
 *
 * `telefone` é IDENTIDADE: a coluna gerada `telefone_chave` (8 últimos dígitos) é por onde
 * `clientePorTelefone` reconhece quem está falando no WhatsApp. Digitado errado, a MAISA
 * trata cliente antigo como desconhecido — e até aqui só SQL consertava.
 *
 * ⚠️ E MESMO ASSIM ESTE CASO DE USO NÃO RECUSA TELEFONE REPETIDO. A primeira versão
 * recusava, com uma leitura antes de escrever, e estava errada: o repositório já decidiu o
 * contrário, por escrito, e a decisão é mais velha que esta tela. A coluna não tem `unique`
 * "de propósito: número repetido acontece em família" — e `clientePorTelefone` resolve a
 * ambiguidade pegando o cadastro mais ANTIGO, deterministicamente. Bloquear aqui criaria
 * uma segunda regra por cima dessa, e o preço seria alto: qualquer cliente que já
 * compartilhe número com um parente ficaria impossível de editar, inclusive para trocar o
 * nome ou sair do faturamento. Quem avisa que dois clientes dividem o número é a GAVETA,
 * que tem o cadastro inteiro em mãos e pode dizer isso sem impedir nada.
 *
 * `cpf` é o que LIBERA A NOTA. Sem ele a prefeitura recusa, e o `emitiveis` da tela de
 * Faturamento tira a pessoa do lote de propósito. A tela dizia "sem CPF — a prefeitura
 * recusa sem ele" e não oferecia onde escrever o CPF; agora oferece, e o dígito
 * verificador é conferido aqui — o mesmo `cpfValido` que nasceu de um erro real do e-CAC
 * em 21/08/2026, e pelo mesmo motivo: erro de digitação descoberto na prefeitura é erro
 * descoberto longe de quem digitou.
 *
 * ⚠️ MAS SÓ QUANDO O CPF VEM NO PEDIDO. É por isso que ele é opcional aqui e que quem
 * chama manda só o que mexeu: os 17 clientes que `008_seed_bruno.sql` semeia têm CPF
 * INVENTADO, e 15 deles não fecham no módulo 11. Se um pedido que só liga/desliga o cliente
 * carregasse o CPF atual junto, a recusa deste bloco travaria a edição de quase todo o
 * cadastro — com uma frase sobre dígito verificador para quem só queria desativar alguém.
 * ────────────────────────────────────────────────────────────────────────────── */
export function criarAjustarCliente(deps: { negocio: RepositorioNegocio }): AjustarCliente {
  return async (t, p): Promise<Cliente> => {
    const id = String(p?.id ?? "").trim();
    if (!id) {
      /* Recusa antes de tocar o banco, igual ao `RemoverServico`: id vazio é pedido
       * malformado, não "não achei" — e este caso de uso NÃO CRIA, então um id ausente
       * nunca significa "cadastre um novo". Quem cria é `garantirCliente`. */
      throw new DadoInvalido("Diga qual cliente editar.", "id");
    }

    const nome = colapsarEspaco(p?.nome);
    if (!temConteudo(nome) || nome.length < NOME_CLIENTE_MIN) {
      throw new DadoInvalido("Diga o nome do cliente.", "nome");
    }
    if (nome.length > NOME_CLIENTE_MAX) {
      throw new DadoInvalido(`O nome passa de ${NOME_CLIENTE_MAX} caracteres.`, "nome");
    }

    /* O telefone guardado é o TEXTO como a pessoa escreveu — a coluna é assim de propósito
     * ("(11) 98123-4567"), e quem compara é a coluna gerada. Aqui só se colapsa espaço e
     * se conta DÍGITO: o `check` do banco mede caracteres, então "(11) 9" passaria lá com
     * seis dígitos e viraria uma chave de telefone de seis. Vazio vale desde 24/09/2026:
     * cliente cadastrado à mão só com nome e CPF tem que continuar editável na gaveta. */
    const telefone = telefoneOpcional(p?.telefone);

    /* ── os opcionais: `undefined` é "não mexe", `null` é "apaga" ──
     *
     * A distinção é o que faz "desativar o cliente" ser um pedido diferente de "trocar o
     * CPF do cliente". Sem ela existiria um pedido só — o cliente inteiro — e ele carregaria
     * o CPF semeado inválido em toda escrita, fazendo o bloco do CPF recusar edições que
     * nem tocam CPF. Quem chama manda o que mexeu; ver o `mexerNoCliente` no store. */

    const email = p?.email === undefined ? undefined : limparEmail(p.email);
    if (typeof email === "string" && !emailPlausivel(email)) {
      throw new DadoInvalido("Esse e-mail está incompleto — confira o @ e o domínio.", "email");
    }
    if (typeof email === "string" && email.length > EMAIL_MAX) {
      throw new DadoInvalido(`O e-mail passa de ${EMAIL_MAX} caracteres.`, "email");
    }

    let cpf: string | null | undefined;
    if (p?.cpf !== undefined) {
      const bruto = colapsarEspaco(p.cpf);
      if (!bruto) {
        cpf = null;
      } else {
        /* Confere o DÍGITO VERIFICADOR, não o tamanho. Ver o bloco de `cpfValido` em
         * `dominio/clientes.ts`: o primeiro lote do Receita Saúde voltou reprovado do
         * e-CAC com CPFs de onze dígitos que não fechavam no módulo 11. */
        if (!cpfValido(bruto)) {
          throw new DadoInvalido("Esse CPF não fecha na conta do dígito — confira os números.", "cpf");
        }
        /* Guarda mascarado. A grafia livre ("12345678909" ou "123.456.789-09") deixaria o
         * mesmo documento com duas caras na coluna; quem emite aplica `soDigitos` de
         * qualquer jeito, então o formato guardado é o que a tela mostra sem traduzir. */
        cpf = cpfMascarado(bruto);
      }
    }

    if (p?.canal !== undefined && p.canal !== "Online" && p.canal !== "Presencial") {
      /* O `check` da coluna só conhece dois. Deixar passar daria `check_violation` — 500
       * genérico para quem só escolheu numa lista. */
      throw new DadoInvalido("O atendimento é Online ou Presencial.", "canal");
    }

    /* Serviço habitual: string vazia é o `""` que o `<select>` manda quando o dono escolhe
     * "nenhum", e vira `null` (a FK é `on delete set null`, então nulo é estado legítimo).
     *
     * ⚠️ NÃO CONFERE se o serviço é deste inquilino, e isso é deliberado: a FK
     * `clientes.servico_id → servicos.id` recusa id que não existe, e a RLS impede
     * enxergar serviço de outro negócio para saber o id. Uma checagem aqui seria uma
     * segunda cópia da autorização, que é o que este repositório evita. */
    const servicoId = p?.servicoId === undefined
      ? undefined
      : (colapsarEspaco(p.servicoId) || null);

    const valorSessao = p?.valorSessao === undefined || p.valorSessao === null
      ? p?.valorSessao
      : Number(p.valorSessao);
    if (typeof valorSessao === "number" && (!Number.isFinite(valorSessao) || valorSessao < 0 || valorSessao > 100_000)) {
      throw new DadoInvalido("O valor da sessão precisa ser um número entre 0 e 100 mil.", "valorSessao");
    }

    return deps.negocio.atualizarCliente(t, {
      id,
      nome,
      telefone,
      ...(email === undefined ? {} : { email }),
      ...(cpf === undefined ? {} : { cpf }),
      ...(p.canal === undefined ? {} : { canal: p.canal }),
      ...(servicoId === undefined ? {} : { servicoId }),
      ...(p.ativo === undefined ? {} : { ativo: p.ativo }),
      ...(valorSessao === undefined ? {} : { valorSessao }),
    });
  };
}

/**
 * Cria um cliente a partir do botão "Novo cliente" da tela Clientes.
 *
 * Só o nome é obrigatório — ver `CadastrarCliente`. Telefone e CPF, quando vêm, passam pela
 * MESMA régua do `ajustarCliente` (`telefoneOpcional`, `cpfOpcional`), para que criar e
 * editar recusem as mesmas coisas.
 *
 * Com telefone, deduplica pelo `clientePorTelefone` antes de criar — a mesma chave que o
 * agente usa, então a tela e o WhatsApp não fazem a mesma pessoa duas vezes. Achou alguém,
 * devolve esse alguém e não reescreve nada: quem manda no cadastro existente é a gaveta.
 */
export function criarCadastrarCliente(deps: { negocio: RepositorioNegocio }): CadastrarCliente {
  return async (t, p) => {
    const nome = colapsarEspaco(p?.nome);
    if (!temConteudo(nome) || nome.length < NOME_CLIENTE_MIN) {
      throw new DadoInvalido("Diga o nome do cliente.", "nome");
    }
    if (nome.length > NOME_CLIENTE_MAX) {
      throw new DadoInvalido(`O nome passa de ${NOME_CLIENTE_MAX} caracteres.`, "nome");
    }
    const telefone = telefoneOpcional(p?.telefone);
    const cpf = cpfOpcional(p?.cpf);

    if (telefone) {
      const existente = await deps.negocio.clientePorTelefone(t, telefone);
      if (existente) return { cliente: existente, jaExistia: true };
    }
    const cliente = await deps.negocio.criarCliente(t, { nome, telefone, cpf });
    return { cliente, jaExistia: false };
  };
}

/**
 * Vazio é "não tem telefone" e vira `""`; de 1 a 7 dígitos é número pela metade.
 *
 * Opcional desde 24/09/2026 (migração 029). Antes era obrigatório porque todo cliente
 * nascia pelo WhatsApp; cadastrado à mão, ele pode existir só para o recibo.
 */
function telefoneOpcional(bruto: string | null | undefined): string {
  const telefone = colapsarEspaco(bruto);
  const d = soDigitos(telefone).length;
  if (d === 0) return "";
  if (d < TELEFONE_MIN_DIGITOS) {
    throw new DadoInvalido(
      "O telefone precisa dos 8 dígitos do número, com DDD — é por ele que a MAISA reconhece quem está falando no WhatsApp.",
      "telefone",
    );
  }
  return telefone;
}

/** Vazio é `null`; o resto tem que fechar no dígito verificador, e é guardado mascarado. */
function cpfOpcional(bruto: string | null | undefined): string | null {
  const t = colapsarEspaco(bruto);
  if (!t) return null;
  if (!cpfValido(t)) {
    throw new DadoInvalido("Esse CPF não fecha na conta do dígito — confira os números.", "cpf");
  }
  return cpfMascarado(t);
}

/** `""` (ou só espaço) vira `null` — "apaga o e-mail", não "grava vazio". */
function limparEmail(bruto: string | null): string | null {
  const t = colapsarEspaco(bruto);
  return t === "" ? null : t;
}
