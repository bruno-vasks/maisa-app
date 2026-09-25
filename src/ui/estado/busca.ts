/* ─────────────────────────────────────────────────────────────────────────────
 * A BUSCA DE UMA LISTA DE PESSOAS (25/09/2026, 1C.8, 05 P0-1 e K4).
 *
 * Nasceu em `Contatos.tsx` (`casa`) e agora serve às duas listas, Clientes e Meus contatos:
 *   - busca que é só número, pontuação e espaço ("981234567", "312.456", "(11) 9812") casa pelos
 *     DÍGITOS com qualquer campo numérico (telefone, CPF, a chave do contato). O traço e o
 *     parêntese do telefone formatado não quebram mais a busca, que era o defeito da ⌘K;
 *   - busca com letra casa com o nome, sem acento e sem caixa ("sílva" acha "Silva").
 *
 * Três dígitos no mínimo para casar por número: "1" acharia todo telefone de São Paulo.
 * ────────────────────────────────────────────────────────────────────────────── */

export function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function casaBusca(p: { nome: string | null | undefined; numeros: (string | null | undefined)[] }, busca: string): boolean {
  const q = busca.trim();
  if (!q) return true;
  if (!/[a-zà-ÿ]/i.test(q)) {
    const d = q.replace(/\D/g, "");
    if (d.length < 3) return false;
    return p.numeros.some((n) => !!n && n.replace(/\D/g, "").includes(d));
  }
  return semAcento(p.nome ?? "").includes(semAcento(q));
}
