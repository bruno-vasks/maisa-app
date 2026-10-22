import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANOS, type ChavePlano } from "@/app/(marketing)/_lib/planos";
import Assinar from "./Assinar";
import { textosDoFunil } from "./funil";

// ─────────────────────────────────────────────────────────────────────────────
// O PRÉ-CADASTRO — a página que o anúncio aponta.
//
// É o funil inteiro numa tela: três campos, e o próximo clique é o Pix em `/pagar` (desde
// 30/09/2026 — antes era o checkout hospedado do provedor, que pedia tudo de novo).
// Quem chega aqui já escolheu o plano na landing page; esta página não vende de novo,
// ela só confirma o que está sendo comprado e pede o mínimo para poder cobrar.
//
// ── POR QUE NÃO UM PAYMENT LINK DIRETO NA LP ──
//
// Porque link de pagamento cobra sem saber de quem é. Mediram-se as consequências na
// conta live em 21/09/2026: 21 clientes, três deles com o MESMO e-mail criados em
// segundos, e 14 assinaturas sem `metadata` — nenhuma atribuível a inquilino nenhum. Era
// o link antigo da LP sendo clicado de novo e criando ficha nova a cada clique.
//
// O pré-cadastro conserta isso por construção: a conta e o negócio nascem ANTES, então o
// checkout sai com o inquilino carimbado e o webhook sabe de quem é o pagamento.
//
// ── ★ `?teste=1`: O TESTE GRÁTIS, SEM PIX (22/10/2026) ──
//
// A mesma página, sem a última etapa: conta, plano, campanha e negócio nascem igual, e a
// pessoa vai direto ao `/comecar`, usando o teste de 14 dias que todo negócio já ganha no
// banco. É o link da landing page tradicional, que promete "teste grátis, sem cartão". As
// regras e os textos dos dois funis estão em `./funil.ts`.
//
// ── ⚠️ SÓ OS PLANOS AUTOATENDIDOS TÊM PÁGINA ──
//
// `escala` responde 404 de propósito. A §19 do documento de precificação o põe "sob
// proposta", e o CTA dele na LP vai para o WhatsApp — ali a venda É conversa. Uma página
// de checkout para um plano que se vende negociado prometeria um caminho que a gente não
// quer que exista.
//
// ⚠️ ROTA PÚBLICA. Precisa de entrada própria em `PUBLIC_PREFIXES`
// (`saida/supabase/sessao.ts`), senão o middleware manda para o login exatamente quem
// está indo COMPRAR. A checagem é por segmento, então `/assinar` não herda de nada. O
// sintoma de esquecer é zero venda, sem erro em lugar nenhum. Há teste.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

/** Os que se vendem sozinhos. Ver o ⚠️ acima sobre o `escala`. */
const AUTOATENDIDOS: readonly ChavePlano[] = ["essencial", "profissional"] as const;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { plano: string };
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const plano = PLANOS.find((p) => p.chave === params.plano);
  /* `?teste=1` é o funil de teste grátis (ver `./funil.ts`); o título diz isso na aba. */
  const teste = searchParams?.teste === "1";
  return {
    title: plano ? textosDoFunil(teste ? "teste" : "pix", plano).titulo : "Assinar · maisa",
    /* `noindex` porque o tráfego aqui é pago e dirigido: quem chega vem de um anúncio com
     * o plano já escolhido. Indexada, ela competiria com a própria landing page na busca
     * e apareceria fora de contexto — um formulário de compra sem a página que o explica. */
    robots: { index: false, follow: false },
  };
}

export default function Page({ params }: { params: { plano: string } }) {
  const plano = PLANOS.find((p) => p.chave === params.plano);
  if (!plano || !AUTOATENDIDOS.includes(plano.chave)) notFound();

  return <Assinar plano={plano} />;
}
