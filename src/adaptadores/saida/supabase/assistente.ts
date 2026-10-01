/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — os ajustes da assistente, na tabela `assistente`.
 *
 * A tabela é 1:1 com o domínio, com uma torção: o Postgres é `snake_case` e o domínio é
 * `camelCase`, então `precoCatalogo` ↔ `preco_catalogo`. Esse de-para vive AQUI e em
 * lugar nenhum mais — é a fronteira, e é a única linha do sistema que sabe os dois nomes.
 *
 * ⚠️ `.eq("tenant_id", …)` em TODA consulta, inclusive no update.
 *
 * Não é redundância com a RLS. Quando quem chama é o agente de WhatsApp
 * (`ator.tipo === "agente"`), `clienteDoContexto` devolve o cliente de service role e a
 * RLS fica DESLIGADA — o `.eq` passa a ser a única fronteira entre inquilinos, como diz
 * o cabeçalho de `contexto-cliente.ts`. E o agente lê esta tabela a cada mensagem.
 *
 * `tenant_id` é a PRIMARY KEY aqui (não há coluna `id` separada), então o `.eq` também é
 * o que torna o update determinístico: no máximo uma linha, sempre a certa.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import type { Assistente, ChaveCfg, Tom } from "@/nucleo/dominio/assistente";
import type {
  AjustesDaAssistente, AjustesParciais, RepositorioAssistente,
} from "@/nucleo/portas/saida/repositorio-assistente";
import { FalhaDoProvedor, NaoEncontrado } from "@/nucleo/dominio/erros";
import { HORAS_ANTES } from "@/nucleo/dominio/lembretes";
import { clienteDoContexto } from "./contexto-cliente";

/** As colunas, na ordem da DDL. Explícitas para o `select` não trazer o que não se usa. */
/* ⚠️ AS DUAS LISTAS EXISTEM POR CAUSA DA JANELA ENTRE O DEPLOY E O `Run` NO SQL EDITOR.
 *
 * Rodar migração aqui é um humano abrindo o painel do Supabase. Entre o código novo subir e ele
 * clicar, um `select` com a coluna nova responde `42703` — e como esta leitura alimenta a tela de
 * ajustes INTEIRA (nome, tom, saudação, os toggles), o erro derrubaria a tela por causa de um
 * interruptor que ninguém ligou ainda.
 *
 * Então: tenta com a coluna, e em erro de coluna inexistente relê sem ela. Ver `ler`. */
const COLS_BASE =
  "nome, tom, saudacao, ativa, confirmar, lembrete, remarcar, encaixe, encaminhar, preco_catalogo, pix";

/* Em degraus, do mais novo para o mais velho: cada migração que acrescenta coluna aqui ganha um
 * degrau, e a leitura desce até o primeiro que o banco conhece. Um degrau só (tudo ou a base)
 * faria a 032 pendente apagar também o `avisar_recibo` da 024, que já rodou: quem avisava os
 * pacientes pararia de avisar até alguém clicar Run. */
const COLS_024 = `${COLS_BASE}, avisar_recibo, lembrete_horas`;
const COLS = `${COLS_024}, recibo_primeiro_para_mim`;
const DEGRAUS = [COLS, COLS_024, COLS_BASE];

/** `42703` coluna inexistente · `PGRST204` coluna fora do cache de schema do PostgREST. */
const colunaNaoExiste = (e: { code?: string; message?: string } | null): boolean =>
  Boolean(e) && (["42703", "PGRST204"].includes(e!.code ?? "")
    || /column .* does not exist|could not find the .* column/i.test(e!.message ?? ""));

type Linha = {
  nome: string;
  tom: string;
  saudacao: string | null;
  ativa: boolean;
  confirmar: boolean;
  lembrete: boolean;
  remarcar: boolean;
  encaixe: boolean;
  encaminhar: boolean;
  preco_catalogo: boolean;
  pix: boolean;
  avisar_recibo: boolean;
  lembrete_horas: number;
  recibo_primeiro_para_mim: boolean;
};

/**
 * O de-para de nome de coluna. Só as chaves que DIVERGEM entram aqui.
 *
 * Um `Record<ChaveCfg, string>` completo obrigaria a listar as sete e a manter as seis
 * iguais sincronizadas à toa. Assim, acrescentar um toggle cujo nome bate nos dois lados
 * não exige tocar neste arquivo — e um que não bata exige, que é o comportamento certo.
 */
const COLUNA_DE: Partial<Record<ChaveCfg, string>> = {
  precoCatalogo: "preco_catalogo",
  avisarRecibo: "avisar_recibo",
  reciboPrimeiroParaMim: "recibo_primeiro_para_mim",
};

const coluna = (c: ChaveCfg): string => COLUNA_DE[c] ?? c;

function paraAjustes(l: Linha): AjustesDaAssistente {
  const assistente: Assistente = {
    nome: l.nome,
    /* O `check` da coluna garante que só os três tons entram. O cast é a leitura desse
     * contrato, não uma aposta: se alguém afrouxar o check, é aqui que quebra — e é o
     * lugar certo para quebrar, porque `persona.ts` monta prompt em cima disto. */
    tom: l.tom as Tom,
    /* A coluna é nullable e o domínio não é. `null` vira `""`, que a tela e o prompt já
     * tratam como "sem saudação" — o contrário (domínio nullable) espalharia `?? ""` por
     * toda a UI. */
    saudacao: l.saudacao ?? "",
    ativa: l.ativa,
    /* `?? HORAS_ANTES` pela mesma razão do `avisarRecibo` abaixo: a 026 pode não ter rodado, e
     * coluna ausente vira `undefined`. Cair no padrão mantém a tela mostrando o prazo que o
     * banco de fato usa nesse estado — o `default` da coluna é o mesmo número. */
    lembreteHoras: l.lembrete_horas ?? HORAS_ANTES,
  };

  const cfg: Record<ChaveCfg, boolean> = {
    confirmar: l.confirmar,
    lembrete: l.lembrete,
    remarcar: l.remarcar,
    encaminhar: l.encaminhar,
    precoCatalogo: l.preco_catalogo,
    pix: l.pix,
    encaixe: l.encaixe,
    /* `?? false` porque a 024 pode não ter rodado ainda: coluna ausente vira `undefined`, e
     * `undefined` num toggle deixaria a tela mostrar o switch em estado indefinido. Falha para o
     * lado de NÃO mandar mensagem para paciente nenhum, que é o lado barato. */
    avisarRecibo: l.avisar_recibo ?? false,
    /* `?? false` pelo mesmo motivo, com a 032: sem a coluna, o aviso segue indo para o paciente,
     * que é o comportamento de antes dela existir. */
    reciboPrimeiroParaMim: l.recibo_primeiro_para_mim ?? false,
  };

  return { assistente, cfg };
}

export const assistenteSupabase: RepositorioAssistente = {
  async ler(t: ContextoTenant): Promise<AjustesDaAssistente | null> {
    const supabase = clienteDoContexto(t);
    let data: Linha | null = null;
    let error: { code?: string; message: string } | null = null;

    /* Uma migração ainda não rodou neste banco: desce um degrau e relê sem as colunas dela, e
     * `paraAjustes` resolve o resto com `?? false`. Degrada para "não avisar ninguém" (024) e
     * "avisar o paciente" (032), que é o comportamento de antes de cada uma. */
    for (const [i, cols] of DEGRAUS.entries()) {
      ({ data, error } = await supabase
        .from("assistente")
        .select(cols)
        .eq("tenant_id", t.tenantId)
        .maybeSingle<Linha>());
      if (!colunaNaoExiste(error) || i === DEGRAUS.length - 1) break;
      console.warn(
        `[supabase/assistente] o inquilino ${t.tenantId} leu ajustes antes de `
        + `${i === 0 ? "supabase/032_recibo_automatico.sql" : "supabase/024_avisar_recibo.sql"} rodar. Rode a migração `
        + "(npm run banco:conferir lista o que falta).",
      );
    }

    if (error) {
      throw new FalhaDoProvedor(`Não foi possível ler os ajustes da assistente: ${error.message}`);
    }
    return data ? paraAjustes(data) : null;
  },

  async salvar(t: ContextoTenant, p: AjustesParciais): Promise<AjustesDaAssistente> {
    const patch: Record<string, unknown> = {};

    if (p.assistente) {
      const { nome, tom, saudacao, ativa, lembreteHoras } = p.assistente;
      if (nome !== undefined) patch.nome = nome;
      if (tom !== undefined) patch.tom = tom;
      if (lembreteHoras !== undefined) patch.lembrete_horas = lembreteHoras;
      /* Saudação vazia grava `null`, não `""`: a coluna é nullable justamente para
       * significar "não tem", e duas representações do mesmo nada é o tipo de coisa que
       * depois vira `if (x === "" || x === null)` espalhado. */
      if (saudacao !== undefined) patch.saudacao = saudacao === "" ? null : saudacao;
      if (ativa !== undefined) patch.ativa = ativa;
    }

    if (p.cfg) {
      for (const [chave, valor] of Object.entries(p.cfg)) {
        patch[coluna(chave as ChaveCfg)] = valor;
      }
    }

    /* Sem campo nenhum, um `update({})` no PostgREST é 400. O caso de uso já recusa o
     * patch vazio; esta guarda existe porque o adaptador é chamável por outro caminho
     * (um teste, um script) e falhar com o nome certo vale mais que um 400 opaco. */
    if (!Object.keys(patch).length) {
      throw new FalhaDoProvedor("Nada para gravar nos ajustes da assistente.");
    }

    patch.atualizado_em = new Date().toISOString();

    const supabase = clienteDoContexto(t);
    let data: Linha | null = null;
    let error: { code?: string; message: string } | null = null;
    /* O `select` de volta desce os mesmos degraus da leitura. O PostgREST recusa o pedido
     * INTEIRO quando a lista de colunas tem uma que não existe, antes de gravar, então repetir com
     * o degrau de baixo não grava duas vezes. Sem isto, com a 032 pendente, nenhum ajuste da tela
     * "A MAISA" salvaria, nem o tom. */
    for (const [i, cols] of DEGRAUS.entries()) {
      ({ data, error } = await supabase
        .from("assistente")
        .update(patch)
        .eq("tenant_id", t.tenantId)
        .select(cols)
        .maybeSingle<Linha>());
      if (!colunaNaoExiste(error) || i === DEGRAUS.length - 1) break;
    }

    /* A coluna que falta é a que se quer gravar: não há degrau que resolva. Frase para a tela, e
     * o arquivo para o log. */
    if (colunaNaoExiste(error) && "recibo_primeiro_para_mim" in patch) {
      console.error("[supabase/assistente] para quem vai o recibo: falta rodar supabase/032_recibo_automatico.sql");
      throw new FalhaDoProvedor("Ainda não dá para escolher para quem vai o recibo. Tente de novo mais tarde.");
    }

    if (error) {
      throw new FalhaDoProvedor(`Não foi possível salvar os ajustes da assistente: ${error.message}`);
    }
    /* Zero linhas com `error: null` tem DOIS significados e os dois merecem 404: ou a
     * linha não existe (inquilino nascido fora da RPC), ou a RLS filtrou — o que só
     * acontece se o `tenantId` não for de um negócio de quem está pedindo. Nos dois
     * casos, "não achei" é a resposta honesta, e nenhum dos dois pode virar sucesso. */
    if (!data) throw new NaoEncontrado("Ajustes da assistente");

    return paraAjustes(data);
  },
};
