/* ─────────────────────────────────────────────────────────────────────────────
 * RAIZ DE COMPOSIÇÃO — onde as portas encontram os adaptadores. ⚠️ SÓ SERVIDOR.
 *
 * É o único arquivo do repositório que conhece os dois lados ao mesmo tempo. O núcleo
 * nunca importa adaptador (seria a seta apontando para dentro do hexágono, e é
 * exatamente o que a arquitetura proíbe); os adaptadores não se conhecem entre si.
 * Eles se encontram aqui, uma vez, e o resto do app usa `app.*`.
 *
 * TROCAR UMA IMPLEMENTAÇÃO É MEXER SÓ NESTE ARQUIVO:
 *   • fixtures → Supabase ....... `negocio: repositorioSupabase`
 *   • Google → Outlook .......... `agenda: agendaOutlook`
 *   • Focus → outro emissor ..... `emissor: emissorX`
 *   • teste .................... monte um `app` com dublês; nada mais muda.
 *
 * ⚠️ Nunca importe este arquivo de um componente "use client": ele puxa o token da
 * Focus, o client secret do Google e a chave de cifra. Só `app/api/**` entra aqui.
 * (Quem quiser que isso vire erro de build em vez de convenção: `npm i server-only` e
 * um `import "server-only"` no topo. Hoje é convenção, e o `import { randomUUID } from
 * "crypto"` abaixo já quebraria qualquer tentativa de puxar isto para o navegador.)
 * ────────────────────────────────────────────────────────────────────────────── */

import { randomUUID } from "crypto";

import { criarAgendarAtendimento, criarAgendarRecorrente } from "@/nucleo/aplicacao/agendar-atendimento";
import {
  criarCancelarAtendimento, criarDesconectarAgenda, criarLerAgenda, criarListarConexoes,
} from "@/nucleo/aplicacao/agenda";
import { criarOferecerHorarios } from "@/nucleo/aplicacao/oferecer-horarios";
import {
  criarAjustarCliente,
  criarAjustarNegocio,
  criarAjustarProfissional,
  criarAjustarServico,
  criarCadastrarCliente,
  criarLerCadastro,
  criarRemoverServico,
} from "@/nucleo/aplicacao/cadastro";
import { criarLerAtivacao } from "@/nucleo/aplicacao/ativacao";
import { ativacaoSupabase } from "@/adaptadores/saida/supabase/ativacao";
import { assinaturasSupabase } from "@/adaptadores/saida/supabase/assinaturas";
import { assinaturasDemo, cobrancaDemo } from "@/adaptadores/saida/demo/assinaturas";
import { cobrancaStripe } from "@/adaptadores/saida/stripe/cobranca-stripe";
import { estaConfigurado as isStripeConfigured } from "@/adaptadores/saida/stripe/config";
import { cobrancaAbacatePay } from "@/adaptadores/saida/abacatepay/cobranca-abacatepay";
import {
  mundo as abacateMundo,
  estaConfigurado as isAbacateConfigured,
} from "@/adaptadores/saida/abacatepay/config";
import {
  criarAbrirCheckout,
  criarAbrirPortalDeCobranca,
  criarCancelarAssinatura,
  criarLerAssinatura,
  criarRegistrarAssinatura,
} from "@/nucleo/aplicacao/assinatura";
import { ativacaoDemo } from "@/adaptadores/saida/demo/ativacao";
import { criarProvisionarNegocio } from "@/nucleo/aplicacao/provisionar";
import { criarAjustarAssistente, criarLerAssistente } from "@/nucleo/aplicacao/assistente";
import { criarAjustarHorarios, criarLerHorarios } from "@/nucleo/aplicacao/horarios";
import { criarEnviarLembretes } from "@/nucleo/aplicacao/lembretes";
import {
  criarConectarCanal, criarDefinirDonoDoCanal, criarDesconectarCanal, criarLerCanal, criarRenovarCodigo,
} from "@/nucleo/aplicacao/canal";
import { criarAnotarFato, criarLembrarCliente } from "@/nucleo/aplicacao/memoria";
import {
  criarLerConversa, criarListarConversas, criarMudarPosseConversa, criarResponderConversa,
} from "@/nucleo/aplicacao/conversas";
import {
  criarCancelarNota, criarConsultarNota, criarEmitirNota, criarLerFaturamento,
} from "@/nucleo/aplicacao/notas";

import { agendaGoogle, conexoesGoogle } from "@/adaptadores/saida/google/agenda-google";
import { isGoogleConfigured } from "@/adaptadores/saida/google/config";
import { HOST_CANONICO, URL_CANONICA } from "@/config/endereco";
import { emissorFocus } from "@/adaptadores/saida/focus/emissor-focus";
import { repositorioDemo } from "@/adaptadores/saida/demo/repositorio";
import { repositorioSupabase } from "@/adaptadores/saida/supabase/repositorio";
import { provisionadorDemo } from "@/adaptadores/saida/demo/provisionador";
import { provisionadorSupabase } from "@/adaptadores/saida/supabase/provisionador";
import { assistenteDemo } from "@/adaptadores/saida/demo/assistente-repo";
import { horariosDemo } from "@/adaptadores/saida/demo/horarios-repo";
import { lembretesDemo } from "@/adaptadores/saida/demo/lembretes";
import { assistenteSupabase } from "@/adaptadores/saida/supabase/assistente";
import { horariosSupabase } from "@/adaptadores/saida/supabase/horarios";
import { faqsSupabase } from "@/adaptadores/saida/supabase/faqs";
import { faqsDemo } from "@/adaptadores/saida/demo/faqs";
import { embeddingDemo } from "@/adaptadores/saida/demo/embedding";
import { embeddingDePergunta, embeddingGemini } from "@/adaptadores/saida/gemini/embedding";
import { criarAjustarFaq, criarLerFaqs, criarRemoverFaq, criarResponderDuvida } from "@/nucleo/aplicacao/faqs";
import { lembretesSupabase } from "@/adaptadores/saida/supabase/lembretes";
import { canalSupabase } from "@/adaptadores/saida/supabase/canal";
import { canalDemoRepo, provisionamentoDemo } from "@/adaptadores/saida/demo/canal";
import { provisionamentoEvolution } from "@/adaptadores/saida/evolution/provisionamento-evolution";
import { SEGREDO as WHATSAPP_SEGREDO } from "@/adaptadores/entrada/whatsapp/contexto";
import { NaoConfigurado, PrecisaReconectar } from "@/nucleo/dominio/erros";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { registroSupabase } from "@/adaptadores/saida/supabase/atendimentos";
import { registroDemo } from "@/adaptadores/saida/demo/atendimentos";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { isAdminConfigured } from "@/adaptadores/saida/supabase/admin";
import { canalDemo, conversasDemo, historicoDemo, memoriaDemo } from "@/adaptadores/saida/demo/memoria";
import {
  conversasSupabase, historicoSupabase, memoriaSupabase,
} from "@/adaptadores/saida/supabase/memoria";
import { agendaDemo, conexoesDemo } from "@/adaptadores/saida/demo/agenda";
import { criarCanalEvolution } from "@/adaptadores/saida/evolution/canal-evolution";
import { criarContatosEvolution } from "@/adaptadores/saida/evolution/contatos-evolution";
import { contatosSupabase } from "@/adaptadores/saida/supabase/contatos";
import { contatosDemo, contatosDoCanalDemo, historicoDoCanalDemo } from "@/adaptadores/saida/demo/contatos";
import { criarHistoricoDoCanalEvolution } from "@/adaptadores/saida/evolution/historico-do-canal-evolution";
import { criarDetectarPedidoDeHorario } from "@/nucleo/aplicacao/intencao";
import {
  criarAvaliarAtendimento, criarDefinirModoDoNumero, criarImportarContatos,
  criarLerContatos, criarMarcarContato,
  criarMarcarContatos,
} from "@/nucleo/aplicacao/contatos";
import { isEvolutionConfigured } from "@/adaptadores/saida/evolution/config";
import { cadastroFocus } from "@/adaptadores/saida/focus/cadastro-focus";
import { fiscalSupabase } from "@/adaptadores/saida/supabase/fiscal";
import { cadastroDemo, fiscalDemo } from "@/adaptadores/saida/demo/fiscal";
import { notasSupabase } from "@/adaptadores/saida/supabase/notas";
import { notasDemo } from "@/adaptadores/saida/demo/notas";
import { recibosSupabase } from "@/adaptadores/saida/supabase/recibos";
import { recibosDemo } from "@/adaptadores/saida/demo/recibos";
import { livroDeRecibosSupabase } from "@/adaptadores/saida/supabase/livro-de-recibos";
import { livroDeRecibosDemo } from "@/adaptadores/saida/demo/livro-de-recibos";
import { guardaDeComprovanteSupabase } from "@/adaptadores/saida/supabase/guarda-de-comprovante";
import { guardaDeComprovanteDemo } from "@/adaptadores/saida/demo/guarda-de-comprovante";
import {
  criarEmitirRecibo, criarFecharReciboDoCallback,
} from "@/nucleo/aplicacao/recibo-unitario";
import { emissorReciboRebots } from "@/adaptadores/saida/rebots/emissor-recibo";
import { emissorReciboDemo } from "@/adaptadores/saida/demo/emissor-recibo";
import { isRebotsConfigured } from "@/adaptadores/saida/rebots/config";
import {
  criarDesligarReciboSaude, criarExcluirPagamentoAvulso, criarFecharLoteDeRecibos,
  criarGerarLoteDeRecibos, criarLancarPagamentoAvulso, criarLerRecibosPendentes,
} from "@/nucleo/aplicacao/recibos";
import {
  criarConsultarCnpj, criarEnviarCertificado, criarLerEstadoFiscal,
  criarLiberarProducaoFiscal, criarLigarNotaFiscal, criarLigarReciboSaude,
} from "@/nucleo/aplicacao/fiscal";

/* As implementações escolhidas HOJE. Uma linha por decisão. */

/**
 * A agenda. Google quando configurado; sem credencial, uma agenda em memória.
 *
 * O fallback não é comodidade — é o que faz o agente ser TESTÁVEL. Sem ele,
 * `oferecerHorarios` estoura num ambiente sem Google, a MAISA escala para humano em
 * toda tentativa de marcar, e o fluxo que mais precisa de iteração (marcar horário
 * conversando) é justamente o único que não roda. Ver `saida/demo/agenda.ts`.
 */
const agenda = isGoogleConfigured ? agendaGoogle : agendaDemo;
const conexoes = isGoogleConfigured ? conexoesGoogle : conexoesDemo;
const emissor = emissorFocus;
/**
 * ── FISCAL: AS DUAS PORTAS SEGUEM `isSupabaseConfigured`, E NÃO O TOKEN DA FOCUS ──
 *
 * `fiscalRepo` guarda a `config_fiscal` do inquilino; `cadastroEmissor` cria a empresa na
 * Focus e sobe o certificado dela.
 *
 * ★ ISTO MUDOU EM 21/08/2026, E O BUG ERA VISÍVEL NA TELA. Antes as duas seguiam o E das
 * duas credenciais (`isSupabaseConfigured && token da Focus`). Com o `FOCUS_NFE_TOKEN` vazio
 * — que é o estado de todo `npm run dev` hoje — `fiscalRepo` caía no demo, e a tela de
 * Faturamento mostrava **"BARBEARIA DEMONSTRAÇÃO MEI"** para um negócio real, com dados reais
 * de faturamento ao lado. Metade da tela verdadeira, metade inventada.
 *
 * O que estragou o arranjo antigo foi o terceiro caminho fiscal: o **recibo do Receita Saúde**
 * não usa a Focus para nada — nem token, nem certificado, nem empresa cadastrada. Com o E, o
 * CPF e a profissão de uma psicóloga real seriam gravados num objeto em memória que morre com
 * o processo, e lidos de volta como "BARBEARIA DEMONSTRAÇÃO MEI". A feature ficava
 * inalcançável exatamente na configuração em que ela é a única que funciona.
 *
 * ⚠️ O PERIGO QUE O E EVITAVA CONTINUA EVITADO, e é ele que explica a forma nova. O arranjo
 * ruim é **token da Focus sem banco**: `cadastroEmissor` cria empresa DE VERDADE, cobrada, e
 * `fiscalDemo` guarda o `empresaId` em memória, que morre no próximo deploy — CNPJ duplicado
 * na conta da Focus a cada reinício, e a Focus não deduplica por CNPJ. Como as duas agora
 * seguem `isSupabaseConfigured`, esse arranjo não existe: sem banco, as DUAS são demo.
 *
 * O caso "banco sem token" passa a ser honesto em vez de fingido: `cadastroFocus.faltando()`
 * devolve o que falta, `ligarNotaFiscal` recusa com essa frase, e a tela oferece só o caminho
 * do recibo — que é verdade, não degradação. Ver `soRecibo` em `LigarNotaFiscal`.
 */
const fiscalRepo = isSupabaseConfigured ? fiscalSupabase : fiscalDemo;
/* As notas emitidas seguem o mesmo critério — e desde 21/08/2026 isso deixou de ser uma
 * exceção comentada: a nota é gravada no NOSSO banco, e a claim que impede duplicação tem que
 * valer mesmo quando a emissão sai `simulado`. */
const notasRepo = isSupabaseConfigured ? notasSupabase : notasDemo;
/* O lote do Receita Saúde. Repositório próprio e não método de `notasRepo`: o documento é
 * outro, a unidade é a sessão (não o cliente) e quem emite é a profissional, no e-CAC. */
const recibosRepo = isSupabaseConfigured ? recibosSupabase : recibosDemo;

/* O livro-razão da emissão unitária, a guarda do PDF e o canal. */
const livroRecibos = isSupabaseConfigured ? livroDeRecibosSupabase : livroDeRecibosDemo;
const guardaComprovante = isSupabaseConfigured
  ? guardaDeComprovanteSupabase
  : guardaDeComprovanteDemo;

/**
 * Por onde o recibo unitário sai.
 *
 * ⚠️ A ESCOLHA É POR CREDENCIAL, e a queda é o demo — que se apresenta como canal `automacao`.
 * Sem `REBOTS_MASTER_KEY` no ambiente, a emissão roda no `/laboratorio` sem falar com ninguém;
 * com a chave, sai pela Rebots de verdade.
 *
 * ⚠️ E O `REBOTS_PRODUCAO` CONTINUA SENDO O QUE DECIDE SE VALE. Estar configurado não é estar
 * emitindo: sem aquela variável, toda emissão sai com `test: true`. São dois interruptores de
 * propósito — ver `rebotsAvisos()`.
 *
 * ⚠️ NÃO EXISTE CASCATA AQUI, e a ausência é a decisão. Cair de um canal para outro é o que
 * emite o mesmo recibo duas vezes, e a única transição segura para isso é `recusado` — ver
 * `podeTentarOutroCanal`. Enquanto houver um canal só, não há de onde cair.
 */
const emissorRecibo = isRebotsConfigured ? emissorReciboRebots : emissorReciboDemo;
/* Sem banco, demo — junto com `fiscalRepo`, e é o par que impede empresa de verdade com
 * `empresaId` em memória. Com banco e sem token, o `cadastroFocus` fica: é ele que sabe
 * DIZER o que falta, e é essa frase que faz a tela recusar o caminho do CNPJ em vez de
 * simular um cadastro que ninguém fez. */
const cadastroEmissor = isSupabaseConfigured ? cadastroFocus : cadastroDemo;
/**
 * O cadastro: quem atende, o que se vende, quem é cliente.
 *
 * Supabase quando configurado; sem chave, os fixtures em memória. Era esta a linha que a
 * dívida do repositório apontava ("é a peça que falta trocar para o app ser
 * multi-inquilino de verdade"), e é literalmente uma linha — que era a aposta da porta.
 *
 * O fallback NÃO é comodidade, pela mesma razão da agenda logo acima: sem ele, um ambiente
 * sem banco não desenha nem a primeira tela (sem profissional não há coluna na grade, sem
 * serviço não há duração) e o fluxo de afinar a MAISA por `curl` — o único que não precisa
 * de banco nem de número contratado — deixa de existir.
 *
 * ⚠️ A diferença entre os dois modos deixou de ser invisível: com Supabase, `tenantId` é o
 * uuid de `negocios` e os ids de profissional/serviço/cliente são uuid; com fixture, são
 * `"pr1"`, `"sv1"`, `"cl1"`. Nada no núcleo se importa — mas um dado copiado de um modo
 * para o outro não casa.
 */
/* ─────────────────────────── A COBRANÇA ───────────────────────────
 *
 * ⚠️ AS DUAS METADES TROCAM POR INTERRUPTORES DIFERENTES, e isso é decisão, não
 * descuido de simetria:
 *
 *   · o REPOSITÓRIO segue o Supabase — ler "qual o meu plano" é a tela de faturamento
 *     abrindo, e ela abre todo dia mesmo sem provedor de pagamento nenhum configurado;
 *   · a COBRANÇA segue a Stripe — só quem clica em "assinar" precisa dela.
 *
 * Amarrar os dois no mesmo `if` faria o ambiente sem `STRIPE_SECRET_KEY` (todo `npm run
 * dev` de quem não pegou o segredo ainda) ler plano de fixture enquanto o banco real
 * está ali do lado, com a assinatura de verdade dentro.
 */
const assinaturas = isSupabaseConfigured ? assinaturasSupabase : assinaturasDemo;

/* ── ★ QUAL GATEWAY COBRA, E POR QUE A ABACATEPAY GANHA DA STRIPE QUANDO AS DUAS ESTÃO
 *      CONFIGURADAS (21/09/2026) ──
 *
 * Não é preferência de fornecedor. É que a Stripe **não faz Pix recorrente em conta
 * brasileira** — medido e escrito em `saida/stripe/LEIA-ME.md`: assinatura em conta BR é
 * cartão ou boleto. Num produto de R$ 127/mês isso custa duas vezes:
 *
 *   · na TAXA — cartão é percentual, Pix é centavos;
 *   · na CONVERSÃO — Pix é como o país paga, e quem não oferece perde a venda antes.
 *
 * Então a ordem é: AbacatePay quando há chave dela, Stripe quando só há a da Stripe,
 * demo quando não há nenhuma. A Stripe NÃO sai do código de propósito — ela é o caminho
 * de cartão internacional e a saída de emergência se a AbacatePay recusar a conta. Trocar
 * de volta é apagar `ABACATEPAY_API_KEY` do ambiente, sem deploy.
 *
 * ⚠️ AS DUAS AO MESMO TEMPO NÃO É SUPORTADO, e a coluna `assinaturas.provedor` é o que
 * conta a história: cada inquilino tem UM provedor, gravado no primeiro checkout. Quem
 * assinou pela Stripe continua sendo cobrado por ela (a assinatura vive lá), e o webhook
 * dela continua no ar por isso — é o motivo de `/api/stripe/webhook` não ter sido
 * apagado. O que muda é para onde vão os checkouts NOVOS.
 */
const cobranca = isAbacateConfigured
  ? cobrancaAbacatePay
  : isStripeConfigured
    ? cobrancaStripe
    : cobrancaDemo;

/** Vai para a coluna `assinaturas.provedor` no primeiro checkout de cada inquilino. */
const provedorDeCobranca = isAbacateConfigured ? "abacatepay" as const : "stripe" as const;

/* ⚠️ AVISO NO BOOT, E ELE EXISTE POR CAUSA DE UM MODO DE FALHA SILENCIOSO REAL: a
 * AbacatePay usa o MESMO endpoint para teste e produção, e quem separa é o prefixo da
 * chave. Uma chave de teste em produção responde 200, desenha um QR Code de Pix bonito e
 * **não cobra ninguém**. O produto parece vendido e não entrou dinheiro. Sem esta linha, a
 * descoberta acontece no fechamento do mês.
 *
 * O terceiro caso grita mais alto que o segundo de propósito: prefixo que não casa com
 * nada significa que ou a chave está torta, ou eles mudaram o formato — e nos dois casos
 * NÃO SABEMOS se o que está no ar cobra de verdade. Silêncio ali seria a pior resposta. */
if (isAbacateConfigured && abacateMundo === "teste") {
  console.warn(
    "[composicao] ⚠️ AbacatePay em DEV MODE: os pagamentos são SIMULADOS. "
      + "Nada é cobrado de verdade.",
  );
}
if (isAbacateConfigured && abacateMundo === "desconhecido") {
  console.warn(
    "[composicao] ⚠️ AbacatePay: NÃO SEI se esta chave cobra de verdade — o prefixo não é "
      + "nem de teste nem de produção. Confira ABACATEPAY_API_KEY antes de vender.",
  );
}

const negocio = isSupabaseConfigured ? repositorioSupabase : repositorioDemo;
const provisionador = isSupabaseConfigured ? provisionadorSupabase : provisionadorDemo;

/**
 * Os ajustes da MAISA. Segue o cadastro pela mesma razão que `registro` e `memoria`: as
 * duas leituras acontecem no mesmo turno de conversa, e um par banco/fixture misturado
 * daria um agente que sabe o catálogo real do inquilino e responde com o tom de outro.
 */
const assistente = isSupabaseConfigured ? assistenteSupabase : assistenteDemo;
const horarios = isSupabaseConfigured ? horariosSupabase : horariosDemo;
const faqs = isSupabaseConfigured ? faqsSupabase : faqsDemo;

/* ⚠️ DOIS geradores de embedding, e o par NÃO é redundância de fiação.
 *
 * O `gemini-embedding-001` produz vetores diferentes conforme o `taskType`: um texto
 * marcado como DOCUMENTO (o que se indexa) e o mesmo texto marcado como CONSULTA (o que se
 * pergunta) caem em pontos distintos, e casar os dois tipos certos melhora o resultado da
 * busca. Por isso `embeddingGemini` alimenta o `AjustarFaq` e `embeddingDePergunta`
 * alimenta o `ResponderDuvida`.
 *
 * Trocá-los de lugar não quebra nada visivelmente — só piora o casamento. É o tipo de erro
 * que só aparece como "a MAISA não acha a FAQ que existe", e por isso está escrito aqui.
 *
 * Sem `GEMINI_API_KEY`, os dois caem no `embeddingDemo`, que é saco de palavras e não
 * semântica: no demo "que horas vocês abrem" NÃO encontra "horários de atendimento". */
const embeddingParaIndexar = isGeminiConfigured ? embeddingGemini : embeddingDemo;
const embeddingParaBuscar = isGeminiConfigured ? embeddingDePergunta : embeddingDemo;
/* A fila de lembretes segue `isAdminConfigured`, e NÃO `isSupabaseConfigured` como as
 * irmãs. É a única porta cuja service role é requisito duro: a rotina não tem sessão para
 * cair, então um Supabase configurado sem service role a deixaria estourando a cada
 * tique. Sem ela, a rotina roda em demonstração e devolve zero envios. */
const filaLembretes = isAdminConfigured ? lembretesSupabase : lembretesDemo;

/**
 * O CANAL DE WHATSAPP, por inquilino.
 *
 * Duas portas, dois critérios diferentes — e essa diferença é a decisão:
 *   • o REPOSITÓRIO segue o Supabase, como todo o resto do cadastro;
 *   • o PROVISIONAMENTO segue a Evolution, porque é ela que cria a instância.
 *
 * Separados porque as duas metades falham por motivos independentes. Um ambiente com
 * banco e sem Evolution (o do desenvolvimento) precisa conseguir desenhar a tela de
 * conectar com um QR de mentira; um com Evolution e sem banco não precisa existir.
 */
const canalRepo = isSupabaseConfigured ? canalSupabase : canalDemoRepo;
const provisionamento = isEvolutionConfigured ? provisionamentoEvolution : provisionamentoDemo;

/**
 * Para onde a Evolution deve entregar as mensagens deste deploy.
 *
 * ⚠️ TEM QUE SER ALCANÇÁVEL PELA INTERNET. A Evolution roda em outro servidor: apontar
 * para `localhost` faz ela aceitar a configuração, tentar entregar, falhar do lado dela —
 * e daqui parece ter dado certo. É a falha mais cara de diagnosticar do produto, então
 * falha ALTO aqui, antes de criar a instância, em vez de silenciosamente depois.
 *
 * A URL vem de env própria e não do `origin` do request (que é como
 * `/api/whatsapp/conexao` faz) porque este caminho é chamado por um botão do painel: o
 * `origin` seria o domínio que o USUÁRIO está usando, e um cliente que abrisse o painel
 * por um domínio alternativo apontaria o webhook do canal dele para lá.
 */
function webhookDoAgente(): { url: string; segredo: string } {
  /* A escolha da base (env própria primeiro, domínio de produção do projeto como
   * fallback, e por que NUNCA `VERCEL_URL`) mora em `config/endereco.ts` desde 18/08/2026.
   * Saiu daqui porque o middleware precisa da mesma decisão para o 301 de domínio, e
   * `composicao.ts` não pode ser importado do Edge — ele instancia o app inteiro. */
  const base = URL_CANONICA;
  const faltando: string[] = [];
  if (!base) faltando.push("MAISA_PUBLIC_URL (a URL pública deste deploy, ex: https://app.maisa.com.br)");
  if (!WHATSAPP_SEGREDO) faltando.push("WHATSAPP_WEBHOOK_SECRET");
  /* ⚠️ ENV TORTA FALHA AQUI, não lá na Evolution. `HOST_CANONICO` é `""` quando o valor
   * não é uma URL analisável — colar `app.maisa.com.br` sem o `https://` é o erro de
   * painel mais fácil de cometer. Sem esta linha, o webhook seria montado com a string
   * torta, a Evolution aceitaria a configuração, tentaria entregar e falharia do lado
   * dela; daqui pareceria ter dado certo. É a falha que o cabeçalho desta função chama de
   * "a mais cara de diagnosticar do produto". */
  if (base && !HOST_CANONICO) {
    faltando.push(`MAISA_PUBLIC_URL (valor não é uma URL: ${base} — falta o https:// ?)`);
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base)) {
    faltando.push("MAISA_PUBLIC_URL (a Evolution não alcança localhost — use um túnel ou o domínio do deploy)");
  }
  if (faltando.length) throw new NaoConfigurado(faltando);

  return { url: `${base}/api/whatsapp`, segredo: WHATSAPP_SEGREDO };
}
/**
 * A AGENDA DO PRODUTO — a tabela `atendimentos`.
 *
 * ⚠️ ISTO AQUI DIZIA "o espelho… não é a agenda… não desenhe tela de agenda a partir
 * daqui". Inverteu no ADR-0009, e agora é o contrário: esta é a fonte da verdade dos
 * horários, e o provedor conectado (`agenda`, acima) é a camada ADITIVA em cima dela —
 * acrescenta o que nasceu fora e, quando não existe, acrescenta zero.
 *
 * O motivo foi medido: com o Google como fonte única, nenhuma linha entrava em
 * `atendimentos` sem Google conectado, e junto caíam faturamento, nota, lembretes e a
 * tela de Agenda inteira. Para o ICP que decidiu não conectar calendário, o produto não
 * existia.
 *
 * Segue `isSupabaseConfigured` junto com o cadastro, e não uma env própria, porque as duas
 * metades precisam concordar: `atendimentos.cliente_id` é FK para `clientes`, então gravar
 * o espelho num banco onde o cadastro não mora deixaria toda linha com cliente nulo.
 */
const registro = isSupabaseConfigured ? registroSupabase : registroDemo;
/**
 * MEMÓRIA, THREAD E POSSE das conversas.
 *
 * Estas três linhas eram `memoriaDemo` e `historicoDemo` fixos, com um aviso em cima: "memória
 * de PROCESSO: morre no redeploy e não é compartilhada entre instâncias. A tabela existe em
 * `supabase/007_memoria_agente.sql`; falta o adaptador". O adaptador existe
 * (`saida/supabase/memoria.ts`), e a dívida fechou do jeito que a porta prometia — aqui.
 *
 * O que a troca destrava, além do óbvio: **o painel passa a ver a conversa.** A tela roda em
 * outro processo que o webhook, então um `Map` de módulo era invisível para ela por
 * construção. Era a razão de fundo de a tela de Conversas ter vivido de fixture.
 *
 * Seguem `isSupabaseConfigured` junto com o cadastro, e não uma env própria, porque as três
 * casam com `clientes` pelo telefone: memória num banco onde o cadastro não mora daria
 * conversa sem nome e cliente sem histórico. O fallback em memória continua existindo pelo
 * mesmo motivo dos outros — é o que faz o `/laboratorio` rodar sem banco, e agente que só
 * roda com a infra de pé é agente que ninguém afina antes de pagar.
 */
const memoria = isSupabaseConfigured ? memoriaSupabase : memoriaDemo;
const historico = isSupabaseConfigured ? historicoSupabase : historicoDemo;
const conversas = isSupabaseConfigured ? conversasSupabase : conversasDemo;
/**
 * Por onde a MAISA FALA. A escolha é automática, e é a única do arquivo que não é uma
 * decisão de deploy: com Evolution configurada, manda WhatsApp de verdade; sem, escreve
 * no log e a rota devolve as bolhas no corpo da resposta.
 *
 * O fallback existe para uma coisa específica: afinar o tom da MAISA por `curl`, sem
 * número contratado. Um agente que só roda com a integração de pé é um agente que
 * ninguém testa antes de pagar — e o tom é justamente o que precisa de mais iteração.
 */
/**
 * QUAL INSTÂNCIA ATENDE ESTE INQUILINO.
 *
 * ⚠️ FALHA FECHADA, e é a decisão mais importante deste arquivo. Inquilino sem canal
 * próprio NÃO cai na `EVOLUTION_INSTANCIA` do ambiente. Cair seria o pior defeito
 * possível do produto: a resposta ao cliente de um negócio sairia pelo WhatsApp de
 * outro — número errado, nome errado, e uma conversa privada aterrissando num terceiro.
 *
 * `PrecisaReconectar` e não `NaoConfigurado` porque existe uma AÇÃO que resolve, e a UI
 * já sabe oferecer botão para esse status (é o mesmo que a agenda do Google usa): abrir
 * a tela e conectar o WhatsApp. "Não configurado" mandaria procurar variável de ambiente.
 */
const instanciaDoInquilino = async (t: ContextoTenant): Promise<string> => {
  const c = await canalRepo.ler(t);
  if (!c?.instancia) {
    throw new PrecisaReconectar(
      "Este negócio ainda não tem um WhatsApp conectado. Conecte na tela do canal para a MAISA poder responder.",
    );
  }
  return c.instancia;
};

/**
 * PARA QUEM ESCALAR NESTE INQUILINO.
 *
 * Irmã de `instanciaDoInquilino`, e com a decisão oposta na falha: aqui devolve `null` em
 * vez de lançar. Escalar acontece justamente quando o agente já falhou — transformar
 * "ninguém preencheu o telefone do dono" numa exceção substituiria o problema original por
 * um erro de notificação, e o cliente do outro lado continuaria sem ninguém. O adaptador
 * registra no log e segue.
 */
const donoDoInquilino = async (t: ContextoTenant): Promise<string | null> => {
  const c = await canalRepo.ler(t);
  return c?.telefoneDono ?? null;
};

const canal = isEvolutionConfigured
  ? criarCanalEvolution({ instanciaDe: instanciaDoInquilino, donoDe: donoDoInquilino })
  : canalDemo;

/**
 * O CADERNO DE NOMES, e de quem é o número pareado.
 *
 * Duas linhas com critérios diferentes, pela mesma razão do canal logo acima: o repositório
 * segue o Supabase (é cadastro), a leitura da agenda segue a Evolution (é o provedor que
 * conhece os contatos). Um ambiente com banco e sem Evolution — o do desenvolvimento —
 * precisa conseguir exercitar a decisão de quem a MAISA atende com um caderno de mentira.
 *
 * ⚠️ `instanciaDe` é a MESMA função que o canal recebe. Duas resoluções de "qual instância é
 * deste inquilino" seriam a agenda de um negócio lida do WhatsApp de outro.
 */
const contatosRepo = isSupabaseConfigured ? contatosSupabase : contatosDemo;
const contatosProvedor = isEvolutionConfigured
  ? criarContatosEvolution({ instanciaDe: instanciaDoInquilino })
  : contatosDoCanalDemo;
/* O rastro da conversa no WhatsApp: o dado que faltou em 24/09/2026. Mesma instância, mesma
 * regra do `contatosProvedor` acima. */
const historicoDoCanal = isEvolutionConfigured
  ? criarHistoricoDoCanalEvolution({ instanciaDe: instanciaDoInquilino })
  : historicoDoCanalDemo;

const agendarAtendimento = criarAgendarAtendimento({ agenda, negocio, registro });

/** Tudo que o app sabe fazer, já montado. */
export const app = {
  agendarAtendimento,
  /** A série ("toda semana") é o mesmo `agendarAtendimento`, uma vez por data. */
  agendarRecorrente: criarAgendarRecorrente({ agendar: agendarAtendimento }),
  cancelarAtendimento: criarCancelarAtendimento({ agenda, negocio, registro }),
  /* `registro` entrou nos quatro (ADR-0009): a agenda do produto é a fonte, `agenda` é
   * a camada aditiva por cima dela. Antes só os dois primeiros o recebiam, e era por isso
   * que ler a grade e oferecer horário não funcionavam sem Google. */
  lerAgenda: criarLerAgenda({ agenda, negocio, registro }),
  /** Nasceu para o agente: a tela calculava o vago desenhando a grade. */
  oferecerHorarios: criarOferecerHorarios({ agenda, negocio, registro }),

  /** Nasceu para a TELA: é por aqui que o painel para de importar fixture. */
  lerCadastro: criarLerCadastro({ negocio }),

  /**
   * RENOMEAR O NEGÓCIO — o par de escrita do `lerCadastro`.
   *
   * Mesma dependência, mesma linha do arquivo, porque é o mesmo agregado. Não segue
   * `isSupabaseConfigured` por conta própria: `negocio` já é o repositório demo ou o do
   * Supabase conforme a configuração, e essa decisão foi tomada uma vez lá em cima.
   */
  ajustarNegocio: criarAjustarNegocio({ negocio }),

  /**
   * ESCREVER O CATÁLOGO — os outros dois pares de escrita do `lerCadastro`.
   *
   * Até 15/08/2026 o catálogo era só leitura NO SERVIDOR: a tela de Serviços tinha
   * "adicionar" e "editar", e os dois mexiam em `svcNovos`/`svcEdit` no `store.tsx` —
   * estado do navegador. F5 apagava. Estes dois casos de uso são o caminho que faltava.
   */
  ajustarServico: criarAjustarServico({ negocio }),
  removerServico: criarRemoverServico({ negocio }),
  ajustarProfissional: criarAjustarProfissional({ negocio }),

  /**
   * EDITAR CLIENTE — o par de escrita que faltou nove dias depois dos outros dois.
   *
   * Mesma dependência e mesma linha do arquivo porque é o mesmo agregado. Só EDITA: quem
   * cria cliente é `garantirCliente`, dentro do repositório, chamado pelo agente quando
   * alguém novo marca pelo WhatsApp — e é ele que deduplica por telefone.
   */
  ajustarCliente: criarAjustarCliente({ negocio }),
  /** CRIAR CLIENTE pela tela — por baixo, o mesmo `garantirCliente` do agente. */
  cadastrarCliente: criarCadastrarCliente({ negocio }),

  /**
   * QUANTO JÁ ESTÁ DE PÉ — derivado do banco a cada leitura, nunca de uma flag.
   *
   * Segue `isSupabaseConfigured` como todo o resto: sem banco, o adaptador demo responde
   * a partir dos mesmos fixtures que as telas leem, e é assim que o wizard é afinado
   * antes de existir inquilino de verdade.
   */
  lerAtivacao: criarLerAtivacao({ ativacao: isSupabaseConfigured ? ativacaoSupabase : ativacaoDemo }),

  /* ── as respostas prontas ──
   * `lerFaqs`/`ajustarFaq`/`removerFaq` são a tela de gestão; `responderDuvida` é o que o
   * AGENTE chama no meio da conversa, e é ele que fecha a família "configura e ignora". */
  lerFaqs: criarLerFaqs({ faqs }),
  ajustarFaq: criarAjustarFaq({ faqs, embedding: embeddingParaIndexar }),
  removerFaq: criarRemoverFaq({ faqs }),
  responderDuvida: criarResponderDuvida({ faqs, embeddingDePergunta: embeddingParaBuscar }),

  /**
   * CRIAR O NEGÓCIO — o único caso de uso que não recebe inquilino, porque o produz.
   *
   * Segue `isSupabaseConfigured` como o resto, mas por uma razão diferente das outras
   * linhas deste arquivo: as outras escolhem ONDE ler; esta escolhe se o cadastro é real
   * ou encenado. Sem banco, `provisionadorDemo` devolve um uuid de mentira para que o
   * fluxo inteiro seja percorrível por `curl` antes de existir tela.
   */
  provisionarNegocio: criarProvisionarNegocio({ provisionador, assistente }),

  /**
   * OS AJUSTES DA MAISA — a mesma linha que o agente lê para montar o prompt.
   *
   * `assistente` aqui e `assistente.ler(t)` no `configuracaoDoAgente` abaixo são a MESMA
   * porta, de propósito: é isso que garante que salvar na tela muda o que o cliente
   * recebe no WhatsApp na mensagem seguinte. Duas fontes aqui seriam uma tela que salva
   * e um agente que não lê — que é exatamente o estado de que este passo saiu.
   */
  /**
   * O CANAL — conectar o WhatsApp do cliente sem ninguém criar instância na mão.
   *
   * As três recebem o mesmo trio de dependências porque são a mesma conversa com o
   * provedor vista de três ângulos, e porque `conectar` precisa saber o que `ler` sabe
   * (qual instância já é deste inquilino) para não gerar um nome novo a cada clique.
   */
  lerCanal: criarLerCanal({ provisionamento, canal: canalRepo, webhook: webhookDoAgente }),
  conectarCanal: criarConectarCanal({ provisionamento, canal: canalRepo, webhook: webhookDoAgente }),
  desconectarCanal: criarDesconectarCanal({ provisionamento, canal: canalRepo, webhook: webhookDoAgente }),
  renovarCodigo: criarRenovarCodigo({ provisionamento, canal: canalRepo, webhook: webhookDoAgente }),
  definirDonoDoCanal: criarDefinirDonoDoCanal({ provisionamento, canal: canalRepo, webhook: webhookDoAgente }),

  /**
   * O QUE FALTA PARA CONECTAR — perguntado ANTES de oferecer o botão.
   *
   * Existe por causa de um incidente real (13/08/2026): `MAISA_PUBLIC_URL` não estava na
   * Vercel, "trocar número" apagou a instância do cliente e o `conectar` seguinte morreu
   * em `webhookDoAgente()`. O canal ficou fora do ar por uma variável de ambiente, e a
   * tela só disse "falta configuração no servidor" — sem dizer QUAL.
   *
   * A lição não é "tratar melhor o erro": é que uma tela que oferece um botão destrutivo
   * tem que saber, antes do clique, se consegue reconstruir o que vai derrubar. Por isso
   * isto é uma pergunta de LEITURA (`GET`), e não um `catch` do `POST`.
   *
   * Devolve lista vazia quando dá para conectar. Nunca lança: é diagnóstico, e um
   * diagnóstico que derruba a tela que ele deveria explicar não serve para nada.
   */
  canalFaltando(): string[] {
    const faltam = [...provisionamento.faltando()];
    try {
      webhookDoAgente();
    } catch (e) {
      if (e instanceof NaoConfigurado) faltam.push(...e.faltando);
      else faltam.push("webhook do agente (erro inesperado ao montar a URL)");
    }
    return faltam;
  },

  /**
   * QUEM A MAISA ATENDE — o guardrail que impede ela de falar com o pai do dono.
   *
   * `avaliarAtendimento` é o único deste grupo que roda no caminho quente: uma pergunta por
   * mensagem recebida, antes do primeiro token. Ele vai para o agente logo abaixo, junto com
   * `lembrarCliente` — as duas respondem "quem está falando", de ângulos diferentes.
   *
   * O `importarContatos` recebe as DUAS portas porque a operação atravessa as duas: lê do
   * provedor, grava no nosso. Separadas porque falham por motivos independentes — a Evolution
   * pode cair com o banco de pé, e é justamente aí que a MAISA precisa continuar decidindo
   * quem atender com o caderno que já tem.
   */
  avaliarAtendimento: criarAvaliarAtendimento({
    contatos: contatosRepo,
    canal: historicoDoCanal,
    /* O MESMO modelo do agente, resolvido na hora: os imports dele vêm mais abaixo neste
     * arquivo, e o Anthropic só se monta quando o Gemini não está configurado. */
    pedeHorario: criarDetectarPedidoDeHorario({
      modelo: () => (isGeminiConfigured ? modeloGemini : criarModeloAnthropic()),
    }),
  }),
  lerContatos: criarLerContatos({ contatos: contatosRepo }),
  importarContatos: criarImportarContatos({ contatos: contatosRepo, provedor: contatosProvedor }),
  marcarContato: criarMarcarContato({ contatos: contatosRepo }),
  marcarContatos: criarMarcarContatos({ contatos: contatosRepo }),
  definirModoDoNumero: criarDefinirModoDoNumero({ contatos: contatosRepo }),

  lerAssistente: criarLerAssistente({ assistente }),
  ajustarAssistente: criarAjustarAssistente({ assistente }),

  lerHorarios: criarLerHorarios({ horarios }),
  ajustarHorarios: criarAjustarHorarios({ horarios }),

  /**
   * A ROTINA. É a única linha deste arquivo que monta um caso de uso sem inquilino.
   *
   * Recebe o MESMO `canal` que o agente usa — o que já resolve a instância de WhatsApp
   * por inquilino (`instanciaDoInquilino`, acima). É o que garante que o lembrete sai
   * pelo número do próprio negócio, e não por uma env global: um lembrete saindo do
   * WhatsApp de outro cliente seria o pior vazamento visível do produto.
   */
  enviarLembretes: criarEnviarLembretes({ fila: filaLembretes, canal, negocio, assistente }),

  lembrarCliente: criarLembrarCliente({ negocio, memoria }),
  anotarFato: criarAnotarFato({ negocio, memoria }),

  /**
   * AS CONVERSAS DO PAINEL — a mesma thread que o agente escreve, lida do outro lado.
   *
   * Os quatro recebem as MESMAS portas que o agente de WhatsApp recebe logo abaixo
   * (`historico`, `conversas`, `canal`). Não é economia de digitação: é o que garante que
   * responder pelo painel e responder pela MAISA caem na mesma thread, no mesmo número, com o
   * mesmo canal. Duas fontes aqui seriam duas conversas para o cliente e uma só para ele.
   */
  listarConversas: criarListarConversas({ historico, conversas, canal }),
  lerConversa: criarLerConversa({ historico, conversas, canal }),
  responderConversa: criarResponderConversa({ historico, conversas, canal }),
  mudarPosseConversa: criarMudarPosseConversa({ historico, conversas, canal }),

  listarConexoes: criarListarConexoes({ conexoes }),
  desconectarAgenda: criarDesconectarAgenda({ conexoes }),

  /* Os três recebem `fiscal` porque o prestador vem do BANCO, por inquilino — antes vinha
   * de variável de ambiente, e uma resposta global num produto multi-inquilino é a nota de
   * um cliente saindo no CNPJ do outro. */
  emitirNota: criarEmitirNota({ emissor, fiscal: fiscalRepo, notas: notasRepo, novoId: randomUUID }),
  consultarNota: criarConsultarNota({ emissor, fiscal: fiscalRepo, notas: notasRepo }),
  cancelarNota: criarCancelarNota({ emissor, fiscal: fiscalRepo, notas: notasRepo }),
  lerFaturamento: criarLerFaturamento({ notas: notasRepo, fiscal: fiscalRepo }),

  /* ── ligar a nota fiscal: UMA pergunta, o CNPJ ── */
  lerEstadoFiscal: criarLerEstadoFiscal({ fiscal: fiscalRepo, cadastro: cadastroEmissor }),
  consultarCnpj: criarConsultarCnpj({ cadastro: cadastroEmissor }),
  ligarNotaFiscal: criarLigarNotaFiscal({ fiscal: fiscalRepo, cadastro: cadastroEmissor }),
  enviarCertificado: criarEnviarCertificado({ fiscal: fiscalRepo, cadastro: cadastroEmissor }),
  liberarProducaoFiscal: criarLiberarProducaoFiscal({ fiscal: fiscalRepo, cadastro: cadastroEmissor }),

  /* ── o lote do Receita Saúde: quem atende como PESSOA FÍSICA ──
   *
   * Sem `emissor` na lista de dependências, e é o ponto: não há provedor, não há certificado
   * e não há custo por linha. O caso de uso monta um CSV e prende as sessões; quem emite é
   * ela, importando no e-CAC. Ver `dominio/recibo-saude.ts`. */
  /* Sem `cadastro` fazendo chamada nenhuma: três campos e grava. O `cadastroEmissor` entra
   * só porque `estado()` reporta `provedorFaltando` — que neste caminho é sempre irrelevante,
   * e é justamente o que a tela precisa saber para não esconder o formulário. */
  ligarReciboSaude: criarLigarReciboSaude({ fiscal: fiscalRepo, cadastro: cadastroEmissor }),
  gerarLoteDeRecibos: criarGerarLoteDeRecibos({ recibos: recibosRepo, fiscal: fiscalRepo }),
  /* Canal, negócio e assistente porque fechar o lote pode AVISAR os pacientes no WhatsApp —
   * mesmas dependências do lembrete de 3h antes, e é o mesmo canal falando. */
  /* `canalRepo` só para achar o `telefoneDono`: é para lá que vai a confirmação de
   * fechamento do mês. Nunca para `MAISA_WHATSAPP_DONO` — ver `Canal.telefoneDono`. */
  fecharLoteDeRecibos: criarFecharLoteDeRecibos({
    recibos: recibosRepo, canal, negocio, assistente, canalRepo,
  }),
  desligarReciboSaude: criarDesligarReciboSaude({ recibos: recibosRepo, fiscal: fiscalRepo }),

  /* O que vai no próximo arquivo, e o lançamento do que a agenda não pegou. A MAISA cobre a
   * maioria dos pagamentos, não todos — e o recibo é obrigatório igual. */
  lerRecibosPendentes: criarLerRecibosPendentes({ recibos: recibosRepo, livro: livroRecibos }),
  lancarPagamentoAvulso: criarLancarPagamentoAvulso({ recibos: recibosRepo, fiscal: fiscalRepo }),
  excluirPagamentoAvulso: criarExcluirPagamentoAvulso({ recibos: recibosRepo }),

  /* ★ A EMISSÃO UNITÁRIA, finalmente ligada. Ela existia com teste e sem rota desde 24/08/2026 —
   * e foi justamente por não ser exercitada de ponta a ponta que cinco defeitos do adaptador da
   * Rebots sobreviveram até o sandbox responder. Porta sem fio ligado não é porta testada. */
  emitirRecibo: criarEmitirRecibo({
    livro: livroRecibos,
    emissor: emissorRecibo,
    recibos: recibosRepo,
    fiscal: fiscalRepo,
    guarda: guardaComprovante,
  }),

  /* O callback do canal de emissão. ⚠️ Ele grava a única cópia do desfecho que existe no mundo:
   * a API da Rebots não tem consulta, então um callback perdido só se resolve olhando o e-CAC.
   * Ver `criarFecharReciboDoCallback` e a rota `/api/recibos/callback`. */
  fecharReciboDoCallback: criarFecharReciboDoCallback({
    livro: livroRecibos,
    guarda: guardaComprovante,
    /* ⚠️ AS TRÊS PORTAS DO AVISO AO PACIENTE, e elas são as MESMAS do caminho do lote (linha 602):
     * uma notícia, uma voz. O que muda é o gatilho — lá é um clique com alguém olhando, aqui é o
     * callback de um servidor. Por isso lá o opt-in é por envio e aqui é um interruptor do
     * inquilino (`avisarRecibo`, migração 024, padrão `false`). */
    aviso: { canal, negocio, assistente },
  }),

  /* ── A COBRANÇA ──
   * `abrirCheckout` lê a assinatura ANTES de chamar o provedor: é dali que sai o
   * `clienteId` que impede o segundo clique de criar uma segunda ficha lá dentro.
   * Ver o ⚠️ de `PedidoDeCheckout.clienteId`. */
  lerAssinatura: criarLerAssinatura({ assinaturas }),
  abrirCheckout: criarAbrirCheckout({ cobranca, assinaturas, provedor: provedorDeCobranca }),
  abrirPortalDeCobranca: criarAbrirPortalDeCobranca({ cobranca, assinaturas }),
  /* Existe para o provedor SEM portal (AbacatePay). Na Stripe lança `NaoSuportado` e a
   * tela mostra o botão do portal — ver `capacidades()` nos dois adaptadores. */
  cancelarAssinatura: criarCancelarAssinatura({ cobranca, assinaturas }),
  /* ★ A ÚNICA ESCRITA EM `assinaturas` DO PRODUTO INTEIRO. Chamada só pelos webhooks, e
   * só depois de o segredo conferir. Ver `entrada/stripe/` e `entrada/abacatepay/`. */
  registrarAssinatura: criarRegistrarAssinatura({ assinaturas }),
};

/** O repositório de assinaturas, cru — o webhook precisa do reverso por cliente, que
 *  não é caso de uso: é a pergunta "de quem é este pagamento?", feita antes de existir
 *  inquilino conhecido. Exportar a porta é mais honesto que inventar um caso de uso sem
 *  `ContextoTenant` só para acomodá-la. */
export const repositorioDeAssinaturas = assinaturas;

/**
 * O que o provedor de cobrança ligado hoje sabe fazer.
 *
 * Exportado cru, e não como caso de uso, pelo mesmo motivo de `repositorioDeAssinaturas`
 * logo acima: não é uma operação, é uma propriedade estática do adaptador. A tela lê para
 * decidir ENTRE dois botões — "gerenciar cobrança" (portal) ou "cancelar assinatura" —
 * antes de desenhar qualquer um dos dois. Ver `portas/saida/cobranca.ts`.
 */
export const capacidadesDeCobranca = cobranca.capacidades();

/** Exposto para as rotas relatarem configuração (o que falta, qual ambiente fiscal). */
export const servicos = { emissor, negocio };

/* ─────────────────────────────────────────────────────────────────────────────
 * O AGENTE DE WHATSAPP.
 *
 * Montado à parte e SOB DEMANDA, por um motivo concreto: construir o cliente de um
 * provedor de IA estoura sem credencial, e este arquivo é importado por TODA rota de
 * API. Construí-lo no topo faria a agenda e a nota fiscal pararem de funcionar num
 * ambiente sem chave de IA — quebrando o app inteiro por causa de uma feature que
 * aquele ambiente talvez nem use.
 *
 * A configuração do agente vem dos fixtures. É aqui que ela pode vir, e não dentro do
 * adaptador: adaptador não conhece adaptador (`ARQUITETURA.md` §6), e é neste arquivo
 * que os dois lados se encontram. Quando a tela "A MAISA" gravar no banco, muda esta
 * linha e nada mais.
 * ────────────────────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️ HISTÓRIA DE UM BUG QUE MATOU A FEATURE INTEIRA — leia antes de mexer no resolvedor.
 *
 * Até aqui, `agenteWhatsapp()` montava a config do agente com os FIXTURES (`SERVICOS`,
 * `EQUIPE`, `EXPEDIENTE`) enquanto `negocio` (acima) já era `repositorioSupabase`. As duas
 * metades deste arquivo discordavam sobre o que é um id, e a cadeia era esta:
 *
 *   1. `persona.ts` imprimia no prompt "(id: sv1)", e `ferramentas.ts` chegava a ensinar o
 *      formato na descrição da tool ("ex.: sv1");
 *   2. o modelo devolvia, corretamente, `servico_id: "sv1"`;
 *   3. `oferecer-horarios.ts` chamava `negocio.servico(t, "sv1")`;
 *   4. o adaptador Supabase consultava `v_servicos` por `id`, que é coluna `uuid`, e a
 *      guarda `PARECE_UUID` devolvia `null` → `NaoEncontrado`.
 *
 * RESULTADO: a MAISA conversava, entendia, e escalava para humano em 100% das tentativas de
 * marcar. Fail-safe (nunca marcou no negócio errado) e falha total da feature ao mesmo tempo.
 *
 * O CONSERTO é o `configuracaoDoAgente` abaixo: a config virou `(t) => Promise<…>`, resolvida
 * do MESMO repositório que os casos de uso usam. É por isso que ela não pode voltar a ser um
 * objeto — um objeto estático aqui é, por construção, a config de um inquilino só.
 * ═══════════════════════════════════════════════════════════════════════════════ */

import { criarAgente, type ResolvedorDeConfiguracao } from "@/adaptadores/entrada/whatsapp/agente";
import { modeloGemini } from "@/adaptadores/saida/gemini/modelo-gemini";
import { GEMINI, isGeminiConfigured } from "@/adaptadores/saida/gemini/config";
import { criarModeloAnthropic } from "@/adaptadores/saida/anthropic/modelo-anthropic";
/* Negócio, equipe, serviços e expediente NÃO são importados aqui de propósito: era
 * justamente esse import que criava o bug de id descrito acima. Eles chegam pelo
 * `repositorioDemo`, que é o fallback do `negocio` quando não há banco — pela porta, como
 * tudo o mais. Só sobrou o que ainda não tem tela que grave. */
import { ASSISTENTE_PADRAO, CFG_PADRAO } from "@/adaptadores/saida/demo/assistente";

/**
 * QUEM RESPONDE. Gemini quando há chave dele; senão, Anthropic.
 *
 * ⚠️ A chave do Gemini em uso hoje é de TESTE e será revogada na ida para produção.
 * Trocar de volta é apagar `GEMINI_API_KEY` do ambiente — nenhuma linha de código, e
 * nada no agente sabe a diferença (ele fala `ModeloDeConversa`, não fala provedor).
 * É para isso que a porta existe.
 *
 * Gemini primeiro, e não o contrário, porque é a decisão de HOJE: com as duas chaves
 * presentes, quem responde é o barato. Inverter a ordem em produção é mover esta linha.
 */
export const modeloEmUso = () =>
  isGeminiConfigured ? GEMINI.modelo : process.env.ANTHROPIC_API_KEY ? "claude-opus-5" : null;

/** A rota checa isto para devolver 503 explicando o que falta, em vez de estourar. */
export const agenteConfigurado = () => isGeminiConfigured || !!process.env.ANTHROPIC_API_KEY;

/**
 * O que a MAISA sabe do negócio, resolvido do MESMO repositório que os casos de uso usam.
 *
 * É esta linha que faz o id no prompt e o id no banco serem o mesmo id. Ver o bloco acima.
 *
 * ✅ NADA MAIS VEM DE FIXTURE. O parágrafo que estava aqui dizia que `faqs` ainda vinha —
 * era o último da lista, e saiu em 15/08/2026. Foi como previsto: porta nova
 * (`RepositorioFaqs`), não uma linha neste arquivo. Só que ela não entrou nesta config —
 * FAQ deixou de ser texto colado no prompt e virou a ferramenta `responder_duvidas`, com
 * busca por sentido. Um prompt que carrega a base inteira paga por ela em toda mensagem,
 * mesmo quando ninguém perguntou nada.
 *
 * ── `assistente` E `cfg` SAÍRAM DA FIXTURE EM 13/08/2026 ──
 *
 * Enquanto a tela "A MAISA" vivia no `localStorage`, ler do banco daria a MESMA
 * assistente para todo inquilino — e era esse o argumento para manter a fixture. Com
 * `PATCH /api/assistente` a tela passa a gravar, e a linha de `assistente` já nasce
 * preenchida no provisionamento, com o tom variando por vertical
 * (`005_provisionar.sql:209`). Manter a fixture agora seria o contrário do que era: uma
 * configuração que o cliente escreve, salva, e que o agente ignora.
 *
 * `Promise.all` porque as quatro falham juntas e ninguém sabe atender com três de quatro:
 * sem serviço não há duração, sem profissional não há agenda, sem negócio não há nome, sem
 * assistente não há tom. Em série custaria quatro round-trips no caminho quente de cada
 * mensagem.
 *
 * O expediente sai de `profissionais` em vez de uma quinta consulta: `Profissional` já
 * carrega o dele (ver `paraProfissional` no adaptador Supabase), então pedir de novo seria
 * pagar duas vezes pela mesma linha.
 */
const configuracaoDoAgente: ResolvedorDeConfiguracao = async (t) => {
  const [dados, servicos, profissionais, ajustes, semana] = await Promise.all([
    negocio.negocio(t),
    negocio.servicos(t),
    negocio.profissionais(t),
    assistente.ler(t),
    /* O horário ANUNCIADO entrou aqui em 13/08/2026, e o motivo é o mesmo de `assistente`
     * horas antes: quem perguntasse "que horas vocês atendem?" era respondido com o
     * expediente do PROFISSIONAL, que é outro dado com outra finalidade. O dono editava
     * a grade na tela, ela morria no `localStorage` do aparelho dele, e a MAISA nunca
     * soube dela. Ver `dominio/horarios.ts` para a distinção entre os dois horários. */
    horarios.ler(t),
  ]);

  /* Linha ausente NÃO derruba a conversa. Aqui o `?? padrão` é a escolha certa, e é o
   * oposto da que `criarLerAssistente` faz: a tela de ajustes precisa saber que a linha
   * sumiu (404), o cliente que acabou de mandar "oi" no WhatsApp não. Responder com o tom
   * padrão é degradar; estourar no meio do turno é sumir.
   *
   * O `warn` existe para isso não virar silêncio permanente: um inquilino provisionado
   * pela RPC sempre tem a linha, então cair aqui é anomalia que merece investigação. */
  if (!ajustes) {
    console.warn(`[composicao] sem linha em 'assistente' para o inquilino ${t.tenantId} — usando o padrão`);
  }

  return {
    negocio: dados,
    servicos,
    profissionais,
    expedientes: Object.fromEntries(profissionais.map((p) => [p.id, p.expediente])),
    assistente: ajustes?.assistente ?? ASSISTENTE_PADRAO,
    /* `null` e não um padrão inventado. A persona escreve "horário não cadastrado", e a
     * MAISA prefere dizer que não sabe a anunciar 8h–20h para um negócio que abre às 14h
     * — anunciar errado traz cliente na porta fechada. */
    semana: semana ?? null,
    /* `faqs` SAIU daqui em 15/08/2026 — era `FAQS`, a fixture de demonstração, colada no
     * prompt de todo inquilino enquanto a tabela `faqs` de cada um dormia com o que o dono
     * cadastrou. Agora é a ferramenta `responder_duvidas`, com busca por sentido. Era o
     * último caso vivo da família "o dono configura e o produto ignora". */
    cfg: ajustes?.cfg ?? CFG_PADRAO,
  };
};

/* O agente em si continua sendo um só por processo: o que era por-inquilino saiu de dentro
 * dele (a config) e virou argumento resolvido a cada mensagem. O que sobra aqui — o cliente
 * do provedor de IA, as definições de ferramenta — é igual para todo mundo. */
let _agente: ReturnType<typeof criarAgente> | null = null;

export function agenteWhatsapp() {
  if (!_agente) {
    _agente = criarAgente({
      modelo: isGeminiConfigured ? modeloGemini : criarModeloAnthropic(),
      config: configuracaoDoAgente,
      // As MESMAS funções que o painel usa. É o teste de que a arquitetura funcionou:
      // marcar horário pelo WhatsApp e pela tela é literalmente a mesma chamada.
      oferecerHorarios: app.oferecerHorarios,
      agendarAtendimento: app.agendarAtendimento,
      cancelarAtendimento: app.cancelarAtendimento,
      lerAgenda: app.lerAgenda,
      lembrarCliente: app.lembrarCliente,
      /* O guardrail que impede a MAISA de falar com o pai do dono. Vai junto com
       * `lembrarCliente` porque as duas respondem "quem está falando" — uma pela memória da
       * conversa, a outra pela agenda de contatos do celular. */
      avaliarAtendimento: app.avaliarAtendimento,
      anotarFato: app.anotarFato,
      responderDuvida: app.responderDuvida,
      historico,
      /* Ele só LÊ daqui, e o que lê é uma pergunta: "esta conversa é do dono?". Se for, cala.
       * Ver o passo 1d de `agente.ts` — é o que faz o botão "Assumir" do painel parar de
       * prometer silêncio e não entregar. */
      conversas,
      canal,
    });
  }
  return _agente;
}
