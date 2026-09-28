"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * ESQUECI A SENHA — o beco sem saída que o produto assumia por escrito.
 *
 * ── O QUE EXISTIA ANTES DISTO (nada) ──
 *
 * O comentário de `/cadastro` dizia, em 15/08/2026: *"este produto AINDA NÃO TEM tela de
 * recuperar senha"* — e usava isso como justificativa para pedir a senha duas vezes no
 * cadastro. A justificativa era boa e a ausência era real: quem esquecesse a senha não
 * tinha caminho nenhum dentro do app.
 *
 * Para um cliente PAGANTE isso é o pior tipo de parede: ele não perde uma funcionalidade,
 * ele perde o produto inteiro — o WhatsApp segue atendendo os clientes dele e ele não
 * consegue mais abrir o painel para ver. A saída era mandar e-mail para o Bruno, que teria
 * que trocar a senha no painel do Supabase à mão. Não escala nem no primeiro cliente.
 *
 * ── POR QUE ELA É IRMÃ DE `/login` E NÃO UM MODO DELE ──
 *
 * Mesma razão que separou `/cadastro`: os modos de falha não se parecem. Entrar erra de um
 * jeito só ("e-mail ou senha inválidos"); pedir link de recuperação praticamente NÃO ERRA
 * — e é aí que mora a decisão desta tela (ver `SEMPRE DIZ QUE ENVIOU`, abaixo).
 *
 * ⚠️ ROTA PÚBLICA. Precisa estar em `PUBLIC_PREFIXES` (`saida/supabase/sessao.ts`), senão o
 * middleware manda para o login exatamente quem não consegue fazer login. Há teste.
 * ────────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import Link from "next/link";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { s, Icon } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";

const inputCss =
  "width:100%;border:1px solid var(--border);border-radius:var(--r-painel);padding:13px 14px;font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none;font-family:inherit";

export default function Esqueci() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) return;
    setErro(null);
    setCarregando(true);

    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      /* Passa pelo MESMO callback do login social e da confirmação de conta. Ele já sabe
       * transformar `?code=` e `?token_hash=&type=recovery` em sessão — e foi ampliado em
       * 17/08/2026 justamente para entender os três formatos. Uma rota própria aqui seria
       * uma quarta cópia da mesma tradução, divergindo na primeira mudança do Supabase. */
      redirectTo: `${window.location.origin}/auth/callback?next=%2Fnova-senha`,
    });

    /* ── ⚠️ SEMPRE DIZ QUE ENVIOU, INCLUSIVE QUANDO FALHA ──
     *
     * Mostrar "esse e-mail não existe" transformaria esta tela num verificador de contas:
     * qualquer pessoa digitaria endereços e descobriria quem é cliente da MAISA. É o mesmo
     * raciocínio que o Supabase usa no cadastro (ver o bloco de `identities` vazio em
     * `/cadastro`), aplicado do lado de cá.
     *
     * A exceção é o limite de tentativas: esse a pessoa CONSEGUE consertar esperando, e
     * esconder faria ela clicar dez vezes achando que o e-mail vem. */
    if (error && /rate|limit|seconds/i.test(error.message)) {
      setErro("Muitas tentativas seguidas. Espere um minuto e tente de novo.");
      setCarregando(false);
      return;
    }

    setEnviado(true);
    setCarregando(false);
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />

      <div className="m-enter" style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={s("display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;background:var(--nav);border:1px solid var(--nav-line);border-radius:var(--r-painel)")}>
            <span style={s("font-size:var(--t-data);font-weight:var(--w-title);color:var(--warm);line-height:1")}>maisa</span>
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink)")}>Recuperar acesso</h1>
            <p style={s("font-size:var(--t-sm);color:var(--muted);margin-top:3px")}>
              Mandamos um link para você criar uma senha nova
            </p>
          </div>
        </div>

        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);box-shadow:var(--shadow-card);padding:26px 24px;display:flex;flex-direction:column;gap:16px")}>
          {enviado ? (
            /* Sucesso é TELA, não aviso — mesma escolha do cadastro. E diz para conferir o
               spam: é onde esse e-mail costuma cair, e sem a frase a pessoa conclui que não
               foi enviado e tenta de novo, gastando o limite de tentativas. */
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
              <div style={s("display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;background:var(--success-soft)")}>
                <Icon name="check" size={26} sw={2.4} stroke="var(--success)" />
              </div>
              <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>
                Se existe conta com esse e-mail, o link já está a caminho
              </p>
              <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.5;margin:0")}>
                Confira a caixa de entrada de <strong>{email.trim()}</strong> — e o spam, que é
                onde esse e-mail costuma cair. O link vale por uma hora.
              </p>
              <Link href="/login" style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--primary)")}>
                Voltar para entrar
              </Link>
            </div>
          ) : (
            <form onSubmit={pedir} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
                  E-mail da sua conta
                </span>
                <input
                  type="email" required autoFocus autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com" className="m-focus" style={s(inputCss)}
                  disabled={!isSupabaseConfigured || carregando}
                />
              </label>

              {erro && (
                <div style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--danger);background:var(--danger-soft);padding:10px 12px;border-radius:var(--r-controle)")}>
                  {erro}
                </div>
              )}

              <button
                type="submit" disabled={!isSupabaseConfigured || carregando}
                className="m-hov-primary m-press m-focus"
                style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${carregando ? "not-allowed" : "pointer"};opacity:${carregando ? ".6" : "1"}`)}
              >
                {carregando ? "Enviando…" : "Mandar link de recuperação"}
              </button>

              <Link href="/login" style={s("font-size:var(--t-sm);color:var(--muted);text-align:center")}>
                Lembrei a senha — voltar
              </Link>
            </form>
          )}
        </div>
        <LinhaLegal />
      </div>
    </div>
  );
}
