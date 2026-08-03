# Correção do total de DESP. ADM (contas 3.4.01.*)

## Diagnóstico (confirmado)

Os dados no banco estão corretos: em junho/2026 a soma das contas iniciadas em `3.4.01` é **R$ 1.566.138,49** (1.556 lançamentos), e a função `desp_adm_serie` também devolve exatamente esse valor para o mês.

O problema está na leitura pelo aplicativo: a função devolve **1.378 linhas agregadas** para os 13 meses de histórico, mas a API de dados corta a resposta em **1.000 linhas por padrão**. As telas "Despesas Administrativas" e "Análise de Despesas Administrativas" somam apenas o que chegou, resultando no valor truncado de R$ 714.555,33.

## Correção

Buscar a série completa em páginas de 1.000 linhas até acabar (paginação), em vez de uma única chamada, nas duas telas:

- `src/routes/_authenticated/desp-adm.tsx`
- `src/routes/_authenticated/analise-despesas-adm.tsx`

Extrair essa busca paginada para uma função utilitária compartilhada, usada pelas duas telas, para não duplicar a lógica.

## Detalhes técnicos

- Criar `fetchDespAdmSerie(refAno, refMes, meses)` em um módulo compartilhado (ex.: `src/lib/desp-adm.ts`) que chama `supabase.rpc("desp_adm_serie", ...)` com `.range(offset, offset + 999)` em laço, acumulando as linhas até uma página voltar com menos de 1.000 registros.
- Substituir as chamadas diretas de `supabase.rpc("desp_adm_serie", ...)` nos `useQuery` das duas rotas por essa função.
- Verificar em seguida se o total exibido para junho/2026 bate com R$ 1.566.138,49.
