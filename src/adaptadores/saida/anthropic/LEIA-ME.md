# `saida/anthropic/` — o modelo da conversa

Cumpre a porta [`ModeloDeConversa`](../../../nucleo/portas/saida/modelo-conversa.ts).
**⚠️ Só servidor.**

Era o corpo do `agente.ts` até o Gemini entrar. Ficou guardado, e desde 30/10/2026 voltou a
responder: `composicao.ts` escolhe este sempre que há `ANTHROPIC_API_KEY`, e o Gemini fica com o
áudio, a busca e o comprovante. Voltar a conversa para o Gemini é apagar a chave.

| Arquivo | O que é |
|---|---|
| `modelo-anthropic.ts` | `criarModeloAnthropic` (a fábrica; recebe um cliente, para o teste), `paraMensagens` (o histórico no formato da Anthropic) e `MODELO_ANTHROPIC` |
| `modelo-anthropic.test.ts` | O pedido (modelo, raciocínio, esforço, fallback, cache) e o turno com ferramentas voltando igual, contra um cliente falso |

## O que não é óbvio

**É fábrica, não constante exportada.** `new Anthropic()` estoura sem credencial, e
`composicao.ts` é importado por **toda** rota de API — uma constante no topo faria a agenda e
a nota fiscal pararem de funcionar num ambiente sem chave de modelo. Só quem escolhe este
adaptador paga por construí-lo.

**Modelo fixo no código (`claude-sonnet-5-5`), e de propósito.** Cache de prompt é **por modelo**:
trocar o modelo invalida o cache, então ele não pode variar por requisição sem jogar fora o
desconto do prefixo estável. Mudança de modelo aqui é deploy, não configuração — diferente do
[`gemini/`](../gemini/LEIA-ME.md), que lê `GEMINI_MODELO` do ambiente. Sonnet, e não Opus: na
bancada de 26/10/2026 o Opus não ganhou do Sonnet.

**`effort: "low"` é decisão de produto embutida numa string.** Cada segundo é o cliente olhando
"digitando..." no WhatsApp, e a parte difícil aqui não é raciocínio: é seguir instrução e
chamar a ferramenta certa. Se a MAISA se perder, o degrau é `medium`.

**O breakpoint de cache fica no bloco estável.** Ele cacheia o bloco **e as ferramentas**, que
são renderizadas antes dele na ordem do wire. A data de hoje vai no bloco volátil, depois —
senão o prefixo mudaria à meia-noite e o catálogo inteiro seria reprocessado a preço cheio a
cada mensagem.

**Pensamento LIGADO.** Mesmo motivo do Gemini: com raciocínio desabilitado o modelo às vezes
escreve a chamada de ferramenta como texto visível — o turno "dá certo", a ferramenta nunca
roda, e o cliente recebe a intenção em vez do agendamento.

**O turno com ferramentas volta igual.** A Anthropic pede que o raciocínio do modelo volte
intacto entre um passo e o seguinte. O conteúdo inteiro da resposta (raciocínio, texto e
chamadas) viaja em `ChamadaDeFerramenta.estadoOpaco` da primeira chamada, o mesmo campo que
carrega o `thoughtSignature` do Gemini, e `paraMensagens` o devolve sem tocar. Só existe dentro
do laço de uma mensagem: o `agente.ts` não guarda turno de ferramenta, e a parte volátil do
prompt (a data, a memória do cliente) muda de uma mensagem para outra. Um bloco de raciocínio
reenviado depois de o prompt mudar é recusado (400) nas contas novas da Anthropic, então ele
nunca sai do laço.

**Fallback no servidor.** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): uma
recusa dos classificadores é refeita por outro modelo dentro da mesma chamada. No Sonnet 5.5 isso
só cobre `cyber` e `frontier_llm`; as outras recusas voltam como `recusou`, e o agente trata.
Quando outro modelo terminou a resposta, o turno volta reconstruído, sem o estado.

## O que NÃO fazer aqui

- ❌ Deixar `tool_use`, `stop_reason` ou `TextBlock` escaparem no tipo de retorno. Todo o
  vocabulário da Anthropic morre neste arquivo — foi para isso que a porta nasceu.
- ❌ Importar outro adaptador.
- ❌ Construir o cliente no topo do módulo. Ver "é fábrica, não constante".
