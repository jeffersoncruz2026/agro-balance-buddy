# Logo e exportação PDF do BP e da DRE

Deixar a exportação em PDF do Balanço Patrimonial e da DRE igual aos modelos anexados.

## O que muda

1. **Logo do grupo no cabeçalho impresso** — a logo LAGE aparece no topo da folha, ao lado do nome da empresa (ou "Consolidado"), como nos dois modelos. Abaixo: título do relatório ("Balanço Patrimonial" / "Demonstração de Resultado"), o período (ex.: junho-2026) e "(Em Reais)".

2. **Balanço Patrimonial — paisagem, 1 página**
   - Folha A4 deitada, Ativo à esquerda e Passivo + PL à direita, alinhados linha a linha (como já está na tela).
   - Fonte e espaçamento reduzidos na impressão para caber tudo em uma única página.
   - Rodapé com a nota das notas explicativas e as assinaturas (Diretor / Contador), como hoje.

3. **DRE — retrato, 1 página**
   - Folha A4 em pé, tabela única com as colunas mês atual / Δ / mesmo mês do ano anterior.
   - Compactada para caber em uma folha, com a nota e as assinaturas ao final.

4. **Só a aba visível é impressa** — ao clicar em "Exportar PDF" na aba BP, sai apenas o BP em paisagem; na aba DRE, apenas a DRE em retrato. A orientação da folha muda conforme a aba ativa.

5. Filtros, menu lateral, abas e botões continuam fora da impressão.

## Detalhes técnicos

- `src/routes/_authenticated/bp-dre.tsx`: controlar a aba ativa por estado (`value`/`onValueChange` no `Tabs`) e injetar uma regra `@page { size: A4 landscape | portrait; margin: 10mm }` conforme a aba, via `<style>` no componente.
- Cabeçalho de impressão novo (bloco `hidden print:block`) com `<img src={logoAsset.url}>` a partir de `src/assets/logo-grupo.png.asset.json`, nome da empresa/consolidado, título, período e "(Em Reais)".
- A `TabsContent` não ativa já não é renderizada, então nada extra precisa ser escondido além dos controles; adicionar `print:hidden` onde faltar.
- Regras de compactação em `src/styles.css` dentro de `@media print`: reduzir `font-size` e `padding` das tabelas do relatório, remover sombras/bordas de `Card`, forçar `break-inside: avoid` e evitar quebras de página.
- Nota "As notas explicativas são parte integrante das demonstrações financeiras" impressa junto com o rodapé de assinaturas já existente.
