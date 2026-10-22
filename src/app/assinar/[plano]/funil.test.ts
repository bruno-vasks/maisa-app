/* ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES PRENDEM — os dois funis do pré-cadastro (22/10/2026).
 *
 * ★ **SÓ `?teste=1` ABRE O TESTE GRÁTIS.** Qualquer outro valor cai no funil com Pix, o de
 * antes desta mudança. Link errado nunca dá produto sem querer; só pede o Pix de sempre.
 *
 * ★ **O TEXTO DO TESTE PROMETE O QUE O CÓDIGO FAZ, E NADA MAIS.** Os dias do teste são os do
 * banco (a `034` grava `interval '14 days'`), o funil de teste não fala em pagamento agora, e
 * o funil com Pix continua dizendo "pagamento" no botão.
 *
 * ★ **O NEGÓCIO GENÉRICO NÃO HERDA A COPY DE TERAPEUTA.**
 * ────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIAS_DE_TESTE } from "@/nucleo/dominio/assinatura";
import { PLANOS } from "@/app/(marketing)/_lib/planos";
import { depoisDoNegocio, marcaDoFunil, modoDoFunil, publicoDoCartao, textosDoFunil } from "./funil";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
const essencial = PLANOS.find((p) => p.chave === "essencial")!;

describe("modoDoFunil", () => {
  it("?teste=1 é o teste grátis", () => {
    expect(modoDoFunil("?teste=1")).toBe("teste");
    expect(modoDoFunil("?icp=generico&teste=1&utm_source=google")).toBe("teste");
    expect(modoDoFunil(new URLSearchParams("teste=1"))).toBe("teste");
  });

  it("qualquer outra coisa é o funil com Pix de sempre", () => {
    for (const b of ["", "?icp=terapeutas", "?teste=0", "?teste=true", "?teste=sim", "?gratis=1", "?teste="]) {
      expect(modoDoFunil(b), b).toBe("pix");
    }
  });
});

describe("o que muda entre os dois funis", () => {
  it("o teste vai direto para a configuração; o Pix, para o Pix", () => {
    expect(depoisDoNegocio("teste")).toBe("comecar");
    expect(depoisDoNegocio("pix")).toBe("pix");
  });

  it("o metadata diz por qual funil a pessoa entrou — é o que o `npm run leads` lê", () => {
    expect(marcaDoFunil("teste")).toEqual({ funil: "teste" });
    expect(marcaDoFunil("pix")).toEqual({ funil: "pix" });
  });

  it("o teste promete os dias do banco, sem cartão e sem Pix agora, e diz o que acontece no fim", () => {
    const t = textosDoFunil("teste", essencial);
    expect(t.faixa).toBe(`${DIAS_DE_TESTE} dias grátis · sem cartão · sem Pix agora`);
    expect(t.botao).toMatch(/teste grátis/i);
    expect(t.botao).not.toMatch(/pag/i);
    expect(t.explicacao).toContain(`${DIAS_DE_TESTE} dias`);
    expect(t.explicacao).toContain("paga o Essencial por Pix");
    expect(t.explicacao).toMatch(/nada é cobrado/);
    expect(t.titulo).toContain("grátis");
  });

  it("sem ?teste=1 nada mudou: o botão leva ao pagamento e não há promessa de teste", () => {
    const t = textosDoFunil("pix", essencial);
    expect(t.botao).toBe("Ir para o pagamento");
    expect(t.ultimaEtapa).toBe("Gerando o seu Pix…");
    expect(t.faixa).toBeNull();
    expect(t.explicacao).toBeNull();
    expect(t.whatsapp).toContain("R$ 127/mês");
  });

  /* A PROMESSA E O BANCO. A tela diz "14 dias grátis" e quem decide o prazo é o
     `provisionar_negocio`. Se um mudar sem o outro, a LP promete um teste que o banco não dá. */
  it("os dias prometidos são os que o banco grava, na 034 e na 005", () => {
    for (const arquivo of ["034_plano_do_teste.sql", "005_provisionar.sql"]) {
      const sql = readFileSync(join(RAIZ, "supabase", arquivo), "utf8");
      const m = sql.match(/insert into public\.assinaturas[\s\S]*?interval '(\d+) days'/);
      expect(m?.[1], arquivo).toBe(String(DIAS_DE_TESTE));
    }
  });
});

describe("publicoDoCartao", () => {
  it("os dois ICPs mantêm a copy deles; o resto é genérico", () => {
    expect(publicoDoCartao("terapeutas")).toBe("terapeutas");
    expect(publicoDoCartao("barbeiros")).toBe("barbeiros");
    expect(publicoDoCartao("generico")).toBe("generico");
  });
});

/* A 034 E A 005 TÊM DE GRAVAR O MESMO TRIAL. A 005 foi editada junto para rodá-la de novo não
   desfazer a 034; se uma voltar a gravar plano fixo ou preço, o teste reprova. */
describe("o trial nasce com o plano escolhido e sem preço", () => {
  it.each(["034_plano_do_teste.sql", "005_provisionar.sql"])("%s", (arquivo) => {
    const sql = readFileSync(join(RAIZ, "supabase", arquivo), "utf8");
    const insert = sql.match(/insert into public\.assinaturas \(tenant_id, plano, preco[\s\S]*?\);/)?.[0] ?? "";
    expect(insert).toContain("coalesce(public.plano_do_cadastro(p_user), 'Profissional'), null, 'trial'");
    expect(insert).not.toContain("149.90");
    expect(sql).toContain("create or replace function public.plano_do_cadastro(p_user uuid)");
  });
});
