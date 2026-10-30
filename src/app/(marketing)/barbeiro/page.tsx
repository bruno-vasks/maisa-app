import type { Metadata } from "next";
import { World } from "../_lib";
import { Dobra } from "../_lib/barbeiros/v4/Dobra";
import { Telas } from "../_lib/barbeiros/v3/Telas";
import { Duelo } from "../_lib/barbeiros/v3/Duelo";
import { Planos } from "../_lib/barbeiros/v3/Planos";
import { Faq } from "../_lib/barbeiros/v3/Faq";
import { OFERTA } from "../_lib/barbeiros/v3/dados";
import "../_lib/barbeiros/v3/v3.css";
import "../_lib/barbeiros/v4/v4.css";

/* ----------------------------------------------------------------------------
 * /barbeiros/v4 — a v3 com a dobra filmada.
 *
 * ⚠️ A PÁGINA DE VERDADE É A v3; ESTA É UMA VARIANTE DE UMA CAMADA. O pedido foi
 * "igual à v3, mas com um vídeo na hero", e o arquivo faz exatamente isso: importa
 * <Telas>, <Duelo> e <Planos> DA v3, importa o v3.css inteiro, e troca só a <Dobra>.
 * A história inteira da página — por que não tem nav, por que a roda virou fileira e
 * a fileira virou órbita e a órbita virou foto, por que o preço do <Duelo> é o do
 * plano destacado, por que os botões ainda vão para o WhatsApp e não para o Stripe —
 * está no cabeçalho da `barbeiros/v3/page.tsx` e continua valendo palavra por
 * palavra. Não foi copiada para cá de propósito: duas cópias da mesma história
 * divergem no primeiro conserto e a segunda vira mentira.
 *
 * ── AS DUAS CLASSES NO <World>, `lp-v3 lp-v4`, SÃO A ENGRENAGEM DISSO.
 * O v3.css escopa tudo em `.lp-v3` — sem essa classe aqui, a v4 não teria estilo
 * nenhum. A `.lp-v4` vem depois só para o v4.css ter onde pendurar a diferença,
 * com especificidade igual e ordem a favor. Tirar `lp-v3` daqui apaga a página.
 *
 * ── O QUE É PRECISO SABER ANTES DE MEXER.
 * 1. A ordem dos dois `import` de CSS não é decorativa: v3 primeiro, v4 depois. O
 *    v4.css sobrescreve por ordem de cascata, não por peso de seletor.
 * 2. Quem edita o v3.css edita ESTA página junto. É o preço combinado do
 *    compartilhamento — está escrito, com o sinal de quando desacoplar, no topo do
 *    v4.css.
 * 3. O corte dos dois segundos finais do vídeo é de REPRODUÇÃO e mora no
 *    `VideoDobra.tsx`. O .mp4 em /public está inteiro.
 *
 * ── PARA QUE ESTA ROTA EXISTE.
 * Para ser comparada com a /barbeiros/v3 lado a lado, com a mesma oferta e o mesmo
 * texto, mudando uma variável só: fundo parado contra fundo filmado. É um teste,
 * não uma segunda LP para manter. Quando o veredito sair, uma das duas morre — e se
 * a vencedora for esta, o certo é PROMOVER a dobra da v4 para dentro da v3 e apagar
 * esta rota, não deixar a v3 virar rascunho da v4.
 *
 * A rota já está liberada: o middleware libera por prefixo `/barbeiros`.
 * -------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Todos esses foram marcados com a maisa · MAISA para barbearias",
  description: `A maisa responde, agenda e confirma sozinha, no WhatsApp que a barbearia já usa. A partir de ${OFERTA.precoDe}${OFERTA.precoPor}, ${OFERTA.fidelidade}.`,
  /* ⚠️ CANÔNICA APONTANDO PARA `/barbeiros`, E NÃO PARA SI MESMA.
   *
   * As duas páginas têm o MESMO texto — muda só a dobra (parada contra filmada). Duas
   * URLs com conteúdo idêntico fazem o buscador escolher sozinho qual mostrar, e ele não
   * escolhe necessariamente a que está sendo anunciada. A canônica resolve isso sem
   * esconder nada: `/barbeiro` continua abrindo, continua compartilhável e continua
   * servindo para tráfego pago; só deixa de disputar a mesma busca com a irmã.
   *
   * Se um dia os textos divergirem de verdade, esta linha volta a ser `/barbeiro`. */
  alternates: { canonical: "/barbeiros" },
  /* ⚠️ ENQUANTO AS DUAS ROTAS ESTIVEREM NO AR COM O MESMO TEXTO, elas são conteúdo
     duplicado. Para um teste interno tudo bem, mas se a v4 for para tráfego pago vale
     `robots: { index: false }` numa delas — senão o buscador escolhe sozinho qual das
     duas mostrar, e não necessariamente a que está sendo anunciada. */
  openGraph: {
    title: "Todos esses foram marcados com a maisa.",
    description: "A maisa responde, agenda e confirma sozinha, no WhatsApp que a barbearia já usa.",
    url: "/barbeiro",
    type: "website",
  },
};

export default function LpBarbeirosV4() {
  return (
    <World icp="barbeiros" className="lp-v3 lp-v4">
      <main id="conteudo" tabIndex={-1}>
        <Dobra />
        <Telas />
        <Duelo />
        <Planos />
        <Faq />
      </main>
    </World>
  );
}
