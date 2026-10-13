-- Inclui quantidade e unidade no detalhe de lançamentos do Balancete Gerencial.
-- O tipo de retorno muda, então a função precisa ser recriada.
DROP FUNCTION IF EXISTS public.balancete_detalhe_periodo(integer[], integer, integer, text, text);

CREATE FUNCTION public.balancete_detalhe_periodo(p_meses integer[], p_safra integer, p_safra_linha integer, p_linha text, p_categoria text)
 RETURNS TABLE(id bigint, data date, produto text, complemento text, contacontabil text, vlcusto numeric, quantidade numeric, codund text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ini AS (SELECT public.fn_safra_inicio() AS m),
  periodos AS (
    SELECT make_date(CASE WHEN mm >= (SELECT m FROM ini) THEN p_safra_linha ELSE p_safra_linha + 1 END, mm, 1) AS d_ini
    FROM unnest(p_meses) AS mm
  ),
  base AS (
    SELECT l.*
    FROM periodos p
    JOIN public.lancamentos l
      ON l.data >= p.d_ini AND l.data < (p.d_ini + INTERVAL '1 month')
  )
  SELECT b.id, b.data, b.produto, b.complemento, b.contacontabil, b.vlcusto, b.quantidade, b.codund
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
  WHERE COALESCE(am.categoria,'NÃO MAPEADO') = p_categoria
    AND (
      CASE WHEN COALESCE(am.categoria,'NÃO MAPEADO') = 'DESP. VENDAS'
            AND upper(btrim(COALESCE(b.nomecusto,''))) <> 'FATURAMENTO'
        THEN COALESCE(cm.linha_negocio,'NÃO MAPEADO')
        ELSE COALESCE(pm.linha_negocio,'NÃO MAPEADO') END
    ) = p_linha
  ORDER BY b.data, b.id
  LIMIT 2000
$function$;

GRANT EXECUTE ON FUNCTION public.balancete_detalhe_periodo(integer[], integer, integer, text, text) TO authenticated;