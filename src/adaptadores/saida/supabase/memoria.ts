/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — memória, histórico e posse das conversas, no Supabase.
 * ⚠️ SÓ SERVIDOR.
 *
 * O par real do `saida/demo/memoria.ts`, que era um `Map` de módulo. Aquele adaptador está
 * documentado como "limitação declarada, não esquecimento", e esta é a limitação:
 *
 *   • morria no redeploy — o cliente virava desconhecido de novo;
 *   • não era compartilhado entre instâncias — na Vercel, duas mensagens seguidas caem em
 *     lambdas diferentes e a segunda não lembra da primeira;
 *   • e a consequência que ninguém tinha visto: o PAINEL nunca teria como mostrar a
 *     conversa. A tela roda em outro processo que o webhook. Um `Map` de processo é, por
 *     construção, invisível para ela — daí a tela de Conversas ter vivido de fixture.
 *
 * A troca é uma linha em `composicao.ts`. Era a aposta da porta, e ela pagou.
 *
 * ── AS TRÊS TABELAS ──
 *
 * | Porta                  | Tabela              | Ciclo de vida               |
 * |------------------------|---------------------|-----------------------------|
 * | `RepositorioMemoria`   | `memoria_cliente`   | anos, minúscula, sobrescrita|
 * | `RepositorioHistorico` | `mensagens_agente`  | horas, cresce, só append    |
 * | `RepositorioConversas` | `conversas_estado`  | minutos, duas datas         |
 *
 * Três portas e três tabelas porque os ciclos de vida são diferentes, não por gosto de
 * normalizar: a thread vai expirar por LGPD (`limpar_mensagens_antigas`), o perfil o cliente
 * pode querer que fique, e posse não sobrevive ao fim do atendimento.
 *
 * ── A CHAVE É SEMPRE OS 8 ÚLTIMOS DÍGITOS ──
 *
 * `telefone_chave`, igual a `clientes.telefone_chave`. O WhatsApp manda "5511981234567" e o
 * cadastro guarda "(11) 98123-4567": DDI e nono dígito são exatamente o que varia entre as
 * duas grafias do MESMO número, e comparar a string crua nunca casaria. As portas falam
 * telefone em qualquer grafia; a redução para a chave acontece aqui, num lugar só.
 *
 * ⚠️ E o caminho de volta NÃO EXISTE: de 8 dígitos não se remonta DDD nem DDI. É por isso que
 * `mensagens_agente` também guarda o número completo (`009_conversas_painel.sql`) — sem ele o
 * painel não teria para onde responder.
 *
 * ── SOBRE A RLS ──
 *
 * `clienteDoContexto(t)` decide entre sessão (RLS ligada, painel) e service role (RLS
 * ignorada, webhook). No caminho do agente o `.eq("tenant_id", …)` de cada consulta é a ÚNICA
 * fronteira entre inquilinos — ver o cabeçalho de `admin.ts`. Toda consulta deste arquivo
 * filtra por tenant, inclusive as que "obviamente" só teriam uma linha.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  ConversaGravada, RepositorioConversas, RepositorioHistorico, RepositorioMemoria,
} from "@/nucleo/portas/saida/memoria-cliente";
import type { Escolha, MemoriaCliente } from "@/nucleo/dominio/memoria";
import type { Msg, PosseDaConversa } from "@/nucleo/dominio/conversas";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { soDigitos } from "@/nucleo/dominio/clientes";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";
import { clienteDoContexto } from "./contexto-cliente";

/* ───────────────────────────── as linhas, como o banco devolve ───────────────────────────── */

type LinhaMemoria = {
  telefone_chave: string;
  cliente_id: string | null;
  nome: string | null;
  profissional_favorito_id: string | null;
  servico_favorito_id: string | null;
  horario_favorito: string | number | null;
  historico: Escolha[] | null;
  atualizado_em: string;
};

type LinhaMensagem = {
  autor: Msg["de"];
  texto: string;
  criado_em: string;
};

type LinhaConversa = {
  telefone_chave: string;
  telefone: string | null;
  nome: string | null;
  cliente_id: string | null;
  ultimo_autor: Msg["de"];
  ultimo_texto: string;
  atualizada_em: string;
  assumida_em: string | null;
  resolvida_em: string | null;
};

type LinhaEstado = { assumida_em: string | null; resolvida_em: string | null };

/* ───────────────────────────── conversões ───────────────────────────── */

/** A chave de junção. Tudo neste arquivo passa por aqui antes de tocar o banco. */
const chaveDe = (telefone: string) => soDigitos(telefone).slice(-8);

/**
 * O número completo, ou `null`.
 *
 * `null` e não string vazia: a coluna é nullable e o check exige 10–15 dígitos quando
 * presente. Gravar "" estouraria o check e derrubaria a gravação da mensagem inteira — perder
 * a fala do cliente porque o número veio curto seria trocar um dado ausente por dois.
 */
function numeroCompleto(telefone: string): string | null {
  const d = soDigitos(telefone);
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** `numeric` chega como STRING do driver do Postgres (para não perder precisão). */
const num = (v: string | number | null): number | undefined => {
  if (v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** `?? undefined` em vez de deixar `null` passar: o domínio usa campo AUSENTE para "não sei",
 *  e `nome: null` faria `m.nome ?? cliente?.nome` parar de cair no cadastro. */
const texto = (v: string | null): string | undefined => v ?? undefined;

function paraMemoria(l: LinhaMemoria, telefone: string): MemoriaCliente {
  return {
    /* O telefone que QUEM CHAMOU usou, não a chave de 8 dígitos que o banco guarda. O domínio
     * trata `MemoriaCliente.telefone` como "por onde falo com essa pessoa" (é o que
     * `criarLembrarCliente` devolve como `perfil.telefone`, e é com ele que o agente grava a
     * thread). Devolver a chave truncada aqui faria a thread nascer sem número completo —
     * silenciosamente, e só o painel descobriria, semanas depois, que não tem como responder. */
    telefone: soDigitos(telefone) || l.telefone_chave,
    clienteId: texto(l.cliente_id),
    nome: texto(l.nome),
    profissionalFavoritoId: texto(l.profissional_favorito_id),
    servicoFavoritoId: texto(l.servico_favorito_id),
    horarioFavorito: num(l.horario_favorito),
    historico: l.historico ?? [],
    atualizadoEm: l.atualizado_em,
  };
}

const paraMsg = (l: LinhaMensagem): Msg => ({ de: l.autor, txt: l.texto, em: l.criado_em });

function paraConversaGravada(l: LinhaConversa): ConversaGravada {
  return {
    telefoneChave: l.telefone_chave,
    telefone: l.telefone ?? "",
    nome: texto(l.nome),
    clienteId: texto(l.cliente_id),
    ultima: { de: l.ultimo_autor, txt: l.ultimo_texto, em: l.atualizada_em },
    atualizadaEm: l.atualizada_em,
    posse: { assumidaEm: l.assumida_em, resolvidaEm: l.resolvida_em },
  };
}

/**
 * Falha de banco vira `FalhaDoProvedor` (que `respostas.ts` já traduz para 502).
 *
 * O escopo no texto não é decoração: "falha ao ler memória" e "falha ao gravar mensagem" caem
 * no mesmo catch da rota, e sem ele o log diz só `PGRST116` — que não distingue coluna
 * inexistente de política de RLS negando a leitura.
 */
function estourar(escopo: string, msg: string): never {
  console.error(`[supabase/memoria] ${escopo}: ${msg}`);
  throw new FalhaDoProvedor(`Falha ao ${escopo}.`);
}

/* ───────────────────────────── memória ───────────────────────────── */

export const memoriaSupabase: RepositorioMemoria = {
  async ler(t, telefone) {
    const { data, error } = await clienteDoContexto(t)
      .from("memoria_cliente")
      .select("telefone_chave, cliente_id, nome, profissional_favorito_id, servico_favorito_id, horario_favorito, historico, atualizado_em")
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chaveDe(telefone))
      .maybeSingle<LinhaMemoria>();

    if (error) estourar("ler a memória do cliente", error.message);
    return data ? paraMemoria(data, telefone) : null;
  },

  async gravar(t, m) {
    /* `upsert` e não `insert`: memória é sobrescrita por natureza (nome novo, favorito
     * recalculado), e a PK é (tenant_id, telefone_chave). Sem `onConflict` explícito o
     * PostgREST usa a PK — mas escrevê-lo é o que faz este código sobreviver a alguém
     * acrescentar uma unique key na tabela. */
    const { error } = await clienteDoContexto(t)
      .from("memoria_cliente")
      .upsert(
        {
          tenant_id: t.tenantId,
          telefone_chave: chaveDe(m.telefone),
          cliente_id: m.clienteId ?? null,
          nome: m.nome ?? null,
          /* ⚠️ DERIVADOS. Quem os calcula é `dominio/memoria.ts → comFato`, nunca o agente —
           * a DDL do 007 diz isso em voz alta. Aqui só persistimos o que o domínio concluiu:
           * são cache de `historico`, para o prompt não recalcular a moda a cada mensagem. */
          profissional_favorito_id: m.profissionalFavoritoId ?? null,
          servico_favorito_id: m.servicoFavoritoId ?? null,
          horario_favorito: m.horarioFavorito ?? null,
          historico: m.historico,
          atualizado_em: m.atualizadoEm,
        },
        { onConflict: "tenant_id,telefone_chave" },
      );

    if (error) estourar("gravar a memória do cliente", error.message);
  },
};

/* ───────────────────────────── histórico ───────────────────────────── */

export const historicoSupabase: RepositorioHistorico = {
  async ler(t, telefone, limite) {
    /* As N ÚLTIMAS, então a consulta desce e o array sobe: `order desc` + `limit` no banco,
     * `reverse()` aqui. Ordenar ascendente e cortar traria as N PRIMEIRAS mensagens da
     * conversa — o modelo receberia o "bom dia" de três semanas atrás como se fosse o
     * contexto atual, e o assunto de agora ficaria fora do prompt.
     *
     * ⚠️ O desempate por `id` é obrigatório, não caprichoso. Um turno grava a fala do cliente
     * e as bolhas da resposta num INSERT só, e `now()` é estável dentro do comando: as linhas
     * nascem com `criado_em` IDÊNTICO. Sem `id desc`, a ordem entre elas é a que o Postgres
     * quiser — e a MAISA replayaria a própria resposta ANTES da pergunta que a causou. */
    const { data, error } = await clienteDoContexto(t)
      .from("mensagens_agente")
      .select("autor, texto, criado_em")
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chaveDe(telefone))
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(limite);

    if (error) estourar("ler a conversa", error.message);
    return ((data ?? []) as LinhaMensagem[]).map(paraMsg).reverse();
  },

  async anexar(t, telefone, msgs) {
    if (msgs.length === 0) return;

    const chave = chaveDe(telefone);
    const numero = numeroCompleto(telefone);

    /* Um INSERT para as N bolhas, não N inserts: é o caminho quente do webhook (o cliente
     * está olhando a tela esperando) e cada round-trip a mais é latência que a rota segura.
     *
     * `criado_em` fica com o default do banco de propósito — o relógio do Postgres é o mesmo
     * para todo mundo, e o do processo não. Ver o desempate por `id` em `ler`: é ele que
     * mantém a ordem DENTRO do turno, já que estas linhas vão nascer no mesmo instante. */
    const { error } = await clienteDoContexto(t)
      .from("mensagens_agente")
      .insert(msgs.map((m) => ({
        tenant_id: t.tenantId,
        telefone_chave: chave,
        telefone: numero,
        autor: m.de,
        texto: m.txt,
      })));

    /* ⚠️ NÃO ESTOURA. Gravar a thread é o ÚLTIMO passo do turno: a mensagem já foi entregue
     * ao cliente pelo WhatsApp quando isto roda (ver a ordem em `agente.ts` e em
     * `criarResponderConversa`). Propagar a falha aqui devolveria erro para o webhook, a
     * Evolution reentregaria o evento, e a MAISA responderia a mesma pergunta duas vezes —
     * trocando "perdi o registro de uma conversa" por "falei duas vezes com o cliente".
     *
     * O log é obrigatório porque o sintoma é mudo: a conversa acontece no WhatsApp e
     * simplesmente não aparece no painel. */
    if (error) console.error(`[supabase/memoria] falha ao gravar ${msgs.length} mensagem(ns) de ${chave}: ${error.message}`);
  },

  async anexarRecebida(t, telefone, msg, provedorId) {
    /* A coluna e o índice único existem desde a 007 (`mensagens_agente_sem_duplicata`, por
     * inquilino e `provedor_id`), feitos para isto e sem uso até 27/10/2026. Quem decide se é
     * repetição é o índice, num INSERT só: duas reentregas ao mesmo tempo não passam as duas,
     * o que uma consulta antes do INSERT não garantiria. */
    const { error } = await clienteDoContexto(t)
      .from("mensagens_agente")
      .insert({
        tenant_id: t.tenantId,
        telefone_chave: chaveDe(telefone),
        telefone: numeroCompleto(telefone),
        autor: msg.de,
        texto: msg.txt,
        provedor_id: provedorId,
      });

    if (!error) return true;
    /* 23505 é `unique_violation`: essa mensagem já está aqui, então é reentrega. */
    if (error.code === "23505") return false;
    /* Outra falha: como em `anexar`, não estoura e não cala o cliente. Ver a porta. */
    console.error(`[supabase/memoria] falha ao gravar a mensagem ${provedorId} de ${chaveDe(telefone)}: ${error.message}`);
    return true;
  },

  async conversas(t, limite) {
    /* `v_conversas` (009) resolve numa consulta o que aqui seria N+1: a última mensagem de
     * cada thread, mais o nome (memória → cadastro) e a posse. Ver o comentário da view. */
    const { data, error } = await clienteDoContexto(t)
      .from("v_conversas")
      .select("telefone_chave, telefone, nome, cliente_id, ultimo_autor, ultimo_texto, atualizada_em, assumida_em, resolvida_em")
      .eq("tenant_id", t.tenantId)
      .order("atualizada_em", { ascending: false })
      .limit(limite);

    if (error) estourar("listar as conversas", error.message);
    return ((data ?? []) as LinhaConversa[]).map(paraConversaGravada);
  },

  async conversa(t, telefone) {
    const { data, error } = await clienteDoContexto(t)
      .from("v_conversas")
      .select("telefone_chave, telefone, nome, cliente_id, ultimo_autor, ultimo_texto, atualizada_em, assumida_em, resolvida_em")
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chaveDe(telefone))
      .maybeSingle<LinhaConversa>();

    if (error) estourar("abrir a conversa", error.message);
    return data ? paraConversaGravada(data) : null;
  },
};

/* ───────────────────────────── posse ───────────────────────────── */

export const conversasSupabase: RepositorioConversas = {
  async posse(t, telefone) {
    const { data, error } = await clienteDoContexto(t)
      .from("conversas_estado")
      .select("assumida_em, resolvida_em")
      .eq("tenant_id", t.tenantId)
      .eq("telefone_chave", chaveDe(telefone))
      .maybeSingle<LinhaEstado>();

    /* ⚠️ AQUI A FALHA NÃO ESTOURA, e a escolha é de produto. Quem mais chama isto é o AGENTE,
     * antes de decidir se responde. Estourar faria uma indisponibilidade do banco calar a
     * MAISA em todas as conversas; devolvendo `{}` ela responde — que é o comportamento
     * padrão de uma conversa que ninguém assumiu.
     *
     * O risco assumido é o oposto e é menor: se o dono tinha assumido, a MAISA pode falar por
     * cima dele nessa janela. Duas vozes num minuto de banco fora do ar é pior que silêncio
     * total no atendimento? Não — silêncio é o pior modo de falha deste canal, porque ninguém
     * do lado de fora sabe que algo quebrou. */
    if (error) {
      console.error(`[supabase/memoria] falha ao ler a posse de ${chaveDe(telefone)}: ${error.message}`);
      return {};
    }
    return { assumidaEm: data?.assumida_em ?? null, resolvidaEm: data?.resolvida_em ?? null };
  },

  async marcar(t, telefone, p) {
    /* ⚠️ SÓ AS COLUNAS PEDIDAS VÃO NO PAYLOAD, e isso é a regra deste método.
     *
     * O `on conflict do update` do PostgREST atualiza exatamente as colunas presentes no corpo
     * — **medido contra este projeto**, não assumido da documentação: com uma linha de
     * `memoria_cliente` que tinha `nome` e `horario_favorito`, um upsert mandando só `nome`
     * deixou `horario_favorito` intacto. Vale a pena ter medido, porque o comportamento
     * oposto (completar o resto com default) seria invisível aqui e destrutivo lá.
     *
     * Mandar `resolvida_em: null` "para completar o objeto" faria devolver a conversa à MAISA
     * apagar, de brinde, o que o dono marcou como resolvido — e a fila de pendências reencheria
     * sozinha sem ninguém entender por quê. Ver `criarMudarPosseConversa`: `undefined`
     * significa "não mexa nisto". */
    const patch: Record<string, unknown> = {
      tenant_id: t.tenantId,
      telefone_chave: chaveDe(telefone),
      atualizado_em: new Date().toISOString(),
    };
    if (p.assumida !== undefined) patch.assumida_em = p.assumida ? new Date().toISOString() : null;
    if (p.resolvida !== undefined) patch.resolvida_em = p.resolvida ? new Date().toISOString() : null;

    const { error } = await clienteDoContexto(t)
      .from("conversas_estado")
      .upsert(patch, { onConflict: "tenant_id,telefone_chave" });

    /* Esta ESTOURA, ao contrário das duas de cima: quem chama é o painel, com uma pessoa
     * olhando o botão. Uma falha silenciosa aqui mostraria "Conversa assumida" enquanto a
     * MAISA continua respondendo — a promessa quebrada que esta fatia existe para consertar. */
    if (error) estourar("mudar quem conduz a conversa", error.message);
  },
};
