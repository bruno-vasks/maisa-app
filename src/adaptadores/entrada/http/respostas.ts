/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE ENTRADA (HTTP) — erro de domínio vira status HTTP.
 *
 * O núcleo lança `DadoInvalido`, `PrecisaReconectar`, `LimiteDoProvedor`. Nada disso
 * é HTTP. A tradução vive aqui, num lugar só, e é o que garante que duas rotas nunca
 * respondam diferente para a mesma falha.
 *
 * ⚠️ Os nomes de `status` são CONTRATO com o navegador: o store casa string por string
 * (ver `RESPOSTA_GOOGLE` e o tratamento de `reconectar`/`limite` em ui/estado/store).
 * Mudar um nome aqui é mudar o comportamento da tela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import {
  DadoInvalido, LimiteDoProvedor, NaoConfigurado, NaoEncontrado, NaoSuportado,
  PrecisaReconectar,
} from "@/nucleo/dominio/erros";

/** Campo do pedido → status que a tela conhece. O que não estiver aqui é payload_invalido. */
const STATUS_POR_CAMPO: Record<string, string> = {
  agendaId: "profissional_invalido",
  janela: "janela_invalida",
};

export function falha(escopo: string, e: unknown): NextResponse {
  if (e instanceof NaoConfigurado) {
    return NextResponse.json({ ok: false, status: "nao_configurado", faltando: e.faltando }, { status: 400 });
  }

  if (e instanceof DadoInvalido) {
    const status = (e.campo && STATUS_POR_CAMPO[e.campo]) || "payload_invalido";
    return NextResponse.json({ ok: false, status, info: e.motivo }, { status: 400 });
  }

  /* 501 e não 400: o pedido estava correto e o SERVIDOR é que não oferece o recurso.
   * 400 diria à tela "você mandou errado", e ela tentaria corrigir um pedido que não tem
   * defeito. A tela deveria ter perguntado por `capacidades()` antes de desenhar o botão;
   * este status é o que a faz descobrir que não perguntou. */
  if (e instanceof NaoSuportado) {
    return NextResponse.json(
      { ok: false, status: "nao_suportado", info: e.message },
      { status: 501 },
    );
  }

  if (e instanceof NaoEncontrado) {
    return NextResponse.json({ ok: false, status: "payload_invalido", info: e.message }, { status: 400 });
  }

  // 409 e não 500: existe uma AÇÃO do usuário que resolve, e a tela oferece o botão.
  if (e instanceof PrecisaReconectar) {
    return NextResponse.json({ ok: false, status: "reconectar", info: e.motivo }, { status: 409 });
  }

  // 429: transitório. A tela não grita — espera e tenta de novo sozinha.
  if (e instanceof LimiteDoProvedor) {
    return NextResponse.json({ ok: false, status: "limite", info: e.message }, { status: 429 });
  }

  console.error(`[${escopo}]`, String(e));
  return NextResponse.json(
    { ok: false, status: "erro", info: fraseParaATela(e) },
    { status: 502 },
  );
}

/**
 * O que a tela pode ler de um erro inesperado.
 *
 * ⚠️ NÃO É "esconder tudo". Várias mensagens de provedor são escritas PARA o usuário e são
 * a única pista do que consertar — "A Focus recusou o certificado: senha incorreta". O que
 * se barra é a frase com cara de banco ou de biblioteca, que vazava crua até 24/09/2026
 * ("null value in column "telefone" of relation "clientes" violates not-null constraint").
 * Ela continua inteira no `console.error` de cima, que é onde quem mantém procura.
 */
const JARGAO = /violates|constraint|relation "|column "|schema cache|PGRST|duplicate key|invalid input syntax|null value|syntax error|permission denied for|JWT|ECONN|ETIMEDOUT|fetch failed|TypeError|undefined is not|Cannot read prop|Unexpected token/i;
export function fraseParaATela(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg || JARGAO.test(msg)) return "Algo falhou do nosso lado. Tente de novo em alguns instantes.";
  return msg;
}
