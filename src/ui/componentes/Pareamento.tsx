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
 * do menu do WhatsApp ("Aparelhos conectados", "Conectar aparelho", "Conectar com número
 * de telefone"). Eles mudam quando o WhatsApp muda, e a pessoa que for corrigir vai
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
 * **Monospace e `letter-spacing`.** O WhatsApp emite alfanumérico maiúsculo, onde 0/O e
 * 1/I são o erro mais comum. Fonte de largura fixa não resolve sozinha, mas é o que
 * separa os caracteres o bastante para a pessoa conferir o que digitou.
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

  return (
    <div style={s(
      "display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:var(--r-controle);" +
      "background:var(--surface-2);line-height:1.45",
    )}>
      <Icon name="phone" size={15} stroke="var(--muted)" />
      <span style={s("font-size:var(--t-label);color:var(--muted)")}>
        Código enviado para{" "}
        <b style={s("color:var(--ink);font-variant-numeric:tabular-nums")}>{bonito}</b>
      </span>
      {aoCorrigir && (
        <button
          onClick={aoCorrigir}
          className="m-focus"
          style={s(
            "margin-left:auto;background:none;border:none;padding:2px 0;font-family:inherit;cursor:pointer;" +
            "font-size:var(--t-label);font-weight:var(--w-title);color:var(--primary);text-decoration:underline",
          )}
        >
          Não é esse número
        </button>
      )}
    </div>
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

  return (
    <div style={s(
      "display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:var(--r-painel);" +
      "background:var(--warn-soft);border:1px solid var(--warn-line)",
    )}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="alert" size={17} stroke="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={s("font-size:var(--t-label);color:var(--warn);font-weight:var(--w-title);margin:0")}>
            Confira antes de enviar
          </p>
          <p style={s("font-size:var(--t-label);color:var(--muted);margin:3px 0 0;line-height:1.5")}>
            O WhatsApp manda o código de conexão para este número. Se ele estiver errado, o
            código vai para outra pessoa e nada acontece aqui.
          </p>
        </div>
      </div>

      <p style={s(
        "margin:0;font-size:var(--t-data);font-weight:var(--w-title);color:var(--ink);" +
        "font-variant-numeric:tabular-nums;text-align:center;line-height:1.2",
      )}>
        {bonito ?? "número incompleto"}
      </p>

      <div style={{ display: "flex", gap: 9 }}>
        <button
          onClick={aoCorrigir}
          className="m-hov-bg m-press m-focus"
          style={s(
            "flex:1;height:42px;border:1px solid var(--border);border-radius:var(--r-controle);background:var(--surface);" +
            "color:var(--ink);font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);cursor:pointer",
          )}
        >
          Corrigir
        </button>
        <button
          onClick={aoConfirmar}
          disabled={ocupado || !bonito}
          className="m-hov-primary m-press m-focus"
          style={s(
            "flex:1.4;height:42px;border:none;border-radius:var(--r-controle);background:var(--primary);" +
            "color:var(--on-primary);font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);" +
            `cursor:${ocupado || !bonito ? "not-allowed" : "pointer"};opacity:${ocupado || !bonito ? ".6" : "1"}`,
          )}
        >
          É esse número, enviar
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

  /* Renovar é efeito SEPARADO do contador de propósito. Junto, o `setRestante` de cada
   * batida entraria na mesma dependência do disparo e a renovação sairia mais de uma vez
   * — cada uma invalidando o código da anterior, num laço que nunca estabiliza. */
  const jaPediu = React.useRef(false);
  React.useEffect(() => { jaPediu.current = false; }, [codigo]);
  React.useEffect(() => {
    if (restante > 0 || jaPediu.current || !aoRenovar) return;
    jaPediu.current = true;
    void aoRenovar();
  }, [restante, aoRenovar]);

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

  return (
    <div style={s("display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:var(--r-painel);background:var(--surface)")}>
      <div style={s("display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
        <span
          aria-label={`Código de pareamento ${codigo}`}
          style={s(
            "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;font-weight:var(--w-title);" +
            "letter-spacing:.18em;color:var(--ink);white-space:nowrap",
          )}
        >
          {codigo.slice(0, 4)}<span style={s("opacity:.35;margin:0 .12em")}>-</span>{codigo.slice(4)}
        </span>

        <button
          onClick={() => void copiar()}
          className="m-hov-bg m-press m-focus"
          style={s(
            "display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border-radius:var(--r-controle);" +
            "border:1px solid var(--border);background:var(--surface);font-family:inherit;font-size:var(--t-label);" +
            `font-weight:var(--w-title);cursor:pointer;color:${copiou ? "var(--success)" : "var(--muted)"}`,
          )}
        >
          <Icon name={copiou ? "check" : "copy"} size={15} stroke="currentColor" />
          {copiou ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* O caminho EXATO do menu. Ver o cabeçalho: é o conteúdo que este arquivo protege
          de virar duas cópias divergentes. */}
      <ol style={s("margin:0;padding-left:17px;font-size:var(--t-label);color:var(--muted);line-height:1.75")}>
        <li>Abra o <b style={s("color:var(--ink)")}>WhatsApp</b> neste mesmo celular</li>
        <li>Menu <b style={s("color:var(--ink)")}>⋮</b> → <b style={s("color:var(--ink)")}>Aparelhos conectados</b></li>
        <li>
          <b style={s("color:var(--ink)")}>Conectar aparelho</b> → toque em{" "}
          <b style={s("color:var(--ink)")}>Conectar com número de telefone</b>
        </li>
        <li>Digite (ou cole) o código acima</li>
      </ol>

      {/* ⚠️ ESTE PARÁGRAFO DIZIA O CONTRÁRIO até 17/08/2026: "diz que o prazo existe SEM
          cronômetro — um contador transforma uma tarefa de 20 segundos em corrida contra o
          relógio". O raciocínio estava certo e a premissa estava errada. Não é tarefa de 20
          segundos: é trocar de aplicativo, achar um menu de três níveis e colar. O relato
          que derrubou o argumento foi "o meu código expirou no meio" — e sem contador a
          pessoa não tem como saber que foi isso que aconteceu. Ela conclui que digitou
          errado, e digita de novo.

          O que mata a corrida contra o relógio não é esconder o relógio, é a renovação
          automática logo abaixo: zerou, chega outro sozinho. */}
      <div style={s("display:flex;align-items:center;gap:9px;font-size:var(--t-label);line-height:1.5")}>
        <span
          aria-hidden
          style={s(
            `display:inline-flex;align-items:center;justify-content:center;min-width:46px;height:24px;` +
            `padding:0 8px;border-radius:99px;font-variant-numeric:tabular-nums;font-weight:var(--w-title);` +
            (restante > 15
              ? "background:var(--surface-2);color:var(--muted)"
              : "background:var(--warn-soft);color:var(--warn)"),
          )}
        >
          {restante > 0 ? `0:${String(restante).padStart(2, "0")}` : "…"}
        </span>
        {/* `aria-live` para quem usa leitor de tela: o número mudando de segundo em segundo
            seria ruído insuportável, então só a TROCA DE FASE é anunciada. */}
        <span aria-live="polite" style={s("color:var(--muted)")}>
          {restante > 0
            ? <>Vale por mais <b style={s("color:var(--ink)")}>{restante}s</b>. Depois disso eu troco por um novo, sozinho.</>
            : <>Pedindo um código novo…</>}
        </span>
      </div>
    </div>
  );
}
