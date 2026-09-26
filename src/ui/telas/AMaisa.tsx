"use client";
/* MAISA — Ajustes da assistente.
 *
 * Uma seção por vez, e um celular ao lado mostrando o efeito. É a tela mais
 * importante do produto: aqui o usuário decide quanto vai delegar. Se ele não
 * enxerga a consequência, não delega.
 *
 * Por isso o preview não é decorativo — ele troca de conteúdo conforme a seção
 * aberta e reflete o tom e o estado (online/pausada) que estão configurados
 * agora. Abrir "Horário" mostra a MAISA respondendo sobre horário.
 *
 * Tudo aqui é controlado pelo store, então o preview reage enquanto você digita. */

import React from "react";
import { s, Btn, Icon, Toggle, Estado } from "@/ui/primitivos";
import { DeQuemEEsseNumero } from "@/ui/componentes/DeQuemEEsseNumero";
import { LinhaDeStatus } from "@/ui/componentes/StatusDaMaisa";
import { Esqueleto, FalhaDeLeitura } from "@/ui/componentes/EstadoDeLeitura";
import {
  CodigoPareamento, ConferirNumero, NumeroDoPareamento,
  digitosDoTelefone, telefoneMascarado, telefoneParaConferir,
} from "@/ui/componentes/Pareamento";
import { useIsMobile } from "@/ui/useIsMobile";
import * as D from "@/adaptadores/saida/demo";
import { useStore } from "@/ui/estado/store";
import { Moldura } from "@/ui/componentes/Moldura";
import { RECORTES, falasDoPreview, recorteAtivo, type RecorteId } from "@/ui/telas/ajustes";


/* ───────────────────────────── peças ───────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--muted)")}>{children}</span>;
}

const CAMPO = "width:100%;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none";

function LinhaToggle({ titulo, desc, on, alternar }: { titulo: string; desc: string; on: boolean; alternar: () => void }) {
  return (
    <div style={s("display:flex;align-items:center;gap:16px;padding:13px 0;border-bottom:1px solid var(--line)")}>
      <span style={s("flex:1;min-width:0")}>
        <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>{titulo}</span>
        <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;line-height:1.45")}>{desc}</span>
      </span>
      <Toggle on={on} onChange={alternar} rotulo={titulo} />
    </div>
  );
}

/* Interruptor mestre. Vive fora do acordeão porque é a decisão mais consequente da
   tela: desligar aqui para o atendimento inteiro.

   ⚠️ DESDE 24/09/2026 O TEXTO NÃO VEM DO INTERRUPTOR, vem de `st.statusMaisa` (interruptor E
   canal). A faixa antiga dizia "Assistente ativa · responde automaticamente" em verde com a
   faixa do canal logo abaixo dizendo "WhatsApp não conectado". Sem WhatsApp, o interruptor
   fica desligado de verdade, com o motivo: ligá-lo não faria ninguém ser respondido. A linha
   mora em `componentes/StatusDaMaisa.tsx`, com os rótulos. */
/**
 * Gravou? (1A.8, 07 P0.5) Os Ajustes não têm botão Salvar: cada mudança vai sozinha para o
 * servidor depois de meio segundo. Sem este sinal o dono mudava o sábado e saía sem saber se o
 * cliente já ia ouvir o horário novo. "Salvo" só com a resposta do servidor; "Não salvou" com o
 * motivo e o botão que reaplica a mesma mudança (`st.salvar`).
 *
 * `aria-live` porque a mudança acontece longe do campo: quem usa leitor de tela precisa ouvir.
 */
function IndicadorDeGravacao() {
  const st = useStore();
  const g = st.gravacao;
  return (
    <span aria-live="polite" style={s("display:inline-flex;align-items:center;gap:8px;font-size:var(--t-label);font-weight:var(--w-data);white-space:nowrap")}>
      {g.fase === "salvando" && <span style={s("color:var(--muted)")}>Salvando…</span>}
      {g.fase === "salva" && <span style={s("color:var(--success)")}>Salvo</span>}
      {g.fase === "falhou" && (
        <>
          <span title={g.motivo} style={s("color:var(--danger)")}>Não salvou.</span>
          {/* Texto clicável e não `Btn`: dentro da linha do rótulo um botão com fundo dobrava a
              altura da faixa. A margem negativa dá alvo de 36px sem empurrar a linha. */}
          <button
            type="button"
            onClick={st.salvar}
            className="m-press m-focus"
            style={s("min-height:36px;margin:-10px -6px;padding:0 6px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);color:var(--primary);text-decoration:underline;text-underline-offset:3px")}
          >
            Tentar de novo
          </button>
        </>
      )}
    </span>
  );
}

function FaixaAssistente() {
  return <LinhaDeStatus gravacao={<IndicadorDeGravacao />} />;
}

/* ───────────────────────────── o canal de WhatsApp ─────────────────────────────
 * PROVISÓRIA, e assumidamente. A tela oficial de conexão entra na segunda leva de
 * onboarding; esta existe para que o canal deixe de ser operável só por `curl`.
 *
 * Mora AQUI, junto da faixa de "assistente ativa", porque as duas respondem à mesma
 * pergunta do dono: "a MAISA está no ar?". Assistente pausada e WhatsApp desconectado
 * produzem o mesmo silêncio do lado do cliente, e separá-las em telas diferentes faria
 * procurar em dois lugares por um sintoma só.
 *
 * ⚠️ AS DUAS AÇÕES DESTRUTIVAS PEDEM CONFIRMAÇÃO EM DOIS TOQUES, e não é cerimônia:
 * desconectar derruba o atendimento de um negócio que pode estar no meio de uma conversa,
 * e trocar número perde o pareamento atual sem volta. Um `confirm()` do navegador seria
 * mais fácil e é pior — ele é bloqueante, alguns navegadores o suprimem, e ninguém lê.
 */

/**
 * O telefone de quem assume a conversa quando a MAISA desiste.
 *
 * ── POR QUE ISTO GANHOU UM CAMPO NA TELA (17/08/2026) ──
 *
 * Porque o destino da escalação era `MAISA_WHATSAPP_DONO`, uma variável de ambiente — UM
 * número para todos os inquilinos. O aviso carrega o telefone do cliente final, então isso
 * era o número do cliente da barbearia do Zé chegando no WhatsApp de outra pessoa. E o Zé
 * nunca era avisado: toda conversa que a MAISA não resolvia morria com o cliente esperando
 * e o dono sem saber que havia alguém esperando.
 *
 * Vazio é permitido e não é erro. O texto diz a CONSEQUÊNCIA de deixar em branco em vez de
 * exigir preenchimento — um canal que atende vale mais que um canal que não sobe por falta
 * de campo opcional, e o dono decide se quer ser incomodado.
 */
function DonoDoCanal() {
  const st = useStore();
  const gravado = st.canal?.telefoneDono ?? null;

  const [valor, setValor] = React.useState("");
  const [editando, setEditando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  /* Sincroniza com o servidor só quando NÃO se está editando: sem essa guarda, o polling
   * do pareamento (de 3 em 3 segundos) sobrescreveria o que o dono está digitando. */
  React.useEffect(() => {
    if (!editando) setValor(gravado ? telefoneMascarado(gravado) : "");
  }, [gravado, editando]);

  const salvar = async () => {
    setSalvando(true);
    const ok = await st.definirDonoDoCanal(digitosDoTelefone(valor));
    setSalvando(false);
    if (ok) setEditando(false);
  };

  return (
    <div style={s("display:flex;flex-direction:column;gap:7px;padding-top:11px;border-top:1px solid var(--line)")}>
      <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--muted)")}>
        Quem a MAISA chama quando precisa de ajuda
      </span>

      <div style={s("display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
        <input
          value={valor}
          onChange={(e) => { setEditando(true); setValor(telefoneMascarado(digitosDoTelefone(e.target.value))); }}
          onKeyDown={(e) => { if (e.key === "Enter" && editando) void salvar(); }}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          aria-label="WhatsApp de quem recebe os avisos"
          className="m-focus"
          style={s(`${CAMPO};height:40px;max-width:220px`)}
        />
        {editando && (
          <>
            <Btn variant="primary" size="sm" onClick={salvando ? undefined : () => void salvar()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setEditando(false); setValor(gravado ? telefoneMascarado(gravado) : ""); }}>
              Cancelar
            </Btn>
          </>
        )}
      </div>

      {/* Diz a CONSEQUÊNCIA de cada estado, não a regra. Vazio não é erro — é uma escolha
          com um custo, e o custo é que ninguém sabe que um cliente ficou esperando. */}
      <span style={s(`font-size:var(--t-label);line-height:1.5;color:${gravado ? "var(--muted)" : "var(--warn)"}`)}>
        {gravado
          ? "Ela manda um aviso com o telefone do cliente e um link para você assumir a conversa."
          : "Em branco, quando ela não consegue resolver, ninguém é avisado: o cliente fica esperando e você não fica sabendo."}
      </span>
    </div>
  );
}

/* ⚠️ `canal === null` NÃO É "desconectado" (24/09/2026). Era: `st.canal?.status ??
 * "desconectado"` desenhava "WhatsApp não conectado" com o botão de conectar antes de a leitura
 * voltar, e para sempre quando ela falhava. Agora, sem leitura, esqueleto; leitura que falhou,
 * a frase e "Tentar de novo". Só depois disso a faixa decide. */
function FaixaCanal() {
  const st = useStore();
  if (st.canal === null) {
    return st.canalErro
      ? (
        <div style={s("flex-shrink:0;border-radius:12px;background:var(--surface);border:1px solid var(--border)")}>
          <FalhaDeLeitura compacta frase="Não consegui ler o seu WhatsApp." detalhe={st.canalErro} tentar={st.recarregarCanal} />
        </div>
      )
      : <Esqueleto linhas={1} altura={64} rotulo="Lendo o seu WhatsApp" />;
  }
  return <FaixaCanalLida />;
}

function FaixaCanalLida() {
  const st = useStore();
  const noCelular = useIsMobile();
  const [confirmando, setConfirmando] = React.useState<"trocar" | "desconectar" | null>(null);

  /* ── QUAL CAMINHO A TELA OFERECE ──
   *
   * O padrão vem do APARELHO, não de uma preferência salva: no celular o QR é impossível
   * de ler (a câmera não fotografa a própria tela), e no computador o código de 8
   * caracteres é trabalho a mais para quem já tem o celular do lado.
   *
   * ⚠️ `escolha` é `null` até alguém trocar de propósito, e a derivação acontece no
   * RENDER. Não dá para inicializar o `useState` com `noCelular`: `useIsMobile` devolve
   * `false` no primeiro render e só sincroniza depois do mount, então o estado congelaria
   * em "desktop" para todo mundo — exatamente o público que este trabalho atende. */
  const [escolha, setEscolha] = React.useState<"qr" | "codigo" | null>(null);
  const porCodigo = escolha ? escolha === "codigo" : noCelular;

  const [telefone, setTelefone] = React.useState("");
  /* Mostrar o QR mesmo tendo pedido código. O servidor devolve os dois, e este botão é a
   * saída de quem tem um segundo aparelho quando o código não funciona. */
  const [verQr, setVerQr] = React.useState(false);
  /** A parada antes de mandar o código para um número digitado. Ver `ConferirNumero`. */
  const [conferindo, setConferindo] = React.useState(false);

  const status = st.canal?.status ?? "desconectado";
  const conectado = status === "conectado";
  const pareando = status === "pareando" || !!st.qrcode || !!st.codigo;
  /* O código ganha da imagem enquanto o dono não pedir o contrário: quem chegou aqui por
   * este caminho está no celular, e um QR aparecendo no lugar do código parece erro. */
  const mostrandoCodigo = !!st.codigo && !verQr;

  const forte = conectado ? "var(--success)" : pareando ? "var(--warn)" : "var(--muted)";
  const fundo = conectado ? "var(--success-soft)" : pareando ? "var(--warn-soft)" : "var(--surface-2)";

  /* Conectado, o número É o título (07 P0.6): formatado, numa linha, e não "+5511…" cru num
   * subtítulo que o botão cobria a 390px. */
  const titulo = conectado
    ? st.canal?.numero ? `Conectado no ${D.telefoneBonito(st.canal.numero)}` : "WhatsApp conectado"
    : pareando
      ? mostrandoCodigo ? "Aguardando o código no WhatsApp" : "Aguardando leitura do QR"
      : "WhatsApp não conectado";
  const sub = conectado
    ? null
    : pareando
      ? mostrandoCodigo
        ? "Aparelhos conectados → Conectar aparelho → Conectar com número de telefone"
        : "Abra o WhatsApp do negócio → Aparelhos conectados → Conectar aparelho"
      : "A MAISA não consegue responder enquanto isso";

  /* Um lugar só decide o que vai no corpo do POST, e as duas ações (conectar e trocar)
   * passam por aqui. Separá-las é como se perde o `numero` no caminho da troca — que é o
   * pior momento, porque lá o canal antigo JÁ FOI derrubado. */
  const argumentos = () => (porCodigo ? { numero: digitosDoTelefone(telefone) } : undefined);
  const faltaTelefone = porCodigo && digitosDoTelefone(telefone).length < 10;

  /* Rótulo em vez de `disabled`: `Btn` não tem essa prop, e criar uma só para cá
   * significaria mexer num primitivo usado por toda a aplicação por causa desta faixa. */
  const ocupado = st.canalOcupado;

  /* O servidor não consegue conectar (falta variável de ambiente). A faixa some com os
   * botões que derrubariam o canal atual — porque derrubar seria definitivo: o
   * `conectar` de volta é justamente o que não funciona. Ver `trocarNumero` no store. */
  const travado = st.canalFaltando.length > 0;

  return (
    /* `m-canal` é um contêiner (`container-type:inline-size`, `globals.css`): em caixa estreita as
       ações descem para uma linha própria, abaixo do número (1C.13). Por @container e não por
       `useIsMobile`, porque quem decide é a largura do bloco, não a do aparelho. */
    <div className="m-canal" style={s(`flex-shrink:0;display:flex;flex-direction:column;gap:12px;padding:13px 16px;border-radius:12px;background:${fundo};border:1px solid ${forte}`)}>
      <div className="m-canal-linha">
        <span style={s(`width:9px;height:9px;flex-shrink:0;border-radius:50%;background:${forte}`)} />
        <span style={s("flex:1;min-width:0")}>
          <span style={s(`display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:${forte}`)}>{titulo}</span>
          {sub && <span style={s("display:block;font-size:var(--t-label);color:var(--ink);margin-top:2px;line-height:var(--lh-ui)")}>{sub}</span>}
        </span>

        <span className="m-canal-acoes" style={s("display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap")}>
          {!conectado && !pareando && !travado && (
            <Btn
              variant="whats"
              size="sm"
              onClick={ocupado || faltaTelefone
                ? undefined
                /* Por código, o número foi DIGITADO e pode estar errado — confere antes.
                 * Por QR não há o que conferir: quem aponta a câmera é o dono do aparelho. */
                : porCodigo ? () => setConferindo(true) : () => void st.conectarCanal(argumentos())}
            >
              {/* O rótulo carrega o estado, seguindo a convenção da faixa (ver `ocupado`
                  acima): um botão que não faz nada e não diz por quê é o jeito mais rápido
                  de a pessoa concluir que o produto travou. */}
              {ocupado ? "Gerando…" : faltaTelefone ? "Digite o número" : porCodigo ? "Receber código" : "Conectar WhatsApp"}
            </Btn>
          )}

          {pareando && (
            <Btn variant="secondary" size="sm" onClick={ocupado ? undefined : () => void st.desconectarCanal()}>
              {ocupado ? "…" : "Cancelar"}
            </Btn>
          )}

          {conectado && confirmando === null && !travado && (
            <>
              <Btn variant="secondary" size="sm" onClick={() => setConfirmando("trocar")}>Trocar número</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmando("desconectar")}>Desconectar</Btn>
            </>
          )}

          {conectado && confirmando !== null && (
            <>
              <Btn
                variant="danger"
                size="sm"
                onClick={ocupado || (confirmando === "trocar" && faltaTelefone) ? undefined : () => {
                  /* Trocar leva o `numero` junto. Quem está no celular vai cair no mesmo
                   * QR ilegível de sempre — e aqui é pior, porque a troca já derrubou o
                   * canal antes de mostrar o que não dá para ler. */
                  const acao = confirmando === "trocar"
                    ? () => st.trocarNumero(argumentos())
                    : () => st.desconectarCanal();
                  setConfirmando(null);
                  void acao();
                }}
              >
                {ocupado
                  ? "…"
                  : confirmando === "trocar"
                    ? faltaTelefone ? "Digite o número novo" : "Sim, trocar"
                    : "Sim, desconectar"}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmando(null)}>Voltar</Btn>
            </>
          )}
        </span>
      </div>

      {/* Diz a variável pelo nome. "Falta configuração no servidor" foi exatamente a frase
          que, em 13/08/2026, não permitiu descobrir que faltava `MAISA_PUBLIC_URL`. */}
      {travado && (
        <span style={s("font-size:var(--t-label);color:var(--danger);line-height:1.5")}>
          O servidor não está pronto para conectar o WhatsApp. Falta:{" "}
          <b>{st.canalFaltando.join(", ")}</b>. Os botões estão travados de propósito — sem isso,
          desconectar seria definitivo.
        </span>
      )}

      {/* ⚠️ `--warn` E NÃO `--danger`, desde 18/08/2026. Vermelho aqui dizia "algo deu
          errado" para uma frase que descreve uma CONSEQUÊNCIA de algo que ainda não
          aconteceu. O vermelho fica no botão que executa — que é o que de fato destrói. O
          relato que mudou isto foi sobre o wizard; a mesma confusão vivia aqui. */}
      {confirmando !== null && (
        <span style={s("font-size:var(--t-label);color:var(--warn);line-height:1.5")}>
          {confirmando === "trocar"
            ? porCodigo
              ? "O número atual será desconectado. Digite o número novo abaixo — o código de conexão vai para ele."
              : "O número atual será desconectado e você terá que parear o novo lendo um QR."
            : "A MAISA para de responder no WhatsApp até você conectar de novo."}
        </span>
      )}

      {/* Na troca, o número novo aparece inteiro antes de o canal antigo cair: aqui errar um
          dígito custa o WhatsApp que estava funcionando. */}
      {confirmando === "trocar" && porCodigo && !faltaTelefone && (
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
          O código vai para{" "}
          <b style={s("color:var(--ink);font-variant-numeric:tabular-nums")}>
            {telefoneParaConferir(digitosDoTelefone(telefone))}
          </b>
        </span>
      )}

      {/* ── O CAMPO DO TELEFONE ──
          Aparece só no caminho do código, e nos dois momentos em que ele é pedido: a
          primeira conexão e a troca de número. Some durante o pareamento — nessa hora o
          número já foi usado e o campo só competiria com o código pela atenção. */}
      {porCodigo && !pareando && !travado && (conectado ? confirmando === "trocar" : true) && (
        <label style={s("display:flex;flex-direction:column;gap:7px")}>
          <span style={s("font-size:var(--t-label);font-weight:var(--w-title);color:var(--muted)")}>
            Número do WhatsApp do negócio
          </span>
          <input
            value={telefoneMascarado(digitosDoTelefone(telefone))}
            onChange={(e) => setTelefone(digitosDoTelefone(e.target.value))}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            className="m-focus"
            style={s(`${CAMPO};height:42px;max-width:260px`)}
          />
          {/* Diz o que o número FAZ. Sem esta linha ele parece cadastro — e cadastro numa
              tela de conexão é a hora em que a pessoa desconfia do que está entregando. */}
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
            É para onde o WhatsApp vai mandar o código de conexão. Ele não fica salvo aqui.
          </span>
        </label>
      )}

      {/* ── TROCAR DE CAMINHO ──
          Sempre visível enquanto não conectou, e é o que impede alguém de ficar preso: o
          pairing code falha em algumas versões do WhatsApp, e o QR é inútil em um aparelho
          só. Ter os dois a um toque é a diferença entre "não funciona" e "usei o outro". */}
      {!conectado && !travado && !ocupado && (
        <button
          onClick={() => {
            /* Três situações, e elas exigem ações diferentes de propósito:
             *
             * 1. Pareamento em curso COM código: o servidor mandou os dois, então trocar é
             *    só alternar o que se pinta. Nada de rede.
             * 2. Pareamento em curso SEM código (nasceu por QR): o código não existe neste
             *    pareamento e não dá para pedir sem recriar a instância. Então cancela — e
             *    cancelar é o que já faz o botão "Cancelar" ao lado. O campo de telefone
             *    aparece em seguida, e o próximo clique gera o código.
             *
             *    ⚠️ Um botão que só mudasse o rótulo aqui pareceria quebrado, e este é o
             *    exato momento em que a pessoa está tentando desencalhar.
             * 3. Nada em curso: só troca o caminho que será pedido. */
            if (pareando && st.codigo) { setVerQr((v) => !v); return; }
            if (pareando) {
              /* Sempre PARA o código, nunca alterna. Só se chega aqui olhando um QR — seja
               * porque foi ele que se pediu, seja porque o servidor não gerou o código. Nos
               * dois casos o que a pessoa quer é o caminho sem câmera. */
              void st.desconectarCanal();
              setVerQr(false);
              setEscolha("codigo");
              return;
            }
            setVerQr(false);
            setEscolha(porCodigo ? "qr" : "codigo");
          }}
          className="m-focus"
          style={s(
            "align-self:flex-start;background:none;border:none;padding:0;font-family:inherit;cursor:pointer;" +
            "font-size:var(--t-label);font-weight:var(--w-title);color:var(--primary);text-decoration:underline",
          )}
        >
          {/* O rótulo segue o que está NA TELA, não o que foi pedido: quem pediu código e
              recebeu só QR (o pairing code falha calado em algumas versões) está olhando um
              QR, e "prefiro ler o QR" seria uma oferta do que ele já tem. */}
          {pareando && st.codigo
            ? mostrandoCodigo ? "Prefiro ler o QR code" : "Voltar para o código"
            : pareando ? "Não consigo ler o QR — usar código"
            : porCodigo ? "Prefiro ler o QR code" : "Estou no celular — usar código"}
        </button>
      )}

      {/* Os dois são EFÊMEROS: a Evolution troca o QR a cada poucos segundos, o código do
          WhatsApp vale cerca de um minuto, e o polling do store remove os dois no instante
          em que conecta. Nunca guardamos isto em lugar nenhum. */}
      {conferindo && !pareando && !conectado && (
        <ConferirNumero
          digitos={digitosDoTelefone(telefone)}
          ocupado={ocupado}
          aoCorrigir={() => setConferindo(false)}
          aoConfirmar={() => { setConferindo(false); void st.conectarCanal(argumentos()); }}
        />
      )}

      {mostrandoCodigo && st.codigo && (
        <CodigoPareamento codigo={st.codigo} aoRenovar={st.renovarCodigo} />
      )}

      {/* O número para onde o código foi, enquanto ele está na tela. Ver o cabeçalho de
          `NumeroDoPareamento`: sem isto, um dígito errado é indistinguível de "o produto não
          funciona" — o código sai, ninguém digita, e o prazo vence. */}
      {pareando && st.numeroPareando && (
        <NumeroDoPareamento
          digitos={st.numeroPareando}
          aoCorrigir={() => {
            const volta = st.numeroPareando ?? "";
            void st.desconectarCanal();
            setTelefone(volta);
            setEscolha("codigo");
            setVerQr(false);
            setConferindo(false);
          }}
        />
      )}

      {!mostrandoCodigo && st.qrcode && (
        <div style={s("display:flex;align-items:center;gap:16px;padding:12px;border-radius:12px;background:var(--surface)")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={st.qrcode}
            alt="QR code para conectar o WhatsApp"
            style={s("width:148px;height:148px;flex-shrink:0;border-radius:8px;background:#fff;image-rendering:pixelated")}
          />
          <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.6")}>
            Leia com o celular do <b>número do negócio</b>.<br />
            A tela avisa sozinha quando conectar.
          </span>
        </div>
      )}

      {/* ── QUEM RECEBE O "PRECISO DE VOCÊ" ──
          Mora na faixa do canal e não numa tela de ajustes porque é a mesma pergunta que o
          pareamento responde: por onde a MAISA fala com o negócio. Só aparece com canal de
          pé — pedir antes seria cobrar um dado para um WhatsApp que ainda não existe. */}
      {(conectado || pareando) && !travado && <DonoDoCanal />}

      {st.canalErro && (
        <span style={s("font-size:var(--t-label);color:var(--danger);line-height:1.5")}>{st.canalErro}</span>
      )}
    </div>
  );
}

/* ───────────────────────────── conteúdo de cada seção ───────────────────────────── */

function Personalidade() {
  const st = useStore();
  return (
    <div style={s("display:flex;flex-direction:column;gap:18px")}>
      {/* ⚠️ O NOME DO NEGÓCIO VEM PRIMEIRO, E NÃO É DETALHE DE CADASTRO.
          Ele entra no prompt do agente a cada mensagem ("sou a assistente de ___") e no
          texto de todo lembrete. Até 14/08/2026 nenhuma tela o escrevia: só o
          `criar_negocio()` gravava, uma vez, e um negócio passou três dias chamado
          `bruno.vaskevicius` — o nome saiu no primeiro lembrete que chegou num celular.
          Está aqui, e não numa tela de "configurações", porque é aqui que se decide como
          a MAISA se apresenta — e é a primeira coisa que o cliente ouve dela. */}
      <label style={s("display:flex;flex-direction:column;gap:7px")}>
        <Rotulo>Nome do negócio</Rotulo>
        <input
          value={st.cadastro.negocio.nome}
          onChange={(e) => st.setNomeDoNegocio(e.target.value)}
          className="m-focus"
          style={s(CAMPO)}
        />
        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
          É como a MAISA se apresenta no WhatsApp e o que aparece nos lembretes.
        </span>
      </label>

      <label style={s("display:flex;flex-direction:column;gap:7px")}>
        <Rotulo>Nome do assistente</Rotulo>
        <input
          value={st.assistente.nome}
          onChange={(e) => st.setAssistente({ nome: e.target.value })}
          className="m-focus"
          style={s(CAMPO)}
        />
      </label>

      <div style={s("display:flex;flex-direction:column;gap:8px")}>
        <Rotulo>Tom de voz</Rotulo>
        <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
          {D.TONS.map((t) => {
            const on = st.assistente.tom === t;
            return (
              <button
                key={t}
                onClick={() => st.setAssistente({ tom: t })}
                aria-pressed={on}
                className="m-press m-focus m-hov-prim-border"
                style={s(`display:inline-flex;align-items:center;padding:9px 16px;border-radius:999px;font-size:var(--t-sm);font-weight:var(--w-title);cursor:pointer;text-transform:capitalize;border:1px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"};color:${on ? "var(--primary-dark)" : "var(--muted)"}`)}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* "Mensagem de saudação" SAIU DA TELA em 25/09/2026 (1A.9, 07 P0.3). Era gravada e
          validada, e ninguém a lia: `persona.ts` não usa `assistente.saudacao`. O dono
          escrevia uma saudação caprichada, via no preview, e o cliente nunca recebia. O campo
          continua no banco e no caso de uso; volta quando o prompt ler (decisão do Bruno). */}
      {/* "Assistente ativa" saiu daqui: era cartão dentro de cartão e o interruptor
          mestre não pertence à seção de tom de voz. Agora é a FaixaAssistente. */}
    </div>
  );
}

function Horarios() {
  const st = useStore();
  const CAMPO_HORA = "width:104px;height:38px;text-align:center;border-radius:11px;border:1px solid var(--border-field);background:var(--surface);font-variant-numeric:tabular-nums;font-size:var(--t-sm);font-weight:var(--w-data);color:var(--ink);outline:none";

  return (
    <div style={s("display:flex;flex-direction:column")}>
      {/* Este é o horário do NEGÓCIO, e a frase existe porque a tela tem dois horários a
          poucos cliques de distância: este e o expediente de cada profissional, na tela
          de Equipe. Quem edita aqui achando que muda a agenda não muda — e vice-versa. */}
      <p style={s("margin:0 0 12px;font-size:var(--t-label);color:var(--muted);line-height:1.55")}>
        É o que a MAISA responde quando perguntam <b>&quot;que horas vocês atendem?&quot;</b>. Quem
        decide se cabe marcar às 15h é o expediente de cada profissional, na tela de Equipe.
      </p>

      {st.semanaErro && (
        <p style={s("margin:0 0 12px;font-size:var(--t-label);color:var(--danger);line-height:1.5")}>{st.semanaErro}</p>
      )}

      {st.semana.map((d) => {
        const nome = D.DIAS_DA_SEMANA[d.dow];
        return (
          <div
            key={d.dow}
            style={s("display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:11px 0;border-bottom:1px solid var(--line)")}
          >
            <span style={s(`font-size:var(--t-sm);font-weight:var(--w-title);width:96px;flex-shrink:0;color:${d.aberto ? "var(--ink)" : "var(--muted)"}`)}>{nome}</span>
            <Toggle on={d.aberto} onChange={() => st.alternarDia(d.dow)} rotulo={`${nome} — atende`} />
            {d.aberto ? (
              <div style={s("margin-left:auto;display:flex;align-items:center;gap:9px")}>
                <input
                  type="time"
                  /* `?? ""` porque dia aberto SEM hora não deveria existir — o domínio
                     zera as duas ao fechar e a tela repõe ao reabrir. Se acontecer, o
                     input vazio é melhor que o React trocar de controlado para não
                     controlado no meio da edição. */
                  value={d.de ?? ""}
                  onChange={(e) => st.setHorario(d.dow, "de", e.target.value)}
                  aria-label={`${nome} — abre às`}
                  className="m-focus"
                  style={s(CAMPO_HORA)}
                />
                <span style={s("font-size:var(--t-sm);color:var(--muted)")}>às</span>
                <input
                  type="time"
                  value={d.ate ?? ""}
                  onChange={(e) => st.setHorario(d.dow, "ate", e.target.value)}
                  aria-label={`${nome} — fecha às`}
                  className="m-focus"
                  style={s(CAMPO_HORA)}
                />
              </div>
            ) : (
              <span style={s("margin-left:auto;font-size:var(--t-sm);font-weight:var(--w-data);color:var(--muted)")}>Fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListaToggles({ itens }: { itens: { chave: D.ChaveCfg; titulo: string; desc: string }[] }) {
  const st = useStore();
  return (
    <div style={s("display:flex;flex-direction:column")}>
      {itens.map((t) => (
        <React.Fragment key={t.chave}>
          <LinhaToggle titulo={t.titulo} desc={t.desc} on={st.cfg[t.chave]} alternar={() => st.alternarCfg(t.chave)} />
          {/* ★ O PRAZO MORA COLADO NO INTERRUPTOR QUE O LIGA, e não numa seção própria: são
              a mesma decisão em duas metades ("manda?" e "quando?"), e separá-las faria o
              dono ligar o lembrete numa tela e descobrir o prazo em outra. Aparece só com o
              toggle ligado — escolher a antecedência de um lembrete que não sai é ajustar o
              nada. */}
          {t.chave === "lembrete" && st.cfg.lembrete && <Antecedencia />}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Quanto antes o lembrete sai.
 *
 * ⚠️ LISTA FECHADA, E NÃO CAMPO LIVRE. O campo livre em horas é o desenho que já existiu no
 * produto antigo, e ele erra dos dois lados: aceita `2` numa agenda de terapia, onde não dá
 * tempo de remarcar, e aceita `100` sem que ninguém saiba quantos dias isso é. A lista tem o
 * prazo escrito em português e resolve por reconhecimento. Ver `OPCOES_ANTECEDENCIA`.
 *
 * O valor fora da lista continua aparecendo — `rotuloDaAntecedencia` cai no genérico —
 * porque o banco aceita qualquer inteiro de 1 a 168, e um `select` que não mostra o valor
 * gravado mostraria outro, mentindo sobre o que está no ar.
 */
function Antecedencia() {
  const st = useStore();
  const atual = st.assistente.lembreteHoras;
  const naLista = D.OPCOES_ANTECEDENCIA.some((o) => o.horas === atual);
  return (
    <div style={s("display:flex;align-items:center;gap:16px;padding:13px 0;border-bottom:1px solid var(--line)")}>
      <span style={s("flex:1;min-width:0")}>
        <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title)")}>Quando mandar</span>
        <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:2px;line-height:1.45")}>
          Sessão de terapia pede mais tempo que um corte: quem avisa em cima da hora não
          consegue remarcar.
        </span>
      </span>
      <select
        value={atual}
        onChange={(e) => st.setAssistente({ lembreteHoras: Number(e.target.value) })}
        aria-label="Quantas horas antes o lembrete sai"
        className="m-focus"
        style={s("height:38px;padding:0 8px;border-radius:10px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);color:var(--ink);outline:none;cursor:pointer")}
      >
        {!naLista && <option value={atual}>{D.rotuloDaAntecedencia(atual)}</option>}
        {D.OPCOES_ANTECEDENCIA.map((o) => (
          <option key={o.horas} value={o.horas}>{o.rotulo}</option>
        ))}
      </select>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DÚVIDAS FREQUENTES — o que o dono escreve e a MAISA passa a responder.
 *
 * Esta seção é a metade que faltava desde a criação do banco: a tabela `faqs` existia,
 * o provisionamento a semeava, e NENHUMA tela gravava nela — o agente respondia dúvida
 * com uma fixture de demonstração, igual para todo inquilino.
 *
 * ⚠️ SALVA NO BOTÃO, e não enquanto se digita como o resto desta tela. É a única seção
 * assim, e o motivo é custo: cada gravação gera um embedding (uma chamada paga ao
 * provedor), então o debounce por tecla que serve para um toggle geraria dezenas de
 * vetores para uma frase. Aqui o salvar é um ato.
 * ────────────────────────────────────────────────────────────────────────────── */
function Duvidas() {
  const st = useStore();
  const [rascunho, setRascunho] = React.useState<{ id?: string; pergunta: string; resposta: string }>(
    { pergunta: "", resposta: "" },
  );
  const editando = Boolean(rascunho.id);
  const podeSalvar = rascunho.pergunta.trim().length > 0 && rascunho.resposta.trim().length > 0;

  const limpar = () => setRascunho({ pergunta: "", resposta: "" });

  return (
    <div style={s("display:flex;flex-direction:column;gap:16px")}>
      {st.faqsErro && (
        <div style={s("padding:10px 12px;border-radius:10px;background:var(--danger-soft);color:var(--danger);font-size:var(--t-label);line-height:1.5")}>
          {st.faqsErro}
        </div>
      )}

      {/* A lista vem primeiro: o dono precisa ver o que já existe antes de escrever de
          novo o que já está lá. */}
      <div style={s("display:flex;flex-direction:column;gap:8px")}>
        {st.faqs.length === 0 && (
          <span style={s("font-size:var(--t-sm);color:var(--muted);line-height:1.6")}>
            Nada cadastrado ainda. Escreva as perguntas que seus clientes mais fazem — endereço,
            estacionamento, formas de pagamento, política de atraso.
          </span>
        )}

        {st.faqs.map((f) => (
          <div
            key={f.id}
            style={s("display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:1px solid var(--border);border-radius:12px;background:var(--surface)")}
          >
            <div style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:3px")}>
              <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{f.pergunta}</span>
              <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>{f.resposta}</span>
              {/* `usos` nasceu com a tabela e ficou em zero enquanto nada lia as FAQs.
                  Agora ele responde "qual dúvida meus clientes mais têm" — que é a
                  informação que vira serviço novo, preço ou horário estendido. */}
              {f.usos > 0 && (
                <span style={s("font-size:var(--t-label);color:var(--muted)")}>
                  respondeu {f.usos}×
                </span>
              )}
            </div>
            <button
              onClick={() => setRascunho({ id: f.id, pergunta: f.pergunta, resposta: f.resposta })}
              className="m-press m-focus"
              aria-label={`Editar: ${f.pergunta}`}
              style={s("border:none;background:none;cursor:pointer;color:var(--muted);padding:3px")}
            >
              <Icon name="edit" size={15} />
            </button>
            <button
              onClick={() => void st.removerFaq(f.id)}
              className="m-press m-focus"
              aria-label={`Apagar: ${f.pergunta}`}
              style={s("border:none;background:none;cursor:pointer;color:var(--muted);padding:3px")}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>

      <div style={s("display:flex;flex-direction:column;gap:9px;padding-top:4px;border-top:1px solid var(--border)")}>
        <label style={s("display:flex;flex-direction:column;gap:6px")}>
          <Rotulo>{editando ? "Editando a pergunta" : "Nova pergunta"}</Rotulo>
          <input
            value={rascunho.pergunta}
            onChange={(e) => setRascunho((r) => ({ ...r, pergunta: e.target.value }))}
            placeholder="Vocês têm estacionamento?"
            className="m-focus"
            style={s(CAMPO)}
          />
        </label>

        <label style={s("display:flex;flex-direction:column;gap:6px")}>
          <Rotulo>Resposta</Rotulo>
          <textarea
            rows={2}
            value={rascunho.resposta}
            onChange={(e) => setRascunho((r) => ({ ...r, resposta: e.target.value }))}
            placeholder="Temos convênio com o estacionamento da esquina."
            className="m-focus"
            style={s("width:100%;padding:11px 13px;border-radius:12px;border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-sm);line-height:1.55;color:var(--ink);outline:none;resize:vertical;min-height:64px")}
          />
        </label>

        <div style={s("display:flex;gap:8px;align-items:center")}>
          {/* `Btn` não tem `disabled` — o bloqueio é na AÇÃO, e o visual só acompanha.
              Um botão que parece ativo e não faz nada seria pior, então o `pointer-events`
              também sai: sem ele o cursor continuaria prometendo clique. */}
          <Btn
            onClick={() => {
              if (!podeSalvar || st.faqsOcupado) return;
              void st.salvarFaq(rascunho).then((deuCerto) => { if (deuCerto) limpar(); });
            }}
            style={!podeSalvar || st.faqsOcupado ? { opacity: 0.45, pointerEvents: "none" } : undefined}
          >
            {st.faqsOcupado ? "Salvando…" : editando ? "Salvar" : "Adicionar"}
          </Btn>
          {editando && (
            <button
              onClick={limpar}
              className="m-press m-focus"
              style={s("border:none;background:none;cursor:pointer;font-size:var(--t-sm);color:var(--muted)")}
            >
              cancelar
            </button>
          )}
        </div>

        <span style={s("font-size:var(--t-label);color:var(--muted);line-height:1.5")}>
          A MAISA procura por sentido, não por palavra exata: quem perguntar “dá pra
          estacionar aí?” encontra a resposta acima.
        </span>
      </div>
    </div>
  );
}

function Corpo({ id }: { id: RecorteId }) {
  const st = useStore();
  if (id === "whatsapp") {
    return (
      <div style={s("display:flex;flex-direction:column;gap:16px")}>
        <FaixaCanal />
        {/* "De quem é esse número" só com o canal de pé (07 P1.4): antes de existir número,
            a pergunta não tem sobre o que ser. */}
        {st.canal?.status === "conectado" && <DeQuemEEsseNumero />}
      </div>
    );
  }
  if (id === "personalidade") return <Personalidade />;
  if (id === "horarios") return <Horarios />;
  if (id === "agendamentos") return <ListaToggles itens={D.TOGGLES_AGENDAMENTO} />;
  if (id === "duvidas") return <Duvidas />;
  return <ListaToggles itens={D.TOGGLES_COMPORTAMENTO} />;
}

/* ───────────────────────────── preview de WhatsApp ───────────────────────────── */

/* Hora da bolha. No WhatsApp toda mensagem tem hora, e o preview copia a ESTRUTURA
   dele (não a fonte). Derivada do índice, nunca de Date.now(): assim o preview não
   muda a cada render nem difere entre servidor e cliente. */
function horaDaMsg(i: number) {
  const min = 9 * 60 + 12 + i; // uma conversa de manhã, um minuto entre falas
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/* O que ela escreve no recorte aberto, derivado do dado (`falasDoPreview`, 1C.12). */
function Preview({ recorte }: { recorte: RecorteId | null }) {
  const st = useStore();
  const pv = recorte
    ? falasDoPreview(recorte, {
      nomeAssistente: st.assistente.nome,
      nomeNegocio: st.cadastro.negocio.nome,
      lidos: st.ajustesCarregados && st.cadastroCarregado,
      semana: st.semana,
      semanaLida: st.semanaCarregada,
      faqs: st.faqs,
      cfg: st.cfg,
      lembreteHoras: st.assistente.lembreteHoras,
    })
    : { falas: null };
  const falas = "falas" in pv ? pv.falas : null;

  return (
    /* Moldura chapada, sem gradiente (emenda 3 do maisa-design). */
    <div style={s("flex:1;min-height:0;border-radius:24px;padding:8px;background:var(--nav);display:flex")}>
      <div style={s("flex:1;min-width:0;border-radius:18px;overflow:hidden;background:var(--nav);display:flex;flex-direction:column")}>
        <div style={s("flex-shrink:0;display:flex;align-items:center;gap:10px;padding:13px 14px;background:var(--nav)")}>
          <span style={s("width:36px;height:36px;flex-shrink:0;border-radius:50%;background:var(--nav-active);color:var(--warm);display:flex;align-items:center;justify-content:center;font-weight:var(--w-title);font-size:var(--t-body)")}>m</span>
          <span style={s("flex:1;min-width:0")}>
            <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--nav-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>
              {st.assistente.nome || "MAISA"}
            </span>
            <span style={s("display:flex;align-items:center;gap:5px;font-size:var(--t-micro);color:var(--nav-soft);margin-top:1px")}>
              {/* "online" só quando ela responde de verdade (interruptor E canal). */}
              <span style={s(`width:6px;height:6px;border-radius:50%;background:${st.statusMaisa === "atendendo" ? "var(--whatsapp-mark)" : "var(--nav-muted)"}`)} />
              {st.statusMaisa === "atendendo" ? "online" : "sem responder"}
            </span>
          </span>
        </div>

        <div style={s("flex:1;min-height:0;overflow-y:auto;padding:16px 13px;display:flex;flex-direction:column;gap:9px;background:var(--bg)")}>
          {"aviso" in pv ? (
            <span style={s("margin:auto 8px;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:var(--lh-prose)")}>{pv.aviso}</span>
          ) : falas === null ? (
            <span aria-hidden style={s("align-self:flex-start;width:60%;height:44px;border-radius:15px;background:var(--line)")} />
          ) : (
            /* O cabeçalho apresenta a MAISA como o CONTATO, então quem olha esta tela é o
               cliente: as falas da MAISA vêm à esquerda em bolha clara, e as do cliente à
               direita. Estava invertido, e era justo aqui que o usuário aprende quem fala. */
            falas.map((m, i) => {
              const bot = m.de === "bot";
              return (
                <div
                  key={`${recorte}-${i}`}
                  className="m-bubble"
                  style={s(`max-width:84%;align-self:${bot ? "flex-start" : "flex-end"};padding:9px 13px 7px;font-size:var(--t-sm);line-height:1.5;border-radius:15px;background:${bot ? "var(--surface)" : "var(--primary-soft)"};color:${bot ? "var(--ink)" : "var(--primary-dark)"};border-bottom-${bot ? "left" : "right"}-radius:5px;box-shadow:0 1px 2px oklch(0.22 0.03 262 / 0.08)`)}
                >
                  {m.txt}
                  <span className="n" style={s("display:block;text-align:right;margin-top:3px;font-size:var(--t-micro);font-weight:var(--w-data);color:var(--muted)")}>
                    {horaDaMsg(i)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div style={s("flex-shrink:0;display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface);border-top:1px solid var(--line)")}>
          <span style={s("flex:1;background:var(--bg);border-radius:10px;padding:8px 14px;font-size:var(--t-label);color:var(--muted)")}>Mensagem</span>
          <span aria-hidden style={s("width:34px;height:34px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--primary);color:var(--on-primary)")}>
            <Icon name="send" size={15} sw={2} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── o recorte ───────────────────────────── */

/**
 * O recorte já tem o valor do servidor? (24/09/2026, item 1A.7)
 *
 * Antes de `GET /api/assistente` e `GET /api/horarios` voltarem, o store segura
 * `AJUSTES_PLACEHOLDER` e `SEMANA_PLACEHOLDER` (⚠️ primeira pintura, não default de produto).
 * Com os campos abertos, o dono editava "MAISA", "tom amigável" e a semana de 08:00 às 20:00
 * que nunca foram dele, e a gravação ia por cima do que estava no banco. Agora o recorte só
 * desenha campo com o valor lido; antes disso, esqueleto; se a leitura falhou, a frase.
 *
 * "Como ela fala" também espera o cadastro: o nome do negócio vem dele, e o placeholder é o
 * fixture. Respostas prontas tem leitura própria (`st.faqs`) e o WhatsApp também (`FaixaCanal`).
 */
function leituraDoRecorte(id: RecorteId, st: ReturnType<typeof useStore>): { lida: boolean; erro: string | null } {
  if (id === "duvidas" || id === "whatsapp") return { lida: true, erro: null };
  if (id === "horarios") return { lida: st.semanaCarregada, erro: st.semanaErro };
  if (id === "personalidade") {
    return { lida: st.ajustesCarregados && st.cadastroCarregado, erro: st.ajustesErro ?? st.cadastroErro };
  }
  return { lida: st.ajustesCarregados, erro: st.ajustesErro };
}

function Recorte({ id }: { id: RecorteId }) {
  const st = useStore();
  const { lida, erro } = leituraDoRecorte(id, st);
  if (lida) return <Corpo id={id} />;
  /* O store não relê ajustes sob demanda (e este item só LÊ as bandeiras dele, ver o ⚠️ de
   * coalescer no store): tentar de novo é recarregar a página. */
  if (erro) return <FalhaDeLeitura embutida frase="Não consegui ler estes ajustes." detalhe={erro} tentar={() => window.location.reload()} />;
  return <Esqueleto linhas={3} altura={44} rotulo={`Lendo ${tituloDe(id).toLowerCase()}`} />;
}

const tituloDe = (id: RecorteId) => RECORTES.find((r) => r.id === id)!.titulo;

/** O que pede a mão do dono, marcado na navegação. Só pendência, nunca contagem de coisa boa. */
function pendenciaDe(id: RecorteId, st: ReturnType<typeof useStore>): string | null {
  if (id !== "whatsapp" || !st.canal) return null;
  if (st.canal.status !== "conectado") return "Sem WhatsApp";
  if (st.cfg.encaminhar && !st.canal.telefoneDono) return "Ninguém recebe os avisos";
  return null;
}

/** A navegação dos recortes. No desktop, a coluna de 14rem; no celular, a lista que abre cada um. */
function Navegacao({ ativo, celular }: { ativo: RecorteId | null; celular?: boolean }) {
  const st = useStore();
  return (
    <nav aria-label="Seções dos ajustes" style={s(`display:flex;flex-direction:column;${celular ? "background:var(--surface);border:1px solid var(--border);border-radius:12px" : "gap:2px"}`)}>
      {RECORTES.map((r, i) => {
        const on = !celular && r.id === ativo;
        const pend = pendenciaDe(r.id, st);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => st.irPara("assistente", r.id)}
            aria-current={on ? "page" : undefined}
            className="m-focus m-hov-bg"
            style={s(`display:flex;align-items:center;gap:10px;min-height:${celular ? 56 : 44}px;padding:0 ${celular ? 16 : 12}px;border:none;${celular && i < RECORTES.length - 1 ? "border-bottom:1px solid var(--line);" : ""}border-radius:${celular ? 0 : 8}px;background:${on ? "var(--primary-soft)" : "transparent"};color:${on ? "var(--primary-dark)" : "var(--ink)"};font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);text-align:left;cursor:pointer`)}
          >
            <span style={s("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px")}>
              <span>{r.titulo}</span>
              {pend && <Estado forma="triangulo" tom="warn">{pend}</Estado>}
            </span>
            {celular && <Icon name="chevron-right" size={18} sw={2} style={s("color:var(--muted);flex-shrink:0")} />}
          </button>
        );
      })}
    </nav>
  );
}

/* ───────────────────────────── tela ───────────────────────────── */

/*
 * A MOLDURA DOS AJUSTES (25/09/2026, 1C.11, 07 P0.1 e §6).
 *
 * Fixo: a linha de status (o interruptor mestre, que já era fixo por decisão: desligar aqui para
 * o atendimento inteiro, e ele não pode sumir de vista), a navegação dos recortes e o preview.
 * Rola: SÓ o recorte. Conexão, "de quem é" e o telefone de aviso saíram do topo fixo, onde
 * comiam 600px da dobra de quem só queria mudar o sábado, e viraram o recorte "WhatsApp e
 * número", que é o padrão enquanto o canal não conecta.
 *
 * No celular a lista e o recorte são duas vistas escolhidas por `useIsMobile` (nunca as duas
 * desenhadas e uma escondida): sem recorte na URL, a lista; com, o recorte e "Ajustes" para
 * voltar. A linha de status e esse cabeçalho grudam no topo (`Moldura`, `sticky`).
 *
 * A faixa de rodapé com "Salvar alterações" saiu em 28/07: cada ajuste persiste sozinho, e o
 * "Salvo" da linha de status é quem diz que gravou.
 */
export default function AMaisa() {
  const st = useStore();
  const mobile = useIsMobile();
  const ativo = recorteAtivo(st.secao, st.canal, st.canalErro);

  if (mobile) {
    const escolhido = RECORTES.find((r) => r.id === st.secao)?.id ?? null;
    return (
      <Moldura
        /* Na lista, a linha de status inteira (é onde se liga e desliga). Dentro de um recorte, só
           "Ajustes" para voltar, o título e o "Salvo": a linha de status tem quatro linhas a 390px,
           e grudada no topo de cada recorte comia um quarto da tela. */
        cabecalho={
          <>
            {!escolhido && <FaixaAssistente />}
            {escolhido && (
              <div style={s("display:flex;align-items:center;gap:8px;min-height:44px")}>
                <button
                  type="button"
                  onClick={() => st.irPara("assistente")}
                  className="m-focus m-press"
                  style={s("display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 8px 0 0;border:none;background:transparent;font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--primary);cursor:pointer")}
                >
                  <Icon name="chevron-left" size={18} sw={2.2} /> Ajustes
                </button>
                <h2 style={s("flex:1;min-width:0;margin:0;font-size:var(--t-body);font-weight:var(--w-emph);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{tituloDe(escolhido)}</h2>
                <IndicadorDeGravacao />
              </div>
            )}
          </>
        }
      >
        {escolhido ? (
          <>
            <Recorte id={escolhido} />
            {/* O preview depois da ação: é a prova do que o recorte faz, não a porta dele. */}
            <div style={s("flex-shrink:0;display:flex;flex-direction:column;gap:8px")}>
              <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>No WhatsApp</span>
              <div style={s("height:320px;display:flex")}><Preview recorte={escolhido} /></div>
            </div>
          </>
        ) : (
          <Navegacao ativo={null} celular />
        )}
      </Moldura>
    );
  }

  return (
    <Moldura cabecalho={<FaixaAssistente />}>
      <div style={s("flex:1;min-height:0;display:grid;grid-template-columns:14rem minmax(0,1fr) 306px;grid-template-rows:minmax(0,1fr);gap:24px")}>
        <Navegacao ativo={ativo} />

        {/* A única região que rola. `position:relative` para o que se posiciona dentro dela
            (esqueleto, avisos) não escapar para a moldura. */}
        <section aria-label={ativo ? tituloDe(ativo) : "Ajustes"} style={s("min-height:0;overflow-y:auto;position:relative;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 22px 22px")}>
          {ativo ? (
            <>
              <h2 style={s("margin:0 0 14px;font-size:var(--t-title);font-weight:var(--w-emph);letter-spacing:var(--ls-title);color:var(--ink)")}>{tituloDe(ativo)}</h2>
              <Recorte id={ativo} />
            </>
          ) : (
            <Esqueleto linhas={4} altura={44} rotulo="Lendo o seu WhatsApp" />
          )}
        </section>

        <div style={s("min-height:0;display:flex;flex-direction:column;gap:10px")}>
          <span style={s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)")}>No WhatsApp</span>
          <Preview recorte={ativo} />
        </div>
      </div>
    </Moldura>
  );
}
