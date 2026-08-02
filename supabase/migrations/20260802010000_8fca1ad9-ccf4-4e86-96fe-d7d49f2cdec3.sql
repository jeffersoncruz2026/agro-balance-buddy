-- Despesas Administrativas: adiciona a conta contábil (código + descrição,
-- já vem assim em CONTACONTABIL) à série e ao drill-down, para dar lugar ao
-- ranking "Top 5 — Conta Contábil" (substituindo o mock do protótipo).

DROP FUNCTION IF EXISTS public.desp_adm_serie(integer, integer, integer);

CREATE FUNCTION public.desp_adm_serie(p_ano_ref integer, p_mes_ref integer, p_meses integer DEFAULT 13)
 RETURNS TABLE(ano integer, mes integer, categoria text, nomecoligada text, nomedepto text, nomecusto text, contacontabil text, valor numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH periodos AS (
    SELECT (date_trunc('month', make_date(p_ano_ref, p_mes_ref, 1)) - ((n)::text || ' months')::interval)::date AS periodo
    FROM generate_series(0, greatest(p_meses, 1) - 1) AS n
  ),
  enr AS (
    SELECT l.*,
      EXTRACT(year FROM l.data)::int AS ano_civil,
      EXTRACT(month FROM l.data)::int AS mes_civil,
      COALESCE(am.categoria, 'NÃO MAPEADO') AS cat
    FROM public.lancamentos l
    LEFT JOIN LATERAL (
      SELECT a.categoria FROM public.conta_map a
      WHERE (a.is_prefixo AND COALESCE(l.vcodconta,'') LIKE a.conta || '%')
         OR (NOT a.is_prefixo AND a.conta = COALESCE(l.vcodconta,''))
      ORDER BY length(a.conta) DESC LIMIT 1
    ) am ON true
  )
  SELECT e.ano_civil, e.mes_civil, e.cat,
    COALESCE(NULLIF(btrim(e.nomecoligada), ''), 'SEM EMPRESA'),
    COALESCE(NULLIF(btrim(e.nomedepto), ''), 'SEM CENTRO DE CUSTO'),
    COALESCE(NULLIF(btrim(e.nomecusto), ''), 'SEM RUBRICA'),
    COALESCE(NULLIF(btrim(e.contacontabil), ''), 'SEM CONTA CONTÁBIL'),
    SUM(e.vlcusto)
  FROM enr e
  JOIN periodos p ON date_trunc('month', make_date(e.ano_civil, e.mes_civil, 1)) = p.periodo
  WHERE e.cat IN ('DESP. ADM', 'RECEITA BRUTA')
  GROUP BY 1, 2, 3, 4, 5, 6, 7
$function$;

GRANT EXECUTE ON FUNCTION public.desp_adm_serie(integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.desp_adm_lancamentos(integer, integer, text, text, text);

CREATE FUNCTION public.desp_adm_lancamentos(
  p_ano integer,
  p_mes integer,
  p_nomedepto text DEFAULT NULL,
  p_nomecusto text DEFAULT NULL,
  p_nomecoligada text DEFAULT NULL,
  p_contacontabil text DEFAULT NULL
)
 RETURNS TABLE(id bigint, data date, produto text, complemento text, contacontabil text, vlcusto numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH enr AS (
    SELECT l.*, COALESCE(am.categoria, 'NÃO MAPEADO') AS cat
    FROM public.lancamentos l
    LEFT JOIN LATERAL (
      SELECT a.categoria FROM public.conta_map a
      WHERE (a.is_prefixo AND COALESCE(l.vcodconta,'') LIKE a.conta || '%')
         OR (NOT a.is_prefixo AND a.conta = COALESCE(l.vcodconta,''))
      ORDER BY length(a.conta) DESC LIMIT 1
    ) am ON true
  )
  SELECT e.id, e.data, e.produto, e.complemento, e.contacontabil, e.vlcusto
  FROM enr e
  WHERE e.cat = 'DESP. ADM'
    AND EXTRACT(year FROM e.data)::int = p_ano
    AND EXTRACT(month FROM e.data)::int = p_mes
    AND (p_nomedepto IS NULL OR COALESCE(NULLIF(btrim(e.nomedepto), ''), 'SEM CENTRO DE CUSTO') = p_nomedepto)
    AND (p_nomecusto IS NULL OR COALESCE(NULLIF(btrim(e.nomecusto), ''), 'SEM RUBRICA') = p_nomecusto)
    AND (p_nomecoligada IS NULL OR COALESCE(NULLIF(btrim(e.nomecoligada), ''), 'SEM EMPRESA') = p_nomecoligada)
    AND (p_contacontabil IS NULL OR COALESCE(NULLIF(btrim(e.contacontabil), ''), 'SEM CONTA CONTÁBIL') = p_contacontabil)
  ORDER BY e.data
  LIMIT 500
$function$;

GRANT EXECUTE ON FUNCTION public.desp_adm_lancamentos(integer, integer, text, text, text, text) TO authenticated;
