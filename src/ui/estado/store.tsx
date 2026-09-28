"use client";
/* MAISA — store central do app.
 *
 * Uma fonte de verdade para tudo que o usuário muda: etapa do kanban, posição na
 * agenda, quem conduz cada conversa, toggles do catálogo/equipe, ajustes da MAISA
 * e o ciclo de vida das notas fiscais.
 *
 * Persistência: localStorage, chave "maisa.app.v3". Só o que é DECISÃO do usuário
 * persiste — estado de navegação (tela, gaveta aberta, filtro, drag) é volátil de
 * propósito: recarregar cai no Fluxo de hoje limpo, não no meio de um arrasto.
 *
 * A emissão de nota é a única ação que sai do navegador: ela chama /api/nf/*, que
 * valida a sessão e fala com a Focus NFe do lado do servidor. Sem token da Focus a
 * rota responde "simulado" e o fluxo roda inteiro igual — inclusive o polling. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as D from "@/adaptadores/saida/demo";
/* Funções puras do domínio, não fixture: `emDigitacao` precisa da MESMA definição de
 * "telefone tem dígitos suficientes" que o caso de uso usa, senão a tela espera por um fim
 * que o servidor não reconhece (ou manda antes dele). Ver as regras de import no LEIA-ME. */
import { TELEFONE_MIN_DIGITOS, emailPlausivel, soDigitos } from "@/nucleo/dominio/clientes";
import { estadoDaGravacao, semConfirmacao, type EstadoDaGravacao, type RecursoGravado } from "@/ui/estado/leitura";
import type { Canal } from "@/nucleo/dominio/canal";
import { statusDaMaisa, type StatusDaMaisa } from "@/nucleo/dominio/status-da-maisa";
import { MAX_DIAS_VARRIDOS, PASSO_MIN, vagasDoDia } from "@/nucleo/dominio/vagas";
import { chaveDe, type ModoDoNumero } from "@/nucleo/dominio/contatos";
import type { CaminhoFiscal, ConfigFiscal } from "@/nucleo/dominio/fiscal";
import type { Faq } from "@/nucleo/dominio/faq";
import type { Faturamento } from "@/nucleo/portas/entrada/casos-de-uso";
/* Direto do arquivo, e não do barril `@/nucleo/dominio`: o barril não reexporta
 * `assinatura` (e o `PLANOS` dele colidiria de nome com o de `_lib/planos.ts`, que é
 * outra coisa — lá são os planos exibidos na LP, aqui são as chaves). */
import { ehChaveDePlano, type Assinatura, type ChaveDePlano, type StatusAssinatura } from "@/nucleo/dominio/assinatura";

/**
 * Uma linha da tela de Faturamento.
 *
 * ⚠️ NÃO É `D.Cliente`, e a diferença é o conserto. `fechamento` devolvia clientes, e o valor
 * vinha de `v_clientes.valor` — o total da COMPETÊNCIA. A unidade certa é "o que falta faturar
 * deste cliente", que é `atendimentos.nota_id is null`: já significa "desde a última emissão"
 * e já exclui quem tem nota. Ver `nucleo/dominio/fiscal.ts`.
 */
export type LinhaDeFaturamento = {
  /** O id do CLIENTE — as telas continuam abrindo a gaveta por ele. */
  id: string;
  nome: string;
  valor: number;
  /** Quantos atendimentos sem nota. Zero = já emitida, e a linha é histórico. */
  atendimentos: number;
  cpf: string;
  teste: boolean;
  servicoId: string;
  canal: string;
  /** O serviço mais frequente do período, do snapshot do atendimento. */
  servico: string | null;
  /** ⚠️ Sem CPF a prefeitura recusa — a linha aparece, mas fora do lote. */
  semCpf: boolean;
  /** A competência que o servidor devolveu para esta linha (`YYYY-MM-DD`), ou vazio. A prévia
   *  da nota diz o mês por ela, e não pelo mês de hoje (T5, contradição C12). */
  competencia?: string;
};
import { fmt, toast } from "@/ui/primitivos";
import { escreverEndereco, lerEndereco, secaoDoEndereco, type Endereco } from "./endereco";
import type { PassoDeAtivacao } from "@/nucleo/dominio/ativacao";

/* ───────────────────────────── tipos ───────────────────────────── */

export type TelaId =
  | "fluxo" | "conversas" | "agenda" | "clientes" | "faturamento"
  /* `fiscal` é a tela "Documento fiscal": onde se escolhe entre nota fiscal e recibo. Fora do
   * rail de propósito, como `contatos` — é configuração que se faz uma vez, e um ícone
   * permanente competiria com as telas do dia. Chega-se por "Mais" e pelo Faturamento. */
  | "fiscal"
  | "equipe" | "servicos" | "assistente" | "contatos" | "mais";

export type AbaConversa = "todas" | "espera" | "maisa" | "ok";

/**
 * ⚠️ CÓPIA DO `Assistente` DO DOMÍNIO, e as duas têm que andar juntas.
 *
 * Campo novo lá que não venha para cá não dá erro de compilação em lugar nenhum — a tela
 * simplesmente não enxerga o dado, e o `PATCH` que a store monta nunca o envia. Foi o que
 * aconteceu com `lembreteHoras` em 04/09/2026: o domínio ganhou o campo, o adaptador
 * gravava, e a tela não tinha como escolher.
 *
 * A cópia existe porque este tipo é contrato com as telas (a mesma razão do aviso sobre
 * `status` no `CLAUDE.md`). Unificar com o domínio é limpeza legítima e não foi feita aqui
 * para não misturar refactor com feature.
 */
export type Assistente = {
  nome: string;
  tom: D.Tom;
  saudacao: string;
  ativa: boolean;
  /** Horas antes do atendimento. Ver `OPCOES_ANTECEDENCIA` e a migração 026. */
  lembreteHoras: number;
};

/**
 * Um atendimento com tudo resolvido — o que as telas consomem.
 *
 * ⚠️ Ele **É** um evento do Google Calendar. Não existe atendimento fora de lá: o `id`
 * deriva do `eventId`, e a única coisa que o app guarda por cima é a etapa do kanban.
 * Apagou no Google, sumiu daqui. Abriu noutro navegador, está lá.
 *
 * Aqui morava um `EventoGoogle`, que era o VÍNCULO entre um agendamento do localStorage
 * e o evento correspondente lá. Vínculo pressupõe dois lados; agora há um só.
 */
export type AgendamentoVivo = {
  /** "ag:<eventId>". O prefixo é o que separa, na Gaveta, um atendimento de um
   *  bloqueio (`bloq:`) e de um rascunho ainda não criado (`novo-…`). */
  id: string;
  eventId: string;
  /** A chave do atendimento na tabela (`maisaAg`). É por ela que se remarca (1B.5). Ausente
   *  numa série recém-criada com Google, até a leitura seguinte trazê-la. */
  ag?: string;
  /** Data ISO, "YYYY-MM-DD". */
  data: string;
  inicio: number;
  fim: number;
  duracao: number;
  profissionalId: string;
  profissional: D.Profissional;
  servico: D.Servico;
  cliente: D.Cliente;
  /** O valor DESTA sessão, como foi gravado no atendimento (`servicoValor`). Não é o preço do
   *  catálogo: o serviço pode ter mudado de preço depois, e a sessão pode ter sido marcada com
   *  outro valor. `null` quando o evento não trouxe valor (evento antigo, marcado por fora):
   *  a gaveta diz "—" em vez de imprimir o preço de hoje como se fosse o daquele dia (1A.5). */
  valor: number | null;
  confirmado: boolean;
  etapa: D.Etapa;
  meetLink?: string;
  htmlLink?: string;
  /** Instância de série recorrente. A MAISA nunca cria uma — se houver, veio de fora. */
  recorrente: boolean;
  /** O catálogo local não conhece este serviço (ou cliente): os dados vieram gravados no
   *  próprio evento. Acontece ao abrir noutro navegador um atendimento marcado com um
   *  serviço que o usuário criou. Renderiza igual; a gaveta é que avisa. */
  soltoDoCatalogo: boolean;
};

/** Um atendimento como o Google devolveu, antes de resolver profissional/serviço/cliente. */
type AtendimentoLido = {
  eventId: string;
  /** `maisa.ag` da leitura, ou a chave do rascunho que o criou. Ver `AgendamentoVivo.ag`. */
  ag?: string;
  data: string;
  inicio: number;
  fim: number;
  duracao: number;
  profissionalId: string;
  clienteId: string;
  clienteNome: string;
  clienteTel: string;
  servicoId: string;
  servicoNome: string;
  servicoValor: number;
  /** `servicoValor` como veio, sem o `|| 0`: `null` se o evento não trouxe valor. */
  valorGravado: number | null;
  confirmado: boolean;
  meetLink?: string;
  htmlLink?: string;
  recorrente: boolean;
};

/** Um compromisso lido da agenda do Google que NÃO é um atendimento da MAISA.
 *
 *  Aparece na grade em cinza, ocupa o horário e não se arrasta. É o dentista, o
 *  almoço, a reunião — coisas que tornam o horário indisponível e que a agenda
 *  precisa mostrar para não oferecer um horário que não existe. Só leitura: um
 *  arrasto que fizesse PATCH aqui mexeria no compromisso pessoal de alguém. */
export type Bloqueio = {
  /** "bloq:<pid>:<eventId>" — o prefixo é o que impede confundir com um agendamento; o pid
   *  entra porque duas agendas podem trazer o mesmo evento (um calendário compartilhado). */
  id: string;
  eventId: string;
  /** De qual agenda a leitura veio. O bloqueio ocupa a coluna DESSA pessoa, não a de todo
   *  mundo: o almoço do dono não tira o horário do Diego (24/09/2026, item 1A.4). */
  profissionalId: string;
  data: string;
  inicio: number;
  fim: number;
  duracao: number;
  titulo: string;
  recorrente: boolean;
  meetLink?: string;
  htmlLink?: string;
};

/** O que sobrevive a um F5. */
type Persistido = {
  /** Versão do formato, gravada junto. Sem ela, um `maisa.app.v3` escrito por uma versão
   *  futura seria lido como se fosse deste formato — e o sintoma apareceria como dado
   *  estranho na tela, não como incompatibilidade. */
  __v: number;
  etapas: Record<string, D.Etapa>;
  /* ⚠️ AQUI MORAVAM `profAtivo`, `svcAtivo`, `svcEdit` E `svcNovos`, e a saída deles em
   * 15/08/2026 é o conserto de um defeito, não uma limpeza.
   *
   * Os quatro guardavam CATÁLOGO no `localStorage`: quem estava ligado, o que tinha sido
   * editado, o que tinha sido criado. Como não existia `/api/servicos` nem `/api/equipe`,
   * eles eram o único lugar onde essas decisões viviam — e um F5 as apagava. A tela dizia
   * "persiste na hora"; persistia no navegador de quem editou, até o cache sumir.
   *
   * Agora o catálogo vem de `GET /api/cadastro` e volta por PUT. Nada dele fica aqui: um
   * mapa local sobrevivente reapareceria por cima do banco depois de o dono editar noutro
   * aparelho, e ninguém entenderia por que o preço "voltou sozinho".
   *
   * O `__v` NÃO subiu de propósito. Campo desconhecido no JSON salvo é ignorado na
   * leitura, então um `localStorage` antigo com os quatro mapas simplesmente perde o que
   * sobrava — que é o resultado desejado. Subir a versão descartaria junto `etapas`,
   * `notas` e `resolvidos`, que continuam válidos e são do dia a dia. */
  /* Aqui moravam `novosAgendamentos` (os atendimentos) e `googleEventos` (o vínculo com
   * o Google). Os dois saíram na fatia 4, e a razão é a mesma: o atendimento AGORA É o
   * evento do Google. Guardar uma cópia local seria manter uma segunda verdade que
   * começa igual e diverge no primeiro arrasto feito direto no Google Calendar.
   *
   * O que sobrou por cima do evento é `etapas`, chaveado por `ag:<eventId>`. Fica aqui e
   * não lá de propósito: pôr a etapa no Google transformaria cada arrasto do kanban num
   * PATCH numa agenda real. */
  /* ⚠️ AQUI MORAVA `cliAtivo`, e a saída dele em 24/08/2026 é o conserto do MESMO defeito
   * que tirou os quatro de cima — nove dias depois, porque este passou desapercebido.
   *
   * Ele guardava quem estava "em atendimento" no `localStorage`. O dono tirava alguém do
   * faturamento, via a lista mudar, dava F5, e a pessoa voltava — e como `clientes.ativo`
   * existia no banco desde o começo, o mapa local ainda ficava POR CIMA dele: quem
   * desativasse num aparelho veria o cliente ativo no outro, para sempre.
   *
   * Agora `ativo` vem de `GET /api/cadastro` e volta por `PUT /api/clientes`, junto com o
   * resto da ficha. O `__v` NÃO subiu, pelo mesmo motivo escrito acima: campo desconhecido
   * é ignorado na leitura, então um `localStorage` antigo perde só o mapa — que é o
   * resultado desejado. Subir a versão descartaria `etapas` e `notas`, que são do dia a dia. */
  /* Aqui moravam `assumidas` e `enviadas` — quem conduzia cada conversa e o que você tinha
   * respondido. Saíram na fatia das conversas reais, e o motivo é o mesmo dos atendimentos:
   * o dado tem dono, e o dono não é este navegador.
   *
   * `assumidas` era pior que uma cópia local: o botão "Assumir" prometia, no toast, que a
   * MAISA não responderia mais naquela conversa — e o webhook nunca soube. Estado que muda o
   * comportamento do AGENTE não pode morar no `localStorage` de um dos aparelhos do dono.
   *
   * `enviadas` guardava as suas respostas só aqui: elas não iam para o WhatsApp de ninguém e
   * não entravam na thread que o modelo replaya. Agora `voce` é gravado em `mensagens_agente`
   * como qualquer outra fala — era a dívida "voce nunca é gravado" do LEIA-ME do agente. */
  resolvidos: Record<string, boolean>;
  notas: Record<string, D.Nota>;
  proximoNumero: number;
  /* Aqui moravam `assistente` e `cfg` — o nome, o tom, a saudação e os sete toggles de
   * comportamento. Saíram em 13/08/2026 pelo MESMO motivo que `assumidas` saiu, e a
   * frase que está escrita quinze linhas acima já dizia o porquê antes de existir para
   * onde ir: "estado que muda o comportamento do AGENTE não pode morar no `localStorage`
   * de um dos aparelhos do dono".
   *
   * Era literalmente isso: o dono escrevia o tom no notebook, e no WhatsApp a MAISA
   * respondia com a fixture global — a mesma para todo inquilino. Configurar não
   * configurava nada. Agora vêm de `GET /api/assistente` e vão por `PATCH`, e o agente lê
   * a MESMA linha (ver `composicao.ts`, `configuracaoDoAgente`).
   *
   * `dias` foi junto, algumas horas depois, e a dívida que estava escrita aqui ("tem
   * tabela e ainda não tem porta… some se o dono trocar de aparelho") ficou paga. Era
   * pior do que a frase dizia: a MAISA respondia "que horas vocês atendem?" com o
   * expediente do PROFISSIONAL — outro dado, com outra finalidade. Agora vem de
   * `GET /api/horarios` e vai por `PUT`, e a persona anuncia a MESMA grade.
   *
   * Sobra a regra, e ela vale para o próximo campo que alguém pensar em pôr aqui: só
   * mora no `localStorage` o que é preferência de APARELHO (a aba aberta, o rascunho de
   * um formulário). O que muda o comportamento do agente, não. */
};

const CHAVE = "maisa.app.v3";
const CHAVE_ANTIGA = "maisa.app.v2";

/**
 * Quanto se espera antes de mandar os ajustes da MAISA ao servidor.
 *
 * 500ms é o intervalo em que uma pausa de digitação já parece fim de palavra, e curto o
 * bastante para que sair da tela logo depois ainda encontre o timer vivo (o desmonte
 * força o envio de qualquer jeito). Aumentar economiza requisição e aumenta a chance de
 * perder a última tecla; diminuir faz o contrário.
 */
const JANELA_AJUSTES = 500;

/** De quanto em quanto se pergunta se o QR já foi escaneado. */
const INTERVALO_PAREAMENTO = 3000;
/** Quantas perguntas antes de desistir. 3s × 40 ≈ 2min, mais que a validade de um QR. */
const TENTATIVAS_PAREAMENTO = 40;
/**
 * Quantas vezes o código se renova sozinho antes de a tela desistir.
 *
 * Existe porque a renovação automática, sem teto, deixaria um painel esquecido numa aba
 * pedindo código novo ao WhatsApp para sempre — uma chamada por minuto, indefinidamente,
 * por um pareamento que ninguém vai concluir. Cinco dá cerca de seis minutos de janela,
 * que é muito mais do que a tarefa precisa e pouco o bastante para não virar rotina.
 */
const MAX_RENOVACOES_CODIGO = 5;

/* Motivos que a rota de conexão devolve na query string, em português de gente.
 * Cada um diz o que aconteceu E o que fazer — "erro genérico" não ajuda ninguém. */
const MOTIVO_GOOGLE: Record<string, string> = {
  nao_configurado: "O Google Calendar ainda não está configurado neste ambiente",
  nao_autenticado: "Sua sessão expirou — entre de novo para conectar",
  login_necessario: "Entre na sua conta para conectar uma agenda",
  profissional_invalido: "Profissional não encontrado",
  /* Novo com o `tenantId` real: logado, mas sem linha em `membros`. Não é erro de OAuth —
   * é o estado de quem acabou de criar a conta e ainda não tem negócio provisionado. */
  /* ⚠️ Esta frase dizia "Rode criar_negocio() no Supabase antes de conectar a agenda" até
   * 15/08/2026 — instrução de desenvolvedor entregue ao cliente final, e a confissão de
   * que o produto não sabia se ativar sozinho. Agora existe `/comecar`, e quem cai aqui é
   * levado para lá pelo `lerCadastro`; esta frase é só o que se lê no meio-tempo. */
  sem_negocio: "Termine de criar seu negócio para conectar a agenda",
  permissao_negada: "Você não autorizou o acesso à agenda",
  sessao_expirada: "A conexão demorou demais — tente de novo",
  sem_codigo: "O Google não devolveu a autorização",
  pkce_ausente: "A conexão foi interrompida — tente de novo",
  sem_refresh_token: "O Google não liberou acesso contínuo. Remova a MAISA em myaccount.google.com → Segurança e conecte de novo",
  /* Os quatro abaixo eram um "falha_ao_conectar" só. Separados porque o conserto de
     cada um é diferente — e quem conecta uma agenda não tem como abrir log de servidor. */
  troca_recusada: "O Google recusou a troca do código. Confira o GOOGLE_CLIENT_SECRET e se o redirect URI cadastrado bate exatamente com o do app",
  secret_invalido: "O Google não reconheceu o app (invalid_client): o GOOGLE_CLIENT_ID ou o GOOGLE_CLIENT_SECRET no Vercel não são os do client OAuth que você criou",
  uri_nao_bate: "O redirect URI não bate. Cadastre exatamente https://…/api/google/callback no client OAuth, sem barra no fim",
  codigo_gasto: "A autorização venceu ou já tinha sido usada. Clique em Conectar de novo e conclua sem recarregar a página",
  sem_email: "Autorizou, mas não deu para ler o e-mail da conta. Falta o escopo userinfo.email na tela de consentimento",
  chave_invalida: "GOOGLE_TOKEN_KEY inválida: precisa dar 32 bytes ao decodificar de base64. Gere com openssl rand -base64 32 e cole o valor inteiro",
  falha_ao_salvar: "Autorizou, mas o banco recusou a gravação. Confira se o SQL de supabase/ rodou no projeto certo",
  falha_ao_conectar: "Não foi possível concluir a conexão com o Google",
};

/** Status de erro das rotas de evento (respostas JSON). */
const RESPOSTA_GOOGLE: Record<string, string> = {
  nao_configurado: "O Google Calendar não está configurado neste ambiente",
  nao_autenticado: "Sua sessão expirou — entre de novo",
  login_necessario: "Entre na sua conta para ver e marcar na agenda.",
  sem_negocio: "Esta conta ainda não tem um negócio criado",
  payload_invalido: "Faltam dados do atendimento",
};

/** Um único array vazio compartilhado para os dias sem nada marcado — devolver `[]` novo a cada
 *  chamada faria toda dependência de memo mudar de identidade sem nada ter mudado de verdade. */
const SEM_ATENDIMENTO: AgendamentoVivo[] = [];
const SEM_BLOQUEIO: Bloqueio[] = [];

/* ─────────────────────────────────────────────────────────────────────────────
 * O CADASTRO — quem eu sou, quem atende, o que eu vendo, quem são meus clientes.
 *
 * Vem de `GET /api/cadastro`, que por dentro é o caso de uso `lerCadastro`. Antes as telas
 * liam `D.EQUIPE`, `D.SERVICOS`, `D.CLIENTES` e `D.NEGOCIO` — arrays importados do módulo
 * de fixtures — e por isso o app inteiro dependia de dado em memória para desenhar a grade.
 *
 * ⚠️ O FIXTURE CONTINUA AQUI, COMO VALOR INICIAL, E ISSO É DELIBERADO.
 *
 * A alternativa era começar com `null` e ensinar cada consumidor a esperar. Só que
 * praticamente todo consumidor é síncrono e nenhum tem estado de carregando: a grade da
 * Agenda monta `grid-template-columns` a partir de `agendas` (lista vazia ⇒ `repeat(0, …)`
 * e sobra só a régua de horas), o rail lê `negocio.nome` sem `?.`, e a cascata de despacho
 * da Gaveta decide a entidade por "qual lista contém este id" — com listas vazias ela abre
 * gaveta em branco. Seriam seis arquivos ganhando estado de carregando de uma vez, num
 * passo que já troca a fonte do dado.
 *
 * Então o fixture virou PLACEHOLDER: a tela pinta na primeira passada com ele e repinta com
 * o real quando o fetch volta. Em modo demonstração (sem Supabase) os dois são iguais, e o
 * repinte é invisível — porque `/api/cadastro` cai no mesmo `repositorioDemo`.
 *
 * O PREÇO, e o que se faz com ele: se o fetch FALHAR, a tela segue mostrando o fixture — ou
 * seja, mentindo com cara de dado real. É o pior modo de falha desta escolha, e é por isso
 * que `cadastroErro` existe e viaja no store: quem mostra número de negócio tem como dizer
 * que aquilo não é o negócio de verdade. Sem esse aviso, esta decisão seria indefensável.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Cadastro = {
  negocio: D.Negocio;
  profissionais: D.Profissional[];
  servicos: D.Servico[];
  clientes: D.Cliente[];
  /** Agendas que ESTA sessão pode operar. Vem do servidor: é allowlist, não filtro de tela. */
  agendas: string[];
};

const CADASTRO_INICIAL: Cadastro = {
  negocio: D.NEGOCIO,
  profissionais: D.EQUIPE,
  servicos: D.SERVICOS,
  clientes: D.CLIENTES,
  agendas: D.COLUNAS_AGENDA,
};

/** Motivo → frase, no mesmo espírito de `MOTIVO_GOOGLE`. O `status` é contrato com
 *  `entrada/http/respostas.ts` e com o porteiro — procure o nome lá antes de mudar aqui. */
const MOTIVO_CADASTRO: Record<string, string> = {
  nao_autenticado: "Faça login para ver os dados do seu negócio.",
  login_necessario: "Faça login para ver os dados do seu negócio.",
  sem_negocio: "Esta conta ainda não tem um negócio criado.",
  nao_configurado: "O banco de dados não está configurado neste ambiente.",
  erro: "Não foi possível carregar o cadastro do negócio.",
};

/* Idem para os ajustes da MAISA. Mesmos nomes de `status` — contrato com `respostas.ts`.
 *
 * ⚠️ `carregar` e `salvar` são fallbacks SEPARADOS de propósito. Uma frase só para os dois
 * mente na metade das vezes: "não foi possível salvar" numa falha de LEITURA manda o dono
 * procurar o que ele fez de errado ao editar, quando o problema é que a tela nunca chegou
 * a ter o dado dele.
 *
 * `payload_invalido` é o que `respostas.ts:34` devolve para `NaoEncontrado` — e aqui isso
 * tem UM significado concreto: não existe linha em `assistente` para este inquilino. Só
 * acontece com negócio nascido fora de `criar_negocio()`, e a frase diz o que fazer. */
const MOTIVO_AJUSTES: Record<string, string> = {
  nao_autenticado: "Faça login para ajustar a MAISA.",
  login_necessario: "Faça login para ajustar a MAISA.",
  sem_negocio: "Esta conta ainda não tem um negócio criado.",
  nao_configurado: "O banco de dados não está configurado neste ambiente.",
  payload_invalido: "Este negócio não tem ajustes da MAISA gravados. Ele foi criado sem passar por criar_negocio().",
  carregar: "Não foi possível carregar os ajustes da MAISA.",
  salvar: "Não foi possível salvar os ajustes da MAISA.",
};

/* O horário anunciado. `payload_invalido` aqui é quase sempre uma recusa COM frase
 * própria (`"Sábado: o fechamento tem que ser depois da abertura."`), e por isso quem
 * envia prefere o `info` do servidor a este mapa — ver `enviarSemana`. */
const MOTIVO_HORARIOS: Record<string, string> = {
  nao_autenticado: "Faça login para ajustar o horário.",
  login_necessario: "Faça login para ajustar o horário.",
  sem_negocio: "Esta conta ainda não tem um negócio criado.",
  nao_configurado: "O banco de dados não está configurado neste ambiente.",
  payload_invalido: "Este negócio não tem horário gravado. Ele foi criado sem passar por criar_negocio().",
  carregar: "Não foi possível carregar o horário de atendimento.",
  salvar: "Não foi possível salvar o horário de atendimento.",
};

/* O canal de WhatsApp. `reconectar` é o status que `respostas.ts:39` devolve para
 * `PrecisaReconectar` — e aqui ele chega quando o inquilino não tem canal e alguém tentou
 * mandar mensagem. A frase precisa dizer a AÇÃO, porque existe uma e é esta tela. */
const MOTIVO_CANAL: Record<string, string> = {
  nao_autenticado: "Faça login para conectar o WhatsApp.",
  login_necessario: "Faça login para conectar o WhatsApp.",
  sem_negocio: "Esta conta ainda não tem um negócio criado.",
  nao_configurado: "Falta configuração no servidor para conectar o WhatsApp.",
  reconectar: "O WhatsApp deste negócio não está conectado.",
  ler: "Não foi possível consultar o WhatsApp.",
  conectar: "Não foi possível gerar o QR code.",
  desconectar: "Não foi possível desconectar.",
};

/**
 * A frase do erro do canal, COM a lista do que falta quando o servidor a mandou.
 *
 * `respostas.ts:26` sempre devolve `faltando[]` junto de `nao_configurado`, e essa lista
 * era descartada aqui: a tela dizia "falta configuração no servidor" e o nome da variável
 * ficava só no código. Em 13/08/2026 isso custou um canal fora do ar e uma hora de
 * caça — a informação existia na resposta e ninguém a mostrava.
 */
function motivoCanal(r: { status?: string; info?: string; faltando?: string[] }, padrao: string): string {
  const base = MOTIVO_CANAL[r?.status ?? ""] ?? r?.info ?? padrao;
  const faltam = r?.faltando ?? [];
  return faltam.length ? `${base} Falta: ${faltam.join(", ")}.` : base;
}

/** Idem para as conversas. Mesmos nomes de `status` — eles são contrato com `respostas.ts`. */
const MOTIVO_CONVERSAS: Record<string, string> = {
  nao_autenticado: "Faça login para ver as conversas do WhatsApp.",
  login_necessario: "Faça login para ver as conversas do WhatsApp.",
  sem_negocio: "Esta conta ainda não tem um negócio criado.",
  nao_configurado: "O banco de dados não está configurado neste ambiente.",
  erro: "Não foi possível carregar as conversas do WhatsApp.",
};

/** Thread vazia compartilhada — devolver `[]` novo a cada chamada faria a Thread repintar
 *  a cada render, e junto com ela o `scrollIntoView` do fim da conversa. */
const SEM_MSG: D.Msg[] = [];

/**
 * De quanto em quanto tempo a tela de Conversas relê, com ela aberta.
 *
 * 15s é o intervalo em que uma resposta da MAISA aparece "quase na hora" para quem está
 * olhando, sem virar uma consulta por segundo. Só roda com a tela de Conversas em foco (ver o
 * efeito): num inbox, dado velho é pior que em qualquer outra tela do app — o dono decide
 * assumir ou não a partir do que está escrito ali.
 *
 * O caminho honesto seria realtime (o Supabase tem), e é a próxima fatia. Polling é o que dá
 * para fazer sem abrir um canal novo, e num painel de uma pessoa o custo é irrelevante.
 */
const RELER_CONVERSAS_MS = 15_000;

/* ── quando o catálogo local não conhece o que veio do Google ──
 *
 * O caso real não é exótico: o Bruno marca no computador com um serviço que ele mesmo
 * criou (que vive só no localStorage dali) e abre o app no celular. O `maisaSvc` do evento
 * aponta para um id que aquele navegador nunca viu.
 *
 * Sem isto o atendimento simplesmente não renderizaria — some da grade sem aviso, e some
 * DEPOIS de ter aparecido no outro aparelho. Com as cópias gravadas no próprio evento (ver
 * PROPS em calendario.ts) ele renderiza inteiro; o que se perde é a ligação com o catálogo,
 * e é isso que `soltoDoCatalogo` marca para a gaveta poder dizer. */
const servicoDoEvento = (e: AtendimentoLido): D.Servico => ({
  id: e.servicoId || `sv-google-${e.eventId}`,
  nome: e.servicoNome,
  categoria: "Extra",
  preco: e.servicoValor,
  duracao: e.duracao,
  profissionalIds: [e.profissionalId],
  // `ativo: false` — ele não está no catálogo, então não deve aparecer como opção para
  // marcar o PRÓXIMO atendimento. Serve só para descrever este.
  ativo: false,
});

const clienteDoEvento = (e: AtendimentoLido): D.Cliente => ({
  id: e.clienteId || `cl-google-${e.eventId}`,
  nome: e.clienteNome,
  telefone: e.clienteTel,
  email: "",
  cpf: "",
  canal: "Online",
  ativo: true,
  desde: "—",
  servicoId: e.servicoId,
  atendimentos: 0,
  valor: 0,
});

/** uuid v4. `randomUUID` existe em todo navegador com https (ou localhost); o fallback é
 *  para o resto e não precisa ser criptográfico — só precisa não repetir. */
function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const INICIAL: Persistido = {
  __v: 3,
  etapas: {},
  resolvidos: {},
  notas: {},
  proximoNumero: D.PROXIMO_NUMERO,
};

/**
 * Os ajustes da MAISA enquanto `GET /api/assistente` não respondeu.
 *
 * É placeholder de PRIMEIRA PINTURA, não default de produto: o padrão de verdade nasce
 * no banco, no provisionamento, com o tom variando por vertical
 * (`005_provisionar.sql:209`). Se estes valores ficarem na tela, é porque a resposta não
 * chegou — e é isso que `ajustesErro` existe para dizer.
 */
const AJUSTES_PLACEHOLDER = {
  assistente: {
    nome: "MAISA",
    tom: "amigável" as D.Tom,
    saudacao: `Olá! Aqui é a MAISA, assistente do ${D.NEGOCIO.nome}. Como posso te ajudar hoje?`,
    ativa: true,
    /* O `default` da coluna, não uma escolha de tela — mesmo papel do `tom` acima. Quem
     * nasce consultório recebe 24h no provisionamento, e é a resposta do servidor que
     * substitui isto. Ver `HORAS_ANTES` e a migração 026. */
    lembreteHoras: D.HORAS_ANTES,
  },
  cfg: D.CFG_PADRAO,
};

/**
 * A semana enquanto `GET /api/horarios` não respondeu.
 *
 * Mesmo papel do `AJUSTES_PLACEHOLDER`, e o mesmo aviso: se estes valores ficarem na
 * tela, é porque a resposta não chegou. O padrão de verdade nasce no provisionamento,
 * derivado do expediente do primeiro profissional (`005_provisionar.sql:195`).
 */
const SEMANA_PLACEHOLDER: D.SemanaAnunciada = D.DIAS_PADRAO.map((d, dow) => ({
  dow,
  aberto: d.aberto,
  de: d.aberto ? d.de : null,
  ate: d.aberto ? d.ate : null,
}));

/**
 * Traz o que dá do `maisa.app.v2` para o v3, uma única vez.
 *
 * O que MUDOU e por isso não atravessa: a agenda deixou de ser um julho/2026 fixo
 * endereçado por dia do mês e passou a usar datas reais. Três campos eram chaveados
 * por aquele calendário e não têm tradução:
 *
 *   posicoes          — "o atendimento X está no dia 17 às 14h". Não existe dia 17 de
 *                       um mês que não existe. Trazer viraria bloco em data aleatória.
 *   novosAgendamentos — mesmo problema: `dia: 22` não aponta para lugar nenhum.
 *   etapas            — chaveado por ids (`ag-17-3`) que o gerador não produz mais.
 *
 * `googleEventos` entrou na lista dos descartados depois, na fatia 4: ele era o VÍNCULO
 * entre um agendamento local e um evento do Google, e agora não há agendamento local para
 * vincular. Os eventos que ele apontava seguem de pé no Google — e são LIDOS de volta,
 * que é justamente por que o vínculo deixou de ser necessário. Não se perde nada.
 *
 * O que ATRAVESSA é o que custa caro perder: `notas` guarda referências REAIS da Focus
 * e números de NFS-e que foram emitidos de verdade na prefeitura — apagar isso seria
 * apagar documento fiscal do histórico da tela.
 *
 * ⚠️ A v2 NÃO é apagada. Ela fica como a única saída de emergência se esta conversão
 * estiver errada de um jeito que só apareça em uso. Sai numa versão futura.
 */
function migrarDaV2(): string | null {
  const velho = localStorage.getItem(CHAVE_ANTIGA);
  if (!velho) return null;
  try {
    // Estes três já não existem no formato de hoje, mas existiam no v2 e são justamente
    // campos a DESCARTAR — o tipo precisa admiti-los para o destructuring poder recusá-los.
    const v2 = JSON.parse(velho) as Partial<Persistido> & {
      posicoes?: Record<string, unknown>;
      novosAgendamentos?: unknown[];
      googleEventos?: Record<string, unknown>;
    };
    const { posicoes, novosAgendamentos, etapas, googleEventos, ...atravessa } = v2;
    const novo = JSON.stringify({ ...atravessa, __v: 3 });
    localStorage.setItem(CHAVE, novo);
    const perdidos = [
      Object.keys(posicoes ?? {}).length && "posições de arrasto",
      (novosAgendamentos ?? []).length && "atendimentos marcados no protótipo",
      Object.keys(etapas ?? {}).length && "etapas do kanban",
      Object.keys(googleEventos ?? {}).length && "vínculos com eventos do Google (os eventos seguem lá)",
    ].filter(Boolean);
    if (perdidos.length) {
      console.info(`[store] migrado v2 → v3. Não veio junto: ${perdidos.join(", ")}.`);
    }
    return novo;
  } catch {
    // v2 corrompido não deve impedir o app de abrir no v3 limpo.
    return null;
  }
}

/* ───────────────────────────── contexto ───────────────────────────── */

export type StoreValue = {
  /* navegação */
  tela: TelaId;
  /** `secao` só vale se estiver na lista de `SECOES` daquela tela (`endereco.ts`); senão, o padrão. */
  irPara: (t: TelaId, secao?: string) => void;
  /** O recorte pedido da tela atual (`?secao=` ou `irPara(t, secao)`). `null` = tela sem seções. */
  secao: string | null;
  /** A tela pediu o celular inteiro (T11, 25/09/2026): a casca esconde o cabeçalho e as abas.
   *  Hoje só a conversa aberta pede, e ela tem o próprio "voltar". Trocar de tela desliga. */
  telaCheia: boolean;
  setTelaCheia: (v: boolean) => void;
  /** O que a jornada de ativação leu de `/api/ativacao` (1C.7): a linha do Fluxo e a gaveta
   *  "jornada" mostram o mesmo. `null` = ainda não leu. Quem lê é `JornadaDeAtivacao`. */
  ativacao: { feitos: PassoDeAtivacao[]; passos: readonly PassoDeAtivacao[] } | null;
  setAtivacao: (a: { feitos: PassoDeAtivacao[]; passos: readonly PassoDeAtivacao[] } | null) => void;
  /** id aberto na Gaveta (cliente, agendamento, conversa, serviço, seção…). */
  sel: string | null;
  abrir: (id: string) => void;
  fechar: () => void;

  /* fluxo de hoje + agenda (mesma lista) — `agendamentos` é a JANELA visível */
  agendamentos: AgendamentoVivo[];
  agendamentosDoDia: (data: string) => AgendamentoVivo[];
  agendamentoPorId: (id: string) => AgendamentoVivo | undefined;
  moverEtapa: (id: string, etapa: D.Etapa) => void;
  avancarEtapa: (id: string) => void;
  /** O destrutivo à espera do segundo toque: o id do atendimento, ou a `confirmar.chave` de
   *  qualquer `AcaoDestrutiva` da gaveta (`excluir:sv3`, `cancelar-nota:<ref>`). */
  cancelarPedido: string | null;
  /** `null` desiste ("Voltar"). Abrir, fechar e trocar de tela também desistem. */
  pedirCancelamento: (chave: string | null) => void;
  /** ⚠️ APAGA o evento na agenda real e avisa quem estiver convidado. Peça confirmação. */
  cancelarAtendimento: (id: string) => void;
  /** O novo dia e horário sendo escolhidos na gaveta de um atendimento (1B.5). `null` = nenhum.
   *  Abrir, fechar e trocar de tela desistem, como no cancelar. */
  remarcacao: { id: string; data: string; inicio: number } | null;
  /** Com o id, começa no dia e horário atuais; `null` desiste ("Voltar"). */
  pedirRemarcacao: (id: string | null) => void;
  editarRemarcacao: (parcial: { data?: string; inicio?: number }) => void;
  /** `PATCH /api/atendimentos`: banco primeiro, Google depois. O bloco muda de lugar só com a
   *  resposta (não é otimista: o conflito de horário é o servidor que vê inteiro). */
  remarcarAtendimento: (id: string) => void;
  /** Itens da fila "Precisa de você" que ainda não foram resolvidos. */
  fila: D.ItemFila[];
  resolverFila: (alvo: string) => void;

  /* arrasto (compartilhado por kanban e agenda) */
  arrastando: string | null;
  alvoSolta: string | null;
  iniciarArrasto: (id: string) => void;
  encerrarArrasto: () => void;
  marcarAlvo: (alvo: string | null) => void;

  /* ── conversas de WhatsApp, do servidor ──
   *
   * Vinham de `D.CONVERSAS` e `D.THREADS` — seis conversas escritas à mão, com horas fixas e
   * ids `cv1`…`cv6`. Agora vêm de `GET /api/conversas`, que lê a MESMA tabela que o agente
   * escreve. Aqui NÃO há placeholder de fixture, ao contrário do cadastro: uma conversa
   * inventada na tela é uma pessoa inventada, e o dono responderia a ela. Lista vazia é a
   * verdade quando ninguém escreveu ainda. */

  /** Mais recente primeiro. O `id` de cada uma é a chave do telefone — ver `dominio/conversas`. */
  conversas: D.Conversa[];
  conversaDe: (id: string) => D.Conversa | null;
  /** Frase quando a lista não carregou. A tela mostra isso em vez de "nenhuma conversa". */
  conversasErro: string | null;
  /** O erro é de sessão (`nao_autenticado`/`login_necessario`): tentar de novo não resolve, entrar
   *  resolve. A tela troca o "Tentar de novo" por "Entrar" (T4, mesmo par de Contatos). */
  conversasPrecisaEntrar: boolean;
  /** Já voltou do servidor? `false` cobre "carregando" e "falhou" — a tela distingue pelo erro. */
  conversasCarregadas: boolean;
  recarregarConversas: () => void;

  convSel: string;
  selecionarConversa: (id: string) => void;
  abaConv: AbaConversa;
  setAbaConv: (a: AbaConversa) => void;
  /* `estadoConversa(id)` morava aqui. Saiu: `Conversa` agora CARREGA o estado (derivado no
     servidor por `estadoDaConversa`), então a tela lê `c.estado` do objeto que ela já tem.
     Manter a função seria oferecer dois jeitos de fazer a mesma pergunta — e o jeito indireto
     obrigava a varrer a lista por id para descobrir o que estava na mão. Quem só tem o id usa
     `conversaDe(id)?.estado`. */
  threadDe: (id: string) => D.Msg[];
  /** A thread da conversa aberta ainda está vindo? Só ela — as outras não interessam. */
  threadCarregando: boolean;

  /** ⚠️ MANDA MENSAGEM DE VERDADE no WhatsApp da pessoa. Não se desfaz. */
  enviar: (id: string, txt: string) => void;
  /** Enquanto o envio está no ar. O composer desabilita — Enter duplo mandaria duas. */
  enviando: boolean;

  /** Assumir CALA A MAISA naquela conversa, no servidor. Devolver a solta de novo. */
  assumir: (id: string) => void;
  devolver: (id: string) => void;
  /**
   * Abre a conversa no WhatsApp do aparelho. ⚠️ Se a MAISA conduz, ASSUME ANTES (1B.7, 04 P0-3):
   * o que o dono escreve lá chega como `fromMe` e é descartado (`contexto.ts`), então com a
   * MAISA no comando seriam duas vozes, e a dela sem saber da dele. O POST sai antes do
   * `window.open`, no mesmo gesto (abrir depois de um `await` o navegador bloqueia).
   * Sem número completo não faz nada: `wa.me/` vazio abre o WhatsApp sem ninguém.
   */
  abrirNoWhatsApp: (id: string) => void;

  /**
   * O caderno de contatos lido (`GET /api/contatos`): o modo do número e a marcação de cada chave.
   * Existe para a ficha do cliente dizer se a MAISA responde a ele (1B.11, 05 P0-2): no modo
   * pessoal quem decide é o caderno, não o cadastro, e a Mariana cadastrada que está nos
   * contatos sem marcação fica calada sem ninguém saber. A regra continua no núcleo
   * (`podeResponder`); aqui só se lê o que ela lê.
   */
  caderno: { fase: "carregando" } | { fase: "erro"; frase: string; entrar?: boolean } | { fase: "ok"; modo: ModoDoNumero; cliente: Record<string, boolean | null> };
  recarregarCaderno: () => void;
  /** Marca o telefone como cliente no caderno (`PATCH /api/contatos { telefone, cliente: true }`,
   *  que faz upsert). Otimista, com volta se o servidor recusar. */
  responderA: (telefone: string) => void;

  /* ── o cadastro, vindo do servidor ──
   * O que substituiu `import * as D from "@/adaptadores/saida/demo"` nas telas. Ver
   * `CADASTRO_INICIAL` para o porquê de ainda existir um placeholder de fixture. */

  /** Negócio, equipe, catálogo de partida, carteira e as agendas permitidas. */
  cadastro: Cadastro;
  /** Frase quando o cadastro NÃO carregou. Não-nulo significa que o que está na tela é
   *  placeholder — quem mostra número do negócio tem obrigação de dizer isso. */
  cadastroErro: string | null;
  /** Já voltou do servidor? `false` cobre tanto "carregando" quanto "falhou". */
  cadastroCarregado: boolean;

  /** Profissional por id, do cadastro. Substitui `D.profissional`. */
  profissionalDe: (id: string) => D.Profissional | null;
  /** Cliente por id, do cadastro. Substitui `D.cliente`. */
  clienteDe: (id: string) => D.Cliente | null;
  /** Serviço como o CADASTRO o conhece, sem as edições locais — é o que responde
   *  "veio do catálogo ou o usuário criou?". Para o vivo, use `servicoDe`. */
  nomeDoProfissional: (id: string) => string;
  nomeDoCliente: (id: string) => string;

  /** A agenda que a tela lê. Vazio até o cadastro chegar — guarde antes de usar na URL. */
  pidAgenda: string;
  /** Este profissional atende neste dia? Lê o expediente do próprio profissional. */
  atendeNoDia: (pid: string, data: string) => boolean;
  /** Cabe um atendimento começando nesta hora? */
  podeComecarEm: (pid: string, data: string, inicio: number) => boolean;

  /* catálogo, equipe, clientes */
  profAtivo: (id: string) => boolean;
  alternarProf: (id: string) => void;
  /**
   * Adiciona alguém à equipe (`PUT /api/equipe` sem `id`, 1B.12) e abre a ficha. Espera o
   * servidor antes de pôr na lista, pelo mesmo motivo do `criarServico`: o id é dele. `true`
   * quando deu certo (o formulário fecha); `false` deixa o formulário com o que foi digitado.
   * Expediente não vai: a rota recusa de propósito (ver `api/equipe/route.ts`).
   */
  criarProfissional: (p: { nome: string; papel: string }) => Promise<boolean>;
  /** Nome e papel, pela ficha. Grava ao sair do campo (a gaveta chama no blur). Otimista, com volta. */
  editarProfissional: (id: string, patch: { nome?: string; papel?: string }) => void;
  svcAtivo: (id: string) => boolean;
  alternarSvc: (id: string) => void;
  /** Catálogo vivo: D.SERVICOS + edições + criados. As telas leem daqui, não de D.SERVICOS. */
  servicos: D.Servico[];
  servicoDe: (id: string) => D.Servico | undefined;
  /** Nome pelo catálogo vivo. Prefira este a `D.nomeServico`, que só lê o catálogo de partida. */
  nomeServico: (id: string) => string;
  editarServico: (id: string, patch: Partial<D.Servico>) => void;
  criarServico: () => void;
  excluirServico: (id: string) => void;
  cliAtivo: (id: string) => boolean;
  alternarCli: (id: string) => void;
  /**
   * Grava um pedaço do cliente. Otimista, coalescido por `JANELA_AJUSTES`, com volta atrás.
   *
   * O PUT que sai leva `id`, `nome`, `telefone` (a rota exige) e **só os campos que
   * mexeram** — mandar o cliente inteiro faria o CPF semeado inválido viajar em toda
   * escrita e travar a edição de quase todo o cadastro. Ver o bloco no `enviarCliente`.
   *
   * Campo no meio da digitação (CPF pela metade, e-mail sem domínio) fica na tela e NÃO vai
   * ao servidor até estar inteiro — senão a recusa apagaria o que o dono está escrevendo.
   *
   * Só EDITA: criar cliente é do agente de WhatsApp (`garantirCliente`), que deduplica por
   * telefone.
   */
  editarCliente: (id: string, patch: Partial<D.Cliente>) => void;
  /**
   * Cadastra pelo botão "Novo cliente" e abre a gaveta dele. `true` quando deu certo (a
   * tela fecha o formulário); `false` deixa o formulário aberto com o que foi digitado.
   * Telefone que já é de alguém abre esse alguém — mesma deduplicação do agente.
   */
  criarCliente: (c: { nome: string; telefone: string; cpf: string }) => Promise<boolean>;
  filtroSvc: string;
  setFiltroSvc: (f: string) => void;
  filtroCli: string;
  setFiltroCli: (f: string) => void;

  /* qual documento este negócio emite */
  /** Nota fiscal, recibo do Receita Saúde, ou ainda não sabemos. Ver `EstadoFiscalUI`. */
  fiscal: EstadoFiscalUI;
  /** Guarda o que uma rota de `/api/fiscal` devolveu. Os cartões chamam depois de gravar. */
  aplicarFiscal: (bruto: unknown) => void;
  /** Relê `/api/fiscal`. É o "tentar de novo" da tela quando `status` é `erro`. */
  recarregarFiscal: () => Promise<void>;

  /* o que este negócio PAGA pela MAISA */
  /** Ver `EstadoAssinatura`. Quem mostra é a gaveta "plano". */
  assinatura: EstadoAssinatura;
  /** Relê `GET /api/assinatura`. É o "tentar de novo", e é o que a volta do checkout chama. */
  recarregarAssinatura: () => Promise<void>;
  /** Abre o checkout do provedor para ESTE plano. Sai da página. */
  assinarPlano: (plano: ChaveDePlano) => void;
  /** Abre o portal de cobrança (trocar cartão, baixar fatura, cancelar). Sai da página. */
  abrirPortalDeCobranca: () => void;
  /** Um POST de cobrança em voo. Desabilita os dois botões: cada clique cria uma sessão. */
  cobrancaOcupada: boolean;

  /* emissão de recibos, em andamento e visível de qualquer tela */
  /** `null` = nenhuma emissão rodando nem esperando ser fechada. */
  emissao: EmissaoDeRecibos | null;
  /** Enfileira e emite, um por vez. Ignora chamada nova enquanto uma está andando. */
  emitirRecibos: (fila: NaFila[]) => Promise<void>;
  /** Fecha o cartão do canto. Só o resumo; não interrompe nada. */
  fecharEmissao: () => void;
  /** Sobe 1 a cada emissão terminada. As telas releem o servidor quando ele muda. */
  emissoesFeitas: number;
  /** Sobe 1 a cada ficha de cliente gravada no servidor. A emissão de recibos relê
   *  `/api/recibos` quando ele muda: o CPF posto na ficha tira a pessoa do grupo "Sem CPF" (1C.10). */
  clientesGravados: number;

  /* nota fiscal */
  notaDe: (clienteId: string) => D.Nota;
  emitirNota: (clienteId: string) => void;
  emitirPendentes: () => void;
  /** Cancela pela REF do provedor, não pelo cliente: um cliente tem várias notas. */
  cancelarNota: (ref: string) => void;
  /** Clientes com valor fechado no mês — a base do Faturamento. */
  fechamento: LinhaDeFaturamento[];
  /** "setembro de 2026": o mês do que falta emitir, pela competência que o servidor devolveu
   *  (`aFaturar[].competencia`); sem nenhuma, o mês de hoje. Substitui `D.PERIODO` (T5). */
  mesDoFechamento: string;
  /** O que o lote REALMENTE vai emitir. Hero, topbar e lote leem daqui — fonte única. */
  emitiveis: LinhaDeFaturamento[];
  loteAberto: boolean;
  pedirLote: () => void;
  fecharLote: () => void;
  confirmarLote: () => void;

  /* ajustes da MAISA */
  assistente: Assistente;
  setAssistente: (patch: Partial<Assistente>) => void;
  /**
   * Trocar o nome do NEGÓCIO (não o da assistente).
   *
   * Recurso diferente e rota diferente (`PATCH /api/negocio`), por isso não entra em
   * `setAssistente`. O valor atual se lê em `cadastro.negocio.nome` — é o mesmo que a
   * sidebar pinta e o mesmo que a MAISA diz no WhatsApp.
   */
  setNomeDoNegocio: (nome: string) => void;

  /* ── as respostas prontas ──
   * `salvarFaq` devolve se DEU CERTO, e não `void`: a tela precisa saber se limpa o
   * formulário. Limpar sempre apagaria o que o dono escreveu quando o servidor recusou —
   * e ele teria que digitar tudo de novo para descobrir o que estava errado. */
  faqs: Faq[];
  faqsErro: string | null;
  /** Uma gravação em curso. Cada uma gera um embedding, então o botão trava enquanto isso. */
  faqsOcupado: boolean;
  salvarFaq: (p: { id?: string; pergunta: string; resposta: string }) => Promise<boolean>;
  removerFaq: (id: string) => Promise<void>;
  /** Frase quando os ajustes não carregaram ou não salvaram. Não-nulo = o que está na
   *  tela pode não ser o que a MAISA está usando no WhatsApp. */
  ajustesErro: string | null;
  /** Relê `/api/assistente`. A faixa de erro da casca oferece isto (T4: erro tem saída). */
  recarregarAjustes: () => void;
  /** A leitura dos ajustes voltou recusando a sessão: a saída é entrar, não tentar de novo. */
  ajustesPrecisaEntrar: boolean;
  /** Já voltou do servidor? `false` = o que se vê é placeholder de primeira pintura. */
  ajustesCarregados: boolean;

  /* ── o canal de WhatsApp ── */
  /** `null` enquanto não voltou do servidor. */
  canal: Canal | null;
  /**
   * A MAISA está atendendo? A resposta única da casca, dos Ajustes, do Fluxo e de Conversas
   * (`nucleo/dominio/status-da-maisa.ts`). Nenhuma tela deriva isto de `assistente.ativa`
   * sozinho: foi assim que a topbar dizia "no ar" com o WhatsApp caído (24/09/2026).
   */
  statusMaisa: StatusDaMaisa;
  /** Lê `/api/canal` de novo. É o "Tentar de novo" de quando a primeira leitura falhou. */
  recarregarCanal: () => void;
  canalErro: string | null;
  /** Há uma chamada em voo — a tela desabilita os botões para não disparar duas. */
  canalOcupado: boolean;
  /** O que falta NO SERVIDOR para conseguir conectar. Vazio = dá para conectar.
   *  Com item, a tela mostra a lista e trava o que derrubaria o canal atual. */
  canalFaltando: string[];
  /** QR do pareamento em curso, pronto para `<img src>`. `null` = nenhum. */
  qrcode: string | null;
  /** Os 8 caracteres do "Conectar com número de telefone". `null` = pareamento por QR. */
  codigo: string | null;
  /**
   * O telefone PARA ONDE o código foi mandado, enquanto o pareamento está em curso.
   *
   * Existe porque não existia: até 18/08/2026 este valor vivia só num `useRef`, com um
   * comentário dizendo que nenhuma tela o desenhava. Quem digitou um dígito errado não tinha
   * onde perceber — o campo sai da tela no instante em que o código entra. Ver
   * `componentes/Pareamento.tsx`.
   */
  numeroPareando: string | null;
  /** `numero` presente pede o CÓDIGO em vez do QR — o caminho de quem está no celular,
   *  onde ler o QR é impossível porque a câmera não fotografa a própria tela. */
  conectarCanal: (p?: { numero?: string }) => Promise<void>;
  /** Troca o código atual por um novo, sem derrubar o pareamento. A tela chama quando o
   *  contador zera; o número vem do próprio pareamento em curso, não do campo. */
  renovarCodigo: () => Promise<void>;
  desconectarCanal: () => Promise<void>;
  /** Desconecta e já pede pareamento novo. Perde o número atual — confirme antes de chamar. */
  trocarNumero: (p?: { numero?: string }) => Promise<void>;
  /** Quem recebe o "preciso de você nessa conversa". String vazia apaga. */
  definirDonoDoCanal: (telefone: string) => Promise<boolean>;
  /** O horário ANUNCIADO — o que a MAISA responde a "que horas vocês atendem?".
   *  Vem de `GET /api/horarios`; `semanaCarregada` diz se já é o do servidor. */
  semana: D.SemanaAnunciada;
  semanaErro: string | null;
  semanaCarregada: boolean;
  alternarDia: (dow: number) => void;
  setHorario: (dow: number, campo: "de" | "ate", valor: string) => void;
  cfg: Record<D.ChaveCfg, boolean>;
  alternarCfg: (chave: D.ChaveCfg) => void;
  salvo: boolean;
  /** Tenta de novo: manda o que está na janela agora e reaplica o que o servidor recusou. */
  salvar: () => void;
  /** Ajustes, nome do negócio e semana: gravando, gravou, ou o banco recusou (com o motivo).
   *  Só LÊ o mecanismo de gravação (⚠️ coalescer e voltar atrás), ver `estadoDaGravacao`. */
  gravacao: EstadoDaGravacao;

  /* agenda — dia visível e criação de atendimento */
  /** Data ISO que a Agenda está mostrando. Começa em hoje. */
  diaSel: string;
  verDia: (data: string) => void;
  /** Atendimento sendo marcado (clique num horário vago), antes de virar evento no Google. */
  rascunho: D.RascunhoAgendamento | null;
  /** O POST em voo, e o que voltou se ele falhou. Quem mostra é a gaveta. */
  rascunhoEstado: { enviando: boolean; erro?: string; tentou?: boolean };
  /**
   * Abre o rascunho na gaveta. Com `onde` (o clique num vago), dia, hora e profissional vêm dele.
   * Sem `onde` (o "Novo" da casca, "Encaixar cliente", "Marcar horário" da ficha), o próximo vago
   * de verdade a partir de agora (`proximoVago`), e a gaveta deixa trocar dia, hora e pessoa.
   * `clienteId` já escolhe a pessoa (e o preço da ficha dela).
   */
  novoAgendamento: (onde?: { profissionalId: string; inicio: number; data: string } | null, extra?: { clienteId?: string; dia?: string }) => void;
  /** Horários em que `pid` pode começar `duracaoMin` neste dia: expediente, o que já está
   *  marcado e os compromissos da agenda dele, e nada no passado (`vagasDoDia` do domínio). */
  vagasDe: (pid: string, data: string, duracaoMin: number, semOAtendimento?: string) => number[];
  /** O primeiro vago a partir de `desde` (hoje, se omitido), varrendo até 21 dias; `null` sem nenhum. */
  proximoVago: (desde?: string) => { profissionalId: string; data: string; inicio: number } | null;
  /** O formulário em linha de criar que a casca pediu ("Novo cliente", "Adicionar profissional"). */
  novoEmLinha: "cliente" | "profissional" | null;
  pedirNovo: (tipo: "cliente" | "profissional" | null) => void;
  editarRascunho: (patch: Partial<D.RascunhoAgendamento>) => void;
  /** ⚠️ CRIA o evento na agenda real do profissional. */
  confirmarRascunho: () => void;
  descartarRascunho: () => void;

  /* google calendar */
  /** Estado da integração: se está configurada, se precisa de login, quem conectou. */
  google: EstadoGoogle;
  /** Conexão do profissional, se houver. */
  googleDe: (profissionalId: string) => { googleEmail: string } | undefined;
  /** Manda o navegador para o consentimento do Google (sai do app e volta). */
  conectarGoogle: (profissionalId: string) => void;
  desconectarGoogle: (profissionalId: string) => void;
  /** Há chamada em voo para este id (agendamento ou profissional)? Desabilita o botão. */
  googleOcupado: (id: string) => boolean;

  /* a AGENDA REAL, lida do Google */
  /** Compromissos do Google que não são atendimentos da MAISA, num dia. */
  bloqueiosDoDia: (data: string) => Bloqueio[];
  bloqueioPorId: (id: string) => Bloqueio | undefined;
  /** Como está a leitura da agenda — o que o cartão precisa para se explicar. */
  leituraAgenda: LeituraAgenda;
  /** Relê a janela atual, ignorando o cache. */
  recarregarAgenda: () => void;

  /* rail */
  railAberto: boolean;
  setRailAberto: (v: boolean) => void;
};

/**
 * O estado da LEITURA da agenda — coisa diferente do estado da CONEXÃO com o Google.
 *
 * Chamava-se `EstadoAgendaGoogle` até 24/09/2026, e o nome enganava: desde o ADR-0009 a
 * leitura é da tabela `atendimentos`, e o Google só soma. Quem quer saber se o Google está
 * conectado pergunta a `googleDe(pid)`.
 *
 * `nao_conectado` — não usado desde 24/09/2026 (era o valor inicial); fica no tipo para
 *                   não quebrar quem compara.
 * `carregando`    — busca em voo. É também o valor inicial.
 * `ok`            — tem dado, e ele está fresco.
 * `reconectar`    — o Google recusou o token. Cache anterior segue na tela, esmaecido,
 *                   com banner: apagar a grade acrescentaria um segundo problema ao primeiro.
 * `limite`        — cota do Google. Transitório; a tela não grita, só espera.
 * `erro`          — o resto.
 *
 * Grade vazia sem aviso é a pior saída possível: ela AFIRMA "você não tem nada hoje",
 * e essa afirmação pode estar errada.
 */
export type LeituraAgenda = {
  status: "nao_conectado" | "carregando" | "ok" | "reconectar" | "limite" | "erro";
  info?: string;
  /** Já houve pelo menos uma leitura bem-sucedida? Separa "vazio" de "ainda não sei". */
  jaLeu: boolean;
  /** As agendas (pid) cuja última leitura falhou. Com equipe, uma agenda pode falhar e as
   *  outras voltarem: a coluna dela não desenha "livre" (item 1A.4). Ausente = nenhuma. */
  faltam?: string[];
};

/**
 * ★ QUAL DOCUMENTO ESTE NEGÓCIO EMITE — e por que isto virou estado do store em 25/08/2026.
 *
 * A reclamação do Bruno: *"O CTA lá em cima ainda esta escrito emitir 14 notas mesmo depois de eu
 * ter escolhido o modo de recibos"*.
 *
 * O `caminho` vinha de `/api/fiscal`, e quem o lia eram os DOIS CARTÕES do Faturamento, cada um
 * com o seu `fetch` — ninguém mais. O hero da tela e o botão dourado da topbar não tinham como
 * saber, então falavam de nota fiscal para todo mundo. Quem atende como pessoa física **nunca
 * emite nota fiscal**: o botão não estava com o texto errado, estava prometendo um documento que
 * não existe para ela.
 *
 * Aqui em cima, os quatro lugares leem a mesma resposta e param de divergir. De quebra, trocar de
 * tipo de documento deixa de precisar de `window.location.reload()`.
 *
 * ⚠️ `carregando` NÃO É "nota fiscal". Enquanto a resposta não chega, ninguém promete verbo
 * nenhum — piscar "Emitir 14 notas" por meio segundo e sumir é a mesma mentira, mais curta.
 */
export type EstadoFiscalUI = {
  status: "carregando" | "ok" | "erro";
  /** `null` até saber. Nunca chute. */
  caminho: CaminhoFiscal | null;
  config: ConfigFiscal | null;
  /** O que falta para emitir, em português — vem de `fiscalFaltando`. */
  falta: string[];
  /** Variáveis de ambiente do emissor que faltam. Problema nosso, não do dono. */
  provedorFaltando: string[];
};

/**
 * ★ UMA EMISSÃO DE RECIBOS EM ANDAMENTO — e por que ela mora no store.
 *
 * Bruno, 26/08/2026: *"a emissão dos recibos é algo que demora, queria não ter que ficar olhando
 * para uma telinha enquanto isso acontece"*.
 *
 * Antes era estado do componente da tela, mostrado num modal. Duas consequências, e a segunda é
 * pior: o modal prendia o dono na tela, e sair da tela **desmontava o componente** — a emissão
 * continuava correndo (o `fetch` já tinha partido) mas o placar desaparecia. Ele voltava sem saber
 * se saíram 3 ou 30 documentos fiscais.
 *
 * Aqui, quem mostra é um cartão no canto (`ProgressoDeEmissao`, montado no `AppShell`), e trocar
 * de tela não interrompe nem esconde nada.
 *
 * ⚠️ NÃO EXISTE CANCELAR, e a ausência é decisão: cada passo é um documento fiscal que já saiu no
 * CPF de alguém. "Parar" no meio só evitaria os próximos — e desfazer os anteriores é cancelar um
 * por um, em até 10 dias (art. 7º da IN RFB 2.240/2024). Prometer um botão de cancelar sugeriria
 * que dá para voltar atrás.
 */
export type EmissaoDeRecibos = {
  estado: "andando" | "fim";
  total: number;
  /** Quantos saíram de verdade — falha não conta. */
  feitos: number;
  /** Nome de quem está saindo AGORA. `null` quando acabou. */
  atual: string | null;
  /** O último que saiu, para o cartão dar o check antes de trocar de nome. */
  ultimo: string | null;
  falhas: { nome: string; erro: string }[];
};

/** Um pagamento na fila de emissão. É o que a tela manda; o resto o servidor lê do banco. */
export type NaFila = { fonte: "atendimento" | "avulso"; id: string; nome: string };

/** O placar no instante zero. */
export function comecarEmissao(fila: NaFila[]): EmissaoDeRecibos {
  return { estado: "andando", total: fila.length, feitos: 0, atual: fila[0]?.nome ?? null, ultimo: null, falhas: [] };
}

/**
 * Fecha a conta de UM pagamento no placar.
 *
 * ★ `falha` é a frase do servidor, ou `null` quando saiu. Separado do laço para ter teste: é uma
 * contabilidade de documento fiscal, e o tipo de erro que ela sofre é silencioso.
 *
 * ⚠️ FALHA NÃO CONTA COMO FEITO, e `ultimo` só anda quando saiu de verdade — o cartão dá o check
 * naquele nome, e dar check em quem foi recusado é a pior mentira possível numa tela fiscal.
 */
export function aplicarDesfecho(e: EmissaoDeRecibos, nome: string, falha: string | null): EmissaoDeRecibos {
  return {
    ...e,
    feitos: e.feitos + (falha ? 0 : 1),
    ultimo: falha ? e.ultimo : nome,
    falhas: falha ? [...e.falhas, { nome, erro: falha }] : e.falhas,
  };
}

/** O que a UI precisa saber sobre a integração antes de oferecer qualquer botão. */
export type EstadoGoogle = {
  /**
   * `sem_negocio` entrou junto com o `tenantId` real: `/api/google/status` passou a
   * responder isso quando a conta está logada mas ainda não tem linha em `membros` — o
   * primeiro login de todo mundo. Sem estar na união, o valor chegava como string que
   * nenhum ramo tratava e a tela caía no "carregando" para sempre: um spinner eterno em
   * vez de "crie o negócio primeiro".
   */
  status: "carregando" | "ok" | "nao_configurado" | "nao_autenticado" | "login_necessario" | "sem_negocio";
  conexoes: { profissionalId: string; googleEmail: string }[];
  /** Variáveis de ambiente que faltam, quando status = nao_configurado. */
  faltando: string[];
};

/**
 * ★ A ASSINATURA DESTE NEGÓCIO — e por que ela virou estado do store em 21/09/2026.
 *
 * A gaveta "Meu plano" lia `st.cadastro.negocio.plano`, `precoPlano`, `proximaCobranca` e
 * `cartao`: quatro campos de FIXTURE. Ela afirmava "Profissional · R$ 197/mês · Cartão
 * final 4417" para todo mundo — inclusive para quem nunca pagou nada e para quem está
 * inadimplente. `GET /api/assinatura` responde o que a tabela `assinaturas` diz, e é dela
 * que a tela passa a falar.
 *
 * ⚠️ `assinatura: null` NÃO É ERRO E NÃO É "sem plano": é a rota dizendo que não achou
 * linha para este inquilino. Todo negócio nasce com uma (`005_provisionar.sql`), então
 * `null` significa que algo está torto — e a tela informa isso em vez de oferecer botão.
 * Ver `resumoDaAssinatura`.
 */
export type EstadoAssinatura = {
  status: "carregando" | "ok" | "erro";
  /** O que a tabela diz. `null` quando não há linha — ver o ⚠️ acima. */
  assinatura: Assinatura | null;
  /** Os três planos com nome e preço, como `GET /api/assinatura` devolveu. */
  ofertas: Oferta[];
};

/**
 * Um plano oferecível, montado pela rota a partir de `_lib/planos.ts`.
 *
 * ⚠️ `preco` É TEXTO ("R$ 197/mês"), e é de propósito: é o preço EXIBIDO, copy da landing
 * page, e não um número para fazer conta. O preço cobrado é o do provedor, e ele chega por
 * outro caminho — `assinatura.preco`, depois do webhook.
 */
export type Oferta = {
  plano: ChaveDePlano;
  nome: string;
  preco: string;
  resumo: string;
  /** O plano base, o mesmo que a LP destaca. */
  base: boolean;
};

/** Situação em português. A tabela guarda o nosso vocabulário, não o da Stripe. */
const SITUACAO: Record<StatusAssinatura, string> = {
  trial: "Em teste",
  ativa: "Ativa",
  inadimplente: "Pagamento pendente",
  cancelada: "Cancelada",
};

/**
 * `"Profissional"` → `"profissional"`, para o corpo do POST.
 *
 * ⚠️ DEVOLVE `null` EM VEZ DE CHUTAR, e é a linha mais importante deste arquivo.
 * `assinaturas.plano` é texto livre, e o `005_provisionar.sql` semeia `'Profissional'`
 * com `preco = 149.90` — valor que não é de plano nenhum da tabela atual. Um
 * `?? "profissional"` aqui transformaria dado torto em R$ 197 no cartão de alguém.
 * Devolvendo `null`, o botão desaparece e a conversa acontece antes da cobrança.
 */
export function chaveDoPlano(nome: string | null | undefined): ChaveDePlano | null {
  const limpo = (nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toLowerCase();
  return ehChaveDePlano(limpo) ? limpo : null;
}

/** O que a gaveta "Meu plano" desenha. Puro, e por isso testável sem React nem rede. */
export type ResumoDaAssinatura = {
  /** Subtítulo da gaveta. Nunca afirma situação que não veio do servidor. */
  sub: string;
  linhas: [string, string][];
  aviso: { texto: string; tone: "warn" | "danger" } | null;
  /**
   * O botão primário, com o texto já montado — plano e preço juntos. `null` = sem botão
   * primário, e aí as três ofertas vão para a lista (ver `outras`).
   */
  assinar: { plano: ChaveDePlano; label: string } | null;
  /**
   * Os planos que vão para o bloco de lista. Vazio = a gaveta não oferece troca nenhuma.
   *
   * ★ É AQUI QUE OS TRÊS PREÇOS DA LP ENTRAM NO APP. O botão primário é o plano da linha
   * da tabela — `'Profissional'` para todo trial, por causa do `005_provisionar.sql`, o
   * que faz R$ 197 ser a base. Os outros dois ficam disponíveis, com nome e preço à vista,
   * em vez de exigirem uma conversa. Decisão do Bruno em 21/09/2026.
   */
  outras: Oferta[];
  /** Dá para abrir o portal de cobrança? */
  gerenciar: boolean;
};

/**
 * Traduz o estado da leitura para o que a tela mostra.
 *
 * ⚠️ NENHUM DOS DOIS BOTÕES APARECE ENQUANTO NÃO SE SABE. `carregando` e `erro` não
 * oferecem ação: um "Assinar" que pisca meio segundo antes de o servidor responder é um
 * botão que pode cobrar o plano errado, e um "Gerenciar cobrança" sobre estado
 * desconhecido abre uma página em branco no provedor.
 */
export function resumoDaAssinatura(e: EstadoAssinatura): ResumoDaAssinatura {
  const vazio = {
    linhas: [] as [string, string][],
    assinar: null,
    outras: [] as Oferta[],
    gerenciar: false,
  };

  if (e.status === "carregando") {
    return { ...vazio, sub: "lendo sua assinatura…", aviso: null };
  }
  if (e.status === "erro") {
    return {
      ...vazio, sub: "não foi possível ler",
      aviso: { texto: "Não conseguimos ler sua assinatura agora. Nada mudou — feche e abra de novo.", tone: "warn" },
    };
  }

  const a = e.assinatura;
  if (!a) {
    return {
      ...vazio, sub: "não encontrada",
      aviso: { texto: "Não encontramos a assinatura deste negócio. Fale com a gente antes de pagar qualquer coisa.", tone: "warn" },
    };
  }

  /* `YYYY-MM-DD` formatado sem passar por `Date`: `new Date("2026-10-21")` é meia-noite
   * UTC, que em São Paulo ainda é o dia 20 — a tela mostraria a cobrança um dia antes. */
  const data = (iso: string | null) => (iso && D.ehDataCivil(iso) ? D.rotuloDia(iso) : "—");

  /* O botão primário é o plano DA LINHA, com nome e preço da oferta correspondente. Sem
   * oferta casada (payload antigo, ou lista vazia) ele ainda existe, com o texto curto: o
   * plano é conhecido, só não se sabe o preço exibido dele. */
  const chave = chaveDoPlano(a.plano);
  const daLinha = chave ? e.ofertas.find((o) => o.plano === chave) : undefined;
  const assinar = chave
    ? { plano: chave, label: daLinha ? `Assinar ${daLinha.nome} · ${daLinha.preco}` : "Assinar" }
    : null;

  /* As outras, para a lista. Quando não há botão primário — plano da linha fora da tabela
   * — as TRÊS vão para a lista: cada uma com nome e preço à vista, que é o que torna a
   * escolha informada. Esconder tudo deixaria a pessoa sem caminho nenhum. */
  const outras = chave ? e.ofertas.filter((o) => o.plano !== chave) : e.ofertas;

  /* `assinaturaId` e não `clienteId`: o portal de um cliente SEM assinatura no provedor
   * abre vazio, e a LP promete "cancele quando quiser". Botão que abre página em branco é
   * pior que botão ausente. Em trial ainda não existe assinatura lá. */
  const gerenciar = !!a.assinaturaId;

  const linhas: [string, string][] = [
    ["Plano", a.plano],
    ["Situação", SITUACAO[a.status]],
    a.status === "trial" ? ["Teste até", data(a.trialFim)] : ["Próxima cobrança", data(a.periodoFim)],
    /* O preço COBRADO, que o webhook gravou — não o da landing page. Enquanto ninguém
     * pagou ele é `null`, e "—" é a resposta honesta. Ver `dominio/assinatura.ts`. */
    ["Valor", a.preco === null ? "—" : fmt(a.preco)],
    ["Forma de pagamento", a.cartaoMarca && a.cartaoFinal4 ? `${a.cartaoMarca} final ${a.cartaoFinal4}` : "nenhuma ainda"],
  ];

  switch (a.status) {
    case "trial":
      return { sub: `em teste até ${data(a.trialFim)}`, linhas, aviso: null, assinar, outras, gerenciar };
    case "ativa":
      /* Sem "Assinar" e sem lista: ela já paga. Trocar de plano é assunto do portal, que
       * sabe fazer proração — oferecer a troca aqui criaria uma segunda assinatura. */
      return { sub: `ativa · ${a.plano}`, linhas, aviso: null, assinar: null, outras: [], gerenciar };
    case "inadimplente":
      /* Quem tem assinatura no provedor conserta pelo portal (trocar cartão, pagar a
       * fatura aberta). Assinar de novo criaria uma SEGUNDA assinatura e duas cobranças. */
      return {
        sub: "pagamento pendente", linhas,
        aviso: { texto: "O último pagamento não foi confirmado. Se foi boleto, ele pode levar um dia útil para cair.", tone: "danger" },
        assinar: gerenciar ? null : assinar,
        outras: gerenciar ? [] : outras,
        gerenciar,
      };
    case "cancelada":
      return {
        sub: `cancelada · ${a.plano}`, linhas,
        aviso: { texto: "Sua assinatura está cancelada. Você pode assinar de novo quando quiser.", tone: "warn" },
        assinar, outras, gerenciar,
      };
  }
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore() precisa estar dentro de <StoreProvider>.");
  return c;
}

/* ───────────────────────────── provider ───────────────────────────── */

export function StoreProvider({ children }: { children: React.ReactNode }) {
  /* --- persistido --- */
  const [db, setDb] = useState<Persistido>(INICIAL);

  /**
   * ⚠️ ESTADO, não `useRef`. Aqui morava um bug que APAGAVA dado real, e ele era
   * invisível porque o sintoma parecia outra coisa.
   *
   * Era `const hidratado = useRef(false)`, marcado no fim do efeito de leitura. O efeito
   * de gravação vem logo abaixo e roda no MESMO passo de efeitos, imediatamente depois —
   * já lendo `hidratado.current === true`, mas com `db` ainda em INICIAL, porque o
   * `setDb` da linha acima só vira estado no próximo render. Resultado: o primeiro ato do
   * app ao abrir era ESCREVER OS PADRÕES POR CIMA do que estava salvo.
   *
   * Em produção o estrago se desfazia sozinho: o render seguinte trazia o dado bom e
   * regravava. Em desenvolvimento não: o StrictMode roda os efeitos duas vezes, e a
   * segunda leitura encontrava os padrões que a gravação acabara de escrever — e os
   * adotava como se fossem o que o usuário tinha salvo. O dado ia embora de verdade.
   *
   * (Isto explica, e me desmente, o "sumiço" que investiguei na sessão passada e atribuí
   * a outra aba do app escrevendo na mesma chave. Não era outra aba. Era isto.)
   *
   * Como estado, `setHidratado` e `setDb` entram no MESMO lote: quando a gravação enfim
   * vê `hidratado === true`, `db` já é o que veio do disco.
   */
  const [hidratado, setHidratado] = useState(false);

  // Ler depois do mount: o 1º render precisa bater com o HTML do servidor.
  useEffect(() => {
    try {
      const cru = localStorage.getItem(CHAVE) ?? migrarDaV2();
      if (cru) {
        /* Campos que saíram do formato (ver Persistido). Um v3 gravado antes deles ainda os
         * traz, e o spread abaixo os devolveria ao disco a cada gravação — dado morto se
         * reescrevendo em silêncio. Não vale uma v4: o resto do formato não mudou.
         *
         * `novosAgendamentos` é o único que dói: são atendimentos que o usuário marcou
         * quando o app ainda guardava agenda própria. Eles NÃO foram para o Google (o
         * botão da gaveta é que fazia isso, um a um), então não há para onde levá-los sem
         * escrever numa agenda real por conta própria — coisa que este código não faz sem
         * alguém pedir. Ficam registrados no console, com data e cliente, para poderem ser
         * remarcados à mão. */
        const {
          posicoes: _saiuDoFormato,
          novosAgendamentos: agLocais,
          googleEventos: _vinculoSemPar,
          /* Os dois das conversas. Não vão para o console como os atendimentos porque não há
           * nada a resgatar: quem conduzia cada conversa é uma pergunta que o servidor agora
           * responde melhor (e para todos os aparelhos), e as respostas guardadas aqui nunca
           * chegaram a ninguém — se fossem impressas, seriam uma lista de mensagens que o
           * cliente nunca recebeu, o que é pior que silêncio. */
          assumidas: _posseAgoraNoServidor,
          enviadas: _respostasQueNuncaSairam,
          /* Os ajustes da MAISA, que passaram a vir de `GET /api/assistente`.
           *
           * DESCARTAR é obrigatório, não higiene: mantê-los daria uma corrida em que o
           * disco (escrito na sessão passada, talvez noutro aparelho) sobrescreveria a
           * resposta do servidor sempre que chegasse depois — e o dono veria o tom voltar
           * sozinho ao que era, sem nada na tela explicando. Sumir com eles aqui é o que
           * torna o servidor a única fonte. */
          assistente: _tomAgoraNoServidor,
          cfg: _togglesAgoraNoServidor,
          /* `dias` seguiu o mesmo caminho horas depois — `GET /api/horarios`. A dívida
           * que estava escrita em `Persistido` ("tem tabela e ainda não tem porta") ficou
           * paga, e o motivo de descartar é idêntico ao dos dois acima. */
          dias: _horarioAgoraNoServidor,
          ...p
        } = JSON.parse(cru) as Partial<Persistido> & {
          posicoes?: unknown;
          novosAgendamentos?: { data?: string; inicio?: number; clienteId?: string }[];
          googleEventos?: unknown;
          assumidas?: unknown;
          enviadas?: unknown;
          assistente?: unknown;
          cfg?: unknown;
          dias?: unknown;
        };
        if (agLocais?.length) {
          console.info(
            `[store] ${agLocais.length} atendimento(s) do formato antigo não vieram — o app agora só ` +
            `guarda atendimento no Google Calendar. Eram: ` +
            agLocais.map((a) => `${a.data ?? "?"} ${D.hhmm(a.inicio ?? 0)} ${nomeDoCliente(a.clienteId ?? "")}`).join("; "),
          );
        }
        setDb((prev) => ({ ...prev, ...p }));
      }
    } catch {
      /* localStorage indisponível — segue nos defaults */
    }
    setHidratado(true);
    /* ⚠️ `[]` é PROPOSITAL, e `nomeDoCliente` NÃO entra aqui, ainda que o corpo o use.
     *
     * Este efeito é a hidratação: ele lê o disco e sobrescreve `db`. Rodar de novo
     * significaria reler o localStorage DEPOIS de o usuário já ter mexido em coisa, e
     * descartar o que ele fez. Como `nomeDoCliente` muda de identidade quando o cadastro
     * chega do servidor, listá-lo aqui — que é o que a regra de dependências exaustivas
     * pediria — transformaria uma resposta de rede num "desfazer" silencioso.
     *
     * O custo de não listar é conhecido e é irrelevante: a closure vê o cadastro inicial,
     * então o log de migração pode imprimir o nome do placeholder. É uma linha de
     * console.info que roda uma vez na vida daquele navegador. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* noop */ }
  }, [db, hidratado]);

  const patch = useCallback((f: (d: Persistido) => Partial<Persistido>) => {
    setDb((d) => ({ ...d, ...f(d) }));
  }, []);

  /* --- volátil --- */
  const [tela, setTela] = useState<TelaId>("fluxo");
  const [sel, setSel] = useState<string | null>(null);
  /** De qual atendimento há um "Cancelar" à espera de confirmação. Ver cancelarAtendimento. */
  const [cancelarPedido, setCancelarPedido] = useState<string | null>(null);
  /** O remarcar pela metade. Ver `remarcarAtendimento`. */
  const [remarcacao, setRemarcacao] = useState<{ id: string; data: string; inicio: number } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoSolta, setAlvoSolta] = useState<string | null>(null);
  /* Começa VAZIO, não na primeira conversa: as conversas vêm do servidor, e no primeiro render
   * não existe "primeira". Quem escolhe por padrão é o efeito lá embaixo, quando a lista chega. */
  const [convSel, setConvSel] = useState<string>("");
  const [abaConv, setAbaConv] = useState<AbaConversa>("todas");
  const [filtroSvc, setFiltroSvc] = useState("Todos");
  const [filtroCli, setFiltroCli] = useState("Ativos");
  const [salvo, setSalvo] = useState(false);
  const [railAberto, setRailAberto] = useState(false);
  // Dia visível na Agenda, data ISO. Volátil de propósito: recarregar cai em hoje, como o
  // resto da navegação. Antes os seis botões de dia não tinham onClick nenhum — eram decoração.
  const [diaSel, setDiaSel] = useState(D.HOJE.iso);

  /* A JANELA. É a grade do mês do dia visível, com os vizinhos que fecham as semanas.
   *
   * Uma janela só serve às três visões — dia, semana e mês —, e isso não é economia: é o
   * que faz trocar de visão não disparar request. A grade de um mês cobre semanas
   * inteiras, então a semana de QUALQUER dia daquele mês cabe dentro dela, inclusive a que
   * atravessa a virada. Ver D.janelaDoMes.
   *
   * Os dois campos são STRINGS, e é por isso que o efeito de busca lá embaixo pode
   * depender deles diretamente sem virar laço infinito. */
  const janela = useMemo(() => D.janelaDoMes(D.mesDe(diaSel)), [diaSel]);

  /* ── navegação ── */
  // Trocar de tela ou de item descarta um "Cancelar" pela metade — ver cancelarAtendimento.
  /* O recorte (1A.14): só o Documento fiscal tem, por enquanto (`SECOES` em `endereco.ts`). O
   * T9 do backlog faz a URL espelhar tudo; até lá, `?secao=` é instrução de chegada, como `?tela=`. */
  const [secao, setSecao] = useState<string | null>(null);
  /* O formulário de criar em linha (T2): quem pede é a casca ("Novo cliente" no slot ou no
   * menu "Novo"), quem desenha é a tela. Trocar de tela o fecha, como fecha a gaveta. */
  const [novoEmLinha, setNovoEmLinha] = useState<"cliente" | "profissional" | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [ativacao, setAtivacao] = useState<{ feitos: PassoDeAtivacao[]; passos: readonly PassoDeAtivacao[] } | null>(null);
  const irPara = useCallback((t: TelaId, s?: string) => {
    setTela(t); setSel(null); setCancelarPedido(null); setRemarcacao(null); setNovoEmLinha(null); setTelaCheia(false);
    setSecao(secaoDoEndereco(t, s));
  }, []);
  const pedirNovo = useCallback((tipo: "cliente" | "profissional" | null) => setNovoEmLinha(tipo), []);
  const abrir = useCallback((id: string) => { setSel(id); setCancelarPedido(null); setRemarcacao(null); }, []);
  const fechar = useCallback(() => { setSel(null); setCancelarPedido(null); setRemarcacao(null); }, []);

  // Esc fecha a gaveta — atalho único, vale nas duas formas (modal e folha).
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  /* ── o cadastro do negócio ──
   * Uma ida ao servidor, no primeiro render, e o resultado substitui o placeholder de
   * fixture. Ver o comentário de `CADASTRO_INICIAL` para o porquê de haver placeholder. */

  const [cadastro, setCadastro] = useState<Cadastro>(CADASTRO_INICIAL);
  const [cadastroErro, setCadastroErro] = useState<string | null>(null);
  const [cadastroCarregado, setCadastroCarregado] = useState(false);

  useEffect(() => {
    /* `vivo` porque o efeito roda no StrictMode duas vezes em desenvolvimento, e porque o
     * provider pode desmontar antes de a resposta chegar. Sem ele, `setState` depois do
     * unmount vira aviso no console — e, pior, a resposta da PRIMEIRA montagem pode chegar
     * depois da segunda e sobrescrever dado mais novo com dado mais velho. */
    let vivo = true;

    void (async () => {
      try {
        const r = await fetch("/api/cadastro").then((x) => x.json());
        if (!vivo) return;

        if (!r?.ok) {
          /* ⚠️ `sem_negocio` NÃO É ERRO — É O PRIMEIRO LOGIN DE TODO MUNDO.
           *
           * Esta é a resposta que o app dá a quem acabou de confirmar o e-mail: existe
           * sessão, não existe inquilino. Até 15/08/2026 ela virava uma faixa vermelha no
           * painel mandando rodar SQL no Supabase, com o resto da tela em placeholder de
           * fixture — a pior primeira impressão possível, e um beco: não havia botão
           * nenhum que resolvesse.
           *
           * Agora existe `/comecar`, então a resposta certa é LEVAR PARA LÁ. O servidor já
           * diz isso no campo `acao` (`{ metodo: "POST", rota: "/api/negocio" }`, ver
           * `entrada/http/contexto.ts`); a tela só precisava obedecer.
           *
           * ⚠️ ESTE DESVIO DEIXOU DE SER O PRIMEIRO, em 17/08/2026. `app/page.tsx` faz a
           * mesma pergunta no SERVIDOR e redireciona antes de sair HTML — porque chegar
           * aqui já é tarde: o painel pintou, mostrou agenda e números de fixture, e só
           * então saltou. Foi relatado assim: "entrei direto no painel e de repente voltei
           * pro onboarding".
           *
           * O que sobrou para esta linha é o que aquele não alcança: a sessão que perde o
           * negócio com o painel JÁ ABERTO, e a navegação de cliente que não repassa pelo
           * servidor. Continua necessária, deixou de ser suficiente.
           *
           * `window.location` e não `router.push`: o store é montado acima do router em
           * `app/page.tsx`, e uma navegação de cliente aqui deixaria este provider vivo
           * fazendo as outras chamadas — que voltariam todas 409, cada uma acendendo o
           * próprio aviso. Trocar de página inteira é o que garante que o painel meio
           * carregado não sobreviva à saída. */
          if (r?.status === "sem_negocio" && typeof window !== "undefined") {
            window.location.replace("/comecar");
            return;
          }
          /* Mantém o placeholder na tela e ACENDE o aviso. Zerar as listas aqui seria
           * pior: a Agenda perderia as colunas e a Gaveta abriria vazia, sintomas que não
           * apontam para "o cadastro não carregou". */
          setCadastroErro(MOTIVO_CADASTRO[r?.status] ?? MOTIVO_CADASTRO.erro);
          return;
        }

        setCadastro({
          negocio: r.negocio,
          profissionais: r.profissionais ?? [],
          servicos: r.servicos ?? [],
          clientes: r.clientes ?? [],
          agendas: r.agendas ?? [],
        });
        setCadastroErro(null);
        setCadastroCarregado(true);
      } catch {
        if (vivo) setCadastroErro(MOTIVO_CADASTRO.erro);
      }
    })();

    return () => { vivo = false; };
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────────
   * AS CONVERSAS DE WHATSAPP.
   *
   * Vinham de `D.CONVERSAS`/`D.THREADS`: seis conversas escritas à mão, com hora fixa, e as
   * suas respostas indo para o `localStorage` em vez de para o WhatsApp de alguém. Agora vêm
   * de `GET /api/conversas`, que lê a mesma tabela que o agente escreve.
   *
   * ⚠️ AQUI NÃO HÁ PLACEHOLDER DE FIXTURE, ao contrário do cadastro logo acima — e a diferença
   * é de consequência, não de estilo. Cadastro com placeholder mostra um preço errado; conversa
   * com placeholder mostra uma PESSOA que não existe, com um pedido que ninguém fez. O dono
   * responderia a ela. Lista vazia é a verdade quando ninguém escreveu.
   * ────────────────────────────────────────────────────────────────────────────── */

  const [conversas, setConversas] = useState<D.Conversa[]>([]);
  const [conversasErro, setConversasErro] = useState<string | null>(null);
  const [conversasPrecisaEntrar, setConversasPrecisaEntrar] = useState(false);
  const [conversasCarregadas, setConversasCarregadas] = useState(false);
  /** Threads já buscadas, por id de conversa. Cache: voltar para uma conversa não repinta vazio. */
  const [threads, setThreads] = useState<Record<string, D.Msg[]>>({});
  const [threadCarregando, setThreadCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** Uma leitura no ar por vez. O polling e o `focus` disparam do mesmo lugar. */
  const lendoConversas = useRef(false);

  const recarregarConversas = useCallback(async () => {
    if (lendoConversas.current) return;
    lendoConversas.current = true;
    try {
      const r = await fetch("/api/conversas").then((x) => x.json());
      if (!r?.ok) {
        setConversasErro(MOTIVO_CONVERSAS[r?.status] ?? MOTIVO_CONVERSAS.erro);
        setConversasPrecisaEntrar(r?.status === "nao_autenticado" || r?.status === "login_necessario");
        return;
      }
      setConversas(r.conversas ?? []);
      setConversasErro(null);
      setConversasPrecisaEntrar(false);
      setConversasCarregadas(true);
    } catch {
      setConversasErro(MOTIVO_CONVERSAS.erro);
      setConversasPrecisaEntrar(false);
    } finally {
      lendoConversas.current = false;
    }
  }, []);

  /**
   * A thread de UMA conversa.
   *
   * A resposta traz a conversa junto, e nós aproveitamos: abrir uma conversa reconcilia a linha
   * dela na lista. Sem isso, quem abre uma conversa cujo estado mudou no servidor (a MAISA
   * respondeu enquanto a lista estava velha) veria a thread nova com o rótulo antigo.
   */
  const carregarThread = useCallback(async (id: string) => {
    setThreadCarregando(true);
    try {
      const r = await fetch(`/api/conversas?telefone=${encodeURIComponent(id)}`).then((x) => x.json());
      if (!r?.ok) return;
      setThreads((t) => ({ ...t, [id]: r.msgs ?? [] }));
      if (r.conversa) setConversas((cs) => cs.map((c) => (c.id === id ? r.conversa : c)));
    } catch {
      /* Silêncio de propósito: a tela segue mostrando a thread que já tinha em cache. Um erro
       * aqui é transitório (rede), e trocar a conversa por uma mensagem de falha faria o dono
       * perder o contexto do que estava lendo. `conversasErro` cobre o caso que importa. */
    } finally {
      setThreadCarregando(false);
    }
  }, []);

  useEffect(() => { void recarregarConversas(); }, [recarregarConversas]);

  /* Escolhe a primeira quando a lista chega. Não é `useState(conversas[0])` porque no primeiro
   * render não existe lista — e não sobrescreve escolha nenhuma: só age com `convSel` vazio. */
  useEffect(() => {
    if (!convSel && conversas.length) setConvSel(conversas[0].id);
  }, [conversas, convSel]);

  useEffect(() => {
    if (convSel) void carregarThread(convSel);
  }, [convSel, carregarThread]);

  /* ── manter a tela viva ──
   *
   * Duas coisas, e as duas só com a tela de Conversas aberta: polling de 15s e releitura ao
   * voltar para a aba. Fora dela, nada roda — o rail mostra contador de pendência, e contador
   * atrasado em 30s não muda decisão nenhuma; a lista aberta, sim.
   *
   * `document.visibilityState` no polling porque um `setInterval` não para quando a aba vai para
   * o fundo: sem a checagem, uma aba esquecida do painel faria quatro requests por minuto a
   * noite inteira. */
  useEffect(() => {
    if (tela !== "conversas") return;

    const reler = () => {
      if (document.visibilityState !== "visible") return;
      void recarregarConversas();
      if (convSel) void carregarThread(convSel);
    };

    const timer = window.setInterval(reler, RELER_CONVERSAS_MS);
    window.addEventListener("focus", reler);
    document.addEventListener("visibilitychange", reler);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", reler);
      document.removeEventListener("visibilitychange", reler);
    };
  }, [tela, convSel, recarregarConversas, carregarThread]);

  const conversaDe = useCallback(
    (id: string) => conversas.find((c) => c.id === id) ?? null,
    [conversas],
  );

  /* ── conversas: as ações ── */

  const threadDe = useCallback((id: string) => threads[id] ?? SEM_MSG, [threads]);

  const selecionarConversa = useCallback((id: string) => setConvSel(id), []);

  /**
   * As quatro mudanças de posse, num lugar só.
   *
   * ⚠️ SEM ATUALIZAÇÃO OTIMISTA, de propósito — e é a única ação do app onde eu recuso otimismo.
   * Pintar "assumida" antes da confirmação exigiria recalcular o estado no navegador, ou seja,
   * uma segunda cópia de `estadoDaConversa`. E aqui a mentira é caríssima: a tela diria que a
   * MAISA está calada enquanto ela continua respondendo ao cliente. A ida ao servidor é a
   * própria garantia — é ela que o webhook vai ler.
   */
  const mudarPosse = useCallback(
    async (id: string, acao: "assumir" | "devolver" | "resolver" | "reabrir", aviso?: string) => {
      try {
        const r = await fetch("/api/conversas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ telefone: id, acao }),
        }).then((x) => x.json());

        if (!r?.ok) {
          toast(r?.info ?? "Não foi possível mudar quem conduz esta conversa");
          return;
        }
        await recarregarConversas();
        if (aviso) toast(aviso);
      } catch {
        toast("Sem conexão com o servidor — nada mudou");
      }
    },
    [recarregarConversas],
  );

  const assumir = useCallback((id: string) => {
    // O toast só aparece DEPOIS do ok do servidor. Antes ele era imediato e a frase era falsa.
    void mudarPosse(id, "assumir", "Conversa assumida — a MAISA não responde mais aqui");
  }, [mudarPosse]);

  const devolver = useCallback((id: string) => {
    void mudarPosse(id, "devolver", "Devolvida à MAISA");
  }, [mudarPosse]);

  const [caderno, setCaderno] = useState<StoreValue["caderno"]>({ fase: "carregando" });
  const recarregarCaderno = useCallback(async () => {
    try {
      const r = await fetch("/api/contatos", { cache: "no-store" }).then((x) => x.json());
      if (!r?.ok) {
        /* `entrar`: a sessão acabou, e "Tentar de novo" ao lado de "Entre na sua conta" repetiria a
         * mesma recusa (regressão 6 da verificação da Onda 1, 28/09/2026). */
        const entrar = r?.status === "login_necessario" || r?.status === "nao_autenticado";
        setCaderno({ fase: "erro", frase: entrar ? "Entre na sua conta para ver se a MAISA responde." : "Não consegui ler seus contatos.", entrar });
        return;
      }
      const cliente: Record<string, boolean | null> = {};
      for (const c of (r.contatos ?? []) as { chave: string; cliente: boolean | null }[]) cliente[c.chave] = c.cliente;
      setCaderno({ fase: "ok", modo: r.modo, cliente });
    } catch {
      setCaderno({ fase: "erro", frase: "Sem conexão com o servidor." });
    }
  }, []);
  /* Relê ao entrar em Clientes: as marcações mudam na tela de Contatos, e a ficha diria o antigo. */
  useEffect(() => { if (tela === "clientes" || tela === "fluxo") void recarregarCaderno(); }, [tela, recarregarCaderno]);

  const responderA = useCallback((telefone: string) => {
    const chave = chaveDe(telefone);
    if (!chave) return;
    let antes: boolean | null | undefined;
    setCaderno((c) => {
      if (c.fase !== "ok") return c;
      antes = c.cliente[chave];
      return { ...c, cliente: { ...c.cliente, [chave]: true } };
    });
    const voltar = () => setCaderno((c) => {
      if (c.fase !== "ok") return c;
      const cliente = { ...c.cliente };
      if (antes === undefined) delete cliente[chave]; else cliente[chave] = antes;
      return { ...c, cliente };
    });
    void (async () => {
      try {
        const r = await fetch("/api/contatos", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ telefone, cliente: true }),
        }).then((x) => x.json());
        if (!r?.ok) { voltar(); toast(r?.info ?? "Não consegui marcar como cliente."); return; }
        toast("Marcado como cliente: a MAISA passa a responder");
      } catch {
        voltar();
        toast("Sem conexão com o servidor. Nada mudou.");
      }
    })();
  }, []);

  const abrirNoWhatsApp = useCallback((id: string) => {
    const cv = conversas.find((c) => c.id === id);
    if (!cv?.telefone) return;
    if (cv.estado !== "voce") {
      void mudarPosse(id, "assumir", "A MAISA parou de responder aqui. O que você escrever no WhatsApp não aparece nesta tela.");
    }
    window.open(`https://wa.me/${cv.telefone}`, "_blank", "noopener");
  }, [conversas, mudarPosse]);

  /**
   * RESPONDER — manda mensagem de verdade no WhatsApp da pessoa.
   *
   * A bolha aparece na hora e o envio vai atrás: num composer, esperar a rede para ver o que se
   * digitou faz a tela parecer quebrada. O que NÃO se faz é deixá-la lá se o envio falhar — a
   * bolha otimista é removida e o toast diz o motivo. Mensagem visível no painel que o cliente
   * nunca recebeu é a pior falha possível aqui: o dono segue a conversa achando que respondeu.
   *
   * Depois do ok, relê lista e thread em vez de confiar na própria bolha: quem grava o instante
   * é o banco, e é o `criado_em` dele que ordena a conversa.
   */
  const enviar = useCallback((id: string, txt: string) => {
    const t = txt.trim();
    if (!t || enviando) return;

    const provisoria: D.Msg = { de: "voce", txt: t, em: new Date().toISOString() };
    setThreads((ts) => ({ ...ts, [id]: [...(ts[id] ?? []), provisoria] }));
    setEnviando(true);

    /* `!== provisoria` por IDENTIDADE de objeto, não por conteúdo: duas mensagens iguais na
     * mesma conversa ("ok") são normais, e filtrar por texto apagaria a errada. */
    const desfazer = () =>
      setThreads((ts) => ({ ...ts, [id]: (ts[id] ?? []).filter((m) => m !== provisoria) }));

    void (async () => {
      try {
        const r = await fetch("/api/conversas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ telefone: id, acao: "responder", texto: t }),
        }).then((x) => x.json());

        if (!r?.ok) {
          desfazer();
          toast(r?.info ?? "Não foi possível enviar a mensagem");
          return;
        }
        await Promise.all([recarregarConversas(), carregarThread(id)]);
      } catch {
        desfazer();
        toast("Sem conexão com o servidor — a mensagem não foi enviada");
      } finally {
        setEnviando(false);
      }
    })();
  }, [enviando, recarregarConversas, carregarThread]);


  /* Buscas por id. Antes eram `D.profissional(id)` / `D.cliente(id)` / `D.servico(id)` —
   * funções do módulo de fixtures que varriam um array constante. Agora varrem o cadastro
   * carregado, e é só isso que muda: mesma assinatura, mesmo `null` quando não acha.
   *
   * Varredura linear e não `Map`: são 1 profissional, 7 serviços e 17 clientes. Indexar
   * custaria mais em complexidade do que economiza em tempo, e o dia em que a carteira
   * crescer o problema não é a busca — é a lista inteira vindo no payload. */

  const profissionalDe = useCallback(
    (id: string) => cadastro.profissionais.find((p) => p.id === id) ?? null,
    [cadastro.profissionais],
  );

  const clienteDe = useCallback(
    (id: string) => cadastro.clientes.find((c) => c.id === id) ?? null,
    [cadastro.clientes],
  );

  const nomeDoProfissional = useCallback(
    (id: string) => profissionalDe(id)?.nome ?? "—",
    [profissionalDe],
  );

  const nomeDoCliente = useCallback((id: string) => clienteDe(id)?.nome ?? "—", [clienteDe]);

  /**
   * De quem é a agenda que a tela lê.
   *
   * Era `const PID_AGENDA = D.COLUNAS_AGENDA[0]` no topo do módulo — avaliado no import, o
   * que era exatamente o que impedia o dado de vir do servidor. Agora é derivado do
   * cadastro, e por isso os callbacks que o usam ganharam dependência dele.
   *
   * É a agenda do DONO (a primeira), e serve ao que é dele: o convite do Google e o
   * "Reconectar". A LEITURA não usa mais só ela: desde 24/09/2026 (item 1A.4) `lerAgenda`
   * faz um GET por agenda de `cadastro.agendas`. Antes, com equipe, só a coluna do primeiro
   * era lida e as outras desenhavam "livre" sem ninguém ter perguntado.
   */
  const pidAgenda = cadastro.agendas[0] ?? "";
  /** As agendas que a leitura percorre, como STRING: é dependência de `lerAgenda`, e o efeito
   *  que busca só pode depender de strings e booleanos (ver o ⚠️ dele).
   *
   *  Vazia até o cadastro responder: a lista do placeholder é a do fixture, e ler com ela
   *  gastava um GET por janela com um `pid` que o negócio real não tem. Se o cadastro FALHA,
   *  lê com o que houver, para a Agenda dizer o erro em vez de ficar em esqueleto para sempre. */
  const agendasLidas = cadastroCarregado || cadastroErro ? cadastro.agendas.join(",") : "";

  /* ── expediente ──
   * Era `D.atende(pid, data)` / `D.podeComecar(pid, data, hora)`, que liam um
   * `Record<string, Expediente>` chaveado por `"pr1"` dentro do fixture. Com o cadastro
   * real os ids são uuid, e aquele Record devolveria `undefined` para tudo — e o domínio
   * degrada `undefined` para `false` em silêncio, o que pintaria TODA fatia da grade como
   * fora do expediente. Agenda inteira aparentemente fechada, zero erro no console.
   *
   * Aqui o expediente vem do próprio profissional, que é quem o tem. */

  /** `undefined` e não `null` porque é o que `atendeNoDia`/`podeComecarEm` recebem — eles
   *  já tratam a ausência (e degradam para "não atende", que é o lado seguro). */
  const expedienteDe = useCallback(
    (pid: string): D.Expediente | undefined => profissionalDe(pid)?.expediente,
    [profissionalDe],
  );

  const atendeNoDia = useCallback(
    (pid: string, data: string) => D.atendeNoDia(expedienteDe(pid), data),
    [expedienteDe],
  );

  const podeComecarEm = useCallback(
    (pid: string, data: string, inicio: number) => D.podeComecarEm(expedienteDe(pid), data, inicio),
    [expedienteDe],
  );

  /* CATÁLOGO VIVO. D.SERVICOS é o ponto de partida; o que o usuário edita ou cria vem por cima.
   * Antes o catálogo era imutável e a gaveta do serviço só mostrava — com um chip prometendo
   * "abrir e editar". Preço e duração são a razão de existir de uma tela de catálogo.
   *
   * Está declarado AQUI, longe dos outros toggles, porque o memo dos atendimentos logo abaixo
   * resolve o serviço de cada cartão por ele. Enquanto vivia lá embaixo, aquele memo não tinha
   * como enxergá-lo e lia `D.servico` direto: renomear "Corte" trocava o nome na tela Serviços e
   * NÃO trocava no cartão do atendimento. E o nome era o menor dos problemas — a duração antiga
   * continuava ditando `fim`, ou seja, a ALTURA do cartão na grade da Agenda. */
  /* ⚠️ EM 15/08/2026 ESTA LISTA DEIXOU DE TER CAMADA-SOMBRA, E ISSO É O CONSERTO DA FATIA.
   *
   * Ela era `cadastro.servicos` + `db.svcNovos`, com `db.svcEdit` por cima — três origens
   * fundidas num memo, e as três moravam no NAVEGADOR. Nenhuma escrita saía daqui: não
   * existia `/api/servicos`, não existia porta, não existia erro. O dono ajustava o preço
   * do Corte, via a lista mudar, dava F5, e o preço voltava.
   *
   * Agora `cadastro.servicos` é a única origem, e ela é o que o servidor devolveu. As
   * edições continuam otimistas (a tela muda na hora), mas vão para o banco — e voltam
   * atrás se ele recusar. É a mesma disciplina do `setNomeDoNegocio`. */
  const servicos = cadastro.servicos;
  const servicoDe = useCallback(
    (id: string) => servicos.find((sv) => sv.id === id),
    [servicos],
  );
  /** O `D.nomeServico` do catálogo VIVO. O de data.ts enxerga só o catálogo de partida: usar
   *  aquele numa tela é imprimir o nome que o usuário acabou de trocar. Quem tem o store à mão
   *  usa este. */
  const nomeServico = useCallback((id: string) => servicoDe(id)?.nome ?? "—", [servicoDe]);

  /** Os atendimentos como o Google os devolveu, acumulados por janela já lida.
   *
   *  Declarado aqui em cima, longe do bloco de leitura lá embaixo, só por ordem de hooks:
   *  o memo logo abaixo depende dele. Quem o ESCREVE é `lerAgenda`. */
  const [atendimentos, setAtendimentos] = useState<AtendimentoLido[]>([]);

  /* ── os atendimentos ──
   *
   * Uma origem só, e ela é o Google Calendar. Já foram três (os nove de hoje escritos à
   * mão, o mês gerado sob demanda, e os marcados no navegador); as duas primeiras morreram
   * com os exemplos, a terceira morreu aqui — marcar agora cria o evento lá, e o que a
   * tela mostra é o que voltou da leitura.
   *
   * O que este memo faz é RESOLVER: pegar os ids que vieram gravados no evento e trocá-los
   * pelos objetos do catálogo vivo, caindo nas cópias do próprio evento quando o catálogo
   * local não conhece o id (ver servicoDoEvento).
   *
   * A duração vem do EVENTO (`e.duracao`, a diferença entre start e end), não do catálogo.
   * São coisas diferentes desde que o horário passou a poder mudar por fora: se alguém
   * esticar o evento no Google Calendar, o bloco na grade tem que esticar junto. */
  const agendamentos = useMemo<AgendamentoVivo[]>(() => {
    return atendimentos.flatMap((e) => {
      const pf = profissionalDe(e.profissionalId);
      /* Sem profissional não dá para desenhar: `.nome` aparece no cartão, na gaveta e no
       * aria-label. Sumir da lista com aviso no console é muito melhor que tela branca —
       * foi a lição de quando a equipe encolheu para uma pessoa e sobrou `pr2` no
       * localStorage. Serviço e cliente NÃO caem aqui: para eles existe a cópia gravada
       * no evento, que é justamente a razão de ela existir. */
      if (!pf) {
        console.warn(`[store] evento ${e.eventId} ignorado — profissional ${e.profissionalId} não existe`);
        return [];
      }
      const doCatalogo = servicoDe(e.servicoId);
      const cl = clienteDe(e.clienteId);
      const id = `ag:${e.eventId}`;

      return [{
        id,
        eventId: e.eventId,
        ag: e.ag,
        data: e.data,
        inicio: e.inicio,
        fim: e.fim,
        duracao: e.duracao,
        profissionalId: e.profissionalId,
        profissional: pf,
        // O nome e o preço vêm do catálogo quando ele conhece o serviço (assim renomear em
        // Serviços reflete no cartão); a duração vem do evento, sempre.
        servico: doCatalogo ? { ...doCatalogo, duracao: e.duracao } : servicoDoEvento(e),
        cliente: cl ?? clienteDoEvento(e),
        valor: e.valorGravado,
        confirmado: e.confirmado,
        // Passado sem etapa gravada nasce "feito": ninguém volta ao kanban de terça-feira
        // para arrastar o que já aconteceu, e deixá-los todos em "Chegando" encheria a
        // primeira coluna de gente que já foi embora.
        etapa: db.etapas[id] ?? (e.data < D.HOJE.iso ? "feito" : "chegando"),
        meetLink: e.meetLink,
        htmlLink: e.htmlLink,
        recorrente: e.recorrente,
        soltoDoCatalogo: !doCatalogo || !cl,
      }];
      // Comparar duas datas ISO com `<` JÁ é comparação cronológica — campos de largura
      // fixa, do mais significativo para o menos. É a razão de o formato ter sido escolhido.
    }).sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : x.inicio - y.inicio));
    // `servicoDe` nas deps é o que basta: ele muda de identidade sempre que o catálogo
    // muda, e desde 15/08/2026 o catálogo tem uma origem só (`cadastro.servicos`). Antes
    // eram três fundidas num memo, e listar `db.svcNovos` à mão era meia dependência —
    // pegava o serviço criado e perdia o serviço editado.
  }, [atendimentos, db.etapas, servicoDe, profissionalDe, clienteDe]);

  /** Índice por data. A grade de mês pergunta 42 vezes por render (uma por célula, e o hover
   *  re-renderiza a cada célula que o mouse cruza); com `.filter()` cada pergunta varria o mês
   *  inteiro. Além do custo, `filter` devolvia um array NOVO a cada chamada, então qualquer memo
   *  com essa lista na dependência nunca acertava o cache. */
  const porDia = useMemo(() => {
    const m = new Map<string, AgendamentoVivo[]>();
    for (const a of agendamentos) {
      const lista = m.get(a.data);
      if (lista) lista.push(a);
      else m.set(a.data, [a]);
    }
    return m;
  }, [agendamentos]);

  /** Os atendimentos de UM dia, por data ISO. `agendamentos` é a janela inteira, então quem
   *  fala de "hoje" (o Fluxo, o kanban) precisa dizer qual dia quer. */
  const agendamentosDoDia = useCallback((data: string) => porDia.get(data) ?? SEM_ATENDIMENTO, [porDia]);

  const agendamentoPorId = useCallback(
    (id: string) => agendamentos.find((a) => a.id === id),
    [agendamentos],
  );

  /** Etapa atual. O padrão já foi calculado pelo memo (ver `etapa` lá em cima), então aqui
   *  é só perguntar ao atendimento resolvido — antes isto reimplementava o mesmo default e
   *  as duas cópias podiam discordar. */
  const etapaDe = useCallback(
    (id: string): D.Etapa => agendamentoPorId(id)?.etapa ?? "chegando",
    [agendamentoPorId],
  );

  /* As três ações abaixo eram IRREVERSÍVEIS E SILENCIOSAS: arrastar um cartão para "Feito hoje"
   * marcava um atendimento como concluído sem toast, sem anúncio para leitor de tela e sem volta.
   * Agora todas confirmam e todas oferecem "Desfazer" — inclusive porque remarcar dispara WhatsApp
   * de verdade para o cliente. O rótulo nomeia quem mudou, não "item atualizado". */
  const ROTULO_ETAPA: Record<D.Etapa, string> = {
    chegando: "Chegando", atendendo: "Em atendimento", feito: "Feito hoje",
  };

  const moverEtapa = useCallback((id: string, etapa: D.Etapa) => {
    const a = agendamentoPorId(id);
    const antes = a?.etapa ?? "chegando";
    patch((d) => ({ etapas: { ...d.etapas, [id]: etapa } }));
    setArrastando(null);
    setAlvoSolta(null);
    if (antes === etapa) return;
    toast(
      `${a?.cliente.nome ?? "Atendimento"} → ${ROTULO_ETAPA[etapa]}`,
      { label: "Desfazer", onClick: () => patch((d) => ({ etapas: { ...d.etapas, [id]: antes } })) },
    );
  }, [patch, agendamentoPorId]);

  const avancarEtapa = useCallback((id: string) => {
    const a = agendamentoPorId(id);
    const antes = a?.etapa ?? "chegando";
    const i = D.ETAPAS.indexOf(antes);
    const prox = D.ETAPAS[Math.min(i + 1, D.ETAPAS.length - 1)];
    if (prox === antes) return;
    patch((d) => ({ etapas: { ...d.etapas, [id]: prox } }));
    toast(
      `${a?.cliente.nome ?? "Atendimento"} → ${ROTULO_ETAPA[prox]}`,
      { label: "Desfazer", onClick: () => patch((d) => ({ etapas: { ...d.etapas, [id]: antes } })) },
    );
  }, [patch, agendamentoPorId]);

  /* Aqui morava `reposicionar` — arrastar um bloco para outro horário.
   *
   * Ele saiu junto com o atendimento local, e o motivo é que não sobrou nada para editar:
   * o atendimento é o evento do Google, então remarcar é um PATCH numa agenda real. Isso
   * chega na fatia 5, e precisa de uma peça que ainda não existe — uma FILA DE ESCRITA
   * serializada por evento. Arrastar 10h→11h→12h dispara dois PATCH que podem chegar fora
   * de ordem, e o que fica no calendário é o penúltimo. Numa agenda de verdade isso é o
   * cliente aparecendo na hora errada.
   *
   * Enquanto isso não vem, o bloco NÃO é arrastável (ver Bloco na Agenda) e a barra da
   * grade não promete que seja. Um arrasto que não faz nada seria pior que a ausência dele:
   * a tela diria que remarcou e o Google discordaria em silêncio. Para remarcar hoje: no
   * Google Calendar, e o app mostra a mudança na leitura seguinte. */

  /* ── fila "precisa de você" ──
   *
   * DUAS origens. As conversas vêm escritas (D.FILA_CONVERSAS, ainda demonstração — o
   * WhatsApp não está integrado); as cobranças de confirmação são DERIVADAS dos
   * atendimentos de hoje.
   *
   * Eram quatro linhas fixas, e duas delas apontavam para `ag5` e `ag8`. Sem os exemplos
   * elas não dariam erro: o filtro simplesmente não as encontraria e a fila encolheria de
   * quatro para dois, calada. Derivar troca isso por uma regra — "quem é de hoje, ainda
   * não confirmou e ainda não chegou" —, que continua valendo quando o atendimento for
   * real.
   *
   * A fila esvazia sozinha conforme você age em qualquer lugar do app: assumir a conversa
   * resolve o item dela, e dar chegada tira a cobrança daquele horário (a etapa deixa de
   * ser "chegando"). Sem isso o painel viraria uma lista que nunca zera. */
  const fila = useMemo<D.ItemFila[]>(() => [
    /* A metade das conversas era `D.FILA_CONVERSAS`: dois itens escritos à mão apontando para
     * `cv1` e `cv2`. Agora é uma REGRA sobre o dado real — "o cliente falou e ninguém
     * respondeu" —, que é exatamente o `espera` do domínio (ver `estadoDaConversa`).
     *
     * ⚠️ O filtro é o estado do SERVIDOR, e não `db.resolvidos`: resolver uma conversa agora é
     * `resolvida_em` no banco, então a fila zera igual em todos os aparelhos do dono. E ela
     * esvazia sozinha pelo caminho certo — assumir muda o estado para `voce`, responder muda a
     * última fala para `voce`; nos dois casos o item sai daqui sem ninguém "resolver" nada. */
    ...conversas
      .filter((c) => c.estado === "espera")
      .map((c) => ({
        id: `cv:${c.id}`,
        alvo: c.id,
        titulo: c.nome,
        tag: "responder",
        msg: c.ultima?.txt ?? "Mandou mensagem e ainda não foi respondido.",
      })),
    ...agendamentosDoDia(D.HOJE.iso)
      .filter((a) => semConfirmacao(a) && !db.resolvidos[a.id])
      .map((a) => ({
        id: `fl:${a.id}`,
        alvo: a.id,
        titulo: a.cliente.nome,
        tag: "confirmar",
        /* Só o que se sabe: o convite não foi respondido. dizer que a MAISA cobrou não tinha fonte
         * (nenhuma leitura diz se o lembrete saiu), 1A.5. */
        msg: `${D.hhmm(a.inicio)} ainda sem confirmação.`,
      })),
  ], [db.resolvidos, conversas, agendamentosDoDia]);

  /**
   * "Já resolvi" — o item some da fila.
   *
   * DOIS destinos, porque os dois tipos de item têm donos diferentes: conversa resolvida é
   * `resolvida_em` no banco (vale em todos os aparelhos, e é o que a MAISA e a tela leem juntas);
   * cobrança de confirmação continua no `localStorage`, porque ela é derivada do atendimento e
   * não existe coluna para "o dono já viu isto".
   *
   * O "Desfazer" existe nos dois — era a única ação irreversível da tela, e a estilizada como a
   * menos importante.
   */
  const resolverFila = useCallback((alvo: string) => {
    if (conversas.some((c) => c.id === alvo)) {
      void mudarPosse(alvo, "resolver");
      toast("Conversa resolvida", { label: "Desfazer", onClick: () => void mudarPosse(alvo, "reabrir") });
      return;
    }
    patch((d) => ({ resolvidos: { ...d.resolvidos, [alvo]: true } }));
    toast("Item resolvido", {
      label: "Desfazer",
      onClick: () => patch((d) => {
        const r = { ...d.resolvidos };
        delete r[alvo];
        return { resolvidos: r };
      }),
    });
  }, [patch, conversas, mudarPosse]);

  /* ── arrasto ── */
  const iniciarArrasto = useCallback((id: string) => setArrastando(id), []);
  const encerrarArrasto = useCallback(() => { setArrastando(null); setAlvoSolta(null); }, []);
  const marcarAlvo = useCallback((alvo: string | null) => {
    setAlvoSolta((a) => (a === alvo ? a : alvo));
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────────
   * O CATÁLOGO — leitura E ESCRITA, desde 15/08/2026.
   *
   * ⚠️ TUDO ABAIXO ERA MENTIRA ATÉ ESTA DATA, e vale escrever o que era porque foi o
   * defeito mais caro de encontrar do app: `profAtivo`, `svcAtivo`, `editarServico`,
   * `criarServico` e `excluirServico` mexiam em `db.profAtivo`, `db.svcAtivo`,
   * `db.svcEdit` e `db.svcNovos` — quatro mapas no `localStorage`. Não existia
   * `/api/servicos`, não existia `/api/equipe`, não existia porta de escrita. O dono
   * ajustava o preço do Corte, via a lista mudar, o comentário aqui dizia "persiste na
   * hora — o app não tem botão Salvar de mentira", e um F5 apagava tudo.
   *
   * Pior: era invisível. Nenhum erro, nenhum log, nenhum teste vermelho. Só a lista
   * voltando ao que era, um dia depois, quando ninguém lembrava de ter editado.
   *
   * ── A MECÂNICA, QUE É A MESMA DO `setNomeDoNegocio` ──
   * Otimista com volta atrás: a tela muda na hora, o PUT sai depois de `JANELA_AJUSTES`,
   * e se o servidor recusar a linha volta ao que era MAIS a frase do servidor. A foto
   * para a volta é tirada UMA vez por rajada, dentro do updater, onde o estado é
   * garantidamente o corrente.
   *
   * O debounce é POR SERVIÇO (mapas de id → timer) e não global: editar o preço do Corte
   * e a duração da Barba são dois recursos, e um timer só faria a segunda tecla cancelar
   * o envio da primeira.
   * ────────────────────────────────────────────────────────────────────────────── */

  /** Snapshot para desfazer, por id. Presente = há rajada em curso. */
  const svcAntes = useRef<Map<string, D.Servico>>(new Map());
  /** O estado mais recente que ainda não foi enviado, por id. */
  const svcPendente = useRef<Map<string, D.Servico>>(new Map());
  const svcTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const trocarServicoNaTela = useCallback((id: string, novo: D.Servico) => {
    setCadastro((c) => ({ ...c, servicos: c.servicos.map((s) => (s.id === id ? novo : s)) }));
  }, []);

  const enviarServico = useCallback(async (id: string) => {
    svcTimer.current.delete(id);
    const alvo = svcPendente.current.get(id);
    const antes = svcAntes.current.get(id);
    svcPendente.current.delete(id);
    svcAntes.current.delete(id);
    if (!alvo) return;

    const voltar = () => { if (antes) trocarServicoNaTela(id, antes); };

    try {
      const r = await fetch("/api/servicos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        /* Só o que se pode escrever. `profissionalIds` é derivado da tabela-ponte e
         * mandá-lo daria a impressão de que a tela decide quem faz o quê — ela não
         * decide, e o campo seria ignorado em silêncio. */
        body: JSON.stringify({
          id: alvo.id, nome: alvo.nome, categoria: alvo.categoria,
          preco: alvo.preco, duracao: alvo.duracao, ativo: alvo.ativo,
        }),
      }).then((x) => x.json());

      if (!r?.ok) {
        /* A frase do SERVIDOR: "a duração precisa ficar entre 5 minutos e 8 horas" é o
         * que diz ao dono o que corrigir. Um genérico mandaria ele adivinhar. */
        voltar();
        toast(r?.info ?? "Não foi possível salvar o serviço.");
        return;
      }
      /* Pinta o que o BANCO gravou — a normalização acontece lá.
       * ⚠️ MENOS quando outra edição do mesmo serviço já está na fila: a resposta é da
       * gravação ANTERIOR e pintaria por cima do que acabou de ser digitado. Medido em
       * 24/09/2026 (bancada `aud08b.mjs`): mudar a duração e logo depois o preço fazia o
       * preço voltar ao antigo por meio segundo, até a segunda gravação responder. Quem
       * pinta, então, é a resposta da última. */
      if (r.servico && !svcPendente.current.has(id)) trocarServicoNaTela(id, r.servico);
    } catch {
      voltar();
      toast("Sem conexão com o servidor — o serviço não foi salvo.");
    }
  }, [trocarServicoNaTela]);

  const mexerNoServico = useCallback((id: string, p: Partial<D.Servico>) => {
    setCadastro((c) => {
      const i = c.servicos.findIndex((s) => s.id === id);
      if (i < 0) return c;
      if (!svcAntes.current.has(id)) svcAntes.current.set(id, c.servicos[i]);
      const novo = { ...c.servicos[i], ...p };
      svcPendente.current.set(id, novo);
      const copia = [...c.servicos];
      copia[i] = novo;
      return { ...c, servicos: copia };
    });

    const t = svcTimer.current.get(id);
    if (t) clearTimeout(t);
    svcTimer.current.set(id, setTimeout(() => { void enviarServico(id); }, JANELA_AJUSTES));
  }, [enviarServico]);

  const svcAtivo = useCallback((id: string) => servicoDe(id)?.ativo ?? false, [servicoDe]);

  const alternarSvc = useCallback((id: string) => {
    mexerNoServico(id, { ativo: !(servicoDe(id)?.ativo ?? false) });
  }, [mexerNoServico, servicoDe]);

  const editarServico = useCallback((id: string, p: Partial<D.Servico>) => {
    mexerNoServico(id, p);
  }, [mexerNoServico]);

  /**
   * Cria um serviço e abre a gaveta para preencher.
   *
   * ⚠️ ESPERA O SERVIDOR antes de abrir a gaveta, ao contrário de todo o resto deste
   * bloco. O otimismo aqui não serve: o id vem do BANCO, e uma linha desenhada com id
   * inventado só descobriria o id real depois — então toda edição feita nesse intervalo
   * iria para um serviço que não existe. Era exatamente esse o arranjo antigo
   * (`sv-novo-<timestamp>`), e ele funcionava só porque nada era enviado a lugar nenhum.
   *
   * Nasce `ativo: false` de propósito: um serviço sem preço não deveria poder ser
   * agendado, e a MAISA não o oferece enquanto o dono não o publicar.
   */
  const criarServico = useCallback(async () => {
    try {
      const r = await fetch("/api/servicos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: "Novo serviço", categoria: "Extra", preco: 0, duracao: 30, ativo: false,
        }),
      }).then((x) => x.json());

      if (!r?.ok || !r.servico) {
        toast(r?.info ?? "Não foi possível criar o serviço.");
        return;
      }
      setCadastro((c) => ({ ...c, servicos: [...c.servicos, r.servico] }));
      setSel(r.servico.id);
      toast("Serviço criado — preencha preço e duração");
    } catch {
      toast("Sem conexão com o servidor — o serviço não foi criado.");
    }
  }, []);

  const verDia = useCallback((data: string) => {
    setDiaSel(data);
    setSel(null); // trocar de dia fecha a gaveta: o que estava aberto é de outro dia
  }, []);

  /* CRIAR ATENDIMENTO desceu para o bloco do Google Calendar, lá embaixo.
   *
   * Não é organização: marcar um horário virou uma ESCRITA numa agenda real, e este
   * callback passou a precisar de `conectado` e de `lerStatusGoogle`, que só existem
   * depois. Deixá-lo aqui exigiria um ref só para furar a ordem dos hooks — e o lugar
   * honesto de uma função que faz POST no Google é junto das outras que fazem. */

  /**
   * Apaga o serviço de vez.
   *
   * ⚠️ APAGAR SERVIÇO É SEGURO, e isso foi conferido no esquema, não suposto:
   * `atendimentos.servico_id` NÃO tem FK — é snapshot ao lado de `servico_nome` e
   * `servico_valor` (`002_multitenant.sql`). Faturamento fechado continua fechado.
   *
   * Tira da tela primeiro e devolve se o servidor recusar: apagar é a ação em que a
   * espera mais incomoda, e o custo de errar é baixo — a linha volta.
   */
  const excluirServico = useCallback(async (id: string) => {
    /* A foto vem da closure e NÃO de dentro do updater: o updater não roda antes da
     * próxima linha, então `antes` chegaria vazio ao `catch` e o "desfazer" apagaria o
     * catálogo em vez de restaurá-lo. Mesmo arranjo do `removerFaq`. */
    const antes = cadastro.servicos;
    setCadastro((c) => ({ ...c, servicos: c.servicos.filter((s) => s.id !== id) }));
    setSel(null);

    try {
      const r = await fetch(`/api/servicos?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        .then((x) => x.json());
      if (!r?.ok) {
        setCadastro((c) => ({ ...c, servicos: antes }));
        toast(r?.info ?? "Não foi possível apagar o serviço.");
        return;
      }
      toast("Serviço excluído");
    } catch {
      setCadastro((c) => ({ ...c, servicos: antes }));
      toast("Sem conexão com o servidor — nada mudou.");
    }
  }, [cadastro.servicos]);

  /* ── quem atende ──
   * Só o liga/desliga, porque só ele existe na tela hoje. `PUT /api/equipe` também aceita
   * nome e papel — é o que o wizard de onboarding usa para corrigir o profissional que
   * `criar_negocio()` batizou adivinhando pelo e-mail. */

  const profAtivo = useCallback(
    (id: string) => profissionalDe(id)?.ativo ?? false,
    [profissionalDe],
  );

  const alternarProf = useCallback((id: string) => {
    const atual = profissionalDe(id);
    if (!atual) return;
    const novo = { ...atual, ativo: !atual.ativo };

    setCadastro((c) => ({
      ...c,
      profissionais: c.profissionais.map((p) => (p.id === id ? novo : p)),
    }));

    void (async () => {
      const voltar = () => setCadastro((c) => ({
        ...c,
        profissionais: c.profissionais.map((p) => (p.id === id ? atual : p)),
      }));
      try {
        const r = await fetch("/api/equipe", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, nome: atual.nome, ativo: novo.ativo }),
        }).then((x) => x.json());

        if (!r?.ok) { voltar(); toast(r?.info ?? "Não foi possível salvar."); return; }
        if (r.profissional) {
          setCadastro((c) => ({
            ...c,
            profissionais: c.profissionais.map((p) => (p.id === id ? r.profissional : p)),
          }));
        }
      } catch {
        voltar();
        toast("Sem conexão com o servidor — nada mudou.");
      }
    })();
  }, [profissionalDe]);

  const criarProfissional = useCallback(async (p: { nome: string; papel: string }) => {
    const nome = p.nome.trim();
    if (!nome) return false;
    try {
      const r = await fetch("/api/equipe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ...(p.papel.trim() ? { papel: p.papel.trim() } : {}) }),
      }).then((x) => x.json());
      if (!r?.ok || !r.profissional) { toast(r?.info ?? "Não foi possível adicionar."); return false; }
      setCadastro((c) => ({ ...c, profissionais: [...c.profissionais, r.profissional] }));
      setSel(r.profissional.id);
      toast(`${D.primeiroNome(nome)} entrou na equipe`);
      return true;
    } catch {
      toast("Sem conexão com o servidor. Ninguém foi adicionado.");
      return false;
    }
  }, []);

  const editarProfissional = useCallback((id: string, patch: { nome?: string; papel?: string }) => {
    const atual = profissionalDe(id);
    if (!atual) return;
    const nome = (patch.nome ?? atual.nome).trim();
    // Nome vazio não grava: a rota exige, e a MAISA diria "com quem?" sem nome nenhum.
    if (!nome) return;
    const novo = { ...atual, nome, ...(patch.papel === undefined ? {} : { papel: patch.papel.trim() }) };
    if (novo.nome === atual.nome && novo.papel === atual.papel) return;
    setCadastro((c) => ({ ...c, profissionais: c.profissionais.map((x) => (x.id === id ? novo : x)) }));
    void (async () => {
      const voltar = () => setCadastro((c) => ({ ...c, profissionais: c.profissionais.map((x) => (x.id === id ? atual : x)) }));
      try {
        const r = await fetch("/api/equipe", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, nome: novo.nome, papel: novo.papel }),
        }).then((x) => x.json());
        if (!r?.ok) { voltar(); toast(r?.info ?? "Não foi possível salvar."); return; }
        if (r.profissional) setCadastro((c) => ({ ...c, profissionais: c.profissionais.map((x) => (x.id === id ? r.profissional : x)) }));
      } catch {
        voltar();
        toast("Sem conexão com o servidor. Nada mudou.");
      }
    })();
  }, [profissionalDe]);

  const cliAtivo = useCallback(
    (id: string) => clienteDe(id)?.ativo ?? false,
    [clienteDe],
  );

  /* ESCREVER CLIENTE desceu para depois do faturamento, junto de `recarregarFaturamento`.
   *
   * Não é organização: corrigir o CPF de alguém muda o que a tela de Faturamento pode
   * emitir (sem CPF a prefeitura recusa, e `emitiveis` tira a pessoa do lote), então o
   * envio TEM que recarregar o faturamento depois de gravar. Deixar o bloco aqui exigiria
   * um ref só para furar a ordem dos hooks — e o lugar honesto de uma função que depende
   * do faturamento é junto das outras que dependem. Mesmo argumento do
   * `criarAtendimento`, que desceu para o bloco do Google. */

  /* ─────────────────────────────────────────────────────────────────────────────
   * NOTA FISCAL — servidor, não `localStorage`.
   *
   * ★ A RECLAMAÇÃO DO BRUNO (14/08/2026) QUE ESTE BLOCO EXISTE PARA CONSERTAR:
   *   "a lógica da página de faturamento está errada. ela deve ser diretamente atrelada à
   *    tela de agendamentos, e deve ser totalmente calculada com base no tanto de
   *    agendamentos que foram feitos desde a última emissão de notas. além disso, ela deve
   *    contabilizar os casos em que uma única pessoa teve a nota emitida, e tirar essa
   *    pessoa da emissão em massa."
   *
   * O que estava aqui antes: `db.notas`, um mapa CLIENTE → nota no disco do navegador, e
   * `fechamento` somando `v_clientes.valor` (o total da competência). Três defeitos que
   * saíam disso, e o terceiro é o que custa papel:
   *
   *   • trocar de navegador ressuscitava o botão de emitir;
   *   • sendo por cliente e não por período, quem teve nota em agosto nunca mais aparecia
   *     como pendente — setembro nascia fechado;
   *   • e emitir duas vezes no mesmo mês cobrava o mês inteiro nas duas, gerando um SEGUNDO
   *     documento fiscal. Nota autorizada não se apaga: cancela-se na prefeitura, e há
   *     cidade que não aceita cancelamento por webservice nenhum.
   *
   * Agora tudo vem de `GET /api/faturamento`, que pergunta ao banco `atendimentos.nota_id
   * is null` — uma resposta que já significa "desde a última emissão" e que já exclui quem
   * tem nota. As duas metades da reclamação caem da mesma coluna.
   *
   * ⚠️ `db.notas` e `db.proximoNumero` continuam no tipo do `db` por compatibilidade com
   * discos antigos, e NÃO são mais lidos. Apagá-los do tipo faria o `JSON.parse` de um
   * `localStorage` gravado ontem carregar campos que o TypeScript não conhece — inofensivo,
   * mas o `migrarDaV2` já mostrou que essa transição merece uma versão de chave, não um
   * remendo. Ficam mortos até a próxima virada de `CHAVE`.
   * ────────────────────────────────────────────────────────────────────────────── */

  const [faturamento, setFaturamento] = useState<Faturamento | null>(null);

  const recarregarFaturamento = useCallback(async () => {
    try {
      const r = await fetch("/api/faturamento", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) { setFaturamento({ aFaturar: r.aFaturar ?? [], emitidas: r.emitidas ?? [], ambiente: r.ambiente, falta: r.falta ?? [] }); return; }
      /* ⚠️ NÃO ENGOLE. Sem faturamento a tela mostra "Nada a faturar" — que é a frase errada
       * para um mês cheio de atendimentos, e indistinguível do mês realmente fechado. O
       * servidor manda a frase certa (inclusive "rode a migração 015"); aqui só se repete. */
      if (r?.mensagem || r?.erro) toast(String(r.mensagem ?? r.erro));
    } catch {
      toast("Não consegui carregar o faturamento.");
    }
  }, []);

  useEffect(() => { void recarregarFaturamento(); }, [recarregarFaturamento]);

  /**
   * A nota daquele cliente — a MAIS RECENTE, quando há mais de uma.
   *
   * ⚠️ Mais de uma é o caso normal a partir do segundo mês, e não exceção: cada competência
   * gera a sua. Pegar a primeira do array mostraria a nota de agosto na tela de setembro.
   * `listar` já devolve por `criado_em` decrescente, então a primeira que casa é a certa.
   */
  const notaDe = useCallback(
    (clienteId: string): D.Nota =>
      faturamento?.emitidas.find((n: D.Nota & { clienteId: string | null }) => n.clienteId === clienteId) ?? { status: "pendente" },
    [faturamento],
  );

  // Timers de polling ativos — limpos no unmount para não vazar.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const agendar = useCallback((f: () => void, ms: number) => {
    timers.current.push(setTimeout(f, ms));
  }, []);

  const cancelarNota = useCallback(async (ref: string) => {
    if (!ref) return;
    try {
      const r = await fetch("/api/nf/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref }),
      }).then((x) => x.json());
      if (r.status === "cancelado") toast("Nota cancelada");
      else toast(r.erros?.[0]?.mensagem ?? "Não foi possível cancelar.");
    } catch {
      toast("Sem conexão para cancelar a nota.");
    }
    /* Recarrega em qualquer desfecho: quem manda no que a tela mostra é o banco, e adivinhar
     * o novo estado aqui é como o `localStorage` divergia do servidor. */
    void recarregarFaturamento();
  }, [recarregarFaturamento]);

  /**
   * Nota de cliente de teste se cancela sozinha.
   *
   * A NFS-e só autoriza de verdade em produção, então validar a integração exige emitir uma
   * nota real. Deixá-la de pé seria um documento fiscal indevido — o cancelamento automático
   * é o que torna o teste seguro de repetir.
   */
  const agendarCancelamentoDeTeste = useCallback((clienteId: string, ref: string) => {
    if (!clienteDe(clienteId)?.teste || !ref) return;
    const seg = Math.round(D.TESTE_CANCELA_APOS_MS / 1000);
    toast(`Nota de teste emitida — cancelando em ${seg}s`);
    agendar(() => { void cancelarNota(ref); }, D.TESTE_CANCELA_APOS_MS);
  }, [agendar, cancelarNota, clienteDe]);

  /** Acompanha a emissão assíncrona até sair número (ou erro). */
  const acompanhar = useCallback((clienteId: string, ref: string, tentativa = 0) => {
    if (tentativa > 20) return;
    agendar(async () => {
      try {
        const r = await fetch(`/api/nf/status?ref=${encodeURIComponent(ref)}`).then((x) => x.json());
        /* `consultarNota` já grava o status no banco — aqui só se recarrega. Pintar a tela
         * com a resposta e gravar no servidor em paralelo é como as duas fontes divergiam. */
        if (r.status === "autorizado") { await recarregarFaturamento(); agendarCancelamentoDeTeste(clienteId, ref); return; }
        if (r.status === "cancelado" || r.status === "erro") { void recarregarFaturamento(); return; }
        if (r.status === "simulado") { await recarregarFaturamento(); agendarCancelamentoDeTeste(clienteId, ref); return; }
        acompanhar(clienteId, ref, tentativa + 1);
      } catch {
        acompanhar(clienteId, ref, tentativa + 1);
      }
    }, tentativa === 0 ? 1400 : 3000);
  }, [agendar, agendarCancelamentoDeTeste, recarregarFaturamento]);

  const emitirNota = useCallback(async (clienteId: string) => {
    try {
      /* ⚠️ UM CAMPO. Valor, discriminação e tomador saem do BANCO, na transação que prende os
       * atendimentos. Esta tela mandava os três até 17/08/2026 — e uma tela aberta há dez
       * minutos emitia nota com total velho. */
      const r = await fetch("/api/nf/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      }).then((x) => x.json());

      /* ⚠️ NÃO É ERRO. O segundo clique, ou a outra aba, chegou primeiro — e a claim do banco
       * fez o certo. Mostrar erro aqui faria o dono clicar de novo procurando entender. */
      if (r.status === "ja_faturado") { toast("Esse cliente já foi faturado"); void recarregarFaturamento(); return; }
      if (r.status === "processando") { await recarregarFaturamento(); acompanhar(clienteId, r.ref); return; }
      if (r.status === "autorizado" || r.status === "simulado") {
        await recarregarFaturamento();
        agendarCancelamentoDeTeste(clienteId, r.ref);
        return;
      }
      if (r.status === "config_incompleta") { toast(`Faltam dados fiscais: ${(r.faltando ?? []).join(", ")}.`); return; }
      if (r.status === "nao_autenticado") { toast("Sua sessão expirou. Entre de novo para emitir."); return; }
      toast(r.erros?.[0]?.mensagem ?? r.info ?? "Não foi possível emitir.");
      void recarregarFaturamento();
    } catch {
      toast("Sem conexão com o servidor de notas.");
    }
  }, [acompanhar, agendarCancelamentoDeTeste, recarregarFaturamento]);

  /**
   * As linhas da tela de Faturamento.
   *
   * Junta o que falta emitir (do banco) com as notas já emitidas, e completa com o cadastro
   * o que o servidor não manda (canal, serviço) — esses são de exibição, e o que decide
   * dinheiro vem inteiro do servidor.
   */
  const mesDoFechamento = useMemo(
    () => D.rotuloDaCompetencia((faturamento?.aFaturar ?? []).map((a) => a.competencia), D.HOJE.iso),
    [faturamento],
  );

  const fechamento = useMemo<LinhaDeFaturamento[]>(() => {
    if (!faturamento) return [];
    const porId = new Map(cadastro.clientes.map((c) => [c.id, c]));

    const pendentes: LinhaDeFaturamento[] = faturamento.aFaturar.map((a) => {
      const c = porId.get(a.clienteId);
      return {
        id: a.clienteId, nome: a.nome, valor: a.valor, atendimentos: a.atendimentos,
        cpf: a.cpf ?? "", teste: a.teste, servicoId: c?.servicoId ?? "", canal: c?.canal ?? "—",
        servico: a.servico, semCpf: !a.cpf, competencia: a.competencia,
      };
    });

    /* Quem já tem nota também aparece — é o histórico do mês. `tomadorNome` vem do snapshot
     * da própria nota, e não do cadastro: documento fiscal não muda de nome porque alguém
     * corrigiu o cliente depois. */
    const jaEmitidos: LinhaDeFaturamento[] = faturamento.emitidas
      .filter((n) => n.clienteId && !faturamento.aFaturar.some((a) => a.clienteId === n.clienteId))
      .map((n) => {
        const c = n.clienteId ? porId.get(n.clienteId) : undefined;
        return {
          id: n.clienteId!, nome: n.tomadorNome ?? c?.nome ?? "—", valor: n.valor,
          atendimentos: 0, cpf: c?.cpf ?? "", teste: c?.teste === true,
          servicoId: c?.servicoId ?? "", canal: c?.canal ?? "—", servico: null, semCpf: false,
        };
      });

    return [...pendentes, ...jaEmitidos];
  }, [faturamento, cadastro.clientes]);

  /* FONTE DA VERDADE ÚNICA de "o que o lote vai emitir" — hero, topbar e lote leem DAQUI.
   * Antes havia três regras divergentes e o botão prometia N enquanto o sistema emitia M. */
  const emitiveis = useMemo(
    () => fechamento.filter((c) => {
      /* Tomador de teste fica FORA do lote: em produção ele emite uma nota REAL, e um botão
       * de fechar o mês não deveria disparar isso sem que alguém pedisse. Ele emite só pela
       * própria gaveta, um a um. */
      if (c.teste) return false;
      /* ⚠️ Sem CPF a prefeitura recusa. Deixar na lista faria o lote de doze virar onze
       * sucessos e um erro que ninguém entende — o motivo aparece na linha do cliente. */
      if (c.semCpf) return false;
      return c.atendimentos > 0;
    }),
    [fechamento],
  );

  const emitirPendentes = useCallback(() => {
    if (!emitiveis.length) return;
    toast(`Enviando ${emitiveis.length} ${emitiveis.length === 1 ? "nota" : "notas"} à prefeitura`);
    // Escalonado: emissão em lote não deve disparar N requisições no mesmo tick.
    emitiveis.forEach((c, i) => agendar(() => { void emitirNota(c.id); }, i * 300));
    agendar(() => toast(`${emitiveis.length === 1 ? "Nota enviada" : "Notas enviadas"} — acompanhe o status em cada cliente`), emitiveis.length * 300 + 400);
  }, [emitiveis, emitirNota, agendar]);

  /* Confirmação do lote fiscal. Vive no store porque a MESMA ação é disparada de dois lugares
   * (hero do Faturamento e topbar), e o diálogo precisa ser um só. */
  const [loteAberto, setLoteAberto] = useState(false);
  const pedirLote = useCallback(() => setLoteAberto(true), []);
  const fecharLote = useCallback(() => setLoteAberto(false), []);
  const confirmarLote = useCallback(() => { setLoteAberto(false); emitirPendentes(); }, [emitirPendentes]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * ESCREVER CLIENTE — servidor, não `localStorage`.
   *
   * ★ A RECLAMAÇÃO DO BRUNO (24/08/2026) QUE ESTE BLOCO EXISTE PARA CONSERTAR:
   *   "acabei de perceber que é impossível editar clientes pelo front. não só na aba
   *    clientes mas na faturamento também. quero poder, toda vez que clicar em um cliente,
   *    editar ele."
   *
   * O que estava aqui antes: `db.cliAtivo`, um mapa CLIENTE → ligado/desligado no disco do
   * NAVEGADOR, e nada além dele. Nome, telefone, e-mail, CPF, canal e serviço habitual não
   * tinham caminho de escrita nenhum — nem local. É a mesma história de `svcEdit`, e com
   * dois campos que custam mais caro:
   *
   *   • `telefone` é a IDENTIDADE do cliente no WhatsApp (`telefone_chave`). Digitado
   *     errado, a MAISA trata cliente antigo como desconhecido, e só SQL consertava;
   *   • `cpf` é o que libera a nota. Sem ele o `emitiveis` tira a pessoa do lote de
   *     propósito, e a tela avisava "sem CPF" sem oferecer onde escrever o CPF.
   *
   * ── OTIMISTA, COALESCIDO, COM VOLTA ATRÁS ──
   *
   * Igual ao `mexerNoServico`, e pela mesma razão: a gaveta grava a cada tecla (não há
   * botão "Salvar"), então sem coalescer "Fernanda" seriam oito PUT e uma corrida em que a
   * resposta de "Fernan" chega depois e repinta o campo para trás. Junta por
   * `JANELA_AJUSTES` e manda UM pedido.
   *
   * ⚠️ O PUT MANDA SÓ O QUE MEXEU (mais `id`, `nome` e `telefone`, que a rota exige), e
   * isso NÃO É ECONOMIA DE BYTES. Dos 17 clientes que `008_seed_bruno.sql` semeia, 15 têm
   * CPF inventado que não fecha no módulo 11 — inclusive em produção. Um PUT com o cliente
   * inteiro carregaria esse CPF em toda escrita, e o `criarAjustarCliente` recusaria com
   * "esse CPF não fecha na conta do dígito" quem só queria desativar alguém ou corrigir um
   * nome. Quase todo o cadastro ficaria impossível de editar. Por isso `cliPendente` guarda
   * o PATCH junto do cliente: o patch diz o que enviar, o cliente diz o valor.
   *
   * ⚠️ E NÃO MANDA O QUE ESTÁ NO MEIO DA DIGITAÇÃO — ver `emDigitacao`. Sem isso, digitar
   * um CPF com uma pausa no meio dispararia um PUT com 6 dígitos, o servidor recusaria (com
   * razão), a volta atrás apagaria o que o dono estava escrevendo, e o campo se limparia
   * sozinho na cara dele. Um formulário sem botão "Salvar" tem que saber esperar o fim.
   * ────────────────────────────────────────────────────────────────────────────── */

  /**
   * Está no meio da digitação?
   *
   * ⚠️ NÃO É VALIDAÇÃO, e a diferença importa: quem julga continua sendo o servidor, e
   * campo COMPLETO e errado (CPF de onze dígitos que não fecha, e-mail com domínio
   * impossível) passa daqui e é recusado lá com a frase certa. O que esta função separa é
   * "está errado" de "ainda não acabou" — e só o segundo não merece ida ao servidor.
   */
  const emDigitacao = useCallback((c: D.Cliente, patch: Partial<D.Cliente>): boolean => {
    if (!c.nome.trim()) return true;
    /* Vazio é "sem telefone" (vale desde a 029); 1 a 7 dígitos é número pela metade. */
    const tel = soDigitos(c.telefone).length;
    if (tel > 0 && tel < TELEFONE_MIN_DIGITOS) return true;
    if ("cpf" in patch) {
      const d = soDigitos(c.cpf);
      /* Vazio é decisão ("não tenho o CPF dele"); 1 a 10 dígitos é meio caminho. */
      if (d.length > 0 && d.length < 11) return true;
    }
    if ("email" in patch && c.email.trim() !== "" && !emailPlausivel(c.email.trim())) return true;
    return false;
  }, []);

  /** O cliente como a tela o tem + quais campos opcionais mexeram. Um por id. */
  const cliPendente = useRef(new Map<string, { cliente: D.Cliente; patch: Partial<D.Cliente> }>());
  /** Como ele estava antes da primeira mexida pendente — para onde se volta se falhar. */
  const cliAntes = useRef(new Map<string, D.Cliente>());
  const cliTimer = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const trocarClienteNaTela = useCallback((id: string, novo: D.Cliente) => {
    setCadastro((c) => ({ ...c, clientes: c.clientes.map((x) => (x.id === id ? novo : x)) }));
  }, []);

  const [clientesGravados, setClientesGravados] = useState(0);
  const enviarCliente = useCallback(async (id: string) => {
    cliTimer.current.delete(id);
    const pendente = cliPendente.current.get(id);
    if (!pendente) return;

    /* ⚠️ A SAÍDA ANTECIPADA VEM ANTES DE LIMPAR OS MAPAS. Sair depois de esvaziá-los
     * perderia o acumulado e o "antes" — a próxima tecla começaria do zero, e a volta atrás
     * de uma falha posterior devolveria o valor errado. */
    const { cliente: alvo, patch } = pendente;
    if (emDigitacao(alvo, patch)) return;

    const antes = cliAntes.current.get(id);
    cliPendente.current.delete(id);
    cliAntes.current.delete(id);

    const voltar = () => { if (antes) trocarClienteNaTela(id, antes); };

    try {
      const r = await fetch("/api/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        /* `id`, `nome` e `telefone` sempre (a rota exige) + SÓ os opcionais que mexeram.
         * Ver o ⚠️ do cabeçalho: mandar o cliente inteiro faria o CPF semeado inválido
         * viajar em toda escrita e travar a edição de quase todo o cadastro.
         *
         * `atendimentos`, `valor` e `desde` não vão nunca: são derivados de `v_clientes`, e
         * mandá-los daria a impressão de que a tela decide quanto o cliente deve. `teste`
         * também não — é interruptor fiscal, não campo de ficha (ver a rota). */
        body: JSON.stringify({
          id: alvo.id, nome: alvo.nome, telefone: alvo.telefone,
          ...("email" in patch ? { email: alvo.email } : {}),
          ...("cpf" in patch ? { cpf: alvo.cpf } : {}),
          ...("canal" in patch ? { canal: alvo.canal } : {}),
          ...("servicoId" in patch ? { servicoId: alvo.servicoId } : {}),
          ...("ativo" in patch ? { ativo: alvo.ativo } : {}),
          ...("valorSessao" in patch ? { valorSessao: alvo.valorSessao ?? null } : {}),
        }),
      }).then((x) => x.json());

      if (!r?.ok) {
        /* A frase do SERVIDOR: "esse CPF não fecha na conta do dígito — confira os
         * números" é o que diz ao dono o que corrigir. Um genérico mandaria ele adivinhar,
         * e num campo de onze dígitos isso é caro. */
        voltar();
        toast(r?.info ?? "Não foi possível salvar o cliente.");
        return;
      }
      /* Pinta o que o BANCO gravou: o CPF volta mascarado e o e-mail vazio volta como `""`,
       * e a normalização acontece do outro lado. */
      if (r.cliente) trocarClienteNaTela(id, r.cliente);

      /* ⚠️ E RECARREGA O FATURAMENTO. `st.fechamento` monta `cpf`, `nome` e `semCpf` a
       * partir de `/api/faturamento`, não do cadastro — sem esta linha o dono digita o CPF,
       * vê o campo preenchido, e a tabela continua dizendo "sem CPF — não entra no lote".
       * Foi metade da reclamação: editar na aba Faturamento tem que MUDAR o faturamento. */
      void recarregarFaturamento();
      /* E a lista de recibos, pelo mesmo motivo, do lado da pessoa física (1C.10). */
      setClientesGravados((n) => n + 1);
    } catch {
      voltar();
      toast("Sem conexão com o servidor — o cliente não foi salvo.");
    }
  }, [trocarClienteNaTela, recarregarFaturamento, emDigitacao]);

  const mexerNoCliente = useCallback((id: string, p: Partial<D.Cliente>) => {
    setCadastro((c) => {
      const i = c.clientes.findIndex((x) => x.id === id);
      if (i < 0) return c;
      if (!cliAntes.current.has(id)) cliAntes.current.set(id, c.clientes[i]);
      const novo = { ...c.clientes[i], ...p };
      /* O patch ACUMULA entre teclas e entre campos: quem mexeu no CPF e depois no canal
       * manda os dois num pedido só. Zerá-lo aqui mandaria só o último, e o primeiro
       * ficaria na tela sem ter ido a lugar nenhum. */
      const anterior = cliPendente.current.get(id)?.patch ?? {};
      cliPendente.current.set(id, { cliente: novo, patch: { ...anterior, ...p } });
      const copia = [...c.clientes];
      copia[i] = novo;
      return { ...c, clientes: copia };
    });

    const t = cliTimer.current.get(id);
    if (t) clearTimeout(t);
    cliTimer.current.set(id, setTimeout(() => { void enviarCliente(id); }, JANELA_AJUSTES));
  }, [enviarCliente]);

  const editarCliente = useCallback((id: string, p: Partial<D.Cliente>) => {
    mexerNoCliente(id, p);
  }, [mexerNoCliente]);

  /* Espera o servidor antes de abrir a gaveta, pelo mesmo motivo do `criarServico`: o id
   * vem do banco, e editar uma linha de id inventado mandaria o PUT para ninguém. */
  const criarCliente = useCallback(async (c: { nome: string; telefone: string; cpf: string }) => {
    try {
      const r = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      }).then((x) => x.json());

      if (!r?.ok || !r.cliente) {
        toast(r?.info ?? "Não foi possível cadastrar o cliente.");
        return false;
      }
      const novo = r.cliente as D.Cliente;
      setCadastro((c) => (c.clientes.some((x) => x.id === novo.id)
        ? c
        : { ...c, clientes: [...c.clientes, novo] }));
      setSel(novo.id);
      toast(r.jaExistia
        ? `Esse telefone já é de ${novo.nome} — abri o cadastro dele`
        : "Cliente cadastrado");
      return true;
    } catch {
      toast("Sem conexão com o servidor — o cliente não foi cadastrado.");
      return false;
    }
  }, []);

  const alternarCli = useCallback((id: string) => {
    const atual = clienteDe(id);
    if (!atual) return;
    mexerNoCliente(id, { ativo: !atual.ativo });
  }, [clienteDe, mexerNoCliente]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * OS AJUSTES DA MAISA — servidor, não localStorage.
   *
   * O que a tela "A MAISA" edita é o PROMPT do agente. Enquanto isto morava no disco do
   * navegador, o dono escrevia o tom e a MAISA respondia no WhatsApp com a fixture
   * global — a mesma para todo inquilino. Agora entra por `GET /api/assistente`, sai por
   * `PATCH`, e o agente lê a MESMA linha (`composicao.ts`, `configuracaoDoAgente`).
   *
   * ── OTIMISTA, COALESCIDO, COM VOLTA ATRÁS ──
   *
   * A tela pinta na hora e o servidor é avisado depois, porque um toggle que espera a
   * rede parece quebrado. Mas otimismo sem volta atrás é mentira: se o PATCH falhar, o
   * estado volta ao que era ANTES da primeira mexida pendente — não ao valor anterior
   * daquele campo, que já não é o que o servidor tem.
   *
   * Coalescido porque digitar o nome dispara um evento por tecla. Sem juntar, "Aurora"
   * seriam seis PATCH, seis linhas de log e uma corrida em que a resposta de "Auro" pode
   * chegar depois da de "Aurora" e pintar a tela de volta. Junta-se por `JANELA_AJUSTES`
   * e manda-se UM patch com tudo que mudou.
   * ────────────────────────────────────────────────────────────────────────────── */

  const [ajustes, setAjustes] = useState(AJUSTES_PLACEHOLDER);
  const [ajustesErro, setAjustesErro] = useState<string | null>(null);
  const [ajustesPrecisaEntrar, setAjustesPrecisaEntrar] = useState(false);
  /** Sobe a cada "Tentar de novo" da faixa: é a dependência que faz o efeito de leitura rodar de novo. */
  const [releituraAjustes, setReleituraAjustes] = useState(0);
  const recarregarAjustes = useCallback(() => setReleituraAjustes((n) => n + 1), []);
  const [ajustesCarregados, setAjustesCarregados] = useState(false);

  /* ── O SINAL DE GRAVAÇÃO (1A.8) ──
   * Só observa: acende "em voo" no primeiro toque de uma rajada e apaga quando a resposta
   * volta sem nada pendente atrás dela. A falha guarda o motivo E o pedaço recusado, para o
   * "Tentar de novo" reaplicar a mesma mudança (a volta atrás já tirou ela da tela). */
  const [emVoo, setEmVoo] = useState<Partial<Record<RecursoGravado, boolean>>>({});
  const [falhasDeGravacao, setFalhasDeGravacao] = useState<Partial<Record<RecursoGravado, string>>>({});
  const recusado = useRef<{
    ajustes?: { assistente?: Partial<Assistente>; cfg?: Partial<Record<D.ChaveCfg, boolean>> };
    semana?: D.SemanaAnunciada;
    nome?: string;
  }>({});
  const marcarVoo = useCallback((r: RecursoGravado, v: boolean) => {
    setEmVoo((a) => (Boolean(a[r]) === v ? a : { ...a, [r]: v }));
    if (v) setFalhasDeGravacao((f) => (f[r] ? { ...f, [r]: undefined } : f));
  }, []);
  const registrarFalha = useCallback((r: RecursoGravado, motivo: string) => {
    setFalhasDeGravacao((f) => ({ ...f, [r]: motivo }));
  }, []);

  /** O patch que ainda não foi para o servidor, acumulado entre teclas. */
  const ajustesPendentes = useRef<{ assistente?: Partial<Assistente>; cfg?: Partial<Record<D.ChaveCfg, boolean>> }>({});
  /** O estado ANTES da primeira mexida pendente. É para onde se volta se o PATCH falhar. */
  const ajustesAntes = useRef<typeof AJUSTES_PLACEHOLDER | null>(null);
  const ajustesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Depois da hidratação, não antes: a hidratação sobrescreve `db` com o disco, e um
   * efeito que corresse em paralelo poderia ter a resposta do servidor descartada por
   * ela. Aqui os dois não competem — `assistente` e `cfg` nem existem mais em `db`. */
  useEffect(() => {
    if (!hidratado) return;
    let vivo = true;

    void (async () => {
      try {
        const r = await fetch("/api/assistente").then((x) => x.json());
        if (!vivo) return;
        if (!r?.ok) {
          /* Mantém o placeholder na tela e acende o aviso, como `/api/cadastro` faz.
           * Zerar aqui deixaria a tela de ajustes em branco, sintoma que não aponta para
           * "não carregou". */
          setAjustesErro(MOTIVO_AJUSTES[r?.status] ?? MOTIVO_AJUSTES.carregar);
          setAjustesPrecisaEntrar(r?.status === "nao_autenticado" || r?.status === "login_necessario");
          return;
        }
        setAjustes({ assistente: r.assistente, cfg: r.cfg });
        setAjustesErro(null);
        setAjustesPrecisaEntrar(false);
        setAjustesCarregados(true);
      } catch {
        if (vivo) { setAjustesErro(MOTIVO_AJUSTES.carregar); setAjustesPrecisaEntrar(false); }
      }
    })();

    return () => { vivo = false; };
  }, [hidratado, releituraAjustes]);

  const enviarAjustes = useCallback(async () => {
    const corpo = ajustesPendentes.current;
    const antes = ajustesAntes.current;
    ajustesPendentes.current = {};
    ajustesAntes.current = null;
    if (!corpo.assistente && !corpo.cfg) { marcarVoo("ajustes", false); return; }
    /* Outra rajada começou enquanto esta viajava? O sinal fica aceso até a última voltar. */
    const soEsta = () => { if (!ajustesPendentes.current.assistente && !ajustesPendentes.current.cfg) marcarVoo("ajustes", false); };

    try {
      const r = await fetch("/api/assistente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json());

      if (!r?.ok) {
        if (antes) setAjustes(antes);
        /* O toast repete o MOTIVO, não um genérico. Foi assim que o primeiro teste real
         * quase virou caça ao fantasma: o servidor respondia 409 `sem_negocio`, a frase
         * certa ficava guardada em `ajustesErro` e a tela dizia só "não foi possível
         * salvar" — mandando procurar defeito na edição quando o problema era que a conta
         * não tinha negócio. */
        const motivo = MOTIVO_AJUSTES[r?.status] ?? r?.info ?? MOTIVO_AJUSTES.salvar;
        setAjustesErro(motivo);
        toast(motivo);
        recusado.current.ajustes = corpo;
        registrarFalha("ajustes", motivo);
        soEsta();
        return;
      }

      /* Pinta com o que o BANCO gravou, não com o que foi mandado: normalização (espaço
       * colapsado no nome) e saudação vazia virando nada acontecem lá. Sem isto, a tela
       * mostraria "Aurora  Bot" e o agente usaria "Aurora Bot". */
      setAjustes({ assistente: r.assistente, cfg: r.cfg });
      setAjustesErro(null);
      setSalvo(true);
      agendar(() => setSalvo(false), 2200);
      recusado.current.ajustes = undefined;
      soEsta();
    } catch {
      if (antes) setAjustes(antes);
      setAjustesErro(MOTIVO_AJUSTES.salvar);
      toast(MOTIVO_AJUSTES.salvar);
      recusado.current.ajustes = corpo;
      registrarFalha("ajustes", MOTIVO_AJUSTES.salvar);
      soEsta();
    }
  }, [agendar, toast, marcarVoo, registrarFalha]);

  /** Aplica na tela agora e agenda o envio, juntando com o que já estava pendente. */
  const mexerNosAjustes = useCallback((
    p: { assistente?: Partial<Assistente>; cfg?: Partial<Record<D.ChaveCfg, boolean>> },
  ) => {
    setAjustes((a) => {
      /* A foto para a volta atrás é tirada UMA vez por rajada, aqui dentro do updater,
       * onde `a` é garantidamente o estado corrente. Tirá-la fora leria um `ajustes` de
       * closure que pode estar uma tecla atrasado. */
      if (!ajustesAntes.current) ajustesAntes.current = a;
      return {
        assistente: { ...a.assistente, ...(p.assistente ?? {}) },
        cfg: { ...a.cfg, ...(p.cfg ?? {}) },
      };
    });

    ajustesPendentes.current = {
      assistente: { ...ajustesPendentes.current.assistente, ...(p.assistente ?? {}) },
      cfg: { ...ajustesPendentes.current.cfg, ...(p.cfg ?? {}) },
    };
    if (!Object.keys(ajustesPendentes.current.assistente ?? {}).length) delete ajustesPendentes.current.assistente;
    if (!Object.keys(ajustesPendentes.current.cfg ?? {}).length) delete ajustesPendentes.current.cfg;

    marcarVoo("ajustes", true);
    if (ajustesTimer.current) clearTimeout(ajustesTimer.current);
    ajustesTimer.current = setTimeout(() => { void enviarAjustes(); }, JANELA_AJUSTES);
  }, [enviarAjustes, marcarVoo]);

  /* Sai da tela com tecla pendente? Manda antes de morrer. `clearTimeout` sozinho
   * perderia a última palavra digitada — o caso mais comum de todos. */
  useEffect(() => () => {
    if (ajustesTimer.current) {
      clearTimeout(ajustesTimer.current);
      void enviarAjustes();
    }
  }, [enviarAjustes]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * O HORÁRIO ANUNCIADO — a terceira coisa a sair do `localStorage`.
   *
   * O comentário de `Persistido` dizia, sobre `dias`: "exceção consciente, não
   * esquecimento — tem tabela e ainda não tem porta. Enquanto não tiver, é preferência de
   * tela, e some se o dono trocar de aparelho, que é a dívida honesta a pagar depois".
   * Esta é a hora de pagar. Era pior que perder no aparelho: a MAISA respondia "que horas
   * vocês atendem?" com o expediente do PROFISSIONAL, que é outro dado.
   *
   * ── PUT DA SEMANA INTEIRA, E NÃO PATCH DO DIA ──
   *
   * Diferente dos ajustes acima. Não é gosto: "quando abrimos" é uma GRADE, e mandar
   * sábado sozinho abriria a pergunta "e a quarta que a outra aba mexeu?". Semana
   * completa faz duas telas convergirem para a última que salvou, em vez de produzirem
   * uma semana que nunca existiu em nenhuma das duas. Ver `aplicacao/horarios.ts`.
   *
   * A coalescência continua valendo, e aqui ela vale MAIS: arrastar o relógio de um
   * `<input type="time">` dispara um `onChange` por minuto. Sem a janela, seria uma
   * requisição por minuto arrastado.
   * ────────────────────────────────────────────────────────────────────────────── */

  const [semana, setSemana] = useState<D.SemanaAnunciada>(SEMANA_PLACEHOLDER);
  const [semanaErro, setSemanaErro] = useState<string | null>(null);
  const [semanaCarregada, setSemanaCarregada] = useState(false);
  const semanaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A foto de antes da rajada, para a volta atrás. Mesma mecânica de `ajustesAntes`. */
  const semanaAntes = useRef<D.SemanaAnunciada | null>(null);
  /** A grade que ainda não foi mandada. Existe para o desmonte ter o que enviar. */
  const semanaPendente = useRef<D.SemanaAnunciada | null>(null);

  useEffect(() => {
    if (!hidratado) return;
    let vivo = true;

    void (async () => {
      try {
        const r = await fetch("/api/horarios").then((x) => x.json());
        if (!vivo) return;
        if (!r?.ok) {
          setSemanaErro(MOTIVO_HORARIOS[r?.status] ?? MOTIVO_HORARIOS.carregar);
          return;
        }
        setSemana(r.semana);
        setSemanaErro(null);
        setSemanaCarregada(true);
      } catch {
        if (vivo) setSemanaErro(MOTIVO_HORARIOS.carregar);
      }
    })();

    return () => { vivo = false; };
  }, [hidratado]);

  const enviarSemana = useCallback(async (corpo: D.SemanaAnunciada) => {
    const antes = semanaAntes.current;
    semanaAntes.current = null;
    semanaPendente.current = null;
    const soEsta = () => { if (!semanaPendente.current) marcarVoo("semana", false); };

    try {
      const r = await fetch("/api/horarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json());

      if (!r?.ok) {
        if (antes) setSemana(antes);
        /* `info` antes do genérico: as recusas daqui são específicas e acionáveis
         * ("Sábado: o fechamento tem que ser depois da abertura"), e trocá-las por "não
         * foi possível salvar" esconderia exatamente o que o dono precisa corrigir. */
        const motivo = r?.info ?? MOTIVO_HORARIOS[r?.status] ?? MOTIVO_HORARIOS.salvar;
        setSemanaErro(motivo);
        toast(motivo);
        recusado.current.semana = corpo;
        registrarFalha("semana", motivo);
        soEsta();
        return;
      }

      /* Pinta com o que o banco gravou: dia fechado volta com `de`/`ate` em `null`, e a
       * tela precisa ver isso para não reexibir a hora de um dia que fechou. */
      setSemana(r.semana);
      setSemanaErro(null);
      setSalvo(true);
      agendar(() => setSalvo(false), 2200);
      recusado.current.semana = undefined;
      soEsta();
    } catch {
      if (antes) setSemana(antes);
      setSemanaErro(MOTIVO_HORARIOS.salvar);
      recusado.current.semana = corpo;
      registrarFalha("semana", MOTIVO_HORARIOS.salvar);
      soEsta();
    }
  }, [agendar, toast, marcarVoo, registrarFalha]);

  /** Aplica na tela agora e agenda o envio da semana inteira. */
  const mexerNaSemana = useCallback((f: (s: D.SemanaAnunciada) => D.SemanaAnunciada) => {
    marcarVoo("semana", true);
    setSemana((s) => {
      if (!semanaAntes.current) semanaAntes.current = s;
      const nova = f(s);
      semanaPendente.current = nova;
      if (semanaTimer.current) clearTimeout(semanaTimer.current);
      /* O corpo é montado AQUI DENTRO, com o estado novo em mãos. Montá-lo fora leria um
       * `semana` de closure que pode estar um clique atrasado — e como aqui se manda a
       * grade completa, um clique atrasado significa mandar de volta o dia que acabou de
       * mudar, desfazendo silenciosamente o que o dono fez. */
      semanaTimer.current = setTimeout(() => { void enviarSemana(nova); }, JANELA_AJUSTES);
      return nova;
    });
  }, [enviarSemana, marcarVoo]);

  const alternarDia = useCallback((dow: number) => {
    mexerNaSemana((s) => s.map((d) => {
      if (d.dow !== dow) return d;
      const aberto = !d.aberto;
      /* Ao reabrir, repõe um horário válido: o domínio zera as horas de dia fechado, e um
       * `<input type="time">` que recebe `null` fica em branco sem dizer por quê. */
      return aberto
        ? { ...d, aberto, de: d.de ?? "09:00", ate: d.ate ?? "18:00" }
        : { ...d, aberto, de: null, ate: null };
    }));
  }, [mexerNaSemana]);

  const setHorario = useCallback((dow: number, campo: "de" | "ate", valor: string) => {
    mexerNaSemana((s) => s.map((d) => (d.dow === dow ? { ...d, [campo]: valor } : d)));
  }, [mexerNaSemana]);

  /* Mesma rede de segurança dos ajustes: sair da tela com o relógio mexido manda antes
   * de morrer, em vez de perder a última alteração. */
  useEffect(() => () => {
    if (semanaTimer.current) {
      clearTimeout(semanaTimer.current);
      if (semanaPendente.current) void enviarSemana(semanaPendente.current);
    }
  }, [enviarSemana]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * O CANAL DE WHATSAPP — conectar, trocar número, desconectar.
   *
   * ── POR QUE "TROCAR NÚMERO" É DESCONECTAR + CONECTAR, E NÃO UM BOTÃO SÓ ──
   *
   * `POST /api/canal` se RECUSA a recriar quando o canal já está conectado: recriar ali
   * derrubaria o WhatsApp de um negócio que está atendendo, por causa de um clique. Essa
   * recusa é proposital e fica no servidor, onde nenhuma tela pode contorná-la.
   *
   * A consequência é que trocar de número exige dizer que se quer perder o atual. Então a
   * tela faz os dois passos, com confirmação no meio. Um botão só, "esperto", teria que
   * mandar um `forçar: true` — e aí a proteção viraria enfeite.
   *
   * ── O POLLING ──
   *
   * Parear é assíncrono e o único aviso é o WhatsApp do cliente conectando. Sem polling, a
   * tela ficaria em "pareando" para sempre e o dono acharia que falhou. Ele PARA sozinho:
   * ao conectar, ao sair da tela, e depois de `TENTATIVAS_PAREAMENTO` — QR expira, e um
   * intervalo que roda para sempre num painel aberto o dia inteiro é bateria e requisição
   * queimadas por nada.
   * ────────────────────────────────────────────────────────────────────────────── */

  const [canal, setCanal] = useState<Canal | null>(null);
  const [canalErro, setCanalErro] = useState<string | null>(null);
  const [canalOcupado, setCanalOcupado] = useState(false);
  /** O que falta no SERVIDOR para conseguir conectar. Vazio = dá para conectar.
   *  Enquanto tiver item, a tela não deixa derrubar o canal que já está de pé. */
  const [canalFaltando, setCanalFaltando] = useState<string[]>([]);
  /** O QR do pareamento em curso. `null` = não há pareamento na tela. */
  const [qrcode, setQrcode] = useState<string | null>(null);
  /** Os 8 caracteres, quando o pareamento em curso é por código. */
  const [codigo, setCodigo] = useState<string | null>(null);
  /**
   * O telefone DESTE pareamento, e quantas vezes o código já se renovou.
   *
   * ⚠️ EM `useRef`, NUNCA EM DISCO. É o mesmo número que o dono digitou para receber o
   * código, e a regra do produto é que ele seja insumo e morra com o pareamento — quem
   * grava número é o `ownerJid` do provedor, depois de conectar. Guardar aqui é o mínimo
   * para conseguir pedir OUTRO código sem obrigar a redigitar, e some no F5 junto com o
   * resto do pareamento (que também não sobrevive, porque o código já teria vencido).
   *
   * `ref` e não `state`: nenhuma tela desenha isto, e num `state` cada renovação
   * repintaria a faixa inteira por um dado que ninguém lê.
   */
  const numeroDoPareamento = useRef<string | null>(null);
  const renovacoes = useRef(0);
  const pollCanal = useRef<ReturnType<typeof setInterval> | null>(null);

  /** O mesmo valor do `ref` acima, desenhável. Os dois mudam juntos — ver `limparPareamento`. */
  const [numeroPareando, setNumeroPareando] = useState<string | null>(null);

  /* ── AS DUAS TRAVAS DO POLLING, E O RELATO QUE AS CRIOU (18/08/2026) ──
   *
   * *"Quando conectou o WhatsApp, veio mil mensagens de que ele conectou."*
   *
   * Não era o toast sendo chamado num laço: era o `setInterval` de 3s abrindo requisições
   * mais rápido do que elas voltam. `GET /api/canal` pergunta o estado AO PROVEDOR — é o
   * `lerCanal` fazendo a tela não mentir — e essa ida à Evolution passa de 3s sem esforço.
   * Resultado: dez, vinte chamadas em voo ao mesmo tempo. No instante em que o WhatsApp
   * conecta, TODAS voltam com `conectado`, e cada uma executa o mesmo bloco de sucesso.
   *
   * `pararPolling()` não salva: ele cancela os tiques FUTUROS e não tem como cancelar o que
   * já está no ar.
   *
   * `pollEmVoo` impede o empilhamento (uma requisição por vez, sempre). `jaAvisou` garante
   * que o aviso de sucesso é único mesmo que algo volte a se empilhar por outro caminho —
   * duas travas porque o custo de errar aqui é a primeira impressão do cliente, e a segunda
   * é uma linha. */
  const pollEmVoo = useRef(false);
  const jaAvisou = useRef(false);

  const pararPolling = useCallback(() => {
    if (pollCanal.current) { clearInterval(pollCanal.current); pollCanal.current = null; }
  }, []);

  /* Os dois somem SEMPRE JUNTOS, e é por isso que existe uma função em vez de duas
   * chamadas soltas. Esquecer uma delas num dos cinco pontos de limpeza deixaria na tela
   * um código morto ao lado de um QR vivo — e o dono digitaria o código. */
  const limparPareamento = useCallback(() => {
    setQrcode(null);
    setCodigo(null);
    numeroDoPareamento.current = null;
    setNumeroPareando(null);
    renovacoes.current = 0;
  }, []);

  const buscarCanal = useCallback(async (): Promise<Canal | null> => {
    try {
      const r = await fetch("/api/canal").then((x) => x.json());
      if (!r?.ok) { setCanalErro(motivoCanal(r, MOTIVO_CANAL.ler)); return null; }
      setCanal(r.canal);
      setCanalFaltando(r.faltando ?? []);
      setCanalErro(null);
      return r.canal as Canal;
    } catch {
      setCanalErro(MOTIVO_CANAL.ler);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    let vivo = true;
    void (async () => { if (vivo) await buscarCanal(); })();
    return () => { vivo = false; };
  }, [hidratado, buscarCanal]);

  /* ⚠️ A leitura do canal que FALHOU (`canal` nulo com `canalErro`) entra como
   * `"desconectado"`, nunca como "ainda não sei": sem prova de conexão, a tela diz que não
   * está no ar. E o interruptor só conta depois de voltar do servidor: antes disso ele é o
   * placeholder de primeira pintura, e o placeholder diz `ativa: true`. */
  const recarregarCanal = useCallback(() => {
    setCanalErro(null);
    void buscarCanal();
  }, [buscarCanal]);

  const statusMaisa = statusDaMaisa({
    ativa: ajustesCarregados ? ajustes.assistente.ativa : null,
    canal: canal ? canal.status : canalErro ? "desconectado" : null,
  });

  /* `porCodigo` só existe para a FRASE do fim do prazo: "expirou sem ninguém escanear" é
   * instrução errada para quem nunca teve o que escanear, e mandar procurar a câmera é o
   * jeito mais rápido de perder alguém que estava a um passo de conectar. */
  const iniciarPolling = useCallback((porCodigo = false) => {
    pararPolling();
    let tentativas = 0;
    /* Pareamento novo, aviso novo. Sem isto, um segundo pareamento na mesma sessão de painel
     * conectaria em silêncio. */
    jaAvisou.current = false;
    pollCanal.current = setInterval(() => {
      /* Ver o cabeçalho das travas: sem esta linha as chamadas se empilham e o sucesso é
       * executado uma vez por chamada em voo. */
      if (pollEmVoo.current) return;
      tentativas++;
      void (async () => {
        pollEmVoo.current = true;
        const c = await buscarCanal().finally(() => { pollEmVoo.current = false; });
        if (c?.status === "conectado") {
          pararPolling();
          /* Some no instante em que conecta. Deixar na tela convidaria a apontar a câmera
           * (ou digitar) de novo para um código morto — e o cliente concluiria que não
           * funcionou justo depois de ter funcionado. */
          limparPareamento();
          if (!jaAvisou.current) { jaAvisou.current = true; toast("WhatsApp conectado"); }
        } else if (tentativas >= TENTATIVAS_PAREAMENTO) {
          pararPolling();
          limparPareamento();
          setCanalErro(
            porCodigo
              ? "O código expirou sem ninguém digitar. Clique em conectar para gerar outro."
              : "O QR expirou sem ninguém escanear. Clique em conectar para gerar outro.",
          );
        }
      })();
    }, INTERVALO_PAREAMENTO);
  }, [buscarCanal, limparPareamento, pararPolling, toast]);

  /* Sair da tela para o polling. Sem isto, um painel aberto numa aba esquecida continuaria
   * batendo na rota para sempre. */
  useEffect(() => () => pararPolling(), [pararPolling]);

  const conectarCanal = useCallback(async (p?: { numero?: string }) => {
    setCanalOcupado(true);
    setCanalErro(null);
    try {
      const r = await fetch("/api/canal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Manda o corpo sempre, mesmo vazio: a rota tolera os dois, e um único formato de
         * chamada é uma variável a menos quando alguém for depurar por que o código não
         * chegou. */
        body: JSON.stringify({ numero: p?.numero ?? undefined }),
      }).then((x) => x.json());
      if (!r?.ok) {
        setCanalErro(motivoCanal(r, MOTIVO_CANAL.conectar));
        /* Reaproveita a lista do erro como estado da tela: se conectar falhou por
         * configuração, os botões destrutivos têm que travar AGORA, não no próximo GET. */
        if (r?.faltando?.length) setCanalFaltando(r.faltando);
        return;
      }
      setQrcode(r.pareamento?.qrcode ?? null);
      setCodigo(r.pareamento?.codigo ?? null);
      /* Guarda o número DESTE pareamento para conseguir renovar sem redigitar. Zera as
       * renovações junto: começou pareamento novo, começou orçamento novo. */
      numeroDoPareamento.current = p?.numero?.trim() || null;
      setNumeroPareando(numeroDoPareamento.current);
      renovacoes.current = 0;

      /* ⚠️ PEDIU CÓDIGO E VEIO SÓ QR. Acontece de verdade — o pairing code depende da
       * versão do Baileys do servidor e falha calado. Sem este aviso, o dono digitaria o
       * telefone, veria um QR aparecer e concluiria que o app ignorou o que ele pediu.
       * A tela continua utilizável: o QR está ali, e quem tem um segundo aparelho segue. */
      if (p?.numero && !r.pareamento?.codigo && r.pareamento?.status !== "conectado") {
        setCanalErro(
          "Este servidor não conseguiu gerar o código de 8 dígitos agora. " +
            "Dá para conectar lendo o QR de outro aparelho, ou tentar de novo.",
        );
      }

      await buscarCanal();
      if (r.pareamento?.status !== "conectado") iniciarPolling(!!r.pareamento?.codigo);
    } catch {
      setCanalErro(MOTIVO_CANAL.conectar);
    } finally {
      setCanalOcupado(false);
    }
  }, [buscarCanal, iniciarPolling]);

  /**
   * Outro código, sem derrubar o pareamento. Disparada pelo contador da tela, não por
   * clique — por isso ela é silenciosa no caminho feliz e só fala quando desiste.
   */
  const renovarCodigo = useCallback(async () => {
    const numero = numeroDoPareamento.current;
    /* Sem número guardado não há o que renovar: ou o pareamento é por QR, ou a tela foi
     * recarregada. Nos dois casos, insistir mandaria string vazia ao provedor. */
    if (!numero) return;

    if (renovacoes.current >= MAX_RENOVACOES_CODIGO) {
      pararPolling();
      limparPareamento();
      setCanalErro(
        "Passou do tempo de conectar. Clique em conectar de novo para receber um código novo.",
      );
      return;
    }
    renovacoes.current += 1;

    try {
      const r = await fetch("/api/canal/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero }),
      }).then((x) => x.json());

      /* `codigo: null` chega com `ok: true` — é "não consegui emitir outro agora", não
       * falha da requisição. A instância segue de pé e o QR segue válido, então a saída é
       * oferecer o outro caminho em vez de acender erro sobre um pareamento que respira. */
      if (!r?.ok || !r.codigo) {
        setCanalErro(
          "Não consegui gerar um código novo. Leia o QR de outro aparelho, ou clique em conectar para recomeçar.",
        );
        return;
      }

      setCodigo(r.codigo);
      setCanalErro(null);
      /* Reinicia o relógio do polling junto com o código. Sem isto, `TENTATIVAS_PAREAMENTO`
       * (≈2min) mataria a consulta enquanto o código continua se renovando — a tela pararia
       * de perceber a conexão que acabou de acontecer. */
      iniciarPolling(true);
    } catch {
      setCanalErro("Sem conexão com o servidor para renovar o código.");
    }
  }, [iniciarPolling, limparPareamento, pararPolling]);

  const desconectarCanal = useCallback(async () => {
    setCanalOcupado(true);
    setCanalErro(null);
    pararPolling();
    limparPareamento();
    try {
      const r = await fetch("/api/canal", { method: "DELETE" }).then((x) => x.json());
      if (!r?.ok) { setCanalErro(motivoCanal(r, MOTIVO_CANAL.desconectar)); return; }
      await buscarCanal();
      toast("WhatsApp desconectado");
    } catch {
      setCanalErro(MOTIVO_CANAL.desconectar);
    } finally {
      setCanalOcupado(false);
    }
  }, [buscarCanal, limparPareamento, pararPolling, toast]);

  /**
   * Desconecta e já pede o QR novo. Ver o cabeçalho para por que não é um botão só.
   *
   * ⚠️ A GUARDA É O CORAÇÃO DESTA FUNÇÃO, não um detalhe defensivo.
   *
   * Em 13/08/2026 isto rodou com `MAISA_PUBLIC_URL` ausente na Vercel: o `desconectar`
   * apagou a instância na Evolution, o `conectar` seguinte morreu montando a URL do
   * webhook, e o WhatsApp do negócio ficou fora do ar — sem ninguém ter escolhido isso.
   *
   * Os dois passos não são atômicos e não dá para fazê-los atômicos: quem apaga a
   * instância é outro servidor. O que dá é NÃO COMEÇAR quando já se sabe que o segundo
   * passo não termina. É por isso que `GET /api/canal` devolve `faltando`.
   */
  /**
   * Grava quem recebe a escalação. Devolve se deu certo, para a tela poder confirmar.
   *
   * Sem `canalOcupado`: este campo é independente do pareamento, e travar os botões de
   * conectar enquanto alguém digita um telefone faria a tela parecer quebrada.
   */
  const definirDonoDoCanal = useCallback(async (telefone: string): Promise<boolean> => {
    setCanalErro(null);
    try {
      const r = await fetch("/api/canal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefoneDono: telefone }),
      }).then((x) => x.json());

      if (!r?.ok) {
        setCanalErro(motivoCanal(r, "Não foi possível salvar o WhatsApp do dono."));
        return false;
      }
      /* Relê para a faixa mostrar o número JÁ NORMALIZADO pelo núcleo — o dono digita com
       * máscara e o que fica gravado é E.164. Sem a releitura a tela mostraria a máscara e
       * o banco outra coisa, e a próxima abertura pareceria ter perdido a edição. */
      await buscarCanal();
      return true;
    } catch {
      setCanalErro("Sem conexão com o servidor para salvar o WhatsApp do dono.");
      return false;
    }
  }, [buscarCanal]);

  const trocarNumero = useCallback(async (p?: { numero?: string }) => {
    if (canalFaltando.length) {
      setCanalErro(
        `Não dá para trocar o número agora: o servidor não conseguiria reconectar. ` +
          `Falta: ${canalFaltando.join(", ")}. O WhatsApp atual continua conectado.`,
      );
      return;
    }
    await desconectarCanal();
    /* Repassa o `numero` — trocar de número no celular tem o MESMO problema de câmera que
     * conectar pela primeira vez, e é onde ele mais dói: aqui o canal já foi derrubado.
     * Perder o parâmetro no caminho deixaria o dono num QR ilegível com o WhatsApp do
     * negócio já fora do ar. */
    await conectarCanal(p);
  }, [canalFaltando, conectarCanal, desconectarCanal]);

  const setAssistente = useCallback((p: Partial<Assistente>) => {
    mexerNosAjustes({ assistente: p });
  }, [mexerNosAjustes]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * O NOME DO NEGÓCIO — a mesma mecânica dos ajustes, num campo só.
   *
   * Debounce próprio, e não o `mexerNosAjustes` acima, porque são DOIS recursos: os
   * ajustes vão para `PATCH /api/assistente` e o nome vai para `PATCH /api/negocio`.
   * Juntá-los num timer só faria uma tecla no nome do negócio reenviar a saudação inteira.
   *
   * ⚠️ Este campo não é cosmético: ele entra no prompt do agente a cada mensagem
   * ("sou a assistente de ___") e no texto de todo lembrete. Até 14/08/2026 NENHUMA tela
   * o escrevia, e um negócio de teste passou três dias chamado `bruno.vaskevicius` — o
   * nome saiu no primeiro lembrete de verdade que chegou num celular.
   * ────────────────────────────────────────────────────────────────────────────── */
  const nomeAntes = useRef<string | null>(null);
  const nomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enviarNomeDoNegocio = useCallback(async (nome: string) => {
    const antes = nomeAntes.current;
    nomeAntes.current = null;
    const soEsta = () => { if (nomeAntes.current === null) marcarVoo("nome", false); };

    try {
      const r = await fetch("/api/negocio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      }).then((x) => x.json());

      if (!r?.ok) {
        /* Volta ao nome anterior E diz o motivo do servidor. O campo fica no rail e no
         * WhatsApp do cliente: deixar na tela um nome que o banco recusou faria o dono
         * acreditar num nome que a MAISA nunca vai usar. */
        if (antes !== null) setCadastro((c) => ({ ...c, negocio: { ...c.negocio, nome: antes } }));
        toast(r?.info ?? "Não foi possível salvar o nome do negócio.");
        recusado.current.nome = nome;
        registrarFalha("nome", r?.info ?? "Não foi possível salvar o nome do negócio.");
        soEsta();
        return;
      }

      /* Pinta o que o BANCO gravou — a normalização (espaço colapsado) acontece lá. */
      setCadastro((c) => ({ ...c, negocio: r.negocio ?? c.negocio }));
      setSalvo(true);
      agendar(() => setSalvo(false), 2200);
      recusado.current.nome = undefined;
      soEsta();
    } catch {
      if (antes !== null) setCadastro((c) => ({ ...c, negocio: { ...c.negocio, nome: antes } }));
      toast("Não foi possível salvar o nome do negócio.");
      recusado.current.nome = nome;
      registrarFalha("nome", "Não foi possível salvar o nome do negócio.");
      soEsta();
    }
  }, [agendar, marcarVoo, registrarFalha]);

  /* ─────────────────────────────────────────────────────────────────────────────
   * AS DÚVIDAS FREQUENTES.
   *
   * Sem placeholder de fixture, ao contrário do cadastro: uma FAQ inventada na tela seria
   * indistinguível de uma que o dono cadastrou, e ele a deixaria lá achando que é dele. A
   * lista começa VAZIA e a frase de vazio convida a escrever a primeira.
   * ────────────────────────────────────────────────────────────────────────────── */
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqsErro, setFaqsErro] = useState<string | null>(null);
  const [faqsOcupado, setFaqsOcupado] = useState(false);

  useEffect(() => {
    if (!hidratado) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/faqs").then((x) => x.json());
        if (!vivo) return;
        if (!r?.ok) { setFaqsErro(r?.info ?? "Não foi possível carregar as dúvidas."); return; }
        setFaqs(r.faqs ?? []);
        setFaqsErro(null);
      } catch {
        if (vivo) setFaqsErro("Não foi possível carregar as dúvidas.");
      }
    })();
    return () => { vivo = false; };
  }, [hidratado]);

  const salvarFaq = useCallback(async (p: { id?: string; pergunta: string; resposta: string }) => {
    setFaqsOcupado(true);
    try {
      const r = await fetch("/api/faqs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }).then((x) => x.json());

      if (!r?.ok) {
        /* A frase do SERVIDOR, não um genérico. Os limites de tamanho e o campo em branco
         * têm mensagens próprias no caso de uso, e é isso que diz ao dono o que corrigir. */
        const motivo = r?.info ?? "Não foi possível salvar.";
        setFaqsErro(motivo);
        toast(motivo);
        return false;
      }

      /* Substitui a linha editada ou acrescenta a nova — pinta o que o BANCO devolveu, que
       * é onde a normalização aconteceu. Uma segunda ida ao servidor para reler a lista
       * inteira seria um piscar por uma informação que já veio na resposta. */
      setFaqs((atual) => {
        const i = atual.findIndex((f) => f.id === r.faq.id);
        if (i < 0) return [...atual, r.faq];
        const copia = [...atual];
        copia[i] = r.faq;
        return copia;
      });
      setFaqsErro(null);
      setSalvo(true);
      agendar(() => setSalvo(false), 2200);
      return true;
    } catch {
      setFaqsErro("Sem conexão com o servidor — nada mudou.");
      return false;
    } finally {
      setFaqsOcupado(false);
    }
  }, [agendar]);

  const removerFaq = useCallback(async (id: string) => {
    /* Tira da tela primeiro e devolve se o servidor recusar: apagar é a ação em que a
     * espera mais incomoda, e o custo de errar é baixo — a linha volta. */
    const antes = faqs;
    setFaqs((atual) => atual.filter((f) => f.id !== id));
    try {
      const r = await fetch(`/api/faqs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((x) => x.json());
      if (!r?.ok) { setFaqs(antes); toast(r?.info ?? "Não foi possível apagar."); }
    } catch {
      setFaqs(antes);
      toast("Sem conexão com o servidor — nada mudou.");
    }
  }, [faqs]);

  const setNomeDoNegocio = useCallback((nome: string) => {
    setCadastro((c) => {
      /* A foto para a volta atrás é tirada UMA vez por rajada, dentro do updater, onde o
       * estado é garantidamente o corrente — mesma razão do `mexerNosAjustes`. */
      if (nomeAntes.current === null) nomeAntes.current = c.negocio.nome;
      return { ...c, negocio: { ...c.negocio, nome } };
    });

    marcarVoo("nome", true);
    if (nomeTimer.current) clearTimeout(nomeTimer.current);
    nomeTimer.current = setTimeout(() => { void enviarNomeDoNegocio(nome); }, JANELA_AJUSTES);
  }, [enviarNomeDoNegocio, marcarVoo]);

  const alternarCfg = useCallback((chave: D.ChaveCfg) => {
    marcarVoo("ajustes", true);
    /* Lê do estado dentro do updater, e não da closure, porque duas batidas rápidas no
     * mesmo toggle precisam ver a primeira já aplicada — senão a segunda manda o mesmo
     * valor e o switch fica preso. */
    setAjustes((a) => {
      if (!ajustesAntes.current) ajustesAntes.current = a;
      const valor = !a.cfg[chave];
      ajustesPendentes.current.cfg = { ...ajustesPendentes.current.cfg, [chave]: valor };
      if (ajustesTimer.current) clearTimeout(ajustesTimer.current);
      ajustesTimer.current = setTimeout(() => { void enviarAjustes(); }, JANELA_AJUSTES);
      return { ...a, cfg: { ...a.cfg, [chave]: valor } };
    });
  }, [enviarAjustes, marcarVoo]);

  /**
   * O botão "Salvar" da tela de ajustes.
   *
   * Antes ele só acendia um "salvo" por 2,2s — não gravava nada, porque não havia onde
   * gravar. Agora ele FORÇA o envio do que estiver pendente, em vez de esperar a janela
   * de debounce fechar. Quem clica em salvar quer certeza agora; e o "salvo" passou a
   * ser aceso pela resposta do servidor, dentro de `enviarAjustes`, não por um timer.
   *
   * Sem nada pendente, `enviarAjustes` devolve na hora e o indicador não acende — o que
   * está certo: não houve o que salvar.
   */
  const salvar = useCallback(() => {
    /* "Tentar de novo" do sinal de gravação (1A.8): a volta atrás já tirou da tela o que o
     * banco recusou, então repetir o envio vazio não faria nada. Reaplica-se a MESMA mudança
     * pelos caminhos de sempre (otimista, coalescida, com volta atrás se falhar outra vez). */
    const r = recusado.current;
    recusado.current = {};
    if (r.ajustes) mexerNosAjustes(r.ajustes);
    if (r.semana) { const semanaRecusada = r.semana; mexerNaSemana(() => semanaRecusada); }
    if (r.nome !== undefined) setNomeDoNegocio(r.nome);
    /* O reaplicado sai pela janela de 500ms, e não aqui: a foto da volta atrás
     * (`ajustesAntes`) é tirada dentro do updater, que o React pode rodar só no próximo
     * render. Mandar agora arriscaria uma falha sem ter para onde voltar. */
    if (r.ajustes) return;
    if (ajustesTimer.current) clearTimeout(ajustesTimer.current);
    void enviarAjustes();
  }, [enviarAjustes, mexerNosAjustes, mexerNaSemana, setNomeDoNegocio]);

  const gravacao = useMemo(
    () => estadoDaGravacao({ emVoo, falhas: falhasDeGravacao, salvo }),
    [emVoo, falhasDeGravacao, salvo],
  );

  /* ── qual documento este negócio emite ──
   * Uma leitura de `/api/fiscal`, e os quatro lugares que precisam dela leem daqui: o hero do
   * Faturamento, o botão dourado da topbar e os dois cartões. Ver `EstadoFiscalUI`. */

  const [fiscal, setFiscal] = useState<EstadoFiscalUI>({
    status: "carregando", caminho: null, config: null, falta: [], provedorFaltando: [],
  });

  /** Traduz a resposta crua da rota para o estado da tela. Uma só, para as escritas e a leitura
   *  não divergirem — todo método de `/api/fiscal` devolve o mesmo envelope. */
  const aplicarFiscal = useCallback((bruto: unknown) => {
    const d = bruto as { ok?: boolean; caminho?: CaminhoFiscal; config?: ConfigFiscal; falta?: string[]; provedorFaltando?: string[] } | null;
    if (!d?.ok || !d.caminho) { setFiscal((v) => ({ ...v, status: "erro" })); return; }
    setFiscal({
      status: "ok",
      caminho: d.caminho,
      config: d.config ?? null,
      falta: Array.isArray(d.falta) ? d.falta : [],
      provedorFaltando: Array.isArray(d.provedorFaltando) ? d.provedorFaltando : [],
    });
  }, []);

  /** Lê `/api/fiscal` e aplica. Exposta porque a tela de erro precisa de um "tentar de novo": sem
   *  ela, `status: "erro"` só saía recarregando a página inteira. */
  const recarregarFiscal = useCallback(async () => {
    try {
      /* Com prazo: sem ele, uma requisição pendurada deixa `status: "carregando"` para sempre, e
       * a tela que espera por isso fica num esqueleto que nunca vira nada. */
      const d = await fetch("/api/fiscal", { cache: "no-store", signal: AbortSignal.timeout(15_000) }).then((x) => x.json());
      aplicarFiscal(d);
    } catch {
      /* `erro`, e não `ok` com caminho chutado: sem saber o caminho, as telas escondem os
       * verbos em vez de inventar um. Ver `EstadoFiscalUI`. */
      setFiscal((v) => ({ ...v, status: "erro" }));
    }
  }, [aplicarFiscal]);

  useEffect(() => { void recarregarFiscal(); }, [recarregarFiscal]);

  /* ── a emissão de recibos ──
   * Ver `EmissaoDeRecibos`: mora aqui, e não na tela, para o dono poder sair de perto. */

  const [emissao, setEmissao] = useState<EmissaoDeRecibos | null>(null);
  const [emissoesFeitas, setEmissoesFeitas] = useState(0);
  /** Trava contra segundo clique. `useRef` porque o estado ainda não chegou quando o clique vem. */
  const emitindo = useRef(false);

  const emitirRecibos = useCallback(async (fila: NaFila[]) => {
    /* ⚠️ DOIS CLIQUES NÃO SÃO DOIS LOTES. Sem esta trava, um clique duplo no CTA emitia cada
     * pagamento duas vezes — e o segundo volta recusado pelo banco, mas só depois de ter cobrado
     * um processamento no canal. */
    if (emitindo.current || fila.length === 0) return;
    emitindo.current = true;

    setEmissao(comecarEmissao(fila));

    for (const p of fila) {
      setEmissao((e) => e && { ...e, atual: p.nome });
      let falha: string | null = null;
      try {
        /* Uma chamada por pagamento, EM SÉRIE. Não é limitação: o canal cobra por processamento, a
         * Receita não gosta de rajada, e uma falha no meio de dez chamadas simultâneas deixaria o
         * dono sem saber quais saíram. */
        const r = await fetch("/api/recibos/emitir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fonte: p.fonte, id: p.id }),
        }).then((x) => x.json());
        if (r?.ok !== true) falha = r?.info ?? r?.detalhe ?? r?.erro ?? "O canal recusou.";
      } catch {
        falha = "A chamada não completou.";
      }
      setEmissao((e) => e && aplicarDesfecho(e, p.nome, falha));
    }

    setEmissao((e) => e && { ...e, estado: "fim", atual: null });
    emitindo.current = false;
    /* As telas releem o servidor por causa disto. Descontar na mão daria a contagem que a tela
     * ACHA que saiu; o que vale é o que o banco diz. */
    setEmissoesFeitas((n) => n + 1);
  }, []);

  const fecharEmissao = useCallback(() => setEmissao(null), []);

  /* ── google calendar ──
   * Duas metades bem separadas: a CONEXÃO (tokens) vive no Supabase e é consultada
   * do servidor; o VÍNCULO evento↔agendamento vive aqui no localStorage, porque o
   * agendamento também vive. Ver o comentário do tipo EventoGoogle lá em cima. */

  const [google, setGoogle] = useState<EstadoGoogle>({ status: "carregando", conexoes: [], faltando: [] });

  /* Ids com operação em voo. É um CONJUNTO, e não um id só: desconectar um
   * profissional, criar um evento e cancelar outro compartilhavam o mesmo slot, então
   * o `finally` de qualquer um deles reabilitava os botões dos outros dois — inclusive
   * o de um POST que ainda estava no ar. */
  const [googleOcupados, setGoocupados] = useState<string[]>([]);
  const marcarOcupado = useCallback((id: string, on: boolean) => {
    setGoocupados((v) => (on ? [...v, id] : v.filter((x) => x !== id)));
  }, []);
  const googleOcupado = useCallback((id: string) => googleOcupados.includes(id), [googleOcupados]);

  /** Trava SÍNCRONA das chamadas em voo.
   *
   *  `googleOcupado` é estado do React: entre o clique e o re-render que desabilita o
   *  botão existe uma janela em que um segundo clique passa pela mesma checagem e
   *  dispara um segundo POST — dois eventos no Google para o mesmo atendimento. Um ref
   *  fecha essa janela porque é atualizado no mesmo tick. (O `requestId` estável evita
   *  duplicar a CONFERÊNCIA, mas não o evento.) */
  const googleEmVoo = useRef<Set<string>>(new Set());

  const lerStatusGoogle = useCallback(async () => {
    try {
      const r = await fetch("/api/google/status").then((x) => x.json());
      setGoogle({ status: r.status, conexoes: r.conexoes ?? [], faltando: r.faltando ?? [] });
    } catch {
      setGoogle({ status: "nao_configurado", conexoes: [], faltando: [] });
    }
  }, []);

  useEffect(() => { void lerStatusGoogle(); }, [lerStatusGoogle]);

  /* A volta do consentimento chega como ?google=ok|erro na URL. Lemos, avisamos e
   * limpamos a query — deixar o parâmetro para trás faria o toast voltar a cada F5. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("google");
    if (!r) return;

    if (r === "ok") {
      toast("Agenda do Google conectada");
      void lerStatusGoogle();
    } else {
      toast(MOTIVO_GOOGLE[q.get("motivo") ?? ""] ?? "Não foi possível conectar ao Google");
    }
    q.delete("google"); q.delete("motivo"); q.delete("pid");
    const busca = q.toString();
    window.history.replaceState({}, "", window.location.pathname + (busca ? `?${busca}` : ""));
  }, [lerStatusGoogle]);

  /* ─────────────────────────────────────────────────────────────────────────
   * O ENDEREÇO: a URL diz onde a pessoa está, e o F5 volta para lá (T9, 25/09/2026).
   *
   * ★ NASCEU PARA O LINK QUE A GENTE MANDA NO WHATSAPP. "Entra no painel, clica em Mais,
   * depois em Faturamento" é instrução que se perde na terceira palavra; `/?tela=faturamento`
   * é um toque. É o mesmo motivo do `?google=ok` acima: quem chega de fora chega no lugar.
   *
   * ⚠️ Valida contra a lista antes de aplicar, e a lista mora em `endereco.ts` (guarda G10).
   * `TelaId` é tipo, e tipo não existe em runtime: um `?tela=qualquercoisa` viraria `st.tela`
   * inválido, o mapa de telas devolveria `undefined` e a tela inteira ficaria branca — a
   * partir de um parâmetro que qualquer um escreve na barra de endereço.
   *
   * ⚠️ A URL NÃO É MAIS LIMPA DEPOIS DE LER (contradição C7). Limpava para o F5 no meio de outra
   * tela não pular de volta a uma tela velha. Agora o efeito de baixo reescreve a URL a cada
   * navegação, então ela nunca envelhece. Quem voltar a apagar o `?tela=` aqui faz o F5 cair
   * no Fluxo de novo.
   *
   * `enderecoLido` segura a escrita até a leitura ter sido aplicada: sem ele, a primeira escrita
   * rodaria no mesmo quadro, com a tela ainda "fluxo", e apagaria o link antes de ele valer.
   * ───────────────────────────────────────────────────────────────────────── */
  const [enderecoLido, setEnderecoLido] = useState(false);
  const aplicarEndereco = useCallback((e: Endereco) => {
    irPara(e.tela, e.secao ?? undefined);
    if (e.abrir) setSel(e.abrir);
    if (e.conversa) setConvSel(e.conversa);
    if (e.tela === "clientes" && e.filtro) setFiltroCli(e.filtro.charAt(0).toUpperCase() + e.filtro.slice(1));
  }, [irPara]);

  useEffect(() => {
    const e = lerEndereco(window.location.search);
    if (e) aplicarEndereco(e);
    setEnderecoLido(true);
    /* Voltar e avançar do navegador: a URL mudou por fora, o painel segue. Sem lista válida
       (voltou a `/`), é o Fluxo. */
    const onPop = () => {
      const de = lerEndereco(window.location.search);
      if (de) aplicarEndereco(de); else irPara("fluxo");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [aplicarEndereco, irPara]);

  useEffect(() => {
    if (!enderecoLido) return;
    const busca = escreverEndereco(window.location.search, {
      tela, secao, abrir: sel,
      conversa: tela === "conversas" ? convSel || null : null,
      filtro: tela === "clientes" ? filtroCli.toLowerCase() : null,
    });
    if (busca !== window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname + busca + window.location.hash);
    }
  }, [enderecoLido, tela, secao, sel, convSel, filtroCli]);

  /* ── a assinatura deste negócio ──
   * Ver `EstadoAssinatura`. Uma leitura de `/api/assinatura`; quem mostra é a gaveta "plano". */

  const [assinatura, setAssinatura] = useState<EstadoAssinatura>({ status: "carregando", assinatura: null, ofertas: [] });

  const recarregarAssinatura = useCallback(async () => {
    try {
      /* Com prazo, como `/api/fiscal`: requisição pendurada deixaria `carregando` para
       * sempre, e `carregando` é o estado em que a gaveta não oferece botão nenhum. */
      const d = (await fetch("/api/assinatura", { cache: "no-store", signal: AbortSignal.timeout(15_000) })
        .then((x) => x.json())) as { ok?: boolean; assinatura?: Assinatura | null; ofertas?: Oferta[] } | null;
      if (!d?.ok) { setAssinatura((v) => ({ ...v, status: "erro" })); return; }
      /* `?? null` e não um objeto chutado: ver o ⚠️ de `EstadoAssinatura`. Ofertas vazias
       * não são erro — a gaveta só deixa de oferecer troca, e o botão do plano da linha
       * continua lá com o texto curto. */
      setAssinatura({
        status: "ok",
        assinatura: d.assinatura ?? null,
        ofertas: Array.isArray(d.ofertas) ? d.ofertas : [],
      });
    } catch {
      setAssinatura((v) => ({ ...v, status: "erro" }));
    }
  }, []);

  useEffect(() => { void recarregarAssinatura(); }, [recarregarAssinatura]);

  const [cobrancaOcupada, setCobrancaOcupada] = useState(false);
  /** Trava SÍNCRONA, pelo mesmo motivo do `googleEmVoo`: entre o clique e o re-render que
   *  desabilita o botão cabe um segundo clique, e cada POST cria uma sessão de checkout. */
  const cobrancaEmVoo = useRef(false);

  /**
   * Abre uma página do provedor. Navegação de página inteira, como o consentimento do
   * Google: o pagamento acontece no domínio deles, não num fetch nosso.
   *
   * ⚠️ NO CAMINHO FELIZ A TRAVA NÃO É LIBERADA. `href` já está saindo da página; liberar
   * aqui reacenderia o botão por um instante, na tela que está indo embora.
   */
  const irParaCobranca = useCallback(async (rota: string, corpo: unknown) => {
    if (cobrancaEmVoo.current) return;
    cobrancaEmVoo.current = true;
    setCobrancaOcupada(true);
    try {
      const r = (await fetch(rota, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json())) as { ok?: boolean; url?: string; info?: string } | null;
      if (!r?.ok || !r.url) throw new Error(r?.info ?? "sem url");
      window.location.href = r.url;
    } catch {
      toast("Não foi possível abrir o pagamento. Tente de novo.");
      cobrancaEmVoo.current = false;
      setCobrancaOcupada(false);
    }
  }, []);

  const assinarPlano = useCallback(
    (plano: ChaveDePlano) => { void irParaCobranca("/api/assinatura", { plano }); },
    [irParaCobranca],
  );
  const abrirPortalDeCobranca = useCallback(
    () => { void irParaCobranca("/api/assinatura/portal", {}); },
    [irParaCobranca],
  );

  /* ── a volta do checkout ──
   *
   * `?pagamento=recebido|cancelado`, posto por `POST /api/assinatura`. Mesmo mecanismo do
   * `?google=ok`: avisa e limpa a query, senão o toast volta a cada F5.
   *
   * ⚠️ "RECEBEMOS", NUNCA "ASSINATURA ATIVA". A volta do navegador não é confirmação de
   * pagamento — boleto leva um dia útil, e quem confirma é `/api/stripe/webhook`, depois,
   * por outro caminho. O adaptador de demonstração marca `ativa` na hora, e é justamente
   * por isso que ele engana quem desenha esta tela: o aviso está em `demo/assinaturas.ts`.
   * Por isso a releitura também não é `assinatura.status === "ativa"` esperada; é só uma
   * releitura, e ela pode voltar `trial` — o que estaria certo. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("pagamento");
    if (!r) return;

    if (r === "recebido") {
      toast("Recebemos seu pedido — a confirmação chega em instantes");
      void recarregarAssinatura();
    } else {
      toast("Pagamento cancelado. Nada foi cobrado.");
    }

    q.delete("pagamento");
    const busca = q.toString();
    window.history.replaceState({}, "", window.location.pathname + (busca ? `?${busca}` : ""));
  }, [recarregarAssinatura]);

  const googleDe = useCallback(
    (pid: string) => google.conexoes.find((c) => c.profissionalId === pid),
    [google.conexoes],
  );

  const conectarGoogle = useCallback((pid: string) => {
    // Navegação de página inteira, não fetch: o consentimento acontece no domínio do
    // Google e ele devolve o usuário por redirect. `volta` traz de volta para a tela atual.
    const volta = encodeURIComponent(window.location.pathname);
    window.location.href = `/api/google/conectar?pid=${encodeURIComponent(pid)}&volta=${volta}`;
  }, []);

  const desconectarGoogle = useCallback(async (pid: string) => {
    marcarOcupado(pid, true);
    try {
      const r = await fetch(`/api/google/conectar?pid=${encodeURIComponent(pid)}`, { method: "DELETE" })
        .then((x) => x.json());
      if (r.ok) {
        toast(r.revogado ? "Agenda desconectada e acesso revogado no Google" : "Agenda desconectada");
        await lerStatusGoogle();
      } else {
        toast("Não foi possível desconectar");
      }
    } catch {
      toast("Sem conexão com o servidor");
    } finally {
      marcarOcupado(pid, false);
    }
  }, [lerStatusGoogle]);

  /* ── cancelar um atendimento ──
   *
   * Era "Remover do Google", e o nome fazia sentido quando o atendimento vivia aqui e o
   * evento era uma cópia dele lá. Agora são a mesma coisa: apagar o evento É cancelar o
   * atendimento, e chamar isso de "remover do Google" faria parecer que o atendimento
   * continua marcado em algum lugar.
   *
   * É a única ação DESTRUTIVA em agenda real que o app tem, então pede confirmação — em
   * dois toques na própria gaveta, e não num diálogo novo. `cancelarPedido` guarda de
   * qual atendimento é o pedido, e abrir/fechar a gaveta o descarta: um "Confirmar" que
   * sobrevive à navegação é um clique acidental esperando acontecer.
   */
  const pedirCancelamento = useCallback((chave: string | null) => setCancelarPedido(chave), []);

  const cancelarAtendimento = useCallback(async (id: string) => {
    const ag = agendamentoPorId(id);
    if (!ag || googleEmVoo.current.has(id)) return;

    googleEmVoo.current.add(id);
    marcarOcupado(id, true);
    try {
      const r = await fetch(
        `/api/atendimentos?eventoId=${encodeURIComponent(ag.eventId)}&pid=${encodeURIComponent(ag.profissionalId)}`,
        { method: "DELETE" },
      ).then((x) => x.json());

      if (r.ok) {
        // Tira da lista local na hora. A rota trata 404/410 como sucesso (o evento já não
        // estava lá), então este caminho também cobre "alguém apagou pelo Google antes".
        setAtendimentos((prev) => prev.filter((e) => e.eventId !== ag.eventId));
        setCancelarPedido(null);
        setSel(null);
        toast(`${ag.cliente.nome} — atendimento cancelado e evento removido do Google`);
        return;
      }
      toast(RESPOSTA_GOOGLE[r.status] ?? r.info ?? "Não foi possível cancelar o atendimento");
    } catch {
      toast("Sem conexão com o servidor");
    } finally {
      googleEmVoo.current.delete(id);
      marcarOcupado(id, false);
    }
  }, [agendamentoPorId]);

  /* ── REMARCAR (1B.5, 25/09/2026) ──
   * Não existia: a barra da Agenda dizia "remarcar, por enquanto, é no Google Calendar", o que
   * para quem não conectou Google era cancelar e marcar de novo (perdendo o Meet e a chave). A
   * gaveta escolhe o dia e o horário entre as vagas daquela pessoa (`vagasDe`, sem contar o
   * próprio atendimento), e o PATCH move a linha na tabela e, se houver, o evento lá fora com o
   * MESMO id. A lista local só muda com a resposta: o bloco muda de lugar sem recarregar. */
  const pedirRemarcacao = useCallback((id: string | null) => {
    if (!id) { setRemarcacao(null); return; }
    const a = agendamentoPorId(id);
    if (a) { setCancelarPedido(null); setRemarcacao({ id, data: a.data, inicio: a.inicio }); }
  }, [agendamentoPorId]);
  const editarRemarcacao = useCallback((parcial: { data?: string; inicio?: number }) => {
    setRemarcacao((r) => (r ? { ...r, ...parcial } : r));
  }, []);
  const remarcarAtendimento = useCallback(async (id: string) => {
    const a = agendamentoPorId(id);
    const alvo = remarcacao && remarcacao.id === id ? remarcacao : null;
    if (!a || !a.ag || !alvo || googleEmVoo.current.has(id)) return;

    googleEmVoo.current.add(id);
    marcarOcupado(id, true);
    try {
      const r = await fetch("/api/atendimentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profissionalId: a.profissionalId, maisaAg: a.ag, data: alvo.data, inicio: alvo.inicio }),
      }).then((x) => x.json());

      if (r.ok) {
        setAtendimentos((prev) => prev.map((e) => (e.eventId === a.eventId
          ? { ...e, data: r.data ?? alvo.data, inicio: r.inicio ?? alvo.inicio, fim: (r.inicio ?? alvo.inicio) + e.duracao / 60 }
          : e)));
        setRemarcacao(null);
        const quando = alvo.data === D.HOJE.iso ? "hoje" : D.rotuloDia(alvo.data);
        /* Havia evento no Google e ele não se mexeu: dizer, senão ele confia no horário de lá. */
        const fora = r.foraDoCalendario ? ". O evento do Google ficou no horário antigo: mova por lá" : "";
        toast(`Atendimento de ${a.cliente.nome} remarcado para ${quando}, ${D.hhmm(alvo.inicio)}${fora}`);
        return;
      }
      /* O motivo do servidor antes do genérico: "foi cancelado", "horário ocupado" dizem o que fazer. */
      toast((r.status === "payload_invalido" ? r.info : null) ?? RESPOSTA_GOOGLE[r.status] ?? r.info ?? "Não consegui remarcar. O atendimento continua no horário de antes.");
    } catch {
      toast("Sem conexão com o servidor. O atendimento continua no horário de antes.");
    } finally {
      googleEmVoo.current.delete(id);
      marcarOcupado(id, false);
    }
  }, [agendamentoPorId, remarcacao, marcarOcupado]);

  /* ── LER a agenda do Google ──
   * A metade que faltava. Até aqui o app só ESCREVIA no Google e nunca olhava de volta:
   * eram dois calendários que não se conheciam. */

  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  /* Nasce `carregando`, não `nao_conectado` (24/09/2026): antes da primeira resposta não se sabe
   * nada, e o nome antigo (`agendaGoogle`) fazia a tela ler "Google não conectado" num estado
   * que só queria dizer "ainda não li". A leitura é da tabela desde o ADR-0009. */
  const [leituraAgenda, setLeituraAgenda] = useState<LeituraAgenda>({ status: "carregando", jaLeu: false });

  /* Qual janela está em voo. Ref e não estado, pela mesma razão do `googleEmVoo`: entre
   * disparar o fetch e o re-render existe uma janela em que o efeito rodaria de novo. */
  const leituraEmVoo = useRef<string | null>(null);
  /* Quando terminou a última leitura bem-sucedida. Um alt-tab não deve virar um GET. */
  const lidoEm = useRef(0);

  const lerAgenda = useCallback(async (de: string, ate: string) => {
    /* Sem agenda resolvida não há o que pedir. Acontece na primeira passada (o cadastro
     * ainda não voltou) e num negócio sem profissional ativo. Sem esta linha o GET
     * sairia com `pid=` vazio, o servidor recusaria com `profissional_invalido` e a tela
     * mostraria erro de agenda para uma condição que se resolve sozinha em milissegundos. */
    if (!agendasLidas) return;
    const pids = agendasLidas.split(",");

    const chave = `${agendasLidas}|${de}..${ate}`;
    if (leituraEmVoo.current === chave) return;
    leituraEmVoo.current = chave;
    /* `faltam` fica durante a releitura: a coluna que falhou continua sem "livre" até voltar. */
    setLeituraAgenda((a) => ({ ...a, status: "carregando" }));

    try {
      /* UM GET POR AGENDA, em paralelo (24/09/2026, item 1A.4). A rota lê uma agenda por vez
       * (`exigirAgendaPermitida` confere o `pid`), e o calendário externo que ela soma é o
       * DAQUELA pessoa. Uma resposta que falha não derruba as outras: o que voltou entra na
       * tela, e a faixa de erro diz que falta um pedaço. */
      const respostas = await Promise.all(pids.map(async (pid) => {
        try {
          const r = await fetch(`/api/agenda?pid=${encodeURIComponent(pid)}&de=${de}&ate=${ate}`).then((x) => x.json());
          return { pid, r };
        } catch {
          return { pid, r: null as any };
        }
      }));

      /* A MESMA resposta traz as duas coisas, e a marca `maisa` é o que as separa: o
       * evento criado por este app vira ATENDIMENTO (colorido, com cliente e serviço); o
       * resto vira BLOQUEIO (cinza, só leitura). Ver PROPS em calendario.ts.
       *
       * Sem essa separação, um atendimento marcado aqui voltaria da leitura como
       * bloqueio cinza sem cliente — o app criaria o evento e depois não se reconheceria
       * nele. */
      const novosAtend: AtendimentoLido[] = [];
      const novosBloq: Bloqueio[] = [];
      /* Qual pedaço cada resposta substitui: a agenda e a janela que ELA devolveu. */
      const lidas: { pid: string; de: string; ate: string }[] = [];
      for (const { pid, r } of respostas) {
        if (!r?.ok) continue;
        lidas.push({ pid, de: r.de, ate: r.ate });
        for (const e of (r.eventos ?? []) as any[]) {
          const base = {
            eventId: String(e.eventoId), data: e.data, inicio: e.inicio, fim: e.fim,
            duracao: e.duracao, recorrente: !!e.recorrente,
            meetLink: e.meetLink ?? undefined, htmlLink: e.htmlLink ?? undefined,
          };
          if (e.maisa) {
            novosAtend.push({
              ...base,
              ag: e.maisa.ag ? String(e.maisa.ag) : undefined,
              profissionalId: e.maisa.profissionalId || pid,
              clienteId: e.maisa.clienteId ?? "",
              clienteNome: e.maisa.clienteNome ?? "Cliente",
              clienteTel: e.maisa.clienteTel ?? "",
              servicoId: e.maisa.servicoId ?? "",
              servicoNome: e.maisa.servicoNome ?? "Atendimento",
              servicoValor: Number(e.maisa.servicoValor) || 0,
              valorGravado: e.maisa.servicoValor == null || !Number.isFinite(Number(e.maisa.servicoValor))
                ? null : Number(e.maisa.servicoValor),
              // A única fonte real de "confirmado" que existe: a resposta de quem foi
              // convidado. Sem convidados ninguém deve nada, então está confirmado.
              confirmado: !e.aguardandoResposta,
            });
          } else {
            novosBloq.push({ ...base, id: `bloq:${pid}:${base.eventId}`, profissionalId: pid, titulo: e.titulo });
          }
        }
      }

      if (lidas.length > 0) {
        /* Cache ACUMULATIVO, agora por agenda: só o pedaço (pessoa × janela) que acabou de
         * chegar é substituído. Navegar para setembro e voltar para agosto não refaz
         * request, o Fluxo de hoje continua com os dados de hoje enquanto a Agenda passeia,
         * e a agenda que falhou mantém o que já tinha sido lido dela. */
        const substituido = (pid: string, d: string) => lidas.some((l) => l.pid === pid && d >= l.de && d <= l.ate);
        setBloqueios((prev) => [...prev.filter((b) => !substituido(b.profissionalId, b.data)), ...novosBloq]);
        setAtendimentos((prev) => [...prev.filter((a) => !substituido(a.profissionalId, a.data)), ...novosAtend]);
      }

      const falhas = respostas.filter(({ r }) => !r?.ok);
      if (falhas.length === 0) {
        lidoEm.current = Date.now();
        setLeituraAgenda({ status: "ok", jaLeu: true });
        return;
      }
      const leuAlgo = lidas.length > 0;
      const faltam = falhas.map(({ pid }) => pid);

      const reconectar = falhas.find(({ r }) => r?.status === "reconectar");
      if (reconectar) {
        // O access token morreu. `acessoValido` já apagou a linha do banco quando o
        // refresh também morreu, então relemos o status: é ele que decide se a tela
        // oferece "Reconectar" ou volta para "Conectar".
        setLeituraAgenda((a) => ({ status: "reconectar", jaLeu: a.jaLeu || leuAlgo, info: reconectar.r.info, faltam }));
        void lerStatusGoogle();
        return;
      }

      if (falhas.every(({ r }) => r?.status === "limite")) {
        // Cota não é erro, é "pergunte de novo daqui a pouco". A tela não muda de cara.
        setLeituraAgenda((a) => ({ status: "limite", jaLeu: a.jaLeu || leuAlgo, faltam }));
        agendar(() => { leituraEmVoo.current = null; void lerAgenda(de, ate); }, 20_000);
        return;
      }

      const r = falhas.find(({ r }) => r && r.status !== "limite")?.r;
      const info = r ? (r.info ?? RESPOSTA_GOOGLE[r.status]) : "Sem conexão com o servidor.";
      setLeituraAgenda((a) => ({ status: "erro", jaLeu: a.jaLeu || leuAlgo, info, faltam }));
    } catch {
      setLeituraAgenda((a) => ({ status: "erro", jaLeu: a.jaLeu, info: "Sem conexão com o servidor.", faltam: pids }));
    } finally {
      // No caminho do `limite` o timer já reassumiu a chave; limpar aqui é inofensivo
      // porque o retry roda depois.
      if (leituraEmVoo.current === chave) leituraEmVoo.current = null;
    }
    /* `agendasLidas` É dependência, e esquecê-la seria o bug mais caro desta função: ela
     * começa vazia e só ganha valor quando `/api/cadastro` responde. Um callback preso ao
     * primeiro render capturaria `""` para sempre, o `if (!agendasLidas) return` acima
     * devolveria toda chamada, e a agenda NUNCA carregaria — sem erro, sem request, sem
     * nada no console. */
  }, [lerStatusGoogle, agendar, agendasLidas]);

  /* Buscar quando a janela muda.
   *
   * ⚠️ As dependências são só STRINGS e BOOLEANOS. Depender de `st`, de `bloqueios` ou de
   * um callback recriado por render faria o efeito rodar depois de cada resposta — que
   * dispara outra busca, que dispara outra. `lerAgenda` só existe nas deps porque é
   * estável (useCallback sobre coisas estáveis). */
  useEffect(() => {
    /* ⚠️ AQUI HAVIA DOIS PORTÕES DE GOOGLE, E ELES ERAM A METADE DE FRENTE DO DEFEITO
     * (ADR-0009): um por `google.status` (o ambiente tem credencial?) e outro por
     * `conectado` (este profissional ligou a agenda dele?). Bastava um ser falso e a tela
     * ZERAVA `atendimentos` e `bloqueios` e nem chegava a pedir. O servidor não tinha o
     * que gravar sem Google, e o painel não pedia o que existia — os dois lados
     * combinando para a mesma tela vazia.
     *
     * Agora a leitura sempre acontece. Quem decide o que somar é o servidor: os
     * atendimentos do produto sempre, o calendário externo quando houver. */
    void lerAgenda(janela.de, janela.ate);
  }, [janela.de, janela.ate, lerAgenda]);

  /* Voltar para a aba relê a janela.
   *
   * É o caminho principal da fatia: o Bruno marca no Google Calendar, volta para o app e
   * espera ver o compromisso. Sem isto, só um F5 traria. Com carência de 30s porque
   * `focus` dispara a cada alt-tab, e trinta GETs por minuto é como se perde cota. */
  useEffect(() => {
    /* Sem o `if (!conectado) return` que havia aqui: quem marca pelo WhatsApp também
     * espera ver o atendimento ao voltar para a aba, e esse caminho nunca teve Google. */
    const talvezReler = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lidoEm.current < 30_000) return;
      void lerAgenda(janela.de, janela.ate);
    };
    window.addEventListener("focus", talvezReler);
    document.addEventListener("visibilitychange", talvezReler);
    return () => {
      window.removeEventListener("focus", talvezReler);
      document.removeEventListener("visibilitychange", talvezReler);
    };
  }, [janela.de, janela.ate, lerAgenda]);

  const recarregarAgenda = useCallback(() => {
    leituraEmVoo.current = null;
    lidoEm.current = 0;
    void lerAgenda(janela.de, janela.ate);
  }, [lerAgenda, janela.de, janela.ate]);

  /* ══ MARCAR UM ATENDIMENTO ══
   *
   * Clicar num vago abre um rascunho na gaveta com dia, hora e profissional já resolvidos
   * pelo clique; falta escolher quem e o quê. Confirmar grava o atendimento na tabela e,
   * se o profissional conectou o Google, cria o evento lá também — no mesmo POST, sem um
   * passo "criar evento" separado.
   *
   * Mora nesta altura do arquivo porque depende de `lerStatusGoogle`. */
  const [rascunho, setRascunho] = useState<D.RascunhoAgendamento | null>(null);
  /** Enquanto o POST está no ar, e o que voltou se ele falhou. A gaveta é quem mostra. */
  /* `tentou`: já saiu um POST deste rascunho. Depois do primeiro, dia, hora e pessoa travam na
   * gaveta: "Tentar de novo" reusa o `maisaAg`, e o servidor devolveria o evento da primeira
   * tentativa, no horário antigo, como se fosse o novo. */
  const [rascunhoEstado, setRascunhoEstado] = useState<{ enviando: boolean; erro?: string; tentou?: boolean }>({ enviando: false });
  const criacaoEmVoo = useRef(false);

  /** Índice por data — mesma razão do `porDia`: a grade do mês pergunta 42 vezes por render. */
  const bloqPorDia = useMemo(() => {
    const m = new Map<string, Bloqueio[]>();
    for (const b of bloqueios) {
      const lista = m.get(b.data);
      if (lista) lista.push(b);
      else m.set(b.data, [b]);
    }
    m.forEach((lista) => lista.sort((x, y) => x.inicio - y.inicio));
    return m;
  }, [bloqueios]);

  const bloqueiosDoDia = useCallback((data: string) => bloqPorDia.get(data) ?? SEM_BLOQUEIO, [bloqPorDia]);
  /* ── o vago de verdade, para quem marca sem clicar num vago (T2) ──
   * A grade sabe onde está o vago porque DESENHA os blocos; o "Novo" da casca não tem grade.
   * `vagasDoDia` é a mesma conta que o agente de WhatsApp faz: expediente, o que está marcado,
   * os compromissos do Google da agenda dessa pessoa, e a antecedência mínima. Só enxerga a
   * janela lida (o mês): além dela, o servidor é quem recusa o conflito. */
  const vagasDe = useCallback((pid: string, data: string, duracaoMin: number, semOAtendimento?: string) => {
    const ocupados = [
      /* `semOAtendimento`: ao remarcar, o próprio horário não conta como ocupado (1B.5). */
      ...agendamentosDoDia(data).filter((a) => a.profissionalId === pid && a.id !== semOAtendimento),
      ...bloqueiosDoDia(data).filter((b) => !b.profissionalId || b.profissionalId === pid),
    ].map((o) => ({ data, inicio: o.inicio, fim: o.fim }));
    return vagasDoDia({ data, expediente: expedienteDe(pid), duracaoMin, ocupados, agora: Date.now() });
  }, [agendamentosDoDia, bloqueiosDoDia, expedienteDe]);

  const proximoVago = useCallback((desde?: string) => {
    /* Primeiro nas agendas LIDAS; se nenhuma tem vago (ou nenhuma foi lida, como no demo sem
     * login), pelo expediente de todas: melhor propor um horário que o servidor confere do que
     * abrir o rascunho às 09:00 de um dia que já passou das 09:00. */
    const faltam = leituraAgenda.faltam ?? [];
    const lidas = cadastro.agendas.filter((pid) => !faltam.includes(pid));
    const varrer = (pids: string[]) => {
      let data = desde && desde > D.HOJE.iso ? desde : D.HOJE.iso;
      for (let i = 0; i < MAX_DIAS_VARRIDOS; i++, data = D.somarDias(data, 1)) {
        let melhor: { profissionalId: string; data: string; inicio: number } | null = null;
        for (const pid of pids) {
          const h = vagasDe(pid, data, PASSO_MIN)[0];
          if (h !== undefined && (!melhor || h < melhor.inicio)) melhor = { profissionalId: pid, data, inicio: h };
        }
        if (melhor) return melhor;
      }
      return null;
    };
    return varrer(lidas) ?? (lidas.length < cadastro.agendas.length ? varrer(cadastro.agendas) : null);
  }, [cadastro.agendas, leituraAgenda.faltam, vagasDe]);

  const novoAgendamento = useCallback((
    onde?: { profissionalId: string; inicio: number; data: string } | null,
    extra?: { clienteId?: string; dia?: string },
  ) => {
    /* Sem vago clicado, o próximo de verdade. Sem nenhum em 21 dias (ninguém de expediente,
     * agenda cheia), o rascunho nasce hoje com a primeira agenda e a gaveta diz que não há
     * horário: melhor que um clique que não abre nada. */
    const alvo = onde ?? proximoVago(extra?.dia) ?? {
      profissionalId: cadastro.agendas[0] ?? "", data: extra?.dia ?? D.HOJE.iso, inicio: 9,
    };
    const { profissionalId, inicio, data } = alvo;
    /* A pessoa já escolhida (ficha do cliente): traz o preço da ficha, como o select faria. */
    const cl = extra?.clienteId ? cadastro.clientes.find((c) => c.id === extra.clienteId) : undefined;
    /* ⚠️ AQUI HAVIA UM `if (!conectado)` QUE RECUSAVA O CLIQUE com "Conecte a agenda do
     * Google em Minha Equipe — é lá que o atendimento é criado". Era o terceiro portão do
     * ADR-0009, e o que sobrou: os dois da leitura saíram, este não. O servidor já gravava
     * sem Google e a tela nem deixava pedir. O atendimento nasce na tabela; o Google, se
     * houver, recebe a cópia. */
    // A data entra no id junto com profissional e hora: com Semana e Mês na tela, "pr1 às 14h" já
    // não identifica um vago — existe um por dia.
    const id = `novo-${data}-${profissionalId}-${inicio}`;
    /* O uuid nasce AQUI, com o rascunho, e não na hora de enviar. É o que faz a
     * retentativa depois de uma falha reusar a mesma chave — o servidor consulta por ela
     * antes de inserir (ver buscarPorProp), então "Tentar de novo" depois de um timeout
     * não cria um segundo evento. Um uuid sorteado por tentativa não protegeria de nada. */
    setRascunho({
      id, maisaAg: uuid(), data, profissionalId, inicio, clienteId: cl?.id ?? "", servicoId: "",
      ...(cl?.valorSessao != null ? { valor: String(cl.valorSessao) } : {}),
    });
    setRascunhoEstado({ enviando: false });
    setCancelarPedido(null);
    setSel(id);
  }, [proximoVago, cadastro.agendas, cadastro.clientes]);

  const editarRascunho = useCallback((p: Partial<D.RascunhoAgendamento>) => {
    setRascunho((r) => (r ? { ...r, ...p } : r));
    // Mexeu em algo depois de falhar: some o erro velho, que já não descreve o que há na tela.
    setRascunhoEstado((e) => (e.erro ? { enviando: false, tentou: e.tentou } : e));
  }, []);

  const confirmarRascunho = useCallback(async () => {
    /* Lê `rascunho` direto, NÃO de dentro de um `setRascunho(r => …)`: disparar POST e
     * emitir toast são efeitos, e um updater de estado precisa ser puro — em
     * desenvolvimento o React o invoca duas vezes. Antes isso duplicava o atendimento no
     * localStorage; agora duplicaria um evento numa agenda real. */
    const r = rascunho;
    if (!r || !r.clienteId) return;
    // Trava SÍNCRONA. `rascunhoEstado.enviando` só desabilita o botão no próximo render, e
    // entre o clique e ele cabe um segundo clique. Ver o mesmo padrão em `googleEmVoo`.
    if (criacaoEmVoo.current) return;

    const cl = clienteDe(r.clienteId);
    if (!cl) return;

    /* ── MARCADO PELO PREÇO, SEM SERVIÇO (28/09/2026) ──
     * O serviço nasce "Ana · R$ 150,00" antes do atendimento, porque o atendimento guarda o
     * serviço e a agenda precisa da duração. Reusa o que já existe com o mesmo nome (ver
     * `D.nomeDoServicoAvulso`), senão o catálogo ganharia uma linha por sessão.
     *
     * ⚠️ NASCE `ativo: false`, e é o que impede o estrago: a MAISA só oferece no WhatsApp
     * serviço ativo (`persona.ts`, `oferecer-horarios.ts`). Ativo, "Ana · R$ 150,00" seria
     * oferecido a qualquer número novo, com o preço da Ana. O atendimento não precisa dele
     * ativo: o nome, a duração e o valor vão no próprio pedido. */
    let achado = r.servicoId ? servicoDe(r.servicoId) : undefined;
    const criouServico = !achado;
    if (!achado) {
      if (!(r.valor ?? "").trim()) return;
      const valorDigitado = D.valorDoRascunho(r);
      if (valorDigitado === null || valorDigitado <= 0) return;
      const nome = D.nomeDoServicoAvulso(cl.nome, valorDigitado);
      achado = servicos.find((s) => s.nome === nome);
      if (!achado) {
        criacaoEmVoo.current = true;
        setRascunhoEstado({ enviando: true, tentou: true });
        try {
          const cs = await fetch("/api/servicos", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, categoria: "Recorrente", preco: valorDigitado, duracao: D.duracaoPadrao(servicos), ativo: false }),
          }).then((x) => x.json());
          if (!cs?.ok || !cs.servico) {
            setRascunhoEstado({ enviando: false, tentou: true, erro: cs?.info ?? `Não consegui criar o serviço ${nome}. Tentar de novo é seguro.` });
            return;
          }
          const novo = cs.servico as D.Servico;
          achado = novo;
          setCadastro((c) => ({ ...c, servicos: [...c.servicos, novo] }));
          setRascunho((x) => (x ? { ...x, servicoId: novo.id } : x));
        } catch {
          setRascunhoEstado({ enviando: false, tentou: true, erro: "Sem conexão com o servidor. Tentar de novo é seguro, não cria duplicado." });
          return;
        } finally {
          criacaoEmVoo.current = false;
        }
      }
    }
    const sv = achado;
    const valor = D.valorDoRascunho(r, sv);
    if (valor === null) return;

    /* Série: uma chave por sessão, cunhadas UMA vez e guardadas no rascunho — é o que faz
     * "Tentar de novo" reencontrar as sessões que já entraram em vez de marcá-las de novo.
     * A primeira é a `maisaAg` do rascunho, então a série de uma sessão é o avulso. */
    const cada = r.cadaSemanas ?? 0;
    const n = cada ? D.ocorrenciasDaSerie(cada, r.meses ?? 3) : 1;
    const chaves = cada
      ? (r.chaves?.length === n ? r.chaves : [r.maisaAg, ...Array.from({ length: n - 1 }, () => uuid())])
      : undefined;
    if (chaves && chaves !== r.chaves) setRascunho((x) => (x ? { ...x, chaves } : x));

    /* Do profissional DO RASCUNHO, não o `conectado` da agenda aberta: é para a agenda dele
     * que o evento iria. Sem Google, Meet não é pedido — pedir e não vir faria o toast
     * avisar "sem link do Meet" a quem nunca quis um. */
    const comGoogle = google.conexoes.some((c) => c.profissionalId === r.profissionalId);

    criacaoEmVoo.current = true;
    setRascunhoEstado({ enviando: true, tentou: true });
    try {
      const resp = await fetch("/api/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maisaAg: r.maisaAg,
          data: r.data,
          inicio: r.inicio,
          profissionalId: r.profissionalId,
          servicoId: sv.id,
          clienteId: cl.id,
          // Nome, telefone, duração e valor vão junto porque serão GRAVADOS no evento: um
          // serviço criado pelo usuário só existe neste navegador, e sem a cópia o
          // atendimento não renderizaria em nenhum outro. Ver PROPS em calendario.ts.
          duracao: sv.duracao,
          servicoNome: sv.nome,
          servicoValor: valor,
          clienteNome: cl.nome,
          clienteTelefone: cl.telefone,
          comMeet: comGoogle,
          ...(chaves ? { recorrencia: { cadaSemanas: cada, chaves } } : {}),
        }),
      }).then((x) => x.json());

      if (resp.ok) {
        /* Entra na lista JÁ CONFIRMADO — não é inserção otimista, é o resultado do POST.
         * Poderia ser um refetch da janela, mas seria um segundo round-trip para saber o
         * que a resposta já disse. A leitura seguinte reconcilia de qualquer forma. */
        type Criado = { data: string; eventoId: string; meetLink?: string | null; htmlLink?: string | null };
        const criados: Criado[] = resp.serie?.criados ?? [{ ...resp, data: r.data }];
        const ids = new Set(criados.map((c) => String(c.eventoId)));
        setAtendimentos((prev) => [
          ...prev.filter((e) => !ids.has(e.eventId)),
          ...criados.map((c) => ({
            eventId: String(c.eventoId),
            /* A chave: sem Google o `eventoId` É a chave; o avulso é a do rascunho. Numa série com
             * Google fica sem, e a leitura seguinte a traz (o "Remarcar" só aparece com ela). */
            ag: chaves?.includes(String(c.eventoId)) ? String(c.eventoId) : chaves ? undefined : r.maisaAg,
            data: c.data,
            inicio: r.inicio,
            fim: r.inicio + sv.duracao / 60,
            duracao: sv.duracao,
            profissionalId: r.profissionalId,
            clienteId: cl.id, clienteNome: cl.nome, clienteTel: cl.telefone,
            servicoId: sv.id, servicoNome: sv.nome, servicoValor: valor, valorGravado: valor,
            confirmado: true,
            meetLink: c.meetLink ?? undefined,
            htmlLink: c.htmlLink ?? undefined,
            recorrente: !!chaves,
          })),
        ]);
        setRascunho(null);
        setRascunhoEstado({ enviando: false });
        setSel(null);
        /* A ficha APRENDE o preço na primeira vez que ele foge da tabela — é o que faz a
         * próxima sessão dessa pessoa já nascer certa. Só quando a ficha está vazia: um
         * preço já guardado foi decisão do dono, e um desconto avulso não o reescreve. */
        const aprendeu = cl.valorSessao == null && (criouServico || valor !== sv.preco);
        if (aprendeu) editarCliente(cl.id, { valorSessao: valor });
        const nota = aprendeu ? ` · ${fmt(valor)} guardado na ficha de ${cl.nome}` : "";
        const quando = r.data === D.HOJE.iso ? "hoje" : D.rotuloDia(r.data);
        if (resp.serie) {
          /* As puladas vão NO toast, com data: é a única hora em que o dono fica sabendo que
           * a série tem buraco, e sem a data ele teria que varrer a agenda para achar. */
          const pulados: { data: string }[] = resp.serie.pulados ?? [];
          toast(
            `${criados.length} sessões de ${cl.nome} marcadas a partir de ${quando}` +
            (pulados.length ? ` — ${pulados.length} puladas por horário ocupado: ${pulados.map((p) => D.rotuloDia(p.data)).join(", ")}` : "") +
            nota,
          );
          return;
        }
        /* Três finais. Sem Google nenhum, nada a dizer: a agenda É a da MAISA. Com Google e
         * `foraDoCalendario`, o evento não entrou lá — dizer, senão ele confia numa agenda
         * que não recebeu. */
        const onde = !comGoogle ? ""
          : resp.foraDoCalendario ? " — não entrou na sua agenda do Google"
          : resp.semMeet ? " — sem link do Meet"
          : " · na sua agenda do Google";
        toast(
          resp.status === "ja_existia"
            ? `${cl.nome} já estava marcado ${quando} às ${D.hhmm(r.inicio)}`
            : `${cl.nome} marcado ${quando} às ${D.hhmm(r.inicio)}${onde}${nota}`,
        );
        return;
      }

      if (resp.status === "reconectar") {
        setRascunhoEstado({ enviando: false, tentou: true, erro: "O acesso ao Google expirou. Reconecte a agenda em Minha Equipe e tente de novo." });
        void lerStatusGoogle();
        return;
      }
      setRascunhoEstado({ enviando: false, tentou: true, erro: RESPOSTA_GOOGLE[resp.status] ?? resp.info ?? "Não foi possível marcar." });
    } catch {
      /* Rede caiu. O evento PODE ter sido criado — por isso o erro fala em "tentar de
       * novo" e não em "não foi criado": só o `maisaAg` sabe a verdade, e ele garante que
       * a segunda tentativa encontre o primeiro em vez de criar outro. */
      setRascunhoEstado({ enviando: false, tentou: true, erro: "Sem conexão com o servidor. Tentar de novo é seguro — não cria duplicado." });
    } finally {
      criacaoEmVoo.current = false;
    }
  }, [rascunho, servicoDe, servicos, lerStatusGoogle, clienteDe, google.conexoes, editarCliente]);

  const descartarRascunho = useCallback(() => {
    setRascunho(null);
    setRascunhoEstado({ enviando: false });
    setSel(null);
  }, []);

  const bloqueioPorId = useCallback((id: string) => bloqueios.find((b) => b.id === id), [bloqueios]);

  /* ── valor ── */
  const value = useMemo<StoreValue>(() => ({
    tela, irPara, secao, telaCheia, setTelaCheia, ativacao, setAtivacao, sel, abrir, fechar,
    agendamentos, agendamentosDoDia, agendamentoPorId, moverEtapa, avancarEtapa,
    cancelarPedido, pedirCancelamento, cancelarAtendimento,
    remarcacao, pedirRemarcacao, editarRemarcacao, remarcarAtendimento,
    fila, resolverFila,
    arrastando, alvoSolta, iniciarArrasto, encerrarArrasto, marcarAlvo,
    conversas, conversaDe, conversasErro, conversasPrecisaEntrar, conversasCarregadas, recarregarConversas,
    convSel, selecionarConversa, abaConv, setAbaConv, threadDe, threadCarregando,
    enviar, enviando, assumir, devolver, abrirNoWhatsApp, caderno, recarregarCaderno, responderA,
    cadastro, cadastroErro, cadastroCarregado,
    profissionalDe, clienteDe, nomeDoProfissional, nomeDoCliente,
    pidAgenda, atendeNoDia, podeComecarEm,
    profAtivo, alternarProf, criarProfissional, editarProfissional, svcAtivo, alternarSvc, cliAtivo, alternarCli, editarCliente, criarCliente,
    servicos, servicoDe, nomeServico, editarServico, criarServico, excluirServico,
    filtroSvc, setFiltroSvc, filtroCli, setFiltroCli,
    fiscal, aplicarFiscal, recarregarFiscal,
    assinatura, recarregarAssinatura, assinarPlano, abrirPortalDeCobranca, cobrancaOcupada,
    emissao, emitirRecibos, fecharEmissao, emissoesFeitas, clientesGravados,
    notaDe, emitirNota, emitirPendentes, cancelarNota, fechamento, mesDoFechamento, emitiveis,
    loteAberto, pedirLote, fecharLote, confirmarLote,
    assistente: ajustes.assistente, setAssistente, ajustesErro, recarregarAjustes, ajustesPrecisaEntrar, ajustesCarregados, setNomeDoNegocio,
    faqs, faqsErro, faqsOcupado, salvarFaq, removerFaq,
    canal, statusMaisa, recarregarCanal, canalErro, canalOcupado, canalFaltando, qrcode, codigo, numeroPareando, conectarCanal, renovarCodigo, desconectarCanal, trocarNumero, definirDonoDoCanal,
    semana, semanaErro, semanaCarregada, alternarDia, setHorario,
    cfg: ajustes.cfg, alternarCfg,
    salvo, salvar, gravacao,
    diaSel, verDia,
    rascunho, rascunhoEstado, novoAgendamento, editarRascunho, confirmarRascunho, descartarRascunho,
    vagasDe, proximoVago, novoEmLinha, pedirNovo,
    google, googleDe, conectarGoogle, desconectarGoogle, googleOcupado,
    bloqueiosDoDia, bloqueioPorId, leituraAgenda, recarregarAgenda,
    railAberto, setRailAberto,
  }), [
    tela, irPara, secao, telaCheia, setTelaCheia, ativacao, setAtivacao, sel, abrir, fechar,
    agendamentos, agendamentosDoDia, agendamentoPorId, moverEtapa, avancarEtapa,
    cancelarPedido, pedirCancelamento, cancelarAtendimento,
    remarcacao, pedirRemarcacao, editarRemarcacao, remarcarAtendimento,
    fila, resolverFila,
    arrastando, alvoSolta, iniciarArrasto, encerrarArrasto, marcarAlvo,
    conversas, conversaDe, conversasErro, conversasPrecisaEntrar, conversasCarregadas, recarregarConversas,
    convSel, selecionarConversa, abaConv, threadDe, threadCarregando,
    enviar, enviando, assumir, devolver, abrirNoWhatsApp, caderno, recarregarCaderno, responderA,
    cadastro, cadastroErro, cadastroCarregado,
    profissionalDe, clienteDe, nomeDoProfissional, nomeDoCliente,
    pidAgenda, atendeNoDia, podeComecarEm,
    profAtivo, alternarProf, criarProfissional, editarProfissional, svcAtivo, alternarSvc, cliAtivo, alternarCli, editarCliente, criarCliente,
    servicos, servicoDe, nomeServico, editarServico, criarServico, excluirServico,
    filtroSvc, filtroCli,
    fiscal, aplicarFiscal, recarregarFiscal,
    assinatura, recarregarAssinatura, assinarPlano, abrirPortalDeCobranca, cobrancaOcupada,
    emissao, emitirRecibos, fecharEmissao, emissoesFeitas, clientesGravados,
    notaDe, emitirNota, emitirPendentes, cancelarNota, fechamento, mesDoFechamento, emitiveis,
    loteAberto, pedirLote, fecharLote, confirmarLote,
    ajustes.assistente, setAssistente, ajustesErro, recarregarAjustes, ajustesPrecisaEntrar, ajustesCarregados, setNomeDoNegocio,
    faqs, faqsErro, faqsOcupado, salvarFaq, removerFaq,
    canal, statusMaisa, recarregarCanal, canalErro, canalOcupado, canalFaltando, qrcode, codigo, numeroPareando, conectarCanal, renovarCodigo, desconectarCanal, trocarNumero, definirDonoDoCanal,
    semana, semanaErro, semanaCarregada, alternarDia, setHorario,
    ajustes.cfg, alternarCfg,
    salvo, salvar, gravacao,
    diaSel, rascunho, rascunhoEstado, novoAgendamento, editarRascunho, confirmarRascunho, descartarRascunho,
    vagasDe, proximoVago, novoEmLinha, pedirNovo,
    google, googleDe, conectarGoogle, desconectarGoogle, googleOcupado,
    bloqueiosDoDia, bloqueioPorId, leituraAgenda, recarregarAgenda,
    railAberto,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
