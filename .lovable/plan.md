# Chat de perguntas sobre despesas administrativas

Sim, é possível. A ideia é um painel de chat dentro da tela **Despesas Administrativas**, onde o usuário pergunta em linguagem natural ("quanto gastamos com manutenção em junho/2026?", "quais os 5 maiores centros de custo da safra?") e o sistema responde com base nos dados reais do balancete gerencial.

## Como vai funcionar

1. O usuário digita a pergunta no chat da tela de Despesas Administrativas.
2. O sistema envia a pergunta para a IA junto com as ferramentas de consulta ao banco.
3. A IA escolhe a consulta certa (série de despesas, balancete por linha de negócio, lançamentos detalhados, ajustes manuais) e recebe os números reais.
4. A resposta volta em texto, com valores formatados em R$ e, quando fizer sentido, uma pequena tabela.

Pontos definidos:
- **Uma única conversa** (sem lista de conversas/threads).
- Mensagens salvas **apenas neste navegador** (localStorage); botão "Nova conversa" limpa o histórico.
- Escopo dos dados: **todo o balancete gerencial** (receitas, custos, despesas adm/tributárias/vendas, ajustes manuais), não só DESP. ADM.
- Nunca inventa números: se a consulta não retorna dados, a resposta diz que não há dados para o período/filtro.
- Somente leitura — o chat não altera nada no sistema.

## Onde aparece

Um bloco de chat recolhível no fim da página `/desp-adm`, com sugestões prontas de perguntas ("Total de DESP. ADM em junho/2026", "Comparar últimos 3 meses", "Maiores contas do mês"). Os filtros já selecionados na tela (mês/ano de referência) entram como contexto inicial da conversa.

## Detalhes técnicos

- Rota de streaming `src/routes/api/chat-despesas.ts` (TanStack server route) usando AI SDK + Lovable AI Gateway, modelo `google/gemini-3.6-flash`. Chave `LOVABLE_API_KEY` só no servidor.
- Ferramentas (tools) expostas ao modelo, executadas no servidor com o token do usuário (RLS aplicada):
  - `serie_despesas` → RPC `desp_adm_serie` (paginada, reaproveitando a lógica de `src/lib/desp-adm.ts`)
  - `lancamentos_despesas` → RPC `desp_adm_lancamentos`
  - `balancete_periodo` → RPC `balancete` (por mês/ano, todas as categorias e linhas de negócio)
  - `detalhe_balancete` → RPC `balancete_detalhe`
  - `ajustes_gerenciais` → tabela `ajustes`
  - `resultado_financeiro` → RPC de mesmo nome
- Resultados das ferramentas são agregados/limitados antes de ir ao modelo (evita estourar contexto em consultas grandes).
- UI com componentes AI Elements (`conversation`, `message`, `prompt-input`, `tool`, `shimmer`) e `useChat` do `@ai-sdk/react`; persistência em localStorage sob uma chave única.
- Tratamento explícito de erros de limite (429) e créditos (402) com mensagem clara na tela.
- Dependências novas: `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible` e os componentes AI Elements.

## Fora do escopo

- Geração de gráficos pela IA (as respostas serão texto/tabela).
- Exportar a conversa ou compartilhar entre usuários.
