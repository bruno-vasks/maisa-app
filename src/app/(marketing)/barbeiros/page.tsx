import type { Metadata } from "next";
import { World } from "../_lib";
import { Dobra } from "../_lib/barbeiros/v3/Dobra";
import { Telas } from "../_lib/barbeiros/v3/Telas";
import { Duelo } from "../_lib/barbeiros/v3/Duelo";
import { Planos } from "../_lib/barbeiros/v3/Planos";
import { Faq } from "../_lib/barbeiros/v3/Faq";
import { OFERTA } from "../_lib/barbeiros/v3/dados";
import "../_lib/barbeiros/v3/v3.css";

/* ----------------------------------------------------------------------------
 * /barbeiros/v3 — recomeço da LP de barbeiros.
 *
 * POR QUE UMA v3 EM VEZ DE UM CONSERTO DA v2. A v2 já era uma reforma (ela
 * desfez os 8 slots inventados da v1) e ainda assim a dobra não funcionou: o
 * herói empilhava manchete + subtítulo + botão + preço e depois espremia a
 * imagem numa faixa, o que só podia dar imagem espremida. Consertar aquilo
 * significaria mexer no arranjo, no conteúdo e na peça ao mesmo tempo — que é
 * escrever uma versão nova com o custo de fingir que não é. A v2 fica no disco,
 * intacta, em /barbeiros/completa/v2, e esta não importa nada de lá.
 *
 * ESCOPO DE AGORA: DOBRA + TELAS + DUELO + PLANOS. Em 06/08/2026 o ato 2 e o fecho saíram da página a
 * pedido — ela ia ser repensada inteira, e manter dois atos que já se sabia que iam
 * sair só faria a próxima decisão herdar restrições mortas. Os arquivos não se
 * perderam: estão em `.claude/snapshots/v3-antes-do-recomeco-2026-08-06/`, e o
 * snapshot existe porque a pasta v3 é untracked — o git não os protegia.
 *
 * ⚠️ A RODA SAIU EM 07/08/2026, E COM ELA METADE DESTE ARQUIVO.
 * A dobra era um palco pinado de 200svh com 64 rostos em dois anéis, que
 * desenrolavam no scroll até virar uma barra horizontal — e essa barra passava por
 * cima do topo da <Telas> (a TRAVESSIA, `margin-top: -16svh`). O veredito foi
 * "esteticamente está legal, mas está muito pesada: só uma linha de pessoas + um
 * fundo de partículas".
 *
 * A troca foi menor do que parece, porque a barra JÁ ERA o estado final do
 * desenrolar: a página passou a COMEÇAR onde a roda terminava. Saíram `Roda.tsx`,
 * `Morph.tsx`, `geometria.ts` e `trilha.ts`; entraram <Fileira> (uma linha, catorze
 * rostos, fita de CSS) e <Particulas> (campo de pontos em canvas 2D, azul com acento
 * dourado). Sem palco não há travessia — e o que fazer nesse caso já estava escrito
 * no bloco `prefers-reduced-motion` do v3.css desde 06/08; a regra dele subiu para o
 * caso geral. Snapshot em `.claude/snapshots/v3-antes-da-fileira-2026-08-07/`.
 *
 * ── E EM 08/08/2026 A FILA VIROU ÓRBITA. O retorno foi que as imagens podiam PASSAR
 * pela hero, "com uma fila orbitando o texto" (referência: Eye Gallery). A <Fileira>
 * saiu, entrou a <Orbita>: dezesseis rostos numa elipse fechada em volta do miolo,
 * `offset-path` de CSS, zero JavaScript. No mesmo pedido a manchete perdeu a segunda
 * frase — a dobra ficou com imagens, uma frase e um botão, e nada mais.
 * Snapshot em `.claude/snapshots/v3-antes-da-orbita-2026-08-07/`.
 *
 * ⚠️ COM A ÓRBITA VOLTOU A SOBREPOSIÇÃO ENTRE TEXTO E IMAGEM, que a saída da roda
 * tinha encerrado — e com ela a obrigação de PROVAR que um rosto nunca cruza a
 * manchete. A prova está em `.lp3-orbita` (v3.css) e tem seis entradas, duas delas
 * fora daquele bloco: a largura do miolo e o corpo da frase. Mexer em qualquer uma
 * sem refazer a conta põe um retrato em cima do título.
 *
 * NÃO TEM NAV, e não é esquecimento: uma one-pager não navega para nada. A da v1
 * pedia 489px numa viewport de 390px, com o wordmark cortado fora da tela.
 *
 * ⚠️ REGRA QUE A SAÍDA DO PALCO DEIXOU, e que já custou um conserto: NADA pode ter
 * deslocamento negativo que o tire da própria seção. Enquanto havia palco pinado,
 * o que escapasse para cima ficava escondido debaixo dele — era o caso do laço
 * dourado da <Telas>, com `top: -11svh`. Sem palco, ele foi parar em cima da fila
 * de rostos (93px de invasão em 390×844, medido). Agora não há mais nada por cima
 * para cobrir o que vazar.
 *
 * Em 07/08/2026 entrou a <Duelo>, a terceira seção: o custo de contratar alguém
 * contra o custo da assinatura, no molde da seção "Humano vs. Inteligência
 * Artificial" da LP em produção. Ela reimagina a referência em quatro pontos, todos
 * escritos no Duelo.tsx — os cartões se separam, os dois ícones saem, o risco vira
 * fundo da seção e o destaque do card da maisa é luz em vez de tarja (a tarja é
 * justamente o recurso que o cliente reprovou nesta página em 06/08).
 *
 * Em 07/08/2026 entrou a <Planos>, e ela FECHA A LACUNA que este bloco reservava por
 * escrito desde 06/08 ("não tem CTA no fim (…) preencher esse bloco é decisão de quem
 * escreve a oferta, e a regra desta LP é perguntar antes de encher espaço vazio").
 * Perguntado e respondido: três planos, o Profissional em destaque, e um botão por
 * cartão.
 *
 * ⚠️ A ENTRADA DELA MUDOU UM NÚMERO NA SEÇÃO ANTERIOR, e isso não é efeito colateral,
 * é a página deixando de se contradizer. O card da maisa no <Duelo> mostrava o plano
 * MAIS BARATO. Com os três na tela e o do meio em destaque, aquele preço virava isca: o
 * leitor comparava com um número e encontrava outro dois blocos abaixo. O card passou a
 * mostrar o do plano destacado, e a diferença anual acompanha.
 *
 * ⚠️ EM 21/09/2026 OS PREÇOS SAÍRAM DAQUI E DO `dados.ts`. O produto tinha seis preços
 * no ar (97 / 147 / 197 deste lado, 79 / 197 / 349 na LP de terapeutas) porque cada
 * mundo tinha a sua tabela digitada à mão. Agora a tabela é `_lib/planos.ts`, única para
 * os dois, e a <Duelo> e a <Planos> a LEEM em vez de repetir — inclusive o card do
 * salário. A LP estática de terapeutas não consegue importar módulo TS, então ela
 * redigita os mesmos valores e o `planos.test.ts` reprova se divergirem.
 *
 * A seção também deixou de ser lista de bullets: cada cartão mostra as mesmas linhas
 * (profissionais, agendamentos com IA, excedente, lembrete, suporte) com o valor à
 * direita. O que separa os planos é CAPACIDADE, e capacidade não cabe em bullet.
 *
 * ⚠️ OS BOTÕES NÃO VÃO PARA UM LINK DE PAGAMENTO, E ISSO É DECISÃO. Desde 21/09/2026,
 * Essencial e Profissional abrem `/assinar/<plano>` — o pré-cadastro, onde a conta e o
 * negócio nascem antes do checkout — e o Escala vai para o WhatsApp, por ser sob proposta.
 * O motivo foi medido na conta live: 21 clientes (três com o mesmo e-mail, criados em
 * segundos) e 14 assinaturas sem `metadata`, nenhuma atribuível a inquilino. Era o link
 * antigo de terapeutas sendo clicado de novo. Link de pagamento cobra sem saber de quem é.
 *
 * ⚠️ A DUREZA DO PASSO DA <Telas> SUBIU EM 08/08/2026, e é o segundo pedido da mesma
 * conversa: "quando eu scrollo um pouquinho mais rápido acabo passando sem perceber a
 * animação". A pista passou de 3 para 5 alturas de aparelho — a virada saiu de 363px
 * de rolagem para 726px, contra um gesto de trackpad que percorre 800–1.500px. O
 * número mora no `.lp3-t-pilha`, junto com a tabela do antes e depois; a <Sincronia>
 * deriva o percurso do rect e não precisa saber de nada.
 *
 * ⚠️ EM 10/08/2026 TODA SEÇÃO PASSOU A TER UM PEDIDO, e a página deixou de vazar.
 * Até aqui havia UM alvo clicável fora da <Planos>: o vidro da dobra — e ele apontava
 * para `cfg.rotas.base`, ou seja `/barbeiros/comecar`, OUTRA LP. Numa one-pager isso é
 * fuga: o único botão da dobra tirava a pessoa da página antes do preço, e as duas
 * seções do meio (<Telas> e <Duelo>) não tinham nada para clicar. Três seções mudas
 * exatamente onde o leitor esquenta.
 *
 * Agora são quatro CTAs e um destino só (`HREF_PLANOS`, no dados.ts): a dobra foi
 * repontada para a <Planos> desta mesma página, e telas e duelo ganharam a <Chamada>.
 * A <Planos> ganhou o `id` que faltava — ela era alcançável só por rolagem, não havia
 * âncora nenhuma para onde apontar.
 *
 * ── OS RÓTULOS SÃO TRÊS, E DE PROPÓSITO. "Ativar minha agenda" na dobra, "Quero isso
 * no meu WhatsApp" nas telas, "Escolher meu plano" no duelo. Um mesmo "Ver planos"
 * carimbado três vezes vira moldura — o olho aprende a forma e para de ler. Cada um
 * fecha o argumento da seção em que está (ver `CTA_SECAO` no dados.ts).
 *
 * ── O BOTÃO NOVO NÃO É O VIDRO, e a diferença é hierarquia: o <GlassButton> continua
 * sendo o da dobra (o primário da página), e a <Chamada> é o convite de meio de
 * página. Ela nasceu de um botão de registry em Tailwind, que este repo não tem — o
 * porte e as quatro divergências estão no Chamada.tsx. A que mais importa: a bolha do
 * hover é proporcional ao botão e não os 220px fixos da origem, que NÃO cobririam
 * "Quero isso no meu WhatsApp". Está medido, não suposto — `node
 * .claude/prova-chamada.mjs` força o `:hover` por CDP e devolve a folga em pixels
 * (+25,7px no rótulo mais largo, contra −31px que os 220px fixos dariam).
 *
 * A rota já está liberada: o middleware libera por prefixo `/barbeiros`.
 * -------------------------------------------------------------------------- */

export const metadata: Metadata = {
  /* Message-match: quem clica num anúncio precisa reencontrar na página a frase
     que o trouxe. O title da v1 ("Um cliente sai, outro já chega") não dizia nem
     a marca nem o negócio — colado no WhatsApp, ninguém sabia do que se tratava. */
  title: "Todos esses foram marcados com a maisa · MAISA para barbearias",
  description: `A maisa responde, agenda e confirma sozinha, no WhatsApp que a barbearia já usa. A partir de ${OFERTA.precoDe}${OFERTA.precoPor}, ${OFERTA.fidelidade}.`,
  alternates: { canonical: "/barbeiros" },
  openGraph: {
    title: "Todos esses foram marcados com a maisa.",
    description: "A maisa responde, agenda e confirma sozinha, no WhatsApp que a barbearia já usa.",
    url: "/barbeiros",
    type: "website",
  },
};

export default function LpBarbeirosV3() {
  return (
    <World icp="barbeiros" className="lp-v3">
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
