#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * CONFERE O CAMINHO DO E-MAIL — DNS da Resend + estado do Supabase.
 *
 *   npm run email:conferir                        → só leitura
 *   npm run email:conferir -- --enviar voce@x.com  → ⚠️ MANDA UM E-MAIL DE VERDADE
 *
 * O modo padrão **não escreve em nada**: não toca em DNS, não toca no Supabase, não manda
 * e-mail. Mesma disciplina do `abacate:catalogo`, onde escrever é opt-in explícito.
 *
 * ── POR QUE O `--enviar` EXISTE ──
 *
 * Porque o Supabase engole a recusa da Resend. Quando o SMTP falha, ele devolve
 * `500 "Error sending recovery email"` e mais nada — a causa real (chave errada? domínio
 * não verificado? remetente recusado?) fica do outro lado de um log que pede PAT.
 *
 * Este modo fala SMTP na mão com a `smtp.resend.com` e **imprime cada linha do servidor**.
 * Aí a resposta deixa de ser um 500 e vira, por exemplo, `535 Authentication failed` ou
 * `403 domain is not verified` — que já diz qual campo do painel consertar.
 *
 * ── POR QUE ISTO EXISTE ──
 *
 * Porque o e-mail é o degrau mais silencioso do funil. `mailer_autoconfirm` é `false`,
 * então toda conta nova depende de uma mensagem chegar — e o `/assinar` nasce SEM SENHA,
 * de propósito, o que faz do e-mail a única volta para quem já pagou. Quando ele quebra,
 * ninguém vê um erro: as pessoas só não aparecem.
 *
 * Mesma ideia do `abacate:catalogo`: a pergunta "a conta está do jeito que o código
 * espera?" não tem endpoint que responda. Tem que ir lá e olhar cada peça.
 *
 * ── ⚠️ O RESOLVEDOR É O DO GOOGLE E DA CLOUDFLARE, NUNCA O DA MÁQUINA ──
 *
 * Em 21/09/2026 o resolvedor local desta máquina mostrou só o TXT ANTIGO enquanto o
 * 8.8.8.8 e o 1.1.1.1 já tinham o novo. Quem confiasse nele mandaria o Bruno esperar uma
 * propagação que já tinha acontecido. Cache de resolvedor mente, e mente com confiança.
 *
 * ── O QUE ELE NÃO CONSEGUE VER ──
 *
 * Se o SMTP próprio está LIGADO no Supabase, e qual é o `Site URL`. As duas coisas moram
 * na Management API, que pede um PAT que não temos. O script diz isso em vez de fingir.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resolver } from "node:dns/promises";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOMINIO = "maisasecretary.com.br";

/* ── env, lida do `.env.local` como os outros scripts da pasta ─────────────────── */

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
const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_ANON = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const RESEND_KEY = (env.RESEND_API_KEY ?? "").trim();

const resolvedor = new Resolver();
resolvedor.setServers(["8.8.8.8", "1.1.1.1"]);

let faltou = false;
const ok = (t) => console.log(`  \x1b[32m✓\x1b[0m ${t}`);
const nao = (t) => { faltou = true; console.log(`  \x1b[31m✗\x1b[0m ${t}`); };
const nota = (t) => console.log(`  \x1b[90m·\x1b[0m ${t}`);
const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const txt = async (nome) => {
  try { return (await resolvedor.resolveTxt(nome)).map((p) => p.join("")); }
  catch { return []; }
};
const mx = async (nome) => {
  try { return await resolvedor.resolveMx(nome); }
  catch { return []; }
};

/* ── 1. o conjunto que a Resend pede ───────────────────────────────────────────
 *
 * A Resend roda sobre Amazon SES. Ela cria `send.<dominio>` como caminho de retorno
 * (MAIL FROM) e o DKIM em `resend._domainkey.<dominio>`.
 *
 * ⚠️ É JUSTAMENTE POR USAR O SUBDOMÍNIO que dá para enviar sem tocar no SPF da raiz — que
 * aqui aponta para a Hostinger e é o que faz o e-mail que o Bruno já usa funcionar.
 * Apagar aquele include para "arrumar o SPF" derruba o e-mail dele. */

titulo("DNS — o que a Resend pede (via 8.8.8.8 / 1.1.1.1)");

/* ⚠️ A RESEND TROCOU DE ESQUEMA (anotado no cofre em 22/09/2026, corrigido aqui em
 * 21/10/2026): o caminho de retorno deixou de ser SPF + MX da Amazon SES direto em `send.`
 * e passou a ser CNAME para `*.forge.rmta.net`, em `send.` e em `rsend.`. Até esta data o
 * script só conhecia o esquema velho e acusava "sem SPF" e "sem MX" com o DNS certo, porque
 * o resolvedor segue o CNAME e devolve o SPF do destino, que não cita `amazonses`. */
const cname = async (nome) => {
  try { return await resolvedor.resolveCname(nome); }
  catch { return []; }
};

for (const sub of ["send", "rsend"]) {
  const nome = `${sub}.${DOMINIO}`;
  const alvo = await cname(nome);
  if (alvo.length) {
    alvo.some((a) => a.endsWith("rmta.net"))
      ? ok(`${nome} CNAME → ${alvo[0]} (esquema novo da Resend)`)
      : nao(`${nome} CNAME para ${alvo[0]}, que não é da Resend`);
    continue;
  }
  if (sub === "rsend") { nao(`${nome} sem CNAME da Resend`); continue; }
  /* Esquema velho: ainda vale se a conta da Resend for anterior à troca. */
  (await txt(nome)).some((v) => v.includes("amazonses.com"))
    ? ok(`${nome} SPF → amazonses (esquema velho)`)
    : nao(`${nome} sem CNAME da Resend e sem SPF da Amazon SES`);
  (await mx(nome)).some((r) => r.exchange.includes("feedback-smtp"))
    ? ok(`${nome} MX de feedback (esquema velho)`)
    : nao(`${nome} sem MX de feedback (bounces somem)`);
}

const dkim = await txt(`resend._domainkey.${DOMINIO}`);
dkim.some((v) => v.includes("p="))
  ? ok("DKIM presente em resend._domainkey")
  : nao("DKIM ausente — sem ele o DMARC não alinha e a entrega despenca");

const dmarc = await txt(`_dmarc.${DOMINIO}`);
dmarc.length ? ok(`DMARC: ${dmarc[0]}`) : nota("DMARC ausente (não impede envio; melhora reputação)");

titulo("DNS — o que NÃO pode ter sido tocado");

const spfRaiz = await txt(DOMINIO);
spfRaiz.some((v) => v.includes("_spf.mail.hostinger.com"))
  ? ok("SPF da raiz ainda inclui a Hostinger")
  : nao("⚠️ O SPF DA RAIZ PERDEU A HOSTINGER — o e-mail que o Bruno já usa quebra");

const mxRaiz = await mx(DOMINIO);
mxRaiz.some((r) => r.exchange.includes("hostinger"))
  ? ok(`MX da raiz ainda na Hostinger (${mxRaiz.length} registros)`)
  : nao("⚠️ O MX DA RAIZ SAIU DA HOSTINGER — ele para de RECEBER e-mail");

/* ── 2. o Supabase, pelo que a API pública conta ───────────────────────────────── */

titulo("Supabase");

if (!SUPABASE_URL || !SUPABASE_ANON) {
  nao("faltam NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY — não dá para perguntar nada");
} else {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON } });
    const j = await r.json();
    j.external?.email ? ok("provedor de e-mail ligado") : nao("provedor de e-mail DESLIGADO");
    j.disable_signup === false ? ok("cadastro aberto") : nao("cadastro fechado (disable_signup)");
    j.mailer_autoconfirm === false
      ? nota("mailer_autoconfirm: false — toda conta nova DEPENDE do e-mail chegar")
      : nota("mailer_autoconfirm: true — contas entram sem confirmar");
  } catch (e) {
    nao(`não consegui ler /auth/v1/settings: ${e.message}`);
  }
}

nota("SMTP próprio e Site URL não aparecem nesta API — só no painel (Management API pede PAT)");

/* ── 3. a Resend, se houver chave ──────────────────────────────────────────────── */

titulo("Resend");

if (!RESEND_KEY) {
  nota("sem RESEND_API_KEY no ambiente — pulando. (A chave do SMTP mora no painel do");
  nota("Supabase, não aqui; põe uma no .env.local só se quiser esta checagem.)");
} else {
  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (!r.ok) {
      nao(`a Resend respondeu ${r.status} — chave inválida ou sem permissão`);
    } else {
      const { data = [] } = await r.json();
      const nosso = data.find((d) => d.name === DOMINIO);
      if (!nosso) nao(`${DOMINIO} não está cadastrado nesta conta da Resend`);
      else if (nosso.status === "verified") ok(`${DOMINIO} verificado (região ${nosso.region})`);
      else nao(`${DOMINIO} está "${nosso.status}" — o DNS está no lugar, falta clicar em verificar`);
    }
  } catch (e) {
    nao(`não consegui falar com a Resend: ${e.message}`);
  }
}

titulo(faltou ? "Tem coisa faltando acima." : "Tudo que dá para medir daqui está de pé.");
console.log(
  "\nO que este script NÃO prova: que o e-mail CHEGA. Isso é um cadastro de verdade,\n" +
  "com o link aberto em OUTRO aparelho — o teste que o template antigo reprova.\n" +
  "Passo a passo: 02 Integrações/(C) E-mail transacional — Resend + Supabase.md\n",
);

/* ── modo --enviar: a conversa SMTP crua ───────────────────────────────────────
 *
 * ⚠️ ÚNICO CAMINHO DESTE SCRIPT QUE PRODUZ EFEITO NO MUNDO. Manda um e-mail de verdade,
 * pela conta de verdade, e gasta uma mensagem da cota.
 *
 * Sem biblioteca: a conversa é curta e o valor está em VER o diálogo. Um cliente SMTP
 * pronto engoliria exatamente as linhas que a gente veio ler. */

const iEnviar = process.argv.indexOf("--enviar");
if (iEnviar !== -1) {
  const destino = process.argv[iEnviar + 1];
  const iDe = process.argv.indexOf("--de");
  const remetente = iDe !== -1 ? process.argv[iDe + 1] : `nao-responda@${DOMINIO}`;

  if (!destino || destino.startsWith("--")) {
    console.error("\n✗ uso: npm run email:conferir -- --enviar voce@exemplo.com [--de outro@dominio]");
    process.exit(1);
  }
  if (!RESEND_KEY) {
    console.error("\n✗ falta RESEND_API_KEY no .env.local — é a senha do SMTP.");
    process.exit(1);
  }

  const { connect } = await import("node:tls");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

  titulo(`SMTP — conversa crua com smtp.resend.com (de ${remetente} para ${destino})`);

  const socket = connect({ host: "smtp.resend.com", port: 465, servername: "smtp.resend.com" });
  socket.setEncoding("utf8");

  let buffer = "";

  /* ⚠️ UM ÚNICO ouvinte de erro, guardado aqui. A versão anterior registrava um
   * `socket.once("error")` DENTRO de `resposta()` e nunca o removia — com uma conversa de
   * dez trocas, o Node avisava "possible EventEmitter memory leak". Era só ruído num
   * script curto, mas ruído num diagnóstico é pior que em outro lugar: quem está lendo a
   * saída para entender uma falha não sabe se o aviso faz parte dela. */
  let quebrou = null;
  const aguardando = [];
  socket.once("error", (e) => { quebrou = e; aguardando.splice(0).forEach((f) => f(e)); });

  /** Espera a última linha da resposta: código + ESPAÇO (com hífen, ainda vem mais). */
  const resposta = () => new Promise((ok, falha) => {
    if (quebrou) return falha(quebrou);
    const tentar = () => {
      const linhas = buffer.split("\r\n").filter(Boolean);
      const ultima = linhas[linhas.length - 1];
      if (ultima && /^\d{3} /.test(ultima)) {
        const texto = buffer; buffer = "";
        socket.off("data", aoDado);
        ok({ codigo: Number(texto.slice(0, 3)), texto: texto.trim() });
      }
    };
    const aoDado = (p) => { buffer += p; tentar(); };
    socket.on("data", aoDado);
    aguardando.push(falha);
    tentar();
  });

  /** `esconder` existe para a chave não sair no terminal nem num print de tela. */
  const dizer = async (linha, esconder = false) => {
    console.log(`  \x1b[36m→\x1b[0m ${esconder ? "<escondido>" : linha}`);
    socket.write(linha + "\r\n");
    const r = await resposta();
    const cor = r.codigo < 400 ? "32" : "31";
    console.log(`  \x1b[${cor}m←\x1b[0m ${r.texto.split("\r\n").join("\n    ")}`);
    return r;
  };

  try {
    await new Promise((ok, falha) => { socket.once("secureConnect", ok); aguardando.push(falha); });
    const saudacao = await resposta();
    console.log(`  \x1b[32m←\x1b[0m ${saudacao.texto}`);

    await dizer("EHLO maisa.local");
    const auth = await dizer("AUTH LOGIN");
    if (auth.codigo === 334) {
      await dizer(b64("resend"), true);
      const senha = await dizer(b64(RESEND_KEY), true);
      if (senha.codigo !== 235) {
        nao("autenticação recusada — a senha do SMTP é a chave `re_...` da Resend, e o usuário é a palavra `resend`");
      }
    }

    const de = await dizer(`MAIL FROM:<${remetente}>`);
    if (de.codigo >= 400) nao(`remetente recusado — o domínio de ${remetente} precisa estar verificado NA CONTA da Resend`);

    const para = await dizer(`RCPT TO:<${destino}>`);
    if (para.codigo >= 400) nao("destinatário recusado — com domínio não verificado, a Resend só aceita o e-mail do dono da conta");

    if (de.codigo < 400 && para.codigo < 400) {
      await dizer("DATA");
      socket.write(
        `From: maisa <${remetente}>\r\n` +
        `To: <${destino}>\r\n` +
        `Subject: teste de SMTP da maisa\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        `Se isto chegou, a Resend esta enviando. O que falta e o painel do Supabase.\r\n.\r\n`,
      );
      const fim = await resposta();
      console.log(`  \x1b[32m←\x1b[0m ${fim.texto}`);
      fim.codigo < 400 ? ok("aceito para entrega — confere a caixa (e o spam)") : nao("recusado no DATA");
    }

    await dizer("QUIT");
  } catch (e) {
    nao(`a conversa SMTP quebrou: ${e.message}`);
  } finally {
    socket.end();
  }
}

process.exit(faltou ? 1 : 0);
