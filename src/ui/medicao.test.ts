import { describe, expect, it } from "vitest";
import { rotaMedida, cadastrouAgora, ativouAgora, levarCampanha, campanhaDaBusca, CAMPANHA, CAMPANHA_MAX } from "./medicao";
import { CHAVES_DE_CAMPANHA } from "@/nucleo/dominio/aviso-de-cadastro";

/* O que o `/assinar` grava no metadata. A lista é a do domínio, a mesma que o aviso de
   cadastro novo lê (22/10/2026). */
describe("campanhaDaBusca", () => {
  it("pega só as chaves de campanha, sem vazio e com teto", () => {
    expect(campanhaDaBusca("?utm_source=google&utm_campaign=teste-gratis&gclid=abc123&fbclid=&outro=x"))
      .toEqual({ utm_source: "google", utm_campaign: "teste-gratis", gclid: "abc123" });
    expect(campanhaDaBusca(`?utm_content=${"x".repeat(500)}`).utm_content).toHaveLength(CAMPANHA_MAX);
    expect(campanhaDaBusca("")).toEqual({});
    expect(campanhaDaBusca(new URLSearchParams("fbclid=f1"))).toEqual({ fbclid: "f1" });
  });

  it("é a mesma lista do aviso de cadastro novo", () => {
    expect(CAMPANHA).toBe(CHAVES_DE_CAMPANHA);
  });
});

describe("levarCampanha", () => {
  it("soma utm e gclid da página ao link do plano, sem perder o icp", () => {
    expect(levarCampanha("/assinar/essencial?icp=terapeutas", "?gclid=ABC&utm_source=google&x=1"))
      .toBe("/assinar/essencial?icp=terapeutas&utm_source=google&gclid=ABC");
  });

  it("o que já está no link vence", () => {
    expect(levarCampanha("/assinar/essencial?utm_source=lp", "?utm_source=google"))
      .toBe("/assinar/essencial?utm_source=lp");
  });

  it("sem campanha na página, o link fica igual", () => {
    expect(levarCampanha("/assinar/profissional?icp=barbeiros", "")).toBe("/assinar/profissional?icp=barbeiros");
  });
});

const conta = (criada: string, entrou: string | null) => ({ id: "u1", created_at: criada, last_sign_in_at: entrou });

describe("rotaMedida", () => {
  it("carrega o GTM no funil", () => {
    for (const p of ["/assinar/essencial", "/barbeiros", "/cadastro", "/login", "/comecar", "/pagar"]) {
      expect(rotaMedida(p), p).toBe(true);
    }
  });

  it("nunca no painel, nem em rota que só começa igual", () => {
    for (const p of ["/", "/laboratorio", "/api/negocio", "/assinarx", "/nova-senha"]) {
      expect(rotaMedida(p), p).toBe(false);
    }
  });
});

describe("cadastrouAgora", () => {
  it("o primeiro login no mesmo minuto da criação é cadastro", () => {
    expect(cadastrouAgora(conta("2026-10-21T12:00:00Z", "2026-10-21T12:00:02Z"))).toBe(true);
  });

  it("login de conta antiga não é cadastro", () => {
    expect(cadastrouAgora(conta("2026-10-01T12:00:00Z", "2026-10-21T12:00:00Z"))).toBe(false);
  });

  it("conta que nunca entrou não conta", () => {
    expect(cadastrouAgora(conta("2026-10-21T12:00:00Z", null))).toBe(false);
  });
});

describe("ativouAgora", () => {
  it("entrar no dia seguinte ao cadastro, dentro de 24 h, é ativação", () => {
    expect(ativouAgora(conta("2026-10-21T12:00:00Z", "2026-10-22T09:00:00Z"))).toBe(true);
  });

  it("depois de 24 h não é", () => {
    expect(ativouAgora(conta("2026-10-21T12:00:00Z", "2026-10-22T12:00:01Z"))).toBe(false);
  });
});
