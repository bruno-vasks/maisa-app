/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — o caderno de nomes, e quem a MAISA atende.
 *
 * Quatro de tela e um de caminho quente. O de caminho quente (`avaliarAtendimento`) é o que
 * impede a MAISA de oferecer horário para o pai do dono, e é chamado uma vez por mensagem
 * recebida, antes do primeiro token. Desde 24/09/2026 ele falha FECHADO.
 *
 * A regra em si não está aqui — está em `dominio/contatos.ts`, pura e testada. Aqui é só a
 * costura: buscar o modo e o contato, e entregar a decisão pronta.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  AvaliarAtendimento, DefinirModoDoNumero, ImportarContatos, LerContatos, MarcarContato, MarcarContatos,
} from "../portas/entrada/casos-de-uso";
import type { RepositorioContatos } from "../portas/saida/repositorio-contatos";
import type { ContatosDoCanal } from "../portas/saida/contatos-do-canal";
import { MODO_PADRAO, chaveDe, ehModoDoNumero, ehNumeroNovo, motivoDoSilencio, podeResponder } from "../dominio/contatos";
import type { HistoricoDoCanal } from "../portas/saida/historico-do-canal";
import type { DetectarPedidoDeHorario } from "./intencao";
import { colapsarEspaco, temConteudo } from "../dominio/texto";
import { DadoInvalido } from "../dominio/erros";

/**
 * A MAISA pode falar com quem acabou de escrever?
 *
 * ── ★ FALHA FECHADA DESDE 24/09/2026 ──
 *
 * Era a única decisão do repositório que falhava ABERTA, com um argumento honesto: calar um
 * cliente pagante é caro e invisível. Mas o argumento pressupunha que "responder por engano"
 * era raro e barato — e a MAISA acabou de mandar 30 mensagens para três pessoas da vida
 * pessoal de uma terapeuta. No número pessoal o erro caro é falar. Então: dado que não
 * chega, provedor que não responde, classificador que estoura → cala, com motivo e log.
 *
 * ── A ORDEM DAS PERGUNTAS É CUSTO ──
 *
 * Caderno e modo (banco, baratos) → rastro no WhatsApp (uma ida à Evolution) → intenção
 * (uma chamada de modelo). Cada uma só roda se a anterior deixou a porta aberta. Quase toda
 * mensagem para no primeiro degrau.
 *
 * ── QUANDO ELA ENTRA NUM NÚMERO NOVO, ELE VIRA CLIENTE NO CADERNO ──
 *
 * Porque a segunda mensagem dessa pessoa já não é de "número novo": a MAISA respondeu, e
 * `jaEscreveramParaEle` passa a valer. Sem gravar, ela atenderia o pedido e emudeceria no
 * meio da marcação. Marcar como cliente é também a verdade — é alguém que pediu horário — e
 * o dono desfaz com um toque na tela de Contatos.
 */
export function criarAvaliarAtendimento(deps: {
  contatos: RepositorioContatos;
  canal: HistoricoDoCanal;
  pedeHorario: DetectarPedidoDeHorario;
  agora?: () => Date;
}): AvaliarAtendimento {
  const agora = deps.agora ?? (() => new Date());

  return async (t, pedido) => {
    const chave = chaveDe(pedido.telefone);
    const calar = (motivo: string) => ({ pode: false, motivo, nome: null });

    try {
      const [modoLido, contato] = await Promise.all([
        deps.contatos.modo(t),
        chave ? deps.contatos.ler(t, chave) : Promise.resolve(null),
      ]);
      const modo = modoLido ?? MODO_PADRAO;
      const nome = contato?.nome ?? null;

      /* Negócio, ou alguém do caderno: a decisão já está tomada sem olhar o WhatsApp. */
      if (modo === "negocio" || contato) {
        const p = { modo, contato, numeroNovo: false, querMarcar: false };
        return { pode: podeResponder(p), motivo: motivoDoSilencio(p), nome };
      }

      /* Sem chave não há como consultar nada — e no número pessoal, sem saber, cala. */
      if (!chave) return calar("Não deu para ler o telefone de quem escreveu. No seu número pessoal a MAISA só responde quem ela reconhece.");

      const rastro = await deps.canal.rastro(t, { telefone: pedido.telefone, jid: pedido.jid });
      const numeroNovo = ehNumeroNovo({ rastro, anteriores: pedido.anteriores, agora: agora() });

      const querMarcar = numeroNovo
        ? await deps.pedeHorario([
          ...pedido.anteriores.filter((m) => m.de === "cliente").map((m) => m.txt),
          pedido.texto,
        ])
        : false;

      const p = { modo, contato: null, numeroNovo, querMarcar };
      const pode = podeResponder(p);

      if (pode) {
        await deps.contatos.marcar(t, { chave, nome: null, telefone: pedido.telefone, cliente: true });
        console.info(`[aplicacao/contatos] número novo pedindo horário: ${chave} virou cliente no inquilino ${t.tenantId}.`);
      }

      return { pode, motivo: motivoDoSilencio(p), nome: null };
    } catch (e) {
      console.error(
        `[aplicacao/contatos] não foi possível decidir se a MAISA atende ${chave || pedido.telefone} no inquilino ${t.tenantId} — `
        + `CALANDO (ver o ★ de criarAvaliarAtendimento): ${e instanceof Error ? e.message : String(e)}`,
      );
      return calar("A MAISA não conseguiu confirmar quem é esta pessoa e ficou calada por segurança. Responda você por aqui.");
    }
  };
}

export function criarLerContatos(deps: { contatos: RepositorioContatos }): LerContatos {
  return async (t) => {
    const [contatos, modo] = await Promise.all([deps.contatos.listar(t), deps.contatos.modo(t)]);
    return { contatos, modo: modo ?? MODO_PADRAO };
  };
}

/**
 * Lê a agenda do provedor e grava o que serve.
 *
 * `lidos` volta junto com `novos` e `total` porque a diferença entre eles é a coisa mais
 * perguntável desta tela: a agenda do Bruno tem 1.840 entradas e 374 utilizáveis (o resto é
 * grupo ou `@lid` sem telefone — ver `ContatosDoCanal`). Mostrar só "374 importados" faria
 * alguém procurar os outros 1.466; mostrar os três números explica sozinho.
 *
 * ⚠️ Quem filtra é o adaptador, não este caso de uso. Está escrito na porta: espalhar a
 * regra do `@lid` significa que a primeira cópia esquecida anuncia 1.840 contatos para um
 * dono que ganhou 374.
 */
export function criarImportarContatos(deps: {
  contatos: RepositorioContatos;
  provedor: ContatosDoCanal;
}): ImportarContatos {
  return async (t) => {
    const faltando = deps.provedor.faltando();
    if (faltando.length) {
      throw new DadoInvalido(
        `Não dá para ler seus contatos: falta ${faltando.join(", ")}.`,
        "provedor",
      );
    }

    const lidos = await deps.provedor.listar(t);

    /* Normaliza AQUI, no núcleo, e não no adaptador: a chave é regra de domínio (`chaveDe`)
     * e um adaptador que a calculasse por conta própria poderia divergir dos outros — e o
     * sintoma seria o caderno nunca casar com quem escreve. */
    const rascunhos = lidos
      .map((c) => ({
        chave: chaveDe(c.telefone),
        nome: temConteudo(c.nome) ? colapsarEspaco(c.nome) : null,
        telefone: c.telefone,
      }))
      .filter((c) => c.chave !== "");

    /* Deduplica por chave antes de gravar. Dois registros do mesmo número com escritas
     * diferentes ("+55 11 …" e "11 …") viram a mesma chave, e um upsert em lote com chave
     * repetida é erro no Postgres — `ON CONFLICT DO UPDATE command cannot affect row a
     * second time`. Prefere quem TEM nome: entre duas linhas do mesmo número, a útil é a
     * que a MAISA pode usar para cumprimentar. */
    const porChave = new Map<string, (typeof rascunhos)[number]>();
    for (const r of rascunhos) {
      const antes = porChave.get(r.chave);
      if (!antes || (!antes.nome && r.nome)) porChave.set(r.chave, r);
    }

    const { novos, total } = await deps.contatos.salvarLote(t, [...porChave.values()]);
    return { novos, total, lidos: lidos.length };
  };
}

export function criarMarcarContato(deps: { contatos: RepositorioContatos }): MarcarContato {
  return async (t, p) => {
    const chave = chaveDe(p.telefone);
    if (!chave) throw new DadoInvalido("Telefone inválido.", "telefone");

    const nome = temConteudo(p.nome) ? colapsarEspaco(p.nome) : null;
    await deps.contatos.marcar(t, { chave, nome, telefone: p.telefone, cliente: p.cliente });
  };
}

/**
 * O "marcar todos" da tela, com os limites que ele precisa ter.
 *
 * ── POR QUE ESTE CASO DE USO É QUASE SÓ VALIDAÇÃO ──
 *
 * Porque a operação em si é uma linha, e o que dá trabalho é impedir que ela vire um
 * estrago. Marcar em massa é a única ação do produto que muda o comportamento da MAISA
 * com centenas de pessoas de uma vez — e no modo pessoal isso significa mil telefones da
 * agenda do dono passando a receber resposta automática de uma barbearia.
 *
 * Então: chave inválida não passa (`chaveDe` devolve `""` para o que não é telefone), e
 * lista vazia é erro em vez de sucesso silencioso — "0 marcados" na tela depois de um
 * clique parece que o botão não funcionou, e o dono clica de novo.
 */
export function criarMarcarContatos(deps: { contatos: RepositorioContatos }): MarcarContatos {
  return async (t, p) => {
    /* Normaliza e tira repetido: a tela manda o que está na lista dela, e mandar a mesma
     * chave duas vezes inflaria a contagem de "pedidos" e faria a comparação com
     * "mudados" acusar recusa que não houve. */
    const chaves = [...new Set((p.chaves ?? []).map((c) => chaveDe(c)).filter(Boolean))];

    if (chaves.length === 0) {
      throw new DadoInvalido("Nenhum contato válido para marcar.", "chaves");
    }

    const mudados = await deps.contatos.marcarVarios(t, { chaves, cliente: p.cliente });
    return { pedidos: chaves.length, mudados };
  };
}

export function criarDefinirModoDoNumero(deps: { contatos: RepositorioContatos }): DefinirModoDoNumero {
  return async (t, modo) => {
    /* Valida no núcleo e não confia no `check` do banco: aqui a recusa vira `DadoInvalido`
     * com frase, e lá viraria 500. É a mesma escolha do `criarAjustarServico`. */
    if (!ehModoDoNumero(modo)) {
      throw new DadoInvalido("Escolha se este número é só do negócio ou também seu.", "modo");
    }
    await deps.contatos.definirModo(t, modo);
  };
}
