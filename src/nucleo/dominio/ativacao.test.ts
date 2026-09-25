/* ─────────────────────────────────────────────────────────────────────────────
 * O PROGRESSO É DERIVADO, E A CONTA TEM QUE SER A MESMA NOS DOIS ADAPTADORES.
 *
 * `progressoDe` existe como função de domínio por um motivo estreito: a porcentagem é
 * calculada no Supabase E no demo, e duas cópias divergem no dia em que um passo entrar na
 * lista. O sintoma seria a barra chegando a 100% com um cartão ainda aberto na tela.
 *
 * O que se prova aqui é o contrato que a tela consome: ordem estável, sem repetição, e
 * `completo` significando o que diz.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { PASSOS_DE_ATIVACAO, passosQueValem, progressoDe, usoDoWhatsApp, type PassoDeAtivacao } from "./ativacao";
import { atendeNoWhatsAppPorPadrao } from "./assistente";

describe("progresso da ativação", () => {
  it("negócio recém-criado tem 1 de 6 — nunca zero", () => {
    const p = progressoDe(["negocio_criado"]);
    expect(p.feitos).toEqual(["negocio_criado"]);
    expect(p.porcentagem).toBe(17);
    expect(p.completo).toBe(false);
  });

  it("tudo feito fecha em 100 e marca completo", () => {
    const p = progressoDe(PASSOS_DE_ATIVACAO);
    expect(p.porcentagem).toBe(100);
    expect(p.completo).toBe(true);
  });

  /* A tela desenha os cartões na ordem do array. Um adaptador que apure os passos fora de
   * ordem (é o que `Promise.allSettled` faz — a ordem é a de conclusão) pintaria o
   * checklist embaralhado a cada leitura, e o dono veria os cartões dançando. */
  it("devolve na ORDEM canônica, não na ordem em que chegaram", () => {
    const p = progressoDe(["primeira_conversa", "negocio_criado", "whatsapp_conectado"]);
    expect(p.feitos).toEqual(["negocio_criado", "whatsapp_conectado", "primeira_conversa"]);
  });

  /* Passo repetido passaria de 100% e faria a barra estourar o container. Quem monta o
   * array é um adaptador, e adaptador erra. */
  it("passo repetido não conta duas vezes", () => {
    const p = progressoDe(["negocio_criado", "negocio_criado", "negocio_criado"]);
    expect(p.feitos).toHaveLength(1);
    expect(p.porcentagem).toBe(17);
  });

  it("passo inventado é ignorado, não somado", () => {
    const p = progressoDe(["negocio_criado", "pagou_a_fatura" as PassoDeAtivacao]);
    expect(p.feitos).toEqual(["negocio_criado"]);
    expect(p.porcentagem).toBe(17);
  });

  it("nada feito é 0 e não quebra", () => {
    const p = progressoDe([]);
    expect(p).toEqual({ feitos: [], passos: [...PASSOS_DE_ATIVACAO], porcentagem: 0, completo: false });
  });

  /* ⚠️ Este teste existe para DOER quando alguém acrescentar um passo. Não é redundância:
   * a ordem e a quantidade são contrato com a tela e com a porcentagem que o dono vê, e
   * mudar qualquer um dos dois é decisão de produto — não refatoração. */
  it("são seis passos, nesta ordem", () => {
    expect(PASSOS_DE_ATIVACAO).toEqual([
      "negocio_criado",
      "catalogo_ajustado",
      "whatsapp_conectado",
      "agenda_conectada",
      "primeira_conversa",
      /* ★ Entrou em 17/08/2026. A nota fiscal é o maior diferencial do produto, e um
       * diferencial fora do checklist do primeiro dia é um diferencial que o cliente
       * descobre no mês seguinte — se descobrir. Último de propósito: é o único passo que
       * exige o cliente trazer algo de fora (o certificado digital), e pedir isso antes de
       * a MAISA marcar o primeiro horário é cobrar trabalho antes de mostrar valor. */
      "nota_fiscal_ligada",
    ]);
  });
});

/* ★ 24/09/2026. Quem só emite recibo não pode ver o painel cobrando WhatsApp para sempre. */
describe("★ os passos que valem para cada uso", () => {
  it("sem uso informado, valem todos", () => {
    expect(passosQueValem()).toEqual([...PASSOS_DE_ATIVACAO]);
  });

  it("só recibo: nem WhatsApp, nem agenda, nem 'ver funcionando'", () => {
    const uso = usoDoWhatsApp({ ativa: false, lembrete: false, avisarRecibo: false });
    expect(passosQueValem(uso)).toEqual(["negocio_criado", "catalogo_ajustado", "nota_fiscal_ligada"]);
  });

  it("agenda fixa: WhatsApp continua (o lembrete sai por ele), agenda e conversa não", () => {
    const uso = usoDoWhatsApp({ ativa: false, lembrete: true, avisarRecibo: true });
    expect(passosQueValem(uso)).toEqual(["negocio_criado", "catalogo_ajustado", "whatsapp_conectado", "nota_fiscal_ligada"]);
  });

  it("com agente, valem todos", () => {
    expect(passosQueValem(usoDoWhatsApp({ ativa: true, lembrete: false, avisarRecibo: false }))).toEqual([...PASSOS_DE_ATIVACAO]);
  });

  it("a barra mede o que vale: só-recibo com tudo que importa feito fecha em 100", () => {
    const uso = usoDoWhatsApp({ ativa: false, lembrete: false, avisarRecibo: false });
    const p = progressoDe(["negocio_criado", "catalogo_ajustado", "nota_fiscal_ligada"], uso);
    expect(p.porcentagem).toBe(100);
    expect(p.completo).toBe(true);
  });
});

describe("★ a MAISA nasce ligada?", () => {
  it("terapeuta não; barbearia e genérico sim", () => {
    expect(atendeNoWhatsAppPorPadrao("terapeutas")).toBe(false);
    expect(atendeNoWhatsAppPorPadrao("barbeiros")).toBe(true);
    expect(atendeNoWhatsAppPorPadrao("generico")).toBe(true);
  });
});
