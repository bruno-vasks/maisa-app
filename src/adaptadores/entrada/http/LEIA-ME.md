# `entrada/http/` — o porteiro e o tradutor

Tudo que uma rota do Next precisa para virar uma chamada de caso de uso. As rotas em
[`src/app/api/`](../../../app/LEIA-ME.md) ficam finas porque estes três arquivos existem.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `contexto.ts` | Sessão do Supabase → `ContextoTenant`. É o **único** lugar do app onde um contexto de inquilino nasce a partir de HTTP. |
| `respostas.ts` | Erro de domínio → status HTTP + JSON, para as rotas de agenda. |
| `fiscal.ts` | Idem, para as rotas de nota fiscal, que têm formato de erro próprio. |
| `pedido-de-teste.ts` | O pedido de teste assinado (09/10/2026): `tenantId` + validade + HMAC derivado da service role. É o que deixa a equipe liberar o teste de OUTRO negócio sem que o id venha cru do request. |

## `contexto.ts` — as três portas

| Função | Quando usar | Se não passar |
|---|---|---|
| `exigirSessao()` | ação que precisa de login | 401 `nao_autenticado` / `login_necessario` |
| `exigirSessaoComGoogle()` | ação de agenda | 400 `nao_configurado` + lista do que falta, ou o 401 acima |
| `sessaoOuDemo()` | rotas fiscais | nunca barra: sem Supabase configurado devolve `TENANT_DEMO` |
| `exigirEquipe()` | `/api/teste/liberar` | 401, ou 403 `equipe_nao_configurada` / `fora_da_equipe` com o `usuarioId` de quem tentou. A lista é `MAISA_EQUIPE`, **ids e não e-mails**: com a confirmação de e-mail desligada, e-mail sem dono se cadastra por qualquer um |
| `contextoDoPedido()` | depois de `exigirEquipe()` | `null` para pedido torto, de outra chave ou vencido (30 dias). Devolve ator `sistema`, porque a escrita em `assinaturas` só passa com a service role |

Uso:

```ts
const porteiro = await exigirSessaoComGoogle();
if (barrou(porteiro)) return porteiro.barrado;
// daqui pra frente, porteiro.tenant existe
```

> **A regra que não se negocia:** `tenantId` vem do COOKIE, jamais da query string ou do
> corpo. Foi esse descuido — id de inquilino vindo por parâmetro, sem autenticar quem
> pedia — que abriu o pior furo da integração de onde este código veio: bastava conhecer
> o id da vítima para autorizar com a própria conta Google e passar a escrever na agenda
> dela.

**Atualizado em 14/08/2026:** a tabela de negócios existe, e o `select` prometido aqui é o
`tenantDoUsuario()` deste arquivo — ele lê `membros` e nada mais no app faz isso. Quando a
pessoa pertence a mais de um negócio, `membros.padrao` decide; o índice único parcial
`ux_membros_padrao` garante **no banco** que existe no máximo um padrão por pessoa, em vez de
confiar que a aplicação nunca grave dois.

Ou seja: `tenantId` já **não** é mais o id do usuário.

## `respostas.ts` — a tabela de tradução

| Erro do domínio | HTTP | `status` no JSON |
|---|---|---|
| `NaoConfigurado` | 400 | `nao_configurado` + `faltando[]` |
| `DadoInvalido` (campo `agendaId`) | 400 | `profissional_invalido` |
| `DadoInvalido` (campo `janela`) | 400 | `janela_invalida` |
| `DadoInvalido` (outros) | 400 | `payload_invalido` + `info` |
| `NaoEncontrado` | 400 | `payload_invalido` + `info` |
| `PrecisaReconectar` | 409 | `reconectar` — existe uma ação que resolve, e a tela oferece o botão |
| `LimiteDoProvedor` | 429 | `limite` — transitório; a tela espera e tenta sozinha |
| qualquer outro | 502 | `erro` + `info` |

⚠️ **Estes nomes de `status` são contrato** com `ui/estado/store.tsx` (`RESPOSTA_GOOGLE`
e o tratamento de `reconectar`/`limite`). Mudar um deles muda o comportamento da tela —
procure o nome no store antes.

## `fiscal.ts` — por que um tradutor separado

As rotas fiscais respondem `erros: [{ mensagem }]`, formato herdado da Focus e já
entranhado na tela de Faturamento. Um `info: string` no lugar da lista faria a tela
mostrar "undefined" em toda rejeição da prefeitura. E `config_incompleta` sai com
**HTTP 200**: não é falha de requisição, é o app dizendo ao dono quais variáveis fiscais
faltam.
