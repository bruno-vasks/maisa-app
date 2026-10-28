/* ─────────────────────────────────────────────────────────────────────────────
 * OS RECORTES DOS AJUSTES E O QUE O PREVIEW FALA (25/09/2026, 1C.11 e 1C.12).
 *
 * Funções puras, fora do `AMaisa.tsx`, para ter teste (`ajustes.test.ts`).
 *
 * ── OS RECORTES ──
 * A tela era uma pilha de acordeões com o WhatsApp e o "de quem é esse número" fixos em cima,
 * e sobravam 158px para o horário de sábado (07 P0.1). Agora cada seção é um recorte com
 * endereço (`?tela=assistente&secao=horarios`), na ordem da frequência de uso (07 §2), e só o
 * recorte rola. O padrão (`auto`, que não vai para a URL) é "WhatsApp e número" enquanto o canal
 * não conectou, e Horário depois: quem ainda não conectou só tem isso para fazer aqui.
 *
 * ── O PREVIEW ──
 * ⚠️ DERIVADO DO DADO, OU NÃO APARECE (07 P0.2). O preview era texto fixo (`D.PREVIEWS`): dizia
 * "seg a sex das 8h às 20h 🕗" com o sábado mudado ao lado, "Te lembro por aqui" com o lembrete
 * desligado, e emoji no tom profissional, cuja regra no prompt é "sem emoji". É a única prova que
 * o dono tem antes de soltar a MAISA com os clientes dele. Cada fala aqui sai do mesmo dado que o
 * prompt lê (`persona.ts`): o horário pela MESMA `semanaEmTexto`, a resposta pronta pela primeira
 * cadastrada, e cada ramo de toggle espelha a regra que o prompt liga ou desliga. Recorte que não
 * muda o que ela escreve diz isso, em vez de uma conversa inventada.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { ChaveCfg } from "@/nucleo/dominio/assistente";
import { semanaEmTexto, type SemanaAnunciada } from "@/nucleo/dominio/horarios";
import { rotuloDaAntecedencia } from "@/nucleo/dominio/lembretes";

export const RECORTES = [
  { id: "horarios", titulo: "Horário" },
  { id: "duvidas", titulo: "Respostas prontas" },
  { id: "agendamentos", titulo: "Agendamentos" },
  { id: "comportamento", titulo: "Quando ela chama você" },
  { id: "personalidade", titulo: "Como ela fala" },
  { id: "whatsapp", titulo: "WhatsApp e número" },
] as const;
export type RecorteId = (typeof RECORTES)[number]["id"];

/** O recorte na tela. `null` só enquanto o canal está sendo lido e a URL não escolheu: aí não há
 *  como saber se o padrão é o WhatsApp ou o Horário, e a tela mostra esqueleto. Leitura que
 *  FALHOU vai para o WhatsApp, onde está a frase e o "Tentar de novo" (esqueleto para sempre é
 *  o beco do Fiscal de 26/08/2026). */
export function recorteAtivo(secao: string | null, canal: { status: string } | null, canalErro?: string | null): RecorteId | null {
  const escolhido = RECORTES.find((r) => r.id === secao);
  if (escolhido) return escolhido.id;
  if (!canal) return canalErro ? "whatsapp" : null;
  return canal.status === "conectado" ? "horarios" : "whatsapp";
}

export type Fala = { de: "cliente" | "bot"; txt: string };
export type DadosDoPreview = {
  nomeAssistente: string;
  nomeNegocio: string;
  /** Ajustes e cadastro lidos: antes disso os nomes são o placeholder. */
  lidos: boolean;
  semana: SemanaAnunciada;
  semanaLida: boolean;
  faqs: { pergunta: string; resposta: string }[];
  cfg: Record<ChaveCfg, boolean>;
  lembreteHoras: number;
};
/** `falas: null` = ainda lendo (a tela desenha "…"); `aviso` = este recorte não muda a fala. */
export type Preview = { falas: Fala[] | null } | { aviso: string };

/** "3 horas antes" → "3 horas antes"; o rótulo da lista fechada, em minúscula, sem o "antes". */
const prazo = (horas: number) => rotuloDaAntecedencia(horas).replace(/ antes$/, "");

export function falasDoPreview(recorte: RecorteId, d: DadosDoPreview): Preview {
  switch (recorte) {
    case "personalidade":
      return {
        falas: d.lidos
          ? [
            { de: "cliente", txt: "Oi, bom dia!" },
            { de: "bot", txt: `Olá! Aqui é a ${d.nomeAssistente || "MAISA"}, do ${d.nomeNegocio}. Como posso te ajudar?` },
          ]
          : null,
      };
    case "horarios":
      if (!d.semanaLida) return { falas: null };
      return {
        falas: [
          { de: "cliente", txt: "Que horas vocês atendem?" },
          {
            de: "bot",
            /* A MESMA função do prompt: duas formatações do mesmo dado divergem. */
            txt: d.semana.some((x) => x.aberto)
              ? `Nosso horário: ${semanaEmTexto(d.semana)}.`
              : "No momento não temos horário aberto para marcar.",
          },
        ],
      };
    case "duvidas": {
      const f = d.faqs[0];
      if (f) return { falas: [{ de: "cliente", txt: f.pergunta }, { de: "bot", txt: f.resposta }] };
      /* Sem resposta pronta, ela faz o que o prompt manda para dúvida que não sabe. */
      return {
        falas: [
          { de: "cliente", txt: "Vocês têm estacionamento?" },
          { de: "bot", txt: d.cfg.encaminhar ? "Vou confirmar com o responsável e já te respondo." : "Essa eu não sei te dizer por aqui." },
        ],
      };
    }
    case "agendamentos":
      if (!d.lidos) return { falas: null };
      return {
        falas: [
          { de: "cliente", txt: "Consigo marcar pra amanhã às 16h?" },
          { de: "bot", txt: d.cfg.lembrete ? `Consigo! Fica marcado amanhã, 16:00. Te lembro por aqui ${prazo(d.lembreteHoras)} antes.` : "Consigo! Fica marcado amanhã, 16:00." },
          { de: "cliente", txt: "E se eu precisar remarcar?" },
          { de: "bot", txt: d.cfg.remarcar ? "É só me avisar aqui que eu remarco para você." : "Aí eu chamo o responsável para remarcar com você." },
        ],
      };
    case "comportamento":
      if (!d.lidos) return { falas: null };
      return {
        falas: [
          { de: "cliente", txt: "Vocês fazem um serviço bem específico?" },
          { de: "bot", txt: d.cfg.encaminhar ? "Vou confirmar com o responsável e já te respondo." : "Essa eu não sei te dizer por aqui." },
          ...(d.cfg.precoCatalogo
            ? [
              { de: "cliente" as const, txt: "E quanto custaria?" },
              { de: "bot" as const, txt: "Só te passo valor do que está na nossa lista. Esse eu confirmo e te falo." },
            ]
            : []),
        ],
      };
    case "whatsapp":
      return { aviso: "Esta seção não muda o que ela escreve." };
  }
}
