/* ─────────────────────────────────────────────────────────────────────────────
 * CONTEXTO — de quem é a conversa que acabou de chegar.
 *
 * Irmão de `entrada/http/contexto.ts`, com um problema mais difícil. Lá o inquilino sai
 * de um cookie de sessão assinado: ninguém falsifica. Aqui não existe sessão — existe
 * um webhook público que qualquer um pode chamar.
 *
 * A REGRA NÃO NEGOCIÁVEL (`dominio/tenant.ts`): o `tenantId` nunca vem do corpo do
 * request. Nem do agente, nem do cliente, nem de um campo `tenant_id` que o provedor
 * mandou. Ele é resolvido a partir do DESTINO da mensagem — o lado do envelope que só o
 * provedor de WhatsApp preenche.
 *
 * Foi exatamente o descuido oposto — id de inquilino vindo por query param — que abriu
 * o pior furo da integração original, onde bastava conhecer o id da vítima para
 * sobrescrever a agenda dela. Um webhook aberto com tenant no corpo seria a mesma
 * falha, sem nem precisar de login.
 *
 * O QUE CONTA COMO "DESTINO" DEPENDE DO PROVEDOR, e é a diferença que mais custou aqui:
 *   • Cloud API (Meta) — `metadata.display_phone_number`, o número do negócio.
 *   • Evolution ....... — o NOME DA INSTÂNCIA (`instance`). A Evolution não manda o
 *     número do negócio de forma confiável no envelope de mensagem; o que ela sempre
 *     manda é qual instância recebeu. Uma instância é um negócio, então é identificador
 *     suficiente — e é preenchido pelo servidor da Evolution, não por quem escreveu a
 *     mensagem, que é a propriedade de que precisamos.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { atorAgente } from "@/nucleo/dominio/tenant";
/* ⚠️ EXCEÇÃO DECLARADA à regra "adaptador não importa adaptador" (`ARQUITETURA.md` §6).
 *
 * Um adaptador de ENTRADA importando um de SAÍDA é a seta que a regra proíbe, e este
 * arquivo até tem um comentário logo abaixo (em `INSTANCIA`) usando a regra para justificar
 * ler env em dois lugares em vez de importar `saida/evolution/config`. Então a exceção
 * precisa de limite escrito, não de silêncio.
 *
 * O limite: resolver "de quem é este pedido" é a ÚNICA responsabilidade que exige isto, e
 * ela é intrinsecamente um acesso a dado — o mapa instância → negócio mora numa tabela, e
 * não há como um adaptador de entrada respondê-la sem falar com o banco. O irmão deste
 * arquivo, `entrada/http/contexto.ts`, faz exatamente o mesmo há mais tempo (importa
 * `saida/supabase/server` para ler `membros`), então isto alinha os dois em vez de abrir
 * caminho novo.
 *
 * O que a exceção NÃO autoriza: ler cadastro, agenda, serviço ou qualquer outra coisa
 * daqui. Para isso existe a porta `RepositorioNegocio` e o caminho é `composicao.ts`.
 * Se um segundo `from()` aparecer neste arquivo, ele está no lugar errado. */
import { createAdminClient, isAdminConfigured } from "@/adaptadores/saida/supabase/admin";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";

/**
 * O segredo do webhook. **Sem ele, a rota não atende.**
 *
 * Não é sobre espionagem: sem verificação, qualquer um faz a MAISA marcar horário na
 * agenda real do dono mandando um POST — e cada POST gasta token. Falha fechada de
 * propósito; um webhook que atende sem segredo configurado é um webhook que ninguém
 * lembra de fechar depois.
 *
 * Na Evolution ele é cadastrado em `webhook.headers.apikey` (ver
 * `saida/evolution/cliente.ts` → `configurarWebhook`); na Cloud API é o "Verify token".
 */
export const SEGREDO = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";

/**
 * O `tenantId` de reserva, por env.
 *
 * Deixou de ser o caminho principal: agora o inquilino sai de `integracoes_whatsapp`
 * (ver `tenantPorDestino` no fim deste arquivo), que é o que a dívida declarada aqui
 * prometia. Este env sobrou para UM caso, e ele é útil: ambiente sem Supabase
 * configurado, onde a MAISA roda em modo demonstração e se conversa com ela por `curl`
 * para afinar o tom. Sem ele, esse fluxo — o único que não precisa de banco nem de
 * número contratado — deixaria de existir.
 *
 * Com Supabase configurado, o banco ganha. É de propósito: um env esquecido apontando
 * para o inquilino errado escreveria na agenda de outro negócio, e o banco é a fonte que
 * o webhook não controla.
 */
const TENANT = process.env.MAISA_TENANT_ID ?? "";
const NUMERO = process.env.MAISA_WHATSAPP_NUMERO ?? "";
/** Lido aqui E em `saida/evolution/config.ts`, de propósito: adaptador não importa
 *  adaptador (`ARQUITETURA.md` §6). Variável de ambiente é ambiente, não dependência. */
const INSTANCIA = (process.env.EVOLUTION_INSTANCIA ?? "").trim();

const digitos = (v: string) => v.replace(/\D/g, "");

/**
 * ⚠️ FLAG DE TESTE, DESLIGADA POR PADRÃO — e ela reabre o risco de loop.
 *
 * Ligada (`=1`), a MAISA passa a responder mensagens que saíram da própria conta, desde
 * que tenham vindo de um APARELHO (ver `APARELHOS` e o bloco do `fromMe` abaixo). Serve
 * para o caso em que o número da instância é o número do dono e ele quer testar mandando
 * mensagem para si mesmo, sem precisar de um segundo celular.
 *
 * Fica atrás de flag porque a proteção passa a depender de um campo do provedor (`source`)
 * em vez de uma regra absoluta (`fromMe` = ignore). Se a Evolution mudar o valor de
 * `source` para envios de API numa versão futura, o resultado é a MAISA conversando
 * consigo mesma indefinidamente, gastando token, sem ninguém do outro lado. Em produção
 * de verdade — número do negócio ≠ número do dono — isto não deve estar ligado.
 */
const RESPONDER_A_SI_MESMO = process.env.MAISA_RESPONDER_A_SI_MESMO === "1";

/**
 * `source` que significa "gente digitando num app". Medido na Evolution 2.3.7:
 * o que a API envia sai como `web`, e é justamente ele que NÃO pode estar aqui — é o eco
 * da própria MAISA. `unknown` também fica fora: origem que não se sabe não é prova de
 * humano, e a dúvida tem que cair para o lado do silêncio.
 */
const APARELHOS = new Set(["ios", "android", "desktop"]);

/** Comparação pelos 8 últimos dígitos: o provedor manda `5511988887777`, o env
 *  costuma ter `(11) 98888-7777`, e DDI/nono dígito são justamente o que varia
 *  entre as duas grafias do mesmo número. */
function mesmoNumero(a: string, b: string): boolean {
  const x = digitos(a).slice(-8);
  return x.length === 8 && x === digitos(b).slice(-8);
}

/* ───────────────────────────── quem pode falar com a MAISA ─────────────────────────────
 * Lista de números liberados. É um guardrail de LANÇAMENTO, não de segurança: o segredo do
 * webhook já barra quem não é o provedor. Isto barra quem é cliente de verdade.
 *
 * Existe porque o número de teste da MAISA é o número PESSOAL do dono. Sem a lista, a
 * primeira pessoa que mandar mensagem para ele em produção — um amigo, um cliente antigo,
 * alguém que achou o contato — cai numa IA que marca horário na agenda real e gasta token.
 * E o pior: essa pessoa não sabe que está falando com um robô em teste.
 *
 * VAZIA = LIBERADO PARA TODOS. Fail-open aqui, ao contrário do segredo do webhook (que
 * falha fechado), porque são coisas diferentes: o segredo protege de quem não deveria
 * chegar, e esta lista só ESTREITA um canal que já está autenticado. Vazia significa "sem
 * estreitamento", que é o único jeito de `curl` e demo continuarem funcionando sem
 * ninguém configurar nada.
 *
 * Para não virar fail-open silencioso, o modo aparece em `/api/whatsapp/conexao`
 * (`permitidos: "todos"` ou a lista) — dá para OLHAR e ver em que modo está.
 *
 * ── ⚠️ ELA VALE PARA UM INQUILINO SÓ, DESDE 17/08/2026 ──
 *
 * Até esta data a lista era GLOBAL: uma env, aplicada a toda mensagem que chegasse, de
 * qualquer inquilino. Isso funcionava enquanto existia um inquilino só — e virava uma
 * armadilha no minuto seguinte ao primeiro cliente parear o WhatsApp dele.
 *
 * O cenário, exato: a barbearia pareia, o cliente dela manda "tem horário amanhã?", o
 * número dele não está numa env que fala do celular do BRUNO, e a mensagem morre num
 * `return` com HTTP 200. Nada é gravado, nada é respondido. O dono abre a tela de
 * Conversas, vê vazio, e conclui que comprou um produto que não funciona. Do lado de cá
 * não há erro nenhum para investigar — o descarte é o comportamento pedido.
 *
 * Agora a lista só se aplica ao inquilino nomeado em `MAISA_TENANT_DE_TESTE`. Sem essa
 * variável, ela **não vale para ninguém** — e isso é deliberado: um filtro de teste que
 * cala cliente pagante é pior que filtro nenhum. O guardrail do número pessoal do Bruno
 * não sumiu, mudou de lugar e ficou melhor: quem faz esse trabalho no produto é o par
 * `modo` + caderno de contatos (`dominio/contatos.ts`), que é por inquilino, fica no
 * banco e tem tela.
 */
const PERMITIDOS = (process.env.MAISA_WHATSAPP_PERMITIDOS ?? "")
  .split(/[,;\s]+/)
  .map((n) => digitos(n).slice(-8))
  .filter((n) => n.length === 8);

/** O inquilino a que a lista se aplica. Vazio = a lista não vale para ninguém. */
const TENANT_DE_TESTE = (process.env.MAISA_TENANT_DE_TESTE ?? "").trim();

/**
 * Para o diagnóstico mostrar em que modo está, sem expor número inteiro.
 *
 * ⚠️ DIZ O ESTADO PERIGOSO POR EXTENSO. "lista configurada e sem inquilino de teste" é
 * exatamente a combinação que faria alguém achar que está filtrando quando não está — e o
 * contrário do incidente que a lista por inquilino veio consertar. Um diagnóstico que
 * responde só `["…4906"]` deixa quem lê concluir errado nos dois sentidos.
 */
export const modoDaLista = () => {
  if (PERMITIDOS.length === 0) return "todos";
  if (!TENANT_DE_TESTE) return "inerte (MAISA_WHATSAPP_PERMITIDOS existe, mas falta MAISA_TENANT_DE_TESTE)";
  return { tenantDeTeste: TENANT_DE_TESTE, numeros: PERMITIDOS.map((n) => `…${n.slice(-4)}`) };
};

/** Idem para o flag de responder a si mesmo — é um modo de teste, e modo de teste
 *  ligado em produção sem ninguém ver é como ele fica ligado para sempre. */
export const respondeASiMesmo = () => RESPONDER_A_SI_MESMO;

/**
 * Este número pode conversar? Compara pelos 8 últimos dígitos, igual a `mesmoNumero`:
 * o provedor manda `5511988887777` e no env costuma-se escrever `(11) 98888-7777`.
 */
export function numeroPermitido(telefone: string, tenantId?: string): boolean {
  if (PERMITIDOS.length === 0) return true;

  /* Sem inquilino de teste declarado, a lista é inerte. Ver o ⚠️ do bloco acima: o modo
   * de falha que isto evita é silencioso e indistinguível de "o produto não funciona". */
  if (!TENANT_DE_TESTE) return true;

  /* Inquilino diferente do de teste passa direto — a lista fala do celular do Bruno, e
   * não tem nada a dizer sobre os clientes de uma barbearia. */
  if (tenantId !== TENANT_DE_TESTE) return true;

  return PERMITIDOS.includes(digitos(telefone).slice(-8));
}

export type Resolucao = { ok: true; tenant: ContextoTenant } | { ok: false; motivo: string };

/**
 * Envelope da mensagem → contexto do inquilino, com o ator já marcado como agente.
 *
 * Aceita a instância OU o número, e basta um. Não é frouxidão: são dois provedores com
 * envelopes diferentes (ver o cabeçalho), e exigir os dois faria a Evolution — que não
 * manda número — nunca ser atendida. Sem nenhum dos dois configurados, recusa.
 *
 * `atorAgente()` é o que faz o evento nascer com "Origem: MAISA (WhatsApp)" na
 * descrição — na agenda do dono dá para ver, de relance, o que a IA marcou sozinha.
 * Sem isso, um atendimento criado pela IA seria indistinguível de um criado à mão, e
 * a primeira pergunta depois de um erro ("quem marcou isso?") não teria resposta.
 */
export async function contextoDaMensagem(envelope: Envelope): Promise<Resolucao> {
  const tenantId = await tenantPorDestino(envelope);
  if (!tenantId.ok) return tenantId;

  return {
    ok: true,
    tenant: {
      tenantId: tenantId.valor,
      /* Não há usuário logado: quem age é o negócio.
       *
       * ⚠️ `usuarioId` recebe o `tenantId` e isso NÃO é o mesmo atalho de antes. Antes os
       * dois eram o id do usuário dono. Agora o valor é o id do NEGÓCIO, e ele está aqui
       * só porque `ContextoTenant` exige o campo. Ninguém no caminho do agente deve usar
       * `usuarioId` para consultar nada: as consultas filtram por `tenant_id`, e o que
       * decide o cliente do Supabase é o `ator` (ver `saida/supabase/contexto-cliente.ts`).
       * Se um dia algum adaptador voltar a usar `usuarioId` como chave, é aqui que ele
       * vai achar um uuid de negócio onde esperava um de usuário. */
      usuarioId: tenantId.valor,
      ator: atorAgente(envelope.conversaId),
    },
  };
}

type Resolvido = { ok: true; valor: string } | { ok: false; motivo: string };

/**
 * Neutraliza os curingas de um padrão de `LIKE`/`ILIKE`, para que ele case só consigo mesmo.
 *
 * Uma passada só, com classe de caractere — e é por isso que `\` pode estar na mesma lista
 * dos outros: `replace` não revisita o que ele mesmo inseriu. Em três `replace` encadeados a
 * ordem importaria (escapar `%` antes de `\` faria a barra recém-inserida ser escapada de
 * novo, e o padrão pararia de casar com o nome real).
 *
 * `*` entra porque o PostgREST o traduz para `%` antes de montar o SQL — ele não é curinga
 * do Postgres, é da camada HTTP, e por isso passa despercebido em quem só pensa em SQL.
 */
const escaparPadrao = (v: string): string => v.replace(/[\\%_*]/g, (c) => `\\${c}`);

/**
 * De qual inquilino é esta mensagem — a pergunta mais sensível do adaptador.
 *
 * Ordem: banco primeiro, env depois. Ver o comentário de `TENANT` para o porquê.
 *
 * A consulta é por `instancia`, que tem `unique` GLOBAL em `002_multitenant.sql`
 * justamente para servir a isto: um nome de instância identifica um negócio no mundo
 * inteiro, então não há ambiguidade a resolver. E o valor comparado é o que o SERVIDOR da
 * Evolution preencheu no envelope — nunca um campo que quem escreveu a mensagem controla.
 */
async function tenantPorDestino(envelope: Envelope): Promise<Resolvido> {
  const instancia = (envelope.instancia ?? "").trim();

  if (isSupabaseConfigured && isAdminConfigured && instancia) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("integracoes_whatsapp")
      .select("tenant_id")
      /* `ilike` e não `eq`: a Evolution devolve o nome da instância com a caixa que foi
       * cadastrada nela, e quem cadastrou os dois lados (servidor e banco) digitou à mão.
       * "maisa" vs "MAISA-prod" é o erro mais comum deste arquivo.
       *
       * ⚠️ MAS `ilike` recebe um PADRÃO, não um literal — e o valor vem do corpo do request.
       * O PostgREST parametriza (não há SQL injection), só que `%`, `_` e `*` continuam
       * sendo CURINGA dentro do padrão. Uma instância `"%"` casaria com a primeira linha de
       * `integracoes_whatsapp` — de qualquer negócio — e a conversa seria atendida como
       * inquilino alheio, marcando na agenda de outra pessoa. É a mesma classe de furo que
       * este arquivo existe para não repetir, só entrando pela porta do LIKE em vez da do
       * query param.
       *
       * `escaparPadrao` neutraliza os três. Passar `eq` resolveria também, mas custaria a
       * insensibilidade à caixa, que é o motivo de o `ilike` estar aqui. */
      .ilike("instancia", escaparPadrao(instancia))
      .maybeSingle<{ tenant_id: string }>();

    if (error) {
      /* Falha de banco NÃO cai para o env: seria trocar "não sei de quem é" por "vou
       * chutar o negócio do env", e o chute escreve na agenda de alguém. Descartar a
       * mensagem é reversível (o cliente reenvia); marcar horário no negócio errado não. */
      return { ok: false, motivo: `falha ao resolver o inquilino da instância "${instancia}": ${error.message}` };
    }
    if (data) return { ok: true, valor: data.tenant_id };

    /* Instância desconhecida com banco de pé é configuração faltando, não erro
     * transitório: alguém apontou o webhook da Evolution para cá sem cadastrar a linha
     * em `integracoes_whatsapp`. Dizer o nome que chegou é o que encurta o diagnóstico. */
    return {
      ok: false,
      motivo: `instância "${instancia}" não está em integracoes_whatsapp — cadastre a linha do negócio`,
    };
  }

  /* ── Caminho de demonstração: sem banco, o env manda ── */
  if (!TENANT) {
    return {
      ok: false,
      motivo: isSupabaseConfigured
        ? "instância não identificada e SUPABASE_SERVICE_ROLE_KEY ausente — o webhook não consegue ler integracoes_whatsapp"
        : "MAISA_TENANT_ID não configurado",
    };
  }
  if (!INSTANCIA && !NUMERO) {
    return { ok: false, motivo: "configure EVOLUTION_INSTANCIA (Evolution) ou MAISA_WHATSAPP_NUMERO (Cloud API)" };
  }

  const porInstancia = !!INSTANCIA && !!instancia && instancia.toLowerCase() === INSTANCIA.toLowerCase();
  const porNumero = !!NUMERO && !!envelope.para && mesmoNumero(envelope.para, NUMERO);

  if (!porInstancia && !porNumero) {
    /* O motivo diz o que CHEGOU, porque o erro real quase sempre é uma diferença boba
     * (instância "maisa" vs "MAISA-prod") — e sem ver os dois lados a pessoa fica
     * trocando env no escuro. Nada aqui é segredo: nome de instância e número do
     * próprio negócio. */
    return {
      ok: false,
      motivo: `destino desconhecido — chegou instância "${envelope.instancia ?? "—"}" / número "${envelope.para || "—"}"`,
    };
  }

  return { ok: true, valor: TENANT };
}

/* ───────────────────────────── normalização do webhook ─────────────────────────────
 * Evolution API e a Cloud API da Meta mandam formatos diferentes, e nós queremos
 * depender de nenhum dos dois: o resto do adaptador fala `MensagemRecebida`. Ficar
 * tolerante aqui é o que permite trocar de provedor sem tocar no agente. */

/** O que não é texto. Não respondemos a isso hoje — mas o tipo VIAJA até a rota para
 *  que o descarte apareça no log com nome ("ignorado: audio") em vez de virar silêncio.
 *  Áudio é o caso que mais vai acontecer no Brasil; ver o LEIA-ME desta pasta. */
export type Midia = "audio" | "imagem" | "video" | "documento" | "figurinha" | "localizacao" | "contato" | "reacao";

export type Envelope = {
  /** Telefone do cliente, só dígitos. */
  de: string;
  /** Número do negócio, quando o provedor manda (Cloud API sempre; Evolution não). */
  para: string;
  /** Nome da instância que recebeu (Evolution). É o identificador de destino de lá. */
  instancia?: string;
  texto: string;
  conversaId?: string;
  /** Presente quando a mensagem não era (só) texto. */
  midia?: Midia;
  /** O `…@lid` cru, quando a mensagem chegou assim. Ver `MensagemRecebida.jid`. */
  jid?: string;
};

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * A Evolution é inconsistente no nome do evento: a documentação e a configuração usam
 * `MESSAGES_UPSERT`, e o que chega no corpo é `messages.upsert` (bug conhecido,
 * evolution-api#1340). Comparamos numa forma canônica em vez de escolher um lado.
 */
const ehMensagemNova = (evento: string) => evento.trim().toLowerCase().replace(/[_-]/g, ".") === "messages.upsert";

/**
 * Extrai o telefone de um JID: `5511988887777@s.whatsapp.net` → `5511988887777`.
 * O sufixo `:12` que aparece em mensagens de aparelho secundário é o id do device,
 * não parte do número — deixá-lo passar faria o cliente virar um lead novo a cada
 * troca de celular.
 */
const telefoneDoJid = (jid: string) => digitos(jid.split("@")[0]?.split(":")[0] ?? "");

/**
 * O texto de dentro da mensagem do Baileys, que é uma cebola.
 *
 * Uma mensagem de texto simples é `conversation`. Mas a MESMA frase chega como
 * `extendedTextMessage` se for resposta a outra mensagem, dentro de `ephemeralMessage` se
 * o cliente usa mensagens temporárias (padrão em muitos aparelhos), e como
 * `imageMessage.caption` se ele mandou foto escrevendo em cima. Ler só `conversation`
 * funciona no teste e perde uma fatia grande da conversa real — sem erro nenhum no log.
 */
function conteudo(m: any, profundidade = 0): { texto: string; midia?: Midia } {
  if (!m || profundidade > 4) return { texto: "" };

  // Embrulhos: a mensagem real está uma camada abaixo.
  const dentro =
    m.ephemeralMessage?.message ??
    m.viewOnceMessage?.message ??
    m.viewOnceMessageV2?.message ??
    m.viewOnceMessageV2Extension?.message ??
    m.documentWithCaptionMessage?.message ??
    m.editedMessage?.message ??
    null;
  if (dentro) return conteudo(dentro, profundidade + 1);

  if (texto(m.conversation)) return { texto: m.conversation };
  if (texto(m.extendedTextMessage?.text)) return { texto: m.extendedTextMessage.text };

  /* Respostas de botão e de lista chegam como escolha, não como texto. Traduzimos para o
   * rótulo que o cliente VIU: para ele, tocar no botão "Amanhã" foi dizer "Amanhã". */
  if (m.buttonsResponseMessage) {
    return { texto: texto(m.buttonsResponseMessage.selectedDisplayText) || texto(m.buttonsResponseMessage.selectedButtonId) };
  }
  if (m.listResponseMessage) {
    return { texto: texto(m.listResponseMessage.title) || texto(m.listResponseMessage.singleSelectReply?.selectedRowId) };
  }
  if (m.templateButtonReplyMessage) {
    return { texto: texto(m.templateButtonReplyMessage.selectedDisplayText) };
  }

  // Mídia: a legenda conta como fala; o anexo em si a MAISA não lê.
  if (m.imageMessage) return { texto: texto(m.imageMessage.caption), midia: "imagem" };
  if (m.videoMessage) return { texto: texto(m.videoMessage.caption), midia: "video" };
  if (m.documentMessage) return { texto: texto(m.documentMessage.caption), midia: "documento" };
  if (m.audioMessage) return { texto: "", midia: "audio" };
  if (m.stickerMessage) return { texto: "", midia: "figurinha" };
  if (m.locationMessage || m.liveLocationMessage) return { texto: "", midia: "localizacao" };
  if (m.contactMessage || m.contactsArrayMessage) return { texto: "", midia: "contato" };
  if (m.reactionMessage) return { texto: "", midia: "reacao" };

  return { texto: "" };
}

/**
 * Extrai o que importa de qualquer um dos três formatos que já vimos, incluindo o
 * nosso: `{ de, texto }` cru, para conversar com a MAISA por `curl` antes de existir
 * número de WhatsApp. Afinar o tom sem depender de contrato de provedor é o que faz
 * essa parte ser iterável.
 *
 * `null` = não é conversa. A rota devolve 200 e ignora — ver o comentário dela sobre por
 * que 200 e não 4xx.
 */
export function normalizar(corpo: any): Envelope | null {
  // Formato de teste / interno.
  if (texto(corpo?.de) && texto(corpo?.texto)) {
    return {
      de: digitos(corpo.de) || corpo.de,
      para: texto(corpo.para) || NUMERO,
      instancia: texto(corpo.instancia) || INSTANCIA || undefined,
      texto: corpo.texto,
      conversaId: texto(corpo.conversaId) || undefined,
    };
  }

  // Cloud API (Meta): entry[].changes[].value.messages[]
  const valor = corpo?.entry?.[0]?.changes?.[0]?.value;
  const msgMeta = valor?.messages?.[0];
  if (msgMeta) {
    return {
      de: digitos(texto(msgMeta.from)),
      para: digitos(texto(valor?.metadata?.display_phone_number)),
      texto: texto(msgMeta.text?.body) || texto(msgMeta.button?.text) || texto(msgMeta.interactive?.list_reply?.title),
      conversaId: texto(msgMeta.id) || undefined,
    };
  }

  // Evolution API: { event, instance, sender, data: { key, message, ... } }
  const d = corpo?.data;
  if (d?.key?.remoteJid) {
    /* Só mensagem nova. `messages.update` (recibo de leitura) e `presence.update`
     * também têm `data.key`, e sem este filtro cada olhada do cliente na conversa
     * entraria aqui para ser descartada mais adiante, por acidente. */
    if (texto(corpo.event) && !ehMensagemNova(corpo.event)) return null;

    /* ── ECO DA PRÓPRIA MENSAGEM ──
     * A Evolution entrega o que NÓS mandamos de volta como `messages.upsert` com
     * `fromMe: true`, no mesmo evento das recebidas. Sem descartar, a MAISA responde a si
     * mesma — e um bot conversando consigo é loop infinito, pago, e visível para o cliente.
     *
     * Por padrão, todo `fromMe` cai fora. Ponto.
     *
     * ⚠️ MAS existe o caso de teste em que o número da instância É o número do dono: ele
     * quer mandar mensagem para si mesmo e ver a MAISA responder. Aí as duas coisas — o
     * que ele digita e o que a MAISA envia — chegam com `fromMe: true`, no mesmo chat, do
     * mesmo número. `remoteJid`, `fromMe` e `pushName` são idênticos.
     *
     * O que difere é `source`, e isto foi MEDIDO na Evolution 2.3.7 (não presumido):
     *   • `"web"` ....... mandado pela API (Baileys se apresenta como dispositivo web)
     *   • `"ios"` / `"android"` / `"desktop"` ... digitado por gente, num app de verdade
     *
     * Então o eco da MAISA é sempre `web`, e é isso que segura o loop mesmo com o flag
     * ligado: não é uma heurística sobre conteúdo, é a origem do envio.
     *
     * LIMITAÇÃO CONHECIDA: se o dono digitar pelo **WhatsApp Web**, a mensagem dele também
     * vem como `web` e a MAISA não responde. É indistinguível de um envio da API, e nesse
     * empate preferimos o silêncio — errar para o outro lado é o loop.
     */
    if (d.key.fromMe) {
      if (!RESPONDER_A_SI_MESMO) return null;
      if (!APARELHOS.has(texto(d.source).toLowerCase())) return null;
    }

    const jid = texto(d.key.remoteJid);

    /* Grupo e status não são atendimento. A MAISA num grupo responderia a cada
     * mensagem de cada participante — e o dono descobre isso pelo grupo da família. */
    if (jid.endsWith("@g.us") || jid.includes("@broadcast") || jid.endsWith("@newsletter")) return null;

    /* ⚠️ O CASO `@lid`. Desde 2025 o WhatsApp entrega alguns contatos por um id opaco
     * (`69385314111689@lid`) em vez do telefone. Tratar esse id como número é o pior
     * resultado possível: entra no cadastro um "cliente" com telefone falso, e o
     * `sendText` de volta falha com `exists: false` — a MAISA processa a conversa
     * inteira, gasta token, e a resposta não chega em ninguém.
     * A Evolution manda o telefone verdadeiro à parte quando tem. Sem ele, desistimos:
     * um descarte com log é melhor que um cadastro envenenado. */
    let jidDoCliente = jid;
    if (jid.endsWith("@lid")) {
      const alternativo =
        texto(d.key.remoteJidAlt) || texto(d.key.senderPn) || texto(d.senderPn) || texto(d.key.participantPn);
      if (!alternativo) {
        console.warn(`[whatsapp/contexto] mensagem de ${jid} sem telefone (@lid) — não há como responder, descartada.`);
        return null;
      }
      jidDoCliente = alternativo;
    }

    const de = telefoneDoJid(jidDoCliente);
    if (!de) return null;

    const { texto: falado, midia } = conteudo(d.message);

    return {
      de,
      /* O `@lid` cru, quando foi assim que chegou: o histórico da conversa pode morar sob ele,
       * e é o histórico que diz se esta pessoa é nova. Ver `HistoricoDoCanal`. */
      jid: jid.endsWith("@lid") ? jid : undefined,
      /* `sender` é o JID de quem RECEBEU (a instância). A Evolution nem sempre manda, e
       * a documentação dela se contradiz — então ele é um bônus, não a base: quem
       * identifica o negócio aqui é `instancia`. Ver o cabeçalho deste arquivo. */
      para: telefoneDoJid(texto(corpo.sender)),
      instancia: texto(corpo.instance) || undefined,
      texto: falado,
      conversaId: texto(d.key.id) || undefined,
      midia,
    };
  }

  return null;
}
