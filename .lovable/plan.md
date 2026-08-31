# Ordenação decrescente nos drill-downs de valor

Ajustar as telas de **Análise de Despesas Administrativas**, **Balancete Gerencial** e **BP/DRE Contábil** para que, ao clicar em um valor e abrir o detalhe/drill-down, os lançamentos/contas apareçam **do maior para o menor valor**.

## 1. Análise de Despesas Administrativas
- Arquivo: `src/routes/_authenticated/analise-despesas-adm.tsx`.
- O modal `DrilldownModal` recebe os lançamentos do RPC `desp_adm_lancamentos`.
- Ordenar as linhas por `|vlcusto|` decrescente antes de renderizar a tabela.

## 2. Balancete Gerencial
- Arquivo: `src/routes/_authenticated/balancete-gerencial.tsx`.
- O Dialog de detalhe exibe os lançamentos do RPC `balancete_detalhe_periodo`.
- Ordenar as linhas por `|vlcusto|` decrescente antes de renderizar.

## 3. BP e DRE Contábil
- Arquivo: `src/routes/_authenticated/bp-dre.tsx`.
- O Dialog de detalhe exibe as contas do RPC `bp_dre_lancamentos_detalhe`.
- Ordenar as linhas por `|saldo_atual|` decrescente antes de renderizar.

## 4. Validação
- Verificar no preview se, ao clicar em valores nas três telas, o modal de detalhamento lista os itens iniciando pelo maior valor absoluto.

Não serão alteradas tabelas, RPCs ou regras de cálculo — apenas a ordenação de exibição no cliente.