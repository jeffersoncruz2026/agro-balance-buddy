ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS codtmv text;

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
  )
  SELECT b.safra,
         COALESCE(pm.linha_negocio, 'NÃO MAPEADO'),
         COALESCE(am.categoria, 'NÃO MAPEADO'),
         CASE
           WHEN COALESCE(b.vcodconta,'') LIKE '3.4.01.%'
             THEN CASE
                    WHEN btrim(COALESCE(b.codccusto,'')) = '01.14.0003'
                      OR (btrim(COALESCE(b.vcodconta,'')) = '3.4.01.10.0003'
                          AND btrim(COALESCE(b.codtmv,'')) = '1.2.13')
                    THEN 'ADM_OUTROS' ELSE 'ADM_RATEIO' END
           ELSE 'NORMAL'
         END,
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
  GROUP BY 1,2,3,4
$function$;