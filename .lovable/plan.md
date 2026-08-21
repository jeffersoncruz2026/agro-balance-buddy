# Melhorias na Análise de Despesas Administrativas

Sugestões priorizadas para a tela `/analise-despesas-adm`. Cada bloco pode ser aprovado inteiro ou em partes.

## 1. Correções (rápidas, alto impacto)

- **Drill-down do gráfico de ponte está errado.** As barras da composição da variação são por **conta contábil**, mas o clique abre o detalhe filtrando por **centro de custo** (`nomedepto`), então quase sempre volta vazio ou errado. Corrigir para filtrar por conta contábil.
- **Rótulo do filtro.** O filtro chamado "Centro de custo" na verdade filtra por **departamento** (`nomedepto`), enquanto a tabela "Rubrica" usa `nomecusto`. Renomear para "Departamento" e, opcionalmente, adicionar um segundo filtro por centro de custo real.
- **Sinal da variação.** Hoje "alta = vermelho / queda = verde" está aplicado, mas o texto executivo escreve "alta"/"queda" sem tratar o caso de variação ~0% ou mês anterior sem dados (mostra 0% e a frase fica sem sentido). Tratar esses casos.

## 2. Acumulado da safra e tendência

- Cartão adicional: **acumulado da safra (abr–mar) até o mês** vs. mesma janela da safra anterior.
- Na Evolução, incluir **média móvel de 3 meses** e uma linha de **média do período**, para separar sazonalidade de tendência real.
- Marcar visualmente meses fora da faixa (± limite configurável) em vez de só o alerta textual do mês atual.

## 3. Tabelas mais analíticas

- Nas tabelas "Conta Contábil" e "Rubrica", acrescentar colunas: **% do total**, **mês anterior** e **variação (R$ e %)**, com destaque para as maiores altas.
- Aumentar de Top 5 para Top 10 com opção "ver todas".
- Adicionar uma terceira visão por **empresa (coligada)**, útil por ser um grupo com múltiplas empresas.

## 4. Qualidade da leitura executiva

- Incluir na frase o **acumulado da safra** e o **YoY**, não apenas o MoM.
- Sinalizar itens **não recorrentes** (conta que aparece no mês atual e não existia nos 3 meses anteriores) — normalmente são a explicação real do pico.
- Bloco "Pontos de atenção": lista automática das contas com variação acima do limite.

## 5. Exportação e usabilidade

- Botão **exportar Excel** (aba com evolução, contas e rubricas), além do PDF por impressão.
- Layout de impressão dedicado (como já existe no BP/DRE), com logo e cabeçalho do período.
- Estado de **carregando** (skeleton) — hoje os números aparecem zerados enquanto a consulta roda, o que parece dado real.

## Detalhes técnicos

- Arquivo principal: `src/routes/_authenticated/analise-despesas-adm.tsx`.
- Correção do drill-down: no `onClick` da `<Bar dataKey="valor">`, trocar `{ nomedepto: payload.nome }` por `{ contacontabil: ... }`. Como os rótulos da ponte guardam só o nome da conta (`nomeConta()`), passar a guardar também o código completo no `ponteData` para filtrar no RPC `desp_adm_lancamentos`.
- Acumulado de safra: reaproveitar `safraDe()` de `src/lib/balancete.ts`; a série já traz 12 meses via `fetchDespAdmSerie`, aumentar para 24 meses para permitir a comparação safra vs. safra.
- Médias móveis e % do total: cálculo no mesmo `useMemo` de `analise`, sem mudança de banco.
- Exportação Excel: reutilizar utilitários de `src/lib/excel.ts`.
- Nenhuma alteração de RPC, tabela ou regra de rateio.
