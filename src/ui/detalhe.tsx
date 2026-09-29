"use client";
/* MAISA — o que a Gaveta mostra.
 *
 * A regra do app: todo cartão é curto (nome, uma linha de contexto, um estado) e
 * o detalhe vive na Gaveta. Este arquivo é a tradução de um ID para esse detalhe.
 *
 * Um id → um Detalhe. O prefixo do id diz a entidade:
 *   cl…    cliente          nf-cl…  nota fiscal do cliente
 *   pr…    profissional     sv…     serviço do catálogo
 *   cv…    conversa         ag…     agendamento de hoje
 *   faq | plano | numeros   cartões da tela "Mais"
 *
 * Só existe ação aqui que o app REALMENTE executa. Nada de "Salvar alterações"
 * em formulário que não salva: onde não há edição de verdade, o bloco é leitura
 * (stats) e o rodapé traz navegação real (abrir conversa, ver na agenda, emitir). */

import * as D from "@/adaptadores/saida/demo";
import { fmt } from "@/ui/primitivos";
import { resumoDaAssinatura, useStore } from "@/ui/estado/store";
import { rotuloDeISO, horaDeISO } from "@/nucleo/dominio/tempo";
import { semConfirmacao } from "@/ui/estado/leitura";
import { resumoDaJornada } from "@/ui/componentes/JornadaDeAtivacao";
import { ENTRAR } from "@/ui/componentes/EstadoDeLeitura";
import { escolhaFeita } from "@/ui/telas/DocumentoFiscal";

/* ───────────────────────────── tipos de bloco ───────────────────────────── */

/** Sem `seed`, o item diz o próprio `icone` (ou fica sem); `feito` desenha o visto verde. */
export type ItemLista = { id: string; nome: string; sub: string; seed?: string; icone?: string; feito?: boolean; onClick?: () => void };

/** Campo editável da Gaveta. Sem botão "Salvar": grava a cada mudança, como os ajustes da MAISA
 *  já fazem. Um save que só pisca um check é exatamente o botão morto que este app evita. */
export type Campo = {
  id: string;
  label: string;
  valor: string;
  /** `numero` recebe inputMode numérico; `select` exige `opcoes`. */
  tipo?: "texto" | "numero" | "select";
  opcoes?: string[];
  hint?: string;
  /** Rótulo visível de cada opção do select (o valor é o id). */
  rotuloOpcao?: (v: string) => string;
  prefixo?: string;
  sufixo?: string;
  /**
   * Guarda o texto enquanto a pessoa digita e só chama `onChange` no blur e no Enter.
   * Para número que o store converte e limita (preço, duração, valor da ficha): converter a
   * cada tecla transformava o "3" de "30" em 5 e o "30" em 50 (08 P0-1). Ver `CampoDeTexto`.
   */
  gravaAoSair?: boolean;
  /** Com `gravaAoSair`, devolver `false` diz que o texto não foi aceito (não é número): a gaveta
   *  não confirma "atualizado" e avisa que ficou como estava. */
  onChange: (v: string) => void | boolean;
};

export type Bloco =
  /** Pares label/valor em duas colunas — ficha de leitura. */
  | { tipo: "stats"; key: string; label?: string; linhas: [string, string][] }
  /** Campos editáveis — grava direto, sem botão de salvar.
   *  `avisoAoSair` é o toast que sai no blur; sem ele, o campo grava calado. Ver `Gaveta`. */
  | { tipo: "campos"; key: string; label?: string; campos: Campo[]; avisoAoSair?: string }
  /** Chips de leitura; `on` destaca o que está ativo. */
  | { tipo: "chips"; key: string; label?: string; chips: { label: string; on?: boolean }[] }
  /** Parágrafo de contexto em caixa. */
  | { tipo: "texto"; key: string; label?: string; texto: string }
  /** Nota de rodapé: pequena e apagada, sem caixa nem rótulo (ver `Nota` na Gaveta). */
  | { tipo: "nota"; key: string; texto: string }
  | { tipo: "toggles"; key: string; label?: string; toggles: { titulo: string; desc: string; on: boolean; alternar: () => void }[] }
  /** Trecho de conversa de WhatsApp. */
  | { tipo: "msgs"; key: string; label?: string; msgs: D.Msg[] }
  | { tipo: "aviso"; key: string; texto: string; tone?: "warn" | "danger" }
  /** Prévia da NFS-e, no formato de recibo. */
  | { tipo: "recibo"; key: string; label?: string; recibo: Recibo }
  /** Lista de pessoas/itens navegáveis. */
  | { tipo: "lista"; key: string; label?: string; itens: ItemLista[] };

export type Recibo = {
  prestador: string;
  doc: string;
  linhas: [string, string][];
  total: string;
};

/** Um botão do rodapé da gaveta. Nunca destrutivo: o que apaga mora em `mais` (ver `AcaoDestrutiva`). */
export type Acao = {
  /** Desabilita a ação — usada quando falta preencher algo. */
  desabilitada?: boolean;
  label: string;
  primaria?: boolean;
  tone?: undefined;
  onClick?: () => void;
};

/**
 * ⚠️ O QUE APAGA PEDE DOIS TOQUES, E SÓ EXISTE NO MENU "Mais ações" (25/09/2026, T6).
 *
 * O primeiro toque não faz nada no mundo: guarda `confirmar.chave` em `st.cancelarPedido`, e a
 * gaveta troca o rodapé por "Voltar" + `confirmar.rotulo`, com `confirmar.aviso` colado em cima,
 * fora da região que rola (o "Não dá para desfazer" ficava rolado para fora da vista). O segundo
 * toque chama `onClick`. Abrir outra coisa, fechar ou trocar de tela descarta o pedido (o
 * mecanismo é o do cancelar atendimento, `store.tsx`, `abrir`/`fechar`/`irPara`).
 *
 * O tipo é o guarda (G8): `tone: "danger"` exige `confirmar`, e `Detalhe.acoes` não aceita
 * `AcaoDestrutiva`, então o `tsc` reprova o botão vermelho solto no rodapé.
 */
export type AcaoDestrutiva = {
  label: string;
  tone: "danger";
  desabilitada?: boolean;
  confirmar: {
    /** Identifica o pedido no store. Única por gaveta e por coisa (`excluir:sv3`, o id do atendimento). */
    chave: string;
    /** Rótulo do segundo toque: "Confirmar cancelamento". */
    rotulo: string;
    /** O que acontece, dito antes: fica fixo acima do rodapé. */
    aviso: string;
  };
  onClick: () => void;
};

/** No máximo dois botões no rodapé (01 C6, contradição C1). O resto vai para `mais`. */
export type Rodape = readonly [] | readonly [Acao] | readonly [Acao, Acao];

export type Detalhe = {
  titulo: string;
  sub: string;
  /** Uma linha de estado FIXA, logo abaixo do cabeçalho, fora da rolagem (a ficha do cliente diz
   *  se a MAISA responde a ele, 1B.11). Forma + rótulo; `acao` ao lado. */
  faixa?: { forma: "disco" | "anel" | "triangulo"; tom: "success" | "warn" | "neutral"; texto: string; acao?: Acao };
  /** Semente do monograma. Ausente = cabeçalho sem avatar. */
  seed?: string;
  blocos: Bloco[];
  /**
   * ⚠️ TUPLA DE PROPÓSITO (T6, G8): com três botões soltos o rodapé cortava o terceiro a 390px
   * e a 680px (`casca5.mjs`). Sem ação real, `[]`: a gaveta fica sem rodapé e fecha pelo X. Não
   * existe mais "Fechar" como ação — era o primário azul de gaveta que não tinha o que fazer.
   */
  acoes: Rodape;
  /** O menu "Mais ações": o que não cabe nos dois, e todo destrutivo. */
  mais?: readonly (Acao | AcaoDestrutiva)[];
};

/** Monta o rodapé de até dois, pulando o que não se aplica. Dois parâmetros, e não uma lista:
 *  um terceiro botão não compila. */
export function rodape(a?: Acao | null | false, b?: Acao | null | false): Rodape {
  const x = a || null;
  const y = b || null;
  if (x && y) return [x, y];
  if (x) return [x];
  if (y) return [y];
  return [];
}

/* ───────────────────────────── hook ───────────────────────────── */

export function useDetalhe(id: string | null): Detalhe | null {
  const st = useStore();
  if (!id) return null;

  /**
   * O que dizer embaixo do campo de CPF.
   *
   * O CPF só vai ao servidor completo (ver `emDigitacao`, no store), e um campo que grava
   * calado precisa dizer que ainda não gravou — senão o dono digita metade, sai da gaveta e
   * acha que salvou. A frase conta os dígitos que faltam em vez de dizer "incompleto":
   * quem colou um CPF truncado não sabe quanto falta.
   */
  const dicaDeCpf = (cpf: string, completo: string): string => {
    const d = D.soDigitos(cpf);
    /* A frase do documento que ESTE negócio emite (28/09/2026, regressão 6): a da prefeitura
     * aparecia também para quem emite recibo do Receita Saúde, que não passa por prefeitura. */
    if (d.length === 0) {
      return st.fiscal.caminho === "recibo_saude"
        ? "Sem CPF o recibo do Receita Saúde não sai, e este cliente fica fora do arquivo."
        : st.fiscal.status === "ok" && escolhaFeita(st.fiscal.config ?? null) !== null
          ? "A prefeitura recusa a nota sem CPF, e sem ele este cliente fica fora do lote."
          : "Sem CPF este cliente fica fora da emissão do mês.";
    }
    if (d.length < 11) return `Faltam ${11 - d.length} dígitos. Só salvo quando o CPF estiver completo.`;
    return completo;
  };

  /**
   * Alguém MAIS tem este telefone?
   *
   * Aviso, nunca bloqueio: a coluna não tem `unique` de propósito ("número repetido
   * acontece em família"), e `clientePorTelefone` desempata pelo cadastro mais ANTIGO. Quem
   * divide o número com um parente continua editável — o que não pode é o dono não saber
   * que a MAISA vai reconhecer o outro. A gaveta é o lugar do aviso porque só ela tem o
   * cadastro inteiro em mãos.
   */
  const divideTelefone = (cli: D.Cliente): string | null => {
    const chave = D.soDigitos(cli.telefone).slice(-8);
    if (chave.length < 8) return null;
    const outro = st.cadastro.clientes.find(
      (x) => x.id !== cli.id && D.soDigitos(x.telefone).slice(-8) === chave,
    );
    return outro ? outro.nome : null;
  };

  /* Abre a conversa do cliente na tela de Conversas, se existir uma. Do store: hoje é uma
     conversa de WhatsApp de verdade, e quem tem uma é quem já escreveu. */
  const conversaDoCliente = (clienteId: string) => st.conversas.find((c) => c.clienteId === clienteId);
  const irParaConversa = (cvId: string) => () => { st.selecionarConversa(cvId); st.irPara("conversas"); };

  /* ── um compromisso da agenda do Google que não é atendimento ──
   * Vem ANTES de todo o resto por causa do prefixo: `bloq:` é o único id do app com
   * dois-pontos, e a cascata abaixo despacha por "tenta até dar verdadeiro". Um
   * `bloq:abc` cairia lá embaixo em `agendamentoPorId`, não acharia nada e abriria a
   * gaveta vazia. Prefixo explícito, decidido no topo. */
  if (id.startsWith("bloq:")) {
    const b = st.bloqueioPorId(id);
    if (!b) return null;
    return {
      titulo: b.titulo,
      sub: `${D.rotuloLongo(b.data)}, ${D.hhmm(b.inicio)} – ${D.hhmm(b.fim)}`,
      blocos: [
        {
          tipo: "stats", key: "d", label: "Compromisso",
          linhas: [
            ["Quando", `${D.rotuloDia(b.data)}, ${D.hhmm(b.inicio)} – ${D.hhmm(b.fim)}`],
            ["Duração", `${b.duracao} min`],
            ["Origem", b.profissionalId && b.profissionalId !== st.pidAgenda
              ? `agenda do Google de ${D.primeiroNome(st.nomeDoProfissional(b.profissionalId))}`
              : "sua agenda do Google"],
            ...(b.recorrente ? ([["Repetição", "evento que se repete"]] as [string, string][]) : []),
          ],
        },
        {
          tipo: "texto", key: "o", label: "Por que está aqui",
          // O usuário precisa entender por que um bloco que ele não criou ocupa a agenda,
          // e por que ele não consegue arrastar. Sem esta frase, "não mexe" lê como bug.
          texto: "Este horário está ocupado na sua agenda do Google, então a MAISA não o oferece a nenhum cliente. Ele é só leitura aqui — para mudar ou apagar, use o Google Calendar.",
        },
      ],
      acoes: rodape(
        !!b.meetLink && { label: "Entrar no Meet", primaria: true, onClick: () => window.open(b.meetLink!, "_blank", "noopener") },
        !!b.htmlLink && { label: "Abrir no Google Calendar", primaria: !b.meetLink, onClick: () => window.open(b.htmlLink!, "_blank", "noopener") },
      ),
    };
  }

  /* ── nota fiscal ── */
  if (id.startsWith("nf-")) {
    const clienteId = id.slice(3);
    /* ⚠️ A LINHA DE FATURAMENTO, e não o cadastro do cliente. `clienteDe().valor` é o total
     * da COMPETÊNCIA; o que se emite é o que está sem nota — "desde a última emissão". Ler o
     * cadastro aqui mostraria na prévia um valor diferente do que a nota vai levar. */
    const linha = st.fechamento.find((f) => f.id === clienteId);
    const cad = st.clienteDe(clienteId);
    const c = linha ?? (cad ? {
      id: cad.id, nome: cad.nome, valor: 0, atendimentos: 0, cpf: cad.cpf,
      teste: cad.teste === true, servicoId: cad.servicoId, canal: cad.canal,
      servico: null, semCpf: !cad.cpf,
    } : null);
    if (!c) return null;
    const nota = st.notaDe(c.id);
    /* O mês da linha, quando o servidor o mandou; senão o do fechamento inteiro. */
    const mesDaLinha = "competencia" in c && c.competencia && /^\d{4}-\d{2}/.test(c.competencia)
      ? D.rotuloDoMes(c.competencia)
      : st.mesDoFechamento;

    /* ── QUEM É O TOMADOR, EDITÁVEL AQUI (24/08/2026) ──
     *
     * Bruno: *"é impossível editar clientes pelo front. não só na aba clientes mas na
     * faturamento também."* A metade do faturamento é esta, e ela tem uma razão própria
     * além da simetria: **sem CPF a prefeitura recusa a nota**, e por isso o `emitiveis`
     * tira a pessoa do lote. A tabela escrevia "sem CPF — não entra no lote", a gaveta
     * repetia em `stats`, e não havia onde escrever o CPF. Aviso sem porta — o mesmo
     * defeito que fez a tela de Contatos nascer em 17/08.
     *
     * São DOIS campos e não a ficha inteira: nome e CPF são o que identifica o tomador no
     * documento. Canal, e-mail e serviço habitual não mudam nota nenhuma, e ficam onde
     * sempre estiveram — na ficha, a um clique pela ação do rodapé.
     *
     * ⚠️ Só quando `cad` existe. Uma linha de faturamento pode vir de cliente que não está
     * no cadastro (nota antiga cujo cliente foi apagado), e um campo apontando para um id
     * que o `PARECE_UUID` do adaptador recusa gravaria em ninguém, calado. */
    const dadosDoTomador: Bloco[] = cad ? [{
      tipo: "campos", key: "tomador", label: "Dados do tomador",
      avisoAoSair: "Cliente atualizado",
      campos: [
        {
          id: "nome", label: "Nome", valor: cad.nome,
          onChange: (v) => st.editarCliente(cad.id, { nome: v }),
        },
        {
          id: "cpf", label: "CPF", valor: cad.cpf,
          hint: dicaDeCpf(cad.cpf, "Confira antes de emitir — depois só cancelando."),
          onChange: (v) => st.editarCliente(cad.id, { cpf: v }),
        },
      ],
    }] : [];

    /* ── QUEM EMITE, DO QUE O FISCAL LEU (25/09/2026, T5 e 01 P0-6) ──
     * A prévia escrevia `D.PRESTADOR` ("Seu Negócio — Atendimentos", um CNPJ de fixture) para
     * todo mundo, logo acima do botão que emite de verdade. Agora é a razão social e o CNPJ de
     * `st.fiscal.config`; sem os dois, a prévia diz que falta e o "Emitir" desliga com o aviso. */
    const cfgFiscal = st.fiscal.config;
    const emissor = cfgFiscal?.razaoSocial && cfgFiscal.cnpj
      ? { nome: cfgFiscal.razaoSocial, doc: `CNPJ ${cfgFiscal.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` }
      : null;
    /* E o que o servidor diz que falta (`fiscalFaltando`, o certificado, por exemplo): a mesma
     * regra do hero do Fiscal (1A.12), para a gaveta não emitir o que a tela desligou. */
    const faltaFiscal = st.fiscal.status === "ok" ? st.fiscal.falta : [];
    const bloqueio = !emissor
      ? "Confirme seus dados de emissor (razão social e CNPJ) no Documento fiscal antes de emitir."
      : faltaFiscal.length
        ? `Falta ${faltaFiscal.join(", ")} para emitir. Resolva no Documento fiscal.`
        : null;
    const semEmissor: Bloco[] = bloqueio ? [{ tipo: "aviso", key: "sem-emissor", tone: "warn", texto: bloqueio }] : [];

    const recibo: Bloco = {
      tipo: "recibo", key: "recibo", label: "Prévia da nota",
      recibo: {
        prestador: emissor?.nome ?? "Confirme seus dados de emissor",
        doc: emissor?.doc ?? "",
        total: fmt(c.valor),
        linhas: [
          ["Tomador", c.nome],
          /* O CPF do CADASTRO na frente do da linha de faturamento, ao contrário do valor
             logo acima. O motivo do valor vir da linha é dinheiro ("desde a última
             emissão"); o CPF não tem essa natureza — a nota lê o cadastro na transação da
             emissão, então o cadastro É a prévia mais fiel. E é o que faz o campo editável
             acima e esta prévia concordarem na mesma tecla, em vez de esperar o recarregar
             do faturamento. */
          ["CPF", cad?.cpf || c.cpf],
          ["Serviço", c.servico ?? st.nomeServico(c.servicoId)],
          ["Atendimentos sem nota", String(c.atendimentos)],
          ["Competência", mesDaLinha],
          ["Número", nota.numero ?? "sai na emissão"],
        ],
      },
    };

    /* O atalho para o resto da ficha. Existe em TODAS as faixas da nota, inclusive na
     * emitida: o e-mail ou o telefone estarem errados não muda o documento que já saiu, e é
     * na tela de Faturamento que o dono repara nisso. `abrir` troca o id da gaveta — a de
     * cliente abre no lugar desta, sem passar pela lista. */
    const abrirFicha: Acao | null = cad
      ? { label: "Abrir ficha do cliente", onClick: () => st.abrir(cad.id) }
      : null;

    if (nota.status === "emitida") {
      return {
        titulo: c.nome, seed: c.id,
        sub: `Nota ${nota.numero} · emitida em ${nota.data}`,
        blocos: [
          recibo,
          {
            tipo: "texto", key: "st", label: "Situação",
            texto: nota.simulada
              ? "Emitida em modo simulado — o servidor de notas está sem credencial da prefeitura, então o número foi gerado aqui. Assim que a credencial entrar, a emissão é real sem mudar nada nesta tela."
              : "Nota autorizada pela prefeitura e enviada ao cliente pelo WhatsApp. Para corrigir algo, cancele e emita de novo.",
          },
          ...(nota.erro ? [{ tipo: "aviso", key: "er", texto: nota.erro, tone: "danger" } as Bloco] : []),
        ],
        acoes: rodape(
          !!nota.pdf && { label: "Baixar PDF", primaria: true, onClick: () => window.open(nota.pdf, "_blank", "noopener") },
          abrirFicha,
        ),
        /* Pela REF, e não pelo cliente: a partir do segundo mês um cliente tem VÁRIAS notas,
           e cancelar "a nota do cliente" cancelaria a errada. Cancelar vai à prefeitura: dois
           toques, como todo destrutivo (T6). */
        mais: nota.ref ? [{
          label: "Cancelar nota", tone: "danger",
          confirmar: {
            chave: `cancelar-nota:${nota.ref}`,
            rotulo: "Confirmar cancelamento",
            aviso: `${nota.numero ? `Cancelar a nota ${nota.numero}` : "Cancelar esta nota"} avisa a prefeitura na hora. Não dá para desfazer: para corrigir, emita outra depois.`,
          },
          onClick: () => st.cancelarNota(nota.ref!),
        }] : undefined,
      };
    }

    if (nota.status === "processando") {
      return {
        titulo: c.nome, seed: c.id, sub: "Enviada à prefeitura",
        blocos: [
          recibo,
          { tipo: "texto", key: "st", label: "Situação", texto: "A prefeitura está processando. O número aparece aqui em alguns minutos." },
        ],
        /* Sem os campos do tomador AQUI, de propósito: a nota está em voo, e um CPF
           trocado no meio do caminho não entra nela — o documento já foi montado. Ver o
           bloco `dadosDoTomador`. O atalho para a ficha fica, para depois. */
        acoes: rodape(abrirFicha),
      };
    }

    if (nota.status === "cancelada") {
      return {
        titulo: c.nome, seed: c.id,
        sub: nota.numero ? `Nota ${nota.numero} cancelada` : "Nota cancelada",
        blocos: [
          { tipo: "texto", key: "st", label: "Situação", texto: "Esta nota foi cancelada. O valor do mês continua fechado, então você pode emitir de novo quando quiser." },
          /* Antes do recibo: quem cancelou uma nota costuma ter cancelado JUSTAMENTE porque
             o tomador estava errado, e "emitir de novo" sem corrigir repete o erro. */
          ...dadosDoTomador,
          ...semEmissor,
          recibo,
        ],
        acoes: rodape(
          { label: "Emitir de novo", primaria: true, desabilitada: !!bloqueio, onClick: () => { st.emitirNota(c.id); st.fechar(); } },
          abrirFicha,
        ),
      };
    }

    // pendente ou erro
    return {
      /* O nome do CADASTRO no título, e não o da linha de faturamento: enquanto o dono
         digita, `linha.nome` é o que o servidor tinha antes do primeiro caractere — o
         cabeçalho ficaria brigando com o campo logo abaixo até o envio pousar. */
      titulo: cad?.nome || c.nome, seed: c.id, sub: `Fechamento de ${mesDaLinha}`,
      blocos: [
        /* O que falta para poder emitir vem ANTES de tudo. Sem CPF o `emitiveis` tira a
           pessoa do lote, então o botão "Emitir as N pendentes" simplesmente não a conta —
           e sem esta frase o dono não tem como saber por que ela ficou de fora. */
        /* ⚠️ A CONDIÇÃO É `c.cpf` — O QUE O SERVIDOR TEM — e não o `cad.cpf` otimista que o
           campo abaixo mostra. É a mesma pergunta que o `emitiveis` faz para montar o lote,
           então o aviso e o botão concordam com quem de fato decide. Com o valor otimista, um
           CPF pela metade (que não foi salvo, e nem vai ser até estar completo) apagaria o
           aviso e liberaria o botão — e a recusa viria da prefeitura. */
        ...(!c.cpf
          ? [{
            tipo: "aviso" as const, key: "sem-cpf", tone: "warn" as const,
            texto: "A prefeitura recusa a nota sem o CPF do tomador, então este cliente fica fora do lote. Preencha abaixo — assim que o CPF estiver salvo, ele entra.",
          }]
          : []),
        {
          tipo: "stats", key: "conf", label: "Confira antes de emitir",
          /* O CPF saiu daqui e virou campo logo abaixo — mesmo dado em dois blocos vizinhos,
             um editável e um não, é a hora em que o dono digita no que não grava. */
          linhas: [
            ["Valor da nota", fmt(c.valor)],
            ["Atendimentos", String(c.atendimentos)],
            ["Serviço prestado", st.nomeServico(c.servicoId)],
          ],
        },
        ...semEmissor,
        ...dadosDoTomador,
        recibo,
        nota.status === "erro" && nota.erro
          ? { tipo: "aviso", key: "er", texto: nota.erro, tone: "danger" }
          : c.teste
            ? {
              tipo: "aviso", key: "av",
              texto: `Tomador de teste da integração fiscal. A nota é emitida de verdade na prefeitura e cancelada automaticamente ${Math.round(D.TESTE_CANCELA_APOS_MS / 1000)}s depois — nunca fica documento em pé.`,
            }
            : { tipo: "aviso", key: "av", texto: "Emitir é irreversível: a nota vai para a prefeitura na hora. Para corrigir depois, só cancelando." },
      ],
      acoes: rodape(
        {
          label: nota.status === "erro" ? "Tentar de novo" : "Emitir nota",
          primaria: true,
          /* Desabilitado sem CPF em vez de deixar clicar e falhar. A prefeitura recusaria de
             qualquer jeito, e o erro voltaria como frase de provedor — longe do campo que
             resolve, que agora está nesta mesma gaveta. `c.cpf` e não `cad.cpf`: ver o aviso
             no topo dos blocos. */
          desabilitada: !c.cpf || !!bloqueio,
          onClick: () => { st.emitirNota(c.id); st.fechar(); },
        },
        abrirFicha,
      ),
    };
  }

  /* ── cliente ── */
  const cli = st.clienteDe(id);
  if (cli) {
    const ativo = st.cliAtivo(cli.id);
    const nota = st.notaDe(cli.id);
    const cv = conversaDoCliente(cli.id);
    const rotuloNota: Record<D.StatusNota, string> = {
      pendente: "a emitir", processando: "processando", emitida: `emitida · ${nota.numero ?? ""}`.trim(),
      cancelada: "cancelada", erro: "com erro",
    };
    /* O RODAPÉ É O QUE SE FAZ COM A PESSOA (25/09/2026, T6 e 05 F3). Era "Abrir conversa" e
     * "Ver a nota do mês", e para quem ainda não escreveu, "Fechar": a ficha só deixava editar.
     * Marcar horário é o primário (abre o rascunho com ela escolhida, no próximo vago); tirar de
     * atendimento saiu do cartão com chave e foi para o menu, em dois toques (contradição C18). */
    const emiteRecibo = st.fiscal.status === "ok" && st.fiscal.caminho === "recibo_saude";
    const verFiscal: Acao | null = cli.valor > 0
      ? {
        label: emiteRecibo ? "Ver no Fiscal" : "Ver a nota do mês",
        onClick: () => { st.irPara("faturamento"); if (!emiteRecibo) st.abrir(`nf-${cli.id}`); },
      }
      : null;
    const acoes = rodape(
      ativo && { label: "Marcar horário", primaria: true, onClick: () => st.novoAgendamento(null, { clienteId: cli.id }) },
      cv ? { label: "Abrir conversa", primaria: !ativo, onClick: irParaConversa(cv.id) } : !ativo && verFiscal,
    );
    const mais: (Acao | AcaoDestrutiva)[] = [
      ...(verFiscal && (ativo || cv) ? [verFiscal] : []),
      ativo
        ? {
          label: "Tirar de atendimento", tone: "danger",
          confirmar: {
            chave: `tirar:${cli.id}`,
            rotulo: "Tirar de atendimento",
            aviso: `${D.primeiroNome(cli.nome)} sai da agenda e do fechamento do mês. Dá para voltar a atender por esta ficha.`,
          },
          onClick: () => { st.alternarCli(cli.id); st.pedirCancelamento(null); },
        }
        : { label: "Voltar a atender", onClick: () => st.alternarCli(cli.id) },
    ];

    /* Só os serviços ATIVOS na lista, mais o que este cliente já tem — mesmo arranjo do
       select do rascunho. Um cliente cujo serviço habitual saiu do catálogo continuaria
       apontando para ele, e um select que não contém o próprio valor se repinta sozinho
       para a primeira opção no primeiro render: o serviço mudaria sem ninguém tocar. */
    const svcCliente = st.servicoDe(cli.servicoId);
    const svcOpcoes = st.servicos.filter((sv) => st.svcAtivo(sv.id) || sv.id === cli.servicoId);

    /* ── A MAISA RESPONDE A ESTA PESSOA? (25/09/2026, 1B.11, 05 P0-2) ──
     * No número pessoal quem decide é o CADERNO de contatos, não esta ficha (`podeResponder`, no
     * núcleo): cadastrada em Clientes e salva no celular sem marcação, ela cala. A ficha dizia
     * "Em atendimento" e parecia responder a pergunta. Agora diz o que o caderno diz, e oferece o
     * gesto que resolve. A regra do núcleo não muda (decisão 2 do backlog); a ponte é de tela. */
    const primeiro = D.primeiroNome(cli.nome);
    const cad = st.caderno;
    const chave = D.soDigitos(cli.telefone).slice(-8);
    const faixa: Detalhe["faixa"] = !cli.telefone
      ? { forma: "anel", tom: "neutral", texto: `Sem telefone, a MAISA não reconhece ${primeiro} no WhatsApp.` }
      : cad.fase === "carregando"
        ? { forma: "anel", tom: "neutral", texto: "Conferindo se a MAISA responde…" }
        : cad.fase === "erro"
          ? { forma: "anel", tom: "neutral", texto: cad.frase, acao: cad.entrar ? { label: ENTRAR.rotulo, onClick: ENTRAR.fazer } : { label: "Tentar de novo", onClick: st.recarregarCaderno } }
          : cad.modo === "negocio"
            ? { forma: "disco", tom: "success", texto: "A MAISA responde todo mundo neste número." }
            : cad.cliente[chave] === true
              ? { forma: "disco", tom: "success", texto: `A MAISA responde a ${primeiro}.` }
              : {
                forma: "triangulo", tom: "warn",
                texto: cad.cliente[chave] === false
                  ? `A MAISA não responde a ${primeiro}: nos seus contatos está como "não atende".`
                  : chave in cad.cliente
                    ? `A MAISA não responde a ${primeiro}: está nos seus contatos sem marcação.`
                    : `A MAISA não responde a ${primeiro}: neste número ela só atende cliente marcado.`,
                acao: { label: `Responder a ${primeiro}`, onClick: () => st.responderA(cli.telefone) },
              };

    return {
      titulo: cli.nome, seed: cli.id, faixa,
      sub: `${st.nomeServico(cli.servicoId)} · ${cli.canal} · desde ${cli.desde}`,
      blocos: [
        /* ── A FICHA VIROU FORMULÁRIO (24/08/2026) ──
         *
         * Era um bloco `stats` — seis linhas de leitura. Bruno: *"é impossível editar
         * clientes pelo front… quero poder, toda vez que clicar em um cliente, editar
         * ele."* E dois desses campos não eram enfeite de cadastro:
         *
         *   • `telefone` é a IDENTIDADE no WhatsApp (`telefone_chave`). Errado, a MAISA
         *     trata cliente antigo como desconhecido — e só SQL consertava;
         *   • `cpf` é o que libera a nota. Sem ele a prefeitura recusa e o lote pula a
         *     pessoa. A tela de Faturamento dizia isso e não oferecia onde escrever.
         *
         * Grava a cada tecla, coalescido no store — como os ajustes da MAISA e o catálogo.
         * `desde`, `atendimentos` e `valor` continuam em leitura no bloco do mês: são
         * derivados de `v_clientes`, e campo derivado editável é campo que mente. */
        {
          tipo: "campos", key: "ficha", label: "Ficha",
          avisoAoSair: "Cliente atualizado",
          campos: [
            {
              id: "nome", label: "Nome", valor: cli.nome,
              onChange: (v) => st.editarCliente(cli.id, { nome: v }),
            },
            {
              id: "telefone", label: "Telefone", valor: cli.telefone,
              /* O hint diz a CONSEQUÊNCIA, não o formato: este campo não é contato, é a
                 chave pela qual o agente reconhece quem manda mensagem. */
              hint: divideTelefone(cli)
                ? `${divideTelefone(cli)} também tem este número — a MAISA reconhece quem está no cadastro há mais tempo.`
                : "É por ele que a MAISA reconhece a pessoa no WhatsApp. Com DDD.",
              onChange: (v) => st.editarCliente(cli.id, { telefone: v }),
            },
            {
              id: "cpf", label: "CPF", valor: cli.cpf,
              hint: dicaDeCpf(cli.cpf, "Vai no tomador da nota fiscal."),
              onChange: (v) => st.editarCliente(cli.id, { cpf: v }),
            },
            {
              id: "email", label: "E-mail", valor: cli.email,
              onChange: (v) => st.editarCliente(cli.id, { email: v }),
            },
            /* O preço DESTA pessoa (24/09/2026). É daqui que o novo atendimento e o agente
               de WhatsApp puxam o valor; vazio = o do serviço. Grava ao sair do campo
               (`gravaAoSair`), então aceita centavos: "180,50" era lido como 18050 quando o
               campo gravava a cada tecla e jogava fora tudo que não fosse dígito. */
            {
              id: "valorSessao", label: "Valor da sessão", tipo: "numero", prefixo: "R$",
              gravaAoSair: true,
              valor: cli.valorSessao == null ? "" : String(cli.valorSessao).replace(".", ","),
              hint: cli.valorSessao == null
                ? `Vazio = o preço do serviço${svcCliente ? ` (${fmt(svcCliente.preco)})` : ""}. Preencha se esta pessoa paga outro valor.`
                : "Todo atendimento novo desta pessoa nasce com este valor — pela tela e pelo WhatsApp.",
              onChange: (v) => {
                if (!v.trim()) { st.editarCliente(cli.id, { valorSessao: null }); return; }
                const n = D.numeroDigitado(v);
                if (n === null) return false;
                st.editarCliente(cli.id, { valorSessao: n });
              },
            },
            {
              id: "canal", label: "Atendimento", valor: cli.canal, tipo: "select",
              opcoes: ["Online", "Presencial"],
              onChange: (v) => st.editarCliente(cli.id, { canal: v as D.Cliente["canal"] }),
            },
            {
              id: "servico", label: "Serviço principal", valor: cli.servicoId, tipo: "select",
              opcoes: ["", ...svcOpcoes.map((sv) => sv.id)],
              rotuloOpcao: (v) => {
                const sv = svcOpcoes.find((x) => x.id === v);
                return sv ? `${sv.nome} · ${fmt(sv.preco)}` : "Nenhum";
              },
              hint: svcCliente && !st.svcAtivo(svcCliente.id)
                ? `${svcCliente.nome} está fora do catálogo — a MAISA não o oferece.`
                : "O que ela costuma marcar para esta pessoa.",
              onChange: (v) => st.editarCliente(cli.id, { servicoId: v }),
            },
          ],
        },
        {
          /* `v_clientes` conta a competência corrente, ou seja, o mês de hoje (era `D.PERIODO`). */
          tipo: "stats", key: "mes", label: `Em ${D.rotuloDoMes(D.HOJE.iso)}`,
          linhas: [
            ["Atendimentos", String(cli.atendimentos)],
            ["Valor fechado", fmt(cli.valor)],
            ["Nota fiscal", cli.valor > 0 ? rotuloNota[nota.status] : "sem valor no mês"],
          ],
        },
        /* Só quem está fora ganha a linha: "em atendimento" é o normal, e o cartão com chave
           que dizia isso para todo mundo saiu (o gesto está em "Mais ações"). */
        ...(ativo ? [] : [{ tipo: "aviso" as const, key: "fora", tone: "warn" as const, texto: "Fora de atendimento: não aparece na agenda nem no fechamento do mês." }]),
      ],
      acoes,
      mais,
    };
  }

  /* ── profissional ── */
  const pr = st.profissionalDe(id);
  if (pr) {
    const on = st.profAtivo(pr.id);
    const primeiro = D.primeiroNome(pr.nome);

    /* Conexão com o Google Calendar — uma agenda por profissional, então é aqui que
     * ela mora: o botão fica ao lado da pessoa de quem é a agenda, não numa tela de
     * configurações distante. */
    const conexao = st.googleDe(pr.id);
    const ocupado = st.googleOcupado(pr.id);
    const blocoGoogle: Bloco = conexao
      ? {
        tipo: "texto", key: "gcal", label: "Google Calendar",
        texto: `Conectado como ${conexao.googleEmail}. Os atendimentos de ${primeiro} podem virar evento nesta agenda, com link do Meet.`,
      }
      : st.google.status === "nao_configurado"
        ? {
          tipo: "aviso", key: "gcal", tone: "warn",
          texto: `Google Calendar não configurado neste ambiente. Falta: ${st.google.faltando.join(", ")}.`,
        }
        : st.google.status === "carregando"
          ? { tipo: "texto", key: "gcal", label: "Google Calendar", texto: "Verificando a conexão…" }
          : {
            tipo: "texto", key: "gcal", label: "Google Calendar",
            texto: st.google.status === "ok"
              ? `A agenda de ${primeiro} ainda não está conectada. Conectando, cada atendimento pode virar um evento com link do Meet para mandar no WhatsApp.`
              : "Entre na sua conta para conectar uma agenda do Google.",
          };

    /* Conectar fica no rodapé (é o que falta fazer); desconectar vai para o menu: é o raro. */
    const conectar: Acao | null = st.google.status === "ok" && !conexao
      ? { label: "Conectar agenda do Google", onClick: () => st.conectarGoogle(pr.id) }
      : null;
    const desconectar: Acao | null = st.google.status === "ok" && conexao
      ? { label: ocupado ? "Desconectando…" : "Desconectar do Google", desabilitada: ocupado, onClick: () => st.desconectarGoogle(pr.id) }
      : null;

    return {
      titulo: pr.nome, seed: pr.id, sub: `${pr.papel} · na equipe desde ${pr.desde}`,
      blocos: [
        {
          tipo: "toggles", key: "disp", label: "Disponibilidade",
          toggles: [{
            titulo: on ? "Recebendo agendamentos" : "Pausado",
            desc: on ? `A MAISA pode marcar com ${primeiro}` : `A MAISA não oferece os horários de ${primeiro}`,
            on,
            alternar: () => st.alternarProf(pr.id),
          }],
        },
        blocoGoogle,
        /* Nome e papel EDITÁVEIS (1B.12, 08 P0-2): o nome é o que a MAISA diz quando confirma
           "com quem?", e corrigir o que o cadastro adivinhou pelo e-mail pedia SQL. Grava ao
           sair do campo. Sem "Comissão" e sem "Avaliação" (T5, 08 P1-3): nada as escreve. */
        {
          tipo: "campos", key: "dados", label: "Dados do profissional",
          avisoAoSair: "Profissional atualizado",
          campos: [
            {
              id: "nome", label: "Nome", valor: pr.nome, gravaAoSair: true,
              hint: "É como a MAISA fala dele com o cliente.",
              onChange: (v) => { if (!v.trim()) return false; st.editarProfissional(pr.id, { nome: v }); },
            },
            {
              id: "papel", label: "O que faz", valor: pr.papel, gravaAoSair: true,
              onChange: (v) => st.editarProfissional(pr.id, { papel: v }),
            },
          ],
        },
        { tipo: "stats", key: "desde", linhas: [["Na equipe desde", pr.desde]] },
        {
          tipo: "stats", key: "mes", label: "No mês",
          linhas: [["Atendimentos", String(pr.atendimentosMes)]],
        },
        {
          tipo: "lista", key: "svc", label: "Faz estes serviços",
          // Espelho do "Quem faz" do serviço, e com a mesma correção: um id órfão
          // sai da lista em vez de derrubar a gaveta.
          itens: pr.servicoIds.flatMap((sid) => {
            const sv = st.servicoDe(sid);
            if (!sv) return [];
            return [{
              id: sid, nome: sv.nome,
              sub: `${fmt(sv.preco)} · ${sv.duracao} min`,
              onClick: () => st.abrir(sid),
            }];
          }),
        },
      ],
      acoes: rodape(
        { label: "Ver na agenda", primaria: !conectar, onClick: () => st.irPara("agenda") },
        conectar && { ...conectar, primaria: true },
      ),
      mais: desconectar ? [desconectar] : undefined,
    };
  }

  /* ── novo atendimento (rascunho) ──
   * A Agenda tinha 40 zonas de soltura que só aceitavam arrasto: marcar um horário — a ação nº1 de
   * uma agenda — não existia. Clicar num vago abre aqui, com horário e profissional já resolvidos
   * pelo próprio clique; falta escolher quem e o quê. */
  if (st.rascunho && st.rascunho.id === id) {
    const r = st.rascunho;
    const disponiveis = st.servicos.filter((sv) => st.svcAtivo(sv.id));
    const svEscolhido = r.servicoId ? st.servicoDe(r.servicoId) : undefined;
    const valorDigitado = D.valorDoRascunho(r, svEscolhido);
    const clEscolhido = r.clienteId ? st.clienteDe(r.clienteId) : undefined;
    /* Sem serviço, o preço basta (28/09/2026): a MAISA cria "Ana · R$ 150,00" ao marcar. Ver
     * `confirmarRascunho` no store e `D.nomeDoServicoAvulso`. Vazio não vale: sem serviço não
     * há preço de tabela para cair, e marcar de graça por esquecimento cobraria zero. */
    const temValor = !!(r.valor ?? "").trim() && valorDigitado !== null && valorDigitado > 0;
    const completo = !!r.clienteId && valorDigitado !== null && (!!r.servicoId || temValor);
    const avulso = !svEscolhido && clEscolhido && temValor ? D.nomeDoServicoAvulso(clEscolhido.nome, valorDigitado!) : null;
    const reusado = avulso ? st.servicos.find((sv) => sv.nome === avulso) : undefined;
    const cada = r.cadaSemanas ?? 0;
    const sessoes = D.ocorrenciasDaSerie(cada, r.meses ?? 3);
    const { enviando, erro, tentou } = st.rascunhoEstado;
    const contaAg = st.googleDe(r.profissionalId);

    /* ── QUANDO E COM QUEM, EDITÁVEIS (25/09/2026, T2) ──
     * O rascunho nascia só do clique num vago, então dia, hora e pessoa vinham prontos e não
     * mudavam. Com o "Novo" da casca, "Encaixar cliente" e "Marcar horário" da ficha ele nasce
     * no próximo vago de verdade (`st.proximoVago`), e quem marca precisa poder trocar. As
     * horas são as vagas daquela pessoa naquele dia (`st.vagasDe`, a conta do agente), mais a
     * escolhida. Depois da primeira tentativa, travam: ver `rascunhoEstado.tentou` no store. */
    const duracaoR = svEscolhido?.duracao ?? reusado?.duracao ?? D.duracaoPadrao(st.servicos);
    const dias = Array.from({ length: 21 }, (_, i) => D.somarDias(D.HOJE.iso, i)).filter((d) => !D.fechado(d));
    if (!dias.includes(r.data)) dias.unshift(r.data);
    const horas = st.vagasDe(r.profissionalId, r.data, duracaoR);
    if (!horas.includes(r.inicio)) horas.push(r.inicio);
    horas.sort((a, b) => a - b);
    const semVago = st.vagasDe(r.profissionalId, r.data, duracaoR).length === 0;
    const agendas = st.cadastro.agendas;
    const quando: Bloco = tentou
      ? { tipo: "stats", key: "quando", label: "Quando", linhas: [
          ["Dia", D.rotuloLongo(r.data)], ["Horário", D.hhmm(r.inicio)], ["Com", st.nomeDoProfissional(r.profissionalId)],
        ] }
      : {
        tipo: "campos", key: "quando", label: "Quando",
        campos: [
          {
            id: "dia", label: "Dia", valor: r.data, tipo: "select", opcoes: dias,
            rotuloOpcao: (v) => (v === D.HOJE.iso ? `Hoje, ${D.rotuloDia(v)}` : D.rotuloLongo(v)),
            /* Trocar o dia leva ao primeiro vago dele, se a hora antiga não servir. */
            onChange: (v) => {
              const livres = st.vagasDe(r.profissionalId, v, duracaoR);
              st.editarRascunho({ data: v, ...(livres.length && !livres.includes(r.inicio) ? { inicio: livres[0] } : {}) });
            },
          },
          {
            id: "hora", label: "Horário", valor: String(r.inicio), tipo: "select", opcoes: horas.map(String),
            rotuloOpcao: (v) => D.hhmm(Number(v)),
            hint: semVago ? `${D.primeiroNome(st.nomeDoProfissional(r.profissionalId))} não tem horário livre neste dia.` : undefined,
            onChange: (v) => st.editarRascunho({ inicio: Number(v) }),
          },
          ...(agendas.length > 1
            ? [{
              id: "quem", label: "Com", valor: r.profissionalId, tipo: "select" as const, opcoes: agendas,
              rotuloOpcao: (v: string) => st.nomeDoProfissional(v),
              onChange: (v: string) => {
                const livres = st.vagasDe(v, r.data, duracaoR);
                st.editarRascunho({ profissionalId: v, ...(livres.length && !livres.includes(r.inicio) ? { inicio: livres[0] } : {}) });
              },
            }]
            : []),
        ],
      };
    return {
      titulo: "Novo atendimento",
      sub: `${r.data === D.HOJE.iso ? "hoje" : D.rotuloLongo(r.data)}, ${D.hhmm(r.inicio)}, com ${D.primeiroNome(st.nomeDoProfissional(r.profissionalId))}`,
      blocos: [
        {
          tipo: "campos", key: "quem", label: "Quem e o quê",
          campos: [
            {
              id: "cliente", label: "Cliente", valor: r.clienteId, tipo: "select",
              opcoes: ["", ...st.cadastro.clientes.filter((c) => st.cliAtivo(c.id)).map((c) => c.id)],
              rotuloOpcao: (v) => (v ? st.nomeDoCliente(v) : "Escolha o cliente"),
              /* Trocar a pessoa traz o preço DELA, se a ficha tiver um. */
              onChange: (v) => {
                const cl = st.clienteDe(v);
                st.editarRascunho({
                  clienteId: v,
                  ...(cl?.valorSessao != null
                    ? { valor: String(cl.valorSessao) }
                    : svEscolhido ? { valor: String(svEscolhido.preco) } : {}),
                });
              },
            },
            /* O preço é DESTE atendimento (24/09/2026): na terapia ele muda de pessoa para
               pessoa, e o catálogo só guarda um. O serviço continua dando o padrão. */
            {
              id: "valor", label: "Valor desta sessão", tipo: "numero", prefixo: "R$",
              valor: r.valor ?? (svEscolhido ? String(svEscolhido.preco) : ""),
              hint: valorDigitado === null
                ? "Valor inválido — use só números, como 180 ou 180,50."
                : clEscolhido?.valorSessao != null && valorDigitado === clEscolhido.valorSessao
                  ? `O valor da ficha de ${D.primeiroNome(clEscolhido.nome)}.`
                  : svEscolhido && valorDigitado !== svEscolhido.preco
                    ? `O serviço custa ${fmt(svEscolhido.preco)} — este atendimento sai por ${fmt(valorDigitado)}.${clEscolhido && clEscolhido.valorSessao == null ? " Vai ficar guardado na ficha." : ""}`
                    : "Mude se o preço desta pessoa for outro.",
              onChange: (v) => st.editarRascunho({ valor: v }),
            },
            {
              id: "servico", label: "Serviço", valor: r.servicoId, tipo: "select",
              opcoes: ["", ...disponiveis.map((sv) => sv.id)],
              rotuloOpcao: (v) => {
                const sv = disponiveis.find((x) => x.id === v);
                return sv ? `${sv.nome} · ${sv.duracao} min · ${fmt(sv.preco)}` : "Nenhum, marcar só pelo valor";
              },
              hint: svEscolhido
                ? `Ocupa a agenda até ${D.hhmm(r.inicio + svEscolhido.duracao / 60)}.`
                : avulso
                  ? `${reusado ? "Usa" : "Cria"} o serviço "${avulso}", ${duracaoR} min, até ${D.hhmm(r.inicio + duracaoR / 60)}. Ele não aparece para os clientes no WhatsApp.`
                  : "Opcional. Sem serviço, o valor acima basta.",
              /* Trocar o serviço traz o preço dele para o campo de valor — que o dono então
                 edita. Deixar o campo com o preço do serviço anterior cobraria errado.
                 Voltar para "Nenhum" NÃO mexe no valor: é justamente o valor que vai marcar. */
              onChange: (v) => {
                if (!v) { st.editarRascunho({ servicoId: "" }); return; }
                const sv = st.servicoDe(v);
                const daFicha = st.clienteDe(r.clienteId)?.valorSessao;
                st.editarRascunho({ servicoId: v, valor: daFicha != null ? String(daFicha) : sv ? String(sv.preco) : "" });
              },
            },
          ],
        },
        quando,
        {
          tipo: "campos", key: "repete", label: "Repetição",
          campos: [
            {
              id: "cada", label: "Repete", valor: String(cada), tipo: "select",
              opcoes: ["0", "1", "2", "4"],
              rotuloOpcao: (v) => ({ "0": "Não repete", "1": "Toda semana", "2": "A cada 2 semanas", "4": "A cada 4 semanas" } as Record<string, string>)[v],
              hint: cada ? `Sempre ${D.DOW_LONGO[D.dowDoDia(r.data)]}, às ${D.hhmm(r.inicio)}.` : undefined,
              onChange: (v) => st.editarRascunho({ cadaSemanas: Number(v), chaves: undefined }),
            },
            ...(cada
              ? [{
                id: "meses", label: "Por quanto tempo", valor: String(r.meses ?? 3), tipo: "select" as const,
                opcoes: ["1", "3", "6", "12"],
                rotuloOpcao: (v: string) => ({ "1": "1 mês", "3": "3 meses", "6": "6 meses", "12": "1 ano" } as Record<string, string>)[v],
                hint: `${sessoes} sessões. Data com horário ocupado é pulada, e a lista das puladas aparece no fim.`,
                onChange: (v: string) => st.editarRascunho({ meses: Number(v), chaves: undefined }),
              }]
              : []),
          ],
        },
        /* Onde isto vai parar, dito ANTES de acontecer. Marcar deixou de ser uma anotação
         * no navegador e virou um evento na agenda de verdade — com link do Meet, e visível
         * para quem mais tenha acesso àquela conta. Quem clica precisa saber disso pelo
         * botão, não pelo resultado. */
        ...(completo && !erro
          ? [{
            tipo: "texto" as const, key: "onde", label: "Onde vai ser criado",
            texto: contaAg
              ? `Na agenda do Google de ${D.primeiroNome(st.nomeDoProfissional(r.profissionalId))} (${contaAg.googleEmail}), com link do Meet. O cliente NÃO é convidado por e-mail.`
              : `Na agenda da MAISA. ${D.primeiroNome(st.nomeDoProfissional(r.profissionalId))} não conectou o Google, então não vira evento lá nem ganha link do Meet — dá para conectar em Minha Equipe.`,
          }]
          : []),
        ...(completo
          ? []
          : [{
            tipo: "aviso" as const, key: "falta", tone: "warn" as const,
            texto: !r.clienteId ? "Escolha o cliente para marcar." : "Ponha o valor da sessão ou escolha um serviço.",
          }]),
        /* A falha fica NA GAVETA, não num toast. O toast some sozinho e leva embora a única
         * explicação de por que o bloco não apareceu na grade — e aqui ela vem ao lado do
         * botão que vai ser clicado de novo. */
        ...(erro
          ? [{ tipo: "aviso" as const, key: "erro", tone: "danger" as const, texto: erro }]
          : []),
      ],
      acoes: rodape(
        { label: "Descartar", onClick: () => st.descartarRascunho() },
        {
          label: enviando ? "Marcando…" : erro ? "Tentar de novo" : cada ? `Marcar ${sessoes} sessões` : "Marcar atendimento",
          primaria: true,
          desabilitada: !completo || enviando,
          onClick: () => st.confirmarRascunho(),
        },
      ),
    };
  }

  /* ── serviço ──
   * Era leitura pura, com um chip prometendo "abrir e editar" e a gaveta oferecendo só um toggle
   * e três linhas de stats. Preço e duração são a razão de existir de uma tela de catálogo: agora
   * são campos, e gravam direto (sem botão de salvar, como os ajustes da MAISA). */
  const sv = st.servicoDe(id);
  if (sv) {
    const on = st.svcAtivo(sv.id);
    return {
      titulo: sv.nome, sub: `${sv.categoria} · ${fmt(sv.preco)} · ${sv.duracao} min`,
      blocos: [
        {
          tipo: "campos", key: "dados", label: "Dados do serviço",
          avisoAoSair: "Serviço atualizado",
          campos: [
            {
              id: "nome", label: "Nome", valor: sv.nome,
              onChange: (v) => st.editarServico(sv.id, { nome: v }),
            },
            /* ⚠️ `gravaAoSair`: preço e duração convertem no blur e no Enter, nunca a cada tecla
               (08 P0-1, o 30 que virava 50). Texto que não é número não grava, e o campo volta
               ao valor salvo. O mínimo de 5 min vale na gravação, não na digitação. */
            {
              id: "preco", label: "Preço", valor: String(sv.preco).replace(".", ","), tipo: "numero", prefixo: "R$",
              gravaAoSair: true,
              hint: "O que o cliente paga por este serviço.",
              onChange: (v) => {
                const n = D.numeroDigitado(v);
                if (n === null) return false;
                st.editarServico(sv.id, { preco: n });
              },
            },
            {
              id: "duracao", label: "Duração", valor: String(sv.duracao), tipo: "numero", sufixo: "min",
              gravaAoSair: true,
              hint: "Quanto tempo a MAISA reserva na agenda.",
              onChange: (v) => {
                const n = D.numeroDigitado(v);
                if (n === null) return false;
                st.editarServico(sv.id, { duracao: Math.max(5, Math.round(n)) });
              },
            },
            {
              id: "categoria", label: "Categoria", valor: sv.categoria, tipo: "select",
              opcoes: [...D.CATEGORIAS],
              onChange: (v) => st.editarServico(sv.id, { categoria: v as D.CategoriaServico }),
            },
          ],
        },
        {
          tipo: "toggles", key: "cat", label: "No catálogo",
          toggles: [{
            titulo: on ? "Ativo" : "Fora do catálogo",
            desc: on ? "A MAISA pode oferecer e agendar este serviço" : "A MAISA não oferece este serviço",
            on,
            alternar: () => st.alternarSvc(sv.id),
          }],
        },
        ...(sv.preco === 0
          ? [{ tipo: "aviso" as const, key: "sem-preco", tone: "warn" as const, texto: "Sem preço, este serviço não entra no faturamento. Preencha antes de colocar no catálogo." }]
          : []),
        {
          tipo: "lista", key: "quem", label: "Quem faz",
          // flatMap e não map: o `!` de antes derrubava a gaveta inteira quando o
          // serviço citava alguém fora da equipe — e sv4/sv5/sv6 eram exatamente esse
          // caso. Sumir da lista é infinitamente melhor que tela branca.
          itens: sv.profissionalIds.flatMap((pid) => {
            const p = st.profissionalDe(pid);
            if (!p) return [];
            return [{
              id: pid, nome: p.nome, seed: pid,
              sub: st.profAtivo(pid) ? "recebendo agendamentos" : "pausado",
              onClick: () => st.abrir(pid),
            }];
          }),
        },
      ],
      /* ⚠️ EXCLUIR VALE PARA QUALQUER SERVIÇO DESDE 15/08/2026, e a mudança é de FATO, não
       * de política. Até aqui só aparecia para o que o usuário tinha criado, com a
       * justificativa de que "serviço do catálogo de partida pode ter agendamento
       * histórico apontando para ele".
       *
       * Conferido no esquema, e a justificativa estava errada: `atendimentos.servico_id`
       * NÃO tem FK — é snapshot, ao lado de `servico_nome` e `servico_valor`
       * (`002_multitenant.sql`). Apagar um serviço não toca faturamento fechado.
       *
       * E manter a condição antiga viraria um botão morto: com o catálogo persistido,
       * TODO serviço passou a existir no cadastro, então `novo` seria sempre falso e o
       * "Excluir" nunca apareceria — inclusive para o "Novo serviço" criado por engano,
       * que é justamente quem mais precisa dele.
       *
       * `ativo: false` (o toggle acima) continua sendo o certo para "não faço mais isso". */
      /* Sem rodapé: tudo aqui grava sozinho, e o "Fechar" azul era o único botão cheio da
       * gaveta, para não fazer nada. Excluir mora no menu, em dois toques (T6). */
      acoes: [],
      mais: [{
        label: "Excluir serviço", tone: "danger",
        confirmar: {
          chave: `excluir:${sv.id}`,
          rotulo: "Excluir de vez",
          aviso: `${sv.nome} sai do catálogo e a MAISA para de oferecer. O que já foi marcado e faturado continua. Não dá para desfazer: para "não faço mais", use o interruptor do catálogo.`,
        },
        onClick: () => void st.excluirServico(sv.id),
      }],
    };
  }

  /* ── conversa ──
   * `st.conversaDe` e não `D.conversa`: a lista vem do servidor. E o `id` de uma conversa agora
   * é a chave do telefone (8 dígitos), não `cv1` — quem abre esta gaveta é a fila "Precisa de
   * você" ou a paleta, e as duas já passam esse id. */
  const cv = st.conversaDe(id);
  if (cv) {
    const estado = cv.estado;
    const assumida = estado === "voce";
    /* O número já vem com DDI do WhatsApp. Sem ele (conversa antiga), NENHUM link: `wa.me/`
     * vazio abria o WhatsApp sem ninguém (04 P0-4), e os 8 dígitos da chave não são telefone. */
    const zap: Acao | null = cv.telefone
      ? { label: "Abrir no WhatsApp", onClick: () => st.abrirNoWhatsApp(cv.id) }
      : null;
    return {
      titulo: cv.nome, seed: cv.id,
      sub: `${cv.telefone ? D.telefoneBonito(cv.telefone) : "Número incompleto"} · última mensagem às ${D.horaDeISO(cv.atualizadaEm)}`,
      blocos: [
        { tipo: "msgs", key: "th", label: "Conversa", msgs: st.threadDe(cv.id) },
        {
          tipo: "texto", key: "quem", label: "Quem está conduzindo",
          /* Quatro estados, quatro frases. `espera` é NOVO e é o que mais importa: significa que
             o cliente falou e a MAISA não respondeu — ela escalou, está desligada, ou tentou
             marcar e não conseguiu. Antes esse caso vinha escrito no fixture como se fosse
             sobre encaixe de horário; agora é a situação real, e a única com urgência. */
          texto: assumida
            ? "Você assumiu esta conversa. A MAISA não responde mais aqui até você devolver."
            : estado === "espera"
              ? "O cliente escreveu e a MAISA não respondeu — é a sua vez. Assuma para falar você mesmo."
              : estado === "ok"
                ? "Conversa marcada como resolvida. Nada pendente."
                : "A MAISA está respondendo sozinha. Assuma se quiser falar você mesmo.",
        },
      ],
      /* ⚠️ O WHATSAPP NÃO É O PRIMÁRIO (04 P0-3). Com a conversa assumida, o botão cheio era
       * "Responder no WhatsApp": o que o dono escreve lá não volta para esta tela nem para a
       * memória da MAISA. Responder é aqui; o WhatsApp fica no menu, e assume antes de abrir. */
      acoes: assumida
        ? rodape(
          { label: "Abrir conversa", primaria: true, onClick: irParaConversa(cv.id) },
          { label: "Devolver à MAISA", onClick: () => st.devolver(cv.id) },
        )
        : rodape(
          { label: "Assumir conversa", primaria: true, onClick: () => { st.assumir(cv.id); st.selecionarConversa(cv.id); st.irPara("conversas"); } },
          { label: "Abrir na tela", onClick: irParaConversa(cv.id) },
        ),
      mais: zap ? [zap] : undefined,
    };
  }

  /* ── um atendimento ──
   * Já foi "o atendimento de hoje". Com a Agenda em semana e mês, a gaveta abre qualquer um dos
   * ~150 do mês, e duas coisas passaram a importar: DIZER de que dia ele é (dois atendimentos das
   * 10:00 em dias diferentes ficavam idênticos na tela) e não oferecer "Dar chegada" para alguém
   * que só vem daqui a duas semanas. Dar chegada é uma ação do balcão: ela existe no dia. */
  const ag = st.agendamentoPorId(id);
  if (ag) {
    const cvAg = conversaDoCliente(ag.cliente.id);
    const ehHoje = ag.data === D.HOJE.iso;
    const passado = ag.data < D.HOJE.iso;
    const rotulo: Record<D.Etapa, string> = {
      chegando: "Dar chegada",
      atendendo: "Concluir atendimento",
      feito: "Reabrir",
    };
    /* O verbo do balcão, só no dia. */
    const etapa: Acao | null = ehHoje
      ? {
        label: rotulo[ag.etapa],
        primaria: true,
        onClick: () => {
          st.moverEtapa(ag.id, ag.etapa === "feito" ? "chegando" : ag.etapa === "chegando" ? "atendendo" : "feito");
          st.fechar();
        },
      }
      : null;

    /* ── Google Calendar + Meet ──
     * Não há mais "criar evento": o atendimento JÁ É o evento. O que existe aqui é o que
     * se faz com um evento que existe — mandar o link, abrir no Google, cancelar. */
    const conexaoAg = st.googleDe(ag.profissionalId);
    const ocupadoAg = st.googleOcupado(ag.id);

    // wa.me com texto pronto: abre o WhatsApp (app ou web) com a mensagem digitada,
    // faltando só apertar enviar. É o envio REAL possível hoje — a MAISA que dispara
    // sozinha depende da API oficial, que este protótipo ainda não tem.
    const enviarLink: Acao | null = ag.meetLink
      ? {
        label: "Enviar link no WhatsApp",
        // Cliente vindo do evento e não do catálogo pode estar sem telefone.
        desabilitada: !ag.cliente.telefone,
        onClick: () => {
          const msg = `Oi, ${D.primeiroNome(ag.cliente.nome)}! Seu ${ag.servico.nome.toLowerCase()} com ${D.primeiroNome(ag.profissional.nome)} é ${D.rotuloLongo(ag.data)}, às ${D.hhmm(ag.inicio)}. Link para entrar: ${ag.meetLink}`;
          window.open(`https://wa.me/55${ag.cliente.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
        },
      }
      : null;
    const abrirGoogle: Acao | null = ag.htmlLink
      ? { label: "Abrir no Google Calendar", onClick: () => window.open(ag.htmlLink!, "_blank", "noopener") }
      : null;
    const abrirConversa: Acao | null = cvAg ? { label: "Abrir conversa", onClick: irParaConversa(cvAg.id) } : null;

    /* ⚠️ CANCELAR EM DOIS TOQUES, NO MENU (T6). É a única ação do app que apaga algo numa
     * agenda real — e, se houver convidado, o Google dispara um aviso de cancelamento por
     * e-mail. Ficava no rodapé ao lado de "Dar chegada", e a 390px era o terceiro botão,
     * cortado. O primeiro toque só pede; o aviso sobe colado ao rodapé; sair da gaveta desfaz
     * o pedido (`cancelarPedido`, a chave é o id do atendimento, como sempre foi). */
    const cancelar: AcaoDestrutiva = {
      label: ocupadoAg ? "Cancelando…" : "Cancelar atendimento",
      tone: "danger",
      desabilitada: ocupadoAg,
      confirmar: {
        chave: ag.id,
        rotulo: ocupadoAg ? "Cancelando…" : "Confirmar cancelamento",
        aviso: `Cancelar apaga o atendimento de ${D.rotuloLongo(ag.data)}, ${D.hhmm(ag.inicio)}${ag.htmlLink ? ", e o evento da agenda do Google" : ""}${ag.meetLink ? " (o link do Meet para de funcionar)" : ""}. Se houver convidado, ele recebe o aviso de cancelamento. Não dá para desfazer.`,
      },
      onClick: () => st.cancelarAtendimento(ag.id),
    };

    /* ── REMARCAR (1B.5) ──
     * Só com a chave do atendimento (`ag`): é por ela que o servidor acha a linha. Num dia que
     * ainda vem é o verbo principal da gaveta (o balcão não tem o que fazer com a sessão da
     * semana que vem); hoje e no passado fica em "Mais ações", atrás do verbo do dia. */
    const remarcarAcao: Acao | null = ag.ag
      ? { label: "Remarcar", desabilitada: ocupadoAg, onClick: () => st.pedirRemarcacao(ag.id) }
      : null;
    const remarcando = st.remarcacao && st.remarcacao.id === ag.id ? st.remarcacao : null;
    const futuro = !ehHoje && !passado;

    /* Dois no rodapé: o verbo do dia (se for hoje), ou Remarcar (se ainda vem), e o primeiro que
     * existir entre conversa e link do Meet. O resto vai para "Mais ações". */
    const segundos = [abrirConversa, enviarLink, abrirGoogle].filter((a): a is Acao => !!a);
    const principal = etapa ?? (futuro ? remarcarAcao : null);
    const noRodape = principal ? segundos.slice(0, 1) : segundos.slice(0, 2);
    const acoes = remarcando
      ? rodape(
        { label: "Voltar", onClick: () => st.pedirRemarcacao(null) },
        {
          label: ocupadoAg ? "Remarcando…" : `Remarcar para ${remarcando.data === D.HOJE.iso ? "hoje" : D.rotuloDia(remarcando.data)}, ${D.hhmm(remarcando.inicio)}`,
          primaria: true,
          /* Mesmo dia e hora: não há o que mandar. */
          desabilitada: ocupadoAg || (remarcando.data === ag.data && remarcando.inicio === ag.inicio),
          onClick: () => st.remarcarAtendimento(ag.id),
        },
      )
      : principal
        ? rodape({ ...principal, primaria: true }, noRodape[0])
        : rodape(noRodape[0] && { ...noRodape[0], primaria: true }, noRodape[1]);
    const mais: (Acao | AcaoDestrutiva)[] | undefined = remarcando ? undefined : [
      ...(remarcarAcao && principal !== remarcarAcao ? [remarcarAcao] : []),
      ...segundos.filter((a) => !noRodape.includes(a)),
      cancelar,
    ];

    /* O novo dia e horário: as vagas daquela pessoa, sem contar este atendimento, mais o
     * horário atual (escolher o mesmo desliga o botão). Trocar o dia cai no primeiro vago dele. */
    const blocoRemarcar: Bloco | null = remarcando
      ? (() => {
        const dias = Array.from({ length: 21 }, (_, i) => D.somarDias(D.HOJE.iso, i)).filter((d) => !D.fechado(d));
        if (!dias.includes(remarcando.data)) dias.unshift(remarcando.data);
        const livres = st.vagasDe(ag.profissionalId, remarcando.data, ag.duracao, ag.id);
        const horas = livres.includes(remarcando.inicio) ? [...livres] : [...livres, remarcando.inicio].sort((a, b) => a - b);
        return {
          tipo: "campos", key: "remarcar", label: "Novo horário",
          campos: [
            {
              id: "dia", label: "Dia", valor: remarcando.data, tipo: "select", opcoes: dias,
              rotuloOpcao: (v: string) => (v === D.HOJE.iso ? `Hoje, ${D.rotuloDia(v)}` : D.rotuloLongo(v)),
              onChange: (v: string) => {
                const l = st.vagasDe(ag.profissionalId, v, ag.duracao, ag.id);
                st.editarRemarcacao({ data: v, ...(l.length && !l.includes(remarcando.inicio) ? { inicio: l[0] } : {}) });
              },
            },
            {
              id: "hora", label: "Horário", valor: String(remarcando.inicio), tipo: "select", opcoes: horas.map(String),
              rotuloOpcao: (v: string) => D.hhmm(Number(v)),
              hint: livres.length === 0 ? `${D.primeiroNome(ag.profissional.nome)} não tem horário livre neste dia.` : undefined,
              onChange: (v: string) => st.editarRemarcacao({ inicio: Number(v) }),
            },
          ],
        } as Bloco;
      })()
      : null;

    const quando = ehHoje ? "hoje" : D.rotuloDia(ag.data);
    const situacao = passado
      ? "Passou."
      : ehHoje && ag.etapa === "feito"
        ? "Concluído."
        : ehHoje && ag.etapa === "atendendo"
          ? "Em atendimento agora."
          : semConfirmacao(ag)
            ? `${D.hhmm(ag.inicio)} ainda sem confirmação: o convite da agenda do Google não foi respondido.`
            : null;

    /* Bloco do Google. Dia e hora saem do PRÓPRIO evento, lido na última busca — não há
     * mais previsão a conferir contra o que está lá. Se alguém remarcar direto no Google
     * Calendar, é isto aqui que muda na leitura seguinte. */
    const blocoGoogle: Bloco = {
      tipo: "stats", key: "gcal", label: "No Google Calendar",
      linhas: [
        ["Agenda de", conexaoAg ? `${ag.profissional.nome} (${conexaoAg.googleEmail})` : ag.profissional.nome],
        ["Google Meet", ag.meetLink ? "link criado" : "sem link"],
        ...(ag.recorrente ? ([["Repetição", "evento que se repete"]] as [string, string][]) : []),
      ],
    };

    return {
      titulo: ag.cliente.nome, seed: ag.cliente.id,
      sub: `${quando}, ${D.hhmm(ag.inicio)} · ${ag.servico.nome}`,
      blocos: [
        ...(blocoRemarcar ? [blocoRemarcar] : []),
        {
          tipo: "stats", key: "d", label: "Atendimento",
          linhas: [
            ["Dia", `${D.rotuloLongo(ag.data)}${ehHoje ? " (hoje)" : ""}`],
            ["Horário", `${D.hhmm(ag.inicio)} – ${D.hhmm(ag.fim)}`],
            ["Duração", `${ag.duracao} min`],
            ["Profissional", ag.profissional.nome],
            /* O valor gravado NA SESSÃO, não o preço do catálogo (1A.5): o serviço de R$ 100
             * marcado a R$ 180 mostrava R$ 100. */
            ["Valor", ag.valor === null ? "—" : fmt(ag.valor)],
            ["Telefone", ag.cliente.telefone || "—"],
          ],
        },
        /* SÓ O QUE SE SABE (1A.5). Aqui morava a confirmação "pelo WhatsApp com a MAISA", a contagem
         * de lembretes enviados e "Atendimento concluído" para todo dia passado, e nenhuma
         * das três tinha fonte: `confirmado` é só a resposta ao convite do Google (sem
         * convidado, é sempre verdadeiro), nenhuma leitura diz se o lembrete saiu, e passado
         * sem etapa gravada é inferência. Sem nada a dizer, o bloco não aparece. */
        ...(situacao ? [{ tipo: "texto", key: "s", label: "Situação", texto: situacao } as Bloco] : []),
        blocoGoogle,
        /* Serviço ou cliente que este navegador não conhece — os dados vieram gravados no
         * próprio evento. Sem esta linha, o preço "R$ 0,00" de um serviço criado noutro
         * aparelho pareceria um erro de cadastro em vez do que é: informação que ficou do
         * outro lado. */
        ...(ag.soltoDoCatalogo
          /* Era um parágrafo sobre serviço "que só existe no navegador" (não é mais: o catálogo
             mora no banco) terminando em "Ele funciona normalmente". Nota de rodapé (28/09/2026). */
          ? [{ tipo: "nota", key: "solto", texto: "Serviço fora do catálogo: nome, duração e valor são os que ficaram gravados neste atendimento." } as Bloco]
          : []),
        ...(semConfirmacao(ag)
          ? [{ tipo: "aviso", key: "av", texto: ehHoje
              ? "Sem confirmação, o horário pode furar. Vale uma ligação se estiver perto da hora."
              : "Sem confirmação ainda. Se chegar perto do dia assim, vale uma mensagem." } as Bloco]
          : []),
      ],
      acoes,
      mais,
    };
  }

  /* As gavetas "faq" e "numeros" saíram em 25/09/2026 (T5, 08 P0-5): liam `D.FAQS` e
   * `D.NUMEROS_MES`, fixture com cara de análise do negócio. As perguntas de verdade estão nos
   * Ajustes da MAISA; os números voltam com fonte real. */

  /* ── Meu plano ──
   *
   * ★ TUDO AQUI VEM DE `GET /api/assinatura`, desde 21/09/2026. Antes vinha de
   * `st.cadastro.negocio.*`: a gaveta escrevia "Profissional · R$ 197/mês · próxima
   * cobrança · Cartão final 4417" para qualquer um que abrisse — dado de fixture na única
   * tela do app que fala de dinheiro do dono.
   *
   * Duas ausências que são decisão:
   *
   * · **"Últimas faturas" saiu.** Era `D.FATURAS`, três linhas escritas à mão. A lista real
   *   de faturas existe, com PDF e recibo, DENTRO do portal de cobrança — e o botão que
   *   leva lá está logo abaixo. Reimplementá-la aqui seria copiar o que o provedor já
   *   mantém, e enquanto não estivesse pronta seria um extrato inventado.
   *
   * · **"Conversas" saiu.** O limite do plano é copy de `_lib/planos.ts`, que vive em
   *   `app/(marketing)` e não é o que o provedor cobra. Mostrar um limite ao lado de uma
   *   cobrança real sugere que os dois foram conferidos um contra o outro, e não foram.
   *
   * A lógica toda — quais linhas, qual aviso, quais botões — está em `resumoDaAssinatura`,
   * no store, porque é pura e precisa de teste: é ela que decide se um botão de COBRAR
   * aparece. */
  /* ── a jornada inteira (1C.7, C11) ──
   * A linha do Fluxo diz quantos faltam e o próximo; a lista dos passos mora aqui, e não num
   * recorte do Fluxo nem empilhada sobre o dia. Passo feito não clica (ver o cabeçalho da
   * `JornadaDeAtivacao`: refazer o WhatsApp derruba o pareamento). */
  if (id === "jornada") {
    const r = resumoDaJornada(st);
    if (!r) return null;
    return {
      titulo: "O que falta para a MAISA atender sozinha",
      sub: `${r.prontos} de ${r.total} feitos`,
      blocos: [
        {
          tipo: "lista", key: "passos",
          itens: r.passos.map((p) => {
            const ir = p.feito ? null : p.ir;
            return { id: p.id, nome: p.titulo, sub: p.feito ? "Feito" : p.ganho, feito: p.feito, ...(ir ? { onClick: () => { st.fechar(); ir(); } } : {}) };
          }),
        },
        /* Era "Nada aqui trava o app: dá para usar do jeito que está." (e, com um passo faltando,
           "Falta um passo. Depois dele esta linha some do Fluxo, e não volta."). O Bruno achou
           que chamava atenção demais para um recado de consolo (28/09/2026): vira nota de rodapé. */
        { tipo: "nota", key: "nota", texto: "Essas configurações são opcionais." },
      ],
      acoes: [],
    };
  }

  /* ── a fila inteira, no celular (1C.7, 02 P0-3) ──
   * O Fluxo do celular mostra até três pendências e "Ver todas"; a lista completa mora aqui, e
   * não empilhada antes do dia. Cada item abre o que ele pede (a conversa, o atendimento). */
  if (id === "fila") {
    return {
      titulo: "Precisa de você",
      sub: st.fila.length === 1 ? "1 pendência" : `${st.fila.length} pendências`,
      blocos: st.fila.length
        ? [{ tipo: "lista", key: "fila", itens: st.fila.map((f) => ({ id: f.id, nome: f.titulo, sub: `${f.tag} · ${f.msg}`, onClick: () => st.abrir(f.alvo) })) }]
        : [{ tipo: "texto", key: "nada", texto: "Nada pendente agora." }],
      acoes: [],
    };
  }

  if (id === "plano") {
    const r = resumoDaAssinatura(st.assinatura);
    /* Const local em vez de `r.assinar!` no callback: o `!` calaria o TypeScript no lugar
     * exato em que um `null` viraria um POST sem plano. */
    const aAssinar = r.assinar;
    /* Sem "Fechar" (T6): sem assinar nem gerenciar, a gaveta fica sem rodapé e fecha pelo X. */
    const acoes = rodape(
      aAssinar && {
        /* O rótulo diz o plano E o preço. "Assinar" sozinho é um botão que cobra sem
         * dizer quanto — e o valor só apareceria na página do provedor, depois do clique. */
        label: st.cobrancaOcupada ? "Abrindo pagamento…" : aAssinar.label,
        primaria: true,
        desabilitada: st.cobrancaOcupada,
        onClick: () => st.assinarPlano(aAssinar.plano),
      },
      r.gerenciar && {
        label: "Gerenciar cobrança",
        primaria: !aAssinar,
        desabilitada: st.cobrancaOcupada,
        onClick: () => st.abrirPortalDeCobranca(),
      },
    );

    return {
      titulo: "Meu plano",
      sub: r.sub,
      blocos: [
        ...(r.aviso ? [{ tipo: "aviso" as const, key: "av", texto: r.aviso.texto, tone: r.aviso.tone }] : []),
        ...(r.linhas.length ? [{ tipo: "stats" as const, key: "ass", label: "Assinatura", linhas: r.linhas }] : []),
        /* Os outros planos, cada um com nome, preço e os dois números que decidem a
         * escolha. Lista e não cartões: são três linhas de uma decisão, e a prominência
         * já está no botão do rodapé — dois pesos visuais competindo fariam o olho achar
         * que há duas ofertas principais. O rótulo muda quando não há botão primário,
         * porque aí a lista deixa de ser "os outros" e passa a ser a escolha inteira. */
        ...(r.outras.length
          ? [{
              tipo: "lista" as const,
              key: "ofertas",
              label: aAssinar ? "Outros planos" : "Escolha um plano",
              itens: r.outras.map((o) => ({
                id: o.plano,
                nome: `${o.nome} · ${o.preco}`,
                sub: o.resumo,
                onClick: st.cobrancaOcupada ? undefined : () => st.assinarPlano(o.plano),
              })),
            }]
          : []),
      ],
      acoes,
    };
  }

  return null;
}
