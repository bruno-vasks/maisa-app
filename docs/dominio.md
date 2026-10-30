# O domínio da MAISA — o negócio, sem código

Para quem chegou agora no Núcleo de Inovação e precisa entender **o que este produto é** antes
de mexer nele. Não pede nada de programação. Quem for escrever código também deveria ler:
metade dos bugs caros deste repositório nasceu de não entender o negócio, não de errar sintaxe.

## O que a MAISA resolve

Um barbeiro, um terapeuta ou uma clínica pequena perde cliente por um motivo bobo: **ninguém
atende o WhatsApp**. A pessoa manda mensagem às 21h perguntando se tem horário quinta, não
recebe resposta, e marca em outro lugar. Contratar recepcionista não fecha a conta para um
negócio de uma a cinco pessoas.

A MAISA é a recepcionista. Ela lê o WhatsApp do negócio, responde como gente, consulta a agenda
de verdade, oferece os horários que existem, marca, lembra o cliente na véspera e emite a nota.
O dono acompanha tudo por um painel e pode assumir a conversa quando quiser.

**Para quem vendemos hoje:** barbearias e terapeutas — cada um com sua landing page própria
(`/barbeiros`, e o pacote de terapeutas). O código é genérico de propósito: o mesmo tipo
`Negocio` serve barbeiro, terapeuta, dentista.

## O glossário

A coluna da direita é como a coisa se chama no código. É o que liga as duas línguas — se você
for pedir alguma mudança, usar o nome certo economiza uma rodada inteira de conversa.

| No negócio | No código | O que é |
|---|---|---|
| o assinante, a barbearia | `Negocio` | quem paga pela MAISA |
| **inquilino** | `ContextoTenant`, "tenant" | de quem é este dado. A separação entre um assinante e outro |
| quem atende | `Profissional` | o barbeiro, a terapeuta. Um negócio tem vários |
| o que se vende | `Servico` | corte, sessão, limpeza. Tem duração e preço — a **duração** é o que importa para a agenda |
| quem é atendido | `Cliente` | identificado pelo **telefone**, não por um cadastro |
| horário de funcionamento | `Expediente` | quando cada profissional trabalha, em dado estruturado |
| **vaga** | `vagasDoDia`, `Ocupado` | um buraco livre na agenda que cabe o serviço pedido |
| o horário marcado | `Agendamento`, `AtendimentoMarcado` | o compromisso entre cliente e profissional |
| a agenda do dono | **agenda externa** (`AgendaExterna`) | hoje o Google Calendar. É a **fonte da verdade** |
| a conversa | `Conversa`, `Msg` | a thread do WhatsApp com um cliente |
| **assumir a conversa** | `posse`, `MudarPosseConversa` | o dono toma a frente e a MAISA cala |
| **escalar** | `chamar_humano`, handoff | a MAISA desiste e chama o dono |
| o jeito da MAISA | `Assistente`, `Tom` | nome, tom de voz, o que ela não pode falar |
| lembrete | `FilaDeLembretes` | a mensagem de véspera, disparada de 15 em 15 minutos |
| fila de envios | `FilaDeEnvios`, `EnvioNaFila` | o aviso que sai sem ninguém ter escrito (recibo, PDF), um por vez por negócio, espaçado (27/10/2026) |
| **recebimento** | `Recebimento`, `RepositorioRecebimentos` | o cliente pagando o negócio (27/10/2026): um Pix que a MAISA mandou, na chave do próprio profissional, e que ninguém confirmou ainda. Cobre um atendimento, ou o mês do pacote. **Não é a assinatura** (`Assinatura`, o negócio pagando a MAISA) |
| comprovante de pagamento | `ComprovanteDePagamento`, `LeitorDeComprovanteDePagamento` | a imagem do banco que o cliente devolve depois do Pix. Lida pelo Gemini, confirmada pelo dono no extrato. ⚠️ "comprovante" sozinho, no código, é o PDF do recibo (`GuardaDeComprovante`) |
| código da transação | `lerIdFimAFim`, `conferirCodigoDoPix` | o `E…` de 32 caracteres que todo comprovante de Pix traz: o banco de quem pagou e a hora do Pix (em UTC, com até 12 h de folga). A MAISA confere com o banco e a data escritos no comprovante e com a hora da cobrança. Não prova o pagamento: só pega comprovante editado ou antigo |
| como paga | `ComoPaga` | na ficha: depois de cada atendimento (o padrão do negócio), uma vez por mês no dia do recibo, ou não cobrar pelo WhatsApp |
| conta de recebimentos | `ProvedorDeRecebimentos`, `CofreDeRecebimentos` | a opção B, atrás de flag: a subconta no Asaas, no nome do profissional, para a cobrança ir com página de Pix, boleto e cartão e o pagamento ser confirmado sozinho |
| nota fiscal | `Nota`, `EmissorFiscal` | emissão pela Focus NFe |
| **instância** | `EVOLUTION_INSTANCIA`, `integracoes_whatsapp` | a linha de WhatsApp conectada. Uma instância = um negócio |

## As três ideias que explicam quase tudo

**A agenda do Google é a verdade, não uma cópia.** A MAISA não mantém uma segunda lista de
compromissos. Quando mantinha, nenhuma tela conseguia dizer qual das duas era a real. Efeito
prático: um compromisso pessoal que o dono marcou no celular dele **bloqueia horário** na
MAISA, do mesmo jeito que um atendimento. É o comportamento que ele espera — e é o mais fácil
de quebrar sem ninguém notar.

**A MAISA nunca decide de quem é o dado.** Quem está falando vem sempre de algo que o cliente
não controla: no painel, o cookie de login; no WhatsApp, qual linha recebeu a mensagem. Isso
parece detalhe técnico e não é — é a diferença entre um produto multi-cliente e um vazamento.
Na integração de onde este código veio, o id do negócio vinha pela URL, e bastava conhecer o
id de alguém para escrever na agenda dessa pessoa.

**Ser conversacional é código, não pedido.** O que denuncia um robô na primeira frase é o
bloco: parágrafo, lista, fecho educado, tudo de uma vez. Gente manda "Bom dia!", depois "Como
posso ajudar?". A MAISA quebra a resposta em até 3 mensagens curtas por regra de código, não
por instrução no prompt — instrução em prompt é probabilidade, e num canal onde o cliente vê o
resultado cru a exceção aparece.

## As armadilhas — o que já custou caro

Estas não são hipóteses. Cada uma quebrou algo em produção ou em teste real.

**A MAISA já mentiu que tinha marcado.** Medido em cerca de 1 a cada 3 tentativas: o modelo
consultava a agenda, recebia o horário livre e **escrevia a confirmação sem marcar de fato**.
"Pronto, agendado para amanhã às 09:00" saía para o cliente com a agenda vazia. A defesa é
código: tentou marcar e não marcou ⇒ a resposta é descartada e o dono assume. É o pior bug
possível deste produto, porque ninguém percebe até o cliente aparecer na porta.

**O horário que ninguém ofereceu.** O modelo dizia "tenho quinta às 15h" sem consultar nada.
Hoje, marcar só aceita horário que saiu de uma consulta real feita no mesmo turno.

**Mensagem duplicada vira horário duplicado.** Quando o WhatsApp não recebe confirmação a
tempo, ele reenvia a mesma mensagem. Sem proteção, a segunda tentativa marca um segundo
horário para o mesmo cliente. A chave que impede isso é **derivada** dos dados do próprio
agendamento, para funcionar sem o modelo cooperar.

**O erro de um dia.** Datas no código são texto (`"2026-08-14"`), nunca objeto de data. O
motivo: meia-noite em Londres é 21h do dia anterior em São Paulo, e um agendamento aparecia no
dia errado.

**Áudio não é respondido.** Cliente que manda áudio recebe **silêncio** — a mensagem é
reconhecida e descartada. No Brasil áudio é como muita gente manda mensagem, então isso não é
caso de borda: é decisão de produto pendente, com três saídas possíveis (pedir texto, escalar
para o dono, ou transcrever).

**A MAISA já respondeu a si mesma.** O WhatsApp devolve as mensagens que nós enviamos no mesmo
canal das recebidas. Sem descartar, ela responde à própria resposta, num laço caro e visível
para o cliente.

**Nem todo contato tem telefone.** Desde 2025 o WhatsApp entrega alguns contatos com um
identificador opaco no lugar do número. Tratar isso como telefone cadastra um cliente falso
**e** a resposta não chega em ninguém — a conversa roda inteira, gasta dinheiro, e some.

**Preferência é deduzida, nunca anotada.** A MAISA só afirma que alguém tem profissional ou
horário favorito depois de 3 visitas com pelo menos metade concentrada. Quem alternou entre
três profissionais em seis visitas **não tem** favorito. Preferimos não lembrar nada a lembrar
errado: errar aqui é chamar o cliente pelo nome do profissional que ele não quer.

## Como ver funcionando sem número de WhatsApp

`npm run dev` e abra `/laboratorio`. Você conversa como se fosse o cliente, e ao lado aparece a
trilha do que aconteceu por baixo. Essa coluna é o motivo de a tela existir: no texto da
resposta, *"consultei a agenda e tenho quinta às 15h"* e *"inventei quinta às 15h"* são
**indistinguíveis** — e a segunda é o pior defeito deste produto. A trilha mostra se a consulta
realmente rodou antes da fala.

Sem credencial do Google a agenda cai numa versão de mentira, com o almoço bloqueado das 12h
às 13h. Um selo no topo diz qual está em uso — um horário que "não existe" parece bug da MAISA
quando é só a agenda de demonstração.

## Onde continuar

| Quero | Vou para |
|---|---|
| ver os fluxos ponta a ponta | [`fluxos/`](fluxos/) |
| ver as rotas do servidor | [`rotas.md`](rotas.md) |
| entender a organização do código | [`../ARQUITETURA.md`](../ARQUITETURA.md) |
| as regras que não se quebram | [`../CLAUDE.md`](../CLAUDE.md) |
