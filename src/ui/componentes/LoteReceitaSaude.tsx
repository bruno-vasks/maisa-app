"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O LOTE DO RECEITA SAÚDE — o arquivo do mês, para quem atende como pessoa física.
 *
 * ★ ESTA TELA NÃO TEM BOTÃO "EMITIR", E A AUSÊNCIA É O PRODUTO.
 *
 * Quem atende como PF emite o Recibo Eletrônico de Serviços de Saúde dentro do e-CAC, com o
 * gov.br dela. Não existe API. A MAISA monta o CSV e tira a digitação dupla — 40 sessões que
 * ela redigitaria no site da Receita. Um botão "emitir" prometeria, num verbo, o que o
 * produto não faz.
 *
 * O fluxo é de três passos, e a tela mostra os três: gerar aqui → importar no e-CAC → voltar
 * e dizer o que aconteceu ("importei" fecha o mês; "desisti" devolve as sessões).
 *
 * ── ★ A LISTA VEM ANTES DO BOTÃO, E FOI ISSO QUE O LANÇAMENTO AVULSO OBRIGOU ──
 *
 * "Nem tudo vai estar registrado automaticamente, a MAISA cobre a maioria dos casos, mas não
 * todos" (Bruno, 21/08/2026). Com pagamento digitado à mão, um formulário sem lista seria um
 * campo que engole o dado: clica em lançar, nada muda, e no recarregar da página ninguém sabe
 * se salvou. Então a tela mostra **o que vai no arquivo** — de onde veio cada linha, quem está
 * sem CPF, e quanto isso soma — antes de existir arquivo nenhum.
 *
 * ── ⚠️ OS AVISOS VÊM ANTES DO DOWNLOAD ──
 *
 * Um arquivo com 8 de 12 sessões e nenhum aviso faz o dono assinar achando que fechou o mês.
 * Por isso a rota devolve JSON com `avisos` e o download é montado aqui, e não um `text/csv`
 * que engoliria a única informação que evita isso.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from "react";
import { s, Btn, Card, Icon, SectionTitle, StatTile } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { cpfValido } from "@/nucleo/dominio/clientes";
import {
  CONSELHO, LINK_CARNE_LEAO, NOME_DA_OCUPACAO, checklistDoRecibo, faltaNoChecklist,
  partesDoChecklist, seAindaRecusar, faltaNosDados, faltaParaEmitirRecibo,
  type ItemDoChecklist,
} from "@/nucleo/dominio/checklist-recibo";
import type { OcupacaoSaude } from "@/nucleo/dominio/recibo-saude";
import { hojeISO } from "@/nucleo/dominio/tempo";
import type { ConfigFiscal } from "@/nucleo/dominio/fiscal";
import { mensagemDaFalha } from "@/ui/falhas";
import { NovoPagamento, mascaraCpf } from "@/ui/componentes/NovoPagamento";
import type { PagamentoPendente, RecibosPendentes } from "@/nucleo/portas/entrada/casos-de-uso";

/**
 * O caminho no e-CAC, em link.
 *
 * ⚠️ NÃO TROQUE POR UMA URL "MAIS DIRETA". Já se tentou `/carneleao/escrituracao`,
 * `/carneleao/demonstrativo` e `/ecac/` em 24/08/2026: as três respondem 302 para
 * `/autenticacao/login` **sem parâmetro de retorno**, e o destino é descartado no login.
 *
 * O que funciona é o login com código de serviço — ver `LINK_CARNE_LEAO`, que guarda a medição
 * inteira e o porquê do `10028`.
 */
const CARNE_LEAO = LINK_CARNE_LEAO;

/**
 * Uma linha do "pronto para emitir?".
 *
 * ⚠️ TRÊS ESTADOS, TRÊS DESENHOS, e o terceiro NÃO é cinza de "desligado": é o item que está
 * do outro lado do muro. Pintá-lo de verde ou de vermelho seria afirmar algo que a gente não
 * sabe — e ela sairia da tela achando que está tudo certo, para descobrir no e-CAC, sozinha.
 * Então ele vira instrução, com seta em vez de selo.
 */
function ItemChecklist({ item }: { item: ItemDoChecklist }) {
  /* ⚠️ `com_a_gente` NÃO CAI NO CINZA. O cinza é do item que está do outro lado do muro — algo
   * que ninguém aqui controla. "A MAISA está resolvendo" é o oposto: é trabalho em andamento, do
   * nosso lado, e pintá-lo de desligado faria parecer abandonado. Relógio, no azul do app.
   * Até 24/09/2026 era `var(--brand)`, nome do DS do site que não existe no app: a cor era
   * descartada e o relógio e o check saíam na cor do texto. O guarda G4 achou. */
  const cor =
    item.estado === "pronto" ? "var(--success)"
    : item.estado === "falta" ? "var(--warn)"
    : item.estado === "com_a_gente" ? "var(--primary)"
    : "var(--muted)";
  const icone =
    item.estado === "pronto" ? "check"
    : item.estado === "falta" ? "alert"
    : item.estado === "com_a_gente" ? "clock"
    : "link";

  return (
    <div style={s("display:flex;gap:10px;align-items:flex-start;padding:9px 14px")}>
      <span style={s(`color:${cor};margin-top:2px;flex-shrink:0`)}>
        <Icon name={icone} size={16} sw={2.3} />
      </span>
      <div style={s("display:grid;gap:5px;min-width:0;flex:1")}>
        <strong style={s("font-size:var(--t-sm);color:var(--ink)")}>{item.titulo}</strong>
        {/* O `**negrito**` do domínio vira <strong> aqui: a frase é escrita por quem conhece a
            regra, e a ênfase faz parte dela. Renderizar como texto cru perderia o que importa. */}
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.55")}>
          {negritar(item.detalhe)}
        </span>

        {item.passos && (
          /* `gap:6px` e não 4: uma ação por passo deixou a lista mais longa, e linhas de uma
             frase coladas viram parágrafo — que é o oposto de lista de conferência. */
          <ol style={s("margin:2px 0 0;padding-left:17px;display:grid;gap:6px;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
            {item.passos.map((passo) => <li key={passo}>{passo}</li>)}
          </ol>
        )}

        {/* ⚠️ A RESSALVA VEM DEPOIS DA LISTA E FORA DELA, de propósito — ver `aviso` no domínio.
            Como passo numerado, ela mandaria todo mundo instalar o Assinador Serpro; aqui embaixo,
            só é lida por quem chegou ao fim e o botão não concluiu. */}
        {item.aviso && (
          <span style={s("display:flex;gap:7px;margin-top:4px;font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
            <span style={s("flex-shrink:0;margin-top:2px")}><Icon name="alert" size={13} sw={2.2} /></span>
            <span>{negritar(item.aviso)}</span>
          </span>
        )}

        {item.link && (
          <div style={s("display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:3px")}>
            <a
              href={item.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="m-press m-focus"
              style={s("display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font-size:var(--t-label);font-weight:var(--w-title);text-decoration:none")}
            >
              <Icon name="link" size={13} sw={2.2} />
              {item.link.rotulo}
            </a>
            {/* ⚠️ A REDE DE SEGURANÇA DO DEEP LINK. Se ela não estiver logada, o e-CAC devolve
                para o login e pode não voltar — sem esta saída, "não abriu" vira "não
                funciona". Discreto de propósito: só quem precisou é que procura. */}
            {item.linkAlternativo && (
              <a
                href={item.linkAlternativo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="m-focus"
                style={s("font-size:var(--t-label);color:var(--muted);text-decoration:underline")}
              >
                {item.linkAlternativo.rotulo}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** `**assim**` → <strong>. Um `split` basta: a ênfase é o único markup que as frases usam. */
function negritar(texto: string): React.ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) =>
    i % 2 === 1 ? <strong key={i} style={s("color:var(--ink)")}>{parte}</strong> : <span key={i}>{parte}</span>,
  );
}

type Lote = {
  loteId: string;
  competencia: string;
  csv: string;
  arquivo: string;
  linhas: number;
  valor: number;
  avisos: string[];
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const diaMes = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/* `hojeSP` e `mascaraCpf` moraram aqui até 26/08/2026. Foram para `NovoPagamento` com o
 * formulário que os usava — duas cópias de uma máscara de CPF é como se começa a ter duas
 * validações de CPF. */

/**
 * A partir de quantos pagamentos a lista começa fechada.
 *
 * ⚠️ SEIS, E NÃO ZERO: um mês de três sessões cabe inteiro na tela, e esconder três linhas atrás
 * de um clique é cerimônia. O problema aparece no mês cheio — 44 pagamentos empurram o botão de
 * gerar para fora da tela, e o cartão vira um paredão de nomes de paciente.
 */
const MUITOS_PAGAMENTOS = 6;

/**
 * O que a lista mostra, dobrada ou aberta.
 *
 * ★ FECHADA, ELA NÃO FICA VAZIA: sobram os pagamentos SEM CPF. São exatamente os que ficam de
 * fora do arquivo, e são a única linha desta lista sobre a qual há o que fazer.
 *
 * ⚠️ Esconder tudo economizaria a mesma altura de tela e enterraria o item acionável junto — o
 * dono geraria o arquivo do mês sem saber que perdeu três linhas, e descobriria no e-CAC ou
 * nunca. Função pura e exportada para ter teste; ver `LoteReceitaSaude.test.ts`.
 */
export function pagamentosNaTela<T extends { cpf?: string | null }>(
  todos: T[],
  aberta: boolean,
): { visiveis: T[]; dobravel: boolean } {
  const dobravel = todos.length > MUITOS_PAGAMENTOS;
  return { dobravel, visiveis: dobravel && !aberta ? todos.filter((p) => !p.cpf) : todos };
}

/** "a", "a e b", "a, b e c". Uma frase, não uma lista de bullets, porque é meia linha de texto. */
function juntar(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
}

/**
 * A LINHA QUE RESUME "SOB QUAIS DADOS OS RECIBOS SAEM" — pronta ou pendente.
 *
 * ★ Existe porque o "Preencher meus dados" estava enterrado. Bruno, 25/08/2026: *"o Preencher
 * meus dados nn está com a mesma importância que deveria ter (tem que scrollar para mudar os
 * dados)"* — eram quatro ações até o campo (rolar, abrir o acordeão, rolar, achar o botão).
 *
 * Agora o bloco é o primeiro do cartão, e precisava de uma frase curta: cheia, ela diz o que está
 * gravado; vazia, ela diz o que falta, com o nome do campo que a pessoa vai procurar.
 */
export function resumoDosDados(
  c: Pick<ConfigFiscal, "prestadorCpf" | "ocupacaoSaude" | "registroProfissional">,
  itens: ItemDoChecklist[],
): string {
  /* ⚠️ Só a PRIMEIRA letra em minúscula. `toLowerCase()` no título inteiro devolve "seu crp" e
   * "seu cpf" — as siglas são o nome do campo que ela vai procurar, e escrevê-las torto é a
   * diferença entre uma frase escrita por gente e uma concatenação. */
  const falta = itens
    .filter((i) => i.estado === "falta")
    .map((i) => i.titulo.charAt(0).toLowerCase() + i.titulo.slice(1));
  if (falta.length) return `Falta ${juntar(falta)} — é o que vai em todas as linhas do arquivo.`;

  const cpf = String(c.prestadorCpf ?? "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  const profissao = c.ocupacaoSaude ? NOME_DA_OCUPACAO[c.ocupacaoSaude as OcupacaoSaude] : null;
  const registro = String(c.registroProfissional ?? "").trim();
  return [cpf ? `CPF ${cpf}` : null, profissao, registro || null].filter(Boolean).join(" · ");
}

/**
 * ★ O RÓTULO DO BOTÃO DIZ QUE ARQUIVO É, E PARA QUANTOS RECIBOS.
 *
 * Bruno, 25/08/2026: *"o gerar arquivo nn está com um texto claro do que ele faz (gerar o arquivo
 * que vai ser usado para fazer os recibos do mes... só que menos longo)"*.
 *
 * "Gerar arquivo do mês" não diz que arquivo nem para quê — e num cartão que fala de e-CAC, CSV,
 * Carnê-Leão e CPF, "do mês" é a palavra menos informativa disponível. O número é o que torna a
 * promessa verificável: se saírem 11 e o botão dizia 14, dá para perceber.
 *
 * ⚠️ `null` = a lista ainda não chegou. O rótulo genérico é a única frase honesta aí — inventar
 * uma contagem que muda meio segundo depois é pior que não contar.
 */
export function rotuloDeGerar(quantos: number | null): string {
  if (quantos === null) return "Gerar o arquivo do mês";
  if (quantos === 1) return "Gerar o arquivo de 1 recibo";
  return `Gerar o arquivo dos ${quantos} recibos`;
}

/** Quantos pagamentos de fato entram no arquivo. Os sem CPF ficam de fora — a Receita recusa. */
export function entramNoArquivo(p: RecibosPendentes | null): number | null {
  return p ? Math.max(p.pagamentos.length - p.semCpf, 0) : null;
}

const CAMPO = "font-family:inherit;font-size:var(--t-sm);padding:10px 12px;border-radius:11px;border:1px solid var(--border);background:var(--bg);color:var(--ink);width:100%";

/**
 * ⚠️ `apenasDados` RENDERIZA SÓ O BLOCO "SEUS DADOS" — CPF, profissão e registro, com o formulário
 * de correção. O resto do cartão (o arquivo do mês, o passo a passo do e-CAC, a lista de
 * pagamentos) fica de fora.
 *
 * Existe porque a tela `Documento fiscal` deixou de ser o endereço do arquivo do e-CAC em
 * 26/08/2026 — Bruno: *"não precisamos mais dessa parte dos recibos do mês"* — mas continua sendo
 * o lugar onde se corrige a identidade de quem emite, e é para lá que o botão "Voltar e editar
 * meus dados" da tela Fiscal aponta. Sem isto, aquele botão levaria a uma tela sem o campo.
 */
/**
 * ★ O QUE VOCÊ FAZ NO SITE DA RECEITA, montado de novo (25/09/2026, 1A.14, 06 P0-3 d).
 *
 * Os passos da autorização de acesso, do cadastro no Carnê-Leão e da conferência sem emitir
 * moravam só no ramo `!apenasDados` deste arquivo, e o único lugar que monta o componente passa
 * `apenasDados`: onze passos, os links com o 10028 e o `AVISO_ASSINADOR` eram código morto, e a
 * autorização vencida não tinha onde ser renovada. Aqui eles viram um recorte do Documento
 * fiscal, sempre aberto, com uma âncora por item (`secao-autorizacao`, `secao-carne-leao`): é
 * para lá que o "Renovar autorização" da tela Fiscal leva, por `?secao=`.
 *
 * ⚠️ As palavras e os links vêm de `checklistDoRecibo`, sem cópia: o 10028 e "uma ação por
 * passo" são contrato do domínio (ver `LINK_CARNE_LEAO`).
 */
export function NoSiteDaReceita({ config, foco }: { config: ConfigFiscalDaTela; foco?: string | null }) {
  const { noEcac } = partesDoChecklist(checklistDoRecibo(config, hojeISO()));
  const ancora: Partial<Record<ItemDoChecklist["id"], string>> = { procuracao: "secao-autorizacao", carne_leao: "secao-carne-leao" };
  React.useEffect(() => {
    if (!foco) return;
    const alvo = document.getElementById(`secao-${foco}`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "start" });
    alvo.focus({ preventScroll: true });
  }, [foco]);
  if (!noEcac.length) return null;
  return (
    <Card style={{ display: "grid", gap: 6 }}>
      <SectionTitle title="No site da Receita" sub="O que só você faz, no e-CAC. A MAISA não consegue conferir estes passos daqui." />
      {noEcac.map((i) => (
        <div
          key={i.id}
          id={ancora[i.id]}
          tabIndex={ancora[i.id] ? -1 : undefined}
          style={s(`scroll-margin-top:16px;border-radius:12px;${ancora[i.id] && foco && ancora[i.id] === `secao-${foco}` ? "outline:2px solid var(--primary);outline-offset:-2px" : ""}`)}
        >
          <ItemChecklist item={i} />
        </div>
      ))}
      <details style={s("margin:6px 14px 0;font-size:var(--t-label);color:var(--muted)")}>
        <summary style={s("cursor:pointer;font-weight:var(--w-title);color:var(--ink)")}>
          E se o e-CAC recusar mesmo com tudo certo?
        </summary>
        <ol style={s("margin:8px 0 0;padding-left:18px;display:grid;gap:6px;line-height:1.55")}>
          {seAindaRecusar(config.ocupacaoSaude ?? null).map((passo) => <li key={passo}>{passo}</li>)}
        </ol>
      </details>
    </Card>
  );
}

type ConfigFiscalDaTela = Parameters<typeof checklistDoRecibo>[0];

export function LoteReceitaSaude({ apenasDados }: { apenasDados?: boolean } = {}) {
  /**
   * A lista de clientes sai do store, e não de uma rota nova.
   *
   * ★ POR QUE ESCOLHER CLIENTE É O CAMINHO PRINCIPAL DO FORMULÁRIO, e não um atalho: quem
   * pagou fora da agenda quase sempre JÁ É cadastro — a sessão que não entrou é que é a
   * exceção, não a pessoa. Fazer o dono redigitar nome e CPF de alguém que a MAISA já conhece
   * é pedir para ele errar um dígito num documento fiscal.
   *
   * ⚠️ Nome e CPF continuam sendo GRAVADOS no lançamento, mesmo com cliente escolhido, e a
   * view lê `coalesce(cadastro, digitado)`. Ou seja: o cadastro manda, e o digitado é a
   * lembrança de quem era a pessoa no dia — que é o que sobra se o cliente for apagado depois.
   */
  const st = useStore();
  const clientes = st.cadastro.clientes;
  /* ⚠️ O ESTADO FISCAL VEM DO STORE DESDE 25/08/2026, e não de um `fetch` daqui de dentro. O
   * custo do `fetch` próprio nunca foi a requisição repetida: era o hero do Faturamento e o botão
   * dourado da topbar não terem como saber o caminho, e por isso prometerem nota fiscal a quem
   * emite recibo. Ver `EstadoFiscalUI` no store.
   *
   * `carregando` e `erro` escondem o cartão, como antes: piscá-lo antes de saber seria oferecer
   * recibo de saúde a um barbeiro MEI. */
  const ehRecibo = st.fiscal.status === "ok" && st.fiscal.caminho === "recibo_saude";
  const config = st.fiscal.config;
  const falta = st.fiscal.falta;
  /* `null` = ninguém tocou; aí quem decide é a pendência. Ver `ecacAberto`. */
  const [checklistAberto, setChecklistAberto] = useState<boolean | null>(null);
  /* ── ★ EDITAR OS PRÓPRIOS DADOS, e o motivo de existir é um buraco de navegação ──
   *
   * CPF, profissão e registro só eram graváveis no onboarding (`LigarNotaFiscal`), e aquela
   * tela faz `return null` assim que o caminho vira `recibo_saude` — de propósito, para não
   * repetir cartão. O efeito colateral: o checklist dizia "preencha o seu CRP" e **não havia
   * onde**. O único caminho era desligar o Receita Saúde e ligar de novo, que é destrutivo e
   * recusado quando já existe lote importado.
   *
   * Então o conserto mora onde o problema é enunciado: dentro do próprio checklist. */
  const [editando, setEditando] = useState(false);
  const [fCpf, setFCpf] = useState("");
  const [fOcupacao, setFOcupacao] = useState<OcupacaoSaude>("psicologo");
  const [fRegistro, setFRegistro] = useState("");
  const [fProc, setFProc] = useState("");
  const [fProcAte, setFProcAte] = useState("");
  const [fProcAceita, setFProcAceita] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroDados, setErroDados] = useState<string | null>(null);
  /* A lista longa começa fechada. Ver `MUITOS_PAGAMENTOS`. */
  const [listaAberta, setListaAberta] = useState(false);
  const [pendentes, setPendentes] = useState<RecibosPendentes | null>(null);
  const [lote, setLote] = useState<Lote | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* Marcada por padrão: avisar é o que quase todo mundo quer, e é o valor do produto. Quem não
   * quer desmarca — a caixa fica ao lado do botão justamente para isso ser um clique. */
  const [avisar, setAvisar] = useState(true);
  const [placar, setPlacar] = useState<{ avisados: number; semTelefone: number; falhas: number } | null>(null);

  /* ⚠️ O FORMULÁRIO DO AVULSO NÃO MORA MAIS AQUI. Ele virou `NovoPagamento`, porque a tela de
   * emitir recibos precisa do mesmo lançamento (Bruno, 26/08/2026) e duas cópias das validações de
   * CPF divergiriam na primeira correção — num campo onde divergir significa a Receita recusando o
   * arquivo inteiro por causa de uma linha. O estado dele foi junto. */

  const lerPendentes = useCallback(async () => {
    try {
      const r = await fetch("/api/recibos", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) setPendentes(r as RecibosPendentes);
    } catch {
      /* Silêncio: a lista é informação, e o botão de gerar continua funcionando sem ela. */
    }
  }, []);

  /* A lista de pendentes só faz sentido neste caminho — e só depois de saber que é ele. */
  useEffect(() => { if (ehRecibo) void lerPendentes(); }, [ehRecibo, lerPendentes]);

  const abrirDados = () => {
    setFCpf(mascaraCpf(config?.prestadorCpf ?? ""));
    setFOcupacao((config?.ocupacaoSaude as OcupacaoSaude | null) ?? "psicologo");
    setFRegistro(config?.registroProfissional ?? "");
    setFProc(config?.procuradorDocumento ?? "");
    setFProcAte(config?.procuracaoValidaAte ?? "");
    setFProcAceita(!!config?.procuracaoAceitaEm);
    setErroDados(null);
    setEditando(true);
  };

  /**
   * Salva os três campos.
   *
   * ⚠️ É O MESMO `POST /api/fiscal` QUE LIGA O RECIBO, de propósito. Os três campos **são** a
   * configuração: ligar é gravá-los pela primeira vez, corrigir é gravá-los de novo, e o caso
   * de uso já é idempotente. Um segundo caminho de escrita para os mesmos três campos daria
   * duas validações de CPF para manter em sincronia — e a que ficasse para trás aceitaria
   * dígito torto, que a Receita devolve recusando o arquivo inteiro.
   */
  const salvarDados = useCallback(async () => {
    setSalvando(true);
    setErroDados(null);
    try {
      const r = await fetch("/api/fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: fCpf, ocupacao: fOcupacao, registro: fRegistro.trim() || null,
          procurador: fProc.trim() || null,
          procuracaoAte: fProcAte || null,
          /* A data do aceite é derivada do "sim/não": ninguém digita quando aceitou, e guardar o
           * dia serve para saber desde quando a emissão está liberada. */
          procuracaoAceitaEm: fProcAceita ? (config?.procuracaoAceitaEm ?? hojeISO()) : null,
        }),
      }).then((x) => x.json());
      if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui salvar seus dados."));
      st.aplicarFiscal(r);
      setEditando(false);
    } catch (e) {
      setErroDados(e instanceof Error ? e.message : "Não consegui salvar seus dados.");
    } finally {
      setSalvando(false);
    }
  }, [fCpf, fOcupacao, fRegistro, fProc, fProcAte, fProcAceita, config, st]);

  const gerar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/recibos/lote", { method: "POST" }).then((x) => x.json());
      if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui gerar o arquivo."));
      setLote(r as Lote);
      baixar(r as Lote);
      void lerPendentes();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gerar o arquivo.");
    } finally {
      setOcupado(false);
    }
  }, [lerPendentes]);

  /* O download é montado no navegador: o CSV nunca fica em disco nosso, e o nome carrega CPF
   * e competência — importar o mês errado duas vezes é o erro mais fácil de cometer.
   * O `﻿` é o BOM: sem ele, nome com acento chega torto em quem abre no Windows. */
  const baixar = (l: Lote) => {
    const blob = new Blob(["﻿" + l.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = l.arquivo;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fechar = useCallback(async (situacao: "importado" | "descartado") => {
    if (!lote) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/recibos/lote", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        /* ⚠️ `avisar` SÓ NO `importado`. Descartar é desistir do arquivo: não existe recibo,
         * então não existe notícia para dar. O caso de uso também barra isso — a tela não é a
         * única guarda, e nenhuma das duas deveria ser. */
        body: JSON.stringify({
          loteId: lote.loteId,
          situacao,
          avisar: situacao === "importado" && avisar,
        }),
      });
      const j = await r.json().catch(() => null);
      setLote(null);
      /* O placar do disparo sobrevive ao lote sumir da tela: é a única confirmação de que as
       * mensagens saíram, e ela precisa ficar legível depois do clique. */
      if (situacao === "importado" && avisar) {
        setPlacar({
          avisados: Number(j?.avisados ?? 0),
          semTelefone: Number(j?.semTelefone ?? 0),
          falhas: Number(j?.falhas ?? 0),
        });
      }
      void lerPendentes();
    } finally {
      setOcupado(false);
    }
  }, [lote, avisar, lerPendentes]);

  const excluir = useCallback(async (id: string) => {
    setOcupado(true);
    try {
      await fetch(`/api/recibos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      void lerPendentes();
    } finally {
      setOcupado(false);
    }
  }, [lerPendentes]);

  /**
   * Trocar o tipo de documento — a saída de quem escolheu errado.
   *
   * ★ ERA UM `window.location.reload()`, e o comentário de então dizia: "no dia em que o estado
   * fiscal morar no store, isto vira um `setEstado`". O dia foi 25/08/2026. Este cartão e o
   * `LigarNotaFiscal` liam `/api/fiscal` cada um por conta própria, então desligar aqui escondia
   * este sem acordar o outro e a tela ficava sem nenhum dos dois — recarregar era o conserto
   * mais barato. Agora os dois leem o mesmo estado, e a troca acontece no mesmo tick.
   */
  const trocar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal", { method: "DELETE" }).then((x) => x.json());
      if (!r?.ok) throw new Error(mensagemDaFalha(r, "Não consegui trocar agora."));
      st.aplicarFiscal(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui trocar agora.");
    } finally {
      setOcupado(false);
    }
  };

  if (!ehRecibo) return null;

  /* ⚠️ A validação do lançamento (CPF no módulo 11, valor, nome) mora em `faltaDoLancamento`,
   * dentro de `NovoPagamento` — junto do formulário que ela protege, e com teste. */

  /* Calculado na hora: é função pura sobre a config que já está em memória. Não vale uma rota
   * nem um estado — e um `useMemo` aqui só esconderia que a conta é de três `if`. */
  const checklist = config ? checklistDoRecibo(config, hojeISO()) : [];
  /* ★ DOIS ASSUNTOS, DOIS BLOCOS. Ver `partesDoChecklist`: o que é dado nosso vira formulário
   * aqui em cima, o que acontece no site da Receita vira instrução lá embaixo. */
  const { meusDados, noEcac } = partesDoChecklist(checklist);
  const faltaMeusDados = faltaNoChecklist(meusDados);
  const faltaNoEcac = faltaNoChecklist(noEcac);
  /* ⚠️ O QUE IMPEDE EMITIR É `faltaParaEmitirRecibo` (domínio), desde 25/09/2026 (1A.13): CPF,
   * profissão E o registro no conselho, que a Rebots exige. O registro "não impedia" aqui e
   * impedia na tela Fiscal, e o botão primário apontava para a parede (06 P0-4). */
  const bloqueia = falta.length > 0 || (config ? faltaNosDados(faltaParaEmitirRecibo(config, hojeISO())).length > 0 : false);
  /* Aberto por conta própria quando há pendência do outro lado do muro. Autorização vencida
   * dentro de um acordeão fechado é a pior forma de dar a única notícia que para a emissão. */
  const ecacAberto = checklistAberto ?? faltaNoEcac > 0;
  const entram = entramNoArquivo(pendentes);

  /* ── ★ A LISTA LONGA NÃO SOME INTEIRA: SOBRA O QUE PRECISA DE AÇÃO ──
   *
   * Fechada, ela mostra só os pagamentos SEM CPF — que são exatamente os que ficam de fora do
   * arquivo. Esconder tudo atrás de um clique economizaria a mesma altura de tela e enterraria
   * o único item acionável junto; o dono geraria o arquivo sem saber que perdeu três linhas. */
  const pagamentos = pendentes?.pagamentos ?? [];
  const { visiveis: pagamentosVisiveis, dobravel: listaLonga } =
    pagamentosNaTela(pagamentos, listaAberta);

  return (
    <Card style={{ display: "grid", gap: 14 }}>
      {!apenasDados && (
        <SectionTitle
          title="Recibos do mês"
          sub="A MAISA monta o arquivo. Quem emite e assina é você, no e-CAC."
        />
      )}
      {apenasDados && (
        <SectionTitle
          title="Seus dados de emitente"
          sub="É o que vai em todo recibo. Corrigir aqui não mexe no que já saiu."
        />
      )}

      {/* ── ★ BLOCO 1 — SEUS DADOS, e ele é o PRIMEIRO do cartão por causa de uma reclamação ──
          Bruno, 25/08/2026: *"o Preencher meus dados nn está com a mesma importância que deveria
          ter (tem que scrollar para mudar os dados)"*. O botão morava dentro do acordeão de
          checklist, fechado por padrão, depois da lista de pacientes — quatro ações até um campo
          que a própria tela cobrava. Agora o conserto está onde a cobrança é feita, e a cobrança
          é a primeira coisa que se lê. */}
      {config && (
        <div style={s(`display:grid;gap:10px;padding:13px 15px;border-radius:13px;border:1px solid ${bloqueia ? "var(--warn)" : "var(--border)"};background:${bloqueia ? "var(--warn-soft)" : "var(--bg)"}`)}>
          {!editando ? (
            <div style={s("display:flex;gap:11px;align-items:center;flex-wrap:wrap")}>
              <span style={s(`flex-shrink:0;display:flex;color:${bloqueia ? "var(--warn)" : faltaMeusDados > 0 ? "var(--muted)" : "var(--success)"}`)}>
                <Icon name={faltaMeusDados > 0 ? "alert" : "check"} size={17} sw={2.3} />
              </span>
              <span style={s("flex:1;min-width:170px;display:grid;gap:3px")}>
                <strong style={s("font-size:var(--t-sm);color:var(--ink)")}>Seus dados</strong>
                <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
                  {resumoDosDados(config, meusDados)}
                </span>
              </span>
              {/* Primário só quando IMPEDE emitir (inclusive o registro, ver `bloqueia`). */}
              <Btn variant={bloqueia ? "primary" : "ghost"} icon="edit" onClick={abrirDados}>
                {faltaMeusDados > 0 ? "Preencher meus dados" : "Corrigir"}
              </Btn>
            </div>
          ) : (
            <div style={s("display:grid;gap:9px")}>
              <span style={s("font-size:var(--t-label);color:var(--muted)")}>
                É o que vai no arquivo em todas as linhas. Muda quando você quiser — não
                mexe nos recibos que já saíram.
              </span>

              <label style={s("display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
                Seu CPF — o mesmo com que você entra no gov.br
                <input
                  value={fCpf}
                  onChange={(e) => setFCpf(mascaraCpf(e.target.value))}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="n m-focus"
                  style={s(CAMPO)}
                />
              </label>

              <label style={s("display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
                Sua profissão
                {/* As seis da Receita, lidas do domínio: lista própria aqui daria um rótulo
                    na tela e outro no arquivo para o mesmo código. */}
                <select
                  value={fOcupacao}
                  onChange={(e) => setFOcupacao(e.target.value as OcupacaoSaude)}
                  className="n m-focus"
                  style={s(CAMPO)}
                >
                  {(Object.keys(NOME_DA_OCUPACAO) as OcupacaoSaude[]).map((o) => (
                    <option key={o} value={o}>{NOME_DA_OCUPACAO[o]}</option>
                  ))}
                </select>
              </label>

              <label style={s("display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
                Seu {CONSELHO[fOcupacao]}, obrigatório para emitir
                <input
                  value={fRegistro}
                  onChange={(e) => setFRegistro(e.target.value)}
                  placeholder={`${CONSELHO[fOcupacao]} 00/000000`}
                  maxLength={15}
                  className="n m-focus"
                  style={s(CAMPO)}
                />
              </label>

              {/* ── ★ QUEM EMITE POR ELA ──
                  Dois campos e um sim/não, e os três só existem porque a Receita exige que
                  a autorização venha DELA e o aceite venha de NÓS. O terceiro é operado
                  pela MAISA, não pela cliente — está escrito no rótulo, porque campo que
                  parece do usuário e não é vira dado errado. */}
              <div style={s("display:grid;gap:9px;padding-top:9px;border-top:1px solid var(--border)")}>
                <strong style={s("font-size:var(--t-sm);color:var(--ink)")}>Quem emite por você</strong>

                <label style={s("display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
                  CPF ou CNPJ de quem você autorizou no site da Receita
                  <input
                    value={fProc}
                    onChange={(e) => setFProc(e.target.value)}
                    inputMode="numeric"
                    placeholder="deixe vazio se você mesma emite"
                    className="n m-focus"
                    style={s(CAMPO)}
                  />
                </label>

                <label style={s("display:grid;gap:5px;font-size:var(--t-label);color:var(--muted)")}>
                  Até quando a autorização vale
                  <input
                    value={fProcAte}
                    onChange={(e) => setFProcAte(e.target.value)}
                    type="date"
                    className="n m-focus"
                    style={s(CAMPO)}
                  />
                </label>

                <label style={s("display:flex;gap:9px;align-items:flex-start;font-size:var(--t-label);color:var(--muted);cursor:pointer")}>
                  <input
                    type="checkbox"
                    checked={fProcAceita}
                    onChange={(e) => setFProcAceita(e.target.checked)}
                    style={s("margin-top:2px")}
                  />
                  <span>
                    <strong style={s("color:var(--ink)")}>A MAISA já confirmou no e-CAC.</strong>{" "}
                    Quem marca isto somos nós, depois de aceitar a autorização na aba
                    Recebidas — antes disso a Receita não deixa emitir.
                  </span>
                </label>
              </div>

              {erroDados && (
                <span style={s("font-size:var(--t-label);color:var(--warn)")}>{erroDados}</span>
              )}

              {/* `Btn` não tem `disabled`, e a convenção da casa é o rótulo mudar — igual
                  ao "Montando…" do botão de gerar. Clicar duas vezes aqui é inofensivo: são
                  os mesmos três campos, e gravá-los de novo dá o mesmo resultado. */}
              <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
                <Btn onClick={salvarDados}>{salvando ? "Salvando…" : "Salvar"}</Btn>
                <Btn variant="ghost" onClick={() => setEditando(false)}>Cancelar</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {!apenasDados && (<>
      {/* ── ★ BLOCO 2 — O QUE VOCÊ FAZ NO SITE DA RECEITA ──
          O que sobrou do checklist depois de tirar os campos: a autorização de acesso, o cadastro
          no Carnê-Leão do ano e a conferência que aponta erro sem emitir nada. Nenhum deles é um
          campo — todos são instrução com link, e a gente não consegue verificar nenhum daqui
          (ver `nao_da_para_saber`). Por isso viraram um bloco separado, com o desenho da sua
          natureza, em vez de linhas idênticas às dos campos numa lista só.

          ⚠️ Abre sozinho quando há pendência aqui dentro — autorização vencida é a única coisa
          desta tela que PARA a emissão, e acordeão fechado é o pior lugar para essa notícia. */}
      {noEcac.length > 0 && (
        <div style={s("display:grid;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden")}>
          <button
            type="button"
            onClick={() => setChecklistAberto(!ecacAberto)}
            className="m-press m-focus"
            style={s("display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:0;background:var(--bg);color:var(--ink);cursor:pointer;text-align:left;font-size:var(--t-sm);font-weight:var(--w-title)")}
          >
            <Icon name={faltaNoEcac > 0 ? "alert" : "link"} size={17} sw={2.3} />
            <span style={s("flex:1")}>
              O que você faz no e-CAC
              {faltaNoEcac > 0 && (
                <span style={s("color:var(--warn);font-weight:var(--w-body)")}>
                  {" "}· {faltaNoEcac} {faltaNoEcac === 1 ? "item pendente" : "itens pendentes"}
                </span>
              )}
            </span>
            {/* `arrow-right` rotacionado: não existe `up`/`down` no conjunto de ícones,
                e inventar um SVG solto aqui furaria o design system por uma seta. */}
            <span style={s(`display:inline-flex;transition:transform .15s;transform:rotate(${ecacAberto ? 90 : 0}deg)`)}>
              <Icon name="arrow-right" size={15} />
            </span>
          </button>

          {ecacAberto && (
            <div style={s("display:grid;gap:2px;padding:4px 0 10px;border-top:1px solid var(--border)")}>
              {noEcac.map((i) => <ItemChecklist key={i.id} item={i} />)}

              {/* A escada do "e se recusar mesmo com tudo certo?". O último degrau é um e-mail
                  da Receita que quase ninguém sabe que existe — sem ele, a profissional com
                  registro ativo e recusa persistente conclui que o produto está quebrado. */}
              <details style={s("margin:6px 14px 0;font-size:var(--t-label);color:var(--muted)")}>
                <summary style={s("cursor:pointer;font-weight:var(--w-title);color:var(--ink)")}>
                  E se o e-CAC recusar mesmo com tudo certo?
                </summary>
                <ol style={s("margin:8px 0 0;padding-left:18px;display:grid;gap:6px;line-height:1.55")}>
                  {seAindaRecusar(config?.ocupacaoSaude ?? null).map((passo) => (
                    <li key={passo}>{passo}</li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </div>
      )}

      {/* ⚠️ SEM CPF E PROFISSÃO NÃO HÁ ARQUIVO, e quem cobra os dois é o bloco lá em cima — com o
          botão que os preenche ao lado da frase. Aqui existia uma SEGUNDA faixa amarela dizendo a
          mesma falta sem oferecer onde resolver; era um dos três assuntos empilhados que fizeram o
          Bruno dizer que a tela estava confusa. */}
      {bloqueia ? null : !lote ? (
        <>
          {/* ── o que vai no arquivo ── */}
          {pendentes && pendentes.pagamentos.length > 0 && (
            <div style={s("display:grid;gap:8px")}>
              <div style={s("display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap")}>
                <strong style={s("font-size:var(--t-sm);color:var(--ink)")}>
                  {pendentes.pagamentos.length === 1 ? "1 pagamento" : `${pendentes.pagamentos.length} pagamentos`} sem recibo
                </strong>
                <span style={s("font-size:var(--t-sm);color:var(--muted)")}>{brl(pendentes.total)} vai no arquivo</span>
              </div>

              <div style={s("display:grid;gap:4px")}>
                {pagamentosVisiveis.map((p: PagamentoPendente) => (
                  <div key={p.id} style={s(`display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:10px;background:${p.cpf ? "var(--surface-2, var(--bg))" : "var(--warn-soft)"}`)}>
                    <span style={s("font-size:var(--t-label);color:var(--muted);min-width:38px")}>{diaMes(p.data)}</span>
                    <span style={s("font-size:var(--t-sm);color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>
                      {p.nome}
                      {/* De onde a linha veio. O dono precisa distinguir o que ele digitou do
                          que a agenda trouxe — é a diferença entre conferir e confiar. */}
                      {p.fonte === "avulso" && (
                        <span style={s("margin-left:7px;font-size:var(--t-label);color:var(--muted)")}>· avulso</span>
                      )}
                    </span>
                    {!p.cpf && (
                      <span style={s("font-size:var(--t-label);color:var(--warn)")}>sem CPF</span>
                    )}
                    <span style={s("font-size:var(--t-sm);color:var(--ink)")}>{brl(p.valor)}</span>
                    {p.podeExcluir && (
                      <button
                        onClick={() => excluir(p.id)}
                        disabled={ocupado}
                        title="Apagar este lançamento"
                        className="m-focus"
                        style={s("background:none;border:none;padding:2px;cursor:pointer;display:flex;color:var(--muted)")}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* O botão só existe quando há o que dobrar. Num mês de três sessões ele seria
                  cerimônia sobre três linhas — ver `MUITOS_PAGAMENTOS`. */}
              {listaLonga && (
                <button
                  type="button"
                  onClick={() => setListaAberta((v) => !v)}
                  className="m-press m-focus"
                  style={s("display:flex;align-items:center;gap:7px;align-self:flex-start;padding:6px 2px;border:0;background:none;color:var(--muted);cursor:pointer;font-family:inherit;font-size:var(--t-label)")}
                >
                  <span style={s(`display:inline-flex;transition:transform .15s;transform:rotate(${listaAberta ? 90 : 0}deg)`)}>
                    <Icon name="arrow-right" size={13} />
                  </span>
                  {listaAberta
                    ? "Esconder a lista"
                    : `Ver ${pagamentos.length === 1 ? "o pagamento" : `os ${pagamentos.length} pagamentos`}`}
                </button>
              )}

              {pendentes.semCpf > 0 && (
                <span style={s("font-size:var(--t-label);color:var(--warn)")}>
                  {pendentes.semCpf === 1 ? "1 pagamento fica" : `${pendentes.semCpf} pagamentos ficam`} de fora
                  até ter o CPF de quem foi atendido — a Receita exige.
                </span>
              )}
            </div>
          )}

          {/* ── ★ lançar o que a agenda não pegou ──
              Mesmo componente que a tela de emissão usa. Ver `NovoPagamento`: as validações são de
              documento fiscal, e duas cópias delas divergiriam. */}
          <NovoPagamento onLancado={() => void lerPendentes()} />

          {/* ── ★ O BOTÃO DIZ O QUE FAZ, E O QUE NÃO FAZ ──
              Bruno, 25/08/2026: *"o gerar arquivo nn está com um texto claro do que ele faz"*.

              Duas trocas. O rótulo passou a nomear o documento e a quantidade (ver
              `rotuloDeGerar`), e o parágrafo de três linhas que estava aqui — com data, valor,
              CPF e o caminho `Carnê-Leão → Escrituração → Importar` — virou uma linha só. O
              caminho não sumiu: ele aparece **depois** do download, na tela em que ela está com
              o arquivo na mão. Antes estava nos dois lugares, e o daqui chegava cedo demais para
              servir de instrução e comprido demais para servir de resumo.

              ⚠️ A frase existe para separar dois verbos que a tela inteira depende de não
              confundir: a MAISA GERA, o e-CAC EMITE. Ver o cabeçalho do arquivo. */}
          {entram === 0 ? (
            <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.55")}>
              {pagamentos.length === 0
                ? "Nenhum pagamento sem recibo por enquanto. Toda sessão paga cai aqui, e no fim do mês vira uma linha do arquivo."
                : "Nada entra no arquivo ainda: todos os pagamentos estão sem o CPF de quem foi atendido."}
            </p>
          ) : (
            <>
              <Btn icon="download" onClick={gerar} full>
                {ocupado ? "Montando…" : rotuloDeGerar(entram)}
              </Btn>
              <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.55;text-align:center")}>
                Você importa esse arquivo no e-CAC — é a importação que emite os recibos.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <div style={s("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
            <StatTile label="pagamentos no arquivo" value={lote.linhas} icon="receipt" />
            <StatTile label="valor" value={brl(lote.valor)} icon="card" tone="success" />
          </div>

          {/* ⚠️ Nunca escondido e nunca resumido a um número: é aqui que ela descobre de quem
              falta CPF antes de assinar o mês achando que fechou. */}
          {lote.avisos.length > 0 && (
            <div style={s("display:grid;gap:6px")}>
              {lote.avisos.map((a) => (
                <div key={a} style={s("display:flex;gap:8px;color:var(--warn);font-size:var(--t-label)")}>
                  <Icon name="alert" size={16} />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:1.55")}>
            <strong>{lote.arquivo}</strong> foi baixado. Importe no e-CAC e volte para dizer o
            que aconteceu — é isso que impede a MAISA de pedir os mesmos recibos no mês que vem.
          </p>

          {/* O passo a passo dentro do link porque é onde ele é lido: quem acabou de baixar o
              arquivo está com a pasta de Downloads aberta, não com o manual da Receita. */}
          <a
            href={CARNE_LEAO}
            target="_blank"
            rel="noopener noreferrer"
            className="m-press m-focus"
            style={s("display:flex;align-items:center;gap:8px;align-self:flex-start;padding:10px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font-size:var(--t-sm);font-weight:var(--w-title);text-decoration:none")}
          >
            <Icon name="link" size={15} sw={2.2} />
            Abrir meu Carnê-Leão
          </a>
          {/* ⚠️ A FRASE PROMETIA QUE O LINK CAÍA "direto na escrituração". O login fica no meio,
              sempre — e promessa de navegação que não se cumpre é pior que navegação nenhuma:
              ela procura uma tela que não apareceu e conclui que clicou errado. Agora a frase
              nomeia o login primeiro e deixa a navegação como plano B. */}
          <span style={s("font-size:var(--t-label);color:var(--muted)")}>
            Entre com a conta gov.br. Se não cair no Carnê-Leão, vá em <strong>Declarações e
            Demonstrativos → Acessar Carnê-Leão</strong>. Lá: <strong>Importar Escrituração →
            Analisar Arquivo</strong> — a análise aponta linha e campo de qualquer erro{" "}
            <strong>sem emitir nada</strong>. Só depois, Importar.
          </span>

          {/* ★ O AVISO NO WHATSAPP, E POR QUE ELE É UMA CAIXA E NÃO UM COMPORTAMENTO.
              A MAISA fala pelo número PESSOAL de quem a usa. Trinta mensagens saindo porque
              alguém clicou em "Importei" sem esperar isso não tem desfazer — mensagem entregue
              não se apaga. Então a caixa aparece marcada (é o que quase todo mundo quer) e
              visível ao lado do botão (para quem não quer, desmarcar custa um clique). */}
          <label style={s("display:flex;gap:10px;align-items:flex-start;cursor:pointer;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg)")}>
            <input
              type="checkbox"
              checked={avisar}
              onChange={(e) => setAvisar(e.target.checked)}
              style={s("margin-top:2px;width:16px;height:16px;accent-color:var(--primary)")}
            />
            <span style={s("display:grid;gap:3px")}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title)")}>
                Avisar {lote.linhas} paciente(s) no WhatsApp
              </span>
              <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
                Uma mensagem por recibo, com a data e o valor — <strong>sem o nome do
                serviço</strong>. A MAISA avisa que o recibo saiu e que ele já vai aparecer na
                declaração pré-preenchida; o PDF não vem no lote, é a Receita que guarda.
              </span>
            </span>
          </label>

          <div style={s("display:flex;gap:10px;flex-wrap:wrap")}>
            <Btn icon="check" onClick={() => fechar("importado")}>Importei no e-CAC</Btn>
            <Btn variant="ghost" icon="download" onClick={() => baixar(lote)}>Baixar de novo</Btn>
            <Btn variant="ghost" icon="undo" onClick={() => fechar("descartado")}>
              Desisti — devolver as sessões
            </Btn>
          </div>
        </>
      )}

      {/* ★ O PLACAR DO DISPARO. Fica depois de o lote sair da tela porque é a única prova de
          que as mensagens saíram — e porque `semTelefone` é acionável: são pacientes com recibo
          emitido e sem aviso, que se resolve pondo o telefone no cadastro. */}
      {placar && (
        <div style={s("display:grid;gap:6px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg)")}>
          <div style={s("display:flex;gap:8px;align-items:center;font-size:var(--t-sm);font-weight:var(--w-title)")}>
            <Icon name="check" size={16} sw={2.4} />
            <span>{placar.avisados} paciente(s) avisados no WhatsApp</span>
          </div>
          {placar.semTelefone > 0 && (
            <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
              {placar.semTelefone} ficaram sem aviso por não ter telefone no cadastro. O recibo
              deles saiu igual — a Receita já notificou no app deles.
            </span>
          )}
          {placar.falhas > 0 && (
            <span style={s("display:flex;gap:8px;font-size:var(--t-label);color:var(--warn);line-height:1.5")}>
              <Icon name="alert" size={15} />
              <span>
                {placar.falhas} mensagem(ns) não saíram — número trocado, ou o WhatsApp
                desconectou. Os recibos foram emitidos do mesmo jeito.
              </span>
            </span>
          )}
        </div>
      )}

      {erro && (
        <div style={s("display:flex;gap:8px;color:var(--danger);font-size:var(--t-label)")}>
          <Icon name="alert" size={16} />
          <span>{erro}</span>
        </div>
      )}

      {/* ⚠️ O CPF SUBIU PARA O BLOCO 1 e não se repete aqui. Ele é a única informação desta tela
          que, errada, faz o arquivo inteiro ser recusado no e-CAC — tem que ser o mesmo CPF que
          acessa o Carnê-Leão —, e por isso passou a morar ao lado do botão que o corrige, no topo
          do cartão, em vez de num rodapé onde só se lê por acaso. */}
      <div style={s("display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--border)")}>
        <button
          onClick={trocar}
          disabled={ocupado}
          className="m-focus"
          style={s(`background:none;border:none;padding:0;font-family:inherit;font-size:var(--t-label);color:var(--muted);cursor:${ocupado ? "default" : "pointer"};text-decoration:underline`)}
        >
          Trocar o tipo de documento
        </button>
      </div>
      </>)}
    </Card>
  );
}
