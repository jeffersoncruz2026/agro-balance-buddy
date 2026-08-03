CREATE OR REPLACE FUNCTION public.bp_dre_relatorio(p_empresa_id uuid DEFAULT NULL, p_ano integer DEFAULT NULL, p_mes integer DEFAULT NULL)
 RETURNS TABLE(demonstrativo text, secao text, linha text, ordem_exibicao integer, valor numeric, valor_ano_anterior numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH atual AS (
    SELECT m.demonstrativo, m.secao, m.linha, m.ordem_exibicao,
      CASE WHEN m.demonstrativo = 'DRE' THEN l.debitos + l.creditos ELSE l.saldo_atual END AS valor
    FROM public.bp_dre_lancamentos l
    JOIN LATERAL (
      SELECT c.demonstrativo, c.secao, c.linha, c.ordem_exibicao
      FROM public.bp_dre_conta_map c
      WHERE (c.is_prefixo AND l.conta LIKE c.conta || '%')
         OR (NOT c.is_prefixo AND c.conta = l.conta)
      ORDER BY length(c.conta) DESC LIMIT 1
    ) m ON true
    WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
      AND l.ano = p_ano AND l.mes = p_mes
  ),
  anterior AS (
    SELECT m.demonstrativo, m.secao, m.linha,
      CASE WHEN m.demonstrativo = 'DRE' THEN l.debitos + l.creditos ELSE l.saldo_atual END AS valor
    FROM public.bp_dre_lancamentos l
    JOIN LATERAL (
      SELECT c.demonstrativo, c.secao, c.linha
      FROM public.bp_dre_conta_map c
      WHERE (c.is_prefixo AND l.conta LIKE c.conta || '%')
         OR (NOT c.is_prefixo AND c.conta = l.conta)
      ORDER BY length(c.conta) DESC LIMIT 1
    ) m ON true
    WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
      AND l.ano = p_ano - 1 AND l.mes = p_mes
  ),
  agr_atual AS (
    SELECT demonstrativo, secao, linha, MIN(ordem_exibicao) AS ordem_exibicao, SUM(valor) AS valor
    FROM atual GROUP BY 1, 2, 3
  ),
  agr_anterior AS (
    SELECT demonstrativo, secao, linha, SUM(valor) AS valor
    FROM anterior GROUP BY 1, 2, 3
  )
  SELECT a.demonstrativo, a.secao, a.linha, a.ordem_exibicao, a.valor, COALESCE(b.valor, 0)
  FROM agr_atual a
  LEFT JOIN agr_anterior b
    ON b.demonstrativo = a.demonstrativo
   AND b.linha = a.linha
   AND b.secao IS NOT DISTINCT FROM a.secao
$function$;

CREATE OR REPLACE FUNCTION public.bp_dre_lancamentos_detalhe(
  p_empresa_id uuid DEFAULT NULL,
  p_ano integer DEFAULT NULL,
  p_mes integer DEFAULT NULL,
  p_demonstrativo text DEFAULT NULL,
  p_secao text DEFAULT NULL,
  p_linha text DEFAULT NULL
)
 RETURNS TABLE(id bigint, conta text, descricao text, saldo_atual numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT l.id, l.conta, l.descricao,
    CASE WHEN m.demonstrativo = 'DRE' THEN l.debitos + l.creditos ELSE l.saldo_atual END AS saldo_atual
  FROM public.bp_dre_lancamentos l
  JOIN LATERAL (
    SELECT c.demonstrativo, c.secao, c.linha
    FROM public.bp_dre_conta_map c
    WHERE (c.is_prefixo AND l.conta LIKE c.conta || '%')
       OR (NOT c.is_prefixo AND c.conta = l.conta)
    ORDER BY length(c.conta) DESC LIMIT 1
  ) m ON true
  WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
    AND l.ano = p_ano AND l.mes = p_mes
    AND m.demonstrativo = p_demonstrativo
    AND m.linha = p_linha
    AND m.secao IS NOT DISTINCT FROM p_secao
  ORDER BY l.conta
  LIMIT 500
$function$;