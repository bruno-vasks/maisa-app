import type { Metadata } from "next";
import Pagar from "./Pagar";

// ─────────────────────────────────────────────────────────────────────────────
// O PIX NA NOSSA TELA — `/pagar?id=pix_char_…&volta=/comecar…` (30/09/2026).
//
// Para onde `POST /api/assinatura` manda a pessoa no pré-pago. Mostra o QR Code e o
// copia-e-cola do Pix, acompanha o pagamento e devolve para onde ela estava.
//
// Existe porque a página hospedada da AbacatePay pedia, depois do nosso cadastro, nome, CPF,
// e-mail, telefone e endereço antes de mostrar o Pix — doze campos em dois sites. O Pix
// transparente só precisa do valor. Ver `saida/abacatepay/cobranca-avulsa.ts`.
//
// PROTEGIDA pelo middleware, de propósito: quem chega aqui acabou de criar a conta no
// `/assinar` (e já tem sessão) ou clicou em "pagar" de dentro do app. O Pix é de um negócio,
// e `GET /api/pagamento` só o mostra para a sessão desse negócio.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar com Pix · maisa",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Pagar />;
}
