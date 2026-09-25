"use client";
import { useEffect, useState } from "react";

/** Detecta viewport mobile (≤900px, o mesmo breakpoint do shell).
 *  Retorna false no SSR/primeiro render e sincroniza após o mount.
 *  Use para telas que precisam de um layout mobile próprio (não só single-column). */
export function useIsMobile(query = "(max-width: 900px)"): boolean {
  const [is, setIs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setIs(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return is;
}

/** Desktop apertado (901–1200px): cabe tabela, mas não cabem todas as colunas.
 *  Existe porque entre o breakpoint mobile e um monitor largo havia uma faixa em que o layout
 *  quebrava calado — o conteúdo truncava em vez de reduzir. As colunas marcadas `secundaria`
 *  somem aqui em vez de espremer as que importam. */
export function useEstreita(): boolean {
  return useIsMobile("(max-width: 1200px)");
}

/**
 * A casca decide entre rail e abas ANTES de pintar (T11, 25/09/2026, contradição C14).
 *
 * `useIsMobile` devolve `false` no primeiro render (não há `window` no servidor), então no
 * celular o primeiro quadro era o painel de mesa, com o rail, e só depois virava abas. Aqui o
 * primeiro render devolve `null`, e a casca pinta só o fundo nesse quadro.
 *
 * ⚠️ SÓ A CASCA USA ISTO. `useIsMobile` continua como está: os Ajustes derivam o caminho QR ou
 * código no render e dependem de o primeiro ser `false` (`AMaisa.tsx`, C14).
 */
export function useLayout(query = "(max-width: 900px)"): "celular" | "mesa" | null {
  const [l, setL] = useState<"celular" | "mesa" | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setL(mq.matches ? "celular" : "mesa");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return l;
}
