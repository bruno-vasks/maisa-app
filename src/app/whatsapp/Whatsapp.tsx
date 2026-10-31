"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * PEDIR O WHATSAPP — um campo, e o app abre (30/10/2026).
 *
 * Ver `page.tsx` ao lado e `nucleo/dominio/whatsapp-da-conta.ts`. O número vai para o
 * `user_metadata.telefone`, o mesmo lugar onde o `/assinar` e o `/cadastro` o gravam, e é de lá
 * que o middleware lê na próxima navegação. Desde 31/10/2026 a tela usa a moldura e o campo do
 * `/cadastro` (`MolduraDeEntrada`, `CampoWhatsapp`): quem entra pelo Google vê a mesma pergunta
 * que quem se cadastra por e-mail.
 *
 * ⚠️ `updateUser({ data })` JUNTA com o metadata que já existe, não substitui: plano, campanha e a
 * marca do aviso de cadastro ficam onde estão.
 *
 * ⚠️ NAVEGAÇÃO DURA NO FIM, e não `router.push`. Quem decide se a pessoa entra é o middleware,
 * no servidor, e ele relê a conta no `getUser()`. Recarregar garante que a próxima tela já é
 * pedida com o número gravado.
 * ────────────────────────────────────────────────────────────────────────────── */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { s } from "@/ui/primitivos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { caminhoDeVolta } from "@/nucleo/dominio/caminho-de-volta";
import { whatsappDaConta } from "@/nucleo/dominio/whatsapp-da-conta";
import { AcaoDiscreta, MolduraDeEntrada, TituloDaEntrada } from "@/ui/componentes/MolduraDeEntrada";
import { CampoWhatsapp } from "@/ui/componentes/CampoWhatsapp";

function WhatsappInner() {
  const params = useSearchParams();
  const destino = caminhoDeVolta(params.get("next"));

  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  /* Quem veio do `/assinar` antes desta regra pode ter um número sem DDD no metadata. Ele já
   * aparece no campo, e falta só completar. */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    createClient().auth.getUser().then(({ data }) => {
      const atual = data.user?.user_metadata?.telefone;
      if (typeof atual === "string" && atual) setTelefone((t) => t || atual);
    });
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) return;
    setErro(null);

    const digitos = whatsappDaConta(telefone);
    if (!digitos) {
      setErro("Confira o número e escreva com o DDD.");
      return;
    }

    setCarregando(true);
    const { error } = await createClient().auth.updateUser({ data: { telefone: digitos } });
    if (error) {
      setErro("Não consegui salvar agora. Tente de novo em instantes.");
      setCarregando(false);
      return;
    }
    window.location.replace(destino);
  };

  /* A saída para quem entrou na conta errada: sem ela, esta tela seria um beco. */
  const sair = async () => {
    setSaindo(true);
    await createClient().auth.signOut();
    window.location.replace("/login");
  };

  const travado = !isSupabaseConfigured || carregando || saindo;

  return (
    <MolduraDeEntrada>
      <TituloDaEntrada>Qual é o seu WhatsApp?</TituloDaEntrada>
      <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CampoWhatsapp valor={telefone} aoMudar={setTelefone} desabilitado={travado} autoFocus />

        {erro && <div role="alert" style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--danger);background:var(--danger-soft);padding:10px 12px;border-radius:var(--r-controle);line-height:1.45")}>{erro}</div>}

        <button type="submit" disabled={travado} className="m-hov-primary m-press m-focus" style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${travado ? "not-allowed" : "pointer"};opacity:${travado ? ".6" : "1"};font-family:inherit`)}>
          {carregando && <span style={{ ...s("width:17px;height:17px;border:2px solid rgba(255,255,255,.4);border-top-color:var(--on-primary);border-radius:50%"), animation: "mspin .7s linear infinite" }} />}
          Continuar
        </button>
      </form>
      <AcaoDiscreta onClick={() => void sair()} desligada={saindo}>Entrar com outra conta</AcaoDiscreta>
      <LinhaLegal />
    </MolduraDeEntrada>
  );
}

/* `useSearchParams` obriga a fronteira de Suspense no App Router. Mesmo arranjo do `/cadastro`. */
export default function WhatsappPage() {
  return (
    <Suspense fallback={<div className="m-altura-tela" />}>
      <WhatsappInner />
    </Suspense>
  );
}
