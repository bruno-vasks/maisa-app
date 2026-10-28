import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, exigirSessao } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";
import type { DadosDoTitular } from "@/nucleo/portas/saida/provedor-de-recebimentos";

// ─────────────────────────────────────────────────────────────────────────────
// ATIVAR RECEBIMENTOS — a subconta no Asaas, sem o profissional ver o Asaas (27/10/2026).
//
// POST /api/recebimentos/conta  { documento, nome, email, celular, cep, endereco, numero,
//                                 complemento?, bairro, faturamentoMensal, nascimento? | tipoDeEmpresa? }
//   →  { conta: { situacao, pendencias } }
//
// A opção B, ATRÁS DE FLAG: sem `RECEBIMENTOS_ASAAS` responde `nao_configurado`. Quem confere os
// campos é o caso de uso (`titularConferido`); quem guarda a chave da subconta é o adaptador. A
// situação depois disso vem no `GET /api/recebimentos`, em `asaas`.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const porteiro = await exigirSessao();
  if (barrou(porteiro)) return porteiro.barrado;

  try {
    const c = await req.json().catch(() => ({}));
    const texto = (v: unknown) => (typeof v === "string" ? v : "");
    const dados: DadosDoTitular = {
      documento: texto(c?.documento),
      nome: texto(c?.nome),
      email: texto(c?.email),
      celular: texto(c?.celular),
      cep: texto(c?.cep),
      endereco: texto(c?.endereco),
      numero: texto(c?.numero),
      complemento: texto(c?.complemento) || null,
      bairro: texto(c?.bairro),
      faturamentoMensal: Number(String(c?.faturamentoMensal ?? "").replace(/\./g, "").replace(",", ".")),
      nascimento: texto(c?.nascimento) || null,
      tipoDeEmpresa: (texto(c?.tipoDeEmpresa) || null) as DadosDoTitular["tipoDeEmpresa"],
    };
    const conta = await app.abrirContaDeRecebimentos(porteiro.tenant, dados);
    return NextResponse.json({ ok: true, status: "ok", conta });
  } catch (e) {
    return falha("recebimentos/conta", e);
  }
}
