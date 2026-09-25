/* ─────────────────────────────────────────────────────────────────────────────
 * O AGENTE — o loop de conversa.
 *
 * Irmão do `entrada/http/`: a diferença é só quem começa. Lá é o navegador do Bruno,
 * aqui é uma mensagem do cliente. E como o `LEIA-ME.md` desta pasta prometeu, ele NÃO
 * faz `fetch("/api/atendimentos")` — chama o caso de uso direto, no mesmo processo.
 *
 * ⚠️ NENHUM NOME DE PROVEDOR APARECE NESTE ARQUIVO. Ele fala `ModeloDeConversa`
 * (`portas/saida/modelo-conversa.ts`). Antes importava o SDK da Anthropic e falava
 * `tool_use`, `stop_reason`, `TextBlock` — e trocar para Gemini era reescrever o loop.
 * Como a chave de teste do Gemini vai ser revogada na ida para produção, "trocar de
 * provedor" não é hipótese: é o plano. Agora é uma linha em `composicao.ts`.
 *
 * ⚠️ O HISTÓRICO É SÓ TEXTO, e essa é a decisão de projeto mais consequente daqui.
 *
 * A cada mensagem recebida, o loop de ferramentas COMEÇA DE NOVO: replayamos as falas
 * (cliente e MAISA) e descartamos as chamadas de ferramenta dos turnos passados. Parece
 * desperdício e é o contrário:
 *
 *   • CORREÇÃO — resultado de ferramenta sobre agenda azeda em segundos. Um resultado
 *     de "quinta 15h está livre" replayado dez minutos depois faz o modelo reafirmar com
 *     convicção um horário que já foi tomado. Recontar é o que garante que a MAISA nunca
 *     fale de uma agenda velha.
 *   • FRONTEIRA — a porta `RepositorioHistorico` fala `Msg`, o tipo que a tela de
 *     Conversas já usa. Se ela guardasse blocos do provedor, trocar de modelo viraria
 *     migração de banco.
 *
 * O custo real é baixo: o histórico textual é curto, e o prefixo estável do prompt
 * (persona + catálogo) vai para o cache.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AvaliarAtendimento, LembrarCliente } from "@/nucleo/portas/entrada/casos-de-uso";
import type { RepositorioConversas, RepositorioHistorico } from "@/nucleo/portas/saida/memoria-cliente";
import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import type {
  ModeloDeConversa, ResultadoDeFerramenta, TurnoDeConversa,
} from "@/nucleo/portas/saida/modelo-conversa";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { Msg } from "@/nucleo/dominio/conversas";
import { hojeISO } from "@/nucleo/dominio/tempo";

import { bolhas, limparEntrada } from "./bolhas";
import { criarExecutor, FERRAMENTAS, novoEstado, type Dependencias as DepsFerramentas } from "./ferramentas";
import { parteDoCliente, parteEstavel, type ConfiguracaoDoAgente } from "./persona";

/** Voltas de ferramenta antes de desistir. Seis cobre o caminho mais longo real
 *  (oferecer → marcar) com folga; acima disso o modelo está girando, e girar custa
 *  dinheiro e silêncio para o cliente. */
const MAX_VOLTAS = 6;

/** Quantas mensagens de histórico replayar. 20 cobre a conversa de agendamento
 *  inteira; mais que isso é pagar token para lembrar de assunto encerrado. */
const HISTORICO = 20;

/**
 * Teto de saída por volta.
 *
 * Generoso para o que a MAISA fala (três bolhas de 320 caracteres cabem em ~250 tokens)
 * porque o pensamento sai do MESMO orçamento nos modelos atuais. Apertar isto não
 * economiza: faz o orçamento acabar dentro do raciocínio e a resposta voltar vazia, o
 * que o loop lê como "o modelo não teve nada a dizer" e escala para humano sem motivo.
 */
const MAX_TOKENS = 2000;

export type MensagemRecebida = {
  de: string;
  texto: string;
  /** O endereço cru, quando o WhatsApp mandou `…@lid`. Serve para achar o histórico da
   *  conversa, que pode estar guardado sob ele. Ver `HistoricoDoCanal`. */
  jid?: string;
};

/** Um passo de ferramenta, para inspeção. Alimenta o laboratório de conversa: ver que a
 *  MAISA chamou `oferecer_horarios` ANTES de falar de agenda é a única forma de saber
 *  que o guardrail está de pé — no texto da resposta, os dois casos parecem iguais. */
export type PassoDaTrilha = {
  ferramenta: string;
  entrada: Record<string, unknown>;
  resultado: string;
  erro: boolean;
};

export type RespostaDoAgente = {
  bolhas: string[];
  escalou: boolean;
  motivo?: string;
  /** Sempre preenchida — é barata. Produção ignora; o laboratório desenha. */
  trilha: PassoDaTrilha[];
  /** Quem respondeu. Aparece na trilha para não haver dúvida de qual provedor rodou. */
  modelo: string;
  voltas: number;
};

/**
 * De onde vem o que a MAISA sabe do negócio — resolvido POR INQUILINO, a cada mensagem.
 *
 * Era um objeto estático, e isso era o bug que impedia a feature inteira: montado uma vez
 * com os fixtures, ele anunciava `(id: sv1)` no prompt enquanto o cadastro real já falava
 * uuid. Ver o comentário de `ContextoDoTurno` em `ferramentas.ts` para a cadeia completa.
 *
 * Função e não objeto porque a MAISA é multi-inquilino por natureza: o mesmo processo
 * atende terapeutas e barbeiros, e "qual é o catálogo" só tem resposta depois de saber de
 * quem é a mensagem.
 */
export type ResolvedorDeConfiguracao = (t: ContextoTenant) => Promise<ConfiguracaoDoAgente>;

export type Dependencias = DepsFerramentas & {
  modelo: ModeloDeConversa;
  config: ResolvedorDeConfiguracao;
  lembrarCliente: LembrarCliente;
  /**
   * A MAISA pode falar com quem escreveu?
   *
   * O número pareado quase sempre é o celular PESSOAL do dono — barbearia pequena não tem
   * linha corporativa. Sem esta pergunta, ela oferece horário para o pai dele. Ver
   * `nucleo/dominio/contatos.ts` para a regra e o porquê de não ser lista de permissão.
   */
  avaliarAtendimento: AvaliarAtendimento;
  historico: RepositorioHistorico;
  /** Quem conduz a conversa. O agente LÊ e nunca escreve: assumir é gesto do dono. */
  conversas: RepositorioConversas;
  canal: CanalDeMensagens;
};

/** `Msg` do domínio → turnos da porta. "voce" (o dono assumiu) entra como assistente:
 *  para o cliente foi a mesma voz, e fingir que aquilo não foi dito faria a MAISA
 *  contradizer o próprio dono. */
const paraTurnos = (msgs: Msg[]): TurnoDeConversa[] =>
  msgs.map((m) =>
    m.de === "cliente"
      ? { papel: "cliente", texto: m.txt }
      : { papel: "assistente", texto: m.txt },
  );

/**
 * O prompt estável, memorizado por inquilino.
 *
 * ⚠️ Existe por causa do PROMPT CACHE, e o motivo é sutil. Cache é casamento de PREFIXO:
 * o provedor só reusa o trabalho se os primeiros bytes forem idênticos. `parteEstavel` é
 * determinística, então remontá-la daria a mesma string — mas ela é montada a partir de
 * LISTAS QUE VÊM DO BANCO, e o Postgres não promete ordem sem `order by`. Duas consultas
 * que devolvessem os mesmos serviços em ordem diferente produziriam dois prompts
 * diferentes, o cache erraria toda vez, e o único sintoma seria a fatura.
 *
 * (Hoje `listarServicos` e `listarProfissionais` ordenam por nome, então o risco está
 * coberto do outro lado também. Cinto e suspensório: este cache também evita remontar uma
 * string de alguns milhares de tokens a cada mensagem.)
 *
 * A validade curta é o preço: quando o dono mexe no preço, a MAISA leva até um minuto para
 * anunciar o valor novo. Um cache eterno faria o preço velho sobreviver ao redeploy;
 * remontar sempre custaria o cache do provedor. Um minuto é o intervalo em que nenhuma das
 * duas coisas incomoda.
 */
const VALIDADE_PROMPT_MS = 60_000;
const promptPorInquilino: Record<string, { texto: string; em: number }> = {};

function promptEstavel(tenantId: string, config: ConfiguracaoDoAgente): string {
  const cacheado = promptPorInquilino[tenantId];
  if (cacheado && Date.now() - cacheado.em < VALIDADE_PROMPT_MS) return cacheado.texto;
  const texto = parteEstavel(config);
  promptPorInquilino[tenantId] = { texto, em: Date.now() };
  return texto;
}

export function criarAgente(deps: Dependencias) {
  const executar = criarExecutor(deps);

  return async function responder(t: ContextoTenant, recebida: MensagemRecebida): Promise<RespostaDoAgente> {
    const vazia = (extra: Partial<RespostaDoAgente> = {}): RespostaDoAgente => ({
      bolhas: [], escalou: false, trilha: [], modelo: deps.modelo.nome, voltas: 0, ...extra,
    });

    const texto = limparEntrada(recebida.texto);
    if (!texto) return vazia();

    /* ── 0. o que a MAISA sabe deste negócio ──
     * Vem antes de tudo porque o catálogo, a equipe e o liga/desliga da assistente moram
     * aqui. Note o `try`: resolver isto agora fala com o banco, e antes não falava.
     *
     * ⚠️ ESTE CATCH É A DIFERENÇA ENTRE UM BUG VISÍVEL E UM INVISÍVEL. Se a config não
     * resolve — falta `SUPABASE_SERVICE_ROLE_KEY`, o inquilino não tem linha em `negocios`,
     * o banco caiu — sem ele a exceção sobe até a rota e o cliente recebe SILÊNCIO, que é o
     * pior modo de falha deste canal: ninguém sabe que algo quebrou. Escalando, o dono
     * recebe a causa no WhatsApp dele e o cliente recebe atendimento humano. */
    let config: ConfiguracaoDoAgente;
    try {
      config = await deps.config(t);
    } catch (e) {
      const causa = e instanceof Error ? e.message : String(e);
      console.error(`[whatsapp/agente] não foi possível carregar a configuração do inquilino ${t.tenantId}: ${causa}`);
      await deps.canal.escalar(t, { telefone: recebida.de, motivo: `a MAISA não conseguiu ler o cadastro do negócio: ${causa}` });
      return vazia({ escalou: true, motivo: `configuração indisponível: ${causa}` });
    }

    /* ── 1. quem está falando ──
     * Antes de qualquer token. O telefone vem do envelope da mensagem, nunca do conteúdo
     * dela: quem se identifica no corpo pode se identificar como outro.
     *
     * ⚠️ ISTO SUBIU PARA CIMA DO "a MAISA está ligada?", que era o passo 0b. Motivo: sem o
     * perfil não há telefone, e sem telefone não há como REGISTRAR a mensagem — então toda
     * conversa em que a MAISA não responde era uma conversa que o painel nunca via. Custa uma
     * leitura de memória num caminho que vai devolver silêncio, e paga com a única coisa que o
     * dono tem naquele momento: saber que alguém escreveu. */
    const perfil = await deps.lembrarCliente(t, recebida.de);

    /* As duas juntas: tabelas diferentes, nenhuma depende da outra, e este é o caminho quente
     * — o cliente está com a tela aberta esperando. Em série seria um round-trip a mais. */
    const [anteriores, posse] = await Promise.all([
      deps.historico.ler(t, perfil.telefone, HISTORICO),
      deps.conversas.posse(t, perfil.telefone),
    ]);

    /* ── 1b. A FALA DO CLIENTE ENTRA NA THREAD AGORA ──
     *
     * ⚠️ ANTES DE QUALQUER DECISÃO, e essa é a correção mais consequente deste arquivo para o
     * painel. Antes a gravação era o passo 4, depois de responder — então TODO caminho de
     * desistência (`return` antecipado) descartava a pergunta do cliente junto com a resposta
     * que não houve: assistente desligada, conteúdo recusado pelo provedor, seis voltas sem
     * conclusão, e o pior de todos — "tentou marcar e não conseguiu".
     *
     * O resultado era o inverso do necessário: a conversa que mais exige o dono era a ÚNICA
     * invisível na tela dele. Ele recebia o aviso de escalada no WhatsApp e não achava a
     * conversa em lugar nenhum no painel.
     *
     * Gravar aqui também torna o registro independente de o resto do turno dar certo: se o
     * modelo estourar, a pergunta continua na thread. Custa um INSERT a mais por turno (as
     * bolhas da resposta vão num segundo, no passo 4) — e é o INSERT que faz a tela de
     * Conversas ser um retrato do WhatsApp em vez de um retrato dos turnos bem-sucedidos. */
    await deps.historico.anexar(t, perfil.telefone, [{ de: "cliente", txt: texto }]);

    /* ── 1c. a MAISA está ligada? ──
     * Guardrail de produto: o dono pode desligar a assistente na tela "A MAISA".
     * Desligada significa desligada — nem uma mensagem de "estou fora do ar", que já
     * seria a MAISA falando com o cliente dele. */
    if (!config.assistente.ativa) {
      return vazia({ escalou: true, motivo: "assistente desligada" });
    }

    /* ── 1d. ESTA CONVERSA É DO DONO ──
     *
     * Ele clicou em "Assumir" no painel, ou respondeu à mão (responder É assumir — ver
     * `criarResponderConversa`). A MAISA cala a boca até ele devolver.
     *
     * Este é o passo que faz o botão parar de mentir. Enquanto a posse morava no
     * `localStorage`, o toast dizia "a MAISA não responde mais aqui" e o webhook nunca soube:
     * o dono respondia, o cliente respondia de volta, e a MAISA falava por cima dele — duas
     * vozes na mesma conversa, que é exatamente o que a tela de Conversas foi desenhada para
     * impedir. Ver `RepositorioConversas`.
     *
     * NÃO escala: escalar avisaria o dono de uma conversa que ele já está conduzindo. E não
     * responde nada ao cliente — quem responde é o dono, e ele já está lá. */
    if (posse.assumidaEm) {
      return vazia({ motivo: "conversa assumida pelo dono" });
    }

    /* ── 1e. ESTA PESSOA É DA VIDA PESSOAL DO DONO ──
     *
     * O número pareado quase sempre é o celular dele: barbearia pequena e consultório de uma
     * pessoa não têm linha corporativa. Sem este passo, a MAISA oferece horário para o pai
     * dele — e essa é a primeira coisa que o dono conta para todo mundo sobre o produto.
     *
     * ⚠️ DEPOIS DO 1b DE PROPÓSITO. A fala do cliente já está na thread, então o dono VÊ na
     * tela de Conversas que alguém escreveu e que a MAISA não respondeu. Silêncio sem
     * registro seria o pior desfecho: ele descobriria só quando a pessoa reclamasse.
     *
     * ⚠️ E NÃO ESCALA. Escalar aqui mandaria um 🔔 no WhatsApp do dono a cada mensagem da
     * mãe dele — o produto avisando sobre a vida pessoal de quem o comprou. A regra é
     * "MAISA não fala"; quem fala é ele, quando quiser, como já fazia antes de ter MAISA.
     *
     * A decisão em si é `dominio/contatos.podeResponder`, pura e testada. Aqui só se obedece. */
    const atendimento = await deps.avaliarAtendimento(t, {
      telefone: perfil.telefone,
      jid: recebida.jid,
      anteriores,
      texto,
    });
    if (!atendimento.pode) {
      console.info(`[whatsapp/agente] silêncio para ${perfil.telefone} no inquilino ${t.tenantId}: ${atendimento.motivo}`);
      return vazia({ motivo: atendimento.motivo ?? "contato pessoal do dono" });
    }

    /* O nome que o dono salvou no celular, quando a memória ainda não tem um.
     *
     * É o maior pedaço do valor do caderno e ele vale nos dois modos: quem escreve pela
     * primeira vez ouve "Oi, Fernanda!" em vez de "Oi!". A ordem importa — a memória ganha,
     * porque lá está o nome que a PESSOA disse, e ele vale mais que a etiqueta que o dono
     * escolheu ("Fernanda cabelo", "João pneu"). */
    if (!perfil.nome && atendimento.nome) perfil.nome = atendimento.nome;

    const sistemaVolatil = parteDoCliente({ perfil, hojeISO: hojeISO() });
    const turnos: TurnoDeConversa[] = [...paraTurnos(anteriores), { papel: "cliente", texto }];

    const estado = novoEstado();
    const trilha: PassoDaTrilha[] = [];
    let ultimoTexto = "";
    let voltas = 0;

    /* ── 2. o loop ── */
    for (voltas = 1; voltas <= MAX_VOLTAS; voltas++) {
      const resposta = await deps.modelo.conversar({
        sistemaEstavel: promptEstavel(t.tenantId, config),
        sistemaVolatil,
        ferramentas: FERRAMENTAS,
        turnos,
        maxTokens: MAX_TOKENS,
      });

      /* Recusa do classificador de segurança do provedor. Não é erro de código e não se
       * resolve tentando de novo. O cliente não pode receber a recusa (ele mandou uma
       * mensagem de WhatsApp, não um jailbreak declarado) — então o dono assume. */
      if (resposta.recusou) {
        await deps.canal.escalar(t, { telefone: perfil.telefone, motivo: "conteúdo recusado pelo modelo" });
        return vazia({ escalou: true, motivo: "recusa do modelo", trilha, voltas });
      }

      if (resposta.texto) ultimoTexto = resposta.texto;

      // Sem chamada de ferramenta: o modelo já disse o que tinha a dizer.
      if (resposta.chamadas.length === 0) break;

      turnos.push({ papel: "assistente_ferramentas", texto: resposta.texto || undefined, chamadas: resposta.chamadas });

      const resultados: ResultadoDeFerramenta[] = [];
      for (const chamada of resposta.chamadas) {
        const r = await executar({ t, perfil, estado, config }, chamada.nome, chamada.argumentos);
        resultados.push({ id: chamada.id, nome: chamada.nome, texto: r.texto, erro: r.erro });
        trilha.push({ ferramenta: chamada.nome, entrada: chamada.argumentos, resultado: r.texto, erro: r.erro });
      }

      /* TODOS os resultados num único turno. Espalhar em vários ensina o modelo a parar
       * de pedir ferramentas em paralelo — e aí cada consulta de agenda vira uma volta
       * inteira do loop. */
      turnos.push({ papel: "resultados", resultados });
    }

    /* ── 3. o loop girou sem chegar a nada ──
     * Silêncio não é opção num canal onde o cliente está esperando, e insistir também
     * não: se seis voltas não resolveram, a sétima não resolve. O dono assume. */
    if (!ultimoTexto) {
      await deps.canal.escalar(t, { telefone: perfil.telefone, motivo: "agente não concluiu o atendimento" });
      return vazia({ escalou: true, motivo: "sem resposta do agente", trilha, voltas });
    }

    /* ── 3b. ELE TENTOU MARCAR, NÃO CONSEGUIU, E ESTÁ RESPONDENDO COMO SE TIVESSE ──
     *
     * ⚠️ O GUARDRAIL MAIS IMPORTANTE DESTE ARQUIVO, e o único que nasceu de um caso
     * observado em conversa real de teste. A MAISA respondeu "Pronto, Carla! Agendado para
     * amanhã às 09:00 com o Rafael" com a agenda vazia: `agendar` havia sido recusado pelo
     * guardrail de oferta, o modelo consultou os horários, recebeu 09:00 livre — e escreveu
     * a confirmação em vez de chamar `agendar` de novo. Como o turno terminou sem chamada de
     * ferramenta, o loop deu por encerrado e a frase seguiu para o cliente.
     *
     * Por que não dá para resolver lendo o texto: "Pronto, agendado!" e "Consigo às 09:00,
     * confirma?" são, para qualquer heurística de string, a mesma frase com uma palavra
     * diferente — e errar para o lado permissivo é entregar a mentira. O sinal ESTRUTURAL é
     * confiável e não depende de redação nenhuma: houve tentativa de marcar, não houve
     * sucesso, então nada que o modelo escreva agora pode ser tratado como confirmação.
     *
     * Escalar em vez de deixar passar é a escolha de risco óbvia quando se olha os dois
     * erros: um falso positivo custa uma conversa que vai para o dono sem precisar; um falso
     * negativo custa o cliente aparecendo num horário que não existe, o dono com o horário
     * livre e ninguém sabendo até o dia. Não é simétrico.
     *
     * ⚠️ Não afrouxe isto para "só quando o texto parecer confirmação". A camada de texto é
     * a camada 3, e ela é sugestão. */
    /* `jaEstavaMarcado` desarma o FALSO POSITIVO, e é a única saída deste `if` que não
     * exige um agendamento novo neste turno. Ele não afrouxa nada: só é ligado depois de uma
     * LEITURA DA AGENDA encontrar a marca da MAISA naquele horário com o telefone deste
     * cliente (ver `ferramentas.ts` → `jaMarcadoPara`). Continua sendo sinal estrutural,
     * não heurística de texto — o caso "o modelo inventou um horário" segue escalando.
     *
     * Sem isto, reconfirmar um atendimento no turno seguinte era tratado como mentira: o
     * dono era chamado no meio de um atendimento que deu certo e o cliente recebia silêncio
     * depois de dizer o próprio nome. Medido em produção em 12/08/2026. */
    if (estado.tentouAgendar && !estado.marcou && !estado.jaEstavaMarcado) {
      console.error(
        `[whatsapp/agente] o modelo tentou marcar, não conseguiu, e respondeu como se tivesse marcado — ` +
          `resposta descartada (inquilino ${t.tenantId}, telefone ${perfil.telefone}): ${ultimoTexto.slice(0, 200)}`,
      );
      await deps.canal.escalar(t, {
        telefone: perfil.telefone,
        motivo: "a MAISA tentou marcar e não conseguiu — confirme o horário com o cliente à mão antes de qualquer coisa",
      });
      return vazia({ escalou: true, motivo: "confirmação sem agendamento", trilha, voltas });
    }

    const saida = bolhas(ultimoTexto);

    /* ── 4. gravar o que aconteceu ──
     * Depois de responder, nunca antes: memória é registro de fato, e "o cliente marcou"
     * só é fato quando o provedor confirmou (ver `EstadoDoTurno.marcou`).
     *
     * `escolha` alimenta a inferência de favoritos — é ela que, na terceira visita, faz
     * a MAISA saber que essa pessoa gosta de quinta à tarde com o Rafael. */
    if (estado.marcou) {
      await deps.anotarFato(t, { telefone: perfil.telefone, escolha: estado.marcou });
    }

    /* Só as bolhas da MAISA: a fala do cliente foi gravada no passo 1b, antes de o turno ter
     * qualquer chance de desistir. Repeti-la aqui duplicaria a pergunta na tela. */
    await deps.historico.anexar(t, perfil.telefone, saida.map((txt) => ({ de: "bot" as const, txt })));

    await deps.canal.enviar(t, perfil.telefone, saida);

    return {
      bolhas: saida,
      escalou: !!estado.escalou,
      motivo: estado.escalou?.motivo,
      trilha,
      modelo: deps.modelo.nome,
      voltas,
    };
  };
}
