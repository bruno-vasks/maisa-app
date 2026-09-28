/* ─────────────────────────────────────────────────────────────────────────────
 * G20 · O BASTIDOR NÃO APARECE NA TELA.
 *
 * Em 28/09/2026 o Bruno achou duas frases no app e pediu que "esse tipo de mensagem" não
 * aparecesse em lugar nenhum:
 *   · "Nada aqui trava o app: dá para usar do jeito que está." (a gaveta da jornada): consolo
 *     que ninguém pediu, e que chamava mais atenção que a própria lista;
 *   · "Falta definir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY. Enquanto isso o
 *     app funciona normalmente..." (Equipe): instrução de deploy dada ao dono do negócio.
 * Na varredura apareceram mais: os erros de conexão do Google mandavam conferir o
 * GOOGLE_CLIENT_SECRET e gerar chave com `openssl`, e o login pedia para configurar o Supabase.
 *
 * Quem lê a tela é a terapeuta ou o barbeiro. Nome de variável de ambiente, comando de terminal
 * e "o app funciona do jeito que está" são conversa de quem faz o deploy: vão para o log, o
 * LEIA-ME e o código de erro que o suporte recebe.
 *
 * Lê só TEXTO de código (literais e JSX), como os outros guardas: comentário não conta, então
 * o porquê pode continuar escrito ao lado.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { arquivosDeTela, arvore, conferirDivida, ler, linhaDe, relatorio, textoDoNo, trechoDe, visitar, type Achado, type Divida } from "./fonte";

/** O que é bastidor num texto de tela; devolve o pedaço que denuncia, ou `null`. */
export function bastidor(texto: string): string | null {
  const env = texto.match(/\b(?:GOOGLE|SUPABASE|EVOLUTION|FOCUS|REBOTS|STRIPE|ABACATE(?:PAY)?|MAISA|NF|RESEND|GEMINI|ANTHROPIC|NEXT_PUBLIC)_[A-Z0-9_]{2,}\b/);
  if (env) return env[0];
  const frase = texto.match(/nada aqui trava|funciona normalmente|do jeito que est[áa]|app segue aberto|chaves no ambiente|openssl|\.env(?:\.local)?\b|no Vercel|redirect URI/i);
  return frase ? frase[0] : null;
}

function varrer(): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivosDeTela()) {
    const fonte = ler(arquivo);
    const sf = arvore(arquivo, fonte);
    visitar(sf, (no) => {
      const texto = textoDoNo(no);
      if (texto === null) return;
      const achado = bastidor(texto);
      if (!achado) return;
      const linha = linhaDe(sf, no);
      achados.push({ arquivo, linha, trecho: `${achado}  ←  ${trechoDe(fonte, linha)}` });
    });
  }
  return achados;
}

/** Zerada no dia em que nasceu (28/09/2026). */
const DIVIDA: Divida = {};

describe("G20 · o bastidor não aparece na tela", () => {
  it("nenhum nome de variável de ambiente, comando ou consolo de bastidor em texto de tela", () => {
    const achados = varrer();
    const problemas = conferirDivida(achados, DIVIDA);
    expect(problemas, relatorio("Texto de bastidor na tela: quem lê é o dono do negócio. Mande para o log ou para o código de erro do suporte.", problemas, achados)).toEqual([]);
  });

  it("o instrumento reconhece o bastidor", () => {
    expect(bastidor("Falta definir GOOGLE_CLIENT_ID, GOOGLE_TOKEN_KEY.")).toBe("GOOGLE_CLIENT_ID");
    expect(bastidor("Nada aqui trava o app: dá para usar do jeito que está.")).toBe("Nada aqui trava");
    expect(bastidor("Gere com openssl rand -base64 32")).toBe("openssl");
    expect(bastidor("Configure o Supabase (chaves no ambiente)")).toBe("chaves no ambiente");
    expect(bastidor("Essas configurações são opcionais.")).toBeNull();
    expect(bastidor("Não consegui conectar o Google. Tente de novo (código troca_recusada)")).toBeNull();
  });
});
