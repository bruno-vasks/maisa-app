# `nucleo/dominio/` — o que a MAISA é

Tipos e funções **puras**. Sem `fetch`, sem `process.env`, sem React, sem banco. Roda
igual no servidor, no navegador e dentro do futuro agente de WhatsApp.

Quase tudo aqui saiu do antigo `src/lib/data.ts`, que misturava três coisas: os tipos
do negócio, as regras de calendário e os dados de mentira. Os dados foram para
[`adaptadores/saida/demo`](../../adaptadores/saida/demo/LEIA-ME.md); o resto ficou aqui.

## Arquivos

| Arquivo | O que tem dentro | Por que importa |
|---|---|---|
| `tenant.ts` | `ContextoTenant`, `ContextoAgenda`, `Ator` | A costura multi‑inquilino. Todo caso de uso e toda porta de saída recebem isto. `ator` é o que vai distinguir "o Bruno marcou" de "a IA marcou". |
| `tempo.ts` | Data civil, hora decimal, semana/mês, `instanteISO`, `civilSP`, `HOJE` | O maior e o mais importante. É o único lugar que sabe que existe fuso horário. Antes metade dele morava dentro do adaptador do Google — lugar errado, porque a tela precisa da mesma conta antes de criar o evento. Desde 25/09/2026 também `rotuloDoMes(iso)` ("setembro de 2026") e `rotuloDaCompetencia(competencias, hoje)`: o mês que a tela diz, no lugar do `D.PERIODO` ("Junho de 2026" em setembro). |
| `agenda.ts` | `Agendamento`, `RascunhoAgendamento`, `EventoDeAgenda`, `AtendimentoMarcado`, `Etapa` + invariantes (`horaValida`, `duracaoValida`, `ehUuid`) + `valorDoRascunho` e `numeroDigitado` (o número que um brasileiro digita: "90,50", "1.250,00", "R$ 90") | O vocabulário da agenda. `AtendimentoMarcado` é o que se grava no evento externo para reconhecê‑lo na volta. |
| `expediente.ts` | `Expediente`, `atendeNoDia`, `podeComecarEm`, `fechado` | Quando o negócio abre, em dado estruturado — o número, não a frase. É o que o agente vai consultar antes de oferecer horário. |
| `catalogo.ts` | `Profissional`, `Servico`, `CategoriaServico`, `primeiroNome` | Quem atende e o que se vende. |
| `clientes.ts` | `Cliente`, `soDigitos`, `telefoneBonito`, `cpfValido`, `cpfMascarado`, `emailPlausivel` + os tetos (`NOME_CLIENTE_*`, `TELEFONE_MIN_DIGITOS`, `EMAIL_MAX`) | Quem é atendido. O `telefone` **é** a chave de identificação no WhatsApp (`telefone_chave`, os 8 últimos dígitos), e é por isso que os limites moram aqui: desde 24/08/2026 o dono edita cliente pela tela, e um telefone digitado errado faz a MAISA tratar cliente antigo como desconhecido. `cpfValido` confere o dígito verificador, não o tamanho — a lição do lote reprovado no e-CAC. |
| `contatos.ts` | `ModoDoNumero`, `Contato`, `podeResponder`, `chaveDe` | **Quem a MAISA atende.** O número pareado quase sempre é o celular pessoal do dono — sem esta regra ela oferece horário para o pai dele. Não é lista de permissão: lista de permissão ignora o cliente novo, que é quem traz dinheiro. |
| `negocio.ts` | `Negocio`, `Prestador` | O assinante visto por dentro. Genérico: o mesmo tipo serve terapeuta e barbeiro. |
| `fiscal.ts` | `Nota`, `StatusNota`, `Tomador`, `PedidoDeNota`, `ResultadoDeNota`, `ConfigFiscal`, `CadastroDoCnpj`, `caminhoDaNota`, `fiscalFaltando` | Os estados são NOSSOS, não da Focus — é o que permite trocar de emissor sem nenhuma tela perceber. **`caminhoDaNota` decide por onde o documento sai**, e são TRÊS: pessoa física vai para o recibo (`recibo-saude.ts`), MEI vai pelo Ambiente Nacional obrigatoriamente (desde 09/2023) e o Simples migra para lá em 01/11/2026 (`VIRADA_SIMPLES_NACIONAL`). Errar o caminho não dá erro — dá 202 "processando" e recusa da Receita minutos depois. |
| `recibo-saude.ts` | `EmissorDeRecibo`, `PagamentoRecebido`, `CODIGO_OCUPACAO`, `CAMPOS_DO_LOTE`, `montarLoteCsv` | **Não é nota fiscal.** Quem atende como pessoa física emite o Recibo Eletrônico de Serviços de Saúde no e-CAC — obrigatório desde 01/01/2025 (IN RFB 2.240/2024), multa de R$100/mês. Não há API: a automação é um CSV em lote. A unidade é o **pagamento**, não o cliente, porque o plano de saúde reembolsa pela data da sessão. |
| `checklist-recibo.ts` | `ItemDoChecklist`, `EstadoDoItem`, `checklistDoRecibo`, `faltaNoChecklist`, `partesDoChecklist`, `passosDaProcuracao`, `seAindaRecusar`, `NOME_DA_OCUPACAO`, `CONSELHO`, os `LINK_*` | **O que ainda impede o recibo de sair**, em português. Quatro estados, e o que dá o valor é o terceiro: `nao_da_para_saber` é o item do outro lado do muro (o cadastro dela no Carnê-Leão), que vira instrução e nunca selo verde — pintá-lo de pronto a faria descobrir o erro no e-CAC, sozinha. `com_a_gente` é o oposto: a bola é nossa, e por isso não conta como pendência dela. `partesDoChecklist` separa o que é campo nosso do que é tela da Receita — a tela desenha os dois de formas diferentes porque a natureza é diferente, e misturá-los foi o que deixou o Faturamento confuso em 25/08/2026. ★ **`faltaParaEmitirRecibo(config, hoje)`** (25/09/2026, 1A.13) é a regra única do que impede a MAISA de emitir: CPF, profissão, **registro no conselho** (a Rebots exige; a frase "não bloqueia" era do arquivo do e-CAC) e a autorização `vencida` ou `aguardando_aceite` (`quem: "nos"`). Sem procurador não bloqueia: decisão aberta para o Bruno. A tela Fiscal, o cartão de dados e o Documento fiscal leem dela. |
| `conversas.ts` | `Conversa`, `Msg`, `EstadoConversa`, `estadoDaConversa`, `ItemFila`, `Faq` | O WhatsApp de verdade. A identidade de uma conversa é o TELEFONE (não um id sorteado), e `estadoDaConversa` é a única definição de "quem está com a bola" no app. |
| `assistente.ts` | `Tom`, `Assistente`, `Dia`, `ChaveCfg`, `Toggle` | Os ajustes da MAISA. Deixa de ser tela de config e vira o PROMPT do agente — por isso é dado estruturado, não texto pronto. |
| `status-da-maisa.ts` | `StatusDaMaisa`, `statusDaMaisa` | **A MAISA está atendendo?** Uma resposta só, das duas leituras que ela exige: o interruptor (`assistente.ativa`) e o canal. `conferindo` enquanto alguma não voltou, `sem_whatsapp` vence o interruptor, e a leitura do canal que falhou conta como desconectado (o padrão seguro de `canal.ts`). Nasceu em 24/09/2026 porque a topbar dizia "no ar" com o WhatsApp caído. Os rótulos são da tela (`ui/componentes/StatusDaMaisa.tsx`), não daqui. |
| `suporte.ts` | `WHATSAPP_DA_MAISA` | O WhatsApp da MAISA, um número só para o "Falar com o suporte" do painel e para as LPs (`app/(marketing)/_lib/icp.ts` reexporta). Nasceu em 25/09/2026: o painel abria `wa.me/5511999999999`, que não é de ninguém. ⚠️ A LP estática de terapeutas redigita o número. |
| `caminho-de-volta.ts` | `caminhoDeVolta` | **Para onde voltar depois de sair do app**, saneado. Três linhas, mas mora aqui porque é a única camada que servidor (`/auth/callback`, `/api/google/*`) e navegador (`RecuperarSessaoDaUrl`, `BotaoGoogle`) alcançam sem exceção de arquitetura — nasceu em `saida/google/config.ts`, que carrega `client_secret` e por isso já tinha gerado uma segunda cópia da regra. O que ela impede: `//site-de-fora` é protocol-relative e o navegador obedece. |
| `erros.ts` | `DadoInvalido`, `NaoEncontrado`, `NaoConfigurado`, `PrecisaReconectar`, `LimiteDoProvedor`, `FalhaDoProvedor` | O núcleo não devolve 400; ele lança. Quem traduz para status é o adaptador de entrada. |
| `index.ts` | Barrel | Conveniência para quem precisa de vários tipos de uma vez. |

## Regras deste diretório

- **Nada de apresentação.** Cor, label de badge, texto de UI: é da tela. Um tipo daqui
  não conhece nem `--primary` nem "Confirmado".
- **Data civil, não `Date`.** `new Date("2026-08-06")` é meia‑noite UTC, que em São
  Paulo é dia 5 às 21h — o clássico erro de um dia. String ISO compara com `<`, serve
  de chave de Map e de `key` de React.
- **Função pura recebe o dado, não busca.** `podeComecarEm(expediente, …)` e não
  `podeComecar(profissionalId, …)`: quem sabe achar o expediente é o repositório.
