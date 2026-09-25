/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE SAÍDA — o progresso da ativação, no modo demonstração.
 *
 * Responde a partir dos MESMOS fixtures que as outras telas leem, e não com uma lista
 * fixa. A diferença importa: com lista fixa, o wizard rodado sem banco mostraria sempre a
 * mesma barra, e o afinamento do fluxo — que é justamente o que o modo demo existe para
 * permitir — seria feito contra um número inventado.
 *
 * ⚠️ `whatsapp_conectado` e `primeira_conversa` são SEMPRE falsos
 * aqui, e isso é honesto: sem Evolution e sem banco de mensagens não há o que
 * conectar nem o que ter conversado. O efeito colateral é bom — o wizard de demonstração
 * abre com os passos que faltam abertos, que é o estado que se quer exercitar.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ProgressoDeAtivacao } from "@/nucleo/portas/saida/progresso-ativacao";
import type { PassoDeAtivacao, ProgressoDaAtivacao } from "@/nucleo/dominio/ativacao";
import { progressoDe } from "@/nucleo/dominio/ativacao";
import { SERVICOS } from "./catalogo";

/** O catálogo como o fixture nasceu. Comparar com ele é o equivalente demo de comparar
 *  `atualizado_em` com `criado_em` — o adaptador real não tem como guardar isto porque o
 *  banco persiste entre processos, e aqui o processo É a persistência. */
const CATALOGO_DE_PARTIDA = SERVICOS.map((s) => JSON.stringify(s)).join("|");

export const ativacaoDemo: ProgressoDeAtivacao = {
  async ler(): Promise<ProgressoDaAtivacao> {
    const feitos: PassoDeAtivacao[] = ["negocio_criado"];

    /* Mexeu no catálogo? No demo isso é o array ter mudado desde que o módulo carregou —
     * `salvarServico`/`removerServico` mutam `SERVICOS` em memória (ver `repositorio.ts`). */
    if (SERVICOS.map((s) => JSON.stringify(s)).join("|") !== CATALOGO_DE_PARTIDA) {
      feitos.push("catalogo_ajustado");
    }

    return progressoDe(feitos);
  },
};
