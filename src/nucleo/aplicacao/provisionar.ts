/* ─────────────────────────────────────────────────────────────────────────────
 * CASO DE USO — criar o negócio.
 *
 * O passo que faltava para a MAISA se vender sozinha. A RPC `criar_negocio()` já existia
 * e era boa (transação única: negócio, membro dono, assinatura em trial, assistente,
 * expediente, catálogo de partida e FAQs). Ninguém a chamava. Este arquivo é a chamada.
 *
 * ── O QUE ESTE CASO DE USO DECIDE, JÁ QUE O BANCO FAZ O TRABALHO ──
 *
 * Três coisas, e todas as três existem porque o banco não pode decidi-las bem:
 *
 * 1. VALIDA ANTES DE GASTAR UMA IDA. Nome vazio e vertical inventada são recusados aqui.
 *    O `check` do Postgres também recusa — mas devolve `raise exception`, que vira 500
 *    genérico, e a tela não consegue transformar isso em "digite o nome do seu negócio".
 * 2. NORMALIZA O NOME. `btrim` o banco faz; colapsar espaço interno e recusar nome só de
 *    pontuação, não. Nome de negócio vira slug, e slug vira URL.
 * 3. TRADUZ `limite_de_negocios` EM ERRO DE DOMÍNIO. O teto de 10 por pessoa é freio
 *    anti-abuso, não regra de produto — mas quem bateu nele precisa de uma frase, não de
 *    um 500.
 *
 * ⚠️ O que este caso de uso NÃO faz, de propósito: escolher o inquilino. O dono é sempre
 * `auth.uid()`, resolvido dentro da RPC, que é `security definer`. Nem o corpo do request
 * nem este arquivo têm como apontar para outra pessoa. É a mesma regra de
 * `dominio/tenant.ts`, valendo no único ponto do app onde um inquilino nasce.
 * ────────────────────────────────────────────────────────────────────────────── */

import type { NegocioProvisionado, ProvisionarNegocio } from "../portas/entrada/casos-de-uso";
import type { ProvisionadorDeNegocio } from "../portas/saida/provisionador-negocio";
import { ehVertical } from "../dominio/negocio";
import { colapsarEspaco, SEM_CONTEUDO } from "../dominio/texto";
import { DadoInvalido } from "../dominio/erros";
import { atendeNoWhatsAppPorPadrao } from "../dominio/assistente";
import type { RepositorioAssistente } from "../portas/saida/repositorio-assistente";

/** Nome de negócio cabe numa tela e vira slug. Fora disso é engano ou abuso. */
const NOME_MIN = 2;
const NOME_MAX = 80;

/* `colapsarEspaco` e `SEM_CONTEUDO` vinham daqui até 15/08/2026, em cópia idêntica à de
 * `dominio/negocio.ts`. Foram para `dominio/texto.ts` quando o catálogo ia criar a
 * terceira — o comportamento é o mesmo, e o porquê de cada um está lá. */
const normalizar = colapsarEspaco;

export function criarProvisionarNegocio(deps: {
  provisionador: ProvisionadorDeNegocio;
  /** Para desligar a MAISA de quem nasce com ela desligada. Ver `atendeNoWhatsAppPorPadrao`. */
  assistente?: RepositorioAssistente;
}): ProvisionarNegocio {
  return async (sessao, p): Promise<NegocioProvisionado> => {
    const nome = normalizar(p.nome ?? "");

    if (nome.length < NOME_MIN) {
      throw new DadoInvalido("Diga o nome do seu negócio.", "nome");
    }
    if (nome.length > NOME_MAX) {
      throw new DadoInvalido(`O nome precisa ter no máximo ${NOME_MAX} caracteres.`, "nome");
    }
    /* Precisa sobrar letra ou número: `"---"` passaria nos dois testes acima e viraria um
     * slug vazio no banco, que é onde o erro apareceria — longe daqui e sem explicação. */
    if (SEM_CONTEUDO.test(nome)) {
      throw new DadoInvalido("O nome precisa ter pelo menos uma letra ou número.", "nome");
    }

    if (!ehVertical(p.vertical)) {
      throw new DadoInvalido("Escolha se você atende como terapeuta ou barbearia.", "vertical");
    }

    const profissional = p.profissional ? normalizar(p.profissional) : undefined;

    const r = await deps.provisionador.criar(sessao, {
      nome,
      vertical: p.vertical,
      /* Vazio depois de normalizar é o mesmo que não ter mandado. Sem isto, um campo que
       * o usuário abriu e fechou viraria um profissional chamado "" no banco. */
      profissional: profissional || undefined,
    });

    if (!r.ok) {
      throw new DadoInvalido(
        "Esta conta já é dona de negócios demais. Fale com a gente para liberar mais.",
        "limite",
      );
    }

    /* O banco nasce com `ativa = true` (`002_multitenant.sql`) para todo mundo. Desligar
     * aqui, e não numa migração, porque a regra depende da vertical — e as TRÊS telas que
     * criam negócio (wizard, assinatura, painel) passam por esta função.
     *
     * ⚠️ Falha para a frente: o negócio já existe, e lançar agora faria a pessoa tentar de
     * novo e bater em "negócios demais". O WhatsApp ainda nem está conectado neste ponto,
     * e o wizard grava o modo escolhido logo em seguida. Então: log alto e segue. */
    if (deps.assistente && !atendeNoWhatsAppPorPadrao(p.vertical)) {
      const t = { tenantId: r.tenantId, usuarioId: sessao.usuarioId, ator: { tipo: "usuario" as const, id: sessao.usuarioId } };
      try {
        await deps.assistente.salvar(t, { assistente: { ativa: false } });
      } catch (e) {
        console.error(
          `[aplicacao/provisionar] o negócio ${r.tenantId} (${p.vertical}) nasceu com a MAISA LIGADA — `
          + `não consegui desligar: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return { tenantId: r.tenantId, proximoPasso: "abrir_painel" };
  };
}
