import type { Metadata } from "next";
import Liberar from "./Liberar";

// ─────────────────────────────────────────────────────────────────────────────
// LIBERAR O TESTE — `/liberar/<pedido>` (09/10/2026).
//
// O link que chega na mensagem de quem pediu teste na `/pagar`. Só a equipe libera: a tela pede
// login como qualquer outra (o middleware guarda o caminho no `next`, e é por isso que o pedido
// vai no caminho e não na query) e a rota confere `MAISA_EQUIPE`.
//
// ⚠️ ABRIR A PÁGINA NÃO LIBERA NADA. O WhatsApp abre o link sozinho para a pré-visualização; quem
// libera é o botão, por POST. Ver `api/teste/liberar/route.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Liberar teste · maisa",
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: { pedido: string } }) {
  return <Liberar pedido={decodeURIComponent(params.pedido)} />;
}
