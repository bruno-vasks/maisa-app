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

**Variância.** Modelo de linguagem não responde igual duas vezes. Para decidir entre duas
versões, rode com `--repeticoes 2` ou mais e olhe a conversa, não só a média.

## O que NÃO fazer aqui

- ❌ Apontar a bancada para o Supabase. Ela marca e cancela horário de verdade no que estiver
  ligado; por isso o ambiente dos processos é montado à mão em `rodar.ts`.
- ❌ Ajustar o prompt para passar num cenário específico. Cenário é amostra do mundo; prompt
  que decora a amostra piora no mundo.
- ❌ Commitar `resultados/`.
