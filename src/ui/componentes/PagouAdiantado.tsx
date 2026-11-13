"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * PAGOU ADIANTADO — o crédito de sessões, na ficha do paciente (12/11/2026, pedido da Regina).
 *
 * Alguns pacientes pagam antes: o mês inteiro, ou um pacote. Aqui a dona diz quantas sessões foram
 * pagas, quanto e em que dia. O recibo sai na hora, com a data do pagamento (a regra do Receita Saúde),
 * e as próximas sessões da agenda gastam o crédito: não entram em outro recibo nem recebem Pix.
 *
 * Decisões do Bruno (12/11/2026): o crédito CONTA SESSÕES (o mês pago é o caso de 4); falta sem aviso
 * GASTA o crédito, e quem não quer cobrar usa o "Não teve sessão", que o devolve.
 *
 * ⚠️ QUAIS SESSÕES O CRÉDITO COBRE VEM DO SERVIDOR (`v_sessoes_adiantadas`), nunca da conta da tela:
 * cancelar, remarcar e marcar sessão nova mudam a resposta, e só o banco vê as três.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useState } from "react";
import { s, Btn, fmt } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { cpfValido } from "@/nucleo/dominio/clientes";
import { hojeSP } from "@/ui/componentes/NovoPagamento";

const CAMPO =
  "font-family:inherit;font-size:var(--t-sm);padding:10px 12px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--bg);color:var(--ink);box-sizing:border-box";
const ROTULO = "display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)";

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "1.000,00", "1000,5", "1.000" e "250" como quem digita no Brasil. Ponto com três casas depois é
 *  milhar ("1.000" é mil, não um). Exportada para ter teste. */
export function valorDigitado(v: string): number {
  const t = v.trim().replace(/^R\$\s*/, "");
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

export function PagouAdiantado({ clienteId, nome, cpf, valorSessao }: {
  clienteId: string;
  nome: string;
  cpf: string;
  /** O valor de uma sessão desta pessoa: o valor da ficha, ou o do serviço. Sugere o total. */
  valorSessao: number;
}) {
  const st = useStore();
  const hoje = hojeSP();
  const primeiro = nome.trim().split(/\s+/)[0] || "a pessoa";
  const creditos = (st.adiantamentos ?? []).filter((a) => a.clienteId === clienteId);

  const [abrindo, setAbrindo] = useState(false);
  const [sessoes, setSessoes] = useState(4);
  /** Vazio = o sugerido (sessões × valor da sessão). Digitou, vale o digitado. */
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [ocupado, setOcupado] = useState(false);

  const sugerido = Math.round(sessoes * valorSessao * 100) / 100;
  const total = valor.trim() ? valorDigitado(valor) : sugerido;
  const digitos = cpf.replace(/\D/g, "");
  const falta = !digitos
    ? `Sem o CPF de ${primeiro}, o recibo não sai. Ponha o CPF na ficha, logo acima.`
    : !cpfValido(digitos)
      ? `O CPF na ficha de ${primeiro} não fecha nos dígitos: confira logo acima, senão a Receita recusa o recibo.`
    : !(total > 0)
      ? "Falta o valor pago."
      : !data || data > hoje
        ? "O dia do pagamento não pode ser no futuro."
        : "";

  const lancar = async () => {
    setOcupado(true);
    try {
      const ok = await st.lancarAdiantamento({ clienteId, nome, cpf, sessoes, valor: total, data });
      if (ok) { setAbrindo(false); setValor(""); setSessoes(4); setData(hojeSP()); }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div style={s("display:flex;flex-direction:column;gap:10px")}>
      {creditos.map((c) => {
        const usadas = c.cobertas.filter((x) => x.data <= hoje).length;
        const proximas = c.cobertas.filter((x) => x.data > hoje);
        const semAgenda = c.sessoes - c.cobertas.length;
        const acabou = usadas >= c.sessoes;
        return (
          <div key={c.id} style={s(`display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:var(--r-painel);border:1px solid var(--border);background:${acabou ? "transparent" : "var(--surface-2)"}`)}>
            <span className="n" style={s(`font-size:var(--t-sm);font-weight:var(--w-title);color:${acabou ? "var(--muted)" : "var(--ink)"}`)}>
              {c.sessoes} {c.sessoes === 1 ? "sessão paga" : "sessões pagas"} em {ddmm(c.pagoEm)} · {fmt(c.valor)}
            </span>
            <span className="n" style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
              {[
                acabou ? "Crédito usado." : `${usadas} de ${c.sessoes} ${usadas === 1 ? "usada" : "usadas"}.`,
                proximas.length ? `Cobre ${proximas.map((x) => ddmm(x.data)).join(", ")}.` : "",
                !acabou && semAgenda > 0
                  ? `${semAgenda === 1 ? "Falta 1 sessão" : `Faltam ${semAgenda} sessões`} na agenda: a próxima que for marcada entra no crédito.`
                  : "",
                c.comRecibo ? "Recibo emitido." : "Recibo na fila do Fiscal.",
              ].filter(Boolean).join(" ")}
            </span>
          </div>
        );
      })}

      {!abrindo ? (
        <div>
          <Btn variant="secondary" icon="plus" onClick={() => setAbrindo(true)}>Pagou adiantado</Btn>
        </div>
      ) : (
        <div style={s("display:grid;gap:10px;padding:14px;border-radius:var(--r-painel);border:1px dashed var(--border)")}>
          <div style={s("display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end")}>
            <div style={s(ROTULO)}>
              Sessões pagas
              <span style={s("display:flex;align-items:center;gap:6px")}>
                <button
                  type="button"
                  onClick={() => setSessoes((n) => Math.max(1, n - 1))}
                  aria-label="Uma sessão a menos"
                  className="m-focus m-hov-bg"
                  style={s("width:36px;height:40px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;font-size:var(--t-body);color:var(--ink)")}
                >−</button>
                <span className="n" style={s("min-width:28px;text-align:center;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>{sessoes}</span>
                <button
                  type="button"
                  onClick={() => setSessoes((n) => Math.min(60, n + 1))}
                  aria-label="Uma sessão a mais"
                  className="m-focus m-hov-bg"
                  style={s("width:36px;height:40px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;font-size:var(--t-body);color:var(--ink)")}
                >+</button>
              </span>
            </div>
            <label style={s(`${ROTULO};flex:1;min-width:120px`)}>
              Valor pago, em reais
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder={sugerido > 0 ? fmt(sugerido) : "Escreva o valor…"}
                className="n m-focus"
                style={s(`${CAMPO};width:100%`)}
              />
            </label>
            <label style={s(`${ROTULO};flex:1;min-width:140px`)}>
              Dia do pagamento
              <input value={data} onChange={(e) => setData(e.target.value)} type="date" max={hoje} className="n m-focus" style={s(`${CAMPO};width:100%`)} />
            </label>
          </div>

          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
            O recibo de {total > 0 ? fmt(total) : "…"} sai agora, com a data do pagamento. As próximas {sessoes}{" "}
            {sessoes === 1 ? "sessão" : "sessões"} de {primeiro} na agenda não entram em outro recibo nem recebem Pix.
          </span>

          <div style={s("display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
            {/* `button` cru: o primitivo não aceita `disabled` (ver `NovoPagamento`). */}
            <button
              type="button"
              onClick={() => void lancar()}
              disabled={ocupado || falta !== ""}
              className="m-press m-focus"
              style={s(`padding:9px 14px;border-radius:var(--r-controle);border:none;background:var(--primary);color:var(--on-primary);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:${ocupado || falta ? "default" : "pointer"};opacity:${ocupado || falta ? 0.5 : 1}`)}
            >
              {ocupado ? "Lançando…" : "Lançar e emitir o recibo"}
            </button>
            <button
              type="button"
              onClick={() => setAbrindo(false)}
              className="m-focus"
              style={s("background:none;border:none;padding:0;font-family:inherit;font-size:var(--t-label);color:var(--muted);cursor:pointer;text-decoration:underline")}
            >
              cancelar
            </button>
            {falta && <span style={s("font-size:var(--t-label);color:var(--warn)")}>{falta}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
