# Novo layout de importação da base

Objetivo: aceitar o novo modelo de planilha (23 colunas) sem mudar nenhuma fórmula, regra de rateio, De/Para ou relatório existente. O importador passa a reconhecer os dois layouts (antigo e novo) automaticamente.

## De/Para das colunas (novo modelo → campos atuais)

| Novo modelo | Campo atual | Observação |
|---|---|---|
| COLIGADA (`18-OL LATEX LTDA`) | codcoligada + nomecoligada | separa código antes do hífen e nome depois |
| NOMEDEPTO | nomedepto | direto |
| NOMECUSTO | nomecusto | direto (usado nas regras de ADM e Vendas) |
| CONTA_CONTABIL | vcodconta | chave das regras (3.4.01.*, De/Para de contas) |
| DESCRICAO_CONTABIL | nomeconta | direto |
| CONTA_CONTABIL + DESCRICAO_CONTABIL | contacontabil | montado como `codigo - descrição`, igual ao formato de hoje |
| NOMEPRODUTO | produto | chave do De/Para de produtos |
| COMPLEMENTO | complemento | direto |
| DOCUMENTO | documento | direto |
| CODTMV | codtmv | direto |
| SALDO | vlcusto | valor usado em todos os cálculos |
| DATA | data | direto |
| — | coddepartamento, codccusto | não existem no novo modelo; ficam vazios (nenhuma regra atual usa) |

Se a planilha vier no layout antigo, os nomes antigos continuam sendo reconhecidos (os dois conjuntos de nomes viram apelidos do mesmo campo).

## Campos novos que serão guardados

Passam a ser gravados junto com cada lançamento, apenas para consulta/auditoria (não entram em nenhum cálculo):
GRUPOCONTABIL, DIVISAO, CODFILIAL, GRUPOCONTABILN9, CODUND, QUANTIDADE, SALDOUNITARIO, HISTFATURAMENTO, NOMEPRODUTO_ANTIGO, NOME_ORCAMENTO, IDPARTIDA.
A coluna "Total Geral" da planilha é ignorada (é linha/coluna de totalização do Excel).

## Detalhes técnicos

1. Migração: adicionar colunas opcionais em `public.lancamentos` — `grupocontabil`, `divisao`, `codfilial`, `grupocontabil_n9`, `codund`, `quantidade numeric`, `saldounitario numeric`, `histfaturamento`, `produto_antigo`, `nome_orcamento`, `idpartida`. Todas nulas por padrão, sem impacto nos registros existentes. Nenhuma função do banco (`balancete`, `desp_adm_serie`, etc.) é alterada.
2. `src/lib/excel.ts`: ampliar o mapa `ALIASES` com os nomes do novo layout; tornar `codccusto`/`coddepartamento` opcionais; derivar `codcoligada`/`nomecoligada` do campo COLIGADA; montar `contacontabil` a partir de código + descrição quando não vier pronto; ler os campos extras (quantidade e saldo unitário como número).
3. `src/routes/_authenticated/_admin/importar.tsx`: prévia continua igual; o aviso de "colunas não encontradas" passa a considerar só os campos essenciais e mostra qual layout foi detectado.
4. Validação: importar o modelo enviado e conferir que produto, conta e valor caem nas mesmas linhas do relatório.

Nenhuma tela de relatório, regra de rateio ou exportação muda.
