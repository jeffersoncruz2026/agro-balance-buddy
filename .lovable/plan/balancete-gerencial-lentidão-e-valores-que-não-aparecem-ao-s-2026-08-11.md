# Balancete gerencial: lentidão e valores que não aparecem ao selecionar vários meses

## Diagnóstico (medido no banco)

- Cada chamada da função `balancete(mes, ano)` leva ~2,5 segundos, mesmo com apenas 11,6 mil lançamentos.
- Quase todo esse tempo (2,42 s dos 2,53 s) vem da busca da linha de negócio no De/Para de produtos: para cada lançamento do mês o banco varre a tabela inteira de produtos (1.638 registros), porque a comparação usa `upper(btrim(produto))` e não existe índice para essa forma de comparação. O mesmo padrão existe no De/Para de rubricas (`custo_map`) e no filtro por mês/ano, que hoje ignora o índice de data.
- A tela dispara **uma chamada por mês selecionado**, em paralelo. Com a safra inteira são 12 chamadas simultâneas de 2,5 s cada, que competem entre si no banco: daí a demora e, quando alguma chamada estoura o tempo limite, a consulta inteira falha e a tabela fica sem os valores somados.
- O mesmo acontece no drill-down (`balancete_detalhe`), que também é chamado uma vez por mês.

## Correção

1. **Índices no banco** para eliminar as varreduras repetidas:
   - índice de expressão em `produto_map(upper(btrim(produto)))`;
   - índice de expressão em `custo_map(upper(btrim(nomecusto)))`;
   - filtro por data passa a usar intervalo (`data >= inicio and data < fim`) dentro das funções, aproveitando o índice existente de `data`.
2. **Uma única chamada para todos os meses**: novas versões das funções que recebem a lista de meses e a safra de uma vez (`balancete_periodo` e `balancete_detalhe_periodo`), já retornando os valores somados do período, em vez de 12 chamadas separadas.
3. **Tela**: passar a usar essas funções, mantendo os dados anteriores visíveis enquanto o novo período carrega (sem “piscar”) e exibindo uma mensagem clara de erro caso a consulta falhe, em vez de tabela vazia.

Nada muda nas regras de cálculo (rateios, ajustes, safra abril–março): apenas a forma de buscar os dados.

## Detalhes técnicos

- Migração: `CREATE INDEX` das expressões acima + `CREATE OR REPLACE FUNCTION public.balancete_periodo(p_meses int[], p_safra int)` e `public.balancete_detalhe_periodo(p_meses int[], p_safra int, p_safra_linha int, p_linha text, p_categoria text)`, reaproveitando integralmente a lógica atual de classificação (`conta_map`, `produto_map`, `custo_map`, regras ADM/VENDAS) e agregando por safra/linha/categoria/regra. As funções antigas permanecem para não quebrar outras telas.
- `src/routes/_authenticated/balancete-gerencial.tsx`: substituir o `Promise.all` sobre `mesesSel` por uma chamada única em `agg` e outra em `detalheQ`; adicionar `placeholderData: (prev) => prev` nas duas queries e um bloco de erro visível quando `agg.isError`.
- Validar depois: safra inteira 2026/2027 deve carregar em poucos segundos e o total consolidado deve aparecer sempre.
