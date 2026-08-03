# Leitura executiva por conta contábil

## Problema
A leitura executiva hoje aponta os drivers pelo **departamento** (`nomedepto`), que em Despesas Administrativas é quase sempre "ADMINISTRACAO". Resultado: frases sem informação, como "impulsionada principalmente por ADMINISTRACAO".

## O que muda
- Os drivers de alta e de queda passam a ser calculados pela **conta contábil** (ex.: `3.4.01.01.0020 - SALARIOS E ORDENADOS - APRENDIZES`), exibindo apenas o nome da conta na frase ("SALÁRIOS E ORDENADOS - APRENDIZES"), sem o código.
- Quando a mesma conta aparece em vários centros de custo, os valores são somados antes da comparação mês a mês.
- Se a conta com maior alta representar pouco (variação irrelevante) ou não houver conta comparável, a frase omite o trecho de driver em vez de citar algo genérico.
- A frase passa a citar as **duas maiores contas** de alta quando a segunda for relevante, dando mais consistência à leitura.
- O gráfico de ponte (composição da variação) passa a usar a mesma base de conta contábil, para a leitura e o gráfico contarem a mesma história.

Exemplo do texto final:
"As despesas administrativas somaram R$ 1.566.138,49 em Jun/26, alta de 97,6% sobre o mês anterior, impulsionada principalmente por RATEIO DESPESAS ADMINISTRATIVAS (+R$ 751.484,10) e SALÁRIOS E ORDENADOS (+R$ 120.300,00). No período, essas despesas representaram 2,4% da receita bruta."

## Detalhes técnicos
Arquivo: `src/routes/_authenticated/analise-despesas-adm.tsx`
- No `useMemo` de `analise`, trocar as chaves dos mapas `centrosAtual`/`centrosAnterior` de `r.nomedepto` para `r.contacontabil`, mantendo o cálculo de delta e o top N.
- Adicionar um helper para separar código e nome da conta (`"3.4.01.x - NOME"` → `NOME`), usado nos rótulos da ponte e na leitura executiva.
- Ajustar `leituraExecutiva` para usar os nomes de conta e incluir a segunda maior alta quando for ≥ 25% da maior.
- Nenhuma alteração de banco, RPC ou filtros existentes.
