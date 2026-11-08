# `nucleo/aplicacao/` — os casos de uso

Aqui mora a **regra**. Cada arquivo implementa uma ou mais portas de entrada usando as
portas de saída que recebe por parâmetro.

## Arquivos

| Arquivo | Casos de uso | Depende das portas |
|---|---|---|
| `agendar-atendimento.ts` | `AgendarAtendimento` | `AgendaExterna`, `RepositorioNegocio` |
| `agenda.ts` | `LerAgenda`, `CancelarAtendimento`, `ListarConexoes`, `DesconectarAgenda` | `AgendaExterna`, `ConexoesDeAgenda`, `RepositorioNegocio` |
| `remarcar-atendimento.ts` | `RemarcarAtendimento` (tipo declarado no próprio arquivo, fora de `portas/entrada`, 25/09/2026, 1B.5) | `AgendaExterna`, `RepositorioNegocio`, `RegistroDeAtendimentos` · banco primeiro (`registrar` de novo com a mesma `maisaAg`), **relê a linha** para não dizer "movido" quando o upsert engoliu a falha, e só então o `remarcar` do calendário, num `try` (`foraDoCalendario` se ele lançar). Mesmo `eventoId`, mesmo Meet |
| `expediente.ts` | `AjustarExpediente` (24/10/2026): os dias e o horário em que um profissional atende, o que decide a grade da Agenda e o que a MAISA oferece. Recusa sem nenhum dia, com domingo, hora fora do passo de meia hora ou da janela da Agenda (07:00 a 22:00), `ate` que não é depois de `de`, e profissional que a porta não acha neste negócio. Regrava `horario` e `folga` junto do número, porque a leitura prefere o texto gravado ao montado. Não mexe em atendimento já marcado | `RepositorioNegocio` |
| `notas.ts` | `EmitirNota`, `ConsultarNota`, `CancelarNota`, `LerFaturamento` | `EmissorFiscal` · `RepositorioFiscal` · `RepositorioNotas` |
| `fiscal.ts` | `LerEstadoFiscal`, `ConsultarCnpj`, `LigarNotaFiscal`, `EnviarCertificado`, `LiberarProducaoFiscal` | `RepositorioFiscal` · `CadastroDeEmissor` |
| `conversas.ts` | `ListarConversas`, `LerConversa`, `ResponderConversa`, `MudarPosseConversa` | `RepositorioHistorico`, `RepositorioConversas`, `CanalDeMensagens` |
| `recibo-automatico.ts` | `EmitirRecibosAutomaticos` (01/10/2026), a rotina diária: no dia de cada paciente (ou na folga de 3 dias), emite pelo **mesmo** `EmitirRecibo` da tela as sessões dela até o corte (`corteDoRecibo`, 08/10/2026: o mês que passou; no dia 31, o próprio mês até a véspera) que ainda não têm recibo. Negócio sem autorização de acesso vira UMA falha e nem tenta. Não avisa ninguém: quem avisa é o callback. Para de emitir em 45s (`TETO_DA_RODADA_MS`) e conta o resto como `adiados`. ⚠️ A quarta exceção ao `ContextoTenant` primeiro, com o limite escrito em `casos-de-uso.ts` | `AgendaDeRecibos` (cross-tenant, só leitura), `RepositorioRecibos`, `RepositorioFiscal`, e o caso de uso `EmitirRecibo` Desde 01/10/2026 junta as sessões de cada pessoa por `juntarEmRecibos` com o `porMes` da ficha; `emitidos` e `adiados` contam recibos, não sessões. |
| `recibo-unitario.ts` | ★ Desde 01/10/2026 o aviso do callback segue `reciboPrimeiroParaMim`: a mensagem do paciente vai para a dona, com `cabecalhoParaADona` antes, em duas bolhas, e o desfecho é `enviado_ao_dono`. `DepsDeAviso` ganhou `canalDoNegocio` (o número dela) | `RepositorioCanal`, além das de antes ★ Desde 01/10/2026 `EmitirRecibo` aceita `{ itens }`: várias sessões num recibo, recusando pessoas, pagadores ou meses diferentes antes de prender; o livro prende tudo ou nada. E o aviso manda o **PDF** (`enviarDocumento`, link curto da nossa cópia, ou o do canal) com a mensagem na legenda; arquivo recusado é `falhou`, sem cair para texto. |
| `aviso-de-cadastro.ts` | `AvisarNovoCadastro` (22/10/2026): relê a conta pelo id, e se ela ainda não foi avisada, **marca antes de mandar** o e-mail a cada destinatário fixo da configuração. Nenhum e-mail saiu = desmarca e lança (dá para disparar de novo); pelo menos um saiu = a marca fica. Conta já marcada = `ja_avisado`, nada sai. ⚠️ A quinta exceção ao `ContextoTenant` primeiro, com o limite escrito em `casos-de-uso.ts`; a marca não é claim atômica (o porquê está no cabeçalho) | `ContasNovas`, `Correio` |
| `fila-de-envios.ts` | `EnviarFilaDeMensagens` (a rotina, de todos os negócios) e `DrenarFilaDoNegocio` (o disparo de quem acabou de enfileirar), 27/10/2026: esvazia a fila de envios uma mensagem por vez por negócio, com 3 a 7 s entre pessoas, gera o link do PDF na hora de mandar (da nossa cópia; sem ela, o do canal enquanto vale; senão, texto) e anota o desfecho do recibo quando sai. Volta para a fila só o que com certeza não saiu (`LimiteDoProvedor`, `PrecisaReconectar`, `NaoConfigurado`); o resto pode ter entregado e desiste na hora (`falhou`). Para de mandar aos 240 s. ⚠️ A sexta exceção ao `ContextoTenant` primeiro, com o limite escrito em `casos-de-uso.ts` | `FilaDeEnvios` (só `negociosComEnvio` atravessa negócios), `CanalDeMensagens` (ritmo "rotina"), `GuardaDeComprovante`, `LivroDeRecibos.registrarAviso` |
| `recebimentos.ts` | `CobrarAtendimentos` (a rotina, de 5 em 5 min), `LerRecebimentos`, `SalvarConfigDeRecebimentos`, `MandarPix`, `DecidirRecebimento`, `ConfirmarComprovante`, `DescartarComprovante` e os três da conversa (`ReceberComprovante`, `GuardarCpfDaConversa`, `ResponderAoDono`), 27/10/2026: o Pix na chave do profissional. Depois do atendimento, pergunta ao dono (uma pergunta por vez, no número de avisos) ou manda o Pix; quem paga "por mês" ganha o Pix no dia do recibo; o comprovante é lido só de quem tem Pix em aberto; confirmado, sai o recibo ou a NFS-e **só dos atendimentos daquele pagamento**, e sem CPF a MAISA pede ao cliente uma vez. Tudo sai pela fila de envios. O que vem depois da decisão roda como rotina (contexto de sistema). A rotina cobra cada atendimento uma vez (o "não cobrar" vale de vez) e um item que falha não para os outros. ★ A opção B, atrás de flag (`AbrirContaDeRecebimentos`, `ReceberAvisoDePagamento`): com a subconta do Asaas aprovada e o CPF na ficha, a cobrança sai como página de Pix, boleto e cartão, e o aviso de pagamento dá a baixa sozinho; sem CPF, a MAISA pede antes de cobrar. ⚠️ A sétima exceção ao `ContextoTenant` primeiro | `RepositorioRecebimentos`, `LeitorDeComprovanteDePagamento`, `FilaDeEnvios`, `RepositorioHistorico`, `RepositorioNegocio`, `RepositorioFiscal`, `RepositorioCanal`, `EmitirRecibo`, `EmitirNota`, `ProvedorDeRecebimentos` (opcional) |
| `assistente.ts` | ⚠️ As chaves aceitas em `cfg` saem de um `Record<ChaveCfg, true>` desde 01/10/2026: a lista à mão parou nas sete primeiras, e o PATCH de `avisarRecibo` voltava "Ajuste desconhecido" (o interruptor "Avisar os pacientes" nunca gravou pela tela) | `RepositorioAssistente` |

### `conversas.ts` — o painel do outro lado da mesma thread

O agente fala com `RepositorioHistorico` direto: para ele, conversa é o telefone que acabou de
escrever. O painel pergunta outra coisa ("quem falou comigo, e com quem está a bola?"), e é
essa pergunta que mora aqui. Não existe "conversa do painel" e "conversa do agente" — é a mesma
linha em `mensagens_agente`.

Duas decisões que valem a leitura antes de mexer:

- **Responder ENVIA antes de GRAVAR.** Mensagem entregue e não gravada é ruído; mensagem
  gravada e não entregue é uma mentira que ninguém detecta — o dono segue a conversa achando
  que respondeu.
- **O destino nunca vem do corpo do request.** Quem responde manda a CHAVE da conversa (8
  dígitos, que não serve para enviar nada) e o servidor descobre o número na thread. É o que
  impede o painel de virar um jeito de mandar WhatsApp para qualquer número pela instância do
  dono.

## `agendar-atendimento.ts` — o arquivo mais importante do repositório

Toda esta lógica morava dentro de `app/api/atendimentos/route.ts` (na época, `/api/google/evento`). Enquanto morou lá,
"marcar um atendimento" só existia para quem falasse HTTP com um corpo JSON específico.

Ele faz, nesta ordem:

1. **Valida o pedido** — uuid de idempotência, data que existe de verdade
   (`2026-02-31` passa em regex e não é um dia), hora dentro do dia em passos de meia
   hora, duração entre 5 min e 8 h, data a menos de um ano daqui.
2. **Confere a allowlist** do inquilino — `agendaId` chega de fora, então nunca é
   escrita livre.
3. **Resolve serviço e cliente** — do catálogo, com o pedido tendo prioridade: serviço
   criado pelo usuário vive só no navegador dele.
4. **Pergunta antes de criar** (idempotência) — procura um evento com a mesma marca.
   Isso cobre o pedido que CHEGOU ao provedor, criou o evento e perdeu a resposta na
   volta. Sem isso, a tentativa seguinte cria um segundo atendimento às 14h para o mesmo
   cliente e nada explica de onde saiu o segundo.
5. **Cria** — monta título, descrição e as marcas que fazem o evento voltar da leitura
   como atendimento, e não como compromisso pessoal.

**Por que a validação está aqui e não na rota:** o agente de WhatsApp vai preencher
estes campos com o que um modelo de linguagem entendeu de uma frase solta. É exatamente
o tipo de entrada que precisa de guarda — e que não passaria por guarda nenhuma se ela
morasse no adaptador HTTP.

## Convenções

- **Fábrica, não classe.** `criarX(deps): X`. As dependências entram por parâmetro, o
  que torna teste sem rede trivial.
- **Marcar no passado é permitido.** Registrar às 15h o encaixe que entrou às 14h é uso
  normal de agenda. O que se recusa é o absurdo (1998, 2200).
- **Erro é `throw`, não valor de retorno.** Sempre um erro de
  [`dominio/erros.ts`](../dominio/erros.ts) — nunca um `Error` cru, porque quem chama
  precisa distinguir "dado ruim" de "reconecte" de "espere e tente de novo".
- **Nada de `console.log` de negócio.** Log é do adaptador, que sabe onde ele aparece.
