import { NextResponse } from "next/server";
import { app } from "@/composicao";
import { barrou, sessaoOuDemo } from "@/adaptadores/entrada/http/contexto";
import { falha } from "@/adaptadores/entrada/http/respostas";

// ─────────────────────────────────────────────────────────────────────────────
// OS CLIENTES — agora graváveis.
//
// PUT  /api/clientes  { id, nome, telefone, email?, cpf?, canal?, servicoId?, ativo? }
//                     →  { cliente }
// POST /api/clientes  { nome, telefone?, cpf? }  →  { cliente, jaExistia }
//
// ── ★ POR QUE ESTA ROTA EXISTE (24/08/2026) ──
//
// Reclamação do Bruno, literal: *"acabei de perceber que é impossível editar clientes pelo
// front. não só na aba clientes mas na faturamento também."*
//
// Estava exato, e o buraco tinha a forma de sempre neste repositório: tabela existia, RLS
// existia (`clientes` está no grupo uniforme do `003_rls.sql` desde o começo), duas telas
// abriam a gaveta do cliente — e não existia caminho entre elas. O único controle era um
// liga/desliga que gravava em `db.cliAtivo`, no `localStorage`: o dono tirava alguém do
// faturamento, via a lista mudar, dava F5, e a pessoa voltava. Mesmo defeito de
// `svcEdit`/`svcNovos`, consertado em 15/08/2026 — só que este ficou nove dias de pé.
//
// Dois campos custavam mais que cadastro:
//
//   • `telefone` é IDENTIDADE. `telefone_chave` (coluna gerada, 8 últimos dígitos) é por
//     onde `clientePorTelefone` reconhece quem está falando no WhatsApp. Um dígito errado
//     fazia a MAISA tratar cliente antigo como desconhecido, e consertar exigia SQL.
//   • `cpf` é o que LIBERA A NOTA. Sem ele a prefeitura recusa, e o `emitiveis` tira a
//     pessoa do lote de propósito. A tela de Faturamento escrevia "sem CPF — a prefeitura
//     recusa sem ele" e não oferecia onde escrever o CPF: aviso sem porta, o mesmo defeito
//     que criou a tela de Contatos em 17/08.
//
// ── POST CRIA — SÓ O NOME É OBRIGATÓRIO (24/09/2026) ──
//
// *"estamos sem botão no front para adicionar novos clientes"*, e em seguida: *"o contrato
// da Rebots pede somente CPF"*. Por isso telefone e CPF são opcionais — dá para cadastrar
// alguém só para emitir o recibo. Com telefone, `cadastrarCliente` deduplica pela mesma
// chave do agente: número que já é de alguém devolve esse alguém com `jaExistia: true`, e
// a tela abre o cadastro dele em vez de duplicar. Sem telefone não há chave, e cria.
//
// ── PUT, E SÓ EDITA ──
//
// Ao contrário de `/api/servicos` e `/api/faqs`, aqui `id` é OBRIGATÓRIO — corpo sem id é
// recusado, não interpretado como "crie um". Criar cliente já tem porta e é outra:
// `garantirCliente`, que deduplica por telefone e é como quem marca pelo WhatsApp entra no
// cadastro. Um segundo caminho de criação, este sem deduplicação, daria o mesmo cliente
// duas vezes — um pela tela e um pelo agente.
//
// PUT e não PATCH mesmo aceitando campo parcial: `nome` e `telefone` vêm sempre (a gaveta
// os tem em mãos), e os opcionais distinguem `undefined` ("não mexe") de `null` ("apaga").
// É o verbo que o resto do painel usa para gravar cadastro, e divergir por causa de uma
// nuance de RFC obrigaria quem lê o store a lembrar de qual rota usa qual.
//
// ⚠️ `teste` NÃO É ACEITO. Marcar um tomador como teste faz a nota REAL dele se cancelar
// sozinha segundos depois de autorizada. É interruptor de comportamento fiscal, e não
// pertence ao formulário onde se conserta um telefone digitado errado.
//
// `sessaoOuDemo` e não `exigirSessao`, como o `/api/cadastro` que esta rota completa: num
// ambiente sem Supabase o adaptador demo responde, e é assim que a gaveta é afinada antes
// de haver banco. Quem barra de verdade quando há banco é a RLS.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "payload_invalido", info: "Corpo não é JSON." },
      { status: 400 },
    );
  }

  const { id, nome, telefone, email, cpf, canal, servicoId, ativo, valorSessao, diaRecibo, recibosPorMes } =
    (corpo ?? {}) as Record<string, unknown>;

  try {
    /* A validação inteira mora no caso de uso — CPF que não fecha no dígito, telefone
     * curto, telefone que já é de outro cliente, e-mail sem domínio. Aqui só se traduz
     * JSON: regra escrita na rota valeria só para quem entra por HTTP, e o wizard de
     * onboarding e um futuro import de planilha precisam da mesma recusa.
     *
     * ⚠️ O ternário de cada opcional é o CONTRATO, não estilo. `undefined` significa "a
     * tela não mandou este campo, não mexa" e `null` significa "apaga". Um
     * `String(email ?? "")` aqui apagaria o e-mail em todo patch que só mexeu no CPF —
     * porque a gaveta grava campo por campo, à medida que o dono digita. */
    const cliente = await app.ajustarCliente(porteiro.tenant, {
      id: String(id ?? ""),
      nome: String(nome ?? ""),
      telefone: String(telefone ?? ""),
      ...(email === undefined ? {} : { email: email === null ? null : String(email) }),
      ...(cpf === undefined ? {} : { cpf: cpf === null ? null : String(cpf) }),
      ...(canal === undefined ? {} : { canal: canal as never }),
      ...(servicoId === undefined
        ? {}
        : { servicoId: servicoId === null ? null : String(servicoId) }),
      ...(ativo === undefined ? {} : { ativo: Boolean(ativo) }),
      ...(valorSessao === undefined
        ? {}
        : { valorSessao: valorSessao === null || valorSessao === "" ? null : Number(valorSessao) }),
      ...(diaRecibo === undefined
        ? {}
        : { diaRecibo: diaRecibo === null || diaRecibo === "" ? null : Number(diaRecibo) }),
      ...(recibosPorMes === undefined || recibosPorMes === null ? {} : { recibosPorMes: Number(recibosPorMes) }),
    });

    return NextResponse.json({ ok: true, status: "ok", cliente });
  } catch (e) {
    return falha("clientes", e);
  }
}

export async function POST(req: Request) {
  const porteiro = await sessaoOuDemo();
  if (barrou(porteiro)) return porteiro.barrado;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "payload_invalido", info: "Corpo não é JSON." },
      { status: 400 },
    );
  }

  const { nome, telefone, cpf } = (corpo ?? {}) as Record<string, unknown>;
  try {
    const r = await app.cadastrarCliente(porteiro.tenant, {
      nome: String(nome ?? ""),
      telefone: String(telefone ?? ""),
      cpf: String(cpf ?? ""),
    });
    return NextResponse.json({ ok: true, status: "ok", ...r });
  } catch (e) {
    return falha("clientes", e);
  }
}
