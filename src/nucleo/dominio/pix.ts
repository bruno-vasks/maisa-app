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
