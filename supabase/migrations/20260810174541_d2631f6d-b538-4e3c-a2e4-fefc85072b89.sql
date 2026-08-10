ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS grupocontabil text,
  ADD COLUMN IF NOT EXISTS divisao text,
  ADD COLUMN IF NOT EXISTS codfilial text,
  ADD COLUMN IF NOT EXISTS grupocontabil_n9 text,
  ADD COLUMN IF NOT EXISTS codund text,
  ADD COLUMN IF NOT EXISTS quantidade numeric,
  ADD COLUMN IF NOT EXISTS saldounitario numeric,
  ADD COLUMN IF NOT EXISTS histfaturamento text,
  ADD COLUMN IF NOT EXISTS produto_antigo text,
  ADD COLUMN IF NOT EXISTS nome_orcamento text,
  ADD COLUMN IF NOT EXISTS idpartida text;