/* ─────────────────────────────────────────────────────────────────────────────
 * O COMPROVANTE DE PAGAMENTO — o Gemini lê a imagem ou o PDF que o cliente mandou (27/10/2026).
 *
 * Implementa `LeitorDeComprovanteDePagamento`. O prompt e o schema vieram do Smiller
 * (`sm-agenda-ai/.../services/comprovante.py`), trocando a clínica odontológica pelo negócio de
 * quem usa a MAISA. Mesmo REST sem SDK da transcrição (`transcricao.ts`): o arquivo vai inline, e
 * a resposta volta em JSON com o formato pedido (`responseSchema`).
 *
 * ⚠️ NUNCA LANÇA. Arquivo que não é comprovante, provedor fora, JSON torto: tudo vira `null`, e a
 * mensagem segue o caminho de sempre. O motivo vai para o log, daqui, que é onde se sabe.
 *
 * ⚠️ O QUE VOLTA FOI ESCRITO POR UM MODELO LENDO UMA IMAGEM DE FORA. Cada campo é conferido no
 * formato e cortado no teto antes de sair daqui; quem decide alguma coisa com ele é o domínio
 * (`conferirRecebedor`, `sugerirRecebimento`) e, no fim, o dono olhando o extrato.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { LeitorDeComprovanteDePagamento } from "@/nucleo/portas/saida/leitor-de-comprovante-de-pagamento";
import type { DadosDoComprovante } from "@/nucleo/dominio/recebimentos";
import { GEMINI, isGeminiConfigured } from "./config";

/**
 * O modelo que lê. O barato, como o da transcrição: ler um comprovante é tarefa curta, e só
 * acontece quando o telefone tem Pix em aberto. Se ele errar valor ou id da transação nos
 * comprovantes reais, o degrau é `GEMINI_MODELO_COMPROVANTE=gemini-3.6-flash`, sem mexer em código.
 */
const MODELO = (process.env.GEMINI_MODELO_COMPROVANTE ?? "").trim() || "gemini-3.5-flash-lite";

/** Imagem de WhatsApp tem centenas de KB; PDF de banco, poucos MB. Acima disso não é comprovante. */
const MAX_BASE64 = 8_000_000;

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

const PROMPT =
  "Você lê comprovantes de pagamento brasileiros (Pix, transferência, boleto pago) que clientes de um " +
  "pequeno negócio (barbearia, consultório, terapeuta) mandam pelo WhatsApp. Diga se o arquivo é um " +
  "comprovante de pagamento CONCLUÍDO: não é um agendamento, não é um QR Code ou código a pagar, não é " +
  "um boleto em aberto, não é um print de conversa. Se for, extraia exatamente o que está escrito, sem " +
  "inventar: valor pago em reais (número, ponto como decimal), data do pagamento (AAAA-MM-DD), nome de " +
  "quem recebeu, chave Pix de quem recebeu, CPF ou CNPJ de quem recebeu (como aparece, mesmo " +
  "mascarado), nome de quem pagou, banco ou instituição, ID da transação (o identificador fim a fim do " +
  "Pix, que começa com E, ou o código de autenticação) e o identificador ou a descrição do Pix, se " +
  "houver. Campo que não aparece fica nulo.";

const texto = { type: "STRING", nullable: true };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    e_comprovante: { type: "BOOLEAN" },
    valor: { type: "NUMBER", nullable: true },
    pago_em: texto,
    recebedor_nome: texto,
    recebedor_chave: texto,
    recebedor_documento: texto,
    pagador_nome: texto,
    banco: texto,
    id_transacao: texto,
    identificador: texto,
  },
  required: ["e_comprovante"],
};

/** Texto de fora: aparado e com teto, e vazio vira `null`. */
const campo = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** O que o modelo devolveu, no nosso vocabulário. `null` quando não é um comprovante com valor. */
export function dadosDaResposta(bruto: unknown): DadosDoComprovante | null {
  const d = (bruto ?? {}) as Record<string, unknown>;
  if (d.e_comprovante !== true) return null;
  const valor = typeof d.valor === "number" && Number.isFinite(d.valor) && d.valor > 0 && d.valor < 1_000_000
    ? Math.round(d.valor * 100) / 100
    : null;
  if (valor === null) return null;
  const data = campo(d.pago_em, 10);
  return {
    valor,
    pagoEm: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    recebedorNome: campo(d.recebedor_nome, 200),
    recebedorChave: campo(d.recebedor_chave, 200),
    recebedorDocumento: campo(d.recebedor_documento, 40),
    pagadorNome: campo(d.pagador_nome, 200),
    banco: campo(d.banco, 120),
    idTransacao: campo(d.id_transacao, 120)?.replace(/\s/g, "") ?? null,
    identificador: campo(d.identificador, 120),
  };
}

export const leitorDeComprovanteGemini: LeitorDeComprovanteDePagamento = {
  async ler(t, arquivo) {
    if (!isGeminiConfigured) return null;
    const mimeType = arquivo.mimetype.split(";")[0].trim().toLowerCase();
    if (!TIPOS.includes(mimeType) || !arquivo.base64 || arquivo.base64.length > MAX_BASE64) return null;

    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), GEMINI.timeoutMs);
    try {
      const resposta = await fetch(`${GEMINI.base}/models/${MODELO}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI.chave },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: arquivo.base64 } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 1000, temperature: 0 },
        }),
        signal: controle.signal,
      });
      const corpo = await resposta.text();
      if (!resposta.ok) {
        console.warn(`[gemini/comprovante] ${t.tenantId}: o Gemini recusou a leitura (${resposta.status}): ${corpo.slice(0, 200)}`);
        return null;
      }
      const partes: { text?: string; thought?: boolean }[] = JSON.parse(corpo)?.candidates?.[0]?.content?.parts ?? [];
      const json = partes.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
      return dadosDaResposta(JSON.parse(json || "{}"));
    } catch (e) {
      const abortou = e instanceof Error && e.name === "AbortError";
      console.warn(`[gemini/comprovante] ${t.tenantId}: não deu para ler o comprovante${abortou ? " (demorou demais)" : ""}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      clearTimeout(alarme);
    }
  },
};
