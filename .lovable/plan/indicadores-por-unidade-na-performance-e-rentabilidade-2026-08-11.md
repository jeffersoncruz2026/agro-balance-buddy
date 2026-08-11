# Indicadores por unidade na Performance e Rentabilidade

## O que está acontecendo

A base tem quantidade sim: das 1.254 linhas de receita (contas 3.1.*), 1.236 têm QUANTIDADE preenchida. O problema é que elas estão em **unidades diferentes**: KG (22.375.860,5), CB (12.231), TON (65.306,2), UN (786) e 20 linhas sem unidade.

Hoje o sistema só calcula preço médio, CPV/un e margem/un quando existe **uma única** unidade no recorte — somar KG com TON não faz sentido. Como o filtro "Unidade" vem em "Todos", ele encontra 4 unidades e desliga os indicadores, exibindo aquele aviso.

## Como corrigir

1. **Unidade de referência automática**: quando o filtro estiver em "Todos" e houver mais de uma unidade, o sistema escolhe sozinho a unidade com maior receita no recorte (hoje, KG) e calcula preço médio, CPV/un e margem/un **apenas sobre as linhas dessa unidade** — receita, CPV e margem daquela unidade divididos pela quantidade dela.
2. **Rótulo explícito**: os cards, a tabela e o gráfico de preço médio passam a mostrar a unidade usada (ex.: "Preço médio (KG)"), com uma nota curta de que os indicadores unitários se referem àquela unidade.
3. **Troca manual**: continua sendo possível escolher outra unidade no filtro "Unidade"; nesse caso os indicadores usam a unidade escolhida.
4. **Aviso só quando fizer sentido**: a mensagem atual passa a aparecer apenas quando realmente não existir quantidade no recorte.
5. **Comparativo com a safra anterior** usa a mesma unidade de referência, para as variações continuarem comparáveis.

Nenhum valor de receita, CPV, deduções ou margem total muda — só os indicadores por unidade deixam de ficar em branco.

## Detalhes técnicos

- `src/lib/performance.ts`: `agregar` passa a aceitar uma unidade de referência opcional; quando não informada, escolhe a de maior receita entre as linhas com quantidade. Métricas unitárias somam receita/CPV/margem apenas das linhas dessa `codund`, e `unidade` retorna a unidade usada. `quantidadePorUnidade` continua exposto para o detalhamento.
- `src/routes/_authenticated/performance-rentabilidade.tsx`: calcula a unidade de referência uma vez no recorte atual e repassa para todas as chamadas de `agregar` (total, atividades, drill-down, série mensal, safra anterior), atualiza rótulos e substitui a condição do alerta.
