/* ─────────────────────────────────────────────────────────────────────────────
 * FERRAMENTAS — os casos de uso expostos ao modelo, e a camada que o desconfia.
 *
 * O `LEIA-ME.md` desta pasta prometia que as ferramentas do agente JÁ EXISTEM: são
 * `nucleo/portas/entrada/casos-de-uso.ts`. Isto aqui é a tradução — e a tradução é
 * onde ficam os guardrails que o núcleo não tem como ter.
 *
 * TRÊS CAMADAS DE GUARDRAIL, e é importante saber qual protege de quê:
 *
 *   1. NÚCLEO — recusa o impossível: data que não existe, hora fora do dia, agenda de
 *      outro inquilino, atendimento duplicado. Vale para o painel também.
 *   2. AQUI — recusa o ALUCINADO: horário que ninguém ofereceu, serviço que não está
 *      no catálogo, id que o modelo compôs porque parecia plausível. O painel não
 *      precisa disso (um humano não inventa id); o agente precisa.
 *   3. PROMPT — pede bom comportamento. É a camada mais fraca, e a única que não
 *      vale como garantia.
 *
 * A camada 2 existe porque a 1 não consegue distinguir "14h que o cliente escolheu de
 * uma lista" de "14h que o modelo achou razoável". Para o núcleo, os dois são um
 * pedido válido de agendamento.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHash } from "crypto";

import type { DefinicaoDeFerramenta } from "@/nucleo/portas/saida/modelo-conversa";
import type {
  AgendarAtendimento, AnotarFato, CancelarAtendimento, LerAgenda, OferecerHorarios,
  PerfilDeCliente, ResponderDuvida,
} from "@/nucleo/portas/entrada/casos-de-uso";
import type { CanalDeMensagens } from "@/nucleo/portas/saida/canal-mensagens";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { Escolha } from "@/nucleo/dominio/memoria";
import { DadoInvalido, ErroDeDominio, LimiteDoProvedor, NaoEncontrado, PrecisaReconectar } from "@/nucleo/dominio/erros";
import { hojeISO, horaFalada, rotuloLongo, somarDias } from "@/nucleo/dominio/tempo";
import { soDigitos } from "@/nucleo/dominio/clientes";
import type { ConfiguracaoDoAgente } from "./persona";

/* ───────────────────────────── estado do turno ───────────────────────────── */

/**
 * O que o agente fez neste turno. Existe por três razões, todas de guardrail:
 *
 *   • `ofertas` — a lista branca de horários que PODEM ser marcados. Sem ela, o
 *     modelo marca o horário que ele acha que existe.
 *   • `escalou` — desistir é uma decisão do turno, não uma mensagem. O loop precisa
 *     saber para calar a MAISA e chamar o dono.
 *   • `marcou` — o fato que vai para a memória. Só é gravado quando o agendamento
 *     REALMENTE voltou do provedor: gravar a intenção em vez do resultado ensinaria
 *     preferência a partir de horários que nunca aconteceram.
 */
export type EstadoDoTurno = {
  ofertas: Map<string, { agendaId: string; data: string; inicio: number; servicoId: string; duracaoMin: number }>;
  escalou: { motivo: string } | null;
  marcou: Escolha | null;
  /**
   * O modelo TENTOU marcar em algum momento deste turno — inclusive tentativas recusadas.
   *
   * ⚠️ Existe por causa do pior bug já observado neste produto, e ele foi MEDIDO, não
   * imaginado: numa conversa de teste a MAISA respondeu "Pronto, Carla! Agendado para
   * amanhã às 09:00 com o Rafael" com a agenda VAZIA. A mecânica: `agendar` foi recusado
   * pelo guardrail de oferta, o modelo chamou `oferecer_horarios`, recebeu o horário livre
   * — e então escreveu a confirmação em vez de chamar `agendar` outra vez. O loop encerra
   * quando não vem chamada de ferramenta, e a frase saiu como se fosse fato.
   *
   * Comparado com `marcou`, este flag é o que permite a pergunta que denuncia a mentira:
   * "ele tentou marcar e não conseguiu, mas está respondendo como se tivesse conseguido?"
   * Sem ele, os dois casos — "tentou e desistiu honestamente" e "tentou e mentiu" — são
   * indistinguíveis para o loop.
   */
  tentouAgendar: boolean;

  /**
   * O horário que o modelo pediu JÁ ESTAVA marcado para este cliente — verificado na
   * agenda, não deduzido do texto.
   *
   * ⚠️ Existe para desarmar um FALSO POSITIVO real do guardrail de `tentouAgendar`, que
   * apareceu no primeiro teste em produção:
   *
   *   turno 2  "10:30 pode ser, marca"  → marcou de verdade + "qual seu primeiro nome?"
   *   turno 3  "Bruno"                  → escalou: "confirmação sem agendamento"
   *
   * `EstadoDoTurno` é POR TURNO, então no turno 3 o `ofertas` nasce vazio. O modelo chamou
   * `agendar` de novo (comportamento razoável: ele estava fechando), a allowlist recusou
   * porque ninguém ofertou nada naquele turno, e o loop concluiu "tentou e não conseguiu,
   * logo está mentindo". Só que não estava: o atendimento existia. Resultado — o dono é
   * chamado no meio de um atendimento que deu certo, e o cliente recebe SILÊNCIO depois de
   * dizer o próprio nome.
   *
   * Este flag é o único jeito de distinguir os dois casos sem olhar o texto da resposta,
   * que é exactamente o que o comentário do guardrail em `agente.ts` proíbe. Ele só é
   * ligado depois de uma leitura da agenda real encontrar a marca da MAISA naquele horário,
   * com o telefone deste cliente. Não afrouxa o guardrail: o caminho "modelo inventou um
   * horário que ninguém ofereceu e ninguém marcou" continua escalando.
   */
  jaEstavaMarcado: boolean;
};

export const novoEstado = (): EstadoDoTurno => ({
  ofertas: new Map(), escalou: null, marcou: null, tentouAgendar: false, jaEstavaMarcado: false,
});

const chaveOferta = (servicoId: string, agendaId: string, data: string, inicio: number) =>
  `${servicoId}|${agendaId}|${data}|${inicio}`;

/* ───────────────────────────── idempotência ───────────────────────────── */

/**
 * A chave de idempotência, DERIVADA em vez de sorteada.
 *
 * `agendarAtendimento` exige um uuid v4 e usa ele para não criar o mesmo atendimento
 * duas vezes. No painel o uuid nasce do clique, e um clique é único. No WhatsApp não
 * há clique: um modelo que não recebeu a resposta da ferramenta TENTA DE NOVO — é o
 * comportamento normal dele. Com uuid aleatório, a segunda tentativa é um atendimento
 * novo, e o cliente fica com dois horários às 14h.
 *
 * Derivando de (inquilino, telefone, serviço, dia, hora), a retentativa produz a MESMA
 * chave, o núcleo encontra o evento que a primeira tentativa criou e devolve
 * `ja_existia`. A proteção passa a funcionar sem o modelo colaborar — que é o único
 * jeito de ela funcionar.
 *
 * Formatado como uuid v4 (nibble de versão e variante forçados) porque `ehUuid()` no
 * domínio exige o formato canônico, e afrouxar essa validação para caber aqui
 * enfraqueceria a checagem para todos os chamadores.
 */
function chaveIdempotente(...partes: string[]): string {
  const h = createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 32).split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) % 4];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/* ───────────────────────────── conversão ───────────────────────────── */

/**
 * "15:30" → 15.5.
 *
 * O modelo escreve hora como gente escreve. O domínio fala hora decimal. Pedir 15.5
 * ao modelo funcionaria na maioria das vezes e produziria 15.3 para "15:30" no resto
 * — erro silencioso de 12 minutos, que ninguém percebe até o cliente chegar.
 */
function horaDecimal(v: unknown): number | null {
  /* "15:30", "15h30", "15h" e "15": as horas chegam ao modelo como se falam ("15h30", ver
   * `horaFalada`), e ele devolve do jeito que leu — ou do jeito que o esquema sugere. */
  const m = /^(\d{1,2})(?:[:h](\d{2})?)?h?$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

/** Erro de domínio → frase que o modelo pode transformar em resposta.
 *
 *  É a promessa do `dominio/erros.ts`: "o agente de WhatsApp vai virar uma frase".
 *  Note que a frase é dirigida ao MODELO, não ao cliente — ela diz o que fazer a
 *  seguir. Devolver "erro 400" faria o modelo dizer ao cliente que deu erro. */
function comoFrase(e: unknown): string {
  if (e instanceof DadoInvalido) return `Não deu: ${e.motivo} Peça a informação certa ao cliente e tente de novo.`;
  if (e instanceof NaoEncontrado) return `${e.recurso} não existe. Confira os ids da lista de serviços e da equipe.`;
  if (e instanceof LimiteDoProvedor) return "A agenda está ocupada respondendo. Espere e chame esta ferramenta de novo.";
  if (e instanceof PrecisaReconectar) return "A agenda do negócio se desconectou. Chame o responsável com `chamar_humano` — isto não se resolve com o cliente.";
  if (e instanceof ErroDeDominio) return `Não deu: ${e.message}`;
  console.error("[whatsapp/ferramentas] falha inesperada", e);
  return "Deu um problema técnico aqui. Chame o responsável com `chamar_humano`.";
}

/* ───────────────────────────── definições ───────────────────────────── */

/**
 * O que o modelo vê. Descrições longas de propósito: descrição de ferramenta é o
 * fator que mais move comportamento de agente, e a falha comum é descrever DE MENOS.
 * Cada uma diz QUANDO chamar, não só o que faz.
 */
export const FERRAMENTAS: DefinicaoDeFerramenta[] = [
  {
    nome: "oferecer_horarios",
    descricao:
      "Consulta a agenda real e devolve horários livres. Chame SEMPRE antes de falar qualquer coisa sobre disponibilidade — você não sabe o que está livre sem isso, e não pode marcar um horário que não veio daqui. Use quando o cliente perguntar se tem vaga, pedir para marcar, sugerir um dia, ou quando você precisar oferecer alternativa depois de um 'não'. Se ele não disse o dia, comece de hoje. Se não disse o profissional, deixe em branco e você recebe as opções de todos que fazem o serviço.",
    parametros: {
      type: "object",
      properties: {
        /* ⚠️ SEM EXEMPLO DE FORMATO, de propósito. Estas descrições diziam "ex.: sv1" e
         * "ex.: pr1" — o formato dos fixtures. Quando o cadastro virou banco, os ids
         * passaram a ser uuid, e o exemplo deixou de ser ajuda para virar INSTRUÇÃO ERRADA:
         * um modelo que não achasse o id na lista tinha um molde plausível para inventar.
         * "copie da lista" é a única instrução que continua verdadeira nos dois modos. */
        servico_id: { type: "string", description: "Id do serviço, copiado exatamente da lista de serviços do seu prompt. Obrigatório — a duração do serviço é o que define o que é vago." },
        data_inicial: { type: "string", description: "Dia a partir do qual procurar, no formato AAAA-MM-DD. Omita para começar de hoje." },
        dias: { type: "integer", description: "Quantos dias varrer a partir de data_inicial. Padrão 7. Use 1 quando o cliente pediu um dia específico." },
        profissional_id: { type: "string", description: "Id do profissional, copiado exatamente da lista de quem atende. Só quando o cliente pediu alguém por nome." },
      },
      required: ["servico_id"],
    },
  },
  {
    nome: "agendar",
    descricao:
      "Marca o atendimento de verdade na agenda. Só chame depois de o cliente ter escolhido, em texto, um horário que veio de `oferecer_horarios` nesta conversa. Não chame para confirmar intenção ('quero quinta') — só quando ele fechou um horário exato. Depois de chamar, confirme em uma mensagem curta com dia, hora e profissional.",
    parametros: {
      type: "object",
      properties: {
        servico_id: { type: "string", description: "Id do serviço." },
        profissional_id: { type: "string", description: "Id do profissional cuja agenda recebeu a oferta." },
        data: { type: "string", description: "AAAA-MM-DD." },
        hora: { type: "string", description: "A hora escolhida, como veio de oferecer_horarios (ex.: 15h30)." },
        nome_cliente: { type: "string", description: "Primeiro nome, se você souber e ele ainda não estiver no cadastro." },
      },
      required: ["servico_id", "profissional_id", "data", "hora"],
    },
  },
  {
    nome: "meus_horarios",
    descricao:
      "Lista os próximos atendimentos JÁ MARCADOS deste cliente. Chame quando ele perguntar quando é o horário dele, quiser cancelar ou remarcar, ou disser que não lembra. É a única forma de obter o evento_id que `cancelar` exige — nunca invente um.",
    parametros: { type: "object", properties: {} },
  },
  {
    nome: "cancelar",
    descricao:
      "Cancela um atendimento marcado. Só chame com um evento_id que veio de `meus_horarios`, e só depois de o cliente confirmar que quer cancelar aquele horário específico. Para remarcar: ofereça os horários novos primeiro; quando o cliente escolher, cancele o antigo e marque o novo.",
    parametros: {
      type: "object",
      properties: {
        evento_id: { type: "string", description: "Id vindo de meus_horarios." },
        profissional_id: { type: "string", description: "Id do profissional daquele atendimento, vindo de meus_horarios." },
      },
      required: ["evento_id", "profissional_id"],
    },
  },
  {
    nome: "anotar_nome",
    descricao:
      "Guarda o nome do cliente para as próximas conversas. Chame na hora em que ele disser como se chama. Não pergunte o nome só para poder chamar isto — pergunte quando for marcar.",
    parametros: {
      type: "object",
      properties: { nome: { type: "string", description: "Só o primeiro nome, como ele escreveu." } },
      required: ["nome"],
    },
  },
  {
    nome: "responder_duvidas",
    descricao:
      "Procura, nas respostas que o dono do negócio cadastrou, o que responde a pergunta do cliente. Chame SEMPRE que a pergunta não for sobre agenda — endereço, estacionamento, formas de pagamento, política de atraso, se atende criança, o que levar. A busca é por sentido, então mande a pergunta do cliente COM AS PALAVRAS DELE, sem reescrever. Se voltar vazio, o dono não cadastrou aquilo: diga que vai confirmar e chame o responsável — nunca invente a resposta nem deduza a partir do resto do prompt.",
    parametros: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A dúvida do cliente, como ele escreveu." },
      },
      required: ["pergunta"],
    },
  },
  {
    nome: "chamar_humano",
    descricao:
      "Avisa o responsável, que vai continuar a conversa. Chame quando: não souber a resposta e não houver ferramenta que resolva; pedirem desconto, exceção ou algo fora do seu alcance; a pessoa estiver irritada ou reclamando de atendimento; pedir para falar com alguém; houver sinal de risco à vida; o assunto exigir julgamento profissional; ou algo der errado duas vezes. Chamar o responsável não é falha — é o comportamento certo. Chame uma vez por assunto: se você já chamou nesta conversa pelo mesmo motivo, não chame de novo. Depois de chamar, diga ao cliente numa frase curta que vai falar com o responsável e já retorna.",
    parametros: {
      type: "object",
      properties: { motivo: { type: "string", description: "Uma frase para o responsável entender o que precisa dele." } },
      required: ["motivo"],
    },
  },
];

/* ───────────────────────────── execução ───────────────────────────── */

export type Dependencias = {
  oferecerHorarios: OferecerHorarios;
  agendarAtendimento: AgendarAtendimento;
  cancelarAtendimento: CancelarAtendimento;
  lerAgenda: LerAgenda;
  anotarFato: AnotarFato;
  canal: CanalDeMensagens;
  /* A busca nas respostas que o dono cadastrou. Substituiu, em 15/08/2026, o bloco de FAQ
   * que a `persona.ts` colava no prompt a partir de uma fixture de demonstração. */
  responderDuvida: ResponderDuvida;
};

/**
 * O que vale só para ESTE turno — e `config` está aqui por um bug que custou 100% da
 * feature.
 *
 * Ela era dependência de CRIAÇÃO, montada uma vez com os fixtures. Enquanto o cadastro
 * também era fixture, as duas metades falavam `"sv1"` e ninguém percebia. No dia em que
 * `composicao.ts` trocou o cadastro para o Supabase, elas passaram a discordar sobre o que
 * é um id: o prompt anunciava `(id: sv1)`, o modelo devolvia `servico_id: "sv1"`, e o
 * adaptador consultava uma coluna `uuid` — que devolve `null`. A MAISA conversava,
 * entendia, e escalava para humano em toda tentativa de marcar.
 *
 * Por inquilino e por turno, o id que o modelo vê é o id que o banco conhece. E a assinatura
 * passa a IMPEDIR a volta do bug: não existe mais onde guardar uma config de um inquilino só.
 */
export type ContextoDoTurno = {
  t: ContextoTenant;
  perfil: PerfilDeCliente;
  estado: EstadoDoTurno;
  config: ConfiguracaoDoAgente;
};

/** Janela de "próximos atendimentos". 60 dias: quem marcou para depois disso é raro,
 *  e varrer mais é pagar leitura de agenda por nada. */
const DIAS_A_FRENTE = 60;

export function criarExecutor(deps: Dependencias) {
  /**
   * Executa uma ferramenta. Devolve TEXTO — nunca lança.
   *
   * Nunca lançar é deliberado: uma exceção aqui derrubaria o turno e o cliente ficaria
   * sem resposta nenhuma, que é o pior resultado possível num canal onde ele está
   * esperando. Erro vira `tool_result` com `is_error`, o modelo lê e contorna.
   */
  return async function executar(
    turno: ContextoDoTurno,
    nome: string,
    entrada: Record<string, unknown>,
  ): Promise<{ texto: string; erro: boolean }> {
    const { t, perfil, estado, config } = turno;

    const nomeServico = (id: string) => config.servicos.find((s) => s.id === id)?.nome ?? id;
    const nomeProf = (id: string) => config.profissionais.find((p) => p.id === id)?.nome ?? id;
    const agendasAtivas = () => config.profissionais.filter((p) => p.ativo).map((p) => p.id);

    const ok = (texto: string) => ({ texto, erro: false });
    const nao = (texto: string) => ({ texto, erro: true });

    /**
     * Este cliente já tem ESTE horário marcado?
     *
     * Lê a agenda do dia e procura a marca da MAISA com o telefone dele. O filtro é o
     * mesmo do `meus_horarios`, e as duas condições continuam sendo de privacidade: sem
     * `e.maisa` isto responderia "sim" para um compromisso pessoal do dono que por
     * coincidência cai nesse horário, e sem o telefone responderia "sim" para o
     * atendimento de OUTRO cliente — que faria a MAISA confirmar para a pessoa errada um
     * horário que não é dela.
     *
     * Janela de um dia só: a pergunta é sobre um instante específico, não sobre a agenda.
     */
    const jaMarcadoPara = async (agendaId: string, data: string, inicio: number): Promise<boolean> => {
      const meus = soDigitos(perfil.telefone).slice(-8);
      if (meus.length < 8) return false;
      try {
        const r = await deps.lerAgenda(t, { agendaId, de: data, ate: data });
        return r.eventos.some(
          (e) => e.data === data && e.inicio === inicio && e.maisa && soDigitos(e.maisa.clienteTel).slice(-8) === meus,
        );
      } catch {
        /* Falhou a leitura? Responde NÃO. O custo dos dois erros é assimétrico: um falso
         * negativo devolve a recusa de sempre (e o modelo chama `oferecer_horarios`, que é
         * o comportamento certo); um falso positivo faria a MAISA confirmar para o cliente
         * um atendimento que talvez não exista. Na dúvida, o guardrail original vale. */
        return false;
      }
    };

    try {
      switch (nome) {
        /* ── horários livres ── */
        case "oferecer_horarios": {
          const r = await deps.oferecerHorarios(t, {
            servicoId: String(entrada.servico_id ?? ""),
            agendaId: entrada.profissional_id ? String(entrada.profissional_id) : undefined,
            de: entrada.data_inicial ? String(entrada.data_inicial) : hojeISO(),
            dias: entrada.dias != null ? Number(entrada.dias) : undefined,
          });

          if (r.dias.length === 0) {
            // Frase, não lista vazia: `[]` faria o modelo dizer "não tenho nada" sem
            // oferecer o passo seguinte, e a conversa morreria num não.
            return ok(
              `Nenhum horário livre para ${r.servicoNome} nesse período. Ofereça procurar mais à frente, ou pergunte se outro dia serve.`,
            );
          }

          /* Registra a oferta ANTES de devolver. É esta linha que dá poder ao
           * guardrail do `agendar`: o que não passou por aqui não pode ser marcado. */
          const linhas = r.dias.map((d) => {
            for (const h of d.horarios) {
              estado.ofertas.set(chaveOferta(String(entrada.servico_id), d.agendaId, d.data, h), {
                agendaId: d.agendaId,
                data: d.data,
                inicio: h,
                servicoId: String(entrada.servico_id),
                duracaoMin: r.duracaoMin,
              });
            }
            return `${rotuloLongo(d.data)} (${d.data}) com ${nomeProf(d.agendaId)} [${d.agendaId}]: ${d.horarios.map(horaFalada).join(", ")}`;
          });

          return ok(
            `${r.servicoNome}, ${r.duracaoMin} min. Horários livres:\n${linhas.join("\n")}\n\n` +
              "Ofereça no máximo duas ou três opções na mensagem — não repasse a lista inteira.",
          );
        }

        /* ── marcar ── */
        case "agendar": {
          /* ── NOME ANTES DE MARCAR, e esta checagem vem ANTES do `tentouAgendar` ──
           *
           * ⚠️ A ORDEM É O PONTO. Se este `return` acontecesse depois de `tentouAgendar = true`,
           * o guardrail no fim do turno veria "tentou marcar, não marcou" e escalaria para o
           * dono — justamente quando o modelo fez a coisa CERTA (parou para perguntar o nome).
           * Recusa que manda fazer uma pergunta não é tentativa frustrada. Não mova isto.
           *
           * Por que existe: `agendarAtendimento` cai em `"Cliente"` quando não recebe nome, e
           * isso agora tem consequência de banco — `garantirCliente` CRIA a linha do cliente,
           * e ela nasceria com o nome "Cliente" para sempre (o adaptador não sobrescreve nome
           * de cliente existente, de propósito). Medido em produção em 12/08/2026: o primeiro
           * atendimento real ficou com `cliente_nome: "Cliente"` porque o modelo marcou antes
           * de perguntar.
           *
           * A `persona.ts` já pede "peça o primeiro nome antes de confirmar", e o modelo
           * ignorou — porque prompt é a camada 3, a que não vale como garantia. Em código, vale.
           *
           * Só vale para LEAD: quem já está no cadastro tem nome digitado pelo dono, e
           * `agendarAtendimento` usa aquele. Perguntar o nome de um cliente conhecido seria a
           * MAISA parecendo não lembrar de quem já é cliente. */
          if (!perfil.clienteId && !String(entrada.nome_cliente ?? perfil.nome ?? "").trim()) {
            return nao(
              "Você ainda não sabe o nome dessa pessoa, e ela não está no cadastro — então não posso marcar ainda. " +
                "Pergunte só o primeiro nome dela numa mensagem curta e, quando ela responder, chame `agendar` de novo passando `nome_cliente`.",
            );
          }

          /* Marca a INTENÇÃO, antes de qualquer validação. Tem que ser aqui e não depois do
           * sucesso: é justamente a tentativa que FALHA que precisa ser lembrada, para o
           * loop poder recusar uma confirmação sem agendamento. Ver `EstadoDoTurno`. */
          estado.tentouAgendar = true;

          const inicio = horaDecimal(entrada.hora);
          if (inicio === null) return nao("Hora fora de formato. Use HH:MM em 24h, ex.: 15:30.");

          const servicoId = String(entrada.servico_id ?? "");
          const agendaId = String(entrada.profissional_id ?? "");
          const data = String(entrada.data ?? "");

          /* ⚠️ O GUARDRAIL PRINCIPAL DESTE ARQUIVO.
           *
           * O horário tem que ter saído de `oferecer_horarios` neste turno. Sem esta
           * checagem, o caminho de falha é silencioso e caro: o modelo diz "tenho
           * quinta às 15h" sem consultar, o cliente aceita, `agendar` passa (o núcleo
           * não tem como saber que ninguém ofereceu 15h), o evento é criado em cima do
           * almoço do dono — e todo mundo só descobre na quinta. */
          if (!estado.ofertas.has(chaveOferta(servicoId, agendaId, data, inicio))) {
            /* ── ANTES DE RECUSAR: isso já não está marcado? ──
             *
             * `EstadoDoTurno` é por turno, então o modelo que fecha o agendamento num turno
             * e RECONFIRMA no seguinte cai aqui com `ofertas` vazio — sem ter inventado
             * nada. Foi o falso positivo medido em produção (ver `EstadoDoTurno.jaEstavaMarcado`):
             * o dono era chamado no meio de um atendimento que deu certo e o cliente ficava
             * sem resposta depois de dizer o próprio nome.
             *
             * A checagem é ESTRUTURAL — lê a agenda e procura a marca da MAISA com o
             * telefone deste cliente. Não olha o texto da resposta, que é o que o guardrail
             * de `agente.ts` proíbe explicitamente.
             *
             * Custa uma leitura de agenda, e só neste caminho (recusa), que é raro. */
            if (await jaMarcadoPara(agendaId, data, inicio)) {
              estado.jaEstavaMarcado = true;
              return ok(
                `Esse atendimento já está marcado: ${rotuloLongo(data)} às ${horaFalada(inicio)} com ${nomeProf(agendaId)}. ` +
                  "Confirme para o cliente em uma frase, sem dizer que marcou de novo.",
              );
            }

            /* ── A OFERTA FOI NO TURNO ANTERIOR: a agenda confere de novo ──
             *
             * O caminho mais comum de uma marcação atravessa turnos: a MAISA oferece 10h30,
             * pergunta o nome, e o cliente responde "Lucas" na mensagem seguinte. Aqui,
             * `ofertas` nasceu vazio, e a recusa obrigava o modelo a chamar
             * `oferecer_horarios` e `agendar` de novo — duas voltas inteiras do modelo no
             * momento da confirmação. Medido na bancada (`avaliacao/`) em 26/10/2026: o
             * "Pronto, Lucas!" chegava 78 s depois do nome.
             *
             * Então quem consulta é o próprio executor, com a mesma pergunta que gerou a
             * oferta (aquele dia, aquele profissional; `espalhar` devolve os mesmos horários
             * enquanto a agenda não muda). A garantia continua a mesma de sempre: só se marca
             * horário que saiu de `oferecer_horarios`, contra a agenda de AGORA — almoço e
             * compromisso do dono incluídos. O que deixa de existir é só a volta do modelo.
             * Se a agenda mudou e o horário saiu da lista, a recusa abaixo vale como antes. */
            /* O dia INTEIRO (`porDia` no teto), e não a amostra de 3: com a amostra, um
             * horário livre ficava de fora sempre que outra marcação mudava o meio dela.
             * Erro de provedor sobe para o `catch` deste executor, que o diz como erro, e
             * não como "o horário não está livre". */
            const deNovo = await deps.oferecerHorarios(t, { servicoId, agendaId, de: data, dias: 1, porDia: 48 });
            const aindaLivre = deNovo.dias.some(
              (d) => d.data === data && d.agendaId === agendaId && d.horarios.some((h) => Math.abs(h - inicio) < 1e-6),
            );
            if (!aindaLivre) {
              return nao(
                "Esse horário não está livre entre os que a agenda oferece agora, então não posso marcar. " +
                  "Chame `oferecer_horarios` para esse serviço e esse dia, confirme com o cliente um dos horários que voltarem, e só então marque.",
              );
            }
            estado.ofertas.set(chaveOferta(servicoId, agendaId, data, inicio), {
              agendaId, data, inicio, servicoId, duracaoMin: deNovo.duracaoMin,
            });
          }

          if (entrada.nome_cliente) {
            const m = await deps.anotarFato(t, { telefone: perfil.telefone, nome: String(entrada.nome_cliente) });
            // Mesma razão do `anotar_nome`: o nome tem que valer para o `agendarAtendimento`
            // logo abaixo, que é quem cria o cliente no cadastro.
            if (m.nome) perfil.nome = m.nome;
          }

          const pedido = (geracao: number) => ({
            agendaId,
            /* O cliente que ainda não existe no cadastro entra como `lead:<telefone>`.
             * Precisa ser ESTÁVEL, e não um id sorteado: é ele que fica gravado no
             * evento, e é por ele que `meus_horarios` reencontra o atendimento na
             * próxima conversa. */
            clienteId: perfil.clienteId ?? `lead:${perfil.telefone}`,
            clienteNome: String(entrada.nome_cliente ?? perfil.nome ?? "Cliente"),
            clienteTelefone: perfil.telefone,
            servicoId,
            data,
            inicio,
            maisaAg: chaveIdempotente(t.tenantId, perfil.telefone, servicoId, agendaId, data, String(inicio), ...(geracao ? [`#${geracao}`] : [])),
            // Videochamada e convite por e-mail são decisões do dono, não do modelo:
            // não estão no schema da ferramenta de propósito.
            comMeet: false,
            convidarCliente: false,
          });

          /* ── "JÁ EXISTIA" PODE SER UM HORÁRIO CANCELADO ──
           *
           * A chave é derivada do horário (ver `chaveIdempotente`), e o núcleo devolve
           * `ja_existia` também para uma linha CANCELADA com a mesma chave — de propósito:
           * retentar não ressuscita o que alguém desmarcou. Só que, para o agente, isso
           * tornava impossível voltar a um horário cancelado ("na verdade, volta pro das
           * 15h"): a MAISA confirmava um atendimento que não existia. Achado em revisão,
           * 26/10/2026.
           *
           * Então "já existia" é conferido na agenda. Se o horário não está marcado para
           * este cliente, a chave ganha uma geração (#1, #2…) e a marcação é feita de novo.
           * Retentativa do modelo continua idempotente: ela cai na geração que vingou. */
          let r = await deps.agendarAtendimento(t, pedido(0));
          for (let geracao = 1; r.situacao === "ja_existia" && geracao <= 3 && !(await jaMarcadoPara(agendaId, data, inicio)); geracao++) {
            r = await deps.agendarAtendimento(t, pedido(geracao));
          }
          if (r.situacao === "ja_existia" && !(await jaMarcadoPara(agendaId, data, inicio))) {
            return nao("Não deu para marcar esse horário de novo. Chame o responsável com `chamar_humano`.");
          }

          // Só agora o fato é real. Ver `EstadoDoTurno.marcou`.
          estado.marcou = { data, inicio, profissionalId: agendaId, servicoId };

          const quando = `${rotuloLongo(data)} às ${horaFalada(inicio)} com ${nomeProf(agendaId)}`;
          return ok(
            r.situacao === "ja_existia"
              ? `Esse atendimento já estava marcado: ${quando}. Confirme para o cliente sem dizer que marcou duas vezes.`
              : `Marcado: ${nomeServico(servicoId)}, ${quando}. Confirme numa frase curta, do jeito falado ("Pronto! Quinta às 15h com o Rafael."), e pare.`,
          );
        }

        /* ── o que o cliente já tem ── */
        case "meus_horarios": {
          const hoje = hojeISO();
          const janela = { de: hoje, ate: somarDias(hoje, DIAS_A_FRENTE) };
          const meus = soDigitos(perfil.telefone).slice(-8);

          const lotes = await Promise.all(
            agendasAtivas().map(async (agendaId) => {
              const r = await deps.lerAgenda(t, { agendaId, ...janela });
              return r.eventos
                /* Filtro por MARCA da MAISA e por telefone. Duas condições, e as duas
                 * são de privacidade: sem `e.maisa` vazaria o compromisso pessoal do
                 * dono, e sem o telefone vazaria o atendimento de outro cliente para
                 * quem só sabe mandar mensagem. */
                .filter((e) => e.maisa && soDigitos(e.maisa.clienteTel).slice(-8) === meus)
                .map((e) => ({ e, agendaId }));
            }),
          );

          const eventos = lotes.flat().sort((a, b) => `${a.e.data}${a.e.inicio}`.localeCompare(`${b.e.data}${b.e.inicio}`));
          if (eventos.length === 0) return ok("Esse cliente não tem atendimento marcado. Ofereça marcar.");

          return ok(
            eventos
              .map(
                ({ e, agendaId }) =>
                  `${rotuloLongo(e.data)} (${e.data}) às ${horaFalada(e.inicio)} · ${e.maisa!.servicoNome} com ${nomeProf(agendaId)} · evento_id: ${e.eventoId} · profissional_id: ${agendaId}`,
              )
              .join("\n"),
          );
        }

        /* ── cancelar ── */
        case "cancelar": {
          await deps.cancelarAtendimento(t, {
            agendaId: String(entrada.profissional_id ?? ""),
            eventoId: String(entrada.evento_id ?? ""),
          });
          return ok(
            "Cancelado. Se era uma remarcação, marque agora o horário novo que o cliente escolheu e confirme o novo numa frase. " +
              "Se era só cancelamento, avise numa frase e deixe a porta aberta para marcar outro dia, sem insistir.",
          );
        }

        /* ── memória ── */
        case "anotar_nome": {
          const m = await deps.anotarFato(t, { telefone: perfil.telefone, nome: String(entrada.nome ?? "") });
          /* ⚠️ ATUALIZA O PERFIL DO TURNO, e não é detalhe: sem esta linha o cliente entra
           * no cadastro chamado "Cliente".
           *
           * `perfil` é um retrato tirado ANTES do primeiro token (ver `agente.ts` §1), então
           * `perfil.nome` é nulo para quem acabou de se apresentar. Quando o modelo chama
           * `anotar_nome` e depois `agendar` SEM repetir `nome_cliente` — que é o caminho
           * natural dele, porque na cabeça dele o nome já foi dito — o `agendar` abaixo cai
           * no `?? "Cliente"` e é ESSE nome que `garantirCliente` grava no banco, para
           * sempre. Medido: aconteceu na primeira conversa de teste.
           *
           * Corrigir aqui e não na descrição da ferramenta é de propósito: pedir ao modelo
           * que repita o nome é a camada 3 (prompt), a mais fraca. Isto é código. */
          if (m.nome) perfil.nome = m.nome;
          return ok(m.nome ? `Anotado: ${m.nome}.` : "Não veio nome. Siga sem insistir.");
        }

        /* ── o que o dono cadastrou ── */
        case "responder_duvidas": {
          const achadas = await deps.responderDuvida(t, String(entrada.pergunta ?? ""));

          /* ⚠️ VAZIO NÃO É ERRO — devolve `ok`, não `nao`.
           *
           * "O dono não cadastrou isso" é uma resposta correta do sistema, e marcar como
           * erro faria o modelo tratar como falha técnica: ele tentaria de novo com outras
           * palavras, gastando um turno, e só então desistiria. A instrução de contorno vem
           * junto para ele não precisar inventar o que fazer. */
          if (!achadas.length) {
            return ok(
              "Nada cadastrado sobre isso. Diga ao cliente que você vai confirmar e chame o responsável — não responda de cabeça.",
            );
          }

          /* ⚠️ ISTO SÃO CANDIDATAS, NÃO RESPOSTAS — e a instrução abaixo insiste nisso
           * porque foi MEDIDO que o corte de similaridade não consegue decidir sozinho.
           *
           * Em 15/08/2026, contra as FAQs reais: "vocês atendem cachorro?" pontuou 0.725
           * contra "Quais serviços vocês oferecem?", enquanto "aceita pix?" pontuou 0.705
           * contra a FAQ que REALMENTE a responde. O ruído acima do acerto. Embedding mede
           * assunto, não resposta — e "esse negócio faz X?" é o mesmo assunto de "quais
           * serviços vocês oferecem", com ou sem cachorro.
           *
           * Então o julgamento é do modelo, que tem o texto das duas na frente e sabe o
           * que uma pergunta pede. A similaridade viaja junto como SINAL (0.70 e 0.93 são
           * situações diferentes), nunca como veredito. O detalhe da medição está em
           * `dominio/faq.ts`. */
          const texto = achadas
            .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}\n(proximidade ${f.similaridade.toFixed(2)})`)
            .join("\n\n");

          return ok(
            `${texto}\n\n` +
              "Estas são as respostas MAIS PARECIDAS que existem cadastradas — parecidas no assunto, " +
              "o que não quer dizer que respondam. Leia cada uma e decida: se alguma responde de fato " +
              "a pergunta do cliente, use o CONTEÚDO dela com as suas palavras e no seu tom (não cole o " +
              "texto nem cite que existe uma lista). Se nenhuma responder — é o caso comum quando a " +
              "proximidade está perto de 0.70 — diga que vai confirmar e chame o responsável. " +
              "Responder o que não foi perguntado é pior que dizer que vai verificar.",
          );
        }

        /* ── desistir ── */
        case "chamar_humano": {
          const motivo = String(entrada.motivo ?? "sem motivo informado");
          estado.escalou = { motivo };
          await deps.canal.escalar(t, { telefone: perfil.telefone, motivo });
          /* Devolve a FRASE FINAL que o cliente vai ver. O modelo não escreve mais
           * nada depois disto (o loop encerra) — então esta é a última palavra da
           * MAISA, e ela não pode prometer prazo que ninguém garantiu. */
          return ok(
            "Responsável avisado. Se você ainda não disse isso nesta conversa, diga numa frase curta que vai falar com o responsável e já retorna; " +
              "se já disse, não repita: responda só ao que a pessoa disse agora. " +
              "Se a pessoa está sofrendo ou em risco, o acolhimento continua na mensagem.",
          );
        }

        default:
          return nao(`Ferramenta "${nome}" não existe.`);
      }
    } catch (e) {
      return nao(comoFrase(e));
    }
  };
}
