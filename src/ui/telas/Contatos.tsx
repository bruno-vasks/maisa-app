"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * MEUS CONTATOS — onde o dono diz quem a MAISA atende.
 *
 * ── POR QUE ESTA TELA PRECISOU EXISTIR (17/08/2026) ──
 *
 * O relato foi: *"acabei de pegar meus contatos aqui. falta uma tela para eu poder dizer
 * quais são e quais não são meus clientes. ele diz que isso é possível, mas não diz como
 * fazer, onde fazer etc."*
 *
 * E ele estava descrevendo um buraco exato: o caminho inteiro já existia menos o último
 * palmo. `PATCH /api/contatos` marca contato desde sempre, `criarMarcarContato` valida,
 * a coluna guarda o ternário, e `podeResponder` lê. O que não existia era **um lugar para
 * clicar**. O cartão "De quem é esse número" chegava a dizer *"1.840 contatos aqui, 3
 * marcados como cliente"* — informava o número e não oferecia o gesto.
 *
 * Funcionalidade sem porta de entrada é funcionalidade que não existe, e essa é pior que a
 * ausente: ela promete na tela e não entrega.
 *
 * ── O TERNÁRIO É O CONTEÚDO DESTA TELA, NÃO UM DETALHE ──
 *
 * `cliente` tem três valores e os três significam coisas diferentes para o silêncio da
 * MAISA (ver `dominio/contatos.ts`):
 *
 *   • `true`  → ela atende
 *   • `null`  → o dono nunca disse. Ela CALA — é o padrão seguro, e é onde nascem os 1.840
 *   • `false` → o dono disse que não. Ela cala, e a diferença para `null` é que isto é uma
 *               resposta: some da fila de "falta decidir" e nunca mais é sugerido
 *
 * Uma tela de dois estados (um switch ligado/desligado) apagaria a distinção entre "não
 * decidi" e "decidi que não" — e é essa distinção que diz ao dono quanto trabalho falta.
 * Por isso são dois botões e um filtro "falta decidir", em vez de um toggle.
 *
 * ── "MARCAR TODOS" EXISTE, E TEM TRÊS TRAVAS ──
 *
 * Esta nota dizia que ele NÃO existiria: com 1.840 entradas ele é irresistível, e marcar a
 * agenda inteira como cliente transforma o celular pessoal em gente que a MAISA atende —
 * inclusive a mãe do dono, que é o erro que este produto tenta não cometer. Bruno pediu
 * assim mesmo, em 17/08/2026, e é decisão dele. O que o argumento comprou foram os limites:
 *
 *   1. **Age sobre o que está FILTRADO, nunca sobre o caderno inteiro.** Com busca ativa,
 *      "marcar todos" marca os 6 do "Silva" — que é o gesto útil. Sem busca e sem filtro,
 *      ele avisa quantos são antes de agir. O botão nunca esconde o tamanho do estrago.
 *   2. **Dois toques quando o lote é grande**, e o segundo diz o número em vez de "sim".
 *   3. **Desfazer**, e é a trava que importa: guardamos o valor ANTERIOR de cada um e
 *      devolvemos exatamente aquilo — não um "limpar tudo", que apagaria as marcações que
 *      já existiam antes do clique.
 * ────────────────────────────────────────────────────────────────────────────── */

import { casaBusca } from "@/ui/estado/busca";
import React from "react";
import { s, Icon, Filtros, EmptyState, SectionTitle, Btn, toast } from "@/ui/primitivos";
import { TelaGrade } from "@/ui/componentes/Cartao";
import { Esqueleto, FalhaDeLeitura, ENTRAR } from "@/ui/componentes/EstadoDeLeitura";
import { useStore } from "@/ui/estado/store";
import { estadoDosContatos } from "@/ui/estado/leitura";
import { mensagemDaFalha } from "@/ui/falhas";
import { telefoneBonito } from "@/nucleo/dominio/clientes";
import type { Contato, ModoDoNumero } from "@/nucleo/dominio/contatos";
import { fraseDoImport } from "@/ui/componentes/EscolhaDoNumero";

type Filtro = "Falta decidir" | "Atende" | "Não atende" | "Todos";
const FILTROS: Filtro[] = ["Falta decidir", "Atende", "Não atende", "Todos"];

/** Em qual balde cada contato cai. Um lugar só, para o filtro e o contador concordarem. */
const baldeDe = (c: Contato): Filtro =>
  c.cliente === true ? "Atende" : c.cliente === false ? "Não atende" : "Falta decidir";

/**
 * Casa a busca contra nome E telefone.
 *
 * Os dois porque o dono procura das duas formas, e por 1.840 entradas ele procura mesmo:
 * "Zé" quando lembra o nome, os quatro últimos dígitos quando o contato entrou sem nome
 * (que é a maioria do que vem de uma agenda de WhatsApp).
 */
function casa(c: Contato, busca: string): boolean {
  /* A regra mora em `estado/busca.ts` desde 25/09/2026 (1C.8), porque Clientes precisa da mesma. */
  return casaBusca({ nome: c.nome, numeros: [c.chave] }, busca);
}

/* Quantos desenhar de uma vez. A agenda do Bruno tem 1.840 entradas, e 1.840 linhas com
 * dois botões cada é uma tela que trava no celular — o aparelho onde ele vai fazer isso.
 * Paginar por botão em vez de scroll infinito: o dono está PROCURANDO alguém, e a busca é
 * o caminho rápido; a lista longa é só o fallback de quem quer varrer. */
const PAGINA = 60;

const FRASE_ERRO = "Não consegui ler seus contatos.";

export default function Contatos() {
  const st = useStore();
  const [contatos, setContatos] = React.useState<Contato[] | null>(null);
  /* ⚠️ `modo` NASCE `null` (24/09/2026, item 1A.6). Nascia "negocio", e antes da resposta, ou
   * para sempre se ela falhasse, a tela afirmava "Este número está como só do negócio". Não
   * sabemos de quem é o número até o servidor dizer. */
  const [modo, setModo] = React.useState<ModoDoNumero | null>(null);
  /** A leitura falhou. Nunca vira `[]`: lista vazia por erro é "seus contatos não estão aqui",
   *  e o dono vai importar de novo o que já importou. */
  const [erro, setErro] = React.useState<string | null>(null);
  /** O motivo do servidor, embaixo da frase. */
  const [detalhe, setDetalhe] = React.useState<string | undefined>(undefined);
  /** A sessão acabou: o botão é "Entrar", não "Tentar de novo". */
  const [precisaEntrar, setPrecisaEntrar] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("Falta decidir");
  const [mostrando, setMostrando] = React.useState(PAGINA);
  /** Quem está com escrita em voo — trava só a linha, nunca a tela. */
  const [salvando, setSalvando] = React.useState<Set<string>>(new Set());

  const ler = React.useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/contatos", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) { setContatos(r.contatos ?? []); setModo(r.modo); setPrecisaEntrar(false); return; }
      setPrecisaEntrar(r?.status === "login_necessario");
      setErro(r?.status === "login_necessario" ? "Entre na sua conta para ver seus contatos." : FRASE_ERRO);
      setDetalhe(r?.status === "login_necessario" ? undefined : mensagemDaFalha(r, "") || undefined);
    } catch {
      setErro(FRASE_ERRO);
      setDetalhe("Sem conexão com o servidor.");
    }
  }, []);

  React.useEffect(() => { void ler(); }, [ler]);

  /* ── TRAZER A AGENDA AQUI MESMO (25/09/2026, 1B.10, 05 P0-5) ──
   * O botão do vazio fazia `irPara("assistente")`, e em Ajustes o importar só existe no modo
   * pessoal: no modo negócio a pessoa chegava numa tela sem nada para clicar. Agora o POST sai
   * daqui, nos dois modos (o caderno empresta nome nos dois, `dominio/contatos.ts`), e a lista
   * aparece. A leitura pode passar de 10s (`maxDuration = 60` na rota): o botão trava com
   * "Lendo sua agenda…". Recusa do servidor vira a frase dele, e sem WhatsApp, "Conectar". */
  const [importando, setImportando] = React.useState(false);
  const [falhaImport, setFalhaImport] = React.useState<string | null>(null);
  const importar = React.useCallback(async () => {
    if (importando) return;
    setImportando(true);
    setFalhaImport(null);
    try {
      const r = await fetch("/api/contatos", { method: "POST" }).then((x) => x.json());
      if (!r?.ok) { setFalhaImport(r?.info ?? "Não consegui ler sua agenda do WhatsApp."); return; }
      toast(fraseDoImport(r));
      await ler();
    } catch {
      setFalhaImport("Sem conexão com o servidor. Nada foi trazido.");
    } finally {
      setImportando(false);
    }
  }, [importando, ler]);
  const semWhatsApp = st.statusMaisa === "sem_whatsapp";

  /**
   * Marca um contato, otimista.
   *
   * Otimista porque a tarefa é REPETITIVA: o dono vai clicar dezenas de vezes seguidas, e
   * esperar um round-trip entre cliques transforma dez minutos de trabalho em vinte. A
   * reversão é o próprio valor anterior, guardado antes de escrever — e não uma releitura
   * da lista inteira, que jogaria fora as outras marcações em voo.
   */
  const marcar = React.useCallback(async (c: Contato, cliente: boolean | null) => {
    const anterior = c.cliente;
    setContatos((lista) => lista?.map((x) => (x.chave === c.chave ? { ...x, cliente } : x)) ?? lista);
    setSalvando((s0) => new Set(s0).add(c.chave));

    try {
      const r = await fetch("/api/contatos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        /* Manda a `chave` no campo `telefone`: o núcleo aplica `chaveDe()` no que recebe, e
         * a chave já É o resultado dessa função. Mandar o nome junto seria reescrever com o
         * que a tela tem em mãos — e a tela não é dona do nome, o caderno é. */
        body: JSON.stringify({ telefone: c.chave, cliente }),
      }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.info ?? "recusado");
    } catch {
      setContatos((lista) => lista?.map((x) => (x.chave === c.chave ? { ...x, cliente: anterior } : x)) ?? lista);
      toast("Não consegui salvar essa marcação");
    } finally {
      setSalvando((s0) => { const n = new Set(s0); n.delete(c.chave); return n; });
    }
  }, []);

  /** O que havia antes do último "marcar todos", para o Desfazer devolver o certo. */
  const [desfazer, setDesfazer] = React.useState<{ antes: Contato[]; rotulo: string } | null>(null);
  /** Confirmação em dois toques do lote grande. Guarda qual valor está sendo confirmado. */
  const [confirmando, setConfirmando] = React.useState<boolean | null | undefined>(undefined);
  const [emLote, setEmLote] = React.useState(false);

  /**
   * Grava um lote e devolve o que mudou — usada pelo "marcar todos" E pelo "desfazer".
   *
   * ⚠️ COMPARA `pedidos` COM `mudados`. A escrita pode ser recusada em silêncio (RLS volta
   * sem erro e sem linha), e sem essa comparação a tela diria "1.840 marcados" depois de
   * não ter marcado nenhum. O dono só descobriria no dia em que a MAISA calasse com um
   * cliente — que é o modo de falha mais caro deste produto.
   */
  const gravarLote = React.useCallback(async (chaves: string[], cliente: boolean | null) => {
    const r = await fetch("/api/contatos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chaves, cliente }),
    }).then((x) => x.json());

    if (!r?.ok) throw new Error(r?.info ?? "recusado");
    if (r.mudados < r.pedidos) {
      toast(`Salvei ${r.mudados} de ${r.pedidos} — recarregue e confira o resto`);
      await ler();
    }
    return r;
  }, [ler]);

  /** Aplica um valor a TODO o recorte visível (busca + filtro), com desfazer. */
  const marcarLote = React.useCallback(async (cliente: boolean | null, alvos: Contato[]) => {
    if (alvos.length === 0 || emLote) return;
    setEmLote(true);
    setConfirmando(undefined);

    /* A foto do ANTES é tirada aqui, antes de qualquer escrita, e guarda o valor de cada
     * um. Um "desfazer" que só limpasse tudo apagaria as marcações que já existiam — e
     * seria um segundo estrago em cima do primeiro. */
    const antes = alvos.map((c) => ({ ...c }));
    const chaves = alvos.map((c) => c.chave);

    setContatos((lista) =>
      lista?.map((x) => (chaves.includes(x.chave) ? { ...x, cliente } : x)) ?? lista);

    try {
      await gravarLote(chaves, cliente);
      const rotulo = cliente === true ? "atende" : cliente === false ? "não atende" : "sem resposta";
      setDesfazer({ antes, rotulo: `${alvos.length} marcados como ${rotulo}` });
    } catch {
      setContatos((lista) =>
        lista?.map((x) => antes.find((a) => a.chave === x.chave) ?? x) ?? lista);
      toast("Não consegui salvar essas marcações");
    } finally {
      setEmLote(false);
    }
  }, [emLote, gravarLote]);

  /** Devolve cada um ao valor que tinha — agrupado por valor, para ir em poucas chamadas. */
  const aplicarDesfazer = React.useCallback(async () => {
    if (!desfazer || emLote) return;
    setEmLote(true);
    const grupos = new Map<string, { cliente: boolean | null; chaves: string[] }>();
    for (const c of desfazer.antes) {
      const k = String(c.cliente);
      if (!grupos.has(k)) grupos.set(k, { cliente: c.cliente, chaves: [] });
      grupos.get(k)!.chaves.push(c.chave);
    }

    setContatos((lista) =>
      lista?.map((x) => desfazer.antes.find((a) => a.chave === x.chave) ?? x) ?? lista);

    try {
      for (const g of grupos.values()) await gravarLote(g.chaves, g.cliente);
      setDesfazer(null);
      toast("Desfeito");
    } catch {
      toast("Não consegui desfazer — recarregue a tela");
      await ler();
    } finally {
      setEmLote(false);
    }
  }, [desfazer, emLote, gravarLote, ler]);

  /* O desfazer vale para o ÚLTIMO lote e some quando o recorte muda: oferecê-lo depois de
   * o dono ter filtrado outra coisa devolveria gente que não está na tela, e ele não teria
   * como ver o que aconteceu. */
  React.useEffect(() => { setDesfazer(null); setConfirmando(undefined); }, [busca, filtro]);

  /* Reinicia a paginação quando o recorte muda. Sem isto, filtrar depois de ter carregado
   * 300 linhas mostraria 300 de um conjunto de 12 — e o botão "mostrar mais" sumiria sem
   * que nada tivesse acabado. */
  React.useEffect(() => { setMostrando(PAGINA); }, [busca, filtro]);

  /* Três estados antes de derivar vazio ou cheio (T4). O que já foi lido fica na tela se uma
   * releitura falhar: `estadoDosContatos` devolve "cheio" com dado na mão. */
  const leitura = estadoDosContatos({ lidos: contatos?.length ?? null, erro });
  if (leitura === "carregando" || contatos === null || (leitura === "erro" && contatos.length === 0)) {
    return (
      <TelaGrade>
        <section>
          <SectionTitle title="Quem a MAISA atende" />
          {erro
            ? <FalhaDeLeitura frase={erro} detalhe={detalhe} tentar={() => void ler()} acao={precisaEntrar ? ENTRAR : undefined} />
            : <Esqueleto linhas={6} rotulo="Lendo seus contatos" />}
        </section>
      </TelaGrade>
    );
  }

  const contagem = {
    "Falta decidir": contatos.filter((c) => c.cliente == null).length,
    "Atende": contatos.filter((c) => c.cliente === true).length,
    "Não atende": contatos.filter((c) => c.cliente === false).length,
    "Todos": contatos.length,
  } as Record<Filtro, number>;

  const filtrados = contatos.filter((c) => (filtro === "Todos" || baldeDe(c) === filtro) && casa(c, busca));
  const visiveis = filtrados.slice(0, mostrando);

  return (
    <TelaGrade>
      <section>
        <SectionTitle
          title="Quem a MAISA atende"
          sub={
            modo === "negocio"
              ? "Neste número ela atende todo mundo — estas marcações ficam guardadas para se você mudar de ideia"
              : modo === "pessoal"
                ? "Ela atende quem você marcar aqui, e número novo que chega pedindo horário. Cala para o resto."
                : undefined
          }
        />

        {/* ⚠️ O AVISO DO MODO "NEGÓCIO" É O MAIS IMPORTANTE DESTA TELA. Sem ele, o dono
            marca duzentos contatos achando que está mudando alguma coisa e não muda nada —
            e depois conclui que o produto ignorou o trabalho dele. */}
        {modo === "negocio" && (
          <div style={s("display:flex;gap:10px;align-items:flex-start;padding:12px 14px;margin-bottom:14px;border-radius:var(--r-painel);background:var(--warm-soft);color:var(--warn);font-size:var(--t-label);line-height:1.5")}>
            <Icon name="sparkle" size={16} />
            <span>
              Este número está como <b>só do negócio</b>, então a MAISA responde todo mundo e
              nada aqui muda o que ela faz hoje. Para ela calar com quem não é cliente, mude
              em <b>Ajustes da MAISA → De quem é esse número</b>.
            </span>
          </div>
        )}

        {contatos.length === 0 ? (
          <EmptyState
            title="Seus contatos ainda não estão aqui"
            sub={semWhatsApp
              ? "Conecte o WhatsApp para trazer a agenda dele."
              : falhaImport
                ? falhaImport
                : modo === "negocio"
                  ? "Traga seus contatos para a MAISA chamar cada um pelo nome."
                  : "Traga a agenda do WhatsApp para escolher quem ela atende e para ela chamar seus clientes pelo nome."}
            /* Sem WhatsApp, a saída é conectar, e esse sim leva a Ajustes. Com ele, importa aqui. */
            action={semWhatsApp
              ? <Btn variant="primary" icon="whatsapp" onClick={() => st.irPara("assistente", "whatsapp")}>Conectar WhatsApp</Btn>
              : <Btn variant="primary" icon="download" disabled={importando} onClick={() => void importar()}>{importando ? "Lendo sua agenda…" : "Trazer meus contatos do WhatsApp"}</Btn>}
          />
        ) : (
          <>
            <div style={s("display:flex;flex-direction:column;gap:12px;margin-bottom:16px")}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                aria-label="Buscar contato"
                className="m-focus"
                style={s("width:100%;max-width:380px;height:44px;padding:0 14px;border-radius:var(--r-painel);border:1px solid var(--border-field);background:var(--surface);font-family:inherit;font-size:var(--t-body);color:var(--ink);outline:none")}
              />
              {/* O número em cada aba não é enfeite: com 1.840 contatos, "falta decidir 1.837"
                  é a informação que diz se vale a pena varrer ou se é melhor só buscar. */}
              <Filtros
                opcoes={FILTROS.map((f) => `${f} (${contagem[f]})`)}
                ativo={`${filtro} (${contagem[filtro]})`}
                onChange={(v) => setFiltro(FILTROS.find((f) => v.startsWith(f)) ?? "Todos")}
              />
            </div>

            {/* ── MARCAR TODOS ──
                Acima da lista e depois dos filtros de propósito: nessa ordem ele lê como
                "isto age no que você está vendo", que é literalmente o que ele faz. Em cima
                dos filtros leria como "isto age em tudo". */}
            {filtrados.length > 0 && (
              <div style={s("display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 13px;margin-bottom:14px;border-radius:var(--r-painel);background:var(--surface-2);border:1px solid var(--border)")}>
                <span style={s("font-size:var(--t-label);color:var(--muted);font-weight:var(--w-title)")}>
                  {/* Diz o TAMANHO e o RECORTE. "Marcar todos" sem número é o botão que o
                      dono clica achando que são 12 quando são 1.840. */}
                  {busca.trim() || filtro !== "Todos"
                    ? `Os ${filtrados.length} desta lista:`
                    : `Seus ${filtrados.length} contatos:`}
                </span>

                {confirmando === undefined ? (
                  <>
                    <Escolha rotulo="Atende" ativo={false} cor="var(--success)" fundo="var(--success-soft)"
                      onClick={() => (filtrados.length > 20 ? setConfirmando(true) : void marcarLote(true, filtrados))} />
                    <Escolha rotulo="Não" ativo={false} cor="var(--muted)" fundo="var(--surface-2)"
                      onClick={() => (filtrados.length > 20 ? setConfirmando(false) : void marcarLote(false, filtrados))} />
                    <Escolha rotulo="Desmarcar" ativo={false} cor="var(--muted)" fundo="var(--surface-2)"
                      onClick={() => (filtrados.length > 20 ? setConfirmando(null) : void marcarLote(null, filtrados))} />
                  </>
                ) : (
                  /* O segundo toque REPETE O NÚMERO em vez de dizer "sim". Confirmação que
                     não reapresenta o que está em jogo é só um clique a mais. */
                  <>
                    <Btn variant="danger" size="sm" onClick={() => void marcarLote(confirmando, filtrados)}>
                      {emLote ? "Salvando…" : `Sim, marcar ${filtrados.length} como ${
                        confirmando === true ? "atende" : confirmando === false ? "não atende" : "sem resposta"
                      }`}
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setConfirmando(undefined)}>Cancelar</Btn>
                  </>
                )}

                {/* A trava que realmente importa. Fica até o dono mudar o recorte — sem
                    cronômetro, porque um desfazer que some sozinho não é desfazer. */}
                {desfazer && confirmando === undefined && (
                  <span style={s("display:flex;align-items:center;gap:8px;margin-left:auto;font-size:var(--t-label);color:var(--muted)")}>
                    {desfazer.rotulo}
                    <Btn variant="secondary" size="sm" onClick={() => void aplicarDesfazer()}>
                      {emLote ? "…" : "Desfazer"}
                    </Btn>
                  </span>
                )}
              </div>
            )}

            {filtrados.length === 0 ? (
              <EmptyState
                title={busca ? "Ninguém com esse nome ou número" : "Nada neste filtro"}
                sub={busca ? "Tente parte do nome, ou os últimos dígitos do telefone." : undefined}
                semSaida="a busca e os filtros ficam logo acima da lista"
              />
            ) : (
              <>
                <div style={s("display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-painel);overflow:hidden")}>
                  {visiveis.map((c, i) => (
                    <Linha
                      key={c.chave}
                      contato={c}
                      ultima={i === visiveis.length - 1}
                      ocupado={salvando.has(c.chave)}
                      aoMarcar={(v) => void marcar(c, v)}
                    />
                  ))}
                </div>

                {filtrados.length > visiveis.length && (
                  <div style={s("display:flex;justify-content:center;margin-top:14px")}>
                    <Btn variant="secondary" onClick={() => setMostrando((n) => n + PAGINA)}>
                      Mostrar mais {Math.min(PAGINA, filtrados.length - visiveis.length)} de{" "}
                      {filtrados.length - visiveis.length}
                    </Btn>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </TelaGrade>
  );
}

/** Uma pessoa e a decisão sobre ela. Fora do componente de cima para a lista não repintar
 *  todas as linhas a cada tecla digitada na busca. */
function Linha(
  { contato, ultima, ocupado, aoMarcar }: {
    contato: Contato; ultima: boolean; ocupado: boolean;
    aoMarcar: (v: boolean | null) => void;
  },
) {
  const atende = contato.cliente === true;
  const recusado = contato.cliente === false;

  return (
    <div style={s(`display:flex;align-items:center;gap:12px;padding:12px 14px;${ultima ? "" : "border-bottom:1px solid var(--line)"};opacity:${ocupado ? ".55" : "1"}`)}>
      <span style={s("flex:1;min-width:0")}>
        <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>
          {/* Sem nome mostra o telefone formatado, nunca "Contato sem nome": o telefone é a
              única informação verdadeira que temos, e é por ele que o dono reconhece. */}
          {contato.nome?.trim() || telefoneBonito(contato.chave)}
        </span>
        {contato.nome?.trim() && (
          <span style={s("display:block;font-size:var(--t-label);color:var(--muted);margin-top:1px")}>
            {telefoneBonito(contato.chave)}
          </span>
        )}
      </span>

      {/* Dois botões e não um switch: ver o cabeçalho — "não decidi" e "decidi que não" são
          estados diferentes, e um switch só tem dois. Clicar no que já está ativo DESFAZ,
          voltando para "falta decidir"; sem isso, marcar errado não teria volta. */}
      <span style={s("display:flex;gap:6px;flex-shrink:0")}>
        <Escolha
          rotulo="Atende"
          ativo={atende}
          cor="var(--success)"
          fundo="var(--success-soft)"
          onClick={() => aoMarcar(atende ? null : true)}
        />
        <Escolha
          rotulo="Não"
          ativo={recusado}
          cor="var(--muted)"
          fundo="var(--surface-2)"
          onClick={() => aoMarcar(recusado ? null : false)}
        />
      </span>
    </div>
  );
}

function Escolha(
  { rotulo, ativo, cor, fundo, onClick }: {
    rotulo: string; ativo: boolean; cor: string; fundo: string; onClick: () => void;
  },
) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className="m-hov-bg m-press m-focus"
      style={s(
        `display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 11px;border-radius:99px;` +
        `font-family:inherit;font-size:var(--t-label);font-weight:var(--w-title);cursor:pointer;` +
        `border:1px solid ${ativo ? cor : "var(--border)"};background:${ativo ? fundo : "var(--surface)"};` +
        `color:${ativo ? cor : "var(--muted)"}`,
      )}
    >
      {/* O ✓ carrega o estado junto com a cor: cor sozinha é o sinal mais frágil que existe,
          e aqui ela decide se a MAISA fala ou cala com uma pessoa. */}
      {ativo && <Icon name="check" size={12} sw={3} stroke="currentColor" />}
      {rotulo}
    </button>
  );
}
