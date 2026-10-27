# `avaliacao/` — a bancada de conversas da MAISA

Clientes simulados conversando com a MAISA de verdade, e um juiz dando nota. Existe porque
até outubro de 2026 a MAISA tinha respondido 11 conversas reais, e nenhum teste do
repositório olhava o que ela FALA: os testes cobrem as travas (não marcar horário
inventado, não duplicar atendimento), não se ela soa como gente.

```sh
npm run conversas -- --modelo gemini:gemini-3.5-flash-lite --env "<caminho>/.env.local"
```

O relatório sai em `avaliacao/resultados/<data>-<rótulo>/relatorio.md` (fora do git: são
transcrições inteiras). Com `--comparar <pasta de outra rodada>` sai também um
`comparacao.md`, o antes × depois.

## ⚠️ Antes de rodar: a cota do Gemini é a de produção

Em 26/10/2026 a bancada esgotou as cotas **diárias** do plano gratuito da chave do Gemini
(500 chamadas de conversa e 1000 embeddings por dia; também há 15 chamadas por minuto no
flash-lite e 5 no 3.6-flash). A chave do `.env.local` é a mesma de produção: esgotar a cota
aqui cala a MAISA dos clientes até o dia virar (meia-noite do Pacífico, 4h ou 5h de Brasília).

Enquanto a chave for essa, rode **só com Claude** e sem tocar no Gemini:

```sh
GEMINI_API_KEY=desligada npm run conversas -- --modelo claude:claude-sonnet-5-5 --embedding demo --audio simular
```

`GEMINI_API_KEY=desligada` faz qualquer chamada escapada falhar em vez de gastar cota.
`--embedding demo` busca as respostas prontas por palavras (mais fraco que o Gemini: compare só
rodadas com o mesmo embedding). `--audio simular` entrega a fala como transcrição perfeita.
Para medir o Gemini de verdade, use uma chave separada, de preferência paga.

## O que é de verdade e o que é de mentira

| Peça | Aqui |
|---|---|
| prompt, loop, ferramentas, guardrails, bolhas | **os de produção** (`entrada/whatsapp/`) |
| casos de uso (oferecer, marcar, cancelar, memória, dúvidas) | **os de produção** (`nucleo/aplicacao/`) |
| modelo da MAISA | **o de produção** (`saida/gemini/`), ou Claude pela linha de comando |
| busca nas respostas prontas | embedding **do Gemini**, como em produção |
| agenda, atendimentos, memória, conversa | `saida/demo/`, em memória, separados por inquilino |
| o negócio | `negocios.ts`: um consultório e uma barbearia inventados |
| quem a MAISA atende (número pessoal) | sempre "pode": essa regra tem teste próprio |
| o cliente | um modelo fazendo papel de pessoa (`cliente.ts`) |
| o ritmo de envio ("digitando…", tique azul, espaço entre pessoas) | **não existe aqui**: o canal é falso e entrega na hora. O ritmo tem teste próprio (`saida/evolution/canal-evolution.test.ts`) |

Nada fala com Supabase, Google ou Evolution. Os processos de conversa recebem um ambiente
limpo, só com a chave do Gemini e o necessário para o Claude Code achar o login.

## Arquivo a arquivo

| Arquivo | O que faz |
|---|---|
| `cenarios.ts` | quem escreve, como escreve, o que quer, e a verificação do desfecho |
| `negocios.ts` | os dois negócios de teste, com a forma exata do banco |
| `mundo.ts` | monta a MAISA em cima do negócio, como `composicao.ts` monta em produção |
| `conversa.ts` | uma conversa inteira, num processo próprio (o relógio é global) |
| `cliente.ts` | o cliente simulado |
| `juiz.ts` | as medidas em código e a régua do juiz |
| `relogio.ts` | põe o processo no instante do cenário (terça 27/10/2026, 10h12, salvo exceção) |
| `medidor.ts` | custo e tempo do modelo da MAISA |
| `claude-cli.ts` | chama o Claude Code desta máquina, sem chave de API |
| `modelo-claude-cli.ts` | a MAISA respondendo com Claude, pela mesma porta `ModeloDeConversa` |
| `rodar.ts` · `relatorio.ts` | a bateria e o relatório |

## O que não é óbvio

**A rajada é enviada como o WhatsApp entrega.** Cada mensagem de uma sequência dispara
`responder` na hora, sem esperar a resposta da anterior, como webhooks concorrentes. É o que
deixa visível a MAISA respondendo mensagem por mensagem, que um teste sequencial esconderia.

**Claude sem chave de API.** O cliente simulado, o juiz e (quando se compara modelos) a
própria MAISA rodam pelo Claude Code logado nesta máquina: `claude -p --safe-mode
--system-prompt ... --tools ""`. `--safe-mode` desliga hooks e CLAUDE.md sem desligar o
login; `--bare` não serve porque só aceita `ANTHROPIC_API_KEY`. Sem `USER` no ambiente a
linha de comando responde "Not logged in". O custo que aparece para Claude é o preço de
tabela da API, informado pela própria linha de comando.

**MAISA em Claude é aproximação.** A linha de comando não expõe ferramenta nativa, então as
ferramentas viajam como JSON validado por esquema (`modelo-claude-cli.ts`). Serve para
comparar o jeito de falar; latência e custo de produção sairiam da API.

**Preço do Gemini é tabela à mão** (`PRECO_GEMINI` em `medidor.ts`). Modelo fora da tabela
aparece com custo `NaN`. Confira antes de decidir por ele.

**O juiz é exigente de propósito.** 5 é o que uma ótima secretária humana faria. Uma nota
3 não é "errou": é "funcionou com cara de robô".

**Cota contamina a nota.** Com várias conversas ao mesmo tempo, o 429 vira silêncio e a nota
mede a fila, não a conversa. `conversa.ts` espera até 3 min por chamada e conta as recusas
(`recusasDoProvedor` no resultado); conversa com muitas recusas não serve para comparar.

**Variância.** Modelo de linguagem não responde igual duas vezes. Para decidir entre duas
versões, rode com `--repeticoes 2` ou mais e olhe a conversa, não só a média.

## Para testar outro agente com o mesmo método

O método não é da MAISA: serve para qualquer agente conversacional, e não gasta API, porque o
cliente simulado, o juiz e (quando o agente usa Claude) o próprio agente rodam pelo Claude Code
logado na máquina (`claude -p`). Para levar a outro projeto:

| Leva como está | Reescreve para o agente novo |
|---|---|
| `claude-cli.ts` (a chamada sem chave), `cliente.ts` (o cliente simulado), `juiz.ts` (a régua e as medidas), `relogio.ts`, `medidor.ts`, `rodar.ts`, `relatorio.ts` | `cenarios.ts` (quem escreve e o que quer), `negocios.ts` (os dados de teste), `mundo.ts` (como o agente é montado sem o banco), a parte de `conversa.ts` que chama o agente |

A régua do juiz (`REGUA` em `juiz.ts`) fala de secretária de WhatsApp; troque o papel e os
critérios pelos do agente novo. Mantenha as três regras que mais pesaram aqui: um processo por
conversa, código congelado numa git worktree durante a rodada, e nenhuma chave de produção de
outro provedor no ambiente.

## O que NÃO fazer aqui

- ❌ Apontar a bancada para o Supabase. Ela marca e cancela horário de verdade no que estiver
  ligado; por isso o ambiente dos processos é montado à mão em `rodar.ts`.
- ❌ Ajustar o prompt para passar num cenário específico. Cenário é amostra do mundo; prompt
  que decora a amostra piora no mundo.
- ❌ Commitar `resultados/`.
