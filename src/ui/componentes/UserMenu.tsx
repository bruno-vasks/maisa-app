"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";

// Chip do usuário logado + botão Sair, no rodapé da sidebar.
// Não renderiza nada quando o auth está desligado ou ninguém está logado
// → o app como demo aberta fica idêntico.
export default function UserMenu() {
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

  if (!isSupabaseConfigured || !email) return null;

  const sair = async () => {
    setSaindo(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

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
