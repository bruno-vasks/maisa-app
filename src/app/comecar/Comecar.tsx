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
 * A agenda do Google é a EXCEÇÃO, e ela prova a regra: não existe etapa para ela, mas a
 * etapa 4 a pede quando ela falta — porque sem agenda a MAISA não marca, e a etapa 4 é
 * justamente a de ver marcando. Configuração pedida no instante em que o valor dela
 * aparece na tela não é burocracia; pedida antes, é.
 *
 * ── ★ A TRILHA TEM DOIS TAMANHOS, DESDE 04/09/2026 ──
 *
 * A etapa 1 pergunta **como** a MAISA vai trabalhar (ver `MODOS`), e quem responde "minha
 * agenda é fixa" não passa pela etapa 4. Não é atalho de conveniência: sem agente não há
 * conversa a demonstrar, e a etapa 4 é a única que exige o Google. Mantê-la faria um
 * consultório de agenda fixa parar num pedido de agenda para ver funcionando um agente que
 * ele acabou de desligar — com "Abrir meu painel" como única saída, que é abandono com
 * outro nome.
 *
 * ── ★ E UM TERCEIRO TAMANHO, DESDE 24/09/2026 ──
 *
 * Quem assinou só para emitir recibo não passa nem pelo WhatsApp: a trilha vira negócio →
 * catálogo → recibo. Conectar um número para nada é o tipo de passo que mata onboarding. A
 * trilha é `passosQueValem` (`dominio/ativacao.ts`) — a MESMA conta que o cartão de jornada
 * do painel faz, então o painel não volta a cobrar o que o wizard pulou.
 *
 * ── ★ DESDE 12/11/2026, UM TAMANHO SÓ: NEGÓCIO → SERVIÇOS → DOCUMENTO FISCAL ──
 *
 * O WhatsApp saiu do wizard, e o "Ver funcionando" saiu do caminho. Os dois viraram passos da
 * jornada no painel (`JornadaDeAtivacao`): o WhatsApp se conecta nos ajustes da maisa
 * (`?tela=assistente&secao=whatsapp`), e a conversa de teste abre aqui só por `?etapa=ver`.
 *
 * O motivo é medido. Das 5 contas vindas da Meta entre 04 e 12/11, nenhuma conectou o WhatsApp
 * e nenhuma voltou depois do cadastro: três pararam na tela dele sem apertar o botão, duas
 * pediram o código e não conectaram. Uma delas (12/11) escreveu para a conta oficial "Onde
 * digitar o codigo". O Bruno decidiu o resto: o setup curto vale mais que mostrar tudo no
 * primeiro minuto, e o teste da conversa tem mais sentido dentro do app, quando a pessoa ajusta
 * a maisa. As seções acima, sobre as etapas 3 e 4, ficam como história do porquê de cada peça.
 *
 * ⚠️ SÓ A ETAPA 1 É OBRIGATÓRIA, porque é a única que CRIA alguma coisa. Todas as outras
 * têm "Pular" — e pular não é abandono: o passo continua contado em `/api/ativacao`, que
 * lê o mundo em vez de uma flag.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { s, Icon, toast, Toaster } from "@/ui/primitivos";
import type { PassoDeAtivacao, Servico, UsoDoWhatsApp, Vertical } from "@/nucleo/dominio";
import { PASSOS_DE_ATIVACAO, passosQueValem, usoDoWhatsApp } from "@/nucleo/dominio";
import { sugestoes, type ExemploDoNegocio } from "./sugestoes";
import { ajustesDosModos, alternarModo, type Modo } from "./modos";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { NOME_NEGOCIO_MIN } from "@/nucleo/dominio/negocio";
import { AcaoDiscreta, MolduraDeEntrada, TituloDaEntrada } from "@/ui/componentes/MolduraDeEntrada";
import { DESENHO_DO_ICONE, IconeVivo } from "./IconeVivo";
import { InterruptorVivo } from "./InterruptorVivo";

/* ───────────────────────────── as etapas ───────────────────────────── */

type EtapaId = "negocio" | "catalogo" | "ver" | "fiscal";

/* `rotulo` é o nome curto na barra de etapas da `MolduraDeEntrada`; `titulo`, a pergunta da tela.
 * Um título só, sem subtítulo (emenda 5 do `maisa-design`), desde 31/10/2026: o `sub` de cada
 * etapa saiu junto com a trilha de bolinhas. A etapa do negócio desenha os próprios títulos,
 * porque virou três telas. */
const ETAPAS: { id: EtapaId; rotulo: string; titulo: string }[] = [
  { id: "negocio", rotulo: "Negócio", titulo: "Seu negócio" },
  { id: "catalogo", rotulo: "Serviços", titulo: "Seus serviços e preços" },
  /* O WhatsApp saiu do wizard em 12/11/2026, e o "Ver funcionando" saiu do caminho: ele só abre
   * pelo cartão da jornada no painel (`?etapa=ver`). Ver o ★ de 12/11 no cabeçalho. */
  { id: "ver", rotulo: "Testar", titulo: "Fale com a maisa como se fosse seu cliente" },
  /* ★ ETAPA 5, e ela é uma PERGUNTA — não um formulário.
   *
   * A nota fiscal é o maior diferencial do produto, e ela é o único passo que depende de o
   * cliente trazer algo de fora (o certificado digital). As duas coisas juntas fazem dela o
   * pior candidato a etapa obrigatória: quem não tem o certificado à mão empaca no último
   * metro do onboarding, com a MAISA já funcionando.
   *
   * Então a etapa pergunta "agora ou depois", e "depois" é uma resposta de primeira classe:
   * o cartão da jornada continua cobrando no painel, sem pressa. O que não podia acontecer é
   * o dono terminar o onboarding sem SABER que isto existe. */
  /* "Nota fiscal" sozinho mentia para metade do ICP: quem atende como pessoa física emite
   * RECIBO (Receita Saúde), não nota — e o certificado digital, que a frase antiga prometia
   * implicitamente, não existe nesse caminho. */
  { id: "fiscal", rotulo: "Nota", titulo: "Nota fiscal ou recibo?" },
];

const VERTICAIS: { id: Vertical; rotulo: string; desc: string; icone: string }[] = [
  { id: "barbeiros", rotulo: "Barbearia ou salão", desc: "Corte, barba, pacotes", icone: "scissors" },
  { id: "terapeutas", rotulo: "Consultório ou clínica", desc: "Sessões, retornos, pacotes", icone: "stethoscope" },
  { id: "generico", rotulo: "Outro tipo", desc: "Começa com um catálogo neutro", icone: "negocio" },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ COMO ELA VAI SER USADA — a pergunta que a vertical NÃO responde.
 *
 * A vertical diz que negócio é; esta diz o que a MAISA faz nele. São coisas
 * diferentes, e tratá-las como uma só erra nos dois sentidos: existe barbearia com
 * agenda fechada e existe consultório que quer a MAISA marcando. Por isso duas
 * perguntas, e não um `if (vertical === "terapeutas")`.
 *
 * ⚠️ A ESCOLHA TEM CONSEQUÊNCIA IMEDIATA, e é ela que justifica perguntar aqui em vez de
 * enterrar num ajuste do painel: quem não marca `conversa` NÃO passa pela etapa "Ver
 * funcionando", que é a única que exige a agenda do Google. Sem isto, um consultório de
 * agenda fixa empaca numa etapa que existe para demonstrar um agente que ele desligou.
 *
 * Os modos se somam desde 21/10/2026. O que cada um grava está em `./modos.ts`.
 * ────────────────────────────────────────────────────────────────────────────── */


const MODOS: { id: Modo; rotulo: string; desc: string; icone: string }[] = [
  {
    id: "conversa",
    rotulo: "Ela conversa e marca sozinha",
    desc: "Responde seus clientes no WhatsApp, consulta a agenda e agenda o horário",
    icone: "chat",
  },
  {
    /* Até 21/10/2026 o rótulo era "Minha agenda é fixa" e a descrição dizia "ela não
     * responde ninguém". Fazia sentido com escolha única; marcando junto com "ela conversa",
     * as duas frases se contradiziam. Agora cada cartão diz só o que ele LIGA. */
    id: "avisos",
    rotulo: "Ela manda lembretes",
    desc: "Lembra o cliente da sessão e avisa quando o recibo sai",
    icone: "bell",
  },
  {
    /* ★ 24/09/2026. Quem só quer o documento fiscal não precisa de WhatsApp nenhum, e
     * obrigar a conectar um número é o maior gargalo do wizard para essa pessoa. Este cartão
     * não grava nada: a emissão vale para todo negócio. Marcado SOZINHO, ele é o que tira o
     * WhatsApp da trilha, porque os outros dois ficam desligados. */
    id: "recibos",
    rotulo: "Ela emite recibo ou nota",
    desc: "O documento de cada atendimento. Sozinho, não precisa de WhatsApp",
    icone: "receipt",
  },
];

/**
 * A ordem dos cartões por vertical. Consultório vê primeiro o que não fala com ninguém: é
 * uma pessoa só, no celular pessoal, e muitas assinam só pelo recibo — e é a vertical que
 * nasce com a MAISA desligada (`atendeNoWhatsAppPorPadrao`). A escolha continua sendo dela.
 */
const modosPara = (v: Vertical | null) => {
  const ordem: Modo[] = v === "terapeutas" ? ["recibos", "avisos", "conversa"] : ["conversa", "avisos", "recibos"];
  return ordem.map((id) => MODOS.find((m) => m.id === id)!);
};

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

/* ───────────────────────────── etapa 1 · o negócio ───────────────────────────── */

/**
 * Grava os modos e devolve o uso do WhatsApp que FICOU no servidor — lido da resposta, não
 * suposto da escolha. `undefined` quando o PATCH não passa: valem todos os passos, o lado
 * que mostra uma etapa a mais em vez de esconder uma.
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

/** Um cartão de escolha — o mesmo desenho para a vertical (uma só, `radio`) e para os modos
 *  (vários, `checkbox`). O papel é o que o leitor de tela anuncia: sem ele, os dois grupos
 *  soavam iguais e ninguém sabia que os modos se somam. */
function Escolha({
  on, icone, rotulo, desc, onClick, papel, indice = 0,
}: { on: boolean; icone: string; rotulo: string; desc: string; onClick: () => void; papel: "radio" | "checkbox"; indice?: number }) {
  /* Cada hover e cada toque fazem o ícone tocar de novo (`IconeVivo`): marcar "lembretes" faz o
     sino tocar. */
  const [toque, setToque] = useState(0);
  return (
    <button
      type="button" role={papel} aria-checked={on}
      onClick={() => { setToque((t) => t + 1); onClick(); }} onMouseEnter={() => setToque((t) => t + 1)}
      className="m-cartao-anima m-focus"
      style={s(`display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:var(--r-painel);cursor:pointer;text-align:left;font-family:inherit;border:1.5px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"}`)}
    >
      <IconeVivo desenho={DESENHO_DO_ICONE[icone] ?? "conversa"} tamanho={24} cor={on ? "var(--primary-dark)" : "var(--muted)"} toque={toque} atraso={520 + indice * 160} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{rotulo}</span>
        <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;line-height:1.4")}>{desc}</span>
      </span>
      {on && <span className="m-pop"><Icon name="check" size={18} stroke="var(--primary-dark)" /></span>}
    </button>
  );
}

/** O cartão grande do tipo de negócio: ícone solto em cima (sem quadrado, emenda 3 do DS), o nome
 *  e o exemplo. Um clique escolhe e já passa para a próxima tela, como no cadastro da Wise. */
function CartaoDeTipo({
  on, icone, rotulo, desc, onClick, indice,
}: { on: boolean; icone: string; rotulo: string; desc: string; onClick: () => void; indice: number }) {
  const [toque, setToque] = useState(0);
  return (
    <button
      type="button" role="radio" aria-checked={on}
      onClick={onClick} onMouseEnter={() => setToque((t) => t + 1)}
      className="m-cartao-tipo m-cartao-anima m-hov-bg m-focus"
      style={s(`border-radius:var(--r-painel);cursor:pointer;font-family:inherit;border:1.5px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"}`)}
    >
      <IconeVivo desenho={DESENHO_DO_ICONE[icone] ?? "loja"} tamanho={34} cor={on ? "var(--primary-dark)" : "var(--primary)"} toque={toque} atraso={460 + indice * 180} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>{rotulo}</span>
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.4")}>{desc}</span>
      </span>
    </button>
  );
}

const CAMPO_DO_NOME: Record<Vertical, string> = {
  barbeiros: "Escreva o nome da barbearia…",
  terapeutas: "Escreva o nome da clínica ou o seu…",
  generico: "Escreva o nome do seu negócio…",
};

/* ─────────────────────────────────────────────────────────────────────────────
 * ★ A ETAPA 1 EM TRÊS TELAS (31/10/2026).
 *
 * Era um formulário só: nome, tipo e modos, com três rótulos de seção e um "Criar meu negócio"
 * no pé. Virou uma pergunta por tela (o tipo, o nome, o que a maisa faz), com a Wise de
 * referência. O negócio continua nascendo UMA vez, no fim da terceira: as duas primeiras só
 * guardam a resposta no estado, e "Voltar" não perde nada.
 *
 * ★ "SEU NOME" SAIU DO CATÁLOGO E VEIO PARA CÁ. O nome de quem atende ia como "Quem atende" na
 * etapa 2, adivinhado pelo começo do e-mail (`005_provisionar.sql`), e quase sempre chegava
 * errado. Agora ele vai no `POST /api/negocio` como `profissional`, igual ao `/assinar`, e o
 * primeiro profissional já nasce com o nome certo. Ver o ⚠️ de 30/09/2026 no `Assinar.tsx`.
 * ───────────────────────────────────────────────────────────────────────────── */

type PassoDoNegocio = "tipo" | "nome" | "modos";

function EtapaNegocio({ aoCriar }: { aoCriar: (uso: UsoDoWhatsApp | undefined) => void }) {
  const [passo, setPasso] = useState<PassoDoNegocio>("tipo");
  const [nome, setNome] = useState("");
  const [profissional, setProfissional] = useState("");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [modos, setModos] = useState<Modo[]>([]);
  const [recado, setRecado] = useState<Recado>(null);
  const [ocupado, setOcupado] = useState(false);

  /* O nome de quem atende, quando a conta já traz um (o `full_name` do Google). Só sugere: o
   * campo continua editável, e vazio ele não passa. */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let vivo = true;
    createClient().auth.getUser()
      .then(({ data }) => {
        const n = data.user?.user_metadata?.full_name;
        if (vivo && typeof n === "string" && n.trim()) setProfissional((atual) => atual || n.trim());
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const irParaModos = useCallback(() => {
    if (nome.trim().length < NOME_NEGOCIO_MIN) { setRecado(falhou("Escreva o nome do seu negócio.")); return; }
    if (profissional.trim().length < 2) { setRecado(falhou("Escreva o seu nome.")); return; }
    setRecado(null);
    setPasso("modos");
  }, [nome, profissional]);

  const criar = useCallback(async () => {
    if (!vertical) { setPasso("tipo"); return; }
    if (!modos.length) { setRecado(falhou("Marque pelo menos uma coisa que a maisa vai fazer.")); return; }
    setRecado(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/negocio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, vertical, profissional: profissional.trim() }),
      }).then((x) => x.json());

      if (!r?.ok) {
        /* A frase do SERVIDOR: "O nome precisa ter pelo menos uma letra ou número" é o
         * que diz o que corrigir. O caso de uso `provisionar.ts` tem uma para cada
         * recusa, inclusive o teto de negócios por conta. */
        setRecado(falhou(r?.info ?? "Não foi possível criar seu negócio."));
        setOcupado(false);
        return;
      }

      /* ⚠️ O AJUSTE FALHA PARA A FRENTE, e é decisão, não descuido: o negócio JÁ EXISTE
       * quando esta linha roda. Barrar aqui deixaria a pessoa presa numa etapa que só sabe
       * criar — e a segunda tentativa bateria em "você já tem um negócio". Então o wizard
       * segue com a trilha completa e diz o que não pegou; os mesmos toggles estão na tela
       * "A MAISA", que é onde ela conserta em dois cliques. */
      const uso = await aplicarModos(modos);
      if (!uso) {
        toast("Criei seu negócio, mas não consegui gravar como a maisa vai trabalhar. Ajuste em “A MAISA”.");
      }
      aoCriar(uso);
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [nome, profissional, vertical, modos, aoCriar]);

  if (passo === "tipo") {
    return (
      <div key={passo} className="m-cascata" style={{ display: "contents" }}>
        <TituloDaEntrada>Que tipo de negócio é o seu?</TituloDaEntrada>
        {/* Três lado a lado no computador e empilhados no celular (`.m-tipos`, em `globals.css`):
            em 390px o grade fazia 2 + 1, com "Outro tipo" sozinho embaixo. */}
        <div role="radiogroup" aria-label="Tipo de negócio" className="m-tipos">
          {VERTICAIS.map((v, i) => (
            <CartaoDeTipo
              key={v.id} indice={i} on={vertical === v.id} icone={v.icone} rotulo={v.rotulo} desc={v.desc}
              onClick={() => { setVertical(v.id); setRecado(null); setPasso("nome"); }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (passo === "nome") {
    return (
      <div key={passo} className="m-cascata" style={{ display: "contents" }}>
        <TituloDaEntrada>Como o seu negócio se chama?</TituloDaEntrada>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>Nome do negócio</span>
          <input
            autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder={CAMPO_DO_NOME[vertical ?? "generico"]} className="m-focus" style={s(CAMPO)}
            onKeyDown={(e) => { if (e.key === "Enter") irParaModos(); }}
          />
          {/* Diz a CONSEQUÊNCIA, não a regra. Este campo entra no prompt do agente a cada
              mensagem e no texto de todo lembrete — foi assim que um negócio de teste passou
              três dias se apresentando como "bruno.vaskevicius" no WhatsApp dos clientes. */}
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
            É como a MAISA vai se apresentar: “Aqui é a MAISA, assistente do {nome.trim() || "…"}”.
          </span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>Seu nome</span>
          <input
            value={profissional} onChange={(e) => setProfissional(e.target.value)}
            placeholder="Escreva como seus clientes te chamam…" className="m-focus" style={s(CAMPO)}
            onKeyDown={(e) => { if (e.key === "Enter") irParaModos(); }}
          />
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
            A maisa fala esse nome ao confirmar um horário.
          </span>
        </label>
        <NoPe>
          <Aviso recado={recado} />
          <Botao onClick={irParaModos} full>Continuar</Botao>
          <AcaoDiscreta onClick={() => { setRecado(null); setPasso("tipo"); }}>Voltar</AcaoDiscreta>
        </NoPe>
      </div>
    );
  }

  return (
    <div key={passo} className="m-cascata" style={{ display: "contents" }}>
      <TituloDaEntrada>O que a maisa vai fazer por você?</TituloDaEntrada>
      <div role="group" aria-label="O que a maisa vai fazer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {modosPara(vertical).map((m, i) => (
          <Escolha
            key={m.id} indice={i} on={modos.includes(m.id)} icone={m.icone} rotulo={m.rotulo} desc={m.desc} papel="checkbox"
            onClick={() => { setModos((atual) => alternarModo(atual, m.id)); setRecado(null); }}
          />
        ))}
      </div>
      {/* Diz que dá para mudar depois: a escolha tem consequência grande (ela fala ou não fala
          com seus clientes) e ninguém decide bem uma coisa dessas achando que é definitiva. */}
      <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
        Marque quantas quiser. Dá para trocar depois, na tela “A MAISA”.
      </span>
      <NoPe>
        <Aviso recado={recado} />
        <Botao onClick={() => void criar()} ocupado={ocupado} full>Criar meu negócio</Botao>
        <AcaoDiscreta onClick={() => { setRecado(null); setPasso("nome"); }} desligada={ocupado}>Voltar</AcaoDiscreta>
      </NoPe>
    </div>
  );
}

/* ───────────────────────────── etapa 2 · o catálogo ───────────────────────────── */

/** Uma linha do catálogo, do jeito mais curto (31/10/2026): ligar ou desligar, o nome e o preço.
 *  Duração, tipo e o próprio nome ficam na tela Serviços do painel. Aqui o dono só confere o que a
 *  maisa vai oferecer, e cada campo a mais era uma pergunta a mais no primeiro minuto de uso
 *  (Bruno: "deixar realmente bem simples essa parte, para não confundir ninguém"). */
function LinhaServico({ sv, aoMudar, primeira }: { sv: Servico; aoMudar: (p: Partial<Servico>) => void; primeira: boolean }) {
  return (
    <div style={s(`display:flex;align-items:center;gap:10px;padding:4px 12px 4px 6px;${primeira ? "" : "border-top:1px solid var(--line);"}`)}>
      <InterruptorVivo on={sv.ativo} onChange={(v) => aoMudar({ ativo: v })} rotulo={`Oferecer ${sv.nome}`} />
      <span style={s(`flex:1;min-width:0;font-size:var(--t-body);color:${sv.ativo ? "var(--ink)" : "var(--muted)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color var(--dur-slow) var(--ease-out)`)}>
        {sv.nome}
      </span>
      <span style={s(`display:flex;align-items:center;gap:6px;flex-shrink:0;opacity:${sv.ativo ? "1" : ".5"};transition:opacity var(--dur-slow) var(--ease-out)`)}>
        <span aria-hidden style={s("font-size:var(--t-sm);color:var(--muted)")}>R$</span>
        {/* `type="text"` e `inputMode="decimal"`: o `type="number"` do Chrome recusa a
            vírgula no teclado brasileiro, e o caso de uso já aceita "59,90". */}
        <input
          type="text" inputMode="decimal" value={String(sv.preco)} disabled={!sv.ativo}
          aria-label={`Preço de ${sv.nome}, em reais`}
          onChange={(e) => aoMudar({ preco: e.target.value as unknown as number })}
          className="m-focus n"
          style={s("width:88px;height:40px;padding:0 10px;border-radius:var(--r-controle);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-body);color:var(--ink);outline:none;text-align:right")}
        />
      </span>
    </div>
  );
}

/** Duas linhas de catálogo são iguais nos campos que esta etapa escreve? */
const mesmoServico = (a: Servico, b: Servico) =>
  String(a.nome) === String(b.nome)
  && a.categoria === b.categoria
  && String(a.preco) === String(b.preco)
  && String(a.duracao) === String(b.duracao)
  && a.ativo === b.ativo;

function EtapaCatalogo({ aoSeguir }: { aoSeguir: () => void }) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  /* O catálogo como ele CHEGOU. Sem esta cópia não dá para saber o que mudou — e sem
   * saber o que mudou, "Salvar e continuar" grava as cinco linhas mesmo quando o dono não
   * tocou em nada. Medido numa caminhada real em produção em 15/08/2026: as cinco voltaram
   * do banco com `atualizado_em` mexido, e o passo `catalogo_ajustado` acendeu para quem
   * só tinha clicado em continuar. Um checklist que se marca sozinho não é checklist. */
  const original = useRef<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<Recado>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cadastro")
      .then((r) => r.json())
      .then((r) => {
        if (!vivo) return;
        if (r?.ok) {
          setServicos(r.servicos ?? []);
          original.current = r.servicos ?? [];
        }
      })
      .catch(() => {})
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, []);

  const mudar = useCallback((id: string, p: Partial<Servico>) => {
    setServicos((atual) => atual.map((sv) => (sv.id === id ? { ...sv, ...p } : sv)));
  }, []);

  /**
   * Grava tudo de uma vez, no botão.
   *
   * ⚠️ SEM DEBOUNCE POR TECLA, ao contrário da tela de Serviços do painel. Aqui o dono
   * está revisando cinco linhas de uma vez, e um PUT por tecla mandaria dezenas de
   * pedidos — cada um com chance própria de recusar um estado INTERMEDIÁRIO ("R$ 6"
   * enquanto se digita "R$ 60"). Um botão explícito é o certo quando a edição é em lote.
   *
   * Sequencial e não `Promise.all`: se a terceira linha for recusada, as duas primeiras
   * já estão salvas e a frase aponta a que falhou. Em paralelo, o dono veria um erro sem
   * saber de qual linha ele é.
   *
   * ⚠️ SÓ MANDA O QUE MUDOU. Gravar as cinco linhas sempre parece inofensivo e não é: o
   * `atualizado_em` de todas se move, e `catalogo_ajustado` — que é derivado exatamente
   * dessa comparação — acende para quem só clicou em continuar. O checklist passaria a se
   * marcar sozinho, que é o defeito que a derivação existe para não ter.
   *
   * O nome de quem atende saiu daqui em 31/10/2026: ele nasce certo na etapa 1 ("Seu nome").
   */
  const salvar = useCallback(async () => {
    setOcupado(true);
    setRecado(null);
    try {
      const mudados = servicos.filter((sv) => {
        const antes = original.current.find((o) => o.id === sv.id);
        return !antes || !mesmoServico(antes, sv);
      });

      for (const sv of mudados) {
        const r = await fetch("/api/servicos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: sv.id, nome: sv.nome, categoria: sv.categoria,
            preco: sv.preco, duracao: sv.duracao, ativo: sv.ativo,
          }),
        }).then((x) => x.json());

        if (!r?.ok) {
          setRecado(falhou(`“${sv.nome}”: ${r?.info ?? "não foi possível salvar."}`));
          setOcupado(false);
          return;
        }
      }

      aoSeguir();
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [servicos, aoSeguir]);

  if (carregando) {
    return <div style={s("padding:40px 0;text-align:center;color:var(--muted);font-size:var(--t-sm)")}>Carregando seus serviços…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={s("border:1px solid var(--border);border-radius:var(--r-painel);background:var(--surface)")}>
        {servicos.map((sv, i) => (
          <LinhaServico key={sv.id} sv={sv} primeira={i === 0} aoMudar={(p) => mudar(sv.id, p)} />
        ))}
      </div>
      <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
        Desligue o que você não faz. Duração e pacotes ficam no painel, em Serviços.
      </span>

      <NoPe>
        <Aviso recado={recado} />
        <Botao onClick={() => void salvar()} ocupado={ocupado} full>
          Salvar e continuar
        </Botao>
      </NoPe>
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

/* ────────────────────────── etapa 5 · nota fiscal ──────────────────────────
 *
 * ★ UMA PERGUNTA, E "DEPOIS" É RESPOSTA DE PRIMEIRA CLASSE.
 *
 * A nota fiscal é o maior diferencial do produto — e o único passo que depende de o cliente
 * trazer algo de fora: o certificado digital A1 do CNPJ. As duas coisas juntas fazem dela o
 * pior candidato possível a etapa obrigatória. Quem não tem o arquivo à mão empacaria no
 * último metro, com a MAISA já atendendo e marcando.
 *
 * Então esta etapa não é formulário: é uma escolha de duas. E ela existe porque o desfecho
 * ruim não era "o dono deixou para depois" — era **o dono terminar o onboarding sem saber que
 * isto existe**, e descobrir no mês seguinte, se descobrir.
 *
 * ── POR QUE ELA REUSA O `LigarNotaFiscal` DO PAINEL ──
 *
 * Porque é o MESMO fluxo, e a alternativa é manter dois. É a mesma decisão que a etapa 4 já
 * tomou ao mandar o cartão da jornada para `/comecar` em vez de duplicar o simulador: um
 * segundo lugar que pede CNPJ e sobe certificado seria um segundo lugar para consertar quando
 * a Focus mudar de campo.
 *
 * ── ⚠️ ELA SE APAGA QUANDO NÃO TEM O QUE OFERECER ──
 *
 * Sem `FOCUS_NFE_TOKEN` no ambiente, ligar a nota fiscal é impossível — e isso não é problema
 * do dono, é nosso. Cobrar dele um passo que só nós podemos destravar é a pior variante de
 * checklist que mente. Nesse caso a etapa vira só a despedida.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── ⚠️ A ETAPA 5 NAVEGA PARA O PAINEL, E NÃO MONTA O FLUXO FISCAL AQUI (25/09/2026, 1B.14) ──
 *
 * "Ligar agora" montava `<LigarNotaFiscal />`, que chama `useStore()`, e o wizard roda fora do
 * `StoreProvider` (decisão do cabeçalho): quem clicava via a página branca (09 P0-1). O fluxo
 * inteiro já mora no Documento fiscal, com a escolha e os dois caminhos; um segundo lugar seria
 * um segundo lugar para consertar. Então as duas escolhas abrem `/?tela=fiscal` com o recorte
 * `recibo` ou `nota`, que já deixa o formulário certo aberto (`SECOES.fiscal`). O guarda G13
 * reprova se o wizard voltar a alcançar componente do painel.
 *
 * E são três caminhos, não "ligar" e "depois" (09 P1-4): a psicóloga que atende como pessoa
 * física não emite nota nem tem certificado, e a promessa "Só o CNPJ… depois o certificado A1"
 * era para a metade errada do ICP. */
const IR_AO_FISCAL = (secao: "recibo" | "nota") => `/?tela=fiscal&secao=${secao}`;

/** Para onde a pessoa vai depois da comemoração: configurar o recibo, a nota, ou o painel. */
type Destino = "recibo" | "nota" | "painel";

function EtapaNotaFiscal({ aoEscolher }: { aoEscolher: (destino: Destino) => void }) {
  const [estado, setEstado] = useState<{ falta: string[]; ligado: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/fiscal", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        /* Falha de leitura não trava a última etapa: cai nas três escolhas, que funcionam. */
        if (!d?.ok) { setEstado({ falta: [], ligado: false }); return; }
        setEstado({
          falta: d.falta ?? [],
          /* Ligado = tem empresa no emissor OU tem CPF de prestador: alguém já decidiu. */
          ligado: d.config?.empresaId != null || d.config?.prestadorCpf != null,
        });
      })
      .catch(() => { if (vivo) setEstado({ falta: [], ligado: false }); });
    return () => { vivo = false; };
  }, []);

  if (!estado) return <div style={{ minHeight: 200 }} aria-busy="true" />;

  /* Já está tudo ligado: não há o que escolher, e o caminho segue para a comemoração. */
  if (estado.falta.length === 0 && estado.ligado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
        <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--success-soft)")}>
          <Icon name="check" size={27} stroke="var(--success)" />
        </div>
        <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>
          Seu documento fiscal já está ligado
        </p>
        <NoPe>
          <Botao onClick={() => aoEscolher("painel")} full>Continuar</Botao>
        </NoPe>
      </div>
    );
  }

  const opcao = "display:flex;align-items:center;gap:13px;width:100%;min-height:64px;padding:16px 15px;border-radius:var(--r-painel);border:1px solid var(--border);background:var(--surface);font-family:inherit;text-align:left;cursor:pointer;color:inherit";
  const caminhos: { rotulo: string; sub: string; destino: Destino }[] = [
    { rotulo: "Atendo como pessoa física", sub: "Recibo do Receita Saúde, no seu CPF. Sem certificado.", destino: "recibo" },
    { rotulo: "Tenho CNPJ", sub: "Nota fiscal de serviço. Pede o certificado digital A1.", destino: "nota" },
    {
      rotulo: "Decidir depois, na tela Fiscal",
      /* Dizia o que já funcionava ("Ela já atende e marca pelo WhatsApp"). Desde 12/11/2026
         ninguém chega aqui com o WhatsApp conectado (ele saiu do wizard), e a frase mentiria. */
      sub: "Fica esperando na tela Fiscal.",
      destino: "painel",
    },
  ];

  /* A frase "A MAISA emite o seu documento fiscal" que abria a etapa saiu em 31/10/2026: o
   * título já pergunta, e os três rótulos dizem os caminhos (emenda 5, um título só). Escolher
   * leva à comemoração, e o botão de lá é que abre o Fiscal na seção certa. */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {caminhos.map((c) => (
        <button key={c.rotulo} type="button" onClick={() => aoEscolher(c.destino)} className="m-cartao-anima m-hov-bg m-focus" style={s(opcao)}>
          {/* Sem ícone em quadrado (emenda 3 do DS): o rótulo diz o caminho. */}
          <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
            <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{c.rotulo}</span>
            <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>{c.sub}</span>
          </span>
          <span className="m-seta"><Icon name="chevron-right" size={18} stroke="var(--muted)" /></span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * A COMEMORAÇÃO — o fim do wizard em tela cheia (31/10/2026).
 *
 * Pedido do Bruno, com o "Email confirmed" da Wise de referência: o fim do onboarding ganha uma
 * tela só dele, no navy da marca.
 *
 * ⚠️ A FRASE DIZ O QUE ESTÁ LIGADO DE VERDADE, e não "a maisa está no ar". Quem pulou o WhatsApp
 * chega aqui com ela sem canal, e a promessa seria falsa: só o `StatusDaMaisa` afirma que ela está
 * atendendo (guarda G11). Por isso o título fala da conta, que existe, e a linha de baixo lê
 * `feitos` (o que aconteceu) e `valem` (o que esta conta usa).
 *
 * ⚠️ O BOTÃO É `--primary`, NÃO ÂMBAR: âmbar não é ação (emenda 2 do `maisa-design`). O âmbar
 * aqui é só a marca, sobre o navy, que é um dos dois empregos dele.
 * ───────────────────────────────────────────────────────────────────────────── */
function Comemoracao({ destino, feitos, valem, aoPainel }: {
  destino: Destino; feitos: readonly PassoDeAtivacao[]; valem: readonly PassoDeAtivacao[]; aoPainel: () => void;
}) {
  const usaWhatsApp = valem.includes("whatsapp_conectado");
  const conectado = feitos.includes("whatsapp_conectado");
  const frase = !usaWhatsApp
    ? "Seus recibos saem pelo painel, na tela Fiscal."
    : !conectado
      ? "Agora falta conectar o seu WhatsApp, no painel."
      : valem.includes("primeira_conversa")
        ? "A maisa já atende e marca pelo WhatsApp do seu negócio."
        : "Os lembretes já saem pelo WhatsApp do seu negócio.";
  const botao = destino === "recibo" ? "Configurar o recibo" : destino === "nota" ? "Configurar a nota fiscal" : "Abrir meu painel";
  /* `location` e não `router.push` para o Fiscal: o painel é outra árvore (com `StoreProvider`),
     e a navegação inteira garante que ele nasce lendo o `?tela=` e o `?secao=`. */
  const seguir = () => { if (destino === "painel") aoPainel(); else window.location.href = IR_AO_FISCAL(destino); };

  return (
    <div className="m-altura-tela" style={s("display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--nav);overflow-y:auto")}>
      <div style={s("width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;gap:26px;text-align:center")}>
        <span className="m-enter" style={{ ...s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line)" }}>maisa</span>
        {/* O anel, as duas ondas que saem dele e o check que se desenha (`.m-festa-*`, em
            `globals.css`). O check é um `polyline` próprio, e não o `Icon`, porque precisa do
            `pathLength` para o traço ser desenhado do começo ao fim. */}
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
          <p style={s("margin:0;font-size:var(--t-body);line-height:1.5;color:var(--nav-soft)")}>{frase}</p>
          <button
            type="button" onClick={seguir} className="m-hov-primary m-press m-focus"
            style={s("width:100%;max-width:320px;height:48px;border:1px solid var(--nav-line);border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-family:inherit;font-weight:var(--w-title);font-size:var(--t-body);cursor:pointer")}
          >
            {botao}
          </button>
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

/** A seção do WhatsApp nos ajustes da maisa, no painel. É onde se conecta desde 12/11/2026. */
const IR_AO_WHATSAPP = "/?tela=assistente&secao=whatsapp";

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
  /** A etapa 5 escolhida: com ela, a tela é a comemoração (`Comemoracao`). */
  const [fim, setFim] = useState<Destino | null>(null);
  /** O pé da moldura, onde `NoPe` desenha o primário da etapa. Estado (e não `ref`) para a etapa
   *  repintar no pé assim que ele montar. */
  const [pe, setPe] = useState<HTMLDivElement | null>(null);
  const [feitos, setFeitos] = useState<PassoDeAtivacao[]>([]);
  /**
   * Os passos que valem para este negócio — é o que decide se existe "Ver funcionando" (aberto
   * pelo painel) e o que a comemoração diz do WhatsApp. Ver `passosQueValem`.
   *
   * ⚠️ LIDO DO SERVIDOR NA RETOMADA (`/api/ativacao` devolve `passos`), e não guardado da
   * escolha da etapa 1. Quem volta do consent do Google, dá F5 ou fecha e reabre passa por
   * aqui sem ter respondido nada — e sem esta leitura o wizard mostraria de novo a etapa
   * que a pessoa desligou.
   *
   * Todos de partida: errar para "vale" mostra uma etapa a mais; errar para "não vale"
   * esconde a de quem a quer.
   */
  const [valem, setValem] = useState<readonly PassoDeAtivacao[]>(PASSOS_DE_ATIVACAO);

  /**
   * Onde retomar — perguntado ao MUNDO, não a uma flag.
   *
   * 409 `sem_negocio` significa etapa 1. Qualquer outra resposta significa que o inquilino
   * existe, e aí o passo cumprido decide: quem já ajustou os serviços não vê o catálogo de
   * novo. É o mesmo princípio de `dominio/ativacao.ts` — quem fez a coisa por outro caminho
   * não é obrigado a repetir.
   */
  useEffect(() => {
    let vivo = true;

    /**
     * ⚠️ O RETORNO DO CONSENT DO GOOGLE, e por que ele precisa de um sinal próprio.
     *
     * Ligar a agenda sai da etapa 4, atravessa o Google e volta para `/comecar` do zero — a
     * página remonta e a retomada roda de novo. Sem este `if`, quem tivesse PULADO o
     * WhatsApp voltaria do consent na etapa 3, um passo para trás, logo depois de ter feito
     * exatamente o que a etapa 4 pediu.
     *
     * `?google=` é acrescentado pelo `google/callback` e não por nós, então ele é prova de
     * navegação, não estado guardado: nada foi escrito em lugar nenhum, e um F5 depois ele
     * some sozinho. É o oposto de lembrar a etapa no `localStorage`, que é a flag que o
     * `dominio/ativacao.ts` existe para não ter.
     */
    const busca = new URLSearchParams(window.location.search);
    const google = busca.get("google");
    /**
     * ⚠️ O `motivo` VAI PARA A TELA, e essa decisão custou um diagnóstico.
     *
     * Antes o aviso era só "não consegui ligar sua agenda, tente de novo". Quando o link
     * saiu com o parâmetro errado (ver `OfertaDoGoogle`), a rota devolveu
     * `motivo=profissional_invalido` — a resposta exata — e esta linha jogou fora. Da tela
     * o botão virou "clico e não acontece nada", e a causa só apareceu lendo o `route.ts`.
     *
     * O `motivo` é curto e em snake_case, então não é bonito. É o preço certo: um aviso que
     * esconde a única informação útil que o servidor mandou não é aviso, é ruído — e as
     * causas possíveis aqui (`nao_configurado`, `sem_negocio`, `profissional_invalido`,
     * `nao_autenticado`) pedem conserto DIFERENTE cada uma.
     */
    if (google === "erro") {
      const motivo = busca.get("motivo");
      toast(`Não consegui ligar sua agenda${motivo ? ` — ${motivo.replace(/_/g, " ")}` : ""}.`);
    }

    fetch("/api/ativacao").then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }))
      .then(({ status, corpo }) => {
        if (!vivo) return;
        if (status === 409) { setEtapa("negocio"); return; }
        if (status === 401) { router.push("/login?next=%2Fcomecar"); return; }
        const f: PassoDeAtivacao[] = corpo?.feitos ?? [];
        setFeitos(f);
        const v: readonly PassoDeAtivacao[] = Array.isArray(corpo?.passos) ? corpo.passos : PASSOS_DE_ATIVACAO;
        setValem(v);
        /* `?etapa=ver` é o "Ver funcionando" da jornada do painel (`JornadaDeAtivacao`), desde
         * 24/10/2026, e desde 12/11/2026 é a ÚNICA porta dele: a etapa saiu do caminho do wizard.
         * `?google=` é a volta do consent que a própria conversa oferece (`OfertaDoGoogle`). Sinais
         * de navegação, e não estado guardado. Sem agente não existe conversa a ver, e a pessoa
         * segue o caminho normal. */
        if ((google || busca.get("etapa") === "ver") && v.includes("primeira_conversa")) { setEtapa("ver"); return; }
        setEtapa(f.includes("catalogo_ajustado") ? "fiscal" : "catalogo");
      })
      .catch(() => vivo && setEtapa("negocio"));
    return () => { vivo = false; };
  }, [router]);

  const avancar = useCallback((proxima: EtapaId) => {
    setEtapa(proxima);
    /* Rerreleitura do progresso a cada avanço: é ela que faz a etapa "Pronto" saber se o
     * WhatsApp ficou conectado, sem que o wizard precise carregar esse estado na mão. */
    fetch("/api/ativacao")
      .then((r) => r.json())
      .then((r) => { if (r?.feitos) setFeitos(r.feitos); })
      .catch(() => {});
  }, []);

  /* Sair do wizard. Vive aqui e não dentro de cada etapa porque a etapa 5 também precisa —
   * "deixar para depois" é literalmente abrir o painel, e não um estado a guardar. */
  const aoPainelDoWizard = useCallback(() => { router.push("/"); router.refresh(); }, [router]);

  if (etapa === null) {
    return <div className="m-altura-tela" />;
  }
  if (fim) {
    return <Comemoracao destino={fim} feitos={feitos} valem={valem} aoPainel={aoPainelDoWizard} />;
  }

  const meta = ETAPAS.find((e) => e.id === etapa)!;
  const podePular = etapa === "catalogo";
  /* A barra mostra só o que vai acontecer: negócio, serviços e documento fiscal. O "Ver
   * funcionando" abre sozinho, vindo do painel, e aí a barra é só ele. */
  const etapas = etapa === "ver" ? ETAPAS.filter((e) => e.id === "ver") : ETAPAS.filter((e) => e.id !== "ver");

  /* Sair da conta, e não do wizard: quem está aqui ainda não tem para onde ir no painel. Serve a
   * quem entrou na conta errada. */
  const sair = async () => {
    if (isSupabaseConfigured) await createClient().auth.signOut().catch(() => {});
    window.location.replace("/login");
  };

  return (
    /* ⚠️ A MOLDURA DO WIZARD (28/09/2026, T1 e 2.41; desde 31/10/2026 a `MolduraDeEntrada`). O
       documento tem a altura da janela e só o meio rola: a barra (marca, etapas, "Sair") em cima e
       o pé com o primário e o "Pular por agora" embaixo, os dois parados. Era `minHeight:100vh` com
       tudo empilhado, e o catálogo empurrava o "Salvar e continuar" para y 1487 (1440x900). */
    <>
    <Toaster />
    <MolduraDeEntrada
      etapas={etapas.map((e) => ({ id: e.id, rotulo: e.rotulo }))} atual={etapa} chave={etapa}
      aoSair={() => void sair()} largura={etapa === "catalogo" || etapa === "fiscal" ? 480 : 520}
      refDoPe={setPe}
      /* ⚠️ "Pular" NÃO aparece na etapa 1, e é a única assimetria da tela: as outras configuram,
         esta CRIA. Sem inquilino não há o que pular para — o painel responde 409 em toda rota.
         Vai em `pe`, a vaga de baixo do pé, e nunca fica acima do primário da etapa. */
      pe={podePular ? (
        <AcaoDiscreta onClick={() => { toast("Você pode fazer isso depois, pelo painel"); avancar("fiscal"); }}>
          Pular por agora
        </AcaoDiscreta>
      ) : undefined}
    >
      {etapa !== "negocio" && <TituloDaEntrada>{meta.titulo}</TituloDaEntrada>}

      <PeDoWizard.Provider value={pe}>
        {etapa === "negocio" && (
          <EtapaNegocio aoCriar={(uso) => { setValem(passosQueValem(uso)); avancar("catalogo"); }} />
        )}
        {etapa === "catalogo" && <EtapaCatalogo aoSeguir={() => avancar("fiscal")} />}
        {etapa === "ver" && <EtapaVerFuncionando feitos={feitos} />}
        {etapa === "fiscal" && <EtapaNotaFiscal aoEscolher={setFim} />}

      </PeDoWizard.Provider>
    </MolduraDeEntrada>
    </>
  );
}
