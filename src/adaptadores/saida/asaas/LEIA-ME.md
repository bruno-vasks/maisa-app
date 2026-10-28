# `saida/asaas/` — receber pelo Asaas, sem o profissional ver o Asaas

A opção B dos recebimentos (27/10/2026, pedido do Bruno vindo do Smiller), **atrás de flag**. A
conta Asaas da **plataforma** abre uma subconta no CPF ou CNPJ do profissional; a cobrança do
atendimento vira uma página com Pix, boleto e cartão; o aviso de pagamento dá a baixa sozinho, e
daí sai o recibo ou a nota, como na opção A. A opção A (o Pix estático na chave do profissional,
com o comprovante conferido por ele) continua sendo o caminho de quem não ativou isto.

⚠️ **Não é a assinatura** (`saida/abacatepay`, `saida/stripe`): lá o negócio paga a MAISA. Aqui o
dinheiro cai na subconta, que é do profissional.

## Arquivos

| Arquivo | O que é |
|---|---|
| `cliente.ts` | O cliente HTTP do Asaas, **reaproveitado do Smiller** (`_shared/cobranca/asaas.ts`): só `fetch`, a conta passada em cada chamada. Ficaram de fora o "validar chave própria" e o "alterar cobrança": na MAISA a conta é sempre a subconta que a plataforma abre |
| `recebimentos-asaas.ts` | Cumpre `ProvedorDeRecebimentos`. Acha a chave da subconta no cofre (`CofreDeRecebimentos`, que `composicao.ts` entrega: este arquivo não importa o banco), sorteia o token do aviso e guarda só o hash (`hashDoToken`) |
| `config.ts` | A flag e a conta da plataforma, de variável de ambiente. Lista abaixo |
| `asaas-falso.ts` | Um `fetch` com estado que responde como a API v3, par do `asaas-falso.mjs` do Smiller. **Só os testes importam** |
| `cliente.test.ts` · `recebimentos-asaas.test.ts` | O contrato HTTP (os casos do Smiller, passados para o vitest) e o adaptador contra o Asaas falso |

O fluxo de ponta a ponta (rotina → cobrança pelo Asaas → aviso → recibo, e o CPF pedido antes de
cobrar) é testado em `saida/demo/recebimentos.test.ts`, com este adaptador de verdade.

## Ligar

Só quando o acordo com o Asaas existir (ver "O que ainda não está garantido"). Sem a flag, o
provedor é o demo desligado (`saida/demo/provedor-de-recebimentos.ts`): a tela não oferece nada, e
tudo segue pela opção A.

| Variável | Para quê |
|---|---|
| `RECEBIMENTOS_ASAAS` | `1` liga |
| `ASAAS_PLATAFORMA_CHAVE` | chave da conta da plataforma. **Precisa ser conta de CNPJ**: pessoa física não cria subconta |
| `ASAAS_PLATAFORMA_AMBIENTE` | `sandbox` (padrão) ou `producao`; vale para as subcontas novas. O sandbox é outra conta, com outra chave |
| `ASAAS_PLATAFORMA_WALLET_ID` · `ASAAS_PLATAFORMA_TAXA_FIXA` · `ASAAS_PLATAFORMA_TAXA_PERCENTUAL` | a taxa da plataforma por cobrança, por split (opcional). Taxa fixa maior ou igual ao valor da cobrança fica de fora, senão o Asaas recusa a cobrança inteira |
| `ASAAS_URL_DO_AVISO` | onde o Asaas avisa os pagamentos: `https://<deploy>/api/recebimentos/asaas` |
| `ASAAS_EMAIL_DO_AVISO` | para onde o Asaas escreve quando o aviso falha |

E rodar `supabase/039_recebimentos_asaas.sql` (a tabela das subcontas e o cofre no Vault).

## O que foi aprendido no Smiller e vale aqui

- **A chave da subconta só vem na resposta da criação.** Vai para o cofre antes de qualquer outra
  chamada; se o cadastro do aviso falhar depois, a conta fica salva e a conferência seguinte
  (a tela confere a cada leitura) cadastra de novo, com token novo.
- **Sem `ASAAS_URL_DO_AVISO`, a opção B não liga**: a cobrança sairia e o pagamento nunca seria
  confirmado.
- **A cobrança que não vale mais sai do ar.** Paga por outro caminho (comprovante, "já pagou") ou
  "não cobrar": o link é cancelado no Asaas. Se o cliente pagar mesmo assim, o dono é avisado.
- **Asaas fora na hora de emitir**: vai o Pix estático, e o cliente não fica sem cobrança.
- **Sem o acordo BaaS a chave pode não vir.** `abrirConta` falha dizendo isso, com o id da conta
  criada, em vez de fingir que deu certo.
- **A fila de avisos do Asaas é sequencial.** A rota responde 200 para tudo que é decisão nossa e
  erro só para falha de infraestrutura, senão a fila da conta para.
- **Reconectar muda o token.** `registrarAviso` apaga o aviso antigo da mesma URL antes do novo.
- **Notificação do Asaas desligada.** Quem avisa o cliente é a MAISA, pelo WhatsApp.
- **Documento é obrigatório na cobrança.** Sem o CPF na ficha, a MAISA pede ao cliente uma vez e
  a cobrança espera (Bruno, 27/10/2026); o dono pode mandar o Pix estático pelo botão.
- **Os documentos pendentes só aparecem uns 15 s depois da criação.** A tela confere de novo a
  cada leitura, enquanto a conta não é aprovada.

## O que ainda não está garantido

Do Smiller (`wt-pix/docs/financeiro.md`, seção 4b), e por isso a flag:

- fora do período de avaliação (60 dias, até 10 subcontas), a chave da subconta só vem com o
  modelo **BaaS** habilitado, que é acordo comercial com o Asaas;
- se o split para a carteira da conta-pai é aceito, e quem paga a tarifa;
- como o profissional **saca** para o banco dele. No BaaS ele não entra no Asaas, e a tela de saque
  não existe.

**Não testado contra o Asaas de verdade**: falta o BaaS habilitado no sandbox.
