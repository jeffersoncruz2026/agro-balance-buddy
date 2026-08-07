CREATE OR REPLACE FUNCTION public.balancete(p_mes integer, p_ano integer)
 RETURNS TABLE(safra_ano integer, linha text, categoria text, regra text, valor numeric, qtd bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
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
               WHEN upper(btrim(COALESCE(e.nomecusto,''))) = 'GOVERNANCIA CORPORATIVA'
                 OR (btrim(COALESCE(e.vcodconta,'')) = '3.4.01.10.0003'
                     AND upper(btrim(COALESCE(e.produto,''))) <> 'DOACOES CURSOS E FACULDADES FUNCIONARIO')
               THEN 'ADM_OUTROS' ELSE 'ADM_RATEIO' END
      ELSE 'NORMAL'
    END,
    SUM(e.vlcusto), COUNT(*)
  FROM enr e
  GROUP BY 1,2,3,4
$function$;