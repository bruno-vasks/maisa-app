#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * PROVISIONA A CONTA DA ABACATEPAY — os três produtos e o webhook.
 *
 *   node scripts/abacate-catalogo.mjs            → mostra o que falta, NÃO escreve
 *   node scripts/abacate-catalogo.mjs --aplicar  → cria o que falta
 *   node scripts/abacate-catalogo.mjs --sondar   → descobre o que a CONTA deixa cobrar
 *
 * ── POR QUE ISTO É UM SCRIPT E NÃO UM PASSO NO CÓDIGO DO APP ──
 *
 * Porque criar produto é operação de CATÁLOGO, e catálogo muda quando o preço muda — o
 * que acontece uma vez por semestre, não uma vez por request. Um `ensureProduct()` dentro
 * do `abrirCheckout` gastaria dois round-trips em cada clique em "assinar" para garantir
 * algo que já está garantido, e daria ao app em produção a permissão de ESCREVER no
 * catálogo. Chave que pode criar produto é chave que pode criar produto de R$ 0,01.
 *
 * ── ⚠️ O QUE ELE NÃO FAZ ──
 *
 * Não muda preço de produto que já existe. A AbacatePay não documenta `products/update`, e
 * a operação certa quando um preço muda é a mesma da Stripe: **criar produto novo com
 * `externalId` novo** e apontar o código para ele. Quem já assinou continua no valor que
 * contratou — que é o comportamento correto e, no Brasil, o exigido.
 *
 * Por isso, se um preço divergir, este script AVISA e não corrige. Corrigir em silêncio
 * mudaria o valor cobrado de quem já é cliente.
 *
 * ⚠️ ESCREVE NA CONTA A QUE A CHAVE PERTENCE. Com uma chave `prod_`, escreve na conta que
 * cobra dinheiro de verdade. O modo padrão é só leitura justamente por isso.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.abacatepay.com/v2";
const APLICAR = process.argv.includes("--aplicar");
const SONDAR = process.argv.includes("--sondar");

/* ── as env vars, lidas do `.env.local` como os outros scripts da pasta ────────── */

function ambiente() {
  const env = { ...process.env };
  try {
    for (const linha of readFileSync(join(RAIZ, ".env.local"), "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env.local é legítimo: o CI passa por variável de ambiente */ }
  return env;
}

const env = ambiente();
const CHAVE = (env.ABACATEPAY_API_KEY ?? "").trim();
const SEGREDO_WEBHOOK = (env.ABACATEPAY_WEBHOOK_SECRET ?? "").trim();
const URL_PUBLICA = (env.MAISA_PUBLIC_URL ?? "").trim();

if (!CHAVE) {
  console.error("✗ falta ABACATEPAY_API_KEY (no .env.local ou no ambiente).");
  process.exit(1);
}

/* ⚠️ O PREFIXO REAL É `abc_dev_`, NÃO `dev_` — medido em 21/09/2026 contra a chave do
 * painel. A documentação deles diz "começa com dev_/prod_" e está errada. Um
 * `startsWith("prod_")` (que é o que estava aqui) nunca casaria com uma chave de produção,
 * e este script imprimiria "dev mode — pagamentos simulados" antes de escrever na conta
 * que cobra de verdade. Busca por SEGMENTO, com três estados: o desconhecido não vira
 * nenhum dos dois. Mesma lógica de `saida/abacatepay/config.ts`. */
const MUNDO = /(^|_)prod_/.test(CHAVE) ? "producao"
  : /(^|_)dev_/.test(CHAVE) ? "teste"
  : "desconhecido";
const EH_PRODUCAO = MUNDO === "producao";

/* ── o catálogo: a MESMA verdade que o código usa ──────────────────────────────
 *
 * ⚠️ OS `externalId` SÃO LIDOS DE `config.ts` E OS PREÇOS DE `_lib/planos.ts`, por regex.
 * Redigitar qualquer um dos dois aqui criaria a terceira tabela de preço deste projeto —
 * e o cabeçalho de `_lib/planos.ts` conta o que aconteceu quando havia duas. Ler o
 * arquivo como texto é feio e é certo: um `.mjs` não importa `.ts`, e o `planos.test.ts`
 * já usa exatamente esta técnica. */

/* Os dois catálogos de `config.ts`: `CATALOGO` (assinatura, com `cycle`) e `CATALOGO_AVULSO`
 * (um mês do pré-pago, SEM `cycle` — produto com ciclo num checkout avulso a loja entende como
 * recorrência e recusa). Medido em 29/09/2026. */
function blocoDe(cfg, nome) {
  const bloco = cfg.match(new RegExp(`export const ${nome}\\b[^=]*=\\s*\\{([^}]+)\\}`))?.[1] ?? "";
  return Object.fromEntries([...bloco.matchAll(/(\w+)\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

function doCodigo() {
  const cfg = readFileSync(join(RAIZ, "src/adaptadores/saida/abacatepay/config.ts"), "utf8");
  const externos = blocoDe(cfg, "CATALOGO");
  const avulsos = blocoDe(cfg, "CATALOGO_AVULSO");

  const lp = readFileSync(join(RAIZ, "src/app/(marketing)/_lib/planos.ts"), "utf8");
  const precos = Object.fromEntries(
    [...lp.matchAll(/chave:\s*"(\w+)"[\s\S]{0,200}?preco:\s*"R\$\s*([\d.]+)"/g)]
      .map((m) => [m[1], Number(m[2].replace(/\./g, "")) * 100]),
  );

  const planos = Object.keys(externos);
  const faltamPreco = planos.filter((p) => !precos[p]);
  if (faltamPreco.length) {
    console.error(`✗ não achei o preço de ${faltamPreco.join(", ")} em _lib/planos.ts.`);
    console.error("  O regex depende do formato `chave: <x>` … `preco: \"R$ N\"` em _lib/planos.ts.");
    process.exit(1);
  }

  const nome = (chave) => `MAISA ${chave[0].toUpperCase()}${chave.slice(1)}`;
  return [
    ...planos.map((chave) => ({
      chave,
      externalId: externos[chave],
      /* Centavos. É o que a API espera, em todo endpoint. */
      price: precos[chave],
      name: nome(chave),
      currency: "BRL",
      cycle: "MONTHLY",
    })),
    ...Object.keys(avulsos).map((chave) => ({
      chave,
      externalId: avulsos[chave],
      price: precos[chave],
      name: `${nome(chave)} — 1 mês`,
      currency: "BRL",
      /* ⚠️ SEM ciclo: é o mês avulso do pré-pago. Ver o cabeçalho de `blocoDe`. */
      cycle: null,
    })),
  ];
}

/* ⚠️ POR `externalId`, E NÃO PELA LISTA. Medido em 29/09/2026: logo depois do `--aplicar`,
 * `/products/list` sem parâmetro devolveu lista VAZIA por minutos (cache deles) com os
 * produtos lá — e este script mandou "rode de novo com --aplicar", o que duplicaria o
 * catálogo inteiro. A busca por `externalId` acha na hora. */
async function produtoPorExterno(externalId) {
  try {
    return await api(`/products/get?externalId=${encodeURIComponent(externalId)}`);
  } catch (e) {
    if (/not found/i.test(String(e.message))) return null;
    throw e;
  }
}

/* ── o cliente HTTP, mínimo ─────────────────────────────────────────────────── */

async function api(caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await r.text();
  let env_;
  try { env_ = JSON.parse(texto); } catch {
    throw new Error(`${caminho}: HTTP ${r.status}, resposta não-JSON: ${texto.slice(0, 200)}`);
  }

  /* ⚠️ O ERRO VEM COM 200. Mesmo motivo detalhado em `saida/abacatepay/cliente.ts`. */
  if (!r.ok || env_.error) {
    throw new Error(`${caminho}: HTTP ${r.status} — ${env_.error ?? texto.slice(0, 200)}`);
  }
  return env_.data;
}

/* ── o trabalho ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`\nAbacatePay · conta da chave ${CHAVE.slice(0, 9)}…`);
  console.log(
    MUNDO === "producao" ? "⚠️  PRODUÇÃO — esta conta cobra dinheiro de verdade."
    : MUNDO === "teste" ? "   dev mode — pagamentos simulados."
    /* Não adivinha. Ver o ⚠️ do prefixo lá em cima — foi exatamente adivinhar que errou. */
    : "⚠️  MUNDO DESCONHECIDO — o prefixo da chave não é de teste nem de produção.");
  console.log(APLICAR ? "   modo: APLICAR (escreve)\n" : "   modo: conferir (não escreve)\n");

  /* Confirma que a chave fala com a conta antes de qualquer coisa. Erro aqui é 401/403, e
   * a diferença entre os dois importa: 403 é permissão faltando na chave. */
  const loja = await api("/stores/get");
  console.log(`loja: ${loja?.name ?? "(sem nome)"}\n`);

  /* ── 1. os produtos ── */
  const porExterno = new Map();
  for (const alvo of doCodigo()) {
    const achado = await produtoPorExterno(alvo.externalId);
    if (achado) porExterno.set(alvo.externalId, achado);
  }

  let criados = 0;
  let divergentes = 0;

  console.log("PRODUTOS");
  for (const alvo of doCodigo()) {
    const achado = porExterno.get(alvo.externalId);

    if (!achado) {
      if (APLICAR) {
        const novo = await api("/products/create", {
          externalId: alvo.externalId,
          name: alvo.name,
          price: alvo.price,
          currency: alvo.currency,
          ...(alvo.cycle ? { cycle: alvo.cycle } : {}),
        });
        porExterno.set(alvo.externalId, novo);
        console.log(`  + criado  ${alvo.externalId}  R$ ${(alvo.price / 100).toFixed(2)}  → ${novo.id}`);
        criados++;
      } else {
        console.log(`  · FALTA   ${alvo.externalId}  R$ ${(alvo.price / 100).toFixed(2)}`);
        criados++;
      }
      continue;
    }

    const problemas = [];
    if (achado.price !== alvo.price) {
      problemas.push(`preço lá é R$ ${(achado.price / 100).toFixed(2)}, código diz R$ ${(alvo.price / 100).toFixed(2)}`);
    }
    /* ⚠️ Produto sem ciclo não serve para assinatura, e o erro da API não diz isso. E o
     * contrário também: produto COM ciclo no catálogo avulso vira recorrência. */
    if (alvo.cycle && !achado.cycle) problemas.push("sem `cycle` — não serve para assinatura");
    if (!alvo.cycle && achado.cycle) problemas.push(`com \`cycle\` ${achado.cycle} — não serve para o avulso`);
    if ((achado.status ?? "ACTIVE") !== "ACTIVE") problemas.push(`status ${achado.status}`);

    if (problemas.length) {
      console.log(`  ! ${alvo.externalId}  ${problemas.join("; ")}`);
      divergentes++;
    } else {
      console.log(`  ✓ ${alvo.externalId}  R$ ${(achado.price / 100).toFixed(2)}  ${achado.id}`);
    }
  }

  /* ── 2. o webhook ── */
  console.log("\nWEBHOOK");
  const EVENTOS = [
    /* ★ O pré-pago: é por aqui que um Pix avulso pago soma um mês. `transparent.completed` é
     * o Pix desenhado na nossa tela, `/pagar` (30/09/2026); `checkout.completed`, o da página
     * hospedada deles (29/09/2026), segue aceito. */
    "transparent.completed",
    "checkout.completed",
    "subscription.completed",
    "subscription.renewed",
    "subscription.cancelled",
    "subscription.trial_started",
    "subscription.payment_failed",
    "subscription.plan_changed",
  ];

  if (!SEGREDO_WEBHOOK || !URL_PUBLICA) {
    console.log("  · pulado: falta "
      + [!SEGREDO_WEBHOOK && "ABACATEPAY_WEBHOOK_SECRET", !URL_PUBLICA && "MAISA_PUBLIC_URL"]
        .filter(Boolean).join(" e "));
  } else {
    /* ⚠️ O SEGREDO VAI NO CAMPO `secret`, E ELES O DEVOLVEM NA QUERY STRING de cada POST.
     * Não é um HMAC secret — ver `entrada/abacatepay/LEIA-ME.md`. */
    const alvo = `${URL_PUBLICA.replace(/\/$/, "")}/api/abacatepay/webhook`;
    /* ⚠️ A LISTA DELES É CACHEADA, e o cache ignora parâmetro que a API não conhece. Medido em
     * 29/09/2026: logo depois de um `webhooks/create`, `?limit=50` e `?limit=50&t=<agora>`
     * devolveram a lista VELHA, e `?limit=49` a nova. Um `limit` que muda a cada rodada é o que
     * impede este script de não ver o webhook que acabou de criar — e de criá-lo de novo. */
    const limite = 51 + Math.floor(Math.random() * 49);
    const nossos = ((await api(`/webhooks/list?limit=${limite}`).catch(() => [])) ?? [])
      .filter((w) => w.endpoint?.startsWith(alvo));

    /* Os eventos de TODOS os webhooks nossos somados: a API não tem `update`, então um evento
     * novo entra como um segundo webhook para a mesma URL, e não substituindo o primeiro. */
    const escutados = new Set(nossos.flatMap((w) => w.events ?? []));
    const faltam = EVENTOS.filter((e) => !escutados.has(e));

    for (const w of nossos) console.log(`  ✓ ${w.id} → ${(w.events ?? []).join(", ")}`);

    if (!faltam.length && nossos.length) {
      /* tudo escutado */
    } else if (APLICAR) {
      const novo = await api("/webhooks/create", {
        name: nossos.length ? "MAISA — eventos novos" : "MAISA — assinaturas",
        endpoint: alvo,
        secret: SEGREDO_WEBHOOK,
        events: faltam,
      });
      console.log(`  + criado  ${novo.id} → ${faltam.join(", ")}`);
      criados++;
    } else {
      console.log(nossos.length ? `  · FALTA escutar: ${faltam.join(", ")}` : `  · FALTA   ${alvo}`);
      criados++;
    }
  }

  /* ── 3. o que a CONTA deixa cobrar ──
   *
   * ⚠️ NÃO DÁ PARA PERGUNTAR ISSO: não existe endpoint que responda "esta loja tem Pix
   * Automático?". A única forma de saber é TENTAR criar o checkout e ler a recusa — foi
   * assim que se descobriu, em 21/09/2026, que a loja de sandbox não tinha nem Pix
   * recorrente nem cartão.
   *
   * Fica atrás de `--sondar` porque a sonda ESCREVE: cada tentativa que passa cria um
   * checkout de verdade (`bill_…`), que fica PENDING até expirar. Em dev isso é lixo
   * inofensivo; em produção é lixo no painel de quem vende. Rodar por padrão faria uma
   * conferência de catálogo sujar a conta toda vez.
   *
   * Existe para o dia em que a conta for verificada: uma linha de comando responde
   * "abriu?" sem ninguém ter de montar curl à mão de novo. */
  if (SONDAR) {
    console.log("\nCAPACIDADES (o que a conta deixa cobrar)");

    if (MUNDO === "producao") {
      console.log("  ⚠️ conta de PRODUÇÃO: cada método que PASSAR deixa um checkout");
      console.log("     pendente no painel. Apague-os depois.");
    }

    /* O produto do meio serve de cobaia: qualquer um com ciclo serve, e o Profissional é
     * o que a LP destaca. */
    const cobaia = porExterno.get("maisa-profissional-mensal");

    if (!cobaia) {
      console.log("  · pulado: o produto maisa-profissional-mensal ainda não existe.");
      console.log("    Rode com --aplicar primeiro.");
    } else {
      for (const metodos of [["PIX"], ["CARD"]]) {
        try {
          const r = await api("/subscriptions/create", {
            items: [{ id: cobaia.id, quantity: 1 }],
            methods: metodos,
            externalId: "sonda-de-capacidade",
            completionUrl: `${(URL_PUBLICA || "https://example.com").replace(/\/$/, "")}/sonda`,
            returnUrl: `${(URL_PUBLICA || "https://example.com").replace(/\/$/, "")}/sonda`,
          });
          console.log(`  ✓ ${metodos[0].padEnd(5)} recorrente LIBERADO  (checkout ${r.id})`);
        } catch (e) {
          /* A mensagem deles é específica e vale mostrar crua: "PIX Automático is not
           * available for this store" diz exatamente o que pedir. */
          const msg = String(e.message).split("—").pop().trim();
          console.log(`  ✗ ${metodos[0].padEnd(5)} recorrente bloqueado  (${msg})`);
        }
      }

      /* ★ E O PRÉ-PAGO: um checkout avulso só com Pix, do produto sem ciclo. O `externalId`
       * fixo faz a sonda reaproveitar o MESMO checkout a cada rodada — é chave de
       * idempotência deles (29/09/2026) —, então rodar de novo não suja o painel. */
      const avulso = porExterno.get("maisa-profissional-avulso");
      if (avulso) {
        try {
          const r = await api("/checkouts/create", {
            items: [{ id: avulso.id, quantity: 1 }],
            methods: ["PIX"],
            externalId: "sonda-de-capacidade-avulsa",
            completionUrl: `${(URL_PUBLICA || "https://example.com").replace(/\/$/, "")}/sonda`,
            returnUrl: `${(URL_PUBLICA || "https://example.com").replace(/\/$/, "")}/sonda`,
          });
          console.log(`  ✓ PIX   avulso LIBERADO      (checkout ${r.id}) — é o que o pré-pago usa`);
        } catch (e) {
          const msg = String(e.message).split("—").pop().trim();
          console.log(`  ✗ PIX   avulso bloqueado     (${msg}) — ⚠️ o pré-pago NÃO cobra`);
        }
      }

      console.log("");
      console.log("  ⚠️ `methods` é CONJUNÇÃO: se você quiser os dois na mesma tela, os DOIS");
      console.log("     têm de estar liberados. Um bloqueado derruba o checkout inteiro.");
      console.log("     Ajuste ABACATEPAY_METODOS para exatamente o que passou acima.");
    }
  }

  /* ── 4. o veredito ── */
  console.log("");
  if (divergentes) {
    console.log(`⚠️  ${divergentes} divergência(s). Este script NÃO corrige preço de produto que`);
    console.log("    já existe — mudar o valor cobraria diferente de quem já assinou. Crie um");
    console.log("    produto novo com `externalId` novo e aponte `CATALOGO` em config.ts.");
  }
  if (criados && !APLICAR) {
    console.log(`→ ${criados} item(ns) a criar. Rode de novo com --aplicar.`);
  }
  if (!criados && !divergentes) {
    console.log("✓ A conta está do jeito que o código espera.");
    if (!SONDAR) {
      console.log("  Para saber o que ela deixa COBRAR: `npm run abacate:catalogo -- --sondar`");
    }
    if (!EH_PRODUCAO) {
      console.log("\n  Próximo passo: `abacatepay -l listen --forward-to");
      console.log('  "http://localhost:3100/api/abacatepay/webhook?webhookSecret=$ABACATEPAY_WEBHOOK_SECRET"`');
      console.log("  ⚠️ sem o ?webhookSecret= no --forward-to, todo evento local volta 401.");
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  /* 403 é permissão faltando na chave, não chave errada — a distinção economiza a tarde de
   * quem for investigar. As permissões estão em `saida/abacatepay/LEIA-ME.md`. */
  if (String(e.message).includes("403")) {
    console.error("  403 = a chave é válida mas falta escopo. Veja as permissões no LEIA-ME");
    console.error("  de src/adaptadores/saida/abacatepay/.\n");
  }
  process.exit(1);
});
