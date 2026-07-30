# Balancete Pronto

## CONTEXTO

Construa um sistema web para gerar automaticamente, todo mês, o **"Balancete Gerencial"** de um grupo agropecuário com múltiplas empresas (coligadas: Vera Cruz Agropecuária, Planagri, OL Látex Tocantins, OL Látex Ltda) e múltiplas linhas de negócio (Bovinos, Genética, Sementes/Grãos, Látex, Cana, Outros).

custo

Hoje esse relatório é montado manualmente em Excel, cruzando uma extração bruta do ERP com uma planilha de "De/Para" mantida na cabeça do contador — processo lento e sujeito a erro (o arquivo modelo atual já contém células `#REF!` de vínculos quebrados). O objetivo do sistema é: **usuário sobe a base bruta do mês → sistema aplica um De/Para (mapeamento) reutilizável e editável → sistema gera o balancete gerencial pronto, no mesmo layout do modelo, comparando o ano-safra atual com o anterior.**

---

## 1. FONTE DE DADOS DE ENTRADA (arquivo "Base")

Todo mês o usuário fará upload de um `.xlsx` exportado do ERP (planilha única, ~28 mil linhas, cresce a cada mês) com estas colunas, nesta ordem:

| Coluna | Descrição | Exemplo |

|---|---|---|

| ROWL | ID da linha (numérico, irrelevante para o relatório) | 29012 |

| CODCOLIGADA | Código da empresa | 34 |

| NOMECOLIGADA | Nome da empresa | "OL LATEX TOCANTINS LTDA" |

| CODDEPARTAMENTO | Código do departamento | "089" |

| CODCCUSTO | Código do centro de custo | "01.08.0002" |

| NOMEDEPTO | Nome da fazenda/unidade/centro de custo | "SERINGAL", "VERA CRUZ - PECUARIA", "MECANIZADO" |

| NOMECUSTO | Descrição do custo/rubrica | "VIGILANCIA" |

| **VLCUSTO** | **Valor lançado (positivo ou negativo, já com o sinal contábil correto)** | -380.82 |

| COMPLEMENTO | Texto livre / número de documento auxiliar | " 001.02.07.001" |

| VCODCONTA | Código da conta contábil | "4.1.01.01.0030" |

| CONTACONTABIL | Código + descrição da conta contábil | "4.1.01.01.0030 - ENCARGOS INSS" |

| CODTMV | Código de tipo de movimento (muitas vezes vazio) | — |

| PRODUTO | Descrição do histórico/rubrica (não é a linha de negócio!) | "AJUSTE PROVISAO FERIAS..." |

| HISTORICOMOV | Histórico do movimento | — |

| DOCUMENTO | Número do documento contábil | "LB062026" |

| NOMECONTA | Nome resumido da conta | "ENCARGOS INSS" |

| CODUND | Unidade | "UN" |

| CODFILIAL | Código da filial | 1 |

| **DATA** | Data de competência do lançamento | 30/06/2026 |

| Total Geral | Coluna geralmente vazia (ignorar) | — |

**Importante:** a coluna `PRODUTO` **não** representa a linha de negócio (Bovinos/Látex/Cana etc.) — ela traz o texto do histórico do lançamento. A linha de negócio precisa ser inferida a partir de `PRODUTO`, via o De/Para descrito na seção 3.

---

## 2. LAYOUT DE SAÍDA — replicar EXATAMENTE o modelo `Gerencial_junho.xlsx`

O relatório final é uma tabela única, dividida em blocos verticais. Cada bloco de linha de negócio tem **duas linhas**: uma para o ano-safra atual (ex.: 2026/2027) e uma para o ano-safra anterior (ex.: 2025/2026), permitindo comparação ano contra ano no mesmo mês de fechamento (ex.: Junho/2026 vs Junho/2025).

### 2.1 Cabeçalho

```

PERÍODO: Junho 2.026 e Junho 2.025   ← mês/ano deve ser parametrizável a cada geração

```

### 2.2 Colunas da tabela principal (nesta ordem exata)

| # | Coluna | Fórmula / origem |

|---|---|---|

| 1 | DESCRIÇÃO | Linha de negócio |

| 2 | ANO | Ano-safra (ex.: "2026/2027") |

| 3 | RECEITA BRUTA | Soma das contas de receita bruta mapeadas para a linha |

| 4 | DEVOLUÇÃO | Soma das contas de devolução de vendas |

| 5 | ICMS | Soma das contas de ICMS sobre vendas |

| 6 | PIS | Soma das contas de PIS |

| 7 | COFINS | Soma das contas de COFINS |

| 8 | INSS RURAL | Soma das contas de INSS rural (funrural) |

| 9 | OUTROS ABATIMENTOS | Soma de outras deduções de receita |

| 10 | IMPOSTOS/DEV/ABAT | `= RECEITA BRUTA − RECEITA LÍQUIDA` (total das deduções) |

| 11 | RECEITA LÍQUIDA | Soma das contas de receita líquida (ou `RECEITA BRUTA − colunas 4 a 9`, a confirmar com o contador — no modelo atual as duas abordagens não batem 100%, então trate como **duas séries independentes conciliáveis**, sinalizando divergência) |

| 12 | HEDGE (+/-) | Soma das contas de resultado de hedge |

| 13 | CPV / CMV | Soma das contas de custo do produto/mercadoria vendida |

| 14 | LUCRO BRUTO | `= RECEITA LÍQUIDA + HEDGE − CPV/CMV` |

| 15 | DESP. ADM | Soma das contas de despesas administrativas alocadas à linha |

| 16 | DESP. TRIBUT | Soma das contas de despesas tributárias |

| 17 | DESP. VENDAS | Soma das contas de despesas de vendas |

| 18 | SALDO | `= LUCRO BRUTO − DESP. ADM − DESP. TRIBUT − DESP. VENDAS` |

### 2.3 Linhas de negócio (nesta ordem, cada uma com 2 linhas: ano atual / ano anterior)

1. BOVINOS / COMPOSTO

2. GENÉTICA

3. SEMENTES / GRÃOS

4. LÁTEX

5. CANA

6. OUTROS

7. **TOTAL** (soma das 6 linhas acima, por coluna)

### 2.4 Blocos abaixo do total (mesma lógica de 2 linhas por bloco: ano atual / ano anterior)

```

OUTRAS RECEITAS

  OUTRAS RECEITAS OPERACIONAIS         → só coluna SALDO

  RECEITAS / DESPESAS NÃO OPERAC.      → só coluna SALDO

  TOTAL                                = soma das 2 acima

RESULTADO ANTES DAS DESP E REC FINANCEIRAS

  = SALDO (total das linhas de negócio) + TOTAL (outras receitas)

DESPESAS FINANCEIRAS        → só coluna SALDO (valor negativo)

RECEITAS FINANCEIRAS        → só coluna SALDO

ENCARGOS FINANCEIROS LÍQUIDOS = DESPESAS FINANCEIRAS + RECEITAS FINANCEIRAS

TOTAL                        = RESULTADO ANTES DAS DESP E REC FINAN + ENCARGOS FINANCEIROS LÍQUIDOS

IMPOSTOS S/ O LUCRO

  IMPOSTO DE RENDA            → só coluna SALDO (negativo)

  CONTRIBUIÇÃO SOCIAL         → só coluna SALDO (negativo)

  TOTAL                       = soma dos 2 acima

LUCRO / PREJUÍZO DO PERÍODO   = TOTAL (financeiro) + TOTAL (impostos s/ lucro)

DEPRECIAÇÃO DE BOVINOS        → só coluna SALDO (linha informativa, fora da soma do lucro)

DEPRECIAÇÃO MÁQ. / EQUIP. / BENS → só coluna SALDO (linha informativa)

```

### 2.5 Formatação

- Fonte profissional (Arial), números em padrão contábil brasileiro: `R$ #.##0,00`, negativos entre parênteses ou em vermelho, zero exibido como "-".

- Linha "TOTAL" em negrito com destaque (preenchimento leve).

- Estrutura de duas linhas por bloco (ano atual em cima, ano anterior embaixo) deve ficar visualmente agrupada (linha de negócio mesclada verticalmente, como no arquivo original).

- Exportação final deve ser um `.xlsx` fiel ao modelo (mesmas colunas, mesmos títulos, mesma ordem), além de visualização em tela.

---

## 3. O CORAÇÃO DO SISTEMA: DE/PARA (MAPEAMENTO) EDITÁVEL E PERSISTENTE

Este é o requisito mais importante do projeto. O sistema **não pode** ter a lógica de mapeamento fixa no código — ela precisa ser uma tabela de dados, gerenciável pelo usuário dentro da própria interface, e reaproveitada automaticamente todo mês (o plano de contas e os centros de custo mudam pouco).

Construa DUAS tabelas de mapeamento, com CRUD completo (criar, editar, excluir, buscar) na interface:

### 3.1 Mapeamento de Contas Contábeis → Categoria do Relatório

- Chave: `VCODCONTA` (ou `CONTACONTABIL`) da base.

- Valor: uma das categorias fixas do relatório (RECEITA BRUTA, DEVOLUÇÃO, ICMS, PIS, COFINS, INSS RURAL, OUTROS ABATIMENTOS, RECEITA LÍQUIDA, HEDGE, CPV/CMV, DESP. ADM, DESP. TRIBUT, DESP. VENDAS, OUTRAS RECEITAS OPERACIONAIS, RECEITAS/DESPESAS NÃO OPERAC., DESPESAS FINANCEIRAS, RECEITAS FINANCEIRAS, IMPOSTO DE RENDA, CONTRIBUIÇÃO SOCIAL, DEPRECIAÇÃO DE BOVINOS, DEPRECIAÇÃO MÁQ/EQUIP/BENS, ou "NÃO CLASSIFICAR / IGNORAR").

- Permitir mapear por **prefixo** de conta (ex.: tudo que começa com "4.1.01" cai em DESP. ADM) para não precisar cadastrar conta por conta.

### 3.2 Mapeamento de Produto → Linha de Negócio

- Chave: `PRODUTO` da base.

- Valor: uma das linhas de negócio (BOVINOS/COMPOSTO, GENÉTICA, SEMENTES/GRÃOS, LÁTEX, CANA, OUTROS).

- Exemplos observados na base real que ajudam a pré-popular sugestões: unidades com "SERINGAL" no nome → provável LÁTEX; unidades com "PECUARIA" → provável BOVINOS; "MECANIZADO"/"GRAOS" → provável SEMENTES/GRÃOS. Use isso apenas como **sugestão automática inicial**, nunca como regra travada — o usuário deve poder corrigir.

### 3.3 Comportamento obrigatório

- Ao subir uma nova base mensal, o sistema cruza automaticamente cada linha com os dois De/Para.

- Qualquer `CONTACONTABIL` ou `PRODUTO` que apareça na base e **não tenha mapeamento cadastrado** deve ser destacado em uma tela de pendências ("X contas e Y centros de custo não mapeados, somando R$ Z não classificado") — o relatório não deve "engolir" silenciosamente valores não mapeados.

- O usuário resolve as pendências direto na tela (associando a categoria/linha correta), o sistema salva a regra para os próximos meses, e então libera a geração do relatório.

- Deve existir uma visão de auditoria: para qualquer célula do relatório final, poder clicar e ver quais lançamentos (linhas da base) a compõem — rastreabilidade total.

---

## 4. REGRAS DE NEGÓCIO ESPECÍFICAS

- **Ano-safra**: o grupo opera em ciclo de safra, não em ano civil. **O ano-safra vai de Abril a Março** (ex.: o ano-safra "2026/2027" começa em abril/2026 e termina em março/2027). Ou seja, um lançamento com `DATA` entre 01/04/2026 e 31/03/2027 pertence ao ano-safra "2026/2027". Essa regra deve ficar parametrizável na tela de configuração (campo "mês de início do ano-safra", default = Abril), para caso o grupo mude a convenção no futuro — mas o cálculo padrão do MVP já deve nascer configurado com virada em abril.

- **Multi-empresa**: a base tem 4 coligadas (`CODCOLIGADA`/`NOMECOLIGADA`). O relatório gerencial é consolidado (soma todas as empresas do grupo). Se fizer sentido, ofereça um filtro opcional "ver por coligada" além da visão consolidada.

- **Comparativo mensal**: o usuário quer comparar o mesmo mês de fechamento (ex.: Junho) entre o ano-safra atual e o anterior. O sistema deve permitir escolher o mês de referência e automaticamente buscar/filtrar os lançamentos dos dois períodos correspondentes.

- **Zero hardcode**: todos os totais e subtotais devem ser calculados dinamicamente a partir da base + De/Para, nunca digitados manualmente.

---

## 5. FUNCIONALIDADES DO SISTEMA

1. **Upload mensal da Base** (`.xlsx`, parser tolerante a colunas fora de ordem, com preview antes de confirmar a importação).

2. **Histórico de bases importadas** por mês/ano, com possibilidade de reprocessar um mês anterior se o De/Para for corrigido depois.

3. **Tela de gestão do De/Para** (as duas tabelas da seção 3), com busca, filtro, importação/exportação em massa (CSV/Excel) para facilitar a carga inicial do De/Para já existente do usuário.

4. **Tela de pendências de classificação** (contas/centros de custo novos, não mapeados).

5. **Geração do Balancete Gerencial**: seleção do mês/ano de referência → botão "Gerar" → tabela no layout exato da seção 2, renderizada na tela.

6. **Exportação** do relatório gerado para `.xlsx` (fiel ao modelo) e para PDF.

7. **Drill-down/auditoria**: clicar em qualquer valor do relatório e ver os lançamentos que o compõem.

8. **Dashboard opcional**: gráficos simples de evolução do SALDO por linha de negócio mês a mês, e comparação ano-safra atual vs anterior.

9. **Autenticação simples** (login), já que são dados financeiros sensíveis do grupo.

---

## 6. STACK TÉCNICA SUGERIDA (Lovable + Supabase)

- **Frontend**: React + Tailwind (padrão Lovable), tabelas densas estilo planilha (considerar biblioteca de grid, ex. TanStack Table) para as telas de De/Para e de resultado.

- **Backend/dados**: Supabase (Postgres) para persistir: bases importadas (linha a linha ou em lote), tabelas de De/Para, histórico de relatórios gerados, log de auditoria.

- **Parsing de Excel**: SheetJS (`xlsx`) no front, ou edge function no Supabase para arquivos grandes (a base tem ~28 mil linhas e tende a crescer — trate a importação de forma assíncrona/paginada para não travar a UI).

- **Exportação**: gerar `.xlsx` de saída também via SheetJS, replicando cabeçalhos, mesclagens e formatação numérica do modelo.

- **Cálculo**: todo o agregamento (somas por categoria x linha de negócio x ano-safra) deve rodar no backend (query SQL ou função), não no navegador, para lidar com o volume de dados de forma performática.

---

## 7. CRITÉRIOS DE QUALIDADE

- O relatório gerado precisa bater 100% com a estrutura do modelo (mesmas linhas, colunas, ordem, rótulos — inclusive quebras de linha nos títulos como "RECEITA\nBRUTA").

- Nenhum valor da base pode "sumir" sem explicação: tudo que não tiver De/Para cadastrado deve aparecer como pendência, nunca ser ignorado silenciosamente.

- Todas as fórmulas de coluna (IMPOSTOS/DEV/ABAT, RECEITA LÍQUIDA, LUCRO BRUTO, SALDO, RESULTADO ANTES DAS DESP E REC FINANCEIRAS, ENCARGOS FINANCEIROS LÍQUIDOS, LUCRO/PREJUÍZO DO PERÍODO) devem ser reativas — se o usuário corrige um De/Para e reprocessa, tudo recalcula.

- Interface em português, formatação de moeda em padrão brasileiro (R$, vírgula decimal, ponto de milhar).

---

1. A coluna "RECEITA LÍQUIDA" deve ser calculada como `RECEITA BRUTA − deduções` 

2. As despesas administrativas (DESP. ADM) e tributárias/vendas são rateadas para as linhas de negócio por  uma regra de rateio (percentual) para custos compartilhados DEFINIR MANUALMENTE O PERCENTUAL MENSALMENTE

3. SEMPRE CONSOLIDADO

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://agro-balance-buddy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a1a417a9-c019-4567-9328-f16800cc5fd3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
