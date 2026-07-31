-- Ajusta apenas as colunas retornadas por balancete_detalhe (mesma lógica de
-- filtro/seleção de linhas), para o drill-down do Balancete/Balancete
-- Gerencial exibir Data, Produto, Complemento, Conta e Valor.
DROP FUNCTION IF EXISTS public.balancete_detalhe(integer, integer, integer, text, text);
CREATE FUNCTION public.balancete_detalhe(p_mes integer, p_ano integer, p_safra integer, p_linha text, p_categoria text)
 RETURNS TABLE(id bigint, data date, produto text, complemento text, contacontabil text, vlcusto numeric)
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
  SELECT b.id, b.data, b.produto, b.complemento, b.contacontabil, b.vlcusto
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

GRANT EXECUTE ON FUNCTION public.balancete_detalhe(integer, integer, integer, text, text) TO authenticated;
