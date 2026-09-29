"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O CAMPO DE SENHA, COM O OLHO.
 *
 * ── POR QUE ISTO EXISTE ──
 *
 * Relato de quem fez o onboarding em 18/08/2026: não dava para ver o que estava sendo
 * digitado. E a MAISA pede senha em três lugares — `/cadastro` (duas vezes, senha e
 * repetição), `/login` e `/nova-senha` (duas vezes) — ou seja, cinco campos.
 *
 * Sem o olho, a repetição da senha no cadastro é dois campos cegos que precisam bater
 * exatamente. Quem errou uma tecla descobre pela mensagem "as duas senhas não são iguais" e
 * não tem como saber ONDE errou: apaga os dois e digita de novo, no escuro. Num teclado de
 * celular, com maiúscula automática, isso acontece toda hora.
 *
 * ── AS DECISÕES QUE ESTE COMPONENTE CARREGA ──
 *
 * **O rótulo NÃO envolve o campo.** Um `<button>` dentro de um `<label>` faz o clique no
 * botão disparar também o comportamento do rótulo, e aí um toque acaba fazendo duas coisas.
 * Por isso `htmlFor`/`id` explícitos, com o id vindo do `useId` — que garante ser único
 * quando a mesma tela desenha dois destes (o cadastro desenha).
 *
 * **`type="button"`, e isto não é detalhe.** Botão dentro de `<form>` sem `type` é
 * `submit` por padrão: o olho enviaria o formulário. Com a senha ainda meio digitada, o
 * cadastro erraria antes de a pessoa terminar de escrever.
 *
 * **O ícone TROCA, não muda de cor.** `eye` quando está escondida (o clique revela) e
 * `eye-off` quando está visível (o clique esconde). Só a cor deixaria a pessoa sem saber se
 * o estado atual é o revelado ou o escondido — e para o leitor de tela existe `aria-pressed`,
 * que é o estado, não a ação.
 *
 * **Volta a esconder quando o valor é limpo.** Sair da tela e voltar com o campo cheio e
 * visível seria a senha na tela sem ninguém ter pedido. Sem estado global e sem persistência:
 * revelar é uma decisão daquele momento.
 * ────────────────────────────────────────────────────────────────────────────── */

import React from "react";
import { s, Icon } from "@/ui/primitivos";

/** O mesmo desenho dos outros campos das telas de auth, com espaço à direita para o olho. */
const CAMPO_BASE =
  "width:100%;border:1px solid var(--border);border-radius:var(--r-painel);padding:13px 46px 13px 14px;" +
  "font-size:var(--t-body);background:var(--surface);color:var(--ink);outline:none;font-family:inherit";

export function CampoSenha({
  rotulo,
  valor,
  aoMudar,
  autoComplete,
  autoFocus,
  minLength,
  placeholder = "••••••••",
  desabilitado,
  dica,
  required = true,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** `new-password` no cadastro e na troca; `current-password` no login. */
  autoComplete: "new-password" | "current-password";
  autoFocus?: boolean;
  minLength?: number;
  placeholder?: string;
  desabilitado?: boolean;
  /** Linha de apoio abaixo do campo, quando houver o que explicar. */
  dica?: React.ReactNode;
  required?: boolean;
}) {
  const id = React.useId();
  const [visivel, setVisivel] = React.useState(false);

  /* Campo esvaziado (a tela resetou o formulário) volta a esconder. Ver o cabeçalho. */
  React.useEffect(() => { if (!valor) setVisivel(false); }, [valor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label htmlFor={id} style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
        {rotulo}
      </label>

      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          id={id}
          type={visivel ? "text" : "password"}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          minLength={minLength}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={placeholder}
          className="m-focus"
          style={s(CAMPO_BASE)}
          disabled={desabilitado}
        />

        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          disabled={desabilitado}
          aria-label={visivel ? "Esconder a senha" : "Mostrar a senha"}
          aria-pressed={visivel}
          title={visivel ? "Esconder a senha" : "Mostrar a senha"}
          className="m-focus"
          style={s(
            "position:absolute;right:6px;display:inline-flex;align-items:center;justify-content:center;" +
            "width:34px;height:34px;border:none;border-radius:var(--r-controle);background:transparent;" +
            `cursor:${desabilitado ? "not-allowed" : "pointer"};color:var(--muted);` +
            `opacity:${desabilitado ? ".45" : "1"}`,
          )}
        >
          <Icon name={visivel ? "eye-off" : "eye"} size={19} stroke="currentColor" />
        </button>
      </div>

      {dica && (
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>{dica}</span>
      )}
    </div>
  );
}
