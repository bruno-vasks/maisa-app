"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * PAREAR O WHATSAPP SEM CÂMERA — o código de 8 caracteres, e o campo que o pede.
 *
 * ── O PROBLEMA QUE ESTE ARQUIVO EXISTE PARA RESOLVER ──
 *
 * O QR pressupõe DOIS aparelhos: um mostrando o código e outro fotografando. Metade dos
 * clientes abre a MAISA no próprio celular — o mesmo aparelho onde o WhatsApp do negócio
 * está instalado. Não existe segunda câmera, e a câmera que existe não fotografa a
 * própria tela. Para essa pessoa o onboarding simplesmente NÃO TERMINA, e o produto não
 * tem como saber: do lado de cá, é só um QR que ninguém leu.
 *
 * O WhatsApp resolve isso oficialmente com "Conectar com número de telefone", que troca a
 * câmera por 8 caracteres digitados. É o que estas peças desenham.
 *
 * ── POR QUE COMPARTILHADO, E NÃO COPIADO NAS DUAS TELAS ──
 *
 * Porque o conteúdo de valor aqui é a INSTRUÇÃO, não o layout: os nomes exatos dos itens
 * do menu do WhatsApp ("Dispositivos conectados", "Conectar dispositivo", "Conectar com número
 * de telefone"; até 14/11/2026 eram "Aparelhos" e estavam velhos). Eles mudam quando o WhatsApp
 * muda, e a pessoa que for corrigir vai
 * corrigir onde viu o erro. Duas cópias garantem que uma delas fique mentindo — e uma
 * instrução errada aqui é o dono procurando um botão que não existe, no minuto em que ele
 * decide se o produto funciona.
 * ────────────────────────────────────────────────────────────────────────────── */

import React from "react";
import { s, Icon, toast } from "@/ui/primitivos";
import { telefoneBonito } from "@/nucleo/dominio/clientes";
import { numeroParaPareamento } from "@/nucleo/dominio/canal";

/**
 * O telefone do jeito que se digita: dígitos no estado, máscara na tela.
 *
 * Guardar o formatado seria guardar pontuação como se fosse dado — e é o que faz um campo
 * recusar um número válido porque sobrou um parêntese. Quem valida de verdade é
 * `numeroParaPareamento`, no domínio, e ele só olha dígitos.
 */
export const digitosDoTelefone = (v: string) => v.replace(/\D/g, "").slice(0, 13);

/** A máscara de exibição. Reusa a do painel para não existir um segundo formato de
 *  telefone no produto. Enquanto o número está incompleto, ela devolve o que der. */
export const telefoneMascarado = (digitos: string) => (digitos ? telefoneBonito(digitos) : "");

/**
 * Os 8 caracteres, grandes, copiáveis, com o passo a passo do WhatsApp ao lado.
 *
 * ── AS TRÊS DECISÕES QUE ESTE COMPONENTE CARREGA ──
 *
 * **Quebra em dois blocos de quatro.** O WhatsApp mostra o campo assim, e um código
 * corrido de 8 caracteres é lido errado por quem está alternando entre dois apps de
 * memória. A quebra é visual: `aria-label` e a cópia levam o código inteiro e limpo.
 *
 * **Copiar é o caminho principal, não um enfeite.** A pessoa vai TROCAR DE APLICATIVO no
 * meio da tarefa — e é aí que se perde um código lido de relance. Com a cópia, o gesto
 * vira colar. O botão continua ao lado do código visível de propósito: `navigator.clipboard`
 * exige contexto seguro e permissão, e falha calado em navegador embutido (o WhatsApp tem
 * o dele). Quando falha, o código ainda está na tela para ler — e o `catch` avisa em vez
 * de fingir que copiou.
 *
 * **Zero cortado e `letter-spacing`.** O WhatsApp emite alfanumérico maiúsculo, onde 0/O e
 * 1/I são o erro mais comum. Era fonte monoespaçada até 30/09/2026, quando o Bruno a vetou no
 * produto inteiro (guarda G21); o `slashed-zero` separa o 0 do O, e o espaçamento separa o
 * resto o bastante para a pessoa conferir o que digitou.
 */
/* ─────────────────────────────────────────────────────────────────────────────
 * O NÚMERO, NA TELA — E A CONFERÊNCIA ANTES DE MANDAR.
 *
 * ── O RELATO QUE CRIOU ESTAS DUAS PEÇAS (18/08/2026) ──
 *
 * *"Meu colega digitou o número errado, e não tinha como ele ver que tinha feito isso. É
 * legal gerar um alerta para ver se o número tá certo, e sempre deixar o número digitado
 * escrito em algum lugar."*
 *
 * Ele estava certo, e o defeito era estrutural: o telefone existia só no campo de entrada.
 * No instante em que o código de pareamento aparecia, o campo saía da tela e o número ia
 * viver num `useRef` — com um comentário, no `store.tsx`, dizendo *"`ref` e não `state`:
 * nenhuma tela desenha isto"*. Ou seja: a decisão de esconder era deliberada, tomada quando
 * o único usuário era quem tinha escrito o código e sabia o próprio número de cor.
 *
 * O sintoma de errar um dígito é caro e mudo: o WhatsApp manda o código de pareamento para
 * OUTRA pessoa, aqui não chega erro nenhum (o número é válido, existe, só não é o dele), e a
 * tela fica em "esperando você digitar o código" até o prazo vencer. A conclusão de quem
 * está do lado de cá é "o produto não funciona".
 *
 * Por isso duas peças, com papéis diferentes:
 *
 *   • `ConferirNumero` — a parada antes de mandar. Não é um `confirm()` de formalidade: é o
 *     único ponto do fluxo em que o número aparece INTEIRO, com DDI, do jeito que vai ser
 *     usado. É onde um dígito a mais salta aos olhos.
 *
 *   • `NumeroDoPareamento` — a etiqueta que fica. Enquanto o código está na tela, o número
 *     fica ao lado dele. Sem isso, "confere se está certo" é um pedido que a tela não
 *     permite atender depois do primeiro segundo.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * O número do jeito que ele vai ser USADO, não do jeito que foi digitado: com DDI, porque é
 * o que sai daqui para o provedor.
 *
 * Passa pelo `numeroParaPareamento` do domínio de propósito — é a MESMA função que decide se
 * o número é aceitável na hora de conectar. Formatar por conta própria abriria a porta para a
 * tela mostrar bonito um número que o domínio recusa, que é o pior tipo de conferência: a que
 * dá confiança errada.
 */
export function telefoneParaConferir(digitos: string): string | null {
  const e164 = numeroParaPareamento(digitos);
  if (!e164) return null;
  /* Brasil é o caso de todo mundo hoje, e o formato nacional é o que a pessoa reconhece.
   * Estrangeiro cai no cru com `+` — melhor um número sem máscara que uma máscara errada. */
  if (e164.startsWith("55") && (e164.length === 12 || e164.length === 13)) {
    return `+55 ${telefoneBonito(e164)}`;
  }
  return `+${e164}`;
}

/** A etiqueta que acompanha o pareamento. `aoCorrigir` some quando não há para onde voltar. */
export function NumeroDoPareamento(
  { digitos, aoCorrigir }: { digitos: string; aoCorrigir?: () => void },
) {
  const bonito = telefoneParaConferir(digitos);
  if (!bonito) return null;

  /* Uma linha, sem caixa (14/11/2026): no visual novo ela mora dentro do cartão do código, e uma
   * caixa cinza ali seria caixa dentro de caixa. */
  return (
    <p style={s("margin:0;display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap;font-size:14px;line-height:1.45;color:var(--muted)")}>
      <span>
        Enviado para{" "}
        <b style={s("color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums")}>{bonito}</b>
      </span>
      {aoCorrigir && (
        <button
          type="button"
          onClick={aoCorrigir}
          className="m-focus"
          style={s("background:none;border:none;padding:2px 0;font:inherit;font-weight:500;color:var(--primary);cursor:pointer")}
        >
          Não é esse número
        </button>
      )}
    </p>
  );
}

/**
 * A conferência. Some do caminho de quem acertou em um clique, e para quem errou é a única
 * chance de perceber.
 *
 * ⚠️ O NÚMERO É O ELEMENTO MAIOR DO BLOCO, e isso é o conteúdo. Uma confirmação em que a
 * pergunta é grande e o dado é pequeno é a confirmação que todo mundo aceita sem ler — e aí
 * ela custa um clique e não entrega nada.
 */
export function ConferirNumero(
  { digitos, aoConfirmar, aoCorrigir, ocupado }: {
    digitos: string;
    aoConfirmar: () => void;
    aoCorrigir: () => void;
    ocupado?: boolean;
  },
) {
  const bonito = telefoneParaConferir(digitos);

  /* Sem âmbar e sem ícone de alerta desde 14/11/2026: conferir é um passo normal, não um perigo.
   * Ela entra NO LUGAR do campo (ver `FaixaCanalLida`), então o número aparece uma vez só. */
  return (
    <div className="m-novo-cascata" style={s("display:flex;flex-direction:column;gap:14px")}>
      <div>
        <p className="m-novo-titulo" style={s("font-size:16px")}>Confira o número</p>
        <p className="m-novo-sub">
          O código de conexão vai para ele. Se estiver errado, vai para outra pessoa e nada acontece aqui.
        </p>
      </div>

      <p style={s(
        "margin:0;font-size:28px;font-weight:600;color:var(--ink);letter-spacing:-0.01em;" +
        "font-variant-numeric:tabular-nums;line-height:1.2",
      )}>
        {bonito ?? "número incompleto"}
      </p>

      <div style={s("display:flex;gap:8px")}>
        <button type="button" onClick={aoCorrigir} className="m-novo-botao tinta m-focus" style={s("flex:1")}>
          Corrigir
        </button>
        <button
          type="button"
          onClick={ocupado || !bonito ? undefined : aoConfirmar}
          aria-disabled={ocupado || !bonito}
          className="m-novo-botao m-focus"
          style={s("flex:1.6")}
        >
          Está certo, enviar
        </button>
      </div>
    </div>
  );
}

/**
 * Quanto tempo a tela dá ao código antes de pedir outro.
 *
 * ⚠️ 60s É A NOSSA JANELA, NÃO UMA GARANTIA DO WHATSAPP. Ninguém publica a validade exata
 * do pairing code, e ela já foi observada variando. O número foi escolhido pelo lado do
 * erro que dói menos: curto demais renova um código que ainda valia (custa uma chamada e
 * um pisca na tela), longo demais deixa a pessoa digitando um código morto — que é
 * exatamente o relato que criou este contador.
 */
const VALIDADE_CODIGO_S = 60;

/**
 * Quanto a tela espera, com a aba à vista, antes de pedir o código novo.
 *
 * ⚠️ ESTE ATRASO E A REGRA DA ABA ESCONDIDA (12/11/2026) EXISTEM POR UM MOTIVO SÓ: quem está no
 * celular troca de aplicativo para digitar o código. Com a aba em segundo plano, o contador
 * continuava andando e, no Android, a renovação podia sair NO MEIO da digitação, trocando o código
 * que a pessoa tinha acabado de copiar. Agora a renovação nunca sai com a aba escondida. Na volta,
 * espera alguns segundos: se a pessoa digitou certo, a consulta de quem chama vê a conexão nesse
 * intervalo e o componente desmonta antes de pedir outro código.
 */
const ESPERA_ANTES_DE_RENOVAR_MS = 3000;

/** O sistema do celular, para dizer onde fica "Dispositivos conectados". `null` = computador ou não sei. */
type Sistema = "iphone" | "android" | null;

/**
 * O vídeo do caminho, quando existe um gravado no sistema da pessoa.
 *
 * ── DE ONDE VEIO (14/11/2026) ──
 *
 * Gravação de tela do Bruno num iPhone, no WhatsApp de 13/11/2026: aba Você, Dispositivos
 * conectados, Conectar dispositivo, Face ID, Conectar com número de telefone, a tela do código.
 * Antes de entrar aqui ela foi cortada (saíram a aba Comunidades, com grupos e o telefone de outra
 * pessoa, e os 7 segundos parados no fim), a foto, o nome e a lista de aparelhos foram borrados,
 * e cada toque ganhou um círculo branco, porque a gravação do iPhone não mostra o dedo. Quem
 * refaz o vídeo a partir da gravação é o `scripts/tutorial-whatsapp/gerar.sh`.
 *
 * ⚠️ SÓ O IPHONE TEM VÍDEO. No Android o caminho começa nos três pontinhos ⋮ e não existe a aba
 * Você: mostrar a gravação do iPhone para quem tem Android ensinaria um botão que não existe. O
 * `android` fica `null` até alguém gravar o mesmo caminho num Android.
 *
 * `passos` é o segundo do vídeo em que começa cada item da lista do `CaminhoNoWhatsApp`, na
 * mesma ordem. É o que acende o passo certo enquanto o vídeo toca.
 */
type Tutorial = { src: string; poster: string; passos: readonly number[] };

const TUTORIAL: Record<Exclude<Sistema, null>, Tutorial | null> = {
  iphone: {
    src: "/tutorial/whatsapp-codigo-iphone.mp4",
    poster: "/tutorial/whatsapp-codigo-iphone.jpg",
    passos: [0, 1.4, 3.3, 6.9],
  },
  android: null,
};

/** Qual passo da lista o vídeo está mostrando agora. */
export function passoNoVideo(passos: readonly number[], segundo: number): number {
  let atual = 0;
  passos.forEach((inicio, i) => { if (segundo >= inicio) atual = i; });
  return atual;
}

function sistemaDoAparelho(): Sistema {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  /* O iPad recente se apresenta como Mac; quem denuncia é a tela de toque. */
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return null;
}

/**
 * O caminho dentro do WhatsApp até o campo do código.
 *
 * ── O RELATO QUE REESCREVEU ESTA LISTA (12/11/2026) ──
 *
 * Uma lead pediu o código no celular, recebeu, e escreveu para a conta oficial: *"Onde digitar o
 * codigo"*. A lista antiga tinha dois buracos:
 *
 *   • mandava abrir o "Menu ⋮", que só existe no Android. No iPhone o caminho começa em
 *     Configurações, na barra de baixo;
 *   • não avisava que "Conectar aparelho" ABRE A CÂMERA. Quem vê a câmera conclui que precisa de
 *     um QR, e o link "Conectar com número de telefone" fica pequeno, embaixo dela.
 *
 * O sistema vem do `userAgent`, e não decide nada além da frase (e do vídeo): errar mostra o
 * caminho do outro sistema, e no computador (ou sem saber) aparecem os dois.
 *
 * ── OS NOMES MUDARAM (14/11/2026) ──
 *
 * A gravação do iPhone mostrou o WhatsApp de hoje: a aba de baixo à direita se chama Você (era
 * Configurações), e o menu diz "Dispositivos conectados" e "Conectar dispositivo" (era
 * "Aparelhos"). O Android segue pelos três pontinhos, com os mesmos nomes novos.
 */
function CaminhoNoWhatsApp() {
  /* Lido depois de montar: no servidor não há `navigator`, e ler no render daria uma frase no
   * HTML e outra na hidratação. */
  const [sistema, setSistema] = React.useState<Sistema>(null);
  React.useEffect(() => { setSistema(sistemaDoAparelho()); }, []);
  const tutorial = sistema ? TUTORIAL[sistema] : null;

  /* O passo que o vídeo está mostrando. `null` enquanto ele não toca (movimento reduzido, modo
   * de economia do iPhone, sem vídeo): aí a lista fica toda acesa, como sempre foi. */
  const [passo, setPasso] = React.useState<number | null>(null);

  const b = (txt: string) => <b style={s("color:var(--ink)")}>{txt}</b>;
  const itens = [
    sistema === "iphone"
      ? <>Abra o {b("WhatsApp")} e toque em {b("Você")}, embaixo à direita</>
      : <>Abra o {b("WhatsApp")} {sistema ? "neste celular" : "no celular com esse número"}</>,
    sistema === "iphone"
      ? <>Toque em {b("Dispositivos conectados")}</>
      : sistema === "android"
        ? <>Toque nos {b("três pontinhos ⋮")}, lá em cima, e em {b("Dispositivos conectados")}</>
        : <>Entre em {b("Dispositivos conectados")}: no Android, pelos {b("três pontinhos ⋮")}; no iPhone, pela aba {b("Você")}</>,
    <>Toque em {b("Conectar dispositivo")}. A câmera abre, mas não precisa apontar para nada</>,
    <>Embaixo da câmera, toque em {b("Conectar com número de telefone")} e cole ou digite o código</>,
  ];

  const lista = (
    <ol className="m-novo-passos" style={s("flex:1;min-width:0")}>
      {itens.map((item, i) => (
        <li
          key={i}
          style={s(`transition:opacity .3s var(--ease-out);opacity:${passo === null || passo === i ? "1" : ".45"}`)}
        >
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );

  if (!tutorial) return lista;
  return (
    <div style={s("display:flex;gap:14px;align-items:flex-start")}>
      <VideoDoCaminho tutorial={tutorial} aoMudarDePasso={setPasso} />
      {lista}
    </div>
  );
}

/**
 * O vídeo pequeno ao lado da lista, tocando sozinho e sem som.
 *
 * Pequeno de propósito: ele mostra ONDE tocar (o círculo, o botão verde, o canto da tela), e quem
 * diz O QUE tocar é a lista ao lado, que acende junto. Para ler a tela do vídeo, um toque abre em
 * tela cheia (no iPhone, o player do próprio sistema).
 *
 * Toca sem `autoPlay` no HTML: quem pediu movimento reduzido vê a capa e toca quando quiser. O
 * `play()` pode ser recusado (modo de economia do iPhone): aí fica a capa, e a lista toda acesa.
 */
function VideoDoCaminho(
  { tutorial, aoMudarDePasso }: { tutorial: Tutorial; aoMudarDePasso: (passo: number | null) => void },
) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const acompanhar = () => aoMudarDePasso(v.paused ? null : passoNoVideo(tutorial.passos, v.currentTime));
    /* O iPhone pausa o vídeo ao sair da tela cheia. Volta a tocar ao lado da lista. */
    const voltou = () => void v.play().catch(() => {});
    v.addEventListener("timeupdate", acompanhar);
    v.addEventListener("pause", acompanhar);
    v.addEventListener("webkitendfullscreen", voltou);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) void v.play().catch(() => {});
    return () => {
      v.removeEventListener("timeupdate", acompanhar);
      v.removeEventListener("pause", acompanhar);
      v.removeEventListener("webkitendfullscreen", voltou);
    };
  }, [tutorial, aoMudarDePasso]);

  const ampliar = () => {
    const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    void v.play().catch(() => {});
    if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else void v.requestFullscreen?.().catch(() => {});
  };

  return (
    /* O canto redondo é a tela de um celular (ver a lista FORMA da guarda G19). */
    <button
      onClick={ampliar}
      aria-label="Ver o vídeo do caminho em tela cheia"
      className="m-press m-focus"
      style={s(
        "flex-shrink:0;width:112px;padding:0;border:1px solid var(--border);border-radius:16px;" +
        "overflow:hidden;background:#000;cursor:pointer;line-height:0",
      )}
    >
      <video
        ref={ref}
        src={tutorial.src}
        poster={tutorial.poster}
        muted
        playsInline
        loop
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
        style={s("display:block;width:100%;aspect-ratio:444/960;object-fit:cover")}
      />
    </button>
  );
}

export function CodigoPareamento(
  { codigo, aoRenovar }: {
    codigo: string;
    /** Pedir outro código ao servidor. A tela chama sozinha quando o contador zera. */
    aoRenovar?: () => void | Promise<void>;
  },
) {
  const [copiou, setCopiou] = React.useState(false);

  /* ── O CONTADOR ──
   *
   * Reinicia quando o CÓDIGO muda, não a cada render: é `codigo` na lista de dependências
   * que faz a renovação zerar o relógio sozinha. Um `useState` inicializado uma vez
   * mostraria o tempo do primeiro código para sempre.
   *
   * Conta a partir de um instante fixo em vez de decrementar um número. Decrementar erra
   * quando a aba fica em segundo plano — o navegador engasga os timers, e o contador
   * mostraria 40s restantes num código que já morreu há meio minuto. Aqui, voltar para a
   * aba mostra a verdade na primeira batida. */
  const [restante, setRestante] = React.useState(VALIDADE_CODIGO_S);

  React.useEffect(() => {
    const nasceu = Date.now();
    setRestante(VALIDADE_CODIGO_S);

    const id = setInterval(() => {
      const falta = Math.max(0, VALIDADE_CODIGO_S - Math.floor((Date.now() - nasceu) / 1000));
      setRestante(falta);
    }, 500);

    return () => clearInterval(id);
  }, [codigo]);

  /* A aba à vista. Ver `ESPERA_ANTES_DE_RENOVAR_MS`: com ela escondida, a pessoa está no
   * WhatsApp digitando, e trocar o código agora estragaria o que ela copiou. */
  const [visivel, setVisivel] = React.useState(true);
  React.useEffect(() => {
    const ler = () => setVisivel(document.visibilityState !== "hidden");
    ler();
    document.addEventListener("visibilitychange", ler);
    return () => document.removeEventListener("visibilitychange", ler);
  }, []);

  /* Renovar é efeito SEPARADO do contador de propósito. Junto, o `setRestante` de cada
   * batida entraria na mesma dependência do disparo e a renovação sairia mais de uma vez
   * — cada uma invalidando o código da anterior, num laço que nunca estabiliza. O
   * `restante` para em 0, e um `setState` com o mesmo valor não repinta: a espera não é
   * reiniciada a cada batida. */
  const jaPediu = React.useRef(false);
  React.useEffect(() => { jaPediu.current = false; }, [codigo]);
  React.useEffect(() => {
    if (restante > 0 || jaPediu.current || !aoRenovar || !visivel) return;
    const id = setTimeout(() => {
      jaPediu.current = true;
      void aoRenovar();
    }, ESPERA_ANTES_DE_RENOVAR_MS);
    return () => clearTimeout(id);
  }, [restante, aoRenovar, visivel]);

  const copiar = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiou(true);
      toast("Código copiado");
      /* Volta ao normal sozinho: o código expira em cerca de um minuto, e um "copiado!"
       * permanente ao lado de um código morto é a informação errada no pior momento. */
      setTimeout(() => setCopiou(false), 2500);
    } catch {
      toast("Não consegui copiar — digite o código do lado");
    }
  }, [codigo]);

  /* O visual novo (14/11/2026): sem caixa própria (ela mora dentro do cartão do WhatsApp), o
   * código grande, "Copiar" como botão de tinta, e entrando em cascata com a mola do iOS. */
  return (
    <div className="m-novo-cascata" style={s("display:flex;flex-direction:column;gap:18px")}>
      <div style={s("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap")}>
        <span
          aria-label={`Código de pareamento ${codigo}`}
          style={s(
            "font-variant-numeric:tabular-nums slashed-zero;font-size:28px;font-weight:600;" +
            "letter-spacing:.1em;color:var(--ink);white-space:nowrap",
          )}
        >
          {codigo.slice(0, 4)}<span style={s("opacity:.35;margin:0 .08em")}>-</span>{codigo.slice(4)}
        </span>

        <button
          type="button"
          onClick={() => void copiar()}
          className="m-novo-botao tinta curto m-focus"
          style={s(copiou ? "background:var(--success-soft);color:var(--success)" : "")}
        >
          <Icon name={copiou ? "check" : "copy"} size={16} stroke="currentColor" />
          {copiou ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* O caminho EXATO do menu. Ver o cabeçalho: é o conteúdo que este arquivo protege
          de virar duas cópias divergentes. */}
      <CaminhoNoWhatsApp />

      {/* ⚠️ ESTE PARÁGRAFO DIZIA O CONTRÁRIO até 17/08/2026: "diz que o prazo existe SEM
          cronômetro — um contador transforma uma tarefa de 20 segundos em corrida contra o
          relógio". O raciocínio estava certo e a premissa estava errada. Não é tarefa de 20
          segundos: é trocar de aplicativo, achar um menu de três níveis e colar. O relato
          que derrubou o argumento foi "o meu código expirou no meio" — e sem contador a
          pessoa não tem como saber que foi isso que aconteceu. Ela conclui que digitou
          errado, e digita de novo.

          O que mata a corrida contra o relógio não é esconder o relógio, é a renovação
          automática: zerou, chega outro sozinho. Desde 14/11/2026 o relógio é neutro do começo
          ao fim (ficava âmbar nos últimos 15s): com a troca automática, não há o que apressar. */}
      <div style={s("display:flex;align-items:center;gap:10px;font-size:15px;line-height:1.4;color:var(--muted)")}>
        <span className="m-novo-giro" aria-hidden />
        {/* `aria-live` para quem usa leitor de tela: o número mudando de segundo em segundo
            seria ruído insuportável, então só a TROCA DE FASE é anunciada. */}
        <span aria-live="polite" style={s("flex:1;min-width:0")}>
          {restante > 0 ? "Esperando você digitar o código" : "Trocando por um código novo…"}
        </span>
        {restante > 0 && (
          <span aria-hidden style={s("font-variant-numeric:tabular-nums")}>
            0:{String(restante).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  );
}
