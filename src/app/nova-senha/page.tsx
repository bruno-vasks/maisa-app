"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * CRIAR UMA SENHA NOVA — o outro lado do link de recuperação.
 *
 * ── COMO SE CHEGA AQUI ──
 *
 * O link do e-mail aponta para `/auth/callback?next=/nova-senha`. O callback troca o que
 * veio na URL por uma SESSÃO e redireciona para cá. Ou seja: quando esta página abre, a
 * pessoa **já está logada** — o link de recuperação é, tecnicamente, um login de uso único.
 *
 * ⚠️ ISSO TEM UMA CONSEQUÊNCIA QUE PRECISA ESTAR ESCRITA: quem chega aqui e fecha a aba
 * sem trocar a senha continua com sessão válida no navegador. Não é falha desta tela, é
 * como o fluxo do Supabase funciona — e é por isso que a página diz que o acesso já está
 * liberado em vez de fingir que a troca é obrigatória.
 *
 * ── POR QUE ELA NÃO É PÚBLICA ──
 *
 * Diferente de `/esqueci`, esta rota fica ATRÁS do login de propósito: só faz sentido com
 * sessão, e é o middleware que garante isso. Quem abrir `/nova-senha` sem ter clicado no
 * link cai no `/login?next=/nova-senha` — que é o comportamento certo, e volta para cá
 * depois de entrar.
 * ────────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s, Icon } from "@/ui/primitivos";
import { CampoSenha } from "@/ui/componentes/CampoSenha";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";

/** O mesmo piso do cadastro. Dois números diferentes no mesmo produto produziriam uma
 *  tela que aceita a senha que a outra recusa. */
const SENHA_MIN = 8;

export default function NovaSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pronto, setPronto] = useState(false);

  /* Confere que existe sessão ANTES de deixar digitar. Sem isto, a pessoa preencheria os
   * dois campos para receber "Auth session missing" no submit — o erro certo na hora
   * errada, e sem dizer o que fazer. Acontece de verdade quando o link já foi usado ou
   * venceu. */
  const [temSessao, setTemSessao] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) { setTemSessao(false); return; }
    let vivo = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (vivo) setTemSessao(Boolean(data.user));
    });
    return () => { vivo = false; };
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa de pelo menos ${SENHA_MIN} caracteres.`);
      return;
    }
    /* Mesma confirmação do cadastro, e aqui ela vale ainda mais: errar a senha nova sem
     * confirmar deixaria a pessoa trancada de novo, e o link de recuperação já foi gasto. */
    if (senha !== confirma) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setCarregando(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    if (error) {
      setErro(
        /session|expired|invalid/i.test(error.message)
          ? "Esse link já foi usado ou venceu. Peça outro em “Esqueci a senha”."
          : "Não foi possível trocar a senha agora. Tente de novo em instantes.",
      );
      setCarregando(false);
      return;
    }

    setPronto(true);
    setCarregando(false);
    /* Vai para o painel, e não para o login: a sessão já é válida. Mandar para o login
     * depois de trocar a senha faria a pessoa digitar a senha que ela acabou de criar,
     * numa tela que ela já passou — parece que não funcionou. */
    setTimeout(() => { router.push("/"); router.refresh(); }, 1200);
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />

      <div className="m-enter" style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Criar senha nova</h1>
          <p style={s("font-size:var(--t-sm);color:var(--muted);margin-top:3px")}>
            Seu acesso já está liberado — só falta escolher a senha
          </p>
        </div>

        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-card);padding:26px 24px;display:flex;flex-direction:column;gap:16px")}>
          {pronto ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
              <div style={s("display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;background:var(--success-soft)")}>
                <Icon name="check" size={26} stroke="var(--success)" />
              </div>
              <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>Senha trocada</p>
              <p style={s("font-size:var(--t-sm);color:var(--muted);margin:0")}>Abrindo seu painel…</p>
            </div>
          ) : temSessao === false ? (
            /* O caso que mais acontece de verdade: link já usado, ou aberto num aparelho
               diferente do que pediu. Diz a AÇÃO, porque existe uma. */
            <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
              <p style={s("font-size:var(--t-sm);color:var(--ink);line-height:1.5;margin:0")}>
                Esse link já foi usado ou venceu — e por segurança ele só vale uma vez.
              </p>
              <a
                href="/esqueci" className="m-hov-primary m-press m-focus"
                style={s("display:flex;align-items:center;justify-content:center;height:48px;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);text-decoration:none")}
              >
                Pedir outro link
              </a>
            </div>
          ) : (
            <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <CampoSenha
                rotulo="Senha nova" valor={senha} aoMudar={setSenha}
                autoComplete="new-password" autoFocus placeholder="pelo menos 8 caracteres"
              />
              <CampoSenha
                rotulo="Repita a senha" valor={confirma} aoMudar={setConfirma}
                autoComplete="new-password" placeholder="Digite a senha de novo"
              />

              {erro && (
                <div style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--danger);background:var(--danger-soft);padding:10px 12px;border-radius:var(--r-controle)")}>
                  {erro}
                </div>
              )}

              <button
                type="submit" disabled={carregando}
                className="m-hov-primary m-press m-focus"
                style={s(`display:flex;align-items:center;justify-content:center;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${carregando ? "not-allowed" : "pointer"};opacity:${carregando ? ".6" : "1"}`)}
              >
                {carregando ? "Salvando…" : "Salvar e entrar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
