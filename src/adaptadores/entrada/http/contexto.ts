/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR DE ENTRADA (HTTP) — quem está pedindo.
 *
 * Transforma a sessão do Supabase em `ContextoTenant`. É o ÚNICO lugar do app onde
 * um contexto de inquilino nasce a partir de HTTP.
 *
 * ⚠️ A regra que não se negocia: `tenantId` vem do COOKIE, jamais da query string ou
 * do corpo. Foi exatamente esse descuido — id de inquilino vindo por parâmetro, sem
 * autenticar quem pedia — que abriu o pior furo da integração de onde este código veio:
 * bastava conhecer o id da vítima para sobrescrever a agenda dela.
 * ────────────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { createClient } from "@/adaptadores/saida/supabase/server";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { googleFaltando, isGoogleConfigured } from "@/adaptadores/saida/google/config";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";
import { lerPedido } from "./pedido-de-teste";

/** Ou o contexto, ou a resposta pronta que barra o pedido. Nunca os dois. */
export type Porteiro = { tenant: ContextoTenant } | { barrado: NextResponse };

export const barrou = (p: Porteiro): p is { barrado: NextResponse } => "barrado" in p;

/**
 * De qual NEGÓCIO é esta sessão.
 *
 * Antes isto era `tenantId = usuarioId`, com um comentário prometendo que "quando existir
 * a tabela de negócios, é AQUI que entra o select em `membros`". É este select. Nada mais
 * no app inteiro precisou saber da mudança — que era exatamente a aposta da porta.
 *
 * ⚠️ POR QUE NÃO DÁ MAIS PARA USAR O `usuarioId` COMO TENANT: as tabelas do
 * `002_multitenant.sql` têm `tenant_id uuid` com FK para `negocios(id)`. O id do usuário é
 * um uuid válido, então o TypeScript e o Postgres aceitam a atribuição sem reclamar — e
 * toda consulta simplesmente não acha linha nenhuma. Silencioso: a tela abre vazia e
 * parece "ainda não cadastrei nada".
 *
 * Usa `membros.padrao` para escolher quando a pessoa é de mais de um negócio. O índice
 * único parcial `ux_membros_padrao` garante no banco que existe no máximo um padrão por
 * pessoa, então `order by padrao desc` + `limit 1` é determinístico. O fallback por
 * `criado_em` cobre quem nunca teve padrão marcado (é o caso de quem virou membro por
 * convite, não por criar o negócio).
 */
export async function tenantDoUsuario(usuarioId: string): Promise<ContextoTenant | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("membros")
    .select("tenant_id")
    .eq("user_id", usuarioId)
    .order("padrao", { ascending: false })
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle<{ tenant_id: string }>();

  if (error) {
    console.error(`[entrada/http] falha ao resolver o negócio de ${usuarioId}: ${error.message}`);
    return null;
  }
  if (!data) return null;

  return {
    tenantId: data.tenant_id,
    usuarioId,
    ator: { tipo: "usuario", id: usuarioId },
  };
}

/**
 * Contexto de um inquilino sem login.
 *
 * Sem as chaves do Supabase o app roda como demonstração aberta (ver
 * `supabase/config.ts`). As rotas fiscais aceitam isso — a emissão fica em modo
 * simulado. As rotas de agenda NÃO: gravar token do Google sem dono seria pior do que
 * não conectar.
 */
export const TENANT_DEMO: ContextoTenant = {
  tenantId: "demo",
  usuarioId: "demo",
  ator: { tipo: "sistema", rotina: "demo-aberta" },
};

const json = (corpo: object, status: number) => NextResponse.json(corpo, { status });

/** Só quem está logado, sem dizer de qual negócio. */
export type Usuario = { usuarioId: string };
export type PorteiroDeUsuario = { usuario: Usuario } | { barrado: NextResponse };

export const barrouUsuario = (p: PorteiroDeUsuario): p is { barrado: NextResponse } => "barrado" in p;

/**
 * A sessão logada, SEM exigir negócio. O porteiro de `POST /api/negocio`.
 *
 * Precisa existir separado de `exigirSessao` por um motivo circular: `exigirSessao`
 * barra com 409 `sem_negocio` justamente quem ainda não tem inquilino — que é exatamente
 * quem vai criar um. Usá-lo na rota de criação tornaria impossível criar o primeiro
 * negócio de qualquer conta.
 *
 * ⚠️ Não devolve `ContextoTenant`, e isso é o ponto: não há inquilino ainda. Quem chamar
 * isto NÃO pode tocar em nenhuma porta de dados — só na `ProvisionadorDeNegocio`, que é
 * a única que produz tenant em vez de consumir. A tipagem impede o engano: `Usuario` não
 * é atribuível a `ContextoTenant`.
 */
export async function exigirUsuario(): Promise<PorteiroDeUsuario> {
  if (!isSupabaseConfigured) {
    /* Sem Supabase o app é demonstração aberta. Devolver o usuário de demonstração deixa
     * o fluxo de cadastro exercitável por `curl` — que é onde ele será afinado antes de
     * existir tela. O adaptador demo do provisionador é quem responde. */
    return { usuario: { usuarioId: TENANT_DEMO.usuarioId } };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { barrado: json({ ok: false, status: "nao_autenticado" }, 401) };
  return { usuario: { usuarioId: user.id } };
}

/** A sessão logada, ou 401. Usada pelas rotas que só precisam de "tem alguém aí?". */
export async function exigirSessao(): Promise<Porteiro> {
  if (!isSupabaseConfigured) {
    return { barrado: json({ ok: false, status: "login_necessario" }, 401) };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { barrado: json({ ok: false, status: "nao_autenticado" }, 401) };

  const tenant = await tenantDoUsuario(user.id);

  /**
   * Logado, mas sem negócio. É um estado NOVO — e é o primeiro login de todo mundo.
   *
   * Antes não existia: `tenantId` era o próprio `usuarioId`, então ter conta já era ter
   * inquilino. Agora o negócio é uma linha em `negocios` + `membros`, criada por
   * `criar_negocio()` (arquivo `005_provisionar.sql`) — e entre "criei a conta" e "criei o
   * negócio" existe uma janela real.
   *
   * 409 e status próprio, não 401: 401 mandaria a tela para o login de novo, num laço
   * infinito com uma sessão perfeitamente válida. Existe uma AÇÃO que resolve (provisionar
   * o negócio), que é exatamente a semântica de 409 que `respostas.ts` já usa para
   * `reconectar`.
   *
   * A AÇÃO agora existe de verdade: `POST /api/negocio`. Até 13/08/2026 esta resposta
   * dizia "Rode criar_negocio() no Supabase" — uma instrução de desenvolvedor entregue ao
   * cliente final, que era a confissão de que o produto não sabia se ativar sozinho. O
   * campo `acao` é contrato com a tela: ela usa para saber para onde mandar a pessoa.
   */
  if (!tenant) {
    return {
      barrado: json(
        {
          ok: false,
          status: "sem_negocio",
          info: "Esta conta ainda não tem um negócio.",
          acao: { metodo: "POST", rota: "/api/negocio" },
        },
        409,
      ),
    };
  }
  return { tenant };
}

/** Idem, mais a exigência de que a integração com o Google exista neste ambiente. */
export async function exigirSessaoComGoogle(): Promise<Porteiro> {
  if (!isGoogleConfigured) {
    return { barrado: json({ ok: false, status: "nao_configurado", faltando: googleFaltando() }, 400) };
  }
  return exigirSessao();
}

/**
 * A sessão quando houver; o inquilino de demonstração quando o Supabase estiver
 * desligado. É o que as rotas fiscais usam — elas nunca gravam credencial de ninguém.
 */
export async function sessaoOuDemo(): Promise<Porteiro> {
  if (!isSupabaseConfigured) return { tenant: TENANT_DEMO };
  return exigirSessao();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A EQUIPE — quem pode liberar teste (09/10/2026).
 *
 * A primeira ação do app que um usuário faz SOBRE OUTRO negócio. Duas portas, e as duas precisam
 * passar: o clique é de alguém da equipe, e o negócio vem de um pedido assinado por nós
 * (`pedido-de-teste.ts`), nunca de um id escrito no request.
 *
 * ⚠️ A EQUIPE É LISTA DE ID, NÃO DE E-MAIL. A confirmação de e-mail está desligada no Supabase
 * (30/09/2026, para o funil não travar), então qualquer pessoa cria conta com qualquer e-mail que
 * ainda não tenha dono. Uma lista de e-mails daria a equipe a quem se cadastrasse primeiro com o
 * e-mail certo. O id não se escolhe.
 *
 * `MAISA_EQUIPE` = ids de usuário separados por vírgula. Vazia, ninguém libera. A tela de
 * `/liberar` mostra o id de quem está logado quando barra, que é como se descobre o que pôr ali.
 * ────────────────────────────────────────────────────────────────────────────── */

export type PorteiroDaEquipe = { equipe: Usuario } | { barrado: NextResponse };

export const barrouEquipe = (p: PorteiroDaEquipe): p is { barrado: NextResponse } => "barrado" in p;

const equipe = (): string[] =>
  (process.env.MAISA_EQUIPE ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

export async function exigirEquipe(): Promise<PorteiroDaEquipe> {
  if (!isSupabaseConfigured) {
    return { barrado: json({ ok: false, status: "login_necessario" }, 401) };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { barrado: json({ ok: false, status: "nao_autenticado" }, 401) };

  const lista = equipe();
  if (!lista.includes(user.id.toLowerCase())) {
    return {
      barrado: json(
        {
          ok: false,
          status: lista.length === 0 ? "equipe_nao_configurada" : "fora_da_equipe",
          /* O próprio id, para quem está montando a lista. Não é segredo de ninguém além de
           * quem já está logado com ele. */
          usuarioId: user.id,
        },
        403,
      ),
    };
  }
  return { equipe: { usuarioId: user.id } };
}

/**
 * O negócio de um pedido de teste, como `ContextoTenant` de ator `sistema`. `null` = pedido
 * torto, de outra chave ou vencido.
 *
 * Ator `sistema` porque a escrita em `assinaturas` só passa com a service role (a RLS não deixa
 * ninguém mexer na própria assinatura). O `usuarioId` é o de quem clicou, para a auditoria.
 * Chame SÓ depois de `exigirEquipe()`.
 */
export function contextoDoPedido(pedido: string | null | undefined, quem: Usuario): ContextoTenant | null {
  const tenantId = lerPedido(pedido);
  if (!tenantId) return null;
  return { tenantId, usuarioId: quem.usuarioId, ator: { tipo: "sistema", rotina: "equipe:liberar-teste" } };
}
