"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * EMITIR RECIBOS — a tela do Faturamento para quem atende como pessoa física.
 *
 * ★ POR QUE ELA FOI REFEITA (Bruno, 25/08/2026): *"uma página com três assuntos, CTA que ainda
 * diz emitir notas no modo recibo"*. A tela antiga empilhava o onboarding fiscal, o arquivo do
 * e-CAC e o livro-caixa do mês, e nenhum dos três era o assunto principal — porque não havia
 * assunto principal.
 *
 * Agora tem **um**: emitir os recibos do mês. O que era configuração saiu para a tela
 * `Documento fiscal`, e o que era arquivo CSV ficou lá também, como o caminho manual.
 *
 * ── O QUE VEIO DO HANDOFF DE DESIGN, E O QUE NÃO VEIO ──
 *
 * Veio: as etapas explícitas com barra de progresso, o painel de emissão fixo à direita, o CTA
 * soberano com a contagem dentro, a prévia do documento, e o modal em duas fases (progresso →
 * resumo).
 *
 * Não veio: a fonte do protótipo (Plus Jakarta como família de texto — este repo a aposentou,
 * ela sobrevive só no wordmark), os valores de cor crus (usamos os tokens do `globals.css`), e a
 * etapa "Emitente". Aquela etapa pedia nome, CPF e CRP **na hora de emitir** — dado que não muda
 * de mês para mês e que agora mora na configuração. Duas etapas em vez de três, e a que sobrou
 * some quando não há nada a decidir.
 *
 * ── ⚠️ O PROGRESSO É REAL, E ISSO NÃO É DETALHE ──
 *
 * O protótipo animava o contador a cada 70ms. Aqui cada passo do contador é **uma emissão de
 * verdade**: um `POST /api/recibos/emitir` por pagamento, em série. Não há como fingir — e não
 * deveria haver, porque cada linha dessa barra é um documento fiscal no CPF de uma paciente.
 *
 * Em série de propósito, e não em paralelo: o canal cobra por processamento, a Receita não gosta
 * de rajada, e uma falha no meio de dez chamadas simultâneas deixaria o dono sem saber quais
 * saíram. Uma por vez, com o placar na tela.
 *
 * ── ★ LANÇAR À MÃO APARECE NA HORA (Bruno, 27/08/2026) ──
 *
 * *"o banco de recibos a ser emitidos não muda automaticamente quando eu lanço um novo recibo à
 * mão… parece que o recibo não foi lançado"*.
 *
 * O lançamento SEMPRE gravou. O que faltava era a tela dizer isso. Três coisas se somavam:
 *
 *   1 · O formulário fechava e disparava `carregar()` — DUAS leituras de rede (`/api/fiscal` e
 *       `/api/recibos`, até 15s cada) sem nenhum sinal na tela. Nesse intervalo a lista continuava
 *       mostrando exatamente o estado anterior. Fechar o formulário era o único feedback, e é o
 *       mesmo gesto de "cancelar".
 *   2 · Quando a lista enfim voltava, a linha nova entrava **ordenada por valor** (ver `agrupar`),
 *       num contêiner com rolagem própria. Um recibo de R$ 150 num mês de sessões de R$ 300 cai
 *       no meio da lista, fora da vista. Nada piscava, nada rolava.
 *   3 · Se o cliente escolhido no formulário estivesse marcado como `teste`, a linha NUNCA voltava
 *       — a view lê `coalesce(c.teste,false)` e `lerRecibosPendentes` filtra. Sumia calada.
 *
 * A resposta é otimista e reconciliada: o `POST` já devolve a linha pronta, então ela entra na
 * lista no mesmo instante, destacada e rolada até a vista, e a leitura de verdade corrige por
 * baixo. Os de teste saíram do seletor (ver `NovoPagamento`), e o que não voltar do servidor vira
 * frase na tela em vez de silêncio.
 *
 * ⚠️ OTIMISTA AQUI NÃO É ADIVINHAR. Não montamos a linha a partir do formulário: usamos o objeto
 * que o servidor criou, com o `id` dele. É por isso que a reconciliação é exata — o mesmo `id`
 * volta na leitura e a cópia otimista some sozinha, sem piscar e sem duplicar.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { s, Icon, fmt, Btn, Card, EmptyState, Estado, toast } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { useIsMobile } from "@/ui/useIsMobile";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";
import { representacao, type ConfigFiscal } from "@/nucleo/dominio/fiscal";
import { NOME_DA_OCUPACAO, faltaNosDados, faltaParaEmitirRecibo } from "@/nucleo/dominio/checklist-recibo";
import { hojeISO, rotuloBR } from "@/nucleo/dominio/tempo";
import { NovoPagamento } from "@/ui/componentes/NovoPagamento";
import { Moldura, PeDeAcao } from "@/ui/componentes/Moldura";
import { semAcento } from "@/ui/estado/busca";
import { juntarEmRecibos } from "@/nucleo/dominio/recibos-do-mes";

/* ── o que as rotas devolvem ─────────────────────────────────────────────── */

type Pendentes = {
  pagamentos: PagamentoPendente[];
  total: number;
  semCpf: number;
  avisos?: { falhou: number; semTelefone: number };
};
type Fiscal = { config: ConfigFiscal; caminho: string; falta: string[] };

/**
 * O que fazer com as duas respostas: virar tela, ou virar frase.
 *
 * ★ CADA RESPOSTA DECIDE ALGO. A primeira versão desta tela fazia `if (f?.ok !== false)
 * setFiscal(f)` e nada no `else`: quando `/api/fiscal` respondia 401 (sessão vencida) ou 502, a
 * tela ficava com `fiscal: null` e `erro: null` — e desenhava o esqueleto de carregamento PARA
 * SEMPRE. Um retângulo cinza, sem palavra e sem botão. Foi o que Bruno viu em 26/08/2026.
 *
 * ⚠️ Estado sem saída é pior que erro na cara: o erro tem "tentar de novo". Se um dia entrar uma
 * terceira leitura aqui, ela também precisa decidir — a ausência de `else` é o bug.
 *
 * Separada da tela para ter teste: é a única lógica que erra em SILÊNCIO.
 */
export function leituraDaTela(
  f: unknown,
  p: unknown,
): { erro: string } | { fiscal: Fiscal; pend: Pendentes } {
  const rf = (f ?? {}) as { ok?: boolean; info?: string; config?: unknown };
  const rp = (p ?? {}) as { ok?: boolean; info?: string };

  /* `!config` junto com `ok === false` de propósito: 200 sem config é resposta de outra rota (ou
   * de um proxy), e seguir com ela estouraria no primeiro `config.prestadorCpf`. */
  if (rf.ok === false || !rf.config) {
    return { erro: rf.info ?? "Não deu para ler a sua configuração fiscal. Recarregue a página." };
  }
  if (rp.ok === false) {
    return { erro: rp.info ?? "Não deu para ler o que falta emitir." };
  }
  return { fiscal: f as Fiscal, pend: p as Pendentes };
}

/* ── agrupamento por cliente ──────────────────────────────────────────────── */

type Grupo = { nome: string; cpf: string | null; itens: PagamentoPendente[]; valor: number };

/**
 * Junta os pagamentos por pessoa.
 *
 * ⚠️ A SELEÇÃO É POR CLIENTE, E OS SEM CPF NÃO ENTRAM. A Receita recusa recibo sem CPF do
 * beneficiário, então oferecê-los para marcar seria oferecer um erro. Eles aparecem contados
 * numa linha separada, com o caminho para resolver — que é a ficha do cliente, não esta tela.
 *
 * Exportada para ter teste: agrupar é a única lógica desta tela que erra em silêncio.
 */
export function agrupar(pagamentos: PagamentoPendente[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const p of pagamentos) {
    if (!p.cpf) continue;
    const chave = `${p.nome}|${p.cpf}`;
    const g = mapa.get(chave) ?? { nome: p.nome, cpf: p.cpf, itens: [], valor: 0 };
    g.itens.push(p);
    g.valor += p.valor;
    mapa.set(chave, g);
  }
  /* Maior valor primeiro: num fechamento de mês, é por onde o olho começa. */
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/**
 * Os que ficaram de fora por falta de CPF, por pessoa (1C.10, 06 P0-6).
 *
 * Antes a tela só dizia "3 sem CPF ficam fora", sem nome e sem botão: ela fechava o mês sem
 * três recibos e descobria quando o paciente pedia. Agora cada um é uma linha, desligada, com
 * "Pôr CPF". Mesmo formato de `Grupo` (com `cpf: null`), na ordem de `agrupar`.
 */
export function semCpfPorPessoa(pagamentos: PagamentoPendente[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const p of pagamentos) {
    if (p.cpf) continue;
    const g = mapa.get(p.nome) ?? { nome: p.nome, cpf: null, itens: [], valor: 0 };
    g.itens.push(p);
    g.valor += p.valor;
    mapa.set(p.nome, g);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/* ── ★ A LISTA OTIMISTA, EM DUAS FUNÇÕES PURAS ────────────────────────────────
 *
 * Exportadas pelo mesmo motivo que `agrupar`: erram em silêncio. Uma linha duplicada e uma linha
 * perdida têm exatamente a mesma aparência na tela — nenhuma — até alguém conferir o fechamento
 * do mês contra o extrato.
 * ─────────────────────────────────────────────────────────────────────────────── */

/**
 * O que a tela mostra: o que o servidor devolveu, mais o que ele já tem e ainda não devolveu.
 *
 * ⚠️ O DESEMPATE É POR `id`, e o `id` vem do servidor nos dois casos (a cópia otimista é a linha
 * que o `POST` criou). Por isso a duplicata é impossível: no instante em que a leitura traz a
 * linha, a cópia deixa de ser incluída — sem piscar, sem contar duas vezes no CTA.
 */
export function mesclar(
  doServidor: PagamentoPendente[],
  otimistas: PagamentoPendente[],
): PagamentoPendente[] {
  const vistos = new Set(doServidor.map((x) => x.id));
  return [...otimistas.filter((o) => !vistos.has(o.id)), ...doServidor];
}

/**
 * O que a leitura resolveu, e o que ela deixou sem resposta.
 *
 * `conferidos` = ids que não precisam mais de cópia otimista (a leitura passou por eles, tendo
 * trazido ou não). `sumiram` = os que foram criados e não voltaram — cliente `teste`, RLS, ou
 * qualquer coisa que a gente ainda não viu.
 *
 * ⚠️ `antes` É A FOTO DE ANTES DO `await`, nunca o estado atual. Um lançamento feito DURANTE a
 * leitura não pode ser julgado por uma resposta que não podia conhecê-lo — seria apagá-lo da tela
 * exatamente pelo defeito que este código existe para corrigir.
 */
export function reconciliar(
  antes: PagamentoPendente[],
  doServidor: PagamentoPendente[],
): { conferidos: string[]; sumiram: string[] } {
  const noBanco = new Set(doServidor.map((x) => x.id));
  return {
    conferidos: antes.map((o) => o.id),
    sumiram: antes.filter((o) => !noBanco.has(o.id)).map((o) => o.nome),
  };
}

/* ── peças da tela ────────────────────────────────────────────────────────── */

const ETAPAS = ["Recibos", "Conferência"] as const;

function BarraDeEtapas({ etapa, ir }: { etapa: number; ir: (n: number) => void }) {
  return (
    <Card pad={0} style={s("padding:13px 20px;display:flex;align-items:center;gap:14px")}>
      {ETAPAS.map((rotulo, i) => {
        const n = i + 1;
        const atual = n === etapa;
        return (
          <React.Fragment key={rotulo}>
            {i > 0 && <span aria-hidden style={s("width:16px;height:2px;background:var(--line);flex:none")} />}
            <button
              onClick={() => ir(n)}
              className="m-focus"
              style={s(`border:none;background:transparent;cursor:pointer;font-family:inherit;padding:2px 0;font-size:var(--t-sm);font-weight:${atual ? "var(--w-emph)" : "var(--w-title)"};color:${atual ? "var(--primary)" : "var(--muted)"};transition:color var(--dur-fast) var(--ease-out)`)}
              aria-current={atual ? "step" : undefined}
            >
              {n}. {rotulo}
            </button>
          </React.Fragment>
        );
      })}
      {/* A barra à direita não é enfeite: é a única coisa na tela que diz "falta pouco". */}
      <span
        aria-hidden
        style={s("flex:1;min-width:40px;height:5px;border-radius:20px;background:var(--surface-2);overflow:hidden")}
      >
        <span style={s(`display:block;height:100%;border-radius:20px;background:var(--primary);width:${(etapa / ETAPAS.length) * 100}%;transition:width var(--dur-base) var(--ease-out)`)} />
      </span>
    </Card>
  );
}

/**
 * Linha do emitente. Read-only de propósito — quem muda é a tela de configuração.
 *
 * ★ E A AUTORIZAÇÃO DE ACESSO MORA AQUI (25/09/2026, 1A.13, 06 P0-3). Ela é a única peça que
 * vence e depende das mãos dela, e não aparecia em lugar nenhum: vencida em 01/09, "Emitir 11
 * recibos" aceso, e os 11 voltavam recusados. Válida, a linha diz até quando; vencida ou
 * esperando o nosso aceite, a linha fica âmbar com a frase de `faltaParaEmitirRecibo`, e
 * "Renovar autorização" quando a bola é dela.
 */
/* ── ★ PARA ONDE VAI O RECIBO (01/10/2026, pedido da Regina) ──
 *
 * Era o interruptor "Avisar os pacientes", ao lado do "Emitir". A Regina pediu um terceiro
 * caminho, ver o recibo antes do paciente, e o Bruno pediu a escolha no canto de cima, à direita.
 * Três posições e não dois interruptores: "avisar" e "para quem" são uma pergunta só para quem
 * usa ("o que acontece quando o recibo sai?"), e dois interruptores deixariam ligar "primeiro para
 * mim" com o aviso desligado, um estado que não faz nada.
 *
 * ⚠️ O PEDIDO MANDA SÓ O QUE MUDA. `reciboPrimeiroParaMim` só existe depois da 032; mandá-lo em
 * todo clique faria "Não enviar" e "Para o paciente" falharem num banco sem ela, e esses dois
 * funcionam desde a 024. Ver `definirCfg` no store.
 *
 * Vale para todo recibo, o da tela e o automático (o "Dia do recibo" da ficha). */
type Destino = "nao" | "paciente" | "mim";
const DESTINOS: { id: Destino; rotulo: string; frase: string }[] = [
  { id: "nao", rotulo: "Não enviar", frase: "Ninguém recebe mensagem. O recibo aparece no app da Receita do paciente." },
  { id: "paciente", rotulo: "Para o paciente", frase: "Quando a Receita confirmar, a MAISA avisa o paciente pelo seu WhatsApp." },
  { id: "mim", rotulo: "Primeiro para mim", frase: "Quando a Receita confirmar, a mensagem vem para você no WhatsApp, pronta para encaminhar." },
];
export const destinoDoRecibo = (cfg: { avisarRecibo: boolean; reciboPrimeiroParaMim: boolean }): Destino =>
  !cfg.avisarRecibo ? "nao" : cfg.reciboPrimeiroParaMim ? "mim" : "paciente";
export const fraseDoDestino = (d: Destino) => DESTINOS.find((x) => x.id === d)!.frase;

function ParaOndeVaiORecibo({ mobile }: { mobile: boolean }) {
  const st = useStore();
  const atual = destinoDoRecibo(st.cfg);
  const escolher = (d: Destino) => {
    if (d === atual) return;
    st.definirCfg({
      avisarRecibo: d !== "nao",
      ...(d === "mim" ? { reciboPrimeiroParaMim: true } : d === "paciente" && st.cfg.reciboPrimeiroParaMim ? { reciboPrimeiroParaMim: false } : {}),
    });
  };
  return (
    <div style={s(`display:flex;flex-direction:column;gap:6px;${mobile ? "width:100%" : "align-items:flex-end;flex:none"}`)}>
      <div role="radiogroup" aria-label="Para onde vai o recibo" style={s(`display:flex;align-items:center;gap:6px;flex-wrap:wrap;${mobile ? "" : "justify-content:flex-end"}`)}>
        <span style={s("font-size:var(--t-label);color:var(--muted);margin-right:4px")}>Recibo pronto vai</span>
        {DESTINOS.map((d) => {
          const on = d.id === atual;
          return (
            <button
              key={d.id}
              role="radio"
              aria-checked={on}
              onClick={() => escolher(d.id)}
              className="m-press m-focus m-hov-prim-border m-filtro"
              style={s(`font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);padding:7px 13px;border-radius:999px;cursor:pointer;white-space:nowrap;border:1px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"};color:${on ? "var(--primary-dark)" : "var(--muted)"}`)}
            >
              {d.rotulo}
            </button>
          );
        })}
      </div>
      <span style={s(`font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose);${mobile ? "" : "text-align:right;white-space:nowrap"}`)}>
        {fraseDoDestino(atual)}
      </span>
    </div>
  );
}

function Emitente({ config, mobile }: { config: ConfigFiscal; mobile: boolean }) {
  const st = useStore();
  const nome = NOME_DA_OCUPACAO[config.ocupacaoSaude ?? "psicologo"];
  const hoje = hojeISO();
  const rep = representacao(config, hoje);
  const bloqueio = faltaParaEmitirRecibo(config, hoje).find((f) => f.id === "autorizacao");
  return (
    <div style={s("display:flex;flex-direction:column;gap:8px")}>
    <div style={s("display:flex;align-items:flex-start;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;padding:0 4px")}>
    <div style={s("display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;padding-top:6px")}>
      <span style={s("font-size:var(--t-label);color:var(--muted)")}>Emitente</span>
      <span className="n-mach" style={s("font-size:var(--t-label);color:var(--ink);font-weight:var(--w-title)")}>
        {config.prestadorCpf}
      </span>
      <span style={s("font-size:var(--t-label);color:var(--muted)")}>·</span>
      <span style={s("font-size:var(--t-label);color:var(--muted)")}>{nome}</span>
      {config.registroProfissional && (
        <>
          <span style={s("font-size:var(--t-label);color:var(--muted)")}>·</span>
          <span className="n-mach" style={s("font-size:var(--t-label);color:var(--muted)")}>
            {config.registroProfissional}
          </span>
        </>
      )}
      {/* Encostado no dado desde 01/10/2026: o canto direito passou a ser da escolha de para
          onde vai o recibo, e "Editar" lá ficaria parecendo editar a escolha. */}
      <button
        onClick={() => st.irPara("fiscal")}
        className="m-focus"
        style={s("margin-left:6px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);color:var(--primary);padding:2px 0")}
      >
        {/* "Editar", e não "Documento fiscal" como antes: desde que a etapa 1 ganhou o botão
            "Voltar e editar meus dados" no pé, dois nomes diferentes para o MESMO destino na mesma
            tela sugeririam dois lugares. Aqui, ao lado do dado, o verbo basta. */}
        Editar
      </button>
    </div>
    <ParaOndeVaiORecibo mobile={mobile} />
    </div>
    {bloqueio ? (
      <div role="status" style={s("display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:var(--r-painel);border:1px solid var(--warn-line);background:var(--warn-soft)")}>
        <Icon name="alert" size={16} style={s("flex-shrink:0;color:var(--warn)")} />
        <span style={s("flex:1;min-width:200px;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{bloqueio.frase}</span>
        {bloqueio.quem === "voce" && (
          <Btn size="sm" onClick={() => st.irPara("fiscal", "autorizacao")}>Renovar autorização</Btn>
        )}
      </div>
    ) : rep.modo === "representada" ? (
      <span style={s("padding:0 4px;font-size:var(--t-label);color:var(--muted)")}>
        {rep.ate ? `Autorização de acesso vale até ${rotuloBR(rep.ate)}` : "Autorização de acesso sem prazo, vale até você cancelar"}
      </span>
    ) : null}
    </div>
  );
}

/* ── a tela ───────────────────────────────────────────────────────────────── */

export function EmitirRecibos() {
  const st = useStore();
  const mobile = useIsMobile();

  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [pend, setPend] = useState<Pendentes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState(1);
  /** `null` = ainda não mexeram: vale "todos". Depois disso, a escolha é dela. */
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState(0);

  /* ── ★ AS LINHAS QUE JÁ EXISTEM NO BANCO MAS AINDA NÃO VOLTARAM NA LEITURA ──
   *
   * Vêm do `POST /api/recibos`, que devolve a linha criada. Ficam aqui até a próxima leitura
   * trazê-las — aí se apagam sozinhas, porque o `id` é o mesmo.
   *
   * ⚠️ O `ref` ANDA JUNTO COM O STATE de propósito: `carregar` é um `useCallback` estável (as
   * telas dependem disso — ele é deps de dois efeitos), e ler o state de dentro dele congelaria
   * o valor da primeira renderização. Toda escrita passa por `mudarOtimistas`, que mexe nos dois. */
  const otimistasRef = useRef<PagamentoPendente[]>([]);
  const [otimistas, setOtimistas] = useState<PagamentoPendente[]>([]);
  const mudarOtimistas = useCallback((fn: (a: PagamentoPendente[]) => PagamentoPendente[]) => {
    otimistasRef.current = fn(otimistasRef.current);
    setOtimistas(otimistasRef.current);
  }, []);

  /** O que foi lançado e o servidor não devolveu. Frase na tela — nunca silêncio. */
  const [sumiram, setSumiram] = useState<string[]>([]);
  /** O último lançamento: destaca a linha, rola até ela e aponta a prévia. `null` = nada novo. */
  const [novo, setNovo] = useState<{ id: string; chave: string } | null>(null);
  const linhaNova = useRef<HTMLButtonElement | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    /* ⚠️ A FOTO É TIRADA ANTES DO `await`. Reconciliar contra `otimistasRef.current` depois da
     * volta apagaria um lançamento feito DURANTE esta leitura — que esta resposta não podia
     * conhecer, e que voltaria a sumir da tela. */
    const antes = otimistasRef.current;
    try {
      /* `no-store` nas duas: `carregar()` roda DE NOVO depois de emitir, e o navegador servindo a
       * resposta antiga mostraria os mesmos recibos ainda por emitir.
       *
       * ⚠️ E COM PRAZO. Requisição que nunca resolve deixa o esqueleto de carregamento na tela
       * para sempre — o mesmo beco de antes, por outro caminho. 15s aqui vira "tente de novo"; o
       * `maxDuration` das rotas de leitura é bem menor que isso. */
      const [f, p] = await Promise.all([
        fetch("/api/fiscal", { cache: "no-store", signal: AbortSignal.timeout(15_000) }).then((r) => r.json()),
        fetch("/api/recibos", { cache: "no-store", signal: AbortSignal.timeout(15_000) }).then((r) => r.json()),
      ]);

      /* Ver `leituraDaTela`: nenhuma das duas respostas pode passar sem decidir nada. */
      const lido = leituraDaTela(f, p);
      if ("erro" in lido) { setErro(lido.erro); return; }

      setFiscal(lido.fiscal);
      setPend(lido.pend);

      /* ── reconciliação ──
       * O que esta leitura já contém não precisa mais de cópia otimista. O que ela NÃO contém,
       * tendo sido criado antes dela, é uma linha que o banco engoliu — e vira frase. */
      if (antes.length) {
        const { conferidos, sumiram } = reconciliar(antes, lido.pend.pagamentos);
        const resolvidos = new Set(conferidos);
        mudarOtimistas((a) => a.filter((o) => !resolvidos.has(o.id)));
        setSumiram(sumiram);
      }
    } catch {
      setErro("Não deu para falar com o servidor. Tente de novo em um instante.");
    }
  }, [mudarOtimistas]);

  useEffect(() => { void carregar(); }, [carregar]);

  const pagamentos = useMemo(() => mesclar(pend?.pagamentos ?? [], otimistas), [pend, otimistas]);
  const grupos = useMemo(() => agrupar(pagamentos), [pagamentos]);
  const semCpf = useMemo(() => semCpfPorPessoa(pagamentos), [pagamentos]);
  const escolhidos = useMemo(
    () => grupos.filter((g) => !desmarcados.has(`${g.nome}|${g.cpf}`)),
    [grupos, desmarcados],
  );
  const aEmitir = useMemo(() => escolhidos.flatMap((g) => g.itens), [escolhidos]);
  const valor = useMemo(() => aEmitir.reduce((a, p) => a + p.valor, 0), [aEmitir]);
  /* ★ OS RECIBOS, E NÃO AS SESSÕES (01/10/2026, Bruno: "cada paciente só recebe um recibo por
   * mês"). As sessões escolhidas viram recibos pela escolha da ficha de cada pessoa
   * (`recibosPorMes`). Sem a 033 a ficha não tem a escolha (`undefined`), e cai em um por sessão,
   * que é como era: juntar sem a função do banco seria recusado. A contagem do botão, a prévia e a
   * conferência falam de recibos. */
  const recibos = useMemo(
    () => juntarEmRecibos(aEmitir, (id) => st.clienteDe(id)?.recibosPorMes ?? 0),
    [aEmitir, st.cadastro.clientes], // eslint-disable-line react-hooks/exhaustive-deps -- `clienteDe` lê de `cadastro.clientes`
  );

  /**
   * ★ O LANÇAMENTO ENTRA NA LISTA NO MESMO CLIQUE.
   *
   * Não recarrega e espera: põe a linha que o servidor acabou de criar, marca para destacar, e
   * deixa o `carregar()` de baixo confirmar. Ver o cabeçalho para o porquê.
   */
  const inserir = useCallback((p: PagamentoPendente) => {
    mudarOtimistas((a) => [p, ...a.filter((x) => x.id !== p.id)]);
    const chave = `${p.nome}|${p.cpf}`;
    /* ⚠️ RECÉM-LANÇADO ENTRA MARCADO, mesmo que o cliente estivesse desmarcado. Desmarcar foi uma
     * decisão sobre o que existia; lançar agora é dizer que ESTE vai. O contrário seria somar um
     * recibo ao total e não somar ao "a emitir" — divergência silenciosa entre a lista e o CTA. */
    setDesmarcados((a) => { const n = new Set(a); n.delete(chave); return n; });
    setNovo({ id: p.id, chave });
    setSumiram([]);
    /* A linha mora na etapa 1. Lançar da etapa 2 e continuar na conferência mostraria um número
     * mudando sem a linha que o explica. */
    setEtapa(1);
  }, [mudarOtimistas]);

  /* O destaque é temporário: ele responde "caiu aqui", não marca um estado. */
  useEffect(() => {
    if (!novo) return;
    const t = setTimeout(() => setNovo(null), 5000);
    return () => clearTimeout(t);
  }, [novo]);

  const alternar = (g: Grupo) => {
    const chave = `${g.nome}|${g.cpf}`;
    setDesmarcados((antes) => {
      const novo = new Set(antes);
      if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
      return novo;
    });
    setPrevia(0);
  };

  /* ── a emissão ───────────────────────────────────────────────────────────
   *
   * ★ ELA NÃO ACONTECE MAIS AQUI. Vive no store (`emitirRecibos`) e é mostrada pelo cartão do
   * canto (`ProgressoDeEmissao`), montado no `AppShell`.
   *
   * Bruno, 26/08/2026: *"queria não ter que ficar olhando para uma telinha enquanto isso
   * acontece"*. Um lote de 50 recibos é uma chamada por recibo, em série; o modal que ficava aqui
   * prendia o dono na tela, e sair da tela desmontava o placar de uma emissão que continuava
   * correndo.
   *
   * ⚠️ E A LISTA SE RELÊ DO SERVIDOR quando a emissão termina (`emissoesFeitas`). Descontar na mão
   * mostraria o que a tela ACHA que saiu; o que vale é o que o banco diz. */
  const emitir = () => void st.emitirRecibos(recibos.map((r) => ({ itens: r.map((p) => ({ fonte: p.fonte, id: p.id })), nome: r[0].nome })));

  const emitindoAgora = st.emissao?.estado === "andando";

  useEffect(() => {
    /* Roda também na primeira montagem com o contador em 0 — inofensivo: `carregar` é idempotente
     * e o efeito de cima já leu. Guardar contra isso exigiria um ref para economizar uma leitura. */
    if (st.emissoesFeitas > 0) void carregar();
  }, [st.emissoesFeitas, carregar]);

  /* ⚠️ A FICHA GRAVOU, A LISTA RELÊ (1C.10). O "Pôr CPF" abre a ficha da pessoa, e o CPF
   * digitado lá só tira a linha do grupo "Sem CPF" se `/api/recibos` for lido de novo: quem
   * monta o grupo é o servidor, não o cadastro da tela. */
  useEffect(() => {
    if (st.clientesGravados > 0) void carregar();
  }, [st.clientesGravados, carregar]);

  /** Abre a ficha de quem está sem CPF. O pagamento não traz o id do cliente (a porta
   *  `PagamentoPendente` não tem `clienteId`, e mexer nela pede o Bruno), então a ponte é o
   *  nome, que a view já tira do cadastro. Mais de um com o mesmo nome, ou nenhum: Clientes. */
  const porCpf = (nome: string) => {
    const alvo = semAcento(nome.trim());
    const achados = st.cadastro.clientes.filter((c) => semAcento(c.nome.trim()) === alvo);
    if (achados.length === 1) { st.abrir(achados[0].id); return; }
    st.irPara("clientes");
    toast(achados.length > 1 ? `Há ${achados.length} clientes chamados ${nome}. Abra a ficha certa e ponha o CPF.` : `Não achei ${nome} em Clientes. Procure pelo telefone e ponha o CPF na ficha.`);
  };

  /* ── ★ LEVAR O OLHO ATÉ A LINHA ──
   *
   * `agrupar` ordena por VALOR, e a lista tem rolagem própria. Uma sessão de R$ 150 lançada num mês
   * de sessões de R$ 300 nasce no meio de tudo, fora da vista — e "não apareceu" e "apareceu onde
   * eu não estou olhando" são a mesma coisa para quem clicou.
   *
   * A prévia do painel da direita também aponta para ela: é onde o valor, o nome e o CPF aparecem
   * por extenso, e é a conferência do que acabou de ser digitado.
   *
   * ⚠️ `aEmitir` nas deps faz isto rodar de novo quando a leitura substitui a cópia otimista. É
   * de propósito e é barato: o `id` não muda, então a rolagem já está no lugar e vira no-op. */
  useEffect(() => {
    if (!novo) return;
    linhaNova.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const i = aEmitir.findIndex((x) => x.id === novo.id);
    if (i >= 0) setPrevia(i);
  }, [novo, aEmitir]);

  /* ── estados que não são a tela ──────────────────────────────────────────── */

  if (erro) {
    return <Moldura><EmptyState title="Não deu para carregar" sub={erro} action={<Btn onClick={() => void carregar()}>Tentar de novo</Btn>} /></Moldura>;
  }
  if (!fiscal || !pend) {
    return <Moldura><div style={s("height:220px;flex-shrink:0;border-radius:var(--radius-card);background:var(--surface-2)")} aria-busy="true" /></Moldura>;
  }

  /* ⚠️ O REGISTRO NO CONSELHO É CONFERIDO AQUI, E NÃO EM `fiscalFaltando`.
   *
   * Aquela função espelha, de propósito, a `fiscal_configurado()` da migração 014 — e o comentário
   * dela avisa que o conjunto de condições não pode divergir do banco. Acrescentar o registro lá
   * exigiria mexer no SQL na mesma passada, num caminho que também serve a nota fiscal.
   *
   * Mas sem registro a emissão falha **no canal**, não aqui: o `/issuers` da Rebots exige
   * `registration` para habilitar um emitente novo. Ou seja, o CTA ficaria clicável e cada recibo
   * voltaria recusado, um por um. Bloquear com a frase certa é mais honesto que deixar tentar. */
  /* Desde 25/09/2026 a regra mora em `faltaParaEmitirRecibo` (domínio, com teste), a mesma do
   * Documento fiscal: antes cada tela tinha a sua e as duas se contradiziam (06 P0-4). */
  const faltas = faltaParaEmitirRecibo(fiscal.config, hojeISO());
  const semRegistro = faltas.some((f) => f.id === "registro");
  /** Autorização vencida ou esperando aceite: a lista aparece, o CTA desliga com a frase. */
  const bloqueioDaAutorizacao = faltas.find((f) => f.id === "autorizacao") ?? null;

  /* ⚠️ FALTA CONFIGURAÇÃO: a tela não oferece um botão que o servidor vai recusar. Um bloco, uma
   * frase, um caminho — e o caminho é a outra tela, porque é lá que isso se resolve agora. */
  if (fiscal.falta.length > 0 || faltaNosDados(faltas).length > 0) {
    const pendencias = [...fiscal.falta, ...(semRegistro ? ["o seu registro no conselho"] : [])];
    return (
      <Moldura>
      <Card style={s("display:flex;flex-direction:column;gap:14px;align-items:flex-start;flex-shrink:0")}>
        <Estado forma="triangulo" tom="warn">Falta configurar</Estado>
        <div>
          <h2 style={s("font-size:var(--t-title);font-weight:var(--w-emph);letter-spacing:var(--ls-title);color:var(--ink);margin:0 0 6px")}>
            Antes de emitir, complete seus dados
          </h2>
          <p style={s("font-size:var(--t-sm);color:var(--muted);margin:0;max-width:52ch;line-height:var(--lh-prose)")}>
            {/* A lista sai do servidor, não de um texto fixo: dizer "complete seus dados" sem
                dizer QUAIS manda procurar. */}
            Falta {pendencias.join(", ").replace(/, ([^,]*)$/, " e $1")}. O recibo sai no seu CPF, e
            a Receita recusa o documento sem isso.
          </p>
        </div>
        <Btn icon="edit" onClick={() => st.irPara("fiscal")}>Preencher meus dados</Btn>
      </Card>
      </Moldura>
    );
  }

  /* ── ★ MÊS FECHADO NÃO É OUTRA TELA ──
   *
   * Bruno, 26/08/2026: *"não faz sentido aparecer essa tela, vai que eu quero colocar um recibo a
   * mais à mão... a tela tem que sempre ser igual, se o mês estiver fechado, devo chegar na mesma
   * tela que se tivesse 1000 pessoas, só que com a opção de clicar em novo recibo"*.
   *
   * Aqui morava um `EmptyState` de tela cheia ("Mês em dia") que substituía TUDO — inclusive o
   * único caminho para lançar um pagamento que a agenda não pegou. Zero a emitir é um estado da
   * lista, não uma tela diferente: a forma é a mesma com 0 e com 1000, e o que muda é o que a
   * lista mostra e se o CTA está clicável. */

  const previaRecibo = recibos[Math.min(previa, Math.max(recibos.length - 1, 0))];
  const previaItem = previaRecibo && {
    nome: previaRecibo[0].nome,
    cpf: previaRecibo[0].cpf,
    valor: previaRecibo.reduce((a, p) => a + p.valor, 0),
    datas: previaRecibo.map((p) => p.data).sort(),
  };
  const travado = aEmitir.length === 0 || emitindoAgora || bloqueioDaAutorizacao !== null;

  /* Para onde vai o recibo, dito ao lado do verbo (Bruno, 26/08/2026: *"poderia ficar logo acima
   * do emitir"*). Desde 01/10/2026 a ESCOLHA mora no canto de cima (`ParaOndeVaiORecibo`); aqui
   * fica só a frase, para quem vai clicar saber o que acontece depois, sem um segundo controle
   * para a mesma pergunta. */
  const avisar = (
      <div style={s(`display:flex;align-items:flex-start;gap:9px;padding-top:14px;border-top:1px solid var(--border);${mobile ? "" : "margin-top:auto"}`)}>
        <span aria-hidden style={s("flex:none;color:var(--muted);display:flex;padding-top:1px")}><Icon name="chat" size={15} /></span>
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
          {fraseDoDestino(destinoDoRecibo(st.cfg))}
        </span>
      </div>
  );

  /* ── painel da direita: os números e o botão ─────────────────────────────── */

  const painel = (
    <Card
      pad={0}
      style={s(`background:var(--primary-soft);padding:20px 20px 22px;display:flex;flex-direction:column;gap:16px;${mobile ? "" : "width:380px;flex:none;min-height:0"}`)}
    >
      <div>
        <span style={s("display:block;font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>
          A emitir
        </span>
        <span className="n" style={s("display:block;font-size:var(--t-data);line-height:var(--lh-tight);font-weight:var(--w-emph);letter-spacing:var(--ls-data);color:var(--ink);margin-top:6px")}>
          {recibos.length}
        </span>
        <span className="n" style={s("display:block;font-size:var(--t-lg);font-weight:var(--w-title);letter-spacing:var(--ls-lg);color:var(--muted);margin-top:3px")}>
          {fmt(valor)}
        </span>
      </div>

      {previaItem && (
        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);padding:14px;display:flex;flex-direction:column;gap:7px")}>
          <div style={s("display:flex;align-items:center;justify-content:space-between;gap:8px")}>
            <span style={s("font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>
              Prévia · {Math.min(previa + 1, recibos.length)} de {recibos.length}
            </span>
            {recibos.length > 1 && (
              <span style={s("display:flex;gap:5px")}>
                <button
                  onClick={() => setPrevia((i) => (i - 1 + recibos.length) % recibos.length)}
                  className="m-focus m-hov-bg"
                  aria-label="Recibo anterior"
                  style={s("width:26px;height:26px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--muted)")}
                >
                  <Icon name="chevron-left" size={14} />
                </button>
                <button
                  onClick={() => setPrevia((i) => (i + 1) % recibos.length)}
                  className="m-focus m-hov-bg"
                  aria-label="Próximo recibo"
                  style={s("width:26px;height:26px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--muted)")}
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </span>
            )}
          </div>
          <span className="n" style={s("font-size:var(--t-lg);font-weight:var(--w-emph);letter-spacing:var(--ls-lg);color:var(--ink)")}>
            {fmt(previaItem.valor)}
          </span>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{previaItem.nome}</span>
          <span className="n-mach" style={s("font-size:var(--t-label);color:var(--muted)")}>
            {previaItem.cpf} · {previaItem.datas.length === 1
              ? rotuloBR(previaItem.datas[0])
              : `${previaItem.datas.length} sessões, ${previaItem.datas.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}`}
          </span>
        </div>
      )}

      {/* ★ O CTA SOBERANO: o maior elemento clicável da tela, com a contagem dentro. Ele é o
          assunto da página — e a contagem no rótulo é o que impede o clique às cegas. */}
      {/* ── ★ O AVISO AO PACIENTE, ENCOSTADO NO CTA ──
       *
       * Bruno, 26/08/2026: *"não cheguei a achar o toggle fácil, poderia ficar logo acima do
       * emitir"*. Ele morava na tela de configuração, que é o lugar teoricamente certo e
       * praticamente invisível — ninguém vai lá duas vezes.
       *
       * Aqui, encostado no botão, ele aparece no instante em que a pergunta existe de verdade:
       * "quando eu clicar, meus pacientes vão saber disso?".
       *
       * ⚠️ MAS NÃO É UMA OPÇÃO DESTE LOTE, e a frase precisa dizer isso. É um ajuste do negócio
       * que fica ligado — quem ler "avisar os pacientes" ao lado de "Emitir 18 recibos" pensa em
       * caixinha de uma vez só, e desligaria achando que só pulou hoje. */}
      {avisar}

      {/* ⚠️ TRAVADO TAMBÉM ENQUANTO UMA EMISSÃO ANDA. O placar saiu para o canto da tela, então o
          CTA continua visível durante a emissão — sem esta guarda, um segundo clique enfileiraria
          os mesmos pagamentos de novo (o store também trava, e as duas travas são de propósito:
          uma impede o pedido, a outra impede a promessa). */}
      {/* ⚠️ `margin-top:auto` NO CTA, e não `space-between` no painel: o número e a prévia ficam
          ancorados no topo (é por onde o olho entra) e o botão desce para o pé do cartão esticado.
          Distribuir tudo faria a prévia flutuar no meio, longe da contagem a que ela pertence. */}
      <button
        onClick={emitir}
        disabled={travado}

        className={travado ? "" : "m-hov-bright m-press m-focus"}
        style={s(`width:100%;height:${mobile ? 54 : 60}px;flex:none;border-radius:var(--r-painel);border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:var(--t-body);font-weight:var(--w-title);letter-spacing:var(--ls-lg);cursor:${travado ? "not-allowed" : "pointer"};opacity:${travado ? ".42" : "1"};box-shadow:var(--shadow-card)`)}
      >
        {emitindoAgora
          ? "Emitindo…"
          : aEmitir.length === 0
            ? "Nada a emitir"
            : recibos.length === 1 ? "Emitir 1 recibo" : `Emitir ${recibos.length} recibos`}
      </button>
      <span style={s(`text-align:center;font-size:var(--t-label);color:${bloqueioDaAutorizacao ? "var(--warn)" : "var(--muted)"};font-weight:${bloqueioDaAutorizacao ? "var(--w-title)" : "inherit"};line-height:1.5`)}>
        {bloqueioDaAutorizacao
          ? bloqueioDaAutorizacao.frase
          : aEmitir.length === 0
            ? "Todo atendimento pago do mês já tem recibo."
            : "Emissão definitiva. Cancelamento em até 10 dias."}
      </span>
    </Card>
  );

  /* ── painel da esquerda: a etapa ─────────────────────────────────────────── */

  const conteudo = etapa === 1 ? (
    <>
      <div style={s("display:flex;align-items:baseline;justify-content:space-between;gap:12px")}>
        <h2 style={s("font-size:var(--t-title);font-weight:var(--w-emph);letter-spacing:var(--ls-title);color:var(--ink);margin:0")}>
          Recibos
        </h2>
      </div>

      {/* ⚠️ `overflow-y:auto` no desktop: com 40 clientes, quem rola é a lista — o painel da
          direita e o CTA não podem sair de vista. `overflow:hidden` sozinho (o de antes) cortava. */
      }
      {/* ⚠️ VAZIO ESTICADO SE CENTRALIZA. Com a lista ocupando a altura toda e uma linha só dentro,
          o "Mês em dia" colado no topo deixaria um buraco embaixo — dentro do cartão, que é pior
          que fora dele. Centralizado, a folga vira moldura. */}
      <div style={s(`border:1px solid var(--border);border-radius:var(--r-painel);overflow:hidden;${mobile ? "" : `flex:1;min-height:0;overflow-y:auto;${grupos.length === 0 && semCpf.length === 0 ? "display:grid;place-items:center" : ""}`}`)}>
        {/* Mês fechado: a lista fica no lugar e diz que está vazia. Ver o ⚠️ acima — a tela é a
            mesma com 0 e com 1000. */}
        {grupos.length === 0 && (
          <div style={s(`display:flex;align-items:center;gap:11px;padding:22px 16px;${mobile ? "" : "max-width:44ch"}`)}>
            <span aria-hidden style={s("width:28px;height:28px;flex:none;border-radius:var(--r-controle);display:grid;place-items:center;background:var(--success-soft);color:var(--success)")}>
              <Icon name="check" size={15} />
            </span>
            <span style={s("min-width:0")}>
              <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
                Mês em dia
              </span>
              <span style={s("display:block;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
                {semCpf.length > 0
                  ? `Todo atendimento pago com CPF já tem recibo. Falta o CPF de ${semCpf.length === 1 ? "uma pessoa" : `${semCpf.length} pessoas`}, logo abaixo.`
                  : "Todo atendimento pago do mês já tem recibo. Dá para lançar um por fora abaixo."}
              </span>
            </span>
          </div>
        )}
        {grupos.map((g, i) => {
          const chave = `${g.nome}|${g.cpf}`;
          const on = !desmarcados.has(chave);
          /* Recém-lançado. O destaque some sozinho em 5s — ver o `setTimeout` lá em cima. */
          const agora = novo?.chave === chave;
          return (
            <button
              key={chave}
              ref={agora ? linhaNova : undefined}
              onClick={() => alternar(g)}
              className="m-focus m-hov-bg"
              aria-pressed={on}
              style={s(`width:100%;display:flex;align-items:center;gap:14px;padding:13px 16px;border:none;${i < grupos.length - 1 ? "border-bottom:1px solid var(--line);" : ""}background:${agora ? "var(--primary-soft)" : "transparent"};transition:background var(--dur-base) var(--ease-out);cursor:pointer;text-align:left;font-family:inherit;color:inherit`)}
            >
              <span
                aria-hidden
                style={s(`width:20px;height:20px;flex:none;border-radius:var(--r-controle);display:grid;place-items:center;border:1.5px solid ${on ? "var(--primary)" : "var(--border-field)"};background:${on ? "var(--primary)" : "var(--surface)"};color:#fff`)}
              >
                {on && <Icon name="check" size={13} />}
              </span>
              <span style={s("flex:1;min-width:0;display:flex;align-items:center;gap:8px")}>
                <span style={s("min-width:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>
                  {g.nome}
                </span>
                {/* A etiqueta é o que transforma "a lista mudou" em "o MEU lançamento entrou". Sem
                    ela, um destaque de fundo numa lista longa é só uma linha de cor diferente. */}
                {agora && (
                  <span style={s("flex:none;font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--primary);border:1px solid var(--primary);border-radius:var(--r-controle);padding:1px 6px")}>
                    novo
                  </span>
                )}
              </span>
              <span className="n" style={s("font-size:var(--t-label);color:var(--muted);flex:none")}>
                {g.itens.length}
              </span>
              <span className="n" style={s("width:104px;text-align:right;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);flex:none")}>
                {fmt(g.valor)}
              </span>
            </button>
          );
        })}
        {/* ── QUEM FICOU SEM CPF (1C.10, 06 P0-6) ──
            No fim da lista, desligados: a Receita recusa recibo sem o CPF do beneficiário, então
            marcá-los seria oferecer um erro. Cada um tem a saída ao lado, que é a ficha. */}
        {semCpf.length > 0 && (
          <div role="group" aria-label={`Sem CPF, ${semCpf.length}`} style={s(`${grupos.length > 0 ? "border-top:1px solid var(--line);" : ""}background:var(--surface-2)`)}>
            <div style={s("padding:10px 16px 4px;font-size:var(--t-label);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>
              Sem CPF ({semCpf.length})
            </div>
            {semCpf.map((g) => (
              <div key={g.nome} style={s(`display:flex;align-items:center;gap:14px;padding:${mobile ? "8px" : "6px"} 16px;min-height:${mobile ? 56 : 48}px;box-sizing:border-box`)}>
                <span aria-hidden style={s("width:20px;height:20px;flex:none;border-radius:var(--r-controle);border:1.5px dashed var(--border-field);background:var(--surface)")} />
                <span style={s("flex:1;min-width:0;display:flex;flex-direction:column")}>
                  <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{g.nome}</span>
                  <span className="n" style={s("font-size:var(--t-label);color:var(--muted)")}>
                    {g.itens.length === 1 ? "1 pagamento" : `${g.itens.length} pagamentos`} · {fmt(g.valor)}
                  </span>
                </span>
                <Btn variant="secondary" size={mobile ? "md" : "sm"} onClick={() => porCpf(g.nome)} rotulo={`Pôr o CPF de ${g.nome}`}>Pôr CPF</Btn>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  ) : (
    <>
      <h2 style={s("font-size:var(--t-title);font-weight:var(--w-emph);letter-spacing:var(--ls-title);color:var(--ink);margin:0")}>
        Conferência
      </h2>
      <dl style={s("margin:0;display:flex;flex-direction:column")}>
        {[
          ["Clientes", String(escolhidos.length)],
          ["Recibos a emitir", String(recibos.length)],
          ["Valor", fmt(valor)],
          ["Emitente", fiscal.config.prestadorCpf ?? "—"],
        ].map(([k, v], i, arr) => (
          <div
            key={k}
            style={s(`display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;${i < arr.length - 1 ? "border-bottom:1px solid var(--line)" : ""}`)}
          >
            <dt style={s("font-size:var(--t-sm);color:var(--muted)")}>{k}</dt>
            <dd className={k === "Clientes" || k === "Recibos a emitir" || k === "Valor" || k === "Emitente" ? "n-mach" : ""} style={s("margin:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );

  /* ── ★ OS CARTÕES VÃO ATÉ O FIM DA FAIXA (Bruno, 26/08/2026) ──
   *
   * *"o vazio fica melhor dentro dos cards do que na tela em si"* — e ele está certo: com sete
   * clientes na lista, o cartão terminava no meio da tela e sobrava um bloco branco enorme embaixo,
   * do lado de fora. Agora os dois cartões esticam até a mesma linha de baixo do rail, e a folga
   * mora DENTRO deles, onde parece respiro em vez de página inacabada.
   *
   * ⚠️ SÓ NO DESKTOP. No celular a coluna empilha, e forçar altura ali esmagaria a lista para
   * caber num espaço que não existe.
   *
   * ⚠️ E A CADEIA DE `min-height:0` É OBRIGATÓRIA. Sem ela, um item flex se recusa a encolher
   * abaixo do conteúdo, o cartão cresce, e o esticão vira barra de rolagem na tela inteira — que é
   * exatamente o que a `TelaGrade` faz (ela é `overflow-y:auto`). Quem rola é a LISTA, dentro do
   * cartão; o painel da direita fica parado. */
  const esticar = mobile ? "" : "flex:1;min-height:0;";

  /* ── ★ NO CELULAR, O "EMITIR" FICA PARADO NO PÉ (1C.9, 06 P0-5) ──
   *
   * Empilhar o painel do desktop embaixo da lista punha "Emitir 31 recibos" em y 2125, depois de
   * 24 nomes, do rodapé e do "Novo recibo". No celular o desenho é outro, escolhido por
   * `useIsMobile` e não por `display:none`: sem os números grandes nem a prévia (a contagem vai
   * no resumo), e o pé da `Moldura`, `sticky` logo acima das abas, com o resumo e o verbo. */
  const peCelular = (
    <PeDeAcao
      resumo={recibos.length > 0 ? `${recibos.length} ${recibos.length === 1 ? "recibo" : "recibos"} · ${fmt(valor)}` : "Mês em dia"}
      acao={{
        label: emitindoAgora ? "Emitindo…" : aEmitir.length === 0 ? "Nada a emitir" : "Emitir",
        onClick: emitir,
        desabilitada: travado,
        motivo: bloqueioDaAutorizacao?.frase,
      }}
    />
  );

  return (
    <Moldura pe={mobile ? peCelular : undefined}>
    <div style={s(`display:flex;flex-direction:column;gap:12px;${esticar}`)}>
      <Emitente config={fiscal.config} mobile={mobile} />

      {/* ★ QUEM FICOU SEM SABER. Em 26/08/2026 dezenove mensagens falharam e o silêncio foi
          idêntico ao sucesso — o dono só descobriu contando. Agora é uma linha na tela. */}
      {(() => {
        const a = pend.avisos;
        const n = (a?.falhou ?? 0) + (a?.semTelefone ?? 0);
        if (n === 0) return null;
        const partes = [
          a!.falhou > 0 ? `${a!.falhou} com número que o WhatsApp recusou` : "",
          a!.semTelefone > 0 ? `${a!.semTelefone} sem telefone no cadastro` : "",
        ].filter(Boolean);
        return (
          <div style={s("display:flex;align-items:flex-start;gap:10px;padding:12px 15px;border-radius:var(--r-painel);border:1px solid var(--warn-line);background:var(--warn-soft)")}>
            <span aria-hidden style={s("flex:none;color:var(--warn);display:flex;padding-top:1px")}><Icon name="alert" size={16} /></span>
            <span style={s("font-size:var(--t-label);color:var(--ink);line-height:var(--lh-prose)")}>
              <strong style={s("font-weight:var(--w-title)")}>
                {n === 1 ? "1 paciente não foi avisado" : `${n} pacientes não foram avisados`}
              </strong>
              : {partes.join(" e ")}. O recibo saiu; a mensagem não. Conserte o telefone em Clientes.
            </span>
          </div>
        );
      })()}
      <BarraDeEtapas etapa={etapa} ir={setEtapa} />

      {/* `align-items:stretch` no desktop: é o que faz os dois cartões terminarem na mesma linha,
          independente de qual tem mais conteúdo. */}
      <div style={s(`display:flex;gap:12px;align-items:${mobile ? "flex-start" : "stretch"};${mobile ? "flex-direction:column" : ""}${esticar}`)}>
        <Card style={s(`flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;${mobile ? "width:100%" : "min-height:0"}`)}>
          {conteudo}
          {/* `margin-top:auto` na etapa 2: lá o conteúdo é curto (uma lista de conferência), e sem
              isto o pé subiria para o meio do cartão esticado. Na etapa 1 a lista já ocupou tudo. */}
          <div style={s(`display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding-top:14px;border-top:1px solid var(--line);${mobile || etapa === 1 ? "" : "margin-top:auto"}`)}>
            {/* ── ★ A VOLTA DA ETAPA 1 SAI DA TELA, e é de propósito (Bruno, 26/08/2026) ──
             *
             * Não existe etapa 0 aqui: o handoff tinha uma etapa "Emitente" pedindo nome, CPF e
             * registro na hora de emitir, e ela virou a faixa de leitura no topo, porque é dado que
             * não muda de mês para mês. Só que "não muda" não é "não se corrige" — e um CPF de
             * emitente errado faz a Receita recusar TODOS os recibos, um por um.
             *
             * Então a etapa 1 tem uma volta, e ela leva para onde o dado mora. A frase diz que sai
             * da tela ("meus dados"), para não ser confundida com o Voltar da etapa 2, que é
             * navegação interna. */}
            {etapa === 1
              ? (
                <Btn variant="ghost" icon="chevron-left" onClick={() => st.irPara("fiscal")}>
                  Voltar e editar meus dados
                </Btn>
              )
              : <Btn variant="ghost" onClick={() => setEtapa(etapa - 1)}>Voltar</Btn>}
            {etapa < ETAPAS.length && (
              <Btn variant="secondary" onClick={() => setEtapa(etapa + 1)}>Continuar</Btn>
            )}
          </div>

          {/* ★ O CAMINHO QUE FALTAVA. Sessão por fora, pacote adiantado, paciente que voltou: sem
              isto, mês fechado era uma tela sem nenhuma ação — e era exatamente o que o Bruno viu.
              ⚠️ Ele NÃO emite: lança na fila, e quem emite é o CTA ao lado. */}
          {/* ⚠️ LANÇOU E NÃO VOLTOU = FRASE, NÃO SILÊNCIO. O caso conhecido era cliente marcado como
              `teste` (a view filtra), e ele saiu do seletor. Sobra o desconhecido — e desconhecido
              que some calado num formulário de documento fiscal é o pior desfecho possível. */}
          {sumiram.length > 0 && (
            <div style={s("display:flex;align-items:flex-start;gap:10px;padding:12px 15px;border-radius:var(--r-painel);border:1px solid var(--warn-line);background:var(--warn-soft)")}>
              <span aria-hidden style={s("flex:none;color:var(--warn);display:flex;padding-top:1px")}><Icon name="alert" size={16} /></span>
              <span style={s("font-size:var(--t-label);color:var(--ink);line-height:var(--lh-prose)")}>
                <strong style={s("font-weight:var(--w-title)")}>
                  {sumiram.length === 1 ? `${sumiram[0]} foi lançado` : `${sumiram.length} lançamentos foram feitos`}
                </strong>
                , mas não {sumiram.length === 1 ? "voltou" : "voltaram"} na lista. Lance de novo e,
                se sumir outra vez, me chame antes de fechar o mês.
              </span>
            </div>
          )}

          <NovoPagamento
            onLancado={(p) => {
              /* Entra na hora (com o objeto do servidor)… */
              if (p) inserir(p);
              /* …e a leitura de verdade confirma por baixo. As duas coisas, nesta ordem. */
              void carregar();
            }}
            rotulo="Lançar um recibo à mão"
          />
        </Card>
        {!mobile && painel}
      </div>

    </div>
    </Moldura>
  );
}
