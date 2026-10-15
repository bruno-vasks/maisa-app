/* ─────────────────────────────────────────────────────────────────────────────
 * O DOCUMENTO DA NOTA SIMULADA — número, PDF e o link assinado dele. ⚠️ SÓ SERVIDOR.
 *
 * O modo `simulado` (sem `FOCUS_NFE_TOKEN`) devolvia `emitida` sem número e sem PDF, e a tela
 * mostrava `nº undefined`. Desde 15/10/2026, EM HOMOLOGAÇÃO, ele devolve um número e um link de
 * PDF — o mesmo par que a Focus devolve numa emissão real —, e o resto do fluxo (tela, aviso no
 * WhatsApp do dono) segue igual para os dois. Pedido do Bruno para a conta demo do marketing.
 *
 * ⚠️ SÓ EM HOMOLOGAÇÃO. Em produção sem token a nota continua saindo sem documento: um PDF com
 * cara de nota, num negócio que acha que está faturando de verdade, é o erro que não se desfaz.
 *
 * ── ★ O LINK É UMA CAPACIDADE, E O INQUILINO NÃO VIAJA NELE ──
 *
 * Quem baixa o PDF é a Evolution, sem sessão nem cookie. Então o link carrega um HMAC da `ref`
 * (`?a=`), e a rota descobre o inquilino pela própria nota no banco — a mesma mecânica do
 * callback dos recibos. Sem `a` que confira, 404. A chave é a `SUPABASE_SERVICE_ROLE_KEY`, com
 * rótulo próprio: não é preciso uma variável nova na Vercel para o link existir, e quem tem
 * aquela chave já lê o banco inteiro — o PDF não abre nada que ela não abra.
 *
 * ── O PDF É ESCRITO À MÃO ──
 *
 * Uma página, duas fontes padrão do PDF (Helvetica e Helvetica-Bold, que todo leitor tem) e
 * WinAnsi para os acentos. Uma dependência de PDF para um documento de demonstração seria
 * peso no bundle de todas as rotas por causa de uma.
 * ────────────────────────────────────────────────────────────────────────────── */

import { createHmac, timingSafeEqual } from "node:crypto";

const ROTULO = "maisa-nf-pdf-v1:";

function chave(): string | null {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() || null;
}

function baseUrl(): string | null {
  const b = (process.env.MAISA_PUBLIC_URL ?? "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return /^https?:\/\//.test(b) ? b : null;
}

export function assinaturaDoPdf(ref: string): string | null {
  const k = chave();
  if (!k) return null;
  return createHmac("sha256", k).update(ROTULO + ref).digest("base64url").slice(0, 32);
}

export function confereAssinatura(ref: string, a: string | null): boolean {
  const certa = assinaturaDoPdf(ref);
  if (!certa || !a || a.length !== certa.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(certa));
}

/** `null` quando falta a URL pública ou a chave: aí a nota sai sem PDF, como antes. */
export function urlDoPdfSimulado(ref: string): string | null {
  const b = baseUrl();
  const a = assinaturaDoPdf(ref);
  return b && a ? `${b}/api/nf/pdf/${encodeURIComponent(ref)}?a=${a}` : null;
}

/** Seis dígitos crescentes no tempo: o lote escalonado não repete número entre duas notas. */
export function numeroSimulado(agora = Date.now()): string {
  return String(Math.floor(agora / 10) % 1_000_000).padStart(6, "0");
}

/* ── o documento ─────────────────────────────────────────────────────────────── */

export type DocumentoDaNota = {
  numero: string | null;
  emitidaEm: string | null;
  competencia: string | null;
  valor: number;
  discriminacao: string;
  tomador: { nome: string | null; cpf: string | null };
  prestador: {
    razaoSocial: string | null;
    cnpj: string | null;
    inscricaoMunicipal: string | null;
    codigoMunicipio: string | null;
    itemListaServico: string | null;
    aliquotaIss: number | null;
  };
  nomeDoNegocio: string | null;
};

const MUNICIPIOS: Record<string, string> = { "3550308": "São Paulo/SP" };

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const mesBR = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const reais = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const cnpjBR = (c: string | null) => {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (c ?? "—");
};
/** CPF do tomador com o meio à mostra só: o documento circula por WhatsApp. */
const cpfMascarado = (c: string | null) => {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
};

/* WinAnsi: Latin-1 passa direto; os poucos de fora têm código próprio. */
const WINANSI: Record<string, number> = { "—": 0x97, "–": 0x96, "•": 0x95, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "…": 0x85 };
function texto(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = WINANSI[ch] ?? ch.charCodeAt(0);
    const b = c <= 0xff ? c : 0x3f;
    out += b === 0x28 || b === 0x29 || b === 0x5c ? "\\" + String.fromCharCode(b) : String.fromCharCode(b);
  }
  return `(${out})`;
}

/* Larguras da Helvetica (por 1000) só do que se alinha à direita: dígitos e moeda. */
const LARGURA: Record<string, number> = { " ": 278, ",": 278, ".": 278, "/": 278, "R": 722, "$": 556, "º": 370, "N": 722 };
const largura = (s: string, tam: number) => [...s].reduce((a, ch) => a + (LARGURA[ch] ?? 556), 0) * tam / 1000;

function quebrar(s: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of s.split(/\s+/)) {
    if ((atual + " " + p).trim().length > max) { if (atual) linhas.push(atual); atual = p; }
    else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function pdfDaNota(d: DocumentoDaNota): Uint8Array {
  const W = 595, M = 40;
  const ops: string[] = [];
  const cor = (r: number, g: number, b: number, traço = false) => ops.push(`${r} ${g} ${b} ${traço ? "RG" : "rg"}`);
  const ret = (x: number, y: number, w: number, h: number, modo: "f" | "S") => ops.push(`${x} ${y} ${w} ${h} re ${modo}`);
  const escreve = (s: string, x: number, y: number, tam: number, negrito = false) =>
    ops.push(`BT /${negrito ? "F2" : "F1"} ${tam} Tf ${x} ${y} Td ${texto(s)} Tj ET`);
  const direita = (s: string, xFim: number, y: number, tam: number, negrito = false) =>
    escreve(s, xFim - largura(s, tam), y, tam, negrito);

  /* cabeçalho */
  cor(0.106, 0.169, 0.369); ret(0, 752, W, 90, "f");
  cor(1, 1, 1);
  escreve("NOTA FISCAL DE SERVIÇO ELETRÔNICA", M, 800, 15, true);
  escreve(d.prestador.razaoSocial ?? "—", M, 780, 10);
  direita(`Nº ${d.numero ?? "—"}`, W - M, 800, 15, true);
  direita(`Emitida em ${dataBR(d.emitidaEm)}`, W - M, 780, 10);

  let y = 720;
  const caixa = (titulo: string, linhas: [string, string][]) => {
    const h = 26 + linhas.length * 18;
    cor(0.85, 0.87, 0.92, true); ret(M, y - h, W - 2 * M, h, "S");
    cor(0.106, 0.169, 0.369); escreve(titulo.toUpperCase(), M + 12, y - 16, 8, true);
    cor(0.1, 0.1, 0.12);
    linhas.forEach(([rotulo, valor], i) => {
      const ly = y - 34 - i * 18;
      cor(0.42, 0.45, 0.5); escreve(rotulo, M + 12, ly, 9);
      cor(0.1, 0.1, 0.12); escreve(valor, M + 150, ly, 10);
    });
    y -= h + 14;
  };

  caixa("Prestador do serviço", [
    ["Razão social", d.prestador.razaoSocial ?? "—"],
    ["CNPJ", cnpjBR(d.prestador.cnpj)],
    ["Inscrição municipal", d.prestador.inscricaoMunicipal ?? "—"],
    ["Município", MUNICIPIOS[d.prestador.codigoMunicipio ?? ""] ?? (d.prestador.codigoMunicipio ? `IBGE ${d.prestador.codigoMunicipio}` : "—")],
  ]);
  caixa("Tomador do serviço", [
    ["Nome", d.tomador.nome ?? "—"],
    ["CPF", cpfMascarado(d.tomador.cpf)],
  ]);

  /* discriminação */
  const linhas = quebrar(d.discriminacao, 90);
  const hd = 34 + linhas.length * 15;
  cor(0.85, 0.87, 0.92, true); ret(M, y - hd, W - 2 * M, hd, "S");
  cor(0.106, 0.169, 0.369); escreve("DISCRIMINAÇÃO DO SERVIÇO", M + 12, y - 16, 8, true);
  cor(0.1, 0.1, 0.12);
  linhas.forEach((l, i) => escreve(l, M + 12, y - 36 - i * 15, 10));
  y -= hd + 14;

  caixa("Dados da prestação", [
    ["Competência", mesBR(d.competencia)],
    ["Item da lista de serviço", d.prestador.itemListaServico ?? "—"],
  ]);

  /* valores */
  const aliquota = d.prestador.aliquotaIss ?? 0;
  const iss = Math.round(d.valor * aliquota) / 100;
  const hv = 108;
  cor(0.95, 0.96, 0.98); ret(M, y - hv, W - 2 * M, hv, "f");
  cor(0.42, 0.45, 0.5);
  escreve("Valor dos serviços", M + 12, y - 24, 9);
  escreve(`Alíquota do ISS`, M + 12, y - 42, 9);
  escreve("Valor do ISS", M + 12, y - 60, 9);
  cor(0.1, 0.1, 0.12);
  direita(reais(d.valor), W - M - 12, y - 24, 10);
  direita(`${aliquota.toFixed(2).replace(".", ",")}%`, W - M - 12, y - 42, 10);
  direita(reais(iss), W - M - 12, y - 60, 10);
  cor(0.106, 0.169, 0.369);
  escreve("VALOR TOTAL DA NOTA", M + 12, y - 92, 11, true);
  direita(reais(d.valor), W - M - 12, y - 92, 14, true);

  /* rodapé */
  cor(0.55, 0.58, 0.63);
  escreve(`Emitida pela MAISA${d.nomeDoNegocio ? ` para ${d.nomeDoNegocio}` : ""}`, M, 40, 8);

  const conteudo = ops.join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  /* Cada caractere já é um byte (WinAnsi): `latin1` grava sem reinterpretar. */
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
