# Rotas HTTP

Toda rota do app, o que ela faz e quem pode chamar. **Mantido honesto por guarda de CI**
(`npm run guardas`): rota no código que não aparece aqui reprova o build, e rota citada aqui
que não existe no código também.

As rotas são **finas de propósito**. Elas autenticam, traduzem JSON e chamam um caso de uso —
a regra mora em `src/nucleo/`. Rota com `if` de negócio dentro é bug de camada.

## Como ler a coluna "porteiro"

Definidos em [`src/adaptadores/entrada/http/contexto.ts`](../src/adaptadores/entrada/http/LEIA-ME.md).

| Porteiro | Barra quem | Usado por |
|---|---|---|
| `exigirSessao()` | não logado → 401 | ação que precisa de login |
| `exigirSessaoComGoogle()` | não logado → 401; sem credencial Google → 400 `nao_configurado` | ação de agenda |
| `sessaoOuDemo()` | ninguém — sem Supabase devolve `TENANT_DEMO` | rotas que a UI de demonstração precisa exercitar |
| `SEGREDO` | header/query sem `WHATSAPP_WEBHOOK_SECRET` | o que é chamado por máquina, não por navegador |

> **A regra que não se negocia:** `tenantId` nasce do cookie de sessão, **nunca** da query
> string nem do corpo. Foi esse descuido que abriu o pior furo da integração de onde este
> código veio — bastava conhecer o id da vítima para escrever na agenda dela.

## Painel — o dono operando o negócio

| Rota | Métodos | Porteiro | Caso de uso |
|---|---|---|---|
| `/api/cadastro` | GET | `exigirSessao` | `LerCadastro` — negócio, profissionais, serviços, clientes |
| `/api/negocio` | POST · PATCH | `exigirUsuario` (POST) · `exigirSessao` (PATCH) | `ProvisionarNegocio` — cria `negocios` + `membros` no primeiro acesso · `AjustarNegocio` — troca o nome |
| `/api/ativacao` | GET | `sessaoOuDemo` | `LerAtivacao` — quantos dos 5 passos estão feitos. **Derivado do banco a cada leitura**, nunca de uma flag de progresso |
| `/api/servicos` | PUT · DELETE | `sessaoOuDemo` | `AjustarServico` — cria ou edita pelo `id` · `RemoverServico` |
| `/api/equipe` | PUT | `sessaoOuDemo` | `AjustarProfissional` — cria ou edita quem atende. **Não mexe em expediente**: aquilo manda na grade inteira e pede caso de uso próprio |
| `/api/clientes` | PUT | `sessaoOuDemo` | `AjustarCliente` — **só edita**, `id` obrigatório. Nome, telefone, e-mail, CPF, canal, serviço habitual, `ativo`, `valorSessao` (030) e `diaRecibo` (032, 1 a 31 ou `null`: o dia em que a MAISA emite sozinha os recibos da pessoa) |
| `/api/clientes` | POST | `sessaoOuDemo` | `CadastrarCliente` — só `nome` obrigatório; `telefone` e `cpf` opcionais (o recibo da Rebots pede só CPF). Telefone que já existe devolve o cliente existente com `jaExistia: true` |

⚠️ **Serviço tem DELETE e profissional não**, e a assimetria vem do esquema, não de gosto:
`atendimentos.servico_id` é snapshot **sem FK** (ao lado de `servico_nome` e `servico_valor`),
então apagar um serviço não toca faturamento fechado — enquanto `atendimentos.profissional_id`
tem **`on delete cascade`**, e apagar a pessoa levaria os atendimentos dela junto. Quem sai da
equipe vira `ativo: false`.

⚠️ **O `PUT /api/clientes` não cria**, ao contrário de `/api/servicos` e `/api/faqs`: corpo sem
`id` é recusado, não interpretado como "cadastre um". Quem cria cliente é `garantirCliente`,
dentro do repositório — e é ele que **deduplica por telefone**. O `POST` (botão "Novo cliente",
24/09/2026) deduplica pela mesma chave quando vem telefone; sem telefone (só nome e CPF, para o
recibo) não há chave, e ele cria. Precisa da migração `029_cliente_sem_telefone.sql`.

Dois campos desta rota não são cadastro comum. **`telefone` é identidade**: a coluna gerada
`telefone_chave` (8 últimos dígitos) é por onde o agente reconhece quem está falando. Ela
**não tem `unique` de propósito** — número repetido acontece em família — então nem a rota nem
o caso de uso recusam telefone repetido: `clientePorTelefone` desempata pelo cadastro mais
antigo, e bloquear tornaria ineditável quem divide número com um parente. Quem avisa é a
gaveta, em `hint`, sem impedir de salvar. **`cpf` é o que libera a nota**: sem ele a prefeitura recusa
e o lote do Faturamento pula a pessoa de propósito. `teste` **não é aceito** — marcar tomador
de teste faz a nota real dele se cancelar sozinha, e isso não pertence ao formulário onde se
conserta um telefone digitado errado.
| `/api/assistente` | GET · PATCH | `sessaoOuDemo` | `LerAssistente` · `AjustarAssistente` — nome, tom, o que não falar |
| `/api/horarios` | GET · PUT | `sessaoOuDemo` | `LerHorarios` · `AjustarHorarios` — o expediente que a MAISA anuncia |
| `/api/faqs` | GET · PUT · DELETE | `sessaoOuDemo` | `LerFaqs` · `AjustarFaq` · `RemoverFaq` — as respostas prontas. Não há rota de BUSCA: quem busca é o agente, pelo caso de uso `ResponderDuvida`, no mesmo processo |
| `/api/conversas` | GET · POST | `sessaoOuDemo` | `ListarConversas` · `LerConversa` · `ResponderConversa` · `MudarPosseConversa` |
| `/api/contatos` | GET · POST · PATCH | `exigirSessao` | `LerContatos` · `ImportarContatos` (lê a agenda do provedor) · `MarcarContato` · `DefinirModoDoNumero` |

⚠️ **O `/api/contatos` decide QUEM A MAISA VAI IGNORAR**, e por isso é `exigirSessao` e não
`sessaoOuDemo`: um inquilino de demonstração recebendo essa escrita significaria configurar o
silêncio de um negócio que não existe. O `PATCH` tem duas formas de corpo — `{ modo }` troca de
quem é o número, `{ telefone, cliente }` marca uma pessoa. São a mesma decisão de produto vista
de dois ângulos; separá-las por URL seria fronteira sem conteúdo.

O motivo de tudo isso existir: **o número pareado quase sempre é o celular pessoal do dono** —
barbearia pequena não tem linha corporativa. Sem o modo, a MAISA oferece horário para o pai
dele. A regra mora em [`nucleo/dominio/contatos.ts`](../src/nucleo/dominio/contatos.ts), é
função pura, e explica por que **não** é uma lista de permissão (lista de permissão ignora
justamente o cliente novo, que não está em contato nenhum).

`MudarPosseConversa` é o "Assumir": enquanto o dono tem a posse, o agente **cala**. A posse é
lida no banco antes do primeiro token — quando morava no `localStorage`, o botão prometia
silêncio e o webhook nunca ficava sabendo.

## Agenda e atendimentos

| Rota | Métodos | Porteiro | Caso de uso |
|---|---|---|---|
| `/api/google/conectar` | GET · DELETE | `exigirSessao` | inicia o OAuth (PKCE + `state` assinado) · `DesconectarAgenda` |
| `/api/google/callback` | GET | `state` assinado + PKCE | fim do OAuth: troca o código e grava o token **cifrado** |
| `/api/google/status` | GET | própria (ver abaixo) | `ListarConexoes` — quem já conectou. Nunca devolve token |
| `/api/agenda` | GET | `exigirSessao` | `LerAgenda` — os atendimentos de uma janela |
| `/api/atendimentos` | POST · DELETE | `exigirSessao` | `AgendarAtendimento` · `CancelarAtendimento`. Com `recorrencia: { cadaSemanas, chaves[] }` no corpo, vira `AgendarRecorrente`: um atendimento por data, e a resposta traz `serie.criados` e `serie.pulados` (horário ocupado não derruba a série). `servicoValor` é o preço DESTE atendimento — a tela deixa o dono mudar |

⚠️ **`/api/agenda` saiu de baixo do prefixo do Google em 04/09/2026** (ADR-0009), e trocou
de porteiro junto. A agenda é do produto; o Google é uma camada aditiva. Com
`exigirSessaoComGoogle`, um deploy sem credencial do Google recebia 400 `nao_configurado` ao
tentar ler a **própria** agenda. As rotas que continuam no prefixo antigo são as que de fato
falam com o Google.

`/api/google/status` é a **única** rota que não usa o porteiro, e é de propósito: ela existe
para *relatar* o estado da sessão e da configuração. Responder 401 esconderia justamente a
resposta que a pergunta pede, então tudo sai **200 com um `status` dentro**
(`nao_configurado` · `login_necessario` · `nao_autenticado` · `sem_negocio` · `ok`). Ela
autentica por conta própria e deriva o inquilino de `membros`.

⚠️ Os nomes de `status` do JSON são **contrato** com `src/ui/estado/store.tsx`. Mudar um deles
muda o comportamento da tela — procure o nome no store antes.

## Nota fiscal — Focus NFe

| Rota | Métodos | Porteiro | Caso de uso |
|---|---|---|---|
| `/api/fiscal` | GET · POST · PUT · PATCH · DELETE | `exigirSessao` | `LerEstadoFiscal` · `ConsultarCnpj` (`?cnpj=`) · `LigarNotaFiscal` · `LigarReciboSaude` (`{cpf}`) · `EnviarCertificado` · `LiberarProducaoFiscal` · `DesligarReciboSaude` (DELETE) |
| `/api/faturamento` | GET | `exigirSessao` | `LerFaturamento` — o que falta emitir, o que já saiu, e o que impede |
| `/api/nf/emitir` | POST | `sessaoOuDemo` | `EmitirNota` |
| `/api/nf/status` | GET | `sessaoOuDemo` | `ConsultarNota` |
| `/api/nf/cancelar` | POST | `sessaoOuDemo` | `CancelarNota` |
| `/api/recibos/lote` | POST · PATCH | `exigirSessao` | `GerarLoteDeRecibos` · `FecharLoteDeRecibos` — o CSV do Receita Saúde, para quem atende como pessoa física. `PATCH { avisar: true }` manda a notícia do recibo aos pacientes no WhatsApp |
| `/api/recibos` | GET · POST · DELETE | `exigirSessao` | `LerRecibosPendentes` · `LancarPagamentoAvulso` · `ExcluirPagamentoAvulso` — o que vai no arquivo, e o pagamento que a agenda não pegou |
| `/api/recibos/emitir` | POST | `exigirSessao` | `EmitirRecibo` — UM pagamento, pelo canal programático (Rebots, ou o demo quando não há credencial). Recebe só `{fonte, id}`: valor, CPF e data saem do banco. ⚠️ 200 quer dizer "o canal aceitou", **não** "emitido" — o desfecho chega no callback Desde 01/10/2026 também `{ itens: [{fonte, id}, …] }`: várias sessões da mesma pessoa e mês num recibo só (um recibo por mês); de cada item só `fonte` e `id` chegam ao núcleo. |
| `/api/recibos/callback` | POST | **segredo** (`RECIBOS_CALLBACK_SECRET`) | o canal de emissão diz o que aconteceu com o recibo. Sem sessão: quem chama é o servidor do fornecedor. Com `avisarRecibo` ligado, avisa o paciente, ou a dona se `reciboPrimeiroParaMim` (032): a mesma mensagem, com uma linha antes, para ela encaminhar |
| `/api/rotinas/recibos` | GET · POST | `CRON_SECRET` ou `ROTINAS_SECRET` | `EmitirRecibosAutomaticos` — o cron da Vercel, 1×/dia às 9h (01/10/2026). Para quem tem `dia_recibo` hoje (ou nos 2 dias anteriores, se a rotina falhou), emite pelo mesmo `EmitirRecibo` da tela as sessões **do mês que passou** (no dia 31, "último dia do mês", as do próprio mês até a véspera; 08/10/2026) que ainda não têm recibo. Negócio sem autorização de acesso não emite. **Não manda mensagem**: quem avisa é o callback |

**O `/api/fiscal` é o onboarding fiscal, e ele faz UMA pergunta: o CNPJ.** Razão social,
município, CNAE e — o que decide o caminho de emissão — `optante_mei` vêm da Receita a partir
dos 14 dígitos. `POST` consulta e cadastra a empresa no emissor; `PUT` instala o certificado
A1; `PATCH` vira a chave para produção e **recusa enquanto faltar qualquer coisa**.

⚠️ Ele é `exigirSessao` e os `/api/nf/*` são `sessaoOuDemo`, e a diferença é o custo: aqui se
cria uma **empresa cobrada** numa conta de emissor fiscal, e a Focus não deduplica por CNPJ.

⚠️ **MEI vai pelo Ambiente Nacional, obrigatoriamente.** O `caminho` do GET diz por onde a
nota sai (`nacional` | `municipal`) — e o modo de falha de errar isso é traiçoeiro: a emissão
devolve 202 "processando" e a recusa chega minutos depois no status assíncrono. A regra está em
[`nucleo/dominio/fiscal.ts`](../src/nucleo/dominio/fiscal.ts) e tem teste.

⚠️ **Nem o token do emissor nem o `.pfx` do certificado ficam no nosso banco.** O token é
pedido ao provedor na hora de emitir e não chega ao núcleo; o certificado atravessa o `PUT` e
vai embora, sobrando só `certificadoValidoAte`. Ver
[`portas/saida/cadastro-de-emissor.ts`](../src/nucleo/portas/saida/cadastro-de-emissor.ts).

**O `/api/recibos/lote` não emite nada, e o nome diz isso de propósito.** Quem atende como
pessoa física — psicóloga, fisioterapeuta, fonoaudióloga, TO — emite o Recibo Eletrônico de
Serviços de Saúde dentro do e-CAC, obrigatório desde 01/01/2025 (IN RFB 2.240/2024). Não há
API: o que sai da rota é um CSV para ela importar no Carnê-Leão e assinar. É `exigirSessao`
porque a resposta é uma lista de CPFs de pacientes e valores de sessão — o dado mais sensível
que este app produz. Ver [`dominio/recibo-saude.ts`](../src/nucleo/dominio/recibo-saude.ts).

⚠️ **`PATCH { avisar: true }` manda WhatsApp para pacientes, e a leitura é `=== true`.** O
disparo sai pelo número **pessoal** de quem usa a MAISA: `"false"`, `1` ou um campo torto não
podem virar trinta mensagens, e a ausência é silêncio. A mensagem leva **a notícia do recibo,
nunca o documento** — a importação em lote do Carnê-Leão devolve só o PDF de erros e o CSV das
linhas processadas; os PDFs dos recibos saem um por um, na tela do e-CAC. E ela **não leva o
nome do serviço**, pela mesma razão da descrição do CSV. Ver
[`avisoDeRecibo`](../src/nucleo/dominio/recibo-saude.ts).

⚠️ **O aviso só sai se `confirmarLote` devolver `true`.** Ele é a claim: o `update` só sai de
`gerado`, e o `.select("id")` conta as linhas afetadas. Sem esse portão, o segundo clique em
"Importei no e-CAC" — ou um F5 depois de uma resposta lenta — mandaria outra rodada de mensagens
para os mesmos pacientes, e mensagem entregue não se apaga.

⚠️ **`POST /api/nf/emitir` aceita UM campo: `clienteId`.** Ele recebia `valor`, `discriminacao`
e `tomador` do corpo até 17/08/2026 — ou seja, um POST forjado emitia documento fiscal de
qualquer valor, para qualquer CPF, sob o CNPJ do dono. Agora tudo isso sai do banco, na
transação que prende os atendimentos.

⚠️ **Emitir duas vezes o mesmo cliente devolve `status: "ja_faturado"`, e isso não é erro.** A
claim (`abrir_nota()`, `supabase/015`) é atômica e usa `for update skip locked`: o segundo
clique — ou a segunda aba — não encontra o que prender. Nota fiscal duplicada não se apaga, e
é o modo de falha que essa função existe para tornar impossível.

Formato de erro dos `/api/nf/*` **diferente** do resto do app: `erros: [{ mensagem }]`, herdado
da Focus e já entranhado na tela de Faturamento. E `config_incompleta` sai com **HTTP 200** —
não é falha de requisição, é o app dizendo ao dono o que falta. Ver
[`entrada/http/fiscal.ts`](../src/adaptadores/entrada/http/LEIA-ME.md).

## Cobrança — Stripe

| Rota | Métodos | Porteiro | Caso de uso |
|---|---|---|---|
| `/api/assinatura` | GET · POST | `sessaoOuDemo` | `LerAssinatura` — plano, status, próxima cobrança, cartão · `AbrirCheckout` (`{plano, metodo?}`) — devolve `{url}`, **não cobra nada**. `metodo: "cartao"` (09/10/2026) abre a compra avulsa de um mês no cartão, e só passa quando `capacidades.cartao` |
| `/api/assinatura/portal` | POST | `sessaoOuDemo` | `AbrirPortalDeCobranca` — trocar cartão, baixar fatura, cancelar. Separada da irmã porque é a operação destrutiva. **Só provedor com portal** (Stripe); na AbacatePay devolve **501** |
| `/api/assinatura/cancelar` | POST | `sessaoOuDemo` | `CancelarAssinatura` — o caminho de quem **não** tem portal (AbacatePay). ⚠️ **imediato e irreversível**; na Stripe devolve **501** |
| `/api/stripe/webhook` | POST | **assinatura HMAC** (`STRIPE_WEBHOOK_SECRET`) | `RegistrarAssinatura` — escrita em `assinaturas`. Continua no ar por quem assinou pela Stripe |
| `/api/abacatepay/webhook` | POST | **segredo na query** (`ABACATEPAY_WEBHOOK_SECRET`) + HMAC | `RegistrarAssinatura` — o caminho do **Pix**. Ver o ⚠️ do HMAC abaixo · `transparent.completed` (o Pix de `/pagar`) e `checkout.completed` → `RegistrarPagamentoAvulso`: **relê o pagamento na fonte** e soma um mês (pré-pago, 29–30/09/2026) |
| `/api/pagamento` | GET | `sessaoOuDemo` | `LerPagamento` — o Pix que a tela `/pagar` desenha (`?id=pix_char_…`): QR Code, copia-e-cola e status, **relidos na AbacatePay**. 404 se o Pix não existe **ou é de outro negócio** (o carimbo é conferido). **Não credita nada** — quem soma o mês é o webhook |
| `/api/teste/pedido` | POST | `exigirSessao` | `LerSituacaoDoTeste` — o link `/liberar/<pedido>` que a `/pagar` põe na mensagem do WhatsApp de quem quer testar antes (09/10/2026). O pedido é **assinado pelo servidor** a partir da sessão (`entrada/http/pedido-de-teste.ts`), e é por isso que a equipe não recebe um id de negócio cru. **Não libera nada** |
| `/api/teste/liberar` | GET · POST | `exigirEquipe` (`MAISA_EQUIPE`, ids de usuário) + pedido assinado | `LerSituacaoDoTeste` · `LiberarTeste` — a equipe abre 7 dias de teste. ⚠️ **liberar é só POST**: o WhatsApp abre o link sozinho para a pré-visualização, e um GET que liberasse liberaria sem conversa. Recusa quem tem mês pago valendo |
| `/api/rotinas/cobranca` | GET · POST | `CRON_SECRET` ou `ROTINAS_SECRET` | `AvisarVencimentos` — o cron da Vercel, 1×/dia às 9h. E-mail ao dono 3 dias antes, 1 dia antes, no dia e no dia seguinte ao vencimento. **Não corta ninguém**: o corte é do webhook do WhatsApp |

⚠️ **`/portal` e `/cancelar` são exclusivas entre si** — cada provedor tem UMA das duas. O
`GET /api/assinatura` devolve `capacidades` (`{ portal, cancelamento, pix, prepago }`) e é por ele
que a tela decide qual botão desenhar. Desenhar os dois é como se acaba com um deles
cancelando diferente do outro. **No pré-pago nenhuma das duas existe**: não há assinatura no
provedor, e quem não quer mais só não paga o mês seguinte (`/cancelar` devolve **501**).

★ **O pré-pago corta no `/api/whatsapp`, não aqui.** Venceu o mês pago (ou o teste), a MAISA
fica em silêncio até o próximo Pix entrar. A pergunta é refeita a cada mensagem, então o
pagamento religa sozinho. Se a leitura da assinatura falhar, ela **responde** — falha aberta,
de propósito: defeito nosso não cala o cliente de quem pagou.

⚠️ **200 no `POST /api/assinatura` significa "a página de pagamento existe", e nada mais.**
Quem pagou, se pagou e quando pagou é assunto do webhook. Boleto leva um dia; a volta do
navegador não é confirmação, e a tela de retorno não pode dizer "assinatura ativa".

⚠️ **Os dois webhooks devolvem 500 quando a falha é nossa, e isso é de propósito.**
Resposta ≠ 2xx significa reentregar — 3 dias na Stripe, ~18h em 7 tentativas na AbacatePay
— e é a única chance de o pagamento não se perder quando o banco pisca. As duas tabelas de
status estão nos cabeçalhos das rotas
([Stripe](../src/app/api/stripe/webhook/route.ts) ·
[AbacatePay](../src/app/api/abacatepay/webhook/route.ts)) e **não são iguais**.

⚠️ **NUNCA responder 410 no webhook da AbacatePay** — ele desativa o endpoint no lado
deles, e endpoint de pagamento desativado não dá erro: as vendas só param de aparecer.

⚠️ **O HMAC da AbacatePay não autentica ninguém.** A chave dele é uma constante **pública**,
publicada na documentação deles. Quem autentica é o `?webhookSecret=` da query string. O
porquê inteiro está em
[`entrada/abacatepay/LEIA-ME.md`](../src/adaptadores/entrada/abacatepay/LEIA-ME.md) —
tratá-lo como o `whsec_` da Stripe deixa o webhook aberto para quem souber a URL.

O que a Stripe **não** faz no Brasil — Tax, nota fiscal, Pix recorrente — está em
[`saida/stripe/LEIA-ME.md`](../src/adaptadores/saida/stripe/LEIA-ME.md). Ler antes de
prometer. O Pix recorrente é justamente o motivo de a AbacatePay existir aqui:
[`saida/abacatepay/LEIA-ME.md`](../src/adaptadores/saida/abacatepay/LEIA-ME.md).

## WhatsApp — chamado por máquina

| Rota | Métodos | Porteiro | O que faz |
|---|---|---|---|
| `/api/whatsapp` | GET · POST | `SEGREDO` | **o webhook.** Recebe a mensagem do cliente e roda o agente |
| `/api/whatsapp/conexao` | GET · POST | `SEGREDO` | pareamento da instância |
| `/api/canal` | GET · POST · PATCH · DELETE | `exigirSessao` | `LerCanal` · `ConectarCanal` · `DesconectarCanal` — a visão do painel do mesmo canal |
| `/api/canal/codigo` | POST | `exigirSessao` | `RenovarCodigo` — outro código de pareamento, **sem** derrubar a instância |
| `/api/rotinas/lembretes` | POST | `SEGREDO` | `EnviarLembretes` — disparado por `pg_cron` a cada 15 min |

O webhook responde **200 mesmo quando descarta** a mensagem. Para o provedor, resposta de erro
significa "tente de novo", e ele reentrega o mesmo evento em loop. O fluxo inteiro, com o que
é descartado e por quê, está em [`fluxos/mensagem-whatsapp.md`](fluxos/mensagem-whatsapp.md).

### `POST /api/canal` — os dois jeitos de parear

`{}` (ou corpo vazio) devolve **QR**. `{"numero":"5511994294906"}` devolve o **código de 8
caracteres** do "Conectar com número de telefone" do WhatsApp. A resposta traz os dois campos,
`qrcode` e `codigo`, e o que veio `null` é o caminho que não foi pedido.

O código existe porque **o QR pressupõe dois aparelhos** — um mostrando, outro fotografando — e
metade dos clientes abre a MAISA no mesmo celular onde o WhatsApp do negócio está instalado. A
câmera não fotografa a própria tela, e para essa pessoa o passo simplesmente não termina. Quem
escolhe o caminho é a tela, pelo tamanho do viewport; a rota aceita os dois sempre.

⚠️ **O `numero` do corpo não é gravado em lugar nenhum.** Ele só diz para qual celular o
WhatsApp deve emitir o código. Quem escreve `integracoes_whatsapp.numero` continua sendo o
`ownerJid` que o provedor devolve depois do pareamento — ver
[`portas/saida/provisionamento-canal.ts`](../src/nucleo/portas/saida/provisionamento-canal.ts).
É também por isso que ele não fere a regra do `tenantId`: `numero` não escolhe inquilino,
instância nem destino de webhook.

### `PATCH /api/canal` — quem recebe "preciso de você nessa conversa"

`{"telefoneDono":"11994294906"}` grava; `{"telefoneDono":""}` apaga. Era a env global
`MAISA_WHATSAPP_DONO`, e virou coluna por inquilino em `017_dono_por_inquilino.sql`.

O motivo é vazamento: o aviso de escalação carrega o **telefone do cliente final** e o
motivo da conversa. Com uma env, o cliente da barbearia do Zé tinha o número dele entregue
no WhatsApp de outra pessoa — e o Zé nunca era avisado, então toda conversa que a MAISA não
resolvia morria com o cliente esperando.

### `POST /api/canal/codigo` — o código vence, e a tela troca sozinha

O código do WhatsApp vale cerca de um minuto, e parear é tarefa de **dois aplicativos**:
copiar aqui, trocar de app, achar *Aparelhos conectados*, colar. Quem se atrapalha no meio
perdia o código — relatado em 17/08/2026 como *"deu certo logar com código, mas o meu código
expirou no meio"*.

A tela mostra um contador e chama esta rota quando ele zera. Ela **não é** `POST /api/canal`
com outro nome: aquela apaga a instância, espera 3s e recria (é a que derruba o WhatsApp de
quem estava atendendo); esta deixa a instância em `connecting` e só pede outro código na
mesma sessão do Baileys. Um disparo automático na primeira seria perigoso; nesta é barato.

`codigo: null` volta com **`ok: true`** — significa "não emiti outro agora", não falha da
requisição: a instância segue de pé e o QR segue válido. A tela oferece o QR em vez de
acender erro.

## Conversar com a MAISA fora do WhatsApp

| Rota | Métodos | Porteiro | O que faz |
|---|---|---|---|
| `/api/laboratorio` | GET · POST · DELETE | `exigirSessao` (ou `MAISA_LABORATORIO=1` sem login) | conversa com a MAISA sem número de WhatsApp |

Você é o cliente. Roda o **agente real**: mesmas ferramentas, mesma agenda, mesmo modelo — o
horário que sair daqui existe. Existe porque no texto da resposta *"consultei a agenda e tenho
quinta às 15h"* e *"inventei quinta às 15h"* são indistinguíveis, e a segunda é o pior bug
deste produto; a trilha devolvida diz qual dos dois aconteceu.

⚠️ **Deixou de ser dev-only em 15/08/2026.** Ela é a etapa 4 do `/comecar` (o "ver
funcionando"), então o inquilino passou a vir da **sessão** e a resposta sem login é 401, não
404. `MAISA_LABORATORIO=1` sobrou só como caminho de desenvolvimento sem login, com um
inquilino de fixture. Consequência que vale dizer em voz alta: a rota **gasta token de modelo
e escreve na agenda de quem chama** — com o porteiro, isso é a mesma exposição que o WhatsApp
do próprio inquilino já tem; sem ele, era a chave de IA aberta para quem achasse a URL.

A **página** `/laboratorio` continua fechada em produção: ela é a versão de depuração, com a
trilha crua em JSON ao lado. O que o cliente vê é a etapa 4 do wizard.

## O que NÃO fazer numa rota

- ❌ Ler `tenantId` do corpo ou da query. Ele vem do cookie, sempre.
- ❌ Chamar adaptador direto. A rota chama `app.<casoDeUso>` de `src/composicao.ts`.
- ❌ Regra de negócio no handler. Se precisa decidir algo, decide em `src/nucleo/aplicacao/`.
- ❌ Rota nova sem linha nesta tabela. A guarda reprova o build — de propósito.
