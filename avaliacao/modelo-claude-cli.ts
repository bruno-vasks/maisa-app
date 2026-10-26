/* ─────────────────────────────────────────────────────────────────────────────
 * A MAISA RESPONDENDO COM CLAUDE, SEM CHAVE DE API — só para comparar modelos.
 *
 * Cumpre a mesma porta `ModeloDeConversa` que o Gemini e a Anthropic cumprem em
 * produção, então o loop, as ferramentas e os guardrails são os de verdade. A única
 * diferença é o formato das ferramentas: a linha de comando não expõe tool use nativo,
 * então elas viajam como JSON validado por esquema (`mensagem` + `chamadas`). Isso é
 * uma aproximação, e o relatório diz quando um resultado veio daqui.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  ChamadaDeFerramenta, DefinicaoDeFerramenta, ModeloDeConversa, PedidoAoModelo, RespostaDoModelo, TurnoDeConversa,
} from "@/nucleo/portas/saida/modelo-conversa";
import { perguntarAoClaude } from "./claude-cli";
import type { Medidor } from "./medidor";

function protocolo(ferramentas: DefinicaoDeFerramenta[]): string {
  const lista = ferramentas
    .map((f) => {
      const campos = Object.entries(f.parametros?.properties ?? {})
        .map(([k, v]) => `    - ${k} (${v.type}${f.parametros?.required?.includes(k) ? ", obrigatório" : ""}): ${v.description ?? ""}`)
        .join("\n");
      return `- ${f.nome}: ${f.descricao}${campos ? `\n${campos}` : ""}`;
    })
    .join("\n");

  return `## Como você age aqui

A cada vez, responda com um JSON de dois campos:
- "mensagem": o texto que vai para o cliente no WhatsApp agora. Deixe "" quando, antes de falar, você precisa de uma ferramenta.
- "chamadas": as ferramentas que você quer usar agora, cada uma com "nome" e "argumentos". [] quando não precisa.
O resultado das ferramentas volta na rodada seguinte, e aí você fala com o cliente.

## Ferramentas

${lista}`;
}

function conversaEmTexto(turnos: TurnoDeConversa[]): string {
  const linhas: string[] = [];
  for (const t of turnos) {
    if (t.papel === "cliente") linhas.push(`[cliente] ${t.texto}`);
    else if (t.papel === "assistente") linhas.push(`[você] ${t.texto}`);
    else if (t.papel === "assistente_ferramentas") {
      if (t.texto?.trim()) linhas.push(`[você] ${t.texto}`);
      for (const c of t.chamadas) linhas.push(`[você chamou ${c.nome}] ${JSON.stringify(c.argumentos)}`);
    } else {
      for (const r of t.resultados) linhas.push(`[resultado de ${r.nome}${r.erro ? ", ERRO" : ""}] ${r.texto}`);
    }
  }
  return `A conversa no WhatsApp até agora:\n\n${linhas.join("\n")}\n\nSua vez. Responda com o JSON.`;
}

export function criarModeloClaudeCli(modelo: string, medidor: Medidor): ModeloDeConversa {
  return {
    nome: `claude-cli:${modelo}`,
    async conversar(p: PedidoAoModelo): Promise<RespostaDoModelo> {
      const nomes = p.ferramentas.map((f) => f.nome);
      const r = await perguntarAoClaude({
        modelo,
        /* `low` é o mesmo esforço do adaptador da Anthropic em produção. */
        esforco: "low",
        sistema: `${p.sistemaEstavel}\n\n${p.sistemaVolatil}\n\n${protocolo(p.ferramentas)}`,
        prompt: conversaEmTexto(p.turnos),
        esquema: {
          type: "object",
          properties: {
            mensagem: { type: "string" },
            chamadas: {
              type: "array",
              items: {
                type: "object",
                properties: { nome: { type: "string", enum: nomes }, argumentos: { type: "object" } },
                required: ["nome", "argumentos"],
              },
            },
          },
          required: ["mensagem", "chamadas"],
        },
      });
      medidor.somar({ usd: r.custoUsd, ms: r.ms, entrada: r.tokens.entrada + r.tokens.cacheLido + r.tokens.cacheCriado, saida: r.tokens.saida });

      const s = r.estruturado as { mensagem?: string; chamadas?: { nome: string; argumentos: Record<string, unknown> }[] };
      const chamadas: ChamadaDeFerramenta[] = (s.chamadas ?? []).map((c, i) => ({
        id: `${c.nome}-${Date.now()}-${i}`,
        nome: c.nome,
        argumentos: c.argumentos ?? {},
      }));
      return { texto: String(s.mensagem ?? "").trim(), chamadas, recusou: false };
    },
  };
}
