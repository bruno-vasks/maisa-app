# `src/ui/` — o painel

O adaptador de entrada **humano**: React, `"use client"`, tudo que o Bruno e o dono do
negócio veem. Mora fora de `adaptadores/entrada/` por tamanho e porque o Next espera os
componentes perto do `app/`. Conceitualmente é irmão do `http/` e do futuro `whatsapp/`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `estado/store.tsx` | **O coração do painel.** Uma fonte de verdade para tudo que o usuário muda: etapa do kanban, dia visível na agenda, quem conduz cada conversa, toggles, catálogo vivo, ciclo de vida das notas e — desde 25/08/2026 — **qual documento o negócio emite** (`st.fiscal`, ver `EstadoFiscalUI`). Persiste em `localStorage` (`maisa.app.v3`) só o que é DECISÃO — navegação é volátil de propósito. É também quem fala com `/api/**`. |
| `detalhe.tsx` | Um id → o conteúdo da Gaveta. O prefixo do id diz a entidade (`cl…` cliente, `pr…` profissional, `sv…` serviço, `cv…` conversa, `ag…` atendimento). ⚠️ A prévia da nota (`nf-…`) diz quem emite pela razão social e pelo CNPJ de `st.fiscal.config`, e o mês pela competência da linha (`st.mesDoFechamento` na falta dela); sem emissor, aviso e "Emitir" desligado (25/09/2026, 1A.10). As gavetas `faq` e `numeros` saíram: eram fixture. ⚠️ **Rodapé com teto** (25/09/2026, T6): `acoes` é `Rodape`, tupla de até dois (monte com `rodape(a, b)`; o terceiro não compila), e o resto vai para `mais`, o menu "Mais ações". Todo destrutivo é `AcaoDestrutiva` (`tone: "danger"` + `confirmar`), só existe em `mais` e pede dois toques pelo `st.cancelarPedido`. Não existe mais ação "Fechar": gaveta sem ação fica sem rodapé e fecha pelo X. O guarda G8 (`guardas/gaveta.test.ts`) cobra o que o tipo não vê. ⚠️ A ficha do cliente tem `faixa` (fixa sob o cabeçalho) dizendo se a MAISA responde a ela, pelo caderno (`st.caderno`, `GET /api/contatos`), com "Responder a {nome}" no modo pessoal (`st.responderA`, `PATCH { telefone, cliente: true }`); no modo negócio, "responde todo mundo" sem botão (1B.11). O rodapé dela é "Marcar horário" e "Abrir conversa"; "Tirar de atendimento" foi para o menu. |
| `primitivos.tsx` | `s()` (string CSS → objeto de estilo), `Icon`, `Btn`, `Badge`, `Estado`, `EmptyState`, `Monogram`, `toast`, `fmt`… A base visual, usada também pelas landing pages. Desde 24/09/2026 (item T7 do backlog do front): ⚠️ **`Btn` é `type="button"` por padrão** (quem envia formulário passa `type="submit"`) e **`disabled` é de verdade**, com `motivo` escrito ao lado e ligado por `aria-describedby`; ⚠️ **`EmptyState` não tem ícone** e exige `action` ou `semSaida` (o motivo, só no código), e o typecheck reprova quem esquecer; **`Estado`** é o status que não clica: forma (`disco`, `anel`, `triangulo`) + rótulo em tinta, no lugar da pílula (emenda 1 do `maisa-design`); `Icon` com nome fora do registro desenha nada, não um sparkle (guarda G5). |
| `useIsMobile.ts` | Um breakpoint, um hook. |
| `estado/leitura.ts` | **Carregando não é vazio.** `Leitura<T>` e as derivações puras de cada tela (`estadoDoDia`, `estadoDaFila`, `estadoDosContatos`): leitura em voo nunca vira vazio, leitura que falhou nunca vira vazio, e o que já foi lido fica na tela durante a releitura. O guarda G12 (`guardas/leitura.test.ts`) cobra cada uma. Nasceu em 24/09/2026 (T4 do backlog do front), quando "Nenhum atendimento", "Nada pendente" e "Dia livre" apareciam antes de `/api/agenda` voltar e para sempre quando ela falhava. Mora aqui também `semConfirmacao(ag)`: a marca "sem confirmação" só em "chegando" e antes do horário (1A.5), usada no Fluxo, na Agenda, na gaveta e na fila. E `estadoDaGravacao`: o "Salvando…", "Salvo" ou "Não salvou" da linha de status dos Ajustes (1A.8), lido de `st.gravacao`. |
| `estado/endereco.ts` | **O que a URL pode pedir.** A lista de telas que o `?tela=` abre, os apelidos que já saíram em link (`faturamento`, `equipe`, `servicos`, `mais`) e as `?secao=` com lista e padrão (por enquanto só a do Documento fiscal: `inicio`, `dados`, `autorizacao`, `carne-leao`, desde 25/09/2026; o store expõe `st.secao` e `irPara(tela, secao)`; o T9 estende). Função pura; o store valida por ela, e o guarda G10 confere que toda tela do mapa `TELA` está lá. |
| `guardas/` | **Testes que leem a fonte da tela** e reprovam o que a auditoria do front achou (travessão, fixture, token e ícone que não existem, `vh`, endereço, wizard com store). Ver o [`LEIA-ME`](guardas/LEIA-ME.md) de lá: cada uma tem lista de dívida que só encolhe. |

## `componentes/` — a casca

| Componente | Papel |
|---|---|
| `AppShell.tsx` | Rail + conteúdo + gaveta. Decide qual tela renderizar. O status da MAISA na topbar e no cabeçalho do celular vem de `StatusDaMaisa` (24/09/2026: antes pulsava "no ar" olhando só o interruptor, e o celular não tinha status nenhum; o selo "m" do celular saiu para ele caber). ⚠️ A topbar tem 56px e **um título só**: o `sub` de cada tela saiu do mapa `TELA` em 24/09/2026 (regra 3 do texto de tela, emenda 5 do `maisa-design`), e o guarda `guardas/subtitulo.test.ts` reprova a volta. ⚠️ `AvisoCadastro` e `AvisoAjustes` ("os dados abaixo são de exemplo") ficam fora do `key={st.tela}` nas duas larguras; no celular desde 25/09/2026 (1A.11), entre o cabeçalho e a tela. ⚠️ **Slot de ação** (25/09/2026, T2): a tela declara o "criar" dela em `TELA[id].acao` (Hoje "Encaixar cliente", Agenda "Marcar atendimento", Clientes "Novo cliente", Serviços "Novo serviço", Equipe "Adicionar profissional") e a casca desenha no canto da topbar e como "＋" de 44px no celular; onde a tela não tem, o "＋" abre o menu "Novo" (os três criar de qualquer lugar), que também fica na topbar. Emitir não é criar: o do Fiscal mora na tela. O ouro deixou de ser ação: o slot e o hero são `--primary`. |
| `StatusDaMaisa.tsx` | **A MAISA está atendendo?** Os rótulos ("Atendendo", "Pausada", "WhatsApp desconectado"), as frases e a ação de cada estado, num lugar só. A regra é `nucleo/dominio/status-da-maisa.ts` (interruptor E canal) e chega pronta em `st.statusMaisa`. `StatusDaMaisa` é o status clicável da topbar e do cabeçalho do celular (abre um menu com Pausar, Voltar a atender ou Conectar o WhatsApp); `LinhaDeStatus` é a linha dos Ajustes, com o interruptor desligado de verdade quando não há WhatsApp. ⚠️ `conferindo` é esqueleto sem texto. ⚠️ O guarda G11 reprova "no ar", "Atendendo", "Assistente ativa" e "resolvendo tudo sozinha" em qualquer outro arquivo da tela. |
| `EstadoDeLeitura.tsx` | O que a tela desenha antes de saber: `Esqueleto` (na forma do que vem, só depois de 300ms) e `FalhaDeLeitura` (a frase e "Tentar de novo"). Par de `estado/leitura.ts`. Erro nunca é esqueleto: cinza para sempre sem uma palavra foi o beco do Fiscal de 26/08/2026. `acao={ENTRAR}` troca "Tentar de novo" por "Entrar" quando a sessão acabou (`login_necessario`: repetir não resolve); `embutida` tira o respiro dentro de um cartão. Meus contatos e o cartão "De quem é esse número" usam os dois desde 24/09/2026 (1A.6): o cartão não some mais quando a leitura falha. |
| `Gaveta.tsx` | O painel lateral de detalhe. Todo cartão é curto; o detalhe vive aqui. ⚠️ Campo com `gravaAoSair` (preço, duração, valor da sessão) guarda o texto em `CampoDeTexto` e só chama `onChange` no blur e no Enter: converter a cada tecla fazia o "30" virar 50 (08 P0-1). `onChange` que devolve `false` diz que o texto não foi aceito (não era número, ou nome vazio), e a gaveta avisa em vez de confirmar. ⚠️ O rodapé (`Rodape`) desenha até dois botões e "Mais ações" (só o ícone no celular), com `flex-wrap`; um destrutivo pedido troca o rodapé por "Voltar" + a confirmação, com o aviso fixo acima, fora da rolagem. O X aparece nas duas larguras (44px no celular) e a alça saiu: prometia arrastar. Teto em `dvh`. |
| `Paleta.tsx` | Busca/comando (⌘K). ⚠️ Centrada com `left:0;right:0;margin-inline:auto`, nunca `translateX(-50%)`: a animação `m-reveal` anima `transform` e apagava o translate, e a busca abria com metade fora da tela. A altura mora em `.m-paleta` (`globals.css`), em `dvh` com `vh` de reserva. ⚠️ "Meus contatos" e "Documento fiscal" entram na busca desde 25/09/2026 (1B.9): fora do rail, no desktop elas só se achavam pela URL. |
| `Cartao.tsx` | O cartão genérico das grades. |
| `UserMenu.tsx` | Conta e sair. |
| `BotaoGoogle.tsx` | **Entrar com o Google, num lugar só** — `/login` e `/cadastro` (e o `/assinar`, quando o funil voltar). Usa **Google Identity Services + `signInWithIdToken`**, e não o `signInWithOAuth` de redirect, porque a tela de consentimento mostra o domínio do `redirect_uri`: no fluxo antigo ela dizia *"para continuar em gsurucxllwpxcldljgur.supabase.co"*, e isso **não se conserta com verificação de marca** — `supabase.co` nunca poderá ser comprovado como nosso. Sem redirect, o domínio exibido passa a ser o nosso. ⚠️ **O nonce vai hasheado em SHA-256 para o Google e CRU para o Supabase** (o tipo do SDK diz que quem hasheia deste lado é ele); errar o lado derruba 100% dos logins. ⚠️ **Tem caminho de fuga para o redirect** — se a `NEXT_PUBLIC_GOOGLE_CLIENT_ID` não estiver publicada, se o script do Google for bloqueado ou se o nonce for recusado. Apagar esse ramo troca "login feio" por "login nenhum"; há teste. ⚠️ **A origem precisa estar em "Authorized JavaScript origins"** no Google Cloud — lista diferente da de redirect URIs, e o sintoma de esquecer é o botão não aparecer, com o erro só no console. |
| `CampoSenha.tsx` | O campo de senha com o olho, usado nas cinco entradas de senha do produto (`/cadastro` ×2, `/login`, `/nova-senha` ×2). |
| `EmitirRecibos.tsx` | **A tela Fiscal para quem atende como pessoa física.** Duas etapas (Recibos → Conferência), painel de emissão fixo e um CTA com a contagem dentro. ⚠️ **A forma é a mesma com 0 e com 1000 a emitir** (Bruno, 26/08/2026): mês fechado é uma linha na lista, não outra tela — o `EmptyState` de tela cheia que ficava aqui escondia o único caminho para lançar um recibo à mão. ⚠️ Ela **não emite**: chama `st.emitirRecibos`, e quem mostra o andamento é `ProgressoDeEmissao`. ⚠️ O interruptor **Avisar os pacientes** (`cfg.avisarRecibo`) fica encostado no CTA, e não na tela de configuração: lá era o lugar teoricamente certo e praticamente invisível. A frase diz que vale para todo recibo — ao lado de "Emitir 18 recibos", um rótulo seco leria como caixinha de uma vez só. ⚠️ **O lançamento à mão entra na lista no mesmo clique** (Bruno, 27/08/2026: *"não muda automaticamente… parece que o recibo não foi lançado"*). A linha que o `POST` devolve entra otimista, destacada e rolada até a vista, e a leitura de verdade concilia por baixo — `mesclar` desempata por `id` (nunca duplica) e `reconciliar` transforma o que não voltou em **frase**, nunca em silêncio. Ver `agrupar`, `leituraDaTela`, `mesclar`, `reconciliar` e o teste ao lado. ⚠️ Desde 25/09/2026 (1A.13) o bloqueio sai de `faltaParaEmitirRecibo` (domínio): dados faltando é o cartão "Antes de emitir" com "Preencher meus dados"; autorização vencida ou esperando o nosso aceite deixa a lista na tela, pinta a linha do emitente de âmbar com a frase (e "Renovar autorização" quando é dela) e desliga o CTA com a mesma frase embaixo. Válida, a linha diz até quando vale. |
| `Cartao.tsx` → `TelaGrade` | a moldura das telas de grade. ⚠️ `preencher` faz o filho esticar até o fim da faixa (o vazio vai para DENTRO dos cartões) e corta o respiro de baixo de 32px para 24px. Só serve para tela cujo filho sabe encolher — `flex:1;min-height:0` na cadeia e a lista rolando por dentro. Não tira a rolagem: conteúdo maior que a faixa continua rolando, porque CTA cortado é pior que rolagem. |
| `NovoPagamento.tsx` | **Lançar à mão o que a agenda não pegou** — sessão por fora, pacote adiantado. Usado pela tela de emissão e pelo `LoteReceitaSaude`: era código duplicado até 26/08/2026. ⚠️ `faltaDoLancamento` confere o CPF no **dígito verificador**, porque a Receita recusa o arquivo inteiro por causa de uma linha. ⚠️ `lancaveis` tira **cliente de teste** do seletor: a `v_a_recibar` lê `coalesce(c.teste,false)` e `lerRecibosPendentes` filtra — escolher um gravava a linha e ela nunca voltava na lista, com o formulário dizendo "lançado". ⚠️ `onLancado` recebe **o pagamento que o servidor criou**, não um aviso vazio: é o que deixa a tela de emissão mostrar a linha antes da próxima leitura. Não emite nada — só lança. |
| `ProgressoDeEmissao.tsx` | **O cartão do canto que conta os recibos saindo**, com o nome de quem está saindo agora. ⚠️ Montado no `AppShell`, nunca na tela: o estado vive no store (`EmissaoDeRecibos`) para que sair da tela não desmonte o placar de uma emissão que continua correndo. Substituiu um modal que prendia o dono na tela. Sem botão de cancelar, e a ausência é decisão — ver o cabeçalho. |
| `Pareamento.tsx` | As peças do "Conectar com número de telefone": o código de 8 caracteres, a conferência do número antes de enviar e a etiqueta que mantém o número na tela. Compartilhado entre o wizard e o painel porque o conteúdo de valor é a INSTRUÇÃO — os nomes exatos do menu do WhatsApp. |
| `DeQuemEEsseNumero.tsx` | O cartão "De quem é esse número?" dos Ajustes: o modo do número (pessoal ou só do negócio) e, no pessoal, trazer a agenda e ir escolher quem ela atende. Montado com as peças de `EscolhaDoNumero`, mais o store (navegar para Meus contatos) e toasts. Fora do pessoal com contatos, termina num link "Quem a MAISA atende" (1B.9), a porta de Contatos no modo negócio. |
| `EscolhaDoNumero.tsx` | **A mesma pergunta sem store** (25/09/2026, 1A.15): `OpcoesDoNumero` (os dois botões), `useCaderno` (lê, grava o modo e importa por `fetch` em `/api/contatos`, devolvendo a frase em vez de dar toast) e `fraseDoImport`. ⚠️ Não chama `useStore(`: o wizard a monta logo depois de conectar o WhatsApp (guarda G13). No wizard nada vem pré-marcado e "Continuar" só aparece depois que o `PATCH` aceitou. |

## `telas/` — as telas

| Tela | O que mostra |
|---|---|
| `FluxoHoje.tsx` | O kanban do dia: chegando → atendendo → feito. |
| `Agenda.tsx` | A grade (dia/semana/mês) com a agenda REAL (tabela `atendimentos`, e o Google soma). ⚠️ Desde 24/09/2026 **nenhuma grade antes da primeira leitura** (`st.leituraAgenda.jaLeu`): esqueleto enquanto lê, `FalhaDeLeitura` se falhar, e só depois "Dia livre" ou o trilho com a contagem. A faixa de erro não depende do Google estar configurado; o convite para conectar o Google olha `googleDe(pid)`, não a leitura. O estado da leitura chamava-se `agendaGoogle`. Também define a janela desenhada (`AGENDA_INICIO`/`AGENDA_HORAS` — geometria de tela, não expediente). ⚠️ Marcar mora no slot da casca desde 25/09/2026 (T2): o "Marcar" da barra do calendário saiu. No celular a lista do dia é **por hora** e intercala os trechos livres (`trechosLivres`, as vagas de `st.vagasDe` das agendas lidas, meias-horas seguidas numa linha "14:30 livre, até 16:00"), cada um um botão que abre o rascunho ali; o vazio tem "Marcar atendimento" (1B.4). |
| `Conversas.tsx` | As conversas de WhatsApp, do servidor (`st.conversas` / `st.threadDe`). Responder aqui manda mensagem de verdade. ⚠️ Desde 25/09/2026: o WhatsApp saiu do cabeçalho para o menu ⋯ (`MenuDaConversa`, com "Ver ficha") e **assume antes de abrir** (`st.abrirNoWhatsApp`: o POST sai antes do `window.open`, no mesmo gesto), porque o que o dono escreve lá não volta para cá (1B.7). No celular o cabeçalho é voltar, avatar de 36, nome em até duas linhas e o ⋯, e a posse fica acima do composer (1B.6). Sem número completo: "Número incompleto", nenhum link `wa.me` e uma linha fixa no lugar do composer (1B.8). |
| `Contatos.tsx` | "Quem a MAISA atende": o caderno de contatos do WhatsApp e quem ela atende (fora do rail; portas no ⌘K, em Clientes e no cartão de Ajustes). Três estados de leitura antes de derivar vazio (1A.6). ⚠️ O vazio **importa ali mesmo** desde 25/09/2026 (1B.10), nos dois modos: `POST /api/contatos`, "Lendo sua agenda…" travado, a frase de três números e a lista relida; sem WhatsApp, "Conectar WhatsApp" (esse leva a Ajustes). Antes o botão ia a Ajustes, onde no modo negócio não havia o que clicar. |
| `Grades.tsx` | Clientes, equipe, catálogo, Fiscal (id `faturamento`; o rótulo virou "Fiscal" em 26/08/2026, o id continua por causa dos links já compartilhados), "Mais". ⚠️ O **Faturamento bifurca**, e quem escolhe é `st.fiscal.caminho`, nunca o estado das notas. Desde 26/08/2026 os dois lados são telas diferentes: pessoa física cai em `componentes/EmitirRecibos.tsx` (assunto único, guiado) e CNPJ segue no hero+tabela daqui — **guardado como estava, para a v2 reestruturar**. Enquanto o caminho é desconhecido, nenhum dos dois aparece: piscar a promessa errada por meio segundo foi o defeito reclamado. Ver `vocabulario` e o teste ao lado. ⚠️ Desde 25/09/2026 (1A.12) `vocabulario` também diz se alguém **escolheu** o documento (`escolhaFeita`, nunca o `caminho`) e o que **falta** (`st.fiscal.falta`): sem escolha, o hero oferece "Escolher o documento" e nada de "Emitir" nem "Mês fechado"; com falta, o "Emitir" fica desligado com a frase ao lado (`Hero` aceita `acao.desabilitada` e `acao.motivo`), e a topbar e a gaveta da nota não emitem. Os formulários em linha de "Novo cliente" e "Adicionar profissional" abrem por `st.novoEmLinha`, que a casca pede (T2); o de profissional (`NovoProfissional`, 1B.12) grava por `st.criarProfissional` (`PUT /api/equipe` sem `id`) e abre a ficha, onde nome e papel se editam (`st.editarProfissional`, ao sair do campo). Expediente não: a rota recusa de propósito. |
| `AMaisa.tsx` | Os ajustes da assistente + preview de WhatsApp. ⚠️ Cada seção só desenha campo depois da leitura dela (`leituraDaSecao`: `ajustesCarregados`, `semanaCarregada`, e o cadastro na Personalidade); antes, esqueleto; se falhou, a frase e "Tentar de novo" (recarrega a página: o store não relê ajustes sob demanda). Os placeholders do store são primeira pintura, e editá-los gravava por cima do banco (1A.7). ⚠️ Não tem botão Salvar, e o sinal que o substitui mora na linha de status (`IndicadorDeGravacao`, 1A.8): "Salvando…" do primeiro toque, "Salvo" só com a resposta do servidor, "Não salvou." com "Tentar de novo", que chama `st.salvar` e reaplica a mesma mudança (a volta atrás do store já a tirou da tela). O store só expõe; o mecanismo de coalescer e voltar atrás não mudou. ⚠️ Sem "Mensagem de saudação" e sem "Confirmar no WhatsApp" desde 25/09/2026 (1A.9): nenhum dos dois chegava na MAISA (`persona.ts` não lê a saudação, e a ferramenta de marcar confirma sempre). Voltam quando o prompt ler os dois, decisão do Bruno. O preview da Personalidade fala com os dois nomes da seção, que são os que o prompt usa. |
| `DocumentoFiscal.tsx` | **Nota fiscal ou recibo do Receita Saúde** — a escolha e o que cada caminho pede. Fora do rail, como `Contatos`: é decisão de uma vez só. ⚠️ Desde 26/08/2026 ela termina com um CTA **Continuar para emissão** — respondia a pergunta e parava, deixando quem escolheu sem próximo passo. E o arquivo do e-CAC saiu daqui: `LoteReceitaSaude` entra com `apenasDados`, só a identidade de quem emite (é para cá que o "Voltar e editar meus dados" da tela Fiscal aponta). ⚠️ Ela **não reimplementa** os dois fluxos: `LoteReceitaSaude` decide sozinho se aparece, e o `LigarNotaFiscal` vem **controlado** (props `modo`/`onModo`) — o seletor daqui é o passo 0 dele. ⚠️ E o cartão marcado sai de `escolhaFeita`, **nunca do `caminho`**: caminho de config vazia é `municipal`, e derivar dali marcou "Tenho CNPJ" para quem nunca escolheu — o clique seguinte virou troca, a troca virou `DELETE`, e o DELETE apagou CPF, profissão, registro e ambiente em produção (26/08/2026). ★ Desde 25/09/2026 (1A.14) o passo a passo do site da Receita (autorização de acesso, Carnê-Leão do ano, conferência sem emitir) volta a ser desenhado aqui, por `NoSiteDaReceita` (exportado de `LoteReceitaSaude.tsx`, reusa `ItemChecklist`), com a escolha gravada. `?secao=autorizacao` e `?secao=carne-leao` (ou `st.irPara("fiscal", "autorizacao")`, que é o "Renovar autorização" da tela Fiscal) rolam até o item e o focam. "Continuar para emissão" só aparece com a escolha gravada e nada faltando (1A.13). ★ `?secao=recibo` e `?secao=nota` (25/09/2026, 1B.14) são as duas portas da etapa 5 do wizard: chegam com o caminho já escolhido na tela, sem gravar nada, e o formulário daquele caminho aberto. |

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
`PERIODO`, `PRESTADOR`, `DIAS_PADRAO`, `CFG_PADRAO`. **Desde 25/09/2026 (1A.10) nenhuma tela
usa os cinco primeiros**, e o guarda G3 reprova a volta com dívida zero: o mês é
`D.rotuloDoMes(iso)` ou `st.mesDoFechamento` (a competência do servidor), quem emite é
`st.fiscal.config`, o plano é `resumoDaAssinatura(st.assinatura)`, o suporte é
`D.WHATSAPP_DA_MAISA`. FAQ e números do mês saíram do Mais até terem fonte.

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
  antes de mandar numa URL ou num `conectarGoogle`. É a agenda do dono; a **leitura** não usa
  só ela: `lerAgenda` faz um GET por agenda de `cadastro.agendas` (desde 24/09/2026), cada
  `Bloqueio` sabe de qual `profissionalId` veio e ocupa só a coluna dele, e
  `leituraAgenda.faltam` lista as agendas cuja leitura falhou (a coluna delas não desenha vago).
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
