/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — esvaziar a fila de envios, uma mensagem por vez por negócio (27/10/2026).
 *
 * Pedido do Bruno: pela Evolution a MAISA é um WhatsApp Web não oficial, e o fechamento do
 * mês mandava trinta avisos colados, um atrás do outro, dentro da requisição do painel. Agora
 * quem tem mensagem para mandar sem ninguém ter escrito a põe na fila (`FilaDeEnvios`), e
 * daqui ela sai espaçada: de 3 a 7 s entre uma pessoa e outra, com o "digitando…" do ritmo
 * "rotina" do canal antes de cada texto.
 *
 * Dois gatilhos, a mesma drenagem:
 *   • `DrenarFilaDoNegocio` — logo depois de enfileirar, em segundo plano, na requisição de
 *     quem enfileirou (o fechamento do lote, o retorno da Receita). É o caminho de quase tudo.
 *   • `EnviarFilaDeMensagens` — a rotina (`/api/rotinas/envios`, pelo `pg_cron` da 037), para
 *     o que sobrou: rodada que acabou o tempo, execução que morreu, falha passageira.
 *
 * Duas drenagens do mesmo negócio ao mesmo tempo não mandam em dobro nem colado: a vez é
 * decidida pela fila (no banco), e quem não consegue reservar simplesmente para.
 *
 * ── QUANDO A FALHA NÃO VOLTA PARA A FILA ──
 *
 * Só volta o que com certeza não saiu: `LimiteDoProvedor` (a Evolution disse que não
 * processou), `PrecisaReconectar` (WhatsApp desconectado) e `NaoConfigurado`. O resto
 * (timeout, 500, número que não existe) pode ter entregado, e mandar de novo seria o
 * paciente recebendo o recibo duas vezes. É a regra do canal (ver `enviarDocumento` em
 * `canal-evolution.ts`), estendida à fila: desiste, e o recibo fica com aviso `falhou`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { DrenarFilaDoNegocio, EnviarFilaDeMensagens, ResultadoDaFila } from "../portas/entrada/casos-de-uso";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { FilaDeEnvios } from "../portas/saida/fila-de-envios";
import type { GuardaDeComprovante } from "../portas/saida/guarda-de-comprovante";
import type { LivroDeRecibos } from "../portas/saida/livro-de-recibos";
import type { ContextoTenant } from "../dominio/tenant";
import { linkDoCanalValido, type EnvioNaFila } from "../dominio/envios";
import { LimiteDoProvedor, NaoConfigurado, PrecisaReconectar } from "../dominio/erros";

/** O espaço mínimo entre duas pessoas do mesmo número, que a fila confere no banco. */
export const ESPACO_MINIMO_MS = 3_000;

/** O espaço que se espera de fato: sorteado entre os dois, para não ter compasso de máquina. */
const ESPACO_SORTEADO_MS: [number, number] = [3_000, 7_000];

/** Quanto uma drenagem pode passar mandando. Abaixo dos 300 s da função (Fluid compute, ver
 *  `vercel.json`); o que não couber fica na fila para a próxima. */
export const TEMPO_DA_RODADA_MS = 240_000;

/** Validade do link do PDF gerado na hora de mandar. O canal baixa na hora; é folga. */
const PDF_VALE_SEGUNDOS = 600;

type Deps = {
  fila: FilaDeEnvios;
  /** No ritmo "rotina" (ver `composicao.ts`): "digitando…" curto antes de cada texto. */
  canal: CanalDeMensagens;
  guarda: GuardaDeComprovante;
  livro: Pick<LivroDeRecibos, "registrarAviso">;
  /** Só o teste troca. */
  relogio?: () => number;
  dormir?: (ms: number) => Promise<void>;
  sorteio?: () => number;
};

const contextoDeSistema = (tenantId: string): ContextoTenant => ({
  tenantId,
  usuarioId: "",
  ator: { tipo: "sistema", rotina: "envios" },
});

const nada = (): ResultadoDaFila => ({ enviados: 0, adiados: 0, desistidos: 0 });

/** Falha que com certeza não entregou nada: pode voltar para a fila. */
const passageira = (e: unknown) =>
  e instanceof LimiteDoProvedor || e instanceof PrecisaReconectar || e instanceof NaoConfigurado;

function drenador(deps: Deps) {
  const relogio = deps.relogio ?? (() => Date.now());
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sorteio = deps.sorteio ?? Math.random;

  async function mandar(t: ContextoTenant, e: EnvioNaFila): Promise<void> {
    if (e.documento) {
      /* O link sai AGORA, da nossa cópia, e vale dez minutos; um gerado na hora de enfileirar
       * podia vencer na fila. Sem cópia (ou sem link dela), o link do canal, se ainda vale. */
      const daCopia = e.documento.caminho
        ? await deps.guarda.linkParaBaixar(t, { caminho: e.documento.caminho, segundos: PDF_VALE_SEGUNDOS }).catch(() => null)
        : null;
      const url = daCopia ?? (linkDoCanalValido(e, relogio()) ? e.documento.url ?? null : null);
      if (url) {
        if (e.textos.length) await deps.canal.enviar(t, e.para, e.textos);
        await deps.canal.enviarDocumento(t, e.para, { url, nomeDoArquivo: e.documento.nomeDoArquivo, legenda: e.documento.legenda });
        return;
      }
    }
    /* Sem documento, ou sem link que preste: a mensagem vai só em texto, como era antes do PDF. */
    await deps.canal.enviar(t, e.para, e.documento ? [...e.textos, e.documento.legenda] : e.textos);
  }

  return async function drenar(t: ContextoTenant, ate: number): Promise<ResultadoDaFila> {
    const r = nada();
    while (relogio() < ate) {
      const e = await deps.fila.reservar(t, ESPACO_MINIMO_MS);
      /* Nada vencido, ou a vez ainda não chegou, ou outra drenagem está mandando: ela segue. */
      if (!e) break;

      try {
        await mandar(t, e);
        await deps.fila.concluir(t, e.id);
        r.enviados++;
        if (e.recibo) {
          await deps.livro.registrarAviso(t, { reciboId: e.recibo.id, desfecho: e.recibo.desfechoAoEnviar }).catch(() => {});
        }
      } catch (erro) {
        const vaiVoltar = passageira(erro);
        const { desistiu } = await deps.fila.devolver(t, e.id, {
          erro: erro instanceof Error ? erro.message : String(erro),
          desistir: !vaiVoltar,
        });
        if (desistiu) {
          r.desistidos++;
          if (e.recibo) await deps.livro.registrarAviso(t, { reciboId: e.recibo.id, desfecho: "falhou" }).catch(() => {});
        } else {
          r.adiados++;
        }
        /* WhatsApp desconectado ou provedor fora: o próximo da fila daria no mesmo. Número que
         * não existe é problema daquela pessoa só, e a fila segue. */
        if (vaiVoltar) break;
      }

      const espera = Math.round(ESPACO_SORTEADO_MS[0] + (ESPACO_SORTEADO_MS[1] - ESPACO_SORTEADO_MS[0]) * sorteio());
      if (relogio() + espera >= ate) break;
      await dormir(espera);
    }
    return r;
  };
}

export function criarDrenarFilaDoNegocio(deps: Deps): DrenarFilaDoNegocio {
  const drenar = drenador(deps);
  const relogio = deps.relogio ?? (() => Date.now());
  return (t) => drenar(t, relogio() + TEMPO_DA_RODADA_MS);
}

export function criarEnviarFilaDeMensagens(deps: Deps): EnviarFilaDeMensagens {
  const drenar = drenador(deps);
  const relogio = deps.relogio ?? (() => Date.now());
  return async () => {
    const ate = relogio() + TEMPO_DA_RODADA_MS;
    const negocios = await deps.fila.negociosComEnvio();
    /* Em paralelo: o espaço é por número, e um negócio não espera pelo outro. Um negócio que
     * falha não derruba os outros, como nos lembretes. */
    const rs = await Promise.all(negocios.map((id) => drenar(contextoDeSistema(id), ate).catch(nada)));
    return rs.reduce((a, b) => ({
      enviados: a.enviados + b.enviados,
      adiados: a.adiados + b.adiados,
      desistidos: a.desistidos + b.desistidos,
    }), nada());
  };
}
