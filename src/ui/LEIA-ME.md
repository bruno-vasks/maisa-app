# `src/ui/` — o painel

O adaptador de entrada **humano**: React, `"use client"`, tudo que o Bruno e o dono do
negócio veem. Mora fora de `adaptadores/entrada/` por tamanho e porque o Next espera os
componentes perto do `app/`. Conceitualmente é irmão do `http/` e do futuro `whatsapp/`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `estado/store.tsx` | **O coração do painel.** Uma fonte de verdade para tudo que o usuário muda: etapa do kanban, dia visível na agenda, quem conduz cada conversa, toggles, catálogo vivo, ciclo de vida das notas e — desde 25/08/2026 — **qual documento o negócio emite** (`st.fiscal`, ver `EstadoFiscalUI`). Persiste em `localStorage` (`maisa.app.v3`) só o que é DECISÃO — navegação é volátil de propósito. É também quem fala com `/api/**`. |
| `detalhe.tsx` | Um id → o conteúdo da Gaveta. O prefixo do id diz a entidade (`cl…` cliente, `pr…` profissional, `sv…` serviço, `cv…` conversa, `ag…` atendimento). |
| `primitivos.tsx` | `s()` (string CSS → objeto de estilo), `Icon`, `Btn`, `Badge`, `Estado`, `EmptyState`, `Monogram`, `toast`, `fmt`… A base visual, usada também pelas landing pages. Desde 24/09/2026 (item T7 do backlog do front): ⚠️ **`Btn` é `type="button"` por padrão** (quem envia formulário passa `type="submit"`) e **`disabled` é de verdade**, com `motivo` escrito ao lado e ligado por `aria-describedby`; ⚠️ **`EmptyState` não tem ícone** e exige `action` ou `semSaida` (o motivo, só no código), e o typecheck reprova quem esquecer; **`Estado`** é o status que não clica: forma (`disco`, `anel`, `triangulo`) + rótulo em tinta, no lugar da pílula (emenda 1 do `maisa-design`); `Icon` com nome fora do registro desenha nada, não um sparkle (guarda G5). |
| `useIsMobile.ts` | Um breakpoint, um hook. |
| `estado/endereco.ts` | **O que a URL pode pedir.** A lista de telas que o `?tela=` abre, os apelidos que já saíram em link (`faturamento`, `equipe`, `servicos`, `mais`) e, quando o T9 entrar, as `?secao=` com lista e padrão. Função pura; o store valida por ela, e o guarda G10 confere que toda tela do mapa `TELA` está lá. |
| `guardas/` | **Testes que leem a fonte da tela** e reprovam o que a auditoria do front achou (travessão, fixture, token e ícone que não existem, `vh`, endereço, wizard com store). Ver o [`LEIA-ME`](guardas/LEIA-ME.md) de lá: cada uma tem lista de dívida que só encolhe. |

## `componentes/` — a casca

| Componente | Papel |
|---|---|
| `AppShell.tsx` | Rail + conteúdo + gaveta. Decide qual tela renderizar. |
| `Gaveta.tsx` | O painel lateral de detalhe. Todo cartão é curto; o detalhe vive aqui. ⚠️ Campo com `gravaAoSair` (preço, duração, valor da sessão) guarda o texto em `CampoDeTexto` e só chama `onChange` no blur e no Enter: converter a cada tecla fazia o "30" virar 50 (08 P0-1). `onChange` que devolve `false` diz que o texto não era número, e a gaveta avisa em vez de confirmar. |
| `Paleta.tsx` | Busca/comando (⌘K). ⚠️ Centrada com `left:0;right:0;margin-inline:auto`, nunca `translateX(-50%)`: a animação `m-reveal` anima `transform` e apagava o translate, e a busca abria com metade fora da tela. A altura mora em `.m-paleta` (`globals.css`), em `dvh` com `vh` de reserva. |
| `Cartao.tsx` | O cartão genérico das grades. |
| `UserMenu.tsx` | Conta e sair. |
| `BotaoGoogle.tsx` | **Entrar com o Google, num lugar só** — `/login` e `/cadastro` (e o `/assinar`, quando o funil voltar). Usa **Google Identity Services + `signInWithIdToken`**, e não o `signInWithOAuth` de redirect, porque a tela de consentimento mostra o domínio do `redirect_uri`: no fluxo antigo ela dizia *"para continuar em gsurucxllwpxcldljgur.supabase.co"*, e isso **não se conserta com verificação de marca** — `supabase.co` nunca poderá ser comprovado como nosso. Sem redirect, o domínio exibido passa a ser o nosso. ⚠️ **O nonce vai hasheado em SHA-256 para o Google e CRU para o Supabase** (o tipo do SDK diz que quem hasheia deste lado é ele); errar o lado derruba 100% dos logins. ⚠️ **Tem caminho de fuga para o redirect** — se a `NEXT_PUBLIC_GOOGLE_CLIENT_ID` não estiver publicada, se o script do Google for bloqueado ou se o nonce for recusado. Apagar esse ramo troca "login feio" por "login nenhum"; há teste. ⚠️ **A origem precisa estar em "Authorized JavaScript origins"** no Google Cloud — lista diferente da de redirect URIs, e o sintoma de esquecer é o botão não aparecer, com o erro só no console. |
| `CampoSenha.tsx` | O campo de senha com o olho, usado nas cinco entradas de senha do produto (`/cadastro` ×2, `/login`, `/nova-senha` ×2). |
| `EmitirRecibos.tsx` | **A tela Fiscal para quem atende como pessoa física.** Duas etapas (Recibos → Conferência), painel de emissão fixo e um CTA com a contagem dentro. ⚠️ **A forma é a mesma com 0 e com 1000 a emitir** (Bruno, 26/08/2026): mês fechado é uma linha na lista, não outra tela — o `EmptyState` de tela cheia que ficava aqui escondia o único caminho para lançar um recibo à mão. ⚠️ Ela **não emite**: chama `st.emitirRecibos`, e quem mostra o andamento é `ProgressoDeEmissao`. ⚠️ O interruptor **Avisar os pacientes** (`cfg.avisarRecibo`) fica encostado no CTA, e não na tela de configuração: lá era o lugar teoricamente certo e praticamente invisível. A frase diz que vale para todo recibo — ao lado de "Emitir 18 recibos", um rótulo seco leria como caixinha de uma vez só. ⚠️ **O lançamento à mão entra na lista no mesmo clique** (Bruno, 27/08/2026: *"não muda automaticamente… parece que o recibo não foi lançado"*). A linha que o `POST` devolve entra otimista, destacada e rolada até a vista, e a leitura de verdade concilia por baixo — `mesclar` desempata por `id` (nunca duplica) e `reconciliar` transforma o que não voltou em **frase**, nunca em silêncio. Ver `agrupar`, `leituraDaTela`, `mesclar`, `reconciliar` e o teste ao lado. |
| `Cartao.tsx` → `TelaGrade` | a moldura das telas de grade. ⚠️ `preencher` faz o filho esticar até o fim da faixa (o vazio vai para DENTRO dos cartões) e corta o respiro de baixo de 32px para 24px. Só serve para tela cujo filho sabe encolher — `flex:1;min-height:0` na cadeia e a lista rolando por dentro. Não tira a rolagem: conteúdo maior que a faixa continua rolando, porque CTA cortado é pior que rolagem. |
| `NovoPagamento.tsx` | **Lançar à mão o que a agenda não pegou** — sessão por fora, pacote adiantado. Usado pela tela de emissão e pelo `LoteReceitaSaude`: era código duplicado até 26/08/2026. ⚠️ `faltaDoLancamento` confere o CPF no **dígito verificador**, porque a Receita recusa o arquivo inteiro por causa de uma linha. ⚠️ `lancaveis` tira **cliente de teste** do seletor: a `v_a_recibar` lê `coalesce(c.teste,false)` e `lerRecibosPendentes` filtra — escolher um gravava a linha e ela nunca voltava na lista, com o formulário dizendo "lançado". ⚠️ `onLancado` recebe **o pagamento que o servidor criou**, não um aviso vazio: é o que deixa a tela de emissão mostrar a linha antes da próxima leitura. Não emite nada — só lança. |
| `ProgressoDeEmissao.tsx` | **O cartão do canto que conta os recibos saindo**, com o nome de quem está saindo agora. ⚠️ Montado no `AppShell`, nunca na tela: o estado vive no store (`EmissaoDeRecibos`) para que sair da tela não desmonte o placar de uma emissão que continua correndo. Substituiu um modal que prendia o dono na tela. Sem botão de cancelar, e a ausência é decisão — ver o cabeçalho. |
| `Pareamento.tsx` | As peças do "Conectar com número de telefone": o código de 8 caracteres, a conferência do número antes de enviar e a etiqueta que mantém o número na tela. Compartilhado entre o wizard e o painel porque o conteúdo de valor é a INSTRUÇÃO — os nomes exatos do menu do WhatsApp. |

## `telas/` — as telas

| Tela | O que mostra |
|---|---|
| `FluxoHoje.tsx` | O kanban do dia: chegando → atendendo → feito. |
| `Agenda.tsx` | A grade (dia/semana/mês) com a agenda REAL do Google. Também define a janela desenhada (`AGENDA_INICIO`/`AGENDA_HORAS` — geometria de tela, não expediente). |
| `Conversas.tsx` | As conversas de WhatsApp, do servidor (`st.conversas` / `st.threadDe`). Responder aqui manda mensagem de verdade. |
| `Grades.tsx` | Clientes, equipe, catálogo, Fiscal (id `faturamento`; o rótulo virou "Fiscal" em 26/08/2026, o id continua por causa dos links já compartilhados), "Mais". ⚠️ O **Faturamento bifurca**, e quem escolhe é `st.fiscal.caminho`, nunca o estado das notas. Desde 26/08/2026 os dois lados são telas diferentes: pessoa física cai em `componentes/EmitirRecibos.tsx` (assunto único, guiado) e CNPJ segue no hero+tabela daqui — **guardado como estava, para a v2 reestruturar**. Enquanto o caminho é desconhecido, nenhum dos dois aparece: piscar a promessa errada por meio segundo foi o defeito reclamado. Ver `vocabulario` e o teste ao lado. |
| `AMaisa.tsx` | Os ajustes da assistente + preview de WhatsApp. |
| `DocumentoFiscal.tsx` | **Nota fiscal ou recibo do Receita Saúde** — a escolha e o que cada caminho pede. Fora do rail, como `Contatos`: é decisão de uma vez só. ⚠️ Desde 26/08/2026 ela termina com um CTA **Continuar para emissão** — respondia a pergunta e parava, deixando quem escolheu sem próximo passo. E o arquivo do e-CAC saiu daqui: `LoteReceitaSaude` entra com `apenasDados`, só a identidade de quem emite (é para cá que o "Voltar e editar meus dados" da tela Fiscal aponta). ⚠️ Ela **não reimplementa** os dois fluxos: `LoteReceitaSaude` decide sozinho se aparece, e o `LigarNotaFiscal` vem **controlado** (props `modo`/`onModo`) — o seletor daqui é o passo 0 dele. ⚠️ E o cartão marcado sai de `escolhaFeita`, **nunca do `caminho`**: caminho de config vazia é `municipal`, e derivar dali marcou "Tenho CNPJ" para quem nunca escolheu — o clique seguinte virou troca, a troca virou `DELETE`, e o DELETE apagou CPF, profissão, registro e ambiente em produção (26/08/2026). |

## A dívida conhecida

As telas ainda fazem `import * as D from "@/adaptadores/saida/demo"`, mas **o que vem daí
mudou** — e essa distinção é o ponto:

O barrel do demo faz `export * from "@/nucleo/dominio"`, então a maioria dos `D.` **não é
fixture**: `D.hhmm`, `D.HOJE`, `D.rotuloDia`, `D.CATEGORIAS`, `D.TONS`, `D.primeiroNome` e
os tipos são domínio puro, e importá-los é legítimo (só está no caminho errado). Em
`Agenda.tsx`, por exemplo, a esmagadora maioria das referências é dessas.

**Quatro entidades saíram do fixture** e vêm de `GET /api/cadastro`, pelo store:

| Não use mais | Use |
|---|---|
| `D.NEGOCIO` | `st.cadastro.negocio` |
| `D.EQUIPE` | `st.cadastro.profissionais` |
| `D.CLIENTES` | `st.cadastro.clientes` |
| `D.SERVICOS` | `st.servicos` — desde 15/08/2026 é o MESMO array de `st.cadastro.servicos`, sem camada-sombra por cima |
| `D.COLUNAS_AGENDA` | `st.cadastro.agendas` |
| `D.profissional(id)` | `st.profissionalDe(id)` |
| `D.cliente(id)` | `st.clienteDe(id)` |
| `D.servico(id)` | `st.servicoDe(id)` |
| `D.nomeProfissional(id)` | `st.nomeDoProfissional(id)` |
| `D.nomeCliente(id)` | `st.nomeDoCliente(id)` |
| `D.atende(pid, data)` | `st.atendeNoDia(pid, data)` |
| `D.podeComecar(…)` | `st.podeComecarEm(…)` |

Continuam fixture de verdade, e cada uso é dívida: `FAQS`, `NUMEROS_MES`, `FATURAS`,
`PERIODO`, `PRESTADOR`, `DIAS_PADRAO`, `CFG_PADRAO`.

`CONVERSAS`, `THREADS` e `SUGESTOES` saíram desta lista porque saíram do repositório. O que
as substitui:

| Era | Virou |
|---|---|
| `D.CONVERSAS` | `st.conversas` (do servidor, mais recente primeiro) |
| `D.conversa(id)` | `st.conversaDe(id)` |
| `D.THREADS[id]` | `st.threadDe(id)` — buscada ao abrir a conversa |
| `D.SUGESTOES[id]` | nada. Sugestão de verdade é uma feature, não um fixture — a barra saiu da tela |
| `c.hora` | `D.horaDeISO(c.atualizadaEm)` |
| `c.estado` do fixture | `c.estado`, derivado no servidor por `estadoDaConversa` |

⚠️ `st.enviar(id, txt)` **manda mensagem no WhatsApp da pessoa** e não se desfaz. `st.assumir`
e `st.devolver` escrevem no banco: é o que faz a MAISA calar (ou voltar a falar) naquela
conversa. Nenhum dos três é otimista à toa — ver o comentário de `mudarPosse` no store.

**Editar cliente é do store, não da tela** (desde 24/08/2026). `st.editarCliente(id, patch)`
grava otimista, coalesce por 500 ms e manda **um** `PUT /api/clientes` com o cliente inteiro;
`st.alternarCli` passa por ele. A gaveta não tem botão "Salvar" — ela só chama `editarCliente`
a cada tecla, como já fazia com `editarServico`.

⚠️ **`st.cliAtivo` não lê mais `localStorage`.** `db.cliAtivo` saiu do `Persistido`: era um mapa
que ficava POR CIMA de `clientes.ativo`, então quem desativasse alguém num aparelho veria o
cliente ativo no outro para sempre. Quem manda agora é o banco.

⚠️ **`editarCliente` recarrega o faturamento depois de gravar**, e isso é contrato, não zelo:
`st.fechamento` monta `cpf`, `nome` e `semCpf` a partir de `/api/faturamento`, não do cadastro.
Sem o recarregar, corrigir um CPF preenchia o campo e a tabela continuava dizendo "sem CPF —
não entra no lote".

Duas coisas que o store passou a exigir:

- **`st.pidAgenda` pode ser `""`** na primeira passada — o cadastro é assíncrono. Guarde
  antes de mandar numa URL ou num `conectarGoogle`.
- **`st.cadastroErro`** não-nulo significa que o que está na tela é **placeholder de
  fixture**, não o negócio de verdade. Tela que mostra plano, preço ou contagem tem que
  dizer isso — senão o app mente com cara de dado real.

Regras de import que continuam valendo:

- ✅ a UI pode importar `@/nucleo/dominio/*` (tipos e funções puras) à vontade;
- ⚠️ `@/adaptadores/saida/demo` é tolerado para o que ainda é fixture;
- ❌ a UI **nunca** importa `@/composicao`, `saida/google`, `saida/focus` — são
  segredos de servidor. A ponte é `fetch` para `/api/**`.

## Contrato com as rotas

O store casa **string por string** com o `status` das respostas (ver `RESPOSTA_GOOGLE`,
`MOTIVO_GOOGLE` e o tratamento de `reconectar`/`limite`). Se você mudar um nome em
[`adaptadores/entrada/http/respostas.ts`](../adaptadores/entrada/http/LEIA-ME.md),
procure o nome aqui antes — o TypeScript não pega, porque JSON é `any`.
