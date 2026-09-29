/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — `RepositorioNegocio` servido pelo Supabase. ⚠️ SÓ SERVIDOR.
 *
 * O par real do `saida/demo/repositorio.ts`. Mesma porta, mesmos tipos, mesma
 * assinatura — a troca é uma linha em `composicao.ts`. O que muda é que aqui o
 * `ContextoTenant` finalmente SERVE para alguma coisa: o adaptador demo recebia e
 * ignorava, porque existia um negócio só.
 *
 * ── LÊ DAS VIEWS, NÃO DAS TABELAS ──
 *
 * `v_negocio`, `v_profissionais`, `v_servicos`, `v_clientes` (arquivo
 * `supabase/004_visoes.sql`). Não é preferência de estilo: três campos do domínio
 * simplesmente NÃO EXISTEM como coluna e só as views sabem calculá-los —
 * `Profissional.atendimentosMes`, `Cliente.atendimentos` e `Cliente.valor` são contagens
 * da competência corrente, e `Profissional.servicoIds` / `Servico.profissionalIds` são a
 * agregação da tabela-ponte `servicos_profissionais`. O comentário do próprio
 * `v_clientes` diz, em voz alta: "isto é o que `RepositorioNegocio.cliente()` e
 * `.clientePorTelefone()` devem consultar".
 *
 * Ler a tabela crua em vez da view compila igual e devolve `atendimentos: 0` para todo
 * mundo — o tipo de erro que nenhum teste de tipo pega e que na tela parece "o mês está
 * fraco", não "a consulta está errada".
 *
 * ⚠️ As views são `security_invoker = true`. Com o cliente de SESSÃO isso significa que a
 * RLS do usuário se aplica dentro delas; com o cliente de SERVICE ROLE (caminho do
 * agente de WhatsApp) não se aplica nada, e o `.eq("tenant_id", …)` desta página é a
 * única fronteira. Ver `contexto-cliente.ts` e `admin.ts`. **Por isso todo método aqui
 * filtra por tenant, inclusive `negocio()`, que "obviamente" só tem uma linha.**
 *
 * ── SOBRE OS IDS ──
 *
 * No banco tudo é `uuid` (`gen_random_uuid()`). Os `"pr1"`, `"sv1"`, `"cl1"` existiam só
 * nos fixtures. Aqui nada traduz nem remapeia: `Profissional.id` passa a ser um uuid, e
 * quem assumia o formato antigo tinha que mudar junto — a regex `/^pr\d+$/` de
 * `nucleo/aplicacao/agenda.ts` e o `Record` de expediente chaveado por `pr1` são os dois
 * lugares que mudaram na mesma leva.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { RepositorioNegocio } from "@/nucleo/portas/saida/repositorio-negocio";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { Negocio } from "@/nucleo/dominio/negocio";
import type { CategoriaServico, Profissional, Servico } from "@/nucleo/dominio/catalogo";
import type { Cliente } from "@/nucleo/dominio/clientes";
import { soDigitos } from "@/nucleo/dominio/clientes";
import type { Expediente } from "@/nucleo/dominio/expediente";
import { FalhaDoProvedor, NaoEncontrado } from "@/nucleo/dominio/erros";
import { clienteDoContexto } from "./contexto-cliente";

/* ───────────────────────────── as linhas, como o banco devolve ─────────────────────────────
 * snake_case, `numeric` chegando como string, arrays de uuid. A tradução para camelCase e
 * para número acontece nos mapeadores abaixo, num lugar só. */

type LinhaNegocio = {
  tenant_id: string;
  nome: string;
  plano: string | null;
  preco_plano: string | number | null;
  proxima_cobranca: string | null;
  cartao_marca: string | null;
  cartao_final4: string | null;
  conversas_limite: number | null;
};

type LinhaProfissional = {
  id: string;
  nome: string;
  papel: string;
  avaliacao: string | number | null;
  comissao: string | number | null;
  desde: string | null;
  ativo: boolean;
  horario: string | null;
  folga: string | null;
  expediente_folga: number[] | null;
  expediente_de: string | number;
  expediente_ate: string | number;
  servico_ids: string[] | null;
  atendimentos_mes: number | null;
};

type LinhaServico = {
  id: string;
  nome: string;
  categoria: string;
  preco: string | number;
  duracao: number;
  ativo: boolean;
  profissional_ids: string[] | null;
};

type LinhaCliente = {
  id: string;
  nome: string;
  /** Nulo desde a 029: cliente cadastrado à mão só com nome e CPF. */
  telefone: string | null;
  /** Só existe depois da 030 — ver `COLS_CLIENTE`. */
  valor_sessao?: string | number | null;
  email: string | null;
  cpf: string | null;
  canal: string;
  ativo: boolean;
  desde: string | null;
  servico_id: string | null;
  teste: boolean;
  atendimentos: number | null;
  valor: string | number | null;
};

/* ───────────────────────────── conversões ─────────────────────────────
 * O driver do Postgres devolve `numeric` como STRING, de propósito (para não perder
 * precisão em float). `preco`, `valor`, `avaliacao`, `comissao` e as horas do expediente
 * são todos `numeric` — e o domínio pede `number`. Sem esta conversão, `preco` chega
 * como "100.00" e `fmt(preco)` monta "R$ 100.00" em vez de "R$ 100,00"; pior, qualquer
 * soma vira concatenação de string. */

const num = (v: string | number | null | undefined, padrao = 0): number => {
  if (v === null || v === undefined) return padrao;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
};

/** `2026-03-01` → `mar/2024`, que é o formato que `Profissional.desde` e `Cliente.desde`
 *  já mostravam na tela. A view devolve `date`; a apresentação é do adaptador. */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesAno(data: string | null): string {
  if (!data) return "";
  const [ano, mes] = data.split("T")[0].split("-");
  const i = Number(mes) - 1;
  if (!ano || i < 0 || i > 11) return "";
  return `${MESES[i]}/${ano}`;
}

/** `2026-08-05` → `05/08/2026`. `Negocio.proximaCobranca` é string de exibição. */
function dataBR(data: string | null): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("T")[0].split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

/**
 * `CategoriaServico` é união fechada (`"Recorrente" | "Pacote" | "Extra"`), e o banco tem
 * o mesmo `check`. Mas o TypeScript não sabe disso: `categoria` chega como `string`.
 * Um cast cego passaria valor inválido adiante e a tela renderizaria uma categoria que
 * não existe na lista de chips; degradar para "Extra" mantém a tela coerente.
 */
const CATEGORIAS_VALIDAS: CategoriaServico[] = ["Recorrente", "Pacote", "Extra"];
const categoria = (v: string): CategoriaServico =>
  (CATEGORIAS_VALIDAS as string[]).includes(v) ? (v as CategoriaServico) : "Extra";

/** Idem para o canal do cliente. */
const canal = (v: string): Cliente["canal"] => (v === "Presencial" ? "Presencial" : "Online");

/* ───────────────────────────── mapeadores linha → domínio ───────────────────────────── */

function paraNegocio(l: LinhaNegocio): Negocio {
  return {
    nome: l.nome,
    /* `assinaturas` entra na view por LEFT JOIN, e a RLS dela é mais estreita que a do
     * inquilino: para um `atendente` estas colunas voltam NULAS em vez de a linha
     * desaparecer (é o que o comentário da view explica). Então cada campo de cobrança
     * precisa de um fallback honesto — "—" e não "R$ 0,00", que pareceria um plano
     * grátis. */
    plano: l.plano ?? "—",
    precoPlano: num(l.preco_plano),
    proximaCobranca: dataBR(l.proxima_cobranca),
    /* O domínio quer a frase pronta ("Cartão final 4417"); a view devolve marca e
     * final4 separados, de propósito ("DADO, nunca apresentação"). Compor é daqui. */
    cartao: l.cartao_final4 ? `${l.cartao_marca ?? "Cartão"} final ${l.cartao_final4}` : "Nenhum cartão salvo",
    /* `conversas_limite` NULL significa ilimitado — é o que a coluna documenta. Traduzir
     * para 0 faria a tela anunciar "0 conversas" para quem tem o plano mais caro. */
    conversasPlano: l.conversas_limite === null ? "Ilimitadas" : `${l.conversas_limite}/mês`,
  };
}

function paraProfissional(l: LinhaProfissional): Profissional {
  return {
    id: l.id,
    nome: l.nome,
    papel: l.papel,
    atendimentosMes: l.atendimentos_mes ?? 0,
    avaliacao: num(l.avaliacao),
    comissao: num(l.comissao),
    desde: mesAno(l.desde),
    servicoIds: l.servico_ids ?? [],
    ativo: l.ativo,
    /* `horario`/`folga` são as FRASES de apresentação, e são anuláveis no banco. Quando
     * faltarem, monta a frase a partir do expediente estruturado — que é obrigatório.
     * O 002 avisa: "quando frase e número divergirem, manda o número". */
    horario: l.horario ?? frasePorExpediente(l),
    folga: l.folga ?? fraseDeFolga(l.expediente_folga ?? []),
    /* A regra, em número — é ela que a grade aplica (ver `dominio/catalogo.ts`).
     * Os defaults 9/19 batem com os da coluna no banco; eles só entram se o `numeric`
     * chegar ilegível, e nesse caso um expediente comercial é melhor palpite que 0–0,
     * que fecharia a agenda inteira. */
    expediente: {
      folga: l.expediente_folga ?? [],
      de: num(l.expediente_de, 9),
      ate: num(l.expediente_ate, 19),
    },
  };
}

const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Hora decimal (9.5) → "09:30"; inteira (9) → "09". */
const horaCurta = (h: number): string => {
  const inteira = Math.floor(h);
  const min = Math.round((h - inteira) * 60);
  return min === 0 ? String(inteira).padStart(2, "0") : `${String(inteira).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

function frasePorExpediente(l: Pick<LinhaProfissional, "expediente_folga" | "expediente_de" | "expediente_ate">): string {
  const folga = new Set(l.expediente_folga ?? []);
  const atende = [0, 1, 2, 3, 4, 5, 6].filter((d) => !folga.has(d));
  if (atende.length === 0) return "Sem expediente";
  const faixa = `${horaCurta(num(l.expediente_de))}–${horaCurta(num(l.expediente_ate))}`;
  // Sequência contígua (o caso comum: Seg–Sáb) vira faixa; buraco no meio vira lista.
  const contiguo = atende.every((d, i) => i === 0 || d === atende[i - 1] + 1);
  const dias = contiguo && atende.length > 1
    ? `${DIAS_CURTOS[atende[0]]}–${DIAS_CURTOS[atende[atende.length - 1]]}`
    : atende.map((d) => DIAS_CURTOS[d]).join(", ");
  return `${dias} ${faixa}`;
}

const NOMES_DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function fraseDeFolga(folga: number[]): string {
  if (folga.length === 0) return "sem folga fixa";
  return folga.map((d) => NOMES_DIA[d] ?? "?").join(" e ");
}

function paraServico(l: LinhaServico): Servico {
  return {
    id: l.id,
    nome: l.nome,
    categoria: categoria(l.categoria),
    preco: num(l.preco),
    duracao: l.duracao,
    profissionalIds: l.profissional_ids ?? [],
    ativo: l.ativo,
  };
}

function paraCliente(l: LinhaCliente): Cliente {
  return {
    id: l.id,
    nome: l.nome,
    telefone: l.telefone ?? "",
    email: l.email ?? "",
    cpf: l.cpf ?? "",
    canal: canal(l.canal),
    ativo: l.ativo,
    desde: mesAno(l.desde),
    servicoId: l.servico_id ?? "",
    atendimentos: l.atendimentos ?? 0,
    valor: num(l.valor),
    valorSessao: l.valor_sessao == null ? null : num(l.valor_sessao),
    /* `teste` é `not null default false` no banco, mas o campo do domínio é opcional.
     * Só propaga quando for true: um `teste: false` explícito em todo cliente faria o
     * store achar que a marca existe e vale checar. */
    ...(l.teste ? { teste: true as const } : {}),
  };
}

/* ───────────────────────────── colunas, escritas uma vez ─────────────────────────────
 * `select("*")` numa view parece inofensivo e não é: o dia em que alguém acrescentar
 * coluna à view, ela vem no payload — e as rotas devolvem isto ao navegador. Listar é o
 * que garante que "o que a tela recebe" seja uma decisão, não um efeito colateral. */

/**
 * A foto mora na TABELA `negocios`, fora da view `v_negocio`: recriar a view para acrescentar
 * uma coluna mexeria na leitura de plano e cobrança, que não tem nada com isso.
 *
 * ⚠️ `*` E TOLERANTE À COLUNA AUSENTE, pelo mesmo motivo do `COLS_CLIENTE`: a `foto` só existe
 * depois da `031_foto_do_negocio.sql`. Pedir a coluna pelo nome num banco sem ela derrubaria a
 * leitura do cadastro inteiro, e com ela o painel. Com `*`, antes da migração o campo só não vem.
 */
async function fotoDoNegocio(supabase: ReturnType<typeof clienteDoContexto>, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase.from("negocios").select("*").eq("id", tenantId).maybeSingle<{ foto?: string | null }>();
  if (error || !data) return null;
  return typeof data.foto === "string" && data.foto ? data.foto : null;
}

const COLS_NEGOCIO = "tenant_id, nome, plano, preco_plano, proxima_cobranca, cartao_marca, cartao_final4, conversas_limite";
const COLS_PROFISSIONAL =
  "id, nome, papel, avaliacao, comissao, desde, ativo, horario, folga, expediente_folga, expediente_de, expediente_ate, servico_ids, atendimentos_mes";
const COLS_SERVICO = "id, nome, categoria, preco, duracao, ativo, profissional_ids";
/* `*` e não a lista de colunas desde 24/09/2026: `valor_sessao` só existe depois da 030, e
 * nomeá-la aqui derrubaria TODA leitura de cliente num banco que ainda não rodou a
 * migração. Com `*`, antes dela o campo só não vem. */
const COLS_CLIENTE = "*";

/**
 * Um erro do PostgREST não é `null`.
 *
 * `.maybeSingle()` devolve `{ data: null, error: null }` para "não achei" e
 * `{ data: null, error: {...} }` para "a consulta falhou". Tratar os dois como `null`
 * (que é o que um `?? null` faz) transforma banco fora do ar em "esse cliente não
 * existe" — e o caso de uso segue adiante marcando horário com dado faltando.
 */
/**
 * A recusa do Postgres ao gravar cliente, em português de quem usa a tela.
 *
 * ⚠️ Existe porque a frase crua chegava ao toast: *"null value in column "telefone" of
 * relation "clientes" violates not-null constraint"* (24/09/2026). O detalhe técnico vai
 * para o log, onde quem mantém procura; a tela recebe o que fazer.
 */
function recusaDeCliente(error: { code?: string; message: string } | null): void {
  if (!error) return;
  const campo = /"(telefone|nome|cpf|email|valor_sessao)"|clientes_(\w+?)_check/.exec(error.message);
  const qual = campo?.[1] ?? campo?.[2];
  if (error.code === "23502" && qual === "telefone") {
    /* Só acontece num banco que ainda não rodou a 029 — o código já trata telefone como
     * opcional. O log diz qual arquivo rodar. */
    console.error("[supabase/repositorio] cliente sem telefone recusado: falta rodar supabase/029_cliente_sem_telefone.sql");
    throw new FalhaDoProvedor("Ainda não dá para salvar cliente sem telefone. Preencha o WhatsApp por enquanto.");
  }
  if (error.code === "23502" || error.code === "23514") {
    console.error(`[supabase/repositorio] cliente recusado (${error.code}): ${error.message}`);
    const rotulo: Record<string, string> = {
      telefone: "O telefone precisa dos 8 dígitos do número, com DDD.",
      nome: "Diga o nome do cliente.",
      valor: "O valor da sessão precisa ser um número entre 0 e 100 mil.",
      valor_sessao: "O valor da sessão precisa ser um número entre 0 e 100 mil.",
    };
    throw new FalhaDoProvedor(rotulo[qual ?? ""] ?? "Algum campo do cliente não foi aceito — confira e tente de novo.");
  }
}

function exigirSemErro(escopo: string, error: { message: string } | null): void {
  if (error) throw new FalhaDoProvedor(`Não foi possível ler ${escopo}: ${error.message}`);
}

/**
 * Este id tem forma de uuid?
 *
 * ⚠️ NÃO é paranoia de validação — é a diferença entre "não achei" e "explodiu".
 *
 * As colunas `id` de `profissionais`, `servicos` e `clientes` são `uuid`. Mandar uma string
 * que não é uuid num `.eq("id", …)` não devolve zero linhas: o Postgres recusa o CAST com
 * `22P02 invalid input syntax for type uuid`, o PostgREST devolve 400, e `exigirSemErro`
 * transforma isso em `FalhaDoProvedor` — que a rota vira 502.
 *
 * E ids que não são uuid chegam aqui pelo caminho NORMAL, não por ataque:
 *   • `lead:<telefone>` — o agente de WhatsApp usa isso para quem ainda não é cliente;
 *   • `sv-novo-<timestamp>` — serviço que o usuário criou na tela, que vive no localStorage;
 *   • `sv-google-<eventId>` / `cl-google-<eventId>` — as cópias gravadas no próprio evento,
 *     para um atendimento renderizar mesmo quando o catálogo não conhece o serviço;
 *   • `"pr1"`, `"sv1"`, `"cl1"` — qualquer localStorage gravado antes desta migração.
 *
 * Para o domínio, todos esses significam a MESMA coisa: "não existe no cadastro" — que é
 * exatamente o `null` que a porta promete. Devolver `null` mantém os fallbacks que já
 * existem funcionando (`cliente ?? clienteDoEvento(e)`); devolver 502 mata a operação.
 */
const PARECE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const repositorioSupabase: RepositorioNegocio = {
  async negocio(t: ContextoTenant): Promise<Negocio> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_negocio")
      .select(COLS_NEGOCIO)
      .eq("tenant_id", t.tenantId)
      .maybeSingle<LinhaNegocio>();

    exigirSemErro("o negócio", error);
    /* `negocio()` é o único método da porta sem `| null` no retorno: o app não faz
     * sentido sem inquilino. Lançar `NaoEncontrado` aqui é o certo — devolver um
     * `Negocio` vazio faria a tela abrir com "—" em tudo e ninguém saberia por quê. */
    if (!data) throw new NaoEncontrado("Negócio");
    return { ...paraNegocio(data), foto: await fotoDoNegocio(supabase, t.tenantId) };
  },

  /* ── A FOTO (29/09/2026) ────────────────────────────────────────────────────
   * Mesma disciplina do `renomear` logo abaixo: escreve na tabela, pede as linhas de volta e
   * relê o negócio inteiro. Ver `FOTO_MAX` em `dominio/negocio.ts`. */
  async trocarFoto(t: ContextoTenant, foto: string | null): Promise<Negocio> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("negocios")
      .update({ foto })
      .eq("id", t.tenantId)
      .select("id");

    exigirSemErro("a foto do negócio", error);
    if (!data || data.length === 0) {
      throw new NaoEncontrado("Negócio para trocar a foto (só dono ou gestor pode)");
    }
    return this.negocio(t);
  },

  /* ── RENOMEAR ───────────────────────────────────────────────────────────────
   * ⚠️ O `.select("id")` NÃO É DECORAÇÃO — ele é o que transforma silêncio em erro.
   *
   * A RLS de `negocios` (`gestao atualiza`, `003_rls.sql:311`) só deixa dono e gestor
   * escreverem. Um `update` que a política barra não devolve erro: ele devolve SUCESSO
   * com zero linhas afetadas. Sem pedir as linhas de volta, um membro comum trocaria o
   * nome na tela, veria "salvo", recarregaria e encontraria o nome antigo — o mesmo tipo
   * de defeito que fez a MAISA passar meses configurada e ignorando a configuração.
   *
   * `select` vazio aqui tem duas causas possíveis, e as duas merecem barulho: quem pediu
   * não é dono nem gestor, ou o negócio não existe. `NaoEncontrado` cobre as duas com
   * honestidade — não sabemos qual foi, e fingir que sabemos daria a frase errada.
   *
   * Escreve na TABELA `negocios`, mas relê pela VIEW `v_negocio` (via `this.negocio`):
   * a view é quem junta plano, cobrança e cartão, e a tela espera o `Negocio` inteiro. */
  async renomear(t: ContextoTenant, nome: string): Promise<Negocio> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("negocios")
      .update({ nome })
      .eq("id", t.tenantId)
      .select("id");

    exigirSemErro("o nome do negócio", error);
    if (!data || data.length === 0) {
      throw new NaoEncontrado("Negócio para renomear (só dono ou gestor pode)");
    }
    return this.negocio(t);
  },

  /* ── ESCREVER O CATÁLOGO ────────────────────────────────────────────────────
   * Os dois métodos abaixo repetem a disciplina do `renomear`, e a repetição é o ponto:
   * TODA escrita deste arquivo termina em `.select("id")` e trata zero linhas como
   * `NaoEncontrado`.
   *
   * A RLS de `servicos` e `profissionais` é a uniforme do `003_rls.sql` — qualquer membro
   * escreve, mas só nas linhas do próprio inquilino (`using tenant_id in
   * negocios_do_usuario()`). Um `update` com id de OUTRO negócio não dá erro: dá sucesso
   * com zero linhas. É o mesmo silêncio de sempre, com outra causa.
   *
   * ⚠️ O `.eq("tenant_id")` no update NÃO é redundante com a RLS. No caminho do agente o
   * cliente é service role e a RLS está DESLIGADA (ver `contexto-cliente.ts`) — ali o
   * filtro no código é a única barreira. Escrever a consulta como se a RLS não existisse
   * é o que faz ela continuar correta quando ela realmente não existe. */

  async salvarServico(t, r): Promise<Servico> {
    const supabase = clienteDoContexto(t);

    const campos = {
      nome: r.nome,
      categoria: r.categoria,
      preco: r.preco,
      duracao: r.duracao,
      ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
    };

    if (r.id) {
      if (!PARECE_UUID.test(r.id)) {
        /* Id que não é uuid nunca existiu no banco. Deixar seguir daria
         * `22P02 invalid input syntax`, um 502 e uma frase sobre sintaxe de tipo para
         * quem só queria salvar um preço. Ver o bloco do `PARECE_UUID` acima. */
        throw new NaoEncontrado("Serviço");
      }
      const { data, error } = await supabase
        .from("servicos")
        .update(campos)
        .eq("id", r.id)
        .eq("tenant_id", t.tenantId)
        .select("id");

      exigirSemErro("o serviço", error);
      if (!data || data.length === 0) throw new NaoEncontrado("Serviço deste negócio");

      const salvo = await repositorioSupabase.servico(t, r.id);
      if (!salvo) throw new NaoEncontrado("Serviço");
      return salvo;
    }

    const { data, error } = await supabase
      .from("servicos")
      .insert({ tenant_id: t.tenantId, ...campos, ativo: r.ativo ?? true })
      .select("id");

    exigirSemErro("o serviço", error);
    const novoId = (data as { id: string }[] | null)?.[0]?.id;
    /* Insert barrado pelo `with check` da RLS também volta sem linha. Aqui isso não é
     * "não achei" — é "não pude criar no negócio que você disse ser seu". */
    if (!novoId) throw new NaoEncontrado("Serviço recém-criado (o negócio é seu?)");

    /* ⚠️ SERVIÇO NOVO PRECISA DE QUEM O FAÇA. `provisionar_negocio` liga cada serviço
     * semeado ao profissional criado junto, e o comentário de lá explica por quê: serviço
     * sem ninguém na tabela-ponte abre a gaveta em branco, porque a tela monta "Quem faz"
     * a partir do primeiro id. Ligar a TODOS os ativos é o palpite certo — num negócio de
     * uma pessoa é o único, e num de várias é o que o dono corrige depois. */
    const { data: ativos, error: erroAtivos } = await supabase
      .from("profissionais")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .eq("ativo", true);

    exigirSemErro("a equipe do serviço", erroAtivos);

    const vinculos = (ativos ?? []).map((p) => ({
      tenant_id: t.tenantId,
      servico_id: novoId,
      profissional_id: (p as { id: string }).id,
    }));

    if (vinculos.length > 0) {
      const { error: erroVinculo } = await supabase.from("servicos_profissionais").insert(vinculos);
      /* Não lança: o serviço JÁ existe e aparece na lista. Falhar aqui e propagar deixaria
       * a tela com um erro depois de a linha ter sido criada — o dono tentaria de novo e
       * teria dois serviços. O log é alto porque isto é RLS ou corrida, não caso de borda. */
      if (erroVinculo) {
        console.error(
          `[supabase/repositorio] serviço ${novoId} criado sem vínculo de profissional no inquilino ${t.tenantId}: ${erroVinculo.message}`,
        );
      }
    }

    const salvo = await repositorioSupabase.servico(t, novoId);
    if (!salvo) throw new NaoEncontrado("Serviço recém-criado");
    return salvo;
  },

  async removerServico(t, id): Promise<void> {
    /* Id que não é uuid nunca existiu no banco — some sem barulho, porque o efeito
     * pretendido ("essa linha não existe mais") já vale. É a mesma leniência das leituras
     * com `PARECE_UUID`, e aqui ela é ainda mais defensável. */
    if (!PARECE_UUID.test(id)) return;

    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("servicos")
      .delete()
      .eq("id", id)
      .eq("tenant_id", t.tenantId)
      .select("id");

    exigirSemErro("apagar o serviço", error);
    /* Zero linhas aqui é "não era seu" ou "já não existia". Nenhum dos dois merece
     * exceção: o dono pediu que sumisse, e sumiu (ou nunca esteve). Diferente do
     * `salvarServico`, onde zero linhas significa que a EDIÇÃO se perdeu em silêncio —
     * ali o silêncio engana, aqui ele coincide com o resultado desejado. */
    if (!data || data.length === 0) {
      console.warn(`[supabase/repositorio] delete de serviço ${id} não afetou linha no inquilino ${t.tenantId}`);
    }
  },

  async salvarProfissional(t, r): Promise<Profissional> {
    const supabase = clienteDoContexto(t);

    const campos = {
      nome: r.nome,
      ...(r.papel === undefined ? {} : { papel: r.papel }),
      ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
    };

    if (r.id) {
      if (!PARECE_UUID.test(r.id)) throw new NaoEncontrado("Profissional");
      const { data, error } = await supabase
        .from("profissionais")
        .update(campos)
        .eq("id", r.id)
        .eq("tenant_id", t.tenantId)
        .select("id");

      exigirSemErro("o profissional", error);
      if (!data || data.length === 0) throw new NaoEncontrado("Profissional deste negócio");

      const salvo = await repositorioSupabase.profissional(t, r.id);
      if (!salvo) throw new NaoEncontrado("Profissional");
      return salvo;
    }

    /* ⚠️ O EXPEDIENTE NÃO VEM DO RASCUNHO, E ISSO É DELIBERADO. As colunas têm default no
     * banco (`expediente_folga = {6}`, `de = 9`, `ate = 19`) e é ele que vale para quem
     * nasce aqui. Um profissional novo com expediente vazio faria a grade recusar TODO
     * horário dele — a agenda pareceria quebrada, e o motivo estaria numa coluna que a
     * tela de cadastro nem mostra. Mudar expediente é caso de uso próprio; ver a porta. */
    const { data, error } = await supabase
      .from("profissionais")
      .insert({
        tenant_id: t.tenantId,
        ...campos,
        ativo: r.ativo ?? true,
        desde: new Date().toISOString().slice(0, 10),
      })
      .select("id");

    exigirSemErro("o profissional", error);
    const novoId = (data as { id: string }[] | null)?.[0]?.id;
    if (!novoId) throw new NaoEncontrado("Profissional recém-criado (o negócio é seu?)");

    const salvo = await repositorioSupabase.profissional(t, novoId);
    if (!salvo) throw new NaoEncontrado("Profissional recém-criado");
    return salvo;
  },

  async profissional(t, id) {
    if (!PARECE_UUID.test(id)) return null;
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_profissionais")
      .select(COLS_PROFISSIONAL)
      .eq("tenant_id", t.tenantId)
      .eq("id", id)
      .maybeSingle<LinhaProfissional>();

    exigirSemErro("o profissional", error);
    return data ? paraProfissional(data) : null;
  },

  async servico(t, id) {
    if (!PARECE_UUID.test(id)) return null;
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_servicos")
      .select(COLS_SERVICO)
      .eq("tenant_id", t.tenantId)
      .eq("id", id)
      .maybeSingle<LinhaServico>();

    exigirSemErro("o serviço", error);
    return data ? paraServico(data) : null;
  },

  async cliente(t, id) {
    if (!PARECE_UUID.test(id)) return null;
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_clientes")
      .select(COLS_CLIENTE)
      .eq("tenant_id", t.tenantId)
      .eq("id", id)
      .maybeSingle<LinhaCliente>();

    exigirSemErro("o cliente", error);
    return data ? paraCliente(data) : null;
  },

  /* ── as listas ──
   * Delegam para as funções no fim do arquivo. Elas ficaram exportadas à parte porque
   * nasceram antes de entrarem na porta, e continuam exportadas porque são úteis a
   * qualquer rota que precise de UMA das listas sem pagar as cinco consultas do
   * `lerCadastro`. */

  async profissionais(t) {
    return listarProfissionais(t);
  },

  async servicos(t) {
    return listarServicos(t);
  },

  async clientes(t) {
    return listarClientes(t);
  },

  async expediente(t, profissionalId): Promise<Expediente | null> {
    if (!PARECE_UUID.test(profissionalId)) return null;
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_profissionais")
      .select("expediente_folga, expediente_de, expediente_ate")
      .eq("tenant_id", t.tenantId)
      .eq("id", profissionalId)
      .maybeSingle<Pick<LinhaProfissional, "expediente_folga" | "expediente_de" | "expediente_ate">>();

    exigirSemErro("o expediente", error);
    if (!data) return null;
    return {
      folga: data.expediente_folga ?? [],
      de: num(data.expediente_de, 9),
      ate: num(data.expediente_ate, 19),
    };
  },

  /**
   * A allowlist. Deixou de ser constante no código e passou a ser o cadastro.
   *
   * Só profissional ATIVO entra: desativar alguém tem que tirar a agenda dele do alcance
   * de quem cria evento — inclusive do agente de WhatsApp, que recebe `profissionalId`
   * como argumento escolhido por um modelo. Note que isto NÃO afeta desconectar: aquele
   * caso de uso tem allowlist frouxa de propósito, para não deixar refresh token preso
   * numa linha órfã (ver `nucleo/aplicacao/agenda.ts`).
   */
  async agendasPermitidas(t) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("profissionais")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .eq("ativo", true)
      .order("criado_em", { ascending: true });

    exigirSemErro("as agendas", error);
    return (data ?? []).map((l: { id: string }) => l.id);
  },

  /**
   * A busca quente do agente de WhatsApp.
   *
   * Usa `telefone_chave`, que é coluna GERADA no banco
   * (`right(regexp_replace(telefone,'[^0-9]','','g'), 8)`) e tem índice
   * `ix_clientes_telefone`. É a mesma regra dos 8 últimos dígitos que o adaptador demo
   * fazia em memória, e por um motivo que continua valendo: o provedor manda
   * `5511981234567` e o cadastro costuma ter `(11) 98123-4567` — DDI e nono dígito são
   * exatamente o que varia entre as duas grafias do mesmo número.
   *
   * Comparar contra a coluna `telefone` crua seria pesquisar a máscara e nunca achar
   * ninguém que veio do WhatsApp.
   */
  async clientePorTelefone(t, telefone) {
    const chave = soDigitos(telefone).slice(-8);
    if (chave.length < 8) return null;

    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("v_clientes")
      .select(COLS_CLIENTE)
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chave)
      /* Dois cadastros com o mesmo final de 8 dígitos é possível (não há unique nessa
       * coluna, de propósito: número repetido acontece em família). Pegar o mais antigo
       * é determinístico — sem `order`, o Postgres pode devolver ordem diferente entre
       * chamadas e a MAISA cumprimentaria pessoas diferentes na mesma conversa. */
      .order("desde", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle<LinhaCliente>();

    exigirSemErro("o cliente pelo telefone", error);
    return data ? paraCliente(data) : null;
  },

  /**
   * Edita o cliente e relê pela view.
   *
   * ⚠️ RELÊ, e não monta o `Cliente` da resposta do update — mesmo motivo escrito no
   * `garantirCliente` logo abaixo: `atendimentos` e `valor` são contagens que só
   * `v_clientes` sabe calcular. Devolver zeros fabricados faria a gaveta pintar "0
   * atendimentos · R$ 0,00" depois de o dono corrigir um telefone.
   *
   * ⚠️ `telefone_chave` NÃO ENTRA no update: é coluna gerada (`right(regexp_replace(...),
   * 8)`), e mandá-la é erro do Postgres. Ela se recalcula sozinha quando `telefone` muda —
   * que é justamente o que faz o conserto de telefone valer no WhatsApp.
   */
  async atualizarCliente(t, r): Promise<Cliente> {
    if (!PARECE_UUID.test(r.id)) {
      /* Id que não é uuid nunca existiu no banco. Ver o bloco do `PARECE_UUID`: deixar
       * seguir daria `22P02 invalid input syntax` e uma frase sobre sintaxe de tipo para
       * quem só queria corrigir um CPF. */
      throw new NaoEncontrado("Cliente");
    }

    const supabase = clienteDoContexto(t);
    const campos = {
      nome: r.nome,
      /* `""` é "sem telefone" e vai como `null`: o `check` da coluna recusa texto curto,
       * e string vazia não gera `telefone_chave` que case com ninguém. */
      telefone: r.telefone || null,
      ...(r.email === undefined ? {} : { email: r.email }),
      ...(r.cpf === undefined ? {} : { cpf: r.cpf }),
      ...(r.canal === undefined ? {} : { canal: r.canal }),
      ...(r.servicoId === undefined ? {} : { servico_id: r.servicoId }),
      ...(r.ativo === undefined ? {} : { ativo: r.ativo }),
      ...(r.valorSessao === undefined ? {} : { valor_sessao: r.valorSessao }),
    };

    /* O `.eq("tenant_id")` não é redundante com a RLS — ver o bloco acima do
     * `salvarServico`: no caminho do agente o cliente é service role e a RLS está
     * desligada, e ali o filtro no código é a única barreira. */
    const { data, error } = await supabase
      .from("clientes")
      .update(campos)
      .eq("id", r.id)
      .eq("tenant_id", t.tenantId)
      .select("id");

    recusaDeCliente(error);
    exigirSemErro("o cliente", error);
    /* Zero linhas é "não era deste inquilino" ou "não existe" — e aqui o silêncio ENGANA:
     * sem esta linha a tela diria "salvo" e reverteria no próximo reload. */
    if (!data || data.length === 0) throw new NaoEncontrado("Cliente deste negócio");

    const salvo = await repositorioSupabase.cliente(t, r.id);
    if (!salvo) throw new NaoEncontrado("Cliente");
    return salvo;
  },

  /**
   * Acha ou cria — a escrita que o AGENTE faz, ao contrário do `atualizarCliente` acima,
   * que é a que a TELA faz.
   *
   * Lê primeiro, de propósito, e não um `upsert` direto: `clientes` não tem `unique` no
   * telefone (número repetido acontece em família — ver `clientePorTelefone`), então não
   * existe coluna de conflito para o `upsert` resolver. Ler-depois-inserir é o único
   * caminho, e a corrida que ele abre é benigna: duas mensagens simultâneas do mesmo
   * número podem criar duas linhas, e `clientePorTelefone` ordena por `desde` para
   * sempre devolver a mesma delas. Duas linhas é cadastro sujo; cliente trocado no meio
   * da conversa seria um bug de verdade.
   *
   * ⚠️ Não atualiza quem já existe. Se o dono cadastrou "Maria Silva" e o modelo entendeu
   * "Mary", quem manda é o dono — a MAISA não reescreve cadastro por interpretação de
   * frase. O nome que o modelo ouviu vai para a memória do agente, não para cá.
   */
  async garantirCliente(t, p) {
    const existente = await repositorioSupabase.clientePorTelefone(t, p.telefone);
    if (existente) return existente;

    /* Sem 8 dígitos não há chave de deduplicação, e inserir criaria um cliente novo por
     * mensagem. `null` aqui não é falha: o caso de uso segue com `cliente_id` nulo e o
     * snapshot do atendimento preserva nome e telefone. */
    if (soDigitos(p.telefone).length < 8) return null;

    const nome = p.nome.trim().slice(0, 120) || "Cliente";
    const supabase = clienteDoContexto(t);
    const { error } = await supabase.from("clientes").insert({
      tenant_id: t.tenantId,
      nome,
      telefone: p.telefone,
      /* `Online` porque chegou pelo WhatsApp — é literalmente o que a coluna quer dizer.
       * `telefone_chave` NÃO vai aqui: é coluna gerada, e mandá-la é erro do Postgres. */
      canal: "Online",
      ativo: true,
      desde: new Date().toISOString().slice(0, 10),
    });

    /* Falhou a inserção? Não lança. Chegamos aqui a caminho de marcar um horário, e
     * derrubar o agendamento porque o cadastro não aceitou a linha seria trocar um
     * problema pequeno (cliente fora da lista) pelo pior possível (o cliente ouve que
     * não deu). O log é alto porque isto é configuração ou RLS, não caso de borda. */
    if (error) {
      console.error(
        `[supabase/repositorio] não foi possível cadastrar o cliente ${p.telefone} do inquilino ${t.tenantId}: ${error.message}`,
      );
      return null;
    }

    /* Relê pela view em vez de montar o `Cliente` da resposta do insert: `atendimentos` e
     * `valor` são contagens que só `v_clientes` sabe calcular, e devolver zeros fabricados
     * aqui faria a tela mostrar número errado com cara de número certo. */
    return repositorioSupabase.clientePorTelefone(t, p.telefone);
  },

  async criarCliente(t, p) {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        tenant_id: t.tenantId,
        nome: p.nome,
        telefone: p.telefone || null,
        cpf: p.cpf,
        canal: "Online",
        ativo: true,
        desde: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    recusaDeCliente(error);
    exigirSemErro("o cadastro do cliente", error);

    /* Relê pela view, pelo motivo do `garantirCliente` acima: `atendimentos` e `valor`. */
    const salvo = await repositorioSupabase.cliente(t, (data as { id: string }).id);
    if (!salvo) throw new NaoEncontrado("Cliente");
    return salvo;
  },
};

/* ───────────────────────────── leituras de LISTA, fora da porta ─────────────────────────────
 * A porta `RepositorioNegocio` responde "quem é o profissional X" porque é o que os
 * casos de uso precisam. As TELAS precisam de outra coisa: a lista inteira. Isso não
 * entra na porta — o núcleo não tem caso de uso que liste equipe — então mora aqui, e as
 * rotas de `/api/cadastro/*` chamam direto.
 *
 * O mesmo `.eq("tenant_id")` vale, pela mesma razão. */

export async function listarProfissionais(t: ContextoTenant): Promise<Profissional[]> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("v_profissionais")
    .select(COLS_PROFISSIONAL)
    .eq("tenant_id", t.tenantId)
    /* Por NOME, e não por `criado_em`: a view `v_profissionais` não projeta `criado_em`
     * (ver 004_visoes.sql) e o PostgREST rejeita `order` em coluna que não existe na
     * view — seria 400 na tela de Equipe, não uma ordenação diferente. */
    .order("nome", { ascending: true });

  exigirSemErro("a equipe", error);
  return (data ?? []).map((l) => paraProfissional(l as LinhaProfissional));
}

export async function listarServicos(t: ContextoTenant): Promise<Servico[]> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("v_servicos")
    .select(COLS_SERVICO)
    .eq("tenant_id", t.tenantId)
    .order("nome", { ascending: true });

  exigirSemErro("o catálogo", error);
  return (data ?? []).map((l) => paraServico(l as LinhaServico));
}

export async function listarClientes(t: ContextoTenant): Promise<Cliente[]> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("v_clientes")
    .select(COLS_CLIENTE)
    .eq("tenant_id", t.tenantId)
    .order("nome", { ascending: true });

  exigirSemErro("os clientes", error);
  return (data ?? []).map((l) => paraCliente(l as LinhaCliente));
}
