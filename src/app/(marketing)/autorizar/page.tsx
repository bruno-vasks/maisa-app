import type { Metadata } from "next";
import Link from "next/link";
import {
  AVISO_ASSINADOR,
  AVISO_CODIGO_DO_APP,
  LINK_PROCURACAO,
  LINK_PROCURACAO_SERVICO,
  PERMISSAO_CARNE_LEAO_NA_TELA,
  PROCURADOR_PADRAO,
  passosDaProcuracao,
} from "@/nucleo/dominio/checklist-recibo";

/* ─────────────────────────────────────────────────────────────────────────────
 * AUTORIZAR A MAISA — o tutorial da outorga, fora do login.
 *
 * ★ POR QUE ELE É UMA PÁGINA PÚBLICA, E NÃO UM ACORDEÃO NO PAINEL.
 *
 * Porque a cliente faz isto **no site da Receita**, não dentro da MAISA. Os mesmos passos já
 * existiam no cartão do Faturamento — ou seja, exatamente no lugar onde ela NÃO está no momento
 * em que precisa deles. Um link que se manda no WhatsApp funciona; instrução atrás de senha, não.
 *
 * O formato veio do tutorial da Rebots (lido em 25/08/2026), que é público, tem URL própria e
 * capturas de tela. O conteúdo é nosso e está mais correto que o deles em três pontos — ver
 * `passosDaProcuracao`.
 *
 * ── ⚠️ UMA FONTE, DOIS LUGARES ──
 *
 * Os passos vêm de `passosDaProcuracao()`, o mesmo do painel. Reescrevê-los aqui daria duas
 * listas divergindo para o mesmo ato — e a que ficasse para trás mandaria alguém procurar um
 * botão com nome antigo. É o defeito que esta página existe para não ter.
 *
 * ── ★ O QUE ESTA PÁGINA DIZ E A TELA DO e-CAC NÃO ──
 *
 * Que depois de assinar a autorização nasce **"Em Análise"** e só passa a valer quando NÓS
 * aceitamos. Pior: o e-CAC responde "pendente de aprovação por unidade de atendimento da
 * Secretaria da Receita Federal do Brasil" — uma frase que faz qualquer pessoa concluir que
 * precisa ir a um posto da Receita. Não precisa. Sem este bloco, a cliente assina, lê aquilo e
 * desiste achando que fez errado.
 *
 * ⚠️ Rota nova exige entrada em `PUBLIC_PREFIXES` (`saida/supabase/sessao.ts`). Já está lá, e
 * há teste — a checagem é por segmento e `/autorizar` não herda de nada.
 * ────────────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Autorizar a MAISA a emitir seus recibos · maisa",
  description:
    "Como dar à MAISA permissão para emitir seus recibos do Receita Saúde. Leva 2 minutos, "
    + "é no site da Receita, e vale só para o Carnê-Leão — mais nada.",
};

/** 00.000.000/0000-00, do jeito que ela vai conferir na tela. */
const cnpj = PROCURADOR_PADRAO.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

const PASSOS = passosDaProcuracao(PROCURADOR_PADRAO);

/**
 * O que a permissão 00204 alcança, e o que não alcança.
 *
 * ★ ESTE BLOCO É O QUE FAZ ALGUÉM ASSINAR. Entregar procuração no site da Receita para uma
 * empresa é um ato que assusta — e deve assustar. A resposta honesta não é "confia", é a lista
 * do que cabe e do que não cabe. O "não" é mais longo que o "sim" de propósito: é o "não" que
 * responde o medo real.
 */
const ALCANCE = {
  sim: [
    "Emitir os seus recibos de serviços de saúde",
    "Consultar e cancelar recibos que já saíram",
    "Corrigir a sua Ocupação no Carnê-Leão, se estiver faltando",
  ],
  nao: [
    "Ver ou entregar a sua declaração de Imposto de Renda",
    "Consultar dívidas, parcelamentos ou pendências suas",
    "Emitir guias ou fazer qualquer pagamento no seu nome",
    "Mexer em qualquer serviço do e-CAC além do Carnê-Leão",
  ],
};

export default function Autorizar() {
  return (
    <main className="lp-tuto">
      <div className="lp-tuto-topo">
        <Link href="/" className="lp-tuto-marca">maisa</Link>
        <a className="lp-tuto-voltar" href={LINK_PROCURACAO} target="_blank" rel="noopener noreferrer">
          Abrir o site da Receita
        </a>
      </div>

      <header className="lp-tuto-cabecalho">
        <p className="lp-tuto-sobrancelha">Recibos do Receita Saúde</p>
        <h1>Autorizar a MAISA a emitir seus recibos</h1>
        <p className="lp-tuto-resumo">
          Em uma frase: você dá à MAISA permissão para emitir <strong>só os seus recibos de
          saúde</strong> — e mais nada. Leva dois minutos, é no site da Receita, e quem faz é
          você: a Receita exige que a autorização venha do próprio profissional.
        </p>

        <div className="lp-tuto-requisitos">
          <span><strong>Você vai precisar de:</strong></span>
          <span>conta gov.br nível prata ou ouro</span>
          <span>o aplicativo gov.br no celular, já entrando na sua conta</span>
          <span>dois minutos</span>
        </div>
      </header>

      <section className="lp-tuto-secao">
        <h2>O que você está autorizando</h2>
        <p>
          A permissão se chama <code>{PERMISSAO_CARNE_LEAO_NA_TELA}</code> e é uma só, dentre
          dezenas que a tela oferece. Ela abre exatamente isto:
        </p>

        <div className="lp-tuto-alcance">
          <div className="lp-tuto-pode">
            <h3>A MAISA vai poder</h3>
            <ul>
              {ALCANCE.sim.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="lp-tuto-nao-pode">
            <h3>A MAISA não vai poder</h3>
            <ul>
              {ALCANCE.nao.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>

        {/* ★ O AVISO MAIS IMPORTANTE DA PÁGINA, e por isso ele vem ANTES dos passos e não
            enterrado no passo 8. "Todos" é um atalho na mesma tela, a um clique de distância do
            certo — e entrega poder sobre declaração, dívida, parcelamento e pagamento por até
            cinco anos. A gente precisa de um serviço; pedir o resto seria guardar um risco que
            não nos serve para nada. */}
        <div className="lp-tuto-alerta">
          <strong>Nunca marque a opção “Todos”.</strong> Ela aparece logo acima da lista e é o
          erro mais comum. Marcar “Todos” entregaria à MAISA poder sobre a sua declaração, suas
          dívidas e seus pagamentos — por até cinco anos. A gente não precisa disso, e não quer.
        </div>
      </section>

      <section className="lp-tuto-secao">
        <h2>O passo a passo</h2>
        <p>
          Faça no site da Receita, com esta página aberta ao lado. Os nomes entre aspas são os
          botões como eles aparecem na tela.
        </p>

        <a
          className="lp-tuto-botao"
          href={LINK_PROCURACAO}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir Minhas Autorizações de Acesso
        </a>

        <ol className="lp-tuto-passos">
          {PASSOS.map((passo) => <li key={passo}>{passo}</li>)}
        </ol>

        {/* Alerta e não ressalva: vale para quase todo mundo, e é no último passo. Quem chega
            ao "Assinar" sem o app no celular desiste ali — ver `AVISO_CODIGO_DO_APP`. */}
        <div className="lp-tuto-alerta lp-tuto-alerta-calmo">{AVISO_CODIGO_DO_APP}</div>

        {/* ⚠️ Ressalva, e não passo — ver `AVISO_ASSINADOR`. Conta gov.br assina sozinha; o
            Assinador Serpro só entra para quem usa certificado digital. Como passo 12, mandaria
            a maioria instalar um programa que não vai usar. */}
        <p className="lp-tuto-ressalva">{AVISO_ASSINADOR}</p>
      </section>

      {/* ── ★ O BLOCO QUE EVITA A DESISTÊNCIA ── */}
      <section className="lp-tuto-secao">
        <h2>Depois de assinar</h2>
        <p>
          A autorização nasce como <strong>“Em Análise”</strong>, e é normal. Ela só passa a
          valer quando <strong>a MAISA aceita do lado de cá</strong> — a gente faz isso e te
          avisa. Você não precisa fazer mais nada.
        </p>
        <div className="lp-tuto-alerta lp-tuto-alerta-calmo">
          <strong>Se aparecer “pendente de aprovação por unidade de atendimento da Secretaria da
          Receita Federal do Brasil”, ignore.</strong> Parece que você precisa ir a um posto da
          Receita. Não precisa. É a mensagem que o e-CAC mostra enquanto a autorização espera o
          nosso aceite.
        </div>
        <p>
          A partir daí, os seus recibos saem sozinhos. Você continua podendo ver, cancelar e
          revogar a autorização a qualquer momento, na mesma tela onde a criou.
        </p>
      </section>

      <section className="lp-tuto-secao">
        <h2>Se travar</h2>
        <ul className="lp-tuto-lista">
          <li>
            <strong>O link não abre, ou cai no login e não volta.</strong> Entre pela página
            pública do gov.br:{" "}
            <a href={LINK_PROCURACAO_SERVICO} target="_blank" rel="noopener noreferrer">
              Cadastrar procuração para acesso ao e-CAC
            </a>.
          </li>
          <li>
            <strong>Sua conta gov.br é bronze.</strong> Só prata ou ouro cadastra autorização.
            Dá para subir de nível pelo aplicativo gov.br, com o app do seu banco ou validação
            facial.
          </li>
          <li>
            <strong>O aplicativo gov.br diz “Biometria facial não encontrada”.</strong> Acontece
            com quem não tem foto na CNH, no título de eleitor nem na identidade nova — e repetir
            a foto não resolve. Reinstale o app e, no primeiro acesso, escolha{" "}
            <strong>“Login com seu banco”</strong> em vez de CPF e senha. A Receita não vê a sua
            senha, o seu saldo nem o seu extrato.
          </li>
          <li>
            <strong>A busca não encontra a permissão.</strong> Digite só <code>carne</code>, sem
            acento e sem o resto do nome.
          </li>
          <li>
            <strong>Assinou e não tem certeza se foi.</strong> A autorização aparece na lista de
            “Minhas Autorizações de Acesso”. Se ela está lá, deu certo — mesmo em “Em Análise”.
          </li>
        </ul>
      </section>

      <footer className="lp-tuto-rodape">
        <p>
          A autorização é dada ao CNPJ <strong>{cnpj}</strong>, a conta que emite pela MAISA.
        </p>
        <p>
          Ficou alguma dúvida? Chama a gente no WhatsApp — a gente acompanha o passo a passo com
          você.
        </p>
        <p className="lp-tuto-links">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </p>
      </footer>
    </main>
  );
}
