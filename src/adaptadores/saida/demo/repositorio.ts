/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — `RepositorioNegocio` servido pelos fixtures.
 *
 * É o que faz os casos de uso rodarem hoje, sem banco. Ele IGNORA o `ContextoTenant`
 * que recebe, e isso é uma limitação declarada, não um esquecimento: existe um negócio
 * só. A assinatura já pede o contexto para que a troca por um repositório Supabase seja
 * um `new RepositorioSupabase()` em `src/composicao.ts` — e nada mais no app inteiro.
 *
 * O QUE MUDA QUANDO O BANCO ENTRAR (ver `supabase/` na raiz do repo):
 *   • tabelas `negocios`, `membros`, `profissionais`, `servicos`, `clientes`, com
 *     `tenant_id` em todas e RLS por membro do negócio;
 *   • `agendasPermitidas` vira `select id from profissionais where tenant_id = …`, e
 *     deixa de ser uma constante no código;
 *   • `clientePorTelefone` ganha índice — é a busca quente do agente de WhatsApp.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { RepositorioNegocio } from "@/nucleo/portas/saida/repositorio-negocio";
import type { Cliente } from "@/nucleo/dominio/clientes";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { NaoEncontrado } from "@/nucleo/dominio/erros";
import { NEGOCIO } from "./negocio";
import { COLUNAS_AGENDA, EQUIPE, EXPEDIENTE } from "./equipe";
import { SERVICOS } from "./catalogo";
import { CLIENTES } from "./clientes";

/* O nome do negócio de demonstração, editável.
 *
 * O fixture `NEGOCIO` é uma constante compartilhada — mutá-lo faria a mudança vazar para
 * todo módulo que o importa (a persona do agente, a saudação padrão do store), o que num
 * adaptador de demonstração é confusão pura: o dono renomeia numa aba e outra tela muda
 * sozinha. Guardar o nome AQUI mantém a mutação dentro deste adaptador, que é o único
 * que tem estado. Reinicia no processo, como todo o resto do demo. */
let nomeDemo = NEGOCIO.nome;
let fotoDemo: string | null = null;

/* Contador de ids do que se cria no modo demonstração.
 *
 * Prefixo `sv-demo-`/`pr-demo-` e não uuid de propósito: o `PARECE_UUID` do adaptador
 * Supabase recusa esses ids, então uma linha criada no demo NUNCA vai ser confundida com
 * uma do banco se alguém alternar de modo com o `localStorage` cheio. É a mesma lição do
 * `lead:<telefone>`, que era o contrário — um id inventado que o banco silenciosamente
 * nunca resolvia. */
let sequencia = 0;

export const repositorioDemo: RepositorioNegocio = {
  async negocio() {
    return { ...NEGOCIO, nome: nomeDemo, foto: fotoDemo };
  },

  /* Sem checagem de permissão: no demo existe um negócio e um usuário, e todo mundo é
   * dono. Quem prova a regra de "só dono ou gestor" é a RLS, e ela vive no Postgres —
   * imitá-la aqui daria uma segunda cópia da autorização, que é exatamente o que a
   * arquitetura deste repo não quer. */
  async renomear(_t, nome) {
    nomeDemo = nome;
    return { ...NEGOCIO, nome: nomeDemo, foto: fotoDemo };
  },

  async trocarFoto(_t, foto) {
    fotoDemo = foto;
    return { ...NEGOCIO, nome: nomeDemo, foto: fotoDemo };
  },

  async profissional(_t, id) {
    return EQUIPE.find((p) => p.id === id) ?? null;
  },

  async servico(_t, id) {
    return SERVICOS.find((s) => s.id === id) ?? null;
  },

  async cliente(_t, id) {
    return CLIENTES.find((c) => c.id === id) ?? null;
  },

  async expediente(_t, profissionalId) {
    return EXPEDIENTE[profissionalId] ?? null;
  },

  /* As listas. Cópias rasas, não os arrays em si: devolver a referência do fixture deixa
   * quem consome mutar o "banco" — e um `.sort()` numa tela reordenaria o catálogo para o
   * processo inteiro, inclusive para o agente de WhatsApp. Barato aqui, e é o
   * comportamento que o adaptador real tem de graça (cada consulta traz linhas novas). */

  async profissionais() {
    return [...EQUIPE];
  },

  async servicos() {
    return [...SERVICOS];
  },

  /* ── ESCREVER O CATÁLOGO ────────────────────────────────────────────────────
   * MUTA OS FIXTURES, pela mesma razão do `garantirCliente` lá embaixo: aqui o fixture É
   * o banco. Contradiz a nota das listas acima ("cópias rasas, para quem consome não
   * mutar") de propósito — lá o `[...]` protege de uma tela que faz `.sort()`; aqui
   * escrever é o comportamento certo.
   *
   * Sem isto, o wizard de onboarding não teria como ser exercitado sem Supabase — e o
   * modo demonstração existe justamente para afinar fluxo antes de haver banco.
   *
   * ⚠️ Nenhuma checagem de permissão nem de inquilino, como no `renomear` acima: no demo
   * existe um negócio e todo mundo é dono. Quem prova o isolamento é a RLS, que vive no
   * Postgres — imitá-la aqui daria uma segunda cópia da autorização. */

  async salvarServico(_t, r) {
    const i = r.id ? SERVICOS.findIndex((s) => s.id === r.id) : -1;

    if (r.id && i < 0) throw new NaoEncontrado("Serviço");

    if (i >= 0) {
      const atual = SERVICOS[i];
      const novo = {
        ...atual,
        nome: r.nome,
        categoria: r.categoria,
        preco: r.preco,
        duracao: r.duracao,
        ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
      };
      SERVICOS[i] = novo;
      return novo;
    }

    const novo = {
      id: `sv-demo-${++sequencia}`,
      nome: r.nome,
      categoria: r.categoria,
      preco: r.preco,
      duracao: r.duracao,
      /* Ligado a todos os ativos, igual ao adaptador real — e pelo mesmo motivo escrito
       * lá: serviço sem ninguém que o faça abre a gaveta em branco. */
      profissionalIds: EQUIPE.filter((p) => p.ativo).map((p) => p.id),
      ativo: r.ativo ?? true,
    };
    SERVICOS.push(novo);
    return novo;
  },

  async removerServico(_t, id) {
    const i = SERVICOS.findIndex((s) => s.id === id);
    /* Silencioso quando não acha, igual ao adaptador real: o efeito pretendido já vale. */
    if (i >= 0) SERVICOS.splice(i, 1);
  },

  async salvarProfissional(_t, r) {
    const i = r.id ? EQUIPE.findIndex((p) => p.id === r.id) : -1;

    if (r.id && i < 0) throw new NaoEncontrado("Profissional");

    if (i >= 0) {
      const atual = EQUIPE[i];
      const novo = {
        ...atual,
        nome: r.nome,
        ...(r.papel === undefined ? {} : { papel: r.papel }),
        ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
      };
      EQUIPE[i] = novo;
      return novo;
    }

    const id = `pr-demo-${++sequencia}`;
    const novo = {
      id,
      nome: r.nome,
      papel: r.papel ?? "Atendimento geral",
      atendimentosMes: 0,
      avaliacao: 0,
      comissao: 0,
      desde: MES_ATUAL,
      servicoIds: [],
      ativo: r.ativo ?? true,
      /* Os mesmos defaults das colunas de `profissionais` — `expediente_folga = {6}`,
       * `de = 9`, `ate = 19`. Expediente vazio faria a grade recusar todo horário dele. */
      horario: "Seg–Sáb 09–19",
      folga: "domingo",
      expediente: { folga: [6], de: 9, ate: 19 },
    };
    EQUIPE.push(novo);
    EXPEDIENTE[id] = novo.expediente;
    return novo;
  },

  async clientes() {
    return [...CLIENTES];
  },

  /* ── EDITAR CLIENTE ──
   * Muta o fixture, pela mesma razão do `salvarServico` acima: aqui o fixture É o banco.
   *
   * Sem isto, o laboratório não exercitaria o conserto de telefone errado — que é
   * justamente o caminho onde o defeito mora: `telefone_chave` é a identidade do cliente
   * no WhatsApp, e um dígito trocado faz a MAISA tratar cliente antigo como desconhecido.
   *
   * `NaoEncontrado` e não silêncio quando o id não casa: aqui zero linhas significa que a
   * EDIÇÃO se perdeu, e a tela precisa distinguir isso de "gravou". Mesma escolha do
   * `salvarServico`. */
  async atualizarCliente(_t, r) {
    const i = CLIENTES.findIndex((c) => c.id === r.id);
    if (i < 0) throw new NaoEncontrado("Cliente");

    const atual = CLIENTES[i];
    const novo: Cliente = {
      ...atual,
      nome: r.nome,
      telefone: r.telefone,
      /* `null` do rascunho é "apaga", e no domínio o vazio de `email`/`cpf` é `""` — não
       * `null`, que o tipo nem admite. É a mesma tradução que o `paraCliente` do adaptador
       * Supabase faz na volta (`l.email ?? ""`). */
      ...(r.email === undefined ? {} : { email: r.email ?? "" }),
      ...(r.cpf === undefined ? {} : { cpf: r.cpf ?? "" }),
      ...(r.canal === undefined ? {} : { canal: r.canal }),
      ...(r.servicoId === undefined ? {} : { servicoId: r.servicoId ?? "" }),
      ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
      ...(r.valorSessao === undefined ? {} : { valorSessao: r.valorSessao }),
    };
    CLIENTES[i] = novo;
    return novo;
  },

  async agendasPermitidas() {
    return COLUNAS_AGENDA;
  },

  async clientePorTelefone(_t, telefone) {
    // Compara só dígitos: o fixture guarda "(11) 98123-4567" e o WhatsApp vai mandar
    // "5511981234567". Os 8 últimos bastam — DDI e o nono dígito são justamente o que
    // varia entre as duas grafias do mesmo número.
    const alvo = soDigitos(telefone).slice(-8);
    if (alvo.length < 8) return null;
    return CLIENTES.find((c) => soDigitos(c.telefone).slice(-8) === alvo) ?? null;
  },

  /**
   * Acha ou cria — e aqui "criar" é MUTAR O FIXTURE, que é o único jeito de o modo
   * demonstração exercitar o caminho de verdade.
   *
   * ⚠️ Contradiz de propósito a nota das listas acima ("cópias rasas, para quem consome
   * não mutar o banco"). Lá o `[...]` protege o fixture de uma tela que faz `.sort()`;
   * aqui o fixture É o banco, e escrever nele é o comportamento correto. Sem isto, o
   * caminho "cliente novo marca pelo WhatsApp" não existiria no laboratório — e ele é
   * justamente o que decide a primeira impressão do produto.
   *
   * O preço: o cliente criado morre no fim do processo, como todo o resto do modo demo.
   * O "Esquecer tudo" do laboratório não o remove — quem quiser voltar ao estado limpo
   * reinicia o `next dev`.
   */
  async garantirCliente(t, p) {
    const existente = await repositorioDemo.clientePorTelefone(t, p.telefone);
    if (existente) return existente;
    if (soDigitos(p.telefone).length < 8) return null;

    const novo: Cliente = {
      id: `cl-demo-${soDigitos(p.telefone).slice(-8)}`,
      nome: p.nome.trim().slice(0, 120) || "Cliente",
      telefone: p.telefone,
      email: "",
      cpf: "",
      canal: "Online",
      ativo: true,
      desde: MES_ATUAL,
      servicoId: "",
      atendimentos: 0,
      valor: 0,
    };
    CLIENTES.push(novo);
    return novo;
  },

  async criarCliente(_t, p) {
    const novo: Cliente = {
      id: `cl-demo-${Date.now().toString(36)}`,
      nome: p.nome,
      telefone: p.telefone,
      email: "",
      cpf: p.cpf ?? "",
      canal: "Online",
      ativo: true,
      desde: MES_ATUAL,
      servicoId: "",
      atendimentos: 0,
      valor: 0,
    };
    CLIENTES.push(novo);
    return novo;
  },
};

/** `mar/2026` — o formato que `Cliente.desde` usa na tela (ver o adaptador Supabase). */
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const agora = new Date();
const MES_ATUAL = `${MESES_CURTOS[agora.getMonth()]}/${agora.getFullYear()}`;
