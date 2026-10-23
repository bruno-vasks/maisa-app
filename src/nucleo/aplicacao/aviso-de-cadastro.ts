/* ─────────────────────────────────────────────────────────────────────────────
 * O AVISO DE CADASTRO NOVO — uma conta nasceu, o Bruno fica sabendo (22/10/2026).
 *
 * Quem chama é a rota `/api/interno/novo-cadastro`, disparada pelo trigger do banco com o id da
 * conta. O texto e as regras puras estão em `dominio/aviso-de-cadastro.ts`; o limite desta
 * exceção ao `ContextoTenant` está em `portas/entrada/casos-de-uso.ts`.
 *
 * ── A ORDEM: MARCAR, MANDAR, E DESMARCAR SÓ SE NADA SAIU ──
 *
 * Mesma forma da reserva de lembrete (`reservar_lembretes` + `devolver`): a marca de "avisado" é
 * gravada ANTES do envio, para uma segunda chamada com o mesmo id (o trigger disparado à mão de
 * novo, alguém repetindo o `curl`) encontrar a marca e não mandar outro e-mail. Se o envio falhar
 * para TODOS os destinatários, a marca é desfeita e a chamada termina em erro — a rota responde
 * 502, o `net._http_response` do Supabase mostra, e dá para disparar de novo
 * (`select public.avisar_novo_cadastro('<id>')`). Se pelo menos um recebeu, a marca fica: reenviar
 * para todos repetiria o e-mail de quem já recebeu.
 *
 * ⚠️ A MARCA NÃO É UMA CLAIM ATÔMICA. Ela é lida e depois gravada (o metadata da conta, pela API de
 * admin do Supabase — ver `saida/supabase/contas-novas.ts`), então duas chamadas com o MESMO id no
 * mesmo instante poderiam passar as duas. Não acontece no uso real: o trigger dispara uma vez por
 * conta criada, e o `pg_net` não reentrega sozinho. Se um dia houver reentrega automática, o
 * degrau é uma função no banco que marque com `update … where not (… ? 'chave')`.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { AvisarNovoCadastro, ResultadoDoAvisoDeCadastro } from "../portas/entrada/casos-de-uso";
import type { ContasNovas } from "../portas/saida/contas-novas";
import type { Correio } from "../portas/saida/correio";
import { idDeContaValido, textoDoAvisoDeCadastro } from "../dominio/aviso-de-cadastro";
import { DadoInvalido, FalhaDoProvedor } from "../dominio/erros";

export function criarAvisarNovoCadastro(deps: {
  contas: ContasNovas;
  correio: Correio;
  /** Para quem vai. Fixo da configuração (`destinatariosDoAviso`), nunca do pedido. */
  destinatarios: readonly string[];
}): AvisarNovoCadastro {
  return async (contaId, agora) => {
    if (!idDeContaValido(contaId)) throw new DadoInvalido("O id da conta tem de ser um uuid.", "id");
    const id = contaId.trim();

    const conta = await deps.contas.ler(id);
    if (!conta) return { status: "conta_inexistente", enviados: 0, falhas: [] };
    if (conta.avisadaEm) return { status: "ja_avisado", enviados: 0, falhas: [] };

    await deps.contas.marcarAvisada(id, agora.toISOString());

    const { assunto, texto } = textoDoAvisoDeCadastro(conta);
    const r: ResultadoDoAvisoDeCadastro = { status: "enviado", enviados: 0, falhas: [] };

    for (const para of deps.destinatarios) {
      try {
        await deps.correio.enviar({ para, assunto, texto });
        r.enviados++;
      } catch (e) {
        r.falhas.push(String((e as Error)?.message ?? e));
      }
    }

    if (!r.enviados) {
      /* Desmarcar também pode falhar (o mesmo banco que piscou). Aí a conta fica marcada sem
       * e-mail, e quem conserta é o disparo à mão depois de apagar a marca — escrito no cabeçalho
       * da 035. O erro que sobe é o do envio, que é o que se precisa ler no log. */
      await deps.contas.desmarcarAvisada(id).catch(() => undefined);
      throw new FalhaDoProvedor(`Aviso de cadastro: nenhum e-mail saiu. ${r.falhas.join(" | ")}`);
    }

    return r;
  };
}
