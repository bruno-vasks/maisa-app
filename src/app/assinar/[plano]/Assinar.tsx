"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O FORMULÁRIO DE PRÉ-CADASTRO — três campos entre o anúncio e o checkout.
 *
 * A ordem é a decisão central do funil, e ela está escrita em
 * `03 Deploy e Vendas/(C) Funil de autoatendimento — plano.md`:
 *
 *     conta criada → negócio criado → checkout com o inquilino carimbado → /comecar
 *
 * ── POR QUE CADASTRAR ANTES DE COBRAR ──
 *
 * Porque **o inquilino nasce de `auth.uid()`**, dentro da RPC `criar_negocio()`, que é
 * `security definer` (ver `nucleo/aplicacao/provisionar.ts` e `dominio/tenant.ts`). Não
 * existe tenant sem usuário autenticado — então não existe checkout carimbado antes da
 * conta. Inverter a ordem exigiria um estado novo, "pagamento órfão", cujo pior modo de
 * falha é a pessoa ter pagado e não ter conta.
 *
 * ── ⚠️ SEM CAMPO DE SENHA, E ISSO É DECISÃO ──
 *
 * Senha é o campo que mais derruba conversão em formulário de compra, e ela não é
 * necessária aqui: o `signUp` já devolve a sessão que o resto do fluxo usa. Geramos uma
 * aleatória, e a pessoa define a dela depois — de dentro do produto, quando já tem motivo.
 * Quem perder a sessão antes disso usa o `/esqueci`, que já existe.
 *
 * ── ⚠️ O TELEFONE NÃO É PARA A INTEGRAÇÃO ──
 *
 * Ele não conecta WhatsApp nenhum (isso é o QR do `/comecar`). Ele é o contato: em
 * tráfego pago, quem preenche e não paga é lista de retorno, e sem telefone esse abandono
 * desaparece. Vai para o metadata do usuário no Supabase junto com o plano e a campanha —
 * lugar durável e sem migração, que é para isso que `raw_user_meta_data` existe.
 *
 * ── ⚠️ A CONFIRMAÇÃO DE E-MAIL DO SUPABASE QUEBRA O FUNIL, E ISSO É CONFIGURAÇÃO ──
 *
 * Com "Confirm email" ligado, o `signUp` devolve usuário SEM sessão — e aí não há como
 * criar o negócio nem abrir o checkout. Num funil de anúncio isso é fatal: o pagamento
 * fica do outro lado de uma caixa de entrada.
 *
 * Esta tela NÃO assume que a chave está desligada: se a sessão não vier, ela cai num
 * estado honesto ("confirme o e-mail para continuar") em vez de quebrar. O plano fica
 * guardado no metadata, então nada do que a pessoa escolheu se perde.
 * ────────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { s, Icon } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { specsDoPlano, type Plano } from "@/app/(marketing)/_lib/planos";
import { whatsappUrl } from "@/app/(marketing)/_lib/icp";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { ehVertical, NOME_NEGOCIO_MIN, type Vertical } from "@/nucleo/dominio/negocio";
import { soDigitos, TELEFONE_MIN_DIGITOS } from "@/nucleo/dominio/clientes";
import { guardarPix } from "@/ui/estado/pix";

const inputCss =
  "width:100%;border:1px solid var(--border);border-radius:var(--r-painel);padding:13px 14px;font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none;font-family:inherit";

/** Os parâmetros de campanha que viajam do anúncio para o `metadata` da assinatura.
 *
 *  ⚠️ SEM ISSO, TRÁFEGO PAGO É ORÇAMENTO NO ESCURO. É a parte que se deixa para depois e
 *  nunca volta — e ela tem que nascer com a página, porque campanha que já rodou sem
 *  marcação não se remarca retroativamente. */
const CAMPANHA = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "fbclid",
] as const;

/** Senha descartável. Ver o ⚠️ sobre não ter campo de senha. */
function senhaAleatoria(): string {
  return `Maisa-${crypto.randomUUID()}`;
}

type Estado =
  | { fase: "formulario" }
  | { fase: "indo" }
  /** `signUp` sem sessão: a confirmação de e-mail está ligada no projeto. */
  | { fase: "confirme"; email: string }
  /** A conta existe e o checkout falhou. Não perder a pessoa: manda para dentro. */
  | { fase: "entre_e_pague" };

function AssinarInner({ plano }: { plano: Plano }) {
  const q = useSearchParams();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "formulario" });
  /* O que o botão diz enquanto espera. São três chamadas em série (~7s medidos em 30/09/2026), e
   * um "Abrindo o pagamento…" parado esse tempo todo lê como travado. */
  const [etapa, setEtapa] = useState("Criando sua conta…");

  /* De onde a pessoa veio decide a vertical do negócio E a copy do cartão. Validado
   * contra a lista do domínio: `?icp=` é texto que qualquer um escreve na barra de
   * endereço, e vertical inventada seria recusada lá no fim, depois do formulário. */
  const bruto = q.get("icp") ?? "";
  const vertical: Vertical = ehVertical(bruto) ? bruto : "generico";
  const icpCopy = vertical === "barbeiros" ? "barbeiros" : "terapeutas";

  const campanha = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of CAMPANHA) {
      const v = q.get(k);
      if (v) m[k] = v.slice(0, 120);
    }
    return m;
  }, [q]);

  const travado = estado.fase === "indo";

  const enviar = useCallback(
    async (ev: React.FormEvent) => {
      ev.preventDefault();
      setErro(null);

      const nomeLimpo = nome.trim();
      if (nomeLimpo.length < NOME_NEGOCIO_MIN) {
        setErro("Escreva o nome do seu negócio.");
        return;
      }
      if (soDigitos(telefone).length < TELEFONE_MIN_DIGITOS) {
        setErro("Confira o WhatsApp — faltam dígitos.");
        return;
      }
      if (!isSupabaseConfigured) {
        setErro("O cadastro está fora do ar agora. Fale com a gente pelo WhatsApp.");
        return;
      }

      setEstado({ fase: "indo" });
      setEtapa("Criando sua conta…");
      const supabase = createClient();

      /* 1. A conta. O metadata leva tudo que precisamos depois e que não tem coluna:
       *    telefone (contato), plano (o que ela escolheu) e a campanha (de onde veio). */
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senhaAleatoria(),
        options: {
          data: { telefone: soDigitos(telefone), plano: plano.chave, icp: vertical, ...campanha },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fcomecar`,
        },
      });

      if (error) {
        const m = error.message.toLowerCase();
        if (/rate|limit|seconds/.test(m)) setErro("Muitas tentativas seguidas. Espere um minuto.");
        else if (/email|invalid/.test(m)) setErro("Confira o e-mail digitado.");
        else setErro("Não foi possível criar a conta agora. Tente de novo em instantes.");
        setEstado({ fase: "formulario" });
        return;
      }

      /* ⚠️ E-MAIL JÁ CADASTRADO VEM COMO 200 com `identities` vazio — é a defesa do
       * Supabase contra usar o cadastro para descobrir quem tem conta. Sem tratar, a tela
       * seguiria como se tivesse criado e falharia adiante, sem explicação. */
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErro("Este e-mail já tem uma conta. Entre e assine de dentro do app.");
        setEstado({ fase: "entre_e_pague" });
        return;
      }

      /* Sem sessão = "Confirm email" ligado no projeto. Ver o ⚠️ do cabeçalho. */
      if (!data.session) {
        setEstado({ fase: "confirme", email: email.trim() });
        return;
      }

      /* 2. O negócio. Sem ele não há inquilino, e sem inquilino o checkout cobraria
       *    sem saber de quem é — que é o defeito que esta página existe para não repetir. */
      setEtapa("Preparando a sua maisa…");
      const neg = await fetch("/api/negocio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        /* ⚠️ `profissional` VAI EXPLÍCITO (30/09/2026). Sem ele, o `criar_negocio()` batiza o
         * primeiro profissional com o começo do e-mail — e `a@a.com` virou o profissional "a",
         * que reprova no `check (length(btrim(nome)) between 2 and 120)` da tabela. O negócio
         * não nascia, e a pessoa via "não conseguimos montar o negócio" depois de preencher
         * tudo. Medido no log de produção. O nome do negócio já passou pelo mínimo daqui de
         * cima, e é o que a pessoa escreveu ("Clínica ou o seu nome"); a equipe se ajusta no
         * `/comecar`. */
        body: JSON.stringify({ nome: nomeLimpo, vertical, profissional: nomeLimpo }),
      }).then((r) => r.json()).catch(() => null);

      if (!neg?.ok) {
        setErro("Sua conta foi criada, mas não conseguimos montar o negócio. Entre para continuar.");
        setEstado({ fase: "entre_e_pague" });
        return;
      }

      /* 3. O checkout, com `destino: "onboarding"` — quem vem do funil pagou e nunca usou
       *    o produto, então a volta é o wizard, não a gaveta de cobrança. O destino é um
       *    NOME, não uma URL: ver o comentário de `VOLTA` em `api/assinatura/route.ts`. */
      setEtapa("Gerando o seu Pix…");
      const ass = await fetch("/api/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plano: plano.chave, destino: "onboarding" }),
      }).then((r) => r.json()).catch(() => null);

      if (!ass?.ok || !ass.url) {
        setErro("Sua conta está pronta, mas o pagamento não abriu. Entre e assine de dentro do app.");
        setEstado({ fase: "entre_e_pague" });
        return;
      }

      guardarPix(ass.pagamento);
      window.location.href = ass.url;
    },
    [nome, telefone, email, plano.chave, vertical, campanha],
  );

  const zap = whatsappUrl(
    `Oi! Quero assinar a maisa no plano ${plano.nome} (${plano.preco}/mês), mas tenho uma dúvida antes.`,
  );

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />

      <div className="m-enter" style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          <div style={s("display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;background:var(--nav);border:1px solid var(--nav-line);border-radius:var(--r-painel);box-shadow:0 10px 30px oklch(0.22 0.03 262 / 0.22)")}>
            <span style={{ ...s("font-size:var(--t-data);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line), 0 3px 5px rgba(0,0,0,.22)" }}>maisa</span>
          </div>
        </div>

        {/* O que está sendo comprado, sem vender de novo: quem chegou aqui já escolheu. */}
        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px")}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span style={s("font-size:var(--t-lg);font-weight:var(--w-title);color:var(--ink)")}>{plano.nome}</span>
            <span style={s("font-variant-numeric:tabular-nums;font-size:var(--t-body);font-weight:var(--w-data);color:var(--ink);white-space:nowrap")}>
              {plano.preco}<span style={s("color:var(--muted)")}>{plano.periodo}</span>
            </span>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            {specsDoPlano(plano, icpCopy).map((sp) => (
              <div key={sp.rotulo} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={s("font-size:var(--t-label);color:var(--muted)")}>{sp.rotulo}</span>
                <span style={s("font-variant-numeric:tabular-nums;font-size:var(--t-label);font-weight:var(--w-data);color:var(--ink-800);white-space:nowrap")}>{sp.valor}</span>
              </div>
            ))}
          </div>
        </div>

        {estado.fase === "confirme" ? (
          <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px;display:flex;flex-direction:column;gap:10px")}>
            <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Confirme seu e-mail</h1>
            <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
              Mandamos um link para <strong>{estado.email}</strong>. Clique nele e você cai direto
              no começo da configuração — o plano que você escolheu está guardado.
            </p>
          </div>
        ) : estado.fase === "entre_e_pague" ? (
          <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:18px;display:flex;flex-direction:column;gap:12px")}>
            <p style={s("font-size:var(--t-sm);color:var(--ink);line-height:1.5")}>{erro}</p>
            <Link href="/login?next=%2Fcomecar" className="m-hov-primary m-press m-focus" style={s("display:flex;align-items:center;justify-content:center;height:46px;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);text-decoration:none")}>
              Entrar no app
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--ink-800)")}>Nome do seu negócio</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={60} placeholder={vertical === "barbeiros" ? "Barbearia Central" : "Clínica ou o seu nome"} className="m-focus" style={s(inputCss)} disabled={travado} />
              <span style={s("font-size:var(--t-micro);color:var(--muted)")}>É o nome que a maisa usa ao falar com seus clientes.</span>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--ink-800)")}>Seu WhatsApp</span>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" className="m-focus" style={s(inputCss)} disabled={travado} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--ink-800)")}>Seu e-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="voce@exemplo.com" className="m-focus" style={s(inputCss)} disabled={travado} />
            </label>

            {erro && (
              <p role="alert" style={s("font-size:var(--t-label);color:var(--danger);line-height:1.45")}>{erro}</p>
            )}

            <button type="submit" disabled={travado} className="m-hov-primary m-press m-focus" style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:50px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${travado ? "not-allowed" : "pointer"};opacity:${travado ? ".6" : "1"};font-family:inherit`)}>
              {travado ? etapa : "Ir para o pagamento"}
              {!travado && <Icon name="chevron-right" size={18} />}
            </button>

            {/* ⚠️ SECUNDÁRIO, E NUNCA PRIMÁRIO. A gente quer parecer acessível — e é — mas
                um CTA de conversa com o mesmo peso do de compra rouba a compra. */}
            <a href={zap} target="_blank" rel="noopener noreferrer" className="m-focus" style={s("text-align:center;font-size:var(--t-label);color:var(--muted);text-decoration:none")}>
              Prefere falar com a gente antes? <span style={s("color:var(--primary);font-weight:var(--w-title)")}>Chama no WhatsApp</span>
            </a>
          </form>
        )}

        {/* ⚠️ NUMA PÁGINA DE COMPRA ISTO NÃO É ENFEITE. O Stripe pede termos e política
            acessíveis no fluxo de checkout, e a pessoa está a um clique de entregar o
            cartão — dizer o que fazemos com o dado dela é o mínimo, antes de ser
            requisito de alguém. Ver `LinhaLegal`. */}
        <LinhaLegal />
      </div>
    </div>
  );
}

/* `useSearchParams` obriga a fronteira de Suspense no App Router. Mesmo arranjo do
 * `/cadastro` e do `/login`. */
export default function Assinar({ plano }: { plano: Plano }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <AssinarInner plano={plano} />
    </Suspense>
  );
}
