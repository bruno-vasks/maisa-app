/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ADAPTADOR LÊ DO AMBIENTE. ⚠️ SÓ SERVIDOR — nada de `NEXT_PUBLIC_`.
 *
 * Duas variáveis e um mapa, pelo mesmo desenho de `saida/stripe/config.ts`. Vale a pena
 * ler o cabeçalho de lá: a decisão de NÃO pôr id de produto em variável de ambiente é a
 * mesma aqui, e o modo de falha também.
 *
 * ── ⚠️ O AMBIENTE VEM DA CHAVE, NÃO DA URL ──
 *
 * A AbacatePay tem UM endpoint (`api.abacatepay.com/v2`) para teste e produção. Quem
 * decide é o prefixo da chave: `dev_` simula, `prod_` cobra de verdade.
 *
 * Isso é pior do que parece, e é a razão de `ehProducao` existir logo abaixo. Na Stripe
 * uma chave de sandbox colada na produção falha alto — `No such price`, e o `sk_test_`
 * nem consegue ler o catálogo live. Aqui os dois mundos atendem no mesmo lugar, com o
 * mesmo formato de resposta: uma chave `dev_` em produção **funciona**, devolve 200,
 * mostra um QR Code de Pix bonito na tela, e não cobra ninguém. O produto parece vendido
 * e não entrou dinheiro. Ninguém descobre até o fechamento do mês.
 *
 * Por isso o prefixo é lido e exposto: o painel e o log dizem em que mundo estamos, em
 * vez de a gente descobrir pelo extrato.
 *
 * ── ⚠️ O SEGREDO DO WEBHOOK NÃO É UM HMAC SECRET ──
 *
 * `ABACATEPAY_WEBHOOK_SECRET` é o valor que NÓS escolhemos ao cadastrar o webhook no
 * painel deles, e a AbacatePay o devolve **na query string** de cada POST
 * (`?webhookSecret=…`). Ele é a única coisa que autentica a chamada. Ver o cabeçalho de
 * `entrada/abacatepay/eventos.ts` para o porquê de o HMAC não servir para isso.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ChaveDePlano } from "@/nucleo/dominio/assinatura";

/** A Vercel guarda o valor cru: colar com aspas ou espaço é comum, e quebra silencioso. */
const limpa = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");

/**
 * A chave de API. `dev_…` ou `prod_…`, e é ela que escolhe o ambiente.
 *
 * ⚠️ DÊ A ELA SÓ AS PERMISSÕES QUE ESTA INTEGRAÇÃO USA. O painel deles permite escopo por
 * recurso, e a lista completa está no `LEIA-ME.md` ao lado. A permissão que NÃO deve
 * entrar é `WITHDRAW:CREATE`: saque manda dinheiro para fora da conta, e nada neste
 * código saca. Uma chave que não saca é uma chave que não esvazia a conta se vazar.
 */
export const CHAVE = limpa(process.env.ABACATEPAY_API_KEY);

/**
 * O segredo que volta na query string do webhook. **Outro segredo**, escolhido por nós no
 * cadastro do endpoint — não é a chave de API e não é derivado dela.
 *
 * Use valor longo e aleatório (`openssl rand -hex 32`). Ele viaja na URL, e URL aparece em
 * log de acesso: um segredo curto ou adivinhável aqui é a porta do webhook aberta. Ver o
 * `LEIA-ME.md` de `entrada/abacatepay/`.
 */
export const SEGREDO_WEBHOOK = limpa(process.env.ABACATEPAY_WEBHOOK_SECRET);

/** Um endpoint só para os dois mundos. Quem separa é a chave. */
export const BASE = "https://api.abacatepay.com/v2";

export const estaConfigurado = Boolean(CHAVE);

/**
 * Em que mundo esta chave cobra.
 *
 * Existe porque o mesmo endpoint atende teste e produção: sem olhar o prefixo, não há
 * como o log dizer em que mundo o pagamento aconteceu. É a diferença entre "o cliente
 * pagou" e "o cliente clicou num QR Code de mentira".
 *
 * ── ⚠️ O PREFIXO REAL É `abc_dev_`, NÃO `dev_` (medido em 21/09/2026) ──
 *
 * A documentação deles diz "começa com `dev_`" e "começa com `prod_`". A chave de verdade,
 * copiada do painel, começa com **`abc_dev_`**. Este código já nasceu com
 * `startsWith("prod_")` por acreditar na documentação, e o efeito seria exatamente o
 * contrário do pretendido: uma chave `abc_prod_` nunca casaria, o aviso de "dev mode"
 * apareceria em produção, e a frase "os pagamentos são SIMULADOS" estaria impressa no log
 * de um dia de vendas reais.
 *
 * Daí a busca ser por segmento (`_dev_`/`_prod_`, com ou sem prefixo) e daí existir um
 * terceiro estado. Formato que não casa com nenhum dos dois não vira "produção" nem
 * "teste" por default — vira `"desconhecido"`, e `composicao.ts` grita. Adivinhar aqui é
 * como esta linha errou da primeira vez.
 */
export type Mundo = "producao" | "teste" | "desconhecido";

export const mundo: Mundo =
  /(^|_)prod_/.test(CHAVE) ? "producao"
  : /(^|_)dev_/.test(CHAVE) ? "teste"
  : "desconhecido";

/** Atalho para o caminho que importa: só `producao` cobra dinheiro de verdade. */
export const ehProducao = mundo === "producao";

export function faltando(): string[] {
  return CHAVE ? [] : ["ABACATEPAY_API_KEY"];
}

export function faltandoWebhook(): string[] {
  const faltam = faltando();
  if (!SEGREDO_WEBHOOK) faltam.push("ABACATEPAY_WEBHOOK_SECRET");
  return faltam;
}

/**
 * Plano → `externalId` do produto no catálogo da AbacatePay.
 *
 * ── POR QUE `externalId` E NÃO O `prod_…` ──
 *
 * É a mesma decisão que a `lookup_key` da Stripe resolve, pelo mesmo motivo escrito lá:
 * `prod_…` é um valor opaco que precisaria ser digitado à mão em três ambientes (local,
 * preview, produção), não quebra build quando está errado, e tem um modo de falha
 * silencioso — `prod_…` de um produto ANTIGO da mesma conta responde 200 e cobra o preço
 * velho, com o cartão na mão do cliente.
 *
 * `externalId` é um nome que NÓS escolhemos. A AbacatePay o trata como "identificador
 * único do produto no seu sistema", e `GET /products/list` devolve o campo — então dá
 * para resolver `externalId → prod_…` em runtime, exatamente como `idDoPreco` faz na
 * Stripe, com cache de processo. A mesma linha de código acha o produto de teste com a
 * chave `dev_` e o de produção com a `prod_`.
 *
 * ⚠️ ESTES TRÊS PRODUTOS TÊM QUE EXISTIR NA CONTA, com `cycle: "MONTHLY"` e o preço em
 * centavos batendo com `_lib/planos.ts`. Quem cria é `npm run abacate:catalogo`; o que
 * cobra que os preços batam é `planos.test.ts`.
 */
export const CATALOGO: Record<ChaveDePlano, string> = {
  essencial: "maisa-essencial-mensal",
  profissional: "maisa-profissional-mensal",
  escala: "maisa-escala-mensal",
};

/**
 * ★ Plano → `externalId` do produto AVULSO — um mês, sem `cycle` (29/09/2026).
 *
 * O catálogo de cima é o da ASSINATURA recorrente, e produto com `cycle` não serve para
 * checkout avulso: pedido com ele e `methods: ["PIX"]` volta `PIX Automático is not available
 * for this store`, porque a API entende que é recorrência. Medido em produção em 29/09/2026.
 * Daí um segundo catálogo, com os mesmos preços e sem ciclo.
 *
 * Os preços em centavos batem com `_lib/planos.ts`, pelo mesmo `npm run abacate:catalogo` que
 * cria os de cima.
 */
export const CATALOGO_AVULSO: Record<ChaveDePlano, string> = {
  essencial: "maisa-essencial-avulso",
  profissional: "maisa-profissional-avulso",
  escala: "maisa-escala-avulso",
};

/**
 * ★ Como a AbacatePay cobra: `avulsa` (um Pix por mês) ou `assinatura` (recorrente).
 *
 * ── POR QUE O PADRÃO É `avulsa` ──
 *
 * Porque é o único que funciona hoje. A loja foi aprovada para produção em 29/09/2026, mas
 * Pix Automático e cartão recorrente seguem bloqueados — a sonda (`npm run abacate:catalogo --
 * --sondar`) recusa os dois. O Pix avulso cobra: a primeira transação real da loja passou
 * nesse dia.
 *
 * No dia em que a recorrência abrir, `ABACATEPAY_COBRANCA=assinatura` troca sem mexer no
 * código. ⚠️ E ALGUÉM TEM DE DECIDIR O QUE FAZER COM QUEM JÁ PAGOU AVULSO: a linha dessa
 * pessoa segue pré-paga até o fim do mês comprado, e a troca não a migra sozinha.
 */
export type ModoDeCobranca = "avulsa" | "assinatura";

export const MODO: ModoDeCobranca =
  limpa(process.env.ABACATEPAY_COBRANCA).toLowerCase() === "assinatura" ? "assinatura" : "avulsa";

/**
 * Os métodos que o checkout de assinatura oferece.
 *
 * ── ★ ISTO FOI MEDIDO CONTRA A CONTA REAL EM 21/09/2026, E A MEDIÇÃO DERRUBOU A
 *      SUPOSIÇÃO QUE ESTAVA ESCRITA AQUI ──
 *
 * A versão anterior mandava `["PIX", "CARD"]` com a justificativa de que "se o Pix
 * recorrente não estiver ligado, sobra o cartão e a venda acontece". **É falso.** A API
 * não escolhe o que dá: ela recusa o pedido inteiro se QUALQUER método da lista não
 * estiver habilitado na loja. Medido na loja `store_rcqED0KYAxkmcp4Aqn4cH6Wf`:
 *
 *   methods: ["PIX","CARD"] → 200 + error "PIX Automático is not available for this store"
 *   methods: ["PIX"]        → 200 + error "PIX Automático is not available for this store"
 *   methods: ["CARD"]       → 200 + error "CARD is not available for this store"
 *
 * Ou seja: mandar os dois não é a opção segura, é a opção que falha por dois motivos em
 * vez de um. Cada método pedido é uma exigência, não uma preferência.
 *
 * (Para constar, no mesmo dia e na mesma loja, **Pix AVULSO funciona** — `transparents/
 * create` devolveu `brCode`, e um checkout de produto sem `cycle` abriu normalmente. O que
 * está bloqueado é a RECORRÊNCIA, nos dois trilhos.)
 *
 * ── POR QUE VIROU VARIÁVEL DE AMBIENTE ──
 *
 * Porque a resposta certa muda no dia em que o suporte deles ligar o recurso, e esse dia
 * não deve exigir deploy. Ligou Pix Automático? `ABACATEPAY_METODOS=PIX`. Ligou cartão
 * também e quer os dois na tela? `ABACATEPAY_METODOS=PIX,CARD` — mas só depois de os DOIS
 * estarem habilitados, porque a lista é conjunção.
 *
 * O padrão é `PIX` sozinho: é o alvo do projeto (a razão de a AbacatePay existir aqui é a
 * taxa de Pix), e é o que menos surpreende quando o recurso for ligado.
 */
const METODOS_VALIDOS = new Set(["PIX", "CARD"]);

export const METODOS: readonly string[] = (() => {
  const bruto = limpa(process.env.ABACATEPAY_METODOS);
  if (!bruto) return ["PIX"];

  const pedidos = bruto.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
  /* Valor torto no ambiente não vira lista vazia nem atravessa: lista vazia a API recusa,
   * e um "pix " com espaço viraria um método que não existe. Cair no padrão é o
   * comportamento previsível — e `faltando()` não reclama disto de propósito, porque a
   * variável é opcional por desenho. */
  const bons = pedidos.filter((m) => METODOS_VALIDOS.has(m));
  return bons.length > 0 ? bons : ["PIX"];
})();
