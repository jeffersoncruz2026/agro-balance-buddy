
CREATE TABLE public.configuracoes (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  safra_start_month int NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfg auth" ON public.configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.configuracoes (id, safra_start_month) VALUES (true, 4);

CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  arquivo text NOT NULL,
  total_linhas int NOT NULL DEFAULT 0,
  total_valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processando',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.importacoes TO authenticated;
GRANT ALL ON public.importacoes TO service_role;
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp auth" ON public.importacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.lancamentos (
  id bigserial PRIMARY KEY,
  importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE,
  codcoligada text,
  nomecoligada text,
  coddepartamento text,
  codccusto text,
  nomedepto text,
  nomecusto text,
  vlcusto numeric NOT NULL DEFAULT 0,
  complemento text,
  vcodconta text,
  contacontabil text,
  produto text,
  documento text,
  nomeconta text,
  data date NOT NULL
);
CREATE INDEX idx_lanc_data ON public.lancamentos (data);
CREATE INDEX idx_lanc_conta ON public.lancamentos (vcodconta);
CREATE INDEX idx_lanc_produto ON public.lancamentos (produto);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lanc auth" ON public.lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.conta_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta text NOT NULL,
  descricao text,
  is_prefixo boolean NOT NULL DEFAULT false,
  categoria text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conta_map TO authenticated;
GRANT ALL ON public.conta_map TO service_role;
ALTER TABLE public.conta_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm auth" ON public.conta_map FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.produto_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto text NOT NULL,
  linha_negocio text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_map TO authenticated;
GRANT ALL ON public.produto_map TO service_role;
ALTER TABLE public.produto_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm auth" ON public.produto_map FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.rateio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano int NOT NULL,
  mes int NOT NULL,
  linha_negocio text NOT NULL,
  percentual numeric NOT NULL DEFAULT 0,
  UNIQUE (ano, mes, linha_negocio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rateio TO authenticated;
GRANT ALL ON public.rateio TO service_role;
ALTER TABLE public.rateio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rat auth" ON public.rateio FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_safra_inicio() RETURNS int
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT COALESCE((SELECT safra_start_month FROM public.configuracoes LIMIT 1), 4)
$fn$;

CREATE OR REPLACE FUNCTION public.balancete(p_mes int, p_ano int)
RETURNS TABLE(safra_ano int, linha text, categoria text, valor numeric, qtd bigint)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  base AS (
    SELECT l.*,
      CASE WHEN EXTRACT(month FROM l.data)::int >= (SELECT m FROM ini)
        THEN EXTRACT(year FROM l.data)::int ELSE EXTRACT(year FROM l.data)::int - 1 END AS safra
    FROM public.lancamentos l
    WHERE EXTRACT(month FROM l.data)::int = p_mes
      AND EXTRACT(year FROM l.data)::int IN (p_ano, p_ano - 1)
  )
  SELECT b.safra,
         COALESCE(pm.linha_negocio, 'NÃO MAPEADO'),
         COALESCE(am.categoria, 'NÃO MAPEADO'),
         SUM(b.vlcusto),
         COUNT(*)
  FROM base b
  LEFT JOIN LATERAL (
    SELECT p.linha_negocio FROM public.produto_map p
    WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(b.produto,''))) LIMIT 1
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT a.categoria FROM public.conta_map a
    WHERE (a.is_prefixo AND COALESCE(b.vcodconta,'') LIKE a.conta || '%')
       OR (NOT a.is_prefixo AND a.conta = COALESCE(b.vcodconta,''))
    ORDER BY length(a.conta) DESC LIMIT 1
  ) am ON true
  GROUP BY 1,2,3
$fn$;

CREATE OR REPLACE FUNCTION public.balancete_detalhe(p_mes int, p_ano int, p_safra int, p_linha text, p_categoria text)
RETURNS TABLE(id bigint, data date, nomecoligada text, nomedepto text, produto text, contacontabil text, nomecusto text, documento text, vlcusto numeric)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  base AS (
    SELECT l.*,
      CASE WHEN EXTRACT(month FROM l.data)::int >= (SELECT m FROM ini)
        THEN EXTRACT(year FROM l.data)::int ELSE EXTRACT(year FROM l.data)::int - 1 END AS safra
    FROM public.lancamentos l
    WHERE EXTRACT(month FROM l.data)::int = p_mes
      AND EXTRACT(year FROM l.data)::int IN (p_ano, p_ano - 1)
  )
  SELECT b.id, b.data, b.nomecoligada, b.nomedepto, b.produto, b.contacontabil, b.nomecusto, b.documento, b.vlcusto
  FROM base b
  LEFT JOIN LATERAL (
    SELECT p.linha_negocio FROM public.produto_map p
    WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(b.produto,''))) LIMIT 1
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT a.categoria FROM public.conta_map a
    WHERE (a.is_prefixo AND COALESCE(b.vcodconta,'') LIKE a.conta || '%')
       OR (NOT a.is_prefixo AND a.conta = COALESCE(b.vcodconta,''))
    ORDER BY length(a.conta) DESC LIMIT 1
  ) am ON true
  WHERE b.safra = p_safra
    AND COALESCE(pm.linha_negocio,'NÃO MAPEADO') = p_linha
    AND COALESCE(am.categoria,'NÃO MAPEADO') = p_categoria
  ORDER BY b.data, b.id
  LIMIT 500
$fn$;

CREATE OR REPLACE FUNCTION public.pendencias_contas()
RETURNS TABLE(vcodconta text, contacontabil text, qtd bigint, valor numeric)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT l.vcodconta, min(l.contacontabil), count(*), sum(l.vlcusto)
  FROM public.lancamentos l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.conta_map a
    WHERE (a.is_prefixo AND COALESCE(l.vcodconta,'') LIKE a.conta || '%')
       OR (NOT a.is_prefixo AND a.conta = COALESCE(l.vcodconta,''))
  )
  GROUP BY l.vcodconta ORDER BY sum(abs(l.vlcusto)) DESC
$fn$;

CREATE OR REPLACE FUNCTION public.pendencias_produtos()
RETURNS TABLE(produto text, exemplo_depto text, qtd bigint, valor numeric)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT l.produto, min(l.nomedepto), count(*), sum(l.vlcusto)
  FROM public.lancamentos l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.produto_map p
    WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(l.produto,'')))
  )
  GROUP BY l.produto ORDER BY sum(abs(l.vlcusto)) DESC
$fn$;

CREATE OR REPLACE FUNCTION public.evolucao_saldo()
RETURNS TABLE(ano int, mes int, linha text, categoria text, valor numeric)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXTRACT(year FROM l.data)::int, EXTRACT(month FROM l.data)::int,
         COALESCE(pm.linha_negocio,'NÃO MAPEADO'), COALESCE(am.categoria,'NÃO MAPEADO'), SUM(l.vlcusto)
  FROM public.lancamentos l
  LEFT JOIN LATERAL (
    SELECT p.linha_negocio FROM public.produto_map p
    WHERE upper(btrim(p.produto)) = upper(btrim(COALESCE(l.produto,''))) LIMIT 1
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT a.categoria FROM public.conta_map a
    WHERE (a.is_prefixo AND COALESCE(l.vcodconta,'') LIKE a.conta || '%')
       OR (NOT a.is_prefixo AND a.conta = COALESCE(l.vcodconta,''))
    ORDER BY length(a.conta) DESC LIMIT 1
  ) am ON true
  GROUP BY 1,2,3,4
$fn$;

GRANT EXECUTE ON FUNCTION public.balancete(int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.balancete_detalhe(int,int,int,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pendencias_contas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pendencias_produtos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolucao_saldo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_safra_inicio() TO authenticated;
