/* ─────────────────────────────────────────────────────────────────────────────
 * O JUIZ — notas de 1 a 5 nos critérios que importam, e as medidas que não precisam
 * de opinião.
 *
 * Duas camadas, como no resto do produto: o que dá para contar é contado em código
 * (mensagens duplicadas, "09:00", frase de robô, saudação errada para a hora); o que
 * pede leitura (soa humana? acompanhou o tom?) vai para um modelo com uma régua escrita.
 * A régua é exigente de propósito: 5 é uma ótima secretária humana, não "sem erro".
 * ────────────────────────────────────────────────────────────────────────────── */

import type { Cenario, Desfecho, Verificacao } from "./cenarios";
import { perguntarAoClaude } from "./claude-cli";
import type { Fala } from "./cliente";
import type { NegocioDeTeste } from "./negocios";

export const CRITERIOS = ["clareza", "naturalidade", "prestatividade", "objetividade", "tom", "conducao", "correcao"] as const;
export type Criterio = (typeof CRITERIOS)[number];

export type Nota = {
  notas: Record<Criterio, number>;
  objetivo_cumprido: boolean;
  falas_roboticas: string[];
  problemas: string[];
  melhor_trecho: string;
  resumo: string;
};

export type PassoGravado = { rajada: number; ferramenta: string; entrada: Record<string, unknown>; resultado: string; erro: boolean };

/* ───────────────────────────── as medidas em código ───────────────────────────── */

/** Frases que denunciam robô. Cada uma já apareceu em conversa real da MAISA ou é tique
 *  conhecido de modelo. Contar não é proibir: uma ocorrência pode estar certa no contexto. */
const FRASES_DE_ROBO: [string, RegExp][] = [
  ["como posso (te) ajudar", /como posso (te |lhe )?ajud/i],
  ["é só (me) chamar/falar/avisar", /(é|e) s[óo] (me )?(chamar|falar|avisar)/i],
  ["se precisar de algo/alguma coisa", /se precisar de (algo|alguma coisa|mais alguma)/i],
  ["fico/estou à disposição", /(fico|estou|sigo) (à|a) disposi/i],
  ["mais alguma coisa", /mais alguma coisa/i],
  ["entendi (abrindo frase)", /^entendi\b/i],
  ["perfeito! / ótimo! / excelente!", /^(perfeito|ótimo|otimo|excelente|maravilha)[!.,]/i],
  ["com certeza", /com certeza/i],
  ["assistente virtual (sem perguntarem)", /assistente virtual/i],
  ["agradeço o contato / obrigada pelo contato", /(agrade[cç]o|obrigad[ao]) (pelo|o) contato/i],
];

const HORA_DE_MAQUINA = /\b\d{2}:\d{2}\b/g;

function saudacaoErrada(texto: string, hora: number): string | null {
  const t = texto.toLowerCase();
  if (/\bbom dia\b/.test(t) && hora >= 12) return "bom dia depois do meio-dia";
  if (/\bboa tarde\b/.test(t) && (hora < 12 || hora >= 18.5)) return "boa tarde fora da tarde";
  if (/\bboa noite\b/.test(t) && hora < 18) return "boa noite antes das 18h";
  return null;
}

const EMOJI = /\p{Extended_Pictographic}/gu;

export type Medidas = {
  mensagensDoCliente: number;
  rajadas: number;
  bolhas: number;
  bolhasPorResposta: number;
  maxBolhas: number;
  caracteresPorBolha: number;
  /** Rajadas do cliente respondidas mais de uma vez: o sintoma de "uma resposta por mensagem". */
  respostasDuplicadas: number;
  /** Rajadas sem resposta nenhuma, sem contar a despedida final. */
  silencios: number;
  frasesDeRobo: Record<string, number>;
  horaDeMaquina: number;
  saudacoesErradas: string[];
  bolhasRepetidas: number;
  emojis: number;
  latenciaMediaMs: number;
};

export function medir(falas: Fala[], horaDoRelogio: number, latencias: number[]): Medidas {
  const doCliente = falas.filter((f) => f.de === "cliente");
  const daMaisa = falas.filter((f) => f.de === "maisa");
  const rajadas = [...new Set(doCliente.map((f) => f.rajada))];

  /* Uma "resposta" é um bloco contínuo de bolhas da MAISA dentro da mesma rajada. Duas
   * respostas na mesma rajada é a MAISA respondendo mensagem por mensagem. */
  const respostasPorRajada = new Map<number, number>();
  let anterior: Fala | null = null;
  for (const f of falas) {
    if (f.de === "maisa" && (!anterior || anterior.de === "cliente")) {
      respostasPorRajada.set(f.rajada, (respostasPorRajada.get(f.rajada) ?? 0) + 1);
    }
    anterior = f;
  }
  const respostas = [...respostasPorRajada.values()].reduce((a, b) => a + b, 0);

  const frasesDeRobo: Record<string, number> = {};
  for (const f of daMaisa) for (const [nome, re] of FRASES_DE_ROBO) if (re.test(f.texto)) frasesDeRobo[nome] = (frasesDeRobo[nome] ?? 0) + 1;

  const vistas = new Map<string, number>();
  for (const f of daMaisa) vistas.set(f.texto.trim().toLowerCase(), (vistas.get(f.texto.trim().toLowerCase()) ?? 0) + 1);

  const ultimaRajada = rajadas[rajadas.length - 1];
  return {
    mensagensDoCliente: doCliente.length,
    rajadas: rajadas.length,
    bolhas: daMaisa.length,
    bolhasPorResposta: respostas ? daMaisa.length / respostas : 0,
    maxBolhas: Math.max(0, ...rajadas.map((r) => daMaisa.filter((f) => f.rajada === r).length)),
    caracteresPorBolha: daMaisa.length ? daMaisa.reduce((s, f) => s + f.texto.length, 0) / daMaisa.length : 0,
    respostasDuplicadas: [...respostasPorRajada.values()].filter((n) => n > 1).length,
    silencios: rajadas.filter((r) => r !== ultimaRajada && !respostasPorRajada.get(r)).length,
    frasesDeRobo,
    horaDeMaquina: daMaisa.reduce((s, f) => s + (f.texto.match(HORA_DE_MAQUINA)?.length ?? 0), 0),
    saudacoesErradas: daMaisa.map((f) => saudacaoErrada(f.texto, horaDoRelogio)).filter((x): x is string => !!x),
    bolhasRepetidas: [...vistas.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0),
    emojis: daMaisa.reduce((s, f) => s + (f.texto.match(EMOJI)?.length ?? 0), 0),
    latenciaMediaMs: latencias.length ? latencias.reduce((a, b) => a + b, 0) / latencias.length : 0,
  };
}

/* ───────────────────────────── a régua ───────────────────────────── */

const REGUA = `Você avalia conversas de WhatsApp entre um cliente e a MAISA, a secretária virtual de um pequeno negócio (consultório ou barbearia).

O que o dono do produto quer: que a MAISA pareça uma secretária humana solícita, disponível e interessada em marcar. Não um robô, não um formulário, não um e-mail.

Seja exigente. 5 = o que uma ótima secretária humana faria. 4 = boa, com detalhe a melhorar. 3 = aceitável, mas com cara de robô ou com falhas visíveis. 2 = atrapalha. 1 = ruim.

## Os critérios
- clareza: o cliente entende sem esforço o que foi dito, oferecido e combinado? Dia e hora sem ambiguidade, sem jargão.
- naturalidade: soa como gente no WhatsApp? Penalize: frases de praxe ("Como posso te ajudar hoje?", "Fico à disposição", "Se precisar de algo é só chamar"), repetir a mesma frase, abrir com "Entendi!"/"Perfeito!", formalidade de e-mail, hora em formato de sistema ("09:00" em vez de "9h"), bloco de texto, se reapresentar, "bom dia" fora de hora, responder cada mensagem de uma rajada separadamente (duas saudações seguidas), parecer formulário.
- prestatividade: resolve o que a pessoa precisa, oferece alternativa quando não dá, antecipa o próximo passo com moderação.
- objetividade: vai direto ao ponto, sem enrolar; uma pergunta por vez; poucas trocas até resolver; não pergunta o que já sabe.
- tom: acompanha o jeito do cliente (formal com formal, leve com leve, acolhedor e calmo quando o assunto é sensível), sem perder o tom do negócio.
- conducao: interesse em marcar. Propõe dia e hora concretos, recupera o "vou ver", não deixa a conversa morrer, sem pressionar. Em conversa que não é de agendamento (reclamação, crise, papo), conduzir bem é encaminhar para quem resolve.
- correcao: não inventa horário, preço nem regra; o que confirmou bate com o que foi marcado (use o DESFECHO e a TRILHA); não promete o que não pode; chama o dono quando deve (reclamação, pedido fora do alcance, risco à vida).

Responda em português. Em "falas_roboticas", cite trechos exatos da MAISA que denunciam robô. Em "problemas", frases curtas e concretas.`;

function contexto(n: NegocioDeTeste): string {
  const servicos = n.servicos.map((s) => `${s.nome} R$ ${s.preco} (${s.duracao} min)`).join("; ");
  const quem = n.profissionais.map((p) => {
    const dias = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].filter((_, i) => !p.expediente.folga.includes(i)).join(", ");
    return `${p.nome} (${p.papel}): ${dias}, ${p.expediente.de}h às ${p.expediente.ate}h`;
  }).join("; ");
  return `Negócio: ${n.negocio.nome}. Tom configurado: ${n.assistente.tom}.\nServiços: ${servicos}.\nQuem atende: ${quem}.\nRespostas cadastradas pelo dono: ${n.faqs.map((f) => f.pergunta).join(" | ")}.`;
}

function transcrito(falas: Fala[]): string {
  return falas
    .map((f) => `[${(f.ms / 1000).toFixed(0).padStart(4)}s · rajada ${f.rajada}] ${f.de === "cliente" ? "CLIENTE" : "MAISA"}${f.audio ? " (áudio)" : ""}: ${f.texto}`)
    .join("\n");
}

function trilhaEmTexto(trilha: PassoGravado[]): string {
  if (!trilha.length) return "(nenhuma ferramenta chamada)";
  return trilha
    .map((p) => `rajada ${p.rajada} · ${p.ferramenta}(${JSON.stringify(p.entrada)}) → ${p.erro ? "ERRO: " : ""}${p.resultado.replace(/\s+/g, " ").slice(0, 280)}`)
    .join("\n");
}

export async function julgar(p: {
  cenario: Cenario;
  negocio: NegocioDeTeste;
  relogio: string;
  falas: Fala[];
  trilha: PassoGravado[];
  desfecho: Desfecho;
  verificacao: Verificacao;
  modelo: string;
}): Promise<Nota> {
  const prompt = `## Contexto
${contexto(p.negocio)}
Agora: ${p.relogio}.

## O cliente
${p.cenario.persona}
O que ele quer: ${p.cenario.objetivo}
O que deveria acontecer: ${p.cenario.esperado}

## A conversa (como o cliente viu)
${transcrito(p.falas)}

## O que a MAISA fez por baixo (trilha de ferramentas)
${trilhaEmTexto(p.trilha)}

## O desfecho no sistema
Marcados nesta conversa: ${p.desfecho.novos.map((a) => `${a.servicoNome} ${a.data} ${a.inicio}h ${a.profissionalId}`).join("; ") || "nenhum"}.
Cancelados: ${p.desfecho.cancelados.map((a) => `${a.servicoNome} ${a.data} ${a.inicio}h`).join("; ") || "nenhum"}.
Chamou o dono: ${p.desfecho.escalou ? `sim (${p.desfecho.motivosDeEscalada.join(" / ")})` : "não"}.
Verificação automática do objetivo: ${p.verificacao.ok ? "OK" : "FALHOU"} (${p.verificacao.motivo}).

Avalie.`;

  const nota = { type: "integer", minimum: 1, maximum: 5 };
  const r = await perguntarAoClaude({
    modelo: p.modelo,
    sistema: REGUA,
    prompt,
    esquema: {
      type: "object",
      properties: {
        notas: { type: "object", properties: Object.fromEntries(CRITERIOS.map((c) => [c, nota])), required: [...CRITERIOS] },
        objetivo_cumprido: { type: "boolean" },
        falas_roboticas: { type: "array", items: { type: "string" } },
        problemas: { type: "array", items: { type: "string" } },
        melhor_trecho: { type: "string" },
        resumo: { type: "string" },
      },
      required: ["notas", "objetivo_cumprido", "falas_roboticas", "problemas", "melhor_trecho", "resumo"],
    },
  });
  return r.estruturado as Nota;
}
