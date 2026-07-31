-- Inclui "complemento" no drill-down do Resultado Financeiro, para a tela
-- exibir Data, Produto, Complemento, Conta e Valor.
DROP FUNCTION IF EXISTS public.resultado_financeiro_detalhe(integer, text, text);
CREATE FUNCTION public.resultado_financeiro_detalhe(p_safra_ano integer, p_categoria text, p_nomeconta text)
 RETURNS TABLE(id bigint, data date, produto text, complemento text, contacontabil text, vlcusto numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  base AS (
    SELECT l.*,
      CASE WHEN EXTRACT(month FROM l.data)::int >= (SELECT m FROM ini)
        THEN EXTRACT(year FROM l.data)::int ELSE EXTRACT(year FROM l.data)::int - 1 END AS safra
    FROM public.lancamentos l
  ),
  enr AS (
    SELECT b.*, COALESCE(am.categoria, 'NÃO MAPEADO') AS cat
    FROM base b
    LEFT JOIN LATERAL (
      SELECT a.categoria FROM public.conta_map a
      WHERE (a.is_prefixo AND COALESCE(b.vcodconta,'') LIKE a.conta || '%')
         OR (NOT a.is_prefixo AND a.conta = COALESCE(b.vcodconta,''))
      ORDER BY length(a.conta) DESC LIMIT 1
    ) am ON true
  )
  SELECT e.id, e.data, e.produto, e.complemento, e.contacontabil, e.vlcusto
  FROM enr e
  WHERE e.safra = p_safra_ano
    AND e.cat = p_categoria
    AND COALESCE(NULLIF(btrim(e.nomeconta), ''), 'SEM DESCRIÇÃO') = p_nomeconta
  ORDER BY e.data
$function$;

GRANT EXECUTE ON FUNCTION public.resultado_financeiro_detalhe(integer, text, text) TO authenticated;
