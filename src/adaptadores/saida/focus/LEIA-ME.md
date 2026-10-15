# `saida/focus/` — Focus NFe

Cumpre `EmissorFiscal` e `CadastroDeEmissor`. **⚠️ Só servidor** — nenhum token chega ao
navegador.

## ⚠️ DOIS CAMINHOS DE EMISSÃO, E O DO ICP É O NACIONAL

> "Para MEI a emissão via Ambiente Nacional é obrigatória, independente do município, desde
> setembro de 2023." — guia dos municípios da NFS-e Nacional, Focus NFe

O ICP da MAISA (barbeiro, terapeuta autônomo) é quase todo **MEI**. Até 17/08/2026 este
adaptador mandava todo mundo pelo caminho municipal — o errado para a maioria.

| Quem | Caminho | Endpoint | Cliente |
|---|---|---|---|
| MEI | Ambiente Nacional (DPS) | `/v2/nfsen` | `nfsen.ts` |
| ME/EPP, regime normal | NFS-e da prefeitura | `/v2/nfse` | `focus.ts` |

**O modo de falha de errar o caminho é traiçoeiro:** a Focus aceita, devolve 202
`processando`, e a recusa chega minutos depois no `GET`. Quem olha a tela vê "processando" e
conclui que está lento. Quem decide é `nucleo/dominio/fiscal.caminhoDaNota`, e tem teste.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `emissor-focus.ts` | **A fachada.** Implementa `EmissorFiscal`, **bifurca entre os dois caminhos** e traduz o vocabulário para o nosso: `"processando_autorizacao"` → `"processando"`, `"erro_autorizacao"` → `"erro"`. |
| `conta.ts` | O que se faz com o token da **CONTA**: consultar CNPJ, criar empresa, subir certificado, pegar o token da empresa. ⚠️ URL **sempre produção** — a API de Empresas não existe em homologação. |
| `cadastro-focus.ts` | Casca fina de `conta.ts` cumprindo `CadastroDeEmissor`. ⚠️ **Não reexporta `tokenDaEmpresa`** — ver abaixo. |
| `prestador.ts` | O tipo `Prestador` (quem emite, por inquilino) e os helpers comuns aos dois clientes. |
| `nfsen.ts` | Cliente do **DPS nacional** (`/v2/nfsen`). O caminho do MEI. |
| `focus.ts` | Cliente da **NFS-e municipal** (`/v2/nfse`). Recebe o prestador como argumento — não lê mais env. |
| `nota-simulada.ts` | O documento da nota **simulada em homologação** (15/10/2026): número, PDF escrito à mão e o link assinado (`/api/nf/pdf/[ref]?a=`). Ver abaixo. |
| `config.ts` | Só o que é da conta: `FOCUS_NFE_TOKEN` e o ambiente padrão. Os dados do prestador saíram daqui em 17/08/2026 — ver abaixo. |

## A simulada em homologação tem número e PDF (15/10/2026)

Sem `FOCUS_NFE_TOKEN`, a nota em **homologação** sai `simulado` com número (seis dígitos, crescente
no tempo) e um link de PDF gerado por nós — o mesmo par que a Focus devolve. Pedido do Bruno para a
conta demo do marketing, com a Focus desligada por não haver cliente emitindo nota.

- **Em produção sem token, nada mudou:** sai sem documento. PDF com cara de nota num negócio que
  acha que está faturando de verdade é o erro que não se desfaz.
- **O link é uma capacidade.** Quem baixa é a Evolution, sem sessão: o `?a=` é um HMAC da `ref` com
  a `SUPABASE_SERVICE_ROLE_KEY` (rótulo `maisa-nf-pdf-v1:`), e a rota acha o inquilino pela nota.
  Sem `MAISA_PUBLIC_URL` não há link, e a nota sai sem PDF, como antes.
- **O PDF é escrito à mão** (Helvetica + WinAnsi, uma página): uma dependência de PDF para isto
  pesaria no bundle de todas as rotas. O CPF do tomador sai mascarado — o documento circula por
  WhatsApp.
- **A consulta da simulada não apaga o número:** `criarConsultarNota` mantém o que está no banco.

## ⚠️ Nem o token de emissão nem o certificado ficam com a gente

- **O token da empresa** é pedido a `GET /v2/empresas/{id}` (com o token da conta) no instante
  da emissão, e descartado. Guardar seria duplicar um segredo que já tem dono, e herdar de
  graça a chave de criptografia, a rotação e o vazamento. Por isso `tokenDaEmpresa` fica em
  `conta.ts` e **não sobe para a porta**: se subisse, a credencial de um cliente viraria valor
  de retorno dentro do núcleo, e o primeiro `console.log` de depuração a imprimiria.
- **O `.pfx` do certificado** entra no `PUT /api/fiscal`, é repassado e some. Um e-CNPJ assina
  contrato e abre o e-CAC da empresa: é a identidade jurídica do cliente, não credencial de
  API. Do certificado fica só `certificado_valido_ate`.

## O prestador saiu do env (17/08/2026)

`config.ts` tinha `NF_PRESTADOR_CNPJ`, `NF_PRESTADOR_IM`, `NF_CODIGO_MUNICIPIO` e
`NF_ITEM_LISTA_SERVICO`. Variável de ambiente é **global**: com ela o app inteiro sabia emitir
nota de UM CNPJ — e isso não é limitação de escala, é limitação de um. Agora vem de
`config_fiscal`, por inquilino, e o emissor recebe como argumento.

## Os três modos

| Situação | Resultado | Por quê |
|---|---|---|
| sem `FOCUS_NFE_TOKEN` | `simulado` | O fluxo inteiro roda — inclusive o polling — sem emitir nada. É como se testa localmente. |
| token, mas faltando dado do inquilino | lança `NaoConfigurado` → `config_incompleta` com a lista | Não arrisca emitir errado. As frases são as MESMAS que a tela mostra (`fiscalFaltando`), para o erro da API e o aviso da tela não contarem histórias diferentes. |
| tudo pronto | emissão real | Ambiente conforme `config_fiscal.ambiente` do inquilino (padrão: homologação). |

## Coisas da vida real que estão codificadas aqui

- **`clean()` na config.** A Vercel guarda o valor cru da variável, e é comum colar com
  aspas (`"producao"`) ou espaço. Sem limpar, a comparação falha e o texto inválido vai
  para a prefeitura.
- **`agoraSP()` na data de emissão.** `toISOString()` seria UTC e, depois das 21h em São
  Paulo, já estaria no dia seguinte — a prefeitura rejeita "emissão superior à data de
  hoje". (A conta mora em `nucleo/dominio/tempo.ts`, um lugar só.)
- **Emissão é assíncrona.** A prefeitura devolve "processando" e o número sai depois.
  Por isso são três casos de uso e não um: quem pede acompanha por `consultar`.
- **A rejeição fiscal chega no STATUS, não na emissão.** "Código de Serviço inexistente"
  aparece no polling. É por isso que o log de erro está no `consultar`.
- **CPF de teste precisa ser real.** A prefeitura valida a existência do documento;
  CPF inventado é rejeitado antes de a integração ser exercitada.
- **`criarEmpresa` não é idempotente, e a Focus não deduplica por CNPJ.** Duplo clique ou
  retry depois de timeout cria uma segunda empresa **cobrada**, que só se resolve à mão no
  painel dela. Por isso `criarLigarNotaFiscal` grava o `empresaId` imediatamente e devolve
  sem criar quando ele já existe — com teste.
- **`habilita_nfse` e `habilita_nfsen_producao` são excludentes**, e a Focus aceita a
  combinação inválida sem reclamar. Empresa nasce com produção DESLIGADA: virar é decisão
  deliberada depois de uma emissão de teste que deu certo.
- **`codigo_ibge` ≠ `codigo_municipio`** na resposta de CNPJ. O primeiro tem 7 dígitos e é o
  que a nota quer; o segundo é o código do município na tabela da Focus. Pegar o errado faz a
  prefeitura recusar com "município inválido", que não aponta para cá.
- **No caminho nacional todas as cidades aderentes aceitam cancelamento.** No municipal,
  algumas prefeituras não cancelam por webservice — a nota só se cancela no portal da cidade.
