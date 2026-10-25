"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";

/* A sessão de quem está logado: o e-mail, "saindo" e o `sair`. Existe separada do chip porque o
 * desktop e o celular a mostram em lugares diferentes — o chip no rodapé do rail, e a linha
 * "Sair da conta" no Mais, onde o celular não tem rail (24/10/2026). A guarda é a mesma nos dois:
 * sem Supabase configurado ou sem ninguém logado, `email` é null e quem usa não desenha nada → o
 * app como demo aberta fica idêntico. */
export function useSessao() {
  const [email, setEmail] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const sair = async () => {
    setSaindo(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return { email: isSupabaseConfigured ? email : null, saindo, sair };
}

/** "Sair da conta" para o Mais do celular: o e-mail logado e um botão de texto, neutro, de 44px, sem
 *  confirmação (o do rail também não pede). Não renderiza nada sem sessão. */
export function SairDaConta() {
  const { email, saindo, sair } = useSessao();
  if (!email) return null;
  return (
    <div style={s("display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:0 4px")}>
      <span style={s("flex:1;min-width:0;font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")} title={email}>{email}</span>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="m-hov-bg m-press m-focus"
        style={s(`min-height:44px;padding:0 14px;border:none;border-radius:var(--r-controle);background:transparent;color:var(--ink);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:${saindo ? "default" : "pointer"}`)}
      >
        {saindo ? "Saindo…" : "Sair da conta"}
      </button>
    </div>
  );
}

// Chip do usuário logado + botão Sair, no rodapé da sidebar.
// Não renderiza nada quando o auth está desligado ou ninguém está logado
// → o app como demo aberta fica idêntico.
export default function UserMenu() {
  const { email, saindo, sair } = useSessao();

  if (!email) return null;

  const inicial = email[0]?.toUpperCase() || "?";

  return (
    <div style={s("margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--r-painel);background:var(--nav-active)")}>
      {/* --nav-soft e não --nav-accent: aquele era o terceiro azul do app (matiz 250, uso único,
          fora do gamut sRGB) e foi removido do sistema. */}
      <div style={s("width:34px;height:34px;flex-shrink:0;border-radius:var(--r-controle);background:var(--nav-soft);color:var(--nav);display:flex;align-items:center;justify-content:center;font-weight:var(--w-title);font-size:var(--t-sm)")}>{inicial}</div>
      <div style={s("min-width:0;flex:1;line-height:1.25")}>
        {/* --nav-soft, não --nav-muted: sobre --nav-active o muted dá 3,63:1 e REPROVA AA em 11px
            (é texto corpo, não tem isenção de "texto grande"). O comentário do token no
            globals.css documenta exatamente este caso; o código não seguia a própria regra. */}
        <div style={s("font-size:var(--t-micro);color:var(--nav-soft);font-weight:var(--w-data)")}>Conectado</div>
        <div style={{ ...s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--nav-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis") }} title={email}>{email}</div>
      </div>
      <button onClick={sair} disabled={saindo} aria-label="Sair" title="Sair" className="m-press m-focus" style={s("width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--nav-line);border-radius:var(--r-controle);background:transparent;color:var(--nav-muted);cursor:pointer")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
      </button>
    </div>
  );
}
