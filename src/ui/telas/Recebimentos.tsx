"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * RECEBIMENTOS — a aba do dinheiro que entra (28/10/2026).
 *
 * Morava em A MAISA → Receber por Pix. Bruno: "essa parte do pix acho que é importante suficiente
 * para virar uma aba nova na sidebar". Fica no grupo do dinheiro do rail, ao lado de Clientes e
 * Fiscal; no celular, no "Mais", porque a barra de baixo já tem as cinco.
 *
 * O que a tela tem, de cima para baixo:
 *   · sem a chave Pix, o convite e o formulário (é a primeira coisa a fazer);
 *   · o que espera o dono: os comprovantes para conferir e os "já está pago?";
 *   · os Pix que foram e não voltaram pagos, com saída (Já pagou · Mandar de novo · Não cobrar);
 *   · os recebidos dos últimos 30 dias;
 *   · o que o cliente recebe no WhatsApp, com as mesmas frases da cobrança de verdade;
 *   · os ajustes do Pix e, com a flag ligada, cartão e boleto pelo Asaas.
 *
 * As peças moram em `componentes/Recebimentos.tsx`; a decisão "já está pago?" e o comprovante
 * também aparecem em Hoje, na coluna "Precisa de você".
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useState } from "react";
import { s, Btn, SectionTitle } from "@/ui/primitivos";
import { Moldura } from "@/ui/componentes/Moldura";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import {
  CartaoDaPergunta, CartaoDoAberto, CartaoDoComprovante, ContaDeCartaoEBoleto, FormularioDoPix, usePainel,
} from "@/ui/componentes/Recebimentos";
import { confirmacaoDoPagamento, mensagensDoPix, respostaAoComprovante, type FormaDoPagamento } from "@/nucleo/dominio/recebimentos";
import type { TipoDeChavePix } from "@/nucleo/dominio/pix";

const PAINEL = "border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);padding:18px";

const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const diaMes = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

const FORMA: Record<FormaDoPagamento, string> = { pix: "Pix", na_hora: "Na hora", asaas: "Link do Asaas" };
const TIPO: Record<TipoDeChavePix, string> = { cpf: "CPF", cnpj: "CNPJ", telefone: "Celular", email: "E-mail", aleatoria: "Chave aleatória" };
const DEPOIS = { perguntar: "Me perguntar se já pagou", direto: "Mandar o Pix direto", desligado: "Não mandar sozinha" } as const;

export default function Recebimentos() {
  const { painel, erro, ler } = usePainel();
  const [editando, setEditando] = useState(false);

  if (!painel) {
    return (
      <Moldura rotulo="Recebimentos">
        {erro
          ? <FalhaDeLeitura frase="Não consegui ler os recebimentos." detalhe={erro} tentar={ler} />
          : <Esqueleto linhas={3} altura={72} rotulo="Lendo os recebimentos" />}
      </Moldura>
    );
  }

  const c = painel.config;
  const ligado = Boolean(c.chave);
  const conferir = painel.comprovantes.length + painel.paraDecidir.length;
  const recebido = painel.recebidos.reduce((soma, r) => soma + r.valor, 0);

  return (
    <Moldura rotulo="Recebimentos">
      {!ligado && (
        <section>
          <SectionTitle
            title="Receba por Pix, com o valor certo"
            sub="O dinheiro cai direto na sua conta. A MAISA manda o código, lê o comprovante, e você só confere no extrato."
          />
          <div style={s(PAINEL)}><FormularioDoPix painel={painel} ler={ler} /></div>
        </section>
      )}

      {conferir > 0 && (
        <section>
          <SectionTitle title="Para você conferir" sub="Comprovantes que chegaram e atendimentos que acabaram" />
          <div style={s("display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))")}>
            {painel.comprovantes.map((x) => <CartaoDoComprovante key={x.id} c={x} abertos={painel.abertos} depois={ler} />)}
            {painel.paraDecidir.map((r) => <CartaoDaPergunta key={r.id} r={r} depois={ler} />)}
          </div>
        </section>
      )}

      {painel.abertos.length > 0 && (
        <section>
          <SectionTitle title="Esperando pagamento" sub={`${painel.abertos.length} ${painel.abertos.length === 1 ? "cobrança enviada" : "cobranças enviadas"}`} />
          <div style={s("display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))")}>
            {painel.abertos.map((r) => <CartaoDoAberto key={r.id} r={r} depois={ler} />)}
          </div>
        </section>
      )}

      {ligado && (
        <section>
          <SectionTitle
            title="Recebidos"
            sub={painel.recebidos.length ? `${reais(recebido)} nos últimos 30 dias` : "Nos últimos 30 dias"}
          />
          {painel.recebidos.length ? (
            <div style={s("border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface);overflow:hidden")}>
              {painel.recebidos.map((r, i) => (
                <div
                  key={r.id}
                  style={s(`display:flex;align-items:center;gap:12px;padding:12px 16px;${i < painel.recebidos.length - 1 ? "border-bottom:1px solid var(--line)" : ""}`)}
                >
                  <span style={s("flex:1;min-width:0")}>
                    <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{r.nome?.trim() || r.telefone}</span>
                    <span style={s("display:block;font-size:var(--t-label);color:var(--muted)")}>
                      {r.descricao} · {r.forma ? FORMA[r.forma] : "Pago"} · {diaMes(r.pagoEm)}
                    </span>
                  </span>
                  <span className="n" style={s("font-size:var(--t-sm);font-weight:var(--w-data)")}>{reais(r.valor)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span style={s("font-size:var(--t-sm);color:var(--muted)")}>Nada recebido por aqui ainda.</span>
          )}
        </section>
      )}

      <section>
        <SectionTitle title="O que o cliente recebe" sub="As mesmas frases que a MAISA manda, com um cliente de exemplo" />
        <PreviaDoWhatsApp />
      </section>

      {ligado && (
        <section>
          <SectionTitle
            title="Seu Pix"
            action={!editando ? <Btn variant="ghost" size="sm" icon="edit" onClick={() => setEditando(true)}>Editar</Btn> : undefined}
          />
          <div style={s(PAINEL)}>
            {editando ? (
              <div style={s("display:grid;gap:12px")}>
                <FormularioDoPix painel={painel} ler={() => { ler(); setEditando(false); }} />
                <span><Btn variant="ghost" size="sm" onClick={() => setEditando(false)}>Voltar</Btn></span>
              </div>
            ) : (
              <div style={s("display:grid;gap:8px;font-size:var(--t-sm)")}>
                <span><span style={s("color:var(--muted)")}>Chave · </span>{c.tipoDaChave ? `${TIPO[c.tipoDaChave]} ` : ""}{c.chave}</span>
                <span><span style={s("color:var(--muted)")}>Quem recebe · </span>{c.nome}{c.cidade ? `, ${c.cidade}` : ""}</span>
                <span><span style={s("color:var(--muted)")}>Quando o atendimento acaba · </span>{DEPOIS[c.depoisDoAtendimento]}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* A opção B (Asaas), atrás de flag: só com ela ligada na plataforma, e depois do Pix. */}
      {ligado && painel.asaas.disponivel && (
        <section>
          <ContaDeCartaoEBoleto conta={painel.asaas.conta} depois={ler} />
        </section>
      )}
    </Moldura>
  );
}

/** A conversa de exemplo, com as funções da cobrança de verdade (`dominio/recebimentos.ts`). */
function PreviaDoWhatsApp() {
  const [explicacao] = mensagensDoPix({ nome: "João", valor: 50, descricao: "Corte, hoje", codigo: "" });
  const falas: { de: "bot" | "cliente"; txt: string }[] = [
    { de: "bot", txt: explicacao },
    { de: "bot", txt: "00020126580014br.gov.bcb.pix…" },
    { de: "cliente", txt: "[comprovante]" },
    { de: "bot", txt: respostaAoComprovante(50) },
    { de: "bot", txt: confirmacaoDoPagamento(50) },
  ];
  return (
    <div style={s("border-radius:var(--r-painel);background:var(--bg);border:1px solid var(--border);padding:16px 13px;display:flex;flex-direction:column;gap:9px;max-width:460px")}>
      {falas.map((m, i) => {
        const bot = m.de === "bot";
        return (
          <div
            key={i}
            className="m-bubble"
            style={s(`max-width:88%;align-self:${bot ? "flex-start" : "flex-end"};padding:9px 13px;font-size:var(--t-sm);line-height:1.5;white-space:pre-line;border-radius:var(--r-painel);background:${bot ? "var(--surface)" : "var(--primary-soft)"};color:${bot ? "var(--ink)" : "var(--primary-dark)"};border-bottom-${bot ? "left" : "right"}-radius:var(--r-controle);box-shadow:0 1px 2px oklch(0.22 0.03 262 / 0.08)`)}
          >
            {m.txt}
          </div>
        );
      })}
    </div>
  );
}
