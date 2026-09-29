"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * NOVO PAGAMENTO — lançar à mão o que a agenda não pegou.
 *
 * Sessão marcada por fora, pacote pago adiantado, paciente que voltou. Entra no mesmo lugar que
 * os atendimentos da agenda: é um `pagamento_avulso`, e da tela em diante ninguém distingue.
 *
 * ── ★ POR QUE É UM COMPONENTE, E NÃO DOIS FORMULÁRIOS ──
 *
 * Ele nasceu dentro do `LoteReceitaSaude` (o caminho do arquivo CSV). Em 26/08/2026 o Bruno pediu
 * o mesmo lançamento na tela de emitir: *"vai que eu quero colocar um recibo a mais à mão"*.
 *
 * Duas cópias do MESMO formulário divergiriam na primeira correção — e as validações aqui não são
 * cosméticas: um CPF que não fecha no dígito verificador faz a Receita recusar **o arquivo
 * inteiro** por causa de uma linha, e um valor vazio grava `NaN`. Quem corrigisse uma cópia
 * deixaria a outra recusando documento fiscal.
 *
 * ⚠️ ELE NÃO EMITE NADA. Lança o pagamento e chama `onLancado`. Quem emite é o CTA da tela de
 * emissão, ou o arquivo do mês. Lançar e emitir no mesmo clique tiraria a conferência do meio.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useState } from "react";
import { s, Btn, Icon } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { cpfValido } from "@/nucleo/dominio/clientes";
import type { PagamentoPendente } from "@/nucleo/portas/entrada/casos-de-uso";
import { mensagemDaFalha } from "@/ui/falhas";

const CAMPO =
  "font-family:inherit;font-size:var(--t-sm);padding:10px 12px;border-radius:var(--r-controle);border:1px solid var(--border);background:var(--bg);color:var(--ink);width:100%";

/** Hoje em São Paulo. O fuso do navegador do dono não decide a data de um documento fiscal. */
export const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Só dígitos com a pontuação de CPF, para o campo não parecer senha. */
export const mascaraCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");

export type Rascunho = {
  nome: string;
  cpf: string;
  data: string;
  valor: string;
  cpfPagador: string;
  clienteId: string;
};

const VAZIO = (): Rascunho => ({ nome: "", cpf: "", data: hojeSP(), valor: "", cpfPagador: "", clienteId: "" });

/**
 * O que falta, na ordem em que se resolve. Vazio = pode lançar.
 *
 * ★ O BOTÃO DIZ A VERDADE ANTES DO CLIQUE. Antes ele ficava clicável e o servidor recusava — a
 * resposta morria embaixo da dobra, e quem lançou achava que tinha lançado.
 *
 * ⚠️ O CPF É CONFERIDO NO DÍGITO VERIFICADOR, e não só no tamanho: a Receita recusa o arquivo
 * inteiro por causa de uma linha, e a mensagem dela fala do arquivo, não da linha.
 */
export function faltaDoLancamento(r: Rascunho): string {
  const cpf = r.cpf.replace(/\D/g, "");
  const pagador = r.cpfPagador.replace(/\D/g, "");
  const valor = Number(r.valor.replace(",", "."));

  if (!r.nome.trim()) return "o nome de quem foi atendido";
  if (r.nome.trim().length < 2) return "o nome inteiro de quem foi atendido";
  if (!cpf) return "o CPF de quem foi atendido";
  if (!cpfValido(cpf)) return "um CPF válido — esse não fecha, confira os dígitos";
  if (pagador && !cpfValido(pagador)) return "um CPF válido de quem pagou";
  if (!(valor > 0)) return "o valor recebido";
  return "";
}

/**
 * ⚠️ `onLancado` RECEBE O PAGAMENTO QUE O SERVIDOR CRIOU, e não um aviso vazio.
 *
 * A rota já devolve a linha pronta (`POST /api/recibos` → `{ pagamento }`, no formato exato que
 * o `GET` usa). Quem chama pode colocá-la na lista **no mesmo instante** e reconciliar com o
 * servidor depois — que é o que a tela de emissão faz. Antes só chegava "pronto", e a única
 * saída era refazer duas leituras e esperar: o formulário fechava, a lista não mexia, e o
 * lançamento parecia não ter acontecido.
 *
 * O parâmetro é opcional de propósito: resposta antiga (ou proxy que come o corpo) não pode
 * derrubar o fluxo — sem ele, quem chama só recarrega, como fazia antes.
 */
/**
 * ★ QUEM PODE SER ESCOLHIDO NO SELETOR — cliente de teste fica de fora.
 *
 * ⚠️ NÃO É COSMÉTICO, É PERDA SILENCIOSA. A `v_a_recibar` lê o `teste` do CLIENTE
 * (`coalesce(c.teste,false)`) e `lerRecibosPendentes` filtra `!teste`. Escolher um deles gravava
 * a linha no banco e ela NUNCA voltava na lista: o formulário dizia "lançado" e nada aparecia —
 * o pior desfecho possível num formulário de documento fiscal.
 *
 * Quem realmente precisar lançar para esse nome digita à mão: sem `clienteId`, o `left join` da
 * view não tem de onde tirar o `teste`, e a linha aparece.
 *
 * Exportada para ter teste — é a única regra aqui que erra sem sintoma.
 */
export function lancaveis<T extends { teste?: boolean }>(clientes: T[]): T[] {
  return clientes.filter((c) => !c.teste);
}

export function NovoPagamento({ onLancado, rotulo }: { onLancado: (lancado?: PagamentoPendente) => void; rotulo?: string }) {
  const st = useStore();
  /* Ver `lancaveis`: cliente de teste no seletor é lançamento que some. */
  const clientes = useMemo(() => lancaveis(st.cadastro.clientes), [st.cadastro.clientes]);

  const [abrindo, setAbrindo] = useState(false);
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Nome de quem acabou de ser lançado. Fica alguns segundos e some — ver o bloco fechado. */
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    if (!ultimo) return;
    const t = setTimeout(() => setUltimo(null), 6000);
    return () => clearTimeout(t);
  }, [ultimo]);

  const põe = (campo: keyof Rascunho, v: string) => setR((a) => ({ ...a, [campo]: v }));

  /* Quem pagou quase sempre já é cadastro. A opção em branco continua existindo para quem não é —
     e não é exceção escondida. */
  const escolherCliente = (id: string) => {
    const c = clientes.find((x) => x.id === id);
    setR((a) => ({ ...a, clienteId: id, nome: c?.nome ?? a.nome, cpf: mascaraCpf(c?.cpf ?? "") }));
  };

  const falta = faltaDoLancamento(r);
  const digitosCpf = r.cpf.replace(/\D/g, "");

  const lancar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/recibos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: r.nome,
          cpf: r.cpf,
          data: r.data,
          cpfPagador: r.cpfPagador,
          /* Vazio vira `null` na rota: lançamento de quem não é cadastro é caso de primeira
           * classe, não erro de preenchimento. */
          clienteId: r.clienteId || null,
          /* Vírgula vira ponto AQUI, e não no servidor: quem digita "250,50" está certo, e a rota
           * recusa NaN de propósito em vez de gravar 250. */
          valor: Number(r.valor.replace(",", ".")),
        }),
      }).then((x) => x.json());
      if (!resp?.ok) throw new Error(mensagemDaFalha(resp, "Não consegui lançar."));
      const nome = r.nome.trim();
      setR(VAZIO());
      setAbrindo(false);
      setUltimo(nome);
      /* A linha criada vai junto: quem chama põe na lista agora e confere com o servidor depois.
       * Ver o comentário da assinatura. */
      onLancado(resp.pagamento as PagamentoPendente | undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui lançar.");
    } finally {
      setOcupado(false);
    }
  };

  if (!abrindo) {
    return (
      <div style={s("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
        <Btn variant="ghost" icon="plus" onClick={() => setAbrindo(true)}>
          {rotulo ?? "Lançar um pagamento que não está na agenda"}
        </Btn>
        {/* ★ O RECIBO DO CLIQUE. O formulário fecha sozinho no sucesso, e fechar era o ÚNICO
            sinal — indistinguível de ter fechado por engano. A frase diz o nome, porque é o nome
            que a pessoa vai procurar na lista logo acima. */}
        {ultimo && (
          <span style={s("display:flex;align-items:center;gap:6px;font-size:var(--t-label);color:var(--success)")}>
            <Icon name="check" size={14} stroke="var(--success)" />
            {ultimo} entrou na lista.
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={s("display:grid;gap:9px;padding:14px;border-radius:var(--r-painel);border:1px dashed var(--border)")}>
      <span style={s("font-size:var(--t-label);color:var(--muted)")}>
        Sessão marcada por fora, pacote pago adiantado, paciente que voltou. Entra na mesma fila.
      </span>

      <select
        value={r.clienteId}
        onChange={(e) => escolherCliente(e.target.value)}
        className="n m-focus"
        style={s(CAMPO)}
      >
        <option value="">Quem foi atendido? Escolha ou digite abaixo</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}{c.cpf ? "" : " — sem CPF"}
          </option>
        ))}
      </select>

      <input
        value={r.nome}
        onChange={(e) => setR((a) => ({ ...a, nome: e.target.value, clienteId: "" }))}
        placeholder="Nome de quem foi atendido"
        className="n m-focus"
        style={s(CAMPO)}
      />

      <div style={s("display:flex;gap:9px;flex-wrap:wrap")}>
        <input value={r.cpf} onChange={(e) => põe("cpf", mascaraCpf(e.target.value))} inputMode="numeric" placeholder="CPF de quem foi atendido" className="n m-focus" style={s(`${CAMPO};flex:2;min-width:170px`)} />
        <input value={r.data} onChange={(e) => põe("data", e.target.value)} type="date" max={hojeSP()} className="n m-focus" style={s(`${CAMPO};flex:1;min-width:130px`)} />
        <input value={r.valor} onChange={(e) => põe("valor", e.target.value)} inputMode="decimal" placeholder="Valor" className="n m-focus" style={s(`${CAMPO};flex:1;min-width:90px`)} />
      </div>

      {digitosCpf.length === 11 && !cpfValido(digitosCpf) && (
        <span style={s("font-size:var(--t-label);color:var(--warn)")}>
          Esse CPF não fecha na conta do dígito verificador — a Receita recusa o documento.
        </span>
      )}
      {r.clienteId && !digitosCpf && (
        <span style={s("font-size:var(--t-label);color:var(--warn)")}>
          Esse cliente está sem CPF no cadastro. Digite aqui para este recibo — e complete a ficha
          dele depois, em Clientes.
        </span>
      )}

      {/* Opcional, e o rótulo diz PARA QUE serve: quem paga é quem deduz no IRPF e pede
          reembolso — mãe que paga a terapia do filho precisa do recibo no CPF dela. Vazio
          significa "pagou por si". */}
      <input value={r.cpfPagador} onChange={(e) => põe("cpfPagador", mascaraCpf(e.target.value))} inputMode="numeric" placeholder="CPF de quem pagou — só se for outra pessoa" className="n m-focus" style={s(CAMPO)} />

      <div style={s("display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        {/* `button` cru e não `Btn`: o primitivo não aceita `disabled`, e botão clicável que
            sempre falha é o bug que este bloco existe para matar. */}
        <button
          onClick={() => void lancar()}
          disabled={ocupado || falta !== ""}
          className="m-press m-focus"
          style={s(`display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:var(--r-controle);border:none;background:var(--primary);color:var(--on-primary);font-family:inherit;font-size:var(--t-sm);font-weight:var(--w-title);cursor:${ocupado || falta ? "default" : "pointer"};opacity:${ocupado || falta ? 0.5 : 1}`)}
        >
          <Icon name="check" size={14} stroke="var(--on-primary)" />
          {ocupado ? "Lançando…" : "Lançar"}
        </button>
        <button
          onClick={() => { setAbrindo(false); setErro(null); setR(VAZIO()); }}
          className="m-focus"
          style={s("background:none;border:none;padding:0;font-family:inherit;font-size:var(--t-label);color:var(--muted);cursor:pointer;text-decoration:underline")}
        >
          cancelar
        </button>
        {falta && <span style={s("font-size:var(--t-label);color:var(--muted)")}>falta {falta}</span>}
      </div>

      {/* O erro do servidor aqui, e não no pé da tela: é aqui que o olho está depois de clicar. */}
      {erro && (
        <div style={s("display:flex;gap:8px;color:var(--danger);font-size:var(--t-label)")}>
          <Icon name="alert" size={16} />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}
