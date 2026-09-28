"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { useRouter, useSearchParams } from "next/navigation";
import { s, Icon } from "@/ui/primitivos";
import { CampoSenha } from "@/ui/componentes/CampoSenha";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { BotaoGoogle } from "@/ui/componentes/BotaoGoogle";
import { caminhoDeVolta } from "@/nucleo/dominio/caminho-de-volta";
import { RecuperarSessaoDaUrl } from "@/app/auth/RecuperarSessaoDaUrl";

/* Motivos que /auth/callback devolve, em português de gente. Cada um diz o que
 * aconteceu E o que fazer — "tente de novo" só serve quando tentar de novo pode
 * dar certo, e no caso do provedor desligado nunca dá. */
const MOTIVO: Record<string, string> = {
  provedor_desligado: "O login com Google não está habilitado neste projeto. Entre com e-mail e senha.",
  permissao_negada: "Você não autorizou o acesso à sua conta Google.",
  sem_codigo: "O provedor não devolveu a autorização. Entre com e-mail e senha.",
  /* ⚠️ DIZ A CAUSA REAL, e ela não é "expirou". O `code_verifier` do PKCE mora num cookie
   * do navegador que COMEÇOU o cadastro — abrir o e-mail no celular tendo se cadastrado no
   * computador falha na primeira tentativa e falharia em todas as seguintes. "Tente entrar
   * de novo" mandava repetir o gesto que não pode dar certo; a conta, essa, já existe. */
  outro_navegador: "Sua conta foi confirmada, mas o link foi aberto em outro navegador. Entre aqui com seu e-mail e senha.",
  link_vencido: "Esse link de confirmação venceu ou já foi usado. Entre com seu e-mail e senha — sua conta já existe.",
  tipo_invalido: "Esse link de confirmação não é válido. Entre com e-mail e senha.",
  troca_falhou: "A autorização expirou antes de virar sessão. Tente entrar de novo.", // legado: links já enviados
  oauth: "Não foi possível concluir o login pelo provedor. Entre com e-mail e senha.",
  auth: "Não foi possível concluir o login. Tente de novo.", // legado: links antigos
};

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const motivo = params.get("error");
  const [erro, setErro] = useState<string | null>(motivo ? (MOTIVO[motivo] ?? MOTIVO.auth) : null);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) return;
    setErro(null);
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }
    /* ⚠️ `startsWith("/")` sozinho deixava passar `//site-de-fora`, que é
     * protocol-relative e o navegador obedece. Mesma regra que o `/auth/callback` usa. */
    router.push(caminhoDeVolta(next));
    router.refresh();
  };

  const inputCss = "width:100%;border:1px solid var(--border);border-radius:var(--r-painel);padding:13px 14px;font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none;font-family:inherit";

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", overflow: "hidden" }}>
      {/* brilho de fundo (mesmo idioma calmo do app) */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />

      <div className="m-enter" style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 22 }}>
        {/* wordmark dourado sobre navy (contraste) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={s("display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;background:var(--nav);border:1px solid var(--nav-line);border-radius:var(--r-painel);box-shadow:0 10px 30px oklch(0.22 0.03 262 / 0.22)")}>
            <span style={{ ...s("font-size:var(--t-data);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line), 0 3px 5px rgba(0,0,0,.22)" }}>maisa</span>
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Entrar na MAISA</h1>
            <p style={s("font-size:var(--t-sm);color:var(--muted);margin-top:3px")}>Acesse o painel do seu negócio</p>
          </div>
        </div>

        {/* card */}
        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-card);padding:26px 24px;display:flex;flex-direction:column;gap:16px")}>
          {/* ⚠️ ESTA TELA É ONDE CAI QUEM ACABOU DE CONFIRMAR A CONTA e teve a sessão
              entregue no fragmento da URL — o middleware o mandou para cá porque não
              achou cookie, e o `#access_token=` sobreviveu ao redirecionamento sem que
              ninguém o lesse. O componente recolhe a sessão e sai daqui sozinho.
              Ver o cabeçalho de `auth/RecuperarSessaoDaUrl.tsx`. */}
          <RecuperarSessaoDaUrl />

          {!isSupabaseConfigured && (
            <div style={s("display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:var(--r-painel);background:var(--warm-soft);color:var(--warn);font-size:var(--t-label);line-height:1.45")}>
              <Icon name="sparkle" size={16} />
              <span><strong>Login indisponível neste ambiente.</strong></span>
            </div>
          )}

          <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>E-mail</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="m-focus" style={s(inputCss)} disabled={!isSupabaseConfigured || carregando} />
            </label>
            <CampoSenha
              rotulo="Senha"
              valor={senha}
              aoMudar={setSenha}
              autoComplete="current-password"
              desabilitado={!isSupabaseConfigured || carregando}
            />

            {erro && <div style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--danger);background:var(--danger-soft);padding:10px 12px;border-radius:var(--r-controle)")}>{erro}</div>}

            {/* ⚠️ O LINK VEM ANTES DO BOTÃO DE ENTRAR, e não no rodapé. Quem precisa dele
                já tentou a senha e falhou — é o próximo passo natural do olho, não uma
                nota de rodapé. Até 17/08/2026 não havia recuperação nenhuma: a saída era
                mandar e-mail para o Bruno trocar a senha à mão no Supabase. */}
            <Link
              href="/esqueci"
              style={s("font-size:var(--t-label);color:var(--muted);text-align:right;text-decoration:underline")}
            >
              Esqueci a senha
            </Link>

            <button type="submit" disabled={!isSupabaseConfigured || carregando} className="m-hov-primary m-press m-focus" style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${!isSupabaseConfigured || carregando ? "not-allowed" : "pointer"};opacity:${!isSupabaseConfigured || carregando ? ".6" : "1"}`)}>
              {carregando ? <span style={{ ...s("width:17px;height:17px;border:2px solid rgba(255,255,255,.4);border-top-color:var(--on-primary);border-radius:50%"), animation: "mspin .7s linear infinite" }} /> : null /* sem ícone: pedia `lock`, que nunca existiu no registro e saía como sparkle (G5) */}
              Entrar
            </button>
          </form>

          {/* Divisor, botão e erro do Google vivem inteiros aqui dentro — inclusive a
              decisão de não aparecer quando o provedor está desligado no projeto. */}
          <BotaoGoogle modo="entrar" destino={next} desabilitado={carregando} />
        </div>

        {/* Até 15/08/2026 aqui dizia "Acesso restrito. As contas são criadas pelo
            administrador — fale com o responsável para receber o seu acesso". Não era
            política de segurança: era a descrição honesta de um produto sem tela de
            cadastro. Com `/cadastro` no ar, a frase virou o convite que ela devia ter
            sido desde sempre. */}
        <p style={s("text-align:center;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="m-focus" style={s("color:var(--primary);font-weight:var(--w-title)")}>
            Criar conta grátis
          </Link>
          <br />14 dias para testar, sem cartão.
        </p>
        <LinhaLegal />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <LoginInner />
    </Suspense>
  );
}
