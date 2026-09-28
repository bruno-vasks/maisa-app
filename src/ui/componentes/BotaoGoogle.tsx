"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * ENTRAR COM O GOOGLE — o botão, uma vez só.
 *
 * ── POR QUE ELE EXISTE (22/09/2026) ──
 *
 * Porque a tela de consentimento dizia **"para continuar em
 * gsurucxllwpxcldljgur.supabase.co"**. O Bruno desconfiou do endereço na primeira vez que
 * o viu, e estava certo: parece phishing e é a última tela antes de a pessoa entregar a
 * conta do Google dela.
 *
 * ⚠️ **ISSO NÃO SE CONSERTA COM VERIFICAÇÃO DE MARCA.** Eu disse que resolveria "80%"
 * disso; resolve **zero**. O que aquela frase mostra é o **domínio do `redirect_uri`** — e
 * no fluxo de redirect quem recebe o callback é o Supabase, num subdomínio de `supabase.co`
 * que nunca poderá ser comprovado como nosso. A marca verificada muda o logo e o nome no
 * resto da tela; aquela linha continua sendo o domínio de quem recebe.
 *
 * O `signInWithIdToken` conserta pela raiz: o Google Identity Services devolve o **ID
 * token** direto nesta página, e a autenticação se completa entre o navegador e o Google.
 * **Não existe callback para `supabase.co` neste caminho.** De quebra some um redirect de
 * página cheia no meio do funil — que é exatamente onde se perde gente.
 *
 * ── AS TRÊS ARMADILHAS, E O QUE CADA UMA FAZ AQUI ──
 *
 * 1. **O nonce vai HASHEADO para o Google e CRU para o Supabase.** Não é preferência:
 *    está escrito no tipo do SDK instalado — *"If the ID token contains a `nonce` claim,
 *    then **the hash of this value** is compared to the value in the ID token"*. Ou seja,
 *    quem hasheia do lado de cá é o próprio Supabase; mandar já hasheado faz ele comparar
 *    o hash do hash e recusar tudo. Ver `gerarNonce` e `nonceParaOGoogle`.
 *
 * 2. **A ORIGEM PRECISA ESTAR EM "Authorized JavaScript origins"**, no cliente OAuth do
 *    Google Cloud — e isso é uma lista DIFERENTE da de "Authorized redirect URIs", que era
 *    a única que o fluxo antigo usava. Sem `http://localhost:3100` e
 *    `https://app.maisasecretary.com.br` lá, o GIS recusa em silêncio (o erro sai no
 *    console do navegador, não na tela) e **o botão simplesmente não aparece**. É o
 *    primeiro lugar para olhar quando "não funciona e não diz nada".
 *
 * 3. **`NEXT_PUBLIC_GOOGLE_CLIENT_ID` tem que existir NA VERCEL também.** É valor público
 *    por natureza (vai no HTML de qualquer jeito), mas variável que só está no
 *    `.env.local` funciona na máquina do Bruno e falha em produção — o modo de falha mais
 *    caro que existe, porque passa em todo teste manual. E o valor é embutido em tempo de
 *    **build** (medido: ele sai literal dentro de `.next/static/chunks`), então
 *    cadastrá-la na Vercel **sem redeployar não muda nada**.
 *
 * ── O CAMINHO DE FUGA É PARTE DO DESENHO, NÃO REMENDO ──
 *
 * Três coisas podem dar errado fora do nosso alcance: a variável não estar publicada, o
 * `accounts.google.com/gsi/client` não carregar (bloqueador de anúncio derruba esse script
 * com frequência) e o nonce ser recusado. Nos três casos o componente **volta sozinho para
 * o `signInWithOAuth`** — o fluxo de redirect de hoje, que funciona e só é feio.
 *
 * A alternativa seria o botão sumir, e um login sem botão do Google é uma porta fechada
 * para quem se cadastrou por ali. Feio e funcionando ganha de bonito e ausente.
 *
 * ⚠️ **O QUE A FUGA AUTOMÁTICA NÃO PEGA:** origem fora da lista (armadilha 2). Nesse caso
 * o script carrega, o botão DESENHA normalmente e só o clique morre — o erro sai no
 * console, não na tela, e não há evento que a gente consiga escutar. Por isso existe o
 * link "Problemas para entrar com o Google?" embaixo do botão: é a mesma fuga, acionada
 * por quem está vendo o problema acontecer. Um botão morto sem saída ao lado é a pior
 * tela do produto inteiro.
 *
 * ── O DESENHO DO BOTÃO É DO GOOGLE, DE PROPÓSITO ──
 *
 * `renderButton` desenha o botão deles dentro da nossa `<div>`, e não dá para estilizar
 * por fora. Trocamos o botão da casa por ele porque é o único jeito de o clique abrir o
 * seletor de contas de forma confiável — `prompt()` (One Tap) tem períodos de silêncio
 * próprios e pode não abrir, o que num login é inaceitável. O botão de fuga, esse, é o
 * nosso, com o mesmo desenho de sempre.
 *
 * ⚠️ O QUE AINDA NÃO FOI MEDIDO: se o **nome e o logo** da MAISA aparecem na tela que o
 * GIS abre. O mecanismo está certo (o `supabase.co` sai do caminho), mas o layout daquela
 * tela é do Google. Conferir OLHANDO, com print, antes de dar por resolvido — foi
 * exatamente o passo que faltou da última vez.
 * ────────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { s } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/adaptadores/saida/supabase/config";
/* ⚠️ Caminho DIRETO, não o barril `@/nucleo/dominio`: este arquivo é `"use client"` e o
 * barril arrastaria o domínio inteiro para o bundle por causa de três linhas. */
import { caminhoDeVolta } from "@/nucleo/dominio/caminho-de-volta";

/** Público por natureza: o client ID aparece no HTML de qualquer página que use o GIS. */
const CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** Depois disto, desistir do GIS e mostrar o botão de redirect. Ver o caminho de fuga. */
const GIS_ESPERA_MS = 8000;

/* ── as peças puras, exportadas porque são o que o teste prova ────────────────── */

const emHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** 32 bytes de aleatoriedade do sistema. É este valor, **cru**, que o Supabase recebe. */
export function gerarNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return emHex(bytes);
}

/**
 * SHA-256 do nonce, em hex. É este valor que vai para o Google — e é ele que volta dentro
 * do ID token, na claim `nonce`.
 *
 * ⚠️ A ASSIMETRIA É O PONTO. O Supabase hasheia o que a gente passa e compara com a
 * claim; se mandarmos o hash para os dois lados, ele compara `sha256(sha256(n))` com
 * `sha256(n)` e **todo login falha na verificação**.
 */
export async function nonceParaOGoogle(cru: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cru));
  return emHex(new Uint8Array(digest));
}

/* ── a biblioteca do Google ───────────────────────────────────────────────────── */

type CredencialDoGoogle = { credential?: string };

type Gis = {
  accounts: {
    id: {
      initialize(config: Record<string, unknown>): void;
      renderButton(elemento: HTMLElement, opcoes: Record<string, unknown>): void;
    };
  };
};

declare global {
  // eslint-disable-next-line no-var
  var google: Gis | undefined;
}

/** Uma carga por página, mesmo com duas montagens (o StrictMode monta duas vezes em dev). */
let cargaEmCurso: Promise<boolean> | null = null;

function carregarGis(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (cargaEmCurso) return cargaEmCurso;

  cargaEmCurso = new Promise<boolean>((resolve) => {
    const pronto = () => resolve(Boolean(window.google?.accounts?.id));
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const tag = existente ?? document.createElement("script");

    tag.addEventListener("load", pronto);
    tag.addEventListener("error", () => resolve(false));
    /* O `error` não dispara em todo bloqueio — extensão que devolve um script vazio
     * produz um `load` sem `window.google`, e há quem simplesmente engula a requisição.
     * O relógio é o que garante que a tela não fique esperando para sempre. */
    setTimeout(pronto, GIS_ESPERA_MS);

    if (!existente) {
      tag.src = GIS_SRC;
      tag.async = true;
      tag.defer = true;
      document.head.appendChild(tag);
    }
  });

  return cargaEmCurso;
}

/** O botão do Google tem largura FIXA em px. Sem medir, ele estoura a tela do celular. */
function larguraDisponivel(el: HTMLElement): number {
  const bruto = Math.round(el.clientWidth || el.parentElement?.clientWidth || 0);
  if (!bruto) return 320;
  return Math.max(200, Math.min(400, bruto));
}

/* ── o botão de fuga: o desenho da casa, no fluxo de redirect ─────────────────── */

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

/* ── o componente ─────────────────────────────────────────────────────────────── */

export type ModoDoBotao = "entrar" | "criar";

export function BotaoGoogle({
  modo,
  destino,
  desabilitado = false,
}: {
  /** Só muda o texto do botão do Google ("Fazer login com" × "Inscrever-se com"). */
  modo: ModoDoBotao;
  /** Para onde ir depois. Saneado aqui dentro — quem chama não pode esquecer. */
  destino: string;
  /** O formulário da tela está ocupado. */
  desabilitado?: boolean;
}) {
  /* O botão só aparece se o provedor estiver LIGADO no projeto.
   *
   * Sem esta checagem ele leva ao `/authorize` do Supabase, que responde 400 com um JSON
   * cru — e quem só queria entrar encara `{"code":400,…,"Unsupported provider"}` numa
   * página branca. Botão que não pode funcionar é pior que botão nenhum.
   *
   * `null` = ainda checando: some também, para não piscar na tela e sumir. É um GET
   * público no mesmo host com que a página já vai conversar.
   *
   * ⚠️ MANTER ESTE PADRÃO. Ele é o que fez as telas sobreviverem ao dia em que o provedor
   * estava desligado, sem uma linha de código mudando quando ele foi ligado. */
  const [provedor, setProvedor] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let vivo = true;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY! } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => vivo && setProvedor(Boolean(j?.external?.google)))
      .catch(() => vivo && setProvedor(false));
    return () => { vivo = false; };
  }, []);

  /** `null` = decidindo qual caminho dá para usar. Ver "o caminho de fuga". */
  const [caminho, setCaminho] = useState<"gis" | "redirect" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const caixa = useRef<HTMLDivElement | null>(null);
  /** O nonce **cru**. Nasce junto com o `initialize` e é o que o Supabase recebe. */
  const nonceCru = useRef("");

  useEffect(() => {
    if (provedor !== true) return;
    if (!CLIENT_ID) { setCaminho("redirect"); return; }
    let vivo = true;
    void carregarGis().then((ok) => vivo && setCaminho(ok ? "gis" : "redirect"));
    return () => { vivo = false; };
  }, [provedor]);

  /* Navegação DURA, não `router.push`: acabou de nascer uma sessão em cookie e quem
   * precisa enxergá-la é o middleware, no servidor. Mesma decisão do `/cadastro`. */
  const irEmbora = useCallback(() => {
    window.location.replace(caminhoDeVolta(destino));
  }, [destino]);

  const aoReceberCredencial = useCallback(async (resposta: CredencialDoGoogle) => {
    if (!resposta?.credential) {
      setErro("O Google não devolveu a credencial. Tente de novo.");
      return;
    }
    setOcupado(true);
    setErro(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: resposta.credential,
      /* ⚠️ CRU. Ver `nonceParaOGoogle`: quem hasheia deste lado é o Supabase. */
      nonce: nonceCru.current,
    });

    if (error) {
      /* A falha mais provável aqui é o nonce (armadilha 1) ou o client ID configurado no
       * Supabase não bater com o `aud` do token. Nenhuma das duas se resolve tentando de
       * novo no mesmo caminho — então o caminho muda, e a frase diz o que fazer. */
      setOcupado(false);
      setCaminho("redirect");
      setErro("Não consegui concluir por aqui. Use o botão abaixo para entrar com o Google.");
      return;
    }

    irEmbora();
  }, [irEmbora]);

  useEffect(() => {
    if (caminho !== "gis") return;
    const el = caixa.current;
    const gis = typeof window !== "undefined" ? window.google : undefined;
    if (!el || !gis?.accounts?.id) { setCaminho("redirect"); return; }

    let vivo = true;
    void (async () => {
      const cru = gerarNonce();
      const paraOGoogle = await nonceParaOGoogle(cru);
      if (!vivo) return;
      nonceCru.current = cru;

      gis.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: aoReceberCredencial,
        nonce: paraOGoogle,
        /* `popup` e não `redirect`: o ponto inteiro desta mudança é não sair da página. */
        ux_mode: "popup",
        /* Entrar sozinho porque o navegador lembra de uma conta é decisão de quem entra,
         * não nossa — ainda mais numa tela que também serve para CRIAR conta. */
        auto_select: false,
        itp_support: true,
      });

      /* Remontagem (StrictMode em dev, troca de caminho) desenharia um segundo botão
       * embaixo do primeiro. A caixa é nossa; limpar antes é barato. */
      el.innerHTML = "";
      gis.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: modo === "criar" ? "signup_with" : "signin_with",
        logo_alignment: "left",
        locale: "pt-BR",
        width: larguraDisponivel(el),
      });
    })();

    return () => { vivo = false; };
  }, [caminho, modo, aoReceberCredencial]);

  const entrarPorRedirect = async () => {
    if (!isSupabaseConfigured) return;
    setErro(null);
    setOcupado(true);
    const supabase = createClient();
    const volta = encodeURIComponent(caminhoDeVolta(destino));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${volta}` },
    });
    if (error) {
      setErro("Não foi possível iniciar o login com Google.");
      setOcupado(false);
    }
  };

  if (provedor !== true) return null;

  const travado = !isSupabaseConfigured || desabilitado || ocupado;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={s("flex:1;height:1px;background:var(--border)")} />
        <span style={s("font-size:var(--t-label);color:var(--muted);font-weight:var(--w-title)")}>ou</span>
        <div style={s("flex:1;height:1px;background:var(--border)")} />
      </div>

      {/* A caixa do GIS fica montada mesmo enquanto se decide o caminho: a `ref` precisa
          existir no DOM antes de o efeito rodar, senão ele cai no redirect sem motivo. */}
      <div
        ref={caixa}
        style={{
          display: caminho === "gis" ? "flex" : "none",
          justifyContent: "center",
          /* Google desenha a partir da esquerda; a altura evita o pulo do cartão. */
          minHeight: 44,
          opacity: travado ? 0.6 : 1,
          pointerEvents: travado ? "none" : "auto",
        }}
      />

      {/* ⚠️ A SAÍDA MANUAL. Ver "o que a fuga automática não pega", no cabeçalho: com a
          origem fora da lista do Google Cloud, o botão acima desenha e o clique não faz
          nada — e não existe evento para escutar. Discreto de propósito: é para quem já
          tentou e falhou, não é uma segunda opção oferecida de cara. */}
      {caminho === "gis" && (
        <button
          onClick={() => { setErro(null); setCaminho("redirect"); }}
          className="m-focus"
          style={s("align-self:center;border:none;background:none;padding:2px;font-size:var(--t-label);color:var(--muted);text-decoration:underline;cursor:pointer;font-family:inherit")}
        >
          Problemas para entrar com o Google?
        </button>
      )}

      {caminho === null && (
        <div aria-hidden style={s("height:48px;border:1px solid var(--border);border-radius:var(--r-painel);background:var(--bg)")} />
      )}

      {caminho === "redirect" && (
        <button
          onClick={entrarPorRedirect}
          disabled={travado}
          className="m-hov-bg m-press m-focus"
          style={s(`display:flex;align-items:center;justify-content:center;gap:11px;height:48px;border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);color:var(--ink);font-weight:var(--w-title);font-size:var(--t-sm);cursor:${travado ? "not-allowed" : "pointer"};opacity:${travado ? ".6" : "1"};font-family:inherit`)}
        >
          <GoogleG /> Continuar com Google
        </button>
      )}

      {/* O erro mora AQUI, e não na caixa de erro da tela: o que falha neste bloco é o
          caminho do Google, e a resposta ("use o botão abaixo") só faz sentido colada
          nele. Misturar com o erro do formulário faria uma mensagem apagar a outra. */}
      {erro && (
        <div style={s("font-size:var(--t-label);color:var(--warn);background:var(--warm-soft);padding:9px 11px;border-radius:var(--r-controle);line-height:1.45")}>
          {erro}
        </div>
      )}
    </>
  );
}
