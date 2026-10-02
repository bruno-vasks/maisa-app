/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o livro-razão da emissão unitária, no Postgres. ⚠️ SÓ SERVIDOR.
 *
 * DDL em `supabase/020_recibo_unitario.sql` — o arquivo é a verdade, não esta prosa.
 *
 * ── ⚠️ ELE GUARDA O CAMINHO DO PDF, E ATÉ 25/08/2026 A REGRA ERA A OPOSTA ──
 *
 * A regra antiga era "URL, nunca o arquivo", e o motivo era bom: recibo de sessão de psicoterapia
 * com CPF de paciente, gente que não é nossa cliente. O que mudou não foi a opinião, foi um
 * número — a URL do canal vale **cinco minutos**, não 48h, e a API dele não tem consulta. Com
 * cinco minutos, "guardar só a URL" e "perder o documento" passaram a ser a mesma coisa.
 *
 * A cópia em si não mora aqui: mora na `GuardaDeComprovante`, e os limites em que ela é
 * aceitável estão escritos em `supabase/023_recibo_numero_e_comprovante.sql`. Este adaptador
 * guarda o caminho, e `pdfDisponivel` decide se a tela oferece o botão.
 *
 * ── ⚠️ AS TRÊS ESCRITAS QUE NÃO SÃO UMA TRANSAÇÃO SÓ, E POR QUE ISSO ESTÁ OK ──
 *
 * `descartar` marca `recusado` e depois chama `soltar_recibo_unitario`. São dois round-trips, e
 * o processo pode morrer no meio — sobrando um `recusado` que ainda segura o pagamento.
 *
 * Isso é recuperável e a recuperação é trivial: `soltar` a partir de `recusado` é idempotente,
 * então qualquer chamada futura conserta. A alternativa — uma função nova no banco só para isso
 * — trocaria um estado transitório inofensivo por mais DDL. O que **não** seria aceitável é a
 * ordem inversa: soltar antes de marcar deixaria o pagamento livre com a linha ainda `pendente`,
 * e aí o lote do mês o pegaria enquanto o recibo talvez existisse.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { LivroDeRecibos, ReciboAberto, DestinatarioDoRecibo } from "@/nucleo/portas/saida/livro-de-recibos";
import type {
  CanalDeEmissao, DesfechoDeRecibo, ReciboEmitido, SituacaoDoRecibo,
} from "@/nucleo/dominio/recibo-unitario";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { clienteDoContexto } from "./contexto-cliente";
import { civilSP } from "@/nucleo/dominio/tempo";
import { FalhaDoProvedor } from "@/nucleo/dominio/erros";

/* A data que vai na mensagem é a CIVIL em São Paulo: `inicio` é timestamptz, e uma sessão das 21h
 * lida em UTC cai no dia seguinte — o paciente receberia "recibo do dia 13" de uma sessão do 12. */
const dataCivil = (iso: string) => civilSP(iso)?.data ?? String(iso).slice(0, 10);

/* ⚠️ UMA STRING LITERAL, NUNCA CONCATENADA — e a linha longa é o preço. O `supabase-js` deriva o
 * tipo da resposta do texto do `select` como tipo literal; quebrar isto em duas partes com `+`
 * faz a inferência desistir e todo `data` desta arquivo virar `GenericStringError`. O sintoma é
 * um TS2352 em cada `as LinhaRazao`, longe daqui. */
const COLUNAS = "id, numero, canal, situacao, protocolo, chave, pdf_url, pdf_expira_em, comprovante_caminho, aviso, erro, criado_em, emitido_em";

const AVISO_020 =
  "O livro-razão do recibo unitário ainda não existe neste banco. Rode "
  + "`supabase/020_recibo_unitario.sql` no SQL Editor do Supabase — até lá a emissão automática "
  + "não roda, e o caminho do lote CSV continua funcionando normalmente.";

const AVISO_023 =
  "O livro-razão existe, mas sem a coluna `numero` — a migração 023 não rodou neste banco. Rode "
  + "`supabase/023_recibo_numero_e_comprovante.sql` no SQL Editor do Supabase. Sem ela a Rebots "
  + "recusa toda emissão com RECEIPT_ERROR_024, porque o `receipt_id` dela é inteiro e o `id` da "
  + "linha é uuid.";

/**
 * A migração ainda não rodou?
 *
 * Mesma lista do adaptador do lote, e pelo mesmo motivo concreto: entre o deploy e o `Run` no
 * SQL Editor — que é um humano abrindo o painel — o `select` pede coluna que não existe e o
 * Postgres responde `42703`. Sem isto, a dona vê erro cru de banco no lugar de "rode a migração".
 */
function faltaMigracao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST202", "42703", "PGRST204"].includes(error.code ?? "")) return true;
  return /relation .* does not exist|could not find the (function|.* column)|column .* does not exist/i
    .test(error.message ?? "");
}

function estourar(error: { code?: string; message?: string } | null): void {
  if (faltaMigracao(error)) throw new Error(AVISO_020);
  if (error) throw new Error(error.message);
}

type LinhaRazao = {
  id: string;
  numero: number | string | null;
  canal: string | null;
  situacao: string | null;
  protocolo: string | null;
  chave: string | null;
  pdf_url: string | null;
  pdf_expira_em: string | null;
  comprovante_caminho: string | null;
  aviso: string | null;
  erro: string | null;
  criado_em: string;
  emitido_em: string | null;
};

/**
 * Do vocabulário do banco para o do domínio.
 *
 * ⚠️ `canal` e `situacao` SÃO CONFERIDOS em vez de convertidos com `as`. O `check` da coluna já
 * garante o conjunto, mas ler texto do banco como união de tipos sem olhar é como `"producao"`
 * com aspas chegou na Vercel. Desconhecido cai no valor mais conservador: `pendente` (que não
 * libera a cascata) e `automacao`.
 */
const doBanco = (l: LinhaRazao): ReciboEmitido => {
  const canais: CanalDeEmissao[] = ["automacao", "rebots", "lote_csv"];
  const situacoes: SituacaoDoRecibo[] = ["pendente", "emitido", "recusado", "cancelado"];
  return {
    id: String(l.id),
    canal: canais.includes(l.canal as CanalDeEmissao) ? (l.canal as CanalDeEmissao) : "automacao",
    situacao: situacoes.includes(l.situacao as SituacaoDoRecibo)
      ? (l.situacao as SituacaoDoRecibo)
      : "pendente",
    protocolo: l.protocolo,
    chave: l.chave,
    pdfUrl: l.pdf_url,
    pdfExpiraEm: l.pdf_expira_em,
    comprovanteCaminho: l.comprovante_caminho,
    /* `?? null` cobre o banco onde a 025 ainda não rodou: a leitura não pode quebrar por causa de
     * uma coluna de relatório. */
    aviso: (l.aviso as ReciboEmitido["aviso"]) ?? null,
    erro: l.erro,
    criadoEm: l.criado_em,
    emitidoEm: l.emitido_em,
  };
};

export const livroDeRecibosSupabase: LivroDeRecibos = {
  async abrir(t: ContextoTenant, p): Promise<ReciboAberto | null> {
    const supabase = clienteDoContexto(t);
    /* Uma sessão vai pela função de sempre, que existe desde a 020 e não depende da 033. Várias
     * vão pela `abrir_recibo_agrupado` (033), tudo ou nada, com a soma feita no banco. */
    const [primeiro] = p.itens;
    const umSo = p.itens.length === 1;
    const { data, error } = umSo
      ? await supabase.rpc("abrir_recibo_unitario", {
        p_tenant_id: t.tenantId,
        p_fonte: primeiro.fonte,
        p_id: primeiro.id,
        p_canal: p.canal,
      })
      : await supabase.rpc("abrir_recibo_agrupado", {
        p_tenant_id: t.tenantId,
        p_atendimentos: p.itens.filter((x) => x.fonte === "atendimento").map((x) => x.id),
        p_avulsos: p.itens.filter((x) => x.fonte === "avulso").map((x) => x.id),
        p_canal: p.canal,
      });
    if (!umSo && faltaMigracao(error)) {
      console.error("[supabase/livro-de-recibos] juntar sessões num recibo: falta rodar supabase/033_recibo_por_mes.sql");
      throw new FalhaDoProvedor("Ainda não dá para juntar as sessões num recibo só. Tente de novo mais tarde.");
    }
    estourar(error);

    /* Zero linhas = já preso por outro canal, ou segundo clique. NÃO é erro — ver a porta. */
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.recibo_id) return null;

    /* ⚠️ SEM `numero` A EMISSÃO NÃO PODE SAIR. É a migração 023 que o acrescentou ao retorno da
     * função; num banco onde ela não rodou, o campo vem `undefined` e o canal receberia `NaN`.
     * Falhar aqui, com o nome do arquivo na frase, custa um minuto — descobrir isso por
     * `RECEIPT_ERROR_024` na tela da dona custa uma tarde. */
    if (linha.numero == null) throw new Error(AVISO_023);

    return {
      id: String(linha.recibo_id),
      /* ★ O protocolo, cunhado pelo banco na mesma transação que prendeu o pagamento. */
      numero: Number(linha.numero),
      /* Somado pelo banco na mesma transação em que prendeu. Nunca vem de quem chama. */
      valor: linha.valor == null ? 0 : Number(linha.valor),
    };
  },

  async registrarProtocolo(t: ContextoTenant, p): Promise<void> {
    const supabase = clienteDoContexto(t);
    /* `is("protocolo", null)` no WHERE: gravar protocolo em cima de um já gravado significaria
     * que duas chamadas ao canal aconteceram para a mesma linha — e a segunda sobrescreveria a
     * referência da primeira, deixando um recibo órfão que nenhum callback consegue casar. */
    const { error } = await supabase
      .from("recibos_emitidos")
      .update({ protocolo: p.protocolo })
      .eq("tenant_id", t.tenantId)
      .eq("id", p.reciboId)
      .is("protocolo", null);

    estourar(error);
  },

  async fechar(t: ContextoTenant, d: DesfechoDeRecibo): Promise<ReciboEmitido | null> {
    const supabase = clienteDoContexto(t);

    /* ⚠️ A SITUAÇÃO DE ORIGEM É A IDEMPOTÊNCIA, e ela depende do destino:
     *
     *   `emitido` · `recusado` ← só de `pendente`   o desfecho da emissão
     *   `cancelado`            ← só de `emitido`    o desfecho do cancelamento
     *
     * A segunda linha faltava, e a falta era silenciosa: o callback de cancelamento chega quando
     * a linha já está `emitido`, então o `eq("situacao","pendente")` não achava nada, devolvia
     * `null`, e a rota respondia "já fechado" — o cancelamento sumia sem erro em log nenhum.
     *
     * Zero linhas continua significando "não havia o que mudar": reentrega de webhook é rotina,
     * e a reconciliação pode estar perguntando a mesma coisa no mesmo instante. */
    const partida = d.situacao === "cancelado" ? "emitido" : "pendente";

    const patch: Record<string, unknown> = {
      situacao: d.situacao,
      chave: d.chave,
      pdf_url: d.pdfUrl,
      pdf_expira_em: d.pdfExpiraEm,
      erro: d.erro,
    };
    /* ⚠️ SÓ MEXE EM `emitido_em` NA EMISSÃO. A versão anterior escrevia `null` em todo desfecho
     * que não fosse `emitido` — inofensivo enquanto só existia `recusado` (que nunca teve data),
     * e destrutivo com `cancelado`: apagaria a data de emissão do documento que foi cancelado,
     * que é justamente o dado de que o prazo de dez dias do art. 7º depende. */
    if (d.situacao === "emitido") patch.emitido_em = new Date().toISOString();
    /* Idem para a cópia: um cancelamento não traz arquivo, e sobrescrever com `null` jogaria
     * fora o comprovante da emissão que de fato aconteceu. */
    if (d.comprovanteCaminho) patch.comprovante_caminho = d.comprovanteCaminho;

    const { data, error } = await supabase
      .from("recibos_emitidos")
      .update(patch)
      .eq("tenant_id", t.tenantId)
      .eq("protocolo", d.protocolo)
      .eq("situacao", partida)
      .select(COLUNAS);

    estourar(error);

    const linha = (data ?? [])[0] as LinhaRazao | undefined;
    return linha ? doBanco(linha) : null;
  },

  async descartar(t: ContextoTenant, p): Promise<void> {
    const supabase = clienteDoContexto(t);
    /* Marca primeiro. A ordem inversa deixaria o pagamento livre com a linha ainda `pendente` —
     * e aí o lote do mês o pegaria enquanto o recibo talvez existisse. Ver o cabeçalho. */
    const { error } = await supabase
      .from("recibos_emitidos")
      .update({ situacao: "recusado", erro: p.erro })
      .eq("tenant_id", t.tenantId)
      .eq("id", p.reciboId)
      .eq("situacao", "pendente");

    estourar(error);

    /* Solta em seguida. Se o processo morrer aqui, sobra um `recusado` segurando o pagamento —
     * recuperável, porque `soltar` a partir de `recusado` é idempotente. */
    const { error: erroSoltar } = await supabase.rpc("soltar_recibo_unitario", {
      p_tenant_id: t.tenantId,
      p_recibo_id: p.reciboId,
    });
    estourar(erroSoltar);
  },

  async soltar(t: ContextoTenant, reciboId): Promise<boolean> {
    const supabase = clienteDoContexto(t);
    /* Função e não `update`: soltar o pagamento e conferir a situação têm que ser a mesma
     * decisão. Um `select` seguido de `update` deixaria caber, no meio, o callback que muda a
     * linha para `emitido` — e aí soltaríamos um pagamento cujo recibo existe. */
    const { data, error } = await supabase.rpc("soltar_recibo_unitario", {
      p_tenant_id: t.tenantId,
      p_recibo_id: reciboId,
    });
    estourar(error);
    return data === true;
  },

  async porProtocolo(t: ContextoTenant, p): Promise<ReciboEmitido | null> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("recibos_emitidos")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .eq("canal", p.canal)
      .eq("protocolo", p.protocolo)
      .maybeSingle<LinhaRazao>();

    estourar(error);
    return data ? doBanco(data) : null;
  },

  async pendentes(t: ContextoTenant, p): Promise<ReciboEmitido[]> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("recibos_emitidos")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .eq("situacao", "pendente")
      .lt("criado_em", p.antesDe)
      /* Mais velhos primeiro: são os que mais precisam de resposta, e se a rodada for cortada
       * por timeout é melhor que o corte caia nos recentes. */
      .order("criado_em", { ascending: true });

    estourar(error);
    return (data ?? []).map((l) => doBanco(l as LinhaRazao));
  },

  async listar(t: ContextoTenant, p): Promise<ReciboEmitido[]> {
    const supabase = clienteDoContexto(t);
    const { data, error } = await supabase
      .from("recibos_emitidos")
      .select(COLUNAS)
      .eq("tenant_id", t.tenantId)
      .order("criado_em", { ascending: false })
      .limit(p?.limite ?? 50);

    estourar(error);
    return (data ?? []).map((l) => doBanco(l as LinhaRazao));
  },

  /**
   * Anota o desfecho do aviso. Relatório, não desfecho fiscal — ver a porta.
   *
   * ⚠️ NÃO USA `estourar(error)`. Um erro aqui (a 025 não rodou, por exemplo) não pode subir: quem
   * chama está no meio do callback, e derrubá-lo faria o canal reentregar um desfecho JÁ GRAVADO.
   * Anotar é o que se perde; o recibo continua correto.
   */
  async registrarAviso(t: ContextoTenant, p): Promise<void> {
    const supabase = clienteDoContexto(t);
    const { error } = await supabase
      .from("recibos_emitidos")
      .update({ aviso: p.desfecho })
      .eq("tenant_id", t.tenantId)
      .eq("id", p.reciboId);

    if (error) {
      console.warn(`[supabase/livro-de-recibos] não anotei o aviso do recibo ${p.reciboId}: ${error.message}`);
    }
  },

  /**
   * Conta o que ficou sem aviso. Duas contagens, `head: true` — não traz linha nenhuma, só o total.
   *
   * ⚠️ Falha macia: devolve zero em erro. É um número de relatório na tela; derrubar a leitura da
   * tela inteira por causa dele (inclusive quando a 025 não rodou) seria caro à toa.
   */
  async avisosPendentes(t: ContextoTenant): Promise<{ falhou: number; semTelefone: number }> {
    const supabase = clienteDoContexto(t);
    const contar = async (valor: string): Promise<number> => {
      const { count, error } = await supabase
        .from("recibos_emitidos")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.tenantId)
        .eq("aviso", valor);
      return error ? 0 : count ?? 0;
    };
    const [falhou, semTelefone] = await Promise.all([contar("falhou"), contar("sem_telefone")]);
    return { falhou, semTelefone };
  },

  /**
   * Quem avisar — ver a porta.
   *
   * ⚠️ SÃO DUAS LEITURAS PORQUE SÃO DUAS TABELAS. O pagamento preso por este recibo é um
   * atendimento OU um avulso, e não há view que una os dois já emitidos (a `v_a_recibar` mostra o
   * que está FORA de recibo, que é o oposto disto). A primeira que responder ganha.
   *
   * ⚠️ O TELEFONE VEM DO CADASTRO, sempre. O atendimento tem `cliente_tel` congelado no momento da
   * marcação — número velho manda a mensagem para quem trocou de número. Quem manda é a ficha.
   */
  async destinatario(t: ContextoTenant, reciboId: string): Promise<DestinatarioDoRecibo | null> {
    const supabase = clienteDoContexto(t);

    /* ⚠️ LISTAS, E NÃO `maybeSingle`, desde 01/10/2026: um recibo por mês junta várias sessões com
     * o mesmo `recibo_id`, e o `maybeSingle` com duas linhas devolve erro, que aqui virava
     * "ninguém para avisar". */
    const [{ data: atends }, { data: avulsos }] = await Promise.all([
      supabase
        .from("atendimentos")
        .select("inicio, servico_valor, clientes(nome, telefone)")
        .eq("tenant_id", t.tenantId)
        .eq("recibo_id", reciboId),
      supabase
        .from("pagamentos_avulsos")
        .select("data, valor, nome, clientes(nome, telefone)")
        .eq("tenant_id", t.tenantId)
        .eq("recibo_id", reciboId),
    ]);

    type Pessoa = { nome: string; telefone: string | null } | null;
    const linhas = [
      ...((atends ?? []) as unknown as { inicio: string; servico_valor: number | null; clientes: Pessoa }[]).map((a) => ({
        nome: a.clientes?.nome ?? null, telefone: a.clientes?.telefone ?? null,
        data: dataCivil(a.inicio), valor: Number(a.servico_valor ?? 0),
      })),
      ...((avulsos ?? []) as unknown as { data: string; valor: number | null; nome: string | null; clientes: Pessoa }[]).map((q) => ({
        /* O nome do cadastro na frente do nome digitado: quem lançou à mão pode ter escrito
         * "Ana" para uma Ana Beatriz que já existe. */
        nome: q.clientes?.nome ?? q.nome ?? null, telefone: q.clientes?.telefone ?? null,
        data: String(q.data).slice(0, 10), valor: Number(q.valor ?? 0),
      })),
    ];
    if (!linhas.length) return null;

    const ultima = linhas.reduce((a, b) => (b.data > a.data ? b : a));
    return {
      nome: ultima.nome,
      telefone: linhas.find((l) => l.telefone)?.telefone ?? null,
      data: ultima.data,
      valor: linhas.reduce((s, l) => s + l.valor, 0),
      sessoes: linhas.length,
    };
  },
};

/**
 * De quem é este recibo? — o RESOLVEDOR DE INQUILINO do callback.
 *
 * ★ É A ÚNICA CONSULTA DESTE ARQUIVO SEM `.eq("tenant_id", …)`, e a exceção é a mesma de
 * `integracoes_whatsapp.instancia` no webhook do WhatsApp: **a finalidade dela é PRODUZIR o
 * inquilino**, então não pode filtrar por ele.
 *
 * A regra não negociável do `dominio/tenant.ts` continua respeitada: o `tenantId` **não vem do
 * corpo do request**. Vem daqui, de dado durável nosso. O que vem de fora é o `receipt_id`, e ele
 * não escolhe inquilino: se o protocolo não existir, a resposta é `null` e a rota devolve 404.
 *
 * ⚠️ MAS ELE DEIXOU DE SER UM UUID, E ISSO É UMA PERDA DE DEFESA EM PROFUNDIDADE. Era um uuid v4;
 * desde a migração 023 é um inteiro sequencial, porque o `receipt_id` da Rebots é `int` e recusa
 * uuid. Consequência honesta: o protocolo passou a ser **enumerável**. Quem tivesse o
 * `RECIBOS_CALLBACK_SECRET` antes ainda precisava adivinhar um uuid para fechar uma linha alheia;
 * agora bastaria contar 1, 2, 3.
 *
 * O que sobrou de proteção: o segredo do callback, e o fato de `fechar` só sair de `pendente`
 * (ou de `emitido`, para cancelar). O que NÃO existe: um segundo fator no corpo. O `issuer_code`
 * que eles mandam no callback seria um — não é enumerável, porque é o CPF da profissional — e
 * conferi-lo é a próxima melhoria deste arquivo, não uma coisa feita.
 *
 * ⚠️ O `canal` FAZ PARTE DA CHAVE. Sem ele, um POST no callback da Rebots poderia fechar uma
 * linha da nossa automação, e vice-versa — os protocolos vivem na mesma coluna.
 */
export async function tenantDoProtocolo(
  p: { canal: CanalDeEmissao; protocolo: string },
): Promise<string | null> {
  const { createAdminClient, isAdminConfigured } = await import("./admin");
  if (!isAdminConfigured || !p.protocolo.trim()) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("recibos_emitidos")
    .select("tenant_id")
    .eq("canal", p.canal)
    .eq("protocolo", p.protocolo)
    .maybeSingle<{ tenant_id: string }>();

  /* Falha de banco NÃO cai para chute nenhum: devolver `null` faz a rota responder erro e o
   * canal reentregar, que é reversível. Adivinhar o inquilino escreveria no razão de outra
   * pessoa — e escreveria "recibo emitido" sobre um pagamento que não é dela. */
  if (error) return null;
  return data?.tenant_id ?? null;
}
