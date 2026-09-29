/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — o cadastro do negócio.
 *
 * Quem é o profissional, quanto custa o serviço, qual o telefone do cliente. Hoje
 * responde `adaptadores/saida/demo` (fixtures em memória, um negócio só); amanhã
 * responde o Supabase, filtrando por inquilino.
 *
 * ⚠️ TODO método recebe ContextoTenant, mesmo que o adaptador de demonstração ignore.
 * É a costura multi-tenant: o dia em que o banco entrar, a assinatura já está certa e
 * não existe caso de uso lendo cadastro sem dizer de quem.
 *
 * Assíncrono mesmo lendo de um array: um repositório que hoje é síncrono e amanhã bate
 * no banco quebraria toda a cadeia de chamadas na migração.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "../../dominio/tenant";
import type { Negocio } from "../../dominio/negocio";
import type { CategoriaServico, Profissional, Servico } from "../../dominio/catalogo";
import type { Cliente } from "../../dominio/clientes";
import type { Expediente } from "../../dominio/expediente";

/* ─────────────────────────────────────────────────────────────────────────────
 * OS RASCUNHOS — o que se manda gravar, que não é o mesmo que se lê.
 *
 * `Servico` e `Profissional` (o que se LÊ) carregam campos derivados que o banco calcula:
 * `profissionalIds`, `atendimentosMes`, `expediente`. Aceitá-los na escrita seria
 * convidar quem chama a mandar um `atendimentosMes` inventado — e o adaptador teria que
 * ignorá-lo em silêncio, que é como um campo vira mentira.
 *
 * O padrão é o do `RascunhoDeFaq` (`repositorio-faqs.ts`): tipo próprio, `id` opcional, e
 * a ausência dele significando "criar".
 * ────────────────────────────────────────────────────────────────────────────── */

export type RascunhoDeServico = {
  /** Ausente = criar. Presente = editar aquela linha, se ela for deste inquilino. */
  id?: string;
  nome: string;
  categoria: CategoriaServico;
  /** Reais. */
  preco: number;
  /** Minutos. */
  duracao: number;
  /** Ausente na criação = nasce ativo, que é o que o dono espera de algo que acabou de
   *  cadastrar. Na edição, ausente = não mexe. */
  ativo?: boolean;
};

export type RascunhoDeProfissional = {
  id?: string;
  nome: string;
  /** Ausente = mantém o que está lá (ou o default do banco, na criação). */
  papel?: string;
  ativo?: boolean;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * O RASCUNHO DE CLIENTE — e por que ele é o único com `id` OBRIGATÓRIO.
 *
 * Porque criar cliente já tem porta, e é outra: `garantirCliente`, lá embaixo, que
 * deduplica por telefone. Um `id?` aqui daria DOIS caminhos de criação com regras
 * diferentes — este sem deduplicação nenhuma — e o resultado seria o mesmo cliente duas
 * vezes no cadastro, um pelo WhatsApp e um pela tela. A dedução por telefone não é
 * detalhe do outro método: é o que faz a MAISA reconhecer quem está falando.
 *
 * ⚠️ `teste` NÃO ENTRA, de propósito. Marcar um tomador como teste faz a nota REAL dele
 * se cancelar sozinha segundos depois de autorizada (ver `dominio/clientes.ts`). É um
 * interruptor de comportamento fiscal, e ele não pertence ao mesmo formulário onde se
 * conserta um telefone digitado errado — um clique torto ali cancela documento de gente
 * de verdade. Quando precisar de tela, que seja tela própria, com a consequência escrita.
 *
 * ⚠️ `desde` também não. A tela lê `"ago/2026"` (formato de exibição, montado pelo
 * adaptador), não a `date` da coluna — aceitá-lo aqui obrigaria a desfazer uma
 * formatação, e um mês digitado errado reescreveria a antiguidade do cliente sem que
 * ninguém tivesse pedido.
 * ────────────────────────────────────────────────────────────────────────────── */

export type RascunhoDeCliente = {
  /** Obrigatório: esta porta só EDITA. Ver o bloco acima. */
  id: string;
  nome: string;
  /** Como a pessoa escreveu. É o que gera `telefone_chave`, por onde o agente reconhece.
   *  `""` = sem telefone (vira `null` no banco, desde a 029): cliente cadastrado à mão só
   *  para o recibo, que a Rebots emite com CPF e nada mais. */
  telefone: string;
  /** `null` = apagar o que estava lá. Ausente = não mexe. */
  email?: string | null;
  cpf?: string | null;
  canal?: "Online" | "Presencial";
  /** `null` = sem serviço habitual. */
  servicoId?: string | null;
  ativo?: boolean;
  /** Preço próprio da sessão. `null` = volta a valer o do serviço. Ausente = não mexe. */
  valorSessao?: number | null;
};

export interface RepositorioNegocio {
  negocio(t: ContextoTenant): Promise<Negocio>;

  profissional(t: ContextoTenant, id: string): Promise<Profissional | null>;
  servico(t: ContextoTenant, id: string): Promise<Servico | null>;
  cliente(t: ContextoTenant, id: string): Promise<Cliente | null>;
  expediente(t: ContextoTenant, profissionalId: string): Promise<Expediente | null>;

  /* ─────────────────── as listas ───────────────────
   * "Quem é o profissional X" serve aos casos de uso; "quem são os profissionais" serve
   * às TELAS — a grade da Agenda monta uma coluna por pessoa, o catálogo lista serviços,
   * o select do rascunho lista clientes. É leitura de cadastro igual às de cima, e por
   * isso mora na mesma porta em vez de virar um segundo repositório.
   *
   * Estão aqui, e não como funções soltas do adaptador Supabase, por uma razão concreta:
   * enquanto elas fizerem parte da porta, o adaptador demo TAMBÉM tem que respondê-las —
   * e é isso que mantém o app inteiro de pé num ambiente sem banco, que é onde se afina
   * a MAISA por `curl`. Uma função só do adaptador real teria matado o modo demo em
   * silêncio, e o sintoma seria a Agenda abrir sem nenhuma coluna. */

  profissionais(t: ContextoTenant): Promise<Profissional[]>;
  servicos(t: ContextoTenant): Promise<Servico[]>;
  clientes(t: ContextoTenant): Promise<Cliente[]>;

  /**
   * As agendas que este inquilino pode operar — a allowlist.
   *
   * Existe porque `profissionalId` chega de fora (query string, corpo do POST e, em
   * breve, de um argumento escolhido por um modelo de linguagem). Sem allowlist, esse
   * campo vira escrita livre na coluna `profissional_id`.
   */
  agendasPermitidas(t: ContextoTenant): Promise<string[]>;

  /**
   * Quem o cliente é, a partir do telefone.
   *
   * É a porta por onde o agente de WhatsApp reconhece quem está falando antes de mexer
   * na agenda. Está aqui — e não numa interface futura — porque é o adaptador de dados
   * que precisa saber respondê-la, e escrever a pergunta agora é o que garante que o
   * banco nasça com índice no telefone.
   */
  clientePorTelefone(t: ContextoTenant, telefone: string): Promise<Cliente | null>;

  /**
   * Trocar o nome do negócio.
   *
   * ⚠️ ESTE CAMPO SAI NA VOZ DA MAISA — o agente diz "sou a assistente de ___" em toda
   * conversa e o lembrete diz "no ___". Ver o bloco em `dominio/negocio.ts`.
   *
   * ── POR QUE ELE PRECISOU EXISTIR ──
   * Até 14/08/2026 o nome só era escrito por `criar_negocio()`, no instante da criação, e
   * NENHUMA TELA o editava. Quem começasse com o nome errado ficava com ele para sempre —
   * e como o campo só aparece para o cliente final (no WhatsApp), o dono podia passar
   * meses sem descobrir. A RLS (`gestao atualiza`, `003_rls.sql:311`) já permitia a
   * escrita desde o começo; o que faltava era caminho no código.
   *
   * ── O CONTRATO ──
   * Devolve o `Negocio` DEPOIS de gravado, não o nome que foi mandado: a normalização
   * (espaço colapsado) acontece do outro lado, e a tela precisa pintar o que ficou no
   * banco. Mesma razão do `AjustarAssistente`.
   *
   * ⚠️ Só dono e gestor podem — é a RLS que decide, não este código. O adaptador tem que
   * DISTINGUIR "não tinha permissão" de "gravou", porque um `update` barrado por RLS
   * volta sem erro e sem linha: o silêncio é o modo de falha, não a exceção.
   */
  renomear(t: ContextoTenant, nome: string): Promise<Negocio>;

  /**
   * Trocar a foto de perfil do negócio (29/09/2026). `null` apaga, e a tela volta ao avatar
   * sorteado. Mesmo contrato do `renomear`: devolve o `Negocio` relido, e escrita barrada pela
   * RLS (zero linhas) é `NaoEncontrado`, nunca sucesso calado. Ver `FOTO_MAX` em `dominio/negocio.ts`.
   */
  trocarFoto(t: ContextoTenant, foto: string | null): Promise<Negocio>;

  /* ─────────────────────── ESCREVER O CATÁLOGO ───────────────────────
   * Entraram em 15/08/2026, e a razão é do mesmo tipo do `renomear` acima: existia tela,
   * existia tabela, e não existia caminho entre as duas.
   *
   * `store.tsx` tinha `criarServico`, `editarServico` e `excluirServico` desde sempre —
   * e os três mexiam em `svcNovos`/`svcEdit`, que são estado do NAVEGADOR. O dono
   * ajustava o preço do Corte, via a lista mudar, dava F5, e o preço voltava. Sem rota,
   * sem porta, sem erro: a escrita não existia e a tela não sabia.
   *
   * Isso vira bloqueio de produto no onboarding — a etapa "confirme o que você faz" pede
   * exatamente para editar o catálogo semeado por `criar_negocio()`, e um wizard que não
   * grava é pior que wizard nenhum.
   *
   * ── SERVIÇO SE APAGA; PROFISSIONAL NÃO. A ASSIMETRIA É DO ESQUEMA ──
   *
   * Não é gosto, é o que as FKs de `002_multitenant.sql` fazem:
   *
   *   `atendimentos.servico_id`      — SEM FK. É snapshot, ao lado de `servico_nome` e
   *                                    `servico_valor`, e o comentário da coluna diz o
   *                                    porquê: "o domínio JÁ assume que esse id pode não
   *                                    resolver". Apagar o serviço não toca o passado.
   *   `atendimentos.profissional_id` — FK com **`on delete cascade`**. Apagar a pessoa
   *                                    APAGA OS ATENDIMENTOS DELA. Faturamento fechado,
   *                                    nota emitida, tudo.
   *
   * Por isso `removerServico` existe e `removerProfissional` não. Quem sai da equipe vira
   * `ativo: false` — some da lista e da boca da MAISA, e o histórico fica de pé. */

  /**
   * Cria ou atualiza um serviço, e devolve a linha como ficou.
   *
   * ⚠️ Devolve o estado GRAVADO, nunca o que foi mandado — a normalização acontece do
   * outro lado da porta e a tela precisa pintar o banco. Mesma disciplina do `renomear`.
   *
   * ⚠️ O adaptador tem que DISTINGUIR "não era deste inquilino" de "gravou". Um `update`
   * com id de outro tenant não dá erro: dá sucesso com zero linhas. Sem pedir as linhas
   * de volta, a tela diz "salvo" e reverte no reload.
   *
   * Serviço NOVO nasce ligado a quem atende (`servicos_profissionais`), como
   * `provisionar_negocio` faz. Serviço sem ninguém que o faça já deu tela branca na
   * gaveta uma vez — está escrito no `005_provisionar.sql`.
   */
  salvarServico(t: ContextoTenant, rascunho: RascunhoDeServico): Promise<Servico>;

  /**
   * Apaga o serviço de vez.
   *
   * Seguro por construção do esquema, não por sorte: `atendimentos` guarda `servico_nome`
   * e `servico_valor` e o `servico_id` dele NÃO tem FK, então o faturamento fechado
   * continua fechado. `clientes.servico_id` cai para nulo (`on delete set null`) e
   * `servicos_profissionais` some junto (`cascade`).
   *
   * ⚠️ Existe porque sem ele o "+ Serviço" é uma via de mão única: um clique errado deixa
   * um "Novo serviço" morto na lista para sempre. `ativo: false` continua sendo o certo
   * para "não faço mais isso" — apagar é para o que nunca deveria ter sido criado.
   */
  removerServico(t: ContextoTenant, id: string): Promise<void>;

  /**
   * Cria ou atualiza um profissional, e devolve a linha como ficou.
   *
   * O primeiro é criado por `criar_negocio()`, que ADIVINHA o nome a partir do cadastro
   * do usuário — `raw_user_meta_data.full_name`, ou o que vem antes do @ do e-mail. Foi
   * assim que um negócio de verdade passou a ter um profissional chamado
   * `bruno.vaskevicius`. Corrigir isso exigia SQL na mão até esta porta existir.
   *
   * ⚠️ Não mexe em expediente. `expediente_folga`/`de`/`ate` mandam na grade inteira e
   * merecem caso de uso próprio, com a mesma seriedade que `AjustarHorarios` já tem para
   * o horário anunciado. Deixá-los aqui num campo opcional convidaria a tela de cadastro
   * a fechar a agenda de alguém sem querer.
   */
  salvarProfissional(t: ContextoTenant, rascunho: RascunhoDeProfissional): Promise<Profissional>;

  /**
   * Atualiza um cliente e devolve a linha como ficou.
   *
   * ── POR QUE PRECISOU EXISTIR (24/08/2026) ──
   *
   * Porque NENHUMA tela escrevia cliente. As duas que o mostram — Clientes e Faturamento —
   * abriam a gaveta em modo leitura, e o único controle era um liga/desliga que gravava em
   * `db.cliAtivo`, no `localStorage`. É a mesma história do catálogo em 15/08/2026, e com
   * dois agravantes próprios:
   *
   *   • **O telefone é a identidade.** `telefone_chave` é por onde o agente de WhatsApp
   *     reconhece quem está falando. Um dígito errado no cadastro faz a MAISA tratar
   *     cliente antigo como desconhecido — e não havia como consertar sem SQL.
   *   • **O CPF é o que libera a nota.** Sem ele a prefeitura recusa, então `emitiveis` tira
   *     a pessoa do lote (ver `store.tsx`). A tela dizia "sem CPF — a prefeitura recusa sem
   *     ele" e não oferecia onde escrever o CPF. Aviso sem porta é o defeito que a tela de
   *     Contatos já tinha corrigido uma vez.
   *
   * ⚠️ O ADAPTADOR TEM QUE DISTINGUIR "não era deste inquilino" DE "gravou". Um `update`
   * com id de outro tenant não dá erro: dá sucesso com zero linhas. Mesma disciplina do
   * `salvarServico` — sem pedir as linhas de volta, a tela diz "salvo" e reverte no reload.
   *
   * ⚠️ NÃO DEDUPLICA — E O CASO DE USO TAMBÉM NÃO. A coluna não tem `unique` de propósito
   * ("número repetido acontece em família", logo abaixo), e `clientePorTelefone` desempata
   * pegando o cadastro mais ANTIGO, deterministicamente. Recusar telefone repetido aqui ou
   * em `criarAjustarCliente` tornaria ineditável — inclusive para renomear ou desativar —
   * todo cliente que já divide número com um parente. Quem avisa que dois cadastros dividem
   * o número é a GAVETA, que tem o cadastro inteiro em mãos e diz isso sem impedir nada.
   */
  atualizarCliente(t: ContextoTenant, rascunho: RascunhoDeCliente): Promise<Cliente>;

  /**
   * Acha o cliente por telefone ou cria.
   *
   * ⚠️ Ele quebra a simetria do arquivo (o resto aqui é leitura, fora o `renomear`
   * acima), então o motivo precisa estar escrito: sem ele, quem marca pelo WhatsApp
   * nunca entra no cadastro.
   * O agente identificava o desconhecido como `lead:<telefone>` — uma string que o
   * `PARECE_UUID` do adaptador Supabase recusa de propósito, e que portanto nunca ia
   * resolver em cliente nenhum. O efeito era duplo e invisível: a tela de Clientes não
   * crescia com o canal que mais traz gente, e `atendimentos.cliente_id` ficava nulo —
   * então `v_clientes.valor` somava zero e o faturamento do mês não fechava.
   *
   * Mora nesta porta, e não numa porta de escrita nova, porque é o MESMO agregado das
   * leituras acima (`cliente`, `clientes`, `clientePorTelefone`): criar um cliente é
   * cadastro. Uma segunda porta só para isto obrigaria os dois adaptadores a implementar
   * duas interfaces para falar da mesma tabela.
   *
   * ⚠️ CONTRATO — `telefone` é obrigatório e é a chave de deduplicação. Chamar sem ele
   * criaria um cliente novo a cada mensagem da mesma pessoa. Quem não tem telefone não
   * chama este método: passa `clienteId: null` no espelho e deixa o snapshot preservar
   * nome e telefone (é para isso que as colunas `cliente_nome`/`cliente_tel` existem).
   *
   * Devolve o cliente EXISTENTE quando o telefone já casa — nunca duplica, e nunca
   * sobrescreve um nome que o dono digitou à mão com o que o modelo entendeu de uma
   * frase solta.
   */
  garantirCliente(t: ContextoTenant, p: { nome: string; telefone: string }): Promise<Cliente | null>;

  /**
   * Cria direto, sem deduplicar — a escrita do botão "Novo cliente" (24/09/2026).
   *
   * Existe porque `garantirCliente` só cria COM telefone, e o dono cadastra à mão gente de
   * quem só tem nome e CPF (o recibo da Rebots pede CPF, não telefone). Quem deduplica é o
   * caso de uso `cadastrarCliente`, antes de chamar: com telefone, olha `clientePorTelefone`.
   *
   * `telefone: ""` e `cpf: null` são "não tem". Ao contrário do `garantirCliente`, LANÇA
   * quando o banco recusa: aqui não há agendamento a proteger, e devolver nulo faria a tela
   * dizer "cadastrado" sem ter cadastrado.
   */
  criarCliente(
    t: ContextoTenant,
    p: { nome: string; telefone: string; cpf: string | null },
  ): Promise<Cliente>;
}
