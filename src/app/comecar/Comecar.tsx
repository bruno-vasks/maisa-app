"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * O WIZARD — de conta criada a negócio de pé.
 *
 * Até 15/08/2026 o primeiro login de todo mundo terminava numa frase: o app respondia 409
 * `sem_negocio` e a tela dizia *"Esta conta ainda não tem um negócio. Rode criar_negocio()
 * no Supabase"*. Instrução de desenvolvedor entregue ao cliente final. A rota
 * `POST /api/negocio` existia desde 13/08 e nenhuma tela a chamava.
 *
 * ── POR QUE É ROTA PRÓPRIA E NÃO UM MODAL NO PAINEL ──
 *
 * Porque o `AppShell` precisa de inquilino para montar: o store abre pedindo
 * `GET /api/cadastro`, que devolve 409 para exatamente esta pessoa. Um modal por cima
 * teria como pano de fundo um painel quebrado, com toda tela em estado de erro — e o
 * primeiro minuto de uso é o pior momento possível para o produto parecer avariado.
 *
 * ── POR QUE ELE NÃO USA O `StoreProvider` ──
 *
 * Mesma razão, levada a sério: o store é a máquina do painel (agenda, conversas, notas,
 * Google) e nada disso responde antes de existir negócio. O wizard fala com as rotas
 * direto — meia dúzia de `fetch` — e o painel assume depois, já com inquilino.
 *
 * ── O QUE ELE DELIBERADAMENTE NÃO PERGUNTA ──
 *
 * CNPJ, CPF de cliente, dados fiscais, equipe inteira. `negocios` nem tem coluna de CNPJ:
 * ele é `config_fiscal.prestador_cnpj` e só importa na hora de emitir nota. Perguntar
 * adiantado é a forma mais comum de matar onboarding — e o que não é perguntado aqui vira
 * cartão da jornada no painel, feito quando a pessoa precisar.
 *
 * ── ★ DESDE 13/11/2026: TRÊS PERGUNTAS, COM A CONVERSA AO LADO ──
 *
 * O negócio e o seu nome, os serviços e o horário: o que a maisa precisa para atender certo, e só.
 * A cada resposta, a `MolduraDaConversa` mostra um cliente perguntando e a maisa respondendo com
 * aquilo (texto em `previa.ts`). Foi a escolhida pelo Bruno entre três protótipos.
 *
 * O que saiu, e para onde foi:
 *
 *   • o WHATSAPP: conecta-se no painel (`?tela=assistente&secao=whatsapp`), com o botão direto na
 *     comemoração. Das 5 contas vindas da Meta de 04 a 12/11, nenhuma passou da etapa dele, e uma
 *     escreveu para a conta oficial "Onde digitar o codigo";
 *   • o TIPO DE NEGÓCIO e "O QUE A MAISA FAZ": a vertical vem do `/assinar`
 *     (`user_metadata.vertical`, e "generico" sem ela), e a maisa nasce conversando e lembrando
 *     (`ajustesDosModos(["conversa"])`). Quem quer outra coisa muda em "A maisa", no painel;
 *   • NOTA FISCAL OU RECIBO: só na tela Fiscal, porque nem todo mundo assina pela nota;
 *   • o CATÁLOGO PRONTO: os serviços começam do zero, e os cinco que o banco semeia
 *     (`005_provisionar.sql`) são apagados quando a pessoa grava os dela;
 *   • o "VER FUNCIONANDO": abre só pelo cartão da jornada (`?etapa=ver`), na moldura antiga.
 *
 * ⚠️ SÓ A ETAPA 1 CRIA ALGUMA COISA. As outras gravam por cima do que o banco semeou, então quem sai
 * no meio fica com um negócio que funciona; o que faltar vira cartão da jornada no painel, que lê
 * o mundo em vez de uma flag.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { s, Icon, toast, Toaster } from "@/ui/primitivos";
import type { PassoDeAtivacao, Servico, UsoDoWhatsApp, Vertical } from "@/nucleo/dominio";
import { PASSOS_DE_ATIVACAO, passosQueValem, usoDoWhatsApp } from "@/nucleo/dominio";
import { sugestoes, type ExemploDoNegocio } from "./sugestoes";
import { ajustesDosModos, type Modo } from "./modos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { NOME_NEGOCIO_MIN, ehVertical } from "@/nucleo/dominio/negocio";
import { MolduraDeEntrada, TituloDaEntrada } from "@/ui/componentes/MolduraDeEntrada";
import { MolduraDaConversa, type Troca } from "./MolduraDaConversa";
import {
  DIAS_CURTOS, PERGUNTAS_DO_CLIENTE, falaDoHorario, falaDoNegocio, falaDosServicos, precoDigitado,
} from "./previa";

/* ───────────────────────────── as etapas ───────────────────────────── */

type EtapaId = "negocio" | "servicos" | "horario" | "ver";
type Pergunta = Exclude<EtapaId, "ver">;

/** As três perguntas, na ordem. O "ver" fica de fora: só abre pelo painel. */
const PERGUNTAS: { id: Pergunta; titulo: string }[] = [
  { id: "negocio", titulo: "Como se chama o seu negócio?" },
  { id: "servicos", titulo: "O que você oferece?" },
  { id: "horario", titulo: "Quando você atende?" },
];

/** A seção do WhatsApp nos ajustes da maisa, no painel. É onde se conecta desde 12/11/2026. */
const IR_AO_WHATSAPP = "/?tela=assistente&secao=whatsapp";

/** De 15 minutos a 3 horas. */
const DURACOES = [15, 30, 45, 60, 90, 120, 150, 180];
const textoDaDuracao = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`);

/** De meia em meia hora, das 07:00 às 22:00: a janela que `AjustarExpediente` aceita. */
const HORAS = Array.from({ length: 31 }, (_, i) => 7 + i / 2);
const textoDaHora = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

/** Uma linha do formulário de serviços. `chave` é só da tela (o `key` do React); `id` existe
 *  quando a linha já está gravada, e é o que faz voltar e editar em vez de duplicar. */
type LinhaDeServico = { chave: string; id?: string; nome: string; duracao: number; preco: string; categoria: Servico["categoria"] };

/** O que a pessoa respondeu até agora. Alimenta as etapas e a conversa ao lado. */
type Rascunho = {
  negocio: string;
  nome: string;
  profissionalId: string | null;
  servicos: LinhaDeServico[];
  /** Segunda (0) a sábado (5), como o expediente. */
  dias: number[];
  de: number;
  ate: number;
};
type Mudanca = Partial<Rascunho> | ((r: Rascunho) => Partial<Rascunho>);

let linhasCriadas = 0;
const novaLinha = (p: Partial<LinhaDeServico> = {}): LinhaDeServico =>
  ({ chave: `linha-${++linhasCriadas}`, nome: "", duracao: 60, preco: "", categoria: "Recorrente", ...p });

const rascunhoVazio = (): Rascunho => ({
  negocio: "", nome: "", profissionalId: null, servicos: [novaLinha()], dias: [0, 1, 2, 3, 4], de: 9, ate: 18,
});

const CAMPO =
  "width:100%;height:46px;padding:0 14px;border-radius:var(--r-painel);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none";

/* ───────────────────────────── peças ───────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────
 * O PÉ DO WIZARD — onde mora a ação que fecha a etapa (28/09/2026, T1 e 2.41).
 *
 * A etapa desenha o primário dela junto do estado que ele usa (`ocupado`, `recado`), mas ele
 * aparece no pé da moldura, que nunca rola: o catálogo tem cinco linhas de serviço e o "Salvar
 * e continuar" nascia em y 1487 a 1440x900, fora da dobra. `NoPe` leva os filhos por portal até
 * o pé; sem pé montado (primeiro quadro), desenha no lugar, e nada some.
 *
 * Portal e não `position:sticky` dentro do cartão: o pé tem fundo e borda próprios, e o sticky
 * dependia da altura do pai de cada etapa. Os botões do wizard são `onClick`, sem `<form>`, então
 * o portal não quebra envio nenhum (o `<form>` da conversa da etapa 4 fica onde está).
 * ───────────────────────────────────────────────────────────────────────────── */

const PeDoWizard = createContext<HTMLElement | null>(null);

function NoPe({ children }: { children: React.ReactNode }) {
  const alvo = useContext(PeDoWizard);
  return alvo ? createPortal(children, alvo) : <>{children}</>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O RECADO — E POR QUE ELE TEM TOM.
 *
 * ── O RELATO (18/08/2026) ──
 *
 * *"Às vezes aparecem algumas coisas vermelhas no wizard que dão a sensação de que algo deu
 * errado, sendo que é só o fluxo natural."*
 *
 * Estava certo, e a causa era um canal só para três naturezas diferentes. Todo aviso desta
 * tela passava por `setErro` e saía em `--danger` sobre `--danger-soft`:
 *
 *   • "Não foi possível criar seu negócio" ....... falha de verdade, precisa de vermelho
 *   • "O código venceu, gere outro" .............. prazo cumprindo o prazo, é o normal
 *   • "Este servidor não gerou o código de 8 dígitos, use o QR" ... caminho alternativo,
 *     com a saída escrita na própria frase
 *
 * Os dois últimos são o produto funcionando. Pintá-los de vermelho no meio do onboarding —
 * o momento em que a pessoa está decidindo se comprou algo que presta — é dizer "quebrou"
 * quando não quebrou. Vermelho que aparece no caminho certo é vermelho que ninguém lê mais
 * quando o caminho errado acontecer.
 *
 * `aviso` usa os tokens `--warn`, que o `CodigoPareamento` ao lado já usa para o contador
 * chegando ao fim: o mesmo fato, a mesma cor.
 * ───────────────────────────────────────────────────────────────────────────── */

export type Tom = "erro" | "aviso";
export type Recado = { tom: Tom; txt: string } | null;

/** Atalhos: o tom vira parte da chamada, não uma decisão a mais em cada `setX`. */
export const falhou = (txt: string): Recado => ({ tom: "erro", txt });
export const avisa = (txt: string): Recado => ({ tom: "aviso", txt });

function Aviso({ recado }: { recado: Recado }) {
  if (!recado) return null;
  const erro = recado.tom === "erro";
  return (
    <div
      role={erro ? "alert" : "status"}
      style={s(
        "display:flex;gap:9px;align-items:flex-start;font-size:var(--t-sm);font-weight:var(--w-title);" +
        "padding:11px 13px;border-radius:var(--r-controle);line-height:1.45;" +
        (erro
          ? "color:var(--danger);background:var(--danger-soft)"
          : "color:var(--warn);background:var(--warn-soft)"),
      )}
    >
      <Icon
        name={erro ? "alert" : "clock"} size={16}
        stroke={erro ? "var(--danger)" : "var(--warn)"}
        style={{ flexShrink: 0, marginTop: 1 }}
      />
      <span>{recado.txt}</span>
    </div>
  );
}

function Botao({
  children, onClick, ocupado, variante = "primary", full,
}: {
  children: React.ReactNode; onClick: () => void; ocupado?: boolean;
  variante?: "primary" | "ghost"; full?: boolean;
}) {
  /* `<button>` cru e não o `Btn` do painel: o `Btn` não tem `disabled`, e um wizard sem
   * botão travado dispara o mesmo POST duas vezes com um duplo clique — que na etapa 1
   * significa DOIS negócios criados. Criar um `disabled` no primitivo mexeria num
   * componente usado por toda a aplicação por causa desta tela. */
  const primaria = variante === "primary";
  return (
    <button
      onClick={ocupado ? undefined : onClick}
      disabled={ocupado}
      className={`${primaria ? "m-hov-primary" : "m-hov-bg"} m-press m-focus`}
      style={s(`display:inline-flex;align-items:center;justify-content:center;gap:9px;height:48px;padding:0 22px;border-radius:var(--r-painel);font-family:inherit;font-weight:var(--w-title);font-size:var(--t-body);cursor:${ocupado ? "not-allowed" : "pointer"};opacity:${ocupado ? ".55" : "1"};${
        primaria
          ? "border:none;background:var(--primary);color:var(--on-primary)"
          : "border:1px solid var(--border);background:var(--surface);color:var(--muted)"
      };${full ? "width:100%" : ""}`)}
    >
      {ocupado && (
        <span style={{ ...s("width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-top-color:currentColor;border-radius:50%"), animation: "mspin .7s linear infinite" }} />
      )}
      {children}
    </button>
  );
}

/* ───────────────────────────── as três perguntas ───────────────────────────── */

/**
 * Grava os modos e devolve o uso do WhatsApp que FICOU no servidor, lido da resposta e não
 * suposto da escolha. `undefined` quando o PATCH não passa: valem todos os passos, o lado que
 * mostra uma etapa a mais em vez de esconder uma.
 */
const aplicarModos = async (modos: readonly Modo[]): Promise<UsoDoWhatsApp | undefined> => {
  const r = await fetch("/api/assistente", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ajustesDosModos(modos)),
  }).then((x) => x.json()).catch(() => null);
  if (!r?.ok || !r.assistente || !r.cfg) return undefined;
  return usoDoWhatsApp({ ativa: r.assistente.ativa, lembrete: r.cfg.lembrete, avisarRecibo: r.cfg.avisarRecibo });
};

/** A vertical que o `/assinar` gravou na conta. Sem ela (o `/cadastro`, o Google), "generico". */
async function verticalDaConta(): Promise<Vertical> {
  if (!isSupabaseConfigured) return "generico";
  try {
    const { data } = await createClient().auth.getUser();
    const v = data.user?.user_metadata?.vertical;
    return ehVertical(v) ? v : "generico";
  } catch {
    return "generico";
  }
}

/** Enter num campo de texto segue, como no botão. Sem `<form>`: o botão vive no pé, por portal. */
const enterSegue = (seguir: () => void) => (e: React.KeyboardEvent) => {
  if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
  e.preventDefault();
  seguir();
};

/** O botão de cada pergunta. No computador, com a dica do Enter ao lado (`.m-ob-dica`). */
function Seguir({ rotulo, onClick, pronto, ocupado }: { rotulo: string; onClick: () => void; pronto: boolean; ocupado: boolean }) {
  return (
    <NoPe>
      <button type="button" className="m-ob-acao m-focus" onClick={onClick} disabled={!pronto || ocupado}>
        {ocupado ? "Gravando…" : rotulo}
        {!ocupado && <Icon name="arrow-right" size={18} stroke="currentColor" />}
      </button>
      <span className="m-ob-dica">ou aperte <kbd>Enter</kbd></span>
    </NoPe>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h1 className="m-ob-titulo">{children}</h1>;
}

/* ── 1 · o negócio ── */

function EtapaNegocio({ r, mudar, aoCriar }: {
  r: Rascunho; mudar: (m: Mudanca) => void; aoCriar: (uso: UsoDoWhatsApp | undefined) => void;
}) {
  const [recado, setRecado] = useState<Recado>(null);
  const [ocupado, setOcupado] = useState(false);
  const pronto = r.negocio.trim().length >= NOME_NEGOCIO_MIN && r.nome.trim().length >= 2;

  /* O nome de quem atende, quando a conta já traz um (o `full_name` do Google). Só sugere. */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let vivo = true;
    createClient().auth.getUser()
      .then(({ data }) => {
        const n = data.user?.user_metadata?.full_name;
        if (vivo && typeof n === "string" && n.trim()) mudar((x) => ({ nome: x.nome || n.trim().split(" ")[0] }));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [mudar]);

  const criar = useCallback(async () => {
    if (!pronto || ocupado) return;
    setOcupado(true);
    setRecado(null);
    try {
      const vertical = await verticalDaConta();
      const res = await fetch("/api/negocio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: r.negocio.trim(), vertical, profissional: r.nome.trim() }),
      }).then((x) => x.json());
      if (!res?.ok) {
        /* A frase do SERVIDOR: o caso de uso `provisionar.ts` tem uma para cada recusa. */
        setRecado(falhou(res?.info ?? "Não foi possível criar seu negócio."));
        setOcupado(false);
        return;
      }
      /* ⚠️ O AJUSTE FALHA PARA A FRENTE: o negócio JÁ EXISTE quando esta linha roda, e barrar aqui
       * deixaria a pessoa presa numa etapa que só sabe criar. O mesmo interruptor está em "A maisa". */
      const uso = await aplicarModos(["conversa"]);
      if (!uso) toast("Criei seu negócio, mas não consegui ligar a maisa. Ligue em “A maisa”, no painel.");
      aoCriar(uso);
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [pronto, ocupado, r.negocio, r.nome, aoCriar]);

  return (
    <div className="m-cascata" style={s("display:flex;flex-direction:column;gap:20px")} onKeyDown={enterSegue(() => void criar())}>
      <Titulo>{PERGUNTAS[0].titulo}</Titulo>
      <div className="m-ob-par">
        <label className="m-ob-campo-grupo">
          <span className="m-ob-rotulo">Nome do negócio</span>
          <input
            className="m-ob-campo" value={r.negocio} onChange={(e) => mudar({ negocio: e.target.value })}
            placeholder="Escreva o nome do seu negócio…" autoComplete="organization"
          />
        </label>
        <label className="m-ob-campo-grupo">
          <span className="m-ob-rotulo">Seu nome</span>
          <input
            className="m-ob-campo" value={r.nome} onChange={(e) => mudar({ nome: e.target.value })}
            placeholder="Como seus clientes te chamam…" autoComplete="given-name"
          />
        </label>
      </div>
      <Aviso recado={recado} />
      <Seguir rotulo="Continuar" onClick={() => void criar()} pronto={pronto} ocupado={ocupado} />
    </div>
  );
}

/* ── 2 · os serviços ── */

/**
 * Os serviços, do zero. Cada linha nasce em branco ("Novo serviço…"), e a pessoa escreve o nome,
 * a duração e o preço. Linha sem nome é ignorada; linha com nome precisa de preço (zero vale: o
 * cadastro aceita o serviço gratuito).
 *
 * ── COMO GRAVA ──
 *
 * Primeiro os da pessoa, um por um (PUT com `id` edita, sem `id` cria, e o repositório liga o
 * serviço novo a quem atende). Depois apaga do banco o que sobrou: na primeira passagem, os cinco
 * que `criar_negocio()` semeou; numa volta, a linha que a pessoa tirou. Nessa ordem, o negócio nunca
 * fica sem serviço no meio do caminho.
 *
 * Sequencial e não `Promise.all`: se a terceira linha for recusada, a frase diz qual.
 */
function EtapaServicos({ r, mudar, aoSeguir }: { r: Rascunho; mudar: (m: Mudanca) => void; aoSeguir: () => void }) {
  const [recado, setRecado] = useState<Recado>(null);
  const [ocupado, setOcupado] = useState(false);
  const comNome = r.servicos.filter((l) => l.nome.trim());
  const pronto = comNome.length > 0 && comNome.every((l) => precoDigitado(l.preco) !== null);

  const mudarLinha = useCallback((chave: string, p: Partial<LinhaDeServico>) => {
    mudar((x) => ({ servicos: x.servicos.map((l) => (l.chave === chave ? { ...l, ...p } : l)) }));
  }, [mudar]);

  const adicionar = () => {
    const l = novaLinha();
    mudar((x) => ({ servicos: [...x.servicos, l] }));
    setTimeout(() => document.getElementById(`servico-${l.chave}`)?.focus(), 0);
  };

  const salvar = useCallback(async () => {
    if (!pronto || ocupado) return;
    setOcupado(true);
    setRecado(null);
    try {
      const antes = await fetch("/api/cadastro").then((x) => x.json());
      const gravados: string[] = [];
      for (const l of comNome) {
        const res = await fetch("/api/servicos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(l.id ? { id: l.id } : {}),
            nome: l.nome.trim(), categoria: l.categoria, preco: precoDigitado(l.preco), duracao: l.duracao, ativo: true,
          }),
        }).then((x) => x.json());
        const id: string | undefined = res?.servico?.id;
        if (!res?.ok || !id) {
          setRecado(falhou(`“${l.nome.trim()}”: ${res?.info ?? "não foi possível salvar."}`));
          setOcupado(false);
          return;
        }
        gravados.push(id);
        mudarLinha(l.chave, { id });
      }

      const sobra = ((antes?.ok ? antes.servicos : []) as Servico[]).filter((sv) => !gravados.includes(sv.id));
      const presos: string[] = [];
      for (const sv of sobra) {
        const res = await fetch(`/api/servicos?id=${encodeURIComponent(sv.id)}`, { method: "DELETE" })
          .then((x) => x.json()).catch(() => null);
        if (!res?.ok) presos.push(sv.nome);
      }
      /* Não trava: os serviços da pessoa já estão gravados. Mas o que ficou a maisa ofereceria. */
      if (presos.length) toast(`Não consegui tirar ${presos.map((n) => `“${n}”`).join(", ")}. Tire em Serviços, no painel.`);
      aoSeguir();
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [pronto, ocupado, comNome, mudarLinha, aoSeguir]);

  return (
    <div className="m-cascata" style={s("display:flex;flex-direction:column;gap:20px")} onKeyDown={enterSegue(() => void salvar())}>
      <Titulo>{PERGUNTAS[1].titulo}</Titulo>
      <div className="m-ob-servicos" role="list" aria-label="Seus serviços">
        <div className="m-ob-servicos-cab" aria-hidden><span>Serviço</span><span>Duração</span><span>Preço</span><span /></div>
        {r.servicos.map((l) => (
          <div key={l.chave} className="m-ob-servico" role="listitem">
            <input
              id={`servico-${l.chave}`} className="m-ob-campo m-ob-servico-nome" value={l.nome}
              onChange={(e) => mudarLinha(l.chave, { nome: e.target.value })}
              placeholder="Novo serviço…" aria-label="Nome do serviço"
            />
            <select
              className="m-ob-campo" value={l.duracao} aria-label={`Duração${l.nome.trim() ? ` de ${l.nome.trim()}` : ""}`}
              onChange={(e) => mudarLinha(l.chave, { duracao: Number(e.target.value) })}
            >
              {DURACOES.map((m) => <option key={m} value={m}>{textoDaDuracao(m)}</option>)}
            </select>
            <span className="m-ob-reais">
              <span aria-hidden>R$</span>
              {/* `type="text"` e `inputMode="decimal"`: o `type="number"` do Chrome recusa a vírgula. */}
              <input
                className="m-ob-campo" type="text" inputMode="decimal" value={l.preco}
                onChange={(e) => mudarLinha(l.chave, { preco: e.target.value })}
                aria-label={`Preço${l.nome.trim() ? ` de ${l.nome.trim()}` : ""}, em reais`}
              />
            </span>
            {r.servicos.length > 1 ? (
              <button
                type="button" className="m-ob-tirar m-focus" aria-label={`Tirar ${l.nome.trim() || "este serviço"}`}
                onClick={() => mudar((x) => ({ servicos: x.servicos.filter((y) => y.chave !== l.chave) }))}
              >
                <Icon name="x" size={18} stroke="currentColor" />
              </button>
            ) : <span />}
          </div>
        ))}
      </div>
      <button type="button" className="m-ob-mais m-focus" onClick={adicionar}>
        <Icon name="plus" size={18} stroke="currentColor" />
        Adicionar serviço
      </button>
      <Aviso recado={recado} />
      <Seguir rotulo="Continuar" onClick={() => void salvar()} pronto={pronto} ocupado={ocupado} />
    </div>
  );
}

/* ── 3 · o horário ── */

/**
 * Os dias e o horário. Grava em DOIS lugares, e eles precisam bater:
 *
 *   • o EXPEDIENTE de quem atende (`/api/equipe/expediente`), que decide o que a agenda deixa
 *     marcar e o que a maisa oferece;
 *   • o HORÁRIO ANUNCIADO (`/api/horarios`), que é o que ela responde quando perguntam "que horas
 *     vocês atendem?". O cabeçalho de `aplicacao/horarios.ts` conta por que são dois.
 *
 * Domingo não aparece: o expediente vai de segunda a sábado.
 */
function EtapaHorario({ r, mudar, aoTerminar }: { r: Rascunho; mudar: (m: Mudanca) => void; aoTerminar: () => void }) {
  const [recado, setRecado] = useState<Recado>(null);
  const [ocupado, setOcupado] = useState(false);
  const pronto = r.dias.length > 0 && r.ate > r.de;

  const alternar = (d: number) =>
    mudar((x) => ({ dias: x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d].sort((a, b) => a - b) }));

  const salvar = useCallback(async () => {
    if (!pronto || ocupado) return;
    setOcupado(true);
    setRecado(null);
    try {
      let profissionalId = r.profissionalId;
      if (!profissionalId) {
        const c = await fetch("/api/cadastro").then((x) => x.json()).catch(() => null);
        profissionalId = c?.ok ? c.profissionais?.[0]?.id ?? null : null;
      }
      if (!profissionalId) {
        setRecado(falhou("Não achei quem atende neste negócio. Ajuste o horário em Equipe, no painel."));
        setOcupado(false);
        return;
      }
      const exp = await fetch("/api/equipe/expediente", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profissionalId, dias: r.dias, de: r.de, ate: r.ate }),
      }).then((x) => x.json());
      if (!exp?.ok) {
        setRecado(falhou(exp?.info ?? "Não foi possível salvar o horário."));
        setOcupado(false);
        return;
      }
      /* Sete dias, segunda (0) a domingo (6), com hora em texto: o formato de `dominio/horarios.ts`. */
      const semana = Array.from({ length: 7 }, (_, dow) => {
        const aberto = r.dias.includes(dow);
        return { dow, aberto, de: aberto ? textoDaHora(r.de) : null, ate: aberto ? textoDaHora(r.ate) : null };
      });
      const anunciado = await fetch("/api/horarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(semana),
      }).then((x) => x.json()).catch(() => null);
      /* O expediente já está gravado, e é ele que decide a agenda. O anunciado se conserta em "A maisa". */
      if (!anunciado?.ok) toast("Gravei seu horário, mas não o que a maisa responde. Ajuste em “A maisa”, no painel.");
      aoTerminar();
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [pronto, ocupado, r.profissionalId, r.dias, r.de, r.ate, aoTerminar]);

  return (
    <div className="m-cascata" style={s("display:flex;flex-direction:column;gap:20px")}>
      <Titulo>{PERGUNTAS[2].titulo}</Titulo>
      <div className="m-ob-campo-grupo">
        <span className="m-ob-rotulo" id="rotulo-dias">Dias</span>
        <div className="m-ob-dias" role="group" aria-labelledby="rotulo-dias">
          {DIAS_CURTOS.map((d, i) => (
            <button
              key={d} type="button" className="m-ob-dia m-focus" aria-pressed={r.dias.includes(i)} onClick={() => alternar(i)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="m-ob-campo-grupo">
        <span className="m-ob-rotulo">Horário</span>
        <div className="m-ob-horas">
          <span>Das</span>
          <select className="m-ob-campo" value={r.de} aria-label="Começa às" onChange={(e) => mudar({ de: Number(e.target.value) })}>
            {HORAS.slice(0, -1).map((h) => <option key={h} value={h}>{textoDaHora(h)}</option>)}
          </select>
          <span>às</span>
          <select className="m-ob-campo" value={r.ate} aria-label="Termina às" onChange={(e) => mudar({ ate: Number(e.target.value) })}>
            {HORAS.slice(1).map((h) => <option key={h} value={h}>{textoDaHora(h)}</option>)}
          </select>
        </div>
      </div>
      <Aviso recado={recado} />
      <Seguir rotulo="Criar minha conta" onClick={() => void salvar()} pronto={pronto} ocupado={ocupado} />
    </div>
  );
}

/* ─────────────────────────── etapa 4 · ver funcionando ───────────────────────────
 *
 * A etapa que separa "vi um filme do produto" de "vi o produto". Aqui o dono escreve como
 * se fosse o próprio cliente e a MAISA responde de verdade: mesmo agente, mesmas
 * ferramentas, mesma agenda. O horário que sair daqui EXISTE.
 *
 * ── POR QUE ELA COBRA DUAS CONEXÕES ANTES DE DEIXAR CONVERSAR ──
 *
 * Porque sem elas a demonstração fracassa, e fracassa da pior forma possível: a MAISA
 * conversa bem, tenta marcar, não consegue, e escala para humano. Medido lendo o caminho,
 * não adivinhado:
 *
 *   • sem WHATSAPP pareado, `instanciaDoInquilino` (composicao.ts) lança `PrecisaReconectar`
 *     ao entregar a resposta — falha fechada de propósito, para a resposta de um negócio
 *     nunca sair pelo número de outro;
 *   • sem AGENDA do Google ligada, `saida/google/conexoes.ts` lança na primeira consulta de
 *     horário. O cabeçalho daquele arquivo conta essa história com todas as letras:
 *     *"a MAISA dizia ao cliente que a agenda caiu e escalava para humano. Conversava e
 *     nunca marcava."*
 *
 * ⚠️ ISSO EXPÔS UM BURACO DO WIZARD CURTO: até aqui ele nunca pedia o Google, e todo mundo
 * que terminava o onboarding saía com uma MAISA incapaz de marcar. O pedido entra AGORA, e
 * não como etapa 5, porque é aqui que ele se explica sozinho — a pessoa está a um clique de
 * ver o resultado. Configuração pedida no momento em que o valor aparece é a única que não
 * parece burocracia.
 *
 * Nada disso é obrigatório: "Abrir meu painel" está sempre na tela. O que não existe é a
 * opção de conversar e sair achando que funcionou quando não funcionou.
 * ──────────────────────────────────────────────────────────────────────────────── */

type Fala = { de: "cliente" | "maisa" | "aviso"; txt: string };
type Passo = { ferramenta: string; erro: boolean };

/** O que falta antes de conversar — um cartão, uma ação, e o painel sempre à mão. */
function Falta({
  icone, titulo, texto, acao, aoPainel, pular,
}: {
  icone: string; titulo: string; texto: React.ReactNode; acao: React.ReactNode; aoPainel: () => void;
  /** "Pular este passo" (1B.15, 09 P0-2): sem ele, quem não resolvia a falta nunca chegava à
   *  etapa 5, a do documento fiscal. Pular não é desistir: o passo continua na jornada. */
  pular?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
      <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--warm-soft)")}>
        <Icon name={icone} size={27} stroke="var(--warm-ink)" />
      </div>
      <div>
        <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>{titulo}</p>
        <p style={s("font-size:var(--t-sm);color:var(--muted);margin:8px 0 0;line-height:1.55")}>{texto}</p>
      </div>
      {acao}
      {pular && (
        <button
          type="button"
          onClick={pular}
          className="m-hov-bg m-press m-focus"
          style={s("min-height:44px;padding:0 18px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--surface);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);cursor:pointer")}
        >
          Pular este passo
        </button>
      )}
      <button
        onClick={aoPainel}
        className="m-focus"
        style={s("background:none;border:none;font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--muted);cursor:pointer;padding:4px 8px;min-height:44px")}
      >
        Abrir meu painel
      </button>
    </div>
  );
}


/**
 * "Ela também pode olhar os compromissos da sua Agenda do Google." Uma linha e o link de ligar,
 * nunca um portão (1B.15). Lê `/api/google/status` para não oferecer a quem já ligou. Herdou
 * do `LigarAgenda`, o botão do portão que saiu, os três cuidados abaixo.
 *
 * `<a>` e não `fetch`: `/api/google/conectar` responde com um redirect para o consent do
 * Google, e um redirect seguido por `fetch` termina o consent dentro de um XHR — a pessoa
 * fica olhando um botão girando enquanto a tela do Google acontece onde ninguém vê.
 *
 * ⚠️ O PARÂMETRO SE CHAMA `pid`, E NÃO `profissionalId`. Esta linha nasceu errada e o
 * sintoma foi o pior possível: a rota lê `searchParams.get("pid")`, recebia vazio, não
 * achava o id na allowlist de agendas e redirecionava de volta para `/comecar` com
 * `?google=erro&motivo=profissional_invalido`. Da tela, isso é **um botão que não faz
 * nada** — ele navega, o servidor recusa e o navegador volta para o mesmo lugar. Medido
 * com o Bruno preso na etapa 4 em 16/08/2026. O painel sempre usou `pid`
 * (`store.tsx:2611`); foi este arquivo que inventou um nome sem ler a rota.
 *
 * ⚠️ `volta` NÃO PODE TER QUERY STRING. O callback compõe o retorno com `?google=ok` numa
 * concatenação crua (`google/callback/route.ts`), então um `volta` que já trouxesse `?`
 * viraria uma URL com dois — e o wizard reabriria na etapa errada. O retorno para a etapa
 * certa é resolvido pelo próprio `?google=` que o callback acrescenta; ver o `useEffect` de
 * retomada lá embaixo.
 */
function OfertaDoGoogle() {
  const [pid, setPid] = useState<string | null>(null);
  const [ligado, setLigado] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/cadastro").then((r) => r.json()).catch(() => null),
      fetch("/api/google/status").then((r) => r.json()).catch(() => null),
    ]).then(([c, g]) => {
      if (!vivo) return;
      const p = c?.ok ? (c.profissionais ?? [])[0]?.id ?? null : null;
      setPid(p);
      setLigado(!!p && Array.isArray(g?.conexoes) && g.conexoes.some((x: { profissionalId: string }) => x.profissionalId === p));
    });
    return () => { vivo = false; };
  }, []);
  if (!pid || ligado !== false) return null;
  return (
    <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
      Ela também pode olhar os compromissos da sua Agenda do Google.{" "}
      <a href={`/api/google/conectar?pid=${encodeURIComponent(pid)}&volta=%2Fcomecar`} className="m-focus" style={s("font-weight:var(--w-title);color:var(--primary);text-decoration:underline;text-underline-offset:3px")}>
        Ligar
      </a>
    </p>
  );
}

/**
 * O que `/api/laboratorio` conta sobre este ambiente antes de qualquer conversa.
 *
 * `agendaReal` é o campo que mais decide comportamento nesta tela, e não é sobre o
 * inquilino — é sobre o DEPLOY. Sem as três variáveis do Google, `composicao.ts` liga a
 * agenda de memória, e ela responde tão bem quanto a de verdade até o processo reiniciar.
 * Medido no `npm run dev` em 16/08/2026: `agenda: "demonstração (em memória)"` enquanto a
 * produção respondia Google.
 */
type Ambiente = { pronto: boolean; agendaReal: boolean; exemplo: ExemploDoNegocio };

/** A conversa em si. Só monta quando o que precisa estar de pé está de pé. */
function Conversa({ ambiente, numero, aoPainel }: {
  ambiente: Ambiente; numero: string | null;
  /** Voltar ao painel, de onde esta etapa foi aberta. */
  aoPainel: () => void;
}) {
  const { exemplo } = ambiente;
  const semChave = !ambiente.pronto;
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupada, setOcupada] = useState(false);
  /* Booleano e não o horário: quem sabe QUANDO é a MAISA, na fala dela. Guardar a data aqui
   * seria uma segunda fonte da verdade sobre o mesmo atendimento — e a que envelhece, porque
   * ela não acompanha um remarcar. Esta tela só precisa saber SE existe. */
  const [marcou, setMarcou] = useState(false);
  const [consultou, setConsultou] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [falas, ocupada]);

  const enviar = useCallback(async (mensagem: string) => {
    const limpo = mensagem.trim();
    if (!limpo || ocupada) return;

    setFalas((f) => [...f, { de: "cliente", txt: limpo }]);
    setTexto("");
    setOcupada(true);

    try {
      const r = await fetch("/api/laboratorio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        /* O telefone é o do PRÓPRIO NEGÓCIO — o número que acabou de ser pareado. É o que
         * faz a resposta da MAISA chegar no WhatsApp de quem está olhando a tela, que é a
         * prova que nenhuma captura de tela dá. Não vira laço: a Evolution devolve o que
         * mandamos com `fromMe: true` e o webhook descarta (ver `whatsapp/contexto.ts`). */
        body: JSON.stringify({ texto: limpo, de: numero ?? undefined }),
      });
      const d = await r.json();

      if (!d?.ok) {
        setFalas((f) => [...f, { de: "aviso", txt: String(d?.erro ?? "Não consegui falar com a MAISA agora.") }]);
        return;
      }

      const trilha: Passo[] = d.trilha ?? [];
      if (trilha.some((p) => p.ferramenta === "oferecer_horarios" && !p.erro)) setConsultou(true);

      const bolhas = (d.bolhas ?? []) as string[];
      for (const b of bolhas) {
        setFalas((f) => [...f, { de: "maisa", txt: b }]);
      }
      /* ⚠️ BOLHA VAZIA É SILÊNCIO, E SILÊNCIO TEM MOTIVO (1A.15, 09 P0-3). A rota devolve
       * `ok:true, bolhas:[]` quando a MAISA decide calar (número pessoal, conversa assumida) e
       * manda o porquê em `motivo`. Antes a fala do "cliente" aparecia, o "digitando…" sumia,
       * e nada: sem uma palavra. Quando escalou, o aviso de baixo já fala. */
      if (bolhas.length === 0 && !d.escalou) {
        setFalas((f) => [...f, {
          de: "aviso",
          txt: d.motivo
            ? `Ela ficou calada: ${String(d.motivo).replace(/\.$/, "")}. No WhatsApp de verdade seria igual. Quem ela atende se muda em "De quem é esse número", nos Ajustes.`
            : "Ela ficou calada, e o servidor não disse por quê.",
        }]);
      }

      /* O horário marcado sai da TRILHA e não do texto da resposta, e essa distinção é o
       * núcleo do produto: "consultei a agenda e marquei quinta às 15h" e "inventei quinta
       * às 15h" são indistinguíveis na prosa. A ferramenta ter rodado é a única prova. */
      if (trilha.some((p) => p.ferramenta === "agendar" && !p.erro)) setMarcou(true);
      /* O cancelar vem DEPOIS do agendar de propósito: num turno em que a MAISA remarque
       * (cancela o antigo e marca o novo), a ordem das duas linhas decide o que a tela diz.
       * "Cancelou por último" só é verdade quando não marcou nada — e aí a checagem acima
       * não acendeu. Invertê-las apagaria o aviso de um horário que existe. */
      if (trilha.some((p) => p.ferramenta === "cancelar" && !p.erro)
          && !trilha.some((p) => p.ferramenta === "agendar" && !p.erro)) setMarcou(false);

      if (d.escalou) {
        setFalas((f) => [
          ...f,
          { de: "aviso", txt: `Ela passou a conversa para você — ${d.motivo ?? "sem motivo informado"}. No WhatsApp de verdade, é isso que acontece quando ela não tem certeza: ela para e te chama, em vez de inventar.` },
        ]);
      }
    } catch {
      setFalas((f) => [...f, { de: "aviso", txt: "Sem conexão com o servidor." }]);
    } finally {
      setOcupada(false);
    }
  }, [numero, ocupada]);

  if (semChave) {
    return (
      <Falta
        icone="alert"
        titulo="A MAISA não está respondendo agora"
        texto="O que você preencheu está salvo. Tente de novo daqui a pouco."
        acao={null}
        aoPainel={aoPainel}
      />
    );
  }

  const chips = sugestoes(exemplo, { comecou: falas.length > 0, marcou });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.55;margin:0")}>
        Você é o cliente agora. Mande a primeira mensagem e veja o que ele veria.
        {numero && <> A resposta dela também chega no seu WhatsApp, em <strong style={s("color:var(--ink)")}>+{numero}</strong>.</>}
      </p>

      <div style={s("display:flex;flex-direction:column;gap:10px;min-height:180px;max-height:300px;overflow-y:auto;padding:14px;border-radius:var(--r-painel);border:1px solid var(--border);background:var(--surface-2)")}>
        {falas.length === 0 && (
          <p style={s("margin:auto;max-width:30ch;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:1.55")}>
            Toque numa das frases abaixo: é o que um cliente seu escreveria.
          </p>
        )}
        {falas.map((f, i) => <BolhaSim key={i} fala={f} />)}
        {ocupada && (
          <span style={s("align-self:flex-start;font-size:var(--t-sm);color:var(--muted);padding:9px 13px;border-radius:var(--r-painel);border:1px solid var(--primary-soft);background:var(--surface)")}>
            digitando…
          </span>
        )}
        <div ref={fim} />
      </div>

      {/* A prova, em duas linhas, no lugar da trilha crua do `/laboratorio`. Aquela coluna
          de JSON é para quem depura o agente; para o dono, o que importa é que ela OLHOU a
          agenda antes de falar e que o horário existe de verdade. */}
      {(consultou || marcou) && (
        <div style={s("display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:var(--r-painel);background:var(--success-soft)")}>
          {consultou && (
            <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--success)")}>
              <Icon name="check" size={15} stroke="var(--success)" />
              Ela consultou sua agenda antes de responder.
            </span>
          )}
          {marcou && (
            <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--success)")}>
              <Icon name="calendar-check" size={15} stroke="var(--success)" />
              {/* ⚠️ A FRASE MUDA COM O AMBIENTE, e essa é a única razão de `agendaReal`
                  existir. Sem Google configurado no deploy, o horário foi para a agenda de
                  memória — ele some no próximo reinício e não está no celular de ninguém.
                  Dizer "está na sua agenda" ali seria a tela que existe para provar que o
                  produto funciona sendo o primeiro lugar onde ele mente. */}
              {ambiente.agendaReal
                ? "Marcado de verdade. Está na sua agenda agora. Para desmarcar, é só pedir a ela."
                : "Marcado. Neste ambiente a agenda é de demonstração, então o horário não sai daqui."}
            </span>
          )}
        </div>
      )}
      {/* O Google DEPOIS do valor, e como oferta (1B.15): é o que traz para cá o compromisso que
          nasceu fora. Só onde o deploy tem Google, e some para quem já ligou. */}
      {marcou && ambiente.agendaReal && <OfertaDoGoogle />}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => void enviar(c)}
            disabled={ocupada}
            className="m-hov-bg m-focus"
            style={s(`text-align:left;font-family:inherit;font-size:var(--t-label);color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:7px 13px;${ocupada ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
          >
            {c}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}
        style={{ display: "flex", gap: 9 }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ou escreva do seu jeito…"
          aria-label="Mensagem do cliente"
          className="m-focus"
          style={s(`${CAMPO};flex:1;min-width:0`)}
        />
        <button
          type="submit"
          disabled={ocupada || !texto.trim()}
          className="m-hov-primary m-press m-focus"
          style={s(`display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;flex-shrink:0;border-radius:var(--r-painel);border:none;background:var(--primary);${ocupada || !texto.trim() ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
        >
          <Icon name="send" size={18} stroke="var(--on-primary)" />
        </button>
      </form>

      {/* Até 12/11/2026 levava à etapa 5 (o documento fiscal). Agora esta etapa abre pelo painel
          e volta para ele: quando a MAISA ACABOU de marcar, direto para a Agenda, onde o horário
          que ela marcou está. */}
      <NoPe>
        {marcou
          ? <Botao onClick={() => { window.location.href = "/?tela=agenda"; }} full>Ver na agenda</Botao>
          : <Botao onClick={aoPainel} variante="ghost" full>Voltar ao painel</Botao>}
      </NoPe>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A COMEMORAÇÃO: o fim do wizard em tela cheia, no navy da marca (31/10/2026).
 *
 * Desde 13/11/2026 ela é a porta do WhatsApp: o botão principal leva direto à conexão, no painel, e
 * o segundo abre o painel antes. A frase diz o que está ligado de verdade (guarda G11): sem
 * WhatsApp, a maisa ainda não atende ninguém.
 *
 * ⚠️ O BOTÃO É `--primary`, NÃO ÂMBAR: âmbar não é ação (emenda 2 do `maisa-design`).
 * ───────────────────────────────────────────────────────────────────────────── */
function Comemoracao({ feitos }: { feitos: readonly PassoDeAtivacao[] }) {
  const conectado = feitos.includes("whatsapp_conectado");
  /* `location` e não `router.push`: o painel é outra árvore (com `StoreProvider`), e a navegação
     inteira garante que ele nasce lendo o `?tela=` e o `?secao=`. */
  const ir = (url: string) => { window.location.href = url; };
  const botao = "width:100%;max-width:320px;height:50px;border-radius:var(--r-controle);font-family:inherit;font-weight:var(--w-title);font-size:var(--t-body);cursor:pointer";

  return (
    <div className="m-altura-tela m-ob-festa" style={s("display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--nav);overflow-y:auto")}>
      <div style={s("width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;gap:26px;text-align:center")}>
        <span className="m-enter" style={{ ...s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line)" }}>maisa</span>
        {/* O anel, as duas ondas que saem dele e o check que se desenha (`.m-festa-*`, em `globals.css`). */}
        <span style={s("position:relative;width:96px;height:96px;flex-shrink:0")}>
          <span aria-hidden className="m-festa-onda" style={s("position:absolute;inset:0;border-radius:999px;border:2px solid var(--nav-soft)")} />
          <span aria-hidden className="m-festa-onda" style={s("position:absolute;inset:0;border-radius:999px;border:2px solid var(--nav-soft)")} />
          <span className="m-festa-anel" style={s("position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:999px;border:3px solid var(--nav-ink)")}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--nav-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline className="m-festa-check" pathLength={1} points="20 6 9 17 4 12" />
            </svg>
          </span>
        </span>
        <div className="m-festa-texto" style={s("width:100%;display:flex;flex-direction:column;align-items:center;gap:18px")}>
          <h1 style={s("margin:0;font-size:var(--t-data);line-height:1.15;font-weight:var(--w-emph);color:var(--nav-ink)")}>Sua conta está pronta</h1>
          <p style={s("margin:0;font-size:var(--t-body);line-height:1.5;color:var(--nav-soft)")}>
            {conectado ? "Seu WhatsApp já está conectado." : "Falta conectar o seu WhatsApp para a maisa começar a atender."}
          </p>
          {conectado ? (
            <button type="button" onClick={() => ir("/")} className="m-hov-primary m-press m-focus" style={s(`${botao};border:1px solid var(--nav-line);background:var(--primary);color:var(--on-primary)`)}>
              Abrir meu painel
            </button>
          ) : (
            <>
              <button type="button" onClick={() => ir(IR_AO_WHATSAPP)} className="m-hov-primary m-press m-focus" style={s(`${botao};border:1px solid var(--nav-line);background:var(--primary);color:var(--on-primary)`)}>
                Conectar o WhatsApp
              </button>
              <button type="button" onClick={() => ir("/")} className="m-press m-focus" style={s(`${botao};margin-top:-8px;border:1px solid var(--nav-line);background:transparent;color:var(--nav-ink)`)}>
                Ver o painel primeiro
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BolhaSim({ fala }: { fala: Fala }) {
  if (fala.de === "aviso") {
    /* `--warn` sobre `--warn-soft`, e não um `--warn-ink`: aquele token NÃO EXISTE
     * (`globals.css` tem `--warm-ink`, do âmbar, que é outra família). O L de `--warn` é
     * calibrado justamente para dar AA sobre o `-soft` da mesma cor — está escrito no
     * comentário da paleta semântica. */
    return (
      <span style={s("align-self:center;max-width:44ch;text-align:center;font-size:var(--t-label);line-height:1.5;color:var(--warn);background:var(--warn-soft);padding:8px 13px;border-radius:var(--r-controle)")}>
        {fala.txt}
      </span>
    );
  }
  /* Hierarquia INVERTIDA em relação ao painel, e de propósito: lá "você" é o dono e fica no
     fill à direita. Aqui quem digita é o CLIENTE, no celular dele — então o fill é dele, e a
     MAISA é branco com contorno. Mesma regra do design system, sujeito diferente. */
  const meu = fala.de === "cliente";
  return (
    <span
      style={s(
        `max-width:82%;align-self:${meu ? "flex-end" : "flex-start"};padding:9px 13px;font-size:var(--t-sm);line-height:1.5;white-space:pre-wrap;` +
        `border-top-left-radius:16px;border-top-right-radius:16px;` +
        `border-bottom-right-radius:${meu ? "5px" : "16px"};border-bottom-left-radius:${meu ? "16px" : "5px"};` +
        (meu
          ? "background:var(--primary);border:1px solid var(--primary);color:var(--on-primary)"
          : "background:var(--surface);border:1px solid var(--primary-soft);color:var(--ink)"),
      )}
    >
      {fala.txt}
    </span>
  );
}


/* ★ DESDE 12/11/2026 ESTA ETAPA SÓ ABRE PELO PAINEL (`?etapa=ver`, cartão "Ver funcionando" da
 * jornada). Fora do caminho do wizard, ela não tem etapa seguinte: terminar é voltar ao painel. */
function EtapaVerFuncionando({ feitos }: { feitos: PassoDeAtivacao[] }) {
  const router = useRouter();
  const [numero, setNumero] = useState<string | null>(null);
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null);
  const aoPainel = useCallback(() => { router.push("/"); router.refresh(); }, [router]);

  useEffect(() => {
    let vivo = true;

    /* O número pareado é o destinatário da resposta — ver o `de` do POST em `Conversa`.
     * Falha em silêncio: sem ele a conversa acontece igual, só não chega no celular. */
    fetch("/api/canal")
      .then((r) => r.json())
      .then((r) => { if (vivo && r?.ok && r.canal?.status === "conectado") setNumero(r.canal.numero ?? null); })
      .catch(() => {});

    fetch("/api/laboratorio")
      .then((r) => r.json())
      .then((r) => {
        if (!vivo) return;
        setAmbiente({
          pronto: !!r?.pronto,
          /* A string vem da rota, que a monta de `isGoogleConfigured`. Comparar por igualdade
           * e não por `includes` porque o outro valor possível é "demonstração (em memória)",
           * e um `includes("google")` casaria com uma frase futura que dissesse "sem google". */
          agendaReal: r?.agenda === "google",
          exemplo: r?.exemplo ?? { servico: null, profissional: null },
        });
      })
      /* Não saber o ambiente não pode travar a etapa: assume o caso de produção (agenda de
       * verdade), que é o mais restritivo — pede o que precisa ser pedido em vez de deixar
       * passar. Errar para o lado de cobrar uma conexão a mais é recuperável; errar para o
       * lado de deixar conversar sem agenda é a demonstração fracassando na frente da
       * pessoa. */
      .catch(() => vivo && setAmbiente({ pronto: true, agendaReal: true, exemplo: { servico: null, profissional: null } }));

    return () => { vivo = false; };
  }, []);

  if (!feitos.includes("whatsapp_conectado")) {
    return (
      <Falta
        icone="whatsapp"
        titulo="Falta o WhatsApp"
        texto="É por ele que a MAISA atende — e é nele que a resposta dela vai chegar quando você testar. Leva um minuto."
        acao={<Botao onClick={() => { window.location.href = IR_AO_WHATSAPP; }} full>Conectar o WhatsApp</Botao>}
        aoPainel={aoPainel}
      />
    );
  }

  if (!ambiente) {
    return <div style={{ minHeight: 200 }} aria-busy="true" />;
  }

  /* ⚠️ SEM PORTÃO DO GOOGLE (25/09/2026, 1B.15, 09 P0-2). Aqui havia "Falta sua agenda. Sem isso
   * ela conversa, mas não consegue marcar nada", que deixou de ser verdade no ADR-0009 (04/09): a
   * MAISA oferece horário da tabela `atendimentos`, e o calendário externo só soma. O portão
   * prendia a pessoa num consent de projeto OAuth não verificado, e quem não ligava nunca via a
   * etapa 5. A conversa abre direto; o Google vira uma oferta depois da primeira marcação
   * (`OfertaDoGoogle`, dentro da `Conversa`). */
  return <Conversa ambiente={ambiente} numero={numero} aoPainel={aoPainel} />;
}

/* ───────────────────────────── o wizard ───────────────────────────── */

export default function Comecar() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<EtapaId | null>(null);
  const [fim, setFim] = useState(false);
  /** O pé da moldura, onde `NoPe` desenha o botão da etapa. Estado (e não `ref`) para a etapa
   *  repintar no pé assim que ele montar. */
  const [pe, setPe] = useState<HTMLDivElement | null>(null);
  const [feitos, setFeitos] = useState<PassoDeAtivacao[]>([]);
  const [r, setR] = useState<Rascunho>(rascunhoVazio);
  const mudar = useCallback((m: Mudanca) => setR((x) => ({ ...x, ...(typeof m === "function" ? m(x) : m) })), []);

  /**
   * Quem volta no meio (F5, fechou e reabriu) recebe de volta o que já respondeu: o nome do
   * negócio e de quem atende, os serviços (só se a pessoa já mexeu neles; os semeados não são
   * dela) e o expediente.
   */
  const recarregar = useCallback(async (ajustouServicos: boolean) => {
    const c = await fetch("/api/cadastro").then((x) => x.json()).catch(() => null);
    if (!c?.ok) return;
    const prof = (c.profissionais ?? [])[0];
    const folga: number[] = prof?.expediente?.folga ?? [];
    const servicos: LinhaDeServico[] = ajustouServicos
      ? ((c.servicos ?? []) as Servico[]).filter((sv) => sv.ativo).map((sv) =>
        novaLinha({ id: sv.id, nome: sv.nome, duracao: sv.duracao, preco: String(sv.preco).replace(".", ","), categoria: sv.categoria }))
      : [];
    mudar({
      negocio: c.negocio?.nome ?? "",
      nome: prof?.nome ?? "",
      profissionalId: prof?.id ?? null,
      ...(servicos.length ? { servicos } : {}),
      ...(prof?.expediente ? { dias: [0, 1, 2, 3, 4, 5].filter((d) => !folga.includes(d)), de: prof.expediente.de, ate: prof.expediente.ate } : {}),
    });
  }, [mudar]);

  /**
   * Onde retomar, perguntado ao MUNDO e não a uma flag.
   *
   * 409 `sem_negocio` é a etapa 1. Com negócio: os serviços, se ainda são os semeados; senão, o
   * horário. `?etapa=ver` (o cartão "Ver funcionando" da jornada) e `?google=` (a volta do consent
   * que a própria conversa oferece) abrem o "ver": sinais de navegação, nada guardado.
   */
  useEffect(() => {
    let vivo = true;
    const busca = new URLSearchParams(window.location.search);
    const google = busca.get("google");
    /* O `motivo` VAI PARA A TELA: ele é a única informação útil que o servidor mandou. */
    if (google === "erro") {
      const motivo = busca.get("motivo");
      toast(`Não consegui ligar sua agenda${motivo ? `: ${motivo.replace(/_/g, " ")}` : ""}.`);
    }

    fetch("/api/ativacao").then(async (x) => ({ status: x.status, corpo: await x.json().catch(() => null) }))
      .then(async ({ status, corpo }) => {
        if (!vivo) return;
        if (status === 409) { setEtapa("negocio"); return; }
        if (status === 401) { router.push("/login?next=%2Fcomecar"); return; }
        const f: PassoDeAtivacao[] = corpo?.feitos ?? [];
        const v: readonly PassoDeAtivacao[] = Array.isArray(corpo?.passos) ? corpo.passos : PASSOS_DE_ATIVACAO;
        setFeitos(f);
        if ((google || busca.get("etapa") === "ver") && v.includes("primeira_conversa")) { setEtapa("ver"); return; }
        const ajustou = f.includes("catalogo_ajustado");
        await recarregar(ajustou);
        if (vivo) setEtapa(ajustou ? "horario" : "servicos");
      })
      .catch(() => vivo && setEtapa("negocio"));
    return () => { vivo = false; };
  }, [router, recarregar]);

  /** Relê o progresso: é o que faz a comemoração saber se o WhatsApp já estava conectado. */
  const lerFeitos = useCallback(() => {
    fetch("/api/ativacao").then((x) => x.json()).then((x) => { if (x?.feitos) setFeitos(x.feitos); }).catch(() => {});
  }, []);

  /* Sair da conta, e não do wizard: quem está aqui ainda não tem para onde ir no painel. */
  const sair = async () => {
    if (isSupabaseConfigured) await createClient().auth.signOut().catch(() => {});
    window.location.replace("/login");
  };

  if (etapa === null) return <div className="m-altura-tela" />;
  if (fim) return <Comemoracao feitos={feitos} />;

  if (etapa === "ver") {
    return (
      <>
        <Toaster />
        <MolduraDeEntrada etapas={[{ id: "ver", rotulo: "Testar" }]} atual="ver" chave="ver" aoSair={() => void sair()} largura={520} refDoPe={setPe}>
          <TituloDaEntrada>Fale com a maisa como se fosse seu cliente</TituloDaEntrada>
          <PeDoWizard.Provider value={pe}>
            <EtapaVerFuncionando feitos={feitos} />
          </PeDoWizard.Provider>
        </MolduraDeEntrada>
      </>
    );
  }

  const passo = PERGUNTAS.findIndex((p) => p.id === etapa);
  const falas = [
    falaDoNegocio(r.negocio, r.nome),
    falaDosServicos(r.servicos.map((l) => ({ nome: l.nome, duracao: l.duracao, preco: precoDigitado(l.preco) }))),
    falaDoHorario(r.nome, r.dias, r.de, r.ate),
  ];
  const trocas: Troca[] = falas.slice(0, passo + 1).map((maisa, i) => ({ cliente: PERGUNTAS_DO_CLIENTE[i], maisa }));

  return (
    <>
      <Toaster />
      <MolduraDaConversa
        passo={passo} total={PERGUNTAS.length} chave={etapa} refDoPe={setPe}
        aoVoltar={etapa === "horario" ? () => setEtapa("servicos") : undefined}
        aoSair={() => void sair()} negocio={r.negocio} trocas={trocas}
      >
        <PeDoWizard.Provider value={pe}>
          {etapa === "negocio" && (
            <EtapaNegocio r={r} mudar={mudar} aoCriar={() => { lerFeitos(); setEtapa("servicos"); }} />
          )}
          {etapa === "servicos" && <EtapaServicos r={r} mudar={mudar} aoSeguir={() => setEtapa("horario")} />}
          {etapa === "horario" && <EtapaHorario r={r} mudar={mudar} aoTerminar={() => { lerFeitos(); setFim(true); }} />}
        </PeDoWizard.Provider>
      </MolduraDaConversa>
    </>
  );
}
