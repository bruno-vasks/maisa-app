# `src/ui/guardas/` — o que a tela não pode voltar a fazer

Testes de vitest (ambiente `node`) que leem a **fonte** do painel e das cinco rotas de entrada
(`/login`, `/cadastro`, `/esqueci`, `/nova-senha`, `/comecar`) e reprovam o defeito que a
auditoria do front de 24/09/2026 achou, com arquivo, linha e trecho. Rodam no `npm test` e no
CI, como `arquitetura.test.ts` e `documentacao.test.ts`.

Por que fonte e não tela renderizada: um teste que renderiza só vê o que algum teste
renderiza, e o projeto não tem jsdom (nem deve ter para isto: jsdom não faz layout). Layout
se mede no Chrome, com a bancada (`scripts/bancada/`). Aqui fica o que a fonte prova.

Por que o parser do TypeScript e não regex: o comentário deste repositório cita de propósito o
defeito que proibiu. Para o `ts`, comentário é trivia; literal de string, pedaço de template e
texto de JSX são o que chega à tela.

## As guardas

| Arquivo | Guarda | Reprova |
|---|---|---|
| `travessao.test.ts` | **G1** | travessão em copy (o `—` sozinho, marca de valor ausente, passa) |
| `fixture.test.ts` | **G3** | `D.PERIODO`, `D.PRESTADOR`, `D.FAQS`, `D.NUMEROS_MES`, `D.FATURAS`, `precoPlano` nas telas, componentes e gaveta; "dois lembretes", "Confirmado pelo WhatsApp", "já cobrou" e o suporte `5511999999999` em `src/` |
| `tokens.test.ts` | **G4** | `var(--x)` sem definição em `globals.css`, no `next/font` do `layout.tsx` ou no próprio arquivo |
| `icones.test.ts` | **G5** | nome de ícone literal fora do registro `ICONS` de `primitivos.tsx` |
| `vh.test.ts` | **G9** | `<n>vh` sem o par `dvh` na mesma linha |
| `endereco.test.ts` | **G10** | tela do mapa `TELA` ou membro de `TelaId` que o `?tela=` não abre; apelido (`faturamento`, `equipe`, `servicos`, `mais`) que deixou de abrir; lixo que vira tela; `?secao=` sem lista ou padrão. A regra mora em `src/ui/estado/endereco.ts` |
| `subtitulo.test.ts` | **G17** (metade) | `sub` no mapa `TELA` da casca, ou `<p>` dentro da `Topbar`. A outra metade (`SectionTitle` com `sub`) é da Onda 2 |
| `wizard.test.ts` | **G13** | arquivo alcançado pelos imports do `/comecar` que chama `useStore(` (o wizard roda fora do `StoreProvider`) |
| `fonte.ts` | | o que as guardas têm em comum: raízes, parser, `conferirDivida` |

Os números (G1, G3…) são os da §6 do backlog do front
(`01 App — Telas e Features/(C) 2026-09-24 — Auditoria do front/(C) 10 — Backlog do builder.md`,
no vault). As que faltam entram com o item que as pede.

## A lista de dívida

Cada guarda nasceu com o que já estava errado em 24/09/2026, numa lista **por arquivo, com
contagem, data e o item do backlog que paga**. Ela reprova nas duas direções:

- arquivo novo com o defeito, ou contagem que subiu: **reprova** (a dívida não cresce);
- contagem que desceu, ou arquivo limpo ainda na lista: **reprova pedindo para baixar o
  número**. Folga na lista é permissão para o próximo voltar a sujar.

Consertou um travessão? Baixe o número daquele arquivo na mesma mudança. Adicionar um arquivo
ou subir um número "para o teste passar" é a hora de parar e perguntar por quê.

## Provado por mutação

Cada guarda foi vista reprovando antes de entrar: o defeito injetado num arquivo (um travessão
numa tela limpa, `D.PERIODO` numa tela, `var(--t-nada)`, `name="cadeado"`, `height:100vh`, uma
tela nova no mapa `TELA` sem entrada no endereço, `useStore()` num componente importado pelo
wizard), o teste vermelho com o arquivo e a linha, e o defeito desfeito. Guarda nova entra do
mesmo jeito, e cada uma tem um segundo teste que afere o próprio instrumento (senão uma
varredura que parasse de achar arquivo ficaria verde para sempre).
