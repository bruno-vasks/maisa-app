/* ─────────────────────────────────────────────────────────────────────────────
 * CASOS DE USO — a maisa da maisa (05/11/2026).
 *
 * O negócio da casa atende os leads da própria maisa. A regra pura está em `dominio/vendas.ts`;
 * aqui é a costura com o mundo, em duas metades:
 *
 *   • NA CONVERSA (o agente da casa chama, uma vez por turno ou por ferramenta):
 *       `AbrirFichaDoLead` ... quem é esta pessoa: a ficha da casa e a conta no app, se houver;
 *       `QualificarLead` .... grava o que a conversa descobriu, decide teste × conversa e avisa
 *                             o Bruno no WhatsApp dele;
 *       `LinkDoTesteDoLead` . o link do teste grátis, montado aqui e nunca pelo modelo.
 *
 *   • NA ROTINA (`AcompanharLeads`, pelo pg_cron da 040): as três mensagens que saem sem a
 *     pessoa ter escrito — boas-vindas, lembrete e retomada. Uma de cada, no máximo, por
 *     pessoa, e no máximo uma automática por pessoa a cada 24 h.
 *
 * ── TUDO PELA FILA DE ENVIOS ──
 *
 * A mensagem automática não sai daqui: entra na `FilaDeEnvios` e sai espaçada, com "digitando…",
 * pela mesma drenagem dos recibos. É o que impede o número novo de disparar em rajada no dia em
 * que muita gente se cadastrar junto, e é o desenho que a Evolution tolera.
 *
 * E ela entra também na conversa (`RepositorioHistorico.anexar`, como fala da maisa) no momento
 * em que vai para a fila. Sem isso, quando a pessoa responde "oi, travei no QR", o agente não
 * saberia que foi ele quem puxou o assunto.
 * ────────────────────────────────────────────────────────────────────────────── */

import type {
  AbrirFichaDoLead, AcompanharLeads, ConversaMarcada, DrenarFilaDoNegocio, LinkDoPagamentoDoLead, LinkDoTesteDoLead, QualificarLead,
  ResultadoDoAcompanhamento,
} from "../portas/entrada/casos-de-uso";
import type { CadastrosDoApp } from "../portas/saida/cadastros-do-app";
import type { CanalDeMensagens } from "../portas/saida/canal-mensagens";
import type { FilaDeEnvios } from "../portas/saida/fila-de-envios";
import type { RepositorioHistorico } from "../portas/saida/memoria-cliente";
import type { ConversaDoLead, RepositorioDeLeads } from "../portas/saida/repositorio-leads";
import type { ContextoTenant } from "../dominio/tenant";
import { soDigitos } from "../dominio/clientes";
import { ehVertical } from "../dominio/negocio";
import { hojeISO } from "../dominio/tempo";
import {
  dentroDaJanela, ETAPAS_TRAVADAS, etapaDoCadastro, horarioDeMandar, JANELAS_MS, linkDoPagamento, linkDoTeste,
  planoPeloVolume, proximoPasso, resumoDaConversaMarcada, resumoParaOVendedor, textoDeBoasVindas, textoDeLembrete,
  textoDeRetomada, type Automatica, type FichaDeLead, type PlanoAVenda, type Qualificacao,
} from "../dominio/vendas";

const chave8 = (tel: string | null | undefined) => soDigitos(tel).slice(-8);

const aviso = (onde: string, e: unknown) =>
  console.warn(`[aplicacao/vendas] ${onde}: ${e instanceof Error ? e.message : String(e)}`);

/* ───────────────────────────── na conversa ───────────────────────────── */

/** O que vem do modelo passa por aqui antes de virar ficha. Texto curto, número plausível. */
const texto = (v: unknown, max = 120): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ").slice(0, max);
  return t || null;
};

const inteiro = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
};

export function normalizarQualificacao(q: Partial<Record<keyof Qualificacao, unknown>>): Qualificacao {
  return {
    profissao: texto(q.profissao, 60),
    vertical: ehVertical(q.vertical) ? q.vertical : "generico",
    equipe: inteiro(q.equipe, 1, 500),
    atendimentosPorSemana: inteiro(q.atendimentosPorSemana, 1, 2000),
    comoMarcaHoje: texto(q.comoMarcaHoje),
    interesse: texto(q.interesse),
    pediuConversa: q.pediuConversa === true,
  };
}

/**
 * Nunca lança. A ficha é contexto, e conversa que não abre ficha segue como conversa: a vendedora
 * só perde o atalho de saber de antemão em que passo a pessoa parou.
 */
export function criarAbrirFichaDoLead(deps: { leads: RepositorioDeLeads; cadastros: CadastrosDoApp }): AbrirFichaDoLead {
  return async (t, p) => {
    await deps.leads.registrarContato(t, p).catch((e) => aviso("registrar o contato", e));
    const [ficha, cadastro] = await Promise.all([
      deps.leads.ler(t, p.telefone).catch((e) => (aviso("ler a ficha", e), null)),
      deps.cadastros.porTelefone(p.telefone).catch((e) => (aviso("achar a conta", e), null)),
    ]);
    return { ficha, cadastro };
  };
}

/**
 * Grava a qualificação, decide o próximo passo (em código: `proximoPasso`) e avisa o Bruno.
 *
 * O aviso sai na primeira qualificação e quando o passo muda (a pessoa que ia testar e pediu para
 * falar com alguém). Requalificar com um detalhe a mais não manda outro aviso: o modelo chama a
 * ferramenta de novo quando a pessoa conta mais, e o WhatsApp do Bruno não é log.
 *
 * O aviso nunca derruba a qualificação: ela já está gravada, e a resposta ao lead não pode
 * esperar um problema no WhatsApp do vendedor.
 */
export function criarQualificarLead(deps: {
  leads: RepositorioDeLeads;
  planos: readonly PlanoAVenda[];
  canal: CanalDeMensagens;
  /** O WhatsApp de quem vende (o dono do negócio da casa). `null` = ninguém para avisar. */
  vendedorDe: (t: ContextoTenant) => Promise<string | null>;
  relogio?: () => number;
}): QualificarLead {
  const relogio = deps.relogio ?? (() => Date.now());
  return async (t, p) => {
    const qualificacao = normalizarQualificacao(p.qualificacao);
    const passo = proximoPasso(qualificacao);
    const plano = planoPeloVolume(qualificacao.atendimentosPorSemana, deps.planos);
    const antes = await deps.leads.ler(t, p.telefone).catch(() => null);
    const nome = texto(p.nome, 60) ?? antes?.nome ?? null;

    await deps.leads.qualificar(t, {
      telefone: p.telefone, nome, qualificacao, passo, plano: plano?.chave ?? null, em: new Date(relogio()).toISOString(),
    });

    const mudou = !antes?.qualificadoEm || antes.passo !== passo;
    if (mudou) {
      try {
        const para = await deps.vendedorDe(t);
        if (para) await deps.canal.enviar(t, para, [resumoParaOVendedor({ nome, telefone: p.telefone, qualificacao, passo, plano })]);
      } catch (e) {
        aviso("avisar o vendedor", e);
      }
    }
    return { passo, plano, avisou: mudou };
  };
}

/**
 * A conversa com o vendedor foi marcada. Grava o passo e avisa, sempre: é o aviso que mais importa
 * ao Bruno (tem dia e hora), e não pode depender de o modelo ter chamado `registrar_lead` antes.
 * Nunca lança: o horário já está marcado, e a confirmação ao lead não espera o aviso.
 */
export function criarConversaMarcada(deps: {
  leads: RepositorioDeLeads;
  canal: CanalDeMensagens;
  vendedorDe: (t: ContextoTenant) => Promise<string | null>;
}): ConversaMarcada {
  return async (t, p) => {
    const antes = await deps.leads.ler(t, p.telefone).catch(() => null);
    const nome = texto(p.nome, 60) ?? antes?.nome ?? null;
    await deps.leads.marcarConversa(t, { telefone: p.telefone, nome }).catch((e) => aviso("marcar a conversa", e));
    try {
      const para = await deps.vendedorDe(t);
      if (para) {
        await deps.canal.enviar(t, para, [
          resumoDaConversaMarcada({ nome, telefone: p.telefone, quando: p.quando, qualificacao: antes?.qualificacao ?? null }),
        ]);
      }
    } catch (e) {
      aviso("avisar o vendedor da conversa marcada", e);
    }
  };
}

/** O link de pagar, para quem já tem conta. Não grava nada: pagar é dentro do app. */
export function criarLinkDoPagamentoDoLead(deps: { base: string }): LinkDoPagamentoDoLead {
  return async () => ({ link: linkDoPagamento(deps.base) });
}

export function criarLinkDoTesteDoLead(deps: {
  leads: RepositorioDeLeads;
  /** A raiz pública do app ("https://app.maisasecretary.com.br"). Da configuração. */
  base: string;
  relogio?: () => number;
}): LinkDoTesteDoLead {
  const relogio = deps.relogio ?? (() => Date.now());
  return async (t, p) => {
    const ficha = await deps.leads.ler(t, p.telefone).catch(() => null);
    const vertical = ehVertical(p.vertical) ? p.vertical : ficha?.qualificacao?.vertical ?? "generico";
    const link = linkDoTeste({ base: deps.base, vertical, plano: ficha?.plano ?? null });
    await deps.leads.marcarLink(t, { telefone: p.telefone, em: new Date(relogio()).toISOString() }).catch((e) => aviso("marcar o link", e));
    return { link };
  };
}

/* ───────────────────────────── na rotina ───────────────────────────── */

/** Telefone que não é de gente: vazio, curto, ou um dígito repetido ("11999999999"). */
function telefoneDeVerdade(tel: string | null): tel is string {
  const d = soDigitos(tel);
  if (d.length < 10 || d.length > 13) return false;
  const local = d.slice(-8);
  return !/^(\d)\1+$/.test(local) && local !== "12345678";
}

/** Alguma automática saiu para esta pessoa nas últimas 24 h? */
function automaticaRecente(f: FichaDeLead | null, agora: number): boolean {
  if (!f) return false;
  return [f.boasVindasEm, f.lembreteEm, f.retomadaEm].some((em) => !!em && agora - Date.parse(em) < 24 * 3_600_000);
}

export function criarAcompanharLeads(deps: {
  /** O inquilino da casa, da configuração. `null` = a maisa da maisa está desligada. */
  casa: () => string | null;
  cadastros: CadastrosDoApp;
  leads: RepositorioDeLeads;
  fila: FilaDeEnvios;
  historico: RepositorioHistorico;
  drenar: DrenarFilaDoNegocio;
  vendedorDe: (t: ContextoTenant) => Promise<string | null>;
}): AcompanharLeads {
  return async (agoraDate) => {
    const r: ResultadoDoAcompanhamento = { ligada: false, boasVindas: 0, lembretes: 0, retomadas: 0, falhas: [] };
    const casa = deps.casa();
    if (!casa) return r;
    r.ligada = true;

    const t: ContextoTenant = { tenantId: casa, usuarioId: "", ator: { tipo: "sistema", rotina: "vendas" } };
    const agora = agoraDate.getTime();
    const hoje = hojeISO(agora);
    const vendedor = chave8(await deps.vendedorDe(t).catch(() => null));
    const maisVelha = Math.max(...Object.values(JANELAS_MS).map((j) => j.ate));

    const desde = new Date(agora - maisVelha).toISOString();
    /* TODAS as contas, numa leitura só por rodada (são dezenas), e não uma por lead: a retomada
     * precisa saber se a pessoa tem conta, de qualquer idade. E se a leitura falhar, a rotina
     * inteira falha e nada sai: sem saber quem é cliente, a retomada perguntaria "ficou alguma
     * dúvida sobre a maisa?" a quem já paga. Achado na revisão de 05/11/2026. */
    const [todas, conversas] = await Promise.all([
      deps.cadastros.recentes(new Date(0).toISOString()),
      deps.leads.conversas(t, desde),
    ]);
    const cadastros = todas.filter((c) => c.criadaEm >= desde);
    const temConta = new Set(todas.map((c) => chave8(c.telefone)).filter((k) => k.length === 8));
    const conversaDe = new Map<string, ConversaDoLead>(conversas.map((c) => [chave8(c.ficha.telefone), c]));
    const tocados = new Set<string>();

    /** Reserva, enfileira e põe na conversa. Quem não reservou não manda. */
    async function mandar(p: { telefone: string; nome: string | null; tipo: Automatica; textos: string[] }): Promise<boolean> {
      const reservou = await deps.leads.reservarAutomatica(t, { telefone: p.telefone, nome: p.nome, tipo: p.tipo, em: agoraDate.toISOString() });
      if (!reservou) return false;
      try {
        await deps.fila.enfileirar(t, [{ para: p.telefone, textos: p.textos, origem: "vendas" }]);
      } catch (e) {
        await deps.leads.devolverAutomatica(t, { telefone: p.telefone, tipo: p.tipo });
        r.falhas.push(`${p.tipo} para …${chave8(p.telefone).slice(-4)}: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
      await deps.historico
        .anexar(t, p.telefone, p.textos.map((txt) => ({ de: "bot" as const, txt })))
        .catch((e) => aviso("pôr a mensagem automática na conversa", e));
      tocados.add(chave8(p.telefone));
      return true;
    }

    /* ── boas-vindas e lembrete: quem criou conta ── */
    for (const c of cadastros) {
      if (!telefoneDeVerdade(c.telefone)) continue;
      const k = chave8(c.telefone);
      if (k === vendedor || tocados.has(k)) continue;

      const etapa = etapaDoCadastro(c, hoje);
      if (etapa === "cliente") continue;
      const ficha = conversaDe.get(k)?.ficha ?? (await deps.leads.ler(t, c.telefone).catch(() => null));

      if (!ficha?.boasVindasEm && dentroDaJanela("boas_vindas", c.criadaEm, agora)) {
        /* No meio de uma conversa com a casa (veio da LP e criou a conta conversando), as
         * boas-vindas esperam a conversa assentar: a próxima rodada tenta de novo, dentro da janela. */
        const falando = conversaDe.get(k);
        const emConversa = !!falando && agora - Date.parse(falando.ultimaEm) < 30 * 60_000;
        if (!emConversa && horarioDeMandar("boas_vindas", agora)) {
          if (await mandar({ telefone: c.telefone, nome: c.nome, tipo: "boas_vindas", textos: textoDeBoasVindas(c.nome, agora) })) r.boasVindas++;
        }
        continue;
      }

      if (ficha?.lembreteEm || !ETAPAS_TRAVADAS.includes(etapa)) continue;
      if (!dentroDaJanela("lembrete", c.criadaEm, agora) || !horarioDeMandar("lembrete", agora)) continue;
      if (automaticaRecente(ficha, agora)) continue;
      /* Quem conversou com a casa nas últimas 24 h já está sendo ajudado: lembrete seria repetir. */
      const conversa = conversaDe.get(k);
      if (conversa && agora - Date.parse(conversa.ultimaEm) < 24 * 3_600_000) continue;

      const textos = textoDeLembrete(c.nome, etapa);
      if (textos && (await mandar({ telefone: c.telefone, nome: c.nome, tipo: "lembrete", textos }))) r.lembretes++;
    }

    /* ── retomada: quem conversou pela LP e parou de responder ── */
    for (const c of conversas) {
      const k = chave8(c.ficha.telefone);
      if (k === vendedor || tocados.has(k)) continue;
      if (!c.clienteFalou || c.ultimaDe !== "bot") continue;
      if (c.ficha.retomadaEm || c.ficha.passo === "conversa") continue;
      if (!dentroDaJanela("retomada", c.ultimaEm, agora) || !horarioDeMandar("retomada", agora)) continue;
      if (automaticaRecente(c.ficha, agora)) continue;
      /* Quem tem conta é do lembrete, que sabe em que passo ela parou. */
      if (temConta.has(k)) continue;

      const textos = textoDeRetomada(c.ficha.nome, !!c.ficha.linkEm);
      if (await mandar({ telefone: c.ficha.telefone, nome: c.ficha.nome, tipo: "retomada", textos })) r.retomadas++;
    }

    if (r.boasVindas + r.lembretes + r.retomadas > 0) {
      await deps.drenar(t).catch((e) => r.falhas.push(`drenar a fila: ${e instanceof Error ? e.message : String(e)}`));
    }
    return r;
  };
}
