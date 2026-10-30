/* ─────────────────────────────────────────────────────────────────────────────
 * O PIX COPIA E COLA — o código que o cliente cola no app do banco, com o valor já preenchido.
 *
 * ★ PEDIDO DO BRUNO (27/10/2026), vindo do Smiller: o profissional recebe na chave Pix de sempre,
 * sem conta em gateway nenhum, e a MAISA manda o código com o valor certo do atendimento. É o
 * BR Code ESTÁTICO do Banco Central (Manual de Padrões para Iniciação do Pix): campos EMV (id,
 * tamanho com dois dígitos, valor) fechados por um CRC16.
 *
 * No Smiller isto mora em SQL (`pix_copia_e_cola` e vizinhas, migração f2e). Aqui é função pura,
 * como o resto da conta do produto (`vagas.ts`): o teste roda sem banco, e a rotina, a tela e o
 * agente usam a mesma.
 *
 * ── ⚠️ A CHAVE TEM TIPO, E QUEM DIZ O TIPO É O DONO ──
 *
 * O Smiller adivinha o tipo pelo formato, e onze dígitos são ambíguos: CPF ou celular. A
 * adivinhação testa o dígito verificador do CPF, e um celular em cada cem passa nesse teste. Aí
 * o código sai com a chave CPF "71999990000", que não é de ninguém ou, pior, é de um estranho.
 * Aqui o tipo é escolhido na tela, como em todo app de banco, e `chavePix` só normaliza dentro
 * dele. `tipoProvavel` existe só para a tela sugerir o tipo ao colar a chave.
 *
 * ── ⚠️ O QUE O CÓDIGO NÃO GARANTE ──
 *
 * Que o dinheiro chegou. Pix estático não avisa ninguém: quem diz que pagou é o comprovante, e
 * quem confirma é o profissional, olhando o extrato (ver `recebimentos.ts`).
 * ────────────────────────────────────────────────────────────────────────────── */

import { cpfValido, emailPlausivel, soDigitos } from "./clientes";

/** Os tetos do padrão, em bytes. O texto já sai sem acento, então byte e letra coincidem. */
export const PIX_NOME_MAX = 25;
export const PIX_CIDADE_MAX = 15;
export const PIX_IDENTIFICADOR_MAX = 25;
/** Chave de e-mail: o DICT do Banco Central aceita até 77 caracteres. */
const PIX_EMAIL_MAX = 77;

export const TIPOS_DE_CHAVE = ["cpf", "cnpj", "telefone", "email", "aleatoria"] as const;
export type TipoDeChavePix = (typeof TIPOS_DE_CHAVE)[number];

export const ehTipoDeChave = (v: unknown): v is TipoDeChavePix =>
  typeof v === "string" && (TIPOS_DE_CHAVE as readonly string[]).includes(v);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* As marcas de acento que o NFD separa da letra (U+0300 a U+036F). Montada por código de
 * caractere, e não escrita no fonte, para o arquivo não depender de como um acento solto é
 * gravado. */
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** O dígito verificador do CNPJ. Chave de 14 dígitos com DV errado é quase sempre digitação. */
export function cnpjValido(v?: string | null): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (corpo: string) => {
    let soma = 0;
    let peso = corpo.length - 7;
    for (let i = 0; i < corpo.length; i++) {
      soma += Number(corpo[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = dv(d.slice(0, 12));
  const segundo = dv(d.slice(0, 12) + primeiro);
  return d.endsWith(`${primeiro}${segundo}`);
}

/**
 * A chave como o Pix a conhece, dentro do tipo escolhido. `null` quando o texto não é uma chave
 * desse tipo: é a recusa que a tela mostra antes de gravar.
 *
 *   e-mail → minúsculo · aleatória → minúscula · CPF e CNPJ → só dígitos · celular → +55DDDNÚMERO
 */
export function chavePix(tipo: TipoDeChavePix, bruta: string | null | undefined): string | null {
  const v = (bruta ?? "").trim();
  const d = soDigitos(v);
  switch (tipo) {
    case "email":
      return emailPlausivel(v) && v.length <= PIX_EMAIL_MAX ? v.toLowerCase() : null;
    case "aleatoria":
      return UUID.test(v) ? v.toLowerCase() : null;
    case "cpf":
      return cpfValido(d) ? d : null;
    case "cnpj":
      return cnpjValido(d) ? d : null;
    case "telefone": {
      /* Com o 55 na frente ou sem ele. Um celular do DDD 55 (RS) sem o país tem onze dígitos e
       * começa com 55: só se tira o 55 de quem tem doze ou treze. */
      const nacional = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
      return nacional.length === 10 || nacional.length === 11 ? `+55${nacional}` : null;
    }
  }
}

/**
 * O tipo que a chave colada parece ter, para a tela já deixar escolhido. `null` quando não dá
 * para saber: onze dígitos que são CPF válido E têm cara de celular (o terceiro dígito é 9).
 */
export function tipoProvavel(bruta: string | null | undefined): TipoDeChavePix | null {
  const v = (bruta ?? "").trim();
  if (!v) return null;
  if (v.includes("@")) return "email";
  if (UUID.test(v)) return "aleatoria";
  if (v.startsWith("+")) return "telefone";
  const d = soDigitos(v);
  if (d.length === 14) return "cnpj";
  if (d.length === 12 || d.length === 13 || d.length === 10) return "telefone";
  if (d.length === 11) {
    const celular = d[2] === "9";
    const cpf = cpfValido(d);
    if (cpf && !celular) return "cpf";
    if (celular && !cpf) return "telefone";
  }
  return null;
}

/**
 * Nome e cidade como o BR Code aceita: sem acento, sem símbolo (o padrão conta bytes, e banco
 * antigo recusa acento), cortados no teto.
 */
export function textoDoPix(bruto: string | null | undefined, max: number): string {
  return (bruto ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** O identificador do Pix (campo 62-05): só letras e números, até 25. Sem ele, `***`. */
export function identificadorDoPix(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, PIX_IDENTIFICADOR_MAX) || "***";
}

const bytes = (s: string) => new TextEncoder().encode(s);

/** Campo EMV: id, tamanho em bytes com dois dígitos, valor. */
export function campoPix(id: string, valor: string): string {
  return `${id}${String(bytes(valor).length).padStart(2, "0")}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF) sobre os bytes, em quatro dígitos hexadecimais. */
export function crc16(texto: string): string {
  const b = bytes(texto);
  let crc = 0xffff;
  for (let i = 0; i < b.length; i++) {
    crc ^= b[i] << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** O valor no formato do campo 54: ponto decimal, dois decimais, sem milhar. */
export const valorDoPix = (valor: number) => (Math.round(valor * 100) / 100).toFixed(2);

/**
 * O Pix copia e cola estático.
 *
 * `chave` já normalizada (`chavePix`); é como ela fica gravada. Sem valor (ausente ou zero), quem
 * paga digita o valor no banco.
 */
export function pixCopiaECola(p: {
  chave: string;
  nome: string | null;
  cidade: string | null;
  valor?: number | null;
  identificador?: string | null;
}): string {
  const corpo =
    "000201" +
    campoPix("26", campoPix("00", "br.gov.bcb.pix") + campoPix("01", p.chave)) +
    "52040000" +
    "5303986" +
    (p.valor && p.valor > 0 ? campoPix("54", valorDoPix(p.valor)) : "") +
    "5802BR" +
    campoPix("59", textoDoPix(p.nome, PIX_NOME_MAX) || "RECEBEDOR") +
    campoPix("60", textoDoPix(p.cidade, PIX_CIDADE_MAX) || "BRASIL") +
    campoPix("62", campoPix("05", identificadorDoPix(p.identificador))) +
    "6304";
  return corpo + crc16(corpo);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O CÓDIGO DA TRANSAÇÃO — o id fim a fim que todo comprovante de Pix traz (30/10/2026).
 *
 * ★ PEDIDO DO BRUNO: deixar o comprovante mais difícil de falsificar, sem custo, enquanto a
 * confirmação automática não existe. O código não prova que o dinheiro chegou (isso só o extrato),
 * mas ele carrega dois fatos que um comprovante editado costuma errar.
 *
 * O formato é do Manual de Padrões para Iniciação do Pix: `E` + o ISPB de quem iniciou o Pix
 * (8 dígitos) + data e hora em UTC (`AAAAMMDDHHmm`) + 11 caracteres. 32 ao todo.
 *
 * ⚠️ A HORA NÃO É EXATA. O Pix aceita o código com até 12 horas de diferença do processamento, e
 * Pix agendado costuma levar uma hora fixa do dia da liquidação. Quem usa a hora daqui compara com
 * folga de horas, nunca de minutos.
 *
 * ⚠️ O ISPB É DE QUEM INICIOU. Quase sempre é o banco de quem pagou; num Pix iniciado pelo Open
 * Finance (uma carteira pagando a partir de outro banco), é o da iniciadora. Por isso banco
 * diferente vira aviso para o dono olhar, nunca recusa.
 * ────────────────────────────────────────────────────────────────────────────── */

export type IdFimAFim = { ispb: string; em: Date };

/** O código lido, ou `null` se não tem o formato do Pix (o código de autenticação de um banco,
 *  por exemplo). Quem recebe `null` não conclui nada. */
export function lerIdFimAFim(bruto: string | null | undefined): IdFimAFim | null {
  const m = /^E(\d{8})(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})[A-Za-z0-9]{11}$/.exec((bruto ?? "").replace(/\s/g, "").toUpperCase());
  if (!m) return null;
  const [, ispb, a, mes, d, h, min] = m;
  if (+h > 23 || +min > 59) return null;
  const em = new Date(Date.UTC(+a, +mes - 1, +d, +h, +min));
  if (em.getUTCFullYear() !== +a || em.getUTCMonth() !== +mes - 1 || em.getUTCDate() !== +d) return null;
  return { ispb, em };
}

/**
 * As instituições que mais aparecem num comprovante, com o ISPB conferido na lista de
 * participantes do STR do Banco Central (`ParticipantesSTR.csv`, 30/10/2026) e os nomes como o
 * cliente e o app do banco escrevem. ISPB fora daqui não é suspeito: só não dá para comparar.
 *
 * `grupo` junta marcas que pagam pelo ISPB uma da outra (o iti pelo Itaú, o Next pelo Bradesco,
 * o PicPay e o Original). Na dúvida, mais grupo: o custo de juntar é deixar passar um aviso; o de
 * separar é acusar um pagamento de verdade.
 *
 * Cooperativas (Sicoob, Sicredi, Ailos, Cresol, Unicred) ficaram de fora de propósito: cada
 * cooperativa tem o próprio ISPB, e o nome no comprovante é o do sistema.
 */
const INSTITUICOES: { ispb: string; nome: string; apelidos: string[]; grupo?: string }[] = [
  { ispb: "00000000", nome: "Banco do Brasil", apelidos: ["banco do brasil", "bb"] },
  { ispb: "00360305", nome: "Caixa", apelidos: ["caixa"] },
  { ispb: "60701190", nome: "Itaú", apelidos: ["itau", "iti"] },
  { ispb: "60746948", nome: "Bradesco", apelidos: ["bradesco", "next"] },
  { ispb: "90400888", nome: "Santander", apelidos: ["santander"] },
  { ispb: "18236120", nome: "Nubank", apelidos: ["nubank", "nu pagamentos"] },
  { ispb: "00416968", nome: "Inter", apelidos: ["inter", "banco inter"] },
  { ispb: "31872495", nome: "C6", apelidos: ["c6", "c6 bank"] },
  { ispb: "10573521", nome: "Mercado Pago", apelidos: ["mercado pago", "mercadopago"] },
  { ispb: "22896431", nome: "PicPay", apelidos: ["picpay"], grupo: "picpay" },
  { ispb: "92894922", nome: "Original", apelidos: ["original", "banco original"], grupo: "picpay" },
  { ispb: "08561701", nome: "PagBank", apelidos: ["pagbank", "pagseguro"] },
  { ispb: "16501555", nome: "Stone", apelidos: ["stone", "ton"] },
  { ispb: "37880206", nome: "Cora", apelidos: ["cora"] },
  { ispb: "18189547", nome: "InfinitePay", apelidos: ["infinitepay", "cloudwalk"] },
  { ispb: "20855875", nome: "Neon", apelidos: ["neon"] },
  { ispb: "09089356", nome: "Efí", apelidos: ["efi", "efi bank", "gerencianet"] },
  { ispb: "19540550", nome: "Asaas", apelidos: ["asaas"] },
  { ispb: "30306294", nome: "BTG", apelidos: ["btg", "btg pactual"] },
  { ispb: "92702067", nome: "Banrisul", apelidos: ["banrisul"] },
  { ispb: "59285411", nome: "Pan", apelidos: ["banco pan"] },
  { ispb: "10664513", nome: "Agibank", apelidos: ["agibank"] },
  { ispb: "58160789", nome: "Safra", apelidos: ["safra"] },
];

const semAcento = (v: string) => v.normalize("NFD").replace(ACENTOS, "").toLowerCase();

/** A instituição deste ISPB, se ela está na tabela. */
export const instituicaoDoIspb = (ispb: string) => INSTITUICOES.find((i) => i.ispb === ispb) ?? null;

/** As instituições que o texto nomeia, por palavra inteira ("Itaú Unibanco" → Itaú; "Banco
 *  Interior" não é o Inter). */
export function instituicoesNoTexto(texto: string | null | undefined): typeof INSTITUICOES {
  if (!texto) return [];
  const t = ` ${semAcento(texto).replace(/[^a-z0-9]+/g, " ")} `;
  return INSTITUICOES.filter((i) => i.apelidos.some((a) => t.includes(` ${a} `)));
}

/** O ISPB do código e a instituição escrita são a mesma (ou do mesmo grupo)? `null`: não dá para dizer. */
export function mesmaInstituicao(ispb: string, texto: string | null | undefined): boolean | null {
  const doCodigo = instituicaoDoIspb(ispb);
  const escritas = instituicoesNoTexto(texto);
  if (!doCodigo || !escritas.length) return null;
  return escritas.some((i) => i.ispb === ispb || (i.grupo != null && i.grupo === doCodigo.grupo));
}
