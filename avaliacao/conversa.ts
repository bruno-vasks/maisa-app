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

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cenario as acharCenario, RELOGIO_PADRAO } from "./cenarios";
import { horaDecimal, viverEm } from "./relogio";

export type Tarefa = {
  cenario: string;
  /** "gemini:<modelo>" ou "claude:<modelo>" — quem responde como MAISA. */
  modelo: string;
  modeloCliente: string;
  /** `null` pula o juiz (rodada só para olhar a conversa). */
  modeloJuiz: string | null;
  /** "ignorar" é o comportamento de produção até 26/10/2026: áudio não chega à MAISA.
   *  "simular" entrega a fala como transcrição perfeita, sem chamar o Gemini. */
  audio: "ignorar" | "transcrever" | "simular";
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
  /* A mesma espera da rajada que a rota do WhatsApp usa. Código antigo sem a constante
   * cai em `undefined`, que é "responde na hora": dá para rodar a bancada contra ele. */
  const agente: { ESPERA_DA_RAJADA_MS?: number } = await import("@/adaptadores/entrada/whatsapp/agente");
  const opcoes = { esperaDaRajadaMs: agente.ESPERA_DA_RAJADA_MS };

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

  /* Paciência com o "agora não" do provedor, MAIOR que a do agente em produção. A bancada
   * roda várias conversas ao mesmo tempo e estoura a cota da chave de um jeito que um
   * negócio de verdade não estoura; sem isto a nota mediria a cota, não a conversa. As
   * recusas são contadas e saem no resultado. */
  const { LimiteDoProvedor } = await import("@/nucleo/dominio/erros");
  let recusasDoProvedor = 0;
  const doProvedor = modelo;
  const paciente: typeof modelo = {
    nome: doProvedor.nome,
    async conversar(p) {
      for (const espera of [3_000, 6_000, 12_000, 20_000, 30_000, 45_000, 60_000, 0]) {
        try {
          return await doProvedor.conversar(p);
        } catch (e) {
          if (!(e instanceof LimiteDoProvedor) || !espera) throw e;
          recusasDoProvedor++;
          await dormir(espera);
        }
      }
      throw new Error("inalcançável");
    },
  };

  const mundo = await criarMundo(c, { modelo: paciente });
  const inicio = Date.now();
  const falas: import("./cliente").Fala[] = [];
  const trilha: import("./juiz").PassoGravado[] = [];
  const latencias: number[] = [];
  const erros: string[] = [];
  /* Turnos em que a MAISA decidiu não responder (`nao_responder`). Não é falha: é o que o
   * juiz precisa ver para julgar se o silêncio foi certo. */
  const silenciosEscolhidos: { rajada: number; ms: number; motivo: string }[] = [];

  /* ── o áudio, como o WhatsApp entrega ──
   * A fala do cliente simulado vira uma nota de voz de verdade: `say` com voz brasileira e
   * ffmpeg para OGG/Opus, o formato do WhatsApp. Depois passa pela MESMA transcrição de
   * produção (`saida/gemini/transcricao.ts`) e entra marcada como em produção
   * (`textoDoAudio`). Assim o cenário mede também se a MAISA entende o que ouviu. */
  async function ouvir(falado: string): Promise<string> {
    const { transcreverAudio } = await import("@/adaptadores/saida/gemini/transcricao");
    const { textoDoAudio } = await import("@/adaptadores/entrada/whatsapp/contexto");
    const pasta = mkdtempSync(join(tmpdir(), "aval-audio-"));
    execFileSync("say", ["-v", "Luciana", "-r", "190", "-o", join(pasta, "fala.aiff"), falado]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(pasta, "fala.aiff"), "-c:a", "libopus", "-b:a", "24k", "-ar", "16000", "-ac", "1", join(pasta, "fala.ogg")]);
    const audio = { base64: readFileSync(join(pasta, "fala.ogg")).toString("base64"), mimetype: "audio/ogg; codecs=opus" };
    for (const espera of [3_000, 6_000, 12_000, 20_000, 0]) {
      try {
        return textoDoAudio(await transcreverAudio(audio));
      } catch (e) {
        if (!(e instanceof LimiteDoProvedor) || !espera) return textoDoAudio(null);
        recusasDoProvedor++;
        await dormir(espera);
      }
    }
    return textoDoAudio(null);
  }

  async function enviarRajada(mensagens: string[], rajada: number) {
    const pendentes: Promise<void>[] = [];
    for (let i = 0; i < mensagens.length; i++) {
      /* O tempo de digitar a próxima mensagem curta. */
      if (i > 0) await dormir(700 + Math.random() * 900);
      const texto = mensagens[i];
      falas.push({ de: "cliente", texto, ms: Date.now() - inicio, rajada, audio: c.audio });
      if (c.audio && tarefa.audio === "ignorar") continue;

      const t0 = Date.now();
      /* O áudio vai como a rota manda: `ouvir`, que o agente só chama se for atender. */
      const ouvirDaVez = tarefa.audio === "simular"
        ? async () => (await import("@/adaptadores/entrada/whatsapp/contexto")).textoDoAudio(texto)
        : () => ouvir(texto);
      const recebida = c.audio ? { de: c.telefone, texto: "", ouvir: ouvirDaVez } : { de: c.telefone, texto };
      pendentes.push(
        mundo
          .responder(mundo.t, recebida, opcoes)
          .then((r) => {
            if (r.bolhas.length) latencias.push(Date.now() - t0);
            if (!r.bolhas.length && r.motivo?.startsWith("escolheu não responder")) {
              silenciosEscolhidos.push({ rajada, ms: Date.now() - inicio, motivo: r.motivo });
            }
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
  const verificacao = c.verificar(desfecho, falas);
  const medidas = medir(falas, horaDecimal(relogio), latencias, silenciosEscolhidos);
  const nota = tarefa.modeloJuiz
    ? await julgar({ cenario: c, negocio: mundo.negocio, relogio, falas, trilha, desfecho, verificacao, silenciosEscolhidos, modelo: tarefa.modeloJuiz })
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
        silenciosEscolhidos,
        trilha,
        desfecho,
        verificacao,
        medidas,
        nota,
        custo: medidor.total(),
        recusasDoProvedor,
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
