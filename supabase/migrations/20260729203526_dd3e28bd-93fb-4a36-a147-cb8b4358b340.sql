CREATE TABLE public.custo_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomecusto text NOT NULL UNIQUE,
  linha_negocio text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custo_map TO authenticated;
GRANT ALL ON public.custo_map TO service_role;
ALTER TABLE public.custo_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmc auth" ON public.custo_map FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_custo_map_updated_at BEFORE UPDATE ON public.custo_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.balancete(integer, integer);
CREATE FUNCTION public.balancete(p_mes integer, p_ano integer)
 RETURNS TABLE(safra_ano integer, linha text, categoria text, regra text, valor numeric, qtd bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  base AS (
    SELECT l.*,
      CASE WHEN EXTRACT(month FROM l.data)::int >= (SELECT m FROM ini)
        THEN EXTRACT(year FROM l.data)::int ELSE EXTRACT(year FROM l.data)::int - 1 END AS safra
    FROM public.lancamentos l
    WHERE EXTRACT(month FROM l.data)::int = p_mes
      AND EXTRACT(year FROM l.data)::int IN (p_ano, p_ano - 1)
  ),
  enr AS (
    SELECT b.*,
      COALESCE(pm.linha_negocio,'NÃO MAPEADO') AS linha_prod,
      COALESCE(am.categoria,'NÃO MAPEADO') AS cat,
      cm.linha_negocio AS linha_custo
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
    LEFT JOIN LATERAL (
      SELECT c.linha_negocio FROM public.custo_map c
      WHERE upper(btrim(c.nomecusto)) = upper(btrim(COALESCE(b.nomecusto,''))) LIMIT 1
    ) cm ON true
  )
  SELECT e.safra,
    CASE WHEN e.cat = 'DESP. VENDAS' AND upper(btrim(COALESCE(e.nomecusto,''))) <> 'FATURAMENTO'
      THEN COALESCE(e.linha_custo,'NÃO MAPEADO') ELSE e.linha_prod END,
    e.cat,
    CASE
      WHEN e.cat = 'DESP. VENDAS' AND upper(btrim(COALESCE(e.nomecusto,''))) = 'FATURAMENTO' THEN 'VENDAS_FAT'
      WHEN e.cat = 'DESP. VENDAS' THEN 'VENDAS_MAP'
      WHEN COALESCE(e.vcodconta,'') LIKE '3.4.01.%'
        THEN CASE
               WHEN btrim(COALESCE(e.codccusto,'')) = '01.14.0003'
                 OR (btrim(COALESCE(e.vcodconta,'')) = '3.4.01.10.0003'
                     AND btrim(COALESCE(e.codtmv,'')) = '1.2.13')
               THEN 'ADM_OUTROS' ELSE 'ADM_RATEIO' END
      ELSE 'NORMAL'
    END,
    SUM(e.vlcusto), COUNT(*)
  FROM enr e
  GROUP BY 1,2,3,4
$function$;

DROP FUNCTION IF EXISTS public.balancete_detalhe(integer, integer, integer, text, text);
CREATE FUNCTION public.balancete_detalhe(p_mes integer, p_ano integer, p_safra integer, p_linha text, p_categoria text)
 RETURNS TABLE(id bigint, data date, nomecoligada text, nomedepto text, produto text, contacontabil text, nomecusto text, documento text, vlcusto numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
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
  LEFT JOIN LATERAL (
    SELECT c.linha_negocio FROM public.custo_map c
    WHERE upper(btrim(c.nomecusto)) = upper(btrim(COALESCE(b.nomecusto,''))) LIMIT 1
  ) cm ON true
  WHERE b.safra = p_safra
    AND COALESCE(am.categoria,'NÃO MAPEADO') = p_categoria
    AND (
      CASE WHEN COALESCE(am.categoria,'NÃO MAPEADO') = 'DESP. VENDAS'
            AND upper(btrim(COALESCE(b.nomecusto,''))) <> 'FATURAMENTO'
        THEN COALESCE(cm.linha_negocio,'NÃO MAPEADO')
        ELSE COALESCE(pm.linha_negocio,'NÃO MAPEADO') END
    ) = p_linha
  ORDER BY b.data, b.id
  LIMIT 500
$function$;