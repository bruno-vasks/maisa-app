"use client";
/* MAISA — as cinco telas de grade: Clientes, Faturamento, Equipe, Serviços, Mais.
 *
 * Estão juntas de propósito: são variações do MESMO padrão (hero opcional →
 * filtros opcionais → grade de cartões curtos → gaveta). Manter lado a lado
 * deixa a repetição visível — se uma divergir, dá para ver na hora.
 *
 * Nenhuma delas tem estado próprio: tudo que muda vem do store. */

import React from "react";
import { s, Icon, fmt, fmtK, Filtros, EmptyState, Tabela, CelulaNome, SectionTitle, Btn, Monogram, Input, Field, Estado, EstadoDoTom } from "@/ui/primitivos";
import * as D from "@/adaptadores/saida/demo";
import { useIsMobile, useEstreita } from "@/ui/useIsMobile";
import { useStore, resumoDaAssinatura, type LinhaDeFaturamento, type TelaId } from "@/ui/estado/store";
import { Cartao, GradeCartoes, type TomTag } from "@/ui/componentes/Cartao";
import { EmitirRecibos } from "@/ui/componentes/EmitirRecibos";
import { casaBusca } from "@/ui/estado/busca";
/* ⚠️ AINDA AQUI, e só no caminho da NOTA FISCAL. Ele também aparece em `Documento fiscal`, que é
 * o endereço novo — mas o caminho do CNPJ ficou guardado como estava para a v2, e arrancar o
 * cartão dele desta tela agora tiraria o único aviso de "falta o certificado" de quem emite nota.
 * Quando a v2 reestruturar a nota fiscal, esta linha sai. */
import { LigarNotaFiscal } from "@/ui/componentes/LigarNotaFiscal";
import { escolhaFeita } from "@/ui/telas/DocumentoFiscal";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import { Moldura, Contagem, PeDeAcao } from "@/ui/componentes/Moldura";

/* Estado da nota → como o cartão se apresenta. Um lugar só, para as duas telas
   que mostram nota (Faturamento e a ficha do cliente) contarem a mesma coisa. */
const TAG_NOTA: Record<D.StatusNota, { label: string; tom: TomTag }> = {
  pendente: { label: "a emitir", tom: "warn" },
  processando: { label: "processando", tom: "primary" },
  emitida: { label: "emitida", tom: "success" },
  cancelada: { label: "cancelada", tom: "neutral" },
  erro: { label: "com erro", tom: "danger" },
};

/* Ordem de urgência, não alfabética: numa tabela de fechamento o que pede ação vem primeiro.
   Antes os estados se misturavam na ordem do array e achar a nota com erro entre 14 exigia
   14 hovers. */
const ORDEM_ACAO: Record<D.StatusNota, number> = {
  erro: 0, pendente: 1, processando: 2, cancelada: 3, emitida: 4,
};


/** "1 atendimento", "3 atendimentos". O Fiscal escrevia "1 atendimentos". */
const atendimentos = (n: number) => `${n} ${n === 1 ? "atendimento" : "atendimentos"}`;

/** A frase que explica o estado da nota. Uma só, para cartão e tabela não divergirem. */
function resumoNota(n: D.Nota): string {
  if (n.status === "emitida") return `Nota ${n.numero} emitida em ${n.data}${n.simulada ? " (modo simulado)" : ""}`;
  if (n.status === "processando") return "Enviada à prefeitura — o número sai em alguns minutos.";
  if (n.status === "cancelada") return "Nota cancelada. O valor do mês continua fechado.";
  if (n.status === "erro") return n.erro ?? "A emissão falhou.";
  return "Valor do mês fechado. Falta emitir a nota.";
}

/**
 * ★ ESTA TELA TEM DOIS VOCABULÁRIOS, E QUEM ESCOLHE É O `caminho` — NUNCA O ESTADO DAS NOTAS.
 *
 * Bruno, 25/08/2026: *"O CTA lá em cima ainda esta escrito emitir 14 notas mesmo depois de eu ter
 * escolhido o modo de recibos"*.
 *
 * Quem atende como pessoa física **não emite nota fiscal em hipótese nenhuma** — emite Recibo
 * Eletrônico de Serviços de Saúde, dentro do e-CAC, e a MAISA não tem verbo nisso (ver
 * `LoteReceitaSaude`). Para ela, `st.notaDe(c)` responde `pendente` para todo cliente e responde
 * para sempre: não existe nota que possa sair. Traduzido em tela, isso virava um hero anunciando
 * "14 a emitir", um botão dourado na topbar prometendo emiti-las, uma coluna "Nota" eternamente
 * em "—" e uma gaveta com "Prévia da nota". Quatro superfícies falando de um documento que não
 * existe naquele negócio.
 *
 * ⚠️ NÃO CONSERTE ISSO OLHANDO PARA `emitiveis.length === 0`. Um mês legitimamente fechado também
 * dá zero, e aí o hero deve dizer "Mês fechado" — que é verdade para o CNPJ e mentira para a
 * pessoa física, que tem 14 recibos por emitir logo abaixo. As duas perguntas são diferentes:
 * "sobrou algo?" e "que documento este negócio emite?".
 */
type Vocabulario = {
  /** Só no caminho da nota fiscal a tela tem verbo de emitir. */
  emiteNota: boolean;
  /** Enquanto não sabemos, nenhum verbo aparece — nem o certo, nem o errado. */
  sabemos: boolean;
  /**
   * A leitura FALHOU — e isto não é o mesmo que "ainda não chegou".
   *
   * ⚠️ Os dois começam iguais (`sabemos: false`) e terminam diferentes: carregando vira tela em
   * um instante, erro não vira nada nunca. Desenhar os dois como esqueleto deixa um retângulo
   * cinza para sempre, sem palavra e sem botão — foi o que Bruno viu em 26/08/2026, e é pior que
   * erro na cara, porque erro tem "tentar de novo".
   */
  falhou: boolean;
  /**
   * Alguém ESCOLHEU o documento (a regra é `escolhaFeita`, nunca o `caminho`: config vazia cai
   * em `municipal` de propósito, e derivar dali prometeu "Emitir 13 notas" para quem nunca
   * escolheu). Sem escolha: nenhum verbo de emitir e nenhum "Mês fechado" (1A.12, 06 P0-2).
   */
  escolheu: boolean;
  /**
   * O que falta para o emissor aceitar, como o servidor escreveu (`fiscalFaltando`), e a frase
   * do botão desligado. Com escolha e falta, o "Emitir" aparece DESLIGADO com o motivo: some-lo
   * esconderia o caminho, acendê-lo prometeria o que a prefeitura vai recusar.
   */
  falta: string[];
  motivo: string | null;
  /** Emite nota, escolheu, e nada falta. Só aí existe botão de emitir aceso. */
  podeEmitir: boolean;
};

/** "Falta o certificado digital da empresa", "Falta o CNPJ de quem emite e o certificado…". */
function fraseDaFalta(falta: string[]): string | null {
  if (!falta.length) return null;
  const lista = falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(", ")} e ${falta[falta.length - 1]}`;
  return `Falta ${lista}.`;
}

export function vocabulario(fiscal: {
  status: string;
  caminho: string | null;
  config?: Parameters<typeof escolhaFeita>[0];
  falta?: string[];
}): Vocabulario {
  const sabemos = fiscal.status === "ok";
  const emiteNota = sabemos && fiscal.caminho !== "recibo_saude";
  const escolheu = sabemos && escolhaFeita(fiscal.config ?? null) !== null;
  const falta = sabemos ? fiscal.falta ?? [] : [];
  return {
    sabemos,
    falhou: fiscal.status === "erro",
    emiteNota,
    escolheu,
    falta,
    motivo: fraseDaFalta(falta),
    podeEmitir: emiteNota && escolheu && falta.length === 0,
  };
}

/* ═══════════════════════════════ CLIENTES ═══════════════════════════════ */

/* Quantos desenhar de uma vez, o mesmo teto de Meus contatos: com 200 clientes a grade de
 * cartões dava 18.066px no celular (05 P0-1), e 200 linhas com botão travam o toque. */
const PAGINA_CLI = 60;
const FILTROS_CLI = ["Ativos", "Inativos", "Todos"] as const;
const ORDENS_CLI = { nome: "Nome", mes: "Mais atendimentos no mês", antigo: "Cliente há mais tempo" } as const;
type OrdemCli = keyof typeof ORDENS_CLI;

export function Clientes() {
  const st = useStore();
  const mobile = useIsMobile();
  /* Cadastro pela tela (24/09/2026). Até aqui cliente só nascia quando marcava pelo
   * WhatsApp, e quem atende gente que já existia antes da MAISA não tinha como pô-la na
   * lista. Só o nome é obrigatório: o recibo da Rebots pede CPF e nada mais, e o telefone
   * só importa para quem vai falar com a MAISA. O resto da ficha é a gaveta, que abre
   * sozinha logo depois. */
  /* Quem abre o formulário é o slot da casca ("Novo cliente" no canto da topbar, o "＋" do
   * celular, o menu "Novo"), e não mais um botão no hero (T2). */
  const novo = st.novoEmLinha === "cliente";
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<OrdemCli>("nome");
  const [mostrando, setMostrando] = React.useState(PAGINA_CLI);
  /* Mudou o recorte, volta à primeira página. Sem isto, filtrar depois de ter aberto 180
   * mostraria 180 de um conjunto de 12, e o "Mostrar mais" sumiria sem nada ter acabado. */
  React.useEffect(() => { setMostrando(PAGINA_CLI); }, [busca, st.filtroCli, ordem]);

  /* ⚠️ Antes de `GET /api/cadastro` voltar, o store segura o fixture (de propósito, contradição
   * C6), e esta tela o desenhava como a lista do negócio. Agora: esqueleto enquanto lê, a frase
   * se falhou (T4). O fixture continua sendo o valor inicial para os outros consumidores. */
  if (!st.cadastroCarregado) {
    return (
      <Moldura>
        {st.cadastroErro
          ? <FalhaDeLeitura frase="Não consegui ler seus clientes." detalhe={st.cadastroErro} tentar={() => window.location.reload()} />
          : <Esqueleto linhas={6} altura={56} rotulo="Lendo seus clientes" />}
      </Moldura>
    );
  }

  const todos = st.cadastro.clientes;
  const nAtivos = todos.filter((c) => st.cliAtivo(c.id)).length;
  const contagem: Record<string, number> = { Ativos: nAtivos, Inativos: todos.length - nAtivos, Todos: todos.length };
  const filtro = (FILTROS_CLI as readonly string[]).includes(st.filtroCli) ? st.filtroCli : "Ativos";

  /* A busca atravessa o filtro? Não: ela procura dentro da aba, e a contagem da aba diz quanto
   * há ali. Quem busca "Silva" em Ativos e não acha vê "Nenhum ativo com esse nome" e a aba
   * Todos a um toque. */
  const lista = todos
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => {
      const on = st.cliAtivo(c.id);
      if (filtro !== "Todos" && (filtro === "Ativos") !== on) return false;
      return casaBusca({ nome: c.nome, numeros: [c.telefone, c.cpf] }, busca);
    })
    .sort((a, b) =>
      ordem === "mes" ? b.c.atendimentos - a.c.atendimentos || a.c.nome.localeCompare(b.c.nome, "pt-BR")
      /* O servidor devolve por `desde`, do mais antigo ao mais novo (`repositorio.ts`). */
      : ordem === "antigo" ? a.i - b.i
      : a.c.nome.localeCompare(b.c.nome, "pt-BR", { sensitivity: "base" }))
    .map(({ c }) => c);
  const visiveis = lista.slice(0, mostrando);
  /* A contagem mora na aba: "Ativos (177)" diz o tamanho do que se vê sem um hero de 98px (256
   * no celular) em cima da lista (05 P1-2). */
  const abas = (
    <Filtros
      opcoes={FILTROS_CLI.map((f) => `${f} (${contagem[f]})`)}
      ativo={`${filtro} (${contagem[filtro]})`}
      onChange={(v) => st.setFiltroCli(FILTROS_CLI.find((f) => v.startsWith(f)) ?? "Ativos")}
    />
  );

  return (
    <Moldura
      rotulo="Lista de clientes"
      cabecalho={
        <>
          {novo && <NovoCliente aoFechar={() => st.pedirNovo(null)} />}
          {/* Desktop: busca, abas, ordem e a porta de Meus contatos numa linha só, e a primeira
              cliente em y 140. Celular: busca e ordem, e as abas embaixo. */}
          <div style={s("display:flex;align-items:center;gap:10px 12px;flex-wrap:wrap")}>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={mobile ? "Nome, telefone ou CPF" : "Buscar por nome, telefone ou CPF"}
              aria-label="Buscar cliente por nome, telefone ou CPF"
              className="m-focus"
              style={s(`flex:1 1 200px;min-width:0;max-width:${mobile ? "none" : "22rem"};height:44px;padding:0 14px;border-radius:8px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-body);color:var(--ink);outline:none`)}
            />
            {!mobile && abas}
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as OrdemCli)}
              aria-label="Ordem da lista"
              className="m-focus"
              style={s(`flex:0 0 auto;height:44px;padding:0 12px;border-radius:8px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);outline:none;cursor:pointer;${mobile ? "max-width:128px" : ""}`)}
            >
              {(Object.keys(ORDENS_CLI) as OrdemCli[]).map((k) => <option key={k} value={k}>{ORDENS_CLI[k]}</option>)}
            </select>
            {/* A porta de "Meus contatos" onde a tarefa nasce (1B.9, 05 P0-3, contradição C9): no
                desktop a tela não está no rail. No celular a porta é o atalho do Mais. */}
            {!mobile && (
              <span style={s("margin-left:auto")}>
                <Btn variant="ghost" icon="clientes" onClick={() => st.irPara("contatos")}>Quem a MAISA atende</Btn>
              </span>
            )}
          </div>
          {mobile && abas}
        </>
      }
    >
      {lista.length === 0 ? (
        busca.trim()
          ? <EmptyState
              title="Ninguém com esse nome, telefone ou CPF"
              sub={filtro === "Todos" ? "Tente parte do nome, ou os últimos dígitos do telefone." : `A busca olha só os ${filtro.toLowerCase()}.`}
              action={filtro === "Todos" ? <Btn variant="secondary" onClick={() => setBusca("")}>Limpar a busca</Btn> : <Btn variant="secondary" onClick={() => st.setFiltroCli("Todos")}>Buscar em todos</Btn>}
            />
          : <EmptyState
              title={filtro === "Inativos" ? "Nenhum cliente fora do atendimento" : filtro === "Ativos" ? "Nenhum cliente em atendimento" : "Nenhum cliente cadastrado"}
              action={filtro === "Todos" ? <Btn variant="primary" icon="plus" onClick={() => st.pedirNovo("cliente")}>Novo cliente</Btn> : <Btn variant="secondary" onClick={() => st.setFiltroCli("Todos")}>Ver todos</Btn>}
            />
      ) : (
        <>
          <div style={s("display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;flex-shrink:0")}>
            {visiveis.map((c, i) => (
              <LinhaCliente key={c.id} c={c} ativo={st.cliAtivo(c.id)} ultima={i === visiveis.length - 1} mobile={mobile} aoAbrir={() => st.abrir(c.id)} />
            ))}
          </div>
          {lista.length > visiveis.length && (
            <div style={s("display:flex;justify-content:center;flex-shrink:0")}>
              <Btn variant="secondary" onClick={() => setMostrando((n) => n + PAGINA_CLI)}>
                Mostrar mais {Math.min(PAGINA_CLI, lista.length - visiveis.length)} de {lista.length - visiveis.length}
              </Btn>
            </div>
          )}
        </>
      )}
    </Moldura>
  );
}

/**
 * Uma cliente numa linha: 56px no desktop, 64 no celular (05 K3, P1-1).
 *
 * O que responde as tarefas do dia fica à vista, sem hover (o `.m-exp-body` do cartão sumia no
 * toque): nome, telefone, o mês dela, e uma marca só quando falta algo. Serviço e canal saíram:
 * estão na ficha. Quem responde normal não ganha marca (contador que soma o normal é ignorado,
 * 00 §2.2).
 *
 * A linha inteira é UM botão, que abre a ficha: no celular é um alvo de 358x64, e não um nome de
 * 20px de altura com um link de telefone de 16px do lado. O telefone que liga está na ficha.
 */
function LinhaCliente({ c, ativo, ultima, mobile, aoAbrir }: { c: D.Cliente; ativo: boolean; ultima: boolean; mobile: boolean; aoAbrir: () => void }) {
  const mes = c.atendimentos > 0
    ? `${c.atendimentos} ${c.atendimentos === 1 ? "atendimento" : "atendimentos"} · ${fmt(c.valor)}`
    : "Nenhum no mês";
  const marcas = (
    <>
      {!c.cpf && <Estado forma="triangulo" tom="warn">Sem CPF</Estado>}
      {!ativo && <Estado forma="anel">Fora do atendimento</Estado>}
    </>
  );
  const nome = <span style={s("display:block;min-width:0;line-height:20px;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{c.nome}</span>;
  const telefone = <span className="n" style={s("font-size:var(--t-label);line-height:16px;color:var(--muted);white-space:nowrap")}>{c.telefone || "Sem telefone"}</span>;
  const base = `${ultima ? "" : "border-bottom:1px solid var(--line);"}width:100%;box-sizing:border-box;border-left:none;border-right:none;border-top:none;background:transparent;font-family:inherit;text-align:left;cursor:pointer;color:inherit;`;

  if (mobile) {
    return (
      <button type="button" onClick={aoAbrir} aria-label={`${c.nome}, abrir ficha`} className="m-hov-bg m-focus" style={s(`${base}min-height:64px;padding:0 14px;display:flex;flex-direction:column;justify-content:center;gap:4px`)}>
        <span style={s("display:flex;align-items:baseline;gap:10px;min-width:0;width:100%")}>
          <span style={s("flex:1;min-width:0")}>{nome}</span>
          {telefone}
        </span>
        <span style={s("display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap;font-size:var(--t-label);color:var(--muted)")}>
          <span className="n">{mes}</span>
          {marcas}
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={aoAbrir} aria-label={`${c.nome}, abrir ficha`} className="m-hov-bg m-focus" style={s(`${base}min-height:56px;padding:0 16px;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.2fr) minmax(0,.8fr) minmax(0,1.3fr);align-items:center;gap:16px`)}>
      <span style={s("display:flex;flex-direction:column;gap:2px;min-width:0")}>
        {nome}
        {telefone}
      </span>
      <span className="n" style={s(`font-size:var(--t-sm);color:${c.atendimentos > 0 ? "var(--ink)" : "var(--muted)"}`)}>{mes}</span>
      <span style={s("font-size:var(--t-sm);color:var(--muted);white-space:nowrap")}>desde {c.desde}</span>
      <span style={s("display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap;justify-content:flex-end")}>{marcas}</span>
    </button>
  );
}

function NovoCliente({ aoFechar }: { aoFechar: () => void }) {
  const st = useStore();
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  /* Só o nome trava o botão. Telefone e CPF errados voltam do servidor com a frase do que
   * corrigir, e o formulário fica aberto com o que foi digitado. */
  const pronto = nome.trim().length > 0;

  const salvar = async () => {
    if (!pronto || enviando) return;
    setEnviando(true);
    const ok = await st.criarCliente({ nome, telefone, cpf });
    setEnviando(false);
    if (ok) aoFechar();
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") void salvar(); };

  return (
    /* `div` e não `form`: o `Btn` não declara `type`, e dentro de um form todo botão vira
     * submit — o Cancelar cadastraria. O Enter vem do `onKeyDown` dos campos. */
    <div
      style={s("display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px 18px")}
    >
      <Field label="Nome" style={s("flex:1 1 220px")}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Silva" autoFocus onKeyDown={enter} />
      </Field>
      <Field label="WhatsApp, com DDD (opcional)" style={s("flex:1 1 200px")}>
        <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 98123-4567" inputMode="tel" onKeyDown={enter} />
      </Field>
      <Field label="CPF (opcional)" style={s("flex:1 1 170px")}>
        <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" onKeyDown={enter} />
      </Field>
      <span style={s("display:flex;gap:8px")}>
        <Btn variant="primary" icon="check" onClick={() => void salvar()}>
          {enviando ? "Salvando…" : "Cadastrar"}
        </Btn>
        <Btn variant="ghost" onClick={aoFechar}>Cancelar</Btn>
      </span>
    </div>
  );
}

/* Adicionar alguém à equipe (1B.12, 08 P0-2). Nome e papel, e só: o expediente nasce com o
 * padrão do banco (seg a sáb, 9 às 19) e a rota não o aceita de propósito. A ficha abre logo
 * depois, para ligar a agenda do Google se quiser. */
function NovoProfissional({ aoFechar }: { aoFechar: () => void }) {
  const st = useStore();
  const [nome, setNome] = React.useState("");
  const [papel, setPapel] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const pronto = nome.trim().length > 0;
  const salvar = async () => {
    if (!pronto || enviando) return;
    setEnviando(true);
    const ok = await st.criarProfissional({ nome, papel });
    setEnviando(false);
    if (ok) aoFechar();
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") void salvar(); };
  return (
    <div style={s("display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px 18px")}>
      <Field label="Nome" style={s("flex:1 1 220px")}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ana Souza" autoFocus onKeyDown={enter} />
      </Field>
      <Field label="O que faz (opcional)" style={s("flex:1 1 200px")}>
        <Input value={papel} onChange={(e) => setPapel(e.target.value)} placeholder="Atendimento geral" onKeyDown={enter} />
      </Field>
      <span style={s("display:flex;gap:8px")}>
        <Btn variant="primary" icon="check" disabled={!pronto || enviando} onClick={() => void salvar()}>
          {enviando ? "Adicionando…" : "Adicionar"}
        </Btn>
        <Btn variant="ghost" onClick={aoFechar}>Cancelar</Btn>
      </span>
    </div>
  );
}

/* ═══════════════════════════════ FATURAMENTO ═══════════════════════════════ */

export function Faturamento() {
  const st = useStore();
  const mobile = useIsMobile();
  const estreita = useEstreita();
  const base = st.fechamento;

  /* ⚠️ A soma é do que FALTA emitir, não do mês inteiro. `v_clientes.valor` (o que estava
     aqui) é o total da competência — com ele, emitir duas vezes no mesmo mês cobrava o mês
     todo nas duas. Agora `valor` já é "desde a última emissão". */
  const por = (sts: D.StatusNota[]) => base.filter((c) => sts.includes(st.notaDe(c.id).status));
  const emitidas = por(["emitida"]);
  const processando = por(["processando"]);
  const canceladas = por(["cancelada"]);
  // st.emitiveis é a FONTE ÚNICA — a mesma lista que o lote de fato emite. Antes esta tela
  // contava pendente|erro|cancelada e o lote emitia pendente|erro: o botão prometia N e saíam M,
  // e com só canceladas o botão aparecia e não fazia nada.
  const noLote = st.emitiveis;
  const total = base.reduce((a, c) => a + c.valor, 0);

  /* ★ O vocabulário da tela inteira sai daqui. Ver `vocabulario` — e leia o aviso lá antes de
     "simplificar" qualquer condição abaixo para `noLote.length`. */
  const voz = vocabulario(st.fiscal);
  /* ⚠️ A nota de cada linha (selo "a emitir", "Falta emitir a nota", a gaveta da nota) só existe
     depois de escolher o documento (28/09/2026, regressão 5 da verificação da Onda 1). Config vazia
     cai no caminho municipal, então `emiteNota` sozinho diz sim para quem nunca escolheu: o celular
     mostrava "Valor do mês fechado. Falta emitir a nota." em 12 linhas, a mentira que o 1A.12 tirou
     do hero. Sem escolha a linha é o que se sabe: quem, quanto, quantos atendimentos. */
  const mostraNota = voz.emiteNota && voz.escolheu;

  /* ── ★ UM ASSUNTO POR TELA, e é isto que mudou em 26/08/2026 ──
   *
   * Bruno, 25/08: *"uma página com três assuntos, CTA que ainda diz emitir notas no modo
   * recibo"*. Os três assuntos eram o onboarding fiscal (`LigarNotaFiscal`), o arquivo do e-CAC
   * (`LoteReceitaSaude`) e o livro-caixa do mês — empilhados, sem hierarquia.
   *
   * Os dois primeiros saíram para a tela `Documento fiscal`. Quem atende como pessoa física passa
   * a ver aqui **só a emissão**, guiada, em `EmitirRecibos`.
   *
   * ⚠️ ENQUANTO NÃO SABEMOS O CAMINHO, NÃO MOSTRAMOS NADA além do esqueleto. Piscar a tela do
   * recibo para quem emite nota (ou o contrário) por meio segundo é a mesma promessa errada, só
   * mais curta — foi exatamente esse o defeito reclamado. Ver `EstadoFiscalUI`.
   *
   * ⚠️ O CAMINHO DA NOTA FISCAL SEGUE COMO ESTAVA, de propósito: fica guardado para a v2. */
  /* ⚠️ `erro` NÃO É `carregando`, E CONFUNDIR OS DOIS FAZ UM BECO SEM SAÍDA. Enquanto carrega,
   * esqueleto: meio segundo de cinza é melhor que meio segundo prometendo o documento errado. Mas
   * `erro` desenhado como esqueleto fica cinza PARA SEMPRE, sem uma palavra e sem botão — e é o
   * mais provável dos dois, porque sessão vence e rota falha. Ver `EstadoFiscalUI`. */
  if (voz.falhou) {
    return (
      <Moldura>
        <EmptyState
          title="Não deu para saber o que você emite"
          sub="Nota fiscal e recibo têm telas diferentes, e sem essa resposta a MAISA não mostra nenhuma das duas para não prometer o documento errado."
          action={<Btn onClick={() => void st.recarregarFiscal()}>Tentar de novo</Btn>}
        />
      </Moldura>
    );
  }

  if (!voz.sabemos) {
    return (
      <Moldura>
        <div style={s("height:220px;border-radius:var(--radius-card);background:var(--surface-2)")} aria-busy="true" />
      </Moldura>
    );
  }

  if (!voz.emiteNota) {
    /* A emissão monta a própria `Moldura` (1C.9): no desktop os cartões vão até o fim da faixa e a
       lista rola por dentro; no celular o "Emitir" é o pé parado. */
    return <EmitirRecibos />;
  }

  /* ── ⚠️ A MOLDURA DO CNPJ (25/09/2026, 1C.2 e contradição C3) ──
   * Em cima, parado: o mês e a contagem. No meio, e só ele rola: o cartão do certificado (quando
   * falta) e a tabela, que é a região (`rolarPorDentro`). Embaixo, parado: o "Emitir", que fecha o
   * caminho. Antes o botão morava no hero, no topo, e a tabela cortava em 8 de 16 clientes.
   *
   * ⚠️ TRÊS CASOS NO PÉ, e nenhum promete o que o emissor recusa (1A.12, 06 P0-2): sem escolha,
   * o verbo é escolher; com falta, o "Emitir" aparece desligado com o motivo; só com escolha e
   * nada faltando ele acende. "Mês fechado" só para quem escolheu. */
  const valorDoLote = noLote.reduce((a, c) => a + c.valor, 0);
  const pe = !voz.escolheu
    ? <PeDeAcao resumo="Escolha o documento que você emite." acao={{ label: "Escolher o documento", onClick: () => st.irPara("fiscal") }} />
    : noLote.length > 0
      ? (
        <PeDeAcao
          resumo={<><span className="n">{noLote.length}</span> {noLote.length === 1 ? "nota a emitir" : "notas a emitir"} · <span className="n">{fmt(valorDoLote)}</span></>}
          acao={{
            label: noLote.length === 1 ? "Emitir a nota pendente" : `Emitir as ${noLote.length} pendentes`,
            onClick: st.pedirLote,
            ...(voz.motivo ? { desabilitada: true, motivo: voz.motivo } : {}),
          }}
        />
      )
      : processando.length > 0
        ? <PeDeAcao resumo={`${processando.length === 1 ? "1 nota está" : `${processando.length} notas estão`} na prefeitura.`} estado={<Estado forma="anel" tom="primary">processando</Estado>} />
        : <PeDeAcao resumo="Nada a emitir desde a última emissão." estado={<Estado forma="disco" tom="success">Mês fechado</Estado>} />;

  return (
    <Moldura
      topo={
        <Contagem
          rotulo={st.mesDoFechamento}
          valor={fmt(total)}
          sub={`em ${base.length} ${base.length === 1 ? "cliente" : "clientes"}`}
          /* Sem escolha não há "a emitir" (o 13 era a mesma mentira da linha, regressão 5). */
          marcos={!mostraNota ? [] : [
            { n: emitidas.length, label: emitidas.length === 1 ? "emitida" : "emitidas", tom: "success" },
            { n: processando.length, label: "processando", tom: "primary" },
            { n: noLote.length, label: "a emitir", tom: "warn" },
            // cancelada tem marco PRÓPRIO: não é "a emitir" (o lote não a emite) nem "emitida".
            ...(canceladas.length ? [{ n: canceladas.length, label: canceladas.length === 1 ? "cancelada" : "canceladas", tom: "neutral" as const }] : []),
          ]}
        />
      }
      pe={pe}
    >
      {/* Acima da lista de propósito: enquanto a nota fiscal não está ligada, todo botão de
          emitir desta tela é promessa que o emissor vai recusar. O cartão desaparece sozinho
          quando não há nada a fazer (e quando o emissor não está configurado no ambiente,
          que não é problema do dono). */}
      <LigarNotaFiscal />

      {base.length === 0 ? (
        <EmptyState title="Nada a faturar" sub="Nenhum cliente ativo com valor fechado nesta competência." semSaida="fim do caminho: sem nada a emitir, não há o que fazer aqui" />
      ) : mobile ? (
        <GradeCartoes>
          {base.map((c) => {
            const nota = st.notaDe(c.id);
            const tag = TAG_NOTA[nota.status];
            /* ⚠️ No caminho do recibo o cartão perde o selo e a gaveta de nota — e o clique vai
               para a FICHA do cliente. `nf-…` abre uma gaveta que se chama "Prévia da nota" e
               oferece "Emitir de novo": o documento errado, na tela de quem não o emite. */
            if (!mostraNota) {
              return (
                <Cartao
                  key={c.id}
                  dot={c.semCpf ? "warn" : "neutral"}
                  titulo={c.nome}
                  sub={c.semCpf
                    ? (voz.emiteNota ? "Falta o CPF" : "Falta o CPF: sem ele o recibo não sai")
                    : `${atendimentos(c.atendimentos)} · ${c.servico ?? st.nomeServico(c.servicoId)}`}
                  meta={fmt(c.valor)}
                  onClick={() => st.abrir(c.id)}
                  resumo={`${atendimentos(c.atendimentos)} em ${st.mesDoFechamento} · ${fmt(c.valor)}`}
                  chips={[c.cpf ? `CPF ${c.cpf}` : "sem CPF", ...(c.canal && c.canal !== "—" ? [c.canal] : [])]}
                />
              );
            }
            return (
              <Cartao
                key={c.id}
                dot={tag.tom}
                titulo={c.nome}
                // O erro da prefeitura sobe para o corpo do cartão: era o único estado que pede
                // ação imediata e vivia só no `resumo`, que `hover:none` apaga no celular.
                sub={nota.status === "erro" ? (nota.erro ?? "A emissão falhou.") : c.semCpf ? "Falta o CPF: a prefeitura recusa sem ele" : `${atendimentos(c.atendimentos)} · ${c.servico ?? st.nomeServico(c.servicoId)}`}
                meta={fmt(c.valor)}
                tag={tag}
                onClick={() => st.abrir(`nf-${c.id}`)}
                resumo={c.teste ? `Tomador de teste — a nota se cancela sozinha depois de emitir. ${resumoNota(nota)}` : resumoNota(nota)}
                chips={[...(c.teste ? ["teste fiscal"] : []), c.cpf ? `CPF ${c.cpf}` : "sem CPF", ...(c.canal && c.canal !== "—" ? [c.canal] : [])]}
              />
            );
          })}
        </GradeCartoes>
      ) : (
        /* Livro-caixa é tabela. Em cartão, os R$ alinhavam à direita DENTRO de cada cartão e
           nunca formavam coluna — impossível varrer valores num fechamento de mês. */
        <Tabela
          rolarPorDentro
          linhas={base}
          chaveDe={(c) => c.id}
          estreita={estreita}
          onLinha={(c) => st.abrir(mostraNota ? `nf-${c.id}` : c.id)}
          rotuloLinha={(c) => mostraNota
            ? `${c.nome}, ${fmt(c.valor)}, ${TAG_NOTA[st.notaDe(c.id).status].label}, abrir nota`
            : `${c.nome}, ${fmt(c.valor)}, abrir ficha`}
          colunas={[
            {
              chave: "nome", label: "Cliente", largura: "minmax(0,1.7fr)",
              ordenar: (c) => c.nome,
              celula: (c) => <CelulaNome nome={c.nome} seed={c.id} sub={c.teste ? "tomador de teste fiscal" : c.semCpf ? (mostraNota ? "sem CPF, não entra no lote" : voz.emiteNota ? "sem CPF" : "sem CPF, fica fora do arquivo") : (c.servico ?? st.nomeServico(c.servicoId))} />,
            },
            {
              chave: "atend", label: "Atend.", num: true, largura: "90px", secundaria: true,
              ordenar: (c) => c.atendimentos,
              celula: (c) => c.atendimentos,
            },
            {
              chave: "valor", label: "Valor", num: true, largura: "130px",
              ordenar: (c) => c.valor,
              celula: (c) => fmt(c.valor),
            },
            /* ⚠️ AS DUAS COLUNAS DE NOTA SÓ EXISTEM NO CAMINHO DA NOTA. Para a pessoa física elas
               eram um "—" e um selo "a emitir" em toda linha, todo mês, para sempre — uma coluna
               inteira afirmando que há trabalho pendente de um documento que ela não emite. */
            ...(!mostraNota ? [] : [
            {
              chave: "nota", label: "Nota", largura: "minmax(0,1.1fr)", secundaria: true,
              celula: (c: LinhaDeFaturamento) => {
                const n = st.notaDe(c.id);
                return (
                  <span style={s(`min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${n.status === "erro" ? "var(--danger)" : "var(--muted)"}`)}>
                    {n.status === "emitida" ? `nº ${n.numero} · ${n.data}`
                      : n.status === "erro" ? (n.erro ?? "falhou")
                        : n.status === "processando" ? "na prefeitura"
                          : n.status === "cancelada" ? "cancelada"
                            : "—"}
                  </span>
                );
              },
            },
            {
              chave: "estado", label: "Estado", largura: "140px",
              // ordena pelo que PEDE AÇÃO primeiro: erro, a emitir, processando, cancelada, emitida
              ordenar: (c: LinhaDeFaturamento) => ORDEM_ACAO[st.notaDe(c.id).status],
              celula: (c: LinhaDeFaturamento) => {
                const t = TAG_NOTA[st.notaDe(c.id).status];
                return <EstadoDoTom tom={t.tom}>{t.label}</EstadoDoTom>;
              },
            },
            ]),
          ]}
        />
      )}
    </Moldura>
  );
}

/* ═══════════════════════════════ EQUIPE ═══════════════════════════════ */

export function Equipe() {
  const st = useStore();
  const mobile = useIsMobile();
  const estreita = useEstreita();
  const ativos = st.cadastro.profissionais.filter((p) => st.profAtivo(p.id));

  /* Moldura (T1, 1C.2): a contagem e o formulário de adicionar ficam parados; a tabela é a região
     que rola. */
  return (
    <Moldura
      topo={
        <Contagem
          rotulo="Equipe"
          valor={String(ativos.length)}
          sub={`de ${st.cadastro.profissionais.length} recebendo agendamentos`}
          /* "pausados" só aparece quando há algum. Com a equipe de uma pessoa o marco
             ficava fixo em "0 pausados" — ocupando espaço para não dizer nada. */
          marcos={[
            { n: st.cadastro.profissionais.reduce((a, p) => a + p.atendimentosMes, 0), label: "atendimentos no mês", tom: "primary" },
            ...(st.cadastro.profissionais.length - ativos.length > 0
              ? [{ n: st.cadastro.profissionais.length - ativos.length, label: "pausados", tom: "neutral" as const }]
              : []),
          ]}
        />
      }
      /* Quem abre é o slot da casca, "Adicionar profissional" (T2, 1B.12). */
      cabecalho={st.novoEmLinha === "profissional" ? <NovoProfissional aoFechar={() => st.pedirNovo(null)} /> : undefined}
    >
      {mobile ? (
        <GradeCartoes>
          {st.cadastro.profissionais.map((p) => {
            const on = st.profAtivo(p.id);
            return (
              <Cartao
                key={p.id}
                seed={p.id}
                titulo={p.nome}
                // horário sobe para o corpo do cartão: é o "quando" que o título da tela promete,
                // e no toque o `resumo` do hover não existe.
                sub={`${p.papel} · ${p.horario}`}
                tag={on ? { label: "ativo", tom: "success" } : { label: "pausado", tom: "neutral" }}
                atenuado={!on}
                onClick={() => st.abrir(p.id)}
                /* Sem "nota" nem "comissão" (T5, 08 P1-3): nenhuma tela as escreve, e a nota do
                   demo era 4.9 para todo mundo. */
                resumo={`${atendimentos(p.atendimentosMes)} no mês · folga ${p.folga}`}
                /* "Google" entra na frente dos serviços: no celular só cabem uns três
                   chips, e saber que a agenda está ligada muda o que dá para fazer
                   com aquele profissional — quais serviços ele faz, não. */
                chips={(st.googleDe(p.id) ? ["Google"] : [])
                  .concat(p.servicoIds.slice(0, 2).map((sid) => st.nomeServico(sid)))
                  .concat(p.servicoIds.length > 2 ? [`+${p.servicoIds.length - 2}`] : [])}
              />
            );
          })}
        </GradeCartoes>
      ) : (
        /* Tabela, não grade de cartões: 4 pessoas × 6 atributos onde a pergunta real é comparativa
           ("quem trabalha sábado?", "quem tem a maior comissão?"). Em cartão, os atributos ficavam
           atrás de hover e comparar dois exigia memória de trabalho. */
        <Tabela
          rolarPorDentro
          linhas={st.cadastro.profissionais}
          chaveDe={(p) => p.id}
          estreita={estreita}
          onLinha={(p) => st.abrir(p.id)}
          rotuloLinha={(p) => `${p.nome}, ${p.papel}, abrir ficha`}
          colunas={[
            {
              chave: "nome", label: "Profissional", largura: "minmax(0,1.6fr)",
              ordenar: (p) => p.nome,
              celula: (p) => <CelulaNome nome={p.nome} seed={p.id} sub={p.papel} />,
            },
            {
              chave: "horario", label: "Quando atende", largura: "minmax(0,1.2fr)",
              ordenar: (p) => p.horario,
              celula: (p) => (
                <span style={s("min-width:0;display:flex;flex-direction:column;line-height:1.25")}>
                  <span className="n">{p.horario}</span>
                  <span style={s("font-size:var(--t-label);color:var(--muted)")}>folga {p.folga}</span>
                </span>
              ),
            },
            {
              chave: "atend", label: "Atendimentos", num: true, largura: "130px", secundaria: true,
              ordenar: (p) => p.atendimentosMes,
              celula: (p) => p.atendimentosMes,
            },
            /* "Nota" e "Comissão" saíram em 25/09/2026 (T5, 08 P1-3): nada no produto as
               escreve (a rota de equipe só aceita nome, papel e ativo), então eram o número do
               cadastro inicial com cara de avaliação e de acordo de repasse. */
            {
              chave: "estado", label: "Estado", largura: "120px",
              ordenar: (p) => (st.profAtivo(p.id) ? 0 : 1),
              celula: (p) => st.profAtivo(p.id)
                ? <EstadoDoTom tom="success">ativo</EstadoDoTom>
                : <EstadoDoTom tom="neutral">pausado</EstadoDoTom>,
            },
            /* "Quem tem agenda conectada?" era uma pergunta que só a gaveta respondia,
               uma pessoa por vez. Aqui é comparativa como o resto da tabela — e o
               e-mail no title revela quando duas pessoas dividem a mesma conta. */
            {
              chave: "gcal", label: "Agenda", largura: "130px", secundaria: true,
              ordenar: (p) => (st.googleDe(p.id) ? 0 : 1),
              celula: (p) => {
                const conexao = st.googleDe(p.id);
                if (st.google.status !== "ok") return <span style={s("color:var(--muted)")}>—</span>;
                return conexao
                  ? <span title={conexao.googleEmail}><Estado forma="disco" tom="primary">Google</Estado></span>
                  : <span style={s("font-size:var(--t-label);color:var(--muted)")}>não conectada</span>;
              },
            },
          ]}
        />
      )}
    </Moldura>
  );
}

/* ═══════════════════════════════ SERVIÇOS ═══════════════════════════════ */

export function Servicos() {
  const st = useStore();
  const mobile = useIsMobile();
  const estreita = useEstreita();
  // st.servicos, não D.SERVICOS: o catálogo agora é vivo (edições + serviços criados).
  const lista = st.servicos.filter((sv) => st.filtroSvc === "Todos" || sv.categoria === st.filtroSvc);
  const ativos = st.servicos.filter((sv) => st.svcAtivo(sv.id));

  /* Moldura (T1, 1C.2): contagem e filtro parados, a tabela rola por dentro. */
  return (
    <Moldura
      topo={
        <Contagem
          rotulo="No catálogo"
          valor={String(ativos.length)}
          sub={`de ${st.servicos.length} serviços`}
          marcos={[
            { n: fmt(Math.round(ativos.reduce((a, sv) => a + sv.preco, 0) / Math.max(ativos.length, 1))), label: "ticket médio", tom: "primary" },
            { n: st.servicos.length - ativos.length, label: "fora do catálogo", tom: "neutral" },
          ]}
        />
      }
      cabecalho={<Filtros opcoes={["Todos", ...D.CATEGORIAS]} ativo={st.filtroSvc} onChange={st.setFiltroSvc} />}
    >
      {/* Faltava estado vazio: filtrar uma categoria sem serviço dava uma faixa em branco sem
          explicação, enquanto Clientes já tratava isso. */}
      {lista.length === 0 ? (
        <EmptyState title="Nenhum serviço nesta categoria" sub="Troque o filtro acima, ou crie um serviço novo pelo botão no topo." semSaida="o filtro fica logo acima e o Novo serviço na topbar (T2 leva o botão ao celular)" />
      ) : mobile ? (
        <GradeCartoes>
          {lista.map((sv) => {
            const on = st.svcAtivo(sv.id);
            return (
              <Cartao
                key={sv.id}
                dot={on ? "primary" : "neutral"}
                titulo={sv.nome}
                sub={`${sv.duracao} min · ${sv.profissionalIds.length} atendendo`}
                meta={fmt(sv.preco)}
                tag={on ? { label: "no catálogo", tom: "success" } : { label: "pausado", tom: "neutral" }}
                atenuado={!on}
                onClick={() => st.abrir(sv.id)}
                resumo={`${sv.categoria} · ${fmt(sv.preco)} · ${sv.duracao} min`}
                chips={sv.profissionalIds.map((pid) => D.primeiroNome(st.nomeDoProfissional(pid)))}
              />
            );
          })}
        </GradeCartoes>
      ) : (
        /* O catálogo é a tela MAIS tabular do app: nome · categoria · duração · preço · quem faz.
           As três perguntas reais ("qual o mais caro", "qual demora mais", "o que está fora do ar")
           exigiam varredura em zigue-zague entre cartões cujos preços nem alinhavam. */
        <Tabela
          rolarPorDentro
          linhas={lista}
          chaveDe={(sv) => sv.id}
          estreita={estreita}
          onLinha={(sv) => st.abrir(sv.id)}
          rotuloLinha={(sv) => `${sv.nome}, ${fmt(sv.preco)}, abrir e editar`}
          colunas={[
            {
              chave: "nome", label: "Serviço", largura: "minmax(0,1.7fr)",
              ordenar: (sv) => sv.nome,
              celula: (sv) => <CelulaNome nome={sv.nome} sub={sv.categoria} />,
            },
            {
              chave: "duracao", label: "Duração", num: true, largura: "100px",
              ordenar: (sv) => sv.duracao,
              celula: (sv) => `${sv.duracao} min`,
            },
            {
              chave: "preco", label: "Preço", num: true, largura: "120px",
              ordenar: (sv) => sv.preco,
              celula: (sv) => fmt(sv.preco),
            },
            {
              // A pergunta que nenhuma das duas colunas anteriores responde sozinha, e que decide
              // preço: quanto este serviço rende por minuto de agenda ocupada.
              chave: "porMin", label: "R$/min", num: true, largura: "90px", secundaria: true,
              ordenar: (sv) => sv.preco / Math.max(sv.duracao, 1),
              celula: (sv) => (sv.preco / Math.max(sv.duracao, 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            },
            {
              chave: "quem", label: "Quem faz", largura: "minmax(0,1.1fr)", secundaria: true,
              ordenar: (sv) => sv.profissionalIds.length,
              celula: (sv) => (
                <span style={s("min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)")}>
                  {sv.profissionalIds.length === 0
                    ? "ninguém ainda"
                    : sv.profissionalIds.map((pid) => D.primeiroNome(st.nomeDoProfissional(pid))).join(", ")}
                </span>
              ),
            },
            {
              chave: "estado", label: "Catálogo", largura: "130px",
              ordenar: (sv) => (st.svcAtivo(sv.id) ? 0 : 1),
              celula: (sv) => st.svcAtivo(sv.id)
                ? <EstadoDoTom tom="success">no catálogo</EstadoDoTom>
                : <EstadoDoTom tom="neutral">pausado</EstadoDoTom>,
            },
          ]}
        />
      )}
    </Moldura>
  );
}

/* ═══════════════════════════════ MAIS ═══════════════════════════════
 * Era seis cartões idênticos gerados por um `.map()` sobre um array plano, sem título de seção,
 * sem divisor e sem hierarquia — e três deles duplicavam itens que já são de primeira classe no
 * rail. No desktop a tela era redundância pura; no mobile faltava justamente o item que a tab bar
 * promete cobrir (os ajustes da MAISA), então tocar em "Mais" para mudar a saudação do bot dava
 * num beco sem saída.
 *
 * Agora tem três grupos com nome, e os atalhos de navegação só existem no MOBILE, onde o rail
 * não existe. No desktop eles não aparecem, porque ali já estão a um clique de distância. */

/* ═══════════════════════════════ CONEXÕES ═══════════════════════════════ */

/** O painel que responde "a agenda está conectada?" sem obrigar ninguém a abrir
 *  quatro gavetas para descobrir.
 *
 *  O botão de conectar continua morando na ficha do profissional — é lá que a
 *  ação faz sentido, ao lado da pessoa de quem é a agenda. O que faltava era o
 *  panorama: com uma conexão POR PROFISSIONAL, o estado da integração é uma
 *  lista, não um interruptor, e não existia tela nenhuma que mostrasse essa
 *  lista inteira. Quem conectou dois de quatro não tinha como perceber.
 *
 *  Também é o único lugar que mostra a causa quando não dá para conectar
 *  (ambiente sem as chaves, sessão caída). Na gaveta isso aparecia solto, uma
 *  ficha de cada vez, como se fosse problema daquele profissional. */
function Conexoes() {
  const st = useStore();
  const equipe = st.cadastro.profissionais;
  const conectados = equipe.filter((p) => st.googleDe(p.id)).length;

  /* Cabeçalho da seção: um número, não um adjetivo. "Parcialmente conectado"
     não diz se falta um ou três. */
  const sub = st.google.status === "ok"
    ? conectados === 0
      ? "Nenhuma agenda conectada ainda"
      : `${conectados} de ${equipe.length} agendas conectadas`
    : "Google Calendar e Meet";

  /* Estados em que a lista por profissional não faz sentido: o impedimento é do
     ambiente ou da sessão, igual para todo mundo. Mostrar quatro linhas de
     "não conectado" aqui sugeriria que é só clicar. */
  const impedimento =
    st.google.status === "carregando"
      ? { tom: "neutral" as const, titulo: "Verificando a conexão…", texto: "Consultando quais agendas já estão ligadas." }
      : st.google.status === "nao_configurado"
        ? {
            tom: "warn" as const,
            titulo: "Google Calendar não configurado neste ambiente",
            texto: `Falta definir ${st.google.faltando.join(", ")}. Enquanto isso o app funciona normalmente — só não cria eventos.`,
          }
        : st.google.status !== "ok"
          ? { tom: "warn" as const, titulo: "Entre na sua conta para conectar", texto: "As agendas ficam ligadas à sua conta, então é preciso estar logado." }
          : null;

  return (
    <section>
      <SectionTitle title="Conexões" sub={sub} />
      <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden")}>
        {/* Faixa de topo: o que a integração FAZ, em uma frase. Sem isto, "Google
            Calendar — conectado" não diz o que muda no dia a dia de quem usa. */}
        <div style={s("display:flex;align-items:center;gap:13px;padding:15px 17px;border-bottom:1px solid var(--line)")}>
          <span style={s("width:38px;height:38px;flex-shrink:0;border-radius:12px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center")}>
            <Icon name="calendar-check" size={19} sw={1.9} />
          </span>
          <span style={s("flex:1;min-width:0;line-height:1.35")}>
            <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title)")}>Google Calendar + Meet</span>
            <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px")}>
              Cada atendimento pode virar um evento na agenda do profissional, com link do Meet para mandar no WhatsApp.
            </span>
          </span>
        </div>

        {impedimento ? (
          <div style={s("display:flex;align-items:flex-start;gap:11px;padding:15px 17px")}>
            <span style={s(`flex-shrink:0;margin-top:1px;color:${impedimento.tom === "warn" ? "var(--warn)" : "var(--muted)"}`)}>
              <Icon name={impedimento.tom === "warn" ? "alert" : "clock"} size={17} sw={1.9} />
            </span>
            <span style={s("flex:1;min-width:0;line-height:1.4")}>
              <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>{impedimento.titulo}</span>
              <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:3px")}>{impedimento.texto}</span>
            </span>
          </div>
        ) : (
          equipe.map((p, i) => {
            const conexao = st.googleDe(p.id);
            const ocupado = st.googleOcupado(p.id);
            return (
              <div
                key={p.id}
                style={s(`display:flex;align-items:center;gap:12px;padding:13px 17px;flex-wrap:wrap;${i < equipe.length - 1 ? "border-bottom:1px solid var(--line)" : ""}`)}
              >
                <Monogram name={p.nome} id={p.id} size={34} radius={11} />
                <span style={s("flex:1;min-width:150px;line-height:1.3")}>
                  <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>{p.nome}</span>
                  {/* O e-mail da conta, não só "conectado": a mesma conta Google pode
                      servir a mais de um profissional, e sem o endereço não dá para
                      saber que duas colunas caem na MESMA agenda. */}
                  <span
                    style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}
                    title={conexao?.googleEmail}
                  >
                    {conexao ? conexao.googleEmail : "Sem agenda conectada"}
                  </span>
                </span>
                {conexao
                  ? <EstadoDoTom tom="success">conectada</EstadoDoTom>
                  : <EstadoDoTom tom="neutral">desligada</EstadoDoTom>}
                <Btn
                  size="sm"
                  variant={conexao ? "secondary" : "primary"}
                  onClick={() => (conexao ? st.desconectarGoogle(p.id) : st.conectarGoogle(p.id))}
                  style={ocupado ? s("opacity:.5;pointer-events:none") : undefined}
                >
                  {ocupado ? "Aguarde…" : conexao ? "Desconectar" : "Conectar"}
                </Btn>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════ MAIS ═══════════════════════════════ */

/** Plano e situação, lidos de `GET /api/assinatura`. Esqueleto enquanto lê; nada de "em dia"
 *  que ninguém conferiu. */
function LinhaDoPlano() {
  const st = useStore();
  const r = resumoDaAssinatura(st.assinatura);
  const a = st.assinatura.status === "ok" ? st.assinatura.assinatura : null;
  if (st.assinatura.status === "carregando") {
    return (
      <span aria-busy="true" aria-label="Lendo sua assinatura" style={s("flex:1;min-width:160px;display:flex;flex-direction:column;gap:6px")}>
        <span style={s("width:140px;height:14px;border-radius:6px;background:var(--line)")} />
        <span style={s("width:200px;height:10px;border-radius:6px;background:var(--line)")} />
      </span>
    );
  }
  const alerta = a?.status === "inadimplente" || a?.status === "cancelada" || !a;
  return (
    <span style={s("flex:1;min-width:160px;line-height:1.3;display:flex;flex-direction:column;gap:3px")}>
      <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title)")}>{a ? `Plano ${a.plano}` : "Seu plano"}</span>
      <Estado forma={alerta ? "triangulo" : a?.status === "ativa" ? "disco" : "anel"} tom={alerta ? "warn" : a?.status === "ativa" ? "success" : "neutral"}>
        {r.sub.charAt(0).toUpperCase() + r.sub.slice(1)}
      </Estado>
    </span>
  );
}

export function Mais() {
  const st = useStore();
  const mobile = useIsMobile();

  /** Atalhos para telas — lista compacta de links, não cartões: navegar não é "abrir e editar". */
  const atalhos: { id: TelaId; titulo: string; sub: string; icone: string }[] = [
    { id: "faturamento", titulo: "Fiscal", sub: "O que falta emitir", icone: "receipt" },
    /* A configuração de qual documento sai. Fica no "Mais" porque é decisão de uma vez só — e é
     * daqui que se chega a ela no celular, onde não existe rail. */
    { id: "fiscal", titulo: "Documento fiscal", sub: "Nota fiscal ou recibo do Receita Saúde", icone: "config" },
    { id: "equipe", titulo: "Equipe", sub: "Quem atende e quando", icone: "equipe" },
    { id: "servicos", titulo: "Serviços", sub: "O que você oferece e por quanto", icone: "tag" },
    // o item que faltava: a tab bar diz que "Mais" cobre `assistente` e não havia caminho nenhum
    { id: "assistente", titulo: "Ajustes da MAISA", sub: "Tom de voz, horários e o que ela pode fazer", icone: "bot" },
    { id: "contatos", titulo: "Meus contatos", sub: "Quem ela atende e de quem ela cala", icone: "clientes" },
  ];

  /* "Conteúdo e números" saiu em 25/09/2026 (T5, 08 P0-5). O cartão de perguntas lia
   * `D.FAQS` ("4 respostas no ar · 928 usos") e o de números lia `D.NUMEROS_MES` ("Julho de
   * 2026 · Faturamento R$ 18.240,00") em setembro: fixture com cara de análise. As perguntas de
   * verdade moram nos Ajustes da MAISA, e os números voltam quando houver fonte. */

  return (
    <Moldura>
      {mobile && (
        <section>
          <SectionTitle title="Atalhos" sub="As telas que não cabem na barra de baixo" />
          <div style={s("display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden")}>
            {atalhos.map((a, i) => (
              <button
                key={a.id}
                onClick={() => st.irPara(a.id)}
                className="m-hov-bg m-focus"
                style={s(`display:flex;align-items:center;gap:13px;padding:14px 16px;border:none;background:transparent;cursor:pointer;text-align:left;font-family:inherit;color:inherit;${i < atalhos.length - 1 ? "border-bottom:1px solid var(--line)" : ""}`)}
              >
                <span style={s("width:36px;height:36px;flex-shrink:0;border-radius:11px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center")}>
                  <Icon name={a.icone} size={18} sw={1.9} />
                </span>
                <span style={s("flex:1;min-width:0;line-height:1.3")}>
                  <span style={s("display:block;font-size:var(--t-body);font-weight:var(--w-title)")}>{a.titulo}</span>
                  <span style={s("display:block;font-size:var(--t-label);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{a.sub}</span>
                </span>
                <Icon name="chevron-right" size={17} sw={2} style={s("flex-shrink:0;color:var(--muted)")} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Sua conta" sub="Assinatura e cobrança" />
        {/* Linha larga, não cartão numa grade: é UM item, e um cartão de 290px numa grade de
            quatro colunas fazia o plano parecer um entre vários. */}
        <button
          onClick={() => st.abrir("plano")}
          className="m-hov-bg m-focus"
          style={s("width:100%;display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:16px;background:var(--surface);border:1px solid var(--border);cursor:pointer;text-align:left;font-family:inherit;color:inherit;flex-wrap:wrap")}
        >
          <span style={s("width:38px;height:38px;flex-shrink:0;border-radius:12px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center")}>
            <Icon name="card" size={19} sw={1.9} />
          </span>
          {/* ⚠️ A MESMA FONTE DA GAVETA (`resumoDaAssinatura`, 25/09/2026, T5 e 08 P0-4). A linha
              lia `cadastro.negocio.plano`/`precoPlano` (R$ 149,90 de fixture) e desenhava "em dia"
              fixo, e a gaveta, um clique depois, dizia "em teste · nenhuma forma de pagamento". */}
          <LinhaDoPlano />
          <Icon name="chevron-right" size={17} sw={2} style={s("flex-shrink:0;color:var(--muted)")} />
        </button>
      </section>

      <Conexoes />

      {/* Contato do suporte — rodapé, não cartão: não é algo que se "abre". */}
      <div style={s("display:flex;align-items:center;gap:12px;padding:16px 18px;border-radius:16px;background:var(--surface);border:1px solid var(--line);flex-wrap:wrap")}>
        <span style={s("width:38px;height:38px;flex-shrink:0;border-radius:12px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:center")}>
          <Icon name="chat" size={19} />
        </span>
        <span style={s("flex:1;min-width:180px")}>
          <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>Precisa de ajuda?</span>
          <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px")}>Fale com o suporte da MAISA pelo WhatsApp — respondemos em minutos.</span>
        </span>
        <a
          href={`https://wa.me/${D.WHATSAPP_DA_MAISA}`}
          target="_blank"
          rel="noopener noreferrer"
          className="m-hov-bright m-press m-focus"
          style={s("height:42px;padding:0 18px;border-radius:12px;background:var(--whatsapp);color:var(--on-primary);font-size:var(--t-sm);font-weight:var(--w-title);display:inline-flex;align-items:center;gap:8px;text-decoration:none")}
        >
          <Icon name="whatsapp" size={17} sw={1.9} />
          Falar com o suporte
        </a>
      </div>
    </Moldura>
  );
}
