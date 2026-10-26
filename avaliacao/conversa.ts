/* ─────────────────────────────────────────────────────────────────────────────
 * UMA CONVERSA, DO "OI" À NOTA — roda num processo próprio, chamado por `rodar.ts`.
 *
 * Processo próprio porque o relógio é global: cada cenário vive no seu instante, e
 * dois cenários no mesmo processo brigariam pelo `Date`. A tarefa chega em
 * `AVAL_TAREFA` (JSON) e o resultado sai num arquivo.
 *
 * A rajada é enviada como o WhatsApp entrega: cada mensagem dispara `responder` na
 * hora, sem esperar a resposta da anterior, como webhooks concorrentes. É o que torna
 * visível a MAISA respondendo mensagem por mensagem.
 * ────────────────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "node:fs";

import { cenario as acharCenario, RELOGIO_PADRAO } from "./cenarios";
import { horaDecimal, viverEm } from "./relogio";

export type Tarefa = {
  cenario: string;
  /** "gemini:<modelo>" ou "claude:<modelo>" — quem responde como MAISA. */
  modelo: string;
  modeloCliente: string;
  /** `null` pula o juiz (rodada só para olhar a conversa). */
  modeloJuiz: string | null;
  /** "ignorar" é o comportamento de hoje em produção: áudio não chega à MAISA. */
  audio: "ignorar" | "transcrever";
  saida: string;
  repeticao: number;
};

const tarefa = JSON.parse(process.env.AVAL_TAREFA ?? "{}") as Tarefa;
const c = acharCenario(tarefa.cenario);
const relogio = c.relogio ?? RELOGIO_PADRAO;
viverEm(relogio);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  /* Depois do relógio: nada do app pode ter lido a hora antes disto. */
  const { criarMundo } = await import("./mundo");
  const { criarMedidor, medirGemini } = await import("./medidor");
  const { criarModeloGemini } = await import("@/adaptadores/saida/gemini/modelo-gemini");
  const { criarModeloClaudeCli } = await import("./modelo-claude-cli");
  const { proximaRajada } = await import("./cliente");
  const { julgar, medir } = await import("./juiz");

  const medidor = criarMedidor();
  const [provedor, nomeDoModelo] = tarefa.modelo.split(/:(.+)/);
  let modelo;
  if (provedor === "gemini") {
    medirGemini(medidor);
    modelo = criarModeloGemini(nomeDoModelo);
  } else if (provedor === "claude") {
    modelo = criarModeloClaudeCli(nomeDoModelo, medidor);
  } else {
    throw new Error(`modelo desconhecido: ${tarefa.modelo}`);
  }

  const mundo = await criarMundo(c, { modelo });
  const inicio = Date.now();
  const falas: import("./cliente").Fala[] = [];
  const trilha: import("./juiz").PassoGravado[] = [];
  const latencias: number[] = [];
  const erros: string[] = [];

  async function enviarRajada(mensagens: string[], rajada: number) {
    const pendentes: Promise<void>[] = [];
    for (let i = 0; i < mensagens.length; i++) {
      /* O tempo de digitar a próxima mensagem curta. */
      if (i > 0) await dormir(700 + Math.random() * 900);
      const texto = mensagens[i];
      falas.push({ de: "cliente", texto, ms: Date.now() - inicio, rajada, audio: c.audio });
      if (c.audio && tarefa.audio === "ignorar") continue;

      const t0 = Date.now();
      pendentes.push(
        mundo
          .responder(mundo.t, { de: c.telefone, texto })
          .then((r) => {
            if (r.bolhas.length) latencias.push(Date.now() - t0);
            for (const b of r.bolhas) falas.push({ de: "maisa", texto: b, ms: Date.now() - inicio, rajada });
            for (const p of r.trilha) trilha.push({ rajada, ...p });
          })
          .catch((e) => void erros.push(`rajada ${rajada}: ${e instanceof Error ? e.message : String(e)}`)),
      );
    }
    await Promise.all(pendentes);
  }

  let rajada = 0;
  await enviarRajada(c.abertura, rajada);
  const maxTurnos = c.maxTurnos ?? 10;
  let encerrou = false;
  for (let turno = 1; turno < maxTurnos; turno++) {
    const prox = await proximaRajada(c, mundo.negocio.negocio.nome, falas, tarefa.modeloCliente);
    if (prox.mensagens.length) {
      rajada++;
      await enviarRajada(prox.mensagens, rajada);
    }
    if (prox.fim) {
      encerrou = true;
      break;
    }
  }

  const desfecho = mundo.desfecho();
  const verificacao = c.verificar(desfecho);
  const medidas = medir(falas, horaDecimal(relogio), latencias);
  const nota = tarefa.modeloJuiz
    ? await julgar({ cenario: c, negocio: mundo.negocio, relogio, falas, trilha, desfecho, verificacao, modelo: tarefa.modeloJuiz })
    : null;

  writeFileSync(
    tarefa.saida,
    JSON.stringify(
      {
        cenario: c.id,
        titulo: c.titulo,
        negocio: c.negocio,
        modelo: tarefa.modelo,
        repeticao: tarefa.repeticao,
        relogio,
        encerrou,
        falas,
        trilha,
        desfecho,
        verificacao,
        medidas,
        nota,
        custo: medidor.total(),
        erros,
        duracaoMs: Date.now() - inicio,
      },
      null,
      2,
    ),
  );
}

principal()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`[${tarefa.cenario}]`, e);
    process.exit(1);
  });
