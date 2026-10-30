import { NextResponse } from "next/server";
import { agenteConfigurado, agenteWhatsapp, modeloEmUso, provedorEmUso, servicos } from "@/composicao";
import { atorAgente, type ContextoTenant } from "@/nucleo/dominio/tenant";
import { barrou, exigirSessao, type Porteiro } from "@/adaptadores/entrada/http/contexto";
import { espiarMemoriaDemo, limparDemo } from "@/adaptadores/saida/demo/memoria";
import { espiarAgendaDemo, limparAgendaDemo } from "@/adaptadores/saida/demo/agenda";
import { espelhoDemo, zerarEspelhoDemo } from "@/adaptadores/saida/demo/atendimentos";
import { isGoogleConfigured } from "@/adaptadores/saida/google/config";
import { isEvolutionConfigured } from "@/adaptadores/saida/evolution/config";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { hhmm } from "@/nucleo/dominio/tempo";

// ─────────────────────────────────────────────────────────────────────────────
// LABORATÓRIO — conversar com a MAISA sem WhatsApp.
//
// GET    → estado (quem responde, qual agenda, o exemplo para as falas sugeridas)
// POST   → manda uma mensagem como se fosse o cliente
// DELETE → esquece tudo (só no modo demonstração; ver o método)
//
// ⚠️ ELE DEIXOU DE SER DEV-ONLY EM 15/08/2026, e essa é a mudança deste arquivo.
//
// Antes: sem autenticação nenhuma, fechado em produção por `MAISA_LABORATORIO=1`, e o
// inquilino montado aqui dentro a partir de `MAISA_TENANT_ID`. Era coerente enquanto o
// único usuário era quem estava afinando o tom da MAISA por `curl`.
//
// Agora ele é a etapa 4 do `/comecar` — o "ver funcionando" que fecha o onboarding. O
// inquilino passa a vir da SESSÃO, como em toda rota do painel, e a env sobra só como
// caminho de desenvolvimento sem login. As consequências, escritas para ninguém se
// assustar depois:
//
//   • Em produção, sem sessão, a resposta agora é 401 e não 404. A rota existe de verdade
//     e negá-la escondendo-a seria mentir para o próprio produto.
//   • Ela GASTA TOKEN de modelo e ESCREVE NA AGENDA de quem chama. Com `exigirSessao` isso
//     é exatamente a mesma exposição que o WhatsApp do próprio inquilino já tem — o dono
//     gastando o dele, no negócio dele. Não era assim antes: sem porteiro, qualquer um que
//     achasse a rota gastava a chave de IA de terceiro.
//
// ⚠️ POR QUE CONTINUA NÃO SENDO A ROTA `/api/whatsapp`.
//
// Aquela é um webhook PÚBLICO e falha fechada: sem `WHATSAPP_WEBHOOK_SECRET` ela recusa
// tudo, e o inquilino sai do DESTINO da mensagem (instância da Evolution ou número da
// Cloud API). Para conversar com a MAISA no navegador, isso significaria configurar
// Evolution só para digitar "bom dia" — e a tentação seria afrouxar a autenticação do
// webhook "só no dev". Webhook afrouxado no dev é webhook afrouxado.
//
// Então este é um adaptador de entrada IRMÃO, com fronteira própria — e a fronteira agora
// é a sessão, que é a mesma do resto do app.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O caminho de desenvolvimento SEM LOGIN. Não é mais o portão da rota — é a exceção.
 *
 * Fecha por padrão e só abre com `MAISA_LABORATORIO=1` explícito, pela mesma razão de
 * sempre: o inverso (abrir por padrão e fechar com flag) é o arranjo que vaza, porque
 * ninguém lembra de setar a flag no deploy que importa.
 */
const LIBERADO = process.env.NODE_ENV !== "production" || process.env.MAISA_LABORATORIO === "1";

/** Telefone de quando não há inquilino de verdade: a Mariana Alves dos fixtures. Escolhido
 *  para o laboratório abrir já no caminho de CLIENTE RECONHECIDO — é o que exercita a
 *  memória. Trocar o número no campo da tela dá o caminho de desconhecido. */
const TELEFONE_PADRAO = "11981234567";

/**
 * O inquilino de fixture, para o dev sem login.
 *
 * `MAISA_TENANT_ID` com fallback para uma constante é deliberado: exigir a variável faria
 * este caminho precisar de DUAS configurações, e o objetivo é que uma chave de IA baste
 * para conversar. O id só precisa ser estável — é chave de memória, não credencial.
 */
function tenantDoLaboratorio(): ContextoTenant {
  const tenantId = process.env.MAISA_TENANT_ID?.trim() || "laboratorio";
  return { tenantId, usuarioId: tenantId, ator: atorAgente("laboratorio") };
}

/**
 * De quem é esta conversa. **A sessão primeiro, sempre.**
 *
 * A ordem é a decisão: tentar a fixture antes faria um dono logado conversar com o
 * catálogo de outro negócio — que é a família de bug que o `configuracaoDoAgente` do
 * `composicao.ts` existe para ter fechado. Quem tem sessão fala com o próprio inquilino;
 * quem não tem só é atendido pelo caminho de desenvolvimento.
 *
 * Quando nem um nem outro, devolve o barrado que `exigirSessao` montou (401 ou o 409
 * `sem_negocio`, que a tela usa para mandar a pessoa criar o negócio) — e não um 404
 * genérico, que faria a tela do wizard não saber o que dizer.
 */
async function inquilino(): Promise<Porteiro> {
  const p = await exigirSessao();
  if (!barrou(p)) return p;

  /**
   * ⚠️ 409 NUNCA CAI NA FIXTURE, e esta linha é o conserto de um defeito medido.
   *
   * `exigirSessao` barra por dois motivos diferentes com a mesma forma: 401 é "não tem
   * ninguém aí" e 409 `sem_negocio` é "tem uma pessoa logada que ainda não criou o
   * negócio". A primeira versão desta função tratava os dois igual, e o resultado apareceu
   * numa caminhada em 16/08/2026: uma conta recém-criada, sem inquilino, recebeu **200 com
   * o catálogo do inquilino de `MAISA_TENANT_ID`** — o negócio de outra pessoa.
   *
   * Leitura, em desenvolvimento, e ainda assim é exatamente a família de bug que o resto
   * deste arquivo existe para não ter. Quem tem sessão recebe a resposta da sessão dele,
   * sempre; a fixture é só para quem não tem sessão nenhuma.
   */
  if (p.barrado.status === 409) return p;

  if (LIBERADO) return { tenant: tenantDoLaboratorio() };
  return p;
}

/**
 * As colunas de diagnóstico do `/laboratorio` leem os adaptadores DEMO direto, e eles só
 * são os vivos quando não há banco (ver `composicao.ts`).
 *
 * Com Supabase configurado, memória e espelho moram no Postgres e estas listas vêm vazias
 * — o que na tela lia como "a MAISA não lembra de nada" quando o certo é "não é aqui que
 * ela lembra". A tela usa este campo para dizer isso em vez de mostrar caixas vazias.
 */
const ESPIANDO = !isSupabaseConfigured;

export async function GET() {
  const p = await inquilino();
  if (barrou(p)) return p.barrado;
  const t = p.tenant;

  /**
   * O EXEMPLO — de onde saem as falas sugeridas da etapa 4 do wizard.
   *
   * Sai do MESMO repositório que o agente lê para montar o prompt, e é esse o ponto: uma
   * sugestão escrita à mão ("quero marcar um Corte com o Rafael") num negócio que vende
   * outra coisa faria a primeira frase do produto ser sobre um serviço que não existe — e
   * a MAISA responderia, corretamente, que não conhece. O pior desfecho possível para a
   * tela que existe para mostrar que funciona.
   *
   * Só o nome, e não a frase pronta: montar a frase é copy, e copy mora na tela.
   *
   * Falha em silêncio (`null`) porque isto é enfeite de uma tela cujo trabalho é conversar:
   * sem exemplo a pessoa digita, com exemplo ela clica. Derrubar a rota inteira porque a
   * sugestão não pôde ser calculada seria trocar o essencial pelo conveniente.
   */
  const exemplo = await (async () => {
    try {
      const [svs, profs] = await Promise.all([
        servicos.negocio.servicos(t),
        servicos.negocio.profissionais(t),
      ]);
      return {
        servico: svs.find((s) => s.ativo)?.nome ?? null,
        profissional: profs.find((pr) => pr.ativo)?.nome ?? null,
      };
    } catch (e) {
      console.warn(`[api/laboratorio] sem exemplo para o inquilino ${t.tenantId}: ${String(e)}`);
      return { servico: null, profissional: null };
    }
  })();

  return NextResponse.json({
    ok: true,
    pronto: agenteConfigurado(),
    modelo: modeloEmUso(),
    provedor: provedorEmUso(),
    /* Os três avisos que explicam qualquer estranheza no comportamento. Sem eles, um
     * horário que "não existe" parece bug do agente quando é só a agenda de mentira. */
    agenda: isGoogleConfigured ? "google" : "demonstração (em memória)",
    canal: isEvolutionConfigured ? "evolution" : "log do servidor",
    telefonePadrao: TELEFONE_PADRAO,
    exemplo,
    /** As colunas da direita valem alguma coisa? Ver `ESPIANDO`. */
    espiando: ESPIANDO,
    memoria: !ESPIANDO ? [] : espiarMemoriaDemo(t.tenantId).map((m) => ({
      telefone: m.telefone,
      nome: m.nome ?? null,
      servicoFavorito: m.servicoFavoritoId ?? null,
      profissionalFavorito: m.profissionalFavoritoId ?? null,
      // Hora legível: `14.5` na tela seria a MAISA falando em hora decimal.
      horarioFavorito: m.horarioFavorito !== undefined ? hhmm(m.horarioFavorito) : null,
      visitas: m.historico.length,
    })),
    agendados: !ESPIANDO ? [] : espiarAgendaDemo(t.tenantId)
      .filter((e) => e.daMaisa)
      .map((e) => ({ data: e.data, hora: hhmm(e.inicio), cliente: e.cliente, servico: e.servico })),
    /**
     * O ESPELHO — a linha que foi (ou não) para `atendimentos`.
     *
     * Vale a coluna própria por um motivo específico: `agendados` mostra a AGENDA, e a
     * agenda é o Google. Um agendamento pode aparecer lá e faltar aqui, e é exatamente
     * essa divergência que interessa — ela significa que o faturamento e a auditoria de
     * ator perderam aquele atendimento. Sem esta lista, o buraco no espelho é invisível
     * até alguém abrir a tela de Faturamento e achar o mês fraco.
     *
     * `ator` está aqui porque é a pergunta que o espelho existe para responder: quais
     * destes a MAISA marcou sozinha?
     */
    espelho: !ESPIANDO ? [] : espelhoDemo(t.tenantId).map((l) => ({
      data: l.dataLocal,
      hora: hhmm(l.horaInicio),
      cliente: l.clienteNome,
      /* `null` aqui é o sinal de que quem marcou não entrou no cadastro — e é o que faz
       * `v_clientes.valor` somar zero para essa pessoa. */
      clienteId: l.clienteId,
      servico: l.servicoNome,
      valor: l.servicoValor,
      ator: l.ator,
      situacao: l.situacao,
    })),
    /** Quem a MAISA cadastrou conversando. Só os criados pelo agente — o fixture tem 17
     *  e listá-los todos afogaria o que interessa. */
    clientesNovos: !ESPIANDO ? [] : (await servicos.negocio.clientes(t))
      .filter((c) => c.id.startsWith("cl-demo-"))
      .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone })),
  });
}

export async function POST(request: Request) {
  const p = await inquilino();
  if (barrou(p)) return p.barrado;

  if (!agenteConfigurado()) {
    return NextResponse.json(
      { ok: false, erro: "Sem chave de IA. Preencha GEMINI_API_KEY (ou ANTHROPIC_API_KEY) no .env.local e reinicie o dev." },
      { status: 503 },
    );
  }

  const corpo = await request.json().catch(() => null);
  const texto = String(corpo?.texto ?? "").trim();
  const de = String(corpo?.de ?? "").trim() || TELEFONE_PADRAO;

  if (!texto) return NextResponse.json({ ok: false, erro: "mensagem vazia" }, { status: 400 });

  try {
    const r = await agenteWhatsapp()(p.tenant, { de, texto });

    return NextResponse.json({
      ok: true,
      bolhas: r.bolhas,
      escalou: r.escalou,
      motivo: r.motivo ?? null,
      /* A trilha é o motivo de este laboratório existir em vez de um `curl`. Ela mostra
       * se a MAISA chamou `oferecer_horarios` ANTES de falar de agenda — e no texto da
       * resposta os dois casos (consultou / inventou) são indistinguíveis. */
      trilha: r.trilha,
      modelo: r.modelo,
      voltas: r.voltas,
    });
  } catch (e) {
    /* No laboratório o erro VAI para a tela, ao contrário da rota de produção que engole.
     * É o ponto: aqui quem lê é quem consegue consertar, e esconder a mensagem do
     * provedor (o 400 que diz qual campo do schema da ferramenta ele recusou) trocaria
     * dez minutos de conserto por uma tarde de adivinhação.
     *
     * ⚠️ O erro mais provável AQUI, e não no webhook: `PrecisaReconectar` vindo de
     * `instanciaDoInquilino` quando o inquilino não tem WhatsApp pareado. O webhook nunca
     * o vê (ele só dispara para instância que existe), e a mensagem dele já é a certa —
     * "este negócio ainda não tem um WhatsApp conectado". */
    console.error("[api/laboratorio] falha", e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  const p = await inquilino();
  if (barrou(p)) return p.barrado;

  /**
   * ⚠️ SÓ LIMPA O QUE É DE MENTIRA, e é por isso que devolve `limpou`.
   *
   * `limparDemo` e companhia zeram `Map`s de módulo — a memória do modo demonstração. Com
   * Supabase configurado, memória, espelho e agenda moram em outro lugar e estas chamadas
   * não fariam nada: um "Esquecer tudo" que responde ok sem apagar nada é pior que um
   * botão ausente, porque quem clicou passa a acreditar que zerou.
   *
   * Apagar de verdade a conversa de um inquilino real é ação do painel, com confirmação —
   * não um botão de tela de teste.
   */
  if (!ESPIANDO) return NextResponse.json({ ok: true, limpou: false });

  limparDemo();
  limparAgendaDemo();
  /* O espelho entra no "Esquecer tudo" junto com memória e agenda: deixá-lo de fora faria
   * o caminho "cliente que nunca falou com a MAISA" mostrar o atendimento da rodada
   * anterior, e é justamente esse caminho que decide a primeira impressão do produto.
   *
   * ⚠️ O CLIENTE CADASTRADO NÃO SAI. `garantirCliente` empurra no array de fixture, e não
   * há como distinguir o que ele criou do que já vinha — quem quiser o estado limpo de
   * verdade reinicia o `next dev`. Está escrito para ninguém achar que zerou e não zerou. */
  zerarEspelhoDemo();
  return NextResponse.json({ ok: true, limpou: true });
}
