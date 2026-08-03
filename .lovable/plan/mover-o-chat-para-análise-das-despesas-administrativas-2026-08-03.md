# Mover o chat para "Análise das despesas administrativas"

Hoje o chat aparece no fim da tela **Despesas Administrativas** (`/desp-adm`). Ele passa a ficar somente na tela **Análise das despesas administrativas** (`/analise-despesas-adm`).

## O que muda

- Remover o bloco do chat da tela Despesas Administrativas (e o import correspondente).
- Inserir o mesmo chat no fim da tela Análise das despesas administrativas, antes do fechamento do layout.
- O chat continua recebendo o contexto do mês/ano selecionado naquela tela, agora usando o filtro de referência da própria tela de análise.
- Sugestões prontas ajustadas ao contexto analítico: total do mês de referência, comparação com o mês anterior, maiores contas contábeis, maiores centros de custo.
- Histórico continua salvo só neste navegador, com o mesmo botão "Nova conversa" — as conversas antigas seguem disponíveis.

## Detalhes técnicos

- `src/routes/_authenticated/desp-adm.tsx`: remover o `<ChatBalancete .../>` (linhas 617-625) e o import na linha 8.
- `src/routes/_authenticated/analise-despesas-adm.tsx`: importar `ChatBalancete` e renderizá-lo antes de `</AppLayout>`, passando `contexto` com `refAno`/`refMes` e a lista de `sugestoes`.
- Nenhuma mudança no backend (`src/routes/api/chat-balancete.ts`) nem no componente do chat.
