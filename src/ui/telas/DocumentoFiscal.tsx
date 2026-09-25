"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * DOCUMENTO FISCAL — o que a MAISA emite quando você recebe.
 *
 * ★ POR QUE ESTA TELA EXISTE (Bruno, 26/08/2026): *"uma nova config de escolher se é PJ ou CPF,
 * para mudar por lá, e não no faturamento"*.
 *
 * A escolha entre nota fiscal e recibo do Receita Saúde vivia dentro do Faturamento, empilhada
 * com o fechamento do mês. Duas coisas erradas nisso:
 *
 *   1 · É decisão que se toma UMA VEZ, e ficava ocupando a tela que se abre todo mês.
 *   2 · Enquanto ela não estava tomada, o Faturamento não sabia o que prometer — e prometia
 *       nota fiscal a quem emite recibo. Era a origem do "CTA que ainda diz emitir notas no
 *       modo recibo".
 *
 * Agora o Faturamento tem um assunto só (emitir), e o que ele emite se decide aqui.
 *
 * ── ★ O ACIDENTE QUE ESCREVEU AS REGRAS DESTE ARQUIVO (26/08/2026, 16:46) ──
 *
 * A primeira versão derivava o cartão marcado do `caminho`. Parece óbvio e está errado:
 * `caminhoDaNota` responde `"municipal"` para uma config VAZIA — é o padrão de quem ainda não
 * respondeu nada, e o próprio `nucleo/dominio/fiscal.ts` avisa isso em letras maiúsculas.
 *
 * O efeito em cascata, na tela do Bruno:
 *   · o cartão "Tenho CNPJ" apareceu marcado para quem nunca escolheu CNPJ;
 *   · o outro cartão virou, por consequência, uma **troca** em vez de uma escolha;
 *   · a troca chamava `DELETE /api/fiscal`;
 *   · e o DELETE **apagou de verdade** o CPF, a profissão, o registro no conselho e o ambiente
 *     de produção que já estavam gravados.
 *
 * Daí as duas regras que este arquivo agora obedece, e que não são estilo:
 *
 *   1 · **Marcado = escolhido de fato** (`escolhaFeita`), nunca derivado do `caminho`.
 *   2 · **Chamada destrutiva só na direção que a exige.** Sair do recibo é um DELETE. Entrar no
 *       recibo NÃO é: é um POST com o CPF, que o formulário abaixo faz. Antes, as duas direções
 *       passavam pelo mesmo DELETE.
 *
 * ── ⚠️ ESTA TELA NÃO REIMPLEMENTA OS DOIS FLUXOS ──
 *
 * `LigarNotaFiscal` (CNPJ + certificado) e `LoteReceitaSaude` (CPF, profissão, registro,
 * autorização no e-CAC e o arquivo do mês) continuam sendo os componentes que fazem o trabalho.
 * O que é novo é o **seletor**: ver em qual caminho você está, e trocar.
 *
 * ⚠️ E o seletor CONTROLA o `LigarNotaFiscal` (props `modo`/`onModo`). Sem isso são duas
 * perguntas na mesma tela, e foi assim que a divergência apareceu: o seletor afirmando um caminho
 * e o cartão logo abaixo perguntando do zero.
 *
 * ── ⚠️ A NOTA FISCAL NÃO FOI MEXIDA, E ISSO É DECISÃO ──
 *
 * O caminho do CNPJ está aqui **guardado como estava**, para a v2 reestruturar. Redesenhar os
 * dois caminhos na mesma passada dobraria a superfície de erro num assunto onde errar significa
 * documento fiscal torto.
 * ────────────────────────────────────────────────────────────────────────────── */

import React, { useState } from "react";
import { s, Icon, Btn, Card, SectionTitle } from "@/ui/primitivos";
import { useStore } from "@/ui/estado/store";
import { TelaGrade } from "@/ui/componentes/Cartao";
import { LigarNotaFiscal } from "@/ui/componentes/LigarNotaFiscal";
import { LoteReceitaSaude, NoSiteDaReceita } from "@/ui/componentes/LoteReceitaSaude";
import { faltaParaEmitirRecibo } from "@/nucleo/dominio/checklist-recibo";
import { hojeISO } from "@/nucleo/dominio/tempo";

type Modo = "nota" | "recibo";

/**
 * ★ O QUE ELE JÁ ESCOLHEU — e `null` quando ninguém escolheu nada.
 *
 * ⚠️ NÃO DERIVE ISTO DE `caminho`. `caminhoDaNota` devolve `"municipal"` para config vazia, de
 * propósito: quem não digitou CNPJ não é pessoa física, é alguém no meio do onboarding (o aviso
 * está em `nucleo/dominio/fiscal.ts`). Usar o caminho aqui marcou "Tenho CNPJ" para quem nunca
 * escolheu, transformou a outra opção em "troca", e a troca apagou a configuração fiscal de
 * verdade — CPF, profissão, registro e ambiente. Ver o cabeçalho.
 *
 * A escolha mora nos DADOS que só existem se alguém respondeu: o CPF do prestador, ou o CNPJ.
 */
export function escolhaFeita(
  config: { prestadorCpf: string | null; cnpj: string | null; empresaId: number | null } | null,
): Modo | null {
  if (!config) return null;
  if (config.prestadorCpf) return "recibo";
  /* `empresaId` junto com `cnpj` porque a empresa criada no provedor é o compromisso mais forte
   * dos dois: ela existe e é cobrada lá, mesmo que a coluna do CNPJ tenha sido limpa. */
  if (config.cnpj || config.empresaId != null) return "nota";
  return null;
}

const OPCOES: { modo: Modo; titulo: string; sub: string; icone: string }[] = [
  {
    modo: "nota",
    titulo: "Tenho CNPJ",
    sub: "A MAISA emite nota fiscal de serviço. Precisa de certificado digital.",
    icone: "receipt",
  },
  {
    modo: "recibo",
    titulo: "Atendo como pessoa física",
    sub: "A MAISA emite recibo do Receita Saúde, no seu CPF. Sem certificado.",
    icone: "stethoscope",
  },
];

export function DocumentoFiscal() {
  const st = useStore();
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Qual troca está pedindo confirmação. `null` = nenhuma. */
  const [confirmar, setConfirmar] = useState<Modo | null>(null);
  /** Escolha ainda NÃO gravada: serve só para revelar o formulário certo abaixo. */
  const [escolha, setEscolha] = useState<Modo | null>(null);

  const sabemos = st.fiscal.status === "ok";
  const config = sabemos ? st.fiscal.config : null;
  /** O que está gravado. `null` = a pergunta ainda está de pé. */
  const feita = escolhaFeita(config);
  /** O que a tela mostra agora: o gravado manda; sem ele, a escolha da sessão. */
  const modo = feita ?? escolha;

  /* ⚠️ EMPRESA JÁ CRIADA NO PROVEDOR NÃO SE DESFAZ DAQUI. Existe um CNPJ cadastrado e cobrado
   * lá; virar para pessoa física deixaria a empresa viva e o dono achando que desligou. O núcleo
   * recusa (ver `criarLigarReciboSaude`), e a tela diz isso antes do clique — não depois, com uma
   * mensagem de erro. */
  const presoNoCnpj = feita === "nota" && config?.empresaId != null;

  /**
   * ★ A ÚNICA TRANSIÇÃO QUE CHAMA O SERVIDOR: sair do recibo.
   *
   * ⚠️ E É SÓ ESSA. Entrar no recibo é um `POST` com o CPF, feito pelo formulário abaixo — não um
   * DELETE. A versão anterior mandava as duas direções pelo mesmo DELETE, e como o cartão marcado
   * estava errado (ver o cabeçalho), o "escolher pessoa física" de quem nunca tinha escolhido nada
   * virou um apagar.
   *
   * O servidor recusa quando já existe lote importado, e a frase que volta é a que ela precisa ler
   * — não tratamos essa recusa como bug.
   */
  const sairDoRecibo = async () => {
    setTrocando(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal", { method: "DELETE" }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.info ?? r?.mensagem ?? "Não consegui trocar agora.");
      st.aplicarFiscal(r);
      setEscolha("nota");
      setConfirmar(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui trocar agora.");
    } finally {
      setTrocando(false);
    }
  };

  const clicar = (alvo: Modo) => {
    /* Nada gravado: escolher é só revelar o formulário. Zero chamada, zero confirmação — não há
     * o que perder, e pedir confirmação para preencher um formulário é atrito sem risco. */
    if (feita === null) { setEscolha(alvo); setErro(null); return; }
    /* Já gravado. Sair do recibo apaga configuração: pergunta antes. */
    if (feita === "recibo") { setConfirmar(alvo); return; }
    /* Estava no CNPJ e quer virar pessoa física: sem empresa criada, é só preencher o CPF abaixo
     * (o POST sobrescreve). Com empresa criada, `presoNoCnpj` já bloqueou o clique. */
    setEscolha(alvo);
  };

  return (
    <TelaGrade>
      <div style={s("display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap")}>
        <div style={s("flex:1;min-width:240px")}>
          <SectionTitle
            title="Documento fiscal"
            sub="O que a MAISA emite quando você recebe. Escolha uma vez; ela usa isso todo mês."
          />
        </div>
        {/* ⚠️ SAÍDA EXPLÍCITA. Esta tela não está no rail (é decisão de uma vez só), e sem um jeito
            de voltar ela parece um beco — foi a segunda coisa que o Bruno relatou em 26/08. */}
        {/* O rótulo é "Fiscal" e o id é `faturamento` — a tela foi renomeada em 26/08/2026 e o id
            ficou por causa dos links já compartilhados. Ver o registro no `AppShell`. */}
        <Btn variant="ghost" icon="chevron-left" onClick={() => st.irPara("faturamento")}>
          Fiscal
        </Btn>
      </div>

      <Card style={s("display:flex;flex-direction:column;gap:12px")}>
        <div style={s("display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px")}>
          {OPCOES.map((o) => {
            const on = modo === o.modo;
            /* Clicável quando há o que fazer: escolher (nada gravado) ou trocar (gravado, e não
               preso pela empresa criada no provedor). */
            const clicavel = sabemos && !on && !(presoNoCnpj && o.modo === "recibo");
            return (
              <button
                key={o.modo}
                onClick={clicavel ? () => clicar(o.modo) : undefined}
                disabled={!clicavel}
                className={clicavel ? "m-focus m-card-hov" : ""}
                aria-pressed={on}
                style={s(`text-align:left;font-family:inherit;display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:12px;border:1.5px solid ${on ? "var(--primary)" : "var(--border)"};background:${on ? "var(--primary-soft)" : "var(--surface)"};cursor:${clicavel ? "pointer" : "default"}`)}
              >
                <span
                  aria-hidden
                  style={s(`width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;background:${on ? "var(--primary)" : "var(--surface-2)"};color:${on ? "#fff" : "var(--muted)"}`)}
                >
                  <Icon name={o.icone} size={17} />
                </span>
                <span style={s("min-width:0")}>
                  <span style={s(`display:flex;align-items:center;gap:7px;font-size:var(--t-body);font-weight:var(--w-title);color:var(--ink)`)}>
                    {o.titulo}
                    {/* ⚠️ O CHECK SÓ APARECE COM ESCOLHA GRAVADA. Marcar o que está apenas
                        selecionado na sessão faria a tela afirmar um estado que o banco não tem. */}
                    {on && feita === o.modo && <Icon name="check" size={15} sw={2.4} style={{ color: "var(--primary)" }} />}
                  </span>
                  <span style={s("display:block;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose);margin-top:3px")}>
                    {o.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {feita === null && (
          <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
            {modo === null
              ? "Você ainda não escolheu — e são documentos diferentes, não jeitos diferentes do mesmo. Escolha acima e eu peço só o que aquele caminho precisa."
              : "Escolhido, mas ainda não gravado: preencha abaixo para valer."}
          </p>
        )}

        {presoNoCnpj && (
          <p style={s("margin:0;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
            Seu CNPJ já está cadastrado no emissor. Para atender como pessoa física, fale com a
            gente antes — a empresa precisa ser encerrada lá, e isso não se desfaz por aqui.
          </p>
        )}

        {erro && (
          <p style={s("margin:0;font-size:var(--t-label);color:var(--danger);line-height:var(--lh-prose)")}>{erro}</p>
        )}

        {/* ⚠️ SÓ APARECE PARA A DIREÇÃO QUE APAGA ALGO, e a frase diz exatamente o que sai. O texto
            genérico de antes ("a configuração atual sai") acompanhava um clique que, na tela de
            quem não tinha escolhido nada, apagava CPF, profissão, registro e ambiente. */}
        {confirmar && feita === "recibo" && (
          <div style={s("display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:12px;border:1px solid var(--warn-line);background:var(--warn-soft)")}>
            <strong style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
              Desligar os recibos e ir para nota fiscal?
            </strong>
            <span style={s("font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose)")}>
              Isso apaga seu CPF de emitente, a profissão e o registro no conselho. Os recibos já
              emitidos continuam no lugar — some a configuração, não o histórico.
            </span>
            <div style={s("display:flex;gap:8px;flex-wrap:wrap")}>
              <Btn onClick={() => void sairDoRecibo()}>{trocando ? "Desligando…" : "Desligar os recibos"}</Btn>
              <Btn variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Btn>
            </div>
          </div>
        )}
      </Card>

      {/* ⚠️ O INTERRUPTOR "avisar o paciente" MOROU AQUI E SAIU (Bruno, 26/08/2026): *"não cheguei
          a achar o toggle fácil, poderia ficar logo acima do emitir"*. Ele foi para o painel de
          emissão, encostado no CTA — que é o instante em que a pergunta "meus pacientes vão saber
          disso?" realmente aparece na cabeça de quem clica. Ver `EmitirRecibos`. */}

      {/* Os dois fluxos. ⚠️ O `LigarNotaFiscal` vai CONTROLADO: a pergunta é o seletor acima, e
          duas perguntas na mesma tela foi o defeito de 26/08. O `LoteReceitaSaude` decide sozinho
          (ele só aparece quando o caminho JÁ é recibo). */}
      <LigarNotaFiscal
        modo={modo === "nota" ? "cnpj" : modo === "recibo" ? "cpf" : null}
        onModo={(m) => setEscolha(m === "cnpj" ? "nota" : m === "cpf" ? "recibo" : null)}
      />
      {/* ⚠️ SÓ OS DADOS DE EMITENTE. O arquivo do e-CAC saiu desta tela em 26/08/2026 (Bruno:
          *"não precisamos mais dessa parte dos recibos do mês"*) — o caminho principal virou a
          emissão automática, na tela Fiscal. O que fica é a identidade de quem emite, porque é
          para cá que o "Voltar e editar meus dados" de lá aponta. */}
      {modo === "recibo" && <LoteReceitaSaude apenasDados />}
      {/* O passo a passo do e-CAC (autorização, Carnê-Leão, conferência): só com a escolha
          gravada, porque os passos dependem do CPF e da profissão dela. `?secao=autorizacao`
          e `?secao=carne-leao` rolam até o item (1A.14). */}
      {feita === "recibo" && config && (
        <NoSiteDaReceita config={config} foco={st.secao === "autorizacao" || st.secao === "carne-leao" ? st.secao : null} />
      )}

      {/* ── ★ O PRÓXIMO PASSO, DITO EM VOZ ALTA ──
          Esta tela respondia uma pergunta e parava. Quem terminava de escolher ficava olhando para
          uma configuração sem saber que o trabalho acontece em outro lugar. */}
      {/* ⚠️ SÓ COM A ESCOLHA GRAVADA E NADA BLOQUEANDO (25/09/2026, 1A.13, 06 P0-4). Aparecia com
          `modo === "recibo"`, inclusive antes de gravar e sem o CRP: o único botão primário da
          tela levava de volta ao bloqueio da tela Fiscal. A regra é `faltaParaEmitirRecibo`. */}
      {feita === "recibo" && config && faltaParaEmitirRecibo(config, hojeISO()).length === 0 && (
        <Card style={s("display:flex;align-items:center;gap:16px;flex-wrap:wrap")}>
          <span style={s("flex:1;min-width:220px")}>
            <span style={s("display:block;font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>
              Pronto para emitir
            </span>
            <span style={s("display:block;font-size:var(--t-label);color:var(--muted);line-height:var(--lh-prose);margin-top:2px")}>
              A MAISA junta os atendimentos pagos do mês e emite um recibo para cada um.
            </span>
          </span>
          <Btn icon="receipt" onClick={() => st.irPara("faturamento")}>Continuar para emissão</Btn>
        </Card>
      )}
    </TelaGrade>
  );
}
