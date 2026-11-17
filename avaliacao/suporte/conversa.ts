/* Uma conversa do ensaio da conta oficial, num processo próprio (o relógio é global).
 *
 * A tarefa chega em `AVAL_TAREFA`: cenário, variante (antes | depois) e onde gravar. O mundo é
 * o da bancada (`../mundo.ts`): agente, ferramentas e casos de uso de produção, agenda e
 * conversa em memória. As boas-vindas entram no histórico ANTES da primeira mensagem, como o
 * n8n faz em produção (grava em `mensagens_agente` e depois envia). */

import { writeFileSync } from "node:fs";

import { cenarioSuporte } from "./cenarios";
import { viverDevagar } from "./relogio-lento";

type Tarefa = {
  cenario: string;
  variante: "antes" | "depois";
  modelo: string;
  modeloCliente: string;
  modeloJuiz: string | null;
  saida: string;
  repeticao: number;
};

const tarefa = JSON.parse(process.env.AVAL_TAREFA ?? "{}") as Tarefa;
const c = cenarioSuporte(tarefa.cenario);
viverDevagar(c.relogio, 5);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const { criarMundo } = await import("../mundo");
  const { criarMedidor } = await import("../medidor");
  const { criarModeloClaudeCli } = await import("../modelo-claude-cli");
  const { historicoDemo } = await import("@/adaptadores/saida/demo/memoria");
  const { ESPERA_DA_RAJADA_MS } = await import("@/adaptadores/entrada/whatsapp/agente");
  const { LimiteDoProvedor } = await import("@/nucleo/dominio/erros");
  const { CONTA_OFICIAL, BOAS_VINDAS } = await import("./dados");
  const { proximaRajada } = await import("./cliente");
  const { julgar } = await import("./juiz");
  type Fala = import("./cliente").Fala;

  const medidor = criarMedidor();
  const [, nomeDoModelo] = tarefa.modelo.split(/:(.+)/);
  const doProvedor = criarModeloClaudeCli(nomeDoModelo, medidor);
  let recusas = 0;
  const modelo: typeof doProvedor = {
    nome: doProvedor.nome,
    async conversar(p) {
      for (const espera of [3_000, 6_000, 12_000, 20_000, 30_000, 0]) {
        try {
          return await doProvedor.conversar(p);
        } catch (e) {
          if (!(e instanceof LimiteDoProvedor) || !espera) throw e;
          recusas++;
          await dormir(espera);
        }
      }
      throw new Error("inalcançável");
    },
  };

  const negocio = CONTA_OFICIAL[tarefa.variante];
  const mundo = await criarMundo({ ...c, negocio: "barbearia", ocupacao: 0.4 } as never, { modelo, negocio });

  const falas: Fala[] = [];
  const trilha: unknown[] = [];
  const erros: string[] = [];
  const inicio = Date.now();

  if (c.boasVindas !== null) {
    const bolhas = BOAS_VINDAS[tarefa.variante][c.boasVindas](c.nome ? `, ${c.nome}` : "");
    const em = new Date(Date.now() - 4 * 60_000).toISOString();
    await historicoDemo.anexar(mundo.t, c.telefone, bolhas.map((txt) => ({ de: "bot" as const, txt, em })));
    for (const b of bolhas) falas.push({ de: "maisa", texto: b, ms: 0, rajada: -1, boasVindas: true });
  }

  async function enviarRajada(mensagens: string[], rajada: number) {
    const pendentes: Promise<void>[] = [];
    for (let i = 0; i < mensagens.length; i++) {
      if (i > 0) await dormir(700 + Math.random() * 900);
      const texto = mensagens[i];
      falas.push({ de: "cliente", texto, ms: Date.now() - inicio, rajada });
      pendentes.push(
        mundo
          .responder(mundo.t, { de: c.telefone, texto }, { esperaDaRajadaMs: ESPERA_DA_RAJADA_MS })
          .then((r) => {
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
  let encerrou = false;
  for (let turno = 1; turno < (c.maxTurnos ?? 6); turno++) {
    const prox = await proximaRajada(c, falas, tarefa.modeloCliente);
    if (prox.mensagens.length) await enviarRajada(prox.mensagens, ++rajada);
    if (prox.fim) {
      encerrou = true;
      break;
    }
  }

  const desfecho = mundo.desfecho();
  const marcou = desfecho.novos.map((a) => `${a.servicoNome}, ${a.data} às ${a.inicio}h`).join("; ");
  const nota = tarefa.modeloJuiz ? await julgar(c, falas, marcou, tarefa.modeloJuiz) : null;

  writeFileSync(
    tarefa.saida,
    JSON.stringify(
      {
        cenario: c.id,
        titulo: c.titulo,
        variante: tarefa.variante,
        repeticao: tarefa.repeticao,
        relogio: c.relogio,
        encerrou,
        falas,
        trilha,
        desfecho,
        marcou,
        escalou: desfecho.escalou,
        nota,
        custo: medidor.total(),
        recusas,
        erros,
      },
      null,
      2,
    ),
  );
}

principal()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`[${tarefa.cenario}/${tarefa.variante}]`, e);
    process.exit(1);
  });
