"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O GTM DA MAISA E OS EVENTOS QUE NÃO NASCEM DE UM FORMULÁRIO.
 *
 * Montado no layout raiz. Faz duas coisas:
 *
 * 1. Carrega o `GTM-NPQSDKVD` nas rotas do funil (`rotaMedida`), e só nelas. Ver o ⚠️ de
 *    `ROTAS_DO_FUNIL` sobre o painel.
 * 2. Escuta a sessão e conta o que acontece fora do `/assinar` e do `/cadastro`: o cadastro
 *    pelo Google (`maisa_sign_up`, `maisa_method: "google"`) e a primeira entrada de uma
 *    conta nova (`maisa_account_activated`). O cadastro por e-mail é contado no próprio
 *    formulário, que é onde se sabe a origem, o plano e o ICP.
 *
 * ⚠️ CADA EVENTO SAI UMA VEZ POR CONTA, NESTE NAVEGADOR. A sessão é anunciada de novo a
 * cada página carregada (`INITIAL_SESSION`), então sem a marca no `localStorage` o mesmo
 * cadastro seria contado em toda tela que a pessoa abrisse no primeiro minuto. Em outro
 * aparelho a marca não existe, e a ativação pode contar de novo lá: é o custo aceito.
 *
 * ⚠️ Se a pessoa sair do funil para o painel por `router.push` (o `/comecar` faz isso), o
 * GTM já carregado continua na aba. Não há como descarregar um script. O que impede o
 * painel de ser gravado é o container não ter tag de gravação de sessão, ou tê-la
 * restrita às páginas do funil.
 * ────────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { GTM_ID, rotaMedida, empurrar, levarCampanha, cadastrouAgora, ativouAgora, type ContaMedida } from "@/ui/medicao";

/** Marca no `localStorage`. Falhar ao ler ou gravar (aba anônima do Safari, armazenamento
 *  bloqueado) vale como "ainda não contou": melhor contar duas vezes que nenhuma. */
function primeiraVez(chave: string): boolean {
  try {
    if (localStorage.getItem(chave)) return false;
    localStorage.setItem(chave, "1");
  } catch { /* segue contando */ }
  return true;
}

function medirConta(c: ContaMedida) {
  const metodo = c.app_metadata?.provider === "google" ? "google" : "email";
  if (metodo === "google" && cadastrouAgora(c) && primeiraVez(`maisa.medido.cadastro.${c.id}`)) {
    empurrar({ event: "maisa_sign_up", maisa_method: "google", maisa_origem: location.pathname.split("/")[1] || "raiz" });
  }
  if (ativouAgora(c) && primeiraVez(`maisa.medido.ativacao.${c.id}`)) {
    empurrar({ event: "maisa_account_activated", maisa_method: metodo });
  }
}

export default function Medicao() {
  const path = usePathname() ?? "";

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if ((evento === "INITIAL_SESSION" || evento === "SIGNED_IN") && sessao?.user) medirConta(sessao.user);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /* O botão de plano leva junto a campanha da página (`levarCampanha`). Reescreve o link no
   * clique, antes da navegação, e o `auxclick` cobre o botão do meio (nova aba). */
  useEffect(() => {
    if (!location.search) return;
    const aoClicar = (ev: MouseEvent) => {
      const a = (ev.target as Element | null)?.closest?.('a[href^="/assinar/"]');
      if (a) a.setAttribute("href", levarCampanha(a.getAttribute("href")!, location.search));
    };
    document.addEventListener("click", aoClicar, true);
    document.addEventListener("auxclick", aoClicar, true);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("auxclick", aoClicar, true);
    };
  }, [path]);

  if (!rotaMedida(path)) return null;

  /* O snippet oficial do GTM, sem o `<noscript>`: o app inteiro é React, e sem JavaScript
   * não há formulário nem conversão para medir. */
  return (
    <Script id="gtm" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}
