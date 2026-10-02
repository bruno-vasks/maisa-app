/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — emitir sozinha os recibos de quem tem dia marcado (01/10/2026, a Regina).
 *
 * Roda uma vez por dia (o cron da Vercel chama `/api/rotinas/recibos`). Para cada pessoa cujo dia
 * de recibo caiu hoje, ou nos dois dias anteriores (`FOLGA_DO_RECIBO_AUTOMATICO`), emite os recibos
 * das sessões pendentes dela com data ANTERIOR ao dia do recibo. Dia 5, por exemplo: entra o que
 * foi atendido até o dia 4 e ainda não tem recibo. Desde 01/10/2026 elas vão juntas, um recibo por
 * mês (ou o que a ficha escolheu: `juntarEmRecibos`), e não mais um por sessão.
 *
 * ── ★ É A MESMA EMISSÃO DA TELA ──
 *
 * Cada recibo sai por `emitirRecibo`, o caso de uso que o botão "Emitir" usa. Então a rotina
 * herda, sem reescrever nenhuma, as garantias que custaram caro: o pagamento preso antes de falar
 * com a Receita (sem recibo duplicado, nem com duas rodadas no mesmo dia), o valor lido do banco,
 * a recusa de cliente de teste, de CPF inválido e de dados fiscais incompletos. O que esta função
 * acrescenta é só QUANDO e DE QUEM.
 *
 * ── ⚠️ ELA NÃO AVISA NINGUÉM ──
 *
 * A emissão termina em `pendente`. Quem avisa é o callback do canal, quando a Receita confirma, e
 * ele segue a escolha do negócio: não enviar, direto para o paciente, ou primeiro para a dona.
 * Avisar aqui prometeria um recibo que talvez seja recusado.
 *
 * ── UMA FALHA NÃO DERRUBA AS OUTRAS ──
 *
 * Igual à rotina de lembretes: um negócio com dado faltando, ou um recibo que o canal recusou, vai
 * para o relatório, e a rodada segue com o próximo.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  EmitirRecibo, EmitirRecibosAutomaticos, ResultadoDosRecibosAutomaticos,
} from "../portas/entrada/casos-de-uso";
import type { AgendaDeRecibos, PacienteComDiaDeRecibo } from "../portas/saida/agenda-de-recibos";
import type { RepositorioFiscal } from "../portas/saida/repositorio-fiscal";
import type { RepositorioRecibos } from "../portas/saida/repositorio-recibos";
import type { ContextoTenant } from "../dominio/tenant";
import { caminhoDaNota, fiscalFaltando } from "../dominio/fiscal";
import { cpfValido } from "../dominio/clientes";
import { diaDoReciboAlcancado } from "../dominio/recibo-automatico";
import { juntarEmRecibos } from "../dominio/recibos-do-mes";
import { somarDias } from "../dominio/tempo";

/**
 * Quanto tempo a rodada pode gastar emitindo, em milissegundos.
 *
 * Existe por causa do relógio da função (60s na Vercel), não do banco: cada recibo é uma chamada
 * ao canal. O que não couber fica `adiado` e sai na rodada de amanhã, dentro da folga de dias.
 */
export const TETO_DA_RODADA_MS = 45_000;

/** O ator da rotina: ninguém clicou, e a IA não escreveu. Ver `contextoDeSistema` dos lembretes. */
const contextoDeSistema = (tenantId: string): ContextoTenant => ({
  tenantId,
  usuarioId: "",
  ator: { tipo: "sistema", rotina: "recibos" },
});

export function criarEmitirRecibosAutomaticos(deps: {
  agenda: AgendaDeRecibos;
  recibos: RepositorioRecibos;
  fiscal: RepositorioFiscal;
  emitirRecibo: EmitirRecibo;
  /** O relógio do teto. Injetável para o teste não depender de quanto a máquina demora. */
  agora?: () => number;
  teto?: number;
}): EmitirRecibosAutomaticos {
  const agora = deps.agora ?? (() => Date.now());
  const teto = deps.teto ?? TETO_DA_RODADA_MS;

  return async (hoje): Promise<ResultadoDosRecibosAutomaticos> => {
    const inicio = agora();
    const r: ResultadoDosRecibosAutomaticos = { pacientes: 0, emitidos: 0, semCpf: 0, adiados: 0, falhas: [] };

    /* Só quem tem o dia alcançado hoje, agrupado por negócio. A data guardada é o dia do recibo
     * DAQUELE mês (o 31 que virou 30), e é ela que separa as sessões que entram. */
    const porNegocio = new Map<string, { p: PacienteComDiaDeRecibo; dia: string }[]>();
    for (const p of await deps.agenda.comDia()) {
      const dia = diaDoReciboAlcancado(p.dia, hoje);
      if (!dia) continue;
      porNegocio.set(p.tenantId, [...(porNegocio.get(p.tenantId) ?? []), { p, dia }]);
    }

    for (const [tenantId, devidos] of porNegocio) {
      const t = contextoDeSistema(tenantId);
      try {
        const config = await deps.fiscal.ler(t);
        /* Negócio de CNPJ não emite Receita Saúde. Não é falha: o dia ficou na ficha de quando
         * era pessoa física, e o recibo só voltaria a sair se ela voltasse. */
        if (caminhoDaNota(config, hoje) !== "recibo_saude") continue;
        const falta = fiscalFaltando(config, hoje);
        if (falta.length || !config.registroProfissional?.trim()) {
          r.falhas.push({ tenantId, motivo: `dados fiscais incompletos: ${[...falta, ...(config.registroProfissional?.trim() ? [] : ["registro no conselho"])].join(", ")}` });
          continue;
        }

        /* Uma leitura por negócio, até ontem; cada pessoa recorta a dela pelo próprio dia. */
        const pendentes = await deps.recibos.pendentes(t, { ate: somarDias(hoje, -1) });

        for (const { p, dia } of devidos) {
          r.pacientes++;
          const dela = pendentes.filter((x) => x.clienteId === p.clienteId && x.data < dia && !x.teste);
          /* Conta à parte, antes de chamar: `emitirRecibo` recusaria do mesmo jeito, mas como
           * falha, e "falta o CPF da Ana" é coisa que a dona resolve, não erro da rotina. */
          const comCpf = dela.filter((x) => cpfValido(x.cpf ?? ""));
          r.semCpf += dela.length - comCpf.length;
          /* ★ UM RECIBO POR MÊS (01/10/2026): as sessões viram recibos pela escolha da ficha
           * (`porMes`). Sessões de meses diferentes nunca vão juntas. */
          const recibos = juntarEmRecibos(comCpf, () => p.porMes);
          for (const [i, grupo] of recibos.entries()) {
            if (agora() - inicio > teto) { r.adiados += recibos.length - i; break; }
            try {
              await deps.emitirRecibo(t, { itens: grupo.map((x) => ({ fonte: x.fonte, id: x.id })) });
              r.emitidos++;
            } catch (e) {
              r.falhas.push({ tenantId, motivo: e instanceof Error ? e.message : String(e) });
            }
          }
        }
      } catch (e) {
        r.falhas.push({ tenantId, motivo: e instanceof Error ? e.message : String(e) });
      }
    }

    return r;
  };
}
