/* ─────────────────────────────────────────────────────────────────────────────
 * O PREÇO É UM SÓ, EM TODA LANDING PAGE — E O TESTE É O QUE SEGURA ISSO.
 *
 * ── O QUE ESTE ARQUIVO CONGELA (21/09/2026) ──
 *
 * O produto tinha SEIS preços no ar, com cinco valores distintos:
 *
 *   · `/lp/terapeutas`            R$ 79 / R$ 197 / R$ 349
 *   · `/barbeiros` e `/barbeiro`  R$ 97 / R$ 147 / R$ 197
 *
 * Mais um "R$ 147" redigitado numa terceira seção (o card da <Duelo>) e um "R$ 97" numa
 * quarta (o `OFERTA.precoDe`). Nenhum deles nasceu de descuido: os dois mundos não têm
 * como se importar. A LP de terapeutas é BUNDLE ESTÁTICO, servida de `public/lp`, fora do
 * Next — ela não consegue ler um módulo TypeScript nem que queira.
 *
 * A defesa que existia era um comentário em caixa alta pedindo para mudar nos dois
 * lugares. Ela falhou, como comentário falha: o preço mudou de um lado e não do outro, e
 * ninguém percebeu porque nada quebra. Página com dois preços não derruba build, não
 * aparece em tela e não gera erro — só perde a venda, em silêncio.
 *
 * ESTE ARQUIVO É A DEFESA QUE NÃO DEPENDE DE DISCIPLINA. Ele lê o HTML estático como
 * TEXTO (igual `juridico.test.ts` e `arquitetura.test.ts`: sem DOM, em milissegundos) e
 * confere contra `_lib/planos.ts`, que é a tabela única. Se alguém mudar um preço de um
 * lado só, a suíte reprova e diz qual valor está faltando onde.
 *
 * ── O SEGUNDO TRABALHO: NENHUM LINK DE PAGAMENTO EM LP, NUNCA ──
 *
 * Havia UM link de Stripe no projeto, cru dentro do HTML. Ele saiu em 21/09/2026 porque
 * apontava para o preço antigo — e a regra virou incondicional quando a conta live foi
 * medida no mesmo dia: 21 clientes, três com o MESMO e-mail criados em segundos, e 14
 * assinaturas sem `metadata`, nenhuma atribuível a inquilino nenhum. Era aquele link
 * sendo clicado de novo e criando ficha nova a cada clique.
 *
 * O problema nunca foi o valor (R$ 197 era até o preço certo): **link de pagamento cobra
 * sem saber de quem é.** O caminho é `/assinar/<plano>`, onde a conta e o negócio nascem
 * antes do checkout. Este arquivo é o que impede o link de voltar.
 * ────────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTOATENDIDOS, COPIA, PLANOS, specsDoPlano } from "./_lib/planos";
import { CAMPANHA, levarCampanha } from "@/ui/medicao";
import { WHATSAPP_NUMERO } from "./_lib/icp";

const MARKETING = fileURLToPath(new URL(".", import.meta.url));
const RAIZ = join(MARKETING, "..", "..", "..");

/* A LP DE ORIGEM, e não o espelho. `lp/` é onde se edita; `public/lp/` é destino,
 * reescrito pelo `espelha-lp` a cada `predev`/`prebuild`. Um teste sobre o espelho
 * aprovaria um `lp/` errado sempre que o espelho estivesse velho, e reprovaria um `lp/`
 * certo enquanto ninguém rodasse o script. */
const HTML_TERAPEUTAS = join(RAIZ, "lp", "terapeutas", "index.html");

/** O HTML SEM OS COMENTÁRIOS — é o que a pessoa de fato vê.
 *
 * ⚠️ TIRAR OS COMENTÁRIOS NÃO É CONVENIÊNCIA, É O QUE TORNA O TESTE CORRETO. O arquivo
 * explica por escrito de onde veio ("a tabela era R$ 79 / 197 / 349..."), e essa memória
 * é o que impede a próxima pessoa de refazer a bagunça. Um teste que proíbe o texto
 * "R$ 79" no arquivo inteiro obrigaria a apagar a explicação junto com o defeito. */
function visivel(caminho: string): string {
  return readFileSync(caminho, "utf8").replace(/<!--[\s\S]*?-->/g, "");
}

describe("a tabela de preços é uma só nos dois mundos", () => {
  const html = visivel(HTML_TERAPEUTAS);

  it.each(PLANOS.map((p) => [p.nome, p.preco] as const))(
    "a LP de terapeutas mostra o %s por %s",
    (_nome, preco) => {
      expect(html).toContain(preco);
    },
  );

  it.each(PLANOS.map((p) => [p.nome] as const))(
    "a LP de terapeutas chama o plano de %s",
    (nome) => {
      expect(html).toContain(nome);
    },
  );

  /* O EXCEDENTE ENTRA NA MESMA CONTA QUE O PREÇO. Ele é preço — o que a pessoa paga
     quando o mês passa do limite — e foi a linha mais fácil de esquecer na hora de
     sincronizar, justamente por parecer detalhe de cartão. */
  it("a LP de terapeutas mostra o excedente de cada plano", () => {
    for (const plano of PLANOS) {
      const excedente = plano.specs.find((s) => s.rotulo.startsWith("Excedente"));
      expect(excedente, `plano ${plano.nome} sem linha de excedente`).toBeDefined();
      expect(html).toContain(excedente!.valor);
    }
  });

  /* A LINHA QUE DIZ QUANTO CABE. Sem ela os três cartões viram três preços sem razão de
     existir, que era o estado até 21/09/2026: nenhuma das LPs escrevia quantos
     profissionais e quantos agendamentos o plano aguenta. */
  it("a LP de terapeutas mostra a capacidade de cada plano", () => {
    for (const plano of PLANOS) {
      for (const spec of specsDoPlano(plano, "terapeutas")) {
        expect(html, `${plano.nome} → ${spec.rotulo}`).toContain(spec.valor);
      }
    }
  });

  /* ⚠️ A METADE QUE FALTA DA CHECAGEM. Sem ela, trocar R$ 79 por R$ 127 e ESQUECER de
     apagar o R$ 79 passaria: os dois estariam no arquivo e o `toContain` acima ficaria
     feliz. É exatamente a forma que a divergência teve da última vez — nunca um preço
     ausente, sempre um preço a mais, sobrevivendo num canto. */
  it("nenhum preço morto sobrou na LP de terapeutas", () => {
    const vivos = new Set(PLANOS.map((p) => p.preco.replace(/\s+/g, " ")));
    const achados = (html.match(/R\$\s*\d{2,3}(?![\d,.])/g) ?? []).map((m) =>
      m.replace(/\s+/g, " "),
    );
    const mortos = [...new Set(achados)].filter((p) => !vivos.has(p));
    expect(mortos, `preços fora da tabela: ${mortos.join(", ")}`).toEqual([]);
  });
});

describe("o CTA de cada plano vai para onde ele se vende", () => {
  const html = visivel(HTML_TERAPEUTAS);

  /* ⚠️ LINK DE PAGAMENTO EM LP NÃO VOLTA — e isto deixou de ser condicional em
     21/09/2026, quando a conta live foi medida. Não é que falte preço no Stripe: o
     desenho está errado. Link de pagamento cobra sem saber de quem é, e a prova está na
     conta: 21 clientes, três com o MESMO e-mail criados em segundos, 14 assinaturas sem
     `metadata` — nenhuma atribuível. Era este link sendo clicado de novo.

     O caminho é `/assinar/<plano>`, onde a conta e o negócio nascem antes do checkout.
     Este teste é o que impede o link antigo de voltar por cópia de um commit velho. */
  it("não há link de pagamento na LP — o caminho é o pré-cadastro", () => {
    expect(readFileSync(HTML_TERAPEUTAS, "utf8").replace(/<!--[\s\S]*?-->/g, "")).not.toContain(
      "buy.stripe.com",
    );
  });

  /* Os dois autoatendidos apontam para o pré-cadastro, com o `?icp=` que a página usa
     para decidir a vertical do negócio. Sem ele, o negócio nasceria `generico` para quem
     veio de uma LP de terapeutas. */
  it.each(AUTOATENDIDOS)("o CTA do %s abre o pré-cadastro com o icp certo", (chave) => {
    expect(html).toContain(`href="/assinar/${chave}?icp=terapeutas"`);
  });

  /* E o Escala continua no WhatsApp: a §19 do documento de precificação o põe sob
     proposta, e `/assinar/escala` responde 404 de propósito. */
  it("o CTA do Escala continua indo para o WhatsApp", () => {
    expect(html).toContain("plano%20Escala");
    expect(html).not.toContain('href="/assinar/escala');
  });

  it("todo wa.me da LP de terapeutas usa o número do icp.ts", () => {
    const numeros = [...new Set(html.match(/wa\.me\/(\d+)/g) ?? [])];
    expect(numeros.length, "a LP não tem nenhum link de WhatsApp").toBeGreaterThan(0);
    for (const n of numeros) expect(n).toBe(`wa.me/${WHATSAPP_NUMERO}`);
  });

  /* Onde ainda HÁ conversa, ela chega no contexto: a mensagem cita o plano. Vale para o
     Escala (o CTA do cartão) e para os autoatendidos (o "prefere falar antes?"). Três
     botões com a mesma mensagem genérica obrigariam a perguntar "qual plano?" logo na
     primeira resposta — e a pessoa já tinha respondido, clicando. */
  it("a conversa do Escala chega citando o plano", () => {
    const escala = PLANOS.find((p) => p.chave === "escala")!;
    expect(html).toContain(`plano%20${encodeURIComponent(escala.nome)}`);
  });

  /* O RÓTULO DO BOTÃO TAMBÉM É A OFERTA. Dois cartões da LP de terapeutas diziam
     "Falar no WhatsApp" na mesma fileira: três caminhos com cara de iguais, e o leitor
     descobrindo só no WhatsApp qual plano tinha pedido. O rótulo é a última coisa que
     ele lê antes de clicar — ele tem de dizer QUAL plano está sendo ativado, e dizer a
     mesma coisa que o cartão equivalente do outro mundo. */
  it.each(PLANOS.map((p) => [p.nome, COPIA.terapeutas.planos[p.chave].cta] as const))(
    "o botão do %s diz %s",
    (_nome, rotulo) => {
      expect(html).toContain(rotulo);
    },
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
 * A CAMPANHA VIAJA DA LP ESTÁTICA PARA O PRÉ-CADASTRO (21/10/2026).
 *
 * As LPs do Next somam a campanha no clique (`Medicao.tsx`, com `levarCampanha`, testada em
 * `ui/medicao.test.ts`). A LP estática de terapeutas não roda React e tem um `<script>` irmão
 * com a lista redigitada. O teste abaixo EXECUTA esse script: comparar texto aprovaria um
 * script que não roda.
 * ────────────────────────────────────────────────────────────────────────────── */

describe("a campanha da LP estática chega ao /assinar", () => {
  const BUSCA = "?utm_source=google&utm_campaign=teste-gratis&gclid=abc123&fbclid=&outro=x";

  const scriptDaLp = () => {
    const html = readFileSync(HTML_TERAPEUTAS, "utf8");
    const bloco = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((t) => t.includes("CAMPANHA"));
    expect(bloco, "a LP estática perdeu o script que repassa a campanha").toBeDefined();
    return bloco!;
  };

  /* Roda o script com `location` e `document` de mentira. */
  const rodar = (busca: string, hrefs: string[]) => {
    const links = hrefs.map((h) => {
      let href = h;
      return { getAttribute: () => href, setAttribute: (_: string, v: string) => { href = v; }, get href() { return href; } };
    });
    const documento = {
      querySelectorAll: (sel: string) => (sel === 'a[href^="/assinar/"]' ? links.filter((l) => l.href.startsWith("/assinar/")) : []),
    };
    const local = { search: busca, origin: "https://maisasecretary.com.br" };
    new Function("location", "document", "URLSearchParams", "URL", scriptDaLp())(local, documento, URLSearchParams, URL);
    return links.map((l) => l.href);
  };

  it("o script usa a mesma lista de chaves de CAMPANHA", () => {
    const m = scriptDaLp().match(/CAMPANHA\s*=\s*\[([^\]]*)\]/);
    const chaves = (m?.[1] ?? "").split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
    expect(chaves).toEqual([...CAMPANHA]);
  });

  it("o script reescreve os links do /assinar como levarCampanha, sem sobrescrever o que o link traz", () => {
    const hrefs = [...AUTOATENDIDOS.map((c) => `/assinar/${c}?icp=terapeutas`), "/assinar/essencial?utm_source=lp"];
    expect(rodar(BUSCA, hrefs)).toEqual(hrefs.map((h) => levarCampanha(h, BUSCA)));
    expect(rodar(BUSCA, hrefs)[0]).toBe("/assinar/essencial?icp=terapeutas&utm_source=google&utm_campaign=teste-gratis&gclid=abc123");
    expect(rodar("?outro=1", hrefs)).toEqual(hrefs);
  });
});

/* O `/assinar` sem `?icp=` (a LP tradicional, um link solto) é `generico`, e até 22/10/2026
   caía na copy de terapeutas — o cartão prometia nota fiscal a qualquer negócio. */
describe("o cartão do negócio genérico não promete o que é de terapeuta", () => {
  it.each(PLANOS.map((p) => [p.nome, p] as const))("o %s genérico mostra só os números do plano", (_n, plano) => {
    const specs = specsDoPlano(plano, "generico");
    expect(specs).toEqual(plano.specs);
    expect(specs.map((s) => s.rotulo).join(" ")).not.toMatch(/nota|recibo/i);
  });
});
