# `avaliacao/suporte/`: o ensaio da conta oficial

A conta oficial da maisa (o suporte, (11) 92749-1903) é uma cliente comum do app: a própria
maisa atende quem quer conhecer o produto ou está ativando a conta. Este ensaio mede se quem
fala com ela entende com quem está falando e sai com a dúvida resolvida. Nasceu em 17/11/2026,
depois que um lead achou que o número era a maisa da barbearia dele e pediu o "valor do corte".

| Arquivo | O que faz |
|---|---|
| `dados.ts` | a conta oficial como negócio de teste, em duas variantes (`antes` = o banco em 17/11; `depois` = o que foi aplicado), as boas-vindas do n8n e a referência de fatos do juiz |
| `faqs-antes.ts` | as 32 respostas prontas de 17/11, copiadas do banco |
| `cenarios.ts` | oito pessoas; as quatro primeiras são conversas reais do número oficial |
| `cliente.ts` | o lead simulado. Diferente de `../cliente.ts`, não recebe o nome do negócio: o que ele entende sai só da tela |
| `juiz.ts` | quatro critérios (fica claro com quem fala, resolveu, o Bruno apresentado, soa como gente), com o relógio do cenário |
| `conversa.ts` · `rodar.ts` | uma conversa por processo, com as boas-vindas gravadas antes da primeira mensagem, como o n8n faz |
| `leitura.ts` | leitores simulados dizendo o que entenderam das boas-vindas, e um classificador que não sabe a variante |
| `rejulgar.ts` | julga de novo conversas gravadas, sem rodá-las |
| `relogio-lento.ts` | o relógio do cenário, 5 vezes mais lento: a linha de comando do Claude estourava o orçamento de 50 s do turno |

```sh
npx vite-node -c vitest.config.ts avaliacao/suporte/rodar.ts -- --paralelo 4 --repeticoes 2
npx vite-node -c vitest.config.ts avaliacao/suporte/leitura.ts -- --variantes depois --repeticoes 2 --saida avaliacao/resultados/leitura.json
```

A busca nas respostas prontas usa o embedding do Gemini da chave do `.env.local`, que é a de
produção: `rodar.ts` põe teto (`--teto`, padrão 250 chamadas por rodada). O resto roda pelo
Claude Code logado nesta máquina (ver `../LEIA-ME.md`).

O que mudou por causa dele: as boas-vindas do n8n (`06 System/(C) n8n boas-vindas/`), o cadastro
e as respostas prontas da conta oficial, e a trava do `chamar_humano` (consultar as respostas
prontas antes de desistir, em `entrada/whatsapp/ferramentas.ts`). Resultado da rodada de 17/11:
https://claude.ai/artifact/QqEKR89QgKCDDCBz17koKb
