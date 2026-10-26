/* ─────────────────────────────────────────────────────────────────────────────
 * O RELATÓRIO — de um monte de JSON para uma página que dá para ler.
 *
 * Primeiro o placar (médias e o que falhou), depois cada conversa inteira. A conversa
 * vem junto de propósito: nota sem a conversa é um número em que ninguém confia, e a
 * conversa sem nota não diz se melhorou.
 * ────────────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Desfecho, Verificacao } from "./cenarios";
import type { Fala } from "./cliente";
import { CRITERIOS, type Medidas, type Nota, type PassoGravado } from "./juiz";
import type { Medicao } from "./medidor";

export type Resultado = {
  cenario: string;
  titulo: string;
  negocio: string;
  modelo: string;
  repeticao: number;
  relogio: string;
  encerrou: boolean;
  falas: Fala[];
  silenciosEscolhidos?: { rajada: number; ms: number; motivo: string }[];
  trilha: PassoGravado[];
  desfecho: Desfecho;
  verificacao: Verificacao;
  medidas: Medidas;
  nota: Nota | null;
  custo: Medicao;
  erros: string[];
  duracaoMs: number;
};

export function lerResultados(pasta: string): Resultado[] {
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".json") && f !== "resumo.json")
    .map((f) => JSON.parse(readFileSync(join(pasta, f), "utf8")) as Resultado)
    .sort((a, b) => a.cenario.localeCompare(b.cenario) || a.repeticao - b.repeticao);
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");

export const notaMedia = (r: Resultado) => (r.nota ? media(CRITERIOS.map((c) => r.nota!.notas[c])) : NaN);
const roboTotal = (r: Resultado) => Object.values(r.medidas.frasesDeRobo).reduce((a, b) => a + b, 0);

export type Resumo = {
  conversas: number;
  objetivoOk: number;
  juizOk: number;
  notas: Record<string, number>;
  notaGeral: number;
  duplicadas: number;
  silencios: number;
  frasesDeRobo: number;
  horaDeMaquina: number;
  saudacoesErradas: number;
  custoPorConversaUsd: number;
  custoPorMensagemUsd: number;
  latenciaMs: number;
};

export function resumir(rs: Resultado[]): Resumo {
  const julgados = rs.filter((r) => r.nota);
  const msgs = rs.reduce((s, r) => s + r.medidas.mensagensDoCliente, 0);
  return {
    conversas: rs.length,
    objetivoOk: rs.filter((r) => r.verificacao.ok).length / rs.length,
    juizOk: julgados.filter((r) => r.nota!.objetivo_cumprido).length / (julgados.length || 1),
    notas: Object.fromEntries(CRITERIOS.map((c) => [c, media(julgados.map((r) => r.nota!.notas[c]))])),
    notaGeral: media(julgados.map(notaMedia)),
    duplicadas: rs.reduce((s, r) => s + r.medidas.respostasDuplicadas, 0),
    silencios: rs.reduce((s, r) => s + r.medidas.silencios, 0),
    frasesDeRobo: rs.reduce((s, r) => s + roboTotal(r), 0),
    horaDeMaquina: rs.reduce((s, r) => s + r.medidas.horaDeMaquina, 0),
    saudacoesErradas: rs.reduce((s, r) => s + r.medidas.saudacoesErradas.length, 0),
    custoPorConversaUsd: media(rs.map((r) => r.custo.usd)),
    custoPorMensagemUsd: rs.reduce((s, r) => s + r.custo.usd, 0) / (msgs || 1),
    latenciaMs: media(rs.filter((r) => r.medidas.latenciaMediaMs).map((r) => r.medidas.latenciaMediaMs)),
  };
}

function conversaEmMarkdown(r: Resultado): string {
  const linhas = [
    ...r.falas.map((f) => ({ ms: f.ms, l: `${f.de === "cliente" ? "**cliente**" : "MAISA"}${f.audio ? " (áudio)" : ""} · ${f.texto}` })),
    ...(r.silenciosEscolhidos ?? []).map((s) => ({ ms: s.ms, l: `MAISA · _(não respondeu: ${s.motivo.replace(/^escolheu não responder: /, "")})_` })),
  ].sort((a, b) => a.ms - b.ms).map((x) => x.l);
  const n = r.nota;
  return [
    `### ${r.cenario}${r.repeticao ? ` (#${r.repeticao + 1})` : ""}: ${r.titulo}`,
    "",
    `Objetivo: ${r.verificacao.ok ? "✅" : "❌"} ${r.verificacao.motivo}. Nota ${f1(notaMedia(r))}` +
      (n ? ` (${CRITERIOS.map((c) => `${c} ${n.notas[c]}`).join(", ")})` : "") +
      `. Custo US$ ${r.custo.usd.toFixed(4)}.`,
    "",
    ...linhas.map((l) => `> ${l}  `),
    "",
    n ? `**Juiz:** ${n.resumo}` : "",
    n?.problemas.length ? `\n**Problemas:** ${n.problemas.join(" · ")}` : "",
    n?.falas_roboticas.length ? `\n**Soa robô:** ${n.falas_roboticas.map((x) => `"${x}"`).join(" · ")}` : "",
    r.erros.length ? `\n**Erros:** ${r.erros.join(" · ")}` : "",
    "",
  ].join("\n");
}

export function relatorio(rotulo: string, rs: Resultado[]): string {
  const s = resumir(rs);
  const tabela = [
    "| cenário | objetivo | nota | clar | nat | prest | obj | tom | cond | corr | dupl | robô | 09:00 | US$ |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rs.map((r) => {
      const n = r.nota?.notas;
      const c = (k: (typeof CRITERIOS)[number]) => (n ? String(n[k]) : "—");
      return `| ${r.cenario} | ${r.verificacao.ok ? "✅" : "❌"} | ${f1(notaMedia(r))} | ${c("clareza")} | ${c("naturalidade")} | ${c("prestatividade")} | ${c("objetividade")} | ${c("tom")} | ${c("conducao")} | ${c("correcao")} | ${r.medidas.respostasDuplicadas} | ${roboTotal(r)} | ${r.medidas.horaDeMaquina} | ${r.custo.usd.toFixed(4)} |`;
    }),
  ];
  return [
    `# Avaliação da MAISA: ${rotulo}`,
    "",
    `Modelo: ${[...new Set(rs.map((r) => r.modelo))].join(", ")}. ${s.conversas} conversas.`,
    "",
    `- Objetivo cumprido (verificação no sistema): **${Math.round(s.objetivoOk * 100)}%**; segundo o juiz: ${Math.round(s.juizOk * 100)}%`,
    `- Nota geral: **${f2(s.notaGeral)}** · ${CRITERIOS.map((c) => `${c} ${f2(s.notas[c])}`).join(" · ")}`,
    `- Rajadas respondidas mais de uma vez: ${s.duplicadas} · silêncios: ${s.silencios} · frases de robô: ${s.frasesDeRobo} · hora tipo "09:00": ${s.horaDeMaquina} · saudação errada: ${s.saudacoesErradas}`,
    `- Custo médio por conversa: US$ ${s.custoPorConversaUsd.toFixed(4)} (US$ ${s.custoPorMensagemUsd.toFixed(5)} por mensagem do cliente) · resposta em ${f1(s.latenciaMs / 1000)} s em média`,
    "",
    ...tabela,
    "",
    "## As conversas",
    "",
    ...rs.map(conversaEmMarkdown),
  ].join("\n");
}

export function comparacao(a: { rotulo: string; rs: Resultado[] }, b: { rotulo: string; rs: Resultado[] }): string {
  const sa = resumir(a.rs);
  const sb = resumir(b.rs);
  const linha = (nome: string, x: number, y: number, fmt = f2) => `| ${nome} | ${fmt(x)} | ${fmt(y)} | ${Number.isFinite(y - x) ? (y - x >= 0 ? "+" : "") + fmt(y - x) : "—"} |`;
  const porCenario = [...new Set([...a.rs, ...b.rs].map((r) => r.cenario))].map((id) => {
    const ra = a.rs.filter((r) => r.cenario === id);
    const rb = b.rs.filter((r) => r.cenario === id);
    const ok = (rs: Resultado[]) => (rs.length ? `${rs.filter((r) => r.verificacao.ok).length}/${rs.length}` : "—");
    return `| ${id} | ${ok(ra)} → ${ok(rb)} | ${f1(media(ra.map(notaMedia)))} → ${f1(media(rb.map(notaMedia)))} |`;
  });
  return [
    `# ${a.rotulo} → ${b.rotulo}`,
    "",
    `| medida | ${a.rotulo} | ${b.rotulo} | diferença |`,
    "|---|---|---|---|",
    linha("objetivo cumprido", sa.objetivoOk, sb.objetivoOk),
    linha("nota geral", sa.notaGeral, sb.notaGeral),
    ...CRITERIOS.map((c) => linha(c, sa.notas[c], sb.notas[c])),
    linha("rajadas duplicadas", sa.duplicadas, sb.duplicadas, (x) => String(x)),
    linha("silêncios", sa.silencios, sb.silencios, (x) => String(x)),
    linha("frases de robô", sa.frasesDeRobo, sb.frasesDeRobo, (x) => String(x)),
    linha("hora tipo 09:00", sa.horaDeMaquina, sb.horaDeMaquina, (x) => String(x)),
    linha("saudação errada", sa.saudacoesErradas, sb.saudacoesErradas, (x) => String(x)),
    linha("US$ por conversa", sa.custoPorConversaUsd, sb.custoPorConversaUsd, (x) => x.toFixed(4)),
    linha("resposta (s)", sa.latenciaMs / 1000, sb.latenciaMs / 1000, f1),
    "",
    "| cenário | objetivo | nota |",
    "|---|---|---|",
    ...porCenario,
  ].join("\n");
}
