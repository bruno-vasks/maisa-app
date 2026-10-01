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
| `fixture.test.ts` | **G3** | `D.PERIODO`, `D.PRESTADOR`, `D.FAQS`, `D.NUMEROS_MES`, `D.FATURAS`, `precoPlano` nas telas, componentes e gaveta; "dois lembretes", "Confirmado pelo WhatsApp", "já cobrou" e o suporte `5511999999999` em `src/` Dívida zero desde 25/09/2026 (1A.10). |
| `tokens.test.ts` | **G4** | `var(--x)` sem definição em `globals.css`, no `next/font` do `layout.tsx` ou no próprio arquivo |
| `icones.test.ts` | **G5** | nome de ícone literal fora do registro `ICONS` de `primitivos.tsx` |
| `vh.test.ts` | **G9** | `<n>vh` sem o par `dvh` na mesma linha |
| `endereco.test.ts` | **G10** | tela do mapa `TELA` ou membro de `TelaId` que o `?tela=` não abre; apelido (`faturamento`, `equipe`, `servicos`, `mais`) que deixou de abrir; lixo que vira tela; `?secao=` sem lista ou padrão. A regra mora em `src/ui/estado/endereco.ts` |
| `subtitulo.test.ts` | **G17** (metade) | `sub` no mapa `TELA` da casca, ou `<p>` dentro da `Topbar`. A outra metade (`SectionTitle` com `sub`) é da Onda 2 |
| `status.test.ts` | **G11** | "no ar", "Atendendo", "Assistente ativa", "responde automaticamente" ou "resolvendo tudo sozinha" fora de `componentes/StatusDaMaisa.tsx`. A tabela-verdade da regra está em `nucleo/dominio/status-da-maisa.test.ts` Dívida zero desde 25/09/2026 (as "respostas no ar" das `D.FAQS` saíram no 1A.10). |
| `leitura.test.ts` | **G12** | derivação de tela (`estado/leitura.ts`) que devolve vazio com a leitura em voo ou falhada |
| `criar.test.ts` | **G7** | "Novo cliente", "Novo serviço", "Marcar atendimento", "Adicionar profissional" ou "Encaixar cliente" como texto de tela fora da lista fechada: o mapa `TELA` e o menu "Novo" da casca, o confirmar do rascunho (`detalhe.tsx`) e o nome do serviço recém-criado (`store.tsx`). A ação de criar é declarada no mapa, não desenhada de novo pela tela (T2) |
| `bastidor.test.ts` | **G20** | nome de variável de ambiente (`GOOGLE_…`, `SUPABASE_…`…), comando (`openssl`, `.env`), "no Vercel", "redirect URI" ou consolo de bastidor ("nada aqui trava", "funciona normalmente", "do jeito que está") em texto de tela. Quem lê é o dono do negócio: isso vai para o log e para o código de erro do suporte (28/09/2026). Dívida zero |
| `raio.test.ts` | **G19** | `border-radius` de 5 a 49px escrito à mão (ou `borderRadius: n` no JSX) nas telas e rotas de entrada: o canto vem de `--r-casca`, `--r-painel` ou `--r-controle` (28/09/2026). A lista `FORMA` não é dívida: são as quatro formas redondas de propósito (interruptor, as duas barras de progresso, o celular do preview) |
| `mono.test.ts` | **G21** | família monoespaçada (Plex Mono, JetBrains Mono, `monospace`, `ui-monospace`…) ou `var(--font-mono)` em tela, CSS e LP. Vetada pelo Bruno em 30/09/2026 ("o maior slop de todos"); `tabular-nums` alinha os dígitos no lugar dela. A LP de terapeutas mantém o token com a Figtree dentro. Dívida zero |
| `estilo.test.ts` | **G22** | chave de objeto de estilo (`style={{ … }}` ou objeto que espalha `s(…)`) que pode valer `undefined`/`null`. O React grava `""` e apaga o lado que o shorthand tinha posto: o rodapé da gaveta media 0px embaixo no desktop e o botão parecia cortado (01/10/2026). A forma certa é `...(cond ? { chave: valor } : {})`. Dívida zero |
| `placeholder.test.ts` | **G23** | `placeholder` (atributo do JSX, ou valor padrão de uma prop) que não termina em reticências ou tem cara de dado: máscara ou número de exemplo (`000.000.000-00`, `(11) 9…`, `CRP 06/123456`), e-mail de exemplo, bolinhas de senha. Lê o painel, as rotas de entrada, `/assinar`, `/pagar` e o laboratório. A Regina tentou apagar o "CRP 06/123456" achando que estava preenchido (01/10/2026); a regra é a emenda 6 do `maisa-design`. Dívida zero |
| `gaveta.test.ts` | **G8** | `Detalhe.acoes` deixar de ser a tupla `Rodape` (o `tsc` é quem reprova o terceiro botão), ação `tone: "danger"` sem `confirmar` em `detalhe.tsx`, ação "Fechar", ou o rodapé de `Gaveta.tsx` sem `flex-wrap:wrap` |
| `moldura.test.ts` | **G15** | `overflow: hidden`/`clip` nas regras `.m-moldura*`, `.m-tabela-rola` e `.m-tabela-corpo` de `globals.css`, ou escrito em `Moldura.tsx` e na `Tabela` de `primitivos.tsx`; `<TelaGrade>` fora da lista de telas que ainda não viraram `Moldura` (a lista só encolhe) |
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
