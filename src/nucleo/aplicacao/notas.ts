/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — nota fiscal de serviço.
 *
 * Emitir é assíncrono por natureza: a prefeitura devolve "processando" e o número sai depois.
 * Por isso são vários casos de uso e não um — quem pede acompanha por `consultar` até virar
 * autorizado, cancelado ou erro.
 *
 * ── ⚠️ O BURACO QUE ISTO FECHOU, 17/08/2026 ──
 *
 * `PedidoDeEmissao` recebia `valor`, `discriminacao` e `tomador` — do NAVEGADOR. Ou seja: um
 * POST forjado em `/api/nf/emitir` emitia documento fiscal de qualquer valor, para qualquer
 * CPF, sob o CNPJ do dono. E mesmo sem má-fé, uma tela aberta há dez minutos mandava um total
 * velho, e a nota saía com valor que não correspondia ao que estava marcado.
 *
 * Agora o pedido é só `{ clienteId }`. Valor, discriminação e tomador saem do banco, na
 * transação que prende os atendimentos — quem soma é o Postgres, sobre exatamente as linhas
 * que acabou de reservar.
 *
 * ── A ORDEM: ABRIR → EMITIR → CONCLUIR ──
 *
 * Marcar os atendimentos ANTES de a nota existir na prefeitura. Está explicado na porta
 * `RepositorioNotas`, e é a mesma escolha de `reservar_lembretes()`: o erro barato é uma nota
 * `erro` visível na tela; o caro é uma nota autorizada na prefeitura com os atendimentos
 * ainda "a faturar", que a próxima tentativa emite de novo.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  CancelarNota, ConsultarNota, EmitirNota, LerFaturamento,
} from "../portas/entrada/casos-de-uso";
import type { EmissorFiscal } from "../portas/saida/emissor-fiscal";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { RepositorioNotas } from "../portas/saida/repositorio-notas";
import { discriminacaoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { DadoInvalido, NaoConfigurado, NaoEncontrado } from "../dominio/erros";
import { hojeISO } from "../dominio/tempo";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { RepositorioCanal } from "../portas/saida/repositorio-canal";
import type { ContextoTenant } from "../dominio/tenant";
import type { ResultadoDeNota } from "../dominio/fiscal";
import { numeroDaDona } from "../dominio/recibo-automatico";
import { avisoDeNotaAoDono, nomeDoPdfDaNota, type NotaAvisavel } from "../dominio/aviso-de-nota";

export type DepsNota = {
  emissor: EmissorFiscal;
  /**
   * ⚠️ ENTROU EM 17/08/2026, e é o que faz a nota sair no CNPJ CERTO. Antes o emissor lia o
   * prestador de variável de ambiente — uma resposta só, global. Com dois clientes no ar isso
   * não é "configuração incompleta": é a nota de um saindo no CNPJ do outro.
   */
  fiscal: RepositorioFiscal;
  /** Quem guarda a nota e prende os atendimentos. É o que impede a duplicação. */
  notas: RepositorioNotas;
  /** Injetado para o núcleo não depender de `crypto` — e para dar teste determinístico. */
  novoId: () => string;
  /**
   * O PDF da nota no WhatsApp de quem emite (15/10/2026). Opcional: sem ele, nada muda. Ver
   * `avisarDono` e `dominio/aviso-de-nota.ts`.
   */
  aviso?: DepsDeAvisoDaNota;
};

export type DepsDeAvisoDaNota = {
  canal: CanalDeMensagens;
  /** Só para achar o número do dono — o mesmo `numeroDaDona` do recibo. */
  canalDoNegocio: RepositorioCanal;
};

/**
 * Manda o PDF da nota que acabou de sair para o WhatsApp do dono.
 *
 * ⚠️ NUNCA LANÇA, e quem chama não espera desfecho. A nota já está gravada; uma mensagem que não
 * sai (WhatsApp desconectado, canal fora do ar) não desemite nada nem vira erro na rota.
 *
 * Só com PDF: a mensagem existe para levar o documento. Nota sem PDF (produção sem token, ou
 * provedor que ainda não devolveu) não gera aviso.
 */
async function avisarDono(aviso: DepsDeAvisoDaNota | undefined, t: ContextoTenant, r: ResultadoDeNota, nota: NotaAvisavel) {
  if (!aviso || !r.pdf) return;
  if (r.status !== "autorizado" && r.status !== "simulado") return;
  try {
    const dono = numeroDaDona(await aviso.canalDoNegocio.ler(t));
    if (!dono) return;
    const n = { ...nota, numero: r.numero ?? nota.numero };
    await aviso.canal.enviarDocumento(t, dono, { url: r.pdf, nomeDoArquivo: nomeDoPdfDaNota(n), legenda: avisoDeNotaAoDono(n) });
  } catch (e) {
    console.error(`[aplicacao/notas] a nota ${r.ref} saiu, mas o PDF não chegou ao WhatsApp do dono: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * A `ref` da nota no provedor, cunhada AQUI — nunca recebida de fora.
 *
 * Precisa ser única por emissão (a Focus recusa `ref` repetida) e reconhecível nos relatórios
 * do provedor, daí o prefixo e a origem no meio.
 */
const cunharRef = (novoId: () => string, semente: string) =>
  `maisa-${String(semente).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "nf"}-${novoId().slice(0, 8)}`;

export function criarLerFaturamento({ notas, fiscal }: Pick<DepsNota, "notas" | "fiscal">): LerFaturamento {
  return async (t) => {
    const [aFaturar, emitidas, config] = await Promise.all([
      notas.aFaturar(t),
      notas.listar(t),
      fiscal.ler(t),
    ]);

    return {
      aFaturar,
      emitidas,
      ambiente: config.ambiente,
      /* A tela precisa saber se dá para emitir ANTES de mostrar o botão. Sem isso o dono
       * clica em "emitir as 12 pendentes" e recebe doze erros de configuração. */
      falta: fiscalFaltando(config, hojeISO()),
    };
  };
}

export function criarEmitirNota({ emissor, fiscal, notas, novoId, aviso }: DepsNota): EmitirNota {
  return async (t, p) => {
    if (!p.clienteId?.trim()) throw new DadoInvalido("Diga de quem é a nota.", "clienteId");

    const config = await fiscal.ler(t);
    /* Recusa ANTES de abrir a nota. Abrir e só então descobrir que falta dado fiscal deixaria
     * uma nota `erro` no histórico com os atendimentos presos a ela — trabalho para desfazer
     * por causa de uma checagem que cabia antes. */
    const falta = fiscalFaltando(config, hojeISO());
    if (falta.length) throw new NaoConfigurado(falta);

    /* Precisa da linha de `aFaturar` para montar a discriminação com o serviço prestado. Ela
     * também é a resposta a "tem o que faturar?" sem gastar a claim. */
    const pendente = (await notas.aFaturar(t)).find((a) => a.clienteId === p.clienteId);

    if (!pendente) {
      /* ⚠️ AQUI SE SEPARAM DUAS COISAS QUE PARECEM IGUAIS, e confundi-las custa um clique
       * repetido em cima de emissão fiscal.
       *
       *   já tem nota  → `ja_faturado`. É o SEGUNDO CLIQUE, e a resposta certa é benigna.
       *   nunca teve   → `NaoEncontrado`. Não há o que emitir, e dizer "já foi" seria mentira.
       *
       * Um teste pegou isto: sem a distinção, o duplo clique recebia "esse cliente não tem
       * atendimento sem nota" — uma frase que soa como erro e faz o dono procurar o problema
       * justamente onde não há problema nenhum. */
      const jaTemNota = (await notas.listar(t)).some((n) => n.clienteId === p.clienteId);
      if (jaTemNota) return { status: "ja_faturado", ref: "", ambiente: config.ambiente };
      throw new NaoEncontrado("Esse cliente não tem atendimento sem nota.");
    }

    if (!pendente.cpf) {
      throw new DadoInvalido(
        `Falta o CPF de ${pendente.nome} — a prefeitura não aceita nota sem o documento do tomador.`,
        "cpf",
      );
    }

    /* A nota de um pagamento (27/10/2026, `aplicacao/recebimentos.ts`) leva só os atendimentos que
     * ele pagou. A discriminação conta esses, com o serviço e o mês do que falta faturar. */
    const so = p.atendimentoIds?.length ? p.atendimentoIds : null;
    const aberta = await notas.abrir(t, {
      clienteId: p.clienteId,
      ref: cunharRef(novoId, p.clienteId),
      ambiente: config.ambiente,
      discriminacao: discriminacaoDaNota(so ? { ...pendente, atendimentos: so.length } : pendente),
      ...(so ? { atendimentoIds: so } : {}),
    });

    /* ⚠️ `null` NÃO É ERRO, e este caminho é o da CORRIDA DE VERDADE — não do duplo clique.
     *
     * O clique repetido em sequência já foi tratado pela checagem lá acima. O que sobra aqui é
     * o caso concorrente: duas requisições que passaram pela checagem ao mesmo tempo, e o
     * `for update skip locked` do banco deu a claim a uma delas. A perdedora enxerga zero.
     *
     * Os dois caminhos são necessários, e nenhum é redundante: sem a checagem, o duplo clique
     * daria uma frase de erro; sem esta linha, a corrida abriria a segunda nota. */
    if (!aberta) return { status: "ja_faturado", ref: "", ambiente: config.ambiente };

    const r = await emissor.emitir(t, config, {
      ref: aberta.ref,
      valor: aberta.valor,
      discriminacao: aberta.discriminacao,
      tomador: aberta.tomador,
    });

    /* Grava o desfecho aconteça o que acontecer — inclusive erro. A nota fica no histórico com
     * os atendimentos presos, que é o estado retentável. */
    await notas.concluir(t, aberta.id, r);
    await avisarDono(aviso, t, r, { numero: r.numero ?? null, tomadorNome: aberta.tomador.nome, valor: aberta.valor });
    return r;
  };
}

export function criarConsultarNota({ emissor, fiscal, notas, aviso }: Pick<DepsNota, "emissor" | "fiscal" | "notas" | "aviso">): ConsultarNota {
  return async (t, ref) => {
    if (!ref) throw new DadoInvalido("ref ausente.", "ref");

    const nossa = await notas.porRef(t, ref);
    /* ⚠️ Confere que a `ref` é DESTE inquilino antes de perguntar ao provedor. Sem isso, uma
     * ref conhecida de outro negócio devolveria número, PDF e o nome do tomador dele — a
     * consulta é autenticada pelo token da empresa, mas o token é escolhido por ESTE
     * inquilino, e a Focus responderia sobre qualquer ref que aquela empresa emitiu. */
    if (!nossa) throw new NaoEncontrado("Essa nota não é deste negócio.");

    const config = await fiscal.ler(t);
    const consulta = await emissor.consultar(t, config, ref);
    /* A simulada não tem a quem perguntar: o número e o PDF que ela ganhou na emissão estão só
     * no nosso banco, e `concluir` gravaria `null` por cima deles. */
    const r = consulta.status === "simulado"
      ? { ...consulta, numero: consulta.numero ?? nossa.numero, pdf: consulta.pdf ?? nossa.pdf }
      : consulta;
    await notas.concluir(t, nossa.id, r);
    /* Só na VIRADA para autorizada: a tela consulta de novo a cada poucos segundos, e cada
     * consulta de uma nota já emitida mandaria o PDF outra vez. */
    if (nossa.status !== "emitida") {
      await avisarDono(aviso, t, r, { numero: nossa.numero ?? null, tomadorNome: nossa.tomadorNome, valor: nossa.valor });
    }
    return r;
  };
}

export function criarCancelarNota({ emissor, fiscal, notas }: Pick<DepsNota, "emissor" | "fiscal" | "notas">): CancelarNota {
  return async (t, p) => {
    const ref = p.ref.trim();
    if (!ref) throw new DadoInvalido("ref ausente.", "ref");

    const nossa = await notas.porRef(t, ref);
    if (!nossa) throw new NaoEncontrado("Essa nota não é deste negócio.");

    const config = await fiscal.ler(t);
    const r = await emissor.cancelar(t, config, ref, p.justificativa);
    await notas.concluir(t, nossa.id, r);

    /* ⚠️ CANCELAR NÃO SOLTA OS ATENDIMENTOS, e é decisão, não esquecimento.
     *
     * Soltar faria o cliente voltar para "a faturar" e o dono emitiria a nota de novo — que é
     * às vezes o que ele quer, e às vezes exatamente o que não quer (cancelou porque o serviço
     * não aconteceu). Não há como distinguir os dois casos aqui, e o erro caro é o segundo:
     * emitir documento fiscal de serviço não prestado.
     *
     * Enquanto não houver uma ação explícita de "refaturar", o caminho é o dono cancelar e
     * pedir de novo pela gaveta do cliente. */
    return r;
  };
}
