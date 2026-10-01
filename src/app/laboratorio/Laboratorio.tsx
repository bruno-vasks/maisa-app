"use client";
/* MAISA — laboratório de conversa.
 *
 * Duas colunas: a conversa como o CLIENTE a vê, e ao lado o que aconteceu por baixo.
 *
 * A coluna da direita é o motivo de isto existir em vez de um `curl`. No texto da
 * resposta, "consultei a agenda e tenho quinta às 15h" e "inventei quinta às 15h" são
 * indistinguíveis — e a segunda é o pior bug possível deste produto. A trilha mostra se
 * `oferecer_horarios` rodou ANTES da fala. Sem ela, você está avaliando prosa.
 *
 * A hierarquia da bolha é INVERTIDA em relação ao painel, de propósito. Lá, "você" (o
 * dono) é o fill --primary à direita, porque é a voz de mais peso na tela dele. Aqui
 * quem digita é o CLIENTE, no celular dele: então o fill à direita é do cliente, e a
 * MAISA é branco com contorno --primary-soft à esquerda. Mesma regra do DS, sujeito
 * diferente. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { s, Icon } from "@/ui/primitivos";

/* ───────────────────────────── tipos ───────────────────────────── */

type Passo = { ferramenta: string; entrada: Record<string, unknown>; resultado: string; erro: boolean };

type Fala =
  | { de: "cliente"; txt: string }
  | { de: "maisa"; txt: string }
  | { de: "sistema"; txt: string; tom: "aviso" | "erro" };

type Estado = {
  pronto: boolean;
  modelo: string | null;
  provedor: string | null;
  agenda: string;
  canal: string;
  telefonePadrao: string;
  /** As duas colunas de baixo leem os adaptadores DEMO, e eles só são os vivos sem banco.
   *  Ver o `ESPIANDO` da rota — com Supabase configurado elas vêm vazias, e vazio aqui
   *  leria como "a MAISA não lembra de nada" quando o certo é "não é aqui que ela lembra". */
  espiando: boolean;
  memoria: {
    telefone: string; nome: string | null; servicoFavorito: string | null;
    profissionalFavorito: string | null; horarioFavorito: string | null; visitas: number;
  }[];
  agendados: { data: string; hora: string; cliente?: string; servico?: string }[];
};

/** Atalhos de teste. Não é enfeite: cada um exercita um caminho distinto do agente, e
 *  digitar isso à mão vinte vezes é o que faz alguém parar de testar. */
const ATALHOS = [
  "bom dia",
  "tem horário amanhã?",
  "quero marcar o atendimento padrão",
  "quanto custa o pacote completo?",
  "quais meus horários?",
  "preciso cancelar",
  "quero um desconto",
];

/** Cadência entre bolhas, em ms.
 *
 *  ⚠️ SIMULAÇÃO DE TELA, não comportamento do servidor: o agente devolve as bolhas
 *  todas de uma vez, e o `CanalDeMensagens` é que espaça no WhatsApp real. Aqui o
 *  intervalo existe para você VER a cadência — o produto é justamente não mandar um
 *  bloco, e um bloco revelado de uma vez esconde se a quebra funcionou. */
const CADENCIA = 550;

/* ───────────────────────────── página ───────────────────────────── */

export default function Laboratorio() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ocupada, setOcupada] = useState(false);
  const [trilha, setTrilha] = useState<Passo[]>([]);
  const [voltas, setVoltas] = useState<number | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const lerEstado = useCallback(async () => {
    try {
      const r = await fetch("/api/laboratorio", { cache: "no-store" });
      const d = await r.json();
      if (d?.ok) {
        setEstado(d);
        setTelefone((t) => t || d.telefonePadrao);
      }
    } catch {
      /* Silêncio proposital: se o dev server caiu, o erro útil aparece no envio da
       * mensagem, com contexto. Um alerta aqui só competiria com ele. */
    }
  }, []);

  useEffect(() => {
    void lerEstado();
  }, [lerEstado]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [falas, ocupada]);

  async function enviar(mensagem: string) {
    const limpo = mensagem.trim();
    if (!limpo || ocupada) return;

    setFalas((f) => [...f, { de: "cliente", txt: limpo }]);
    setTexto("");
    setOcupada(true);
    setTrilha([]);
    setVoltas(null);

    try {
      const r = await fetch("/api/laboratorio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: limpo, de: telefone }),
      });
      const d = await r.json();

      if (!d?.ok) {
        setFalas((f) => [...f, { de: "sistema", txt: String(d?.erro ?? "falhou"), tom: "erro" }]);
        return;
      }

      setTrilha(d.trilha ?? []);
      setVoltas(d.voltas ?? null);

      /* Bolha por bolha, com intervalo. Ver CADENCIA. */
      const bolhas: string[] = d.bolhas ?? [];
      for (let i = 0; i < bolhas.length; i++) {
        if (i > 0) await new Promise((ok) => setTimeout(ok, CADENCIA));
        setFalas((f) => [...f, { de: "maisa", txt: bolhas[i] }]);
      }

      /* Escalou: no WhatsApp real a MAISA cala e o dono recebe um aviso. Aqui isso tem
       * que ficar VISÍVEL, ou uma conversa que morreu parece uma conversa que terminou. */
      if (d.escalou) {
        setFalas((f) => [
          ...f,
          { de: "sistema", txt: `A MAISA passou a conversa para o responsável — ${d.motivo ?? "sem motivo informado"}. No WhatsApp real, ela para de responder aqui.`, tom: "aviso" },
        ]);
      }
    } catch (e) {
      setFalas((f) => [...f, { de: "sistema", txt: e instanceof Error ? e.message : "falha de rede", tom: "erro" }]);
    } finally {
      setOcupada(false);
      void lerEstado();
    }
  }

  async function esquecer() {
    await fetch("/api/laboratorio", { method: "DELETE" });
    setFalas([]);
    setTrilha([]);
    setVoltas(null);
    void lerEstado();
  }

  const semChave = estado && !estado.pronto;

  return (
    <div style={s("min-height:100%;background:var(--bg);color:var(--ink);display:flex;flex-direction:column")}>
      <Cabecalho estado={estado} telefone={telefone} setTelefone={setTelefone} onEsquecer={esquecer} ocupada={ocupada} />

      {semChave && (
        <Faixa tom="erro">
          Sem chave de IA. Preencha <code style={mono}>GEMINI_API_KEY</code> no <code style={mono}>.env.local</code> e reinicie o <code style={mono}>npm run dev</code>.
        </Faixa>
      )}

      <div style={s("flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 384px;gap:0;align-items:stretch")} className="lab-grade">
        {/* ── conversa ── */}
        <section style={s("display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line)")}>
          <div style={s("flex:1;min-height:0;overflow-y:auto;padding:24px 26px;display:flex;flex-direction:column;gap:14px;background:var(--surface-2)")}>
            {falas.length === 0 && <Vazio agenda={estado?.agenda} />}

            {falas.map((f, i) => (
              <Bolha key={i} fala={f} />
            ))}

            {ocupada && <Digitando />}
            <div ref={fim} />
          </div>

          <div style={s("flex-shrink:0;border-top:1px solid var(--line);background:var(--surface);padding:12px 18px 16px;display:flex;flex-direction:column;gap:11px")}>
            <div style={s("display:flex;gap:7px;flex-wrap:wrap")}>
              {ATALHOS.map((a) => (
                <button
                  key={a}
                  onClick={() => void enviar(a)}
                  disabled={ocupada}
                  className="m-hov-bg m-focus"
                  style={s(`font-size:var(--t-label);color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:5px 12px;${ocupada ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
                >
                  {a}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar(texto);
              }}
              style={s("display:flex;gap:10px;align-items:flex-end")}
            >
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia, Shift+Enter quebra linha — convenção de mensageiro.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar(texto);
                  }
                }}
                rows={1}
                placeholder="Escreva como se fosse o cliente"
                aria-label="Mensagem do cliente"
                className="m-focus"
                style={s("flex:1;resize:none;min-height:44px;max-height:132px;padding:11px 14px;font-size:var(--t-body);line-height:var(--lh-ui);color:var(--ink);background:var(--surface);border:1px solid var(--border-field);border-radius:12px")}
              />
              <button
                type="submit"
                disabled={ocupada || !texto.trim()}
                className="m-focus"
                style={s(`height:44px;padding:0 18px;display:flex;align-items:center;gap:8px;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--on-primary);background:var(--primary);border:1px solid var(--primary);border-radius:12px;${ocupada || !texto.trim() ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
              >
                <Icon name="send" size={16} stroke="var(--on-primary)" />
                Enviar
              </button>
            </form>
          </div>
        </section>

        {/* ── o que aconteceu por baixo ── */}
        <aside style={s("min-height:0;overflow-y:auto;background:var(--surface);padding:22px 20px;display:flex;flex-direction:column;gap:22px")} className="lab-lado">
          <Trilha passos={trilha} voltas={voltas} ocupada={ocupada} />
          {estado && !estado.espiando ? (
            <Secao titulo="O que ela lembra">
              <p style={s("margin:0;font-size:var(--t-sm);line-height:var(--lh-prose);color:var(--muted)")}>
                Com banco configurado, memória e agenda deste inquilino vivem no Supabase e no
                Google — não neste processo. Veja em <strong style={s("color:var(--ink)")}>Conversas</strong> e
                na <strong style={s("color:var(--ink)")}>Agenda</strong> do painel. A trilha acima continua
                valendo: ela é deste turno.
              </p>
            </Secao>
          ) : (
            <>
              <Memoria itens={estado?.memoria ?? []} />
              <Agendados itens={estado?.agendados ?? []} />
            </>
          )}
        </aside>
      </div>

      <style>{`
        .lab-grade { }
        @media (max-width: 1000px) {
          .lab-grade { grid-template-columns: minmax(0,1fr) !important; }
          .lab-lado { border-top: 1px solid var(--line); }
        }
      `}</style>
    </div>
  );
}

/* ───────────────────────────── partes ───────────────────────────── */

const mono = s("font-variant-numeric:tabular-nums;font-size:var(--t-label)");
const rotulo = s("font-size:var(--t-micro);font-weight:var(--w-title);letter-spacing:var(--ls-caps);text-transform:uppercase;color:var(--muted)");

function Cabecalho({
  estado, telefone, setTelefone, onEsquecer, ocupada,
}: {
  estado: Estado | null; telefone: string; setTelefone: (v: string) => void; onEsquecer: () => void; ocupada: boolean;
}) {
  return (
    <header style={s("flex-shrink:0;background:var(--surface);border-bottom:1px solid var(--line);padding:14px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap")}>
      <div style={s("display:flex;align-items:baseline;gap:10px")}>
        {/* Wordmark em minúscula, sempre — a marca não sobrevive a text-transform. */}
        <span style={s("font-family:var(--font-jakarta),var(--font-sans);font-weight:800;font-size:20px;letter-spacing:-0.02em;color:var(--ink)")}>
          maisa
        </span>
        <span style={rotulo}>Laboratório</span>
      </div>

      <div style={s("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
        <Selo icone="bot" texto={estado?.modelo ?? "—"} tom={estado?.provedor === "gemini" ? "primary" : "neutral"} />
        <Selo icone="calendar" texto={`Agenda: ${estado?.agenda ?? "—"}`} tom={estado?.agenda?.startsWith("google") ? "primary" : "warm"} />
        <Selo icone="whatsapp" texto={`Saída: ${estado?.canal ?? "—"}`} tom={estado?.canal === "evolution" ? "primary" : "warm"} />
      </div>

      <div style={s("margin-left:auto;display:flex;align-items:center;gap:10px")}>
        <label style={s("display:flex;align-items:center;gap:7px;font-size:var(--t-label);color:var(--muted)")}>
          Telefone
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            aria-label="Telefone do cliente que está escrevendo"
            className="m-focus"
            style={s("width:132px;padding:6px 9px;font-variant-numeric:tabular-nums;font-size:var(--t-label);color:var(--ink);background:var(--surface);border:1px solid var(--border-field);border-radius:8px")}
          />
        </label>
        <button
          onClick={onEsquecer}
          disabled={ocupada}
          className="m-hov-bg m-focus"
          title="Apaga memória, histórico e agenda — para testar o caminho de quem nunca falou com a MAISA"
          style={s(`display:flex;align-items:center;gap:7px;font-size:var(--t-sm);color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:7px 12px;${ocupada ? "opacity:.42;cursor:not-allowed" : "cursor:pointer"}`)}
        >
          <Icon name="trash" size={15} />
          Esquecer tudo
        </button>
      </div>
    </header>
  );
}

function Selo({ icone, texto, tom }: { icone: string; texto: string; tom: "primary" | "warm" | "neutral" }) {
  const pele =
    tom === "primary"
      ? "background:var(--primary-soft);color:var(--primary-dark);border-color:transparent"
      : tom === "warm"
        ? "background:var(--warm-soft);color:var(--warm-ink);border-color:transparent"
        : "background:var(--surface);color:var(--muted);border-color:var(--border)";
  return (
    <span style={s(`display:inline-flex;align-items:center;gap:6px;font-size:var(--t-label);font-variant-numeric:tabular-nums;padding:4px 10px;border:1px solid;border-radius:999px;${pele}`)}>
      <Icon name={icone} size={13} />
      {texto}
    </span>
  );
}

function Faixa({ tom, children }: { tom: "erro" | "aviso"; children: React.ReactNode }) {
  const pele = tom === "erro" ? "background:var(--danger-soft);color:var(--danger)" : "background:var(--warn-soft);color:var(--warn)";
  return (
    <div style={s(`flex-shrink:0;padding:11px 22px;font-size:var(--t-sm);display:flex;align-items:center;gap:9px;${pele}`)}>
      <Icon name="alert" size={16} />
      <span>{children}</span>
    </div>
  );
}

function Vazio({ agenda }: { agenda?: string }) {
  return (
    <div style={s("margin:auto;max-width:38ch;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;color:var(--muted)")}>
      <Icon name="chat" size={26} stroke="var(--primary)" />
      <p style={s("margin:0;font-size:var(--t-body);color:var(--ink)")}>Você é o cliente. Manda um &ldquo;bom dia&rdquo;.</p>
      <p style={s("margin:0;font-size:var(--t-sm);line-height:var(--lh-prose)")}>
        Ela deve responder o cumprimento e só então perguntar como ajudar — em outra mensagem.
        {agenda?.startsWith("demonstra") ? " A agenda é de mentira, com o almoço bloqueado das 12h às 13h." : ""}
      </p>
    </div>
  );
}

function Bolha({ fala }: { fala: Fala }) {
  if (fala.de === "sistema") {
    /* `--warn` e não `--warn-ink`: esse token nunca existiu (o parecido é `--warm-ink`, do
       âmbar, outra família), então a declaração era inválida e a cor caía no herdado. O L
       de `--warn` é calibrado para dar AA sobre o `-soft` da mesma cor. */
    const pele = fala.tom === "erro" ? "background:var(--danger-soft);color:var(--danger)" : "background:var(--warn-soft);color:var(--warn)";
    return (
      <div style={s(`align-self:center;max-width:56ch;text-align:center;font-size:var(--t-sm);line-height:var(--lh-prose);padding:9px 15px;border-radius:12px;${pele}`)}>
        {fala.txt}
      </div>
    );
  }

  const meu = fala.de === "cliente";
  /* Cliente = fill --primary à direita (a voz de quem está usando a tela).
     MAISA = branco com contorno --primary-soft à esquerda: ela fala pelo negócio, e
     contorno em vez de fill diz "infraestrutura", não "protagonista". */
  const pele = meu
    ? "background:var(--primary);border:1px solid var(--primary);color:var(--on-primary)"
    : "background:var(--surface);border:1px solid var(--primary-soft);color:var(--ink)";

  return (
    <div style={s(`max-width:min(72%, 62ch);align-self:${meu ? "flex-end" : "flex-start"}`)}>
      {/* Cantos declarados um a um: misturar shorthand com longhand da mesma
          propriedade faz o React reclamar em todo rerender, e o shorthand pode voltar
          depois e zerar o rabinho. */}
      <div
        style={s(
          `padding:11px 15px;border-top-left-radius:20px;border-top-right-radius:20px;` +
            `border-bottom-right-radius:${meu ? "7px" : "20px"};border-bottom-left-radius:${meu ? "20px" : "7px"};` +
            `font-size:var(--t-body);line-height:var(--lh-prose);${pele};display:flex;gap:8px;align-items:flex-start`,
        )}
      >
        {!meu && (
          <span role="img" aria-label="Enviada pela MAISA" style={s("display:flex;flex-shrink:0;margin-top:5px")}>
            <Icon name="bot" size={15} stroke="var(--primary)" />
          </span>
        )}
        <span style={s("white-space:pre-wrap")}>{fala.txt}</span>
      </div>
    </div>
  );
}

function Digitando() {
  return (
    <div style={s("align-self:flex-start;display:flex;align-items:center;gap:9px;padding:11px 15px;background:var(--surface);border:1px solid var(--primary-soft);border-radius:20px;border-bottom-left-radius:7px;color:var(--muted);font-size:var(--t-sm)")}>
      <Icon name="bot" size={15} stroke="var(--primary)" />
      digitando…
    </div>
  );
}

function Secao({ titulo, contagem, children }: { titulo: string; contagem?: string; children: React.ReactNode }) {
  return (
    <section style={s("display:flex;flex-direction:column;gap:10px")}>
      <div style={s("display:flex;align-items:baseline;justify-content:space-between;gap:8px")}>
        <h2 style={{ ...rotulo, margin: 0 }}>{titulo}</h2>
        {contagem && <span style={s("font-variant-numeric:tabular-nums;font-size:var(--t-micro);color:var(--muted)")}>{contagem}</span>}
      </div>
      {children}
    </section>
  );
}

function Trilha({ passos, voltas, ocupada }: { passos: Passo[]; voltas: number | null; ocupada: boolean }) {
  return (
    <Secao titulo="O que ela fez" contagem={voltas ? `${voltas} volta${voltas > 1 ? "s" : ""}` : undefined}>
      {ocupada ? (
        <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted)")}>Pensando…</p>
      ) : passos.length === 0 ? (
        <p style={s("margin:0;font-size:var(--t-sm);line-height:var(--lh-prose);color:var(--muted)")}>
          Nenhuma ferramenta neste turno. Para conversa fiada isso está certo — se ela falou de horário
          sem nada aqui, ela inventou.
        </p>
      ) : (
        <ol style={s("margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px")}>
          {passos.map((p, i) => (
            <li
              key={i}
              style={s(
                `border:1px solid ${p.erro ? "var(--danger-line)" : "var(--border)"};border-radius:10px;overflow:hidden;background:${p.erro ? "var(--danger-soft)" : "var(--surface)"}`,
              )}
            >
              <div style={s("padding:8px 11px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)")}>
                <Icon name={p.erro ? "x" : "check"} size={13} stroke={p.erro ? "var(--danger)" : "var(--success)"} />
                <code style={{ ...mono, fontWeight: 500, color: "var(--ink)" }}>{p.ferramenta}</code>
              </div>
              {Object.keys(p.entrada).length > 0 && (
                <div style={s("padding:7px 11px;border-bottom:1px solid var(--line)")}>
                  <code style={{ ...mono, color: "var(--muted)", wordBreak: "break-word" }}>{JSON.stringify(p.entrada)}</code>
                </div>
              )}
              <div style={s("padding:7px 11px")}>
                <span style={s(`font-size:var(--t-label);line-height:var(--lh-prose);white-space:pre-wrap;color:${p.erro ? "var(--danger)" : "var(--muted)"}`)}>
                  {p.resultado}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Secao>
  );
}

function Memoria({ itens }: { itens: Estado["memoria"] }) {
  return (
    <Secao titulo="O que ela lembra">
      {itens.length === 0 ? (
        <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted)")}>Nada ainda.</p>
      ) : (
        <div style={s("display:flex;flex-direction:column;gap:9px")}>
          {itens.map((m) => (
            <div key={m.telefone} style={s("border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:5px")}>
              <div style={s("display:flex;align-items:baseline;justify-content:space-between;gap:8px")}>
                <strong style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>{m.nome ?? "sem nome"}</strong>
                <code style={{ ...mono, color: "var(--muted)" }}>{m.telefone}</code>
              </div>
              {/* Favorito só aparece quando o domínio CONCLUIU que existe (3 visitas, 50%
                  de concentração). "—" aqui não é dado faltando: é a MAISA sendo honesta
                  sobre não ter padrão suficiente para afirmar. */}
              <dl style={s("margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:var(--t-label)")}>
                <dt style={s("color:var(--muted)")}>Visitas</dt>
                <dd style={{ ...mono, margin: 0, color: "var(--ink)" }}>{m.visitas}</dd>
                <dt style={s("color:var(--muted)")}>Serviço</dt>
                <dd style={{ ...mono, margin: 0, color: "var(--ink)" }}>{m.servicoFavorito ?? "—"}</dd>
                <dt style={s("color:var(--muted)")}>Profissional</dt>
                <dd style={{ ...mono, margin: 0, color: "var(--ink)" }}>{m.profissionalFavorito ?? "—"}</dd>
                <dt style={s("color:var(--muted)")}>Horário</dt>
                <dd style={{ ...mono, margin: 0, color: "var(--ink)" }}>{m.horarioFavorito ?? "—"}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
    </Secao>
  );
}

function Agendados({ itens }: { itens: Estado["agendados"] }) {
  return (
    <Secao titulo="Marcado na agenda" contagem={itens.length ? String(itens.length) : undefined}>
      {itens.length === 0 ? (
        <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted)")}>Nada marcado.</p>
      ) : (
        <ul style={s("margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px")}>
          {itens.map((a, i) => (
            <li key={i} style={s("display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:10px;padding:9px 11px")}>
              <Icon name="calendar-check" size={15} stroke="var(--success)" />
              <div style={s("display:flex;flex-direction:column;gap:1px;min-width:0")}>
                <code style={{ ...mono, color: "var(--ink)" }}>
                  {a.data} · {a.hora}
                </code>
                <span style={s("font-size:var(--t-label);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>
                  {[a.cliente, a.servico].filter(Boolean).join(" · ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
