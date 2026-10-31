import type { Metadata } from "next";
import Whatsapp from "./Whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// O WHATSAPP DE QUEM TEM CONTA — a tela entre o login e o app (30/10/2026).
//
// Quem está logado e ainda não deixou um WhatsApp com DDD é mandado para cá pelo middleware
// (`desvioParaWhatsapp`, em `saida/supabase/sessao.ts`), com `?next=` para onde ia. O porquê
// está em `nucleo/dominio/whatsapp-da-conta.ts`.
//
// ⚠️ ATRÁS DO LOGIN, como o `/comecar`: fora de `PUBLIC_PREFIXES`. O número vai para o
// `user_metadata` da conta logada, e sem conta não há onde gravar.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seu WhatsApp · maisa",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Whatsapp />;
}
