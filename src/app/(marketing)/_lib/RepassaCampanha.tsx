"use client";
/* ----------------------------------------------------------------------------
 * <RepassaCampanha> — leva a campanha da URL da LP para os links do `/assinar`.
 *
 * O anúncio cai na LP com `?utm_source=…&gclid=…`. Os botões dos planos apontam para
 * `/assinar/<plano>?icp=…`, montados no SERVIDOR por `linkPlano()` — e o servidor não vê a
 * URL do visitante: as LPs de barbeiros são estáticas, e ler a query lá as tornaria
 * dinâmicas. Sem isto o `/assinar` gravava o lead sem campanha (22/10/2026).
 *
 * Então a troca acontece no navegador, uma vez, na carga: todo `<a href="/assinar/…">` da
 * página ganha os parâmetros de campanha que a LP recebeu (`comCampanha`, em `planos.ts`).
 * Não desenha nada. Sem campanha na URL, não toca em link nenhum.
 *
 * ⚠️ A LP ESTÁTICA DE TERAPEUTAS (`lp/terapeutas/index.html`) NÃO PODE USAR ESTE
 * COMPONENTE — é HTML servido fora do Next. Ela tem um `<script>` irmão deste, com a mesma
 * lista de chaves, e o `planos.test.ts` confere que as duas não divergem.
 *
 * Montado pelo `<World>`, como a `StickyMobileCta`: LP nova nasce com ele sem lembrar.
 * -------------------------------------------------------------------------- */

import { useEffect } from "react";
import { comCampanha } from "./planos";

export function RepassaCampanha() {
  useEffect(() => {
    const busca = window.location.search;
    if (!busca) return;
    document.querySelectorAll<HTMLAnchorElement>('a[href^="/assinar/"]').forEach((a) => {
      const href = a.getAttribute("href");
      if (href) a.setAttribute("href", comCampanha(href, busca));
    });
  }, []);
  return null;
}
