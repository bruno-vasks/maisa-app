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
 * ⚠️ SÓ A ETAPA 1 É OBRIGATÓRIA, porque é a única que CRIA alguma coisa. Todas as outras
 * têm "Pular" — e pular não é abandono: o passo continua contado em `/api/ativacao`, que
 * lê o mundo em vez de uma flag.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { s, Icon, Toggle, toast, Toaster } from "@/ui/primitivos";
import type { CategoriaServico, PassoDeAtivacao, Servico, UsoDoWhatsApp, Vertical } from "@/nucleo/dominio";
import { PASSOS_DE_ATIVACAO, passosQueValem, usoDoWhatsApp } from "@/nucleo/dominio";
import { sugestoes, type ExemploDoNegocio } from "./sugestoes";
import {
  CodigoPareamento, ConferirNumero, NumeroDoPareamento, digitosDoTelefone, telefoneMascarado,
} from "@/ui/componentes/Pareamento";
import { useIsMobile } from "@/ui/useIsMobile";
import { OpcoesDoNumero, useCaderno } from "@/ui/componentes/EscolhaDoNumero";
import type { ModoDoNumero } from "@/nucleo/dominio/contatos";

/* ───────────────────────────── as etapas ───────────────────────────── */

type EtapaId = "negocio" | "catalogo" | "whatsapp" | "ver" | "fiscal";

const ETAPAS: { id: EtapaId; titulo: string; sub: string }[] = [
  { id: "negocio", titulo: "Seu negócio", sub: "Como ele se chama e o que você faz" },
  { id: "catalogo", titulo: "O que você faz", sub: "Confira preços e quem atende" },
  /* "Um código" e não "um QR code": no celular não há QR a ler, e prometer câmera na
   * lista de etapas é começar a perder a pessoa antes de ela chegar no passo. */
  { id: "whatsapp", titulo: "Conectar o WhatsApp", sub: "Um código e a MAISA começa a responder" },
  { id: "ver", titulo: "Ver funcionando", sub: "Fale com ela como se fosse seu cliente" },
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
  { id: "fiscal", titulo: "Nota fiscal ou recibo", sub: "O documento que sai depois do atendimento" },
];

const VERTICAIS: { id: Vertical; rotulo: string; desc: string; icone: string }[] = [
  { id: "barbeiros", rotulo: "Barbearia ou salão", desc: "Corte, barba, pacotes", icone: "scissors" },
  { id: "terapeutas", rotulo: "Consultório ou clínica", desc: "Sessões, retornos, pacotes", icone: "stethoscope" },
  { id: "generico", rotulo: "Outro tipo", desc: "Começa com um catálogo neutro", icone: "sparkle" },
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
 * enterrar num ajuste do painel: quem escolhe `avisos` NÃO passa pela etapa "Ver
 * funcionando", que é a única que exige a agenda do Google. Sem isto, um consultório de
 * agenda fixa empaca numa etapa que existe para demonstrar um agente que ele desligou.
 *
 * O par de campos que cada modo grava está em `aplicarModo`.
 * ────────────────────────────────────────────────────────────────────────────── */

type Modo = "conversa" | "avisos" | "recibos";

const MODOS: { id: Modo; rotulo: string; desc: string; icone: string }[] = [
  {
    id: "conversa",
    rotulo: "Ela conversa e marca sozinha",
    desc: "Responde seus clientes no WhatsApp, consulta a agenda e agenda o horário",
    icone: "chat",
  },
  {
    id: "avisos",
    /* "Minha agenda é fixa" e não "não quero o agente": a pessoa se reconhece pela
     * própria rotina, não por uma feature que ela ainda não viu funcionando. */
    rotulo: "Minha agenda é fixa",
    desc: "Ela não responde ninguém — só manda o lembrete e avisa quando o recibo sai",
    icone: "bell",
  },
  {
    /* ★ 24/09/2026. Quem só quer o documento fiscal não precisa de WhatsApp nenhum, e
     * obrigar a conectar um número é o maior gargalo do wizard para essa pessoa. */
    id: "recibos",
    rotulo: "Só quero emitir recibo ou nota",
    desc: "Sem WhatsApp: ela não conversa nem manda lembrete. Dá para ligar depois",
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

/* De quanto em quanto se pergunta se o QR já foi lido, e por quanto tempo. Os mesmos
 * números do painel (`store.tsx`): 3s × 40 ≈ 2 min, mais que a validade de um QR. */
const INTERVALO_PAREAMENTO = 3000;
const TENTATIVAS_PAREAMENTO = 40;
/** Teto de renovações automáticas do código. Mesma razão do painel: uma aba esquecida não
 *  pode pedir código novo ao WhatsApp indefinidamente. ≈6 min de janela. */
const MAX_RENOVACOES_CODIGO = 5;

const CAMPO =
  "width:100%;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none";

/* ───────────────────────────── peças ───────────────────────────── */

function Trilha({ atual, etapas }: { atual: EtapaId; etapas: typeof ETAPAS }) {
  const i = etapas.findIndex((e) => e.id === atual);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {etapas.map((e, j) => (
        <React.Fragment key={e.id}>
          {/* Bolinha com NÚMERO e não só cor: a etapa cumprida vira ✓, a atual mostra o
              número, e a futura fica apagada. Cor sozinha é o sinal mais frágil que existe
              — é a mesma regra que o rail do painel já segue. */}
          <span
            aria-current={j === i ? "step" : undefined}
            style={s(`display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;border-radius:999px;font-size:var(--t-micro);font-weight:var(--w-title);${
              j < i
                ? "background:var(--success);color:var(--surface)"
                : j === i
                  ? "background:var(--primary);color:var(--on-primary)"
                  : "background:var(--line);color:var(--muted)"
            }`)}
          >
            {j < i ? <Icon name="check" size={14} sw={2.6} stroke="var(--surface)" /> : j + 1}
          </span>
          {j < etapas.length - 1 && (
            <span style={s(`flex:1;height:2px;border-radius:2px;background:${j < i ? "var(--success)" : "var(--line)"}`)} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
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
        "padding:11px 13px;border-radius:10px;line-height:1.45;" +
        (erro
          ? "color:var(--danger);background:var(--danger-soft)"
          : "color:var(--warn);background:var(--warn-soft)"),
      )}
    >
      <Icon
        name={erro ? "alert" : "clock"} size={16} sw={2}
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
      style={s(`display:inline-flex;align-items:center;justify-content:center;gap:9px;height:48px;padding:0 22px;border-radius:12px;font-family:inherit;font-weight:var(--w-title);font-size:var(--t-body);cursor:${ocupado ? "not-allowed" : "pointer"};opacity:${ocupado ? ".55" : "1"};${
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
 * O que cada modo grava na assistente.
 *
 * `ativa` liga ou cala o agente (`entrada/whatsapp/agente.ts`). No modo `conversa` ele é
 * gravado EXPLICITAMENTE: desde 24/09/2026 terapeuta nasce com a MAISA desligada
 * (`atendeNoWhatsAppPorPadrao`), então "ela conversa" precisa ligar, não herdar.
 *
 * `avisarRecibo: true` no modo `avisos`: o padrão dele no banco é `false` de propósito — é o
 * único toggle que dispara sem ninguém por perto, do número pessoal do dono. Quem escolhe
 * este modo pediu, com todas as letras, no texto do cartão.
 *
 * `recibos` desliga as TRÊS coisas que saem pelo WhatsApp (agente, lembrete, aviso). É isso
 * que faz o WhatsApp sumir da trilha e do cartão de jornada — `usoDoWhatsApp` deriva dos
 * mesmos três campos, e não de um "modo" guardado à parte.
 */
const AJUSTES_DO_MODO: Record<Modo, { assistente: { ativa: boolean }; cfg?: Record<string, boolean> }> = {
  conversa: { assistente: { ativa: true } },
  avisos: { assistente: { ativa: false }, cfg: { avisarRecibo: true } },
  recibos: { assistente: { ativa: false }, cfg: { lembrete: false, avisarRecibo: false } },
};

/**
 * Grava o modo e devolve o uso do WhatsApp que FICOU no servidor — lido da resposta, não
 * suposto da escolha. `undefined` quando o PATCH não passa: valem todos os passos, o lado
 * que mostra uma etapa a mais em vez de esconder uma.
 */
const aplicarModo = async (modo: Modo): Promise<UsoDoWhatsApp | undefined> => {
  const r = await fetch("/api/assistente", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(AJUSTES_DO_MODO[modo]),
  }).then((x) => x.json()).catch(() => null);
  if (!r?.ok || !r.assistente || !r.cfg) return undefined;
  return usoDoWhatsApp({ ativa: r.assistente.ativa, lembrete: r.cfg.lembrete, avisarRecibo: r.cfg.avisarRecibo });
};

/** Um cartão de escolha — o mesmo desenho para a vertical e para o modo. */
function Escolha({
  on, icone, rotulo, desc, onClick,
}: { on: boolean; icone: string; rotulo: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick} className="m-press m-focus"
      style={s(`display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;cursor:pointer;text-align:left;font-family:inherit;border:1.5px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"}`)}
    >
      <Icon name={icone} size={22} sw={1.9} stroke={on ? "var(--primary-dark)" : "var(--muted)"} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{rotulo}</span>
        <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;line-height:1.4")}>{desc}</span>
      </span>
      {on && <Icon name="check" size={18} sw={2.4} stroke="var(--primary-dark)" />}
    </button>
  );
}

function EtapaNegocio({ aoCriar }: { aoCriar: (uso: UsoDoWhatsApp | undefined) => void }) {
  const [nome, setNome] = useState("");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [recado, setRecado] = useState<Recado>(null);
  const [ocupado, setOcupado] = useState(false);

  const criar = useCallback(async () => {
    if (!vertical) { setRecado(falhou("Escolha o tipo do seu negócio.")); return; }
    if (!modo) { setRecado(falhou("Escolha como a MAISA vai trabalhar.")); return; }
    setRecado(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/negocio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, vertical }),
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
      const uso = await aplicarModo(modo);
      if (!uso) {
        toast("Criei seu negócio, mas não consegui gravar como a MAISA vai trabalhar — ajuste em “A MAISA”.");
      }
      aoCriar(uso);
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [nome, vertical, modo, aoCriar]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
          Nome do negócio
        </span>
        <input
          autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="Barbearia do Zé" className="m-focus" style={s(CAMPO)}
          onKeyDown={(e) => { if (e.key === "Enter" && nome.trim() && vertical && modo) void criar(); }}
        />
        {/* Diz a CONSEQUÊNCIA, não a regra. Este campo entra no prompt do agente a cada
            mensagem e no texto de todo lembrete — foi assim que um negócio de teste passou
            três dias se apresentando como "bruno.vaskevicius" no WhatsApp dos clientes. */}
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
          É como a MAISA vai se apresentar: “Aqui é a MAISA, assistente do {nome.trim() || "…"}”.
        </span>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
          Que tipo de negócio é?
        </span>
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45;margin-bottom:2px")}>
          Serve para já deixar seus serviços e horários preenchidos — dá para mudar tudo depois.
        </span>
        {VERTICAIS.map((v) => (
          <Escolha
            key={v.id} on={vertical === v.id} icone={v.icone} rotulo={v.rotulo} desc={v.desc}
            onClick={() => { setVertical(v.id); setRecado(null); }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
          Como a MAISA vai trabalhar?
        </span>
        {/* Diz que dá para mudar depois pela mesma razão do bloco de cima: a escolha tem
            consequência grande (ela fala ou não fala com seus clientes) e ninguém decide bem
            uma coisa dessas achando que é definitiva. */}
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45;margin-bottom:2px")}>
          Dá para trocar quando quiser, na tela “A MAISA”.
        </span>
        {modosPara(vertical).map((m) => (
          <Escolha
            key={m.id} on={modo === m.id} icone={m.icone} rotulo={m.rotulo} desc={m.desc}
            onClick={() => { setModo(m.id); setRecado(null); }}
          />
        ))}
      </div>

      <Aviso recado={recado} />

      <Botao onClick={() => void criar()} ocupado={ocupado} full>
        Criar meu negócio
      </Botao>
    </div>
  );
}

/* ───────────────────────────── etapa 2 · o catálogo ───────────────────────────── */

const CATEGORIAS: CategoriaServico[] = ["Recorrente", "Pacote", "Extra"];

function LinhaServico({ sv, aoMudar }: { sv: Servico; aoMudar: (p: Partial<Servico>) => void }) {
  return (
    <div style={s(`display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);opacity:${sv.ativo ? "1" : ".6"}`)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          value={sv.nome} onChange={(e) => aoMudar({ nome: e.target.value })}
          className="m-focus"
          style={s("flex:1;min-width:0;height:38px;padding:0 11px;border-radius:10px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);outline:none")}
        />
        <Toggle on={sv.ativo} onChange={(v) => aoMudar({ ativo: v })} rotulo={`${sv.nome} ativo`} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={s("font-size:var(--t-micro);color:var(--muted);font-weight:var(--w-title)")}>Preço (R$)</span>
          {/* `type="text"` e `inputMode="decimal"`: o `type="number"` do Chrome recusa a
              vírgula no teclado brasileiro, e o caso de uso já aceita "59,90". */}
          <input
            type="text" inputMode="decimal" value={String(sv.preco)}
            onChange={(e) => aoMudar({ preco: e.target.value as unknown as number })}
            className="m-focus n"
            style={s("width:100%;height:38px;padding:0 11px;border-radius:10px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none")}
          />
        </label>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={s("font-size:var(--t-micro);color:var(--muted);font-weight:var(--w-title)")}>Duração (min)</span>
          <input
            type="text" inputMode="numeric" value={String(sv.duracao)}
            onChange={(e) => aoMudar({ duracao: e.target.value as unknown as number })}
            className="m-focus n"
            style={s("width:100%;height:38px;padding:0 11px;border-radius:10px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none")}
          />
        </label>
        <label style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={s("font-size:var(--t-micro);color:var(--muted);font-weight:var(--w-title)")}>Tipo</span>
          <select
            value={sv.categoria} onChange={(e) => aoMudar({ categoria: e.target.value as CategoriaServico })}
            className="m-focus"
            style={s("width:100%;height:38px;padding:0 8px;border-radius:10px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none")}
          >
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
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
  const nomeOriginal = useRef<string>("");
  const [profissional, setProfissional] = useState<{ id: string; nome: string } | null>(null);
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
          const p = (r.profissionais ?? [])[0];
          if (p) { setProfissional({ id: p.id, nome: p.nome }); nomeOriginal.current = p.nome; }
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

      /* Mesma regra para quem atende: só grava se o nome mudou. Regravar o nome adivinhado
       * marcaria o profissional como conferido sem que ninguém o tivesse conferido. */
      if (profissional && profissional.nome.trim() && profissional.nome !== nomeOriginal.current) {
        const r = await fetch("/api/equipe", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: profissional.id, nome: profissional.nome }),
        }).then((x) => x.json());
        if (!r?.ok) { setRecado(falhou(r?.info ?? "Não foi possível salvar quem atende.")); setOcupado(false); return; }
      }

      aoSeguir();
    } catch {
      setRecado(falhou("Sem conexão com o servidor. Tente de novo."));
      setOcupado(false);
    }
  }, [servicos, profissional, aoSeguir]);

  if (carregando) {
    return <div style={s("padding:40px 0;text-align:center;color:var(--muted);font-size:var(--t-sm)")}>Carregando seu catálogo…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.5;margin:0")}>
        Já deixamos preenchido com o comum do seu ramo. <strong style={s("color:var(--ink);font-weight:var(--w-title)")}>Ajuste os preços</strong> e
        desligue o que você não faz — é isso que a MAISA vai oferecer aos seus clientes.
      </p>

      {profissional && (
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>Quem atende</span>
          <input
            value={profissional.nome}
            onChange={(e) => setProfissional({ ...profissional, nome: e.target.value })}
            className="m-focus" style={s(CAMPO)}
          />
          {/* Este campo quase sempre chega errado, e o motivo está em `005_provisionar.sql`:
              sem nome no cadastro do usuário, a RPC usa o que vem antes do @ do e-mail. */}
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
            Adivinhamos pelo seu e-mail. A MAISA fala esse nome ao confirmar um horário.
          </span>
        </label>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {servicos.map((sv) => (
          <LinhaServico key={sv.id} sv={sv} aoMudar={(p) => mudar(sv.id, p)} />
        ))}
      </div>

      <Aviso recado={recado} />

      <Botao onClick={() => void salvar()} ocupado={ocupado} full>
        Salvar e continuar
      </Botao>
    </div>
  );
}

/* ───────────────────────────── etapa 3 · o WhatsApp ───────────────────────────── */

/**
 * De quem é esse número, logo depois de conectar. As peças são as do painel
 * (`EscolhaDoNumero`), sem store: o wizard roda fora do `StoreProvider` (guarda G13).
 *
 * Nada vem pré-marcado, mesmo com o servidor dizendo `pessoal`: esse valor é o padrão de
 * segurança do banco, não uma resposta dela. "Continuar" só aparece depois que o `PATCH
 * /api/contatos` aceitou a escolha. No pessoal, o convite para trazer a agenda vem junto,
 * porque é o caderno que diz quem é cliente.
 */
function PerguntaDoNumero({ aoSeguir }: { aoSeguir: () => void }) {
  const { ocupado, trocar, importar, estado } = useCaderno();
  const [escolhido, setEscolhido] = useState<ModoDoNumero | null>(null);
  const [gravado, setGravado] = useState(false);
  const [recado, setRecado] = useState<Recado>(null);
  const [trazidos, setTrazidos] = useState<string | null>(null);

  const escolher = async (m: ModoDoNumero) => {
    if (ocupado) return;
    setEscolhido(m);
    setGravado(false);
    setRecado(null);
    const erro = await trocar(m);
    if (erro) { setRecado(falhou(erro)); setEscolhido(null); return; }
    setGravado(true);
  };

  const trazer = async () => {
    if (ocupado) return;
    const r = await importar();
    if (!r.ok) { setRecado(falhou(r.frase)); return; }
    setRecado(null);
    setTrazidos(r.frase);
  };

  return (
    <div style={s("width:100%;display:flex;flex-direction:column;gap:12px;text-align:left")}>
      <div>
        <p style={s("margin:0;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)")}>De quem é esse número?</p>
        <p style={s("margin:4px 0 0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
          Decide quem a MAISA atende. Dá para mudar depois, nos Ajustes.
        </p>
      </div>
      <OpcoesDoNumero modo={escolhido} aoEscolher={(m) => void escolher(m)} desligado={ocupado !== null} />
      <Aviso recado={recado} />
      {gravado && escolhido === "pessoal" && (
        <div style={s("display:flex;flex-direction:column;gap:9px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--surface)")}>
          <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
            Traga sua agenda para marcar seus clientes. Sem ela, a MAISA só responde número novo que
            chega pedindo horário.
          </p>
          {trazidos
            ? <p role="status" style={s("margin:0;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--success)")}>{trazidos}</p>
            : (
              <Botao variante="ghost" ocupado={ocupado === "importar"} onClick={() => void trazer()}>
                {ocupado === "importar" ? "Lendo sua agenda…" : (estado?.contatos.length ?? 0) > 0 ? "Atualizar meus contatos" : "Trazer meus contatos"}
              </Botao>
            )}
        </div>
      )}
      {gravado
        ? <Botao onClick={aoSeguir} full>Continuar</Botao>
        : <p style={s("margin:0;font-size:var(--t-label);color:var(--muted)")}>Escolha uma das duas para seguir.</p>}
    </div>
  );
}

function EtapaWhatsApp({ aoSeguir }: { aoSeguir: () => void }) {
  const [qrcode, setQrcode] = useState<string | null>(null);
  /** Os 8 caracteres do "Conectar com número de telefone". `null` = pareamento por QR. */
  const [codigo, setCodigo] = useState<string | null>(null);
  const [status, setStatus] = useState<"parado" | "gerando" | "pareando" | "conectado">("parado");
  const [recado, setRecado] = useState<Recado>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tentativas = useRef(0);
  /** Trava de reentrância do polling. Ver o ⚠️ dentro do `setInterval`. */
  const emVoo = useRef(false);
  /** O telefone deste pareamento e quantas vezes o código já trocou. Em memória, nunca em
   *  disco — ver o comentário equivalente no `store.tsx`. */
  const numeroDoPareamento = useRef<string | null>(null);
  const renovacoes = useRef(0);

  /**
   * O MESMO número do `ref` acima, só que desenhável.
   *
   * ⚠️ ISTO ERA SÓ O `ref`, DE PROPÓSITO — e a decisão estava errada. O comentário gêmeo no
   * `store.tsx` dizia *"`ref` e não `state`: nenhuma tela desenha isto"*, e era verdade:
   * ninguém desenhava. Foi exatamente essa a falha relatada em 18/08/2026 — o colega do
   * Bruno digitou o número errado e não tinha onde conferir, porque no instante em que o
   * código aparece o campo de telefone sai da tela.
   *
   * Os dois andam juntos e só mudam em dois lugares (`conectar` e a correção). O `ref`
   * continua existindo porque `renovar` precisa do valor sem entrar na lista de dependências
   * do efeito que dispara a renovação — ali, uma identidade nova a cada render pediria código
   * novo em laço.
   */
  const [numeroNaTela, setNumeroNaTela] = useState<string | null>(null);

  /** A parada antes de mandar o código. Ver `ConferirNumero`, em `componentes/Pareamento`. */
  const [conferindo, setConferindo] = useState(false);

  /* ── ESTA É A ETAPA QUE MAIS PERDE GENTE, E A CÂMERA É O MOTIVO ──
   *
   * O wizard é a primeira coisa que um cliente novo vê, e uma boa parte o abre no celular
   * — o MESMO aparelho onde o WhatsApp do negócio está instalado. Para essa pessoa o QR é
   * impossível: a câmera não fotografa a própria tela. Ela não vê um erro, ela vê um
   * quadrado que não serve para nada, e desiste. Do lado de cá é indistinguível de um QR
   * que ninguém leu — nunca soubemos quantos foram embora aqui.
   *
   * Por isso o padrão vem do APARELHO. No celular, o caminho oferecido é o código; no
   * computador, o QR, que é mais rápido para quem tem o celular na mão.
   *
   * ⚠️ A derivação é no render, e não `useState(noCelular)`: `useIsMobile` devolve `false`
   * no primeiro render e só sincroniza depois do mount, então o estado nasceria "desktop"
   * para todo mundo — justamente o público que esta mudança existe para atender. */
  const noCelular = useIsMobile();
  const [escolha, setEscolha] = useState<"qr" | "codigo" | null>(null);
  const porCodigo = escolha ? escolha === "codigo" : noCelular;

  const [telefone, setTelefone] = useState("");
  /** Ver o QR mesmo tendo pedido código — a saída de quem tem um segundo aparelho. */
  const [verQr, setVerQr] = useState(false);

  const digitos = digitosDoTelefone(telefone);
  const podePedirCodigo = digitos.length >= 10;
  const mostrandoCodigo = !!codigo && !verQr;

  const parar = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  /* ⚠️ O `clearInterval` no desmonte não é higiene, é conserto de vazamento: sem ele, sair
   * do wizard com o pareamento na tela deixa um GET de 3 em 3 segundos rodando para sempre. */
  useEffect(() => parar, [parar]);

  const conectar = useCallback(async (comNumero?: string) => {
    setRecado(null);
    setStatus("gerando");
    setVerQr(false);
    try {
      const r = await fetch("/api/canal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: comNumero }),
      }).then((x) => x.json());
      if (!r?.ok) {
        const falta = r?.faltando?.length ? ` Falta: ${r.faltando.join(", ")}.` : "";
        setRecado(falhou((r?.info ?? "Não foi possível abrir a conexão.") + falta));
        setStatus("parado");
        return;
      }
      setQrcode(r.pareamento?.qrcode ?? null);
      setCodigo(r.pareamento?.codigo ?? null);
      numeroDoPareamento.current = comNumero ?? null;
      setNumeroNaTela(comNumero ?? null);
      renovacoes.current = 0;
      if (r.pareamento?.status === "conectado") { setStatus("conectado"); return; }
      setStatus("pareando");

      /* Pediu código e veio só QR: acontece: o pairing code depende da versão do Baileys do
       * servidor e falha calado. Sem este aviso, o dono digita o telefone, vê um QR
       * aparecer e conclui que o app ignorou o que ele pediu. */
      const semCodigo = !!comNumero && !r.pareamento?.codigo;
      if (semCodigo) {
        /* Caminho ALTERNATIVO, não falha: o pairing code depende da versão do Baileys do
         * servidor, e a saída está escrita na própria frase. Ver o cabeçalho do `Aviso`. */
        setRecado(avisa(
          "Não consegui gerar o código de 8 dígitos agora. Dá para conectar lendo o QR de " +
          "outro aparelho, ou tentar de novo.",
        ));
      }

      tentativas.current = 0;
      parar();
      timer.current = setInterval(async () => {
        tentativas.current += 1;
        if (tentativas.current > TENTATIVAS_PAREAMENTO) {
          parar();
          setStatus("parado");
          setQrcode(null);
          setCodigo(null);
          /* A frase segue o caminho: "venceu sem ninguém escanear" manda procurar uma
           * câmera, e é a última coisa que se deve dizer a quem está num aparelho só. */
          /* Prazo cumprindo o prazo. Vermelho aqui é o produto se acusando de um defeito
           * que não tem — e o próximo passo está na frase. */
          setRecado(avisa(
            r.pareamento?.codigo
              ? "O código venceu. Gere outro para tentar de novo."
              : "O QR code venceu. Gere outro para tentar de novo.",
          ));
          return;
        }
        /* ⚠️ UMA POR VEZ. `GET /api/canal` pergunta o estado ao provedor (é `lerCanal` quem
         * faz isso, para a tela não mentir), e essa ida à Evolution passa dos 3s deste
         * intervalo com facilidade. Sem esta guarda, as chamadas se empilham: cada tique
         * abre outra, todas voltam juntas, e o efeito colateral disso no painel foi o
         * relato "veio mil mensagens de que ele conectou". Aqui não há toast, mas o
         * empilhamento é o mesmo — e cada requisição extra bate no servidor de terceiro. */
        if (emVoo.current) return;
        emVoo.current = true;
        try {
          const c = await fetch("/api/canal").then((x) => x.json());
          if (c?.ok && c.canal?.status === "conectado") {
            parar();
            setNumero(c.canal.numero ?? null);
            setQrcode(null);
            setCodigo(null);
            setStatus("conectado");
          }
        } catch { /* uma falha de rede no meio do polling não cancela o pareamento */ }
        finally { emVoo.current = false; }
      }, INTERVALO_PAREAMENTO);
    } catch {
      setRecado(falhou("Sem conexão com o servidor."));
      setStatus("parado");
    }
  }, [parar]);

  /**
   * Outro código sem refazer a instância. Disparada pelo contador do `CodigoPareamento`.
   *
   * Repete a lógica do `store.tsx` em vez de importá-la, e é a mesma escolha que o resto
   * deste arquivo faz: o wizard NÃO usa o store (ver o cabeçalho — o painel inteiro
   * depende de um inquilino que aqui pode não existir ainda). Meia dúzia de `fetch` é o
   * preço combinado dessa separação.
   */
  const renovar = useCallback(async () => {
    const numero = numeroDoPareamento.current;
    if (!numero) return;

    if (renovacoes.current >= MAX_RENOVACOES_CODIGO) {
      parar();
      setStatus("parado");
      setCodigo(null);
      setQrcode(null);
      setRecado(avisa("Passou do tempo de conectar. Peça um código novo para tentar de novo."));
      return;
    }
    renovacoes.current += 1;

    try {
      const r = await fetch("/api/canal/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero }),
      }).then((x) => x.json());

      if (!r?.ok || !r.codigo) {
        setRecado(falhou("Não consegui gerar um código novo. Leia o QR de outro aparelho, ou peça outro código."));
        return;
      }
      setCodigo(r.codigo);
      setRecado(null);
      /* O polling continua de onde estava, só com o relógio zerado: sem isto ele morreria
       * em 2 min enquanto o código segue se renovando, e a tela deixaria de perceber a
       * conexão no instante em que ela finalmente acontece. */
      tentativas.current = 0;
    } catch {
      setRecado(falhou("Sem conexão com o servidor para renovar o código."));
    }
  }, [parar]);

  if (status === "conectado") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
        <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--success-soft)")}>
          <Icon name="check" size={28} sw={2.4} stroke="var(--success)" />
        </div>
        <div>
          <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>WhatsApp conectado</p>
          {numero && <p style={s("font-size:var(--t-sm);color:var(--muted);margin:4px 0 0")}>+{numero}</p>}
        </div>
        {/* ⚠️ A PERGUNTA VEM AQUI, ANTES DE SEGUIR (25/09/2026, 1A.15, 09 P0-3). O modo nasce
            `pessoal` e o caderno nasce vazio: sem perguntar, a pessoa saía com "conectado" e
            uma MAISA que calava para os clientes salvos no celular dela. */}
        <PerguntaDoNumero aoSeguir={aoSeguir} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.5;margin:0")}>
        {/* Dizia "use o WhatsApp do negócio", e o ICP roda no número pessoal (09 P0-3). */}
        Conecte o WhatsApp <strong style={s("color:var(--ink);font-weight:var(--w-title)")}>onde seus clientes já falam com você</strong>.
        A MAISA responde por ele, e você continua vendo tudo.
      </p>

      {status === "pareando" && mostrandoCodigo && codigo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CodigoPareamento codigo={codigo} aoRenovar={renovar} />
          {/* ── PARA QUEM DIGITOU ERRADO, ESTA É A ÚNICA CHANCE ──
              O código na tela é a prova de que o pedido saiu, e não de que ele saiu para o
              número certo. Um dígito errado manda o pareamento para outra pessoa e produz
              exatamente esta tela — "esperando você digitar o código" até vencer, sem erro
              nenhum de nenhum lado. Ver o cabeçalho de `NumeroDoPareamento`. */}
          {numeroNaTela && (
            <NumeroDoPareamento
              digitos={numeroNaTela}
              aoCorrigir={() => {
                /* Volta ao campo com o número que estava lá, para editar em vez de redigitar.
                 * O pareamento pendente na Evolution morre no próximo `conectar`, que apaga e
                 * recria a instância de qualquer forma. */
                parar();
                setStatus("parado");
                setCodigo(null);
                setQrcode(null);
                setRecado(null);
                setNumeroNaTela(null);
                setTelefone(numeroNaTela);
                setEscolha("codigo");
                setConferindo(false);
              }}
            />
          )}
          <span style={s("font-size:var(--t-label);color:var(--muted);text-align:center")}>
            Esperando você digitar o código no WhatsApp…
          </span>
        </div>
      ) : status === "pareando" && qrcode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URI vinda da Evolution */}
          <img
            src={qrcode} alt="QR code para conectar o WhatsApp"
            style={s("width:232px;height:232px;border-radius:14px;border:1px solid var(--border);background:var(--surface);padding:8px")}
          />
          <ol style={s("margin:0;padding-left:18px;font-size:var(--t-sm);color:var(--muted);line-height:1.7")}>
            <li>Abra o WhatsApp no celular com esse número</li>
            <li>Toque em <strong style={s("color:var(--ink)")}>Aparelhos conectados</strong></li>
            <li>Toque em <strong style={s("color:var(--ink)")}>Conectar aparelho</strong> e aponte para o código</li>
          </ol>
          <span style={s("font-size:var(--t-label);color:var(--muted)")}>Esperando você ler o código…</span>
        </div>
      ) : porCodigo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
              Número do WhatsApp
            </span>
            <input
              value={telefoneMascarado(digitos)}
              onChange={(e) => setTelefone(digitosDoTelefone(e.target.value))}
              inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999"
              className="m-focus" style={s(CAMPO)}
              onKeyDown={(e) => { if (e.key === "Enter" && podePedirCodigo) setConferindo(true); }}
            />
            {/* Diz o que o número FAZ e o que ele NÃO faz. Pedir telefone no meio de uma
                conexão parece cadastro, e cadastro inesperado é onde a pessoa desconfia. */}
            <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.45")}>
              É para onde o WhatsApp manda o código de conexão. Ele não fica salvo aqui — quem
              diz qual número conectou é o próprio WhatsApp, depois.
            </span>
          </label>

          {/* Um passo, e ele não é formalidade: é o único lugar do fluxo em que o número
              aparece inteiro, com DDI, do jeito que vai ser usado. Ver `ConferirNumero`. */}
          {conferindo ? (
            <ConferirNumero
              digitos={digitos}
              ocupado={status === "gerando"}
              aoCorrigir={() => setConferindo(false)}
              aoConfirmar={() => { setConferindo(false); void conectar(digitos); }}
            />
          ) : (
            <Botao
              onClick={() => { if (podePedirCodigo) setConferindo(true); }}
              ocupado={status === "gerando"} full
            >
              <Icon name="whatsapp" size={19} sw={2} stroke="var(--on-primary)" />
              Receber código
            </Botao>
          )}
        </div>
      ) : (
        <Botao onClick={() => void conectar()} ocupado={status === "gerando"} full>
          <Icon name="whatsapp" size={19} sw={2} stroke="var(--on-primary)" />
          Gerar QR code
        </Botao>
      )}

      {/* ── A SAÍDA, SEMPRE VISÍVEL ──
          Ficar preso aqui é o pior desfecho do wizard, e há duas maneiras de acontecer: o
          QR num aparelho só, e o pairing code que a versão do servidor não gera. Um toque
          entre os dois caminhos é o que transforma "não funciona" em "usei o outro".

          Sem guarda de `status`: o caso "conectado" já saiu por um `return` acima. */}
      <button
        onClick={() => {
          /* Pareamento em curso COM código: o servidor mandou os dois, então trocar é só
           * alternar o que se pinta. Nada de rede. */
          if (status === "pareando" && codigo) { setVerQr((v) => !v); return; }

          /* Pareamento em curso SEM código: só se chega aqui olhando um QR — seja porque
           * foi ele que se pediu, seja porque o servidor não gerou o código. Nos dois
           * casos o que a pessoa quer é o caminho sem câmera, então força "codigo" em vez
           * de alternar. Cancela local e deixa o campo do telefone à mostra; a instância
           * pendente morre no próximo `conectar`, que apaga e recria de qualquer jeito. */
          if (status === "pareando") {
            parar();
            setStatus("parado");
            setQrcode(null);
            setRecado(null);
            setEscolha("codigo");
            return;
          }

          setEscolha(porCodigo ? "qr" : "codigo");
        }}
        className="m-focus"
        style={s(
          "align-self:center;background:none;border:none;padding:4px;font-family:inherit;cursor:pointer;" +
          "font-size:var(--t-sm);font-weight:var(--w-title);color:var(--primary);text-decoration:underline",
        )}
      >
        {/* O rótulo segue o que está NA TELA, não o que foi pedido: quem pediu código e
            recebeu só QR está olhando um QR, e oferecer "prefiro ler o QR" seria oferecer
            o que ele já tem — no minuto em que ele está tentando desencalhar. */}
        {status === "pareando" && codigo
          ? mostrandoCodigo ? "Prefiro ler o QR code" : "Voltar para o código"
          : status === "pareando" ? "Não consigo ler o QR — conectar com código"
          : porCodigo ? "Prefiro ler o QR code"
          : "Estou no celular — conectar com código"}
      </button>

      <Aviso recado={recado} />
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
        <Icon name={icone} size={27} sw={2} stroke="var(--warm-ink)" />
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
          style={s("min-height:44px;padding:0 18px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);cursor:pointer")}
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
function Conversa({ ambiente, numero, aoPainel, aoSeguir }: {
  ambiente: Ambiente; numero: string | null;
  /** Sair do wizard. Usado pelos becos internos (`Falta`), onde a pessoa está desistindo. */
  aoPainel: () => void;
  /** Seguir para a etapa 5. Usado pelo botão final — ver o comentário lá embaixo. */
  aoSeguir: () => void;
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
        titulo="A MAISA está sem cérebro configurado"
        texto="Falta a chave do modelo de linguagem neste ambiente. Nada do que você fez se perdeu — o resto do negócio está de pé."
        acao={null}
        aoPainel={aoPainel}
        pular={aoSeguir}
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

      <div style={s("display:flex;flex-direction:column;gap:10px;min-height:180px;max-height:300px;overflow-y:auto;padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2)")}>
        {falas.length === 0 && (
          <p style={s("margin:auto;max-width:30ch;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:1.55")}>
            Toque numa das frases abaixo — é o que um cliente seu escreveria.
          </p>
        )}
        {falas.map((f, i) => <BolhaSim key={i} fala={f} />)}
        {ocupada && (
          <span style={s("align-self:flex-start;font-size:var(--t-sm);color:var(--muted);padding:9px 13px;border-radius:16px;border:1px solid var(--primary-soft);background:var(--surface)")}>
            digitando…
          </span>
        )}
        <div ref={fim} />
      </div>

      {/* A prova, em duas linhas, no lugar da trilha crua do `/laboratorio`. Aquela coluna
          de JSON é para quem depura o agente; para o dono, o que importa é que ela OLHOU a
          agenda antes de falar e que o horário existe de verdade. */}
      {(consultou || marcou) && (
        <div style={s("display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:12px;background:var(--success-soft)")}>
          {consultou && (
            <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--success)")}>
              <Icon name="check" size={15} sw={2.4} stroke="var(--success)" />
              Ela consultou sua agenda antes de responder — não chutou horário.
            </span>
          )}
          {marcou && (
            <span style={s("display:flex;align-items:center;gap:8px;font-size:var(--t-sm);color:var(--success)")}>
              <Icon name="calendar-check" size={15} sw={2.4} stroke="var(--success)" />
              {/* ⚠️ A FRASE MUDA COM O AMBIENTE, e essa é a única razão de `agendaReal`
                  existir. Sem Google configurado no deploy, o horário foi para a agenda de
                  memória — ele some no próximo reinício e não está no celular de ninguém.
                  Dizer "está na sua agenda" ali seria a tela que existe para provar que o
                  produto funciona sendo o primeiro lugar onde ele mente. */}
              {ambiente.agendaReal
                ? "Marcado de verdade. Está na sua agenda agora — para desmarcar, é só pedir a ela."
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
          placeholder="Ou escreva do seu jeito"
          aria-label="Mensagem do cliente"
          className="m-focus"
          style={s(`${CAMPO};flex:1;min-width:0`)}
        />
        <button
          type="submit"
          disabled={ocupada || !texto.trim()}
          className="m-hov-primary m-press m-focus"
          style={s(`display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;flex-shrink:0;border-radius:12px;border:none;background:var(--primary);${ocupada || !texto.trim() ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
        >
          <Icon name="send" size={18} sw={2} stroke="var(--on-primary)" />
        </button>
      </form>

      {/* Vai para a etapa 5 (nota fiscal), e não direto para o painel. O rótulo muda de
          "Continuar" para o convite quando a MAISA ACABOU de marcar: é o instante de maior
          crédito do onboarding inteiro, e é nele que faz sentido apresentar o diferencial. */}
      <Botao onClick={aoSeguir} variante={marcou ? "primary" : "ghost"} full>
        {marcou ? "Agora o documento fiscal" : "Continuar"}
      </Botao>
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

function EtapaNotaFiscal({ aoPainel }: { aoPainel: () => void }) {
  const [estado, setEstado] = useState<{ falta: string[]; ligado: boolean } | null>(null);
  /** O agente está ligado? Muda a frase do "decidir depois". `null` enquanto não se sabe. */
  const [agente, setAgente] = useState<boolean | null>(null);

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
    fetch("/api/assistente", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setAgente(d?.ok ? d.assistente?.ativa === true : null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!estado) return <div style={{ minHeight: 200 }} aria-busy="true" />;

  /* Já está tudo ligado: só a despedida. */
  if (estado.falta.length === 0 && estado.ligado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
        <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--success-soft)")}>
          <Icon name="check" size={27} sw={2.6} stroke="var(--success)" />
        </div>
        <div>
          <p style={s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink);margin:0")}>
            Seu documento fiscal já está ligado
          </p>
          <p style={s("font-size:var(--t-sm);color:var(--muted);margin:8px 0 0;line-height:1.55")}>
            Você acompanha tudo em Fiscal, atendimento por atendimento.
          </p>
        </div>
        <Botao onClick={aoPainel} full>Abrir meu painel</Botao>
      </div>
    );
  }

  const opcao = "display:flex;align-items:center;gap:13px;width:100%;min-height:64px;padding:16px 15px;border-radius:12px;border:1px solid var(--border);background:var(--surface);font-family:inherit;text-align:left;cursor:pointer;text-decoration:none;color:inherit";
  const caminhos: { rotulo: string; sub: string; href?: string }[] = [
    { rotulo: "Atendo como pessoa física", sub: "Recibo do Receita Saúde, no seu CPF. Sem certificado.", href: IR_AO_FISCAL("recibo") },
    { rotulo: "Tenho CNPJ", sub: "Nota fiscal de serviço. Pede o certificado digital A1.", href: IR_AO_FISCAL("nota") },
    {
      rotulo: "Decidir depois, na tela Fiscal",
      /* O que já funciona sem isto, dito pelo modo: sem agente, a MAISA não "atende e marca". */
      sub: agente === false ? "Os lembretes já estão ligados." : agente ? "Ela já atende e marca pelo WhatsApp." : "Fica esperando na tela Fiscal.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={s("font-size:var(--t-sm);color:var(--muted);margin:0;line-height:1.6")}>
        A MAISA emite o seu documento fiscal depois de cada atendimento: nota fiscal ou recibo do Receita Saúde.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {caminhos.map((c) => {
          const conteudo = (
            <>
              {/* Sem ícone em quadrado (emenda 3 do DS): o rótulo diz o caminho. */}
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{c.rotulo}</span>
                <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>{c.sub}</span>
              </span>
            </>
          );
          /* `<a>` e não `router.push`: o painel é outra árvore (com `StoreProvider`), e a navegação
             inteira garante que ele nasce lendo o `?tela=` e o `?secao=`. */
          return c.href
            ? <a key={c.rotulo} href={c.href} className="m-hov-bg m-press m-focus" style={s(opcao)}>{conteudo}</a>
            : <button key={c.rotulo} type="button" onClick={aoPainel} className="m-hov-bg m-press m-focus" style={s(opcao)}>{conteudo}</button>;
        })}
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
      <span style={s("align-self:center;max-width:44ch;text-align:center;font-size:var(--t-label);line-height:1.5;color:var(--warn);background:var(--warn-soft);padding:8px 13px;border-radius:11px")}>
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

function EtapaVerFuncionando({ feitos, aoVoltarParaWhatsApp, aoSeguir }: {
  feitos: PassoDeAtivacao[]; aoVoltarParaWhatsApp: () => void; aoSeguir: () => void;
}) {
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
        acao={<Botao onClick={aoVoltarParaWhatsApp} full>Conectar o WhatsApp</Botao>}
        aoPainel={aoPainel}
        pular={aoSeguir}
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
  return <Conversa ambiente={ambiente} numero={numero} aoPainel={aoPainel} aoSeguir={aoSeguir} />;
}

/* ───────────────────────────── o wizard ───────────────────────────── */

export default function Comecar() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<EtapaId | null>(null);
  const [feitos, setFeitos] = useState<PassoDeAtivacao[]>([]);
  /**
   * Os passos que valem para este negócio — é o que decide se "Conectar o WhatsApp" e "Ver
   * funcionando" existem. Ver `passosQueValem`.
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
  const temWhatsApp = valem.includes("whatsapp_conectado");
  const temVer = valem.includes("primeira_conversa");

  /**
   * Onde retomar — perguntado ao MUNDO, não a uma flag.
   *
   * 409 `sem_negocio` significa etapa 1. Qualquer outra resposta significa que o inquilino
   * existe, e aí o passo cumprido decide: quem já conectou o WhatsApp não vê a tela do QR
   * de novo. É o mesmo princípio de `dominio/ativacao.ts` — quem fez a coisa por outro
   * caminho não é obrigado a repetir.
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
        /* Sem agente não existe "Ver funcionando"; sem nada saindo pelo WhatsApp não existe
         * nem o WhatsApp. Quem cai fora dos dois vai direto ao documento fiscal. */
        const depoisDoWhatsApp: EtapaId = v.includes("primeira_conversa") ? "ver" : "fiscal";
        const depoisDoCatalogo: EtapaId = v.includes("whatsapp_conectado") ? "whatsapp" : depoisDoWhatsApp;
        if (google) { setEtapa(depoisDoWhatsApp); return; }
        setEtapa(f.includes("whatsapp_conectado") ? depoisDoWhatsApp : f.includes("catalogo_ajustado") ? depoisDoCatalogo : "catalogo");
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
    return <div style={{ minHeight: "100vh" }} />;
  }

  const meta = ETAPAS.find((e) => e.id === etapa)!;
  const podePular = etapa === "catalogo" || etapa === "whatsapp";
  /* A trilha mostra só o que vai acontecer. Deixar a bolinha de uma etapa que o wizard vai
   * pular é prometer um passo a mais e depois sumir com ele — o contador andaria de 3 para 5. */
  const etapas = ETAPAS.filter((e) => (e.id === "whatsapp" ? temWhatsApp : e.id === "ver" ? temVer : true));
  /** Depois do WhatsApp: demonstrar a conversa, ou o documento fiscal para quem não tem agente. */
  const depoisDoWhatsApp: EtapaId = temVer ? "ver" : "fiscal";
  /** Depois do catálogo: o WhatsApp, ou — para quem só emite recibo — direto ao que importa. */
  const depoisDoCatalogo: EtapaId = temWhatsApp ? "whatsapp" : depoisDoWhatsApp;

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px 48px", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "radial-gradient(60% 55% at 25% 12%, var(--primary-soft) 0%, transparent 60%), radial-gradient(55% 55% at 88% 92%, var(--warm-soft) 0%, transparent 58%)" }} />
      <Toaster />

      <div className="m-enter" style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={s("display:inline-flex;align-items:center;justify-content:center;padding:10px 20px;background:var(--nav);border:1px solid var(--nav-line);border-radius:16px")}>
            <span style={{ ...s("font-size:var(--t-body);font-weight:var(--w-title);color:var(--warm);line-height:1"), textShadow: "0 1.5px 0 var(--warm-line)" }}>maisa</span>
          </div>
          <div style={{ width: "100%", maxWidth: 320 }}><Trilha atual={etapa} etapas={etapas} /></div>
          <div style={{ textAlign: "center" }}>
            <h1 style={s("font-size:var(--t-title);font-weight:var(--w-title);color:var(--ink);margin:0")}>{meta.titulo}</h1>
            <p style={s("font-size:var(--t-sm);color:var(--muted);margin:4px 0 0")}>{meta.sub}</p>
          </div>
        </div>

        <div style={s("background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-card);padding:24px 22px")}>
          {etapa === "negocio" && (
            <EtapaNegocio aoCriar={(uso) => { setValem(passosQueValem(uso)); avancar("catalogo"); }} />
          )}
          {etapa === "catalogo" && <EtapaCatalogo aoSeguir={() => avancar(depoisDoCatalogo)} />}
          {etapa === "whatsapp" && <EtapaWhatsApp aoSeguir={() => avancar(depoisDoWhatsApp)} />}
          {etapa === "ver" && <EtapaVerFuncionando feitos={feitos} aoVoltarParaWhatsApp={() => avancar("whatsapp")} aoSeguir={() => avancar("fiscal")} />}
          {etapa === "fiscal" && <EtapaNotaFiscal aoPainel={aoPainelDoWizard} />}
        </div>

        {/* ⚠️ "Pular" NÃO aparece na etapa 1, e é a única assimetria da tela: as outras três
            configuram, esta CRIA. Sem inquilino não há o que pular para — o painel
            responde 409 em toda rota. */}
        {podePular && (
          <button
            onClick={() => { toast("Você pode fazer isso depois, pelo painel"); avancar(etapa === "catalogo" ? depoisDoCatalogo : depoisDoWhatsApp); }}
            className="m-focus"
            style={s("align-self:center;background:none;border:none;font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--muted);cursor:pointer;padding:8px 12px")}
          >
            Pular por agora
          </button>
        )}
      </div>
    </div>
  );
}
