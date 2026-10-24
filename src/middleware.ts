import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/adaptadores/saida/supabase/sessao";
import { destinoCanonico } from "@/config/endereco";
import { rotaDoSite } from "@/config/site";

// Porta de entrada: toda requisição passa aqui. Renova a sessão e barra quem não
// está logado (quando o Supabase está configurado). Ver adaptadores/saida/supabase/sessao.ts.
export async function middleware(request: NextRequest) {
  /* ⚠️ O 301 DE DOMÍNIO VEM ANTES DA SESSÃO, e a ordem é o que o torna barato.
   *
   * Desde 17/08/2026 o app responde em dois endereços (o domínio próprio e o
   * `.vercel.app`, que segue no ar de propósito). Resolver o host aqui em cima significa
   * uma resposta de 301 sem tocar no Supabase: nenhuma chamada de rede, nenhum cookie
   * reescrito, nenhuma sessão renovada para um host que a pessoa vai abandonar na linha
   * seguinte.
   *
   * A decisão inteira mora em `config/endereco.ts` — inclusive o que ela recusa fazer
   * (`/api`, `/auth`, POST, preview, localhost). Está lá porque é lógica pura com quatro
   * modos de falha silenciosa, e aqui não haveria como testá-la. */
  const destino = destinoCanonico({
    host: request.headers.get("host"),
    caminho: request.nextUrl.pathname,
    busca: request.nextUrl.search,
    metodo: request.method,
  });
  if (destino) return NextResponse.redirect(destino, 301);

  /* O domínio raiz (`maisasecretary.com.br`) é o site: `/` mostra a LP tradicional e o
   * resto vai para o app. Também antes da sessão, pelo mesmo motivo do 301 acima. Ver
   * `config/site.ts`. 302, não 301: o domínio acabou de mudar de dono, e um 301 em cache
   * no navegador não se desfaz se a decisão mudar. */
  const site = rotaDoSite({
    host: request.headers.get("host"),
    caminho: request.nextUrl.pathname,
    busca: request.nextUrl.search,
    metodo: request.method,
  });
  if (site?.tipo === "reescrever") return NextResponse.rewrite(new URL(site.destino, request.url));
  if (site?.tipo === "redirecionar") return NextResponse.redirect(site.destino, 302);

  return await updateSession(request);
}

export const config = {
  // Roda em tudo, menos assets estáticos e os arquivos de PWA/ícones.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
