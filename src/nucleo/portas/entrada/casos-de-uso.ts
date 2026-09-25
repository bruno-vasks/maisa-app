/* ─────────────────────────────────────────────────────────────────────────────
 * PORTAS DE ENTRADA — tudo que se pode PEDIR ao app.
 *
 * Esta é a lista completa de ações do produto, escrita sem HTTP, sem React e sem
 * WhatsApp. Quem chama são os adaptadores de entrada:
 *
 *   • hoje  — `app/api/**` (o painel, via fetch)
 *   • em breve — o agente de IA no WhatsApp, que vai ler ESTE arquivo como se fosse a
 *     lista de ferramentas dele: cada caso de uso vira uma tool, com a mesma entrada e
 *     a mesma saída. É por isso que as entradas são objetos planos e serializáveis, e
 *     não classes: um modelo de linguagem precisa conseguir preencher isso em JSON.
 *
 * A implementação de cada um está em `nucleo/aplicacao/`. Os erros que qualquer um
 * deles pode lançar estão em `dominio/erros.ts` — quem chama traduz para o seu meio
 * (status HTTP, frase para o cliente).
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant, TenantId } from "../../dominio/tenant";
import type { EventoDeAgenda } from "../../dominio/agenda";
import type { Janela } from "../../dominio/tempo";
import type { Negocio, Vertical } from "../../dominio/negocio";
import type { Profissional, Servico } from "../../dominio/catalogo";
import type { Cliente } from "../../dominio/clientes";
import type { Contato, ModoDoNumero } from "../../dominio/contatos";
import type { Conversa, Msg } from "../../dominio/conversas";
import type { Conexao } from "../saida/agenda-externa";
/* Os rascunhos são reexportados da porta de SAÍDA, não redefinidos: o que a tela manda e
 * o que o repositório grava têm que ser a mesma forma, e duas declarações de "o que é um
 * serviço para gravar" divergem no primeiro campo novo. Mesmo arranjo do `AjustesParciais`
 * logo abaixo, que também vem da porta de saída. */
import type {
  RascunhoDeCliente, RascunhoDeProfissional, RascunhoDeServico,
} from "../saida/repositorio-negocio";
import type { AjustesDaAssistente, AjustesParciais } from "../saida/repositorio-assistente";
import type { Canal, Pareamento } from "../../dominio/canal";
import type { DesfechoDeRecibo } from "../../dominio/recibo-unitario";
import type { SemanaAnunciada } from "../../dominio/horarios";
import type {
  AFaturar, AmbienteFiscal, CadastroDoCnpj, CaminhoFiscal, ConfigFiscal, NotaGravada,
  ResultadoDeNota,
} from "../../dominio/fiscal";
import type { OcupacaoSaude } from "../../dominio/recibo-saude";
import type { Escolha, MemoriaCliente } from "../../dominio/memoria";
import type { VagasDoDia } from "../../dominio/vagas";
import type { Faq, FaqEncontrada } from "../../dominio/faq";
import type { ProgressoDaAtivacao } from "../../dominio/ativacao";
import type { Assinatura } from "../../dominio/assinatura";
import type { CheckoutAberto, PedidoDeCheckout } from "../saida/cobranca";

/* ───────────────────────────── agenda ───────────────────────────── */

export type PedidoDeAgendamento = {
  /** Qual agenda (hoje: o id do profissional). Validado contra a allowlist do inquilino. */
  agendaId: string;
  /**
   * uuid v4 cunhado por QUEM PEDE, antes de pedir. Chave de idempotência: repetir o
   * mesmo pedido não cria um segundo atendimento. Ver `dominio/agenda.ts`.
   */
  maisaAg: string;
  /** Data civil "YYYY-MM-DD". */
  data: string;
  /** Hora decimal: 14.5 = 14:30. */
  inicio: number;
  /** Minutos. Ausente ⇒ usa a duração do serviço no catálogo. */
  duracao?: number;

  servicoId: string;
  /** Nome e valor do serviço quando ele não está no catálogo (criado pelo usuário). */
  servicoNome?: string;
  servicoValor?: number;

  clienteId: string;
  clienteNome?: string;
  clienteTelefone?: string;

  /** Cria link de videochamada. Padrão: sim. */
  comMeet?: boolean;
  /** Convida o cliente por e-mail. Padrão: NÃO — ver o caso de uso. */
  convidarCliente?: boolean;
};

export type AtendimentoAgendado = {
  /** `ja_existia` = a chave de idempotência encontrou o atendimento de uma tentativa anterior. */
  situacao: "criado" | "ja_existia";
  /**
   * A identidade do atendimento, para cancelar ou remover da tela depois.
   *
   * ⚠️ O nome envelheceu. Ele carrega o id do evento no calendário externo QUANDO existe
   * um; sem calendário conectado — o caso comum desde o ADR-0009 — carrega o `maisaAg`.
   * Quem cancela aceita os dois formatos, então quem chama não precisa saber a diferença.
   */
  eventoId: string;
  meetLink: string | null;
  htmlLink: string | null;
  /** O instante REALMENTE gravado. Quem pediu passa a exibir a partir daqui. */
  inicioISO: string;
  /** Pediu videochamada e não veio link: a UI precisa saber para não prometer. */
  semMeet: boolean;
  /**
   * O atendimento existe no produto, mas NÃO entrou num calendário externo.
   *
   * Verdadeiro em dois casos bem diferentes, e a UI deve tratá-los diferente: o inquilino
   * que nunca conectou calendário (normal, não é aviso de nada) e o que conectou e cuja
   * criação falhou (aí vale dizer, senão ele confia numa agenda que não recebeu o evento).
   */
  foraDoCalendario: boolean;
};

export type AgendaLida = {
  /** A janela que este lote cobre. Volta na resposta porque quem lê guarda um cache
   *  acumulativo e precisa saber QUAL pedaço este lote substitui — sem isso, uma
   *  resposta atrasada de agosto sobrescreve setembro e eventos somem sozinhos. */
  janela: Janela;
  eventos: EventoDeAgenda[];
};

export type AgendarAtendimento = (t: ContextoTenant, p: PedidoDeAgendamento) => Promise<AtendimentoAgendado>;

/**
 * UMA SÉRIE — "toda semana", "a cada 2 semanas" (24/09/2026).
 *
 * Não é evento recorrente no calendário: é um atendimento DE VERDADE por data, cada um
 * com seu lembrete, seu recibo e sua checagem de conflito. Uma regra RRULE no Google
 * seria uma linha só na tabela, e o faturamento contaria uma sessão por série.
 */
export type PedidoRecorrente = PedidoDeAgendamento & {
  /** 1, 2, 3 ou 4. */
  cadaSemanas: number;
  /** Uma chave por ocorrência, cunhadas por quem pede. `chaves[0]` é a primeira data. */
  chaves: string[];
};
export type SerieAgendada = {
  criados: (AtendimentoAgendado & { data: string })[];
  /** Datas que não entraram — horário já ocupado, na maioria. A série segue sem elas. */
  pulados: { data: string; motivo: string }[];
};
export type AgendarRecorrente = (t: ContextoTenant, p: PedidoRecorrente) => Promise<SerieAgendada>;
export type CancelarAtendimento = (t: ContextoTenant, p: { agendaId: string; eventoId: string }) => Promise<void>;
export type LerAgenda = (t: ContextoTenant, p: { agendaId: string } & Janela) => Promise<AgendaLida>;

/* ───────────────────────────── horários livres ─────────────────────────────
 * O caso de uso que o AGENTE precisa e a tela não precisava: "tem vaga quinta?".
 * A grade calcula o vago desenhando blocos; isso não serve para quem não tem tela.
 * Ver `dominio/vagas.ts` para o porquê de a conta ser pura. */

export type PedidoDeHorarios = {
  servicoId: string;
  /**
   * Qual profissional. Ausente ⇒ todos os que fazem esse serviço.
   *
   * Opcional porque a primeira pergunta do cliente quase nunca nomeia alguém ("tem
   * horário amanhã?"), e obrigar o agente a escolher um profissional para poder
   * perguntar faria ele escolher errado — ou pior, inventar um id.
   */
  agendaId?: string;
  /** Data civil de onde começar a varrer. */
  de: string;
  /** Quantos dias varrer a partir de `de`. Padrão 7, teto em `MAX_DIAS_VARRIDOS`. */
  dias?: number;
  /** Quantos horários devolver por dia. Padrão 3 — ver `espalhar()`. */
  porDia?: number;
};

export type HorariosOferecidos = {
  /** A duração usada na conta. Volta na resposta porque é ela que define o que é
   *  "livre", e quem exibe precisa poder dizer "40 min" sem consultar o catálogo. */
  duracaoMin: number;
  servicoNome: string;
  /** Só dias que têm ao menos um horário. Dia vazio não é resposta, é ruído. */
  dias: VagasDoDia[];
};

export type OferecerHorarios = (t: ContextoTenant, p: PedidoDeHorarios) => Promise<HorariosOferecidos>;

/* ───────────────────────────── memória do cliente ─────────────────────────────
 * Reconhecer quem está falando, e lembrar. Ver `dominio/memoria.ts`. */

export type PerfilDeCliente = {
  telefone: string;
  /** `null` quando o telefone não casa com ninguém do cadastro — um lead. */
  clienteId: string | null;
  nome: string | null;
  memoria: MemoriaCliente;
};

export type LembrarCliente = (t: ContextoTenant, telefone: string) => Promise<PerfilDeCliente>;

/**
 * Grava um FATO na memória. Note o que não está aqui: nenhum campo de favorito.
 *
 * O chamador (o agente) só pode contar o que aconteceu — o nome que o cliente disse,
 * o horário que ele marcou. Quem conclui "esse é o favorito dele" é o domínio. Se a
 * assinatura aceitasse `profissionalFavoritoId`, o modelo escreveria a própria
 * conclusão na memória, e a inferência do domínio viraria decoração.
 */
export type AnotarFato = (
  t: ContextoTenant,
  p: { telefone: string; nome?: string; escolha?: Escolha },
) => Promise<MemoriaCliente>;

/* ───────────────────────────── o cadastro ─────────────────────────────
 * "Quem eu sou, quem atende, o que eu vendo, quem são meus clientes."
 *
 * É a primeira coisa que o painel pergunta e a última que ele deveria adivinhar. Existe
 * como caso de uso — e não como quatro leituras que a rota faz na mão — porque a UI já
 * pagou o preço de não ter isto: as telas importavam `saida/demo` direto e liam fixture,
 * o que fez o app inteiro depender de um array em memória para desenhar a grade.
 *
 * Vem tudo junto de propósito. As quatro leituras falham juntas (é a mesma sessão, o mesmo
 * inquilino, a mesma conexão) e a tela não sabe desenhar nada com três das quatro: sem
 * profissional não há coluna na Agenda, sem serviço não há duração, sem cliente não há
 * quem marcar. Partir em quatro daria quatro estados de carregando para uma única tela
 * que só existe completa.
 */
export type CadastroDoNegocio = {
  negocio: Negocio;
  profissionais: Profissional[];
  servicos: Servico[];
  clientes: Cliente[];
  /**
   * As agendas que este inquilino pode operar, já filtradas pelo servidor.
   *
   * Vai no mesmo pacote porque a tela usa a lista para duas coisas (montar as colunas da
   * grade e oferecer o "conectar agenda"), e derivá-la no navegador duplicaria no cliente
   * uma regra que é de autorização. Quando as duas divergirem, a do servidor é a que
   * vale — então é a única que viaja.
   */
  agendas: string[];
};

export type LerCadastro = (t: ContextoTenant) => Promise<CadastroDoNegocio>;

/* ───────────────────────────── renomear o negócio ─────────────────────────────
 * O par de escrita do `LerCadastro`, e o menor caso de uso do app.
 *
 * Existe porque o nome do negócio SAI NA VOZ DA MAISA — vai no prompt do agente a cada
 * mensagem e no texto do lembrete — e até 14/08/2026 nenhuma tela o escrevia. Só
 * `criar_negocio()` o gravava, uma vez, e quem começasse errado ficava errado. Ver o
 * bloco em `dominio/negocio.ts` para o caso concreto que expôs isso.
 *
 * Devolve o `Negocio` inteiro, e não só o nome: a tela pinta o resultado do banco, nunca
 * o que digitou. É a mesma disciplina do `AjustarAssistente` logo abaixo, e pelo mesmo
 * motivo — a normalização acontece do outro lado.
 */
export type AjustarNegocio = (
  t: ContextoTenant,
  p: { nome: string },
) => Promise<Negocio>;

/* ───────────────────────────── o catálogo, agora com escrita ─────────────────────────────
 * Os outros dois pares de escrita do `LerCadastro`, e a mesma história do `AjustarNegocio`
 * acima repetida em escala maior: a tela de Serviços tinha "adicionar" e "editar" desde
 * sempre, e os dois mexiam em `svcNovos`/`svcEdit` — estado do NAVEGADOR. O dono ajustava
 * o preço, via a lista mudar, dava F5, e o preço voltava. Não havia rota nem porta.
 *
 * ⚠️ ISTO BLOQUEIA O ONBOARDING, e é por isso que veio antes do wizard. A etapa "confirme
 * o que você faz" existe justamente para o dono ajustar o catálogo que `criar_negocio()`
 * semeou — cinco serviços com preço de chute. Um wizard que não grava é pior que wizard
 * nenhum: ele ensina, no primeiro minuto de uso, que o app perde o que você digita.
 *
 * Os dois devolvem a entidade INTEIRA depois de gravada, e não um `ok`. A tela pinta o
 * que está no banco — inclusive os campos derivados (`profissionalIds`, `atendimentosMes`)
 * que ela não mandou e não sabe calcular.
 */
export type AjustarServico = (t: ContextoTenant, p: RascunhoDeServico) => Promise<Servico>;
export type AjustarProfissional = (
  t: ContextoTenant,
  p: RascunhoDeProfissional,
) => Promise<Profissional>;

/**
 * Apagar serviço existe; apagar profissional não — e a assimetria vem do ESQUEMA:
 * `atendimentos.servico_id` é snapshot sem FK, mas `atendimentos.profissional_id` tem
 * `on delete cascade`. Apagar a pessoa levaria o histórico dela junto. O porquê inteiro
 * está no cabeçalho de `RepositorioNegocio`.
 */
export type RemoverServico = (t: ContextoTenant, id: string) => Promise<void>;

/* ───────────────────────────── e o cliente, que faltava ─────────────────────────────
 * O terceiro par de escrita do `LerCadastro`, nove dias depois dos outros dois — e a
 * mesma história contada por Bruno em 24/08/2026: *"acabei de perceber que é impossível
 * editar clientes pelo front. não só na aba clientes mas na faturamento também."*
 *
 * Estava exato. As duas telas abriam a gaveta em leitura, e o único controle era um
 * liga/desliga que gravava em `db.cliAtivo` — `localStorage`, o mesmo defeito que
 * `svcEdit` tinha. Dois campos doíam mais que os outros:
 *
 *   • `telefone`, que É a identidade: `telefone_chave` é por onde o agente reconhece quem
 *     está falando no WhatsApp. Um dígito errado transformava cliente antigo em
 *     desconhecido, e consertar exigia SQL na mão;
 *   • `cpf`, que é o que libera a nota. Sem ele a prefeitura recusa, o `emitiveis` tira a
 *     pessoa do lote, e a tela de Faturamento escrevia "sem CPF — a prefeitura recusa sem
 *     ele" sem oferecer onde escrever o CPF. Aviso sem porta.
 *
 * ⚠️ SÓ EDITA. Criar cliente é `garantirCliente`, no repositório, que deduplica por
 * telefone — e é assim que quem marca pelo WhatsApp entra no cadastro. Um segundo caminho
 * de criação, este sem deduplicação, daria o mesmo cliente duas vezes.
 */
export type AjustarCliente = (t: ContextoTenant, p: RascunhoDeCliente) => Promise<Cliente>;

/**
 * CADASTRAR CLIENTE PELA TELA — o botão "Novo cliente" (24/09/2026).
 *
 * Só o NOME é obrigatório. Telefone e CPF são opcionais porque o recibo da Rebots pede CPF
 * e nada mais: quem atende alguém que nunca vai falar com a MAISA pelo WhatsApp cadastra
 * nome e CPF e emite. Com telefone, deduplica igual ao agente — número que já é de alguém
 * devolve esse alguém com `jaExistia`, e a tela abre o cadastro dele.
 */
export type CadastrarCliente = (
  t: ContextoTenant,
  p: { nome: string; telefone?: string; cpf?: string },
) => Promise<{ cliente: Cliente; jaExistia: boolean }>;

/* ───────────────────────────── quanto já está de pé ─────────────────────────────
 * O que o wizard usa para saber onde retomar, e o que a `FluxoHoje` usa para mostrar o
 * que falta. Derivado do banco a cada leitura, nunca de uma flag — o porquê inteiro está
 * em `dominio/ativacao.ts`.
 *
 * ⚠️ Existe porque a `FluxoHoje` de um inquilino novo abre VAZIA, e o estado vazio dela é
 * comemorativo por desenho (*"se ele está vazio, a assistente está fazendo o trabalho"*).
 * Para quem acabou de entrar isso lê exatamente ao contrário: "está tudo certo" quando
 * nada está conectado.
 */
export type LerAtivacao = (t: ContextoTenant) => Promise<ProgressoDaAtivacao>;

/* ───────────────────────────── as respostas prontas ─────────────────────────────
 * As FAQs do negócio. Quatro casos de uso: três são a tela de gestão, e o quarto é o que
 * o AGENTE chama no meio de uma conversa.
 *
 * `ResponderDuvida` é o que fecha a família "configura e ignora": até 15/08/2026 o agente
 * respondia dúvida com uma fixture de demonstração, igual para todo inquilino, enquanto a
 * tabela `faqs` de cada um dormia com o que o dono cadastrou.
 *
 * ⚠️ Ele devolve LISTA, e pode devolver vazia. Vazio significa "o dono não cadastrou isto"
 * e é uma resposta legítima — o agente sabe dizer que vai verificar. Devolver sempre a FAQ
 * menos distante faria a MAISA responder qualquer coisa com aparência de fonte, que é pior
 * que não responder porque parece verificado.
 */
export type LerFaqs = (t: ContextoTenant) => Promise<Faq[]>;

export type RascunhoDeFaqPedido = {
  /** Ausente = criar. Presente = editar. */
  id?: string;
  pergunta: string;
  resposta: string;
  ativo?: boolean;
};

export type AjustarFaq = (t: ContextoTenant, p: RascunhoDeFaqPedido) => Promise<Faq>;
export type RemoverFaq = (t: ContextoTenant, id: string) => Promise<void>;
export type ResponderDuvida = (t: ContextoTenant, pergunta: string) => Promise<FaqEncontrada[]>;

/* ───────────────────────────── criar o negócio ─────────────────────────────
 * O primeiro pedido que uma conta nova faz. Antes deste caso de uso existir, a resposta
 * do app para o primeiro login de todo mundo era `"Rode criar_negocio() no Supabase"` —
 * uma instrução de desenvolvedor entregue ao cliente final.
 *
 * ⚠️ É o ÚNICO caso de uso que não recebe `ContextoTenant`, porque é o que o produz.
 * Recebe a identidade da sessão, que o adaptador de entrada tirou do cookie. A regra de
 * `dominio/tenant.ts` continua intacta: nada aqui aceita `tenantId` vindo do corpo — o
 * corpo só traz nome e vertical, e o dono é sempre `auth.uid()`.
 */
export type PedidoDeNegocio = {
  nome: string;
  vertical: Vertical;
  profissional?: string;
};

export type NegocioProvisionado = {
  tenantId: TenantId;
  /** Onde a tela deve ir depois. O painel só funciona com um negócio resolvido. */
  proximoPasso: "abrir_painel";
};

export type ProvisionarNegocio = (
  sessao: { usuarioId: string },
  p: PedidoDeNegocio,
) => Promise<NegocioProvisionado>;

/* ───────────────────────────── ajustar a assistente ─────────────────────────────
 * A tela "A MAISA", com efeito. Antes disto ela editava `localStorage`: o dono escolhia
 * o tom, e o WhatsApp respondia com a fixture global — a mesma para todo inquilino.
 *
 * `AjustarAssistente` é PARCIAL: a tela é uma lista de toggles, e virar um switch manda
 * um campo só. Devolve o estado inteiro resultante, para a tela reconciliar sem segunda
 * ida ao servidor.
 */
/* ───────────────────────────── o canal de WhatsApp ─────────────────────────────
 * O passo que faltava para o produto se vender sozinho: conectar o WhatsApp do cliente
 * sem ninguém criar instância na mão. `ConectarCanal` devolve um pareamento efêmero — a
 * tela pinta e recomeça o polling de `LerCanal` até virar "conectado".
 *
 * ⚠️ `numero` É O QUE FAZ O PRODUTO FUNCIONAR NO CELULAR, e por isso é opcional em vez de
 * inexistente. Sem ele o pareamento é por QR — e QR pressupõe DOIS aparelhos, um
 * mostrando e outro fotografando. Quem abre a MAISA no próprio celular não tem o segundo:
 * a câmera não fotografa a própria tela, e o passo simplesmente não termina. Com `numero`,
 * o `Pareamento` volta com `codigo` (o "Conectar com número de telefone" do WhatsApp) e o
 * dono digita oito caracteres sem trocar de aparelho.
 *
 * O telefone digitado NÃO vira `integracoes_whatsapp.numero`: quem escreve essa coluna
 * continua sendo o `ownerJid` do provedor. Ver `provisionamento-canal.ts`.
 */
export type LerCanal = (t: ContextoTenant) => Promise<Canal>;
export type ConectarCanal = (t: ContextoTenant, p?: { numero?: string }) => Promise<Pareamento>;
/**
 * Outro código para o pareamento em curso, sem derrubar a instância.
 *
 * Existe porque o código do WhatsApp vence em cerca de um minuto e o dono está fazendo uma
 * tarefa de dois aplicativos: copiar aqui, trocar de app, achar o menu, colar. Quem se
 * atrapalha no meio perdia o código e recebia "expirou, clique em conectar de novo" — que
 * refazia a instância inteira e devolvia a pessoa ao começo.
 *
 * Devolve `null` quando o provedor não emitiu código novo. Não é exceção: quem chama
 * continua com o QR e a tela oferece gerar tudo de novo.
 */
export type RenovarCodigo = (t: ContextoTenant, p: { numero: string }) => Promise<string | null>;

export type DesconectarCanal = (t: ContextoTenant) => Promise<void>;

/**
 * Quem recebe o "preciso de você nessa conversa" deste negócio.
 *
 * `null` apaga e volta a "ninguém é avisado" — estado legítimo, e por isso não é erro. O
 * telefone é validado e normalizado como o do pareamento: E.164 sem `+`.
 */
export type DefinirDonoDoCanal = (t: ContextoTenant, p: { telefone: string | null }) => Promise<void>;

/* ────────────────────── o caderno de nomes, e quem ela atende ──────────────────────
 * O número pareado quase sempre é o celular PESSOAL do dono — barbearia pequena não tem
 * linha corporativa. Sem estes casos de uso, a MAISA oferece horário para o pai dele.
 *
 * `AvaliarAtendimento` é o único que roda no caminho quente: uma pergunta por mensagem
 * recebida, antes do primeiro token. Os outros três são tela.
 */

/** A decisão, com o motivo e o nome — tudo que o agente precisa numa ida só. */
export type Atendimento = {
  pode: boolean;
  /** `null` quando pode. Frase pronta, para o log e para a tela de Conversas. */
  motivo: string | null;
  /**
   * Como o dono salvou esta pessoa no celular. `null` quando não está no caderno.
   *
   * Está aqui porque é o maior pedaço do valor do caderno e ele vale nos DOIS modos: com
   * esse nome a MAISA diz "Oi, Fernanda!" em vez de "Oi!" para quem escreve pela primeira
   * vez. Devolver junto com a decisão evita uma segunda consulta no caminho quente.
   */
  nome: string | null;
};

/**
 * O que a mensagem traz para a decisão.
 *
 * `anteriores` e `texto` estão aqui desde 24/09/2026: no modo pessoal, número fora do caderno
 * só é atendido se for novo E estiver pedindo horário — e as duas perguntas precisam da
 * conversa, não só do telefone.
 */
export type PedidoDeAtendimento = {
  telefone: string;
  /** O endereço cru do WhatsApp, quando é `…@lid`. Ver `HistoricoDoCanal.rastro`. */
  jid?: string;
  /** A thread da MAISA ANTES desta mensagem. */
  anteriores: readonly Msg[];
  /** A mensagem que acabou de chegar. */
  texto: string;
};

export type AvaliarAtendimento = (t: ContextoTenant, p: PedidoDeAtendimento) => Promise<Atendimento>;

/** O caderno inteiro + de quem é o número, para a tela desenhar as duas coisas juntas. */
export type LerContatos = (t: ContextoTenant) => Promise<{ contatos: Contato[]; modo: ModoDoNumero }>;

/** Lê a agenda do provedor e grava o que serve. Devolve o que entrou, para a tela dizer. */
export type ImportarContatos = (t: ContextoTenant) => Promise<{ novos: number; total: number; lidos: number }>;

export type MarcarContato = (
  t: ContextoTenant,
  p: { telefone: string; nome?: string | null; cliente: boolean | null },
) => Promise<void>;

/**
 * Marca uma LISTA de contatos de uma vez. Devolve quantos mudaram de fato.
 *
 * ⚠️ A CONTAGEM DE VOLTA NÃO É ENFEITE. A escrita pode ser recusada em silêncio (RLS
 * devolve sem erro e sem linha), e sem comparar o pedido com o resultado a tela diria
 * "1.840 marcados" depois de não ter marcado nenhum — e o dono só descobriria no dia em
 * que a MAISA calasse com um cliente.
 */
export type MarcarContatos = (
  t: ContextoTenant,
  p: { chaves: string[]; cliente: boolean | null },
) => Promise<{ pedidos: number; mudados: number }>;

export type DefinirModoDoNumero = (t: ContextoTenant, modo: ModoDoNumero) => Promise<void>;

export type LerAssistente = (t: ContextoTenant) => Promise<AjustesDaAssistente>;

export type AjustarAssistente = (
  t: ContextoTenant,
  p: AjustesParciais,
) => Promise<AjustesDaAssistente>;

/* ───────────────────────────── horário anunciado ─────────────────────────────
 * O horário EXTERNO — a frase que a MAISA responde a "que horas vocês atendem?".
 *
 * ⚠️ Não confundir com o `Expediente` do profissional, que é o que decide se cabe marcar
 * às 15h de terça. Os dois divergem na vida real e é legítimo: o negócio anuncia 8h–20h e
 * o profissional das terças entra ao meio-dia. Ver `dominio/horarios.ts`.
 *
 * `AjustarHorarios` recebe a semana INTEIRA, e não um dia — é grade, não campo. O porquê
 * está em `aplicacao/horarios.ts`. */

/* ───────────────────────────── a rotina de lembretes ─────────────────────────────
 * ⚠️ O ÚNICO CASO DE USO QUE NÃO RECEBE `ContextoTenant`, junto de `ProvisionarNegocio`
 * — e pelo motivo oposto ao dele. Aquele não recebe porque PRODUZ o inquilino; este não
 * recebe porque a pergunta é sobre TODOS eles: "quem tem lembrete para mandar agora?".
 *
 * Uma rotina agendada não tem sessão nem dono. Um `tenantId` de entrada aqui seria um
 * parâmetro por onde disparar a rotina — e o WhatsApp — de outra pessoa.
 *
 * O isolamento é refeito imediatamente depois: cada linha da fila traz o inquilino dela,
 * e o envio acontece com um `ContextoTenant` de ator `sistema`. Ver `aplicacao/lembretes.ts`.
 *
 * `agora` entra por argumento em vez de `new Date()` lá dentro porque é o que torna a
 * rotina testável sem esperar três horas. */

export type ResultadoDaRotina = {
  enviados: number;
  falhas: { atendimentoId: string; tenantId: string; motivo: string }[];
};

export type EnviarLembretes = (agora: Date) => Promise<ResultadoDaRotina>;

export type LerHorarios = (t: ContextoTenant) => Promise<SemanaAnunciada>;

export type AjustarHorarios = (
  t: ContextoTenant,
  p: SemanaAnunciada,
) => Promise<SemanaAnunciada>;

/* ───────────────────────────── conversas de WhatsApp ─────────────────────────────
 * O painel, do lado da conversa. O AGENTE não passa por aqui: para ele a conversa é o
 * telefone que acabou de escrever, e ele fala com `RepositorioHistorico` direto.
 *
 * ⚠️ `telefone` é sempre a IDENTIDADE da conversa, não um destino. Quem responde manda a
 * chave (8 dígitos, que não serve para enviar nada) e o servidor descobre o número completo
 * na thread — ver `criarResponderConversa`. É o que impede o painel de virar um jeito de
 * mandar WhatsApp para qualquer número pela instância do dono. */

export type ListarConversas = (t: ContextoTenant) => Promise<Conversa[]>;

export type LerConversa = (
  t: ContextoTenant,
  telefone: string,
) => Promise<{ conversa: Conversa; msgs: Msg[] }>;

/** Devolve a fala gravada — a tela já mostrou o texto, o que ela não sabia é que saiu. */
export type ResponderConversa = (
  t: ContextoTenant,
  p: { telefone: string; texto: string },
) => Promise<Msg>;

/** Assumir/devolver (`assumida`) e resolver/reabrir (`resolvida`). `undefined` = não mexa. */
export type MudarPosseConversa = (
  t: ContextoTenant,
  p: { telefone: string; assumida?: boolean; resolvida?: boolean },
) => Promise<void>;

/* ───────────────────────────── conexão com a agenda ───────────────────────────── */

export type ListarConexoes = (t: ContextoTenant) => Promise<Conexao[]>;
export type DesconectarAgenda = (t: ContextoTenant, p: { agendaId: string }) => Promise<{ revogado: boolean }>;

/* ───────────────────────────── nota fiscal ───────────────────────────── */

/**
 * ⚠️ ELE ENCOLHEU PARA UM CAMPO EM 17/08/2026, E ISSO FECHOU UM BURACO.
 *
 * Antes: `{ valor, discriminacao, tomador, origem }` — tudo vindo do NAVEGADOR. Um POST
 * forjado em `/api/nf/emitir` emitia documento fiscal de qualquer valor, para qualquer CPF,
 * sob o CNPJ do dono. E sem má-fé nenhuma, uma tela aberta há dez minutos mandava um total
 * velho e a nota saía com valor que não correspondia ao que estava marcado.
 *
 * Agora só o cliente. Valor, discriminação e tomador saem do banco, na mesma transação que
 * prende os atendimentos — quem soma é o Postgres, sobre as linhas que acabou de reservar.
 */
export type PedidoDeEmissao = {
  clienteId: string;
};

export type EmitirNota = (t: ContextoTenant, p: PedidoDeEmissao) => Promise<ResultadoDeNota>;

/** A tela de faturamento inteira, numa leitura: o que falta, o que saiu, e se dá para emitir. */
export type Faturamento = {
  /** Por cliente: atendimentos já prestados e sem nota. Já significa "desde a última emissão". */
  aFaturar: AFaturar[];
  /** O histórico, mais recentes primeiro. */
  emitidas: NotaGravada[];
  ambiente: AmbienteFiscal;
  /** Vazio = dá para emitir. Não vazio, a tela não oferece o botão — ver `LerEstadoFiscal`. */
  falta: string[];
};

export type LerFaturamento = (t: ContextoTenant) => Promise<Faturamento>;
export type ConsultarNota = (t: ContextoTenant, ref: string) => Promise<ResultadoDeNota>;
export type CancelarNota = (t: ContextoTenant, p: { ref: string; justificativa?: string }) => Promise<ResultadoDeNota>;

/* ────────────────────── ligar a nota fiscal (uma pergunta) ──────────────────────
 *
 * ★ O ONBOARDING FISCAL FAZ **UMA** PERGUNTA: o CNPJ.
 *
 * Razão social, município, CNAE e — o que decide o caminho de emissão — `optante_mei` vêm
 * da Receita a partir dos 14 dígitos. Endereço, inscrição municipal e código de serviço
 * municipal não são perguntados: no caminho nacional (MEI) o DPS não tem esses campos.
 *
 * Sobra um passo humano, e só um: o certificado digital. Ele não é pergunta, é entrega —
 * e é o único lugar onde o cliente precisa trazer algo de fora.
 * ──────────────────────────────────────────────────────────────────────────────── */

/** O estado fiscal do negócio, com a frase do que falta pronta para a tela. */
export type EstadoFiscal = {
  config: ConfigFiscal;
  caminho: CaminhoFiscal;
  /** Vazio = dá para emitir. Frases em português, na ordem em que resolver. */
  falta: string[];
  /** O provedor está configurado no ambiente? Vazio = sim. */
  provedorFaltando: string[];
};

export type LerEstadoFiscal = (t: ContextoTenant) => Promise<EstadoFiscal>;

/** Prévia do CNPJ antes de gravar nada — para a tela mostrar o nome e pedir confirmação. */
export type ConsultarCnpj = (t: ContextoTenant, cnpj: string) => Promise<CadastroDoCnpj | null>;

/**
 * Liga a nota fiscal: consulta o CNPJ, cadastra a empresa no emissor, grava o que voltou.
 *
 * Idempotente do nosso lado: chamar com a empresa já criada não cria outra — devolve o
 * estado. É o que protege do duplo clique, e o provedor NÃO deduplica por CNPJ.
 */
export type LigarNotaFiscal = (t: ContextoTenant, p: { cnpj: string; email?: string | null }) => Promise<EstadoFiscal>;

/** Repassa o certificado A1 ao emissor. O arquivo não fica com a gente. */
export type EnviarCertificado = (
  t: ContextoTenant,
  p: { pfxBase64: string; senha: string },
) => Promise<EstadoFiscal>;

/**
 * Vira a chave para produção — a partir daí a nota vale.
 *
 * ⚠️ Recusa enquanto `falta` não estiver vazio. É a única barreira entre "configurei
 * metade" e um documento fiscal torto que só se conserta cancelando na prefeitura.
 */
export type LiberarProducaoFiscal = (t: ContextoTenant) => Promise<EstadoFiscal>;

/* ─────────────────── o lote do Receita Saúde (prestador pessoa física) ───────────────────
 *
 * ★ ESTE BLOCO NÃO É NOTA FISCAL, e a separação é o conteúdo. Quem atende como pessoa
 * física — psicóloga, fisioterapeuta, fonoaudióloga, TO — emite o **Recibo Eletrônico de
 * Serviços de Saúde** no e-CAC, obrigatório desde 01/01/2025 (IN RFB 2.240/2024). Não há
 * provedor, não há certificado, não há prefeitura.
 *
 * O que a MAISA entrega é o **arquivo**: um CSV que ela importa no Carnê-Leão e assina. A
 * emissão é dela, não nossa — e por isso não existe `EmitirRecibo` aqui. Prometer emissão
 * seria vender o que o produto não faz.
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Uma linha que vai (ou não) para o próximo arquivo.
 *
 * ★ EXISTE PARA A TELA MOSTRAR O QUE VAI NO ARQUIVO **ANTES** DE GERAR. Sem isso, lançar um
 * pagamento à mão era um formulário que engolia o dado: o dono clicava em "lançar" e não via
 * nada mudar até gerar o arquivo — e no recarregar da página ficava sem saber se salvou.
 */
export type PagamentoPendente = {
  id: string;
  /** `atendimento` veio da agenda; `avulso` foi digitado. */
  fonte: "atendimento" | "avulso";
  nome: string;
  cpf: string | null;
  data: string;
  valor: number;
  /**
   * Só avulso se apaga, e a tela usa isto para decidir o botão.
   *
   * ⚠️ Atendimento NÃO se apaga por aqui: ele é o registro de que o serviço aconteceu, e
   * apagá-lo para "tirar do recibo" perderia a agenda junto. Quem não quer emitir tira o CPF
   * ou cancela o atendimento na tela dele.
   */
  podeExcluir: boolean;
};

export type RecibosPendentes = {
  pagamentos: PagamentoPendente[];
  /** Soma do que está pronto para entrar — os sem CPF não entram e não somam. */
  total: number;
  /** Quantos estão sem CPF. É a única pendência que o dono resolve sozinho. */
  semCpf: number;
  /**
   * ★ QUANTOS PACIENTES FICARAM SEM SABER, entre os recibos já emitidos.
   *
   * ⚠️ Isto NÃO é sobre o que falta emitir — é sobre o que já saiu e não foi comunicado. Está na
   * mesma resposta porque é a mesma tela, e porque o número precisava existir em algum lugar: em
   * 26/08/2026, 19 mensagens falharam e o silêncio foi idêntico ao sucesso.
   */
  avisos: { falhou: number; semTelefone: number };
};

/** O que vai no próximo arquivo, para a tela mostrar antes de gerar. */
export type LerRecibosPendentes = (t: ContextoTenant) => Promise<RecibosPendentes>;

/**
 * Lança um pagamento que não está na agenda.
 *
 * ★ A NECESSIDADE, NA PALAVRA DO BRUNO (21/08/2026): "nem tudo vai estar registrado
 * automaticamente, a MAISA cobre a maioria dos casos, mas não todos."
 *
 * Sessão marcada por fora, pacote pago adiantado, paciente que voltou depois de meses. O
 * recibo é obrigatório do mesmo jeito, e a unidade do arquivo sempre foi o pagamento — o
 * atendimento é só a fonte mais comum de um.
 */
export type LancarPagamentoAvulso = (
  t: ContextoTenant,
  p: {
    data: string;
    valor: number;
    nome: string;
    cpf: string;
    cpfPagador?: string | null;
    clienteId?: string | null;
    observacao?: string | null;
  },
) => Promise<PagamentoPendente>;

/** Apaga um lançamento avulso — só enquanto ele não entrou num arquivo. */
export type ExcluirPagamentoAvulso = (t: ContextoTenant, p: { id: string }) => Promise<void>;

/** O arquivo gerado, mais tudo que a tela precisa dizer sobre ele. */
export type LoteDeRecibos = {
  loteId: string;
  competencia: string;
  /** O conteúdo do CSV. A rota devolve como download; a tela nunca o mostra. */
  csv: string;
  /** Nome sugerido, com CPF e competência — para não importar o mês errado duas vezes. */
  arquivo: string;
  linhas: number;
  valor: number;
  /**
   * ⚠️ O QUE FICOU DE FORA, EM PORTUGUÊS. Nunca vazio por preguiça: um arquivo com 8 de 12
   * sessões e nenhum aviso faz o dono assinar achando que fechou o mês, e as outras 4 só
   * aparecem quando um paciente cobrar o recibo.
   */
  avisos: string[];
};

/**
 * Monta o lote do período e prende os atendimentos nele.
 *
 * `ate` é o último dia que entra (inclusive). Sem ele, o padrão é hoje — ninguém emite
 * recibo de sessão que ainda não aconteceu.
 */
export type GerarLoteDeRecibos = (
  t: ContextoTenant,
  p: { ate?: string },
) => Promise<LoteDeRecibos>;

/**
 * Liga o caminho do recibo: grava CPF, ocupação e registro do conselho.
 *
 * ★ É O PAR DE `LigarNotaFiscal`, E A ASSIMETRIA É O PRODUTO. Lá são 14 dígitos e a Receita
 * responde o resto, mas sobra o certificado A1 — um arquivo que o cliente tem que comprar.
 * Aqui são três campos digitados e **acabou**: não há empresa para criar num provedor, não há
 * certificado, não há custo por documento. O onboarding fecha na mesma reunião.
 */
export type LigarReciboSaude = (
  t: ContextoTenant,
  p: {
    cpf: string;
    ocupacao: OcupacaoSaude;
    registro?: string | null;
    /**
     * ── quem emite por ela, quando ela autorizou a MAISA ──
     *
     * ⚠️ CHAVE AUSENTE NÃO MEXE; `null` APAGA. É a mesma distinção do `RemendoFiscal`, e ela
     * importa aqui porque este caso de uso é chamado por dois caminhos: o onboarding, que não
     * sabe nada de autorização, e a correção de dados, que sabe. Se ausência apagasse, corrigir
     * um CPF de digitação derrubaria a autorização junto — e a emissão pararia sem ninguém
     * entender por quê.
     */
    procurador?: string | null;
    procuracaoAte?: string | null;
    /** Quando NÓS confirmamos na aba *Recebidas*. Ver `ConfigFiscal.procuracaoAceitaEm`. */
    procuracaoAceitaEm?: string | null;
  },
) => Promise<EstadoFiscal>;

/**
 * Desliga o caminho do recibo e devolve o negócio à pergunta "nota fiscal ou recibo?".
 *
 * ★ EXISTE PORQUE ESCOLHER ERRADO TEM QUE SER BARATO. A pergunta do onboarding é sobre o
 * regime de quem atende, e quem está testando o produto — ou quem clicou rápido — vai errar.
 * Sem esta saída, consertar era `update config_fiscal` no SQL Editor.
 *
 * ⚠️ RECUSA DEPOIS QUE EXISTE LOTE IMPORTADO, e essa é a linha que separa "configuração" de
 * "histórico fiscal". Lote importado significa recibo emitido no e-CAC, no nome dela, com o
 * paciente já podendo ver — a partir daí trocar o caminho não é preferência, é apagar o
 * rastro do documento que a MAISA ajudou a emitir. Enquanto ninguém importou nada, o arquivo
 * é inerte e trocar não custa nada.
 */
export type DesligarReciboSaude = (t: ContextoTenant) => Promise<EstadoFiscal>;

/** O que aconteceu com o aviso no WhatsApp, para a tela dizer um número em vez de "pronto". */
export type FechamentoDeLote = {
  /** Quantas pessoas receberam a mensagem. `0` quando `avisar` veio falso. */
  avisados: number;
  /** Entraram no arquivo mas não têm telefone. O recibo saiu; o aviso não. */
  semTelefone: number;
  /**
   * ⚠️ FALHAS DE ENVIO, NÃO DE EMISSÃO. O recibo já é fato quando isto acontece — o lote foi
   * importado no e-CAC pela mão dela. Uma mensagem que não sai não desfaz nada, e travar o
   * fechamento por causa disso deixaria o lote eternamente "gerado" para o mês seguinte
   * faturar de novo.
   */
  falhas: number;
};

/**
 * O dono diz o que aconteceu com o arquivo depois de sair daqui.
 *
 * ★ `avisar` É OPT-IN, E O PADRÃO É NÃO MANDAR NADA.
 *
 * A MAISA fala pelo WhatsApp **pessoal** de quem a usa. Disparar mensagem para trinta
 * pacientes porque um campo veio `undefined` numa chamada de API é o tipo de erro que não tem
 * desfazer — então quem quer o disparo pede explicitamente. Ver `avisoDeRecibo` para o texto,
 * e para o porquê de a mensagem ser a NOTÍCIA do recibo e não o recibo.
 */
export type FecharLoteDeRecibos = (
  t: ContextoTenant,
  p: { loteId: string; situacao: "importado" | "descartado"; avisar?: boolean },
) => Promise<FechamentoDeLote>;

/* ─────────────────────────────────────────────────────────────────────────────
 * EMISSÃO UNITÁRIA DO RECIBO — o caminho que devolve o PDF oficial.
 *
 * ★ É O IRMÃO DE `GerarLoteDeRecibos`, e a diferença é quem aperta o botão. No lote a MAISA
 * monta um CSV e uma PESSOA o importa no e-CAC; aqui a emissão sai por um canal programático e
 * volta com chave e PDF, que o lote nunca devolve.
 * ────────────────────────────────────────────────────────────────────────────── */

/** O que a tela mostra depois de mandar um recibo. */
export type ReciboLancado = {
  reciboId: string;
  canal: "automacao" | "rebots";
  /**
   * ⚠️ QUASE SEMPRE `pendente`, e a tela **não pode escrever "emitido"** em cima disso. A
   * emissão é assíncrona: quem lê este campo como sucesso promete um documento que talvez não
   * exista. Ver `podeTentarOutroCanal`.
   */
  situacao: "pendente" | "emitido";
  protocolo: string;
  /** Somado pelo banco na claim, nunca recebido da tela. */
  valor: number;
  nome: string;
  data: string;
};

/**
 * Emite UM recibo, do pagamento que está na lista.
 *
 * ⚠️ RECEBE APENAS `fonte` E `id`. Valor, CPF e data saem do banco — a rota `/api/nf/emitir`
 * aceitava `valor` e `tomador` do corpo até 17/08/2026, e com isso um POST forjado emitia
 * documento fiscal de qualquer valor para qualquer CPF, sob o CNPJ do dono.
 */
export type EmitirRecibo = (
  t: ContextoTenant,
  p: { fonte: "atendimento" | "avulso"; id: string },
) => Promise<ReciboLancado>;

/**
 * O que aconteceu ao fechar uma linha do razão com a resposta do canal.
 *
 * `ja_fechado` não é falha: é reentrega de webhook, ou a reconciliação tendo chegado primeiro. A
 * rota do callback responde **200** para ele — pedir reentrega de algo já gravado é um laço.
 */
export type ReciboFechado = {
  desfecho: "emitido" | "recusado" | "cancelado" | "ja_fechado";
  /**
   * A nossa cópia do PDF ficou guardada?
   *
   * ⚠️ `false` NÃO É ERRO, e não pode virar erro. A URL do comprovante vale cinco minutos e o
   * canal não tem consulta: a cópia é melhor-esforço dentro da janela. O que não pode falhar é o
   * desfecho — ver `criarFecharReciboDoCallback`.
   */
  comprovanteGuardado: boolean;
};

/**
 * Fecha a linha do razão com o desfecho que o canal mandou.
 *
 * ⚠️ O `DesfechoDeRecibo` VEM DO CORPO DO REQUEST, traduzido pelo adaptador do canal — mas o
 * `ContextoTenant` **não**. Ele nasce de `tenantDoProtocolo`, que é dado durável nosso. A regra
 * do `dominio/tenant.ts` vale aqui como em toda porta de entrada: o inquilino não vem de fora.
 */
export type FecharReciboDoCallback = (
  t: ContextoTenant,
  d: DesfechoDeRecibo,
) => Promise<ReciboFechado>;

/** O placar de uma rodada de reconciliação. */
export type ResultadoDaReconciliacao = {
  /** Quantos foram efetivamente perguntados ao canal. Cada um custa uma consulta. */
  olhados: number;
  emitidos: number;
  recusados: number;
  /** Novos demais, ou o canal ainda não sabe. Continuam na fila — e isso é o certo. */
  aindaPendentes: number;
  /**
   * ⚠️ IRRECONCILIÁVEIS: `pendente` sem protocolo, do processo que morreu no meio. Não há o que
   * perguntar. Este número **tem que aparecer na tela** — é a única coisa aqui que exige gente.
   */
  semProtocolo: number;
};

/**
 * Pergunta ao canal o que aconteceu com os pendentes vencidos.
 *
 * ★ É O QUE TORNA A CASCATA SEGURA. Sem isto, um `pendente` velho só tem saídas erradas: cair
 * para o próximo canal (emite o segundo recibo) ou ficar pendurado (o pagamento desaparece do
 * faturamento). Ela não decide nada — só grava o que o canal respondeu.
 */
export type ReconciliarRecibos = (
  t: ContextoTenant,
  agora?: Date,
) => Promise<ResultadoDaReconciliacao>;

/* ─────────────────────────────────────────────────────────────────────────────
 * A COBRANÇA
 *
 * Quatro casos de uso e um detalhe que decide o desenho: `RegistrarAssinatura` roda
 * SEM NINGUÉM LOGADO — quem o dispara é o provedor de pagamento, por webhook.
 *
 * Mesmo assim ele recebe `ContextoTenant` como os outros, e não um `tenantId` solto.
 * O inquilino nasce do carimbo que NÓS pusemos na sessão de checkout e que voltou
 * dentro de um corpo assinado criptograficamente (ver `adaptadores/entrada/stripe/`).
 * É o mesmo arranjo do `FecharReciboDoCallback` logo acima: o dado do desfecho vem de
 * fora, o inquilino não.
 *
 * Uma terceira exceção à regra do `ContextoTenant` primeiro seria fácil de justificar
 * aqui ("webhook não tem sessão") e seria o começo do fim dela.
 * ────────────────────────────────────────────────────────────────────────────── */

export type AbrirCheckout = (t: ContextoTenant, p: PedidoDeCheckout) => Promise<CheckoutAberto>;

export type AbrirPortalDeCobranca = (
  t: ContextoTenant,
  p: { voltarPara: string },
) => Promise<CheckoutAberto>;

/**
 * Cancelar a assinatura deste negócio.
 *
 * Existe porque provedor sem portal hospedado (AbacatePay) não tem onde a pessoa cancele
 * sozinha — e a LP promete "cancele quando quiser" por escrito. A tela pergunta
 * `capacidades()` e desenha um botão OU o outro; ver `portas/saida/cobranca.ts`.
 *
 * Sem parâmetro além do contexto de propósito: qual assinatura cancelar não é escolha de
 * quem clica. Aceitar um `assinaturaId` do request deixaria uma sessão cancelar a
 * assinatura de outro negócio — é a mesma razão pela qual `tenantId` nunca vem do pedido.
 */
export type CancelarAssinatura = (t: ContextoTenant) => Promise<void>;

/** `null` quando o inquilino ainda não tem linha de assinatura — não é erro. */
export type LerAssinatura = (t: ContextoTenant) => Promise<Assinatura | null>;

export type RegistrarAssinatura = (t: ContextoTenant, a: Assinatura) => Promise<void>;
