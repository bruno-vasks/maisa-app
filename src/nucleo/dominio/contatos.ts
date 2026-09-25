/* ─────────────────────────────────────────────────────────────────────────────
 * O CADERNO DE NOMES, E A REGRA DE QUEM A MAISA ATENDE.
 *
 * ⚠️ A PREMISSA QUE ESTAVA ERRADA. Até 16/08/2026 o raciocínio era: *"o número pareado É o
 * número do negócio, então quem manda mensagem para ele é alguém com quem o negócio quer
 * falar — responde todo mundo"*. Bruno derrubou isso com o ICP na mão: *"essa MAISA roda no
 * meu número pessoal, muitos barbeiros fazem o mesmo, não tem número corporativo diferente
 * do pessoal"*. E nomeou o desfecho: **"seria terrível ter a MAISA falando com seu PAI"**.
 *
 * O inverso também é armadilha. Calar para quem está na agenda de contatos silencia
 * justamente os clientes fiéis de um barbeiro — que estão salvos no celular dele.
 *
 * **Nenhum sinal separa os dois sozinho.** Nem "está nos contatos", nem "é número novo". A
 * informação que falta é do dono, e por isso ela é uma PERGUNTA, feita uma vez, no
 * pareamento: este número é só do negócio, ou é o seu também?
 *
 * ── ★ NO MODO PESSOAL, ELA VIROU LISTA DE PERMISSÃO (24/09/2026) ──
 *
 * Até aqui o desenho era o oposto: "quem não está no caderno é o lead, responde". Caiu em
 * produção. A Psicologia Regina importou a agenda, marcou TODOS os 39 contatos como "não
 * atender" — e a MAISA respondeu três pessoas da vida dela mesmo assim, uma delas numa
 * conversa de 19 mensagens. Medido: a agenda dela na Evolution tem 2.238 entradas, 2.119
 * (95%) são `@lid` sem telefone. O caderno cobria 2% de quem ela conhece, e os outros 98%
 * eram "desconhecido = lead". Os três já conversavam com ela no WhatsApp desde julho e
 * setembro; o produto só não perguntou.
 *
 * "Não está no caderno" nunca significou "é um estranho". Significa "o import não trouxe".
 * Então no modo pessoal a regra agora é a do Bruno, com as palavras dele: **a MAISA só
 * responde se a pessoa REALMENTE QUISER.** Ou seja:
 *
 *   • contato marcado como cliente → atende;
 *   • qualquer outro contato do caderno → cala;
 *   • fora do caderno → só atende se for NÚMERO NOVO de verdade (ver `ehNumeroNovo`) E a
 *     mensagem for CLARAMENTE um pedido de horário. As duas coisas, não uma.
 *
 * O custo é conhecido e aceito: o lead que escreve "oi, tudo bem?" e some não é atendido.
 * Esse custa uma venda. O erro oposto custa uma mensagem de robô no WhatsApp de uma amiga da
 * terapeuta, que não se apaga — e aconteceu duas vezes (24/08 e 24/09).
 *
 * ── O QUE O CADERNO FAZ NOS DOIS MODOS ──
 *
 * Nos dois ele empresta NOME: quando `+55 11 97xxx` escreve, ela diz "Oi, Fernanda!" em vez
 * de "Oi!". Isso vale sempre, e é a maior parte do valor dele.
 *
 * ⚠️ CONTATO NÃO É CLIENTE, e essa separação é estrutural. `clientes` alimenta o faturamento
 * (`v_clientes.valor`) e a tela de Clientes; encher aquela tabela com as 374 pessoas da
 * agenda de alguém quebra as duas. Cliente continua sendo quem MARCOU — `garantirCliente`
 * cria a linha na hora em que isso acontece.
 * ────────────────────────────────────────────────────────────────────────────── */

import { soDigitos } from "./clientes";

/**
 * De quem é o número que a MAISA atende.
 *
 * ⚠️ O PADRÃO É `pessoal`, e é fail-safe deliberado. Errar para "negócio" faz a MAISA
 * oferecer horário para a mãe do dono; errar para "pessoal" faz ela deixar de responder um
 * contato salvo — chato, visível na tela de Conversas (a mensagem é registrada mesmo quando
 * ela cala), e corrigível com um toque. O primeiro erro custa a confiança no produto; o
 * segundo custa um clique.
 */
export type ModoDoNumero =
  /** Linha do negócio. Ela responde todo mundo. */
  | "negocio"
  /** Também é o celular pessoal do dono. Ela responde quem ele marcou como cliente, e
   *  número novo que chega pedindo horário. Mais ninguém. */
  | "pessoal";

export const MODO_PADRAO: ModoDoNumero = "pessoal";

export function ehModoDoNumero(v: unknown): v is ModoDoNumero {
  return v === "negocio" || v === "pessoal";
}

/** Uma linha do caderno. Vem da agenda do WhatsApp do dono, ou de um toque na tela. */
export type Contato = {
  /** Os 8 últimos dígitos — a MESMA chave de `clientes` e `mensagens_agente`. Ver `chaveDe`. */
  chave: string;
  /** Como o dono salvou a pessoa. É isto que a MAISA usa para chamar pelo nome. */
  nome: string | null;
  /**
   * O dono disse que esta pessoa é cliente.
   *
   * ⚠️ TERNÁRIO DE PROPÓSITO, não booleano. `null` é "ele nunca disse", e é diferente de
   * "ele disse que não": no modo pessoal o silêncio de um contato importado significa não
   * atender, mas quem foi marcado explicitamente como NÃO-cliente nunca deve voltar a ser
   * sugerido. Um booleano com default `false` misturaria as duas coisas.
   */
  cliente: boolean | null;
};

/**
 * A chave de casamento: os 8 últimos dígitos.
 *
 * Oito, e não o número inteiro, porque o mesmo telefone chega escrito de três formas — com
 * e sem DDI, com e sem o nono dígito de celular. É a normalização que `clientes.telefone_chave`
 * e `mensagens_agente.telefone_chave` já usam; divergir aqui faria o caderno nunca casar com
 * quem escreve.
 *
 * Devolve `""` para o que não tem 8 dígitos — e quem chama trata isso como "não sei quem é",
 * nunca como uma chave válida. Chave vazia casando com chave vazia juntaria estranhos.
 */
export function chaveDe(telefone: string | null | undefined): string {
  const d = soDigitos(telefone);
  return d.length >= 8 ? d.slice(-8) : "";
}

/**
 * Quanto tempo um número desconhecido continua "novo" depois da primeira mensagem.
 *
 * Existe porque lead de verdade quase nunca abre com o pedido: escreve "oi", espera, e só
 * depois diz "queria marcar uma sessão". Sem janela, o "oi" faria dele um número com
 * histórico e o pedido seguinte cairia no silêncio. 24h cobre a conversa de chegada e não
 * cobre quem já conversava com o dono semana passada.
 */
export const JANELA_NUMERO_NOVO_MS = 24 * 60 * 60 * 1000;

/**
 * O que o WhatsApp do dono já viu deste número, antes da MAISA decidir.
 *
 * Vem do provedor (a Evolution guarda o histórico que o celular sincronizou ao parear) e é o
 * dado que faltava em 24/09: os três que a MAISA respondeu tinham conversa com a Regina
 * desde julho. O celular sabia; o caderno, não.
 */
export type RastroNoCanal = {
  /** Alguém deste WhatsApp — o dono ou a MAISA — já escreveu para este número. */
  jaEscreveramParaEle: boolean;
  /** A mensagem mais antiga da conversa, em ISO. `null` = conversa vazia. */
  maisAntiga: string | null;
};

/**
 * Este número é NOVO de verdade — alguém que nunca falou com o dono?
 *
 * Falha fechada em tudo que é dúvida:
 *   • o dono (ou a MAISA) já escreveu para ele → não é novo. Resposta do dono é relação;
 *   • a thread da MAISA tem fala que não é do cliente → não é novo, pelo mesmo motivo;
 *   • a mensagem mais antiga, em QUALQUER das duas fontes, tem mais que a janela → não é
 *     novo. É quem já conversava antes.
 *
 * `anteriores` é a thread da MAISA ANTES da mensagem atual. O que o provedor tem e o banco
 * não tem é o histórico de antes do pareamento — por isso as duas fontes.
 */
export function ehNumeroNovo(p: {
  rastro: RastroNoCanal;
  anteriores: readonly { de: string; em?: string }[];
  agora: Date;
}): boolean {
  if (p.rastro.jaEscreveramParaEle) return false;
  if (p.anteriores.some((m) => m.de !== "cliente")) return false;

  const datas = [p.rastro.maisAntiga, ...p.anteriores.map((m) => m.em ?? null)]
    .filter((d): d is string => !!d)
    .map((d) => Date.parse(d))
    .filter((n) => Number.isFinite(n));
  if (datas.length === 0) return true;
  return p.agora.getTime() - Math.min(...datas) <= JANELA_NUMERO_NOVO_MS;
}

/**
 * A MAISA pode responder esta pessoa?
 *
 * Função pura, e é aqui que a decisão mora — não no adaptador do webhook nem num `if` dentro
 * do agente. O motivo é que ela precisa ser LIDA por quem for auditar o produto: "por que a
 * MAISA não respondeu meu pai?" tem que ter uma resposta de uma linha.
 *
 * `contato` é `null` quando o número não está no caderno.
 */
export type Atendimento = {
  modo: ModoDoNumero;
  contato: Contato | null;
  /** Ver `ehNumeroNovo`. Só pesa fora do caderno, no modo pessoal. */
  numeroNovo: boolean;
  /**
   * A mensagem é CLARAMENTE um pedido de horário? Quem decide é um classificador estrito
   * (`aplicacao/intencao.ts`) que responde "não" na dúvida.
   *
   * Só é perguntado quando o resto já deixou passar — é uma chamada de modelo, e custa.
   * Quando não se perguntou, vale `false`.
   */
  querMarcar: boolean;
};

export function podeResponder(p: Atendimento): boolean {
  /* Linha do negócio: não há vida pessoal para proteger. Responde todo mundo, inclusive —
   * e principalmente — quem ela nunca viu, que é o lead. */
  if (p.modo === "negocio") return true;

  /* Está no caderno. Só responde se o dono disse que é cliente. `null` (nunca disse) cala:
   * ver o ⚠️ de `MODO_PADRAO` — o erro barato é este. */
  if (p.contato) return p.contato.cliente === true;

  /* ── ⚠️ FORA DO CADERNO, NO NÚMERO PESSOAL ──
   *
   * Aqui morava "desconhecido é o lead, responde", e foi essa linha que falou com as amigas
   * da Regina em 24/09/2026. Fora do caderno não quer dizer estranho: com 95% da agenda em
   * `@lid`, quer dizer "o import não trouxe". Então as DUAS condições, sem atalho. */
  return p.numeroNovo && p.querMarcar;
}

/**
 * Por que ela calou, em uma frase, para o log e para a tela.
 *
 * Existe porque silêncio sem motivo registrado é o modo de falha mais caro deste canal: o
 * dono vê "a MAISA não respondeu" e não tem como distinguir isto de um erro de verdade.
 */
export function motivoDoSilencio(p: Atendimento): string | null {
  if (podeResponder(p)) return null;

  if (p.contato) {
    const quem = p.contato.nome?.trim();
    return quem
      ? `${quem} está nos seus contatos e não foi marcado como cliente — neste número a MAISA só atende cliente marcado.`
      : "Este número está nos seus contatos e não foi marcado como cliente.";
  }

  if (!p.numeroNovo) {
    return "Este número já conversava com você antes e não está marcado como cliente. No seu número pessoal "
      + "a MAISA só atende cliente marcado — e número novo que chega pedindo horário.";
  }

  return "Número novo, mas a mensagem não é um pedido claro de horário. No seu número pessoal a MAISA só "
    + "entra quando a pessoa quer marcar.";
}
