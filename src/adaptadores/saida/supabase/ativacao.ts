/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o progresso da ativação, lido do banco.
 *
 * Quatro consultas independentes (a quinta, `negocio_criado`, não precisa de consulta:
 * quem chega aqui tem inquilino, porque o porteiro barra com 409 antes). Todas com
 * `head: true` e `count: "exact"` — o que se quer saber é SE existe, não o quê, e trazer
 * as linhas de volta seria pagar payload por uma pergunta de sim ou não.
 *
 * ⚠️ `Promise.allSettled`, NUNCA `Promise.all`. Cada passo falha por conta própria e por
 * motivo próprio: `integracoes_whatsapp` tem RLS de gestão (um atendente não a lê),
 * `mensagens` pode estar vazia. Uma rejeição num `Promise.all` derrubaria o checklist
 * inteiro — e o cliente novo, que é justamente quem precisa dele, veria uma tela em
 * branco no primeiro login. Falha vira "não fez ainda", que é a leitura honesta.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ProgressoDeAtivacao } from "@/nucleo/portas/saida/progresso-ativacao";
import type { PassoDeAtivacao, ProgressoDaAtivacao } from "@/nucleo/dominio/ativacao";
import { progressoDe, usoDoWhatsApp, type UsoDoWhatsApp } from "@/nucleo/dominio/ativacao";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { clienteDoContexto } from "./contexto-cliente";

/** Diferença mínima entre `criado_em` e `atualizado_em` para contar como "o dono mexeu".
 *
 *  `toca_atualizado_em` é `before update`, então numa linha recém-inserida as duas colunas
 *  saem do mesmo `now()` e são idênticas. O milissegundo de folga cobre o caso de o
 *  Postgres devolver as duas com precisão diferente — não é margem para engano, é para
 *  igualdade que não parece igual. */
const FOLGA_DE_EDICAO_MS = 1000;

/**
 * O dono mexeu no catálogo que `criar_negocio()` semeou?
 *
 * ⚠️ NÃO DÁ PARA PERGUNTAR ISSO COM UM FILTRO. O PostgREST não compara duas colunas entre
 * si (`atualizado_em > criado_em` viraria comparação com a string "criado_em"), então as
 * duas datas vêm e a conta é feita aqui. São poucas linhas — cinco no negócio recém-criado
 * — e o `select` pede só as duas colunas.
 *
 * A alternativa seria uma coluna `catalogo_ajustado` no banco, e ela seria uma flag: o
 * defeito que `dominio/ativacao.ts` existe para não repetir.
 */
async function catalogoAjustado(t: ContextoTenant): Promise<boolean> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("servicos")
    .select("criado_em, atualizado_em")
    .eq("tenant_id", t.tenantId);

  if (error) throw new Error(error.message);
  return (data ?? []).some((l) => {
    const linha = l as { criado_em: string; atualizado_em: string };
    return (
      new Date(linha.atualizado_em).getTime() - new Date(linha.criado_em).getTime()
      > FOLGA_DE_EDICAO_MS
    );
  });
}

/**
 * A nota fiscal está pronta para emitir?
 *
 * Lê `v_negocio.fiscal_pronto`, que é `fiscal_configurado(config_fiscal)` — a mesma regra do
 * 014, no banco. Não é uma segunda implementação: é a MESMA, e é por isso que se lê a view em
 * vez de trazer as colunas e recalcular aqui.
 *
 * ⚠️ A view devolve `false` para quem não é gestão, porque a RLS de `config_fiscal` esconde a
 * linha do atendente. Isso está certo neste contexto: para quem não pode configurar, "não
 * configurado" é a leitura honesta. Está escrito assim no `004_visoes.sql`.
 */
async function fiscalPronto(t: ContextoTenant): Promise<boolean> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("v_negocio")
    .select("fiscal_pronto")
    .eq("tenant_id", t.tenantId)
    .maybeSingle<{ fiscal_pronto: boolean | null }>();

  if (error) throw new Error(error.message);
  return data?.fiscal_pronto === true;
}

/** Existe ao menos uma linha que casa com o filtro? Sem trazer as linhas. */
async function existe(
  t: ContextoTenant,
  tabela: string,
  filtros: Record<string, string> = {},
): Promise<boolean> {
  const supabase = clienteDoContexto(t);
  let q = supabase.from(tabela).select("*", { count: "exact", head: true }).eq("tenant_id", t.tenantId);
  for (const [coluna, valor] of Object.entries(filtros)) q = q.eq(coluna, valor);

  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * Para que o negócio usa o WhatsApp. `undefined` quando não deu para ler — e aí valem todos
 * os passos, o lado seguro (ver `passosQueValem`).
 */
async function uso(t: ContextoTenant): Promise<UsoDoWhatsApp | undefined> {
  const supabase = clienteDoContexto(t);
  const { data, error } = await supabase
    .from("assistente")
    .select("ativa, lembrete, avisar_recibo")
    .eq("tenant_id", t.tenantId)
    .maybeSingle<{ ativa: boolean; lembrete: boolean; avisar_recibo: boolean | null }>();
  if (error || !data) return undefined;
  return usoDoWhatsApp({ ativa: data.ativa, lembrete: data.lembrete, avisarRecibo: data.avisar_recibo === true });
}

export const ativacaoSupabase: ProgressoDeAtivacao = {
  async ler(t: ContextoTenant): Promise<ProgressoDaAtivacao> {
    const perguntas: { passo: PassoDeAtivacao; resposta: Promise<boolean> }[] = [
      { passo: "catalogo_ajustado", resposta: catalogoAjustado(t) },
      /* `status = 'conectado'` e não "existe linha": a linha nasce em `pareando` quando
       * alguém pede o QR, e contar isso como conectado marcaria o passo para quem abriu a
       * tela e fechou sem ler o código. O `canal.ts` do domínio já diz que pareamento
       * caído não conta. */
      { passo: "whatsapp_conectado", resposta: existe(t, "integracoes_whatsapp", { status: "conectado" }) },
      { passo: "agenda_conectada", resposta: existe(t, "integracoes_google") },
      /**
       * A tabela de MENSAGEM, e não a de conversa: a conversa pode existir vazia (o painel
       * a cria ao abrir uma fila), e o que prova ativação é alguém ter FALADO.
       *
       * ⚠️ `mensagens_agente` (arquivo 007), e NÃO `mensagens` (arquivo 002). As duas
       * existem no banco, e essa é justamente a armadilha: a segunda é de um desenho
       * anterior, ficou órfã quando o histórico do agente ganhou adaptador próprio, e
       * **nada no `src/` inteiro escreve nela** — esta linha era o único lugar do
       * repositório que sequer a mencionava.
       *
       * O resultado, medido em 16/08/2026: o Bruno conversou com a MAISA pela etapa 4, ela
       * marcou de verdade (`atendimentos` tem a linha), e o passo continuava apagado —
       * porque a consulta perguntava a uma tabela vazia por construção. Nenhum erro em
       * lugar nenhum: a tabela existe, a consulta é válida, a contagem é zero, e o
       * `Promise.allSettled` nem tem o que registrar. Um checklist que nunca chega a 100%
       * é pior que checklist nenhum.
       *
       * `src/documentacao.test.ts` ganhou o guarda: toda tabela que este arquivo lê tem que
       * ser escrita por algum outro adaptador. Existir no banco não bastava.
       */
      { passo: "primeira_conversa", resposta: existe(t, "mensagens_agente") },
      /**
       * A nota fiscal ligada.
       *
       * ⚠️ NÃO É "existe linha em config_fiscal" — `criar_negocio()` insere a linha no
       * instante da criação do inquilino (005, com `ambiente` só). Contar a existência
       * marcaria este passo para todo mundo, no primeiro segundo, e o checklist nasceria
       * mentindo. É o mesmo defeito que `whatsapp_conectado` evita ao exigir
       * `status = 'conectado'` em vez de "existe pareamento".
       *
       * `fiscal_pronto` é a coluna da view `v_negocio`, que chama `fiscal_configurado()` —
       * empresa criada no emissor + certificado dentro da validade + código de serviço do
       * caminho certo. A regra mora no 014 e é espelhada por `dominio/fiscal.fiscalFaltando`.
       */
      { passo: "nota_fiscal_ligada", resposta: fiscalPronto(t) },
    ];

    const [resultados, usoDoNegocio] = await Promise.all([
      Promise.allSettled(perguntas.map((p) => p.resposta)),
      uso(t).catch(() => undefined),
    ]);

    /* `negocio_criado` entra sem consulta: chegar aqui já É a prova. Perguntar ao banco
     * se o inquilino existe seria uma ida para confirmar o que o cookie já garantiu. */
    const feitos: PassoDeAtivacao[] = ["negocio_criado"];

    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        if (r.value) feitos.push(perguntas[i].passo);
        return;
      }
      /* Log alto: uma consulta que falha aqui não quebra a tela, mas é sinal de RLS ou de
       * tabela fora do ar — e sem esta linha ela seria indistinguível de "ainda não fez".
       * É exatamente esse silêncio que o `Promise.allSettled` compra, e ele tem preço. */
      console.warn(
        `[supabase/ativacao] passo ${perguntas[i].passo} do inquilino ${t.tenantId} não pôde ser apurado: ${String(r.reason)}`,
      );
    });

    return progressoDe(feitos, usoDoNegocio);
  },
};
