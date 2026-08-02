# Logo do grupo e novo título na tela de entrada

Aplicar a identidade do Grupo Otávio Lage na página de login (a tela em anexo).

## O que muda

1. **Logo** — a imagem enviada (Logo.png) passa a ser hospedada como asset do projeto e substitui o ícone de plantinha no topo do painel escuro da tela de entrada, exibida em tamanho legível sobre o fundo verde.
2. **Título** — o texto principal "Do extrato bruto do ERP ao balancete pronto, em minutos." vira **"Resultados Gerenciais Grupo Otávio Lage"**.
3. O subtítulo (De/Para reutilizável, ano-safra...) e o rodapé de empresas permanecem como estão.
4. **Favicon** — a logo também vira o ícone do site (cópia quadrada em `public/`), substituindo o favicon atual.

## Detalhes técnicos

- Upload via `lovable-assets` a partir de `/mnt/user-uploads/Logo.png`, com ponteiro em `src/assets/logo.png.asset.json` importado em `src/routes/auth.tsx`.
- Em `src/routes/auth.tsx`: remover o ícone `Sprout` do cabeçalho do painel esquerdo, colocar `<img>` com `alt="Grupo Otávio Lage"`, e trocar o `<h1>`.
- Favicon: `magick` para gerar `public/favicon.png` 64x64 com padding, atualizar o `rel="icon"` em `src/routes/__root.tsx` e remover `public/favicon.ico`.
