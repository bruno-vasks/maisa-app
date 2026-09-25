"use client";
/* MAISA — a Gaveta.
 *
 * O detalhe de tudo mora aqui. No desktop é um modal centrado; no mobile, uma
 * folha que sobe de baixo. Mesmo conteúdo, mesma hierarquia, mesmo rodapé de
 * ações — muda só a forma, então o usuário não reaprende nada ao trocar de tela.
 *
 * O conteúdo vem tipado de useDetalhe() (src/ui/detalhe.tsx). Este arquivo só
 * sabe DESENHAR blocos; não sabe o que é cliente, nota ou conversa. */

import React, { useEffect, useRef } from "react";
import { s, Icon, Monogram, Toggle, Chip, Field, Input, Select, Estado, toast } from "@/ui/primitivos";
import { useIsMobile } from "@/ui/useIsMobile";
import { useStore } from "@/ui/estado/store";
import { useDetalhe, type Acao, type AcaoDestrutiva, type Bloco, type Recibo as ReciboT, type Campo as CampoT } from "@/ui/detalhe";

/* ───────────────────────────── blocos ───────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>
      {children}
    </div>
  );
}

function Stats({ linhas }: { linhas: [string, string][] }) {
  return (
    <div style={s("display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:4px 16px")}>
      {linhas.map(([l, v], i) => (
        <div
          key={l + i}
          style={s(`display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:11px 0${i < linhas.length - 1 ? ";border-bottom:1px solid var(--line)" : ""}`)}
        >
          <span style={s("font-size:var(--t-sm);color:var(--muted);flex-shrink:0")}>{l}</span>
          {/* valor de linha rótulo/valor é DADO: 500, não 700 */}
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-data);text-align:right;word-break:break-word")}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/* Campos editáveis. Grava a cada mudança (o `onChange` do campo já persiste no store), então
 * NÃO existe botão "Salvar" aqui — o app não tem save de mentira. O toast de confirmação sai no
 * blur, não a cada tecla: um toast por caractere digitado seria ruído.
 *
 * ⚠️ A FRASE DO TOAST VEM DO BLOCO, e não está mais escrita aqui. Ela era o literal
 * "Serviço atualizado" — correto enquanto a única gaveta com campos era a de serviço, e
 * mentira no dia em que o cliente virou editável (24/08/2026): corrigir o CPF de alguém
 * confirmava "Serviço atualizado". Bloco sem `avisoAoSair` não avisa nada, que é o certo
 * para campo que ainda não gravou (o rascunho de atendimento). */
/**
 * O input de texto e de número da gaveta.
 *
 * Com `gravaAoSair`, o que se digita mora AQUI até o blur ou o Enter; só então vai para o
 * `onChange` (que converte e grava). Sem isso, o store recebia "3" no caminho de "30", aplicava
 * o mínimo de 5 e devolvia "5" para o campo, e o "0" seguinte fazia 50 (08 P0-1).
 *
 * O texto local volta ao valor salvo quando o valor salvo muda (a gravação deu certo, ou outra
 * aba mudou) e o campo não está em uso. Se o que se digitou não era número, o `onChange` não
 * grava, o valor salvo não muda, e o blur devolve o campo ao que estava.
 */
function CampoDeTexto({ c, avisoAoSair }: { c: CampoT; avisoAoSair?: string }) {
  const [texto, setTexto] = React.useState(c.valor);
  const emUso = useRef(false);
  useEffect(() => { if (!emUso.current) setTexto(c.valor); }, [c.valor]);

  /** `true` = mudou e gravou; `false` = recusado; `null` = nada mudou. */
  const gravar = (): boolean | null => {
    if (texto === c.valor) return null;
    const aceito = c.onChange(texto) !== false;
    setTexto(c.valor); // se gravou, o efeito acima troca pelo valor novo no próximo render
    return aceito;
  };

  const avisar = (r: boolean | null) => {
    if (r === false) toast(c.tipo === "numero" ? `${c.label}: isso não é um número. Ficou como estava.` : `${c.label} não pode ficar vazio. Ficou como estava.`);
    else if (r === true && avisoAoSair) toast(avisoAoSair);
  };

  return (
    <Input
      value={c.gravaAoSair ? texto : c.valor}
      inputMode={c.tipo === "numero" ? (c.gravaAoSair ? "decimal" : "numeric") : undefined}
      onFocus={() => { emUso.current = true; }}
      onChange={(e) => (c.gravaAoSair ? setTexto(e.target.value) : c.onChange(e.target.value))}
      /* Enter grava SAINDO do campo: um caminho só (o blur). Gravar aqui e de novo no blur
         mandava o texto velho, porque com o foco no campo o texto local não se atualiza. */
      onKeyDown={(e) => { if (e.key === "Enter" && c.gravaAoSair) e.currentTarget.blur(); }}
      onBlur={() => {
        emUso.current = false;
        if (!c.gravaAoSair) { if (avisoAoSair) toast(avisoAoSair); return; }
        avisar(gravar());
      }}
      className={c.tipo === "numero" ? "n" : undefined}
      style={s(`${c.prefixo ? "padding-left:40px;" : ""}${c.sufixo ? "padding-right:52px;" : ""}`)}
    />
  );
}

function Campos({ campos, avisoAoSair }: { campos: CampoT[]; avisoAoSair?: string }) {
  return (
    <div style={s("display:flex;flex-direction:column;gap:14px")}>
      {campos.map((c) => (
        <Field key={c.id} label={c.label} hint={c.hint}>
          {c.tipo === "select" ? (
            <Select value={c.valor} onChange={(e) => c.onChange(e.target.value)}>
              {/* `rotuloOpcao` separa o VALOR (um id) do rótulo visível — sem isso um select de
                  cliente mostraria "cl6" em vez de "Fernanda Rocha". */}
              {(c.opcoes ?? []).map((o) => <option key={o} value={o}>{c.rotuloOpcao ? c.rotuloOpcao(o) : o}</option>)}
            </Select>
          ) : (
            <div style={s("position:relative;display:flex;align-items:center")}>
              {c.prefixo && (
                <span style={s("position:absolute;left:13px;font-size:var(--t-sm);color:var(--muted);pointer-events:none")}>{c.prefixo}</span>
              )}
              <CampoDeTexto c={c} avisoAoSair={avisoAoSair} />
              {c.sufixo && (
                <span style={s("position:absolute;right:14px;font-size:var(--t-sm);color:var(--muted);pointer-events:none")}>{c.sufixo}</span>
              )}
            </div>
          )}
        </Field>
      ))}
    </div>
  );
}

function Texto({ texto }: { texto: string }) {
  return (
    <div style={s("font-size:var(--t-sm);line-height:1.6;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px")}>
      {/* parágrafos seguintes caem no mesmo passo da escala; o que os rebaixa é a cor, não o tamanho */}
      {texto.split("\n\n").map((p, i) => (
        <span key={i} style={i > 0 ? s("color:var(--muted)") : undefined}>{p}</span>
      ))}
    </div>
  );
}

function Aviso({ texto, tone = "warn" }: { texto: string; tone?: "warn" | "danger" }) {
  const c = tone === "danger"
    ? "background:var(--danger-soft);border-color:var(--danger-line);color:var(--danger)"
    : "background:var(--warn-soft);border-color:var(--warn-line);color:var(--warn)";
  return (
    <div style={s(`display:flex;gap:12px;align-items:flex-start;border:1px solid;border-radius:14px;padding:14px 16px;${c}`)}>
      <span style={s("flex-shrink:0;display:flex;padding-top:1px")}><Icon name="alert" size={18} sw={2} /></span>
      {/* aviso é prosa: sem font-weight (o body já é 400) — quem dá o peso é a cor semântica */}
      <span style={s("font-size:var(--t-sm);line-height:1.55")}>{texto}</span>
    </div>
  );
}

function Msgs({ msgs }: { msgs: { de: "cliente" | "bot" | "voce"; txt: string }[] }) {
  return (
    <div style={s("border-radius:16px;padding:16px;background:var(--primary-soft);border:1px solid var(--line);display:flex;flex-direction:column;gap:10px")}>
      {msgs.map((m, i) => {
        const meu = m.de !== "cliente";
        return (
          <div key={i} style={s(`max-width:86%;align-self:${meu ? "flex-end" : "flex-start"};display:flex;flex-direction:column;align-items:${meu ? "flex-end" : "flex-start"};gap:4px`)}>
            {m.de === "voce" && (
              <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>Você</span>
            )}
            <div style={s(`padding:11px 14px;border-radius:16px;font-size:var(--t-sm);line-height:1.45;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-bottom-${meu ? "right" : "left"}-radius:5px`)}>
              {m.txt}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Recibo da NFS-e — as bordas tracejadas e o total destacado fazem o bloco ler
   como documento fiscal, não como mais um cartão do app. */
function Recibo({ r }: { r: ReciboT }) {
  return (
    <div style={s("border-radius:16px;overflow:hidden;border:1px solid var(--border);background:var(--surface)")}>
      <div style={s("display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;background:var(--bg);border-bottom:1px dashed var(--border)")}>
        <div style={s("min-width:0")}>
          <div style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>{r.prestador}</div>
          {/* CNPJ é string de máquina — mono + zero cortado, o único sobrevivente do mono aqui */}
          <div className="n-mach" style={s("font-size:var(--t-micro);color:var(--muted);margin-top:2px")}>{r.doc}</div>
        </div>
        <div style={s("text-align:right;flex-shrink:0")}>
          <div style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>NFS-e</div>
          <div style={s("font-size:var(--t-micro);color:var(--muted)")}>Nota Fiscal de Serviços</div>
        </div>
      </div>
      {/* .n em TODO valor do recibo — linha e total na mesma classe de numeral, senão a coluna
          não alinha, que é justamente o serviço que um recibo presta. */}
      <div style={s("padding:14px 16px;display:flex;flex-direction:column;gap:9px")}>
        {r.linhas.map(([l, v]) => (
          <div key={l} style={s("display:flex;align-items:baseline;justify-content:space-between;gap:14px")}>
            <span style={s("font-size:var(--t-label);color:var(--muted);flex-shrink:0")}>{l}</span>
            <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-data);text-align:right;word-break:break-word")}>{v}</span>
          </div>
        ))}
      </div>
      <div style={s("display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:14px 16px;border-top:1px dashed var(--border);background:var(--bg)")}>
        <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>Total</span>
        {/* --w-emph aqui: este É o número pelo qual o bloco existe (o valor da nota). Sem mono —
            os dígitos da Plex Sans já têm avanço igual, e mono lia como terminal, não como dinheiro. */}
        <span className="n" style={s("font-size:var(--t-lg);font-weight:var(--w-emph);letter-spacing:var(--ls-lg)")}>{r.total}</span>
      </div>
    </div>
  );
}

function Toggles({ toggles }: { toggles: { titulo: string; desc: string; on: boolean; alternar: () => void }[] }) {
  return (
    <div style={s("display:flex;flex-direction:column;gap:8px")}>
      {toggles.map((t) => (
        <div
          key={t.titulo}
          style={s(`display:flex;align-items:center;gap:14px;padding:14px 15px;border-radius:14px;border:1px solid var(--line);background:${t.on ? "var(--primary-soft)" : "var(--bg)"};transition:background-color var(--dur-fast) var(--ease-out)`)}
        >
          <span style={s("flex:1;min-width:0")}>
            <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>{t.titulo}</span>
            <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;line-height:1.4")}>{t.desc}</span>
          </span>
          <Toggle on={t.on} onChange={t.alternar} />
        </div>
      ))}
    </div>
  );
}

function Lista({ itens }: { itens: { id: string; nome: string; sub: string; seed?: string; onClick?: () => void }[] }) {
  return (
    <div style={s("display:flex;flex-direction:column;gap:2px")}>
      {itens.map((it) => {
        const conteudo = (
          <>
            {it.seed
              ? <Monogram name={it.nome} id={it.seed} size={32} radius={10} />
              : <span style={s("width:32px;height:32px;flex-shrink:0;border-radius:10px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center")}><Icon name="tag" size={16} /></span>}
            <span style={s("flex:1;min-width:0;text-align:left")}>
              <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{it.nome}</span>
              <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:1px")}>{it.sub}</span>
            </span>
            {it.onClick && <Icon name="chevron-right" size={16} stroke="var(--muted)" />}
          </>
        );
        const estilo = s("display:flex;align-items:center;gap:11px;padding:9px 8px;border-radius:12px;width:100%;border:none;background:transparent");
        return it.onClick ? (
          <button key={it.id} onClick={it.onClick} className="m-hov-bg m-press m-focus" style={{ ...estilo, cursor: "pointer" }}>
            {conteudo}
          </button>
        ) : (
          <div key={it.id} style={estilo}>{conteudo}</div>
        );
      })}
    </div>
  );
}

function RenderBloco({ b }: { b: Bloco }) {
  const corpo = (() => {
    switch (b.tipo) {
      case "stats": return <Stats linhas={b.linhas} />;
      case "campos": return <Campos campos={b.campos} avisoAoSair={b.avisoAoSair} />;
      case "chips": return (
        <div style={s("display:flex;flex-wrap:wrap;gap:8px")}>
          {b.chips.map((c) => <Chip key={c.label} tone={c.on ? "primary" : "neutral"}>{c.label}</Chip>)}
        </div>
      );
      case "texto": return <Texto texto={b.texto} />;
      case "toggles": return <Toggles toggles={b.toggles} />;
      case "msgs": return <Msgs msgs={b.msgs} />;
      case "aviso": return <Aviso texto={b.texto} tone={b.tone} />;
      case "recibo": return <Recibo r={b.recibo} />;
      case "lista": return <Lista itens={b.itens} />;
    }
  })();
  const label = b.tipo === "aviso" ? undefined : b.label;
  return (
    <div style={s("display:flex;flex-direction:column;gap:10px")}>
      {label && <Rotulo>{label}</Rotulo>}
      {corpo}
    </div>
  );
}

/* ───────────────────────────── rodapé ─────────────────────────────
 * ⚠️ NO MÁXIMO DOIS BOTÕES E "Mais ações" (25/09/2026, T6, contradição C1). Com cinco ações
 * soltas o rodapé de um atendimento de hoje com Meet cortava três botões a 390px e dois a
 * 680px (`casca5.mjs`): o "Cancelar atendimento" era o que sumia. O teto é o tipo `Rodape`
 * (tupla, o `tsc` reprova o terceiro); `flex-wrap` é a rede, se um rótulo longo não couber.
 *
 * Destrutivo só existe no menu, e o primeiro toque só PEDE: o rodapé vira "Voltar" + o
 * rótulo de confirmação, com o aviso colado em cima, fora da região que rola. */

/** Botão desligado sem opacidade reduzida, como o `Btn` (emenda do DS): fundo de linha, tinta apagada. */
function estiloDoBotao(a: { primaria?: boolean; tone?: "danger"; desabilitada?: boolean }, mobile: boolean): string {
  const cor = a.desabilitada
    ? "border:1px solid var(--line);background:var(--line);color:var(--muted)"
    : a.tone === "danger"
      ? "border:1px solid var(--danger);background:var(--danger-soft);color:var(--danger)"
      : a.primaria
        ? "border:1px solid var(--primary);background:var(--primary);color:var(--on-primary)"
        : "border:1px solid var(--border);background:var(--surface);color:var(--ink)";
  // rótulo de botão é --t-sm nos dois tamanhos de tela (mesmo passo do Btn); o que muda no
  // mobile é a área de toque (a altura), não a letra.
  return `height:${mobile ? "48px" : "44px"};padding:0 18px;border-radius:12px;font-size:var(--t-sm);font-weight:var(--w-title);cursor:${a.desabilitada ? "not-allowed" : "pointer"};white-space:nowrap;${cor}`;
}

function Rodape({ acoes, mais, mobile }: { acoes: readonly Acao[]; mais: readonly (Acao | AcaoDestrutiva)[]; mobile: boolean }) {
  const st = useStore();
  const [menu, setMenu] = React.useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  // Trocar de gaveta fecha o menu (o rodapé é o mesmo componente para ids diferentes).
  useEffect(() => { setMenu(false); }, [st.sel]);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [menu]);

  const pedida = mais.find((a): a is AcaoDestrutiva => a.tone === "danger" && st.cancelarPedido === a.confirmar.chave);
  const pad = {
    ...s(`padding:${mobile ? "12px 16px" : "14px 24px 18px"};border-top:1px solid var(--line);background:var(--bg);display:flex;flex-wrap:wrap;gap:10px;flex-shrink:0`),
    paddingBottom: mobile ? "max(16px, env(safe-area-inset-bottom))" : undefined,
  };

  if (pedida) {
    return (
      <>
        {/* O aviso fica fora da região que rola, colado ao rodapé: é a última coisa lida antes do toque. */}
        <div role="alert" style={s(`flex-shrink:0;display:flex;gap:10px;align-items:flex-start;padding:${mobile ? "12px 16px" : "14px 24px"};border-top:1px solid var(--danger);background:var(--danger-soft);color:var(--danger)`)}>
          <span style={s("flex-shrink:0;display:flex;padding-top:1px")}><Icon name="alert" size={18} sw={2} /></span>
          <span style={s("font-size:var(--t-sm);line-height:1.5")}>{pedida.confirmar.aviso}</span>
        </div>
        <div style={pad}>
          <button type="button" onClick={() => st.pedirCancelamento(null)} className="m-hov-bg m-press m-focus" style={s(`flex:1;${estiloDoBotao({}, mobile)}`)}>
            Voltar
          </button>
          <button
            type="button"
            onClick={pedida.desabilitada ? undefined : pedida.onClick}
            disabled={pedida.desabilitada}
            className="m-press m-focus"
            style={s(`flex:1;${estiloDoBotao({ desabilitada: pedida.desabilitada }, mobile)}${pedida.desabilitada ? "" : ";border:1px solid var(--danger);background:var(--danger);color:var(--on-primary)"}`)}
          >
            {pedida.confirmar.rotulo}
          </button>
        </div>
      </>
    );
  }

  if (!acoes.length && !mais.length) return null;

  const tocar = (a: Acao | AcaoDestrutiva) => {
    if (a.desabilitada) return;
    setMenu(false);
    if (a.tone === "danger") st.pedirCancelamento(a.confirmar.chave);
    else a.onClick?.();
  };

  return (
    <div style={pad}>
      {acoes.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => tocar(a)}
          disabled={a.desabilitada}
          className={`${a.primaria && !a.desabilitada ? "m-hov-primary" : a.desabilitada ? "" : "m-hov-bg"} m-press m-focus`}
          style={s(`flex:${a.primaria ? "1 1 auto" : "0 1 auto"};min-width:0;${estiloDoBotao(a, mobile)}`)}
        >
          {a.label}
        </button>
      ))}
      {mais.length > 0 && (
        <div ref={caixa} style={s(`position:relative;${acoes.length ? "margin-left:auto" : "flex:1"}`)}>
          {/* No celular, com botões ao lado, o menu vira só o ícone: três rótulos não cabem em
              358px, e o terceiro quebrava para uma segunda linha. */}
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={mobile && acoes.length ? "Mais ações" : undefined}
            title={mobile && acoes.length ? "Mais ações" : undefined}
            className="m-hov-bg m-press m-focus"
            style={s(`${acoes.length ? "" : "width:100%;"}display:inline-flex;align-items:center;justify-content:center;gap:6px;${estiloDoBotao({}, mobile)}${mobile && acoes.length ? ";width:48px;padding:0" : ""}`)}
          >
            {mobile && acoes.length ? <Icon name="dots" size={20} sw={2.2} /> : <>Mais ações<Icon name="chevron-down" size={16} sw={2} /></>}
          </button>
          {menu && (
            <div
              role="menu"
              className="m-reveal"
              style={s("position:absolute;right:0;bottom:calc(100% + 8px);z-index:2;min-width:240px;max-width:calc(100vw - 32px);background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-pop);padding:6px;display:flex;flex-direction:column")}
            >
              {mais.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => tocar(a)}
                  disabled={a.desabilitada}
                  className={`${a.desabilitada ? "" : "m-hov-bg"} m-focus`}
                  style={s(`min-height:44px;padding:0 12px;border:none;border-radius:8px;background:transparent;text-align:left;font-size:var(--t-sm);font-weight:var(--w-title);cursor:${a.desabilitada ? "not-allowed" : "pointer"};color:${a.desabilitada ? "var(--muted)" : a.tone === "danger" ? "var(--danger)" : "var(--ink)"}`)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── a gaveta ───────────────────────────── */

export default function Gaveta() {
  const st = useStore();
  const det = useDetalhe(st.sel);
  const mobile = useIsMobile();
  const painel = useRef<HTMLDivElement>(null);

  /* Foco entra no painel ao ABRIR: o teclado não fica preso atrás do backdrop.
   *
   * ⚠️ A DEPENDÊNCIA É O ID ABERTO, NUNCA `det`. `useDetalhe` monta um objeto novo a cada
   * render, e todo campo da gaveta grava no store a cada tecla — então com `[det]` cada
   * caractere digitado re-renderizava, rodava este efeito e ARRANCAVA o cursor do campo
   * para o painel. Editar qualquer coisa exigia clicar de novo no campo a cada letra
   * (relato de 24/09/2026: "é quase inviável editar algum campo pelo front"). */
  const aberta = det !== null;
  useEffect(() => { if (aberta) painel.current?.focus(); }, [aberta, st.sel]);

  // Trava o scroll do fundo enquanto a gaveta está aberta.
  useEffect(() => {
    if (!aberta) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [aberta]);

  /* Esc fecha, e o Tab circula DENTRO do painel.
   * A gaveta declarava `role="dialog" aria-modal="true"` e não cumpria nenhuma das duas coisas: Esc
   * não fazia nada e o Tab escapava para os cartões atrás — que estão inertes visualmente mas
   * continuavam focáveis. Declarar o contrato ARIA sem cumprir é pior que não declarar, porque o
   * leitor de tela promete ao usuário um comportamento que não existe.
   * O ConfirmDialog de ui.tsx já tratava Esc; a Gaveta, que é o painel mais usado do app, não. */
  useEffect(() => {
    if (!det) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); st.fechar(); return; }
      if (e.key !== "Tab") return;
      const p = painel.current;
      if (!p) return;
      const focaveis = Array.from(p.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      // ciclo: do último para o primeiro (Tab) e do primeiro para o último (Shift+Tab)
      if (!e.shiftKey && (ativo === ultimo || !p.contains(ativo))) { e.preventDefault(); primeiro.focus(); }
      else if (e.shiftKey && (ativo === primeiro || ativo === p || !p.contains(ativo))) { e.preventDefault(); ultimo.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [det, st]);

  if (!det) return null;

  // 16px nos dois: 26px passava do teto de painel (12–16px). A sombra da folha mantém a geometria
  // invertida (sobe de baixo), mas troca o matiz 60 (marrom) pelo 262 de --shadow-pop.
  // Nenhum dos dois tem borda: com sombra de pop, borda de 1px é o par "ghost-card" banido — o que
  // separa a gaveta do fundo é o backdrop.
  /* Teto em `dvh`, com o `vh` de reserva na mesma declaração (G9): no Safari do iPhone, 86vh é
   * a altura com a barra de endereço recolhida, e a folha passava por baixo dela. */
  const painelEstilo = mobile
    ? s("position:fixed;left:0;right:0;bottom:0;z-index:81;max-height:86vh;max-height:86dvh;background:var(--surface);border-radius:16px 16px 0 0;box-shadow:0 -20px 50px oklch(0.20 0.03 262 / 0.22);display:flex;flex-direction:column;outline:none")
    : {
      ...s("position:fixed;top:50%;left:50%;z-index:81;background:var(--surface);border-radius:16px;box-shadow:var(--shadow-pop);display:flex;flex-direction:column;overflow:hidden;outline:none;max-height:min(760px, calc(100vh - 88px));max-height:min(760px, calc(100dvh - 88px))"),
      width: "min(680px, calc(100vw - 80px))",
    };

  return (
    <>
      <div
        onClick={st.fechar}
        /* backdrop igual ao do ConfirmDialog e da Paleta — antes eram dois pretos de modal */
        style={{ ...s("position:fixed;inset:0;z-index:80;background:oklch(0.22 0.03 262 / 0.38)"), backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "mfade .18s ease both" }}
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={det.titulo}
        tabIndex={-1}
        className={mobile ? "m-sheet" : "m-modal"}
        style={painelEstilo}
      >
        {/* A alça saiu (25/09/2026, T6 e 05 F5): prometia arrastar e não havia gesto nenhum, e o
            celular não tinha botão de fechar. Agora o X aparece nas duas larguras. */}

        {/* cabeçalho */}
        <div style={s(`padding:${mobile ? "14px 12px 14px 16px" : "22px 24px 18px"};border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:14px;flex-shrink:0`)}>
          {det.seed && <Monogram name={det.titulo} id={det.seed} size={mobile ? 46 : 48} radius={15} />}
          <div style={s("flex:1;min-width:0")}>
            {/* era 19px no mobile e 20px no desktop — 1px não é hierarquia. Um passo só, e é o
                --t-lg: título de diálogo, o mesmo do ConfirmDialog (--t-title é h1 de tela). */}
            <h2 style={s("font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg);line-height:1.2")}>{det.titulo}</h2>
            <p style={s("font-size:var(--t-sm);color:var(--muted);margin-top:4px;line-height:1.4")}>{det.sub}</p>
          </div>
          {/* 44px no celular: é o único jeito de fechar a folha além do fundo escurecido. */}
          <button
            type="button"
            onClick={st.fechar}
            title="Fechar"
            aria-label="Fechar"
            className="m-hov-bg m-press-icon m-focus"
            style={s(`width:${mobile ? 44 : 36}px;height:${mobile ? 44 : 36}px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center`)}
          >
            <Icon name="x" size={mobile ? 19 : 17} sw={2.2} />
          </button>
        </div>

        {det.faixa && (
          <div role="status" style={s(`flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:${mobile ? "10px 16px" : "12px 24px"};border-bottom:1px solid var(--line);background:${det.faixa.tom === "warn" ? "var(--warn-soft)" : "var(--bg)"}`)}>
            <span style={s("flex:1 1 200px;min-width:0")}><Estado forma={det.faixa.forma} tom={det.faixa.tom}>{det.faixa.texto}</Estado></span>
            {det.faixa.acao && (
              <button
                type="button"
                onClick={det.faixa.acao.onClick}
                disabled={det.faixa.acao.desabilitada}
                className="m-hov-bg m-press m-focus"
                style={s(`flex-shrink:0;${estiloDoBotao({ desabilitada: det.faixa.acao.desabilitada }, mobile)};height:44px`)}
              >
                {det.faixa.acao.label}
              </button>
            )}
          </div>
        )}

        {/* blocos */}
        <div style={s(`flex:1;overflow-y:auto;padding:${mobile ? "18px 20px" : "22px 24px"};display:flex;flex-direction:column;gap:22px`)}>
          {det.blocos.map((b) => <RenderBloco key={b.key} b={b} />)}
        </div>

        {/* ações: até dois e "Mais ações"; sem ação, sem rodapé (fecha pelo X) */}
        <Rodape acoes={det.acoes} mais={det.mais ?? []} mobile={mobile} />
      </div>
    </>
  );
}
