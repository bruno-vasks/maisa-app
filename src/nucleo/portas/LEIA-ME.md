# `nucleo/portas/` — os contratos

Uma porta é uma **interface** declarada pelo núcleo. Ela diz o que precisa acontecer,
nunca como. Quem cumpre é um adaptador; quem escolhe qual adaptador é
[`src/composicao.ts`](../../composicao.ts).

```
                 ENTRADA                                  SAÍDA
   quem CHAMA o app  ──▶ [ porta ] ──▶ núcleo ──▶ [ porta ] ──▶ o que o app CHAMA
   HTTP, WhatsApp, cron                            Google, Focus, Supabase, fixtures
```

## `entrada/` — o que se pode pedir ao app

| Arquivo | O que declara |
|---|---|
| `casos-de-uso.ts` | A lista COMPLETA de ações do produto: `AgendarAtendimento`, `CancelarAtendimento`, `LerAgenda`, `ListarConexoes`, `DesconectarAgenda`, `EmitirNota`, `ConsultarNota`, `CancelarNota` — com os tipos de entrada e saída de cada uma. |

**Leia este arquivo como o cardápio do app.** É literalmente a lista de ferramentas que
o agente de WhatsApp vai receber: cada caso de uso vira uma tool, com a mesma entrada e
a mesma saída. Por isso as entradas são objetos planos e serializáveis, e não classes —
um modelo de linguagem precisa conseguir preencher isso em JSON.

## `saida/` — o que o app precisa do mundo

| Arquivo | O que declara | Quem cumpre hoje |
|---|---|---|
| `agenda-externa.ts` | `AgendaExterna` (listar, buscar por atendimento, criar, remarcar, cancelar) e `ConexoesDeAgenda` (listar conexão, desconectar) | `adaptadores/saida/google` |
| `emissor-fiscal.ts` | `EmissorFiscal` (emitir, consultar, cancelar — os três recebendo a `ConfigFiscal` do inquilino) | `adaptadores/saida/focus` |
| `cadastro-de-emissor.ts` | `CadastroDeEmissor` (consultar CNPJ, criar empresa, subir certificado). ⚠️ **Não tem método que devolva token** — de propósito: credencial de cliente não vira valor de retorno dentro do núcleo | `adaptadores/saida/focus` |
| `repositorio-fiscal.ts` | `RepositorioFiscal` (a `config_fiscal` do inquilino). ⚠️ Nunca guarda token nem `.pfx` | `adaptadores/saida/supabase` |
| `repositorio-notas.ts` | `RepositorioNotas` (o que falta emitir + a CLAIM atômica que impede nota duplicada). ⚠️ Não aceita `valor` em lugar nenhum — quem soma é o banco | `adaptadores/saida/supabase` |
| `repositorio-negocio.ts` | `RepositorioNegocio` (negócio, profissional, serviço, cliente, expediente, allowlist de agendas, cliente por telefone) | `adaptadores/saida/demo` ⚠️ fixtures |
| `agenda-de-recibos.ts` | `AgendaDeRecibos.comDia()`: quem tem dia de recibo automático, em **todos** os negócios (01/10/2026). ⚠️ Sem `ContextoTenant`, como a fila de lembretes: só três campos (negócio, pessoa, dia), só leitura, e a trava contra emitir duas vezes é a do pagamento, não desta porta | `adaptadores/saida/supabase` (service role) · `demo` (lista vazia) |
| `canal-mensagens.ts` | `CanalDeMensagens`: `enviar` (bolhas de texto), `escalar` e, desde 01/10/2026, `enviarDocumento` (um arquivo com legenda: o PDF do recibo) | `adaptadores/saida/evolution` · `demo` (log, sem o link) |
| `livro-de-recibos.ts` | `LivroDeRecibos`: a claim do recibo unitário. Desde 01/10/2026 `abrir` recebe `itens` (uma ou várias sessões, tudo ou nada) e `destinatario` devolve `sessoes` | `adaptadores/saida/supabase` · `demo` |

## Duas decisões que valem explicação

**Nenhuma porta recebe token.** Autenticar no provedor é problema do adaptador: ele
recebe o `ContextoAgenda` e resolve o token sozinho. Antes, o token era lido na rota e
passado adiante — o que obrigava toda rota nova a lembrar do passo, e esquecer era
silencioso.

**Toda porta de saída recebe `ContextoTenant`**, mesmo que o adaptador de demonstração
ignore. É a costura multi‑inquilino: quando o banco entrar, a assinatura já está certa e
não existe caso de uso lendo cadastro sem dizer de quem.
