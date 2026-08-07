# Nova regra de alocação direta em OUTROS (Despesas Administrativas)

## Regra atual (será substituída)

Dentro das contas `3.4.01.*`, vai 100% para OUTROS quando:
- `CODCCUSTO = 01.14.0003`, ou
- `VCODCONTA = 3.4.01.10.0003` e `CODTMV = 1.2.13`.

O restante entra no pool rateado por percentuais configuráveis (hoje: BOVINOS/COMPOSTO 25%, LÁTEX 25%, SEMENTES/GRÃOS 25%, OUTROS 25%, GENÉTICA 0%, CANA 0%).

## Regra nova

Vai 100% para OUTROS quando qualquer uma das condições for verdadeira:
1. `NOMECUSTO = "GOVERNANCIA CORPORATIVA"`
2. `VCODCONTA = "3.4.01.10.0003"` **e** `PRODUTO <> "DOACOES CURSOS E FACULDADES FUNCIONARIO"`

Comparações sem diferenciar maiúsculas/minúsculas e ignorando espaços em branco nas pontas, para não perder lançamentos por variação de digitação.

Todo o restante das contas `3.4.01.*` continua no pool rateado. Os critérios antigos (`CODCCUSTO 01.14.0003` e o par conta + `CODTMV 1.2.13`) deixam de existir.

Resultado: OUTROS = valores diretos (regras 1 e 2) + sua fatia do rateio — portanto sempre maior que as demais linhas, como esperado.

## Rateio igual entre 5 linhas

Para "ratear igualmente" entre BOVINOS/COMPOSTO, SEMENTES/GRÃOS, LÁTEX, CANA e OUTROS, os percentuais vigentes do rateio ADM passam a 20% para cada uma dessas cinco linhas e 0% para GENÉTICA. Isso continua editável na tela Configurações, com vigência histórica; a nova vigência será criada a partir de abril/2026 (início da safra atual). Se preferir outra data de início, é só avisar.

## Detalhes técnicos

- Migration alterando a função `public.balancete`: a expressão que define `regra` passa a marcar `ADM_OUTROS` pelas duas novas condições (`upper(btrim(nomecusto)) = 'GOVERNANCIA CORPORATIVA'` ou `btrim(vcodconta) = '3.4.01.10.0003' AND upper(btrim(coalesce(produto,''))) <> 'DOACOES CURSOS E FACULDADES FUNCIONARIO'`), mantendo `ADM_RATEIO` para o restante de `3.4.01.%`.
- Atualização dos percentuais vigentes em `rateio_adm` (nova vigência 2026-04-01 com 20/20/20/20/20 e GENÉTICA 0).
- Ajuste do comentário/documentação da regra em `src/lib/balancete.ts` e das constantes `CCUSTO_ADM_OUTROS` / `CODTMV_ADM_OUTROS`, que deixam de ser usadas; a lógica de soma (`ADM_OUTROS` + fatia do pool) permanece igual.
- Verificação após aplicar: comparar o total de DESP. ADM de jun/2026 antes e depois — o total geral não pode mudar, só a distribuição entre linhas.

## Fora do escopo

- Alterar as regras de despesas de vendas e tributárias.
- Mudar telas de importação ou De/Para.
