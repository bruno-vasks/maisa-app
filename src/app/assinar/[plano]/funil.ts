/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE O PRÉ-CADASTRO DECIDE, SEM REACT — para dar para testar.
 *
 * ── ★ DOIS FUNIS NA MESMA PÁGINA (22/10/2026) ──
 *
 *   /assinar/<plano>            → conta → negócio → Pix em `/pagar` → `/comecar`   ("pix")
 *   /assinar/<plano>?teste=1    → conta → negócio → `/comecar`                     ("teste")
 *
 * O segundo existe para a landing page tradicional (maisasecretary.com.br) poder prometer
 * "teste grátis, sem cartão" e ser verdade. Não há trial novo a construir: TODO negócio já
 * nasce em `trial` de 14 dias (`005_provisionar.sql`), inclusive o do funil com Pix — quem
 * paga durante o teste ganha o mês a partir do fim dele (`creditarUmMes`). O funil de teste é
 * o mesmo cadastro sem a última etapa. Quando o teste acaba, o corte vem da data
 * (`acessoLiberado`), o e-mail de aviso sai três dias antes (`avisoDoDia`), e o pagamento é o
 * mesmo Pix de `/pagar`, de dentro do app (gaveta "Meu plano").
 *
 * ⚠️ O NOME DO PARÂMETRO É `teste`, E O VALOR É `1`, SÓ. É o que a LP tradicional vai colar
 * no link, e link publicado não se edita. `?teste=true`, `?teste=sim` e `?gratis=1` caem no
 * funil com Pix, que é o comportamento de antes desta mudança — errar o link nunca dá
 * produto de graça sem querer, só pede o Pix que a página com Pix sempre pediu.
 *
 * ⚠️ O TEXTO DESTA VARIANTE NÃO PODE PROMETER O QUE O CÓDIGO NÃO FAZ. "Sem cartão" é verdade
 * porque não há campo de cartão nenhum; "sem Pix agora" porque o funil não chama
 * `POST /api/assinatura`; "avisamos antes de acabar" porque a rotina de `avisarVencimentos`
 * manda e-mail a quem está em `trial`; "nada é cobrado" porque não existe cobrança
 * automática no pré-pago — sem pagar, a MAISA só para de responder.
 * ────────────────────────────────────────────────────────────────────────────── */

import { DIAS_DE_TESTE } from "@/nucleo/dominio/assinatura";
import type { Vertical } from "@/nucleo/dominio/negocio";
import type { PublicoDoCartao } from "@/app/(marketing)/_lib/planos";

export type ModoDoFunil = "teste" | "pix";

/** `?teste=1` é o funil de teste grátis; qualquer outra coisa é o funil com Pix. */
export function modoDoFunil(busca: string | URLSearchParams): ModoDoFunil {
  const q = typeof busca === "string" ? new URLSearchParams(busca) : busca;
  return q.get("teste") === "1" ? "teste" : "pix";
}

/** A vertical do negócio → para quem o cartão do plano fala. `generico` tem copy própria
 *  desde 22/10/2026: antes caía na de terapeutas e prometia nota fiscal a qualquer negócio. */
export function publicoDoCartao(vertical: Vertical): PublicoDoCartao {
  return vertical === "barbeiros" || vertical === "terapeutas" ? vertical : "generico";
}

/** O que vai para o `user_metadata` além do que o formulário pede. `funil` é o que deixa o
 *  `npm run leads` separar "em teste" de "não pagou": as duas contas têm negócio em `trial`
 *  e nenhum pagamento, e só o caminho por onde entraram diz qual das duas é abandono. */
export function marcaDoFunil(modo: ModoDoFunil): { funil: ModoDoFunil } {
  return { funil: modo };
}

type PlanoExibido = { nome: string; preco: string; periodo: string };

/** Todo texto que muda entre os dois funis, num lugar só. */
export type TextosDoFunil = {
  /** O `<title>` da página. */
  titulo: string;
  /** Rótulo do botão de enviar. */
  botao: string;
  /** O que o botão diz na última espera antes de sair da página. */
  ultimaEtapa: string;
  /** Faixa no cartão do plano, acima das linhas. `null` = sem faixa. */
  faixa: string | null;
  /** Complemento do preço no cartão ("depois do teste"). `null` = só o preço. */
  depoisDoPreco: string | null;
  /** A explicação abaixo do botão. `null` = nenhuma. */
  explicacao: string | null;
  /** A tela de "confirme seu e-mail", quando o Supabase pede confirmação. */
  confirme: string;
  /** E-mail que já tem conta. */
  jaTemConta: string;
  /** A conta nasceu e o negócio não. */
  semNegocio: string;
  /** A mensagem do "Prefere falar com a gente antes?". */
  whatsapp: string;
};

export function textosDoFunil(modo: ModoDoFunil, plano: PlanoExibido): TextosDoFunil {
  if (modo === "teste") {
    return {
      titulo: `Testar o ${plano.nome} grátis · maisa`,
      botao: "Começar meu teste grátis",
      ultimaEtapa: "Abrindo a configuração…",
      faixa: `${DIAS_DE_TESTE} dias grátis · sem cartão · sem Pix agora`,
      depoisDoPreco: "depois do teste",
      explicacao:
        `Você não paga nada agora e não cadastra cartão. O teste dura ${DIAS_DE_TESTE} dias, e avisamos `
        + `por e-mail antes de acabar. Para continuar, você paga o ${plano.nome} por Pix, de dentro do app. `
        + "Se não pagar, a maisa só para de responder: nada é cobrado sozinho.",
      confirme:
        "Clique nele para entrar e conectar o seu WhatsApp. O plano que você escolheu está guardado, "
        + `e os ${DIAS_DE_TESTE} dias de teste começam quando você entrar.`,
      jaTemConta: "Este e-mail já tem uma conta. Entre para continuar de onde parou.",
      semNegocio: "Sua conta foi criada, mas não conseguimos montar o negócio. Entre para continuar.",
      whatsapp: `Oi! Quero testar a maisa grátis no plano ${plano.nome}, mas tenho uma dúvida antes.`,
    };
  }
  return {
    titulo: `Assinar o ${plano.nome} · maisa`,
    botao: "Ir para o pagamento",
    ultimaEtapa: "Gerando o seu Pix…",
    faixa: null,
    depoisDoPreco: null,
    explicacao: null,
    confirme:
      "Clique nele e você cai direto no começo da configuração — o plano que você escolheu está guardado.",
    jaTemConta: "Este e-mail já tem uma conta. Entre e assine de dentro do app.",
    semNegocio: "Sua conta foi criada, mas não conseguimos montar o negócio. Entre para continuar.",
    whatsapp: `Oi! Quero assinar a maisa no plano ${plano.nome} (${plano.preco}/mês), mas tenho uma dúvida antes.`,
  };
}

/** Para onde a pessoa vai quando conta e negócio estão de pé. No teste, direto para a
 *  configuração; no Pix, para o Pix (que depois volta ao `/comecar`). */
export function depoisDoNegocio(modo: ModoDoFunil): "comecar" | "pix" {
  return modo === "teste" ? "comecar" : "pix";
}
