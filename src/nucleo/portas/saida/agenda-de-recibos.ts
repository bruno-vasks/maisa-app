/* ─────────────────────────────────────────────────────────────────────────────
 * PORTA DE SAÍDA — quem tem dia de recibo automático, em todos os negócios (01/10/2026).
 *
 * ⚠️ A TERCEIRA PORTA SEM `ContextoTenant`, ao lado de `FilaDeLembretes` e de `paraAvisar` das
 * assinaturas, e pelo mesmo motivo: a rotina diária pergunta sobre TODOS os negócios, e não tem
 * sessão nem dono. Ver `EmitirRecibosAutomaticos` em `portas/entrada/casos-de-uso.ts`.
 *
 * ── O LIMITE DA EXCEÇÃO, ESCRITO ──
 *
 *   · SÓ LÊ, e só três campos: de qual negócio, qual pessoa, qual dia. Nada de nome, CPF ou
 *     telefone atravessa inquilinos por aqui; o que a emissão precisa, ela lê dentro do
 *     `ContextoTenant` daquele negócio.
 *   · O `tenantId` vem do BANCO, junto da linha. Quem chama nunca escolhe um.
 *
 * ── LER, E NÃO RESERVAR ──
 *
 * Ao contrário da fila de lembretes, aqui não há reserva, e não precisa: a trava contra emitir
 * duas vezes mora em cada pagamento (`LivroDeRecibos.abrir`, a `abrir_recibo_unitario`), que a
 * emissão usa de qualquer jeito. Duas rodadas no mesmo dia leem a mesma lista; a segunda acha os
 * pagamentos já presos e não emite nada.
 * ────────────────────────────────────────────────────────────────────────────── */

export type PacienteComDiaDeRecibo = {
  tenantId: string;
  clienteId: string;
  /** 1 a 31. Em mês curto, vale o último dia: ver `diaDoReciboNoMes`. */
  dia: number;
};

export interface AgendaDeRecibos {
  /** Toda pessoa ATIVA com dia de recibo, de todos os negócios. */
  comDia(): Promise<PacienteComDiaDeRecibo[]>;
}
