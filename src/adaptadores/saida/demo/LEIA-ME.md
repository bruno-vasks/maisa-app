# `saida/demo/` — o cadastro de mentira

Cumpre a porta `RepositorioNegocio` com fixtures em memória. É o antigo
`src/lib/data.ts`, separado do que era tipo (foi para
[`nucleo/dominio`](../../../nucleo/dominio/LEIA-ME.md)) e do que era dado (ficou aqui).

**⚠️ Esta é a peça que falta trocar para o app ser multi‑inquilino de verdade.**

## Arquivos

| Arquivo | O que tem |
|---|---|
| `index.ts` | O barrel. Reexporta os fixtures **e** o domínio inteiro — é o `import * as D` que a UI usa. |
| `repositorio.ts` | A implementação da porta: assíncrona, recebe `ContextoTenant` (e o ignora, porque existe um negócio só). As escritas (`salvarServico`, `salvarProfissional`, `atualizarCliente`, `garantirCliente`) **mutam os fixtures** de propósito: aqui o fixture É o banco, e sem isso o laboratório não exercitaria o caminho de edição. |
| `negocio.ts` | `NEGOCIO`, `PRESTADOR`, `PERIODO`, `NUMEROS_MES`, `FATURAS`. |
| `equipe.ts` | `EQUIPE`, `COLUNAS_AGENDA` (a allowlist), `EXPEDIENTE`, e os atalhos `atende`/`podeComecar`. |
| `catalogo.ts` | `SERVICOS`. |
| `clientes.ts` | `CLIENTES`, `NOTAS_INICIAIS`, `PROXIMO_NUMERO`, `TESTE_CANCELA_APOS_MS`. |
| `notas.ts` | `notasDemo`. Existe para a CLAIM ser exercitável sem banco: a lista de pendentes encolhe de verdade no `abrir`, então o duplo clique recebe `null` no `/laboratorio` igual à produção. |
| `fiscal.ts` | `fiscalDemo`, `cadastroDemo`. Estado de partida: um **MEI com o CNPJ ligado e sem certificado** — que é exatamente o passo onde todo cliente real vai parar. Quem abre a tela sem conta na Focus vê a mesma tela que o cliente vê. |
| `contatos.ts` | `contatosDemo`, `contatosDoCanalDemo`, `limparContatosDemo`. O caderno de partida tem **Pai** e **Mãe** não marcados como cliente: é o estado em que o guardrail realmente cala alguém, e é o que faz o comportamento ser verificável no `/laboratorio` sem configurar nada. |
| `guarda-de-comprovante.ts` | `guardaDeComprovanteDemo`, `falharNaProximaGuardaDemo()`, `limparGuardaDemo()`. Não baixa nada — guarda a URL num mapa e devolve um caminho fabricado, porque teste que depende de rede não roda no CI. O `falharNaProxima` existe porque **o caminho de falha é o que importa** neste port: a cópia do PDF pode não acontecer, e o recibo tem que fechar de qualquer jeito. |
| `conversas.ts` | Só `FAQS`. As conversas de demonstração (`CONVERSAS`, `THREADS`, `SUGESTOES`, `FILA_CONVERSAS`) **saíram**: a tela lê `GET /api/conversas`, que lê a mesma tabela que o agente escreve. Conversa inventada ao lado de conversa real faria o dono responder a quem não existe. |
| `assistente.ts` | `DIAS_PADRAO`, `CFG_PADRAO`, `TOGGLES_*`. `PREVIEWS` e `SECOES_AJUSTE` saíram em 25/09/2026 (1C.11 e 1C.12): o preview dos Ajustes é derivado do dado e os recortes moram em `ui/telas/ajustes.ts`. ⚠️ `TOGGLES_AGENDAMENTO` não tem mais "Confirmar no WhatsApp" (25/09/2026, 1A.9): a chave `confirmar` não tem consumidor, e a MAISA confirma sempre. A chave segue em `CFG_PADRAO` e no banco. |
| `agenda-de-recibos.ts` | `agendaDeRecibosDemo`: ninguém tem dia de recibo (01/10/2026). Lista vazia de propósito, como `lembretes.ts`: um paciente de fixture com dia faria a rotina pedir recibo ao canal num ambiente sem banco |
| `consultas.ts` | Buscas por id (`profissional`, `servico`, `cliente`) — síncronas, só para a UI. `conversa` saiu: conversa vem do servidor, não de um array de módulo. |

## Duas portas de entrada para o mesmo dado, e a diferença é o ponto

| Quem | Como acessa | Por quê |
|---|---|---|
| O núcleo | `repositorioDemo` (async, com tenant) | Vai trocar de implementação. Nunca deve saber que existe um array. |
| A UI | `import * as D from "@/adaptadores/saida/demo"` (sync, sem tenant) | Dívida conhecida: as telas ainda leem fixture direto em vez de passar por um caso de uso. |

O caminho longo do import da UI é **proposital**: ele denuncia a dívida em toda tela que
a tem. Quando o store passar a conversar com o núcleo, esse import some sozinho.

## Quando isto virar banco

O que muda em `repositorio.ts`:

- tabelas `negocios`, `membros`, `profissionais`, `servicos`, `clientes`, todas com
  `tenant_id` e RLS por membro do negócio;
- `agendasPermitidas` vira `select id from profissionais where tenant_id = …` e deixa de
  ser constante no código;
- `clientePorTelefone` ganha índice — é a busca quente do agente de WhatsApp (é como ele
  vai reconhecer quem está falando antes de mexer na agenda).

E em `composicao.ts`, uma linha: `const negocio = repositorioSupabase`.

## Detalhes dos fixtures que não são acidente

- **Um profissional só.** Os atendimentos do `pr1` são a agenda de verdade deste fixture;
  três colegas fictícios mostrariam horários que não existem em lugar nenhum.
- **`atendimentos.ts` carrega a constraint de exclusão da migração 027** — sobreposição por
  intervalo, em memória. Sem ela o `/laboratorio` aceitaria marcar em cima e o defeito só
  apareceria contra o Postgres, que é o oposto do que este diretório existe para fazer.
- **`cl-teste` com CPF real.** A NFS‑e só autoriza em produção, então validar a
  integração exige emitir uma nota de verdade — e ela se cancela sozinha em 25 s.
- **Todos os e‑mails apontam para o dono do projeto.** Já apontaram para `@email.com`,
  que é um domínio REAL: o convite do Google ia para a caixa de estranhos.
