import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./config";
import { contaTemWhatsapp, ROTA_DO_WHATSAPP } from "@/nucleo/dominio/whatsapp-da-conta";

// Rotas que NÃO exigem login: a própria tela de login, o callback de OAuth, as APIs
// (as rotas /api fazem a própria checagem de sessão e devolvem 401 em JSON) e as
// landing pages de marketing (públicas por natureza — topo/meio/base de funil).
//
// ⚠️ `/lp` ENTROU EM 14/08/2026, E A FALTA DELE ERA O BUG MAIS CARO DO PRODUTO.
//
// As LPs em `/terapeutas` e `/barbeiros` são rotas do Next; a LP OFICIAL de terapeutas é
// um bundle estático servido de `public/lp/` — e `/lp` nunca esteve nesta lista. Como ela
// é a única página do produto com link de pagamento, o funil inteiro terminava num
// redirect para `/login`: o visitante que clicasse em comprar era mandado para uma tela
// de login de um produto que ele ainda não assinou.
//
// Não quebrou nada visível para quem desenvolve — logado, a página abre. O sintoma era
// zero venda, que é o sintoma que ninguém consegue atribuir a uma linha de código.
// ⚠️ `/barbeiro` É UMA ENTRADA PRÓPRIA, e não um caso do `/barbeiros` abaixo. A
// comparação é por SEGMENTO (`p` ou `p + "/"`), de propósito — sem isso, uma rota futura
// chamada `/barbeiros-admin` entraria de graça. O efeito colateral é que o singular não
// herda nada do plural: as duas LPs de barbearia moram em `/barbeiros` (v3) e `/barbeiro`
// (v4, a variante filmada), e esquecer esta linha põe a segunda atrás do login.
// ⚠️ `/cadastro` ENTROU EM 15/08/2026 e é o caso mais óbvio de todos: barrar a tela de
// criar conta redireciona para o login exatamente quem não tem login — o laço perfeito, e
// invisível para quem desenvolve porque desenvolvedor já está logado. Mesma família do
// `/lp` acima, e a mesma consequência: zero venda.
const PUBLIC_PREFIXES = [
  "/login", "/cadastro", "/auth", "/api", "/lp", "/barbeiro", "/barbeiros", "/terapeutas",
  /* ⚠️ `/assinar` É A PÁGINA DE COMPRA — a que o anúncio aponta. Atrás do login, o
   * middleware mandaria para o `/login` exatamente quem está indo pagar, e o sintoma
   * seria **zero venda**: nenhum erro, nenhum log, só ninguém comprando. A checagem é por
   * SEGMENTO, então `/assinar` não herda de `/cadastro` nem de `/lp`. */
  "/assinar",
  /* ⚠️ `/sobre` É A HOME PÚBLICA, e ela existe para o Google conseguir VERIFICAR o app:
   * a exigência é uma página acessível que descreva o produto e linke a política. Uma home
   * atrás do login seria a piada perfeita — a página que prova que o app é acessível,
   * pedindo senha. A raiz `/` não serve: ela é o app. */
  "/sobre",
  /* ⚠️ JURÍDICAS SÃO PÚBLICAS POR EXIGÊNCIA EXTERNA, não por conveniência. O Google
   * confere as URLs de privacidade e termos ao verificar um app que pede escopo sensível —
   * e `calendar.events` é sensível. Atrás do login, o revisor abre a política e vê um
   * formulário de senha: reprovação, e a fila leva semanas para tentar de novo.
   * Também são as URLs que o rodapé do produto aponta para o próprio cliente. */
  "/privacidade", "/termos",
  /* ⚠️ `/esqueci` é PÚBLICA pela razão mais óbvia possível: ela atende exatamente quem
   * NÃO consegue fazer login. Atrás do middleware, ela mandaria a pessoa para o login —
   * que é o lugar de onde ela veio e onde ela não entra. O laço perfeito.
   *
   * `/nova-senha` NÃO entra aqui de propósito: só faz sentido com sessão, e o link de
   * recuperação já cria uma ao passar pelo `/auth/callback`. */
  "/esqueci",
  /* ⚠️ `/autorizar` É PÚBLICA PELO MESMO MOTIVO DE `/esqueci`: ela atende quem ainda NÃO está no
   * app. É o tutorial da Autorização de Acesso do e-CAC, e o uso previsto é mandar o link no
   * WhatsApp para uma profissional que está com o site da Receita aberto, não com a MAISA. Atrás
   * do login ela mostraria um formulário de senha para alguém que só quer saber onde clicar — e
   * o sintoma seria a autorização não sair, que é o item que bloqueia a emissão inteira. */
  "/autorizar",
];

/* Exportada para o teste. É a única função deste arquivo que decide quem entra, e o
 * defeito que ela teve não aparecia em nenhuma tela — só no faturamento. */
export const isPublic = (path: string) =>
  PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Para onde mandar quem está LOGADO e ainda não deixou o WhatsApp; `null` = segue (30/10/2026).
 *
 * Pega todo caminho de cadastro de uma vez: `/cadastro`, o botão do Google (que não deixa pedir
 * campo nenhum) e as contas que nasceram antes desta regra. O porquê está em
 * `nucleo/dominio/whatsapp-da-conta.ts`. Rota pública passa direto: `/api` responde JSON e não
 * pode virar redirect, e as LPs e o `/assinar` atendem quem ainda nem tem conta.
 *
 * Exportada para o teste, pelo mesmo motivo do `isPublic`.
 */
export function desvioParaWhatsapp(path: string, busca: string, metadata: unknown): string | null {
  if (isPublic(path) || path === ROTA_DO_WHATSAPP || contaTemWhatsapp(metadata)) return null;
  return `${ROTA_DO_WHATSAPP}?next=${encodeURIComponent(path + busca)}`;
}

export async function updateSession(request: NextRequest) {
  // Auth desligado (sem chaves) → não bloqueia nada. App segue como demo aberta.
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalida o token no Supabase (não confie só no cookie).
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Não logado tentando acessar área protegida → manda pro login (guardando o destino).
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  /* Logado sem WhatsApp → pede o número antes de qualquer tela. Ver `desvioParaWhatsapp`.
   *
   * ⚠️ OS COOKIES VÃO JUNTO NO REDIRECT. Se o `getUser()` acima renovou a sessão, os cookies
   * novos estão em `response`, e um redirect sem eles faria o navegador voltar com o token velho,
   * que o Supabase já trocou. */
  const desvio = user ? desvioParaWhatsapp(path, request.nextUrl.search, user.user_metadata) : null;
  if (desvio) {
    const redirect = NextResponse.redirect(new URL(desvio, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Já logado tentando ver o /login → manda pro app.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
